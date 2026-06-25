(function () {
    const MONTHLY_REPAYMENT_AMOUNT = 625;
    const REPAYMENT_PLAN_MONTHS = 24;
    const TOTAL_REPAYMENT_AMOUNT = MONTHLY_REPAYMENT_AMOUNT * REPAYMENT_PLAN_MONTHS;
    const MAX_PROOF_SIZE = 5 * 1024 * 1024;
    const SUPPORTED_PROOF_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

    const state = {
        baseUrl: window.SMARTLEAP_BASE_URL || '',
        dashboard: null,
        beneficiaryPortal: null,
        payments: [],
        repaymentAccount: null,
        repaymentScheduleExpanded: false,
    };

    document.addEventListener('DOMContentLoaded', bindEvents);
    document.addEventListener('smartleap:applicant-dashboard-state', (event) => {
        state.dashboard = event.detail?.state || null;
        state.beneficiaryPortal = state.dashboard?.beneficiaryPortal || null;
        applyPortalMode();
        renderAll();
    });

    function bindEvents() {
        document.getElementById('unifiedBeneficiaryPrimaryAction')?.addEventListener('click', () => {
            window.location.hash = '#repayments';
        });
        document.getElementById('unifiedRepaymentDueList')?.addEventListener('click', handleRepaymentDueClick);
        document.getElementById('unifiedHistoryFilterStatus')?.addEventListener('change', renderHistory);
        document.getElementById('unifiedHistoryFilterMonth')?.addEventListener('change', renderHistory);
        document.getElementById('unifiedHistoryTableBody')?.addEventListener('click', handleHistoryClick);
        document.getElementById('unifiedHistoryCardList')?.addEventListener('click', handleHistoryClick);
        document.getElementById('unifiedRepaymentUploadForm')?.addEventListener('submit', handleUploadSubmit);
        document.getElementById('unifiedRepaymentUploadModal')?.addEventListener('click', (event) => {
            if (event.target.closest('[data-unified-repayment-modal-close]')) {
                closeRepaymentUploadModal();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeRepaymentUploadModal();
            }
        });
        window.addEventListener('hashchange', () => {
            if (!isBeneficiary() && (window.location.hash || '').replace('#', '') === 'repayments') {
                showToast('Beneficiary tools are available after your PDO/Admin confirms your approval.', 'info');
            }
        });
    }

    function applyPortalMode() {
        const active = isBeneficiary();
        document.body.classList.toggle('is-beneficiary-portal', active);
        if (!active) {
            state.payments = [];
            state.repaymentAccount = null;
            return;
        }

        const repayments = state.beneficiaryPortal?.repayments || {};
        state.payments = normalizePayments(repayments.payments || []);
        state.repaymentAccount = repayments.account || null;
    }

    function renderAll() {
        if (!isBeneficiary()) {
            return;
        }
        renderOverview();
        renderRepaymentDueList();
        renderHistory();
    }

    function isBeneficiary() {
        return Boolean(state.beneficiaryPortal?.isBeneficiary);
    }

    function renderOverview() {
        const metrics = getRepaymentMetrics();
        const beneficiary = state.beneficiaryPortal?.beneficiary || {};
        const application = state.beneficiaryPortal?.application || {};
        const assignedPdo = beneficiary.assignedPdo || application.assignedPdo || {};

        setText('unifiedBeneficiaryBalance', formatCurrency(metrics.outstanding));
        setText('unifiedBeneficiaryStanding', metrics.statusLabel);
        setText('unifiedBeneficiaryNextDue', metrics.nextDue);
        setText('unifiedBeneficiaryPending', formatCount(metrics.pendingVerificationCount, 'receipt'));
        setText('unifiedBeneficiaryProgress', `${metrics.verifiedMonths}/${REPAYMENT_PLAN_MONTHS} months`);
        setText('unifiedBeneficiaryProgressText', `${metrics.verifiedMonths}/${REPAYMENT_PLAN_MONTHS} months`);
        setText('unifiedBeneficiaryRate', `${metrics.rateDisplay}% complete`);
        setText('unifiedBeneficiaryPdo', assignedPdo.name || beneficiary.assignedPdoName || application.assignedPdoName || '--');

        const progressFill = document.getElementById('unifiedBeneficiaryProgressFill');
        if (progressFill) {
            progressFill.style.width = `${metrics.rateDisplay}%`;
            progressFill.parentElement?.setAttribute('aria-valuenow', String(metrics.rateDisplay));
        }

        const action = document.getElementById('unifiedBeneficiaryPrimaryAction');
        if (action) {
            action.textContent = metrics.primaryActionLabel;
        }
    }

    function getRepaymentMetrics() {
        const scheduleItems = getRepaymentScheduleItems();
        const displayPayments = getDisplayPayments();
        const pendingCount = displayPayments.filter((payment) => mapPaymentStage(payment.stage) === 'pending').length;
        const uploadedCount = displayPayments.filter((payment) => mapPaymentStage(payment.stage) === 'uploaded').length;
        const allocation = getVerifiedRepaymentAllocation(displayPayments);
        const outstanding = Math.max(TOTAL_REPAYMENT_AMOUNT - allocation.totalVerifiedAmount, 0);
        const verifiedMonths = scheduleItems.filter((item) => item.state === 'verified').length;
        const rateDisplay = Math.min(100, Math.max(0, Math.round((verifiedMonths / REPAYMENT_PLAN_MONTHS) * 100)));
        const nextPending = scheduleItems.find((item) => item.actionable)
            || scheduleItems.find((item) => !['verified', 'pending_review'].includes(item.state))
            || null;
        const overdueCount = scheduleItems.filter((item) => item.state === 'overdue').length;
        const pendingVerificationCount = pendingCount + uploadedCount;
        let statusLabel = 'Active beneficiary';
        let primaryActionLabel = 'Upload receipt';

        if (overdueCount > 0) {
            statusLabel = `${overdueCount} repayment month${overdueCount === 1 ? '' : 's'} need attention`;
            primaryActionLabel = 'Submit late payment';
        } else if (pendingVerificationCount > 0) {
            statusLabel = `${pendingVerificationCount} receipt${pendingVerificationCount === 1 ? '' : 's'} waiting for verification`;
            primaryActionLabel = 'View repayments';
        } else if (verifiedMonths > 0) {
            statusLabel = nextPending ? 'Repayment account is on track' : 'Repayment account completed';
            primaryActionLabel = nextPending ? 'Upload receipt' : 'View records';
        }

        return {
            outstanding,
            verifiedMonths,
            pendingCount,
            uploadedCount,
            pendingVerificationCount,
            overdueCount,
            nextPending,
            nextDue: nextPending ? formatMonth(padMonth(nextPending.month)) : 'Completed',
            rateDisplay,
            statusLabel,
            primaryActionLabel,
        };
    }

    function renderRepaymentDueList(items = getRepaymentScheduleItems()) {
        const root = document.getElementById('unifiedRepaymentDueList');
        if (!root) return;

        const compactLimit = 6;
        const visible = state.repaymentScheduleExpanded ? items : compactRepaymentScheduleItems(items, compactLimit);
        if (visible.length === 0) {
            root.innerHTML = '<div class="repayment-due-list__empty">No repayment schedule is available yet.</div>';
            return;
        }

        root.innerHTML = visible.map((item) => {
            const status = repaymentScheduleStatus(item);
            const canSubmit = ['overdue', 'due', 'needs_correction', 'upcoming'].includes(item.state);
            const action = canSubmit
                ? `<button type="button" class="btn-outline small" data-unified-repayment-due-action="${escapeHtml(item.month)}">${escapeHtml(item.isOverdue ? 'Submit Late Payment' : item.state === 'needs_correction' ? 'Submit New Receipt' : item.state === 'upcoming' ? 'Pay in Advance' : 'Submit Payment')}</button>`
                : item.state === 'pending_review'
                    ? '<span class="repayment-due-list__locked">Awaiting review</span>'
                    : '';
            const label = item.state === 'verified'
                ? 'Paid month'
                : item.state === 'upcoming'
                    ? 'Upcoming month'
                    : item.isOverdue
                        ? 'Overdue month'
                        : 'Due month';

            return `
                <article class="repayment-due-item repayment-due-item--${escapeHtml(item.state)} ${item.isOverdue ? 'is-overdue' : ''}">
                    <div>
                        <span class="repayment-due-item__label">${escapeHtml(label)}</span>
                        <strong>${escapeHtml(formatMonth(padMonth(item.month)))}</strong>
                        <small>${escapeHtml(status.helper)}</small>
                        <small>Amount due: ${escapeHtml(formatCurrency(item.amount ?? MONTHLY_REPAYMENT_AMOUNT))}</small>
                    </div>
                    <span class="status-badge ${status.className}">${escapeHtml(status.label)}</span>
                    ${action}
                </article>
            `;
        }).join('') + (items.length > compactLimit
            ? `<div class="repayment-due-list__footer"><button type="button" class="btn-outline small repayment-due-list__toggle" data-unified-repayment-schedule-toggle>${state.repaymentScheduleExpanded ? 'Show fewer months' : `See all ${items.length} months`}</button></div>`
            : '');
    }

    function compactRepaymentScheduleItems(items, limit = 6) {
        const safeItems = Array.isArray(items) ? items : [];
        if (safeItems.length <= limit) return safeItems;
        const firstActionIndex = safeItems.findIndex((item) => ['overdue', 'due', 'needs_correction', 'pending_review'].includes(item.state));
        const startIndex = firstActionIndex >= 0 ? firstActionIndex : safeItems.findIndex((item) => item.state !== 'verified');
        const safeStart = Math.max(0, startIndex >= 0 ? startIndex : safeItems.length - limit);
        return safeItems.slice(safeStart, safeStart + limit);
    }

    function renderHistory() {
        const tbody = document.getElementById('unifiedHistoryTableBody');
        const cardList = document.getElementById('unifiedHistoryCardList');
        const counter = document.getElementById('unifiedHistoryCounter');
        if (!tbody) return;

        const displayPayments = getDisplayPayments();
        const verifiedCount = displayPayments.filter((payment) => mapPaymentStage(payment.stage) === 'verified').length;
        const pendingCount = displayPayments.filter((payment) => mapPaymentStage(payment.stage) === 'pending').length;
        const uploadedCount = displayPayments.filter((payment) => mapPaymentStage(payment.stage) === 'uploaded').length;
        setText('unifiedHistoryVerifiedCount', formatCount(verifiedCount, 'receipt'));
        setText('unifiedHistoryPendingCount', formatCount(pendingCount, 'receipt'));
        setText('unifiedHistoryUploadedCount', formatCount(uploadedCount, 'receipt'));

        const statusFilter = (document.getElementById('unifiedHistoryFilterStatus')?.value || '').toLowerCase();
        const monthFilter = document.getElementById('unifiedHistoryFilterMonth')?.value || '';
        const filtered = displayPayments.filter((payment) => {
            const status = mapPaymentStage(payment.stage);
            return (!statusFilter || status === statusFilter) && (!monthFilter || payment.month === monthFilter);
        }).sort((left, right) => (right.month || '').localeCompare(left.month || ''));

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr class="empty"><td colspan="6">No receipts match the selected filters.</td></tr>';
            if (cardList) {
                cardList.innerHTML = '<article class="history-card history-card--empty">No receipts match the selected filters.</article>';
            }
            if (counter) counter.textContent = '0 receipts';
            return;
        }

        tbody.innerHTML = filtered.map(renderHistoryRow).join('');
        if (cardList) {
            cardList.innerHTML = filtered.map(renderHistoryCard).join('');
        }
        if (counter) counter.textContent = formatCount(filtered.length, 'receipt');
    }

    function renderHistoryRow(payment) {
        const status = getPaymentStatus(payment);
        const proof = payment.proof
            ? `<button type="button" class="btn-outline small" data-unified-view-proof="${escapeHtml(payment.proof)}">${escapeHtml(payment.proofName || 'Open file')}</button>`
            : '<span class="muted">No file</span>';

        return `
            <tr>
                <td>${escapeHtml(formatMonth(padMonth(payment.month)))}</td>
                <td>${escapeHtml(formatDate(payment.paymentDate))}</td>
                <td>${escapeHtml(formatCurrency(payment.amount))}</td>
                <td><span class="status-badge ${status.className}">${escapeHtml(status.label)}</span></td>
                <td>${proof}</td>
                <td>${escapeHtml(buildPaymentRemarks(payment))}</td>
            </tr>
        `;
    }

    function renderHistoryCard(payment) {
        const status = getPaymentStatus(payment);
        const proof = payment.proof
            ? `<button type="button" class="btn-outline small" data-unified-view-proof="${escapeHtml(payment.proof)}">${escapeHtml(payment.proofName || 'Open file')}</button>`
            : '<span class="muted">No file</span>';

        return `
            <article class="history-card">
                <div class="history-card__top">
                    <div>
                        <span class="history-card__label">Month</span>
                        <strong class="history-card__value">${escapeHtml(formatMonth(padMonth(payment.month)))}</strong>
                    </div>
                    <span class="status-badge ${status.className}">${escapeHtml(status.label)}</span>
                </div>
                <div class="history-card__grid">
                    <div><span class="history-card__label">Paid on</span><strong>${escapeHtml(formatDate(payment.paymentDate))}</strong></div>
                    <div><span class="history-card__label">Amount</span><strong>${escapeHtml(formatCurrency(payment.amount))}</strong></div>
                    <div class="history-card__proof"><span class="history-card__label">OR / Proof</span>${proof}</div>
                    <div class="history-card__remarks"><span class="history-card__label">Remarks</span><p>${escapeHtml(buildPaymentRemarks(payment))}</p></div>
                </div>
            </article>
        `;
    }

    function handleRepaymentDueClick(event) {
        const toggle = event.target.closest('[data-unified-repayment-schedule-toggle]');
        if (toggle) {
            state.repaymentScheduleExpanded = !state.repaymentScheduleExpanded;
            renderRepaymentDueList();
            return;
        }

        const button = event.target.closest('[data-unified-repayment-due-action]');
        if (!button) return;
        openRepaymentUploadModal(button.dataset.unifiedRepaymentDueAction || '');
    }

    function handleHistoryClick(event) {
        const proofButton = event.target.closest('[data-unified-view-proof]');
        if (!proofButton) return;
        const proof = proofButton.dataset.unifiedViewProof || '';
        if (proof) {
            window.open(proof, '_blank', 'noopener');
        }
    }

    function openRepaymentUploadModal(month = '') {
        if (!isBeneficiary()) {
            showToast('Repayment upload becomes available after beneficiary approval.', 'info');
            return;
        }

        const modal = document.getElementById('unifiedRepaymentUploadModal');
        if (!modal) return;

        const scheduleItems = getRepaymentScheduleItems();
        const targetMonth = normalizeMonthValue(month)
            || scheduleItems.find((item) => ['overdue', 'due', 'needs_correction'].includes(item.state))?.month
            || scheduleItems.find((item) => item.state === 'upcoming')?.month
            || '';
        const scheduleItem = scheduleItems.find((item) => item.month === targetMonth);
        if (!targetMonth || ['verified', 'pending_review'].includes(scheduleItem?.state || '')) {
            showToast('This repayment month is already paid or waiting for review.', 'info');
            return;
        }

        const form = document.getElementById('unifiedRepaymentUploadForm');
        form?.reset();
        setValue('unifiedUploadMonth', targetMonth);
        setValue('unifiedUploadAmount', String(scheduleItem?.amount ?? MONTHLY_REPAYMENT_AMOUNT));
        setValue('unifiedUploadDate', new Date().toISOString().slice(0, 10));
        setValue('unifiedUploadNotes', scheduleItem?.isOverdue ? `Late payment for ${formatMonth(padMonth(targetMonth))}.` : '');
        modal.hidden = false;
        document.body.classList.add('repayment-modal-open');
        window.setTimeout(() => document.getElementById('unifiedUploadOr')?.focus(), 50);
    }

    function closeRepaymentUploadModal() {
        const modal = document.getElementById('unifiedRepaymentUploadModal');
        if (!modal || modal.hidden) return;
        modal.hidden = true;
        document.body.classList.remove('repayment-modal-open');
    }

    async function handleUploadSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (!form.reportValidity()) return;

        try {
            const month = normalizeMonthValue(document.getElementById('unifiedUploadMonth')?.value || '');
            const paymentDate = String(document.getElementById('unifiedUploadDate')?.value || '');
            const amount = roundCurrency(document.getElementById('unifiedUploadAmount')?.value || 0);
            const orNumber = sanitizeOrNumber(document.getElementById('unifiedUploadOr')?.value || '');
            const notes = String(document.getElementById('unifiedUploadNotes')?.value || '').trim();
            const proof = await readProofFile(document.getElementById('unifiedUploadFile')?.files?.[0]);

            if (!month || amount <= 0 || !paymentDate || !orNumber) {
                throw new Error('Complete the official receipt details before submitting.');
            }
            if (getPaymentsForMonth(month).some((payment) => ['uploaded', 'pending'].includes(mapPaymentStage(payment.stage)))) {
                throw new Error(`A receipt for ${formatMonth(padMonth(month))} is already waiting for review.`);
            }

            const submissionId = createSubmissionId('SUB');
            const response = await postJson('beneficiary-dashboard/repayments/submit', {
                payments: [{
                    id: createSubmissionId('PAY'),
                    parentSubmissionId: submissionId,
                    month,
                    paymentDate,
                    amount,
                    orNumber,
                    notes,
                    stage: 'uploaded',
                    submittedAt: new Date().toISOString(),
                    ...proof,
                }],
                submissions: [],
            });

            const repayments = response.data || {};
            state.payments = normalizePayments(repayments.payments || []);
            state.repaymentAccount = repayments.account || state.repaymentAccount;
            renderAll();
            closeRepaymentUploadModal();
            form.reset();
            showToast(response.message || 'Receipt uploaded. Pending verification.', 'success');
        } catch (error) {
            showToast(error.message || 'Unable to submit the repayment record.', 'warning');
        }
    }

    async function postJson(path, payload) {
        const response = await fetch(routeUrl(path), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json;charset=UTF-8',
            },
            credentials: 'same-origin',
            body: JSON.stringify(payload || {}),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
            throw new Error(result.message || 'Unable to save the repayment record.');
        }
        return result;
    }

    function readProofFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('Upload the OR file before submitting.'));
                return;
            }
            if (file.size > MAX_PROOF_SIZE) {
                reject(new Error('The OR file must be 5MB or smaller.'));
                return;
            }
            if (!SUPPORTED_PROOF_TYPES.includes(file.type)) {
                reject(new Error('Upload a JPG, PNG, or PDF file only.'));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve({
                proof: String(reader.result || ''),
                proofName: file.name,
                proofType: file.type,
            });
            reader.onerror = () => reject(new Error('Unable to read the uploaded OR file.'));
            reader.readAsDataURL(file);
        });
    }

    function normalizePayments(list) {
        return (Array.isArray(list) ? list : []).map(normalizePaymentRecord).filter(Boolean);
    }

    function normalizePaymentRecord(payment) {
        if (!payment || typeof payment !== 'object') return null;
        const month = normalizeMonthValue(payment.month || payment.coverageMonth || '');
        if (!month) return null;
        const stage = mapPaymentStage(payment.stage);

        return {
            id: payment.id || createSubmissionId('PAY'),
            month,
            paymentDate: String(payment.paymentDate || payment.date || ''),
            amount: roundCurrency(payment.amount || payment.allocatedAmount || 0),
            stage,
            verifiedBy: String(payment.verifiedBy || ''),
            verifiedAt: String(payment.verifiedAt || ''),
            notes: String(payment.notes || payment.adminRemarks || ''),
            adminRemarks: String(payment.adminRemarks || ''),
            orNumber: sanitizeOrNumber(payment.orNumber || payment.or || ''),
            proof: String(payment.proof || ''),
            proofName: String(payment.proofName || payment.fileName || ''),
            proofType: String(payment.proofType || payment.fileType || ''),
            submittedAt: String(payment.submittedAt || payment.createdAt || payment.paymentDate || ''),
        };
    }

    function getDisplayPayments() {
        const validMonths = new Set(getRepaymentWindowMonths());
        return state.payments.filter((payment) => validMonths.has(normalizeMonthValue(payment.month)));
    }

    function getRepaymentWindowMonths() {
        const start = repaymentStartMonth();
        return Array.from({ length: REPAYMENT_PLAN_MONTHS }, (_, index) => addMonths(start, index)).filter(Boolean);
    }

    function repaymentStartMonth() {
        const beneficiary = state.beneficiaryPortal?.beneficiary || {};
        const application = state.beneficiaryPortal?.application || {};
        const source = beneficiary.repaymentSourceApprovalDate
            || beneficiary.repaymentSourceApprovedAt
            || beneficiary.approvalDate
            || beneficiary.approvedAt
            || application.reviewedAt
            || application.submittedAt
            || '';
        const date = new Date(source || '');
        if (Number.isNaN(date.getTime())) {
            const firstPayment = state.payments.map((payment) => normalizeMonthValue(payment.month)).filter(Boolean).sort()[0];
            return firstPayment || normalizeMonthValue(new Date().toISOString().slice(0, 7));
        }
        const firstDueMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
        return `${firstDueMonth.getFullYear()}-${String(firstDueMonth.getMonth() + 1).padStart(2, '0')}`;
    }

    function getVerifiedRepaymentAllocation(paymentList = getDisplayPayments()) {
        const months = getRepaymentWindowMonths();
        const allocationByMonth = new Map(months.map((month) => [month, {
            month,
            paidAmount: 0,
            remainingAmount: MONTHLY_REPAYMENT_AMOUNT,
            sourcePayments: [],
        }]));
        let totalVerifiedAmount = 0;
        const verifiedPayments = (Array.isArray(paymentList) ? paymentList : [])
            .filter((payment) => mapPaymentStage(payment.stage) === 'verified')
            .sort((left, right) => left.month.localeCompare(right.month));

        verifiedPayments.forEach((payment) => {
            let remainingPayment = roundCurrency(payment.amount || 0);
            totalVerifiedAmount = roundCurrency(totalVerifiedAmount + remainingPayment);
            for (const month of months) {
                if (remainingPayment <= 0) break;
                const bucket = allocationByMonth.get(month);
                if (!bucket || bucket.remainingAmount <= 0) continue;
                const applied = roundCurrency(Math.min(bucket.remainingAmount, remainingPayment));
                bucket.paidAmount = roundCurrency(bucket.paidAmount + applied);
                bucket.remainingAmount = roundCurrency(Math.max(0, MONTHLY_REPAYMENT_AMOUNT - bucket.paidAmount));
                bucket.sourcePayments.push(payment);
                remainingPayment = roundCurrency(remainingPayment - applied);
            }
        });

        return {
            months: allocationByMonth,
            totalVerifiedAmount: Math.min(TOTAL_REPAYMENT_AMOUNT, roundCurrency(totalVerifiedAmount)),
        };
    }

    function getRepaymentScheduleItems() {
        const months = getRepaymentWindowMonths();
        const allocation = getVerifiedRepaymentAllocation();
        return months.map((month) => {
            const bucket = allocation.months.get(month) || {
                paidAmount: 0,
                remainingAmount: MONTHLY_REPAYMENT_AMOUNT,
                sourcePayments: [],
            };
            const payment = bestPaymentForMonth(month);
            const stage = payment ? mapPaymentStage(payment.stage) : 'unpaid';
            const isOverdue = isMonthOverdue(month);
            let itemState = 'upcoming';
            if (bucket.remainingAmount <= 0) itemState = 'verified';
            else if (['uploaded', 'pending'].includes(stage)) itemState = 'pending_review';
            else if (['needs_correction', 'rejected'].includes(stage)) itemState = 'needs_correction';
            else if (isOverdue) itemState = 'overdue';
            else if (month === currentMonthValue()) itemState = 'due';

            return {
                month,
                payment: itemState === 'verified' ? bucket.sourcePayments[bucket.sourcePayments.length - 1] || payment : payment,
                stage,
                state: itemState,
                amount: roundCurrency(bucket.remainingAmount ?? MONTHLY_REPAYMENT_AMOUNT),
                paidAmount: roundCurrency(bucket.paidAmount || 0),
                isOverdue,
                actionable: ['overdue', 'due', 'needs_correction'].includes(itemState),
            };
        });
    }

    function repaymentScheduleStatus(item) {
        if (item.state === 'verified') return { label: 'Paid', className: 'status-verified', helper: 'Accepted by PDO/Admin.' };
        if (item.state === 'pending_review') return { label: 'Submitted', className: 'status-pending', helper: 'Waiting for PDO/Admin review.' };
        if (item.state === 'needs_correction') return { label: 'Requires New Receipt', className: 'status-pending', helper: 'Upload a new receipt for this month.' };
        if (item.state === 'overdue') return { label: 'Overdue', className: 'status-overdue', helper: 'Submit late payment proof for this month.' };
        if (item.state === 'due') return { label: 'Due Now', className: 'status-uploaded', helper: 'Submit payment proof for this month.' };
        return { label: 'Upcoming', className: 'status-uploaded', helper: 'No action needed yet.' };
    }

    function bestPaymentForMonth(month) {
        const priority = { verified: 5, uploaded: 4, pending: 4, needs_correction: 3, rejected: 2 };
        return getPaymentsForMonth(month).sort((left, right) => {
            const leftScore = priority[mapPaymentStage(left.stage)] || 1;
            const rightScore = priority[mapPaymentStage(right.stage)] || 1;
            if (leftScore !== rightScore) return rightScore - leftScore;
            return new Date(right.submittedAt || right.paymentDate || '').getTime() - new Date(left.submittedAt || left.paymentDate || '').getTime();
        })[0] || null;
    }

    function getPaymentsForMonth(month) {
        const normalized = normalizeMonthValue(month);
        return getDisplayPayments().filter((payment) => normalizeMonthValue(payment.month) === normalized);
    }

    function getPaymentStatus(payment) {
        const stage = mapPaymentStage(payment.stage);
        if (stage === 'verified') return { label: 'Verified', className: 'status-verified' };
        if (stage === 'pending') return { label: 'Pending', className: 'status-pending' };
        if (stage === 'needs_correction') return { label: 'Needs Correction', className: 'status-pending' };
        if (stage === 'rejected') return { label: 'Rejected', className: 'status-rejected' };
        return { label: 'Uploaded', className: 'status-uploaded' };
    }

    function buildPaymentRemarks(payment) {
        return payment.adminRemarks || payment.notes || (mapPaymentStage(payment.stage) === 'verified' ? 'Verified by staff.' : 'Waiting for review.');
    }

    function mapPaymentStage(stage) {
        const normalized = normalizeStatus(stage);
        if (!normalized) return 'uploaded';
        if (normalized === 'verified') return 'verified';
        if (normalized === 'uploaded') return 'uploaded';
        if (normalized === 'pending' || normalized === 'pendingverification') return 'pending';
        if (normalized === 'needscorrection') return 'needs_correction';
        if (normalized === 'rejected' || normalized === 'flagged') return 'rejected';
        return 'uploaded';
    }

    function normalizeStatus(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function normalizeMonthValue(value) {
        const match = String(value || '').trim().match(/^(\d{4})-(\d{2})/);
        return match ? `${match[1]}-${match[2]}` : '';
    }

    function addMonths(month, offset) {
        const date = parseMonth(month);
        if (!date) return '';
        const next = new Date(date.getFullYear(), date.getMonth() + offset, 1);
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    }

    function parseMonth(month) {
        const normalized = normalizeMonthValue(month);
        if (!normalized) return null;
        const [year, monthNumber] = normalized.split('-').map(Number);
        return new Date(year, monthNumber - 1, 1);
    }

    function currentMonthValue() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    function isMonthOverdue(month) {
        const monthDate = parseMonth(month);
        const current = parseMonth(currentMonthValue());
        return Boolean(monthDate && current && monthDate < current);
    }

    function padMonth(monthText) {
        const normalized = normalizeMonthValue(monthText);
        return normalized ? `${normalized}-01` : '';
    }

    function roundCurrency(value) {
        const amount = Number(value || 0);
        return Math.round(amount * 100) / 100;
    }

    function sanitizeOrNumber(value) {
        return String(value || '').trim().replace(/\s+/g, ' ');
    }

    function createSubmissionId(prefix = 'SUB') {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    }

    function formatCurrency(value) {
        return `PHP ${roundCurrency(value).toLocaleString('en-PH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    }

    function formatMonth(value) {
        const date = new Date(value || '');
        if (Number.isNaN(date.getTime())) return value || '--';
        return date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
    }

    function formatDate(value) {
        const date = new Date(value || '');
        if (Number.isNaN(date.getTime())) return '--';
        return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatCount(value, singular) {
        const count = Number(value || 0);
        return `${count} ${singular}${count === 1 ? '' : 's'}`;
    }

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = String(value ?? '');
    }

    function setValue(id, value) {
        const node = document.getElementById(id);
        if (node) node.value = String(value ?? '');
    }

    function routeUrl(path) {
        return `${state.baseUrl}/${String(path || '').replace(/^\/+/, '')}`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showToast(message, tone = 'info') {
        const stack = document.getElementById('toastStack');
        if (!stack) return;
        const toast = document.createElement('div');
        toast.className = `toast toast--${tone}`;
        toast.textContent = String(message || '');
        stack.appendChild(toast);
        window.setTimeout(() => {
            toast.classList.add('is-hiding');
            window.setTimeout(() => toast.remove(), 240);
        }, 4200);
    }
})();
