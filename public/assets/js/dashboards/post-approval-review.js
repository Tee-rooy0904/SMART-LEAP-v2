/*
 * SMART LEAP FILE GUIDE
 * Dashboard script for p os t a pp ro va l r ev ie w.
 * Controls one role-specific workspace page, including its live state, interactions, and any page-owned modals or drawers.
 */
(function () {
    const state = {
        baseUrl: window.SMARTLEAP_BASE_URL || '',
        authUser: window.SMARTLEAP_AUTH_USER || null,
        fullQueue: [],
        queue: [],
        activeTask: null,
        initialTaskId: Number(window.SMARTLEAP_REVIEW_TASK_ID || 0),
        embedded: Boolean(window.SMARTLEAP_REVIEW_EMBEDDED),
        focusedApplicantUserId: null,
        focusedTaskMode: Number(window.SMARTLEAP_REVIEW_TASK_ID || 0) > 0,
    };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        document.body.classList.toggle('review-body--focused-task', state.focusedTaskMode);
        document.getElementById('refreshReviewQueue')?.addEventListener('click', loadQueue);
        document.getElementById('reviewTaskList')?.addEventListener('click', handleQueueClick);
        document.getElementById('reviewForm')?.addEventListener('submit', handleReviewSubmit);
        document.getElementById('reviewForm')?.addEventListener('change', handleReviewerUploadChange);
        window.addEventListener('resize', queueEmbeddedFrameSync);
        await loadQueue();
    }

    async function loadQueue() {
        try {
            const payload = await fetchJson('api/post-approval-review');
            state.fullQueue = payload.tasks || [];
            renderSummary(payload.summary || {});
            if (state.initialTaskId > 0) {
                const taskId = state.initialTaskId;
                state.initialTaskId = 0;
                await loadTask(taskId);
            } else if (state.activeTask) {
                await loadTask(state.activeTask.id);
            } else {
                state.queue = filterQueueForFocusedApplicant(state.fullQueue);
                renderQueue();
            }
        } catch (error) {
            renderQueue(error.message || 'Unable to load the review queue.');
            showToast(error.message || 'Unable to load the review queue.', 'warning');
        }
    }

    function renderSummary(summary) {
        setText('summarySubmitted', String(summary.submitted || 0));
        setText('summaryNeedsCorrection', String(summary.needsCorrection || 0));
        setText('summaryVerified', String(summary.verified || 0));
        setText('summaryRejected', String(summary.rejected || 0));
    }

    function renderQueue(errorMessage) {
        const container = document.getElementById('reviewTaskList');
        if (!container) {
            return;
        }

        if (errorMessage) {
            container.innerHTML = `<article class="empty-state">${escapeHtml(errorMessage)}</article>`;
            return;
        }

        if (state.queue.length === 0) {
            container.innerHTML = '<article class="empty-state">No fill-up form requirements are available for review yet.</article>';
            return;
        }

        container.innerHTML = state.queue.map((task) => `
            <button type="button" class="task-card ${state.activeTask?.id === task.id ? 'is-active' : ''}" data-task-id="${task.id}">
                <div class="task-card__meta">
                    <span class="status-chip status-${slugify(task.status)}">${escapeHtml(task.status)}</span>
                    <span class="task-card__type">${escapeHtml(task.title)}</span>
                </div>
                <strong>${escapeHtml(task.applicant.name)}</strong>
                <p>${escapeHtml(task.applicant.barangay || 'No barangay')}</p>
                <p>${escapeHtml(task.applicant.businessName || 'No business name')}</p>
                <small>${escapeHtml(task.submittedAt ? `Submitted ${formatDateTime(task.submittedAt)}` : 'Not yet submitted')}</small>
            </button>
        `).join('');
    }

    async function handleQueueClick(event) {
        const card = event.target.closest('[data-task-id]');
        if (!card) {
            return;
        }
        await loadTask(Number(card.getAttribute('data-task-id')));
    }

    async function loadTask(taskId) {
        if (!taskId) {
            return;
        }

        try {
            const payload = await fetchJson(`api/post-approval-review/task?task_id=${taskId}`);
            state.activeTask = payload.task || null;
            state.focusedApplicantUserId = state.activeTask?.applicant?.userId || null;
            state.queue = filterQueueForFocusedApplicant(state.fullQueue);
            renderQueue();
            renderWorkspace();
        } catch (error) {
            showToast(error.message || 'Unable to load that review task.', 'warning');
        }
    }

    function filterQueueForFocusedApplicant(tasks) {
        const list = Array.isArray(tasks) ? tasks : [];
        if (!state.focusedApplicantUserId) {
            return list;
        }
        const filtered = list.filter((task) => Number(task?.applicant?.userId || 0) === Number(state.focusedApplicantUserId));
        return filtered.length ? filtered : list;
    }

    function renderWorkspace() {
        const title = document.getElementById('reviewWorkspaceTitle');
        const meta = document.getElementById('reviewWorkspaceMeta');
        const status = document.getElementById('reviewWorkspaceStatus');
        const applicantCard = document.getElementById('reviewApplicantCard');
        const form = document.getElementById('reviewForm');
        const workspaceColumns = form?.querySelector('.workspace-columns');
        const applicantSections = document.getElementById('reviewApplicantSections');
        const staffSections = document.getElementById('reviewStaffSections');
        const history = document.getElementById('reviewSubmissionHistory');
        const decisionStatus = document.getElementById('reviewDecisionStatus');
        const decisionRemarks = document.getElementById('reviewDecisionRemarks');
        const decisionApplicantRemark = document.getElementById('reviewDecisionApplicantRemark');

        if (!state.activeTask) {
            title && (title.textContent = 'Select a submitted form');
            meta && (meta.textContent = 'Choose a task from the queue to inspect the applicant submission and complete staff review fields.');
            status && (status.textContent = 'Idle');
            applicantCard?.classList.add('is-hidden');
            form?.classList.add('is-hidden');
            workspaceColumns?.classList.remove('workspace-columns--single');
            workspaceColumns?.classList.remove('workspace-columns--document');
            workspaceColumns?.classList.remove('workspace-columns--buhat');
            queueEmbeddedFrameSync();
            return;
        }

        const task = state.activeTask;
        const useSingleColumnReview = shouldUseSingleColumnReview(task);
        title && (title.textContent = task.title);
        meta && (meta.textContent = `${task.applicant.name} | ${task.applicant.barangay || 'No barangay'} | ${task.applicant.email}`);
        status && (status.textContent = task.status);
        applicantCard?.classList.remove('is-hidden');
        form?.classList.remove('is-hidden');
        workspaceColumns?.classList.toggle('workspace-columns--single', useSingleColumnReview);
        workspaceColumns?.classList.toggle('workspace-columns--document', false);
        workspaceColumns?.classList.toggle('workspace-columns--buhat', false);

        if (applicantCard) {
            applicantCard.innerHTML = `
                <div><strong>${escapeHtml(task.applicant.name)}</strong><span>${escapeHtml(task.applicant.email)}</span></div>
                <div><strong>Barangay</strong><span>${escapeHtml(task.applicant.barangay || '--')}</span></div>
                <div><strong>Contact</strong><span>${escapeHtml(task.applicant.contactNumber || '--')}</span></div>
                <div><strong>Business</strong><span>${escapeHtml(task.applicant.businessName || '--')}</span></div>
            `;
        }

        if (applicantSections) {
            applicantSections.innerHTML = renderReviewDocument(task);
        }

        if (staffSections) {
            staffSections.innerHTML = useSingleColumnReview ? '' : renderStaffReviewSections(task);
            const staffColumn = staffSections.closest('.workspace-column');
            if (staffColumn) {
                staffColumn.classList.toggle('is-hidden', staffSections.innerHTML.trim() === '');
            }
        }

        if (applicantSections) {
            const applicantColumn = applicantSections.closest('.workspace-column');
            if (applicantColumn) {
                applicantColumn.classList.remove('is-hidden');
            }
        }

        if (history) {
            const submissions = Array.isArray(task.submissions) ? task.submissions : [];
            history.innerHTML = submissions.length === 0
                ? '<article class="history-item empty-state">No submission history available yet.</article>'
                : submissions.map((item) => `
                    <article class="history-item">
                        <strong>${escapeHtml(item.reviewStatus || 'Submitted')}</strong>
                        <div>${escapeHtml(item.submittedByName || 'Applicant')} | ${escapeHtml(formatDateTime(item.submittedAt))}</div>
                        ${state.embedded ? '' : `<div>${escapeHtml(item.reviewerRemarks || 'No reviewer remarks saved on this entry.')}</div>`}
                    </article>
                `).join('');
        }

        if (decisionStatus) {
            decisionStatus.value = ['Verified', 'Needs Correction', 'Rejected'].includes(task.status) ? task.status : 'Verified';
        }
        if (decisionRemarks) {
            decisionRemarks.value = task.reviewerRemarks || '';
        }
        if (decisionApplicantRemark) {
            decisionApplicantRemark.value = task.applicantVisibleRemark || '';
        }

        queueEmbeddedFrameSync();
    }

    function shouldUseSingleColumnReview(task) {
        return ['availment_form', 'validation_form', 'mungkahing_proyekto', 'business_plan', 'buhat_sa_pagpanumpa'].includes(String(task?.code || ''));
    }

    function renderReviewDocument(task) {
        const payload = task?.payload || {};
        switch (task?.code) {
            case 'availment_form':
                return `
                    <div class="review-unified-stack">
                        ${renderApplicantAvailment(payload)}
                        ${renderStaffAvailment(payload.staffReview || {})}
                    </div>
                `;
            case 'validation_form':
                return renderApplicantValidation(payload);
            case 'mungkahing_proyekto':
                return renderApplicantMungkahingPaper(payload);
            case 'business_plan':
                return renderReviewerBusinessPlan(payload);
            case 'buhat_sa_pagpanumpa':
                return `
                    <div class="review-unified-stack">
                        ${renderApplicantBuhatSaPagpanumpa(payload)}
                        ${renderStaffBuhatSaPagpanumpa(payload.staffReview || {})}
                    </div>
                `;
            default:
                return renderApplicantValidation(payload);
        }
    }

    function queueEmbeddedFrameSync() {
        window.setTimeout(syncEmbeddedFrame, 60);
    }

    function syncEmbeddedFrame() {
        if (!state.embedded || !window.parent || window.parent === window) {
            return;
        }

        const shell = document.querySelector('.review-shell');
        const height = Math.max(
            shell?.scrollHeight || 0,
            document.documentElement.scrollHeight || 0,
            document.body.scrollHeight || 0,
        );

        window.parent.postMessage({
            type: 'smartleap-form-review-height',
            taskId: Number(state.activeTask?.id || 0),
            height,
        }, '*');
    }

    function renderApplicantAvailment(payload) {
        const familyMembers = payload.familyEnterprise?.members || [];
        const incomeRows = payload.incomeEligibility?.rows || [];
        const commitment = payload.clientCommitment || {};
        const agreedToRollBackSchedule = commitment.agreedToRollBackSchedule ?? commitment.agreedToSavingsCommitment;
        const agreedToWeeklySavings = commitment.agreedToWeeklySavings ?? commitment.agreedToSavingsCommitment;

        return `
            <div class="review-paper-document">
                ${renderReviewPaperPage(1, `
                    <section class="review-paper-section">
                        ${renderReviewPaperSectionTitle('I.', 'CLIENT IDENTIFYING DATA')}
                        <div class="review-paper-line-grid review-paper-line-grid--two">
                            ${renderReviewPaperLineField('Name', payload.clientIdentifyingData?.name)}
                            ${renderReviewPaperLineField('Age', payload.clientIdentifyingData?.age)}
                            ${renderReviewPaperLineField('Address', payload.clientIdentifyingData?.address)}
                            ${renderReviewPaperLineField('Name of Spouse', payload.clientIdentifyingData?.spouseName)}
                        </div>
                    </section>
                    <section class="review-paper-section">
                        ${renderReviewPaperSectionTitle('II.', 'TYPE OF PROJECT')}
                        <div class="review-paper-subtitle">A. Family Enterprise</div>
                        ${renderReviewPaperTable(`
                            <tr><th>Family Member Participating</th><th>Age</th><th>Activities</th></tr>
                        `, familyMembers.map((row) => `
                            <tr><td>${escapeHtml(row.name || '--')}</td><td>${escapeHtml(row.age || '--')}</td><td>${escapeHtml(row.activities || '--')}</td></tr>
                        `).join(''))}
                        <div class="review-paper-subtitle">B. Individual Assistance</div>
                        <div class="review-paper-line-grid review-paper-line-grid--two">
                            ${renderReviewPaperLineField('Clientele Category', payload.individualAssistance?.clienteleCategory)}
                            ${renderReviewPaperLineField('Nature of difficult circumstances', payload.individualAssistance?.natureOfDifficultCircumstances)}
                        </div>
                    </section>
                    <section class="review-paper-section">
                        ${renderReviewPaperSectionTitle('III.', 'INCOME ELIGIBILITY REQUIREMENT')}
                        ${renderReviewPaperTable(`
                            <tr><th>Name of Working Family Members</th><th>Cash income</th><th>Non-cash income</th><th>Total</th></tr>
                        `, incomeRows.map((row) => `
                            <tr><td>${escapeHtml(row.memberName || '--')}</td><td>${escapeHtml(row.cashIncome || '--')}</td><td>${escapeHtml(row.nonCashIncome || '--')}</td><td>${escapeHtml(row.totalIncome || '--')}</td></tr>
                        `).join(''), `<tr><td colspan="3" class="review-paper-table__total-label">Total Family Income</td><td>${escapeHtml(payload.incomeEligibility?.totalFamilyIncome || '--')}</td></tr>`)}
                    </section>
                `)}
                ${renderReviewPaperPage(2, `
                    <section class="review-paper-section">
                        ${renderReviewPaperSectionTitle('V.', 'SOCIAL RESPONSIBILITY AND WILLINGNESS TO SAVE (CLIENT)')}
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-signoff">
                            <div class="review-paper-signoff__label">Name and Signature of Participant</div>
                            <div class="review-paper-signoff__line">${escapeHtml(payload.applicantSignature?.signedName || '--')}</div>
                            <div class="review-paper-signoff__meta">Petsa: ${escapeHtml(payload.applicantSignature?.signedDate || '--')}</div>
                            ${renderReadOnlyUpload('Participant signature upload', payload.applicantSignature?.signatureUpload)}
                        </div>
                    </section>
                `)}
            </div>
        `;
    }

    function renderApplicantValidation(payload) {
        const details = payload.applicantDetails || {};
        const checklist = payload.membershipChecklist || {};
        const staffReview = payload.staffReview || {};
        const eligibility = staffReview.eligibilityAssessment || {};
        const validatorIdentity = staffReview.validatorIdentity || {};
        const participantSignature = payload.participantSignature || {};
        const eligibilityResidentName = eligibility.residentName || participantSignature.signedName || [details.firstName, details.middleName, details.lastName].filter(Boolean).join(' ').trim();
        const eligibilityAge = eligibility.age || details.age || '--';
        const eligibilityBarangay = eligibility.barangay || details.barangay || '--';
        return `
            <div class="review-paper-document">
                ${renderReviewPaperPage(1, `
                    <section class="review-paper-section">
                        <div class="review-paper-page__subtitle">Sustainable Market and Technology and Employment Assistance Program</div>
                        <div class="review-paper-page__subtitle review-paper-page__subtitle--acronym">(SMART LEAP)</div>
                        <div class="review-paper-page__title">VALIDATION FORM</div>
                        <div class="review-paper-line-grid review-paper-line-grid--two">
                            ${renderReviewPaperLineField('Date of Validation', details.validationDate)}
                            ${renderReviewPaperLineField('Last Name', details.lastName)}
                            ${renderReviewPaperLineField('First Name', details.firstName)}
                            ${renderReviewPaperLineField('Middle Name', details.middleName)}
                            ${renderReviewPaperLineField('Address / Purok', details.purok)}
                            ${renderReviewPaperLineField('Barangay', details.barangay)}
                            ${renderReviewPaperLineField('Birthday', details.birthdate)}
                            ${renderReviewPaperLineField('Educational Attainment', details.educationalAttainment)}
                            ${renderReviewPaperLineField('Contact number', details.contactNumber)}
                        </div>
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-subtitle">CHECKLIST</div>
                        ${renderReviewPaperTable(`
                            <tr><th>Is He/She</th><th>Yes</th><th>No</th><th>Specify</th></tr>
                        `, `
                            <tr>
                                <td>Pantawid Member</td>
                                <td>${escapeHtml(checklist.pantawidMember === 'Yes' ? 'Yes' : '')}</td>
                                <td>${escapeHtml(checklist.pantawidMember === 'No' ? 'No' : '')}</td>
                                <td>${escapeHtml(checklist.pantawidSpecify || '--')}</td>
                            </tr>
                            <tr>
                                <td>SLPA Member</td>
                                <td>${escapeHtml(checklist.slpaMember === 'Yes' ? 'Yes' : '')}</td>
                                <td>${escapeHtml(checklist.slpaMember === 'No' ? 'No' : '')}</td>
                                <td>${escapeHtml(checklist.slpaSpecify || '--')}</td>
                            </tr>
                        `)}
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-subtitle">Validator's Recommendation</div>
                        <label class="review-paper-editor">
                            <span class="review-paper-editor__label">PDO/Admin editable review note</span>
                            <textarea class="review-paper-editor__textarea" name="staff.validatorRecommendation" rows="5">${escapeHtml(staffReview.validatorRecommendation || '')}</textarea>
                        </label>
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-paragraph">
                            Ako si <strong>${renderReviewInlineInput('staff.eligibilityAssessment.residentName', eligibilityResidentName || '', 'text', 'review-paper-fillline-input review-paper-fillline-input--short', true)}</strong>,
                            <strong>${renderReviewInlineInput('staff.eligibilityAssessment.age', eligibilityAge || '', 'text', 'review-paper-fillline-input review-paper-fillline-input--short', true)}</strong> anyos, lumulupyo sa Barangay
                            <strong>${renderReviewInlineInput('staff.eligibilityAssessment.barangay', eligibilityBarangay || '', 'text', 'review-paper-fillline-input review-paper-fillline-input--medium', true)}</strong>, Butuan City, Agusan Del Norte.
                            Ako nakasabot sa tumong ug proseso niining Livelihood Assistance kung diin ako
                            <strong>${renderReviewInlineSelect('staff.eligibilityAssessment.eligibilityDecision', eligibility.eligibilityDecision || '', ['ANGAYAN', 'DILI ANGAYAN'], 'review-paper-inline-select', true)}</strong>
                            (ANGAYAN/DILI ANGAYAN) mamahimong benepisyo sa among program nga gidumala sa SMART LEAP ng City Social Welfare and Development Department (CSWDD).
                        </div>
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-signoff">
                            <div class="review-paper-signoff__label">Ngalan/Perma sa Partisipante</div>
                            <div class="review-paper-signoff__line">${escapeHtml(payload.participantSignature?.signedName || '--')}</div>
                            <div class="review-paper-signoff__meta">Petsa: ${escapeHtml(payload.participantSignature?.signedDate || '--')}</div>
                            ${renderReadOnlyUpload('Participant signature upload', payload.participantSignature?.signatureUpload)}
                        </div>
                        <div class="review-paper-signoff">
                            <div class="review-paper-signoff__label">Ngalan/Perma sa Validator</div>
                            <div class="review-paper-signoff__line review-paper-signoff__line--editable">
                                <input
                                    class="review-paper-signoff__input"
                                    type="text"
                                    name="staff.validatorIdentity.validatorName"
                                    value="${escapeAttribute(resolveStaffFieldDefault('staff.validatorIdentity.validatorName', validatorIdentity.validatorName || ''))}"
                                    readonly
                                    aria-readonly="true"
                                >
                            </div>
                            <div class="review-paper-signoff__meta">
                                Petsa:
                                <input
                                    class="review-paper-signoff__date"
                                    type="date"
                                    name="staff.validatorIdentity.signedDate"
                                    value="${escapeAttribute(resolveStaffFieldDefault('staff.validatorIdentity.signedDate', validatorIdentity.signedDate || '', 'date'))}"
                                    readonly
                                    aria-readonly="true"
                                >
                            </div>
                            ${renderPaperSignatureUploadField('validatorIdentity.signatureUpload', validatorIdentity.signatureUpload || null, {
                                buttonClass: 'signature-launch',
                                linkClass: 'signature-file-link',
                                statusClass: 'signature-status-text',
                                hintClass: 'field-hint field-hint--staff',
                            })}
                        </div>
                    </section>
                `)}
            </div>
        `;
    }

    function renderStaffReviewSections(task) {
        const staffReview = task?.payload?.staffReview || {};
        if (!task) {
            return '';
        }

        if (task.code === 'availment_form') {
            return renderStaffAvailment(staffReview);
        }
        if (task.code === 'validation_form') {
            return renderStaffValidation(staffReview);
        }
        if (task.code === 'mungkahing_proyekto') {
            return renderStaffMungkahingPaper(staffReview, task.payload || {});
        }
        if (task.code === 'business_plan') {
            return renderStaffBusinessPlan(staffReview);
        }
        if (task.code === 'buhat_sa_pagpanumpa') {
            return '';
        }
        return '';
    }

    function renderApplicantFundReleaseEvidence(payload) {
        const evidence = payload.fundReleaseEvidence || {};
        return `
            ${renderReadOnlySection('Proof of Fund Release', [
                ['Release date', evidence.releaseDate],
                ['Applicant note', evidence.notes || 'No note provided'],
            ], [renderReadOnlyUpload('Release evidence attachment', evidence.releaseAttachment)])}
        `;
    }

    function parseMungkahingReviewFormulaNumber(value) {
        const normalized = String(value ?? '').trim().replace(/,/g, '');
        if (normalized === '' || !/^-?\d+(\.\d+)?$/.test(normalized)) {
            return null;
        }

        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function formatMungkahingReviewComputedNumber(value) {
        if (!Number.isFinite(value)) {
            return '';
        }

        return String(Number(value.toFixed(2)));
    }

    function computeReviewMungkahingMaterialsProjectedCost(row) {
        const quantity = parseMungkahingReviewFormulaNumber(row?.quality);
        const unitPrice = parseMungkahingReviewFormulaNumber(row?.unitPrice);
        const cycles = parseMungkahingReviewFormulaNumber(row?.cyclesPerProduction);
        if (quantity === null || unitPrice === null || cycles === null) {
            return String(row?.projectedCost || '').trim();
        }

        return formatMungkahingReviewComputedNumber(quantity * unitPrice * cycles);
    }

    function computeReviewMungkahingMaterialsTotal(rows, storedValue) {
        let total = 0;
        let hasComputedRow = false;

        (rows || []).forEach((row) => {
            const computed = computeReviewMungkahingMaterialsProjectedCost(row);
            const parsed = parseMungkahingReviewFormulaNumber(computed);
            if (parsed === null) {
                return;
            }

            total += parsed;
            hasComputedRow = true;
        });

        if (!hasComputedRow) {
            return String(storedValue || '').trim();
        }

        return formatMungkahingReviewComputedNumber(total);
    }

    function computeReviewMungkahingToolsProjectedAmount(row) {
        const quantity = parseMungkahingReviewFormulaNumber(row?.capacity);
        const unitPrice = parseMungkahingReviewFormulaNumber(row?.quantityOrPrice);
        if (quantity === null || unitPrice === null) {
            return String(row?.projectedAmount || '').trim();
        }

        return formatMungkahingReviewComputedNumber(quantity * unitPrice);
    }

    function computeReviewMungkahingToolsDepreciationCost(row) {
        const projectedAmount = parseMungkahingReviewFormulaNumber(computeReviewMungkahingToolsProjectedAmount(row));
        const usefulLife = parseMungkahingReviewFormulaNumber(row?.usefulLifeDays);
        const productionCycle = parseMungkahingReviewFormulaNumber(row?.productionCycle);
        if (projectedAmount === null || usefulLife === null || productionCycle === null || usefulLife <= 0) {
            return String(row?.depreciationCost || '').trim();
        }

        return formatMungkahingReviewComputedNumber((projectedAmount / usefulLife) * productionCycle);
    }

    function computeReviewMungkahingToolsTotal(rows, storedValue) {
        let total = 0;
        let hasComputedRow = false;

        (rows || []).forEach((row) => {
            const projectedAmount = parseMungkahingReviewFormulaNumber(computeReviewMungkahingToolsProjectedAmount(row));
            if (projectedAmount === null) {
                return;
            }

            total += projectedAmount;
            hasComputedRow = true;
        });

        if (!hasComputedRow) {
            return String(storedValue || '').trim();
        }

        return formatMungkahingReviewComputedNumber(total);
    }

    function computeReviewMungkahingExpenseGrandTotal(rows, storedValue) {
        let total = 0;
        let hasAmount = false;

        (rows || []).forEach((row) => {
            const amount = parseMungkahingReviewFormulaNumber(row?.projectedCost);
            if (amount === null) {
                return;
            }

            total += amount;
            hasAmount = true;
        });

        if (!hasAmount) {
            return String(storedValue || '').trim();
        }

        return formatMungkahingReviewComputedNumber(total);
    }

    function computeReviewMungkahingSalesProjectedSales(row) {
        const quantity = parseMungkahingReviewFormulaNumber(row?.capacity);
        const sellingPrice = parseMungkahingReviewFormulaNumber(row?.sellingPrice);
        if (quantity === null || sellingPrice === null) {
            return String(row?.projectedSales || '').trim();
        }

        return formatMungkahingReviewComputedNumber(quantity * sellingPrice);
    }

    function computeReviewMungkahingGrossSales(rows, storedValue) {
        let total = 0;
        let hasComputedRow = false;

        (rows || []).forEach((row) => {
            const projectedSales = parseMungkahingReviewFormulaNumber(computeReviewMungkahingSalesProjectedSales(row));
            if (projectedSales === null) {
                return;
            }

            total += projectedSales;
            hasComputedRow = true;
        });

        if (!hasComputedRow) {
            return String(storedValue || '').trim();
        }

        return formatMungkahingReviewComputedNumber(total);
    }

    function renderApplicantMungkahing(payload) {
        const sectoral = payload.sectoralClassification || {};
        const contributions = payload.modalityApplications?.rows || [];
        const materials = payload.businessOperation?.materials?.rows || [];
        const labor = payload.businessOperation?.labor?.rows || [];
        const equipment = payload.businessOperation?.toolsEquipment?.rows || [];
        const expenses = payload.businessOperation?.operatingExpenses?.rows || [];
        const sales = payload.businessOperation?.salesProjection?.rows || [];
        const spending = payload.spendingPlan?.rows || [];
        const income = payload.businessOperation?.incomeComputation || {};

        return `
            ${renderReadOnlySection('Kinatibuk-an Impormasyon Bahin sa Proyekto', [
                ['Ngalan sa Partisipante', payload.projectInformation?.participantName],
                ['Lokasyon sa Proyekto', payload.projectInformation?.projectLocation],
                ['Ulohan sa Proyektong MD', payload.projectInformation?.projectTitle],
                ['Petsa sa Pagtukod', payload.projectInformation?.projectDate],
                ['Kinatibuk-ang Kantidad', payload.projectInformation?.projectedAmount],
                ['Kantidad gikan sa CSWDD', payload.projectInformation?.cswddAmount],
                ['Laing kakuhaon sa pondo', payload.projectInformation?.otherFundingSource],
                ['Savings Account No.', payload.projectInformation?.savingsAccountNumber],
            ])}
            ${renderReviewMungkahingSectorMatrix(sectoral)}
            ${renderReadOnlySection('Rationale of the Proposed Project', [
                ['Rason sa proyekto', payload.rationale],
            ])}
            ${renderSimpleTable('Detalye sa Modality Application/s', ['Kakuhuan sa Pondo', 'Gi-ambag', 'Kantidad'], contributions.map((row) => [row.fundSource, row.contributionType, row.amount]))}
            ${renderSimpleTable('Mga gikinahanglan nga Materyales', ['Material', 'Kadaghanon', 'Yunit', 'Unit Price', 'Siklo sa Produksyon', 'Kinatibuk-ang kantidad'], materials.map((row) => [row.material, row.quality, row.unit, row.unitPrice, row.cyclesPerProduction, computeReviewMungkahingMaterialsProjectedCost(row)]))}
            ${renderReadOnlySection('IV.a Kinatibuk-ang Total', [
                ['Kinatibuk-ang Total', computeReviewMungkahingMaterialsTotal(materials, payload.businessOperation?.materials?.totalCost)],
            ])}
            ${renderSimpleTable('Mga gikinahanglan na Trabahante', ['Ngalan sa Magtrabaho sa Negosyo', 'Posisyon sa Trabaho', 'Inadlaw na Suweldo'], labor.map((row) => [row.workerName, row.position, row.dailyWage]))}
            ${renderReadOnlySection('IV.b Mga kinatibuk-ang suweldo', [
                ['Kinatibuk-an na inadlaw na suweldo', payload.businessOperation?.labor?.totalDailyWage],
                ['Kinatibuk-an na suweldo base sa siglo sa produksyon', payload.businessOperation?.labor?.totalProductionCycleWage],
            ])}
            ${renderSimpleTable('IV.c Mga Gikinahanglan nga Kagamitan', ['Kagamitan', 'Kadaghanon', 'Yunit', 'Kantidad o presyo sa matag usa', 'Kinatibuk-an nga kantidad o presyo', 'Gitas-on sa kinabuhi sa mga himan/kagamitan', 'Siklo sa Produksyon', 'Depreciation Cost'], equipment.map((row) => [row.equipment, row.capacity, row.unit, row.quantityOrPrice, computeReviewMungkahingToolsProjectedAmount(row), row.usefulLifeDays, row.productionCycle, computeReviewMungkahingToolsDepreciationCost(row)]))}
            ${renderReadOnlySection('IV.c Kinatibuk-ang Total', [
                ['Kinatibuk-ang Total', computeReviewMungkahingToolsTotal(equipment, payload.businessOperation?.toolsEquipment?.totalCost)],
            ])}
            ${renderSimpleTable('IV.d Uban pang mga gastohanan', ['Regular na ginagastuhan', 'Dalas ng pagbayad', 'Kinatibuk-an na kantidad o presyo base sa siglo sa produksyon'], expenses.map((row) => [row.expenseName, row.paymentFrequency, row.projectedCost]))}
            ${renderReadOnlySection('IV.d Grand Total', [
                ['Grand Total', computeReviewMungkahingExpenseGrandTotal(expenses, payload.businessOperation?.operatingExpenses?.grandTotal)],
            ])}
            ${renderSimpleTable('IV.e Pangunahing kita gikan sa puhunan alang sa mga sangkap', ['Produkto', 'Kadaghanon', 'Yunit', 'Kantidad sa pagpamaligya matag piraso', 'Kinatibuk-an na kantidad sa pagpamaligya base sa siglo sa produksyon'], sales.map((row) => [row.product, row.capacity, row.unit, row.sellingPrice, computeReviewMungkahingSalesProjectedSales(row)]))}
            ${renderReadOnlySection('IV.e Gross Sales', [
                ['Gross Sales', computeReviewMungkahingGrossSales(sales, payload.businessOperation?.salesProjection?.grossSales)],
            ])}
            ${renderReadOnlySection('IV.f Kinatibuk-ang kita sa matag produkto o paghimo sa serbisyo', [
                ['Gilauman nga kita alang sa usa ka "siklo sa produksyon"', income.projectedIncomePerCycle],
                ['Mga materyales (raw materials)', income.rawMaterialsCost],
                ['Gikinahanglan na manpower ug labor', income.manpowerLaborCost],
                ['Depreciation Cost', income.depreciationCost],
                ['Uban pang mga Gasto', income.otherExpenses],
                ['Kinatibuk-ang gasto sa pag-operate', income.totalOperatingCost],
                ['Kinatibuk-ang ginansya human sa gasto sa operasyon (Gross Profit)', income.grossProfit],
                ['Net profit', income.netProfit],
            ])}
            ${renderSimpleTable('IV.g Iskedyul o Plano sa Paggasto sa SEA-K Capital Fund', ['Mga Gasto', 'Kantidad', 'Iskedyul sa Paggamit'], spending.map((row) => [row.expense, row.amount, row.usageSchedule]))}
            ${renderReadOnlySection('Participant Signature', [
                ['Signed name', payload.applicantSignature?.signedName],
                ['Date signed', payload.applicantSignature?.signedDate],
            ], [renderReadOnlyUpload('Signature upload', payload.applicantSignature?.signatureUpload)])}
        `;
    }

    function renderStaffAvailment(staffReview) {
        const pageOne = staffReview.pageOneCertification || {};
        const physical = staffReview.physicalRequirements || {};
        const food = physical.foodRelatedCertification || {};
        const healthRows = physical.healthAgeRows || [];
        const psycho = staffReview.psychoSocialRequirements || {};
        const residency = psycho.residencyAndCharacter || {};
        const relationships = psycho.familyRelationshipsWorkHabitsAspiration || {};

        return `
            <div class="review-paper-document">
                ${renderReviewStatementBlock(
                    'Page 1 Eligibility Certification',
                    renderReviewCertificationSentence(`
                        I certify that <strong>${escapeHtml(pageOne.eligibilityStatementName || '________________')}</strong> is eligible to avail the Sustainable Market and Technology Driven Livelihood and Employment Assistance Program (SMART LEAP) based on the assessment.
                    `),
                    renderReviewSignatureArea('Direct Worker', `
                        <div class="row-grid">
                            ${renderInput('Direct worker name', 'staff.pageOneCertification.directWorkerName', pageOne.directWorkerName || '')}
                            ${renderUploadField('Direct worker signature upload', 'pageOneCertification.signatureUpload', pageOne.signatureUpload || null)}
                        </div>
                    `)
                )}
                ${renderReviewStatementBlock(
                    'IV. Physical Requirements',
                    `
                        ${renderSimpleTable('A. Health Age Requirements', ['Requirement', 'Age', 'Health Status'], healthRows.map((row) => [row.requirement, row.age, row.healthStatus]))}
                        ${renderReviewCertificationSentence(`
                            I certify that <strong>${escapeHtml(food.applicantName || '________________')}</strong> has undergone medical check-up and is physically fit to run a food related projects.
                        `)}
                        <div class="row-grid">
                            ${renderInput('Certifying officer name', 'staff.physicalRequirements.foodRelatedCertification.certifyingOfficerName', food.certifyingOfficerName || '')}
                            ${renderUploadField('Certifying officer signature upload', 'physicalRequirements.foodRelatedCertification.signatureUpload', food.signatureUpload || null)}
                        </div>
                    `
                )}
                ${renderReviewStatementBlock(
                    'V.A Residency and Character',
                    renderReviewCertificationSentence(`
                        I certify that <strong>${escapeHtml(residency.residentName || '________________')}</strong> a bona fide resident of the barangay and is of good moral character and has no adverse reputation.
                    `) + `
                        <div class="row-grid">
                            ${renderInput('Certifying officer name', 'staff.psychoSocialRequirements.residencyAndCharacter.certifyingOfficerName', residency.certifyingOfficerName || '')}
                            ${renderUploadField('Certifying officer signature upload', 'psychoSocialRequirements.residencyAndCharacter.signatureUpload', residency.signatureUpload || null)}
                        </div>
                    `
                )}
                ${renderReviewStatementBlock(
                    'V.B Family Relationships, Work Habits, Aspirations',
                    renderReviewCertificationSentence(`
                        I certify that through personal interview, home visit and collateral interview I have verified that <strong>${escapeHtml(relationships.applicantName || '________________')}</strong> manifest positive relationships, good work habits and attitude as well as demonstrated capacity and adequate level of economic aspiration.
                    `) + `
                        <div class="row-grid">
                            ${renderInput('Direct worker name', 'staff.psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.directWorkerName', relationships.directWorkerName || '')}
                            ${renderUploadField('Direct worker signature upload', 'psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload', relationships.signatureUpload || null)}
                        </div>
                    `
                )}
            </div>
        `;
    }

    function renderStaffValidation(staffReview) {
        const identity = staffReview.validatorIdentity || {};
        return `
            ${renderReviewStatementBlock(
                'Validator Recommendation',
                renderReviewCertificationSentence(`
                    Validator's Recommendation:
                `) + renderTextarea('Recommendation', 'staff.validatorRecommendation', staffReview.validatorRecommendation || '')
                ,
                renderReviewSignatureArea('Ngalan/Perma sa Validator', `
                    <div class="row-grid">
                        ${renderInput('Validator name', 'staff.validatorIdentity.validatorName', identity.validatorName || '')}
                        ${renderInput('Date signed', 'staff.validatorIdentity.signedDate', identity.signedDate || '', 'date')}
                        ${renderUploadField('Validator signature upload', 'validatorIdentity.signatureUpload', identity.signatureUpload || null)}
                    </div>
                `)
            )}
        `;
    }

    function renderStaffFundReleaseEvidence(payload) {
        const evidence = payload.fundReleaseEvidence || {};
        return `
            ${renderReviewStatementBlock(
                'Final Requirement Review',
                `
                    <p class="review-copy">This is the last requirement before the applicant can be promoted to beneficiary. Verify the uploaded proof of fund release, then save the review decision below.</p>
                    ${renderReadOnlySection('Submitted release evidence', [
                        ['Release date', evidence.releaseDate],
                        ['Applicant note', evidence.notes || 'No note provided'],
                    ], [renderReadOnlyUpload('Release evidence attachment', evidence.releaseAttachment)])}
                `
            )}
        `;
    }

    function renderStaffMungkahing(staffReview) {
        const recommendation = staffReview.recommendation || {};

        return `
            ${renderReviewStatementBlock(
                'V. Rekomendasyon',
                `
                    <div class="row-grid">
                        ${renderInput('Project name', 'staff.recommendation.projectName', recommendation.projectName || '')}
                        ${renderInput('Recommended amount', 'staff.recommendation.recommendedAmount', recommendation.recommendedAmount || '', 'number')}
                        ${renderInput('Approver name', 'staff.recommendation.approverName', recommendation.approverName || '')}
                        ${renderInput('Approved date', 'staff.recommendation.approvedDate', recommendation.approvedDate || '', 'date')}
                    </div>
                    ${renderUploadField('Approval signature upload', 'recommendation.signatureUpload', recommendation.signatureUpload || null)}
                `
            )}
        `;
    }

    function renderApplicantMungkahingPaper(payload) {
        return renderExactMungkahingPaper(payload, { editable: true });

        const project = payload.projectInformation || {};
        const recommendation = payload.staffReview?.recommendation || {};
        const sectoral = payload.sectoralClassification || {};
        const contributions = payload.modalityApplications?.rows || [];
        const materials = payload.businessOperation?.materials?.rows || [];
        const labor = payload.businessOperation?.labor?.rows || [];
        const equipment = payload.businessOperation?.toolsEquipment?.rows || [];
        const expenses = payload.businessOperation?.operatingExpenses?.rows || [];
        const sales = payload.businessOperation?.salesProjection?.rows || [];
        const spending = payload.spendingPlan?.rows || [];
        const income = payload.businessOperation?.incomeComputation || {};

        return `
            <div class="review-paper-document">
                ${renderReviewPaperPage(1, `
                    <section class="review-paper-section">
                        ${renderReviewPaperSectionTitle('I.', 'KINATIBUK-AN IMPORMASYON BAHIN SA PROYEKTO')}
                        <div class="review-paper-line-grid review-paper-line-grid--two">
                            ${renderReviewPaperLineField('Ngalan sa Partisipante', project.participantName)}
                            ${renderReviewPaperLineField('Lokasyon sa Proyekto', project.projectLocation)}
                            ${renderReviewPaperLineField('Ulohan sa Proyektong MD', project.projectTitle)}
                            ${renderReviewPaperLineField('Petsa sa Pagtukod', project.projectDate)}
                            ${renderReviewPaperLineField('Kinatibuk-ang Kantidad', project.projectedAmount)}
                            ${renderReviewPaperLineField('Savings Account no.', project.savingsAccountNumber)}
                            ${renderReviewPaperLineField('Kantidad gikan sa CSWDD', project.cswddAmount)}
                            ${renderReviewPaperLineField('Lain kakuhan sa pondo', project.otherFundingSource)}
                        </div>
                        ${renderReviewMungkahingSectorMatrix(sectoral)}
                    </section>
                    <section class="review-paper-section">
                        ${renderReviewPaperSectionTitle('II.', 'RATIONALE OF THE PROPOSED PROJECT')}
                        ${renderReviewPaperParagraphBlock(payload.rationale || '')}
                    </section>
                    <section class="review-paper-section">
                        ${renderReviewPaperSectionTitle('III.', 'DETALYE SA MODALITY APPLICATION/S')}
                        <div class="review-paper-note">PONDO NGA GI-AMBAG SA MGA PARTNER/S:</div>
                        <div class="review-paper-note review-paper-note--italic">Self-Employment Assistance-Kaunlaran (SEA-K)</div>
                        ${renderReviewPaperTable(`
                            <tr><th style="width:30%">Kakuhan sa Pondo</th><th style="width:34%">Gi-ambag</th><th style="width:36%">Kantidad</th></tr>
                        `, contributions.map((row) => `
                            <tr>
                                <td>${escapeHtml(row.fundSource || '--')}</td>
                                <td>${escapeHtml(row.contributionType || '--')}</td>
                                <td>${escapeHtml(row.amount || '--')}</td>
                            </tr>
                        `).join(''))}
                    </section>
                    <section class="review-paper-section">
                        ${renderReviewPaperSectionTitle('IV.', 'Pagdumala sa Negosyo')}
                        <div class="review-paper-subtitle">a.) Mga gikinahanglang Materyales</div>
                        ${renderReviewPaperTable(`
                            <tr><th>(Materyales)<br>(a)</th><th>(Kadaghanon)<br>(b)</th><th>(Yunit)<br>(c)</th><th>(Kantidad o presyo sa matag yunit)<br>(d)</th><th>(Dalas sa paggamit/Siklo sa Produksyon)<br>(e)</th><th>(Kinatibuk-an na kantidad o presyo)<br>(f)</th></tr>
                        `, materials.map((row) => `
                            <tr>
                                <td>${escapeHtml(row.material || '--')}</td>
                                <td>${escapeHtml(row.quality || '--')}</td>
                                <td>${escapeHtml(row.unit || '--')}</td>
                                <td>${escapeHtml(row.unitPrice || '--')}</td>
                                <td>${escapeHtml(row.cyclesPerProduction || '--')}</td>
                                <td>${escapeHtml(computeReviewMungkahingMaterialsProjectedCost(row) || '--')}</td>
                            </tr>
                        `).join(''), `<tr><td colspan="5" class="review-paper-table__total-label">Kinatibuk-ang Total</td><td>${escapeHtml(computeReviewMungkahingMaterialsTotal(materials, payload.businessOperation?.materials?.totalCost) || '--')}</td></tr>`)}
                        <div class="review-paper-subtitle">b.) Mga Gikinahanglan na Trabahante</div>
                        ${renderReviewPaperTable(`
                            <tr><th>Ngalan sa Magtrabaho sa Negosyo</th><th>Posisyon sa Trabaho</th><th>Inadlaw na Sweldo</th></tr>
                        `, labor.map((row) => `
                            <tr>
                                <td>${escapeHtml(row.workerName || '--')}</td>
                                <td>${escapeHtml(row.position || '--')}</td>
                                <td>${escapeHtml(row.dailyWage || '--')}</td>
                            </tr>
                        `).join(''), `
                            <tr><td colspan="2" class="review-paper-table__total-label">Kinatibuk-an na inadlaw na sweldo</td><td>${escapeHtml(payload.businessOperation?.labor?.totalDailyWage || '--')}</td></tr>
                            <tr><td colspan="2" class="review-paper-table__total-label">Kinatibuk-an na suweldo base sa siglo sa produksyon</td><td>${escapeHtml(payload.businessOperation?.labor?.totalProductionCycleWage || '--')}</td></tr>
                        `)}
                    </section>
                `)}
                ${renderReviewPaperPage(2, `
                    <section class="review-paper-section">
                        <div class="review-paper-subtitle">c.) Mga Gikinahanglan nga Kagamitan (Tools and Equipment)</div>
                        ${renderReviewPaperTable(`
                            <tr><th>Kagamitan (a)</th><th>Kadaghanon (b)</th><th>Yunit (c)</th><th>Kantidad o presyo (d)</th><th>Kinatibuk-ang kantidad (e)</th><th>Gitas-on sa kinabuhi (f)</th><th>Siklo sa Produksyon (g)</th><th>Depreciation Cost (h)</th></tr>
                        `, equipment.map((row) => `
                            <tr>
                                <td>${escapeHtml(row.equipment || '--')}</td>
                                <td>${escapeHtml(row.capacity || '--')}</td>
                                <td>${escapeHtml(row.unit || '--')}</td>
                                <td>${escapeHtml(row.quantityOrPrice || '--')}</td>
                                <td>${escapeHtml(computeReviewMungkahingToolsProjectedAmount(row) || '--')}</td>
                                <td>${escapeHtml(row.usefulLifeDays || '--')}</td>
                                <td>${escapeHtml(row.productionCycle || '--')}</td>
                                <td>${escapeHtml(computeReviewMungkahingToolsDepreciationCost(row) || '--')}</td>
                            </tr>
                        `).join(''), `<tr><td colspan="7" class="review-paper-table__total-label">Kinatibuk-ang Total</td><td>${escapeHtml(computeReviewMungkahingToolsTotal(equipment, payload.businessOperation?.toolsEquipment?.totalCost) || '--')}</td></tr>`)}
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-subtitle">d.) Uban pang mga gastohanan</div>
                        ${renderReviewPaperTable(`
                            <tr><th>Regular na ginagastuhan</th><th>Dalas ng pagbayad</th><th>Kinatibuk-an na kantidad o presyo base sa siglo sa produksyon</th></tr>
                        `, expenses.map((row) => `
                            <tr>
                                <td>${escapeHtml(row.expenseName || '--')}</td>
                                <td>${escapeHtml(row.paymentFrequency || '--')}</td>
                                <td>${escapeHtml(row.projectedCost || '--')}</td>
                            </tr>
                        `).join(''), `<tr><td colspan="2" class="review-paper-table__total-label">Grand Total</td><td>${escapeHtml(computeReviewMungkahingExpenseGrandTotal(expenses, payload.businessOperation?.operatingExpenses?.grandTotal) || '--')}</td></tr>`)}
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-subtitle">e.) Pangunahing kita gikan sa puhunan alang sa mga sangkap</div>
                        ${renderReviewPaperTable(`
                            <tr><th>Produkto (a)</th><th>Kadaghanon (b)</th><th>Yunit (c)</th><th>Kantidad sa pagpamaligya matag piraso (d)</th><th>Kinatibuk-an na kantidad sa pagpamaligya base sa siglo sa produksyon (e)</th></tr>
                        `, sales.map((row) => `
                            <tr>
                                <td>${escapeHtml(row.product || '--')}</td>
                                <td>${escapeHtml(row.capacity || '--')}</td>
                                <td>${escapeHtml(row.unit || '--')}</td>
                                <td>${escapeHtml(row.sellingPrice || '--')}</td>
                                <td>${escapeHtml(computeReviewMungkahingSalesProjectedSales(row) || '--')}</td>
                            </tr>
                        `).join(''), `<tr><td colspan="4" class="review-paper-table__total-label">Gross Sales</td><td>${escapeHtml(computeReviewMungkahingGrossSales(sales, payload.businessOperation?.salesProjection?.grossSales) || '--')}</td></tr>`)}
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-subtitle">f.) Kinatibuk-ang kita sa matag produkto o paghimo sa serbisyo</div>
                        ${renderReviewPaperTable(`
                            <tr><th style="width:64%"></th><th style="width:36%">Presyo</th></tr>
                        `, `
                            <tr><td>Gilauman nga kita alang sa usa ka "siklo sa produksyon" <em>(SEE TABLE E)</em></td><td>${escapeHtml(income.projectedIncomePerCycle || '--')}</td></tr>
                            <tr><td>Less: Mga materyales <em>(SEE TABLE A)</em></td><td>${escapeHtml(income.rawMaterialsCost || '--')}</td></tr>
                        `)}
                    </section>
                `)}
                ${renderReviewPaperPage(3, `
                    <section class="review-paper-section">
                        ${renderReviewPaperTable(`
                            <tr><th style="width:64%"></th><th style="width:36%">Presyo</th></tr>
                        `, `
                            <tr><td>Gikinahanglan na manpower ug labor <em>(SEE TABLE B)</em></td><td>${escapeHtml(income.manpowerLaborCost || '--')}</td></tr>
                            <tr><td>Depreciation Cost <em>(SEE TABLE C)</em></td><td>${escapeHtml(income.depreciationCost || '--')}</td></tr>
                            <tr><td>Uban pang mga Gasto <em>(SEE TABLE D)</em></td><td>${escapeHtml(income.otherExpenses || '--')}</td></tr>
                            <tr><td>Kinatibuk-an na gasto sa pag-operate <em>(table B+C+D)</em></td><td>${escapeHtml(income.totalOperatingCost || '--')}</td></tr>
                            <tr><td>Kinatibuk-an na ginansya human sa gasto sa operasyon (Gross Profit)</td><td>${escapeHtml(income.grossProfit || '--')}</td></tr>
                            <tr><td>Net profit</td><td>${escapeHtml(income.netProfit || '--')}</td></tr>
                        `)}
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-subtitle">g.) Iskedyul o Plano sa Paggasto sa SEA-K Capital Fund (SCF)</div>
                        ${renderReviewPaperTable(`
                            <tr><th>Mga Gasto</th><th>Kantidad</th><th>Iskedyul sa Paggamit</th></tr>
                        `, spending.map((row) => `
                            <tr>
                                <td>${escapeHtml(row.expense || '--')}</td>
                                <td>${escapeHtml(row.amount || '--')}</td>
                                <td>${escapeHtml(row.usageSchedule || '--')}</td>
                            </tr>
                        `).join(''))}
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-signoff">
                            <div class="review-paper-signoff__label">GI-ANDAM NI</div>
                            <div class="review-paper-signoff__line">${escapeHtml(payload.applicantSignature?.signedName || '--')}</div>
                            <div class="review-paper-signoff__meta">Pangalan sa Partisipante</div>
                            <div class="review-paper-signoff__meta">Petsa: ${escapeHtml(payload.applicantSignature?.signedDate || '--')}</div>
                            ${renderReadOnlyUpload('Pirma sa Partisipante', payload.applicantSignature?.signatureUpload)}
                        </div>
                        <div class="review-paper-signoff">
                            <div class="review-paper-signoff__label">Name and Signature sa Validator</div>
                            <div class="review-paper-signoff__line">${escapeHtml(recommendation.approverName || '--')}</div>
                            <div class="review-paper-signoff__meta">Petsa: ${escapeHtml(recommendation.approvedDate || '--')}</div>
                            ${renderReadOnlyUpload('Validator signature upload', recommendation.signatureUpload)}
                        </div>
                    </section>
                `)}
            </div>
        `;
    }

    function renderStaffMungkahingPaper(staffReview, payload) {
        const recommendation = staffReview.recommendation || {};
        const projectTitle = payload.projectInformation?.projectTitle || '';
        const amount = recommendation.recommendedAmount || '';

        return `
            <div class="review-paper-document">
                ${renderReviewPaperPage(3, `
                    <section class="review-paper-section">
                        ${renderReviewPaperSectionTitle('V.', 'REKOMENDASYON')}
                        <div class="review-certification-sentence">
                            Kini nagrekomenda nga punduhan ang maong <strong>Mungkahing Proyekto</strong> alang sa Micro Enterprise Development alang sa proyektong
                            <span class="review-paper-fillline review-paper-fillline--long">${escapeHtml(projectTitle || '________________')}</span>
                            nga adunay kinatibuk-ang kantidad na Php
                            ${renderReviewInlineInput('staff.recommendation.recommendedAmount', amount || '', 'number', 'review-paper-fillline-input')}
                            .
                        </div>
                    </section>
                    <section class="review-paper-section">
                        <div class="review-paper-signoff">
                            <div class="review-paper-signoff__label">Name and Signature sa Validator</div>
                            <div class="row-grid">
                                ${renderInput('Validator name', 'staff.recommendation.approverName', recommendation.approverName || '')}
                                ${renderInput('Petsa', 'staff.recommendation.approvedDate', recommendation.approvedDate || '', 'date')}
                                ${renderUploadField('Pirma sa Validator', 'recommendation.signatureUpload', recommendation.signatureUpload || null)}
                            </div>
                        </div>
                    </section>
                `, true)}
            </div>
        `;
    }

    function renderExactMungkahingPaper(payload, options = {}) {
        const data = payload || {};
        const editable = Boolean(options.editable);
        const project = data.projectInformation || {};
        const business = data.businessOperation || {};
        const materials = exactRows(business.materials?.rows, { material: '', quality: '', unit: '', unitPrice: '', cyclesPerProduction: '', projectedCost: '' }, 4);
        const labor = exactRows(business.labor?.rows, { workerName: '', position: '', dailyWage: '' }, 2);
        const equipment = exactRows(business.toolsEquipment?.rows, { equipment: '', capacity: '', unit: '', quantityOrPrice: '', projectedAmount: '', usefulLifeDays: '', productionCycle: '', depreciationCost: '' }, 3);
        const expenses = exactExpenseRows(business.operatingExpenses?.rows);
        const sales = exactRows(business.salesProjection?.rows, { product: '', capacity: '', unit: '', sellingPrice: '', projectedSales: '' }, 6);
        const spending = exactRows(data.spendingPlan?.rows, { expense: '', amount: '', usageSchedule: '' }, 10);
        const modalityRows = exactRows(data.modalityApplications?.rows, { fundSource: '', contributionType: '', amount: '' }, 2);
        const income = business.incomeComputation || {};
        const recommendation = data.staffReview?.recommendation || {};

        return `
            <div class="paper-document paper-document--mungkahing paper-document--review">
                ${renderExactMungkahingPage(1, `
                    <div class="section">
                        <div class="roman">I.</div>
                        <div>
                            <div class="section-title">KINATIBUK-AN IMPORMASYON BAHIN SA PROYEKTO</div>
                            <div class="field-grid">
                                ${exactLineRow('Ngalan sa Partisipante', project.participantName, 'w-240')}
                                ${exactLineRow('Lokasyon sa Proyekto', project.projectLocation, 'w-260')}
                                ${exactLineRow('Ulohan sa Proyektong MD', project.projectTitle, 'w-220')}
                                ${exactLineRow('Petsa sa Pagtukod', project.projectDate, 'w-250')}
                                ${exactLineRow('Kinatibuk-ang Kantidad', project.projectedAmount, 'w-220')}
                                ${exactLineRow('Savings Account no.', project.savingsAccountNumber || 'NONE', 'w-250')}
                                ${exactLineRow('Kantidad gikan sa CSWDD', project.cswddAmount, 'w-220')}
                                <div></div>
                                ${exactLineRow('Lain kakuhan sa pondo', project.otherFundingSource, 'w-220')}
                                <div></div>
                            </div>
                            ${renderExactMungkahingSectorMatrix(data.sectoralClassification || {})}
                        </div>
                    </div>
                    <div class="section">
                        <div class="roman">II.</div>
                        <div>
                            <div class="section-title">RATIONALE OF THE PROPOSED PROJECT</div>
                            <div class="rationale-lines">
                                <textarea class="rationale-area" disabled>${escapeHtml(data.rationale || '')}</textarea>
                            </div>
                        </div>
                    </div>
                    <div class="section">
                        <div class="roman">III.</div>
                        <div>
                            <div class="section-title">DETALYE SA MODALITY APPLICATION/S</div>
                            <div class="modality-head">PONDO NGA GI-AMBAG SA MGA PARTNER/S:</div>
                            <div class="note-line">Self-Employment Assistance-Kaunlaran (SEA-K)</div>
                            ${exactTable('modality-table', `
                                <tr><th style="width:31%">Kakuhan sa Pondo</th><th style="width:39%">Gi-ambag</th><th style="width:30%">Kantidad</th></tr>
                            `, modalityRows.map((row) => `
                                <tr>
                                    <td><span class="fixed-cell fixed-cell--modality">${escapeHtml(row.fundSource || '')}</span></td>
                                    <td>${exactCell(row.contributionType)}</td>
                                    <td>${exactCell(row.amount)}</td>
                                </tr>
                            `).join(''))}
                        </div>
                    </div>
                    <div class="section">
                        <div class="roman">IV.</div>
                        <div>
                            <div class="section-title">Pagdumala sa Negosyo</div>
                            <div class="sub-block-title">a.) Mga gikinahanglang Materyales</div>
                            ${exactTable('materials-table', `
                                <tr><th>(Materyales)<br>(a)</th><th>(Kadaghanon)<br>(b)</th><th>(Yunit)<br>(c)</th><th>(Kantidad o presyo sa matag yunit)<br>(d)</th><th>(Dalas sa paggamit/Siklo sa Produksyon)<br>(e)</th><th>(Kinatibuk-an na kantidad o presyo)<br>(f)</th></tr>
                            `, materials.map((row) => `
                                <tr>
                                    <td>${exactCell(row.material)}</td>
                                    <td>${exactCell(row.quality)}</td>
                                    <td>${exactCell(row.unit)}</td>
                                    <td>${exactCell(row.unitPrice)}</td>
                                    <td>${exactCell(row.cyclesPerProduction)}</td>
                                    <td>${exactCell(row.projectedCost)}</td>
                                </tr>
                            `).join(''), `<tr><td colspan="5" class="right-text">Kinatibuk-ang Total</td><td>${exactCell(business.materials?.totalCost)}</td></tr>`)}
                            <div class="sub-block-title">b.) Mga Gikinahanglan na Trabahante</div>
                            ${exactTable('workers-table', `
                                <tr><th>Ngalan sa Magtrabaho sa Negosyo</th><th>Posisyon sa Trabaho</th><th>Inadlaw na Sweldo</th></tr>
                            `, labor.map((row) => `
                                <tr>
                                    <td>${exactCell(row.workerName)}</td>
                                    <td>${exactCell(row.position)}</td>
                                    <td>${exactCell(row.dailyWage)}</td>
                                </tr>
                            `).join(''), `
                                <tr><td colspan="2" class="right-text">Kinatibuk-an na inadlaw na sweldo</td><td>${exactCell(business.labor?.totalDailyWage)}</td></tr>
                                <tr><td colspan="2" class="right-text">Kinatibuk-an na suweldo base sa siglo sa produksyon</td><td>${exactCell(business.labor?.totalProductionCycleWage)}</td></tr>
                            `)}
                        </div>
                    </div>
                `, { showTitleBlock: true, bodyClass: 'content content--page1' })}
                ${renderExactMungkahingPage(2, `
                    <div class="sub-block-title">c) Mga Gikinahanglan nga Kagamitan (Tools and Equipment)</div>
                    ${exactTable('tools-table', `
                        <tr><th>Kagamitan<br>(a)</th><th>Kadaghanon<br>(b)</th><th>Yunit<br>(c)</th><th>Kantidad o presyo sa matag usa<br>(d)</th><th>Kantidad na kantidad o presyo<br>(e)</th><th>Gitas-on sa kinabuhi/kagamitan<br>(divide sa 365 days)<br>(f)</th><th>Siklo sa Produksyon<br>(in days/months/years)<br>(g)</th><th>Depreciation Cost<br>(h) = [(e)/(f)] x (g)</th></tr>
                    `, equipment.map((row) => `
                        <tr>
                            <td>${exactCell(row.equipment)}</td>
                            <td>${exactCell(row.capacity)}</td>
                            <td>${exactCell(row.unit)}</td>
                            <td>${exactCell(row.quantityOrPrice)}</td>
                            <td>${exactCell(row.projectedAmount)}</td>
                            <td>${exactCell(row.usefulLifeDays)}</td>
                            <td>${exactCell(row.productionCycle)}</td>
                            <td>${exactCell(row.depreciationCost)}</td>
                        </tr>
                    `).join(''), `<tr><td colspan="7" class="total-label">Kinatibuk-ang Total</td><td>${exactCell(business.toolsEquipment?.totalCost)}</td></tr>`)}
                    <div class="sub-block-title">d) Uban pang mga gastohanan</div>
                    ${exactTable('other-expenses-table', `
                        <tr><th style="width:40%">Regular na ginagastuhan</th><th style="width:24%">Dalas ng pagbayad<br>(weekly, quarterly, monthly)</th><th style="width:36%">Kinatibuk-an na kantidad o presyo base sa siglo sa produksyon</th></tr>
                    `, expenses.map((row) => `
                        <tr>
                            <td><span class="fixed-cell">${escapeHtml(row.expenseName || '')}</span></td>
                            <td>${exactCell(row.paymentFrequency)}</td>
                            <td>${exactCell(row.projectedCost)}</td>
                        </tr>
                    `).join(''), `<tr><td colspan="2" class="total-label">Grand Total</td><td>${exactCell(business.operatingExpenses?.grandTotal)}</td></tr>`)}
                    <div class="sub-block-title">e) Pangunahing kita gikan sa puhunan alang sa mga sangkap</div>
                    ${exactTable('gross-table', `
                        <tr><th>Produkto<br>(a)</th><th>Kadaghanon<br>(b)</th><th>Yunit<br>(c)</th><th>Kantidad sa pagpamaligya matag piraso<br>(d)</th><th>Kinatibuk-an na kantidad sa pagpamaligya base sa siglo sa produksyon<br>[(e)= (b) x (d)]</th></tr>
                    `, sales.map((row) => `
                        <tr>
                            <td>${exactCell(row.product)}</td>
                            <td>${exactCell(row.capacity)}</td>
                            <td>${exactCell(row.unit)}</td>
                            <td>${exactCell(row.sellingPrice)}</td>
                            <td>${exactCell(row.projectedSales)}</td>
                        </tr>
                    `).join(''), `<tr><td colspan="4" class="total-label">Gross Sales</td><td>${exactCell(business.salesProjection?.grossSales)}</td></tr>`)}
                    <div class="sub-block-title">f) Kinatibuk-ang kita sa matag produkto o paghimo sa serbisyo</div>
                    ${exactTable('bottom-summary', `<tr><th style="width:64%"></th><th style="width:36%">PRESYO</th></tr>`, `
                        <tr><td>Gilauman nga kita alang sa usa ka "siklo sa produksyon" (production cycle) <em>(SEE TABLE E)</em></td><td>${exactCell(income.projectedIncomePerCycle)}</td></tr>
                        <tr><td>Less:&nbsp; Mga materyales (raw materials) <em>(SEE TABLE A)</em></td><td>${exactCell(income.rawMaterialsCost)}</td></tr>
                    `)}
                `, { bodyClass: 'content content--page2' })}
                ${renderExactMungkahingPage(3, `
                    ${exactTable('summary-table', `<tr><th style="width:64%"></th><th style="width:36%">PRESYO</th></tr>`, `
                        <tr><td class="summary-label">Gikinahanglan na manpower ug labor <em>(SEE TABLE B)</em></td><td>${exactCell(income.manpowerLaborCost)}</td></tr>
                        <tr class="light-row"><td class="summary-label">Depreciation Cost <em>(SEE TABLE C)</em></td><td>${exactCell(income.depreciationCost)}</td></tr>
                        <tr><td class="summary-label">Uban pang mga Gasto <em>(SEE TABLE D)</em></td><td>${exactCell(income.otherExpenses)}</td></tr>
                        <tr class="light-row"><td class="summary-label">Kinatibuk-an na gasto sa pag-operate <em>(table B+C+D)</em></td><td>${exactCell(income.totalOperatingCost)}</td></tr>
                        <tr><td class="summary-label">Kinatibuk-an na ginansya human sa gasto sa operasyon (Gross Profit)</td><td>${exactCell(income.grossProfit)}</td></tr>
                        <tr class="light-row"><td class="summary-label">Net profit</td><td>${exactCell(income.netProfit)}</td></tr>
                    `)}
                    <div class="section-title section-title--plain">g) Iskedyul o Plano sa Paggasto sa SEA-K Capital Fund (SCF)</div>
                    ${exactTable('scf-table', `
                        <tr><th><span class="th-main">Mga Gasto</span><span class="th-sub">(Mga kagamitan, materyales, etc.)</span></th><th><span class="th-main">Kantidad</span></th><th><span class="th-main">Iskedyul sa Paggamit</span></th></tr>
                    `, spending.map((row) => `
                        <tr>
                            <td>${exactCell(row.expense)}</td>
                            <td>${exactCell(row.amount)}</td>
                            <td>${exactCell(row.usageSchedule)}</td>
                        </tr>
                    `).join(''))}
                    <div class="recommendation-section">
                        <div class="recommendation-title"><span>V.</span><strong>REKOMENDASYON</strong></div>
                        <p class="recommendation-text">
                            Kini nagrekomenda nga punduhan ang maong <em>Mungkahing Proyekto</em> alang sa Micro Enterprise Development alang sa proyektong
                            ${editable
                                ? exactInlineInput('staff.recommendation.projectName', recommendation.projectName || project.projectTitle || '', 'w-project')
                                : exactInline(project.projectTitle, 'w-project')}
                            nga adunay kinatibuk-ang kantidad na Php
                            ${editable
                                ? exactInlineInput('staff.recommendation.recommendedAmount', recommendation.recommendedAmount || project.projectedAmount || '15,000.00', 'w-amount')
                                : exactInline(recommendation.recommendedAmount || project.projectedAmount || '15,000.00', 'w-amount')}
                            nga SEA-K Capital Fund CY 2024.
                        </p>
                        <table class="recommendation-signature-table">
                            <tbody>
                                <tr>
                                    <td class="recommendation-signature-table__role">GI-ANDAM NI</td>
                                    <td class="recommendation-signature-table__line">${renderExactSignatureLine(data.applicantSignature?.signedName, 'Pirma ibabaw sa pangalan sa Partisipante', data.applicantSignature?.signatureUpload)}</td>
                                    <td class="recommendation-signature-table__date">${exactDate(data.applicantSignature?.signedDate)}</td>
                                </tr>
                                <tr>
                                    <td class="recommendation-signature-table__role">GI ASSESSES<br>UG APRUBAHAN<br>NI</td>
                                    <td class="recommendation-signature-table__line">${editable
                                        ? renderExactSignatureEditor('staff.recommendation.approverName', recommendation.approverName || '', 'Pirma ibabaw sa pangalan sa CSWDO', 'recommendation.signatureUpload', recommendation.signatureUpload)
                                        : renderExactSignatureLine(recommendation.approverName, 'Pirma ibabaw sa pangalan sa CSWDO', recommendation.signatureUpload)}</td>
                                    <td class="recommendation-signature-table__date">${editable
                                        ? exactDateInput('staff.recommendation.approvedDate', recommendation.approvedDate || '')
                                        : exactDate(recommendation.approvedDate)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                `, { bodyClass: 'content content--page3' })}
            </div>
        `;
    }

    function exactRows(rows, fallback, limit) {
        const source = Array.isArray(rows) && rows.length ? rows : [fallback];
        return source.slice(0, limit);
    }

    function exactExpenseRows(rows) {
        const defaults = [
            'Renta sa himuanan sa produkto/opisina',
            'Kuryente',
            'Tubig',
            'Pamilite',
            'Permit sa pag-operate',
            'Lain pang mga gastohanan',
        ];
        const source = Array.isArray(rows) ? rows : [];
        return defaults.map((expenseName, index) => ({
            expenseName,
            paymentFrequency: source[index]?.paymentFrequency || '',
            projectedCost: source[index]?.projectedCost || '',
        }));
    }

    function renderExactMungkahingPage(pageNumber, content, options = {}) {
        const pageClass = ` page--page${pageNumber}`;
        const bodyClass = options.bodyClass || 'content';
        const titleBlock = options.showTitleBlock
            ? `<div class="title-wrap"><div class="title-main">MUNGKAHING PROYEKTO</div><div class="title-sub">Sustainable Market and Technology and Employment Assistance Program<br>(SMART LEAP)</div></div>`
            : '';

        return `
            <section class="paper-sheet paper-sheet--mungkahing page${pageClass}">
                <header class="top-strip top-strip--modern-gov">
                    <img src="${escapeAttribute(routeUrl('assets/img/report-header-2026.jpg'))}" alt="CSWDD header" class="top-strip__image">
                </header>
                ${titleBlock}
                <div class="${escapeAttribute(bodyClass)}">${content}</div>
                <div class="page-no">Page ${pageNumber} of 3</div>
                <footer class="footer footer--image-gov">
                    <img src="${escapeAttribute(routeUrl('assets/img/report-footer-2026.jpg'))}" alt="CSWDD footer" class="footer-image">
                </footer>
            </section>
        `;
    }

    function exactLineRow(label, value, widthClass = '') {
        return `
            <div class="line-row">
                <span>${escapeHtml(label)}</span>
                <span class="colon">:</span>
                <input class="field ${escapeAttribute(widthClass)}" type="text" value="${escapeAttribute(value || '')}" disabled>
            </div>
        `;
    }

    function exactTable(className, headHtml, bodyHtml, footHtml = '') {
        return `<div class="paper-table-wrap"><table class="${escapeAttribute(className)}"><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody>${footHtml ? `<tfoot>${footHtml}</tfoot>` : ''}</table></div>`;
    }

    function exactCell(value) {
        return `<input class="cell-input" type="text" value="${escapeAttribute(value || '')}" disabled>`;
    }

    function exactInline(value, widthClass = '') {
        return `<input class="inline-line ${escapeAttribute(widthClass)}" type="text" value="${escapeAttribute(value || '')}" disabled>`;
    }

    function exactInlineInput(name, value, widthClass = '') {
        return `<input class="inline-line ${escapeAttribute(widthClass)}" type="text" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}">`;
    }

    function exactDate(value) {
        return `<input class="recommendation-date__input" type="date" value="${escapeAttribute(value || '')}" disabled>`;
    }

    function exactDateInput(name, value) {
        const resolvedValue = resolveStaffFieldDefault(name, value || '', 'date');
        return `<input class="recommendation-date__input" type="date" name="${escapeAttribute(name)}" value="${escapeAttribute(resolvedValue)}" readonly aria-readonly="true">`;
    }

    function renderExactSignatureLine(name, label, metadata) {
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        return `
            <div class="recommendation-signature-line">
                ${fileUrl ? `<div class="recommendation-signature-line__pad"><img src="${escapeAttribute(fileUrl)}" alt="${escapeAttribute(label)}" class="signature-pad-trigger__preview"></div>` : ''}
                <input class="recommendation-signature-line__input" type="text" value="${escapeAttribute(name || '')}" disabled>
                <div class="recommendation-signature-line__label">${escapeHtml(label)}</div>
            </div>
        `;
    }

    function renderExactSignatureEditor(nameField, nameValue, label, fieldKey, metadata) {
        const resolvedValue = resolveStaffFieldDefault(nameField, nameValue || '');
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const fileName = metadata?.original_name || 'View uploaded file';
        const hint = renderAssignedPdoSignatureWarning(fieldKey, metadata);

        return `
            <div class="recommendation-signature-line">
                ${fileUrl ? `<div class="recommendation-signature-line__pad"><img src="${escapeAttribute(fileUrl)}" alt="${escapeAttribute(label)}" class="signature-pad-trigger__preview"></div>` : ''}
                <input class="recommendation-signature-line__input" type="text" name="${escapeAttribute(nameField)}" value="${escapeAttribute(resolvedValue)}" readonly aria-readonly="true">
                <div class="recommendation-signature-line__label">${escapeHtml(label)}</div>
                <div class="signature-upload-inline">
                    <label class="signature-launch">
                        <input type="file" data-upload-field="${escapeAttribute(fieldKey)}" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf">
                        ${fileUrl ? 'Replace signature' : 'Upload signature'}
                    </label>
                    ${fileUrl
                        ? `<a class="signature-file-link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">${escapeHtml(fileName)}</a>`
                        : '<span class="signature-status-text">Walay pirma nga na-upload.</span>'}
                    ${hint ? hint.replace('class="field-hint"', 'class="field-hint field-hint--staff"') : ''}
                </div>
            </div>
        `;
    }

    function renderExactMungkahingSectorMatrix(sectoral) {
        const columns = [['Babae', 'sexFemale'], ['Lalake', 'sexMale'], ['Babae', 'seniorFemale'], ['Lalake', 'seniorMale'], ['Babae', 'pwdFemale'], ['Lalake', 'pwdMale'], ['Babae', 'ipFemale'], ['Lalake', 'ipMale'], ['Babae', 'soloParentFemale'], ['Lalake', 'soloParentMale']];
        const pantawid = exactSectorGroup(sectoral, 'pantawid');
        const nonPantawid = exactSectorGroup(sectoral, 'non_pantawid');
        return exactTable('sectoral-table', `
            <tr><th rowspan="2" style="width: 16%;">Paglain-lain</th><th colspan="2" style="width: 18%;">Sex</th><th colspan="8">SECTORAL</th></tr>
            <tr><th>Babae</th><th>Lalake</th><th colspan="2">Senior Citizens</th><th colspan="2">PWD</th><th colspan="2">IP</th><th colspan="2">Solo Parent</th></tr>
            <tr><th></th>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>
        `, `
            ${renderExactSectorRow('Pantawid', pantawid, columns)}
            ${renderExactSectorRow('Non-Pantawid', nonPantawid, columns)}
        `);
    }

    function exactSectorGroup(sectoral, membershipType) {
        const rawKey = membershipType === 'pantawid' ? 'pantawid' : 'nonPantawid';
        if (sectoral && typeof sectoral[rawKey] === 'object' && sectoral[rawKey] !== null) {
            return sectoral[rawKey];
        }
        const selected = String(sectoral?.membershipType || '') === membershipType;
        const female = String(sectoral?.sex || '') === 'female';
        const male = String(sectoral?.sex || '') === 'male';
        return {
            sexFemale: selected && female,
            sexMale: selected && male,
            seniorFemale: selected && female && Boolean(sectoral?.seniorCitizen),
            seniorMale: selected && male && Boolean(sectoral?.seniorCitizen),
            pwdFemale: selected && female && Boolean(sectoral?.pwd),
            pwdMale: selected && male && Boolean(sectoral?.pwd),
            ipFemale: selected && female && Boolean(sectoral?.ip),
            ipMale: selected && male && Boolean(sectoral?.ip),
            soloParentFemale: selected && female && Boolean(sectoral?.soloParent),
            soloParentMale: selected && male && Boolean(sectoral?.soloParent),
        };
    }

    function renderExactSectorRow(label, values, columns) {
        return `<tr><td><strong>${escapeHtml(label)}</strong></td>${columns.map(([, key]) => `<td class="paper-table__choice"><input class="sectoral-table__checkbox" type="checkbox" ${isExactChecked(values?.[key]) ? 'checked' : ''} disabled></td>`).join('')}</tr>`;
    }

    function isExactChecked(value) {
        if (typeof value === 'boolean') {
            return value;
        }
        const normalized = String(value ?? '').trim().toLowerCase();
        if (['true', 'yes', 'on', 'checked'].includes(normalized)) {
            return true;
        }
        const numeric = Number(normalized);
        return Number.isFinite(numeric) && numeric > 0;
    }

    function renderApplicantBusinessPlanLegacy(payload) {
        const overview = payload.overview || {};
        const products = payload.productsServices?.rows || [];
        const market = payload.marketStrategy || {};
        const operations = payload.operationsPlan || {};
        const financial = payload.financialPlan || {};
        const risks = payload.riskManagement || {};
        const scheduleRows = payload.implementationSchedule?.rows || [];
        const approval = payload.staffReview?.approval || {};

        return `
            <div class="review-bp-document">
                ${renderReviewBusinessPlanPage(1, `
                    <header class="review-bp-titlepage">
                        <h2>BUSINESS PLAN</h2>
                        <div class="review-bp-titlepage__subhead">EXECUTIVE SUMMARY (BUSINESS DESCRIPTION)</div>
                    </header>
                    ${renderReviewBusinessPlanPrompt('1.', 'Brief Description of the Business/Project', 'Brief Description of the Project (What is the nature of the project?)', `
                        ${renderReviewBusinessPlanLineField('Business / project name', overview.businessName, 'review-bp-line--long')}
                        ${renderReviewBusinessPlanNarrative(payload.executiveSummary || '', 'review-bp-narrative--tall')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.', 'Brief Profile of the Entrepreneur', 'Brief Profile of the Entrepreneur (What are the entrepreneur’s skills and qualifications?)', `
                        <div class="review-bp-meta-grid">
                            ${renderReviewBusinessPlanLineField('Name of entrepreneur', overview.ownerName)}
                            ${renderReviewBusinessPlanLineField('Contact number', overview.contactNumber)}
                            ${renderReviewBusinessPlanLineField('Business address', overview.businessAddress, 'review-bp-line--long review-bp-line--span2')}
                        </div>
                        ${renderReviewBusinessPlanNarrative(overview.businessGoal || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('3.', 'Contributions of the Project to the Economy', 'Contributions of the Project to the Economy (What are the contributions of the project to the local and national economy?)', `
                        ${renderReviewBusinessPlanNarrative(risks.mitigation || '', 'review-bp-narrative--medium')}
                    `)}
                    <div class="review-bp-section-heading">Part 1: Marketing Plan</div>
                    ${renderReviewBusinessPlanPrompt('1.1', 'Description of the Product', 'Description of the Product (What is the product?)', `
                        ${renderReviewPaperTable(`
                            <tr><th style="width:24%">Name</th><th style="width:38%">Description</th><th style="width:14%">Selling price</th><th style="width:24%">Target market</th></tr>
                        `, products.length
                            ? products.map((row) => `
                                <tr>
                                    <td>${escapeHtml(row.name || '--')}</td>
                                    <td>${escapeHtml(row.description || '--')}</td>
                                    <td>${escapeHtml(row.price || '--')}</td>
                                    <td>${escapeHtml(row.targetMarket || '--')}</td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="4">No product or service row submitted.</td></tr>')}
                    `, 'review-bp-prompt--table')}
                `)}
                ${renderReviewBusinessPlanPage(2, `
                    ${renderReviewBusinessPlanPrompt('1.2', 'Comparison of the Product with its Competitors', 'Comparison of the Product with its Competitors (How does it compare in quality and price with its competitors?)', `
                        ${renderReviewBusinessPlanNarrative(market.competitors || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.3', 'Location', 'Location (Where will the business be located?)', `
                        ${renderReviewBusinessPlanNarrative(operations.businessLocation || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.4', 'Market Area', 'Market Area (What geographic areas will the project cover?)', `
                        ${renderReviewBusinessPlanNarrative(market.salesChannel || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.5', 'Primary Customers', 'Primary Customers (Within the market area, to whom will the business sell its products?)', `
                        ${renderReviewBusinessPlanNarrative(market.customerProfile || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.6', 'Total Demand', 'Total Demand (Can it be estimated how much of the product is currently being sold?)', `
                        ${renderReviewBusinessPlanNarrative(financial.monthlySalesProjection || '', 'review-bp-narrative--compact')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.7', 'Selling Price', 'Selling Price (What is the selling price of the product?)', `
                        ${renderReviewBusinessPlanNarrative(financial.projectedNetIncome || '', 'review-bp-narrative--compact')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(3, `
                    ${renderReviewBusinessPlanPrompt('1.8', 'Promotional Measures', 'Promotional Measures (What promotional measures will be used in selling the product?)', `
                        ${renderReviewBusinessPlanNarrative(market.marketingApproach || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.9', 'Marketing Strategy', 'Marketing Strategy (What marketing strategy is needed to ensure that the sales forecasts are achieved?)', `
                        ${renderReviewBusinessPlanNarrative(market.salesChannel || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.10', 'Marketing Budget', 'Marketing Budget (How much do you need to promote and distribute your product?)', `
                        ${renderReviewBusinessPlanNarrative(financial.monthlyExpenseProjection || '', 'review-bp-narrative--compact')}
                    `)}
                    <div class="review-bp-section-heading">Part 2: Production Plan</div>
                    ${renderReviewBusinessPlanPrompt('2.1', 'Production / Service Process', 'Production / Service Process (What is the production or service process?)', `
                        ${renderReviewBusinessPlanNarrative(operations.productionProcess || '', 'review-bp-narrative--medium')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(4, `
                    ${renderReviewBusinessPlanPrompt('2.2', 'Fixed Capital', 'What buildings and machinery (fixed assets) are needed and what are their costs?', `
                        ${renderReviewBusinessPlanNarrative(operations.equipmentNeeded || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.3', 'Life of Fixed Capital', 'Life of Fixed Capital (What is the useful life of the building and machinery?)', `
                        ${renderReviewBusinessPlanNarrative(financial.breakEvenNotes || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.4', 'Sources of Equipment', 'Sources of Equipment (When and where will the machinery be obtained?)', `
                        ${renderReviewBusinessPlanNarrative(operations.equipmentNeeded || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.5', 'Planned Capacity', 'Planned Capacity (How much capacity will be used?)', `
                        ${renderReviewBusinessPlanNarrative(financial.breakEvenNotes || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.6', 'Future Capacity', 'Future Capacity (What are the plans for using extra capacity?)', `
                        ${renderReviewBusinessPlanNarrative(financial.breakEvenNotes || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.7', 'Raw Materials', 'How many raw materials are needed?', `
                        ${renderReviewBusinessPlanNarrative(operations.productionProcess || '', 'review-bp-narrative--compact')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(5, `
                    ${renderReviewBusinessPlanPrompt('2.8', 'Cost of Raw Materials', 'Cost of Raw Materials (What is the cost of the raw materials?)', `
                        ${renderReviewBusinessPlanNarrative(financial.projectedNetIncome || '', 'review-bp-narrative--compact')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.9', 'Availability of Raw Materials', 'Availability of Raw Materials (What are the sources of raw materials? Are they available the whole year?)', `
                        ${renderReviewBusinessPlanNarrative(risks.risks || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.10', 'Labor', 'Labor (How many direct and indirect jobs are required and what skills are needed?)', `
                        ${renderReviewBusinessPlanNarrative(operations.staffingPlan || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.11', 'Cost of Labor', 'Cost of Labor (What is the cost of labor?)', `
                        ${renderReviewBusinessPlanNarrative(financial.monthlyExpenseProjection || '', 'review-bp-narrative--compact')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.12', 'Availability of Labor', 'Availability of Labor (Are the workers available the whole year? If not, what is the effect on production?)', `
                        ${renderReviewBusinessPlanNarrative(operations.staffingPlan || '', 'review-bp-narrative--short')}
                    `)}
                    <div class="review-bp-section-heading">Part 3: Organization and Management Plan</div>
                    ${renderReviewBusinessPlanPrompt('3.1', 'Pre-operating Activities', 'Pre-operating Activities (What pre-operating activities need to be done before the business starts operating?)', `
                        ${renderReviewPaperTable(`
                            <tr><th style="width:40%">Activity</th><th style="width:28%">Target Date</th><th style="width:32%">Responsible Person</th></tr>
                        `, scheduleRows.length
                            ? scheduleRows.map((row) => `
                                <tr>
                                    <td>${escapeHtml(row.activity || '--')}</td>
                                    <td>${escapeHtml(row.targetDate || '--')}</td>
                                    <td>${escapeHtml(row.responsiblePerson || '--')}</td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="3">No implementation schedule row submitted.</td></tr>')}
                    `, 'review-bp-prompt--table')}
                `)}
                ${renderReviewBusinessPlanPage(6, `
                    ${renderReviewBusinessPlanPrompt('3.2', 'Pre-operating Costs', 'Pre-operating Costs (What expenses will be incurred before operations begin?)', `
                        ${renderReviewBusinessPlanNarrative(financial.monthlyExpenseProjection || '', 'review-bp-narrative--short')}
                    `)}
                    <div class="review-bp-section-heading">Part 4: Financial Plan</div>
                    ${renderReviewBusinessPlanPrompt('4.1', 'Project Cost', 'Project Cost (What is the total capital requirement?)', `
                        ${renderReviewBusinessPlanNarrative(financial.startupCapital || '', 'review-bp-narrative--short')}
                    `)}
                    <section class="review-bp-signoff">
                        <div class="review-bp-signoff__row">
                            <div class="review-bp-signoff__label">Giandam ni:</div>
                            <div class="review-bp-signoff__body">
                                <div class="review-bp-signline">${escapeHtml(payload.applicantSignature?.signedName || '--')}</div>
                                <div class="review-bp-signcaption">(Name sa Benes)</div>
                                <div class="review-bp-signmeta">Petsa sa pirma: ${escapeHtml(payload.applicantSignature?.signedDate || '--')}</div>
                                ${renderReviewBusinessPlanFileSlot('Pirma sa aplikante', payload.applicantSignature?.signatureUpload, 'Walay pirma nga na-upload.')}
                            </div>
                        </div>
                        <div class="review-bp-signoff__row">
                            <div class="review-bp-signoff__label">Gisusi ni:</div>
                            <div class="review-bp-signoff__body">
                                <div class="review-bp-signline">${escapeHtml(approval.approverName || '--')}</div>
                                <div class="review-bp-signcaption">(Kamo)</div>
                                ${renderReviewBusinessPlanFileSlot('Pirma sa reviewer', approval.signatureUpload, 'Alang sa upload sa reviewer side.')}
                            </div>
                        </div>
                        <div class="review-bp-signoff__row">
                            <div class="review-bp-signoff__label">Namatikdan ni:</div>
                            <div class="review-bp-signoff__body review-bp-signoff__body--noted">
                                <div class="review-bp-noted-fixed">GOLDA V. POCON, RSW, MSSW, CESE<br>CGHD-II/CSWDO</div>
                                ${renderReviewBusinessPlanFileSlot('Pirma sa Noted by', approval.signatureUpload, 'Alang sa upload sa post-approval review.')}
                                ${approval.reviewSummary ? `<div class="review-bp-note"><strong>Sumaryo sa review:</strong> ${escapeHtml(approval.reviewSummary)}</div>` : ''}
                                ${approval.recommendedAction ? `<div class="review-bp-note"><strong>Girekomendang aksyon:</strong> ${escapeHtml(approval.recommendedAction)}</div>` : ''}
                            </div>
                        </div>
                    </section>
                `)}
            </div>
        `;
    }

    function renderApplicantBusinessPlan(payload) {
        const data = payload || {};
        const approval = data.staffReview?.approval || {};
        const legacyProducts = Array.isArray(data.productsServices?.rows)
            ? data.productsServices.rows
                .map((row) => [row?.name, row?.description, row?.price, row?.targetMarket].filter((part) => String(part || '').trim() !== '').join(' | '))
                .filter((row) => row !== '')
                .join('\n')
            : '';
        const legacySchedule = Array.isArray(data.implementationSchedule?.rows)
            ? data.implementationSchedule.rows
                .map((row) => [row?.activity, row?.targetDate, row?.responsiblePerson].filter((part) => String(part || '').trim() !== '').join(' | '))
                .filter((row) => row !== '')
                .join('\n')
            : '';
        const executiveSummary = {
            briefDescriptionOfBusinessProject: data.executiveSummary?.briefDescriptionOfBusinessProject || (typeof data.executiveSummary === 'string' ? data.executiveSummary : ''),
            briefProfileOfEntrepreneur: data.executiveSummary?.briefProfileOfEntrepreneur || data.overview?.businessGoal || '',
            projectContributionsToEconomy: data.executiveSummary?.projectContributionsToEconomy || data.riskManagement?.mitigation || '',
        };
        const marketingPlan = {
            descriptionOfProduct: data.marketingPlan?.descriptionOfProduct || legacyProducts,
            comparisonWithCompetitors: data.marketingPlan?.comparisonWithCompetitors || data.marketStrategy?.competitors || '',
            location: data.marketingPlan?.location || data.operationsPlan?.businessLocation || '',
            marketArea: data.marketingPlan?.marketArea || data.marketStrategy?.salesChannel || '',
            mainCustomers: data.marketingPlan?.mainCustomers || data.marketStrategy?.customerProfile || '',
            totalDemand: data.marketingPlan?.totalDemand || data.financialPlan?.monthlySalesProjection || '',
            sellingPrice: data.marketingPlan?.sellingPrice || data.financialPlan?.projectedNetIncome || '',
            promotionalMeasures: data.marketingPlan?.promotionalMeasures || data.marketStrategy?.marketingApproach || '',
            marketingStrategy: data.marketingPlan?.marketingStrategy || data.marketStrategy?.salesChannel || '',
            marketingBudget: data.marketingPlan?.marketingBudget || data.financialPlan?.monthlyExpenseProjection || '',
        };
        const productionPlan = {
            productionServiceProcess: data.productionPlan?.productionServiceProcess || data.operationsPlan?.productionProcess || '',
            fixedCapital: data.productionPlan?.fixedCapital || data.operationsPlan?.equipmentNeeded || '',
            lifeOfFixedCapital: data.productionPlan?.lifeOfFixedCapital || data.financialPlan?.breakEvenNotes || '',
            sourcesOfEquipment: data.productionPlan?.sourcesOfEquipment || data.operationsPlan?.equipmentNeeded || '',
            plannedCapacity: data.productionPlan?.plannedCapacity || data.financialPlan?.breakEvenNotes || '',
            futureCapacity: data.productionPlan?.futureCapacity || data.financialPlan?.breakEvenNotes || '',
            rawMaterials: data.productionPlan?.rawMaterials || data.operationsPlan?.productionProcess || '',
            costOfRawMaterials: data.productionPlan?.costOfRawMaterials || data.financialPlan?.projectedNetIncome || '',
            rawMaterialsAvailability: data.productionPlan?.rawMaterialsAvailability || data.riskManagement?.risks || '',
            labor: data.productionPlan?.labor || data.operationsPlan?.staffingPlan || '',
            costOfLabor: data.productionPlan?.costOfLabor || data.financialPlan?.monthlyExpenseProjection || '',
            laborAvailability: data.productionPlan?.laborAvailability || data.operationsPlan?.staffingPlan || '',
        };
        const managementPlan = {
            preOperatingActivities: data.organizationAndManagementPlan?.preOperatingActivities || legacySchedule,
            preOperatingExpenses: data.organizationAndManagementPlan?.preOperatingExpenses || data.financialPlan?.monthlyExpenseProjection || '',
        };
        const financialPlan = {
            projectCost: data.financialPlan?.projectCost || data.financialPlan?.startupCapital || '',
        };

        return `
            <div class="review-bp-document">
                ${renderReviewBusinessPlanPage(1, `
                    <header class="review-bp-titlepage">
                        <h2>BUSINESS PLAN</h2>
                        <div class="review-bp-titlepage__subhead">EXECUTIVE SUMMARY (PAGLALARAWAN NG NEGOSYO)</div>
                    </header>
                    ${renderReviewBusinessPlanPrompt('1.', 'Brief Description of the Business/Project', '', `
                        ${renderReviewBusinessPlanNarrative(executiveSummary.briefDescriptionOfBusinessProject || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.', 'Brief Profile of an Entrepreneur', '', `
                        ${renderReviewBusinessPlanNarrative(executiveSummary.briefProfileOfEntrepreneur || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('3.', 'Project’s Contributions to the Economy', '', `
                        ${renderReviewBusinessPlanNarrative(executiveSummary.projectContributionsToEconomy || '', 'review-bp-narrative--medium')}
                    `)}
                    <div class="review-bp-section-heading">Section 1: MARKETING PLAN</div>
                    ${renderReviewBusinessPlanPrompt('1.1', 'Description of the Product', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.descriptionOfProduct || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.2', 'Comparison of the Product with Its Competitors', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.comparisonWithCompetitors || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.3', 'Location', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.location || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.4', 'Market Area', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.marketArea || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.5', 'Main Customers', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.mainCustomers || '', 'review-bp-narrative--short')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(2, `
                    <div class="review-bp-section-heading">Section 1: MARKETING PLAN</div>
                    ${renderReviewBusinessPlanPrompt('1.6', 'Total Demand', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.totalDemand || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.7', 'Selling Price', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.sellingPrice || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.8', 'Promotional Measures', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.promotionalMeasures || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.9', 'Marketing Strategy', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.marketingStrategy || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.10', 'Marketing Budget', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.marketingBudget || '', 'review-bp-narrative--short')}
                    `)}
                    <div class="review-bp-section-heading">Section 2: PRODUCTION PLAN</div>
                    ${renderReviewBusinessPlanPrompt('2.1', 'Production/Service Process', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.productionServiceProcess || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.2', 'Fixed Capital', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.fixedCapital || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.3', 'Life of Fixed Capital', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.lifeOfFixedCapital || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.4', 'Sources of Equipment', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.sourcesOfEquipment || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.5', 'Planned Capacity', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.plannedCapacity || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.6', 'Future Capacity', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.futureCapacity || '', 'review-bp-narrative--short')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(3, `
                    <div class="review-bp-section-heading">Section 2: PRODUCTION PLAN</div>
                    ${renderReviewBusinessPlanPrompt('2.7', 'Raw Materials', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.rawMaterials || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.8', 'Cost of Raw Materials', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.costOfRawMaterials || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.9', 'Raw Materials Availability', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.rawMaterialsAvailability || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.10', 'Labor', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.labor || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.11', 'Cost of Labor', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.costOfLabor || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.12', 'Labor Availability', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.laborAvailability || '', 'review-bp-narrative--short')}
                    `)}
                    <div class="review-bp-section-heading">Section 3: ORGANIZATION AND MANAGEMENT PLAN</div>
                    ${renderReviewBusinessPlanPrompt('3.1', 'Pre Operating Activities', '', `
                        ${renderReviewBusinessPlanNarrative(managementPlan.preOperatingActivities || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('3.2', 'Pre Operating Expenses', '', `
                        ${renderReviewBusinessPlanNarrative(managementPlan.preOperatingExpenses || '', 'review-bp-narrative--short')}
                    `)}
                    <div class="review-bp-section-heading">Section 4: FINANCIAL PLAN</div>
                    ${renderReviewBusinessPlanPrompt('4.1', 'Project Cost', '', `
                        ${renderReviewBusinessPlanNarrative(financialPlan.projectCost || '', 'review-bp-narrative--short')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(4, `
                    <section class="review-bp-signoff">
                        <div class="review-bp-signoff__row">
                            <div class="review-bp-signoff__label">Prepared by:</div>
                            <div class="review-bp-signoff__body">
                                <div class="review-bp-signline">${escapeHtml(data.applicantSignature?.signedName || '--')}</div>
                                <div class="review-bp-signcaption">(Name sa Benes)</div>
                                <div class="review-bp-signmeta">Petsa sa pirma: ${escapeHtml(data.applicantSignature?.signedDate || '--')}</div>
                                ${renderReviewBusinessPlanFileSlot('Pirma sa aplikante', data.applicantSignature?.signatureUpload, 'Walay pirma nga na-upload.')}
                            </div>
                        </div>
                        <div class="review-bp-signoff__row">
                            <div class="review-bp-signoff__label">Reviewed by:</div>
                            <div class="review-bp-signoff__body">
                                <div class="review-bp-signline">${escapeHtml(approval.approverName || '--')}</div>
                                ${renderReviewBusinessPlanFileSlot('Pirma sa reviewer', approval.signatureUpload, 'Alang sa upload sa reviewer side.')}
                            </div>
                        </div>
                        <div class="review-bp-signoff__row">
                            <div class="review-bp-signoff__label">Noted by:</div>
                            <div class="review-bp-signoff__body review-bp-signoff__body--noted">
                                <div class="review-bp-noted-fixed">GOLDA V. POCON, RSW, MSSW, CESE<br>CGHD-II/CSWDO</div>
                                ${approval.recommendedAction ? `<div class="review-bp-note"><strong>Girekomendang aksyon:</strong> ${escapeHtml(approval.recommendedAction)}</div>` : ''}
                            </div>
                        </div>
                    </section>
                `)}
            </div>
        `;
    }

    function renderReviewerBusinessPlan(payload) {
        const data = payload || {};
        const approval = data.staffReview?.approval || {};
        const legacyProducts = Array.isArray(data.productsServices?.rows)
            ? data.productsServices.rows
                .map((row) => [row?.name, row?.description, row?.price, row?.targetMarket].filter((part) => String(part || '').trim() !== '').join(' | '))
                .filter((row) => row !== '')
                .join('\n')
            : '';
        const legacySchedule = Array.isArray(data.implementationSchedule?.rows)
            ? data.implementationSchedule.rows
                .map((row) => [row?.activity, row?.targetDate, row?.responsiblePerson].filter((part) => String(part || '').trim() !== '').join(' | '))
                .filter((row) => row !== '')
                .join('\n')
            : '';
        const executiveSummary = {
            briefDescriptionOfBusinessProject: data.executiveSummary?.briefDescriptionOfBusinessProject || (typeof data.executiveSummary === 'string' ? data.executiveSummary : ''),
            briefProfileOfEntrepreneur: data.executiveSummary?.briefProfileOfEntrepreneur || data.overview?.businessGoal || '',
            projectContributionsToEconomy: data.executiveSummary?.projectContributionsToEconomy || data.riskManagement?.mitigation || '',
        };
        const marketingPlan = {
            descriptionOfProduct: data.marketingPlan?.descriptionOfProduct || legacyProducts,
            comparisonWithCompetitors: data.marketingPlan?.comparisonWithCompetitors || data.marketStrategy?.competitors || '',
            location: data.marketingPlan?.location || data.operationsPlan?.businessLocation || '',
            marketArea: data.marketingPlan?.marketArea || data.marketStrategy?.salesChannel || '',
            mainCustomers: data.marketingPlan?.mainCustomers || data.marketStrategy?.customerProfile || '',
            totalDemand: data.marketingPlan?.totalDemand || data.financialPlan?.monthlySalesProjection || '',
            sellingPrice: data.marketingPlan?.sellingPrice || data.financialPlan?.projectedNetIncome || '',
            promotionalMeasures: data.marketingPlan?.promotionalMeasures || data.marketStrategy?.marketingApproach || '',
            marketingStrategy: data.marketingPlan?.marketingStrategy || data.marketStrategy?.salesChannel || '',
            marketingBudget: data.marketingPlan?.marketingBudget || data.financialPlan?.monthlyExpenseProjection || '',
        };
        const productionPlan = {
            productionServiceProcess: data.productionPlan?.productionServiceProcess || data.operationsPlan?.productionProcess || '',
            fixedCapital: data.productionPlan?.fixedCapital || data.operationsPlan?.equipmentNeeded || '',
            lifeOfFixedCapital: data.productionPlan?.lifeOfFixedCapital || data.financialPlan?.breakEvenNotes || '',
            sourcesOfEquipment: data.productionPlan?.sourcesOfEquipment || data.operationsPlan?.equipmentNeeded || '',
            plannedCapacity: data.productionPlan?.plannedCapacity || data.financialPlan?.breakEvenNotes || '',
            futureCapacity: data.productionPlan?.futureCapacity || data.financialPlan?.breakEvenNotes || '',
            rawMaterials: data.productionPlan?.rawMaterials || data.operationsPlan?.productionProcess || '',
            costOfRawMaterials: data.productionPlan?.costOfRawMaterials || data.financialPlan?.projectedNetIncome || '',
            rawMaterialsAvailability: data.productionPlan?.rawMaterialsAvailability || data.riskManagement?.risks || '',
            labor: data.productionPlan?.labor || data.operationsPlan?.staffingPlan || '',
            costOfLabor: data.productionPlan?.costOfLabor || data.financialPlan?.monthlyExpenseProjection || '',
            laborAvailability: data.productionPlan?.laborAvailability || data.operationsPlan?.staffingPlan || '',
        };
        const managementPlan = {
            preOperatingActivities: data.organizationAndManagementPlan?.preOperatingActivities || legacySchedule,
            preOperatingExpenses: data.organizationAndManagementPlan?.preOperatingExpenses || data.financialPlan?.monthlyExpenseProjection || '',
        };
        const financialPlan = {
            projectCost: data.financialPlan?.projectCost || data.financialPlan?.startupCapital || '',
        };

        return `
            <div class="review-bp-document">
                ${renderReviewBusinessPlanPage(1, `
                    <header class="review-bp-titlepage">
                        <h2>BUSINESS PLAN</h2>
                        <div class="review-bp-titlepage__subhead">EXECUTIVE SUMMARY (PAGLALARAWAN NG NEGOSYO)</div>
                    </header>
                    ${renderReviewBusinessPlanPrompt('1.', 'Brief Description of the Business/Project', '', `
                        ${renderReviewBusinessPlanNarrative(executiveSummary.briefDescriptionOfBusinessProject || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.', 'Brief Profile of an Entrepreneur', '', `
                        ${renderReviewBusinessPlanNarrative(executiveSummary.briefProfileOfEntrepreneur || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('3.', "Project's Contributions to the Economy", '', `
                        ${renderReviewBusinessPlanNarrative(executiveSummary.projectContributionsToEconomy || '', 'review-bp-narrative--medium')}
                    `)}
                    <div class="review-bp-section-heading">Section 1: MARKETING PLAN</div>
                    ${renderReviewBusinessPlanPrompt('1.1', 'Description of the Product', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.descriptionOfProduct || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.2', 'Comparison of the Product with Its Competitors', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.comparisonWithCompetitors || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.3', 'Location', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.location || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.4', 'Market Area', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.marketArea || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.5', 'Main Customers', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.mainCustomers || '', 'review-bp-narrative--short')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(2, `
                    <div class="review-bp-section-heading">Section 1: MARKETING PLAN</div>
                    ${renderReviewBusinessPlanPrompt('1.6', 'Total Demand', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.totalDemand || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.7', 'Selling Price', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.sellingPrice || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.8', 'Promotional Measures', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.promotionalMeasures || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.9', 'Marketing Strategy', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.marketingStrategy || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('1.10', 'Marketing Budget', '', `
                        ${renderReviewBusinessPlanNarrative(marketingPlan.marketingBudget || '', 'review-bp-narrative--short')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(3, `
                    <div class="review-bp-section-heading">Section 2: PRODUCTION PLAN</div>
                    ${renderReviewBusinessPlanPrompt('2.1', 'Production/Service Process', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.productionServiceProcess || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.2', 'Fixed Capital', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.fixedCapital || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.3', 'Life of Fixed Capital', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.lifeOfFixedCapital || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.4', 'Sources of Equipment', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.sourcesOfEquipment || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.5', 'Planned Capacity', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.plannedCapacity || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.6', 'Future Capacity', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.futureCapacity || '', 'review-bp-narrative--short')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(4, `
                    <div class="review-bp-section-heading">Section 2: PRODUCTION PLAN</div>
                    ${renderReviewBusinessPlanPrompt('2.7', 'Raw Materials', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.rawMaterials || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.8', 'Cost of Raw Materials', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.costOfRawMaterials || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.9', 'Raw Materials Availability', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.rawMaterialsAvailability || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.10', 'Labor', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.labor || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.11', 'Cost of Labor', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.costOfLabor || '', 'review-bp-narrative--short')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('2.12', 'Labor Availability', '', `
                        ${renderReviewBusinessPlanNarrative(productionPlan.laborAvailability || '', 'review-bp-narrative--short')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(5, `
                    <div class="review-bp-section-heading">Section 3: ORGANIZATION AND MANAGEMENT PLAN</div>
                    ${renderReviewBusinessPlanPrompt('3.1', 'Pre Operating Activities', '', `
                        ${renderReviewBusinessPlanNarrative(managementPlan.preOperatingActivities || '', 'review-bp-narrative--medium')}
                    `)}
                    ${renderReviewBusinessPlanPrompt('3.2', 'Pre Operating Expenses', '', `
                        ${renderReviewBusinessPlanNarrative(managementPlan.preOperatingExpenses || '', 'review-bp-narrative--short')}
                    `)}
                    <div class="review-bp-section-heading">Section 4: FINANCIAL PLAN</div>
                    ${renderReviewBusinessPlanPrompt('4.1', 'Project Cost', '', `
                        ${renderReviewBusinessPlanNarrative(financialPlan.projectCost || '', 'review-bp-narrative--short')}
                    `)}
                `)}
                ${renderReviewBusinessPlanPage(6, `
                    <section class="review-bp-signoff">
                        <div class="review-bp-signoff__row">
                            <div class="review-bp-signoff__label">Giandam ni:</div>
                            <div class="review-bp-signoff__body">
                                <div class="review-bp-signline">${escapeHtml(data.applicantSignature?.signedName || '--')}</div>
                                <div class="review-bp-signcaption">(Name sa Benes)</div>
                                <div class="review-bp-signmeta">Petsa sa pirma: ${escapeHtml(data.applicantSignature?.signedDate || '--')}</div>
                                ${renderReviewBusinessPlanFileSlot('Pirma sa aplikante', data.applicantSignature?.signatureUpload, 'Walay pirma nga na-upload.')}
                            </div>
                        </div>
                        <div class="review-bp-signoff__row">
                            <div class="review-bp-signoff__label">Gisusi ni:</div>
                            <div class="review-bp-signoff__body">
                                ${renderReviewBusinessPlanSignatureEditor(approval)}
                                ${renderReviewBusinessPlanEditorField('Review summary', 'staff.approval.reviewSummary', approval.reviewSummary || '', 3)}
                                ${renderReviewBusinessPlanEditorField('Recommended action', 'staff.approval.recommendedAction', approval.recommendedAction || '', 2)}
                            </div>
                        </div>
                        <div class="review-bp-signoff__row">
                            <div class="review-bp-signoff__label">Namatikdan ni:</div>
                            <div class="review-bp-signoff__body review-bp-signoff__body--noted">
                                <div class="review-bp-noted-fixed">GOLDA V. POCON, RSW, MSSW, CESE<br>CGHD-II/CSWDO</div>
                            </div>
                        </div>
                    </section>
                `)}
            </div>
        `;
    }

    function renderApplicantBuhatSaPagpanumpa(payload) {
        const beneficiary = payload.beneficiary || {};
        const project = {
            programStatement: payload.project?.programStatement || 'Sustainable Market and Technology Driven Livelihood and Employment Program',
            programShortName: payload.project?.programShortName || payload.project?.programName || 'SMART LEAP',
            amountInWords: payload.project?.amountInWords || 'Fifteen Thousand Pesos',
            amountNumeric: payload.project?.amountNumeric || (payload.project?.amountReceived ? `Php ${payload.project.amountReceived}` : 'Php 15,000.00'),
        };
        const coMaker = payload.coMaker || {};
        const agreement = payload.agreement || {};
        const currentDateWords = agreement.currentDateWords || formatMonthDayWords(agreement.dateSigned);
        const applicantSignature = payload.applicantSignature || {};
        const coMakerSignature = payload.coMakerSignature || {};

        return `
            <div class="review-buhat-document">
                <section class="review-buhat-page">
                    <header class="review-buhat__header">
                        <div class="review-buhat__top">
                            <img src="${escapeAttribute(reviewBuhatAssetUrl('city-of-butuan-logo.png'))}" alt="City of Butuan Official Seal" class="review-buhat__logo review-buhat__logo--left">
                            <div class="review-buhat__copy">
                                <div class="small">Republic of the Philippines</div>
                                <div class="big">CITY GOVERNMENT OF BUTUAN</div>
                                <div class="dept">City Social Welfare and Development Department</div>
                                <div class="addr">J.P. Rosales Ave., Tandang Sora, Butuan City</div>
                                <div class="bar"></div>
                            </div>
                            <img src="${escapeAttribute(reviewBuhatAssetUrl('dswd-logo.png'))}" alt="CSWDD Logo" class="review-buhat__logo review-buhat__logo--right">
                        </div>
                        <div class="review-buhat__title">BUHAT SA PAGPANUMPA</div>
                    </header>

                    <div class="review-buhat__body">
                        <p class="review-buhat__paragraph">
                            Ako si
                            ${renderReviewBuhatInline(beneficiary.fullName, 'xl')}
                            <span class="review-buhat__literal">naa sa saktong edad, Pilipino, ug nagpuyo sa</span>
                            ${renderReviewBuhatInline(beneficiary.addressLine, 'lg')}
                            <span class="review-buhat__literal">,</span>
                            ${renderReviewBuhatInline(beneficiary.barangay, 'md')}
                            <span class="review-buhat__literal">,</span>
                            ${renderReviewBuhatInline(beneficiary.city, 'md')}
                            <span class="review-buhat__literal">pagkahuman ug panumpa sumala sa balaod, misaysay sa pagtuman niining mga sumusunod:</span>
                        </p>

                        <ol class="review-buhat__clauses">
                            <li>
                                Ako usa ka benepisyaryo sa
                                ${renderReviewBuhatInline(project.programStatement, 'lg')};
                            </li>
                            <li>
                                Tungod sa
                                ${renderReviewBuhatInline(project.programShortName, 'md')},
                                <span class="review-buhat__literal">ako makadawat ug kantidad nga</span>
                                ${renderReviewBuhatInline(project.amountInWords, 'md')}
                                <span class="review-buhat__literal">(</span>
                                ${renderReviewBuhatInline(project.amountNumeric, 'sm')}
                                <span class="review-buhat__literal">)</span>
                                ug ako kining gamiton sa saktong katuyuan base sa mga dokumento nga akong gisumitar didto sa ahensya;
                            </li>
                            <li>Nga ako andam mo sumite o mohatag sa CSWDD sa mga resibo (Official Receipt or Acknowledgement Receipt) sa akong tanan napalit nga gamit o kahimanan, produkto usa ka semana human nako madawat ang Livelihood Assistance.</li>
                            <li>Nga ang mga resibo sa akong mga pinalit nga akong isumiti o ihatag sa CSWDD kinahanglan hinlo og walay pinapaan.</li>
                            <li>Nga ako usab nag saad nga moatubang kanunay sa LTWG, Monitoring Team sa CSWDD og uban pang mga grupo sa gobyerno sa panahon nga sila mag pahigayon og monitoring o mangumusta kanako kabahin sa akong Negosyo.</li>
                            <li>Nga ako nag saad sa angay o hustong pagdumala sa akong panginabuhian nga gihatag kanako sa CSWDD.</li>
                            <li>
                                Nga kung kini nga kasabutan og dili nako matuman tungod sa mga musunod na buhat sama sa;
                                <ul class="review-buhat__subclauses">
                                    <li>Pagsugal, pag-inom ug uban pang bisyo</li>
                                    <li>Pag-invest sa pyramiding scheme</li>
                                    <li>Pagpalit ug gadgets nga dili kinahanglanon sa negosyo,</li>
                                    <li>Pagpa-utang</li>
                                    <li>Uban pang mga butang nga wala nakalatid ug nakabutang sa akong mungkahing proyekto.</li>
                                </ul>
                            </li>
                            <li>
                                Sa kantidad nga nadawat ni
                                ${renderReviewBuhatInline(beneficiary.fullName, 'lg')}
                                ako si
                                ${renderReviewBuhatInline(coMaker.fullName, 'lg')}
                                <span class="review-buhat__literal">naa sa saktong edad, Pilipino, ug nagpuyo sa</span>
                                ${renderReviewBuhatInline(coMaker.addressLine, 'md')}
                                <span class="review-buhat__literal">,</span>
                                ${renderReviewBuhatInline(coMaker.barangay, 'sm')}
                                <span class="review-buhat__literal">,</span>
                                ${renderReviewBuhatInline(coMaker.city, 'sm')}
                                <span class="review-buhat__literal">nagsaad na mahimong responsable JOINTLY AND SEVERALLY sa pag-uli o pagbayad sa kantidad nga nadawat sulod sa bente kwatro (24) ka bulan kung si</span>
                                ${renderReviewBuhatInline(beneficiary.fullName, 'md')}
                                <span class="review-buhat__literal">dili makatuman sa iyang gi komitar sa ahensiya or mobuhat ug mga buluhaton nga lista sa taas.</span>
                            </li>
                        </ol>

                        <p class="review-buhat__paragraph">
                            Ako andam modawat og mosunod sa mga lakang nga ipahigayon ug ihatag kanako sa maong ahensya sama sa mosunod nga;
                        </p>
                        <ol class="review-buhat__clauses review-buhat__clauses--lettered" type="a">
                            <li>Counselling</li>
                            <li>Pag uli sa ayudang nadawat nga nagkantidad ug Fifteen Thousand Pesos (P15,000.00) sulod sa bente kwatro (24) ka bulan pinaagi sa monthly nga pagbayad nagkantidad ug Six Hundred Twenty-five Pesos (P625.00)</li>
                            <li>Ang dili pagtuman sa sumusunod nga lakang mamahimong hinungdan sa pagka blacklist sa mosunod nga susamang ayuda.</li>
                        </ol>

                        <p class="review-buhat__paragraph">
                            Isip sa pagmatuod sa akong pag-uyon og kumpletong pagsabot niining maong kasabutan, ako kining paga pirmahan ibabaw sa akong pangalan karong adlawa
                            ${renderReviewBuhatInline(currentDateWords, 'md')}
                            <span class="review-buhat__literal">.</span>
                        </p>

                        <section class="review-buhat__signatures">
                            <div class="review-buhat__signature-col">
                                <div class="review-buhat__signature-head">Prepared by:</div>
                                ${renderReviewBuhatSignatureBlock('Name and Signature of Beneficiary', applicantSignature.signedName, applicantSignature.signatureUpload)}
                            </div>
                            <div class="review-buhat__signature-col">
                                <div class="review-buhat__signature-head">Co-maker:</div>
                                ${renderReviewBuhatSignatureBlock('Name and Signature of Co-maker', coMakerSignature.signedName, coMakerSignature.signatureUpload)}
                            </div>
                        </section>
                    </div>

                    <footer class="review-buhat__footer">
                        <div class="review-buhat__footer-left">
                            <div><strong>Phone:</strong> &nbsp; +639562241679 / +639816016317</div>
                            <div><strong>Email:</strong> &nbsp; cswdobutuan@gmail.com</div>
                            <div><strong>Website:</strong> &nbsp; http://www.butuan.gov.ph</div>
                        </div>
                        <div class="review-buhat__footer-right">
                            <img src="${escapeAttribute(reviewBuhatAssetUrl('butuanon-logo.png'))}" alt="ButuanON logo">
                            <small>CSWDO.DPSD.F.59 REV01</small>
                        </div>
                    </footer>
                </section>
            </div>
        `;
    }

    function renderStaffBusinessPlan(staffReview) {
        const approval = staffReview.approval || {};
        return `
            ${renderReviewStatementBlock(
                'Reviewed by',
                `
                    <div class="row-grid">
                        ${renderInput('Reviewer name', 'staff.approval.approverName', approval.approverName || '')}
                        ${renderInput('Approved date', 'staff.approval.approvedDate', approval.approvedDate || '', 'date')}
                    </div>
                    ${renderUploadField('Reviewer signature upload', 'approval.signatureUpload', approval.signatureUpload || null)}
                `
            )}
            ${renderReviewStatementBlock(
                'Noted by',
                `
                    <div class="review-paper-paragraph">GOLDA V. POCON, RSW, MSSW, CESE<br>CGHD-II/CSWDO</div>
                `
            )}
        `;
    }

    function renderReviewBusinessPlanPage(pageNumber, innerHtml) {
        return `
            <section class="review-bp-page">
                ${innerHtml}
                <footer class="review-bp-page__footer">Page ${pageNumber} of 6</footer>
            </section>
        `;
    }

    function renderReviewBusinessPlanPrompt(number, title, subtitle, body, extraClass = '') {
        return `
            <section class="review-bp-prompt ${escapeAttribute(extraClass)}">
                <div class="review-bp-prompt__title">${escapeHtml(number)} ${escapeHtml(title)}</div>
                <div class="review-bp-prompt__subtitle">${escapeHtml(subtitle)}</div>
                <div class="review-bp-prompt__body">${body}</div>
            </section>
        `;
    }

    function renderReviewBusinessPlanLineField(label, value, className = '') {
        return `
            <div class="review-bp-line ${escapeAttribute(className)}">
                <span class="review-bp-line__label">${escapeHtml(label)}</span>
                <span class="review-bp-line__value">${escapeHtml(value || '--')}</span>
            </div>
        `;
    }

    function renderReviewBusinessPlanNarrative(value, className = '') {
        return `<div class="review-bp-narrative ${escapeAttribute(className)}">${escapeHtml(value || '--')}</div>`;
    }

    function renderReviewBusinessPlanFileSlot(label, metadata, emptyText) {
        if (metadata?.file_path) {
            return `
                <div class="review-bp-file-slot has-file">
                    <span class="review-bp-file-slot__label">${escapeHtml(label)}</span>
                    <a class="upload-link" href="${escapeAttribute(routeUrl(metadata.file_path))}" target="_blank" rel="noopener">
                        ${escapeHtml(metadata.original_name || 'View uploaded file')}
                    </a>
                    ${metadata.uploaded_at ? `<small class="field-hint">${escapeHtml(formatDateTime(metadata.uploaded_at))}</small>` : ''}
                </div>
            `;
        }

        return `
            <div class="review-bp-file-slot">
                <span class="review-bp-file-slot__label">${escapeHtml(label)}</span>
                <span>${escapeHtml(emptyText || '--')}</span>
            </div>
        `;
    }

    function renderPaperSignatureUploadField(fieldKey, metadata, options = {}) {
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const fileName = metadata?.original_name || 'View uploaded file';
        const uploadedAt = metadata?.uploaded_at ? formatDateTime(metadata.uploaded_at) : '';
        const hintMarkup = renderAssignedPdoSignatureWarning(fieldKey, metadata);
        const hint = hintMarkup && options.hintClass
            ? hintMarkup.replace('class="field-hint"', `class="${escapeAttribute(options.hintClass)}"`)
            : hintMarkup;

        return `
            <div class="signature-upload-inline">
                <label class="${escapeAttribute(options.buttonClass || 'signature-launch')}">
                    <input type="file" data-upload-field="${escapeAttribute(fieldKey)}" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf">
                    ${fileUrl ? 'Replace signature' : 'Upload signature'}
                </label>
                ${fileUrl
                    ? `<a class="${escapeAttribute(options.linkClass || 'signature-file-link')}" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">${escapeHtml(fileName)}</a>`
                    : `<span class="${escapeAttribute(options.statusClass || 'signature-status-text')}">Walay pirma nga na-upload.</span>`}
                ${uploadedAt ? `<small class="field-hint">${escapeHtml(uploadedAt)}</small>` : ''}
                ${hint || ''}
            </div>
        `;
    }

    function renderReviewBusinessPlanSignatureEditor(approval) {
        const approverName = resolveStaffFieldDefault('staff.approval.approverName', approval.approverName || '');
        const approvedDate = resolveStaffFieldDefault('staff.approval.approvedDate', approval.approvedDate || '', 'date');

        return `
            <div class="review-bp-signline review-bp-signline--editable">
                <input class="review-bp-signline__input" type="text" name="staff.approval.approverName" value="${escapeAttribute(approverName)}" readonly aria-readonly="true">
            </div>
            <div class="review-bp-signcaption">(Pirma ibabaw sa pangalan sa reviewer)</div>
            <label class="review-bp-signmeta review-bp-signmeta--editor">
                <span>Petsa sa review</span>
                <input class="review-bp-signdate" type="date" name="staff.approval.approvedDate" value="${escapeAttribute(approvedDate)}" readonly aria-readonly="true">
            </label>
            ${renderPaperSignatureUploadField('approval.signatureUpload', approval.signatureUpload || null, {
                buttonClass: 'signature-launch',
                linkClass: 'signature-file-link',
                statusClass: 'signature-status-text',
                hintClass: 'field-hint field-hint--staff',
            })}
        `;
    }

    function renderReviewBusinessPlanEditorField(label, name, value, rows = 3) {
        return `
            <label class="review-bp-editor">
                <span class="review-bp-editor__label">${escapeHtml(label)}</span>
                <textarea class="review-bp-editor__textarea" name="${escapeAttribute(name)}" rows="${escapeAttribute(String(rows))}">${escapeHtml(value || '')}</textarea>
            </label>
        `;
    }

    function renderStaffBuhatSaPagpanumpa(staffReview) {
        const verification = staffReview.verification || {};
        return `
            <section class="review-section">
                <h4>Buhat sa Pagpanumpa Verification</h4>
                <div class="row-grid">
                    ${renderInput('Reviewer name', 'staff.verification.reviewerName', verification.reviewerName || '')}
                    ${renderInput('Reviewer title', 'staff.verification.reviewerTitle', verification.reviewerTitle || '')}
                    ${renderInput('Reviewer date', 'staff.verification.reviewerDate', verification.reviewerDate || '', 'date')}
                    ${renderTextarea('Verification remarks', 'staff.verification.remarks', verification.remarks || '')}
                    ${renderUploadField('Reviewer signature upload', 'verification.signatureUpload', verification.signatureUpload || null)}
                </div>
            </section>
        `;
    }

    function renderReviewBuhatInline(value, size = 'md') {
        const safeValue = escapeHtml(value || '');
        return `<span class="review-buhat__inline review-buhat__inline--${escapeAttribute(size)}">${safeValue || '&nbsp;'}</span>`;
    }

    function renderReviewBuhatSignatureBlock(caption, signedName, metadata) {
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const fileName = metadata?.original_name || 'View uploaded file';
        const uploadedAt = metadata?.uploaded_at ? formatDateTime(metadata.uploaded_at) : '';

        return `
            <div class="review-buhat__signature-block">
                <div class="review-buhat__signature-name">${escapeHtml(signedName || '') || '&nbsp;'}</div>
                <div class="review-buhat__signature-caption">${escapeHtml(caption)}</div>
                ${fileUrl ? `
                    <div class="review-buhat__signature-upload">
                        <a class="upload-link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">${escapeHtml(fileName)}</a>
                        ${uploadedAt ? `<small class="field-hint">${escapeHtml(uploadedAt)}</small>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    function renderReviewPaperPage(pageNumber, innerHtml, isStaffPage = false) {
        return `
            <section class="review-paper-page ${isStaffPage ? 'review-paper-page--staff' : ''}">
                <header class="review-paper-page__header">
                    <div class="review-paper-page__title">MUNGKAHING PROYEKTO</div>
                    <div class="review-paper-page__subtitle">Sustainable Market and Technology and Employment Assistance Program (SMART LEAP)</div>
                </header>
                <div class="review-paper-page__body">${innerHtml}</div>
                <footer class="review-paper-page__footer">Page ${pageNumber} of 3</footer>
            </section>
        `;
    }

    function renderReviewPaperSectionTitle(index, title) {
        return `<div class="review-paper-section__title"><span>${escapeHtml(index)}</span><strong>${escapeHtml(title)}</strong></div>`;
    }

    function renderReviewPaperLineField(label, value) {
        return `
            <div class="review-paper-line-field">
                <span class="review-paper-line-field__label">${escapeHtml(label)}</span>
                <span class="review-paper-line-field__value">${escapeHtml(value || '--')}</span>
            </div>
        `;
    }

    function renderReviewInlineInput(name, value, type = 'text', className = '', readOnly = false) {
        return `<input type="${escapeAttribute(type)}" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" class="${escapeAttribute(className)}" ${readOnly ? 'readonly aria-readonly="true"' : ''}>`;
    }

    function renderReviewInlineSelect(name, value, options, className = '', disabled = false) {
        return `
            <select name="${escapeAttribute(name)}" class="${escapeAttribute(className)}" ${disabled ? 'disabled aria-disabled="true"' : ''}>
                ${options.map((option) => `
                    <option value="${escapeAttribute(option)}" ${String(option) === String(value) ? 'selected' : ''}>${escapeHtml(option)}</option>
                `).join('')}
            </select>
        `;
    }

    function renderReviewPaperParagraphBlock(value) {
        return `<div class="review-paper-paragraph">${escapeHtml(value || '--')}</div>`;
    }

    function renderReviewPaperTable(headHtml, bodyHtml, footHtml = '') {
        return `
            <div class="table-wrap">
                <table class="simple-table simple-table--paper">
                    <thead>${headHtml}</thead>
                    <tbody>${bodyHtml || '<tr><td colspan="12">No data entered.</td></tr>'}</tbody>
                    ${footHtml ? `<tfoot>${footHtml}</tfoot>` : ''}
                </table>
            </div>
        `;
    }

    function buildReviewMungkahingSectorRows(sectoral) {
        const source = sectoral || {};
        const hasNewShape = Object.prototype.hasOwnProperty.call(source, 'membershipType')
            || Object.prototype.hasOwnProperty.call(source, 'sex')
            || Object.prototype.hasOwnProperty.call(source, 'seniorCitizen')
            || Object.prototype.hasOwnProperty.call(source, 'pwd')
            || Object.prototype.hasOwnProperty.call(source, 'ip')
            || Object.prototype.hasOwnProperty.call(source, 'soloParent');
        if (!hasNewShape) {
            return {
                pantawid: source.pantawid || {},
                nonPantawid: source.nonPantawid || {},
            };
        }

        const membershipType = String(source.membershipType || '').trim();
        const sex = String(source.sex || '').trim();
        const isFemale = sex === 'female';
        const isMale = sex === 'male';
        const isPantawid = membershipType === 'pantawid';
        const isNonPantawid = membershipType === 'non_pantawid';

        const buildRow = (active) => ({
            sexFemale: active && isFemale ? 1 : 0,
            sexMale: active && isMale ? 1 : 0,
            seniorFemale: active && isFemale && Boolean(source.seniorCitizen) ? 1 : 0,
            seniorMale: active && isMale && Boolean(source.seniorCitizen) ? 1 : 0,
            pwdFemale: active && isFemale && Boolean(source.pwd) ? 1 : 0,
            pwdMale: active && isMale && Boolean(source.pwd) ? 1 : 0,
            ipFemale: active && isFemale && Boolean(source.ip) ? 1 : 0,
            ipMale: active && isMale && Boolean(source.ip) ? 1 : 0,
            soloParentFemale: active && isFemale && Boolean(source.soloParent) ? 1 : 0,
            soloParentMale: active && isMale && Boolean(source.soloParent) ? 1 : 0,
        });

        return {
            pantawid: buildRow(isPantawid),
            nonPantawid: buildRow(isNonPantawid),
        };
    }

    function renderReviewMungkahingSectorMatrix(sectoral) {
        const rows = buildReviewMungkahingSectorRows(sectoral);
        return renderReviewPaperTable(`
            <tr>
                <th rowspan="2">Paglain-lain</th>
                <th colspan="2">Sex</th>
                <th colspan="8">Sectoral</th>
            </tr>
            <tr>
                <th>Babaye</th><th>Lalake</th>
                <th colspan="2">Senior Citizens</th>
                <th colspan="2">PWD</th>
                <th colspan="2">IP</th>
                <th colspan="2">Solo Parent</th>
            </tr>
            <tr>
                <th></th>
                <th>Babaye</th><th>Lalake</th>
                <th>Babaye</th><th>Lalake</th>
                <th>Babaye</th><th>Lalake</th>
                <th>Babaye</th><th>Lalake</th>
                <th>Babaye</th><th>Lalake</th>
            </tr>
        `, `
            ${renderReviewMungkahingSectorMatrixRow('Pantawid', rows.pantawid)}
            ${renderReviewMungkahingSectorMatrixRow('Non-Pantawid', rows.nonPantawid)}
        `);
    }

    function renderReviewMungkahingSectorMatrixRow(label, group) {
        const count = (value) => {
            const normalized = Number.parseInt(String(value ?? ''), 10);
            return Number.isFinite(normalized) && normalized >= 0 ? String(normalized) : '0';
        };
        return `
            <tr>
                <td>${escapeHtml(label)}</td>
                <td>${count(group.sexFemale)}</td>
                <td>${count(group.sexMale)}</td>
                <td>${count(group.seniorFemale)}</td>
                <td>${count(group.seniorMale)}</td>
                <td>${count(group.pwdFemale)}</td>
                <td>${count(group.pwdMale)}</td>
                <td>${count(group.ipFemale)}</td>
                <td>${count(group.ipMale)}</td>
                <td>${count(group.soloParentFemale)}</td>
                <td>${count(group.soloParentMale)}</td>
            </tr>
        `;
    }

    async function handleReviewSubmit(event) {
        event.preventDefault();
        if (!state.activeTask) {
            return;
        }

        const status = document.getElementById('reviewDecisionStatus')?.value || '';
        const remarks = document.getElementById('reviewDecisionRemarks')?.value || '';
        const applicantVisibleRemark = document.getElementById('reviewDecisionApplicantRemark')?.value || '';
        if (['Needs Correction', 'Rejected'].includes(status) && !String(applicantVisibleRemark).trim()) {
            showToast('Applicant-visible remark is required for correction or rejection.', 'warning');
            document.getElementById('reviewDecisionApplicantRemark')?.focus();
            return;
        }

        const payload = gatherStaffForm();
        try {
            await fetchJson('api/post-approval-review/review', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    taskId: state.activeTask.id,
                    status,
                    remarks,
                    applicantVisibleRemark,
                    staffForm: payload,
                }),
            });
            showToast('Review decision saved.', 'success');
            if (state.embedded && window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'smartleap-form-review-saved', taskId: state.activeTask.id }, '*');
            }
            await loadQueue();
            await loadTask(state.activeTask.id);
        } catch (error) {
            showToast(error.message || 'Unable to save the review decision.', 'warning');
        }
    }

    function gatherStaffForm() {
        const form = document.getElementById('reviewForm');
        const data = {};
        form?.querySelectorAll('input[name], select[name], textarea[name]').forEach((field) => {
            if (field.name.startsWith('review.')) {
                return;
            }
            if (field.name.startsWith('staff.eligibilityAssessment.')) {
                return;
            }
            if (field instanceof HTMLInputElement && field.type === 'file') {
                return;
            }
            setNestedValue(data, field.name.replace(/^staff\./, ''), field.value);
        });
        return data;
    }

    async function handleReviewerUploadChange(event) {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
            return;
        }

        const fieldKey = input.dataset.uploadField || '';
        const file = input.files?.[0];
        if (!fieldKey || !file || !state.activeTask) {
            return;
        }

        input.disabled = true;
        try {
            const body = new FormData();
            body.append('taskId', String(state.activeTask.id));
            body.append('fieldKey', fieldKey);
            body.append('file', file);

            const payload = await fetchJson('api/post-approval-review/upload', {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body,
            });

            if (payload.upload) {
                const currentPayload = state.activeTask.payload || {};
                currentPayload.staffReview = currentPayload.staffReview || {};
                setNestedValue(currentPayload.staffReview, fieldKey, payload.upload);
                showToast('Reviewer signature uploaded.', 'success');
                renderWorkspace();
            }
        } catch (error) {
            showToast(error.message || 'Unable to upload the reviewer signature right now.', 'warning');
        } finally {
            input.disabled = false;
            input.value = '';
        }
    }

    function renderReadOnlySection(title, rows, extras = []) {
        return `
            <section class="review-section">
                <h4>${escapeHtml(title)}</h4>
                <div class="read-only-grid">
                    ${rows.map(([label, value]) => `
                        <article class="read-only-item">
                            <span>${escapeHtml(label)}</span>
                            <strong>${escapeHtml(value || '--')}</strong>
                        </article>
                    `).join('')}
                </div>
                ${extras.length ? `<div class="review-extra">${extras.join('')}</div>` : ''}
            </section>
        `;
    }

    function renderReviewStatementBlock(title, bodyHtml, signatureHtml = '') {
        return `
            <section class="review-section review-statement-block">
                <div class="review-statement-head">${escapeHtml(title)}</div>
                <div class="review-statement-body">${bodyHtml}</div>
                ${signatureHtml ? `<div class="review-statement-signature">${signatureHtml}</div>` : ''}
            </section>
        `;
    }

    function renderReviewCertificationSentence(html) {
        return `<div class="review-certification-sentence">${html}</div>`;
    }

    function renderReviewSignatureArea(label, fieldsHtml) {
        return `
            <div class="review-signature-area">
                <div class="review-signature-line"></div>
                <div class="review-signature-label">${escapeHtml(label)}</div>
                <div class="review-signature-fields">${fieldsHtml}</div>
            </div>
        `;
    }

    function renderSimpleTable(title, headers, rows) {
        return `
            <section class="review-section">
                <h4>${escapeHtml(title)}</h4>
                <div class="table-wrap">
                    <table class="simple-table">
                        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
                        <tbody>
                            ${rows.length === 0 ? `<tr><td colspan="${headers.length}">No data entered.</td></tr>` : rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value || '--')}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderInput(label, name, value, type = 'text') {
        const resolvedValue = resolveStaffFieldDefault(name, value, type);
        const isAutoAssigned = isAutoAssignedStaffField(name, type);
        return `
            <label class="form-field">
                <span>${escapeHtml(label)}</span>
                <input type="${escapeAttribute(type)}" name="${escapeAttribute(name)}" value="${escapeAttribute(resolvedValue)}" ${isAutoAssigned ? 'readonly aria-readonly="true"' : ''}>
            </label>
        `;
    }

    function renderTextarea(label, name, value) {
        return `
            <label class="form-field full">
                <span>${escapeHtml(label)}</span>
                <textarea name="${escapeAttribute(name)}" rows="4">${escapeHtml(value || '')}</textarea>
            </label>
        `;
    }

    function renderSelect(label, name, value, options) {
        return `
            <label class="form-field">
                <span>${escapeHtml(label)}</span>
                <select name="${escapeAttribute(name)}">
                    ${options.map((option) => `<option value="${escapeAttribute(option)}" ${String(option) === String(value) ? 'selected' : ''}>${escapeHtml(option || 'Select')}</option>`).join('')}
                </select>
            </label>
        `;
    }

    function renderUploadField(label, fieldKey, metadata) {
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const fileName = metadata?.original_name || '';
        const uploadedAt = metadata?.uploaded_at ? formatDateTime(metadata.uploaded_at) : '';

        return `
            <div class="form-field full upload-field">
                <span>${escapeHtml(label)}</span>
                ${renderAssignedPdoSignatureWarning(fieldKey, metadata)}
                <label class="upload-card">
                    <input type="file" class="upload-input" data-upload-field="${escapeAttribute(fieldKey)}" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf">
                    <span class="upload-card__copy">
                        <strong>${fileName ? 'Replace uploaded file' : 'Upload signature file'}</strong>
                        <small>${fileName ? escapeHtml(fileName) : 'Accepted: JPG, PNG, WEBP, HEIC, HEIF, or PDF'}</small>
                    </span>
                </label>
                ${fileUrl ? `<a class="upload-link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">View uploaded file</a>` : ''}
                ${uploadedAt ? `<small class="field-hint">Uploaded ${escapeHtml(uploadedAt)}</small>` : ''}
            </div>
        `;
    }

    function resolveStaffFieldDefault(name, value, type = 'text') {
        const currentValue = String(value || '').trim();
        if (currentValue !== '') {
            return currentValue;
        }

        const fieldName = String(name || '').trim();
        if (!fieldName.startsWith('staff.')) {
            return value || '';
        }

        const assignedPdoName = String(state.activeTask?.assignedPdo?.name || '').trim();
        const assignedPdoTitle = String(state.activeTask?.assignedPdo?.title || '').trim();
        const authName = String(state.authUser?.name || '').trim();
        const authRole = String(state.authUser?.role || '').trim();
        const today = new Date().toISOString().slice(0, 10);

        if (type === 'date') {
            if (/(signedDate|approvedDate|reviewerDate)$/i.test(fieldName)) {
                return today;
            }
        }

        if (/(directWorkerName|certifyingOfficerName|validatorName|approverName|reviewerName)$/i.test(fieldName)) {
            return assignedPdoName || authName;
        }

        if (/(directWorkerTitle|certifyingOfficerTitle|validatorTitle|approverTitle|reviewerTitle)$/i.test(fieldName)) {
            return assignedPdoTitle || authRole;
        }

        return value || '';
    }

    function isAutoAssignedStaffField(name, type = 'text') {
        const fieldName = String(name || '').trim();
        if (!fieldName.startsWith('staff.')) {
            return false;
        }

        if (type === 'date' && /(signedDate|approvedDate|reviewerDate)$/i.test(fieldName)) {
            return true;
        }

        return /(directWorkerName|directWorkerTitle|certifyingOfficerName|certifyingOfficerTitle|validatorName|validatorTitle|approverName|approverTitle|reviewerName|reviewerTitle)$/i.test(fieldName);
    }

    function renderAssignedPdoSignatureWarning(fieldKey, metadata) {
        const normalized = String(fieldKey || '').trim();
        const staffUploadFields = new Set([
            'pageOneCertification.signatureUpload',
            'physicalRequirements.foodRelatedCertification.signatureUpload',
            'psychoSocialRequirements.residencyAndCharacter.signatureUpload',
            'psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload',
            'validatorIdentity.signatureUpload',
            'recommendation.signatureUpload',
            'approval.signatureUpload',
            'verification.signatureUpload',
        ]);
        if (!staffUploadFields.has(normalized) || metadata?.file_path) {
            return '';
        }

        const assignedPdoName = String(state.activeTask?.assignedPdo?.name || '').trim();
        const warning = assignedPdoName
            ? `${assignedPdoName} has no saved PDO signature yet. Upload one here or through PDO signature settings.`
            : 'The assigned PDO has no saved signature yet. Upload one here or through PDO signature settings.';

        return `<small class="field-hint">${escapeHtml(warning)}</small>`;
    }

    function renderReadOnlyUpload(label, metadata) {
        if (!metadata?.file_path) {
            return '';
        }

        return `
            <article class="upload-preview">
                <strong>${escapeHtml(label)}</strong>
                <a class="upload-link" href="${escapeAttribute(routeUrl(metadata.file_path))}" target="_blank" rel="noopener">
                    ${escapeHtml(metadata.original_name || 'View uploaded file')}
                </a>
                ${metadata.uploaded_at ? `<small>${escapeHtml(formatDateTime(metadata.uploaded_at))}</small>` : ''}
            </article>
        `;
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-add-row="healthAge"]');
        if (!button) {
            return;
        }
        const list = document.getElementById('healthAgeRows');
        if (!list) {
            return;
        }
        const index = list.querySelectorAll('.row-grid').length;
        list.insertAdjacentHTML('beforeend', `
            <div class="row-grid">
                ${renderInput('Requirement', `staff.physicalRequirements.healthAgeRows.${index}.requirement`, '')}
                ${renderInput('Age', `staff.physicalRequirements.healthAgeRows.${index}.age`, '')}
                ${renderInput('Health status', `staff.physicalRequirements.healthAgeRows.${index}.healthStatus`, '')}
            </div>
        `);
    });

    async function fetchJson(path, options = {}) {
        const response = await fetch(routeUrl(path), {
            credentials: 'same-origin',
            headers: { Accept: 'application/json', ...options.headers },
            ...options,
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error(`Unexpected response from ${path}.`);
        }

        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.message || 'Request failed.');
        }
        return payload;
    }

    function routeUrl(path) {
        return `${state.baseUrl}/${String(path).replace(/^\/+/, '')}`;
    }

    function reviewBuhatAssetUrl(fileName) {
        return routeUrl(`assets/img/post-approval/${String(fileName).replace(/^\/+/, '')}`);
    }

    function setNestedValue(target, path, value) {
        const segments = path.split('.');
        let cursor = target;
        segments.forEach((segment, index) => {
            const isLast = index === segments.length - 1;
            const isArrayIndex = /^\d+$/.test(segment);
            if (isLast) {
                if (isArrayIndex && Array.isArray(cursor)) {
                    cursor[Number(segment)] = value;
                } else {
                    cursor[segment] = value;
                }
                return;
            }

            const nextIsArray = /^\d+$/.test(segments[index + 1]);
            if (isArrayIndex) {
                const numeric = Number(segment);
                if (!Array.isArray(cursor)) {
                    return;
                }
                cursor[numeric] = cursor[numeric] ?? (nextIsArray ? [] : {});
                cursor = cursor[numeric];
                return;
            }

            cursor[segment] = cursor[segment] ?? (nextIsArray ? [] : {});
            cursor = cursor[segment];
        });
    }

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) {
            node.textContent = value ?? '';
        }
    }

    function formatDateTime(value) {
        if (!value) {
            return '--';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }
        return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function formatMonthDayWords(value) {
        const date = value ? new Date(value) : new Date();
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
    }

    function slugify(value) {
        return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function showToast(message, tone) {
        const stack = document.getElementById('toastStack');
        if (!stack) return;
        const toast = document.createElement('div');
        toast.className = `toast ${tone || 'info'}`;
        toast.textContent = message;
        stack.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; }, 2600);
        setTimeout(() => toast.remove(), 3400);
    }

    function escapeHtml(value) {
        const node = document.createElement('div');
        node.textContent = value == null ? '' : String(value);
        return node.innerHTML;
    }

    function escapeAttribute(value) {
        return escapeHtml(value).replace(/"/g, '&quot;');
    }
})();
