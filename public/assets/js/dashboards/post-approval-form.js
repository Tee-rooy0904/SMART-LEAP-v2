/*
 * SMART LEAP FILE GUIDE
 * Dashboard script for p os t a pp ro va l f or m.
 * Controls one role-specific workspace page, including its live state, interactions, and any page-owned modals or drawers.
 */
(function () {
    const FIELD_OWNER_APPLICANT = 'applicant';
    const FIELD_OWNER_STAFF = 'staff';
    const state = {
        baseUrl: window.SMARTLEAP_BASE_URL || '',
        authUser: window.SMARTLEAP_AUTH_USER || null,
        taskCode: window.SMARTLEAP_POST_APPROVAL_CODE || '',
        reviewerMode: Boolean(window.SMARTLEAP_POST_APPROVAL_REVIEWER_MODE),
        reviewTaskId: Number(window.SMARTLEAP_POST_APPROVAL_REVIEW_TASK_ID || 0),
        task: null,
        activePayload: null,
        formErrors: {},
        guidedSectionOpen: {},
        availmentPage: 1,
        renderMode: window.innerWidth >= 1024 ? 'desktop' : 'mobile',
        signaturePadModal: {
            fieldKey: '',
            label: '',
        },
    };
    const MUNGKAHING_SECTOR_DEFINITIONS = [
        { key: 'sexFemale', label: 'Babaye' },
        { key: 'sexMale', label: 'Lalake' },
        { key: 'seniorFemale', label: 'Senior Citizen - Babaye' },
        { key: 'seniorMale', label: 'Senior Citizen - Lalake' },
        { key: 'pwdFemale', label: 'PWD - Babaye' },
        { key: 'pwdMale', label: 'PWD - Lalake' },
        { key: 'ipFemale', label: 'IP - Babaye' },
        { key: 'ipMale', label: 'IP - Lalake' },
        { key: 'soloParentFemale', label: 'Solo Parent - Babaye' },
        { key: 'soloParentMale', label: 'Solo Parent - Lalake' },
    ];
    const MUNGKAHING_SECTOR_GROUPS = [
        { key: 'pantawid', label: 'Pantawid' },
        { key: 'nonPantawid', label: 'Non-Pantawid' },
    ];
    const HARD_COPY_ROW_LIMITS = Object.freeze({
        'add-family': 7,
        'add-income': 6,
        'add-health': 3,
        'add-mp-contribution': 2,
        'add-mp-material': 4,
        'add-mp-labor': 2,
        'add-mp-equipment': 3,
        'add-mp-expense': 6,
        'add-mp-sale': 6,
        'add-mp-spending': 10,
        'add-bp-product': 5,
        'add-bp-schedule': 5,
    });

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindStaticEvents();
        await loadTask();
    }

    function bindStaticEvents() {
        document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
        document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebarMenu);
        document.getElementById('sidebarClose')?.addEventListener('click', closeSidebarMenuOnMobile);
        document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebarMenuOnMobile);
        document.getElementById('postApprovalSaveButton')?.addEventListener('click', handleSave);
        document.getElementById('postApprovalForm')?.addEventListener('submit', handleSubmit);
        document.getElementById('postApprovalFormSections')?.addEventListener('click', handleRowAction);
        document.getElementById('postApprovalFormSections')?.addEventListener('input', handleBusinessPlanMirrorInput);
        document.getElementById('postApprovalFormSections')?.addEventListener('change', handleApplicantUploadChange);
        document.getElementById('postApprovalFormSections')?.addEventListener('toggle', handleGuidedSectionToggle, true);
        document.addEventListener('click', handleReviewerDecisionClick);
        document.addEventListener('click', handleSignaturePadAction);
        document.addEventListener('pointerdown', startSignaturePadStroke);
        document.addEventListener('pointermove', moveSignaturePadStroke);
        document.addEventListener('pointerup', endSignaturePadStroke);
        document.addEventListener('pointerleave', endSignaturePadStroke);
        document.addEventListener('pointercancel', endSignaturePadStroke);
        window.addEventListener('resize', handleWindowResize);
        document.addEventListener('keydown', handleGlobalKeydown);
        syncSidebarMenuState();
    }

    function handleReviewerDecisionClick(event) {
        const button = event.target instanceof Element ? event.target.closest('[data-review-decision]') : null;
        if (!(button instanceof HTMLButtonElement)) {
            return;
        }

        const nextValue = normalizeReviewerDecisionStatus(button.dataset.reviewDecision || 'Verified');
        const field = document.getElementById('reviewDecisionStatus');
        if (field instanceof HTMLInputElement) {
            field.value = nextValue;
        }

        syncReviewerDecisionButtons(nextValue);
        updateReviewerDecisionNoteUi(nextValue);
    }

    function handleBusinessPlanMirrorInput(event) {
        if (!['business_plan', 'buhat_sa_pagpanumpa'].includes(state.task?.code || '')) {
            return;
        }

        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
            return;
        }

        const name = target.getAttribute('name');
        if (!name) {
            return;
        }

        const formSections = document.getElementById('postApprovalFormSections');
        if (!formSections) {
            return;
        }

        const mirrors = Array.from(formSections.querySelectorAll(`[name="${cssEscape(name)}"]`));
        if (mirrors.length < 2) {
            return;
        }

        mirrors.forEach((field) => {
            if (field === target) {
                return;
            }
            if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
                field.value = target.value;
            }
        });
    }

    async function loadTask() {
        renderIdentity();

        if (!state.reviewerMode && !state.taskCode) {
            renderFatalState('No application form was selected.');
            return;
        }

        if (state.reviewerMode && state.reviewTaskId < 1) {
            renderFatalState('No review task was selected.');
            return;
        }

        try {
            const payload = state.reviewerMode
                ? await fetchJson(`api/post-approval-review/task?task_id=${encodeURIComponent(String(state.reviewTaskId))}`)
                : await fetchJson(`api/post-approval/task?code=${encodeURIComponent(state.taskCode)}`);
            if (!payload.ok) {
                throw new Error(payload.message || 'Unable to load this application form.');
            }

            state.task = state.reviewerMode
                ? normalizeReviewerTask(payload.task || null)
                : (payload.task || null);
            // Only reset activePayload on the very first load (when it's empty).
            // Subsequent reloads (after uploads/signatures) preserve the in-memory
            // edited state so in-progress field values aren't wiped by the refresh.
            const incomingPayload = structuredCloneSafe(state.task?.payload || {});
            const hasInMemoryEdits = state.activePayload && Object.keys(state.activePayload).length > 0;
            if (!hasInMemoryEdits) {
                state.activePayload = incomingPayload;
            } else {
                // Merge: DB payload provides the base (uploaded files, server-side fields),
                // in-memory edits layer on top so user-typed values are not lost.
                state.activePayload = deepMergePayloads(incomingPayload, state.activePayload);
            }
            state.formErrors = {};
            state.guidedSectionOpen = {};
            renderTask();
        } catch (error) {
            renderFatalState(error.message || 'Unable to load this application form.');
        }
    }

    function normalizeFieldReference(reference) {
        return String(reference || '').trim();
    }

    /**
     * Deep-merges two plain objects. `base` is the DB-loaded payload (contains server-
     * side values like uploaded file metadata). `overrides` is the in-memory user edits.
     * Overrides win for scalar values; arrays are replaced entirely by the override.
     */
    function deepMergePayloads(base, overrides) {
        if (!base || typeof base !== 'object' || Array.isArray(base)) return overrides;
        if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return base;
        const result = Object.assign({}, base);
        for (const key of Object.keys(overrides)) {
            const overrideVal = overrides[key];
            const baseVal = base[key];
            if (overrideVal && typeof overrideVal === 'object' && !Array.isArray(overrideVal)
                && baseVal && typeof baseVal === 'object' && !Array.isArray(baseVal)) {
                result[key] = deepMergePayloads(baseVal, overrideVal);
            } else {
                result[key] = overrideVal;
            }
        }
        return result;
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(String(value || ''));
        }
        return String(value || '').replace(/["\\]/g, '\\$&');
    }

    function resolveUploadPersistPath(fieldKey) {
        const normalized = normalizeFieldReference(fieldKey);
        const aliasMap = {
            'pageOneCertification.signatureUpload': 'staffReview.pageOneCertification.signatureUpload',
            'physicalRequirements.foodRelatedCertification.signatureUpload': 'staffReview.physicalRequirements.foodRelatedCertification.signatureUpload',
            'psychoSocialRequirements.residencyAndCharacter.signatureUpload': 'staffReview.psychoSocialRequirements.residencyAndCharacter.signatureUpload',
            'psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload': 'staffReview.psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload',
            'validatorIdentity.signatureUpload': 'staffReview.validatorIdentity.signatureUpload',
            'recommendation.signatureUpload': 'staffReview.recommendation.signatureUpload',
            'approval.signatureUpload': 'staffReview.approval.signatureUpload',
            'verification.signatureUpload': 'staffReview.verification.signatureUpload',
        };

        return aliasMap[normalized] || normalized;
    }

    function resolveFieldOwnership(reference) {
        const fieldRef = normalizeFieldReference(reference);
        if (!fieldRef) {
            return { owner: FIELD_OWNER_APPLICANT, editable: true };
        }

        const reviewerLockedApplicantFields = new Set([
            'participantSignature.signedName',
            'participantSignature.signatureUpload',
            'applicantSignature.signedName',
            'applicantSignature.signedDate',
            'applicantSignature.signatureUpload',
            'coMakerSignature.signedName',
            'coMakerSignature.signatureUpload',
        ]);

        if (fieldRef.startsWith('staffReview.')) {
            return { owner: FIELD_OWNER_STAFF, editable: state.reviewerMode };
        }

        const staffUploadFields = new Set([
            'pageOneCertification.signatureUpload',
            'physicalRequirements.foodRelatedCertification.signatureUpload',
            'psychoSocialRequirements.residencyAndCharacter.signatureUpload',
            'psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload',
            'validatorIdentity.signatureUpload',
            'recommendation.signatureUpload',
            'approval.signatureUpload',
        ]);

        if (staffUploadFields.has(fieldRef)) {
            return { owner: FIELD_OWNER_STAFF, editable: state.reviewerMode };
        }

        if (fieldRef.startsWith('review.')) {
            return { owner: FIELD_OWNER_STAFF, editable: state.reviewerMode };
        }

        if (state.reviewerMode && reviewerLockedApplicantFields.has(fieldRef)) {
            return { owner: FIELD_OWNER_APPLICANT, editable: false };
        }

        return { owner: FIELD_OWNER_APPLICANT, editable: true };
    }

    function ownershipBadge(owner) {
        return '';
    }

    function buildFieldOwnershipAttributes(reference, disabled = false, forceApplicant = false) {
        const resolvedOwnership = resolveFieldOwnership(reference);
        const ownership = forceApplicant && resolvedOwnership.owner !== FIELD_OWNER_STAFF
            ? { owner: FIELD_OWNER_APPLICANT, editable: resolvedOwnership.editable }
            : resolvedOwnership;
        const shouldDisable = disabled || !ownership.editable;
        return {
            owner: ownership.owner,
            disabled: shouldDisable,
            attrs: `data-field-owner="${escapeAttribute(ownership.owner)}" data-field-ref="${escapeAttribute(reference || '')}"`,
            note: ownershipBadge(ownership.owner),
        };
    }

    function assignedPdoSignatureWarning(fieldKey, metadata) {
        const normalized = normalizeFieldReference(fieldKey);
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
        if (!staffUploadFields.has(normalized)) {
            return '';
        }

        if (metadata?.file_path) {
            return '';
        }

        const assignedPdoName = String(state.task?.assignedPdo?.name || '').trim();
        const warning = assignedPdoName
            ? `${assignedPdoName} has no saved PDO signature yet. The reviewer can sign this area directly during review.`
            : 'The assigned PDO has no saved signature yet. The reviewer can sign this area directly during review.';

        return `<small class="paper-field__ownership">${escapeHtml(warning)}</small>`;
    }

    function normalizeReviewerTask(task) {
        if (!task || typeof task !== 'object') {
            return null;
        }

        return {
            ...task,
            summary: task.summary || buildReviewerTaskSummary(task),
            helpText: task.helpText || '',
            interactive: task.interactive !== false,
            completion: Number(task.completion || 100),
        };
    }

    function buildReviewerTaskSummary(task) {
        const applicantName = String(task?.applicant?.name || '').trim();
        const barangay = String(task?.applicant?.barangay || '').trim();
        const businessName = String(task?.applicant?.businessName || '').trim();
        return [applicantName, barangay, businessName].filter(Boolean).join(' | ') || 'Review the applicant-filled form below.';
    }

    function renderReviewerHeader(task) {
        if (!state.reviewerMode || !task) {
            return;
        }

        const applicant = task.applicant || {};
        const assignedPdo = task.assignedPdo || {};
        const reviewerSummary = [
            applicant.name || 'Applicant details unavailable',
            applicant.barangay || '',
            applicant.email || '',
        ].filter(Boolean).join(' | ');

        setText('reviewApplicantSummary', reviewerSummary || 'Applicant details unavailable.');

        const card = document.getElementById('reviewApplicantCard');
        if (!card) {
            return;
        }

        card.innerHTML = [
            ['Applicant', applicant.name || 'Not provided'],
            ['Barangay', applicant.barangay || 'Not provided'],
            ['Contact', applicant.contactNumber || 'Not provided'],
            ['Business', applicant.businessName || 'Not provided'],
            ['Assigned PDO', assignedPdo.name || 'Not assigned'],
            ['Current status', task.status || 'Unknown'],
        ].map(([label, value]) => `
            <article class="form-guidance-item">
                <span class="overview-label">${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </article>
        `).join('');
    }

    function renderReviewerDecision(task) {
        if (!state.reviewerMode || !task) {
            return;
        }

        const select = document.getElementById('reviewDecisionStatus');
        const applicantRemark = document.getElementById('reviewDecisionApplicantRemark');
        const applicantRemarkLabel = document.getElementById('reviewDecisionApplicantRemarkLabel');
        const applicantRemarkHint = document.getElementById('reviewDecisionApplicantRemarkHint');
        if (select) {
            const normalizedStatus = normalizeReviewerDecisionStatus(task.status);
            select.value = normalizedStatus;
            syncReviewerDecisionButtons(normalizedStatus);
            updateReviewerDecisionNoteUi(normalizedStatus);
        }
        if (applicantRemark && applicantRemark.value.trim() === '') {
            applicantRemark.value = String(task.reviewerRemarks || '');
        }
        if (applicantRemarkLabel) {
            applicantRemarkLabel.textContent = 'Applicant note';
        }
        if (applicantRemarkHint) {
            applicantRemarkHint.textContent = 'This note appears in the applicant portal as the reviewer note.';
        }
    }

    function normalizeReviewerDecisionStatus(value) {
        const normalized = String(value || '').trim();
        return normalized === 'Needs Correction' || normalized === 'Rejected'
            ? 'Needs Correction'
            : 'Verified';
    }

    function syncReviewerDecisionButtons(value) {
        document.querySelectorAll('[data-review-decision]').forEach((button) => {
            if (!(button instanceof HTMLButtonElement)) {
                return;
            }
            const active = button.dataset.reviewDecision === value;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function updateReviewerDecisionNoteUi(status) {
        const applicantRemark = document.getElementById('reviewDecisionApplicantRemark');
        const applicantRemarkHint = document.getElementById('reviewDecisionApplicantRemarkHint');
        if (!(applicantRemark instanceof HTMLTextAreaElement)) {
            return;
        }

        if (status === 'Needs Correction') {
            applicantRemark.placeholder = 'Explain clearly what the applicant needs to correct before resubmitting.';
            if (applicantRemarkHint) {
                applicantRemarkHint.textContent = 'Required when marking the form as Needs Correction.';
            }
            return;
        }

        applicantRemark.placeholder = 'Optional note for the applicant after approval.';
        if (applicantRemarkHint) {
            applicantRemarkHint.textContent = 'Optional. This note appears in the applicant portal as the reviewer note.';
        }
    }

    function resolveElementOwnership(element) {
        if (!(element instanceof HTMLElement)) {
            return { owner: FIELD_OWNER_APPLICANT, editable: true };
        }

        const explicitOwner = normalizeFieldReference(element.dataset.fieldOwner);
        if (explicitOwner === FIELD_OWNER_APPLICANT) {
            const fieldRef = element.dataset.fieldRef || element.getAttribute('name') || element.dataset.uploadField || '';
            return resolveFieldOwnership(fieldRef);
        }
        if (explicitOwner === FIELD_OWNER_STAFF) {
            const fieldRef = element.dataset.fieldRef || element.getAttribute('name') || element.dataset.uploadField || '';
            return resolveFieldOwnership(fieldRef);
        }

        const fieldRef = element.dataset.fieldRef || element.getAttribute('name') || element.dataset.uploadField || '';
        return resolveFieldOwnership(fieldRef);
    }

    function renderIdentity() {
        const authUser = state.authUser || {};
        const displayName = authUser.name || 'Applicant';
        const initial = (displayName.trim().charAt(0) || 'A').toUpperCase();

        setText('sidebarUserName', displayName);
        ['sidebarAvatar', 'bannerAvatar'].forEach((id) => {
            const node = document.getElementById(id);
            if (node) {
                node.textContent = initial;
            }
        });
    }

    function deriveApplicantName(payload = {}) {
        const participantName = String(payload?.participantSignature?.signedName || '').trim();
        if (participantName) {
            return participantName;
        }

        const applicantSignatureName = String(payload?.applicantSignature?.signedName || '').trim();
        if (applicantSignatureName) {
            return applicantSignatureName;
        }

        const applicant = payload?.applicantDetails || {};
        const fullName = [
            applicant.firstName,
            applicant.middleName,
            applicant.lastName,
        ].filter((part) => String(part || '').trim() !== '').join(' ').trim();
        if (fullName) {
            return fullName;
        }

        const authName = String(state.authUser?.name || '').trim();
        return state.reviewerMode ? '' : authName;
    }

    function renderTask() {
        const task = state.task;
        const title = document.getElementById('postApprovalWorkspaceTitle');
        const subtitle = document.getElementById('postApprovalWorkspaceSubtitle');
        const status = document.getElementById('postApprovalWorkspaceStatus');
        const notice = document.getElementById('postApprovalWorkspaceNotice');
        const form = document.getElementById('postApprovalForm');
        const sections = document.getElementById('postApprovalFormSections');
        const staffSections = document.getElementById('postApprovalStaffSections');
        const saveButton = document.getElementById('postApprovalSaveButton');
        const submitButton = document.getElementById('postApprovalSubmitButton');

        if (!task) {
            renderFatalState('This application form is unavailable.');
            return;
        }

        setText('formPageTitle', task.title);
        setText('formPageSubtitle', task.summary || task.helpText || 'Complete the required sections below.');
        setText('formPageStatus', task.status);
        setText('formPageCompletion', `${task.completion || 0}%`);
        setText('formPageReview', buildReviewState(task));
        document.body.dataset.renderMode = state.renderMode;
        renderFormGuidance(task);
        syncAvailmentPaperChrome(task);

        title && (title.textContent = task.title);
        subtitle && (subtitle.textContent = task.summary || task.helpText || '');
        status && (status.textContent = task.status);

        if (!task.interactive) {
            notice && (notice.textContent = task.helpText || 'This task is staged for a later digital form pass.');
            form?.classList.add('is-hidden');
            if (sections) sections.innerHTML = '';
            if (staffSections) staffSections.innerHTML = renderStaffSections(task.staffSections || [], task.reviewerRemarks);
            return;
        }

        notice && (notice.textContent = buildPostApprovalNotice(task));
        form?.classList.remove('is-hidden');
        if (sections) {
            sections.innerHTML = `${renderFormErrorSummary(state.formErrors, task.code)}${renderTaskSections(task.code, state.activePayload || task.payload || {})}`;
            initializeSignaturePads();
        }
        if (staffSections) {
            staffSections.innerHTML = renderStaffSections(task.staffSections || [], task.reviewerRemarks);
        }
        if (saveButton) {
            saveButton.disabled = !isTaskEditable(task);
        }
        if (submitButton) {
            submitButton.disabled = !isTaskEditable(task);
            submitButton.hidden = task.code === 'availment_form' && state.availmentPage !== 2;
        }

        applyFormEditability(task);
        applyFieldErrors(state.formErrors);
    }

    function syncAvailmentPaperChrome(task) {
        const isAvailmentPaper = (task?.code || '') === 'availment_form';
        const pageHeader = document.querySelector('.post-form-page-header');
        const statusStrip = document.querySelector('.form-status-strip');
        const sectionNav = document.getElementById('formSectionNav');
        const guidanceCard = document.querySelector('.form-guidance-card');
        const notice = document.getElementById('postApprovalWorkspaceNotice');

        if (pageHeader) {
            pageHeader.hidden = isAvailmentPaper;
        }
        if (statusStrip) {
            statusStrip.hidden = isAvailmentPaper;
        }
        if (sectionNav) {
            sectionNav.hidden = isAvailmentPaper || !String(sectionNav.innerHTML || '').trim();
        }
        if (guidanceCard) {
            guidanceCard.hidden = isAvailmentPaper;
        }
        if (notice) {
            notice.hidden = isAvailmentPaper;
        }
    }

    function renderTaskSections(code, payload) {
        if (code === 'availment_form') {
            return renderAvailmentPaperWizard(payload);
        }

        if (code === 'mungkahing_proyekto') {
            return renderMungkahingDesktopPaper(payload);
        }

        if (code === 'buhat_sa_pagpanumpa') {
            return renderBuhatSaPagpanumpaMobile(payload);
        }

        if (code === 'business_plan') {
            return renderBusinessPlanMobile(payload);
        }

        return renderValidationMobile(payload);
    }

    function renderAvailmentPaperWizard(payload) {
        return renderAvailmentMobile(payload);
    }

    function renderFormGuidance(task) {
        const guidance = buildFormGuidance(task);
        setText('formGuidanceSummary', guidance.summary);
        setText('formGuidanceStep', guidance.step);
        setText('formGuidanceTime', guidance.time);
        setText('formGuidancePrep', guidance.prepare);
    }

    function renderAvailmentMobile(payload) {
        const data = payload || {};
        const familyMembers = ensureRows(data.familyEnterprise?.members, { name: '', age: '', activities: '' }, getHardCopyRowLimit('add-family'));
        const incomeRows = ensureRows(data.incomeEligibility?.rows, { memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' }, getHardCopyRowLimit('add-income'));

        return `
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Client identifying data</h4>
                    <p>Applicant-entered details from the SMART LEAP Availment Form.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Client name', 'clientIdentifyingData.name', data.clientIdentifyingData?.name || '', 'text')}
                    ${renderField('Age', 'clientIdentifyingData.age', data.clientIdentifyingData?.age || '', 'number')}
                    ${renderField('Address', 'clientIdentifyingData.address', data.clientIdentifyingData?.address || '', 'text', true)}
                    ${renderField('Name of spouse', 'clientIdentifyingData.spouseName', data.clientIdentifyingData?.spouseName || '', 'text')}
                    ${renderReadOnlyField('City', data.clientIdentifyingData?.city || 'Butuan City')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Type of project: Family Enterprise</h4>
                    <p>List all family members participating in the enterprise and what each one will do.</p>
                </div>
                <div class="post-approval-repeatable" data-repeatable="familyMembers">
                    <div class="post-approval-repeatable__header">
                        <span class="post-approval-repeatable__title">Family members participating</span>
                        ${renderAddRowButton('add-family', 'Add family member', familyMembers)}
                    </div>
                    ${familyMembers.map((row, index) => renderFamilyMemberRow(row, index)).join('')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Type of project: Individual Assistance</h4>
                    <p>Capture the applicant-facing narrative fields from the paper form.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Clientele category', 'individualAssistance.clienteleCategory', data.individualAssistance?.clienteleCategory || '', 'text')}
                    ${renderTextarea('Nature of difficult circumstances', 'individualAssistance.natureOfDifficultCircumstances', data.individualAssistance?.natureOfDifficultCircumstances || '', true, 'Describe the circumstance that supports the availment request.')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Income eligibility requirement</h4>
                    <p>Provide the working family members and their monthly income details.</p>
                </div>
                <div class="post-approval-repeatable" data-repeatable="incomeRows">
                    <div class="post-approval-repeatable__header">
                        <span class="post-approval-repeatable__title">Monthly income rows</span>
                        ${renderAddRowButton('add-income', 'Add income row', incomeRows)}
                    </div>
                    ${incomeRows.map((row, index) => renderIncomeRow(row, index)).join('')}
                </div>
                <div class="post-approval-fields">
                    ${renderField('Total family income', 'incomeEligibility.totalFamilyIncome', data.incomeEligibility?.totalFamilyIncome || '', 'number')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Social responsibility and willingness to save</h4>
                    <p>This covers the client-side commitment statements from page 2 of the paper availment form. Signature lines remain excluded for now.</p>
                </div>
                <label class="checkbox-field">
                    <input type="checkbox" name="clientCommitment.agreedToPolicies" ${commitments.agreedToPolicies ? 'checked' : ''}>
                    <span>I agree to abide by the SMART LEAP policies and guidelines set by CSWDD.</span>
                </label>
                <label class="checkbox-field">
                    <input type="checkbox" name="clientCommitment.agreedToRollBackSchedule" ${agreedToRollBackSchedule ? 'checked' : ''}>
                    <span>I promise to pay the SMART LEAP roll-back on the time stipulated in the program.</span>
                </label>
                <label class="checkbox-field">
                    <input type="checkbox" name="clientCommitment.agreedToWeeklySavings" ${agreedToWeeklySavings ? 'checked' : ''}>
                    <span>I will generate weekly savings to prepare for emergencies that may affect my family.</span>
                </label>
                ${renderTextarea('Optional applicant note', 'clientCommitment.notes', data.clientCommitment?.notes || '', false, 'Add any clarifying note related to your availment commitment.')}
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Applicant e-signature</h4>
                    <p>Attach the participant signature used for the paper availment form. This will remain with your saved draft and submission.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Signer name', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                    ${renderField('Date signed', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date')}
                    ${renderUploadField('Participant signature upload', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                </div>
            </section>
        `;
    }

    function renderValidationMobile(payload) {
        const data = payload || {};
        return `
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Applicant details</h4>
                    <p>Fill the applicant-side information block from the SMART LEAP Validation Form.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Date of validation', 'applicantDetails.validationDate', data.applicantDetails?.validationDate || '', 'date')}
                    ${renderField('Last name', 'applicantDetails.lastName', data.applicantDetails?.lastName || '', 'text')}
                    ${renderField('First name', 'applicantDetails.firstName', data.applicantDetails?.firstName || '', 'text')}
                    ${renderField('Middle name', 'applicantDetails.middleName', data.applicantDetails?.middleName || '', 'text')}
                    ${renderField('Purok', 'applicantDetails.purok', data.applicantDetails?.purok || '', 'text')}
                    ${renderField('Barangay', 'applicantDetails.barangay', data.applicantDetails?.barangay || '', 'text')}
                    ${renderField('Birthdate', 'applicantDetails.birthdate', data.applicantDetails?.birthdate || '', 'date')}
                    ${renderField('Educational attainment', 'applicantDetails.educationalAttainment', data.applicantDetails?.educationalAttainment || '', 'text')}
                    ${renderField('Contact number', 'applicantDetails.contactNumber', data.applicantDetails?.contactNumber || '', 'text')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Checklist</h4>
                    <p>Answer the membership checklist items exactly as required by the paper form.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderSelectField('Pantawid member', 'membershipChecklist.pantawidMember', data.membershipChecklist?.pantawidMember || '', ['', 'Yes', 'No'])}
                    ${renderField('Pantawid specify', 'membershipChecklist.pantawidSpecify', data.membershipChecklist?.pantawidSpecify || '', 'text')}
                    ${renderSelectField('SLPA member', 'membershipChecklist.slpaMember', data.membershipChecklist?.slpaMember || '', ['', 'Yes', 'No'])}
                    ${renderField('SLPA specify', 'membershipChecklist.slpaSpecify', data.membershipChecklist?.slpaSpecify || '', 'text')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Validator-only assessment on the paper form</h4>
                    <p>The recommendation, assistance-process assessment, ANGAYAN / DILI ANGAYAN decision, and validator identity fields remain reserved for staff review.</p>
                </div>
                <div class="post-approval-helperlist">
                    <article class="post-approval-staffcard">
                        <strong>Validator recommendation</strong>
                        <p>CSWDD staff will complete the recommendation block after reviewing your submitted validation form.</p>
                    </article>
                    <article class="post-approval-staffcard">
                        <strong>Eligibility assessment</strong>
                        <p>Staff will record the applicant’s understanding of the assistance process and the ANGAYAN / DILI ANGAYAN decision after review.</p>
                    </article>
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Participant e-signature</h4>
                    <p>Attach the participant signature used for the paper validation form. Validator signature remains staff-only.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Signer name', 'participantSignature.signedName', data.participantSignature?.signedName || '', 'text')}
                    ${renderField('Date signed', 'participantSignature.signedDate', data.participantSignature?.signedDate || '', 'date')}
                    ${renderUploadField('Participant signature upload', 'participantSignature.signatureUpload', data.participantSignature?.signatureUpload || null)}
                </div>
            </section>
        `;
    }

    function renderFundReleaseEvidenceDesktop(payload) {
        const data = payload?.fundReleaseEvidence || {};
        return `
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Proof of Fund Release</h4>
                    <p>This is the final requirement. You stay under applicant status until CSWDD verifies an uploaded attachment that proves the fund was released.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Release date', 'fundReleaseEvidence.releaseDate', data.releaseDate || '', 'date')}
                    ${renderTextarea('Applicant note', 'fundReleaseEvidence.notes', data.notes || '', true, 'Optional note describing the release or the attached evidence.')}
                    ${renderUploadField('Proof of fund release attachment', 'fundReleaseEvidence.releaseAttachment', data.releaseAttachment || null)}
                </div>
            </section>
        `;
    }

    function renderFundReleaseEvidenceMobile(payload) {
        return renderFundReleaseEvidenceDesktop(payload);
    }

    function renderBusinessPlanDesktop(payload) {
        const data = payload || {};
        const overview = data.overview || {};
        const products = ensureRows(data.productsServices?.rows, { name: '', description: '', price: '', targetMarket: '' }, getHardCopyRowLimit('add-bp-product'));
        const scheduleRows = ensureRows(data.implementationSchedule?.rows, { activity: '', targetDate: '', responsiblePerson: '' }, getHardCopyRowLimit('add-bp-schedule'));
        const market = data.marketStrategy || {};
        const operations = data.operationsPlan || {};
        const financial = data.financialPlan || {};
        const risks = data.riskManagement || {};
        const approval = data.staffReview?.approval || {};

        return `
            <div class="paper-document paper-document--business-plan">
                ${renderBusinessPlanPaperPage(1, `
                    <header class="bp-title-page">
                        <h2>BUSINESS PLAN</h2>
                        <div class="bp-title-subhead">EXECUTIVE SUMMARY (BUSINESS DESCRIPTION)</div>
                    </header>
                    ${renderBusinessPlanPromptBlock('1.', 'Brief Description of the Business/Project', 'Brief Description of the Project (What is the nature of the project?)', `
                        ${renderBusinessPlanHiddenField('overview.businessName', overview.businessName || '')}
                        ${renderBusinessPlanNarrativeField('executiveSummary', data.executiveSummary || '', 8)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.', 'Brief Profile of the Entrepreneur', 'Brief Profile of the Entrepreneur (What are the entrepreneur’s skills and qualifications?)', `
                        ${renderBusinessPlanHiddenField('overview.ownerName', overview.ownerName || '')}
                        ${renderBusinessPlanHiddenField('overview.contactNumber', overview.contactNumber || '')}
                        ${renderBusinessPlanHiddenField('overview.businessAddress', overview.businessAddress || '')}
                        ${renderBusinessPlanNarrativeField('overview.businessGoal', overview.businessGoal || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('3.', 'Contributions of the Project to the Economy', 'Contributions of the Project to the Economy (What are the contributions of the project to the local and national economy?)', `
                        ${renderBusinessPlanNarrativeField('riskManagement.mitigation', risks.mitigation || '', 7)}
                    `)}
                    <div class="bp-section-heading">Part 1: Marketing Plan</div>
                    ${renderBusinessPlanPromptBlock('1.1', 'Description of the Product', 'Description of the Product (What is the product?)', `
                        ${renderBusinessPlanProductsRows(products)}
                    `, 'is-product-block')}
                `)}
                ${renderBusinessPlanPaperPage(2, `
                    ${renderBusinessPlanPromptBlock('1.2', 'Comparison of the Product with its Competitors', 'Comparison of the Product with its Competitors (How does it compare in quality and price with its competitors?)', `
                        ${renderBusinessPlanNarrativeField('marketStrategy.competitors', market.competitors || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.3', 'Location', 'Location (Where will the business be located?)', `
                        ${renderBusinessPlanNarrativeField('operationsPlan.businessLocation', operations.businessLocation || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.4', 'Market Area', 'Market Area (What geographic areas will the project cover?)', `
                        ${renderBusinessPlanNarrativeField('marketStrategy.salesChannel', market.salesChannel || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.5', 'Primary Customers', 'Primary Customers (Within the market area, to whom will the business sell its products?)', `
                        ${renderBusinessPlanNarrativeField('marketStrategy.customerProfile', market.customerProfile || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.6', 'Total Demand', 'Total Demand (Can it be estimated how much of the product is currently being sold?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.monthlySalesProjection', financial.monthlySalesProjection || '', 4)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.7', 'Selling Price', 'Selling Price (What is the selling price of the product?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.projectedNetIncome', financial.projectedNetIncome || '', 4)}
                    `)}
                `)}
                ${renderBusinessPlanPaperPage(3, `
                    ${renderBusinessPlanPromptBlock('1.8', 'Promotional Measures', 'Promotional Measures (What promotional measures will be used in selling the product?)', `
                        ${renderBusinessPlanNarrativeField('marketStrategy.marketingApproach', market.marketingApproach || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.9', 'Marketing Strategy', 'Marketing Strategy (What marketing strategy is needed to ensure that the sales forecasts are achieved?)', `
                        ${renderBusinessPlanNarrativeField('marketStrategy.salesChannel', market.salesChannel || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.10', 'Marketing Budget', 'Marketing Budget (How much do you need to promote and distribute your product?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.monthlyExpenseProjection', financial.monthlyExpenseProjection || '', 4)}
                    `)}
                    <div class="bp-section-heading">Part 2: Production Plan</div>
                    ${renderBusinessPlanPromptBlock('2.1', 'Production / Service Process', 'Production / Service Process (What is the production or service process?)', `
                        ${renderBusinessPlanNarrativeField('operationsPlan.productionProcess', operations.productionProcess || '', 7)}
                    `)}
                `)}
                ${renderBusinessPlanPaperPage(4, `
                    ${renderBusinessPlanPromptBlock('2.2', 'Fixed Capital', 'What buildings and machinery (fixed assets) are needed and what are their costs?', `
                        ${renderBusinessPlanNarrativeField('operationsPlan.equipmentNeeded', operations.equipmentNeeded || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.3', 'Life of Fixed Capital', 'Life of Fixed Capital (What is the useful life of the building and machinery?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.breakEvenNotes', financial.breakEvenNotes || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.4', 'Sources of Equipment', 'Sources of Equipment (When and where will the machinery be obtained?)', `
                        ${renderBusinessPlanNarrativeField('operationsPlan.equipmentNeeded', operations.equipmentNeeded || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.5', 'Planned Capacity', 'Planned Capacity (How much capacity will be used?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.breakEvenNotes', financial.breakEvenNotes || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.6', 'Future Capacity', 'Future Capacity (What are the plans for using extra capacity?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.breakEvenNotes', financial.breakEvenNotes || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.7', 'Raw Materials', 'How many raw materials are needed?', `
                        ${renderBusinessPlanNarrativeField('operationsPlan.productionProcess', operations.productionProcess || '', 5)}
                    `)}
                `)}
                ${renderBusinessPlanPaperPage(5, `
                    ${renderBusinessPlanPromptBlock('2.8', 'Cost of Raw Materials', 'Cost of Raw Materials (What is the cost of the raw materials?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.projectedNetIncome', financial.projectedNetIncome || '', 4)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.9', 'Availability of Raw Materials', 'Availability of Raw Materials (What are the sources of raw materials? Are they available the whole year?)', `
                        ${renderBusinessPlanNarrativeField('riskManagement.risks', risks.risks || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.10', 'Labor', 'Labor (How many direct and indirect jobs are required and what skills are needed?)', `
                        ${renderBusinessPlanNarrativeField('operationsPlan.staffingPlan', operations.staffingPlan || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.11', 'Cost of Labor', 'Cost of Labor (What is the cost of labor?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.monthlyExpenseProjection', financial.monthlyExpenseProjection || '', 4)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.12', 'Availability of Labor', 'Availability of Labor (Are the workers available the whole year? If not, what is the effect on production?)', `
                        ${renderBusinessPlanNarrativeField('operationsPlan.staffingPlan', operations.staffingPlan || '', 6)}
                    `)}
                    <div class="bp-section-heading">Part 3: Organization and Management Plan</div>
                    ${renderBusinessPlanPromptBlock('3.1', 'Pre-operating Activities', 'Pre-operating Activities (What pre-operating activities need to be done before the business starts operating?)', `
                        ${renderBusinessPlanScheduleRows(scheduleRows)}
                    `)}
                `)}
                ${renderBusinessPlanPaperPage(6, `
                    ${renderBusinessPlanPromptBlock('3.2', 'Pre-operating Costs', 'Pre-operating Costs (What expenses will be incurred before operations begin?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.monthlyExpenseProjection', financial.monthlyExpenseProjection || '', 5)}
                    `)}
                    <div class="bp-section-heading">Part 4: Financial Plan</div>
                    ${renderBusinessPlanPromptBlock('4.1', 'Project Cost', 'Project Cost (What is the total capital requirement?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.startupCapital', financial.startupCapital || '', 5)}
                    `)}
                    <section class="bp-signoff">
                        <div class="bp-signoff-row">
                            <div class="bp-signoff-label">Giandam ni:</div>
                            <div class="bp-signoff-body">
                                ${renderBusinessPlanLineOnlyField('applicantSignature.signedName', data.applicantSignature?.signedName || '', 'bp-sign-line')}
                                <div class="bp-sign-caption">(Name sa Benes)</div>
                                ${renderBusinessPlanInlineField('Petsa sa pirma', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date', 'bp-line--short')}
                                ${renderBusinessPlanUploadInline('I-upload ang pirma sa aplikante', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                            </div>
                        </div>
                        <div class="bp-signoff-row bp-signoff-row--staff">
                            <div class="bp-signoff-label">Gisusi ni:</div>
                            <div class="bp-signoff-body">
                                ${renderBusinessPlanLineOnlyField('businessPlanSignoff.reviewedByName', data.businessPlanSignoff?.reviewedByName || '', 'bp-sign-line')}
                            </div>
                        </div>
                        <div class="bp-signoff-row bp-signoff-row--staff">
                            <div class="bp-signoff-label">Namatikdan ni:</div>
                            <div class="bp-signoff-body bp-signoff-body--noted">
                                <div class="bp-noted-fixed">GOLDA V. POCON, RSW, MSSW, CESE<br>CGHD-II/CSWDO</div>
                                ${renderBusinessPlanNotedSignatureSlot(approval.signatureUpload || null)}
                                ${approval.reviewSummary ? `<div class="bp-review-note"><strong>Sumaryo sa review:</strong> ${escapeHtml(approval.reviewSummary)}</div>` : ''}
                                ${approval.recommendedAction ? `<div class="bp-review-note"><strong>Girekomendang aksyon:</strong> ${escapeHtml(approval.recommendedAction)}</div>` : ''}
                            </div>
                        </div>
                    </section>
                `)}
            </div>
        `;
    }

    function renderBusinessPlanPaperPage(pageNumber, content) {
        return `
            <section class="paper-sheet paper-sheet--business-plan bp-page bp-page--${pageNumber}">
                ${renderGovernmentPaperTopStrip()}
                ${content}
                ${renderGovernmentPaperFooterImage(pageNumber, 6)}
            </section>
        `;
    }

    function renderBusinessPlanPromptBlock(number, title, subtitle, body, extraClass = '') {
        return `
            <section class="bp-prompt ${escapeAttribute(extraClass)}">
                <div class="bp-prompt__title">${escapeHtml(number)} ${escapeHtml(title)}</div>
                <div class="bp-prompt__subtitle">${escapeHtml(subtitle)}</div>
                <div class="bp-prompt__body">${body}</div>
            </section>
        `;
    }

    function renderBusinessPlanInlineField(label, name, value, type = 'text', className = '', disabled = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `
            <label class="bp-inline ${escapeAttribute(className)}">
                <span class="bp-inline__label">${escapeHtml(label)}</span>
                ${ownership.note}
                <input class="bp-inline__input ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="${escapeAttribute(type || 'text')}" name="${escapeAttribute(name)}" value="${escapeAttribute(value ?? '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
            </label>
        `;
    }

    function renderBusinessPlanLineOnlyField(name, value, className = '', disabled = false, forceApplicant = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled, forceApplicant);
        return `
            ${ownership.note}
            <input class="bp-inline__input bp-inline__input--lineonly ${escapeAttribute(className)} ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="text" name="${escapeAttribute(name)}" value="${escapeAttribute(value ?? '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
        `;
    }

    function renderBusinessPlanHiddenField(name, value) {
        const ownership = buildFieldOwnershipAttributes(name, false);
        return `<input type="hidden" name="${escapeAttribute(name)}" value="${escapeAttribute(value ?? '')}" ${ownership.attrs}>`;
    }

    function renderBusinessPlanNarrativeField(name, value, rows = 7, disabled = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `
            <div class="bp-textarea-wrap">
                ${ownership.note}
                <textarea class="bp-textarea ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" name="${escapeAttribute(name)}" rows="${escapeAttribute(rows)}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>${escapeHtml(value ?? '')}</textarea>
            </div>
        `;
    }

    function renderBusinessPlanProductsRows(rows) {
        const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
        return `
            <div class="bp-essay-wrap" data-error-group="productsServices.rows">
                <div class="bp-required-note">At least one product or service description with real content is required to submit the Business Plan.</div>
                ${renderBusinessPlanNarrativeField('productsServices.rows.0.description', firstRow.description || '', 8)}
            </div>
        `;
    }

    function renderBusinessPlanScheduleRows(rows) {
        const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
        return `
            <div class="bp-essay-wrap" data-error-group="implementationSchedule.rows">
                <div class="bp-required-note">At least one pre-operating activity with real content is required to submit the Business Plan.</div>
                ${renderBusinessPlanNarrativeField('implementationSchedule.rows.0.activity', firstRow.activity || '', 7)}
            </div>
        `;
    }

    function renderBusinessPlanUploadInline(label, fieldKey, metadata, disabled = false) {
        const ownership = buildFieldOwnershipAttributes(fieldKey, disabled);
        const fileName = metadata?.original_name || '';
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const pad = renderSignaturePadField(fieldKey, metadata, {
            label,
            variant: 'inline',
            disabled,
            fallback: '',
        });
        if (pad) {
            return pad;
        }
        return `
            <div class="bp-upload-inline">
                ${ownership.note}
                <label class="bp-upload-inline__label ${ownership.disabled ? 'is-disabled' : ''}">
                    <input type="file" class="upload-input" data-upload-field="${escapeAttribute(fieldKey)}" ${ownership.attrs} accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf" ${ownership.disabled ? 'disabled' : ''}>
                    <span>${fileName ? 'Ilisi ang na-upload nga file' : (ownership.owner === FIELD_OWNER_STAFF ? 'Alang sa kawani sa CSWDD lamang' : escapeHtml(label))}</span>
                </label>
                ${fileUrl ? `<a class="upload-link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">Tan-awa ang na-upload nga file</a>` : ''}
            </div>
        `;
    }

    function renderBusinessPlanNotedSignatureSlot(metadata) {
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const fileName = metadata?.original_name || '';
        return `
            <div class="bp-upload-inline bp-upload-inline--noted">
                <div class="bp-sign-caption">Pirma sa Noted by</div>
                <div class="bp-signature-slot ${fileUrl ? 'has-file' : ''}">
                    ${fileUrl
                        ? `<a class="upload-link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">${escapeHtml(fileName || 'Tan-awa ang na-upload nga pirma')}</a>`
                        : '<span>Alang sa upload sa application review</span>'}
                </div>
            </div>
        `;
    }

    function renderBusinessPlanMobile(payload) {
        const data = payload || {};
        const overview = data.overview || {};
        const products = ensureRows(data.productsServices?.rows, { name: '', description: '', price: '', targetMarket: '' }, getHardCopyRowLimit('add-bp-product'));
        const scheduleRows = ensureRows(data.implementationSchedule?.rows, { activity: '', targetDate: '', responsiblePerson: '' }, getHardCopyRowLimit('add-bp-schedule'));
        const market = data.marketStrategy || {};
        const operations = data.operationsPlan || {};
        const financial = data.financialPlan || {};
        const risks = data.riskManagement || {};

        return `
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Business Plan</h4>
                    <p>Mobile version of the paper business plan using the same saved data.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderBusinessPlanHiddenField('overview.businessName', overview.businessName || '')}
                    ${renderBusinessPlanHiddenField('overview.ownerName', overview.ownerName || '')}
                    ${renderBusinessPlanHiddenField('overview.contactNumber', overview.contactNumber || '')}
                    ${renderBusinessPlanHiddenField('overview.businessAddress', overview.businessAddress || '')}
                    ${renderTextarea('1. Brief Description of the Business/Project', 'executiveSummary', data.executiveSummary || '', true, 'Brief Description of the Project (What is the nature of the project?)')}
                    ${renderTextarea('2. Brief Profile of the Entrepreneur', 'overview.businessGoal', overview.businessGoal || '', true, 'Brief Profile of the Entrepreneur (What are the entrepreneur’s skills and qualifications?)')}
                    ${renderTextarea('3. Contributions of the Project to the Economy', 'riskManagement.mitigation', risks.mitigation || '', true, 'Contributions of the Project to the Economy')}
                </div>
            </section>
            <section class="post-approval-section post-approval-section--mungkahing" data-error-group="productsServices.rows">
                <div class="post-approval-section__header">
                    <h4>1.1 Description of the Product</h4>
                    <p>Description of the Product (What is the product?)</p>
                    <small class="post-approval-repeatable__hint">At least one product or service description with real content is required.</small>
                </div>
                <div class="post-approval-fields">
                    ${renderTextarea('1.1 Description of the Product', 'productsServices.rows.0.description', products[0]?.description || '', true)}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header"><h4>Part 1: Marketing Plan</h4><p>Reordered for mobile while keeping the paper prompt sequence.</p></div>
                <div class="post-approval-fields">
                    ${renderTextarea('1.2 Comparison of the Product with its Competitors', 'marketStrategy.competitors', market.competitors || '', true)}
                    ${renderTextarea('1.3 Location', 'operationsPlan.businessLocation', operations.businessLocation || '', true)}
                    ${renderTextarea('1.4 Market Area', 'marketStrategy.salesChannel', market.salesChannel || '', true)}
                    ${renderTextarea('1.5 Primary Customers', 'marketStrategy.customerProfile', market.customerProfile || '', true)}
                    ${renderTextarea('1.6 Total Demand', 'financialPlan.monthlySalesProjection', financial.monthlySalesProjection || '', true)}
                    ${renderTextarea('1.7 Selling Price', 'financialPlan.projectedNetIncome', financial.projectedNetIncome || '', true)}
                    ${renderTextarea('1.8 Promotional Measures', 'marketStrategy.marketingApproach', market.marketingApproach || '', true)}
                    ${renderTextarea('1.9 Marketing Strategy', 'marketStrategy.salesChannel', market.salesChannel || '', true)}
                    ${renderTextarea('1.10 Marketing Budget', 'financialPlan.monthlyExpenseProjection', financial.monthlyExpenseProjection || '', true)}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header"><h4>Part 2: Production Plan</h4><p>Prompts covering production, capacity, materials, and labor.</p></div>
                <div class="post-approval-fields">
                    ${renderTextarea('2.1 Production / Service Process', 'operationsPlan.productionProcess', operations.productionProcess || '', true)}
                    ${renderTextarea('2.2 Fixed Capital', 'operationsPlan.equipmentNeeded', operations.equipmentNeeded || '', true)}
                    ${renderTextarea('2.3 Life of Fixed Capital', 'financialPlan.breakEvenNotes', financial.breakEvenNotes || '', true)}
                    ${renderTextarea('2.4 Sources of Equipment', 'operationsPlan.equipmentNeeded', operations.equipmentNeeded || '', true)}
                    ${renderTextarea('2.5 Planned Capacity', 'financialPlan.breakEvenNotes', financial.breakEvenNotes || '', true)}
                    ${renderTextarea('2.6 Future Capacity', 'financialPlan.breakEvenNotes', financial.breakEvenNotes || '', true)}
                    ${renderTextarea('2.7 Raw Materials', 'operationsPlan.productionProcess', operations.productionProcess || '', true)}
                    ${renderTextarea('2.8 Cost of Raw Materials', 'financialPlan.projectedNetIncome', financial.projectedNetIncome || '', true)}
                    ${renderTextarea('2.9 Availability of Raw Materials', 'riskManagement.risks', risks.risks || '', true)}
                    ${renderTextarea('2.10 Labor', 'operationsPlan.staffingPlan', operations.staffingPlan || '', true)}
                    ${renderTextarea('2.11 Cost of Labor', 'financialPlan.monthlyExpenseProjection', financial.monthlyExpenseProjection || '', true)}
                    ${renderTextarea('2.12 Availability of Labor', 'operationsPlan.staffingPlan', operations.staffingPlan || '', true)}
                </div>
            </section>
            <section class="post-approval-section post-approval-section--mungkahing" data-error-group="implementationSchedule.rows">
                <div class="post-approval-section__header">
                    <h4>3.1 Pre-operating Activities</h4>
                    <p>What pre-operating activities are required before the business can operate?</p>
                    <small class="post-approval-repeatable__hint">At least one pre-operating activity with real content is required.</small>
                </div>
                <div class="post-approval-fields">
                    ${renderTextarea('3.1 Pre-operating Activities', 'implementationSchedule.rows.0.activity', scheduleRows[0]?.activity || '', true)}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header"><h4>Part 3: Organization and Management Plan</h4><p>Pre-operating activities and expenses.</p></div>
                <div class="post-approval-fields">
                    ${renderTextarea('3.2 Pre-operating Costs', 'financialPlan.monthlyExpenseProjection', financial.monthlyExpenseProjection || '', true)}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header"><h4>Part 4: Financial Plan</h4><p>Final capital requirement and applicant signature.</p></div>
                <div class="post-approval-fields">
                    ${renderTextarea('4.1 Project Cost', 'financialPlan.startupCapital', financial.startupCapital || '', true)}
                    ${renderField('Ngalan sa mipirma', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                    ${renderField('Petsa sa pirma', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date')}
                    ${renderUploadField('I-upload ang pirma sa aplikante', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                </div>
            </section>
        `;
    }

    function renderBusinessPlanMobileRowsSection(title, description, rows, addAction, rowRenderer) {
        const errorGroup = addAction === 'add-bp-product'
            ? 'productsServices.rows'
            : (addAction === 'add-bp-schedule' ? 'implementationSchedule.rows' : '');
        const hint = addAction === 'add-bp-product'
            ? 'At least one row must contain actual content.'
            : (addAction === 'add-bp-schedule' ? 'At least one activity row must contain actual content.' : '');
        return `
            <section class="post-approval-section post-approval-section--mungkahing" ${errorGroup ? `data-error-group="${escapeAttribute(errorGroup)}"` : ''}>
                <div class="post-approval-section__header">
                    <h4>${escapeHtml(title)}</h4>
                    <p>${escapeHtml(description)}</p>
                    ${hint ? `<small class="post-approval-repeatable__hint">${escapeHtml(hint)}</small>` : ''}
                </div>
                <div class="post-approval-repeatable">
                    <div class="post-approval-repeatable__header">
                        <span class="post-approval-repeatable__title">${escapeHtml(title)}</span>
                        <button type="button" class="btn-outline small" data-row-action="${escapeAttribute(addAction)}">Add row</button>
                    </div>
                    ${rows.map((row, index) => rowRenderer(row, index)).join('')}
                </div>
            </section>
        `;
    }

    function renderBusinessPlanProductRow(row, index) {
        return renderMungkahingRepeatableRow(`
            ${renderField('Produkto / Serbisyo', `productsServices.rows.${index}.name`, row.name || '', 'text')}
            ${renderField('Deskripsyon', `productsServices.rows.${index}.description`, row.description || '', 'text')}
            ${renderField('Presyo', `productsServices.rows.${index}.price`, row.price || '', 'number')}
            ${renderField('Target nga merkado', `productsServices.rows.${index}.targetMarket`, row.targetMarket || '', 'text')}
        `, 'remove-bp-product', index, 'Produkto');
    }

    function renderBusinessPlanScheduleRow(row, index) {
        return renderMungkahingRepeatableRow(`
            ${renderField('Kalihokan', `implementationSchedule.rows.${index}.activity`, row.activity || '', 'text')}
            ${renderField('Target nga petsa', `implementationSchedule.rows.${index}.targetDate`, row.targetDate || '', 'date')}
            ${renderField('Responsableng tawo', `implementationSchedule.rows.${index}.responsiblePerson`, row.responsiblePerson || '', 'text')}
        `, 'remove-bp-schedule', index, 'Iskedyul');
    }

    function renderBuhatSaPagpanumpaDesktop(payload) {
        const data = payload || {};
        const beneficiary = data.beneficiary || {};
        const project = data.project || {};
        const coMaker = data.coMaker || {};
        const agreement = data.agreement || {};
        const applicantSignature = data.applicantSignature || {};
        const coMakerSignature = data.coMakerSignature || {};

        return `
            <div class="paper-document paper-document--buhat">
                <section class="paper-sheet paper-sheet--buhat">
                    <header class="buhat-paper__header">
                        ${renderGovernmentPaperTopStrip()}
                        <div class="buhat-paper__title">BUHAT SA PAGPANUMPA</div>
                    </header>
                    <div class="buhat-paper__body">
                        <p class="buhat-paper__paragraph">
                            Ako si
                            ${renderBuhatPaperInlineField('beneficiary.fullName', beneficiary.fullName || '', 'xl')}
                            <span class="buhat-paper__literal">naa sa saktong edad, Pilipino, ug nagpuyo sa</span>
                            ${renderBuhatPaperInlineField('beneficiary.addressLine', beneficiary.addressLine || '', 'lg')}
                            <span class="buhat-paper__literal">,</span>
                            ${renderBuhatPaperInlineField('beneficiary.barangay', beneficiary.barangay || '', 'md')}
                            <span class="buhat-paper__literal">,</span>
                            ${renderBuhatPaperInlineField('beneficiary.city', beneficiary.city || '', 'md')}
                            <span class="buhat-paper__literal">pagkahuman ug panumpa sumala sa balaod, misaysay sa pagtuman niining mga sumusunod:</span>
                        </p>

                        <ol class="buhat-paper__clauses">
                            <li>
                                Ako usa ka benepisyaryo sa
                                ${renderBuhatPaperInlineField('project.programName', project.programName || '', 'lg')}
                                Program;
                            </li>
                            <li>
                                Tungod sa
                                ${renderBuhatPaperInlineField('project.projectName', project.projectName || '', 'lg')}
                                Program, ako makadawat ug kantidad nga
                                <span class="buhat-paper__literal">(Php</span>
                                ${renderBuhatPaperInlineField('project.amountReceived', project.amountReceived || '', 'md')}
                                <span class="buhat-paper__literal">)</span>
                                ug ako kining gamiton sa saktong katuyuan base sa mga dokumento nga akong gisumitar didto sa ahensya;
                            </li>
                            <li>Nga ako andam mo sumite o mohatag sa CSWDD sa mga resibo (Official Receipt or Acknowledgement Receipt) sa akong tanan napalit nga gamit o kahimanan, produkto usa ka semana human nako madawat ang Livelihood Assistance.</li>
                            <li>Nga ang mga resibo sa akong mga pinalit nga akong isumiti o ihatag sa CSWDD kinahanglan hinlo og walay pinapaan.</li>
                            <li>Nga ako usab nag saad nga moatubang kanunay sa LTWG, Monitoring Team sa CSWDD og uban pang mga grupo sa gobyerno sa panahon nga sila mag pahigayon og monitoring o mangumusta kanako kabahin sa akong Negosyo.</li>
                            <li>Nga ako nag saad sa angay o hustong pagdumala sa akong panginabuhian nga gihatag kanako sa CSWDD.</li>
                            <li>
                                Nga kung kini nga kasabutan og dili nako matuman tungod sa mga musunod na buhat sama sa;
                                <ul class="buhat-paper__subclauses">
                                    <li>Pagsugal, pag-inom ug uban pang bisyo</li>
                                    <li>Pag-invest sa pyramiding scheme</li>
                                    <li>Pagpalit ug gadgets nga dili kinahanglanon sa negosyo,</li>
                                    <li>Pagpa-utang</li>
                                    <li>Uban pang mga butang nga wala nakalatid ug nakabutang sa akong mungkahing proyekto.</li>
                                </ul>
                            </li>
                            <li>
                                Sa kantidad nga nadawat ni
                                ${renderBuhatPaperInlineField('beneficiary.fullName', beneficiary.fullName || '', 'lg')}
                                ako si
                                ${renderBuhatPaperInlineField('coMaker.fullName', coMaker.fullName || '', 'lg')}
                                <span class="buhat-paper__literal">naa sa saktong edad, Pilipino, ug nagpuyo sa</span>
                                ${renderBuhatPaperInlineField('coMaker.addressLine', coMaker.addressLine || '', 'md')}
                                <span class="buhat-paper__literal">,</span>
                                ${renderBuhatPaperInlineField('coMaker.barangay', coMaker.barangay || '', 'sm')}
                                <span class="buhat-paper__literal">,</span>
                                ${renderBuhatPaperInlineField('coMaker.city', coMaker.city || '', 'sm')}
                                <span class="buhat-paper__literal">nagsaad na mahimong responsable JOINTLY AND SEVERALLY sa pag-uli o pagbayad sa kantidad nga nadawat sulod sa bente kwatro (24) ka bulan kung si</span>
                                ${renderBuhatPaperInlineField('beneficiary.fullName', beneficiary.fullName || '', 'md')}
                                <span class="buhat-paper__literal">dili makatuman sa iyang gi komitar sa ahensiya or mobuhat ug mga buluhaton nga lista sa taas.</span>
                            </li>
                        </ol>

                        <p class="buhat-paper__paragraph">
                            Ako andam modawat og mosunod sa mga lakang nga ipahigayon ug ihatag kanako sa maong ahensya sama sa mosunod nga;
                        </p>
                        <ol class="buhat-paper__clauses buhat-paper__clauses--lettered" type="a">
                            <li>Counselling</li>
                            <li>Pag uli sa ayudang nadawat nga nagkantidad ug Fifteen Thousand Pesos (P15,000.00) sulod sa bente kwatro (24) ka bulan pinaagi sa monthly nga pagbayad nagkantidad ug Six Hundred Twenty-five Pesos (P625.00)</li>
                            <li>Ang dili pagtuman sa sumusunod nga lakang mamahimong hinungdan sa pagka blacklist sa mosunod nga susamang ayuda.</li>
                        </ol>

                        <p class="buhat-paper__paragraph">
                            Isip sa pagmatuod sa akong pag-uyon og kumpletong pagsabot niining maong kasabutan, ako kining paga pirmahan ibabaw sa akong pangalan karong adlawa
                            ${renderBuhatPaperInlineField('agreement.dateSigned', agreement.dateSigned || '', 'md')}
                            ,
                            ${renderBuhatPaperInlineField('agreement.yearSigned', agreement.yearSigned || '', 'xs')}
                            <span class="buhat-paper__literal">.</span>
                        </p>

                        <section class="buhat-paper__signatures">
                            <div class="buhat-paper__signature-col">
                                <div class="buhat-paper__signature-head">Prepared by:</div>
                                ${renderBuhatPaperSignatureBlock(
                                    'applicantSignature.signedName',
                                    applicantSignature.signedName || '',
                                    'applicantSignature.signatureUpload',
                                    applicantSignature.signatureUpload || null,
                                    'Name and Signature of Beneficiary'
                                )}
                            </div>
                            <div class="buhat-paper__signature-col">
                                <div class="buhat-paper__signature-head">Co-maker:</div>
                                ${renderBuhatPaperSignatureBlock(
                                    'coMakerSignature.signedName',
                                    coMakerSignature.signedName || '',
                                    'coMakerSignature.signatureUpload',
                                    coMakerSignature.signatureUpload || null,
                                    'Name and Signature of Co-maker'
                                )}
                            </div>
                        </section>

                    </div>
                    <footer class="buhat-paper__footer">
                        <div class="buhat-paper__footer-left">
                            <div><strong>Phone:</strong> &nbsp; +639562241679 / +639816016317</div>
                            <div><strong>Email:</strong> &nbsp; cswdobutuan@gmail.com</div>
                            <div><strong>Website:</strong> &nbsp; http://www.butuan.gov.ph</div>
                        </div>
                        <div class="buhat-paper__footer-right">
                            <img src="${escapeAttribute(mungkahingAssetUrl('butuanon-logo.png'))}" alt="ButuanON logo">
                            <small>CSWDO.DPSD.F.59 REV01</small>
                        </div>
                    </footer>
                </section>
            </div>
        `;
    }

    function renderBuhatSaPagpanumpaMobile(payload) {
        const data = payload || {};
        const beneficiary = data.beneficiary || {};
        const project = data.project || {};
        const coMaker = data.coMaker || {};
        const agreement = data.agreement || {};
        const verification = data.staffReview?.verification || {};

        return `
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Buhat sa Pagpanumpa</h4>
                    <p>Mobile nga bersyon sa kasulatan sa panumpa gamit ang parehas nga nasave nga datos sa desktop.</p>
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Impormasyon sa benepisyaryo</h4>
                    <p>Pun-a ang mga detalye nga gigamit sa pangunang linya sa kasulatan.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Tibuok nga ngalan', 'beneficiary.fullName', beneficiary.fullName || '', 'text')}
                    ${renderField('Edad', 'beneficiary.age', beneficiary.age || '', 'number')}
                    ${renderField('Address line', 'beneficiary.addressLine', beneficiary.addressLine || '', 'text', true)}
                    ${renderField('Barangay', 'beneficiary.barangay', beneficiary.barangay || '', 'text')}
                    ${renderField('Dakbayan', 'beneficiary.city', beneficiary.city || '', 'text')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Programa ug proyekto</h4>
                    <p>Mga detalye sa programa, proyekto, ug kantidad nga nadawat.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Ngalan sa programa', 'project.programName', project.programName || '', 'text')}
                    ${renderField('Ngalan sa proyekto', 'project.projectName', project.projectName || '', 'text', true)}
                    ${renderField('Kantidad nga nadawat', 'project.amountReceived', project.amountReceived || '', 'number')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Impormasyon sa co-maker</h4>
                    <p>Mga detalye sa tawo nga mopirma isip co-maker sa kasabutan.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Tibuok nga ngalan', 'coMaker.fullName', coMaker.fullName || '', 'text')}
                    ${renderField('Address line', 'coMaker.addressLine', coMaker.addressLine || '', 'text', true)}
                    ${renderField('Barangay', 'coMaker.barangay', coMaker.barangay || '', 'text')}
                    ${renderField('Dakbayan', 'coMaker.city', coMaker.city || '', 'text')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Petsa sa kasabutan</h4>
                    <p>Ibutang ang petsa sa pagpirma ug ang tuig nga isulat sa panumpa.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Petsa sa pagpirma', 'agreement.dateSigned', agreement.dateSigned || '', 'date')}
                    ${renderField('Tuig', 'agreement.yearSigned', agreement.yearSigned || '', 'number')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Pirma sa benepisyaryo</h4>
                    <p>Ibutang ang ngalan sa mipirma ug i-upload ang pirma sa benepisyaryo.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Ngalan sa mipirma', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                    ${renderUploadField('I-upload ang pirma sa benepisyaryo', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Pirma sa co-maker</h4>
                    <p>Ibutang ang ngalan sa co-maker ug i-upload ang pirma alang sa kasabutan.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Ngalan sa mipirma', 'coMakerSignature.signedName', data.coMakerSignature?.signedName || '', 'text')}
                    ${renderUploadField('I-upload ang pirma sa co-maker', 'coMakerSignature.signatureUpload', data.coMakerSignature?.signatureUpload || null)}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Verification sa CSWDD staff</h4>
                    <p>Kining bahina para lamang sa reviewer sa CSWDD ug dili editable sa aplikante.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Reviewer name', 'staffReview.verification.reviewerName', verification.reviewerName || '', 'text', false, true)}
                    ${renderField('Reviewer title', 'staffReview.verification.reviewerTitle', verification.reviewerTitle || '', 'text', false, true)}
                    ${renderField('Reviewer date', 'staffReview.verification.reviewerDate', verification.reviewerDate || '', 'date', false, true)}
                    ${renderTextarea('Remarks', 'staffReview.verification.remarks', verification.remarks || '', true, '', true)}
                </div>
            </section>
        `;
    }

    function renderBuhatPaperInlineField(name, value, size = 'md', type = 'text', disabled = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `<input class="buhat-paper__inline buhat-paper__inline--${escapeAttribute(size)} ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="${escapeAttribute(type)}" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>`;
    }

    function renderBuhatPaperSignatureBlock(nameKey, nameValue, uploadField, metadata, caption) {
        const ownership = buildFieldOwnershipAttributes(nameKey, false);
        const signaturePad = renderSignaturePadField(uploadField, metadata, {
            label: caption,
            previewLabel: caption,
            variant: 'inline',
            fallback: '',
        });
        const fileName = metadata?.original_name || '';
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';

        return `
            <div class="buhat-paper__signature-block">
                ${signaturePad || `
                    <div class="buhat-paper__signature-upload">
                        <label class="buhat-paper__upload-btn">
                            <input type="file" class="upload-input" data-upload-field="${escapeAttribute(uploadField)}" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf">
                            <span>${fileName ? 'Ilisi ang pirma' : 'Upload pirma'}</span>
                        </label>
                        ${fileUrl ? `<a class="upload-link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">Tan-awa ang na-upload nga file</a>` : ''}
                    </div>
                `}
                <input class="buhat-paper__signature-name ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="text" name="${escapeAttribute(nameKey)}" value="${escapeAttribute(nameValue || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
                <div class="buhat-paper__signature-caption">${escapeHtml(caption)}</div>
            </div>
        `;
    }

    function renderMungkahingDesktop(payload) {
        const data = payload || {};
        const project = data.projectInformation || {};
        const sectoral = data.sectoralClassification || {};
        const pantawid = sectoral.pantawid || {};
        const nonPantawid = sectoral.nonPantawid || {};
        const modalityRows = ensureRows(data.modalityApplications?.rows, { fundSource: '', contributionType: '', amount: '' }, getHardCopyRowLimit('add-mp-contribution'));
        const materialsRows = ensureRows(data.businessOperation?.materials?.rows, { material: '', quality: '', unit: '', unitPrice: '', cyclesPerProduction: '', projectedCost: '' }, getHardCopyRowLimit('add-mp-material'));
        const laborRows = ensureRows(data.businessOperation?.labor?.rows, { workerName: '', position: '', dailyWage: '' }, getHardCopyRowLimit('add-mp-labor'));
        const equipmentRows = ensureRows(data.businessOperation?.toolsEquipment?.rows, { equipment: '', capacity: '', unit: '', quantityOrPrice: '', projectedAmount: '', usefulLifeDays: '', productionCycle: '', depreciationCost: '' }, getHardCopyRowLimit('add-mp-equipment'));
        const expenseRows = ensureMungkahingExpenseRows(data.businessOperation?.operatingExpenses?.rows);
        const salesRows = ensureRows(data.businessOperation?.salesProjection?.rows, { product: '', capacity: '', unit: '', sellingPrice: '', projectedSales: '' }, getHardCopyRowLimit('add-mp-sale'));
        const spendingRows = ensureRows(data.spendingPlan?.rows, { expense: '', amount: '', usageSchedule: '' }, getHardCopyRowLimit('add-mp-spending'));
        const income = data.businessOperation?.incomeComputation || {};

        return `
            <div class="paper-document">
                <section class="paper-sheet">
                    <header class="paper-head">
                        <div class="paper-head__eyebrow">Mungkahing Proyekto</div>
                        <h3>Sustainable Market and Technology and Employment Assistance Program (SMART LEAP)</h3>
                    </header>
                    <section class="paper-block">
                        <h4>I. Kinatibuk-an Impormasyon Bahin sa Proyekto</h4>
                        <div class="paper-inline-grid paper-inline-grid--two">
                            ${renderDocumentField('Ngalan sa Partisipante', 'projectInformation.participantName', project.participantName || '', 'text')}
                            ${renderDocumentField('Lokasyon sa Proyekto', 'projectInformation.projectLocation', project.projectLocation || '', 'text')}
                            ${renderDocumentField('Ulohan sa Proyektong MD', 'projectInformation.projectTitle', project.projectTitle || '', 'text')}
                            ${renderDocumentField('Petsa sa Pagtukod', 'projectInformation.projectDate', project.projectDate || '', 'date')}
                            ${renderDocumentField('Kinatibuk-ang Kantidad', 'projectInformation.projectedAmount', project.projectedAmount || '', 'number')}
                            ${renderDocumentField('Savings Account No.', 'projectInformation.savingsAccountNumber', project.savingsAccountNumber || 'NONE', 'text')}
                            ${renderDocumentField('Kantidad gikan sa CSWDD', 'projectInformation.cswddAmount', project.cswddAmount || '', 'number')}
                            ${renderDocumentField('Laing kakuhaon sa pondo', 'projectInformation.otherFundingSource', project.otherFundingSource || '', 'text')}
                        </div>
                        ${renderDocumentMungkahingSectorTable(pantawid, nonPantawid)}
                    </section>
                    <section class="paper-block">
                        <h4>II. Rationale of the Proposed Project</h4>
                        ${renderDocumentTextarea('Rason sa mungkahing proyekto', 'rationale', data.rationale || '', 'span-2')}
                    </section>
                    <section class="paper-block">
                        <h4>III. Detalye sa Modality Application/s</h4>
                        <div class="paper-subtitle">Pondo nga gi-ambag sa mga partner/s: Self-Employment Assistance-Kaunlaran (SEA-K)</div>
                        ${renderPaperTableWithRows(
                            ['Kakuhuan sa Pondo', 'Gi-ambag', 'Kantidad'],
                            modalityRows.map((row, index) => [
                                `<span class="fixed-cell fixed-cell--modality">${escapeHtml(row.fundSource || '')}</span>`,
                                `<input class="paper-table__input" type="text" name="modalityApplications.rows.${index}.contributionType" value="${escapeAttribute(row.contributionType || '')}">`,
                                `<input class="paper-table__input" type="number" name="modalityApplications.rows.${index}.amount" value="${escapeAttribute(row.amount || '')}">`,
                            ])
                        )}
                    </section>
                    <section class="paper-block">
                        <h4>IV. Pagdumala sa Negosyo</h4>
                        <div class="paper-subtitle">a.) Mga gikinahanglan nga Materyales</div>
                        ${renderPaperTableWithRows(
                            ['Materials', 'Kadaghanon', 'Yunit', 'Presyo sa matag yunit', 'Dalas sa paggamit/Siklo sa Produksyon', 'Kinatibuk-ang kantidad', 'Actions'],
                            materialsRows.map((row, index) => [
                                `<input class="paper-table__input" type="text" name="businessOperation.materials.rows.${index}.material" value="${escapeAttribute(row.material || '')}">`,
                                `<input class="paper-table__input" type="text" name="businessOperation.materials.rows.${index}.quality" value="${escapeAttribute(row.quality || '')}">`,
                                `<input class="paper-table__input" type="text" name="businessOperation.materials.rows.${index}.unit" value="${escapeAttribute(row.unit || '')}">`,
                                `<input class="paper-table__input" type="number" name="businessOperation.materials.rows.${index}.unitPrice" value="${escapeAttribute(row.unitPrice || '')}">`,
                                `<input class="paper-table__input" type="text" name="businessOperation.materials.rows.${index}.cyclesPerProduction" value="${escapeAttribute(row.cyclesPerProduction || '')}">`,
                                `<input class="paper-table__input" type="number" name="businessOperation.materials.rows.${index}.projectedCost" value="${escapeAttribute(row.projectedCost || '')}">`,
                                `<button type="button" class="btn-outline small post-approval-row-action" data-row-action="remove-mp-material" data-row-index="${index}">Remove</button>`,
                            ])
                        )}
                        <div class="paper-inline-grid paper-inline-grid--one">
                            ${renderDocumentField('Kinatibuk-ang Total', 'businessOperation.materials.totalCost', data.businessOperation?.materials?.totalCost || '', 'number')}
                        </div>
                        <div class="paper-table-toolbar">
                            ${renderAddRowButton('add-mp-material', 'Add material row', materialsRows)}
                        </div>
                        <div class="paper-subtitle">b.) Mga gikinahanglan na Trabahante</div>
                        ${renderPaperTableWithRows(
                            ['Ngalan sa Magtrabaho sa Negosyo', 'Posisyon sa Trabaho', 'Inadlaw na Suweldo', 'Actions'],
                            laborRows.map((row, index) => [
                                `<input class="paper-table__input" type="text" name="businessOperation.labor.rows.${index}.workerName" value="${escapeAttribute(row.workerName || '')}">`,
                                `<input class="paper-table__input" type="text" name="businessOperation.labor.rows.${index}.position" value="${escapeAttribute(row.position || '')}">`,
                                `<input class="paper-table__input" type="number" name="businessOperation.labor.rows.${index}.dailyWage" value="${escapeAttribute(row.dailyWage || '')}">`,
                                `<button type="button" class="btn-outline small post-approval-row-action" data-row-action="remove-mp-labor" data-row-index="${index}">Remove</button>`,
                            ])
                        )}
                        <div class="paper-inline-grid paper-inline-grid--two">
                            ${renderDocumentField('Kinatibuk-an na inadlaw na suweldo', 'businessOperation.labor.totalDailyWage', data.businessOperation?.labor?.totalDailyWage || '', 'number')}
                            ${renderDocumentField('Kinatibuk-an na suweldo base sa siglo sa produksyon', 'businessOperation.labor.totalProductionCycleWage', data.businessOperation?.labor?.totalProductionCycleWage || '', 'number')}
                        </div>
                        <div class="paper-table-toolbar">
                            ${renderAddRowButton('add-mp-labor', 'Add labor row', laborRows)}
                        </div>
                    </section>
                </section>
                <section class="paper-sheet">
                    <section class="paper-block">
                        <div class="paper-subtitle">c.) Mga Gikinahanglan nga Kagamitan</div>
                        ${renderPaperTableWithRows(
                            ['Kagamitan', 'Kadaghanon', 'Yunit', 'Kantidad o presyo sa matag usa', 'Kinatibuk-an nga kantidad o presyo', 'Gitas-on sa kinabuhi sa mga himan/kagamitan', 'Siklo sa Produksyon', 'Depreciation Cost', 'Actions'],
                            equipmentRows.map((row, index) => [
                                `<input class="paper-table__input" type="text" name="businessOperation.toolsEquipment.rows.${index}.equipment" value="${escapeAttribute(row.equipment || '')}">`,
                                `<input class="paper-table__input" type="text" name="businessOperation.toolsEquipment.rows.${index}.capacity" value="${escapeAttribute(row.capacity || '')}">`,
                                `<input class="paper-table__input" type="text" name="businessOperation.toolsEquipment.rows.${index}.unit" value="${escapeAttribute(row.unit || '')}">`,
                                `<input class="paper-table__input" type="number" name="businessOperation.toolsEquipment.rows.${index}.quantityOrPrice" value="${escapeAttribute(row.quantityOrPrice || '')}">`,
                                `<input class="paper-table__input" type="number" name="businessOperation.toolsEquipment.rows.${index}.projectedAmount" value="${escapeAttribute(row.projectedAmount || '')}">`,
                                `<input class="paper-table__input" type="text" name="businessOperation.toolsEquipment.rows.${index}.usefulLifeDays" value="${escapeAttribute(row.usefulLifeDays || '')}">`,
                                `<input class="paper-table__input" type="text" name="businessOperation.toolsEquipment.rows.${index}.productionCycle" value="${escapeAttribute(row.productionCycle || '')}">`,
                                `<input class="paper-table__input" type="number" name="businessOperation.toolsEquipment.rows.${index}.depreciationCost" value="${escapeAttribute(row.depreciationCost || '')}">`,
                                `<button type="button" class="btn-outline small post-approval-row-action" data-row-action="remove-mp-equipment" data-row-index="${index}">Remove</button>`,
                            ])
                        )}
                        <div class="paper-inline-grid paper-inline-grid--one">
                            ${renderDocumentField('Kinatibuk-ang Total', 'businessOperation.toolsEquipment.totalCost', data.businessOperation?.toolsEquipment?.totalCost || '', 'number')}
                        </div>
                        <div class="paper-table-toolbar">
                            ${renderAddRowButton('add-mp-equipment', 'Add equipment row', equipmentRows)}
                        </div>
                        <div class="paper-subtitle">d.) Uban pang mga gastohanan</div>
                        ${renderPaperTableWithRows(
                            ['Regular na ginagastuhan', 'Dalas ng pagbayad', 'Kinatibuk-an na kantidad o presyo base sa siglo sa produksyon'],
                            expenseRows.map((row, index) => [
                                `<span class="paper-table__text">${escapeHtml(row.expenseName || '')}</span>`,
                                `<input class="paper-table__input" type="text" name="businessOperation.operatingExpenses.rows.${index}.paymentFrequency" value="${escapeAttribute(row.paymentFrequency || '')}">`,
                                `<input class="paper-table__input" type="number" name="businessOperation.operatingExpenses.rows.${index}.projectedCost" value="${escapeAttribute(row.projectedCost || '')}">`,
                            ])
                        )}
                        <div class="paper-inline-grid paper-inline-grid--one">
                            ${renderDocumentField('Grand Total', 'businessOperation.operatingExpenses.grandTotal', data.businessOperation?.operatingExpenses?.grandTotal || '', 'number')}
                        </div>
                        <div class="paper-subtitle">e.) Pangunahing kita gikan sa puhunan alang sa mga sangkap</div>
                        ${renderPaperTableWithRows(
                            ['Produkto', 'Kadaghanon', 'Yunit', 'Kantidad sa pagpamaligya matag piraso', 'Kinatibuk-an na kantidad sa pagpamaligya base sa siglo sa produksyon', 'Actions'],
                            salesRows.map((row, index) => [
                                `<input class="paper-table__input" type="text" name="businessOperation.salesProjection.rows.${index}.product" value="${escapeAttribute(row.product || '')}">`,
                                `<input class="paper-table__input" type="text" name="businessOperation.salesProjection.rows.${index}.capacity" value="${escapeAttribute(row.capacity || '')}">`,
                                `<input class="paper-table__input" type="text" name="businessOperation.salesProjection.rows.${index}.unit" value="${escapeAttribute(row.unit || '')}">`,
                                `<input class="paper-table__input" type="number" name="businessOperation.salesProjection.rows.${index}.sellingPrice" value="${escapeAttribute(row.sellingPrice || '')}">`,
                                `<input class="paper-table__input" type="number" name="businessOperation.salesProjection.rows.${index}.projectedSales" value="${escapeAttribute(row.projectedSales || '')}">`,
                                `<button type="button" class="btn-outline small post-approval-row-action" data-row-action="remove-mp-sale" data-row-index="${index}">Remove</button>`,
                            ])
                        )}
                        <div class="paper-inline-grid paper-inline-grid--one">
                            ${renderDocumentField('Gross Sales', 'businessOperation.salesProjection.grossSales', data.businessOperation?.salesProjection?.grossSales || '', 'number')}
                        </div>
                        <div class="paper-table-toolbar">
                            ${renderAddRowButton('add-mp-sale', 'Add sales row', salesRows)}
                        </div>
                    </section>
                    <section class="paper-block">
                        <div class="paper-subtitle">f.) Kinatibuk-ang kita sa matag produkto o paghimo sa serbisyo</div>
                        <div class="paper-inline-grid paper-inline-grid--two">
                            ${renderDocumentField('Gilauman nga kita alang sa usa ka "siklo sa produksyon"', 'businessOperation.incomeComputation.projectedIncomePerCycle', income.projectedIncomePerCycle || '', 'number')}
                            ${renderDocumentField('Mga materyales (raw materials)', 'businessOperation.incomeComputation.rawMaterialsCost', income.rawMaterialsCost || '', 'number')}
                            ${renderDocumentField('Gikinahanglan na manpower ug labor', 'businessOperation.incomeComputation.manpowerLaborCost', income.manpowerLaborCost || '', 'number')}
                            ${renderDocumentField('Depreciation Cost', 'businessOperation.incomeComputation.depreciationCost', income.depreciationCost || '', 'number')}
                            ${renderDocumentField('Uban pang mga Gasto', 'businessOperation.incomeComputation.otherExpenses', income.otherExpenses || '', 'number')}
                            ${renderDocumentField('Kinatibuk-ang gasto sa pag-operate', 'businessOperation.incomeComputation.totalOperatingCost', income.totalOperatingCost || '', 'number')}
                            ${renderDocumentField('Kinatibuk-ang ginansya human sa gasto sa operasyon (Gross Profit)', 'businessOperation.incomeComputation.grossProfit', income.grossProfit || '', 'number')}
                            ${renderDocumentField('Net profit', 'businessOperation.incomeComputation.netProfit', income.netProfit || '', 'number', 'span-2')}
                        </div>
                    </section>
                    <section class="paper-block">
                        <h4>g.) Iskedyul o Plano sa Paggasto sa SEA-K Capital Fund (SCF)</h4>
                        ${renderPaperTableWithRows(
                            ['Mga Gasto', 'Kantidad', 'Iskedyul sa Paggamit', 'Actions'],
                            spendingRows.map((row, index) => [
                                `<input class="paper-table__input" type="text" name="spendingPlan.rows.${index}.expense" value="${escapeAttribute(row.expense || '')}">`,
                                `<input class="paper-table__input" type="number" name="spendingPlan.rows.${index}.amount" value="${escapeAttribute(row.amount || '')}">`,
                                `<input class="paper-table__input" type="text" name="spendingPlan.rows.${index}.usageSchedule" value="${escapeAttribute(row.usageSchedule || '')}">`,
                                `<button type="button" class="btn-outline small post-approval-row-action" data-row-action="remove-mp-spending" data-row-index="${index}">Remove</button>`,
                            ])
                        )}
                        <div class="paper-table-toolbar">
                            ${renderAddRowButton('add-mp-spending', 'Add spending row', spendingRows)}
                        </div>
                    </section>
                    <section class="paper-block">
                        <h4>V. Rekomendasyon</h4>
                        ${renderPaperStatementBlock(
                            'Participant Sign-off',
                            renderPaperCertificationSentence('Gi-andam ni ug girepaso ingon nga mungkahing proyekto sa SMART LEAP.'),
                            renderPaperSignatureArea(
                                'Pirma ibabaw sa pangalan sa Partisipante',
                                `
                                    ${renderDocumentField('Signed name', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                                    ${renderDocumentField('Date signed', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date')}
                                    ${renderDocumentUpload('Participant signature upload', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                                `
                            )
                        )}
                    </section>
                </section>
            </div>
        `;
    }

    function renderAvailmentDesktop(payload) {
        const data = payload || {};
        const familyMembers = ensureRows(data.familyEnterprise?.members, { name: '', age: '', activities: '' }, getHardCopyRowLimit('add-family'));
        const incomeRows = ensureRows(data.incomeEligibility?.rows, { memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' }, getHardCopyRowLimit('add-income'));
        const commitments = data.clientCommitment || {};
        const agreedToRollBackSchedule = Boolean(commitments.agreedToRollBackSchedule ?? commitments.agreedToSavingsCommitment);
        const agreedToWeeklySavings = Boolean(commitments.agreedToWeeklySavings ?? commitments.agreedToSavingsCommitment);

        return `
            <div class="paper-document paper-document--availment">
                <section class="paper-sheet">
                    <div class="paper-head">
                        <p class="paper-head__eyebrow">SMART LEAP Availment Form</p>
                        <h3>City Social Welfare and Development Department</h3>
                        <p>City: Butuan City</p>
                    </div>

                    <div class="paper-block">
                        <h4>I. Client Identifying Data</h4>
                        <div class="paper-inline-grid paper-inline-grid--three">
                            ${renderDocumentField('Name', 'clientIdentifyingData.name', data.clientIdentifyingData?.name || '', 'text')}
                            ${renderDocumentField('Age', 'clientIdentifyingData.age', data.clientIdentifyingData?.age || '', 'number')}
                            ${renderDocumentField('Address', 'clientIdentifyingData.address', data.clientIdentifyingData?.address || '', 'text')}
                            ${renderDocumentField('Name of Spouse', 'clientIdentifyingData.spouseName', data.clientIdentifyingData?.spouseName || '', 'text', 'span-2')}
                            ${renderDocumentReadOnly('City', data.clientIdentifyingData?.city || 'Butuan City')}
                        </div>
                    </div>

                    <div class="paper-block">
                        <h4>II. Type of Project</h4>
                        <p class="paper-subtitle">A. Family Enterprise</p>
                        ${renderDocumentFamilyTable(familyMembers)}
                        <p class="paper-subtitle">B. Individual Assistance</p>
                        <div class="paper-inline-grid paper-inline-grid--two">
                            ${renderDocumentField('Clientele Category', 'individualAssistance.clienteleCategory', data.individualAssistance?.clienteleCategory || '', 'text')}
                            ${renderDocumentTextarea('Nature of difficult circumstances', 'individualAssistance.natureOfDifficultCircumstances', data.individualAssistance?.natureOfDifficultCircumstances || '', 'span-2')}
                        </div>
                    </div>

                    <div class="paper-block">
                        <h4>III. Income Eligibility Requirement</h4>
                        ${renderDocumentIncomeTable(incomeRows, data.incomeEligibility?.totalFamilyIncome || '')}
                    </div>
                </section>

                <section class="paper-sheet">
                    <div class="paper-block">
                        <h4>IV. Social Responsibility and Willingness to Save (Client)</h4>
                    </div>

                    <div class="paper-block">
                        <h4>Participant Signature</h4>
                        <div class="paper-inline-grid paper-inline-grid--three">
                            ${renderDocumentField('Signed name', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                            ${renderDocumentField('Date signed', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date')}
                            ${renderDocumentUpload('Participant signature upload', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    function renderValidationDesktop(payload) {
        const data = payload || {};
        const checklist = data.membershipChecklist || {};
        const eligibility = data.staffReview?.eligibilityAssessment || {};
        const identity = data.staffReview?.validatorIdentity || {};

        return `
            <div class="paper-document paper-document--validation">
                <section class="paper-sheet">
                    <div class="paper-head">
                        <p class="paper-head__eyebrow">Sustainable Market and Technology and Employment Assistance Program</p>
                        <h3>Validation Form</h3>
                    </div>

                    <div class="paper-block">
                        <div class="paper-inline-grid paper-inline-grid--two">
                            ${renderDocumentField('Date of Validation', 'applicantDetails.validationDate', data.applicantDetails?.validationDate || '', 'date')}
                            <div class="paper-spacer"></div>
                            ${renderDocumentField('Last Name', 'applicantDetails.lastName', data.applicantDetails?.lastName || '', 'text')}
                            ${renderDocumentField('First Name', 'applicantDetails.firstName', data.applicantDetails?.firstName || '', 'text')}
                            ${renderDocumentField('Middle Name', 'applicantDetails.middleName', data.applicantDetails?.middleName || '', 'text', 'span-2')}
                            ${renderDocumentField('Address / Purok', 'applicantDetails.purok', data.applicantDetails?.purok || '', 'text')}
                            ${renderDocumentField('Barangay', 'applicantDetails.barangay', data.applicantDetails?.barangay || '', 'text')}
                            ${renderDocumentField('Birthdate', 'applicantDetails.birthdate', data.applicantDetails?.birthdate || '', 'date')}
                            ${renderDocumentField('Educational Attainment', 'applicantDetails.educationalAttainment', data.applicantDetails?.educationalAttainment || '', 'text')}
                            ${renderDocumentField('Contact Number', 'applicantDetails.contactNumber', data.applicantDetails?.contactNumber || '', 'text', 'span-2')}
                        </div>
                    </div>

                    <div class="paper-block">
                        <h4>Checklist</h4>
                        ${renderValidationChecklistTable(checklist)}
                    </div>

                    <div class="paper-block">
                        <h4>Validator's Recommendation</h4>
                        ${renderDocumentTextarea('Recommendation', 'staffReview.validatorRecommendation', data.staffReview?.validatorRecommendation || '', 'span-2', true)}
                    </div>

                    <div class="paper-block">
                        <h4>Eligibility Assessment</h4>
                        <div class="paper-certification">
                            <p>I am <span class="paper-fillline">${escapeHtml(eligibility.residentName || '')}</span>, <span class="paper-fillline paper-fillline--short">${escapeHtml(eligibility.age || '')}</span> years old, residing at Barangay <span class="paper-fillline">${escapeHtml(eligibility.barangay || '')}</span>, Butuan City, Agusan del Norte. I understand the assistance process and I am <span class="paper-fillline">${escapeHtml(eligibility.eligibilityDecision || '')}</span> to avail the SMART LEAP program.</p>
                        </div>
                        <div class="paper-inline-grid paper-inline-grid--two">
                            ${renderDocumentSelect('Eligibility decision', 'staffReview.eligibilityAssessment.eligibilityDecision', eligibility.eligibilityDecision || '', ['', 'ANGAYAN', 'DILI ANGAYAN'], true)}
                        </div>
                    </div>

                    <div class="paper-block">
                        <h4>Signatures</h4>
                        <div class="paper-inline-grid paper-inline-grid--two">
                            ${renderDocumentField('Participant signed name', 'participantSignature.signedName', data.participantSignature?.signedName || '', 'text')}
                            ${renderDocumentField('Date signed', 'participantSignature.signedDate', data.participantSignature?.signedDate || '', 'date')}
                            ${renderDocumentUpload('Participant signature upload', 'participantSignature.signatureUpload', data.participantSignature?.signatureUpload || null)}
                            ${renderDocumentField('Validator name', 'staffReview.validatorIdentity.validatorName', identity.validatorName || '', 'text', '', true)}
                            ${renderDocumentField('Validator signed date', 'staffReview.validatorIdentity.signedDate', identity.signedDate || '', 'date', '', true)}
                            ${renderDocumentUpload('Validator signature upload', 'validatorIdentity.signatureUpload', identity.signatureUpload || null, true)}
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    // Override the earlier mobile renderers so mobile uses the same content set as desktop.
    function renderAvailmentMobile(payload) {
        const data = payload || {};
        const commitments = data.clientCommitment || {};
        const agreedToRollBackSchedule = Boolean(commitments.agreedToRollBackSchedule ?? commitments.agreedToSavingsCommitment);
        const agreedToWeeklySavings = Boolean(commitments.agreedToWeeklySavings ?? commitments.agreedToSavingsCommitment);
        const familyMembers = ensureRows(data.familyEnterprise?.members, { name: '', age: '', activities: '' }, getHardCopyRowLimit('add-family'));
        const incomeRows = ensureRows(data.incomeEligibility?.rows, { memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' }, getHardCopyRowLimit('add-income'));
        const staffReview = data.staffReview || {};
        const physicalRequirements = staffReview.physicalRequirements || {};
        const healthRows = ensureRows(physicalRequirements.healthAgeRows, { requirement: '', age: '', healthStatus: '' }, getHardCopyRowLimit('add-health'));
        const foodRelatedCertification = physicalRequirements.foodRelatedCertification || {};
        const psychoSocialRequirements = staffReview.psychoSocialRequirements || {};
        const residencyAndCharacter = psychoSocialRequirements.residencyAndCharacter || {};
        const familyRelationships = psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration || {};
        const socialResponsibility = psychoSocialRequirements.socialResponsibility || {};

        return `
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Client identifying data</h4>
                    <p>Applicant-entered details from the SMART LEAP Availment Form.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Client name', 'clientIdentifyingData.name', data.clientIdentifyingData?.name || '', 'text')}
                    ${renderField('Age', 'clientIdentifyingData.age', data.clientIdentifyingData?.age || '', 'number')}
                    ${renderField('Address', 'clientIdentifyingData.address', data.clientIdentifyingData?.address || '', 'text', true)}
                    ${renderField('Name of spouse', 'clientIdentifyingData.spouseName', data.clientIdentifyingData?.spouseName || '', 'text')}
                    ${renderReadOnlyField('City', data.clientIdentifyingData?.city || 'Butuan City')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Type of project: Family Enterprise</h4>
                    <p>List all family members participating in the enterprise and what each one will do.</p>
                </div>
                <div class="post-approval-repeatable" data-repeatable="familyMembers">
                    <div class="post-approval-repeatable__header">
                        <span class="post-approval-repeatable__title">Family members participating</span>
                        ${renderAddRowButton('add-family', 'Add family member', familyMembers)}
                    </div>
                    ${familyMembers.map((row, index) => renderFamilyMemberRow(row, index)).join('')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Type of project: Individual Assistance</h4>
                    <p>Capture the applicant-facing narrative fields from the paper form.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Clientele category', 'individualAssistance.clienteleCategory', data.individualAssistance?.clienteleCategory || '', 'text')}
                    ${renderTextarea('Nature of difficult circumstances', 'individualAssistance.natureOfDifficultCircumstances', data.individualAssistance?.natureOfDifficultCircumstances || '', true, 'Describe the circumstance that supports the availment request.')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Income eligibility requirement</h4>
                    <p>Provide the working family members and their monthly income details.</p>
                </div>
                <div class="post-approval-repeatable" data-repeatable="incomeRows">
                    <div class="post-approval-repeatable__header">
                        <span class="post-approval-repeatable__title">Monthly income rows</span>
                        ${renderAddRowButton('add-income', 'Add income row', incomeRows)}
                    </div>
                    ${incomeRows.map((row, index) => renderIncomeRow(row, index)).join('')}
                </div>
                <div class="post-approval-fields">
                    ${renderField('Total family income', 'incomeEligibility.totalFamilyIncome', data.incomeEligibility?.totalFamilyIncome || '', 'number')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Social responsibility and willingness to save</h4>
                    <p>This mirrors the client-side commitment section from the paper availment form.</p>
                </div>
                <label class="checkbox-field">
                    <input type="checkbox" name="clientCommitment.agreedToPolicies" ${commitments.agreedToPolicies ? 'checked' : ''}>
                    <span>I agree to abide by the SMART LEAP policies and guidelines set by CSWDD.</span>
                </label>
                <label class="checkbox-field">
                    <input type="checkbox" name="clientCommitment.agreedToRollBackSchedule" ${agreedToRollBackSchedule ? 'checked' : ''}>
                    <span>I promise to pay the SMART LEAP roll-back on the time stipulated in the program.</span>
                </label>
                <label class="checkbox-field">
                    <input type="checkbox" name="clientCommitment.agreedToWeeklySavings" ${agreedToWeeklySavings ? 'checked' : ''}>
                    <span>I will generate weekly savings to prepare for emergencies that may affect my family.</span>
                </label>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Applicant e-signature</h4>
                    <p>Attach the participant signature used for the paper availment form. This will remain with your saved draft and submission.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Signer name', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                    ${renderField('Date signed', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date')}
                    ${renderUploadField('Participant signature upload', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>IV. Social Responsibility and Willingness to Save (Client)</h4>
                    <p>Applicant commitment details only.</p>
                </div>
            </section>
        `;
    }

    function renderValidationMobile(payload) {
        const data = payload || {};
        const checklist = data.membershipChecklist || {};
        const eligibility = data.staffReview?.eligibilityAssessment || {};
        const identity = data.staffReview?.validatorIdentity || {};

        return `
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Applicant details</h4>
                    <p>Fill the applicant-side information block from the SMART LEAP Validation Form.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Date of validation', 'applicantDetails.validationDate', data.applicantDetails?.validationDate || '', 'date')}
                    ${renderField('Last name', 'applicantDetails.lastName', data.applicantDetails?.lastName || '', 'text')}
                    ${renderField('First name', 'applicantDetails.firstName', data.applicantDetails?.firstName || '', 'text')}
                    ${renderField('Middle name', 'applicantDetails.middleName', data.applicantDetails?.middleName || '', 'text')}
                    ${renderField('Purok', 'applicantDetails.purok', data.applicantDetails?.purok || '', 'text')}
                    ${renderField('Barangay', 'applicantDetails.barangay', data.applicantDetails?.barangay || '', 'text')}
                    ${renderField('Birthdate', 'applicantDetails.birthdate', data.applicantDetails?.birthdate || '', 'date')}
                    ${renderField('Educational attainment', 'applicantDetails.educationalAttainment', data.applicantDetails?.educationalAttainment || '', 'text')}
                    ${renderField('Contact number', 'applicantDetails.contactNumber', data.applicantDetails?.contactNumber || '', 'text')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Checklist</h4>
                    <p>Answer the membership checklist items exactly as required by the paper form.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderSelectField('Pantawid member', 'membershipChecklist.pantawidMember', checklist.pantawidMember || '', ['', 'Yes', 'No'])}
                    ${renderField('Pantawid specify', 'membershipChecklist.pantawidSpecify', checklist.pantawidSpecify || '', 'text')}
                    ${renderSelectField('SLPA member', 'membershipChecklist.slpaMember', checklist.slpaMember || '', ['', 'Yes', 'No'])}
                    ${renderField('SLPA specify', 'membershipChecklist.slpaSpecify', checklist.slpaSpecify || '', 'text')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Validator recommendation</h4>
                    <p>The staff-only review sections remain visible on mobile so the same content appears in both render modes.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderTextarea('Recommendation', 'staffReview.validatorRecommendation', data.staffReview?.validatorRecommendation || '', true, '', true)}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Eligibility assessment</h4>
                    <p>This staff-only section matches the desktop paper-style validation rendering.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Resident name', 'staffReview.eligibilityAssessment.residentName', eligibility.residentName || '', 'text', false, true)}
                    ${renderField('Age', 'staffReview.eligibilityAssessment.age', eligibility.age || '', 'text', false, true)}
                    ${renderField('Barangay', 'staffReview.eligibilityAssessment.barangay', eligibility.barangay || '', 'text', false, true)}
                    ${renderSelectField('Eligibility decision', 'staffReview.eligibilityAssessment.eligibilityDecision', eligibility.eligibilityDecision || '', ['', 'ANGAYAN', 'DILI ANGAYAN'], true)}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Participant e-signature</h4>
                    <p>Attach the participant signature used for the paper validation form. Validator signature remains staff-only.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Signer name', 'participantSignature.signedName', data.participantSignature?.signedName || '', 'text')}
                    ${renderField('Date signed', 'participantSignature.signedDate', data.participantSignature?.signedDate || '', 'date')}
                    ${renderUploadField('Participant signature upload', 'participantSignature.signatureUpload', data.participantSignature?.signatureUpload || null)}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Validator sign-off</h4>
                    <p>Validator identity and signature upload remain staff-only, but the same section appears on mobile for content parity.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Validator name', 'staffReview.validatorIdentity.validatorName', identity.validatorName || '', 'text', false, true)}
                    ${renderField('Validator signed date', 'staffReview.validatorIdentity.signedDate', identity.signedDate || '', 'date', false, true)}
                    ${renderUploadField('Validator signature upload', 'validatorIdentity.signatureUpload', identity.signatureUpload || null, true)}
                </div>
            </section>
        `;
    }

    function renderStaffSections(sections, reviewerRemarks) {
        const cards = sections.map((section) => `
            <article class="post-approval-staffcard">
                <strong>${escapeHtml(section.title || 'Staff section')}</strong>
                <p>${escapeHtml(section.description || '')}</p>
            </article>
        `).join('');

        const remarks = reviewerRemarks
            ? `<article class="post-approval-staffcard is-warning"><strong>Reviewer remarks</strong><p>${escapeHtml(reviewerRemarks)}</p></article>`
            : '';

        return cards + remarks;
    }

    function renderDocumentReadOnly(label, value, spanClass = '') {
        return `
            <label class="paper-field ${escapeAttribute(spanClass)}">
                <span class="paper-field__label">${escapeHtml(label)}</span>
                <div class="paper-field__value">${escapeHtml(value ?? '') || '&nbsp;'}</div>
            </label>
        `;
    }

    function renderDocumentField(label, name, value, type, spanClass = '', disabled = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `
            <label class="paper-field ${escapeAttribute(spanClass)}">
                <span class="paper-field__label">${escapeHtml(label)}</span>
                ${ownership.note}
                <input class="paper-field__input ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="${escapeAttribute(type || 'text')}" name="${escapeAttribute(name)}" value="${escapeAttribute(value ?? '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
            </label>
        `;
    }

    function renderDocumentTextarea(label, name, value, spanClass = '', disabled = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `
            <label class="paper-field ${escapeAttribute(spanClass)}">
                <span class="paper-field__label">${escapeHtml(label)}</span>
                ${ownership.note}
                <textarea class="paper-field__textarea ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" name="${escapeAttribute(name)}" rows="4" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>${escapeHtml(value ?? '')}</textarea>
            </label>
        `;
    }

    function renderDocumentSelect(label, name, value, options, disabled = false, spanClass = '') {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `
            <label class="paper-field ${escapeAttribute(spanClass)}">
                <span class="paper-field__label">${escapeHtml(label)}</span>
                ${ownership.note}
                <select class="paper-field__input ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" name="${escapeAttribute(name)}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
                    ${(options || []).map((option) => `<option value="${escapeAttribute(option)}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(option || 'Select')}</option>`).join('')}
                </select>
            </label>
        `;
    }

    function renderDocumentCheckbox(label, name, checked, disabled = false, spanClass = '') {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `
            <label class="paper-checkbox ${escapeAttribute(spanClass)}">
                <input type="checkbox" name="${escapeAttribute(name)}" ${ownership.attrs} ${checked ? 'checked' : ''} ${ownership.disabled ? 'disabled' : ''}>
                <span>${escapeHtml(label)}</span>
            </label>
        `;
    }

    function renderChoiceRadioGroup(label, name, value, options) {
        const ownership = buildFieldOwnershipAttributes(name, false, true);
        return `
            <div class="form-field">
                <span>${escapeHtml(label)}</span>
                <div class="post-approval-fields">
                    ${(options || []).map((option) => `
                        <label class="checkbox-field">
                            <input type="radio" name="${escapeAttribute(name)}" value="${escapeAttribute(option.value)}" ${String(value || '') === String(option.value) ? 'checked' : ''} ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
                            <span>${escapeHtml(option.label)}</span>
                        </label>
                    `).join('')}
                </div>
                ${ownership.note}
            </div>
        `;
    }

    function renderChoiceCheckboxField(label, name, checked) {
        const ownership = buildFieldOwnershipAttributes(name, false, true);
        return `
            <label class="checkbox-field">
                <input type="checkbox" name="${escapeAttribute(name)}" ${ownership.attrs} ${checked ? 'checked' : ''} ${ownership.disabled ? 'disabled' : ''}>
                <span>${escapeHtml(label)}</span>
            </label>
        `;
    }

    function renderDocumentUpload(label, fieldKey, metadata, disabled = false, spanClass = '') {
        const ownership = buildFieldOwnershipAttributes(fieldKey, disabled);
        const fallback = (() => {
            const fileName = metadata?.original_name || '';
            const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
            const uploadedAt = metadata?.uploaded_at ? formatDateTime(metadata.uploaded_at) : '';
            return `
                <div class="paper-field paper-upload ${escapeAttribute(spanClass)}">
                    <span class="paper-field__label">${escapeHtml(label)}</span>
                    ${ownership.note}
                    <label class="paper-upload__card ${ownership.disabled ? 'is-disabled' : ''}">
                        <input type="file" class="upload-input" data-upload-field="${escapeAttribute(fieldKey)}" ${ownership.attrs} accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf" ${ownership.disabled ? 'disabled' : ''}>
                        <span class="paper-upload__copy">
                            <strong>${fileName ? 'Replace uploaded file' : (ownership.owner === FIELD_OWNER_STAFF ? 'Reserved for CSWDD staff' : 'Upload file')}</strong>
                            <small>${fileName ? escapeHtml(fileName) : 'Accepted: JPG, PNG, WEBP, HEIC, HEIF, or PDF'}</small>
                        </span>
                    </label>
                    ${fileUrl ? `<a class="upload-link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">View uploaded file</a>` : ''}
                    ${uploadedAt ? `<small class="field-hint">Uploaded ${escapeHtml(uploadedAt)}</small>` : ''}
                </div>
            `;
        })();
        const signaturePad = renderSignaturePadField(fieldKey, metadata, { label, variant: 'inline', disabled, fallback });
        if (signaturePad) {
            return signaturePad;
        }
        return fallback;
    }

    function renderDocumentFamilyTable(rows, options = {}) {
        const safeRows = ensureRows(rows, { name: '', age: '', activities: '' }, getHardCopyRowLimit('add-family'));
        const paperMode = Boolean(options.paperMode);
        return `
            <div class="paper-table-wrap">
                <table class="paper-table ${paperMode ? 'paper-table--govform' : ''}">
                    <thead>
                        <tr>
                            <th>Family Member Participating</th>
                            <th>Age</th>
                            <th>Activities</th>
                            ${paperMode ? '' : '<th class="paper-table__actions">Actions</th>'}
                        </tr>
                    </thead>
                    <tbody>
                        ${safeRows.map((row, index) => `
                            <tr>
                                <td><input class="paper-table__input ${paperMode ? 'paper-table__input--line' : ''}" type="text" name="familyEnterprise.members.${index}.name" value="${escapeAttribute(row.name || '')}"></td>
                                <td><input class="paper-table__input ${paperMode ? 'paper-table__input--line' : ''}" type="number" name="familyEnterprise.members.${index}.age" value="${escapeAttribute(row.age || '')}"></td>
                                <td><input class="paper-table__input ${paperMode ? 'paper-table__input--line' : ''}" type="text" name="familyEnterprise.members.${index}.activities" value="${escapeAttribute(row.activities || '')}"></td>
                                ${paperMode ? '' : `<td class="paper-table__actions"><button type="button" class="btn-outline small post-approval-row-action" data-row-action="remove-family" data-row-index="${index}">Remove</button></td>`}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${paperMode
                ? renderMungkahingTableControls('add-family', 'remove-family', safeRows, 'Family row')
                : `<div class="paper-table-toolbar">${renderAddRowButton('add-family', 'Add family member', safeRows)}</div>`
            }
        `;
    }

    function renderDocumentIncomeTable(rows, totalFamilyIncome, options = {}) {
        const safeRows = ensureRows(rows, { memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' }, getHardCopyRowLimit('add-income'));
        const paperMode = Boolean(options.paperMode);
        const headerHtml = paperMode
            ? `
                <tr>
                    <th rowspan="2">Name of Working Family Members</th>
                    <th colspan="3" class="center-text">Monthly Income</th>
                    <th rowspan="2">Total Family Income</th>
                </tr>
                <tr>
                    <th>Cash</th>
                    <th>Non-Cash</th>
                    <th>Total</th>
                </tr>
            `
            : `
                <tr>
                    <th>Name of Working Family Members</th>
                    <th>Cash Income</th>
                    <th>Non-Cash</th>
                    <th>Total</th>
                    <th class="paper-table__actions">Actions</th>
                </tr>
            `;
        return `
            <div class="paper-table-wrap">
                <table class="paper-table ${paperMode ? 'paper-table--govform paper-table--dense' : ''}">
                    <thead>
                        ${headerHtml}
                    </thead>
                    <tbody>
                        ${safeRows.map((row, index) => `
                            <tr>
                                <td><input class="paper-table__input ${paperMode ? 'paper-table__input--line' : ''}" type="text" name="incomeEligibility.rows.${index}.memberName" value="${escapeAttribute(row.memberName || '')}"></td>
                                <td><input class="paper-table__input ${paperMode ? 'paper-table__input--line' : ''}" type="number" name="incomeEligibility.rows.${index}.cashIncome" value="${escapeAttribute(row.cashIncome || '')}"></td>
                                <td><input class="paper-table__input ${paperMode ? 'paper-table__input--line' : ''}" type="number" name="incomeEligibility.rows.${index}.nonCashIncome" value="${escapeAttribute(row.nonCashIncome || '')}"></td>
                                <td><input class="paper-table__input ${paperMode ? 'paper-table__input--line' : ''}" type="number" name="incomeEligibility.rows.${index}.totalIncome" value="${escapeAttribute(row.totalIncome || '')}"></td>
                                ${paperMode ? '<td class="paper-table__blank"></td>' : `<td class="paper-table__actions"><button type="button" class="btn-outline small post-approval-row-action" data-row-action="remove-income" data-row-index="${index}">Remove</button></td>`}
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="4"><strong>Total Family Income</strong></td>
                            <td><input class="paper-table__input ${paperMode ? 'paper-table__input--line' : ''}" type="number" name="incomeEligibility.totalFamilyIncome" value="${escapeAttribute(totalFamilyIncome || '')}"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            ${paperMode
                ? renderMungkahingTableControls('add-income', 'remove-income', safeRows, 'Income row')
                : `<div class="paper-table-toolbar">${renderAddRowButton('add-income', 'Add income row', safeRows)}</div>`
            }
        `;
    }

    function renderDocumentHealthTable(rows) {
        const safeRows = ensureRows(rows, { requirement: '', age: '', healthStatus: '' }, getHardCopyRowLimit('add-health'));
        return `
            <div class="paper-table-wrap">
                <table class="paper-table paper-table--govform paper-table--dense">
                    <thead>
                        <tr>
                            <th>Health and Age Requirements</th>
                            <th>Age</th>
                            <th>Health Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${safeRows.map((row, index) => `
                            <tr>
                                <td><input class="paper-table__input paper-table__input--line" type="text" name="physicalRequirements.healthAgeRows.${index}.requirement" value="${escapeAttribute(row.requirement || '')}"></td>
                                <td><input class="paper-table__input paper-table__input--line" type="text" name="physicalRequirements.healthAgeRows.${index}.age" value="${escapeAttribute(row.age || '')}"></td>
                                <td><input class="paper-table__input paper-table__input--line" type="text" name="physicalRequirements.healthAgeRows.${index}.healthStatus" value="${escapeAttribute(row.healthStatus || '')}"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${renderMungkahingTableControls('add-health', 'remove-health', safeRows, 'Health row')}
        `;
    }

    function renderValidationChecklistTable(checklist, options = {}) {
        const paperMode = Boolean(options.paperMode);
        const rows = [
            ['Pantawid Member', 'membershipChecklist.pantawidMember', 'membershipChecklist.pantawidSpecify'],
            ['SLPA Member', 'membershipChecklist.slpaMember', 'membershipChecklist.slpaSpecify'],
        ];
        return `
            <div class="paper-table-wrap">
                <table class="paper-table ${paperMode ? 'paper-table--govform paper-table--validation' : 'paper-table--checklist'}">
                    <thead>
                        <tr>
                            <th>${paperMode ? 'Is He/She' : 'Checklist'}</th>
                            <th>Yes</th>
                            <th>No</th>
                            <th>Specify</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(([label, key, specifyKey]) => {
                            const value = checklist?.[key.split('.').pop()] || '';
                            const specifyValue = checklist?.[specifyKey.split('.').pop()] || '';
                            return `
                                <tr>
                                    <td>${escapeHtml(label)}</td>
                                    <td class="paper-table__choice"><input class="${paperMode ? 'paper-table__radio' : ''}" type="radio" name="${escapeAttribute(key)}" value="Yes" ${value === 'Yes' ? 'checked' : ''}></td>
                                    <td class="paper-table__choice"><input class="${paperMode ? 'paper-table__radio' : ''}" type="radio" name="${escapeAttribute(key)}" value="No" ${value === 'No' ? 'checked' : ''}></td>
                                    <td><input class="paper-table__input ${paperMode ? 'paper-table__input--line' : ''}" type="text" name="${escapeAttribute(specifyKey)}" value="${escapeAttribute(specifyValue)}"></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderReadOnlyField(label, value) {
        return `
            <label class="form-field">
                <span>${escapeHtml(label)}</span>
                <input type="text" value="${escapeAttribute(value ?? '')}" readonly>
            </label>
        `;
    }

    function renderField(label, name, value, type, full = false, disabled = false, forceApplicant = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled, forceApplicant);
        return `
            <label class="form-field ${full ? 'full' : ''}">
                <span>${escapeHtml(label)}</span>
                ${ownership.note}
                <input class="${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="${escapeAttribute(type || 'text')}" name="${escapeAttribute(name)}" value="${escapeAttribute(value ?? '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
            </label>
        `;
    }

    function renderTextarea(label, name, value, full = false, hint = '', disabled = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `
            <label class="form-field ${full ? 'full' : ''}">
                <span>${escapeHtml(label)}</span>
                ${ownership.note}
                <textarea class="${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" name="${escapeAttribute(name)}" rows="4" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>${escapeHtml(value ?? '')}</textarea>
                ${hint ? `<small class="field-hint">${escapeHtml(hint)}</small>` : ''}
            </label>
        `;
    }

    function renderUploadField(label, fieldKey, metadata, disabled = false) {
        const ownership = buildFieldOwnershipAttributes(fieldKey, disabled);
        const fileName = metadata?.original_name || '';
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const uploadedAt = metadata?.uploaded_at ? formatDateTime(metadata.uploaded_at) : '';
        const signaturePad = renderSignaturePadField(fieldKey, metadata, {
            label,
            variant: 'inline',
            disabled,
            fallback: '',
        });

        if (signaturePad) {
            return `
                <div class="form-field full upload-field">
                    <span>${escapeHtml(label)}</span>
                    ${ownership.note}
                    ${assignedPdoSignatureWarning(fieldKey, metadata)}
                    ${signaturePad}
                </div>
            `;
        }

        return `
            <div class="form-field full upload-field">
                <span>${escapeHtml(label)}</span>
                ${ownership.note}
                ${assignedPdoSignatureWarning(fieldKey, metadata)}
                <label class="upload-card">
                    <input type="file" class="upload-input" data-upload-field="${escapeAttribute(fieldKey)}" ${ownership.attrs} accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf" ${ownership.disabled ? 'disabled' : ''}>
                    <span class="upload-card__copy">
                        <strong>${fileName ? 'Replace uploaded file' : (ownership.owner === FIELD_OWNER_STAFF ? 'Signature upload handled in review' : 'Upload signature file')}</strong>
                        <small>${fileName ? escapeHtml(fileName) : 'Accepted: JPG, PNG, WEBP, HEIC, HEIF, or PDF'}</small>
                    </span>
                </label>
                ${fileUrl ? `<a class="upload-link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">View uploaded file</a>` : ''}
                ${uploadedAt ? `<small class="field-hint">Uploaded ${escapeHtml(uploadedAt)}</small>` : ''}
            </div>
        `;
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

    function renderSelectField(label, name, value, options, disabled = false, forceApplicant = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled, forceApplicant);
        return `
            <label class="form-field">
                <span>${escapeHtml(label)}</span>
                ${ownership.note}
                <select class="${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" name="${escapeAttribute(name)}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
                    ${options.map((option) => `<option value="${escapeAttribute(option)}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(option || 'Select')}</option>`).join('')}
                </select>
            </label>
        `;
    }

    function renderFamilyMemberRow(row, index) {
        return `
            <div class="post-approval-repeatable__row">
                ${renderField('Family member', `familyEnterprise.members.${index}.name`, row.name || '', 'text')}
                ${renderField('Age', `familyEnterprise.members.${index}.age`, row.age || '', 'number')}
                ${renderField('Activities', `familyEnterprise.members.${index}.activities`, row.activities || '', 'text')}
                <div class="form-field">
                    <span>Remove row</span>
                    <button type="button" class="btn-outline small post-approval-row-action" data-row-action="remove-family" data-row-index="${index}">Remove</button>
                </div>
            </div>
        `;
    }

    function renderIncomeRow(row, index) {
        return `
            <div class="post-approval-repeatable__row">
                ${renderField('Working family member', `incomeEligibility.rows.${index}.memberName`, row.memberName || '', 'text')}
                ${renderField('Cash income', `incomeEligibility.rows.${index}.cashIncome`, row.cashIncome || '', 'number')}
                ${renderField('Non-cash income', `incomeEligibility.rows.${index}.nonCashIncome`, row.nonCashIncome || '', 'number')}
                ${renderField('Total income', `incomeEligibility.rows.${index}.totalIncome`, row.totalIncome || '', 'number')}
                <div class="form-field">
                    <span>Remove row</span>
                    <button type="button" class="btn-outline small post-approval-row-action" data-row-action="remove-income" data-row-index="${index}">Remove</button>
                </div>
            </div>
        `;
    }

    function handleRowAction(event) {
        const pageButton = event.target instanceof Element ? event.target.closest('[data-availment-page]') : null;
        if (pageButton && state.task?.code === 'availment_form') {
            event.preventDefault();
            const nextPage = Number(pageButton.getAttribute('data-availment-page'));
            if (nextPage === 1 || nextPage === 2) {
                const payload = gatherFormData();
                if (payload) {
                    state.activePayload = payload;
                }
                state.availmentPage = nextPage;
                renderTask();
                document.querySelector('.post-form-page-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            return;
        }

        const actionButton = event.target instanceof Element ? event.target.closest('[data-row-action]') : null;
        const action = actionButton?.getAttribute('data-row-action');
        if (!action || !state.task) {
            return;
        }

        const payload = gatherFormData();
        if (!payload) {
            return;
        }

        const canAddRow = (rows) => {
            const maxRows = getHardCopyRowLimit(action);
            if (!Number.isInteger(maxRows)) {
                return true;
            }

            if (rows.length >= maxRows) {
                showToast(`This table is limited to ${maxRows} row${maxRows === 1 ? '' : 's'} based on the hardcopy form.`, 'warning');
                return false;
            }

            return true;
        };

        if (action === 'add-family') {
            payload.familyEnterprise = payload.familyEnterprise || {};
            payload.familyEnterprise.members = Array.isArray(payload.familyEnterprise.members) ? payload.familyEnterprise.members : [];
            if (!canAddRow(payload.familyEnterprise.members)) {
                return;
            }
            payload.familyEnterprise.members.push({ name: '', age: '', activities: '' });
        } else if (action === 'remove-family') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.familyEnterprise.members.splice(index, 1);
            if (payload.familyEnterprise.members.length === 0) {
                payload.familyEnterprise.members.push({ name: '', age: '', activities: '' });
            }
        } else if (action === 'add-income') {
            payload.incomeEligibility = payload.incomeEligibility || {};
            payload.incomeEligibility.rows = Array.isArray(payload.incomeEligibility.rows) ? payload.incomeEligibility.rows : [];
            if (!canAddRow(payload.incomeEligibility.rows)) {
                return;
            }
            payload.incomeEligibility.rows.push({ memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' });
        } else if (action === 'remove-income') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.incomeEligibility.rows.splice(index, 1);
            if (payload.incomeEligibility.rows.length === 0) {
                payload.incomeEligibility.rows.push({ memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' });
            }
        } else if (action === 'add-health') {
            payload.staffReview = payload.staffReview || {};
            payload.staffReview.physicalRequirements = payload.staffReview.physicalRequirements || {};
            payload.staffReview.physicalRequirements.healthAgeRows = Array.isArray(payload.staffReview.physicalRequirements.healthAgeRows)
                ? payload.staffReview.physicalRequirements.healthAgeRows
                : [];
            if (!canAddRow(payload.staffReview.physicalRequirements.healthAgeRows)) {
                return;
            }
            payload.staffReview.physicalRequirements.healthAgeRows.push({ requirement: '', age: '', healthStatus: '' });
        } else if (action === 'remove-health') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.staffReview = payload.staffReview || {};
            payload.staffReview.physicalRequirements = payload.staffReview.physicalRequirements || {};
            payload.staffReview.physicalRequirements.healthAgeRows = Array.isArray(payload.staffReview.physicalRequirements.healthAgeRows)
                ? payload.staffReview.physicalRequirements.healthAgeRows
                : [];
            payload.staffReview.physicalRequirements.healthAgeRows.splice(index, 1);
            if (payload.staffReview.physicalRequirements.healthAgeRows.length === 0) {
                payload.staffReview.physicalRequirements.healthAgeRows.push({ requirement: '', age: '', healthStatus: '' });
            }
        } else if (action === 'add-mp-contribution') {
            payload.modalityApplications = payload.modalityApplications || {};
            payload.modalityApplications.rows = Array.isArray(payload.modalityApplications.rows) ? payload.modalityApplications.rows : [];
            if (!canAddRow(payload.modalityApplications.rows)) {
                return;
            }
            payload.modalityApplications.rows.push({ fundSource: '', contributionType: '', amount: '' });
        } else if (action === 'remove-mp-contribution') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.modalityApplications.rows.splice(index, 1);
            if (payload.modalityApplications.rows.length === 0) {
                payload.modalityApplications.rows.push({ fundSource: '', contributionType: '', amount: '' });
            }
        } else if (action === 'add-mp-material') {
            payload.businessOperation = payload.businessOperation || {};
            payload.businessOperation.materials = payload.businessOperation.materials || {};
            payload.businessOperation.materials.rows = Array.isArray(payload.businessOperation.materials.rows) ? payload.businessOperation.materials.rows : [];
            if (!canAddRow(payload.businessOperation.materials.rows)) {
                return;
            }
            payload.businessOperation.materials.rows.push({ material: '', quality: '', unit: '', unitPrice: '', cyclesPerProduction: '', projectedCost: '' });
        } else if (action === 'remove-mp-material') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.businessOperation.materials.rows.splice(index, 1);
            if (payload.businessOperation.materials.rows.length === 0) {
                payload.businessOperation.materials.rows.push({ material: '', quality: '', unit: '', unitPrice: '', cyclesPerProduction: '', projectedCost: '' });
            }
        } else if (action === 'add-mp-labor') {
            payload.businessOperation = payload.businessOperation || {};
            payload.businessOperation.labor = payload.businessOperation.labor || {};
            payload.businessOperation.labor.rows = Array.isArray(payload.businessOperation.labor.rows) ? payload.businessOperation.labor.rows : [];
            if (!canAddRow(payload.businessOperation.labor.rows)) {
                return;
            }
            payload.businessOperation.labor.rows.push({ workerName: '', position: '', dailyWage: '' });
        } else if (action === 'remove-mp-labor') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.businessOperation.labor.rows.splice(index, 1);
            if (payload.businessOperation.labor.rows.length === 0) {
                payload.businessOperation.labor.rows.push({ workerName: '', position: '', dailyWage: '' });
            }
        } else if (action === 'add-mp-equipment') {
            payload.businessOperation = payload.businessOperation || {};
            payload.businessOperation.toolsEquipment = payload.businessOperation.toolsEquipment || {};
            payload.businessOperation.toolsEquipment.rows = Array.isArray(payload.businessOperation.toolsEquipment.rows) ? payload.businessOperation.toolsEquipment.rows : [];
            if (!canAddRow(payload.businessOperation.toolsEquipment.rows)) {
                return;
            }
            payload.businessOperation.toolsEquipment.rows.push({ equipment: '', capacity: '', unit: '', quantityOrPrice: '', projectedAmount: '', usefulLifeDays: '', productionCycle: '', depreciationCost: '' });
        } else if (action === 'remove-mp-equipment') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.businessOperation.toolsEquipment.rows.splice(index, 1);
            if (payload.businessOperation.toolsEquipment.rows.length === 0) {
                payload.businessOperation.toolsEquipment.rows.push({ equipment: '', capacity: '', unit: '', quantityOrPrice: '', projectedAmount: '', usefulLifeDays: '', productionCycle: '', depreciationCost: '' });
            }
        } else if (action === 'add-mp-expense') {
            payload.businessOperation = payload.businessOperation || {};
            payload.businessOperation.operatingExpenses = payload.businessOperation.operatingExpenses || {};
            payload.businessOperation.operatingExpenses.rows = Array.isArray(payload.businessOperation.operatingExpenses.rows) ? payload.businessOperation.operatingExpenses.rows : [];
            if (!canAddRow(payload.businessOperation.operatingExpenses.rows)) {
                return;
            }
            payload.businessOperation.operatingExpenses.rows.push({ expenseName: '', paymentFrequency: '', projectedCost: '' });
        } else if (action === 'remove-mp-expense') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.businessOperation.operatingExpenses.rows.splice(index, 1);
            if (payload.businessOperation.operatingExpenses.rows.length === 0) {
                payload.businessOperation.operatingExpenses.rows.push({ expenseName: '', paymentFrequency: '', projectedCost: '' });
            }
        } else if (action === 'add-mp-sale') {
            payload.businessOperation = payload.businessOperation || {};
            payload.businessOperation.salesProjection = payload.businessOperation.salesProjection || {};
            payload.businessOperation.salesProjection.rows = Array.isArray(payload.businessOperation.salesProjection.rows) ? payload.businessOperation.salesProjection.rows : [];
            if (!canAddRow(payload.businessOperation.salesProjection.rows)) {
                return;
            }
            payload.businessOperation.salesProjection.rows.push({ product: '', capacity: '', unit: '', sellingPrice: '', projectedSales: '' });
        } else if (action === 'remove-mp-sale') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.businessOperation.salesProjection.rows.splice(index, 1);
            if (payload.businessOperation.salesProjection.rows.length === 0) {
                payload.businessOperation.salesProjection.rows.push({ product: '', capacity: '', unit: '', sellingPrice: '', projectedSales: '' });
            }
        } else if (action === 'add-mp-spending') {
            payload.spendingPlan = payload.spendingPlan || {};
            payload.spendingPlan.rows = Array.isArray(payload.spendingPlan.rows) ? payload.spendingPlan.rows : [];
            if (!canAddRow(payload.spendingPlan.rows)) {
                return;
            }
            payload.spendingPlan.rows.push({ expense: '', amount: '', usageSchedule: '' });
        } else if (action === 'remove-mp-spending') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.spendingPlan.rows.splice(index, 1);
            if (payload.spendingPlan.rows.length === 0) {
                payload.spendingPlan.rows.push({ expense: '', amount: '', usageSchedule: '' });
            }
        } else if (action === 'add-bp-product') {
            payload.productsServices = payload.productsServices || {};
            payload.productsServices.rows = Array.isArray(payload.productsServices.rows) ? payload.productsServices.rows : [];
            if (!canAddRow(payload.productsServices.rows)) {
                return;
            }
            payload.productsServices.rows.push({ name: '', description: '', price: '', targetMarket: '' });
        } else if (action === 'remove-bp-product') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.productsServices.rows.splice(index, 1);
            if (payload.productsServices.rows.length === 0) {
                payload.productsServices.rows.push({ name: '', description: '', price: '', targetMarket: '' });
            }
        } else if (action === 'add-bp-schedule') {
            payload.implementationSchedule = payload.implementationSchedule || {};
            payload.implementationSchedule.rows = Array.isArray(payload.implementationSchedule.rows) ? payload.implementationSchedule.rows : [];
            if (!canAddRow(payload.implementationSchedule.rows)) {
                return;
            }
            payload.implementationSchedule.rows.push({ activity: '', targetDate: '', responsiblePerson: '' });
        } else if (action === 'remove-bp-schedule') {
            const index = Number(actionButton.getAttribute('data-row-index'));
            payload.implementationSchedule.rows.splice(index, 1);
            if (payload.implementationSchedule.rows.length === 0) {
                payload.implementationSchedule.rows.push({ activity: '', targetDate: '', responsiblePerson: '' });
            }
        } else {
            return;
        }

        state.activePayload = payload;
        renderTask();
    }

    async function handleApplicantUploadChange(event) {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
            return;
        }

        const fieldKey = input.dataset.uploadField || '';
        const file = input.files?.[0];
        if (!fieldKey || !file || !state.task) {
            return;
        }
        await uploadApplicantAsset(fieldKey, file, input, 'Signature file uploaded.');
    }

    async function uploadApplicantAsset(fieldKey, file, control = null, successMessage = 'Signature file uploaded.') {
        if (!fieldKey || !file || !state.task) {
            return false;
        }
        if (!isTaskEditable(state.task)) {
            showToast('This form is no longer editable in its current status.', 'warning');
            if (control instanceof HTMLInputElement) {
                control.value = '';
            }
            return false;
        }

        const currentFormState = gatherFormData();
        if (currentFormState) {
            state.activePayload = currentFormState;
        }

        if (control instanceof HTMLInputElement || control instanceof HTMLButtonElement) {
            control.disabled = true;
        }
        try {
            if (currentFormState && !state.reviewerMode) {
                await saveDraftSilently(currentFormState);
            }

            const body = new FormData();
            if (state.reviewerMode) {
                body.append('taskId', String(state.task.id || state.reviewTaskId || 0));
            } else {
                body.append('code', state.task.code);
            }
            body.append('fieldKey', fieldKey);
            body.append('file', file);

            const payload = await fetchJson(state.reviewerMode ? 'api/post-approval-review/upload' : 'api/post-approval/upload', {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body,
            });

            if (payload.upload) {
                setNestedValue(state.activePayload, resolveUploadPersistPath(fieldKey), payload.upload);
                showToast(successMessage, 'success');
                renderTask();
                return true;
            }
        } catch (error) {
            showToast(error.message || 'Unable to upload this file right now.', 'warning');
        } finally {
            if (control instanceof HTMLInputElement || control instanceof HTMLButtonElement) {
                control.disabled = false;
            }
            if (control instanceof HTMLInputElement) {
                control.value = '';
            }
        }
        return false;
    }

    async function clearApplicantAsset(fieldKey, control = null) {
        if (!fieldKey || !state.task) {
            return false;
        }
        if (!isTaskEditable(state.task)) {
            showToast('This form is no longer editable in its current status.', 'warning');
            return false;
        }

        if (!window.confirm('Remove the saved signature from this form?')) {
            return false;
        }

        const currentFormState = gatherFormData();
        if (currentFormState) {
            state.activePayload = currentFormState;
        }

        if (control instanceof HTMLButtonElement) {
            control.disabled = true;
        }

        try {
            if (currentFormState) {
                await saveDraftSilently(currentFormState);
            }

            const payload = await fetchJson('api/post-approval/clear-upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    code: state.task.code,
                    fieldKey,
                }),
            });
            if (!payload.ok) {
                throw new Error(payload.message || 'Unable to remove saved signature.');
            }

            deleteNestedValue(state.activePayload, resolveUploadPersistPath(fieldKey));
            showToast('Saved signature removed.', 'success');
            await loadTask();
            return true;
        } catch (error) {
            showToast(error.message || 'Unable to remove this saved signature right now.', 'warning');
        } finally {
            if (control instanceof HTMLButtonElement) {
                control.disabled = false;
            }
        }

        return false;
    }

    async function saveDraftSilently(form) {
        if (!state.task || !form) {
            return false;
        }

        if (state.reviewerMode) {
            return true;
        }

        const payload = await fetchJson('api/post-approval/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({
                code: state.task.code,
                form,
            }),
        });

        if (!payload.ok) {
            throw new Error(payload.message || 'Unable to save the current form fields before updating the signature.');
        }

        state.formErrors = {};
        return true;
    }

    async function handleSave() {
        if (!state.task) {
            return;
        }
        if (!isTaskEditable(state.task)) {
            showToast('This form is no longer editable in its current status.', 'warning');
            return;
        }

        if (state.task.code === 'availment_form' && state.availmentPage !== 2) {
            const pageOnePayload = gatherFormData();
            if (pageOnePayload) {
                state.activePayload = pageOnePayload;
            }
            state.availmentPage = 2;
            renderTask();
            document.querySelector('.post-form-page-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        const form = gatherFormData();
        if (!form) {
            return;
        }

        try {
            const payload = await fetchJson('api/post-approval/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    code: state.task.code,
                    form,
                }),
            });
            if (!payload.ok) {
                throw new Error(payload.message || 'Unable to save form.');
            }

            state.formErrors = {};
            showToast('Application form saved.', 'success');
            // Clear in-memory payload before reload so loadTask pulls a clean DB copy.
            state.activePayload = null;
            await loadTask();
        } catch (error) {
            showToast(error.message || 'Unable to save this form right now.', 'warning');
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (!state.task) {
            return;
        }
        if (!isTaskEditable(state.task)) {
            showToast('This form is no longer editable in its current status.', 'warning');
            return;
        }

        const form = gatherFormData();
        if (!form) {
            return;
        }

        try {
            const payload = state.reviewerMode
                ? await fetchJson('api/post-approval-review/review', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({
                        taskId: state.task.id || state.reviewTaskId || 0,
                        status: document.getElementById('reviewDecisionStatus')?.value || 'Verified',
                        remarks: document.getElementById('reviewDecisionApplicantRemark')?.value || '',
                        applicantVisibleRemark: document.getElementById('reviewDecisionApplicantRemark')?.value || '',
                        staffForm: structuredCloneSafe(form.staffReview || {}),
                        formPayload: form,
                    }),
                })
                : await fetchJson('api/post-approval/submit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({
                        code: state.task.code,
                        form,
                    }),
                });
            if (!payload.ok) {
                throw new Error(payload.message || (state.reviewerMode ? 'Unable to save review.' : 'Unable to submit form.'));
            }

            state.formErrors = {};
            showToast(state.reviewerMode ? 'Review decision saved.' : 'Application form submitted.', 'success');
            state.activePayload = null;
            await loadTask();
        } catch (error) {
            const errors = error?.payload?.errors;
            if (errors && typeof errors === 'object') {
                state.formErrors = errors;
                renderTask();
                document.getElementById('postApprovalFormErrorSummary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                showToast('Submission blocked. Complete the required fields listed above.', 'warning');
                return;
            }

            showToast(error.message || 'Unable to submit this form right now.', 'warning');
        }
    }

    function gatherFormData() {
        const form = document.getElementById('postApprovalForm');
        if (!form || form.classList.contains('is-hidden')) {
            return null;
        }

        if (state.reviewerMode) {
            const reviewerData = collectFormValues(form, true);
            state.activePayload = reviewerData;
            return reviewerData;
        }

        if (state.task?.code === 'business_plan') {
            const businessPlanData = buildBusinessPlanFormData(form);
            state.activePayload = businessPlanData;
            return businessPlanData;
        }

        const data = structuredCloneSafe(state.activePayload || {});
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach((field) => {
            const name = field.getAttribute('name');
            if (!name) {
                return;
            }

            const ownership = resolveElementOwnership(field);
            if (ownership.owner !== FIELD_OWNER_APPLICANT) {
                return;
            }

            let value;
            if (field instanceof HTMLInputElement && field.type === 'file') {
                return;
            }
            if (field instanceof HTMLInputElement && field.type === 'radio') {
                if (!field.checked) {
                    return;
                }
                value = field.value;
            } else
            if (field instanceof HTMLInputElement && field.type === 'checkbox') {
                value = field.checked;
            } else {
                value = field.value;
            }

            if ((state.task?.code || '') === 'availment_form') {
                const existingValue = getNestedValue(data, name);
                if (String(value ?? '').trim() === '' && String(existingValue ?? '').trim() !== '') {
                    return;
                }
            }

            setNestedValue(data, name, value);
        });

        if ((state.task?.code || '') === 'availment_form') {
            normalizeAvailmentSubmissionPayload(data);
        }

        state.activePayload = data;
        return data;
    }

    function collectFormValues(form, includeStaffFields = false) {
        const data = structuredCloneSafe(state.activePayload || {});

        form.querySelectorAll('input[name], select[name], textarea[name]').forEach((field) => {
            const name = field.getAttribute('name');
            if (!name || name.startsWith('review.')) {
                return;
            }

            if (field instanceof HTMLInputElement && field.type === 'file') {
                return;
            }

            const ownership = resolveElementOwnership(field);
            if (!includeStaffFields && ownership.owner !== FIELD_OWNER_APPLICANT) {
                return;
            }

            let value;
            if (field instanceof HTMLInputElement && field.type === 'radio') {
                if (!field.checked) {
                    return;
                }
                value = field.value;
            } else if (field instanceof HTMLInputElement && field.type === 'checkbox') {
                value = field.checked;
            } else {
                value = field.value;
            }

            setNestedValue(data, name, value);
        });

        return data;
    }

    function buildBusinessPlanFormData(form) {
        const data = structuredCloneSafe(state.activePayload || {});
        const elements = Array.from(form.elements || []);
        const collected = new Map();

        elements.forEach((field) => {
            if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
                return;
            }

            const name = field.getAttribute('name');
            if (!name || field.type === 'file') {
                return;
            }

            const ownership = resolveElementOwnership(field);
            if (ownership.owner !== FIELD_OWNER_APPLICANT) {
                return;
            }

            let value;
            if (field instanceof HTMLInputElement && field.type === 'checkbox') {
                value = field.checked;
            } else if (field instanceof HTMLInputElement && field.type === 'radio') {
                if (!field.checked) {
                    return;
                }
                value = field.value;
            } else {
                value = String(field.value || '').trim();
            }

            if (!collected.has(name) || String(value).trim() !== '') {
                collected.set(name, value);
            }
        });

        collected.forEach((value, name) => {
            setNestedValue(data, name, value);
        });

        data.productsServices = data.productsServices || {};
        data.implementationSchedule = data.implementationSchedule || {};
        data.productsServices.rows = collectBusinessPlanRows(collected, 'productsServices.rows', ['name', 'description', 'price', 'targetMarket']);
        data.implementationSchedule.rows = collectBusinessPlanRows(collected, 'implementationSchedule.rows', ['activity', 'targetDate', 'responsiblePerson']);

        return data;
    }

    function collectBusinessPlanRows(collected, path, keys) {
        const rows = new Map();
        const prefix = `${path}.`;

        collected.forEach((value, name) => {
            if (!name.startsWith(prefix)) {
                return;
            }

            const parts = name.split('.');
            const rowIndex = Number(parts[2] || '');
            const key = parts[3] || '';
            if (!Number.isInteger(rowIndex) || !keys.includes(key)) {
                return;
            }

            const row = rows.get(rowIndex) || {};
            row[key] = String(value || '').trim();
            rows.set(rowIndex, row);
        });

        return Array.from(rows.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, row]) => row)
            .filter((row) => keys.some((key) => String(row[key] || '').trim() !== ''));
    }

    function normalizeAvailmentSubmissionPayload(data) {
        data.clientIdentifyingData = data.clientIdentifyingData || {};
        data.individualAssistance = data.individualAssistance || {};
        data.incomeEligibility = data.incomeEligibility || {};
        data.applicantSignature = data.applicantSignature || {};

        if (!String(data.applicantSignature.signedDate || '').trim()) {
            data.applicantSignature.signedDate = currentDateInputValue();
        }

        const rows = Array.isArray(data.incomeEligibility.rows) ? data.incomeEligibility.rows : [];
        data.incomeEligibility.rows = rows
            .filter((row) => row && typeof row === 'object')
            .map((row) => ({
                memberName: String(row.memberName || '').trim(),
                cashIncome: String(row.cashIncome || '').trim(),
                nonCashIncome: String(row.nonCashIncome || '').trim(),
                totalIncome: String(row.totalIncome || '').trim(),
            }));
    }

    function currentDateInputValue() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${now.getFullYear()}-${month}-${day}`;
    }

    function renderFatalState(message) {
        showToast(message, 'warning');
        setText('formPageTitle', 'Application Form');
        setText('formPageSubtitle', message);
        setText('formPageStatus', 'Unavailable');
        setText('formPageReview', 'Unavailable');
        setText('postApprovalWorkspaceTitle', 'Application form unavailable');
        setText('postApprovalWorkspaceSubtitle', message);
        setText('postApprovalWorkspaceStatus', 'Unavailable');
        setText('postApprovalWorkspaceNotice', message);
        document.getElementById('postApprovalForm')?.classList.add('is-hidden');
    }

    function buildReviewState(task) {
        if (state.reviewerMode) {
            if (task.status === 'Verified') {
                return task.reviewedAt ? `Verified ${formatDateTime(task.reviewedAt)}` : 'Verified';
            }
            if (task.status === 'Needs Correction') {
                return 'Correction requested';
            }
            if (task.status === 'Rejected') {
                return 'Rejected';
            }
            if (task.status === 'Submitted') {
                return 'Awaiting staff decision';
            }
            return 'Open for review';
        }

        if (task.status === 'Verified') {
            return task.reviewedAt ? `Done ${formatDateTime(task.reviewedAt)}` : 'Done';
        }
        if (task.status === 'Submitted') {
            return hasTaskBeenChecked(task) ? 'Waiting for review' : 'Submitted but still editable';
        }
        if (task.reviewerRemarks) {
            return 'Please read reviewer note';
        }
        return 'Still being filled out';
    }

    function buildPostApprovalNotice(task) {
        if (state.reviewerMode) {
            if (!isTaskEditable(task)) {
                return 'This reviewed form is currently read-only.';
            }
            return 'Review the applicant-filled paper form below, update any corrections, complete the PDO-only signature areas, then choose the final decision.';
        }

        if (task.reviewerRemarks) {
            return `Please review this note before you continue: ${task.reviewerRemarks}`;
        }
        if (task.status === 'Submitted') {
            return hasTaskBeenChecked(task)
                ? 'You already submitted this form. Please wait while it is being reviewed.'
                : 'You already submitted this form, but you can still update it until PDO or admin review starts.';
        }
        if (task.status === 'Verified') {
            return 'This form is already done and checked by CSWDD.';
        }
        if (task.status === 'Locked') {
            return 'This final requirement will open only after the earlier application forms are verified.';
        }
        if (task.staged) {
            return task.helpText || 'This form will open later after the earlier steps are finished.';
        }
        return '';
    }

    function buildFormGuidance(task) {
        const taskGuides = {
            availment_form: {
                step: 'Application requirement',
                time: 'About 10 to 15 minutes',
                prepare: 'Personal details, family income details, and signature file',
                summary: 'This form records your basic application details and the information needed to continue your assistance record.',
            },
            validation_form: {
                step: 'Application requirement',
                time: 'About 10 minutes',
                prepare: 'Updated household details and supporting answers',
                summary: 'This form checks and updates your beneficiary information before the next documents are reviewed.',
            },
            business_plan: {
                step: 'Application requirement',
                time: 'About 20 to 30 minutes',
                prepare: 'Business idea, cost estimates, and income plan',
                summary: 'This form helps explain your livelihood plan in a clearer, structured way.',
            },
            mungkahing_proyekto: {
                step: 'Application requirement',
                time: 'About 20 to 30 minutes',
                prepare: 'Project details, budget estimates, and signature file',
                summary: 'This form captures the proposed project details that support your request for assistance.',
            },
            buhat_sa_pagpanumpa: {
                step: 'Application requirement',
                time: 'About 10 minutes',
                prepare: 'Final review of your answers and signature file',
                summary: 'This form is your final statement and confirmation before the task can move for review.',
            },
        };

        return taskGuides[task.code] || {
            step: 'Application requirement',
            time: 'Usually 10 to 20 minutes',
            prepare: 'Your details and any files mentioned in the form',
            summary: 'Read the task title, review the note below, and complete the form carefully before submitting.',
        };
    }

    function renderFormErrorSummary(errors, taskCode) {
        const entries = Object.entries(errors || {});
        if (entries.length === 0) {
            return '';
        }

        return `
            <section class="post-approval-error-summary" id="postApprovalFormErrorSummary" role="alert" aria-live="polite">
                <h4>Naay kulang o sayop sa form submission</h4>
                <p>Kompletoha ang mosunod nga kinahanglanon aron ma-submit ang porma.</p>
                <ul>
                    ${entries.map(([field, message]) => `<li><strong>${escapeHtml(resolveFieldLabel(field, taskCode))}</strong>: ${escapeHtml(String(message || 'Required field.'))}</li>`).join('')}
                </ul>
            </section>
        `;
    }

    function resolveFieldLabel(field, taskCode) {
        const businessPlanLabels = {
            'overview.businessName': 'Ngalan sa negosyo / proyekto',
            'overview.ownerName': 'Ngalan sa entrepreneur',
            'overview.businessAddress': 'Business address',
            'overview.contactNumber': 'Contact number',
            'overview.businessGoal': 'Brief Profile of the Entrepreneur',
            'executiveSummary': 'Brief Description of the Business/Project',
            'executiveSummary.briefDescriptionOfBusinessProject': '1. Brief Description of the Business/Project',
            'executiveSummary.briefProfileOfEntrepreneur': '2. Brief Profile of an Entrepreneur',
            'executiveSummary.projectContributionsToEconomy': "3. Project's Contributions to the Economy",
            'marketingPlan.descriptionOfProduct': '1.1 Description of the Product',
            'marketingPlan.comparisonWithCompetitors': '1.2 Comparison of the Product with Its Competitors',
            'marketingPlan.location': '1.3 Location',
            'marketingPlan.marketArea': '1.4 Market Area',
            'marketingPlan.mainCustomers': '1.5 Main Customers',
            'marketingPlan.totalDemand': '1.6 Total Demand',
            'marketingPlan.sellingPrice': '1.7 Selling Price',
            'marketingPlan.promotionalMeasures': '1.8 Promotional Measures',
            'marketingPlan.marketingStrategy': '1.9 Marketing Strategy',
            'marketingPlan.marketingBudget': '1.10 Marketing Budget',
            'productionPlan.productionServiceProcess': '2.1 Production/Service Process',
            'productionPlan.fixedCapital': '2.2 Fixed Capital',
            'productionPlan.lifeOfFixedCapital': '2.3 Life of Fixed Capital',
            'productionPlan.sourcesOfEquipment': '2.4 Sources of Equipment',
            'productionPlan.plannedCapacity': '2.5 Planned Capacity',
            'productionPlan.futureCapacity': '2.6 Future Capacity',
            'productionPlan.rawMaterials': '2.7 Raw Materials',
            'productionPlan.costOfRawMaterials': '2.8 Cost of Raw Materials',
            'productionPlan.rawMaterialsAvailability': '2.9 Raw Materials Availability',
            'productionPlan.labor': '2.10 Labor',
            'productionPlan.costOfLabor': '2.11 Cost of Labor',
            'productionPlan.laborAvailability': '2.12 Labor Availability',
            'organizationAndManagementPlan.preOperatingActivities': '3.1 Pre Operating Activities',
            'organizationAndManagementPlan.preOperatingExpenses': '3.2 Pre Operating Expenses',
            'financialPlan.projectCost': '4.1 Project Cost',
            'productsServices.rows': 'Description of the Product',
            'marketStrategy.customerProfile': 'Primary Customers',
            'operationsPlan.productionProcess': 'Production / Service Process',
            'financialPlan.startupCapital': 'Project Cost',
            'implementationSchedule.rows': 'Pre-operating Activities',
            'applicantSignature.signedName': 'Ngalan sa mipirma',
            'applicantSignature.signedDate': 'Petsa sa pirma',
            'applicantSignature.signatureUpload': 'Pirma sa aplikante',
            'fundReleaseEvidence.releaseDate': 'Release date',
        };

        const validationLabels = {
            'applicantDetails.validationDate': 'Date of Validation',
            'applicantDetails.lastName': 'Last Name',
            'applicantDetails.firstName': 'First Name',
            'applicantDetails.middleName': 'Middle Name',
            'applicantDetails.purok': 'Address: Purok',
            'applicantDetails.barangay': 'Barangay',
            'applicantDetails.birthdate': 'Birthday',
            'applicantDetails.educationalAttainment': 'Educational Attainment',
            'applicantDetails.contactNumber': 'Contact number',
            'membershipChecklist.pantawidMember': 'Pantawid Member',
            'membershipChecklist.pantawidSpecify': 'Pantawid Specify',
            'membershipChecklist.slpaMember': 'SLPA Member',
            'membershipChecklist.slpaSpecify': 'SLPA Specify',
            'participantSignature.signatureUpload': 'Ngalan/Perma sa Partisepante',
        };

        const buhatLabels = {
            'beneficiary.fullName': 'Beneficiary Name',
            'beneficiary.addressLine': 'Beneficiary Address',
            'beneficiary.barangay': 'Beneficiary Barangay',
            'beneficiary.city': 'Beneficiary City',
            'project.programName': 'Program Name',
            'project.projectName': 'Project Name',
            'project.amountInWords': 'Amount in Words',
            'project.amountNumeric': 'Amount Numeric',
            'project.amountReceived': 'Amount Received',
            'coMaker.fullName': 'Co-maker Name',
            'coMaker.addressLine': 'Co-maker Address',
            'coMaker.barangay': 'Co-maker Barangay',
            'coMaker.city': 'Co-maker City',
            'agreement.dateSigned': 'Agreement Date',
            'agreement.yearSigned': 'Agreement Year',
            'applicantSignature.signedName': 'Prepared by',
            'applicantSignature.signatureUpload': 'Beneficiary Signature',
            'coMakerSignature.signedName': 'Co-maker',
            'coMakerSignature.signatureUpload': 'Co-maker Signature',
        };

        if (taskCode === 'business_plan' && businessPlanLabels[field]) {
            return businessPlanLabels[field];
        }

        if (taskCode === 'validation_form' && validationLabels[field]) {
            return validationLabels[field];
        }

        if (taskCode === 'buhat_sa_pagpanumpa' && buhatLabels[field]) {
            return buhatLabels[field];
        }

        return field;
    }

    function applyFieldErrors(errors) {
        const form = document.getElementById('postApprovalForm');
        if (!form) {
            return;
        }

        form.querySelectorAll('.is-field-error').forEach((element) => element.classList.remove('is-field-error'));

        Object.keys(errors || {}).forEach((field) => {
            const fieldNodes = Array.from(form.querySelectorAll(`[name="${cssEscape(field)}"]`));
            fieldNodes.forEach((node) => {
                node.classList.add('is-field-error');
                node.closest('.form-field, .bp-inline, .bp-textarea-wrap, .bp-product-card, .bp-schedule-wrap, .upload-field')?.classList.add('is-field-error');
                node.closest('details')?.setAttribute('open', '');
            });

            form.querySelector(`[data-error-group="${cssEscape(field)}"]`)?.classList.add('is-field-error');
        });
    }

    function isTaskEditable(task) {
        const status = String(task?.status || '');
        if (state.reviewerMode) {
            return status !== 'Locked';
        }
        if (status === 'Verified' || status === 'Locked') {
            return false;
        }
        if (status === 'Submitted') {
            return !hasTaskBeenChecked(task);
        }
        return true;
    }

    function hasTaskBeenChecked(task) {
        return Boolean(task?.reviewedAt) || ['Needs Correction', 'Rejected', 'Verified'].includes(String(task?.status || ''));
    }

    function applyFormEditability(task) {
        const form = document.getElementById('postApprovalForm');
        if (!form) {
            return;
        }

        const editable = isTaskEditable(task);
        form.querySelectorAll('input, select, textarea, button').forEach((field) => {
            if (!(field instanceof HTMLElement)) {
                return;
            }

            if (field.id === 'postApprovalSubmitButton' || field.id === 'postApprovalSaveButton') {
                return;
            }

            if (field.matches('[data-row-action]')) {
                field.toggleAttribute('disabled', !editable);
                return;
            }

            if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement || field instanceof HTMLButtonElement) {
                const ownership = resolveElementOwnership(field);
                const fieldEditable = editable
                    && ownership.editable
                    && (state.reviewerMode || ownership.owner === FIELD_OWNER_APPLICANT);
                field.classList.toggle('is-staff-locked', ownership.owner === FIELD_OWNER_STAFF);

                if (field.hasAttribute('readonly') && ownership.owner === FIELD_OWNER_APPLICANT) {
                    return;
                }
                field.disabled = !fieldEditable;
            }
        });
    }

    async function handleLogout() {
        try {
            const payload = await fetchJson('auth/logout', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: new URLSearchParams({ entryPoint: 'portal' }).toString(),
            });
            window.location.href = routeUrl(payload.redirect || 'portal');
        } catch (error) {
            showToast(error.message || 'Unable to log out right now.', 'warning');
        }
    }

    async function fetchJson(path, options = {}) {
        const response = await fetch(routeUrl(path), {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                ...options.headers,
            },
            ...options,
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            if (response.redirected) {
                window.location.href = response.url;
                throw new Error('Redirecting...');
            }
            throw new Error(`Unexpected response from ${path}.`);
        }

        const payload = await response.json();
        if (!response.ok) {
            if (payload.redirect) {
                window.location.href = routeUrl(payload.redirect);
                throw new Error('Redirecting...');
            }
            const error = new Error(payload.message || 'Request failed.');
            error.payload = payload;
            error.status = response.status;
            throw error;
        }

        return payload;
    }

    function toggleSidebarMenu() {
        const sidebar = document.querySelector('.dash-sidebar');
        if (!sidebar) {
            return;
        }

        sidebar.classList.toggle('is-open');
        syncSidebarMenuState();
    }

    function syncSidebarMenuState() {
        const sidebar = document.querySelector('.dash-sidebar');
        const toggle = document.getElementById('sidebarToggle');
        const overlay = document.getElementById('sidebarOverlay');
        const closeButton = document.getElementById('sidebarClose');
        if (!sidebar || !toggle) {
            return;
        }

        if (window.innerWidth > 960) {
            sidebar.classList.remove('is-open');
            document.body.classList.remove('drawer-open');
            toggle.setAttribute('aria-expanded', 'false');
            overlay?.classList.remove('is-visible');
            overlay?.setAttribute('aria-hidden', 'true');
            sidebar.removeAttribute('aria-modal');
            sidebar.removeAttribute('aria-hidden');
            closeButton?.setAttribute('tabindex', '-1');
            return;
        }

        const isOpen = sidebar.classList.contains('is-open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        overlay?.classList.toggle('is-visible', isOpen);
        overlay?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        sidebar.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        if (isOpen) {
            sidebar.setAttribute('aria-modal', 'true');
        } else {
            sidebar.removeAttribute('aria-modal');
        }
        document.body.classList.toggle('drawer-open', isOpen);
        closeButton?.setAttribute('tabindex', isOpen ? '0' : '-1');
    }

    function renderPaperValueLine(value, options = {}) {
        const classes = ['paper-fillline'];
        if (options.short) {
            classes.push('paper-fillline--short');
        }
        if (options.long) {
            classes.push('paper-fillline--long');
        }
        return `<span class="${classes.join(' ')}">${escapeHtml(value ?? '') || '&nbsp;'}</span>`;
    }

    function renderPaperStatementBlock(title, bodyHtml, signatureHtml = '') {
        return `
            <section class="paper-statement-block">
                <div class="paper-statement-head">
                    <h4>${escapeHtml(title)}</h4>
                </div>
                <div class="paper-statement-body">
                    ${bodyHtml}
                </div>
                ${signatureHtml ? `<div class="paper-statement-signature">${signatureHtml}</div>` : ''}
            </section>
        `;
    }

    function renderPaperSignatureArea(label, fieldsHtml) {
        return `
            <div class="paper-signature-area">
                <div class="paper-signature-line"></div>
                <div class="paper-signature-label">${escapeHtml(label)}</div>
                ${fieldsHtml ? `<div class="paper-signature-fields">${fieldsHtml}</div>` : ''}
            </div>
        `;
    }

    function renderPaperCertificationSentence(textHtml) {
        return `<p class="paper-certification-sentence">${textHtml}</p>`;
    }

    function renderPaperMobileStatement(title, description, contentHtml) {
        return `
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>${escapeHtml(title)}</h4>
                    ${description ? `<p>${escapeHtml(description)}</p>` : ''}
                </div>
                <div class="post-approval-statement">
                    ${contentHtml}
                </div>
            </section>
        `;
    }

    function renderGovernmentPaperHeader(documentTitle = '', subtitle = '') {
        const safeTitle = String(documentTitle || '').trim();
        const safeSubtitle = String(subtitle || '').trim();
        return `
            <header class="paper-gov-header">
                <div class="paper-gov-header__logos">
                    <img src="${escapeAttribute(mungkahingAssetUrl('city-of-butuan-logo.png'))}" alt="City of Butuan" class="paper-gov-header__logo">
                    <div class="paper-gov-header__copy">
                        <div>Republic of the Philippines</div>
                        <strong>CITY GOVERNMENT OF BUTUAN</strong>
                        <div>City Social Welfare and Development Department</div>
                        <div>J.P. Rosales Ave., Tandang Sora, Butuan City</div>
                    </div>
                    <img src="${escapeAttribute(mungkahingAssetUrl('dswd-logo.png'))}" alt="CSWDD" class="paper-gov-header__logo paper-gov-header__logo--right">
                </div>
                <div class="paper-gov-header__bar"></div>
                ${safeTitle ? `<div class="paper-gov-header__title">${escapeHtml(safeTitle)}</div>` : ''}
                ${safeSubtitle ? `<div class="paper-gov-header__subtitle">${escapeHtml(safeSubtitle)}</div>` : ''}
            </header>
        `;
    }

    function renderGovernmentPaperFooter(pageNumber, totalPages, options = {}) {
        const formCode = String(options.formCode || '').trim();
        const qrAsset = routeUrl('assets/img/qr-footer.png');
        return `
            <div class="page-no">Page ${pageNumber} of ${totalPages}</div>
            <footer class="footer footer--modern-gov">
                <div class="footer-rail"></div>
                <div class="footer-modern">
                    <div class="footer-modern__left">
                        <div class="footer-modern__qr" aria-hidden="true">
                            <img src="${escapeAttribute(qrAsset)}" alt="CSWDD QR code" class="footer-modern__qr-image" onerror="this.style.visibility='hidden';">
                        </div>
                        <div class="footer-modern__contact">
                            <div>Jose Rosales Ave. Brgy. Tandang Sora, Butuan City</div>
                            <div>Email: cswdd@butuan.gov.ph</div>
                            <div>Phone: 0956-224-1679</div>
                            <div>www.butuan.gov.ph</div>
                        </div>
                    </div>
                    <div class="footer-modern__marks">
                        <div class="footer-modern__cert">
                            <strong>TUVNORD</strong>
                            <span>Certificate Registration No. PHP</span>
                            <span>QMS 23 93 0116</span>
                        </div>
                        <div class="footer-modern__brand">
                            <img src="${escapeAttribute(mungkahingAssetUrl('butuanon-logo.png'))}" alt="ButuanON logo">
                            ${formCode ? `<small class="footer-modern__code">${escapeHtml(formCode)}</small>` : ''}
                        </div>
                    </div>
                </div>
            </footer>
        `;
    }

    function renderGovernmentPaperFooterImage(pageNumber, totalPages) {
        return `
            <div class="page-no">Page ${pageNumber} of ${totalPages}</div>
            <footer class="footer footer--image-gov">
                <img src="${escapeAttribute(routeUrl('assets/img/report-footer-2026.jpg'))}" alt="CSWDD footer" class="footer-image">
            </footer>
        `;
    }

    function renderGovernmentPaperTopStrip() {
        return `
            <header class="top-strip top-strip--modern-gov">
                <img src="${escapeAttribute(routeUrl('assets/img/report-header-2026.jpg'))}" alt="CSWDD header" class="top-strip__image">
            </header>
        `;
    }

    function renderGovernmentPaperTitleBlock(title, subtitle) {
        return `
            <div class="title-wrap">
                <div class="title-main">${escapeHtml(title)}</div>
                <div class="title-sub">${escapeHtml(subtitle)}</div>
            </div>
        `;
    }

    function renderValidationPaperHeader() {
        return `
            <header class="availment-source-header validation-source-header">
                ${renderGovernmentPaperTopStrip()}
                <div class="validation-paper__title-wrap">
                    <div class="validation-paper__program">Sustainable Market and Technology and Employment Assistance Program</div>
                    <div class="validation-paper__acronym">(SMART LEAP)</div>
                    <div class="validation-paper__title">VALIDATION FORM</div>
                </div>
            </header>
        `;
    }

    function renderAvailmentSourceHeader(showTitleBlock = false) {
        return `
            <header class="availment-source-header">
                ${renderGovernmentPaperTopStrip()}
                ${showTitleBlock ? `
                    <div class="availment-source-header__title">SMART LEAP AVAILMENT FORM</div>
                    <div class="availment-source-header__subtitle">CITY SOCIAL WELFARE AND DEVELOPMENT DEPARTMENT</div>
                ` : ''}
            </header>
        `;
    }

    function renderAvailmentSourceFooter() {
        return `
            ${renderGovernmentPaperFooterImage(state.availmentPage === 2 ? 2 : 1, 2).replace(`<div class="page-no">Page ${state.availmentPage === 2 ? 2 : 1} of 2</div>`, '')}
        `;
    }

    function renderAvailmentSourceLineField(label, name, value, type = 'text', options = {}) {
        const ownership = buildFieldOwnershipAttributes(name, false, Boolean(options.forceApplicant));
        const className = options.long ? 'availment-source-line__input availment-source-line__input--long' : 'availment-source-line__input';
        return `
            <label class="availment-source-line ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-only' : ''}">
                <span class="availment-source-line__label">${escapeHtml(label)}:</span>
                <input class="${className} ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="${escapeAttribute(type)}" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
                ${ownership.note}
            </label>
        `;
    }

    function renderAvailmentSourceCertificationLine(label, name, value, type = 'text', width = 'long', forceApplicant = false) {
        const ownership = buildFieldOwnershipAttributes(name, false, forceApplicant);
        return `
            <label class="availment-source-certline ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-only' : ''}">
                ${label ? `<span class="availment-source-certline__text">${escapeHtml(label)}</span>` : ''}
                <input class="availment-source-certline__input availment-source-certline__input--${escapeAttribute(width)} ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="${escapeAttribute(type)}" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
                ${ownership.note}
            </label>
        `;
    }

    function renderAvailmentInlineFillField(name, value, options = {}) {
        const ownership = buildFieldOwnershipAttributes(name, false, Boolean(options.forceApplicant));
        const classes = ['availment-inline-fill__input'];
        if (options.short) {
            classes.push('availment-inline-fill__input--short');
        }
        if (options.long) {
            classes.push('availment-inline-fill__input--long');
        }
        if (ownership.owner === FIELD_OWNER_STAFF) {
            classes.push('is-staff-locked');
        }
        return `<span class="availment-inline-fill ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-only' : ''}"><input class="${classes.join(' ')}" type="${escapeAttribute(options.type || 'text')}" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>${ownership.note}</span>`;
    }

    function renderAvailmentDesktop(payload) {
        const data = payload || {};
        const staff = data.staffReview || {};
        const pageOneCertification = staff.pageOneCertification || {};
        const physical = staff.physicalRequirements || {};
        const food = physical.foodRelatedCertification || {};
        const psycho = staff.psychoSocialRequirements || {};
        const residency = psycho.residencyAndCharacter || {};
        const relationships = psycho.familyRelationshipsWorkHabitsAspiration || {};
        const familyMembers = ensureRows(data.familyEnterprise?.members, { name: '', age: '', activities: '' }, getHardCopyRowLimit('add-family'));
        const incomeRows = ensureRows(data.incomeEligibility?.rows, { memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' }, getHardCopyRowLimit('add-income'));
        const healthRows = ensureRows(resolveAvailmentHealthRows(physical, data), { requirement: '', age: '', healthStatus: '' }, getHardCopyRowLimit('add-health'));
        return `
            <div class="paper-document paper-document--availment">
                <section class="paper-sheet paper-sheet--govform">
                    ${renderGovernmentPaperHeader('SMART LEAP AVAILMENT FORM', 'CITY SOCIAL WELFARE AND DEVELOPMENT DEPARTMENT')}
                    <div class="paper-gov-cityline">City: Butuan City</div>
                    <section class="paper-page-section">
                        ${renderMungkahingPaperSectionTitle('I.', 'CLIENT IDENTIFYING DATA:')}
                        <div class="paper-line-grid paper-line-grid--two paper-line-grid--govform">
                            ${renderMungkahingLineField('Name', 'clientIdentifyingData.name', data.clientIdentifyingData?.name || '', 'text')}
                            ${renderMungkahingLineField('Age', 'clientIdentifyingData.age', data.clientIdentifyingData?.age || '', 'number')}
                            ${renderMungkahingLineField('Address', 'clientIdentifyingData.address', data.clientIdentifyingData?.address || '', 'text')}
                            ${renderMungkahingLineField('Name of Spouse', 'clientIdentifyingData.spouseName', data.clientIdentifyingData?.spouseName || '', 'text')}
                        </div>
                    </section>
                    <section class="paper-page-section">
                        ${renderMungkahingPaperSectionTitle('II.', 'TYPE OF PROJECT:')}
                        <div class="paper-page-subtitle paper-page-subtitle--plain">A. Family Enterprise:</div>
                        ${renderDocumentFamilyTable(familyMembers, { paperMode: true })}
                        <div class="paper-page-subtitle paper-page-subtitle--plain">B. Individual Assistance:</div>
                        <div class="paper-line-grid paper-line-grid--two paper-line-grid--govform">
                            ${renderMungkahingLineField('Clientele Category', 'individualAssistance.clienteleCategory', data.individualAssistance?.clienteleCategory || '', 'text')}
                            ${renderMungkahingLineField('Nature of difficult circumstances', 'individualAssistance.natureOfDifficultCircumstances', data.individualAssistance?.natureOfDifficultCircumstances || '', 'text')}
                        </div>
                        <div class="paper-gov-certification">
                            I certify that
                            ${renderPaperValueLine(pageOneCertification.eligibilityStatementName || data.clientIdentifyingData?.name || '', { long: true })}
                            is eligible to avail the Sustainable Market and Technology Driven Livelihood and Employment Assistance Program (SMART LEAP) based on the assessment.
                        </div>
                        <div class="paper-signature-table paper-signature-table--compact">
                            <div class="paper-signature-row paper-signature-row--staff">
                                <div class="paper-signature-row__label">Direct Worker</div>
                                <div class="paper-signature-row__body">
                                    ${renderDocumentField('Direct worker name', 'staffReview.pageOneCertification.directWorkerName', pageOneCertification.directWorkerName || '', 'text')}
                                    ${renderDocumentField('Date signed', 'staffReview.pageOneCertification.signedDate', pageOneCertification.signedDate || '', 'date')}
                                    ${renderDocumentUpload('Direct worker signature upload', 'pageOneCertification.signatureUpload', pageOneCertification.signatureUpload || null)}
                                </div>
                            </div>
                        </div>
                    </section>
                    <section class="paper-page-section">
                        ${renderMungkahingPaperSectionTitle('III.', 'INCOME ELIGIBILITY REQUIREMENT:')}
                        ${renderDocumentIncomeTable(incomeRows, data.incomeEligibility?.totalFamilyIncome || '', { paperMode: true })}
                    </section>
                    ${renderGovernmentPaperFooterImage(1, 2)}
                </section>

                <section class="paper-sheet paper-sheet--govform">
                    ${renderGovernmentPaperHeader()}
                    <section class="paper-page-section">
                        ${renderMungkahingPaperSectionTitle('IV.', 'PHYSICAL REQUIREMENTS')}
                        <div class="paper-page-subtitle paper-page-subtitle--plain">A. Health Age Requirements</div>
                        ${renderDocumentHealthTable(healthRows)}
                        <div class="paper-page-subtitle paper-page-subtitle--plain">Food Related Projects:</div>
                        <div class="paper-gov-certification">
                            I certify that
                            ${renderPaperValueLine(resolveAvailmentApplicantName(data, food.applicantName), { long: true })}
                            has undergone medical check-up and is physically fit to run a food related projects.
                        </div>
                        <div class="paper-signature-table paper-signature-table--compact">
                            <div class="paper-signature-row paper-signature-row--staff">
                                <div class="paper-signature-row__label">Name and Signature of Certifying Officer</div>
                                <div class="paper-signature-row__body">
                                    ${renderDocumentField('Certifying officer name', 'staffReview.physicalRequirements.foodRelatedCertification.certifyingOfficerName', food.certifyingOfficerName || '', 'text')}
                                    ${renderDocumentField('Date signed', 'staffReview.physicalRequirements.foodRelatedCertification.signedDate', food.signedDate || '', 'date')}
                                    ${renderDocumentUpload('Certifying officer signature upload', 'physicalRequirements.foodRelatedCertification.signatureUpload', food.signatureUpload || null)}
                                </div>
                            </div>
                        </div>
                    </section>
                    <section class="paper-page-section">
                        ${renderMungkahingPaperSectionTitle('V.', 'PSYCHO-SOCIAL REQUIREMENTS:')}
                        <div class="paper-page-subtitle paper-page-subtitle--plain">A. Residency and Character (for barangay captain, parish priest, etc.)</div>
                        <div class="paper-gov-certification">
                            I certify that
                            ${renderPaperValueLine(resolveAvailmentApplicantName(data, residency.residentName), { long: true })}
                            a bona fide resident of the barangay and is of good moral character and has no adverse reputation.
                        </div>
                        <div class="paper-signature-table paper-signature-table--compact">
                            <div class="paper-signature-row paper-signature-row--staff">
                                <div class="paper-signature-row__label">Name and Signature of Certifying Officer</div>
                                <div class="paper-signature-row__body">
                                    ${renderDocumentField('Certifying officer name', 'staffReview.psychoSocialRequirements.residencyAndCharacter.certifyingOfficerName', residency.certifyingOfficerName || '', 'text')}
                                    ${renderDocumentField('Date signed', 'staffReview.psychoSocialRequirements.residencyAndCharacter.signedDate', residency.signedDate || '', 'date')}
                                    ${renderDocumentUpload('Certifying officer signature upload', 'psychoSocialRequirements.residencyAndCharacter.signatureUpload', residency.signatureUpload || null)}
                                </div>
                            </div>
                        </div>
                        <div class="paper-page-subtitle paper-page-subtitle--plain">B. Family Relationships, Work Habits, Aspirations</div>
                        <div class="paper-gov-certification">
                            I certify that through personal interview, home visit and collateral interview I have verified that
                            ${renderPaperValueLine(resolveAvailmentApplicantName(data, relationships.applicantName), { long: true })}
                            manifest positive relationships, good work habits and attitude as well as demonstrated capacity and adequate level of economic aspiration.
                        </div>
                        <div class="paper-signature-table paper-signature-table--compact">
                            <div class="paper-signature-row paper-signature-row--staff">
                                <div class="paper-signature-row__label">Name and Signature of Direct Worker</div>
                                <div class="paper-signature-row__body">
                                    ${renderDocumentField('Direct worker name', 'staffReview.psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.directWorkerName', relationships.directWorkerName || '', 'text')}
                                    ${renderDocumentField('Date signed', 'staffReview.psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signedDate', relationships.signedDate || '', 'date')}
                                    ${renderDocumentUpload('Direct worker signature upload', 'psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload', relationships.signatureUpload || null)}
                                </div>
                            </div>
                        </div>
                        <div class="paper-page-subtitle paper-page-subtitle--plain">C. Social Responsibility and willingness to save (client)</div>
                        <div class="paper-gov-certification">
                            I will abide by all the policies and guidelines set by CSWDD for the SMART LEAP and I promise to pay the roll-back at the time stipulated and to generate weekly savings to meet emergencies that may affect my family.
                        </div>
                        <div class="paper-signature-table paper-signature-table--compact">
                            <div class="paper-signature-row">
                                <div class="paper-signature-row__label">Name and Signature of Participant</div>
                                <div class="paper-signature-row__body">
                                    ${renderDocumentField('Participant signed name', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                                    ${renderDocumentField('Date signed', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date')}
                                    ${renderDocumentUpload('Participant signature upload', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                                </div>
                            </div>
                        </div>
                    </section>
                    ${renderGovernmentPaperFooterImage(2, 2)}
                </section>
            </div>
        `;
    }

    function renderValidationDesktop(payload) {
        const data = payload || {};
        const checklist = data.membershipChecklist || {};
        const recommendation = data.staffReview?.validatorRecommendation || {};
        const eligibility = data.staffReview?.eligibilityAssessment || {};
        const identity = data.staffReview?.validatorIdentity || {};
        const applicantDetails = data.applicantDetails || {};
        const applicantName = deriveApplicantName(data);
        const eligibilityResidentName = eligibility.residentName || data.participantSignature?.signedName || applicantName || '';
        const eligibilityAge = eligibility.age || applicantDetails.age || '';
        const eligibilityBarangay = eligibility.barangay || applicantDetails.barangay || '';

        return `
            <div class="paper-document paper-document--validation">
                <section class="paper-sheet paper-sheet--govform paper-sheet--validation paper-sheet--govpage">
                    ${renderGovernmentPaperTopStrip()}
                    ${renderGovernmentPaperTitleBlock(
                        'VALIDATION FORM',
                        'Sustainable Market and Technology and Employment Assistance Program (SMART LEAP)'
                    )}
                    <section class="paper-page-section">
                        <div class="paper-line-grid paper-line-grid--govform paper-line-grid--validation-date">
                            ${renderMungkahingLineField('Date of Validation', 'applicantDetails.validationDate', applicantDetails.validationDate || '', 'date')}
                        </div>
                        <div class="paper-validation-lines">
                            <div class="paper-validation-name-row">
                                <span class="paper-validation-label">Name:</span>
                                ${renderMungkahingLineField('Last Name', 'applicantDetails.lastName', applicantDetails.lastName || '', 'text')}
                                ${renderMungkahingLineField('First Name', 'applicantDetails.firstName', applicantDetails.firstName || '', 'text')}
                                ${renderMungkahingLineField('Middle Name', 'applicantDetails.middleName', applicantDetails.middleName || '', 'text')}
                            </div>
                            <div class="paper-validation-meta-row">
                                ${renderMungkahingLineField('Address: Purok', 'applicantDetails.purok', applicantDetails.purok || '', 'text')}
                                ${renderMungkahingLineField('Barangay', 'applicantDetails.barangay', applicantDetails.barangay || '', 'text')}
                            </div>
                            <div class="paper-validation-meta-row">
                                ${renderMungkahingLineField('Birthday', 'applicantDetails.birthdate', applicantDetails.birthdate || '', 'date')}
                                ${renderMungkahingLineField('Educational Attainment', 'applicantDetails.educationalAttainment', applicantDetails.educationalAttainment || '', 'text')}
                            </div>
                            <div class="paper-validation-contact-row">
                                ${renderMungkahingLineField('Contact number', 'applicantDetails.contactNumber', applicantDetails.contactNumber || '', 'text')}
                            </div>
                        </div>
                    </section>
                    <section class="paper-page-section">
                        ${renderValidationChecklistTable(checklist, { paperMode: true })}
                    </section>
                    <section class="paper-page-section">
                        <div class="paper-validation-inline-label">Validator's Recommendation:</div>
                        <div class="paper-validation-recommendation">
                            <textarea class="paper-validation-lines-input" name="staffReview.validatorRecommendation.recommendationText" data-field-owner="staff" data-field-ref="staffReview.validatorRecommendation.recommendationText" rows="3" disabled>${escapeHtml(recommendation.recommendationText || '')}</textarea>
                        </div>
                    </section>
                    <section class="paper-page-section paper-page-section--validation-closing">
                        <div class="paper-line-grid paper-line-grid--govform paper-line-grid--two">
                            ${renderMungkahingLineField('Resident name', 'staffReview.eligibilityAssessment.residentName', eligibilityResidentName, 'text', true)}
                            ${renderMungkahingLineField('Age', 'staffReview.eligibilityAssessment.age', eligibilityAge, 'text', true)}
                            ${renderMungkahingLineField('Barangay', 'staffReview.eligibilityAssessment.barangay', eligibilityBarangay, 'text', true)}
                        </div>
                        <div class="paper-gov-certification paper-gov-certification--validation">
                            Ako si
                            ${renderPaperValueLine(eligibilityResidentName, { long: true })}
                            ,
                            ${renderPaperValueLine(eligibilityAge, { short: true })}
                            anyos, lumulupyo sa Barangay
                            ${renderPaperValueLine(eligibilityBarangay, { long: true })}
                            , Butuan City, Agusan Del Norte. Ako nakasabot sa tumong ug proseso niining Livelihood Assistance kung diin ako
                            ${renderPaperInlineChoiceField('staffReview.eligibilityAssessment.eligibilityDecision', eligibility.eligibilityDecision || '', ['ANGAYAN', 'DILI ANGAYAN'], false, true)}
                            mamahimong benepisyo sa among program nga gidumala sa SMART LEAP ng City Social Welfare and Development Department (CSWDD).
                        </div>
                        <div class="paper-validation-signatures">
                            <div class="paper-validation-signature">
                                ${renderApplicantSignatureStamp(applicantName, 'participantSignature.signatureUpload', data.participantSignature?.signatureUpload || null)}
                            </div>
                            <div class="paper-validation-signature">
                                <div class="paper-validation-signature__line"></div>
                                <div class="paper-validation-signature__label">Ngalan/Perma sa Validator</div>
                            </div>
                        </div>
                    </section>
                    ${renderGovernmentPaperFooterImage(1, 1)}
                </section>
            </div>
        `;
    }

    function renderAvailmentMobile(payload) {
        const data = payload || {};
        const commitments = data.clientCommitment || {};
        const agreedToRollBackSchedule = Boolean(commitments.agreedToRollBackSchedule ?? commitments.agreedToSavingsCommitment);
        const agreedToWeeklySavings = Boolean(commitments.agreedToWeeklySavings ?? commitments.agreedToSavingsCommitment);
        const familyMembers = ensureRows(data.familyEnterprise?.members, { name: '', age: '', activities: '' }, getHardCopyRowLimit('add-family'));
        const incomeRows = ensureRows(data.incomeEligibility?.rows, { memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' }, getHardCopyRowLimit('add-income'));

        return `
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>I. Client Identifying Data</h4>
                    <p>Same content and order as desktop, arranged vertically for mobile.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Name', 'clientIdentifyingData.name', data.clientIdentifyingData?.name || '', 'text')}
                    ${renderField('Age', 'clientIdentifyingData.age', data.clientIdentifyingData?.age || '', 'number')}
                    ${renderField('Address', 'clientIdentifyingData.address', data.clientIdentifyingData?.address || '', 'text', true)}
                    ${renderField('Name of spouse', 'clientIdentifyingData.spouseName', data.clientIdentifyingData?.spouseName || '', 'text', true)}
                    ${renderReadOnlyField('City', 'Butuan City')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>II. Type of Project</h4>
                    <p>A. Family Enterprise</p>
                </div>
                <div class="post-approval-repeatable" data-repeatable="familyMembers">
                    <div class="post-approval-repeatable__header">
                        <span class="post-approval-repeatable__title">Family members participating</span>
                        ${renderAddRowButton('add-family', 'Add family member', familyMembers)}
                    </div>
                    ${familyMembers.map((row, index) => renderFamilyMemberRow(row, index)).join('')}
                </div>
                <div class="post-approval-subsection">
                    <h5>B. Individual Assistance</h5>
                    <div class="post-approval-fields">
                        ${renderField('Clientele category', 'individualAssistance.clienteleCategory', data.individualAssistance?.clienteleCategory || '', 'text')}
                        ${renderTextarea('Nature of difficult circumstances', 'individualAssistance.natureOfDifficultCircumstances', data.individualAssistance?.natureOfDifficultCircumstances || '', true)}
                    </div>
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>III. Income Eligibility Requirement</h4>
                    <p>Same content as desktop, stacked for smaller screens.</p>
                </div>
                <div class="post-approval-repeatable" data-repeatable="incomeRows">
                    <div class="post-approval-repeatable__header">
                        <span class="post-approval-repeatable__title">Monthly income rows</span>
                        ${renderAddRowButton('add-income', 'Add income row', incomeRows)}
                    </div>
                    ${incomeRows.map((row, index) => renderIncomeRow(row, index)).join('')}
                </div>
                <div class="post-approval-fields">
                    ${renderField('Total family income', 'incomeEligibility.totalFamilyIncome', data.incomeEligibility?.totalFamilyIncome || '', 'number')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>IV. Social Responsibility and willingness to save (client)</h4>
                    <p>Applicant commitment block only.</p>
                </div>
                ${renderPaperMobileStatement(
                    'C. Social Responsibility and willingness to save (client)',
                    '',
                    `
                        <p>I will abide by all the policies and guidelines set by CSWDD for the SMART LEAP and I promise to pay the roll-back at the time stipulated and to generate weekly savings to meet emergencies that may affect my family.</p>
                        <div class="post-approval-fields">
                            ${renderField('Participant signed name', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                            ${renderField('Date signed', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date')}
                            ${renderUploadField('Participant signature upload', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                        </div>
                    `
                )}
            </section>
        `;
    }

    function renderValidationMobile(payload) {
        const data = payload || {};
        const checklist = data.membershipChecklist || {};
        const recommendation = data.staffReview?.validatorRecommendation || {};
        const eligibility = data.staffReview?.eligibilityAssessment || {};
        const identity = data.staffReview?.validatorIdentity || {};
        const applicantDetails = data.applicantDetails || {};
        const applicantName = deriveApplicantName(data);
        const eligibilityResidentName = eligibility.residentName || data.participantSignature?.signedName || applicantName || '';
        const eligibilityAge = eligibility.age || applicantDetails.age || '';
        const eligibilityBarangay = eligibility.barangay || applicantDetails.barangay || '';

        return `
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Validation Form</h4>
                    <p>Same section order and content as desktop, arranged vertically for phone screens.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Date of validation', 'applicantDetails.validationDate', data.applicantDetails?.validationDate || '', 'date')}
                    ${renderField('Last name', 'applicantDetails.lastName', data.applicantDetails?.lastName || '', 'text')}
                    ${renderField('First name', 'applicantDetails.firstName', data.applicantDetails?.firstName || '', 'text')}
                    ${renderField('Middle name', 'applicantDetails.middleName', data.applicantDetails?.middleName || '', 'text')}
                    ${renderField('Purok', 'applicantDetails.purok', data.applicantDetails?.purok || '', 'text')}
                    ${renderField('Barangay', 'applicantDetails.barangay', data.applicantDetails?.barangay || '', 'text')}
                    ${renderField('Birthdate', 'applicantDetails.birthdate', data.applicantDetails?.birthdate || '', 'date')}
                    ${renderField('Educational attainment', 'applicantDetails.educationalAttainment', data.applicantDetails?.educationalAttainment || '', 'text')}
                    ${renderField('Contact number', 'applicantDetails.contactNumber', data.applicantDetails?.contactNumber || '', 'text')}
                </div>
            </section>
            <section class="post-approval-section">
                <div class="post-approval-section__header">
                    <h4>Checklist</h4>
                    <p>Same checklist items as desktop, stacked for mobile.</p>
                </div>
                <div class="post-approval-checklist">
                    <div class="post-approval-checklist__row">
                        <strong>Pantawid Member</strong>
                        ${renderSelectField('Response', 'membershipChecklist.pantawidMember', checklist.pantawidMember || '', ['', 'Yes', 'No'])}
                        ${renderField('Specify', 'membershipChecklist.pantawidSpecify', checklist.pantawidSpecify || '', 'text')}
                    </div>
                    <div class="post-approval-checklist__row">
                        <strong>SLPA Member</strong>
                        ${renderSelectField('Response', 'membershipChecklist.slpaMember', checklist.slpaMember || '', ['', 'Yes', 'No'])}
                        ${renderField('Specify', 'membershipChecklist.slpaSpecify', checklist.slpaSpecify || '', 'text')}
                    </div>
                </div>
            </section>
            ${renderPaperMobileStatement(
                `Validator's Recommendation`,
                '',
                `${renderReadOnlyField('Recommendation', recommendation.recommendationText || '')}`
            )}
            ${renderPaperMobileStatement(
                'Eligibility Assessment',
                '',
                `
                    <div class="post-approval-fields">
                        ${renderField('Resident name', 'staffReview.eligibilityAssessment.residentName', eligibilityResidentName, 'text', false, false, true)}
                        ${renderField('Age', 'staffReview.eligibilityAssessment.age', eligibilityAge, 'text', false, false, true)}
                        ${renderField('Barangay', 'staffReview.eligibilityAssessment.barangay', eligibilityBarangay, 'text', false, false, true)}
                        ${renderSelectField('Eligibility decision', 'staffReview.eligibilityAssessment.eligibilityDecision', eligibility.eligibilityDecision || '', ['', 'ANGAYAN', 'DILI ANGAYAN'], false, true)}
                    </div>
                    <p>Ako si <strong>${escapeHtml(eligibilityResidentName || '--')}</strong>, <strong>${escapeHtml(eligibilityAge || '--')}</strong> anyos, lumulupyo sa Barangay <strong>${escapeHtml(eligibilityBarangay || '--')}</strong>, Butuan City, Agusan Del Norte. Ako nakasabot sa tumong ug proseso niining Livelihood Assistance kung diin ako <strong>${escapeHtml(eligibility.eligibilityDecision || '--')}</strong> (ANGAYAN/DILI ANGAYAN) mamahimong benepisyo sa among program nga gidumala sa SMART LEAP ng City Social Welfare and Development Department (CSWDD).</p>
                    <div class="post-approval-fields">
                        ${renderField('Participant signed name', 'participantSignature.signedName', data.participantSignature?.signedName || '', 'text')}
                        ${renderField('Date signed', 'participantSignature.signedDate', data.participantSignature?.signedDate || '', 'date')}
                        ${renderUploadField('Participant signature upload', 'participantSignature.signatureUpload', data.participantSignature?.signatureUpload || null)}
                        ${renderReadOnlyField('Validator name', identity.validatorName || '')}
                        ${renderReadOnlyField('Validator signed date', identity.signedDate || '')}
                        ${renderUploadField('Validator signature upload', 'validatorIdentity.signatureUpload', identity.signatureUpload || null, true)}
                    </div>
                `
            )}
        `;
    }

    function renderMungkahingMobile(payload) {
        const data = payload || {};
        const project = data.projectInformation || {};
        const sectoral = data.sectoralClassification || {};
        const pantawid = sectoral.pantawid || {};
        const nonPantawid = sectoral.nonPantawid || {};
        const modalityRows = ensureRows(data.modalityApplications?.rows, { fundSource: '', contributionType: '', amount: '' }, getHardCopyRowLimit('add-mp-contribution'));
        const materialsRows = ensureRows(data.businessOperation?.materials?.rows, { material: '', quality: '', unit: '', unitPrice: '', cyclesPerProduction: '', projectedCost: '' }, getHardCopyRowLimit('add-mp-material'));
        const laborRows = ensureRows(data.businessOperation?.labor?.rows, { workerName: '', position: '', dailyWage: '' }, getHardCopyRowLimit('add-mp-labor'));
        const equipmentRows = ensureRows(data.businessOperation?.toolsEquipment?.rows, { equipment: '', capacity: '', unit: '', quantityOrPrice: '', projectedAmount: '', usefulLifeDays: '', productionCycle: '', depreciationCost: '' }, getHardCopyRowLimit('add-mp-equipment'));
        const expenseRows = ensureMungkahingExpenseRows(data.businessOperation?.operatingExpenses?.rows);
        const salesRows = ensureRows(data.businessOperation?.salesProjection?.rows, { product: '', capacity: '', unit: '', sellingPrice: '', projectedSales: '' }, getHardCopyRowLimit('add-mp-sale'));
        const spendingRows = ensureRows(data.spendingPlan?.rows, { expense: '', amount: '', usageSchedule: '' }, getHardCopyRowLimit('add-mp-spending'));
        const income = data.businessOperation?.incomeComputation || {};

        return `
            <section class="post-approval-section post-approval-section--mungkahing">
                <div class="post-approval-section__header">
                    <h4>I. Kinatibuk-an Impormasyon Bahin sa Proyekto</h4>
                    <p>Kinatibuk-ang detalye sa partisipante ug sa proyekto.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Ngalan sa Partisipante', 'projectInformation.participantName', project.participantName || '', 'text')}
                    ${renderField('Lokasyon sa Proyekto', 'projectInformation.projectLocation', project.projectLocation || '', 'text')}
                    ${renderField('Ulohan sa Proyektong MD', 'projectInformation.projectTitle', project.projectTitle || '', 'text', true)}
                    ${renderField('Petsa sa Pagtukod', 'projectInformation.projectDate', project.projectDate || '', 'date')}
                    ${renderField('Kinatibuk-ang Kantidad', 'projectInformation.projectedAmount', project.projectedAmount || '', 'number')}
                    ${renderField('Kantidad gikan sa CSWDD', 'projectInformation.cswddAmount', project.cswddAmount || '', 'number')}
                    ${renderField('Laing kakuhaon sa pondo', 'projectInformation.otherFundingSource', project.otherFundingSource || '', 'text', true)}
                    ${renderField('Savings Account No.', 'projectInformation.savingsAccountNumber', project.savingsAccountNumber || 'NONE', 'text')}
                </div>
            </section>
            <section class="post-approval-section post-approval-section--mungkahing">
                <div class="post-approval-section__header">
                    <h4>Sectoral</h4>
                    <p>Ibutang ang numeric counts sa fixed paper-faithful sectoral table.</p>
                </div>
                ${renderMungkahingMobileSectorTable(pantawid, nonPantawid)}
            </section>
            <section class="post-approval-section post-approval-section--mungkahing">
                <div class="post-approval-section__header">
                    <h4>II. Rationale of the Proposed Project</h4>
                    <p>Rason ug katuyoan sa mungkahing proyekto.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderTextarea('Project rationale', 'rationale', data.rationale || '', true)}
                </div>
            </section>
            ${renderMungkahingMobileRowsSection('III. Detalye sa Modality Application/s', 'Pondo nga gi-ambag sa mga partner/s', modalityRows, '', renderMungkahingContributionRow)}
            ${renderMungkahingMobileRowsSection('IV.a Mga gikinahanglan nga Materyales', 'Mga gikinahanglan nga materyales', materialsRows, 'add-mp-material', renderMungkahingMaterialRow)}
            ${renderMungkahingMobileTotalSection('IV.a Kinatibuk-ang Total', renderField('Kinatibuk-ang Total', 'businessOperation.materials.totalCost', data.businessOperation?.materials?.totalCost || '', 'number'))}
            ${renderMungkahingMobileRowsSection('IV.b Mga gikinahanglan na Trabahante', 'Mga trabahanteng kinahanglanon', laborRows, 'add-mp-labor', renderMungkahingLaborRow)}
            ${renderMungkahingMobileTotalSection('IV.b Kinatibuk-ang suweldo', `
                ${renderField('Kinatibuk-an na inadlaw na suweldo', 'businessOperation.labor.totalDailyWage', data.businessOperation?.labor?.totalDailyWage || '', 'number')}
                ${renderField('Kinatibuk-an na suweldo base sa siglo sa produksyon', 'businessOperation.labor.totalProductionCycleWage', data.businessOperation?.labor?.totalProductionCycleWage || '', 'number')}
            `)}
            ${renderMungkahingMobileRowsSection('IV.c Mga Gikinahanglan nga Kagamitan', 'Mga kagamitan ug depreciation', equipmentRows, 'add-mp-equipment', renderMungkahingEquipmentRow)}
            ${renderMungkahingMobileTotalSection('IV.c Kinatibuk-ang Total', renderField('Kinatibuk-ang Total', 'businessOperation.toolsEquipment.totalCost', data.businessOperation?.toolsEquipment?.totalCost || '', 'number'))}
            ${renderMungkahingMobileFixedExpenseSection(expenseRows, data.businessOperation?.operatingExpenses?.grandTotal || '')}
            ${renderMungkahingMobileRowsSection('IV.e Pangunahing kita gikan sa puhunan alang sa mga sangkap', 'Mga produkto ug kita sa pagpamaligya', salesRows, 'add-mp-sale', renderMungkahingSalesRow)}
            ${renderMungkahingMobileTotalSection('IV.e Gross Sales', renderField('Gross Sales', 'businessOperation.salesProjection.grossSales', data.businessOperation?.salesProjection?.grossSales || '', 'number'))}
            <section class="post-approval-section post-approval-section--mungkahing">
                <div class="post-approval-section__header">
                    <h4>IV.f Kinatibuk-ang kita sa matag produkto o paghimo sa serbisyo</h4>
                    <p>Kinatibuk-ang komputasyon sa kita ug gasto.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Gilauman nga kita alang sa usa ka "siklo sa produksyon"', 'businessOperation.incomeComputation.projectedIncomePerCycle', income.projectedIncomePerCycle || '', 'number')}
                    ${renderField('Mga materyales (raw materials)', 'businessOperation.incomeComputation.rawMaterialsCost', income.rawMaterialsCost || '', 'number')}
                    ${renderField('Gikinahanglan na manpower ug labor', 'businessOperation.incomeComputation.manpowerLaborCost', income.manpowerLaborCost || '', 'number')}
                    ${renderField('Depreciation Cost', 'businessOperation.incomeComputation.depreciationCost', income.depreciationCost || '', 'number')}
                    ${renderField('Uban pang mga Gasto', 'businessOperation.incomeComputation.otherExpenses', income.otherExpenses || '', 'number')}
                    ${renderField('Kinatibuk-ang gasto sa pag-operate', 'businessOperation.incomeComputation.totalOperatingCost', income.totalOperatingCost || '', 'number')}
                    ${renderField('Kinatibuk-ang ginansya human sa gasto sa operasyon (Gross Profit)', 'businessOperation.incomeComputation.grossProfit', income.grossProfit || '', 'number')}
                    ${renderField('Net profit', 'businessOperation.incomeComputation.netProfit', income.netProfit || '', 'number')}
                </div>
            </section>
            ${renderMungkahingMobileRowsSection('IV.g Iskedyul o Plano sa Paggasto sa SEA-K Capital Fund', 'Spending plan rows', spendingRows, 'add-mp-spending', renderMungkahingSpendingRow)}
            <section class="post-approval-section post-approval-section--mungkahing">
                <div class="post-approval-section__header">
                    <h4>V. Pirma sa Partisipante</h4>
                    <p>Ibutang ang pirma sa partisipante alang sa proposal package.</p>
                </div>
                <div class="post-approval-fields">
                    ${renderField('Pangalan nga gipirmahan', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                    ${renderField('Petsa sa pagpirma', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date')}
                    ${renderUploadField('Upload sa pirma sa partisipante', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                </div>
            </section>
        `;
    }

    function formatSectorCountInputValue(value) {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        const normalized = Number.parseInt(String(value), 10);
        if (!Number.isFinite(normalized) || normalized <= 0) {
            return '';
        }

        return String(normalized);
    }

    function renderSectorCountInput(name, value, className = '') {
        const ownership = buildFieldOwnershipAttributes(name, false);
        return `<input class="cell-input cell-input--count ${className} ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="number" inputmode="numeric" min="0" step="1" name="${escapeAttribute(name)}" value="${escapeAttribute(formatSectorCountInputValue(value))}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>${ownership.note}`;
    }

    function isSectorCheckboxChecked(value) {
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

    function renderSectorCheckboxInput(name, value, label = '') {
        const ownership = buildFieldOwnershipAttributes(name, false);
        return `<input class="sectoral-table__checkbox ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="checkbox" name="${escapeAttribute(name)}" aria-label="${escapeAttribute(label || name)}" ${ownership.attrs} ${isSectorCheckboxChecked(value) ? 'checked' : ''} ${ownership.disabled ? 'disabled' : ''}>${ownership.note}`;
    }

    function renderMungkahingMobileSectorTable(pantawid, nonPantawid) {
        return `
            <div class="paper-table-wrap paper-table-wrap--scroll">
                ${renderMungkahingSectorMatrix(pantawid, nonPantawid)}
            </div>
        `;
    }

    function renderDocumentMungkahingSectorTable(pantawid, nonPantawid) {
        return `<div class="paper-table-wrap">${renderMungkahingSectorMatrix(pantawid, nonPantawid)}</div>`;
    }

    function renderPaperTableWithRows(headers, rows) {
        return `
            <div class="paper-table-wrap">
                <table class="paper-table">
                    <thead>
                        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderMungkahingMobileRowsSection(title, description, rows, addAction, rowRenderer) {
        const addButton = addAction ? renderAddRowButton(addAction, 'Add row', rows) : '';
        return `
            <section class="post-approval-section post-approval-section--mungkahing">
                <div class="post-approval-section__header">
                    <h4>${escapeHtml(title)}</h4>
                    <p>${escapeHtml(description)}</p>
                </div>
                <div class="post-approval-repeatable">
                    <div class="post-approval-repeatable__header">
                        <span class="post-approval-repeatable__title">${escapeHtml(description)}</span>
                        ${addButton}
                    </div>
                    ${rows.map((row, index) => rowRenderer(row, index)).join('')}
                </div>
            </section>
        `;
    }

    function renderMungkahingMobileTotalSection(title, fieldsHtml) {
        return `
            <section class="post-approval-section post-approval-section--mungkahing post-approval-section--total">
                <div class="post-approval-section__header">
                    <h4>${escapeHtml(title)}</h4>
                </div>
                <div class="post-approval-fields post-approval-fields--totals">
                    ${fieldsHtml}
                </div>
            </section>
        `;
    }

    function renderMungkahingRepeatableRow(fieldsHtml, removeAction, index, title = 'Row') {
        const removeMarkup = removeAction ? `
            <div class="form-field">
                <span>Remove row</span>
                <button type="button" class="btn-outline small post-approval-row-action" data-row-action="${escapeAttribute(removeAction)}" data-row-index="${index}">Remove</button>
            </div>
        ` : '';
        return `
            <div class="post-approval-repeatable__row post-approval-repeatable__row--mungkahing">
                <div class="post-approval-repeatable__row-head">
                    <span class="post-approval-repeatable__badge">${escapeHtml(title)} ${Number(index) + 1}</span>
                </div>
                ${fieldsHtml}
                ${removeMarkup}
            </div>
        `;
    }

    function renderMungkahingContributionRow(row, index) {
        return renderMungkahingRepeatableRow(`
            ${renderReadOnlyField('Kakuhuan sa Pondo', row.fundSource || '')}
            ${renderField('Gi-ambag', `modalityApplications.rows.${index}.contributionType`, row.contributionType || '', 'text')}
            ${renderField('Kantidad', `modalityApplications.rows.${index}.amount`, row.amount || '', 'number')}
        `, '', index, 'Partner');
    }

    function renderMungkahingMaterialRow(row, index) {
        return renderMungkahingRepeatableRow(`
            ${renderField('Material', `businessOperation.materials.rows.${index}.material`, row.material || '', 'text')}
            ${renderField('Kadaghanon', `businessOperation.materials.rows.${index}.quality`, row.quality || '', 'text')}
            ${renderField('Yunit', `businessOperation.materials.rows.${index}.unit`, row.unit || '', 'text')}
            ${renderField('Unit Price', `businessOperation.materials.rows.${index}.unitPrice`, row.unitPrice || '', 'number')}
            ${renderField('Siklo sa Produksyon', `businessOperation.materials.rows.${index}.cyclesPerProduction`, row.cyclesPerProduction || '', 'text')}
            ${renderField('Kinatibuk-ang kantidad', `businessOperation.materials.rows.${index}.projectedCost`, row.projectedCost || '', 'number')}
        `, 'remove-mp-material', index, 'Materyales');
    }

    function renderMungkahingLaborRow(row, index) {
        return renderMungkahingRepeatableRow(`
            ${renderField('Worker name', `businessOperation.labor.rows.${index}.workerName`, row.workerName || '', 'text')}
            ${renderField('Position', `businessOperation.labor.rows.${index}.position`, row.position || '', 'text')}
            ${renderField('Daily wage', `businessOperation.labor.rows.${index}.dailyWage`, row.dailyWage || '', 'number')}
        `, 'remove-mp-labor', index, 'Trabahante');
    }

    function renderMungkahingEquipmentRow(row, index) {
        return renderMungkahingRepeatableRow(`
            ${renderField('Kagamitan', `businessOperation.toolsEquipment.rows.${index}.equipment`, row.equipment || '', 'text')}
            ${renderField('Kadaghanon', `businessOperation.toolsEquipment.rows.${index}.capacity`, row.capacity || '', 'text')}
            ${renderField('Yunit', `businessOperation.toolsEquipment.rows.${index}.unit`, row.unit || '', 'text')}
            ${renderField('Kantidad o presyo sa matag usa', `businessOperation.toolsEquipment.rows.${index}.quantityOrPrice`, row.quantityOrPrice || '', 'number')}
            ${renderField('Kinatibuk-an nga kantidad o presyo', `businessOperation.toolsEquipment.rows.${index}.projectedAmount`, row.projectedAmount || '', 'number')}
            ${renderField('Gitas-on sa kinabuhi sa mga himan/kagamitan', `businessOperation.toolsEquipment.rows.${index}.usefulLifeDays`, row.usefulLifeDays || '', 'text')}
            ${renderField('Siklo sa Produksyon', `businessOperation.toolsEquipment.rows.${index}.productionCycle`, row.productionCycle || '', 'text')}
            ${renderField('Depreciation Cost', `businessOperation.toolsEquipment.rows.${index}.depreciationCost`, row.depreciationCost || '', 'number')}
        `, 'remove-mp-equipment', index, 'Kagamitan');
    }

    function renderMungkahingFixedExpenseRow(row, index) {
        return `
            <div class="post-approval-repeatable__row">
                ${renderReadOnlyField('Regular na ginagastuhan', row.expenseName || '')}
                ${renderField('Dalas ng pagbayad', `businessOperation.operatingExpenses.rows.${index}.paymentFrequency`, row.paymentFrequency || '', 'text')}
                ${renderField('Kinatibuk-an na kantidad o presyo base sa siglo sa produksyon', `businessOperation.operatingExpenses.rows.${index}.projectedCost`, row.projectedCost || '', 'number')}
            </div>
        `;
    }

    function renderMungkahingSalesRow(row, index) {
        return renderMungkahingRepeatableRow(`
            ${renderField('Produkto', `businessOperation.salesProjection.rows.${index}.product`, row.product || '', 'text')}
            ${renderField('Kadaghanon', `businessOperation.salesProjection.rows.${index}.capacity`, row.capacity || '', 'text')}
            ${renderField('Yunit', `businessOperation.salesProjection.rows.${index}.unit`, row.unit || '', 'text')}
            ${renderField('Kantidad sa pagpamaligya matag piraso', `businessOperation.salesProjection.rows.${index}.sellingPrice`, row.sellingPrice || '', 'number')}
            ${renderField('Kinatibuk-an na kantidad sa pagpamaligya base sa siglo sa produksyon', `businessOperation.salesProjection.rows.${index}.projectedSales`, row.projectedSales || '', 'number')}
        `, 'remove-mp-sale', index, 'Produkto');
    }

    function renderMungkahingMobileFixedExpenseSection(rows, grandTotal) {
        return `
            <section class="post-approval-section post-approval-section--mungkahing">
                <div class="post-approval-section__header">
                    <h4>IV.d Uban pang mga gastohanan</h4>
                    <p>Regular na ginagastuhan nga permanente sa porma.</p>
                </div>
                <div class="post-approval-repeatable">
                    ${rows.map((row, index) => renderMungkahingFixedExpenseRow(row, index)).join('')}
                </div>
                <div class="post-approval-fields post-approval-fields--totals">
                    ${renderField('Grand Total', 'businessOperation.operatingExpenses.grandTotal', grandTotal || '', 'number')}
                </div>
            </section>
        `;
    }

    function defaultMungkahingExpenseRows() {
        return [
            { expenseName: 'Renta sa himuanan sa produkto/opisina', paymentFrequency: '', projectedCost: '' },
            { expenseName: 'Kuryente', paymentFrequency: '', projectedCost: '' },
            { expenseName: 'Tubig', paymentFrequency: '', projectedCost: '' },
            { expenseName: 'Pamilite', paymentFrequency: '', projectedCost: '' },
            { expenseName: 'Permit sa pag-operate', paymentFrequency: '', projectedCost: '' },
            { expenseName: 'Lain pang mga gastohanan', paymentFrequency: '', projectedCost: '' },
        ];
    }

    function ensureMungkahingExpenseRows(rows) {
        const source = Array.isArray(rows) ? rows : [];
        return defaultMungkahingExpenseRows().map((defaultRow, index) => ({
            expenseName: defaultRow.expenseName,
            paymentFrequency: source[index]?.paymentFrequency || '',
            projectedCost: source[index]?.projectedCost || '',
        }));
    }

    function renderMungkahingSpendingRow(row, index) {
        return renderMungkahingRepeatableRow(`
            ${renderField('Expense', `spendingPlan.rows.${index}.expense`, row.expense || '', 'text')}
            ${renderField('Amount', `spendingPlan.rows.${index}.amount`, row.amount || '', 'number')}
            ${renderField('Usage schedule', `spendingPlan.rows.${index}.usageSchedule`, row.usageSchedule || '', 'text')}
        `, 'remove-mp-spending', index, 'Gasto');
    }

    function renderMungkahingDesktopPaper(payload) {
        const data = payload || {};
        const project = data.projectInformation || {};
        const sectoral = data.sectoralClassification || {};
        const pantawid = sectoral.pantawid || {};
        const nonPantawid = sectoral.nonPantawid || {};
        const modalityRows = ensureRows(data.modalityApplications?.rows, { fundSource: '', contributionType: '', amount: '' }, getHardCopyRowLimit('add-mp-contribution'));
        const materialsRows = ensureRows(data.businessOperation?.materials?.rows, { material: '', quality: '', unit: '', unitPrice: '', cyclesPerProduction: '', projectedCost: '' }, getHardCopyRowLimit('add-mp-material'));
        const laborRows = ensureRows(data.businessOperation?.labor?.rows, { workerName: '', position: '', dailyWage: '' }, getHardCopyRowLimit('add-mp-labor'));
        const equipmentRows = ensureRows(data.businessOperation?.toolsEquipment?.rows, { equipment: '', capacity: '', unit: '', quantityOrPrice: '', projectedAmount: '', usefulLifeDays: '', productionCycle: '', depreciationCost: '' }, getHardCopyRowLimit('add-mp-equipment'));
        const expenseRows = ensureMungkahingExpenseRows(data.businessOperation?.operatingExpenses?.rows);
        const salesRows = ensureRows(data.businessOperation?.salesProjection?.rows, { product: '', capacity: '', unit: '', sellingPrice: '', projectedSales: '' }, getHardCopyRowLimit('add-mp-sale'));
        const spendingRows = ensureRows(data.spendingPlan?.rows, { expense: '', amount: '', usageSchedule: '' }, getHardCopyRowLimit('add-mp-spending'));
        const income = data.businessOperation?.incomeComputation || {};
        const recommendation = data.staffReview?.recommendation || {};
        const legacyAssignedPdoName = String(state.task?.assignedPdo?.name || '').trim();
        const recommendationApproverName = String(recommendation.approverName || '').trim();
        const recommendationApproverDisplayName = recommendationApproverName !== '' && recommendationApproverName === legacyAssignedPdoName
            ? ''
            : recommendationApproverName;
        const legacyAssignedPdoSignaturePath = String(state.task?.assignedPdo?.signatureUpload?.file_path || '').trim();
        const recommendationSignaturePath = String(recommendation.signatureUpload?.file_path || '').trim();
        const recommendationSignatureMetadata = legacyAssignedPdoSignaturePath !== '' && recommendationSignaturePath === legacyAssignedPdoSignaturePath
            ? null
            : (recommendation.signatureUpload || null);

        return `
            <div class="paper-document paper-document--mungkahing">
                ${renderMungkahingPaperPage(1, `
                    <div class="section">
                        <div class="roman">I.</div>
                        <div>
                            <div class="section-title">KINATIBUK-AN IMPORMASYON BAHIN SA PROYEKTO</div>
                            <div class="field-grid">
                                ${renderMungkahingSourceLineRow('Ngalan sa Partisipante', 'projectInformation.participantName', project.participantName || '', 'w-240')}
                                ${renderMungkahingSourceLineRow('Lokasyon sa Proyekto', 'projectInformation.projectLocation', project.projectLocation || '', 'w-260')}
                                ${renderMungkahingSourceLineRow('Ulohan sa Proyektong MD', 'projectInformation.projectTitle', project.projectTitle || '', 'w-220')}
                                ${renderMungkahingSourceLineRow('Petsa sa Pagtukod', 'projectInformation.projectDate', project.projectDate || '', 'w-250', true, 'date')}
                                ${renderMungkahingSourceLineRow('Kinatibuk-ang Kantidad', 'projectInformation.projectedAmount', project.projectedAmount || '', 'w-220')}
                                ${renderMungkahingSourceLineRow('Savings Account no.', 'projectInformation.savingsAccountNumber', project.savingsAccountNumber || 'NONE', 'w-250')}
                                ${renderMungkahingSourceLineRow('Kantidad gikan sa CSWDD', 'projectInformation.cswddAmount', project.cswddAmount || '', 'w-220')}
                                <div></div>
                                ${renderMungkahingSourceLineRow('Lain kakuhan sa pondo', 'projectInformation.otherFundingSource', project.otherFundingSource || '', 'w-220')}
                                <div></div>
                            </div>
                            ${renderMungkahingSectorMatrix(pantawid, nonPantawid)}
                        </div>
                    </div>
                    <div class="section">
                        <div class="roman">II.</div>
                        <div>
                            <div class="section-title">RATIONALE OF THE PROPOSED PROJECT</div>
                            <div class="rationale-lines">
                                ${renderMungkahingRationaleField(data.rationale || '')}
                            </div>
                        </div>
                    </div>
                    <div class="section">
                        <div class="roman">III.</div>
                        <div>
                            <div class="section-title">DETALYE SA MODALITY APPLICATION/S</div>
                            <div class="modality-head">PONDO NGA GI-AMBAG SA MGA PARTNER/S:</div>
                            <div class="note-line">Self-Employment Assistance-Kaunlaran (SEA-K)</div>
                            ${renderPaperTableMarkup('modality-table', `
                                <tr><th style="width:31%">Kakuhan sa Pondo</th><th style="width:39%">Gi-ambag</th><th style="width:30%">Kantidad</th></tr>
                            `, modalityRows.map((row, index) => `
                                <tr>
                                    <td><span class="fixed-cell fixed-cell--modality">${escapeHtml(row.fundSource || '')}</span></td>
                                    <td>${renderMungkahingCellInput(`modalityApplications.rows.${index}.contributionType`, row.contributionType || '')}</td>
                                    <td>${renderMungkahingCellInput(`modalityApplications.rows.${index}.amount`, row.amount || '', 'number')}</td>
                                </tr>
                            `).join(''))}
                        </div>
                    </div>
                    <div class="section">
                        <div class="roman">IV.</div>
                        <div>
                            <div class="section-title">Pagdumala sa Negosyo</div>
                            <div class="sub-block-title">a.) Mga gikinahanglang Materyales</div>
                            ${renderPaperTableMarkup('materials-table', `
                                <tr><th>(Materyales)<br>(a)</th><th>(Kadaghanon)<br>(b)</th><th>(Yunit)<br>(c)</th><th>(Kantidad o presyo sa matag yunit)<br>(d)</th><th>(Dalas sa paggamit/Siklo sa Produksyon)<br>(e)</th><th>(Kinatibuk-an na kantidad o presyo)<br>(f)</th></tr>
                            `, materialsRows.map((row, index) => `
                                <tr>
                                    <td>${renderMungkahingCellInput(`businessOperation.materials.rows.${index}.material`, row.material || '')}</td>
                                    <td>${renderMungkahingCellInput(`businessOperation.materials.rows.${index}.quality`, row.quality || '')}</td>
                                    <td>${renderMungkahingCellInput(`businessOperation.materials.rows.${index}.unit`, row.unit || '')}</td>
                                    <td>${renderMungkahingCellInput(`businessOperation.materials.rows.${index}.unitPrice`, row.unitPrice || '', 'number')}</td>
                                    <td>${renderMungkahingCellInput(`businessOperation.materials.rows.${index}.cyclesPerProduction`, row.cyclesPerProduction || '')}</td>
                                    <td>${renderMungkahingCellInput(`businessOperation.materials.rows.${index}.projectedCost`, row.projectedCost || '', 'number')}</td>
                                </tr>
                            `).join(''), `<tr><td colspan="5" class="right-text">Kinatibuk-ang Total</td><td>${renderMungkahingCellInput('businessOperation.materials.totalCost', data.businessOperation?.materials?.totalCost || '', 'number')}</td></tr>`)}
                            ${renderMungkahingTableControls('add-mp-material', 'remove-mp-material', materialsRows, 'Material row')}
                            <div class="sub-block-title">b.) Mga Gikinahanglan na Trabahante</div>
                            ${renderPaperTableMarkup('workers-table', `
                                <tr><th>Ngalan sa Magtrabaho sa Negosyo</th><th>Posisyon sa Trabaho</th><th>Inadlaw na Sweldo</th></tr>
                            `, laborRows.map((row, index) => `
                                <tr>
                                    <td>${renderMungkahingCellInput(`businessOperation.labor.rows.${index}.workerName`, row.workerName || '')}</td>
                                    <td>${renderMungkahingCellInput(`businessOperation.labor.rows.${index}.position`, row.position || '')}</td>
                                    <td>${renderMungkahingCellInput(`businessOperation.labor.rows.${index}.dailyWage`, row.dailyWage || '', 'number')}</td>
                                </tr>
                            `).join(''), `
                                <tr><td colspan="2" class="right-text">Kinatibuk-an na inadlaw na sweldo</td><td>${renderMungkahingCellInput('businessOperation.labor.totalDailyWage', data.businessOperation?.labor?.totalDailyWage || '', 'number')}</td></tr>
                                <tr><td colspan="2" class="right-text">Kinatibuk-an na suweldo base sa siglo sa produksyon</td><td>${renderMungkahingCellInput('businessOperation.labor.totalProductionCycleWage', data.businessOperation?.labor?.totalProductionCycleWage || '', 'number')}</td></tr>
                            `)}
                            ${renderMungkahingTableControls('add-mp-labor', 'remove-mp-labor', laborRows, 'Labor row')}
                        </div>
                    </div>
                `, { showTitleBlock: true, bodyClass: 'content content--page1' })}
                ${renderMungkahingPaperPage(2, `
                        <div class="sub-block-title">c) Mga Gikinahanglan nga Kagamitan (Tools and Equipment)</div>
                        ${renderPaperTableMarkup('tools-table', `
                            <tr><th>Kagamitan<br>(a)</th><th>Kadaghanon<br>(b)</th><th>Yunit<br>(c)</th><th>Kantidad o presyo sa matag usa<br>(d)</th><th>Kantidad na kantidad o presyo<br>(e)</th><th>Gitas-on sa kinabuhi/kagamitan<br>(divide sa 365 days)<br>(f)</th><th>Siklo sa Produksyon<br>(in days/months/years)<br>(g)</th><th>Depreciation Cost<br>(h) = [(e)/(f)] x (g)</th></tr>
                        `, equipmentRows.map((row, index) => `
                            <tr>
                                <td>${renderMungkahingCellInput(`businessOperation.toolsEquipment.rows.${index}.equipment`, row.equipment || '')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.toolsEquipment.rows.${index}.capacity`, row.capacity || '')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.toolsEquipment.rows.${index}.unit`, row.unit || '')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.toolsEquipment.rows.${index}.quantityOrPrice`, row.quantityOrPrice || '', 'number')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.toolsEquipment.rows.${index}.projectedAmount`, row.projectedAmount || '', 'number')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.toolsEquipment.rows.${index}.usefulLifeDays`, row.usefulLifeDays || '')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.toolsEquipment.rows.${index}.productionCycle`, row.productionCycle || '')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.toolsEquipment.rows.${index}.depreciationCost`, row.depreciationCost || '', 'number')}</td>
                            </tr>
                        `).join(''), `<tr><td colspan="7" class="total-label">Kinatibuk-ang Total</td><td>${renderMungkahingCellInput('businessOperation.toolsEquipment.totalCost', data.businessOperation?.toolsEquipment?.totalCost || '', 'number')}</td></tr>`)}
                        ${renderMungkahingTableControls('add-mp-equipment', 'remove-mp-equipment', equipmentRows, 'Equipment row')}
                        <div class="sub-block-title">d) Uban pang mga gastohanan</div>
                        ${renderPaperTableMarkup('other-expenses-table', `
                            <tr><th style="width:40%">Regular na ginagastuhan</th><th style="width:24%">Dalas ng pagbayad<br>(weekly, quarterly, monthly)</th><th style="width:36%">Kinatibuk-an na kantidad o presyo base sa siglo sa produksyon</th></tr>
                        `, expenseRows.map((row, index) => `
                            <tr>
                                <td><span class="fixed-cell">${escapeHtml(row.expenseName || '')}</span></td>
                                <td>${renderMungkahingCellInput(`businessOperation.operatingExpenses.rows.${index}.paymentFrequency`, row.paymentFrequency || '')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.operatingExpenses.rows.${index}.projectedCost`, row.projectedCost || '', 'number')}</td>
                            </tr>
                        `).join(''), `<tr><td colspan="2" class="total-label">Grand Total</td><td>${renderMungkahingCellInput('businessOperation.operatingExpenses.grandTotal', data.businessOperation?.operatingExpenses?.grandTotal || '', 'number')}</td></tr>`)}
                        <div class="sub-block-title">e) Pangunahing kita gikan sa puhunan alang sa mga sangkap</div>
                        ${renderPaperTableMarkup('gross-table', `
                            <tr><th>Produkto<br>(a)</th><th>Kadaghanon<br>(b)</th><th>Yunit<br>(c)</th><th>Kantidad sa pagpamaligya matag piraso<br>(d)</th><th>Kinatibuk-an na kantidad sa pagpamaligya base sa siglo sa produksyon<br>[(e)= (b) x (d)]</th></tr>
                        `, salesRows.map((row, index) => `
                            <tr>
                                <td>${renderMungkahingCellInput(`businessOperation.salesProjection.rows.${index}.product`, row.product || '')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.salesProjection.rows.${index}.capacity`, row.capacity || '')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.salesProjection.rows.${index}.unit`, row.unit || '')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.salesProjection.rows.${index}.sellingPrice`, row.sellingPrice || '', 'number')}</td>
                                <td>${renderMungkahingCellInput(`businessOperation.salesProjection.rows.${index}.projectedSales`, row.projectedSales || '', 'number')}</td>
                            </tr>
                        `).join(''), `<tr><td colspan="4" class="total-label">Gross Sales</td><td>${renderMungkahingCellInput('businessOperation.salesProjection.grossSales', data.businessOperation?.salesProjection?.grossSales || '', 'number')}</td></tr>`)}
                        ${renderMungkahingTableControls('add-mp-sale', 'remove-mp-sale', salesRows, 'Sales row')}
                        <div class="sub-block-title">f) Kinatibuk-ang kita sa matag produkto o paghimo sa serbisyo</div>
                        ${renderPaperTableMarkup('bottom-summary', `<tr><th style="width:64%"></th><th style="width:36%">PRESYO</th></tr>`, `
                            <tr><td>Gilauman nga kita alang sa usa ka "siklo sa produksyon" (production cycle) <em>(SEE TABLE E)</em></td><td>${renderMungkahingCellInput('businessOperation.incomeComputation.projectedIncomePerCycle', income.projectedIncomePerCycle || '', 'number')}</td></tr>
                            <tr><td>Less:&nbsp; Mga materyales (raw materials) <em>(SEE TABLE A)</em></td><td>${renderMungkahingCellInput('businessOperation.incomeComputation.rawMaterialsCost', income.rawMaterialsCost || '', 'number')}</td></tr>
                        `)}
                `, { bodyClass: 'content content--page2' })}
                ${renderMungkahingPaperPage(3, `
                        ${renderPaperTableMarkup('summary-table', `<tr><th style="width:64%"></th><th style="width:36%">PRESYO</th></tr>`, `
                            <tr><td class="summary-label">Gikinahanglan na manpower ug labor <em>(SEE TABLE B)</em></td><td>${renderMungkahingCellInput('businessOperation.incomeComputation.manpowerLaborCost', income.manpowerLaborCost || '', 'number')}</td></tr>
                            <tr class="light-row"><td class="summary-label">Depreciation Cost <em>(SEE TABLE C)</em></td><td>${renderMungkahingCellInput('businessOperation.incomeComputation.depreciationCost', income.depreciationCost || '', 'number')}</td></tr>
                            <tr><td class="summary-label">Uban pang mga Gasto <em>(SEE TABLE D)</em></td><td>${renderMungkahingCellInput('businessOperation.incomeComputation.otherExpenses', income.otherExpenses || '', 'number')}</td></tr>
                            <tr class="light-row"><td class="summary-label">Kinatibuk-an na gasto sa pag-operate <em>(table B+C+D)</em></td><td>${renderMungkahingCellInput('businessOperation.incomeComputation.totalOperatingCost', income.totalOperatingCost || '', 'number')}</td></tr>
                            <tr><td class="summary-label">Kinatibuk-an na ginansya human sa gasto sa operasyon (Gross Profit)</td><td>${renderMungkahingCellInput('businessOperation.incomeComputation.grossProfit', income.grossProfit || '', 'number')}</td></tr>
                            <tr class="light-row"><td class="summary-label">Net profit</td><td>${renderMungkahingCellInput('businessOperation.incomeComputation.netProfit', income.netProfit || '', 'number')}</td></tr>
                        `)}
                        <div class="section-title section-title--plain">g) Iskedyul o Plano sa Paggasto sa SEA-K Capital Fund (SCF)</div>
                        ${renderPaperTableMarkup('scf-table', `
                            <tr>
                                <th><span class="th-main">Mga Gasto</span><span class="th-sub">(Mga kagamitan, materyales, etc.)</span></th>
                                <th><span class="th-main">Kantidad</span></th>
                                <th><span class="th-main">Iskedyul sa Paggamit</span></th>
                            </tr>
                        `, spendingRows.map((row, index) => `
                            <tr>
                                <td>${renderMungkahingCellInput(`spendingPlan.rows.${index}.expense`, row.expense || '')}</td>
                                <td>${renderMungkahingCellInput(`spendingPlan.rows.${index}.amount`, row.amount || '', 'number')}</td>
                                <td>${renderMungkahingCellInput(`spendingPlan.rows.${index}.usageSchedule`, row.usageSchedule || '')}</td>
                            </tr>
                        `).join(''))}
                        ${renderMungkahingTableControls('add-mp-spending', 'remove-mp-spending', spendingRows, 'Spending row')}
                        <div class="recommendation-section">
                            <div class="recommendation-title"><span>V.</span><strong>REKOMENDASYON</strong></div>
                            <p class="recommendation-text">
                                Kini nagrekomenda nga punduhan ang maong <em>Mungkahing Proyekto</em> alang sa Micro Enterprise Development alang sa proyektong
                                ${renderMungkahingInlineInput('projectInformation.projectTitle', project.projectTitle || '', 'w-project')}
                                nga adunay kinatibuk-ang kantidad na Php
                                ${renderMungkahingInlineInput('staffReview.recommendation.recommendedAmount', recommendation.recommendedAmount || project.projectedAmount || '15,000.00', 'w-amount', true)}
                                nga SEA-K Capital Fund CY 2024.
                            </p>
                            <table class="recommendation-signature-table">
                                <tbody>
                                    <tr>
                                        <td class="recommendation-signature-table__role" contenteditable="false">GI-ANDAM NI</td>
                                        <td class="recommendation-signature-table__line">
                                            ${renderMungkahingRecommendationSignatureLine('applicantSignature.signedName', data.applicantSignature?.signedName || deriveApplicantName(data), 'Pirma ibabaw sa pangalan sa Partisipante', false, {
                                                signatureField: 'applicantSignature.signatureUpload',
                                                signatureMetadata: data.applicantSignature?.signatureUpload || null,
                                                signatureLabel: 'Participant signature',
                                            })}
                                        </td>
                                        <td class="recommendation-signature-table__date">
                                            ${renderMungkahingRecommendationDate('applicantSignature.signedDate', data.applicantSignature?.signedDate || '', false)}
                                        </td>
                                    </tr>
                                    ${state.reviewerMode ? `
                                        <tr>
                                            <td class="recommendation-signature-table__role" contenteditable="false">GI ASSESSES<br>UG APRUBAHAN<br>NI</td>
                                            <td class="recommendation-signature-table__line">
                                                ${renderMungkahingRecommendationSignatureLine('staffReview.recommendation.approverName', recommendationApproverDisplayName, 'Pirma ibabaw sa pangalan sa CSWDO', false, {
                                                    signatureField: 'recommendation.signatureUpload',
                                                    signatureMetadata: recommendationSignatureMetadata,
                                                    signatureLabel: 'CSWDO signature',
                                                })}
                                            </td>
                                            <td class="recommendation-signature-table__date">
                                                ${renderMungkahingRecommendationDate('staffReview.recommendation.approvedDate', recommendation.approvedDate || '', true)}
                                            </td>
                                        </tr>
                                    ` : ''}
                                </tbody>
                            </table>
                        </div>
                `, { bodyClass: 'content content--page3' })}
            </div>
        `;
    }

    function renderMungkahingSourceLineRow(label, name, value, widthClass = '', showColon = true, type = 'text') {
        const ownership = buildFieldOwnershipAttributes(name, false);
        return `
            <div class="line-row ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-only' : ''}">
                <span>${escapeHtml(label)}</span>
                ${showColon ? '<span class="colon">:</span>' : ''}
                <input class="field ${escapeAttribute(widthClass)} ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="${escapeAttribute(type)}" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
                ${ownership.note}
            </div>
        `;
    }

    function renderMungkahingInlineInput(name, value, widthClass = '', disabled = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `<input class="inline-line ${escapeAttribute(widthClass)} ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="text" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>${ownership.note}`;
    }

    function renderMungkahingRecommendationSignatureLine(name, value, label, disabled = false, options = {}) {
        const ownership = buildFieldOwnershipAttributes(name, disabled, Boolean(options.forceApplicant));
        const signatureMarkup = options.signatureField
            ? renderSignaturePadField(options.signatureField, options.signatureMetadata || null, {
                label: options.signatureLabel || 'Signature',
                previewLabel: 'Click-to-sign',
                variant: 'inline',
                forceApplicant: Boolean(options.forceApplicantSignature),
            })
            : '';
        return `
            <div class="recommendation-signature-line ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-only' : ''}">
                ${signatureMarkup ? `<div class="recommendation-signature-line__pad">${signatureMarkup}</div>` : ''}
                <input class="recommendation-signature-line__input ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="text" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
                ${ownership.note}
                <div class="recommendation-signature-line__label" contenteditable="false">${escapeHtml(label)}</div>
            </div>
        `;
    }

    function renderMungkahingRecommendationDate(name, value, disabled = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `
            <div class="recommendation-date ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-only' : ''}">
                <div class="recommendation-date__label" contenteditable="false">Petsa</div>
                <input class="recommendation-date__input ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="date" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
                ${ownership.note}
            </div>
        `;
    }

    function renderMungkahingRationaleField(value) {
        const ownership = buildFieldOwnershipAttributes('rationale', false);
        return `
            <textarea class="rationale-area ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" name="rationale" rows="4" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>${escapeHtml(value || '')}</textarea>
            ${ownership.note}
        `;
    }

    function renderMungkahingCellInput(name, value, type = 'text', className = '') {
        const ownership = buildFieldOwnershipAttributes(name, false);
        return `<input class="cell-input ${className} ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="${escapeAttribute(type)}" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>${ownership.note}`;
    }

    function getHardCopyRowLimit(action) {
        return HARD_COPY_ROW_LIMITS[action] || null;
    }

    function renderAddRowButton(action, label, rows) {
        const maxRows = getHardCopyRowLimit(action);
        const reachedLimit = Number.isInteger(maxRows) && Array.isArray(rows) && rows.length >= maxRows;
        const buttonLabel = reachedLimit ? `${label} limit reached` : label;
        return `<button type="button" class="btn-outline small" data-row-action="${escapeAttribute(action)}" ${reachedLimit ? 'disabled' : ''}>${escapeHtml(buttonLabel)}</button>`;
    }

    function renderMungkahingTableControls(addAction, removeAction, rows, label) {
        return `
            <div class="paper-table-controls paper-table-controls--utility">
                ${renderAddRowButton(addAction, `Add ${label}`, rows).replace('btn-outline small', 'paper-utility-btn')}
                <div class="paper-table-controls__remove">
                    ${rows.map((_, index) => `<button type="button" class="paper-utility-btn paper-utility-btn--remove post-approval-row-action" data-row-action="${escapeAttribute(removeAction)}" data-row-index="${index}">Remove ${escapeHtml(label)} ${index + 1}</button>`).join('')}
                </div>
            </div>
        `;
    }

    function renderMungkahingPaperPage(pageNumber, content, options = {}) {
        const showTitleBlock = Boolean(options.showTitleBlock);
        const bodyClass = options.bodyClass || 'content';
        const pageModifierClass = ` page--page${pageNumber}`;
        return `
            <section class="paper-sheet paper-sheet--mungkahing page${pageModifierClass}">
                ${renderGovernmentPaperTopStrip()}
                ${showTitleBlock ? `
                    <div class="title-wrap">
                        <div class="title-main">MUNGKAHING PROYEKTO</div>
                        <div class="title-sub">Sustainable Market and Technology and Employment Assistance Program<br />(SMART LEAP)</div>
                    </div>
                ` : ''}
                <div class="${escapeAttribute(bodyClass)}">${content}</div>
                ${renderGovernmentPaperFooterImage(pageNumber, 3)}
            </section>
        `;
    }

    function renderMungkahingPaperSectionTitle(index, title) {
        return `<div class="paper-page-section__title"><span>${escapeHtml(index)}</span><strong>${escapeHtml(title)}</strong></div>`;
    }

    function renderMungkahingLineField(label, name, value, type, forceApplicant = false) {
        const ownership = buildFieldOwnershipAttributes(name, false, forceApplicant);
        return `<label class="paper-line-field ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-only' : ''}"><span class="paper-line-field__label">${escapeHtml(label)}:</span><input class="paper-line-field__input ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="${escapeAttribute(type || 'text')}" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>${ownership.note}</label>`;
    }

    function isApplicantSignatureField(fieldKey) {
        const key = String(fieldKey || '');
        return key.endsWith('signatureUpload') && !key.startsWith('staffReview.');
    }

    function isStaffSignatureField(fieldKey) {
        const key = String(fieldKey || '');
        return [
            'pageOneCertification.signatureUpload',
            'physicalRequirements.foodRelatedCertification.signatureUpload',
            'psychoSocialRequirements.residencyAndCharacter.signatureUpload',
            'psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload',
            'validatorIdentity.signatureUpload',
            'recommendation.signatureUpload',
            'approval.signatureUpload',
            'verification.signatureUpload',
            'staffReview.pageOneCertification.signatureUpload',
            'staffReview.physicalRequirements.foodRelatedCertification.signatureUpload',
            'staffReview.psychoSocialRequirements.residencyAndCharacter.signatureUpload',
            'staffReview.psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload',
            'staffReview.validatorIdentity.signatureUpload',
            'staffReview.recommendation.signatureUpload',
            'staffReview.approval.signatureUpload',
            'staffReview.verification.signatureUpload',
        ].includes(key);
    }

    function canUseSignaturePad(fieldKey, ownership) {
        if (ownership.disabled) {
            return false;
        }
        return state.reviewerMode
            ? ownership.owner === FIELD_OWNER_STAFF && isStaffSignatureField(fieldKey)
            : ownership.owner === FIELD_OWNER_APPLICANT && isApplicantSignatureField(fieldKey);
    }

    function renderStaticSignaturePreview(metadata, options = {}) {
        const fileName = metadata?.original_name || '';
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const previewLabel = String(options.previewLabel || options.label || 'Signature').trim() || 'Signature';
        const variant = String(options.variant || 'card').trim() || 'card';
        const hasImagePreview = /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(fileUrl || fileName);

        if (!fileUrl) {
            return options.fallback || '';
        }

        const previewMarkup = hasImagePreview
            ? `<img class="signature-pad-trigger__image" src="${escapeAttribute(fileUrl)}" alt="${escapeAttribute(previewLabel)}">`
            : `<a class="signature-pad-field__link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">${escapeHtml(fileName || 'View saved signature')}</a>`;
        const titleText = variant === 'inline' ? '' : previewLabel;

        return `
            <div class="signature-pad-field signature-pad-field--readonly">
                <div class="signature-pad-trigger ${variant === 'inline' ? 'signature-pad-trigger--inline has-preview' : ''}" aria-hidden="true">
                    ${previewMarkup ? `<span class="signature-pad-trigger__preview">${previewMarkup}</span>` : ''}
                    ${titleText ? `<span class="signature-pad-trigger__title">${escapeHtml(titleText)}</span>` : ''}
                </div>
            </div>
        `;
    }

    function renderSignaturePadField(fieldKey, metadata, options = {}) {
        const ownership = buildFieldOwnershipAttributes(fieldKey, Boolean(options.disabled), Boolean(options.forceApplicant));
        if (!canUseSignaturePad(fieldKey, ownership)) {
            return renderStaticSignaturePreview(metadata, options);
        }

        const fileName = metadata?.original_name || '';
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const uploadedAt = metadata?.uploaded_at ? formatDateTime(metadata.uploaded_at) : '';
        const label = String(options.label || 'Signature pad').trim() || 'Signature pad';
        const previewLabel = String(options.previewLabel || label.replace(/\s*upload\s*/i, ' ').replace(/\s+/g, ' ').trim() || 'Signature').trim();
        const variant = String(options.variant || 'card').trim() || 'card';
        const hasImagePreview = /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(fileUrl || fileName);
        const hasInlinePreview = variant === 'inline' && hasImagePreview && fileUrl;
        const triggerClass = [
            'signature-pad-trigger',
            variant === 'inline' ? 'signature-pad-trigger--inline' : '',
            hasInlinePreview ? 'has-preview' : '',
        ].filter(Boolean).join(' ');
        const previewMarkup = hasImagePreview && fileUrl
            ? `<img class="signature-pad-trigger__image" src="${escapeAttribute(fileUrl)}" alt="${escapeAttribute(previewLabel)}">`
            : `
                <span class="signature-pad-trigger__placeholder" aria-hidden="true">
                    <svg viewBox="0 0 160 96" role="presentation" focusable="false">
                        <path d="M26 62c10-18 21-29 30-29 10 0 5 22 16 22 8 0 14-26 25-26 7 0 7 18 13 18 8 0 9-13 18-13 8 0 14 12 21 27" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M95 24l20-10 11 11-10 20-12 2-11-11z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
                    </svg>
                </span>
            `;
        const subcopy = fileUrl
            ? (uploadedAt ? `Saved ${uploadedAt}` : 'Click to update signature')
            : 'Click to sign';
        const titleText = variant === 'inline'
            ? (hasInlinePreview ? '' : 'Click-to-sign')
            : previewLabel;
        const previewContent = variant === 'inline'
            ? (hasInlinePreview ? previewMarkup : '')
            : previewMarkup;
        const metaMarkup = variant === 'inline'
            ? ''
            : `<span class="signature-pad-trigger__meta">${escapeHtml(subcopy)}</span>`;
        const removeMarkup = fileUrl && variant !== 'inline'
            ? `
                <button
                    type="button"
                    class="btn-outline small signature-pad-field__remove"
                    data-signature-action="remove-saved"
                    data-signature-field="${escapeAttribute(fieldKey)}"
                >Remove saved signature</button>
            `
            : '';
        const hintMarkup = variant === 'inline'
            ? ''
            : (fileUrl ? `<a class="signature-pad-field__link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">${escapeHtml(fileName || 'View saved signature')}</a>` : '<small class="signature-pad-field__hint">Open the pad, draw your signature, then save it.</small>');

        return `
            <div class="signature-pad-field" data-signature-field="${escapeAttribute(fieldKey)}">
                <button
                    type="button"
                    class="${triggerClass}"
                    data-signature-action="open"
                    data-signature-field="${escapeAttribute(fieldKey)}"
                    data-signature-label="${escapeAttribute(label)}"
                >
                    ${previewContent ? `<span class="signature-pad-trigger__preview">${previewContent}</span>` : ''}
                    <span class="signature-pad-trigger__title">${escapeHtml(titleText)}</span>
                    ${metaMarkup}
                </button>
                ${hintMarkup}
                ${removeMarkup}
                ${ownership.note}
            </div>
        `;
    }

    function initializeSignaturePads() {
        ensureSignaturePadModal();
    }

    function ensureSignaturePadModal() {
        if (document.getElementById('signaturePadModal')) {
            return;
        }

        const host = document.createElement('div');
        host.innerHTML = `
            <div class="signature-pad-modal" id="signaturePadModal" hidden>
                <div class="signature-pad-modal__backdrop" data-signature-backdrop>
                    <div class="signature-pad-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="signaturePadModalTitle">
                        <div class="signature-pad-modal__header">
                            <div>
                                <h3 class="signature-pad-modal__title" id="signaturePadModalTitle">Signature pad</h3>
                                <p class="signature-pad-modal__copy">Draw your signature below, then save it to the form.</p>
                            </div>
                            <button type="button" class="signature-pad-modal__close" data-signature-action="close" aria-label="Close signature pad">x</button>
                        </div>
                        <div class="signature-pad-modal__frame">
                            <canvas class="signature-pad-field__canvas signature-pad-modal__canvas" data-signature-canvas="modal" width="720" height="240" aria-label="Signature pad"></canvas>
                        </div>
                        <div class="signature-pad-modal__actions">
                            <button type="button" class="btn-outline small" data-signature-action="clear-modal">Clear</button>
                            <button type="button" class="btn-outline small" data-signature-action="close">Cancel</button>
                            <button type="button" class="btn-primary small" data-signature-action="save-modal">Save signature</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(host.firstElementChild);
    }

    function initializeSignatureCanvas(canvas) {
        if (!(canvas instanceof HTMLCanvasElement)) {
            return;
        }

        const ratio = window.devicePixelRatio || 1;
        const width = canvas.clientWidth || 520;
        const height = canvas.clientHeight || canvas.height || 140;
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#111827';
        canvas.dataset.signatureDirty = 'false';
        canvas.dataset.signatureDrawing = 'false';
    }

    function openSignaturePadModal(fieldKey, label) {
        ensureSignaturePadModal();
        const modal = document.getElementById('signaturePadModal');
        const canvas = modal?.querySelector('[data-signature-canvas="modal"]');
        const title = document.getElementById('signaturePadModalTitle');
        if (!(modal instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
            return;
        }

        state.signaturePadModal.fieldKey = fieldKey;
        state.signaturePadModal.label = label || 'Signature pad';
        modal.hidden = false;
        title && (title.textContent = state.signaturePadModal.label);
        document.body.classList.add('has-signature-pad-modal');

        window.requestAnimationFrame(() => {
            initializeSignatureCanvas(canvas);
        });
    }

    function closeSignaturePadModal() {
        const modal = document.getElementById('signaturePadModal');
        const canvas = modal?.querySelector('[data-signature-canvas="modal"]');
        if (modal instanceof HTMLElement) {
            modal.hidden = true;
        }
        if (canvas instanceof HTMLCanvasElement) {
            initializeSignatureCanvas(canvas);
        }
        state.signaturePadModal.fieldKey = '';
        state.signaturePadModal.label = '';
        document.body.classList.remove('has-signature-pad-modal');
    }

    function signaturePadPoint(event, canvas) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
    }

    function startSignaturePadStroke(event) {
        const canvas = event.target instanceof Element ? event.target.closest('[data-signature-canvas]') : null;
        if (!(canvas instanceof HTMLCanvasElement)) {
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const point = signaturePadPoint(event, canvas);
        canvas.dataset.signatureDrawing = 'true';
        canvas.dataset.signatureDirty = 'true';
        canvas.dataset.signatureLastX = String(point.x);
        canvas.dataset.signatureLastY = String(point.y);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        event.preventDefault();
    }

    function moveSignaturePadStroke(event) {
        const canvas = event.target instanceof Element ? event.target.closest('[data-signature-canvas]') : null;
        if (!(canvas instanceof HTMLCanvasElement) || canvas.dataset.signatureDrawing !== 'true') {
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const point = signaturePadPoint(event, canvas);
        const lastX = Number(canvas.dataset.signatureLastX || point.x);
        const lastY = Number(canvas.dataset.signatureLastY || point.y);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        canvas.dataset.signatureLastX = String(point.x);
        canvas.dataset.signatureLastY = String(point.y);
        event.preventDefault();
    }

    function endSignaturePadStroke(event) {
        const canvas = event.target instanceof Element ? event.target.closest('[data-signature-canvas]') : null;
        if (!(canvas instanceof HTMLCanvasElement)) {
            return;
        }
        canvas.dataset.signatureDrawing = 'false';
    }

    function clearSignaturePad(canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        const width = canvas.clientWidth || 520;
        const height = canvas.clientHeight || 140;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        canvas.dataset.signatureDirty = 'false';
    }

    async function saveSignaturePad(fieldKey, canvas, button) {
        if (canvas.dataset.signatureDirty !== 'true') {
            showToast('Please draw a signature first.', 'warning');
            return false;
        }

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!(blob instanceof Blob)) {
            showToast('Unable to capture the signature right now.', 'warning');
            return false;
        }

        const file = new File([blob], `${fieldKey.replace(/[^\w.-]+/g, '_')}.png`, { type: 'image/png' });
        return uploadApplicantAsset(fieldKey, file, button, 'Signature saved.');
    }

    async function handleSignaturePadAction(event) {
        const backdrop = event.target instanceof Element ? event.target.closest('[data-signature-backdrop]') : null;
        if (backdrop instanceof HTMLElement && event.target === backdrop) {
            closeSignaturePadModal();
            return;
        }

        const actionButton = event.target instanceof Element ? event.target.closest('[data-signature-action]') : null;
        if (!(actionButton instanceof HTMLButtonElement)) {
            return;
        }

        const fieldKey = actionButton.dataset.signatureField || '';
        const action = actionButton.dataset.signatureAction || '';

        if (action === 'open') {
            openSignaturePadModal(fieldKey, actionButton.dataset.signatureLabel || 'Signature pad');
            return;
        }

        if (action === 'close') {
            closeSignaturePadModal();
            return;
        }

        if (action === 'remove-saved') {
            await clearApplicantAsset(fieldKey, actionButton);
            return;
        }

        const modalCanvas = document.querySelector('[data-signature-canvas="modal"]');
        if (!(modalCanvas instanceof HTMLCanvasElement)) {
            return;
        }

        if (action === 'clear-modal') {
            clearSignaturePad(modalCanvas);
            return;
        }

        if (action === 'clear') {
            clearSignaturePad(modalCanvas);
            return;
        }

        if (action === 'save-modal' || action === 'save') {
            const activeFieldKey = state.signaturePadModal.fieldKey || fieldKey;
            const didSave = await saveSignaturePad(activeFieldKey, modalCanvas, actionButton);
            if (didSave) {
                closeSignaturePadModal();
            }
        }
    }

    function renderPaperInlineChoiceField(name, value, options, disabled = false, forceApplicant = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled, forceApplicant);
        return `
            <span class="paper-inline-choice ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-only' : ''}">
                ${(options || []).map((option) => `
                    <label class="paper-inline-choice__item">
                        <input
                            type="radio"
                            name="${escapeAttribute(name)}"
                            value="${escapeAttribute(option)}"
                            ${value === option ? 'checked' : ''}
                            ${ownership.attrs}
                            ${ownership.disabled ? 'disabled' : ''}
                        >
                        <span>${escapeHtml(option)}</span>
                    </label>
                `).join('')}
                ${ownership.note}
            </span>
        `;
    }

    function renderApplicantSignatureStamp(name, uploadField, metadata) {
        const safeName = String(name || '').trim();
        const ownership = buildFieldOwnershipAttributes('participantSignature.signedName', false);
        const pad = renderSignaturePadField(uploadField, metadata, {
            label: 'Participant signature',
            previewLabel: 'Click-to-sign',
            variant: 'inline',
            fallback: '',
        });
        return `
            <div class="paper-applicant-signature">
                ${pad}
                <input class="paper-applicant-signature__name ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="text" name="participantSignature.signedName" value="${escapeAttribute(safeName)}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
                ${ownership.note}
                <div class="paper-applicant-signature__line"></div>
                <div class="paper-applicant-signature__label">Pirma ibabaw sa &nbsp; pangalan sa Partisipante</div>
            </div>
        `;
    }

    function renderPaperSignatureNameInput(name, value, className = 'paper-applicant-signature__name') {
        const ownership = buildFieldOwnershipAttributes(name, false);
        return `<input class="${escapeAttribute(className)} ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" type="text" name="${escapeAttribute(name)}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>${ownership.note}`;
    }

    function renderValidationValidatorSignature(identity) {
        return `
            <div class="paper-validation-signature">
                <div class="paper-applicant-signature paper-applicant-signature--validator">
                    <input type="hidden" name="staffReview.validatorIdentity.signedDate" value="${escapeAttribute(identity?.signedDate || currentDateInputValue())}">
                    ${renderSignaturePadField('validatorIdentity.signatureUpload', identity?.signatureUpload || null, {
                        label: 'Validator signature',
                        variant: 'inline',
                        previewLabel: 'Click-to-sign',
                    })}
                    ${renderPaperSignatureNameInput('staffReview.validatorIdentity.validatorName', identity?.validatorName || '')}
                    <div class="paper-applicant-signature__line"></div>
                    <div class="paper-validation-signature__label">Ngalan/Perma sa Validator</div>
                </div>
            </div>
        `;
    }

    function renderMungkahingSignatureBox(nameKey, nameValue, labelText, uploadField, metadata, disabled = false, titleKey = '', titleValue = '') {
        const nameOwnership = buildFieldOwnershipAttributes(nameKey, disabled);
        const uploadOwnership = buildFieldOwnershipAttributes(uploadField, disabled);
        const titleOwnership = titleKey ? buildFieldOwnershipAttributes(titleKey, disabled) : null;
        const fileName = metadata?.original_name || '';
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const uploadedAt = metadata?.uploaded_at ? formatDateTime(metadata.uploaded_at) : '';

        return `
            <div class="sig-box ${disabled ? 'is-staff-only' : ''}">
                ${titleKey ? `<input type="text" name="${escapeAttribute(titleKey)}" class="sig-title ${titleOwnership?.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" value="${escapeAttribute(titleValue || '')}" ${titleOwnership?.attrs || ''} ${titleOwnership?.disabled ? 'disabled' : ''}>${titleOwnership?.note || ''}` : ''}
                ${renderSignaturePadField(uploadField, metadata, {
                    label: labelText,
                    disabled,
                    fallback: `
                        <div class="signature-upload-inline ${uploadOwnership.disabled ? 'is-disabled' : ''}">
                            <label class="signature-launch signature-launch--upload ${uploadOwnership.disabled ? 'is-disabled' : ''}">
                                <input type="file" class="upload-input" data-upload-field="${escapeAttribute(uploadField)}" ${uploadOwnership.attrs} accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf" ${uploadOwnership.disabled ? 'disabled' : ''}>
                                ${fileName ? 'Ilisi ang pirma' : 'Upload pirma'}
                            </label>
                            ${fileUrl ? `<a class="signature-file-link" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">Tan-awa ang uploaded nga pirma</a>` : ''}
                            ${uploadedAt ? `<span class="signature-status-text">Uploaded ${escapeHtml(uploadedAt)}</span>` : ''}
                        </div>
                    `,
                })}
                ${uploadOwnership.note}
                <input type="text" name="${escapeAttribute(nameKey)}" class="sig-name ${nameOwnership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" value="${escapeAttribute(nameValue || '')}" ${nameOwnership.attrs} ${nameOwnership.disabled ? 'disabled' : ''}>
                ${nameOwnership.note}
                <div class="sig-label">${labelText}</div>
            </div>
        `;
    }

    function renderMungkahingSignatureDate(name, value, disabled = false) {
        const ownership = buildFieldOwnershipAttributes(name, disabled);
        return `
            <input type="date" name="${escapeAttribute(name)}" class="sig-date ${ownership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" value="${escapeAttribute(value || '')}" ${ownership.attrs} ${ownership.disabled ? 'disabled' : ''}>
            ${ownership.note}
        `;
    }

    function renderMungkahingSectorMatrix(pantawid, nonPantawid) {
        const columns = [['Babae', 'sexFemale'], ['Lalake', 'sexMale'], ['Babae', 'seniorFemale'], ['Lalake', 'seniorMale'], ['Babae', 'pwdFemale'], ['Lalake', 'pwdMale'], ['Babae', 'ipFemale'], ['Lalake', 'ipMale'], ['Babae', 'soloParentFemale'], ['Lalake', 'soloParentMale']];
        return renderPaperTableMarkup('sectoral-table', `
            <tr><th rowspan="2" style="width: 16%;">Paglain-lain</th><th colspan="2" style="width: 18%;">Sex</th><th colspan="8">SECTORAL</th></tr>
            <tr><th>Babae</th><th>Lalake</th><th colspan="2">Senior Citizens</th><th colspan="2">PWD</th><th colspan="2">IP</th><th colspan="2">Solo Parent</th></tr>
            <tr><th></th>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>
        `, `
            ${renderMungkahingSectorMatrixRow('Pantawid', 'sectoralClassification.pantawid', pantawid, columns)}
            ${renderMungkahingSectorMatrixRow('Non-Pantawid', 'sectoralClassification.nonPantawid', nonPantawid, columns)}
        `);
    }

    function renderMungkahingSectorMatrixRow(label, keyPrefix, values, columns) {
        return `<tr><td><strong>${escapeHtml(label)}</strong></td>${columns.map(([columnLabel, key]) => {
            const name = `${keyPrefix}.${key}`;
            return `<td class="paper-table__choice">${renderSectorCheckboxInput(name, values?.[key], `${label} ${columnLabel}`)}</td>`;
        }).join('')}</tr>`;
    }

    function renderPaperTableMarkup(className, headHtml, bodyHtml, footHtml = '') {
        return `<div class="paper-table-wrap"><table class="${escapeAttribute(className)}"><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody>${footHtml ? `<tfoot>${footHtml}</tfoot>` : ''}</table></div>`;
    }

    function mungkahingAssetUrl(fileName) {
        const assetMap = {
            'city-of-butuan-logo.png': 'assets/img/cityOfButuan-cropped.png',
            'dswd-logo.png': 'assets/img/CSWD-logo-cropped.png',
            'butuanon-logo.png': 'assets/img/NewButuanon.png',
        };
        const mappedPath = assetMap[String(fileName || '').trim()];
        if (mappedPath) {
            return routeUrl(mappedPath);
        }
        return routeUrl(`assets/img/${String(fileName || '').replace(/^\/+/, '')}`);
    }

    function ensureRows(rows, fallbackRow, maxRows = null) {
        const normalizedRows = Array.isArray(rows) && rows.length > 0 ? rows : [fallbackRow];
        return Number.isInteger(maxRows) && maxRows > 0
            ? normalizedRows.slice(0, maxRows)
            : normalizedRows;
    }

    function handleWindowResize() {
        const nextMode = window.innerWidth >= 1024 ? 'desktop' : 'mobile';
        if (nextMode !== state.renderMode && state.task?.interactive) {
            const payload = gatherFormData();
            if (payload) {
                state.activePayload = payload;
            }
            state.renderMode = nextMode;
            renderTask();
        } else {
            state.renderMode = nextMode;
        }

        syncSidebarMenuState();
    }

    function closeSidebarMenuOnMobile() {
        if (window.innerWidth > 960) {
            return;
        }

        const sidebar = document.querySelector('.dash-sidebar');
        sidebar?.classList.remove('is-open');
        syncSidebarMenuState();
    }

    function handleGlobalKeydown(event) {
        if (event.key === 'Escape') {
            if (!document.getElementById('signaturePadModal')?.hidden) {
                closeSignaturePadModal();
                return;
            }
            closeSidebarMenuOnMobile();
        }
    }

    function routeUrl(path) {
        const base = state.baseUrl || '';
        return `${base}/${String(path || '').replace(/^\/+/, '')}`;
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

    function setNestedValue(target, path, value) {
        const segments = path.split('.');
        let cursor = target;
        segments.forEach((segment, index) => {
            const isLast = index === segments.length - 1;
            const nextSegment = segments[index + 1];
            const isArrayIndex = /^\d+$/.test(segment);

            if (isLast) {
                if (isArrayIndex && Array.isArray(cursor)) {
                    cursor[Number(segment)] = value;
                } else {
                    cursor[segment] = value;
                }
                return;
            }

            const containerIsArray = /^\d+$/.test(nextSegment);
            if (isArrayIndex) {
                const numericIndex = Number(segment);
                if (!Array.isArray(cursor)) {
                    return;
                }
                if (cursor[numericIndex] == null) {
                    cursor[numericIndex] = containerIsArray ? [] : {};
                }
                cursor = cursor[numericIndex];
                return;
            }

            if (!(segment in cursor)) {
                cursor[segment] = containerIsArray ? [] : {};
            }
            cursor = cursor[segment];
        });
    }

    function getNestedValue(target, path) {
        if (!target || typeof target !== 'object' || !path) {
            return undefined;
        }

        return String(path).split('.').filter(Boolean).reduce((value, segment) => {
            if (value == null || typeof value !== 'object') {
                return undefined;
            }
            return value[segment];
        }, target);
    }

    function deleteNestedValue(target, path) {
        if (!target || typeof target !== 'object' || !path) {
            return;
        }

        const segments = String(path).split('.').filter(Boolean);
        let cursor = target;
        segments.forEach((segment, index) => {
            if (!cursor || typeof cursor !== 'object' || !(segment in cursor)) {
                cursor = null;
                return;
            }

            if (index === segments.length - 1) {
                delete cursor[segment];
                return;
            }

            cursor = cursor[segment];
        });
    }

    function structuredCloneSafe(value) {
        try {
            return JSON.parse(JSON.stringify(value ?? {}));
        } catch (error) {
            return {};
        }
    }

    function showToast(message, tone) {
        const stack = document.getElementById('toastStack');
        if (!stack) {
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast ${tone || 'info'}`;
        toast.textContent = message;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
        }, 2600);
        setTimeout(() => {
            toast.remove();
        }, 3400);
    }

    function escapeHtml(value) {
        const node = document.createElement('div');
        node.textContent = value == null ? '' : String(value);
        return node.innerHTML;
    }

    function escapeAttribute(value) {
        return escapeHtml(value).replace(/"/g, '&quot;');
    }

    function renderStaffSections(sections, reviewerRemarks) {
        return renderApplicantReviewerNote(reviewerRemarks);
    }

    function renderUploadField(label, fieldKey, metadata, disabled = false) {
        const ownership = buildFieldOwnershipAttributes(fieldKey, disabled);
        const fileName = metadata?.original_name || '';
        const fileUrl = metadata?.file_path ? routeUrl(metadata.file_path) : '';
        const uploadedAt = metadata?.uploaded_at ? formatDateTime(metadata.uploaded_at) : '';
        const signaturePad = renderSignaturePadField(fieldKey, metadata, {
            label,
            variant: 'inline',
            disabled,
            fallback: '',
        });

        if (signaturePad) {
            return `
                <div class="form-field full upload-field">
                    <span>${escapeHtml(label)}</span>
                    ${ownership.note}
                    ${assignedPdoSignatureWarning(fieldKey, metadata)}
                    ${signaturePad}
                </div>
            `;
        }

        return `
            <div class="form-field full upload-field">
                <span>${escapeHtml(label)}</span>
                ${ownership.note}
                ${assignedPdoSignatureWarning(fieldKey, metadata)}
                <div class="upload-card upload-card--guided ${ownership.disabled ? 'is-disabled' : ''}">
                    <div class="upload-card__copy">
                        <strong>${escapeHtml(fileName || 'No file uploaded yet')}</strong>
                        <small>${fileName ? `Uploaded ${escapeHtml(uploadedAt || '')}` : 'Accepted: JPG, PNG, WEBP, HEIC, HEIF, or PDF'}</small>
                    </div>
                    <div class="upload-card__actions">
                        ${fileUrl ? `<a class="btn-outline small" href="${escapeAttribute(fileUrl)}" target="_blank" rel="noopener">View uploaded file</a>` : `
                            <label class="btn-primary small upload-trigger ${ownership.disabled ? 'is-disabled' : ''}">
                                <input type="file" class="upload-input" data-upload-field="${escapeAttribute(fieldKey)}" ${ownership.attrs} accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf" ${ownership.disabled ? 'disabled' : ''}>
                                Upload file
                            </label>
                        `}
                        ${fileUrl ? `
                            <label class="btn-outline small upload-trigger ${ownership.disabled ? 'is-disabled' : ''}">
                                <input type="file" class="upload-input" data-upload-field="${escapeAttribute(fieldKey)}" ${ownership.attrs} accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf" ${ownership.disabled ? 'disabled' : ''}>
                                Replace file
                            </label>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function renderFamilyMemberRow(row, index) {
        return renderRepeatableMiniCard(
            `Family member ${index + 1}`,
            `
                ${renderField('Family member name', `familyEnterprise.members.${index}.name`, row.name || '', 'text')}
                ${renderField('Age', `familyEnterprise.members.${index}.age`, row.age || '', 'number')}
                ${renderField('Activities', `familyEnterprise.members.${index}.activities`, row.activities || '', 'text', true)}
            `,
            'remove-family',
            index
        );
    }

    function renderIncomeRow(row, index) {
        return renderRepeatableMiniCard(
            `Income row ${index + 1}`,
            `
                ${renderField('Working family member', `incomeEligibility.rows.${index}.memberName`, row.memberName || '', 'text')}
                ${renderField('Cash income', `incomeEligibility.rows.${index}.cashIncome`, row.cashIncome || '', 'number')}
                ${renderField('Non-cash income', `incomeEligibility.rows.${index}.nonCashIncome`, row.nonCashIncome || '', 'number')}
                ${renderField('Total income', `incomeEligibility.rows.${index}.totalIncome`, row.totalIncome || '', 'number')}
            `,
            'remove-income',
            index
        );
    }

    function renderAvailmentMobile(payload) {
        const data = payload || {};
        const staff = data.staffReview || {};
        const pageOneCertification = staff.pageOneCertification || {};
        const physical = staff.physicalRequirements || {};
        const food = physical.foodRelatedCertification || {};
        const psycho = staff.psychoSocialRequirements || {};
        const residency = psycho.residencyAndCharacter || {};
        const relationships = psycho.familyRelationshipsWorkHabitsAspiration || {};
        const applicantName = resolveAvailmentApplicantName(data, pageOneCertification.eligibilityStatementName || '');
        const familyMembers = ensureRows(data.familyEnterprise?.members, { name: '', age: '', activities: '' }, getHardCopyRowLimit('add-family'));
        const incomeRows = ensureRows(data.incomeEligibility?.rows, { memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' }, getHardCopyRowLimit('add-income'));
        const healthRows = ensureRows(resolveAvailmentHealthRows(physical, data), { requirement: '', age: '', healthStatus: '' }, getHardCopyRowLimit('add-health'));
        const currentPage = state.availmentPage === 2 ? 2 : 1;
        return `
            ${renderAvailmentPageStepper(currentPage)}
            <div class="availment-page-panel ${currentPage === 1 ? 'is-active' : ''}" ${currentPage === 1 ? '' : 'hidden'} data-availment-panel="1">
                <div class="paper-document paper-document--availment">
                    <section class="paper-sheet paper-sheet--govform paper-sheet--availment-source">
                        ${renderAvailmentSourceHeader(true)}
                        <div class="availment-source-city">City: &nbsp; Butuan City</div>
                        <section class="paper-page-section paper-page-section--availment-source">
                            ${renderMungkahingPaperSectionTitle('I.', 'CLIENT IDENTIFYING DATA:')}
                            <div class="availment-source-lines">
                                <div class="availment-source-lines__row">
                                    ${renderAvailmentSourceLineField('Name', 'clientIdentifyingData.name', data.clientIdentifyingData?.name || '', 'text')}
                                    ${renderAvailmentSourceLineField('Age', 'clientIdentifyingData.age', data.clientIdentifyingData?.age || '', 'number')}
                                </div>
                                ${renderAvailmentSourceLineField('Address', 'clientIdentifyingData.address', data.clientIdentifyingData?.address || '', 'text', { long: true })}
                                ${renderAvailmentSourceLineField('Name of Spouse', 'clientIdentifyingData.spouseName', data.clientIdentifyingData?.spouseName || '', 'text', { long: true })}
                            </div>
                        </section>
                        <section class="paper-page-section paper-page-section--availment-source">
                            ${renderMungkahingPaperSectionTitle('II.', 'TYPE OF PROJECT:')}
                            <div class="paper-page-subtitle paper-page-subtitle--plain availment-source-subtitle">A. Family Enterprise:</div>
                            ${renderDocumentFamilyTable(familyMembers, { paperMode: true })}
                            <div class="paper-page-subtitle paper-page-subtitle--plain availment-source-subtitle">B. Individual Assistance:</div>
                            <div class="availment-source-lines availment-source-lines--indented">
                                ${renderAvailmentSourceLineField('Clientele Category', 'individualAssistance.clienteleCategory', data.individualAssistance?.clienteleCategory || '', 'text')}
                                ${renderAvailmentSourceLineField('Nature of difficult circumstances', 'individualAssistance.natureOfDifficultCircumstances', data.individualAssistance?.natureOfDifficultCircumstances || '', 'text', { long: true })}
                            </div>
                            <div class="paper-gov-certification availment-source-certification">
                                I certify that ${renderPaperValueLine(applicantName, { long: true })} is eligible to avail the Sustainable Market and Technology Driven Livelihood and Employment Assistance Program (SMART LEAP) based on the assessment.
                            </div>
                            ${state.reviewerMode ? `
                                <div class="availment-source-signoff">
                                    <div class="availment-source-signoff__trigger">
                                        ${renderSignaturePadField('pageOneCertification.signatureUpload', pageOneCertification.signatureUpload || null, {
                                            label: 'Direct Worker signature upload',
                                            variant: 'inline',
                                            previewLabel: 'Click-to-sign',
                                        })}
                                    </div>
                                    ${renderAvailmentSourceCertificationLine('', 'staffReview.pageOneCertification.directWorkerName', pageOneCertification.directWorkerName || '', 'text', 'participant')}
                                    <div class="availment-source-signoff__label">Direct Worker</div>
                                </div>
                            ` : ''}
                        </section>
                        <section class="paper-page-section paper-page-section--availment-source">
                            ${renderMungkahingPaperSectionTitle('III.', 'INCOME ELIGIBILITY REQUIREMENT:')}
                            ${renderDocumentIncomeTable(incomeRows, data.incomeEligibility?.totalFamilyIncome || '', { paperMode: true })}
                        </section>
                        ${renderAvailmentSourceFooter()}
                    </section>
                </div>
                ${renderAvailmentPageControls(currentPage)}
            </div>
            <div class="availment-page-panel ${currentPage === 2 ? 'is-active' : ''}" ${currentPage === 2 ? '' : 'hidden'} data-availment-panel="2">
                <div class="paper-document paper-document--availment">
                    <section class="paper-sheet paper-sheet--govform paper-sheet--availment-source">
                        ${renderAvailmentSourceHeader(false)}
                        <section class="paper-page-section paper-page-section--availment-source">
                            ${renderMungkahingPaperSectionTitle('IV.', 'PHYSICAL REQUIREMENTS')}
                            <div class="paper-page-subtitle paper-page-subtitle--plain availment-source-subtitle">A. Health Age Requirements</div>
                            ${renderDocumentHealthTable(healthRows)}
                            <div class="paper-page-subtitle paper-page-subtitle--plain availment-source-subtitle">Food Related Projects:</div>
                            <div class="paper-gov-certification availment-source-certification">
                                I certify that ${renderPaperValueLine(resolveAvailmentApplicantName(data, food.applicantName || applicantName), { long: true })} has undergone medical check-up and is physically fit to run a food related projects.
                            </div>
                            ${state.reviewerMode ? `
                                <div class="availment-source-signoff availment-source-signoff--wide">
                                    <div class="availment-source-signoff__trigger">
                                        ${renderSignaturePadField('physicalRequirements.foodRelatedCertification.signatureUpload', food.signatureUpload || null, {
                                            label: 'Certifying Officer signature upload',
                                            variant: 'inline',
                                            previewLabel: 'Click-to-sign',
                                        })}
                                    </div>
                                    ${renderAvailmentSourceCertificationLine('', 'staffReview.physicalRequirements.foodRelatedCertification.certifyingOfficerName', food.certifyingOfficerName || '', 'text', 'participant')}
                                    <div class="availment-source-signoff__label">Name and Signature of Certifying Officer</div>
                                </div>
                            ` : ''}
                        </section>
                        <section class="paper-page-section paper-page-section--availment-source">
                            ${renderMungkahingPaperSectionTitle('V.', 'PSYCHO-SOCIAL REQUIREMENTS:')}
                            <div class="paper-page-subtitle paper-page-subtitle--plain availment-source-subtitle">A. Residency and Character (for barangay captain, parish priest, etc.)</div>
                            <div class="paper-gov-certification availment-source-certification">
                                I certify that ${renderPaperValueLine(resolveAvailmentApplicantName(data, residency.residentName || applicantName), { long: true })} a bonafide resident of the barangay and is of good moral character and has no adverse reputation.
                            </div>
                            ${state.reviewerMode ? `
                                <div class="availment-source-signoff availment-source-signoff--wide">
                                    <div class="availment-source-signoff__trigger">
                                        ${renderSignaturePadField('psychoSocialRequirements.residencyAndCharacter.signatureUpload', residency.signatureUpload || null, {
                                            label: 'Certifying Officer signature upload',
                                            variant: 'inline',
                                            previewLabel: 'Click-to-sign',
                                        })}
                                    </div>
                                    ${renderAvailmentSourceCertificationLine('', 'staffReview.psychoSocialRequirements.residencyAndCharacter.certifyingOfficerName', residency.certifyingOfficerName || '', 'text', 'participant')}
                                    <div class="availment-source-signoff__label">Name and Signature of Certifying Officer</div>
                                </div>
                            ` : ''}
                            <div class="paper-page-subtitle paper-page-subtitle--plain availment-source-subtitle">B. Family Relationships, Work Habits, Aspirations</div>
                            <div class="paper-gov-certification availment-source-certification">
                                I certify that through personal interview, home visit and collateral interview I have verified that ${renderPaperValueLine(resolveAvailmentApplicantName(data, relationships.applicantName || applicantName), { long: true })} manifest positive relationships, good work habits and attitude as well as demonstrated capacity and adequate level of economic aspiration.
                            </div>
                            ${state.reviewerMode ? `
                                <div class="availment-source-signoff availment-source-signoff--wide">
                                    <div class="availment-source-signoff__trigger">
                                        ${renderSignaturePadField('psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.signatureUpload', relationships.signatureUpload || null, {
                                            label: 'Direct Worker signature upload',
                                            variant: 'inline',
                                            previewLabel: 'Click-to-sign',
                                        })}
                                    </div>
                                    ${renderAvailmentSourceCertificationLine('', 'staffReview.psychoSocialRequirements.familyRelationshipsWorkHabitsAspiration.directWorkerName', relationships.directWorkerName || '', 'text', 'participant')}
                                    <div class="availment-source-signoff__label">Name and Signature of Direct Worker</div>
                                </div>
                            ` : ''}
                            <div class="paper-page-subtitle paper-page-subtitle--plain availment-source-subtitle">C. Social Responsibility and willingness to save (client)</div>
                            <div class="paper-gov-certification availment-source-certification">
                                I will abide by all the policies and guidelines set by CSWDD for the SMART LEAP and I promise to pay the roll-back at the time stipulated and to generate weekly savings to meet emergencies that may affect my family.
                            </div>
                            <div class="availment-source-signoff availment-source-signoff--wide availment-source-signoff--participant">
                                <input type="hidden" name="applicantSignature.signedDate" value="${escapeAttribute(data.applicantSignature?.signedDate || currentDateInputValue())}">
                                <div class="availment-source-signoff__trigger">
                                    ${renderSignaturePadField('applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null, {
                                        label: 'Participant signature upload',
                                        variant: 'inline',
                                        previewLabel: 'Click-to-sign',
                                        forceApplicant: true,
                                    })}
                                </div>
                                ${renderAvailmentSourceCertificationLine('', 'applicantSignature.signedName', data.applicantSignature?.signedName || applicantName, 'text', 'participant')}
                                <div class="availment-source-signoff__label">Name and Signature of Participant</div>
                            </div>
                        </section>
                        ${renderAvailmentSourceFooter()}
                    </section>
                </div>
                ${renderAvailmentPageControls(currentPage)}
            </div>
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderBusinessPlanMobile(payload) {
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
            ${renderBeforeYouStart(['Andama ang tubag sa matag heading sa hardcopy Business Plan.', 'Ayaw usba ang heading order; pun-a lang ang blank writing areas.', 'Andama ang pirma sa benepisyaryo para sa Prepared by block.'])}
            ${renderGuidedSection('section-bp-executive-summary', 'EXECUTIVE SUMMARY (PAGLALARAWAN NG NEGOSYO)', 'Pun-a ang tulo ka opening headings exactly as written in the hardcopy.', `
                <div class="post-approval-fields">
                    ${renderTextarea('1. Brief Description of the Business/Project', 'executiveSummary.briefDescriptionOfBusinessProject', executiveSummary.briefDescriptionOfBusinessProject || '', true)}
                    ${renderTextarea('2. Brief Profile of an Entrepreneur', 'executiveSummary.briefProfileOfEntrepreneur', executiveSummary.briefProfileOfEntrepreneur || '', true)}
                    ${renderTextarea('3. Project’s Contributions to the Economy', 'executiveSummary.projectContributionsToEconomy', executiveSummary.projectContributionsToEconomy || '', true)}
                </div>
            `)}
            ${renderGuidedSection('section-bp-marketing-plan', 'Section 1: MARKETING PLAN', 'Keep the exact numbering and labels from the hardcopy.', `
                <div class="post-approval-fields">
                    ${renderTextarea('1.1 Description of the Product', 'marketingPlan.descriptionOfProduct', marketingPlan.descriptionOfProduct || '', true)}
                    ${renderTextarea('1.2 Comparison of the Product with Its Competitors', 'marketingPlan.comparisonWithCompetitors', marketingPlan.comparisonWithCompetitors || '', true)}
                    ${renderTextarea('1.3 Location', 'marketingPlan.location', marketingPlan.location || '', true)}
                    ${renderTextarea('1.4 Market Area', 'marketingPlan.marketArea', marketingPlan.marketArea || '', true)}
                    ${renderTextarea('1.5 Main Customers', 'marketingPlan.mainCustomers', marketingPlan.mainCustomers || '', true)}
                    ${renderTextarea('1.6 Total Demand', 'marketingPlan.totalDemand', marketingPlan.totalDemand || '', true)}
                    ${renderTextarea('1.7 Selling Price', 'marketingPlan.sellingPrice', marketingPlan.sellingPrice || '', true)}
                    ${renderTextarea('1.8 Promotional Measures', 'marketingPlan.promotionalMeasures', marketingPlan.promotionalMeasures || '', true)}
                    ${renderTextarea('1.9 Marketing Strategy', 'marketingPlan.marketingStrategy', marketingPlan.marketingStrategy || '', true)}
                    ${renderTextarea('1.10 Marketing Budget', 'marketingPlan.marketingBudget', marketingPlan.marketingBudget || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-bp-production-plan', 'Section 2: PRODUCTION PLAN', 'Pun-a ang exact headings under Production Plan.', `
                <div class="post-approval-fields">
                    ${renderTextarea('2.1 Production/Service Process', 'productionPlan.productionServiceProcess', productionPlan.productionServiceProcess || '', true)}
                    ${renderTextarea('2.2 Fixed Capital', 'productionPlan.fixedCapital', productionPlan.fixedCapital || '', true)}
                    ${renderTextarea('2.3 Life of Fixed Capital', 'productionPlan.lifeOfFixedCapital', productionPlan.lifeOfFixedCapital || '', true)}
                    ${renderTextarea('2.4 Sources of Equipment', 'productionPlan.sourcesOfEquipment', productionPlan.sourcesOfEquipment || '', true)}
                    ${renderTextarea('2.5 Planned Capacity', 'productionPlan.plannedCapacity', productionPlan.plannedCapacity || '', true)}
                    ${renderTextarea('2.6 Future Capacity', 'productionPlan.futureCapacity', productionPlan.futureCapacity || '', true)}
                    ${renderTextarea('2.7 Raw Materials', 'productionPlan.rawMaterials', productionPlan.rawMaterials || '', true)}
                    ${renderTextarea('2.8 Cost of Raw Materials', 'productionPlan.costOfRawMaterials', productionPlan.costOfRawMaterials || '', true)}
                    ${renderTextarea('2.9 Raw Materials Availability', 'productionPlan.rawMaterialsAvailability', productionPlan.rawMaterialsAvailability || '', true)}
                    ${renderTextarea('2.10 Labor', 'productionPlan.labor', productionPlan.labor || '', true)}
                    ${renderTextarea('2.11 Cost of Labor', 'productionPlan.costOfLabor', productionPlan.costOfLabor || '', true)}
                    ${renderTextarea('2.12 Labor Availability', 'productionPlan.laborAvailability', productionPlan.laborAvailability || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-bp-management-plan', 'Section 3: ORGANIZATION AND MANAGEMENT PLAN', 'Pun-a ang blank writing areas only.', `
                <div class="post-approval-fields">
                    ${renderTextarea('3.1 Pre Operating Activities', 'organizationAndManagementPlan.preOperatingActivities', managementPlan.preOperatingActivities || '', true)}
                    ${renderTextarea('3.2 Pre Operating Expenses', 'organizationAndManagementPlan.preOperatingExpenses', managementPlan.preOperatingExpenses || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-bp-financial-plan', 'Section 4: FINANCIAL PLAN', 'Keep the exact 4.1 heading from the hardcopy.', `
                <div class="post-approval-fields">
                    ${renderTextarea('4.1 Project Cost', 'financialPlan.projectCost', financialPlan.projectCost || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-bp-signoff', 'Prepared by / Reviewed by / Noted by', 'Prepared by is applicant-editable. Reviewed by and Noted by remain staff-only.', `
                <div class="post-approval-fields">
                    ${renderField('Prepared by', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                    ${renderField('Date signed', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date')}
                    ${renderUploadField('Applicant signature upload', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                    ${renderReadOnlyField('Reviewed by', approval.approverName || 'Pending staff review')}
                    ${renderReadOnlyField('Approved date', approval.approvedDate || 'Pending staff review')}
                    ${renderReadOnlyField('Reviewer signature upload', approval.signatureUpload?.original_name || 'Pending staff review')}
                    ${renderReadOnlyField('Noted by', 'GOLDA V. POCON, RSW, MSSW, CESE / CGHD-II/CSWDO')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderBuhatSaPagpanumpaMobile(payload) {
        const data = payload || {};
        const project = {
            programStatement: data.project?.programStatement || 'Sustainable Market and Technology Driven Livelihood and Employment Program',
            programShortName: data.project?.programShortName || data.project?.programName || 'SMART LEAP',
            amountInWords: data.project?.amountInWords || 'Fifteen Thousand Pesos',
            amountNumeric: data.project?.amountNumeric || (data.project?.amountReceived ? `Php ${data.project.amountReceived}` : 'Php 15,000.00'),
        };
        const agreementDateWords = data.agreement?.currentDateWords || formatMonthDayWords(data.agreement?.dateSigned);
        return `
            ${renderBeforeYouStart(['Andama ang impormasyon sa benepisyaryo.', 'Andama ang impormasyon sa co-maker.', 'Andama ang pirma sa beneficiary ug co-maker para sa upload.'])}
            ${renderGuidedSection('section-beneficiary-info', 'Impormasyon sa Benepisyaryo', 'Kini ang datos sa una nga "Ako si ____" sa Buhat sa Pagpanumpa.', `
                <div class="post-approval-fields">
                    ${renderField('Ako si', 'beneficiary.fullName', data.beneficiary?.fullName || '', 'text')}
                    ${renderField('Address', 'beneficiary.addressLine', data.beneficiary?.addressLine || '', 'text', true)}
                    ${renderField('Barangay', 'beneficiary.barangay', data.beneficiary?.barangay || '', 'text')}
                    ${renderField('City', 'beneficiary.city', data.beneficiary?.city || '', 'text')}
                </div>
            `)}
            ${renderGuidedSection('section-program-details', 'Detalye sa Programa ug Proyekto', 'Kini nga mga pulong ug kantidad kay automatic ug dili ma-edit sa applicant.', `
                <div class="post-approval-fields">
                    ${renderReadOnlyField('Ako usa ka benepisyaryo sa', project.programStatement)}
                    ${renderReadOnlyField('Tungod sa', project.programShortName)}
                    ${renderReadOnlyField('Amount in words', project.amountInWords)}
                    ${renderReadOnlyField('Amount', project.amountNumeric)}
                </div>
            `)}
            ${renderGuidedSection('section-co-maker', 'Detalye sa Co-maker', 'Kini ang pangalan sa co-maker sa item number 8 nga "ako si ____".', `
                <div class="post-approval-fields">
                    ${renderField('Ako si (co-maker)', 'coMaker.fullName', data.coMaker?.fullName || '', 'text')}
                    ${renderField('Address line', 'coMaker.addressLine', data.coMaker?.addressLine || '', 'text', true)}
                    ${renderField('Barangay', 'coMaker.barangay', data.coMaker?.barangay || '', 'text')}
                    ${renderField('City', 'coMaker.city', data.coMaker?.city || '', 'text')}
                </div>
            `)}
            ${renderGuidedSection('section-dates', 'Petsa sa Kasabutan', 'Kini nga petsa kay automatic nga month ug day words format.', `
                <div class="post-approval-fields">
                    ${renderReadOnlyField('Karong adlawa', agreementDateWords)}
                </div>
            `)}
            ${renderGuidedSection('section-signatures', 'Pirma sa Benepisyaryo ug Co-maker', 'I-type ang ngalan ug i-upload ang pirma sa duha ka signatories.', `
                <div class="post-approval-fields">
                    ${renderField('Name and Signature of Beneficiary', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                    ${renderUploadField('Beneficiary signature upload', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                    ${renderField('Name and Signature of Co-maker', 'coMakerSignature.signedName', data.coMakerSignature?.signedName || '', 'text')}
                    ${renderUploadField('Co-maker signature upload', 'coMakerSignature.signatureUpload', data.coMakerSignature?.signatureUpload || null)}
                </div>
            `)}
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderMungkahingMobile(payload) {
        const data = payload || {};
        const recommendation = data.staffReview?.recommendation || {};
        const modalityRows = ensureRows(data.modalityApplications?.rows, { fundSource: '', contributionType: '', amount: '' }, getHardCopyRowLimit('add-mp-contribution'));
        const materialsRows = ensureRows(data.businessOperation?.materials?.rows, { material: '', quality: '', unit: '', unitPrice: '', cyclesPerProduction: '', projectedCost: '' }, getHardCopyRowLimit('add-mp-material'));
        const laborRows = ensureRows(data.businessOperation?.labor?.rows, { workerName: '', position: '', dailyWage: '' }, getHardCopyRowLimit('add-mp-labor'));
        const toolRows = ensureRows(data.businessOperation?.toolsEquipment?.rows, { equipment: '', capacity: '', unit: '', quantityOrPrice: '', projectedAmount: '', usefulLifeDays: '', productionCycle: '', depreciationCost: '' }, getHardCopyRowLimit('add-mp-equipment'));
        const expenseRows = ensureRows(data.businessOperation?.operatingExpenses?.rows, { expenseName: '', paymentFrequency: '', projectedCost: '' }, getHardCopyRowLimit('add-mp-expense'));
        const salesRows = ensureRows(data.businessOperation?.salesProjection?.rows, { product: '', capacity: '', unit: '', sellingPrice: '', projectedSales: '' }, getHardCopyRowLimit('add-mp-sale'));
        const spendingRows = ensureRows(data.spendingPlan?.rows, { expense: '', amount: '', usageSchedule: '' }, getHardCopyRowLimit('add-mp-spending'));
        const mapRows = (rows, action, builder) => `<div class="guided-repeatable-stack">${rows.map((row, index) => builder(row, index, action)).join('')}</div>`;
        const basicRowCard = (title, fields, action, index) => renderRepeatableMiniCard(`${title} ${index + 1}`, fields, action, index);

        return `
            ${renderBeforeYouStart(['Andama ang project information ug rationale.', 'Andama ang mga kantidad sa materyales, sweldo, ug gastos.', 'Andama ang pirma sa partisipante para sa upload.'])}
            ${renderGuidedSection('section-project-info', 'I. KINATIBUK-AN IMPORMASYON BAHIN SA PROYEKTO', 'Pun-a ang ibabaw nga impormasyon sa mungkahing proyekto.', `
                <div class="post-approval-fields">
                    ${renderField('Ngalan sa Partisipante', 'projectInformation.participantName', data.projectInformation?.participantName || '', 'text')}
                    ${renderField('Lokasyon sa Proyekto', 'projectInformation.projectLocation', data.projectInformation?.projectLocation || '', 'text', true)}
                    ${renderField('Ulohan sa Proyektong MD', 'projectInformation.projectTitle', data.projectInformation?.projectTitle || '', 'text')}
                    ${renderField('Petsa sa Pagtukod', 'projectInformation.projectDate', data.projectInformation?.projectDate || '', 'date')}
                    ${renderField('Kinatibuk-ang Kantidad', 'projectInformation.projectedAmount', data.projectInformation?.projectedAmount || '', 'text')}
                    ${renderField('Kantidad gikan sa CSWDO', 'projectInformation.cswddAmount', data.projectInformation?.cswddAmount || '', 'text')}
                    ${renderField('Laing kakuhanan sa pondo', 'projectInformation.otherFundingSource', data.projectInformation?.otherFundingSource || '', 'text')}
                    ${renderField('Savings Account no.', 'projectInformation.savingsAccountNumber', data.projectInformation?.savingsAccountNumber || 'NONE', 'text')}
                </div>
            `, { collapsible: true })}
            ${renderGuidedSection('section-sectoral', 'Sectoral', 'Pilia ang personal classification sa applicant.', `
                <div class="post-approval-fields">
                    ${renderChoiceRadioGroup('Program Membership', 'sectoralClassification.membershipType', data.sectoralClassification?.membershipType || '', [
                        { value: 'pantawid', label: 'Pantawid' },
                        { value: 'non_pantawid', label: 'Non-Pantawid' },
                    ])}
                    ${renderChoiceRadioGroup('Sex', 'sectoralClassification.sex', data.sectoralClassification?.sex || '', [
                        { value: 'female', label: 'Babae' },
                        { value: 'male', label: 'Lalake' },
                    ])}
                    <div class="form-field">
                        <span>Sectoral Classification</span>
                        <div class="post-approval-fields">
                            ${renderChoiceCheckboxField('Senior Citizen', 'sectoralClassification.seniorCitizen', Boolean(data.sectoralClassification?.seniorCitizen))}
                            ${renderChoiceCheckboxField('PWD', 'sectoralClassification.pwd', Boolean(data.sectoralClassification?.pwd))}
                            ${renderChoiceCheckboxField('IP', 'sectoralClassification.ip', Boolean(data.sectoralClassification?.ip))}
                            ${renderChoiceCheckboxField('Solo Parent', 'sectoralClassification.soloParent', Boolean(data.sectoralClassification?.soloParent))}
                        </div>
                    </div>
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-rationale', 'II. RATIONALE OF THE PROPOSED PROJECT', 'Isulat ang rationale sa proyekto.', `
                <div class="post-approval-fields">
                    ${renderTextarea('Rationale of the Proposed Project', 'rationale', data.rationale || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-modality', 'III. DETALYE SA MODALITY APPLICATION/S', 'Ilista ang mga partner ug ilang gi-ambag.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Partner rows</span></div>
                ${modalityRows.map((row, index) => basicRowCard('Partner row', `
                    ${renderReadOnlyField('Kakuhanan sa Pondo', row.fundSource || '')}
                    ${renderField('Gi-ambag', `modalityApplications.rows.${index}.contributionType`, row.contributionType || '', 'text')}
                    ${renderField('Kantidad', `modalityApplications.rows.${index}.amount`, row.amount || '', 'text')}
                `, '', index)).join('')}
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-materials', 'IV. a.) Mga gikinahanglan nga Materyales', 'Ilista ang materials table.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Material rows</span>${renderAddRowButton('add-mp-material', 'Add material row', materialsRows)}</div>
                ${mapRows(materialsRows, 'remove-mp-material', (row, index, action) => basicRowCard('Material row', `
                    ${renderField('Material', `businessOperation.materials.rows.${index}.material`, row.material || '', 'text')}
                    ${renderField('Kadaghanon', `businessOperation.materials.rows.${index}.quality`, row.quality || '', 'text')}
                    ${renderField('Unit', `businessOperation.materials.rows.${index}.unit`, row.unit || '', 'text')}
                    ${renderField('Unit price', `businessOperation.materials.rows.${index}.unitPrice`, row.unitPrice || '', 'number')}
                    ${renderField('Dalas ng paggamit/Skilo sa Produksyon', `businessOperation.materials.rows.${index}.cyclesPerProduction`, row.cyclesPerProduction || '', 'text')}
                    ${renderField('Kinatibuk-ang na kantidad o presyo', `businessOperation.materials.rows.${index}.projectedCost`, row.projectedCost || '', 'number')}
                `, action, index))}
                <div class="post-approval-fields">${renderField('Kinatibuk-ang Total', 'businessOperation.materials.totalCost', data.businessOperation?.materials?.totalCost || '', 'number')}</div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-labor', 'IV. b.) Mga Gikinahanglan na Trabahante', 'Ilista ang mga trabahante sa negosyo.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Labor rows</span>${renderAddRowButton('add-mp-labor', 'Add labor row', laborRows)}</div>
                ${mapRows(laborRows, 'remove-mp-labor', (row, index, action) => basicRowCard('Labor row', `
                    ${renderField('Ngalan sa Magtrabaho sa Negosyo', `businessOperation.labor.rows.${index}.workerName`, row.workerName || '', 'text')}
                    ${renderField('Posisyon sa Trabaho', `businessOperation.labor.rows.${index}.position`, row.position || '', 'text')}
                    ${renderField('Inadlaw na Sweldo', `businessOperation.labor.rows.${index}.dailyWage`, row.dailyWage || '', 'number')}
                `, action, index))}
                <div class="post-approval-fields">
                    ${renderField('Kinatibuk-an na inadlaw na sweldo', 'businessOperation.labor.totalDailyWage', data.businessOperation?.labor?.totalDailyWage || '', 'number')}
                    ${renderField('Kinatibuk-an na sweldo base sa siglo sa produksyon', 'businessOperation.labor.totalProductionCycleWage', data.businessOperation?.labor?.totalProductionCycleWage || '', 'number')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-tools', 'IV. c.) Mga Gikinahanglan nga Kagamitan (Tools and Equipment)', 'Ilista ang tools and equipment table.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Tool rows</span>${renderAddRowButton('add-mp-equipment', 'Add tool row', toolRows)}</div>
                ${mapRows(toolRows, 'remove-mp-equipment', (row, index, action) => basicRowCard('Tool row', `
                    ${renderField('Kagamitan', `businessOperation.toolsEquipment.rows.${index}.equipment`, row.equipment || '', 'text')}
                    ${renderField('Kadaghanon', `businessOperation.toolsEquipment.rows.${index}.capacity`, row.capacity || '', 'text')}
                    ${renderField('Unit', `businessOperation.toolsEquipment.rows.${index}.unit`, row.unit || '', 'text')}
                    ${renderField('Kantidad o presyo sa matag usa', `businessOperation.toolsEquipment.rows.${index}.quantityOrPrice`, row.quantityOrPrice || '', 'number')}
                    ${renderField('Kinatibuk-ang na kantidad o presyo', `businessOperation.toolsEquipment.rows.${index}.projectedAmount`, row.projectedAmount || '', 'number')}
                    ${renderField('Gisa-o sa kinabuhi sa mga himan/kagamitan', `businessOperation.toolsEquipment.rows.${index}.usefulLifeDays`, row.usefulLifeDays || '', 'text')}
                    ${renderField('Siklo sa Produksyon', `businessOperation.toolsEquipment.rows.${index}.productionCycle`, row.productionCycle || '', 'text')}
                    ${renderField('Depreciation cost', `businessOperation.toolsEquipment.rows.${index}.depreciationCost`, row.depreciationCost || '', 'number')}
                `, action, index))}
                <div class="post-approval-fields">${renderField('Tools total', 'businessOperation.toolsEquipment.totalCost', data.businessOperation?.toolsEquipment?.totalCost || '', 'number')}</div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-expenses', 'IV. d.) Uban pang mga gastohan', 'Ilista ang regular nga gastohan.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Expense rows</span>${renderAddRowButton('add-mp-expense', 'Add expense row', expenseRows)}</div>
                ${mapRows(expenseRows, 'remove-mp-expense', (row, index, action) => basicRowCard('Expense row', `
                    ${renderField('Regular na ginagastuhan', `businessOperation.operatingExpenses.rows.${index}.expenseName`, row.expenseName || '', 'text')}
                    ${renderField('Dalas ng pagbayad', `businessOperation.operatingExpenses.rows.${index}.paymentFrequency`, row.paymentFrequency || '', 'text')}
                    ${renderField('Kinatibuk-an na kantidad o presyo base sa siglo sa produksyon', `businessOperation.operatingExpenses.rows.${index}.projectedCost`, row.projectedCost || '', 'number')}
                `, action, index))}
                <div class="post-approval-fields">${renderField('Grand total', 'businessOperation.operatingExpenses.grandTotal', data.businessOperation?.operatingExpenses?.grandTotal || '', 'number')}</div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-sales', 'IV. e.) Pangunahi nga kita gikan sa puhunan alang sa mga sangkap', 'Ilista ang produkto ug projected sales.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Product rows</span>${renderAddRowButton('add-mp-sale', 'Add product row', salesRows)}</div>
                ${mapRows(salesRows, 'remove-mp-sale', (row, index, action) => basicRowCard('Product row', `
                    ${renderField('Product', `businessOperation.salesProjection.rows.${index}.product`, row.product || '', 'text')}
                    ${renderField('Kadaghanon', `businessOperation.salesProjection.rows.${index}.capacity`, row.capacity || '', 'text')}
                    ${renderField('Unit', `businessOperation.salesProjection.rows.${index}.unit`, row.unit || '', 'text')}
                    ${renderField('Kantidad sa pagpamaligya matag piraso', `businessOperation.salesProjection.rows.${index}.sellingPrice`, row.sellingPrice || '', 'text')}
                    ${renderField('Kinatibuk-an na kantidad sa pagpamaligya base sa siglo sa produksyon', `businessOperation.salesProjection.rows.${index}.projectedSales`, row.projectedSales || '', 'number')}
                `, action, index))}
                <div class="post-approval-fields">${renderField('Gross sales', 'businessOperation.salesProjection.grossSales', data.businessOperation?.salesProjection?.grossSales || '', 'number')}</div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-profit', 'IV. f.) ug sunod nga summary', 'Pun-a ang income computation summary.', `
                <div class="post-approval-fields">
                    ${renderField('Gilauman nga kita alang sa usa ka "siklo sa produksyon"', 'businessOperation.incomeComputation.projectedIncomePerCycle', data.businessOperation?.incomeComputation?.projectedIncomePerCycle || '', 'number')}
                    ${renderField('Mga materyales (raw materials)', 'businessOperation.incomeComputation.rawMaterialsCost', data.businessOperation?.incomeComputation?.rawMaterialsCost || '', 'number')}
                    ${renderField('Gikinahanglan na manpower ug labor', 'businessOperation.incomeComputation.manpowerLaborCost', data.businessOperation?.incomeComputation?.manpowerLaborCost || '', 'number')}
                    ${renderField('Depreciation Cost', 'businessOperation.incomeComputation.depreciationCost', data.businessOperation?.incomeComputation?.depreciationCost || '', 'number')}
                    ${renderField('Uban pang mga Gasto', 'businessOperation.incomeComputation.otherExpenses', data.businessOperation?.incomeComputation?.otherExpenses || '', 'number')}
                    ${renderField('Kinatibuk-an na gasto sa pag-operate', 'businessOperation.incomeComputation.totalOperatingCost', data.businessOperation?.incomeComputation?.totalOperatingCost || '', 'number')}
                    ${renderField('Kinatibuk-an na ginansya human sa gasto sa operasyon (Gross Profit)', 'businessOperation.incomeComputation.grossProfit', data.businessOperation?.incomeComputation?.grossProfit || '', 'number')}
                    ${renderField('Net profit', 'businessOperation.incomeComputation.netProfit', data.businessOperation?.incomeComputation?.netProfit || '', 'number')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-capital-fund', 'IV. g.) Iskedyul o Plano sa Paggasto sa SEA-K Capital Fund', 'Ilista ang plano sa paggasto sa SCF.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Spending rows</span>${renderAddRowButton('add-mp-spending', 'Add spending row', spendingRows)}</div>
                ${mapRows(spendingRows, 'remove-mp-spending', (row, index, action) => basicRowCard('Spending row', `
                    ${renderField('Mga Gasto', `spendingPlan.rows.${index}.expense`, row.expense || '', 'text')}
                    ${renderField('Kantidad', `spendingPlan.rows.${index}.amount`, row.amount || '', 'number')}
                    ${renderField('Iskedyul sa Paggamit', `spendingPlan.rows.${index}.usageSchedule`, row.usageSchedule || '', 'text')}
                `, action, index))}
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-signature', 'V. REKOMENDASYON - GI-ANDAM NI', 'I-type ang pangalan ug i-upload ang pirma sa partisipante.', `
                <div class="post-approval-fields">
                    ${renderField('Pirma ibabaw sa pangalan sa Partisipante', 'applicantSignature.signedName', data.applicantSignature?.signedName || '', 'text')}
                    ${renderField('Petsa', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || '', 'date')}
                    ${renderUploadField('Pirma sa Partisipante', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                    ${renderReadOnlyField('Name and Signature sa Validator', recommendation.approverName || 'Pending validator review')}
                    ${renderReadOnlyField('Validator date signed', recommendation.approvedDate || 'Pending validator review')}
                    ${renderReadOnlyField('Validator signature upload', recommendation.signatureUpload?.original_name || 'Pending validator review')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderValidationMobile(payload) {
        const data = payload || {};
        const staff = data.staffReview || {};
        const eligibility = staff.eligibilityAssessment || {};
        const validatorIdentity = staff.validatorIdentity || {};
        const applicantDetails = data.applicantDetails || {};
        const applicantName = deriveApplicantName(data);
        const eligibilityResidentName = eligibility.residentName || data.participantSignature?.signedName || applicantName || '';
        const eligibilityAge = eligibility.age || applicantDetails.age || '';
        const eligibilityBarangay = eligibility.barangay || applicantDetails.barangay || '';
        return `
            ${renderBeforeYouStart(['Andama ang personal nga detalye sa participant.', 'Tubaga ang Pantawid ug SLPA membership checklist.', 'Andama ang pirma sa participant para sa upload.'])}
            ${renderGuidedSection('section-applicant-info', 'VALIDATION FORM - Applicant Details', 'Pun-a ang mga linya nga makita sa validation form.', `
                <div class="post-approval-fields">
                    ${renderField('Date of Validation', 'applicantDetails.validationDate', data.applicantDetails?.validationDate || '', 'date')}
                    ${renderField('Last Name', 'applicantDetails.lastName', data.applicantDetails?.lastName || '', 'text')}
                    ${renderField('First Name', 'applicantDetails.firstName', data.applicantDetails?.firstName || '', 'text')}
                    ${renderField('Middle Name', 'applicantDetails.middleName', data.applicantDetails?.middleName || '', 'text')}
                    ${renderField('Address / Purok', 'applicantDetails.purok', data.applicantDetails?.purok || '', 'text')}
                    ${renderField('Barangay', 'applicantDetails.barangay', data.applicantDetails?.barangay || '', 'text')}
                    ${renderField('Birthday', 'applicantDetails.birthdate', data.applicantDetails?.birthdate || '', 'date')}
                    ${renderField('Educational Attainment', 'applicantDetails.educationalAttainment', data.applicantDetails?.educationalAttainment || '', 'text')}
                    ${renderField('Contact number', 'applicantDetails.contactNumber', data.applicantDetails?.contactNumber || '', 'text')}
                </div>
            `)}
            ${renderGuidedSection('section-checklist', 'CHECKLIST', 'Tubaga ang Pantawid Member ug SLPA Member items.', `
                <div class="post-approval-fields">
                    ${renderSelectField('Pantawid Member', 'membershipChecklist.pantawidMember', data.membershipChecklist?.pantawidMember || '', ['', 'Yes', 'No'])}
                    ${renderField('Specify', 'membershipChecklist.pantawidSpecify', data.membershipChecklist?.pantawidSpecify || '', 'text')}
                    ${renderSelectField('SLPA Member', 'membershipChecklist.slpaMember', data.membershipChecklist?.slpaMember || '', ['', 'Yes', 'No'])}
                    ${renderField('Specify', 'membershipChecklist.slpaSpecify', data.membershipChecklist?.slpaSpecify || '', 'text')}
                </div>
            `)}
            ${renderGuidedSection('section-eligibility-assessment', 'Eligibility Assessment', 'Kini nga declaration ang tubagon sa applicant/participant.', `
                <div class="post-approval-fields">
                    ${renderField('Resident name', 'staffReview.eligibilityAssessment.residentName', eligibilityResidentName, 'text', false, false, true)}
                    ${renderField('Age', 'staffReview.eligibilityAssessment.age', eligibilityAge, 'text', false, false, true)}
                    ${renderField('Barangay', 'staffReview.eligibilityAssessment.barangay', eligibilityBarangay, 'text', false, false, true)}
                    ${renderSelectField('Eligibility decision', 'staffReview.eligibilityAssessment.eligibilityDecision', eligibility.eligibilityDecision || '', ['', 'ANGAYAN', 'DILI ANGAYAN'], false, true)}
                </div>
                <div class="post-approval-copy">
                    Ako si <strong>${escapeHtml(eligibilityResidentName || '--')}</strong>, <strong>${escapeHtml(eligibilityAge || '--')}</strong> anyos, lumulupyo sa Barangay <strong>${escapeHtml(eligibilityBarangay || '--')}</strong>, Butuan City, Agusan Del Norte. Ako nakasabot sa tumong ug proseso niining Livelihood Assistance kung diin ako <strong>${escapeHtml(eligibility.eligibilityDecision || '--')}</strong> (ANGAYAN/DILI ANGAYAN) mamahimong benepisyo sa among program nga gidumala sa SMART LEAP ng City Social Welfare and Development Department (CSWDD).
                </div>
            `)}
            ${renderGuidedSection('section-assessment', 'Validator’s Recommendation', 'Kini nga block kay staff-only ug read-only sa applicant side.', `
                <div class="post-approval-fields">
                    ${renderTextarea("Validator's Recommendation", 'staffReview.validatorRecommendation', staff.validatorRecommendation || '', true, '', true)}
                </div>
            `)}
            ${renderGuidedSection('section-validator-signature', 'Validator Signature', 'Mao ni ang read-only validator signoff block once reviewed.', `
                <div class="post-approval-fields">
                    ${renderField('Ngalan/Perma sa Validator', 'staffReview.validatorIdentity.validatorName', validatorIdentity.validatorName || '', 'text', true, true)}
                    ${renderField('Date signed', 'staffReview.validatorIdentity.signedDate', validatorIdentity.signedDate || '', 'date', true, true)}
                    ${renderUploadField('Validator signature upload', 'validatorIdentity.signatureUpload', validatorIdentity.signatureUpload || null, true)}
                </div>
            `)}
            ${renderGuidedSection('section-signature', 'Participant Signature', 'I-type ang ngalan ug i-upload ang pirma sa participant.', `
                <div class="post-approval-fields">
                    ${renderField('Ngalan/Perma sa Partisipante', 'participantSignature.signedName', data.participantSignature?.signedName || '', 'text')}
                    ${renderField('Date signed', 'participantSignature.signedDate', data.participantSignature?.signedDate || '', 'date')}
                    ${renderUploadField('Participant signature upload', 'participantSignature.signatureUpload', data.participantSignature?.signatureUpload || null)}
                </div>
            `)}
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderGuidedSection(id, title, description, body, options = {}) {
        const tag = options.collapsible ? 'details' : 'section';
        const isOpen = options.collapsible
            ? (Object.prototype.hasOwnProperty.call(state.guidedSectionOpen, id) ? state.guidedSectionOpen[id] : options.open !== false)
            : false;
        const openAttr = options.collapsible && isOpen ? ' open' : '';
        const summary = options.collapsible
            ? `<summary class="guided-form-section__summary"><span>${escapeHtml(title)}</span><small>${escapeHtml(description || '')}</small></summary>`
            : `<div class="guided-form-section__header"><h3>${escapeHtml(title)}</h3>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>`;

        return `
            <${tag} class="guided-form-section${options.collapsible ? ' guided-form-section--accordion' : ''}" id="${escapeAttribute(id)}"${openAttr}>
                ${summary}
                <div class="guided-form-section__body">${body}</div>
            </${tag}>
        `;
    }

    function renderAvailmentPageStepper(currentPage) {
        return '';
    }

    function renderAvailmentPageControls(currentPage) {
        if (currentPage === 1) {
            return `
                <div class="availment-page-controls">
                    <button type="button" class="btn-primary" data-availment-page="2">Next page</button>
                </div>
            `;
        }

        return `
            <div class="availment-page-controls">
                <button type="button" class="btn-outline" data-availment-page="1">Back to page 1</button>
            </div>
        `;
    }

    function renderBusinessPlanMobile(payload) {
        const data = payload || {};
        const approval = data.staffReview?.approval || {};
        const applicantName = deriveApplicantName(data);
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
            <div class="paper-document paper-document--business-plan">
                ${renderBusinessPlanPaperPage(1, `
                    <header class="bp-title-page">
                        <h2>BUSINESS PLAN</h2>
                        <div class="bp-title-subhead">EXECUTIVE SUMMARY (PAGLALARAWAN NG NEGOSYO)</div>
                    </header>
                    ${renderBusinessPlanPromptBlock('1.', 'Brief Description of the Business/Project', 'Mubo nga Deskripsyon sa Proyekto (Unsa ang kimaiyahan sa proyekto?)', `
                        ${renderBusinessPlanNarrativeField('executiveSummary.briefDescriptionOfBusinessProject', executiveSummary.briefDescriptionOfBusinessProject || '', 8)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.', 'Brief Profile of an Entrepreneur', 'Mubo nga Profile sa Entrepreneur (Unsa ang mga kahanas ug kwalipikasyon sa negosyante?)', `
                        ${renderBusinessPlanNarrativeField('executiveSummary.briefProfileOfEntrepreneur', executiveSummary.briefProfileOfEntrepreneur || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('3.', "Project's Contributions to the Economy", 'Mga Kontribusyon sa Proyekto sa Ekonomiya (Unsa ang mga kontribusyon sa proyekto sa lokal ug nasudnong ekonomiya?)', `
                        ${renderBusinessPlanNarrativeField('executiveSummary.projectContributionsToEconomy', executiveSummary.projectContributionsToEconomy || '', 7)}
                    `)}
                    <div class="bp-section-heading">Section 1: MARKETING PLAN</div>
                    ${renderBusinessPlanPromptBlock('1.1', 'Description of the Product', 'Deskripsyon sa Produkto (Unsa ang produkto?)', `
                        ${renderBusinessPlanNarrativeField('marketingPlan.descriptionOfProduct', marketingPlan.descriptionOfProduct || '', 7)}
                    `)}
                `)}
                ${renderBusinessPlanPaperPage(2, `
                    ${renderBusinessPlanPromptBlock('1.2', 'Comparison of the Product with Its Competitors', 'Pagtandi sa Produkto sa mga Kakompetensya Niini (Giunsa kini itandi sa kalidad ug presyo sa mga kakompetensya niini?)', `
                        ${renderBusinessPlanNarrativeField('marketingPlan.comparisonWithCompetitors', marketingPlan.comparisonWithCompetitors || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.3', 'Location', 'Lokasyon (Asa mahimutang ang negosyo?)', `
                        ${renderBusinessPlanNarrativeField('marketingPlan.location', marketingPlan.location || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.4', 'Market Area', 'Lugar sa Merkado (Unsang mga geograpikanhong lugar ang masakop sa proyekto?)', `
                        ${renderBusinessPlanNarrativeField('marketingPlan.marketArea', marketingPlan.marketArea || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.5', 'Main Customers', 'Panguna nga mga Kustomer (Sulod sa lugar sa merkado, kang kinsa ibaligya sa negosyo ang mga produkto niini?)', `
                        ${renderBusinessPlanNarrativeField('marketingPlan.mainCustomers', marketingPlan.mainCustomers || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.6', 'Total Demand', 'Kinatibuk-ang Demand (Posible ba nga mabanabana kung unsa kadaghan ang produkto karon gibaligya?)', `
                        ${renderBusinessPlanNarrativeField('marketingPlan.totalDemand', marketingPlan.totalDemand || '', 5)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.7', 'Selling Price', 'Presyo sa Pagbaligya (Unsa ang presyo sa pagbaligya sa produkto?)', `
                        ${renderBusinessPlanNarrativeField('marketingPlan.sellingPrice', marketingPlan.sellingPrice || '', 4)}
                    `)}
                `)}
                ${renderBusinessPlanPaperPage(3, `
                    ${renderBusinessPlanPromptBlock('1.8', 'Promotional Measures', 'Mga Lakang sa Promosyon (Unsang mga lakang sa promosyon ang gamiton sa pagbaligya sa produkto?)', `
                        ${renderBusinessPlanNarrativeField('marketingPlan.promotionalMeasures', marketingPlan.promotionalMeasures || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.9', 'Marketing Strategy', 'Diskarte sa Marketing (Unsa nga estratehiya sa pagpamaligya ang gikinahanglan aron masiguro nga ang mga panagna sa pagbaligya nakab-ot?)', `
                        ${renderBusinessPlanNarrativeField('marketingPlan.marketingStrategy', marketingPlan.marketingStrategy || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('1.10', 'Marketing Budget', 'Badyet sa Marketing (Unsa kadaghan ang imong kinahanglan aron ma-promote ug maapod-apod ang imong produkto?)', `
                        ${renderBusinessPlanNarrativeField('marketingPlan.marketingBudget', marketingPlan.marketingBudget || '', 4)}
                    `)}
                    <div class="bp-section-heading">Section 2: PRODUCTION PLAN</div>
                    ${renderBusinessPlanPromptBlock('2.1', 'Production/Service Process', 'Proseso sa Produksyon/Serbisyo (Unsa ang proseso sa produksyon o serbisyo?)', `
                        ${renderBusinessPlanNarrativeField('productionPlan.productionServiceProcess', productionPlan.productionServiceProcess || '', 7)}
                    `)}
                `)}
                ${renderBusinessPlanPaperPage(4, `
                    ${renderBusinessPlanPromptBlock('2.2', 'Fixed Capital', 'Unsa nga mga bilding ug makinarya (fixed assets) ang gikinahanglan ug unsa ang ilang gasto?', `
                        ${renderBusinessPlanNarrativeField('productionPlan.fixedCapital', productionPlan.fixedCapital || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.3', 'Life of Fixed Capital', 'Kinabuhi sa Fixed Capital (Unsa ang mapuslanon nga kinabuhi sa bilding ug makinarya?)', `
                        ${renderBusinessPlanNarrativeField('productionPlan.lifeOfFixedCapital', productionPlan.lifeOfFixedCapital || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.4', 'Sources of Equipment', 'Mga Tinubdan sa Kagamitan (Kanus-a ug asa makuha ang makinarya?)', `
                        ${renderBusinessPlanNarrativeField('productionPlan.sourcesOfEquipment', productionPlan.sourcesOfEquipment || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.5', 'Planned Capacity', 'Giplano nga Kapasidad (Pila ka kapasidad ang gamiton)?', `
                        ${renderBusinessPlanNarrativeField('productionPlan.plannedCapacity', productionPlan.plannedCapacity || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.6', 'Future Capacity', 'Umaabot nga Kapasidad (Unsa ang mga plano sa paggamit sa ekstrang kapasidad?)', `
                        ${renderBusinessPlanNarrativeField('productionPlan.futureCapacity', productionPlan.futureCapacity || '', 6)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.7', 'Raw Materials', 'Pila ka Raw materials ang gikinahanglan?', `
                        ${renderBusinessPlanNarrativeField('productionPlan.rawMaterials', productionPlan.rawMaterials || '', 5)}
                    `)}
                `)}
                ${renderBusinessPlanPaperPage(5, `
                    ${renderBusinessPlanPromptBlock('2.8', 'Cost of Raw Materials', 'Gasto sa Raw Materials (Pila ang gasto sa raw nga materyales?)', `
                        ${renderBusinessPlanNarrativeField('productionPlan.costOfRawMaterials', productionPlan.costOfRawMaterials || '', 4)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.9', 'Raw Materials Availability', 'Anaa sa Raw Materials (Unsa ang mga tinubdan sa Raw Materials? Anaa ba sila tibuok tuig?)', `
                        ${renderBusinessPlanNarrativeField('productionPlan.rawMaterialsAvailability', productionPlan.rawMaterialsAvailability || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.10', 'Labor', 'Pagtrabaho (Pila ka direkta ug dili direkta nga trabaho ang gikinahanglan ug unsa nga mga kahanas kinahanglang ba nila?)', `
                        ${renderBusinessPlanNarrativeField('productionPlan.labor', productionPlan.labor || '', 7)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.11', 'Cost of Labor', 'Gasto sa Pagtrabaho (Unsa ang gasto sa pagtrabaho?)', `
                        ${renderBusinessPlanNarrativeField('productionPlan.costOfLabor', productionPlan.costOfLabor || '', 4)}
                    `)}
                    ${renderBusinessPlanPromptBlock('2.12', 'Labor Availability', 'Anaa sa Trabaho (Anaa ba ang mga trabahante sa tibuok tuig? Kung dili, unsa ang epekto niini naa sa production?)', `
                        ${renderBusinessPlanNarrativeField('productionPlan.laborAvailability', productionPlan.laborAvailability || '', 6)}
                    `)}
                    <div class="bp-section-heading">Section 3: ORGANIZATION AND MANAGEMENT PLAN</div>
                    ${renderBusinessPlanPromptBlock('3.1', 'Pre Operating Activities', 'Pre-Operating nga mga Kalihokan (Unsang mga pre-operating nga mga kalihokan ang kinahanglang buhaton sa dili pa makalihok ang negosyo?)', `
                        ${renderBusinessPlanNarrativeField('organizationAndManagementPlan.preOperatingActivities', managementPlan.preOperatingActivities || '', 6)}
                    `)}
                `)}
                ${renderBusinessPlanPaperPage(6, `
                    ${renderBusinessPlanPromptBlock('3.2', 'Pre Operating Expenses', 'Pre-Operating nga mga Gasto (Unsa nga mga galastuhan sa wala pa ang operasyon ang mahitabo?)', `
                        ${renderBusinessPlanNarrativeField('organizationAndManagementPlan.preOperatingExpenses', managementPlan.preOperatingExpenses || '', 5)}
                    `)}
                    <div class="bp-section-heading">Section 4: FINANCIAL PLAN</div>
                    ${renderBusinessPlanPromptBlock('4.1', 'Project Cost', 'Gasto sa Proyekto (Unsa ang kinatibuk-ang kinahanglanon sa kapital?)', `
                        ${renderBusinessPlanNarrativeField('financialPlan.projectCost', financialPlan.projectCost || '', 5)}
                    `)}
                    <section class="bp-signoff bp-signoff--source">
                        <div class="bp-signoff-row">
                            <div class="bp-signoff-label">Prepared by:</div>
                            <div class="bp-signoff-body bp-signoff-body--source">
                                ${renderSignaturePadField('applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null, {
                                    label: 'Applicant signature upload',
                                    variant: 'inline',
                                    previewLabel: 'Click-to-sign',
                                    forceApplicant: true,
                                })}
                                ${renderBusinessPlanLineOnlyField('applicantSignature.signedName', data.applicantSignature?.signedName || applicantName, 'bp-sign-line bp-sign-line--source')}
                                <div class="bp-sign-caption">(Name sa Benes)</div>
                            </div>
                        </div>
                        ${state.reviewerMode ? `
                            <div class="bp-signoff-row bp-signoff-row--staff">
                                <div class="bp-signoff-label">Reviewed by:</div>
                                <div class="bp-signoff-body bp-signoff-body--source">
                                    ${renderSignaturePadField('approval.signatureUpload', approval.signatureUpload || null, {
                                        label: 'Reviewed by signature',
                                        variant: 'inline',
                                        previewLabel: 'Click-to-sign',
                                    })}
                                    ${renderBusinessPlanLineOnlyField('staffReview.approval.approverName', approval.approverName || '', 'bp-sign-line bp-sign-line--source')}
                                    <div class="bp-sign-caption">(Kamo)</div>
                                </div>
                            </div>
                            <div class="bp-signoff-row bp-signoff-row--staff">
                                <div class="bp-signoff-label">Noted by:</div>
                                <div class="bp-signoff-body bp-signoff-body--noted bp-signoff-body--source">
                                    <div class="bp-noted-fixed">GOLDA V. POCON, RSW, MSSW, CESE<br>CGHD-II/CSWDO</div>
                                </div>
                            </div>
                        ` : ''}
                    </section>
                `)}
            </div>
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderValidationMobile(payload) {
        const data = payload || {};
        const checklist = data.membershipChecklist || {};
        const recommendation = data.staffReview?.validatorRecommendation || '';
        const eligibility = data.staffReview?.eligibilityAssessment || {};
        const identity = data.staffReview?.validatorIdentity || {};
        const applicantDetails = data.applicantDetails || {};
        const applicantName = deriveApplicantName(data);
        const eligibilityResidentName = eligibility.residentName || data.participantSignature?.signedName || applicantName || '';
        const eligibilityAge = eligibility.age || applicantDetails.age || '';
        const eligibilityBarangay = eligibility.barangay || applicantDetails.barangay || '';
        const recommendationOwnership = buildFieldOwnershipAttributes('staffReview.validatorRecommendation', false);

        return `
            <div class="paper-document paper-document--validation">
                <section class="paper-sheet paper-sheet--govform paper-sheet--validation paper-sheet--govpage">
                    ${renderValidationPaperHeader()}
                    <section class="paper-page-section">
                        <div class="paper-line-grid paper-line-grid--govform paper-line-grid--validation-date">
                            ${renderMungkahingLineField('Date of Validation', 'applicantDetails.validationDate', applicantDetails.validationDate || '', 'date')}
                        </div>
                        <div class="paper-validation-lines">
                            <div class="paper-validation-name-row">
                                <span class="paper-validation-label">Name:</span>
                                ${renderMungkahingLineField('Last Name', 'applicantDetails.lastName', applicantDetails.lastName || '', 'text')}
                                ${renderMungkahingLineField('First Name', 'applicantDetails.firstName', applicantDetails.firstName || '', 'text')}
                                ${renderMungkahingLineField('Middle Name', 'applicantDetails.middleName', applicantDetails.middleName || '', 'text')}
                            </div>
                            <div class="paper-validation-meta-row">
                                ${renderMungkahingLineField('Address : Purok', 'applicantDetails.purok', applicantDetails.purok || '', 'text')}
                                ${renderMungkahingLineField('Barangay', 'applicantDetails.barangay', applicantDetails.barangay || '', 'text')}
                            </div>
                            <div class="paper-validation-meta-row">
                                ${renderMungkahingLineField('Birthday', 'applicantDetails.birthdate', applicantDetails.birthdate || '', 'date')}
                                ${renderMungkahingLineField('Educational Attainment', 'applicantDetails.educationalAttainment', applicantDetails.educationalAttainment || '', 'text')}
                            </div>
                            <div class="paper-validation-contact-row">
                                ${renderMungkahingLineField('Contact number', 'applicantDetails.contactNumber', applicantDetails.contactNumber || '', 'text')}
                            </div>
                        </div>
                    </section>
                    <section class="paper-page-section">
                        ${renderValidationChecklistTable(checklist, { paperMode: true })}
                    </section>
                    <section class="paper-page-section">
                        <div class="paper-validation-inline-label">Validator's Recommendation:</div>
                        <div class="paper-validation-recommendation">
                            <textarea class="paper-validation-lines-input ${recommendationOwnership.owner === FIELD_OWNER_STAFF ? 'is-staff-locked' : ''}" name="staffReview.validatorRecommendation" ${recommendationOwnership.attrs} rows="3" ${recommendationOwnership.disabled ? 'disabled' : ''}>${escapeHtml(recommendation || '')}</textarea>
                            ${recommendationOwnership.note}
                        </div>
                    </section>
                    <section class="paper-page-section paper-page-section--validation-closing">
                        <div class="paper-gov-certification paper-gov-certification--validation">
                            Ako si
                            ${renderPaperValueLine(eligibilityResidentName, { long: true })}
                            ,
                            ${renderPaperValueLine(eligibilityAge, { short: true })}
                            anyos, lumulupyo sa Barangay
                            ${renderPaperValueLine(eligibilityBarangay, { long: true })}
                            , Butuan City, Agusan Del Norte. Ako nakasabot sa tumong ug proseso niining Livelihood Assistance kung diin ako
                            ${renderPaperInlineChoiceField('staffReview.eligibilityAssessment.eligibilityDecision', eligibility.eligibilityDecision || '', ['ANGAYAN', 'DILI ANGAYAN'])}
                            mamahimong benepisyo sa among program nga gidumala sa SMART LEAP ng City Social Welfare and Development Department (CSWDD).
                        </div>
                        <div class="paper-validation-signatures ${state.reviewerMode ? 'paper-validation-signatures--review' : 'paper-validation-signatures--applicant'}">
                            <div class="paper-validation-signature">
                                ${renderApplicantSignatureStamp(applicantName, 'participantSignature.signatureUpload', data.participantSignature?.signatureUpload || null)}
                                <div class="paper-validation-signature__label">Ngalan/Perma sa Partisepante</div>
                            </div>
                            ${state.reviewerMode ? renderValidationValidatorSignature(identity) : ''}
                        </div>
                    </section>
                    ${renderGovernmentPaperFooterImage(1, 1)}
                </section>
            </div>
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderBuhatSaPagpanumpaMobile(payload) {
        const data = payload || {};
        const beneficiary = data.beneficiary || {};
        const project = data.project || {};
        const coMaker = data.coMaker || {};
        const agreement = data.agreement || {};
        const applicantSignature = data.applicantSignature || {};
        const coMakerSignature = data.coMakerSignature || {};

        return `
            <div class="paper-document paper-document--buhat">
                <section class="paper-sheet paper-sheet--buhat">
                    <header class="buhat-paper__header">
                        ${renderGovernmentPaperTopStrip()}
                        <div class="buhat-paper__title">BUHAT SA PAGPANUMPA</div>
                    </header>
                    <div class="buhat-paper__body">
                        <p class="buhat-paper__paragraph">
                            Ako si
                            ${renderBuhatPaperInlineField('beneficiary.fullName', beneficiary.fullName || '', 'xl')}
                            <span class="buhat-paper__literal">naa sa saktong edad, Pilipino, ug nagpuyo sa</span>
                            ${renderBuhatPaperInlineField('beneficiary.addressLine', beneficiary.addressLine || '', 'lg')}
                            <span class="buhat-paper__literal">,</span>
                            ${renderBuhatPaperInlineField('beneficiary.barangay', beneficiary.barangay || '', 'md')}
                            <span class="buhat-paper__literal">,</span>
                            ${renderBuhatPaperInlineField('beneficiary.city', beneficiary.city || '', 'md')}
                            <span class="buhat-paper__literal">pagkahuman ug panumpa sumala sa balaod, misaysay sa pagtuman niining mga sumusunod:</span>
                        </p>

                        <ol class="buhat-paper__clauses">
                            <li>
                                Ako usa ka benepisyaryo sa
                                ${renderBuhatPaperInlineField('project.programName', project.programName || '', 'lg')}
                                Program;
                            </li>
                            <li>
                                Tungod sa
                                ${renderBuhatPaperInlineField('project.projectName', project.projectName || '', 'lg')}
                                Program, ako makadawat ug kantidad nga
                                ${renderBuhatPaperInlineField('project.amountInWords', project.amountInWords || '', 'lg')}
                                <span class="buhat-paper__literal">(Php</span>
                                ${renderBuhatPaperInlineField('project.amountNumeric', project.amountNumeric || project.amountReceived || '', 'md')}
                                <span class="buhat-paper__literal">)</span>
                                ug ako kining gamiton sa saktong katuyuan base sa mga dokumento nga akong gisumitar didto sa ahensya;
                            </li>
                            <li>Nga ako andam mo sumite o mohatag sa CSWDD sa mga resibo (Official Receipt or Acknowledgement Receipt) sa akong tanan napalit nga gamit o kahimanan, produkto usa ka semana human nako madawat ang Livelihood Assistance.</li>
                            <li>Nga ang mga resibo sa akong mga pinalit nga akong isumiti o ihatag sa CSWDD kinahanglan hinlo og walay pinapaan.</li>
                            <li>Nga ako usab nag saad nga moatubang kanunay sa LTWG, Monitoring Team sa CSWDD og uban pang mga grupo sa gobyerno sa panahon nga sila mag pahigayon og monitoring o mangumusta kanako kabahin sa akong Negosyo.</li>
                            <li>Nga ako nag saad sa angay o hustong pagdumala sa akong panginabuhian nga gihatag kanako sa CSWDD.</li>
                            <li>
                                Nga kung kini nga kasabutan og dili nako matuman tungod sa mga musunod na buhat sama sa;
                                <ul class="buhat-paper__subclauses">
                                    <li>Pagsugal, pag-inom ug uban pang bisyo</li>
                                    <li>Pag-invest sa pyramiding scheme</li>
                                    <li>Pagpalit ug gadgets nga dili kinahanglanon sa negosyo,</li>
                                    <li>Pagpa-utang</li>
                                    <li>Uban pang mga butang nga wala nakalatid ug nakabutang sa akong mungkahing proyekto.</li>
                                </ul>
                            </li>
                            <li>
                                Sa kantidad nga nadawat ni
                                ${renderBuhatPaperInlineField('beneficiary.fullName', beneficiary.fullName || '', 'lg')}
                                ako si
                                ${renderBuhatPaperInlineField('coMaker.fullName', coMaker.fullName || '', 'lg')}
                                <span class="buhat-paper__literal">naa sa saktong edad, Pilipino, ug nagpuyo sa</span>
                                ${renderBuhatPaperInlineField('coMaker.addressLine', coMaker.addressLine || '', 'md')}
                                <span class="buhat-paper__literal">,</span>
                                ${renderBuhatPaperInlineField('coMaker.barangay', coMaker.barangay || '', 'sm')}
                                <span class="buhat-paper__literal">,</span>
                                ${renderBuhatPaperInlineField('coMaker.city', coMaker.city || '', 'sm')}
                                <span class="buhat-paper__literal">nagsaad na mahimong responsable JOINTLY AND SEVERALLY sa pag-uli o pagbayad sa kantidad nga nadawat sulod sa bente kwatro (24) ka bulan kung si</span>
                                ${renderBuhatPaperInlineField('beneficiary.fullName', beneficiary.fullName || '', 'md')}
                                <span class="buhat-paper__literal">dili makatuman sa iyang gi komitar sa ahensiya or mobuhat ug mga buluhaton nga lista sa taas.</span>
                            </li>
                        </ol>

                        <p class="buhat-paper__paragraph">
                            Ako andam modawat og mosunod sa mga lakang nga ipahigayon ug ihatag kanako sa maong ahensya sama sa mosunod nga;
                        </p>
                        <ol class="buhat-paper__clauses buhat-paper__clauses--lettered" type="a">
                            <li>Counselling</li>
                            <li>Pag uli sa ayudang nadawat nga nagkantidad ug Fifteen Thousand Pesos (P15,000.00) sulod sa bente kwatro (24) ka bulan pinaagi sa monthly nga pagbayad nagkantidad ug Six Hundred Twenty-five Pesos (P625.00)</li>
                            <li>Ang dili pagtuman sa sumusunod nga lakang mamahimong hinungdan sa pagka blacklist sa mosunod nga susamang ayuda.</li>
                        </ol>

                        <p class="buhat-paper__paragraph">
                            Isip sa pagmatuod sa akong pag-uyon og kumpletong pagsabot niining maong kasabutan, ako kining paga pirmahan ibabaw sa akong pangalan karung adlawa
                            ${renderBuhatPaperInlineField('agreement.dateSigned', agreement.dateSigned || '', 'md')}
                            ,
                            ${renderBuhatPaperInlineField('agreement.yearSigned', agreement.yearSigned || '', 'xs')}
                            <span class="buhat-paper__literal">.</span>
                        </p>

                        <section class="buhat-paper__signatures">
                            <div class="buhat-paper__signature-col">
                                <div class="buhat-paper__signature-head">Prepared by:</div>
                                ${renderBuhatPaperSignatureBlock(
                                    'applicantSignature.signedName',
                                    applicantSignature.signedName || '',
                                    'applicantSignature.signatureUpload',
                                    applicantSignature.signatureUpload || null,
                                    'Name and Signature of Beneficiary'
                                )}
                            </div>
                            <div class="buhat-paper__signature-col">
                                <div class="buhat-paper__signature-head">Co-maker:</div>
                                ${renderBuhatPaperSignatureBlock(
                                    'coMakerSignature.signedName',
                                    coMakerSignature.signedName || '',
                                    'coMakerSignature.signatureUpload',
                                    coMakerSignature.signatureUpload || null,
                                    'Name and Signature of Co-maker'
                                )}
                            </div>
                        </section>
                    </div>
                    ${renderGovernmentPaperFooterImage(1, 1)}
                </section>
            </div>
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderBeforeYouStart(items) {
        return `
            <section class="guided-form-start" id="section-before-you-start">
                <div class="guided-form-start__header">
                    <h3>Before you start</h3>
                    <p>Prepare these details first so the form is easier to complete on mobile.</p>
                </div>
                <ul class="guided-form-start__list">
                    ${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                </ul>
            </section>
        `;
    }

    function renderRepeatableMiniCard(title, fieldsHtml, action, index) {
        const actionButton = action
            ? `<button type="button" class="btn-outline small post-approval-row-action" data-row-action="${escapeAttribute(action)}" data-row-index="${index}">Remove entry</button>`
            : '';
        return `
            <article class="guided-repeatable-card">
                <div class="guided-repeatable-card__header">
                    <strong>${escapeHtml(title)}</strong>
                    ${actionButton}
                </div>
                <div class="post-approval-fields">${fieldsHtml}</div>
            </article>
        `;
    }

    function renderHealthRequirementRow(row, index) {
        return renderRepeatableMiniCard(
            `Health requirement ${index + 1}`,
            `
                ${renderField('Health and Age Requirement', `staffReview.physicalRequirements.healthAgeRows.${index}.requirement`, row.requirement || '', 'text')}
                ${renderField('Age', `staffReview.physicalRequirements.healthAgeRows.${index}.age`, row.age || '', 'number')}
                ${renderField('Health Status', `staffReview.physicalRequirements.healthAgeRows.${index}.healthStatus`, row.healthStatus || '', 'text')}
            `,
            'remove-health',
            index
        );
    }

    function renderApplicantReviewerNote(remarks) {
        if (!remarks) {
            return '';
        }

        return `
            <section class="guided-review-note">
                <span class="overview-label">Review note</span>
                <p>${escapeHtml(remarks)}</p>
            </section>
        `;
    }

    function handleGuidedSectionToggle(event) {
        const target = event.target;
        if (!(target instanceof HTMLDetailsElement) || !target.id) {
            return;
        }

        state.guidedSectionOpen[target.id] = target.open;
    }

    function captureGuidedSectionState() {
        const container = document.getElementById('postApprovalFormSections');
        if (!container) {
            return;
        }

        container.querySelectorAll('details.guided-form-section--accordion[id]').forEach((section) => {
            if (section instanceof HTMLDetailsElement && section.id) {
                state.guidedSectionOpen[section.id] = section.open;
            }
        });
    }

    function resolveAvailmentHealthRows(physicalRequirements, data) {
        const rows = Array.isArray(physicalRequirements?.healthAgeRows) ? physicalRequirements.healthAgeRows : [];
        const isLegacySeedRow = (row) => {
            if (!row || typeof row !== 'object') {
                return false;
            }

            const requirement = String(row.requirement || '').trim();
            const age = String(row.age || '').trim();
            const healthStatus = String(row.healthStatus || '').trim();

            return requirement === 'Health Certificate / Medical Check-up'
                && healthStatus === 'See submitted health certificate'
                && age === String(data?.clientIdentifyingData?.age || '').trim();
        };

        const normalizedRows = rows.filter((row) => !isLegacySeedRow(row));
        const hasMeaningfulRow = rows.some((row) => {
            if (!row || typeof row !== 'object') {
                return false;
            }

            return String(row.requirement || '').trim() !== ''
                || String(row.age || '').trim() !== ''
                || String(row.healthStatus || '').trim() !== '';
        });

        if (hasMeaningfulRow) {
            return normalizedRows.length > 0 ? normalizedRows : [{
                requirement: '',
                age: '',
                healthStatus: '',
            }];
        }

        return [{
            requirement: '',
            age: '',
            healthStatus: '',
        }];
    }

    function resolveAvailmentApplicantName(data, explicitValue = '') {
        return String(
            explicitValue
            || data?.clientIdentifyingData?.name
            || data?.applicantSignature?.signedName
            || deriveApplicantName(data)
            || ''
        ).trim();
    }

    function shouldUseApplicantMobileGuidedForm() {
        return !state.reviewerMode && state.renderMode === 'mobile';
    }

    function renderApplicantMobileTaskSections(code, payload) {
        switch (code) {
            case 'availment_form':
                return renderApplicantAvailmentGuided(payload);
            case 'validation_form':
                return renderApplicantValidationGuided(payload);
            case 'mungkahing_proyekto':
                return renderApplicantMungkahingGuided(payload);
            case 'business_plan':
                return renderApplicantBusinessPlanGuided(payload);
            case 'buhat_sa_pagpanumpa':
                return renderApplicantBuhatGuided(payload);
            default:
                return '';
        }
    }

    function renderApplicantAvailmentGuided(payload) {
        const data = payload || {};
        const applicantName = resolveAvailmentApplicantName(data, data.pageOneCertification?.eligibilityStatementName || '');
        const familyMembers = ensureRows(data.familyEnterprise?.members, { name: '', age: '', activities: '' }, getHardCopyRowLimit('add-family'));
        const incomeRows = ensureRows(data.incomeEligibility?.rows, { memberName: '', cashIncome: '', nonCashIncome: '', totalIncome: '' }, getHardCopyRowLimit('add-income'));

        return `
            ${renderBeforeYouStart(['Prepare your personal details.', 'List the family members joining the project and your income details.', 'Prepare your e-signature before submitting.'])}
            ${renderGuidedSection('section-client-data', 'I. Client Identifying Data', 'Fill out the same applicant fields shown on the desktop paper version.', `
                <div class="post-approval-fields">
                    ${renderField('Client name', 'clientIdentifyingData.name', data.clientIdentifyingData?.name || applicantName, 'text')}
                    ${renderField('Age', 'clientIdentifyingData.age', data.clientIdentifyingData?.age || '', 'number')}
                    ${renderField('Address', 'clientIdentifyingData.address', data.clientIdentifyingData?.address || '', 'text', true)}
                    ${renderField('Name of spouse', 'clientIdentifyingData.spouseName', data.clientIdentifyingData?.spouseName || '', 'text', true)}
                </div>
            `, { collapsible: true })}
            ${renderGuidedSection('section-family-enterprise', 'II. A. Family Enterprise', 'Add the participating family members exactly like the paper table.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Family rows</span>${renderAddRowButton('add-family', 'Add family row', familyMembers)}</div>
                <div class="guided-repeatable-stack">
                    ${familyMembers.map((row, index) => renderRepeatableMiniCard(`Family member ${index + 1}`, `
                        ${renderField('Family member name', `familyEnterprise.members.${index}.name`, row.name || '', 'text')}
                        ${renderField('Age', `familyEnterprise.members.${index}.age`, row.age || '', 'number')}
                        ${renderField('Activities', `familyEnterprise.members.${index}.activities`, row.activities || '', 'text', true)}
                    `, 'remove-family', index)).join('')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-individual-assistance', 'II. B. Individual Assistance', 'Enter the same narrative answers required in the paper form.', `
                <div class="post-approval-fields">
                    ${renderField('Clientele category', 'individualAssistance.clienteleCategory', data.individualAssistance?.clienteleCategory || '', 'text')}
                    ${renderTextarea('Nature of difficult circumstances', 'individualAssistance.natureOfDifficultCircumstances', data.individualAssistance?.natureOfDifficultCircumstances || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-income', 'III. Income Eligibility Requirement', 'Fill in the same income table rows from the paper form.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Income rows</span>${renderAddRowButton('add-income', 'Add income row', incomeRows)}</div>
                <div class="guided-repeatable-stack">
                    ${incomeRows.map((row, index) => renderRepeatableMiniCard(`Income row ${index + 1}`, `
                        ${renderField('Working family member', `incomeEligibility.rows.${index}.memberName`, row.memberName || '', 'text')}
                        ${renderField('Cash income', `incomeEligibility.rows.${index}.cashIncome`, row.cashIncome || '', 'number')}
                        ${renderField('Non-cash income', `incomeEligibility.rows.${index}.nonCashIncome`, row.nonCashIncome || '', 'number')}
                        ${renderField('Total income', `incomeEligibility.rows.${index}.totalIncome`, row.totalIncome || '', 'number')}
                    `, 'remove-income', index)).join('')}
                </div>
                <div class="post-approval-fields">
                    ${renderField('Total family income', 'incomeEligibility.totalFamilyIncome', data.incomeEligibility?.totalFamilyIncome || '', 'number')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-physical-requirements', 'IV. Physical Requirements', 'These applicant name lines stay automatic on mobile, while staff signoff is completed during review.', `
                <section class="guided-review-note">
                    <p>I certify that <strong>${escapeHtml(resolveAvailmentApplicantName(data, data.physicalRequirements?.foodRelatedCertification?.applicantName || applicantName) || '--')}</strong> has undergone medical check-up and is physically fit to run a food related project.</p>
                    <p>CSWDD staff will complete the certifying officer signoff during review.</p>
                </section>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-psycho-social', 'V. Psycho-Social Requirements', 'Applicant name lines stay automatic here too. Staff-only certifications are handled later by PDO/Admin.', `
                <section class="guided-review-note">
                    <p>I certify that <strong>${escapeHtml(resolveAvailmentApplicantName(data, data.psychoSocialRequirements?.residencyAndCharacter?.residentName || applicantName) || '--')}</strong> is a bona fide resident of the barangay and is of good moral character.</p>
                    <p>I certify that through personal interview, home visit and collateral interview I have verified that <strong>${escapeHtml(resolveAvailmentApplicantName(data, data.psychoSocialRequirements?.familyRelationshipsWorkHabitsAspiration?.applicantName || applicantName) || '--')}</strong> manifests positive relationships and good work habits.</p>
                </section>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-client-commitment', 'Client Commitment', 'Read the statement below before you sign.', `
                <section class="guided-review-note">
                    <p>I will abide by all SMART LEAP policies and guidelines and I promise to pay the roll-back on time and generate weekly savings for emergencies that may affect my family.</p>
                </section>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-signature', 'Applicant Signature', 'This is the applicant-only signature block for the availment form.', `
                <div class="post-approval-fields">
                    ${renderField('Signer name', 'applicantSignature.signedName', data.applicantSignature?.signedName || applicantName, 'text')}
                    ${renderField('Date signed', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || currentDateInputValue(), 'date')}
                    ${renderUploadField('Participant signature upload', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                </div>
            `, { collapsible: true, open: true })}
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderApplicantValidationGuided(payload) {
        const data = payload || {};
        const applicantDetails = data.applicantDetails || {};
        const checklist = data.membershipChecklist || {};
        const applicantName = deriveApplicantName(data);
        const residentName = applicantDetails.firstName || applicantDetails.lastName || applicantName
            ? [applicantDetails.firstName, applicantDetails.middleName, applicantDetails.lastName].filter(Boolean).join(' ').trim() || applicantName
            : applicantName;

        return `
            ${renderBeforeYouStart(['Prepare your personal details.', 'Answer the Pantawid and SLPA checklist.', 'Prepare the participant e-signature for submission.'])}
            ${renderGuidedSection('section-applicant-info', 'Applicant Details', 'Fill out the same applicant information shown on the paper form.', `
                <div class="post-approval-fields">
                    ${renderField('Date of validation', 'applicantDetails.validationDate', applicantDetails.validationDate || currentDateInputValue(), 'date')}
                    ${renderField('Last name', 'applicantDetails.lastName', applicantDetails.lastName || '', 'text')}
                    ${renderField('First name', 'applicantDetails.firstName', applicantDetails.firstName || '', 'text')}
                    ${renderField('Middle name', 'applicantDetails.middleName', applicantDetails.middleName || '', 'text')}
                    ${renderField('Address / Purok', 'applicantDetails.purok', applicantDetails.purok || '', 'text', true)}
                    ${renderField('Barangay', 'applicantDetails.barangay', applicantDetails.barangay || '', 'text')}
                    ${renderField('Birthday', 'applicantDetails.birthdate', applicantDetails.birthdate || '', 'date')}
                    ${renderField('Educational attainment', 'applicantDetails.educationalAttainment', applicantDetails.educationalAttainment || '', 'text')}
                    ${renderField('Contact number', 'applicantDetails.contactNumber', applicantDetails.contactNumber || '', 'text')}
                </div>
            `, { collapsible: true })}
            ${renderGuidedSection('section-checklist', 'Checklist', 'Answer the membership checklist using the same fields as the paper copy.', `
                <div class="post-approval-fields">
                    ${renderSelectField('Pantawid Member', 'membershipChecklist.pantawidMember', checklist.pantawidMember || '', ['', 'Yes', 'No'])}
                    ${renderField('Pantawid Specify', 'membershipChecklist.pantawidSpecify', checklist.pantawidSpecify || '', 'text')}
                    ${renderSelectField('SLPA Member', 'membershipChecklist.slpaMember', checklist.slpaMember || '', ['', 'Yes', 'No'])}
                    ${renderField('SLPA Specify', 'membershipChecklist.slpaSpecify', checklist.slpaSpecify || '', 'text')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-eligibility-assessment', 'Applicant Declaration Preview', 'Your name is shown automatically here, while PDO/Admin completes the actual validator decision later.', `
                <section class="guided-review-note">
                    <p>Ako si <strong>${escapeHtml(residentName || applicantName || '--')}</strong>, lumulupyo sa Barangay <strong>${escapeHtml(applicantDetails.barangay || '--')}</strong>, Butuan City, Agusan Del Norte.</p>
                    <p>The ANGAYAN / DILI ANGAYAN assessment is staff-only during review.</p>
                </section>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-assessment', 'Validator Recommendation', 'This part is for PDO/Admin review only and will appear after staff checks your form.', `
                <section class="guided-review-note">
                    <p>Validator recommendation is not filled out by the applicant.</p>
                </section>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-validator-signature', 'Validator Signature', 'This signoff is staff-only and will be completed by PDO/Admin.', `
                <section class="guided-review-note">
                    <p>The validator name, date, and signature are not part of the applicant fill-up.</p>
                </section>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-signature', 'Participant Signature', 'This is the applicant-only signature block for the validation form.', `
                <div class="post-approval-fields">
                    ${renderField('Signer name', 'participantSignature.signedName', data.participantSignature?.signedName || applicantName, 'text')}
                    ${renderField('Date signed', 'participantSignature.signedDate', data.participantSignature?.signedDate || currentDateInputValue(), 'date')}
                    ${renderUploadField('Participant signature upload', 'participantSignature.signatureUpload', data.participantSignature?.signatureUpload || null)}
                </div>
            `, { collapsible: true, open: true })}
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderApplicantMungkahingGuided(payload) {
        const data = payload || {};
        const project = data.projectInformation || {};
        const sectoral = data.sectoralClassification || {};
        const pantawid = sectoral.pantawid || {};
        const nonPantawid = sectoral.nonPantawid || {};
        const materialsRows = ensureRows(data.businessOperation?.materials?.rows, { material: '', quality: '', unit: '', unitPrice: '', cyclesPerProduction: '', projectedCost: '' }, getHardCopyRowLimit('add-mp-material'));
        const laborRows = ensureRows(data.businessOperation?.labor?.rows, { workerName: '', position: '', dailyWage: '' }, getHardCopyRowLimit('add-mp-labor'));
        const toolRows = ensureRows(data.businessOperation?.toolsEquipment?.rows, { equipment: '', capacity: '', unit: '', quantityOrPrice: '', projectedAmount: '', usefulLifeDays: '', productionCycle: '', depreciationCost: '' }, getHardCopyRowLimit('add-mp-equipment'));
        const expenseRows = ensureRows(data.businessOperation?.operatingExpenses?.rows, { expenseName: '', paymentFrequency: '', projectedCost: '' }, getHardCopyRowLimit('add-mp-expense'));
        const salesRows = ensureRows(data.businessOperation?.salesProjection?.rows, { product: '', capacity: '', unit: '', sellingPrice: '', projectedSales: '' }, getHardCopyRowLimit('add-mp-sale'));
        const spendingRows = ensureRows(data.spendingPlan?.rows, { expense: '', amount: '', usageSchedule: '' }, getHardCopyRowLimit('add-mp-spending'));
        const modalityRows = ensureRows(data.modalityApplications?.rows, { fundSource: '', contributionType: '', amount: '' }, getHardCopyRowLimit('add-mp-contribution'));
        const sectorFields = [
            ['sexFemale', 'Sex - Babae'],
            ['sexMale', 'Sex - Lalake'],
            ['seniorFemale', 'Senior Citizen - Babae'],
            ['seniorMale', 'Senior Citizen - Lalake'],
            ['pwdFemale', 'PWD - Babae'],
            ['pwdMale', 'PWD - Lalake'],
            ['ipFemale', 'IP - Babae'],
            ['ipMale', 'IP - Lalake'],
            ['soloParentFemale', 'Solo Parent - Babae'],
            ['soloParentMale', 'Solo Parent - Lalake'],
        ];
        const buildSectorGroup = (title, prefix, values) => `
            <div class="form-field full">
                <span>${escapeHtml(title)}</span>
                <div class="post-approval-fields">
                    ${sectorFields.map(([key, label]) => renderChoiceCheckboxField(label, `${prefix}.${key}`, Boolean(values?.[key]))).join('')}
                </div>
            </div>
        `;

        return `
            ${renderBeforeYouStart(['Prepare the project information and cost estimates.', 'Fill the same row data that appears in the desktop paper form.', 'Prepare the participant e-signature before submitting.'])}
            ${renderGuidedSection('section-project-info', 'I. Project Information', 'Fill the same project header fields shown on the paper form.', `
                <div class="post-approval-fields">
                    ${renderField('Ngalan sa Partisipante', 'projectInformation.participantName', project.participantName || deriveApplicantName(data), 'text')}
                    ${renderField('Lokasyon sa Proyekto', 'projectInformation.projectLocation', project.projectLocation || '', 'text', true)}
                    ${renderField('Ulohan sa Proyekto', 'projectInformation.projectTitle', project.projectTitle || '', 'text')}
                    ${renderField('Petsa sa Pagtukod', 'projectInformation.projectDate', project.projectDate || currentDateInputValue(), 'date')}
                    ${renderField('Kinatibuk-ang Kantidad', 'projectInformation.projectedAmount', project.projectedAmount || '', 'text')}
                    ${renderField('Savings Account No.', 'projectInformation.savingsAccountNumber', project.savingsAccountNumber || 'NONE', 'text')}
                    ${renderField('Kantidad gikan sa CSWDO', 'projectInformation.cswddAmount', project.cswddAmount || '', 'text')}
                    ${renderField('Laing kakuhanan sa pondo', 'projectInformation.otherFundingSource', project.otherFundingSource || '', 'text')}
                </div>
            `, { collapsible: true })}
            ${renderGuidedSection('section-rationale', 'II. Rationale of the Proposed Project', 'Write the same rationale content required in the paper copy.', `
                <div class="post-approval-fields">
                    ${buildSectorGroup('Pantawid', 'sectoralClassification.pantawid', pantawid)}
                    ${buildSectorGroup('Non-Pantawid', 'sectoralClassification.nonPantawid', nonPantawid)}
                    ${renderTextarea('Rationale', 'rationale', data.rationale || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-modality', 'III. Modality Application', 'Fill in the same partner contribution rows from the paper form.', `
                <div class="guided-repeatable-stack">
                    ${modalityRows.map((row, index) => renderRepeatableMiniCard(`Partner row ${index + 1}`, `
                        ${renderReadOnlyField('Kakuhanan sa Pondo', row.fundSource || '')}
                        ${renderField('Gi-ambag', `modalityApplications.rows.${index}.contributionType`, row.contributionType || '', 'text')}
                        ${renderField('Kantidad', `modalityApplications.rows.${index}.amount`, row.amount || '', 'text')}
                    `, '', index)).join('')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-materials', 'IV. a.) Materials', 'Add the same materials rows as the paper table.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Material rows</span>${renderAddRowButton('add-mp-material', 'Add material row', materialsRows)}</div>
                <div class="guided-repeatable-stack">${materialsRows.map((row, index) => renderRepeatableMiniCard(`Material row ${index + 1}`, `
                    ${renderField('Material', `businessOperation.materials.rows.${index}.material`, row.material || '', 'text')}
                    ${renderField('Kadaghanon', `businessOperation.materials.rows.${index}.quality`, row.quality || '', 'text')}
                    ${renderField('Unit', `businessOperation.materials.rows.${index}.unit`, row.unit || '', 'text')}
                    ${renderField('Unit price', `businessOperation.materials.rows.${index}.unitPrice`, row.unitPrice || '', 'number')}
                    ${renderField('Siklo sa Produksyon', `businessOperation.materials.rows.${index}.cyclesPerProduction`, row.cyclesPerProduction || '', 'text')}
                    ${renderField('Projected cost', `businessOperation.materials.rows.${index}.projectedCost`, row.projectedCost || '', 'number')}
                `, 'remove-mp-material', index)).join('')}</div>
                <div class="post-approval-fields">${renderField('Kinatibuk-ang Total', 'businessOperation.materials.totalCost', data.businessOperation?.materials?.totalCost || '', 'number')}</div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-labor', 'IV. b.) Labor', 'Add the same labor rows as the paper table.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Labor rows</span>${renderAddRowButton('add-mp-labor', 'Add labor row', laborRows)}</div>
                <div class="guided-repeatable-stack">${laborRows.map((row, index) => renderRepeatableMiniCard(`Labor row ${index + 1}`, `
                    ${renderField('Worker name', `businessOperation.labor.rows.${index}.workerName`, row.workerName || '', 'text')}
                    ${renderField('Position', `businessOperation.labor.rows.${index}.position`, row.position || '', 'text')}
                    ${renderField('Daily wage', `businessOperation.labor.rows.${index}.dailyWage`, row.dailyWage || '', 'number')}
                `, 'remove-mp-labor', index)).join('')}</div>
                <div class="post-approval-fields">
                    ${renderField('Total daily wage', 'businessOperation.labor.totalDailyWage', data.businessOperation?.labor?.totalDailyWage || '', 'number')}
                    ${renderField('Total production cycle wage', 'businessOperation.labor.totalProductionCycleWage', data.businessOperation?.labor?.totalProductionCycleWage || '', 'number')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-tools', 'IV. c.) Tools and Equipment', 'Add the same tools and equipment rows as the paper table.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Tool rows</span>${renderAddRowButton('add-mp-equipment', 'Add tool row', toolRows)}</div>
                <div class="guided-repeatable-stack">${toolRows.map((row, index) => renderRepeatableMiniCard(`Tool row ${index + 1}`, `
                    ${renderField('Kagamitan', `businessOperation.toolsEquipment.rows.${index}.equipment`, row.equipment || '', 'text')}
                    ${renderField('Kadaghanon', `businessOperation.toolsEquipment.rows.${index}.capacity`, row.capacity || '', 'text')}
                    ${renderField('Unit', `businessOperation.toolsEquipment.rows.${index}.unit`, row.unit || '', 'text')}
                    ${renderField('Presyo sa matag usa', `businessOperation.toolsEquipment.rows.${index}.quantityOrPrice`, row.quantityOrPrice || '', 'number')}
                    ${renderField('Projected amount', `businessOperation.toolsEquipment.rows.${index}.projectedAmount`, row.projectedAmount || '', 'number')}
                    ${renderField('Useful life days', `businessOperation.toolsEquipment.rows.${index}.usefulLifeDays`, row.usefulLifeDays || '', 'text')}
                    ${renderField('Production cycle', `businessOperation.toolsEquipment.rows.${index}.productionCycle`, row.productionCycle || '', 'text')}
                    ${renderField('Depreciation cost', `businessOperation.toolsEquipment.rows.${index}.depreciationCost`, row.depreciationCost || '', 'number')}
                `, 'remove-mp-equipment', index)).join('')}</div>
                <div class="post-approval-fields">${renderField('Tools total', 'businessOperation.toolsEquipment.totalCost', data.businessOperation?.toolsEquipment?.totalCost || '', 'number')}</div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-expenses', 'IV. d.) Expenses', 'Fill in the same expense rows required in the paper table.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Expense rows</span>${renderAddRowButton('add-mp-expense', 'Add expense row', expenseRows)}</div>
                <div class="guided-repeatable-stack">${expenseRows.map((row, index) => renderRepeatableMiniCard(`Expense row ${index + 1}`, `
                    ${renderField('Expense name', `businessOperation.operatingExpenses.rows.${index}.expenseName`, row.expenseName || '', 'text')}
                    ${renderField('Payment frequency', `businessOperation.operatingExpenses.rows.${index}.paymentFrequency`, row.paymentFrequency || '', 'text')}
                    ${renderField('Projected cost', `businessOperation.operatingExpenses.rows.${index}.projectedCost`, row.projectedCost || '', 'number')}
                `, 'remove-mp-expense', index)).join('')}</div>
                <div class="post-approval-fields">${renderField('Grand total', 'businessOperation.operatingExpenses.grandTotal', data.businessOperation?.operatingExpenses?.grandTotal || '', 'number')}</div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-sales', 'IV. e.) Sales Projection', 'Fill in the same product sales rows required in the paper table.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Sales rows</span>${renderAddRowButton('add-mp-sale', 'Add sales row', salesRows)}</div>
                <div class="guided-repeatable-stack">${salesRows.map((row, index) => renderRepeatableMiniCard(`Sales row ${index + 1}`, `
                    ${renderField('Product', `businessOperation.salesProjection.rows.${index}.product`, row.product || '', 'text')}
                    ${renderField('Capacity', `businessOperation.salesProjection.rows.${index}.capacity`, row.capacity || '', 'text')}
                    ${renderField('Unit', `businessOperation.salesProjection.rows.${index}.unit`, row.unit || '', 'text')}
                    ${renderField('Selling price', `businessOperation.salesProjection.rows.${index}.sellingPrice`, row.sellingPrice || '', 'number')}
                    ${renderField('Projected sales', `businessOperation.salesProjection.rows.${index}.projectedSales`, row.projectedSales || '', 'number')}
                `, 'remove-mp-sale', index)).join('')}</div>
                <div class="post-approval-fields">${renderField('Gross sales', 'businessOperation.salesProjection.grossSales', data.businessOperation?.salesProjection?.grossSales || '', 'number')}</div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-profit', 'IV. f.) Income Computation', 'Complete the same summary fields shown on the desktop paper version.', `
                <div class="post-approval-fields">
                    ${renderField('Projected income per cycle', 'businessOperation.incomeComputation.projectedIncomePerCycle', data.businessOperation?.incomeComputation?.projectedIncomePerCycle || '', 'number')}
                    ${renderField('Raw materials cost', 'businessOperation.incomeComputation.rawMaterialsCost', data.businessOperation?.incomeComputation?.rawMaterialsCost || '', 'number')}
                    ${renderField('Manpower and labor cost', 'businessOperation.incomeComputation.manpowerLaborCost', data.businessOperation?.incomeComputation?.manpowerLaborCost || '', 'number')}
                    ${renderField('Depreciation cost', 'businessOperation.incomeComputation.depreciationCost', data.businessOperation?.incomeComputation?.depreciationCost || '', 'number')}
                    ${renderField('Other expenses', 'businessOperation.incomeComputation.otherExpenses', data.businessOperation?.incomeComputation?.otherExpenses || '', 'number')}
                    ${renderField('Total operating cost', 'businessOperation.incomeComputation.totalOperatingCost', data.businessOperation?.incomeComputation?.totalOperatingCost || '', 'number')}
                    ${renderField('Gross profit', 'businessOperation.incomeComputation.grossProfit', data.businessOperation?.incomeComputation?.grossProfit || '', 'number')}
                    ${renderField('Net profit', 'businessOperation.incomeComputation.netProfit', data.businessOperation?.incomeComputation?.netProfit || '', 'number')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-capital-fund', 'IV. g.) Spending Plan', 'Fill in the same spending plan rows shown in the paper form.', `
                <div class="post-approval-repeatable__header"><span class="post-approval-repeatable__title">Spending rows</span>${renderAddRowButton('add-mp-spending', 'Add spending row', spendingRows)}</div>
                <div class="guided-repeatable-stack">${spendingRows.map((row, index) => renderRepeatableMiniCard(`Spending row ${index + 1}`, `
                    ${renderField('Expense', `spendingPlan.rows.${index}.expense`, row.expense || '', 'text')}
                    ${renderField('Amount', `spendingPlan.rows.${index}.amount`, row.amount || '', 'number')}
                    ${renderField('Usage schedule', `spendingPlan.rows.${index}.usageSchedule`, row.usageSchedule || '', 'text')}
                `, 'remove-mp-spending', index)).join('')}</div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-signature', 'Participant Signature', 'This is the applicant-only signature block for the proposed project form.', `
                <div class="post-approval-fields">
                    ${renderField('Pirma ibabaw sa pangalan sa Partisipante', 'applicantSignature.signedName', data.applicantSignature?.signedName || deriveApplicantName(data), 'text')}
                    ${renderField('Petsa', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || currentDateInputValue(), 'date')}
                    ${renderUploadField('Pirma sa Partisipante', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                </div>
            `, { collapsible: true, open: true })}
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderApplicantBusinessPlanGuided(payload) {
        const data = payload || {};
        const executiveSummary = data.executiveSummary || {};
        const marketingPlan = data.marketingPlan || {};
        const productionPlan = data.productionPlan || {};
        const managementPlan = data.organizationAndManagementPlan || {};
        const financialPlan = data.financialPlan || {};
        const applicantName = deriveApplicantName(data);

        return `
            ${renderBeforeYouStart(['Prepare your business idea and cost estimates.', 'Answer each business plan prompt in the same order as the desktop paper form.', 'Prepare the applicant e-signature before submitting.'])}
            ${renderGuidedSection('section-overview', 'Executive Summary', 'Fill out the same core business plan prompts shown on the paper version.', `
                <div class="post-approval-fields">
                    ${renderTextarea('1. Brief Description of the Business/Project', 'executiveSummary.briefDescriptionOfBusinessProject', executiveSummary.briefDescriptionOfBusinessProject || '', true)}
                    ${renderTextarea('2. Brief Profile of the Entrepreneur', 'executiveSummary.briefProfileOfEntrepreneur', executiveSummary.briefProfileOfEntrepreneur || '', true)}
                    ${renderTextarea("3. Project's Contributions to the Economy", 'executiveSummary.projectContributionsToEconomy', executiveSummary.projectContributionsToEconomy || '', true)}
                </div>
            `, { collapsible: true })}
            ${renderGuidedSection('section-marketing-plan', 'Marketing Plan', 'Fill out the same marketing-plan prompts as the desktop paper version.', `
                <div class="post-approval-fields">
                    ${renderTextarea('1.1 Description of the Product', 'marketingPlan.descriptionOfProduct', marketingPlan.descriptionOfProduct || '', true)}
                    ${renderTextarea('1.2 Comparison with Competitors', 'marketingPlan.comparisonWithCompetitors', marketingPlan.comparisonWithCompetitors || '', true)}
                    ${renderTextarea('1.3 Location', 'marketingPlan.location', marketingPlan.location || '', true)}
                    ${renderTextarea('1.4 Market Area', 'marketingPlan.marketArea', marketingPlan.marketArea || '', true)}
                    ${renderTextarea('1.5 Main Customers', 'marketingPlan.mainCustomers', marketingPlan.mainCustomers || '', true)}
                    ${renderTextarea('1.6 Total Demand', 'marketingPlan.totalDemand', marketingPlan.totalDemand || '', true)}
                    ${renderTextarea('1.7 Selling Price', 'marketingPlan.sellingPrice', marketingPlan.sellingPrice || '', true)}
                    ${renderTextarea('1.8 Promotional Measures', 'marketingPlan.promotionalMeasures', marketingPlan.promotionalMeasures || '', true)}
                    ${renderTextarea('1.9 Marketing Strategy', 'marketingPlan.marketingStrategy', marketingPlan.marketingStrategy || '', true)}
                    ${renderTextarea('1.10 Marketing Budget', 'marketingPlan.marketingBudget', marketingPlan.marketingBudget || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-production-plan', 'Production Plan', 'Fill out the same production-plan prompts as the desktop paper version.', `
                <div class="post-approval-fields">
                    ${renderTextarea('2.1 Production / Service Process', 'productionPlan.productionServiceProcess', productionPlan.productionServiceProcess || '', true)}
                    ${renderTextarea('2.2 Fixed Capital', 'productionPlan.fixedCapital', productionPlan.fixedCapital || '', true)}
                    ${renderTextarea('2.3 Life of Fixed Capital', 'productionPlan.lifeOfFixedCapital', productionPlan.lifeOfFixedCapital || '', true)}
                    ${renderTextarea('2.4 Sources of Equipment', 'productionPlan.sourcesOfEquipment', productionPlan.sourcesOfEquipment || '', true)}
                    ${renderTextarea('2.5 Planned Capacity', 'productionPlan.plannedCapacity', productionPlan.plannedCapacity || '', true)}
                    ${renderTextarea('2.6 Future Capacity', 'productionPlan.futureCapacity', productionPlan.futureCapacity || '', true)}
                    ${renderTextarea('2.7 Raw Materials', 'productionPlan.rawMaterials', productionPlan.rawMaterials || '', true)}
                    ${renderTextarea('2.8 Cost of Raw Materials', 'productionPlan.costOfRawMaterials', productionPlan.costOfRawMaterials || '', true)}
                    ${renderTextarea('2.9 Raw Materials Availability', 'productionPlan.rawMaterialsAvailability', productionPlan.rawMaterialsAvailability || '', true)}
                    ${renderTextarea('2.10 Labor', 'productionPlan.labor', productionPlan.labor || '', true)}
                    ${renderTextarea('2.11 Cost of Labor', 'productionPlan.costOfLabor', productionPlan.costOfLabor || '', true)}
                    ${renderTextarea('2.12 Labor Availability', 'productionPlan.laborAvailability', productionPlan.laborAvailability || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-management-plan', 'Organization and Management Plan', 'Fill out the same organization and management prompts as the paper version.', `
                <div class="post-approval-fields">
                    ${renderTextarea('3.1 Pre Operating Activities', 'organizationAndManagementPlan.preOperatingActivities', managementPlan.preOperatingActivities || '', true)}
                    ${renderTextarea('3.2 Pre Operating Expenses', 'organizationAndManagementPlan.preOperatingExpenses', managementPlan.preOperatingExpenses || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-financial-plan', 'Financial Plan', 'Fill out the same financial-plan prompt as the paper version.', `
                <div class="post-approval-fields">
                    ${renderTextarea('4.1 Project Cost', 'financialPlan.projectCost', financialPlan.projectCost || '', true)}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-signature', 'Applicant Signature', 'This is the applicant-only signature block for the business plan.', `
                <div class="post-approval-fields">
                    ${renderField('Ngalan sa mipirma', 'applicantSignature.signedName', data.applicantSignature?.signedName || applicantName, 'text')}
                    ${renderField('Petsa sa pirma', 'applicantSignature.signedDate', data.applicantSignature?.signedDate || currentDateInputValue(), 'date')}
                    ${renderUploadField('I-upload ang pirma sa aplikante', 'applicantSignature.signatureUpload', data.applicantSignature?.signatureUpload || null)}
                </div>
            `, { collapsible: true, open: true })}
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderApplicantBuhatGuided(payload) {
        const data = payload || {};
        const beneficiary = data.beneficiary || {};
        const project = data.project || {};
        const coMaker = data.coMaker || {};
        const agreement = data.agreement || {};
        const applicantSignature = data.applicantSignature || {};
        const coMakerSignature = data.coMakerSignature || {};

        return `
            ${renderBeforeYouStart(['Review the beneficiary and co-maker details.', 'Fill out the same names, amounts, and dates shown in the paper form.', 'Prepare both applicant and co-maker e-signatures before submitting.'])}
            ${renderGuidedSection('section-beneficiary-info', 'Beneficiary Information', 'Fill out the same beneficiary details shown on the paper form.', `
                <div class="post-approval-fields">
                    ${renderField('Tibuok nga ngalan', 'beneficiary.fullName', beneficiary.fullName || deriveApplicantName(data), 'text')}
                    ${renderField('Address line', 'beneficiary.addressLine', beneficiary.addressLine || '', 'text', true)}
                    ${renderField('Barangay', 'beneficiary.barangay', beneficiary.barangay || '', 'text')}
                    ${renderField('Dakbayan', 'beneficiary.city', beneficiary.city || '', 'text')}
                </div>
            `, { collapsible: true })}
            ${renderGuidedSection('section-program-details', 'Program Details', 'Fill out the same program and amount fields shown on the paper form.', `
                <div class="post-approval-fields">
                    ${renderField('Program name', 'project.programName', project.programName || '', 'text')}
                    ${renderField('Project name', 'project.projectName', project.projectName || '', 'text', true)}
                    ${renderField('Amount in words', 'project.amountInWords', project.amountInWords || '', 'text', true)}
                    ${renderField('Amount numeric', 'project.amountNumeric', project.amountNumeric || project.amountReceived || '', 'text')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-co-maker', 'Co-maker', 'Fill out the same co-maker details shown on the paper form.', `
                <div class="post-approval-fields">
                    ${renderField('Tibuok nga ngalan', 'coMaker.fullName', coMaker.fullName || '', 'text')}
                    ${renderField('Address line', 'coMaker.addressLine', coMaker.addressLine || '', 'text', true)}
                    ${renderField('Barangay', 'coMaker.barangay', coMaker.barangay || '', 'text')}
                    ${renderField('Dakbayan', 'coMaker.city', coMaker.city || '', 'text')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-dates', 'Agreement Dates', 'Fill out the same agreement date fields shown on the paper form.', `
                <div class="post-approval-fields">
                    ${renderField('Petsa sa pagpirma', 'agreement.dateSigned', agreement.dateSigned || currentDateInputValue(), 'date')}
                    ${renderField('Tuig', 'agreement.yearSigned', agreement.yearSigned || String(new Date().getFullYear()), 'number')}
                </div>
            `, { collapsible: true, open: false })}
            ${renderGuidedSection('section-signatures', 'Signatures', 'These are applicant and co-maker signature fields only.', `
                <div class="post-approval-fields">
                    ${renderField('Beneficiary signer name', 'applicantSignature.signedName', applicantSignature.signedName || deriveApplicantName(data), 'text')}
                    ${renderUploadField('Beneficiary signature upload', 'applicantSignature.signatureUpload', applicantSignature.signatureUpload || null)}
                    ${renderField('Co-maker signer name', 'coMakerSignature.signedName', coMakerSignature.signedName || coMaker.fullName || '', 'text')}
                    ${renderUploadField('Co-maker signature upload', 'coMakerSignature.signatureUpload', coMakerSignature.signatureUpload || null)}
                </div>
            `, { collapsible: true, open: true })}
            ${renderApplicantReviewerNote(state.task?.reviewerRemarks)}
        `;
    }

    function renderTaskSections(code, payload) {
        if (shouldUseApplicantMobileGuidedForm()) {
            return renderApplicantMobileTaskSections(code, payload);
        }

        if (code === 'availment_form') {
            return renderAvailmentPaperWizard(payload);
        }

        if (code === 'mungkahing_proyekto') {
            return renderMungkahingDesktopPaper(payload);
        }

        if (code === 'buhat_sa_pagpanumpa') {
            return renderBuhatSaPagpanumpaMobile(payload);
        }

        if (code === 'business_plan') {
            return renderBusinessPlanMobile(payload);
        }

        return renderValidationMobile(payload);
    }

    function renderTask() {
        const task = state.task;
        const subtitle = document.getElementById('postApprovalWorkspaceSubtitle');
        const notice = document.getElementById('postApprovalWorkspaceNotice');
        const form = document.getElementById('postApprovalForm');
        const sections = document.getElementById('postApprovalFormSections');
        const staffSections = document.getElementById('postApprovalStaffSections');
        const saveButton = document.getElementById('postApprovalSaveButton');
        const submitButton = document.getElementById('postApprovalSubmitButton');

        if (!task) {
            renderFatalState('This application form is unavailable.');
            return;
        }

        setText('formPageTitle', task.title);
        setText('formPageSubtitle', task.summary || task.helpText || 'Complete the required sections below.');
        setText('formPageStatus', task.status);
        setText('formPageCompletion', `${task.completion || 0}%`);
        setText('formPageReview', buildReviewState(task));
        setText('postApprovalWorkspaceStatus', task.status);
        document.title = `SMART LEAP | ${task.title || 'Online Form'}`;
        document.body.dataset.renderMode = state.renderMode;
        renderFormGuidance(task);
        renderSectionNavigator(task);
        renderReviewerHeader(task);
        renderReviewerDecision(task);

        if (subtitle) {
            subtitle.textContent = task.summary || task.helpText || '';
        }

        if (!task.interactive) {
            if (notice) {
                notice.hidden = false;
                notice.textContent = task.helpText || 'This requirement will open after the earlier application steps are complete.';
            }
            form?.classList.add('is-hidden');
            if (sections) sections.innerHTML = '';
            if (staffSections) {
                staffSections.innerHTML = renderStaffSections(task.staffSections || [], task.reviewerRemarks);
                staffSections.hidden = staffSections.innerHTML.trim() === '';
            }
            return;
        }

        if (notice) {
            const workspaceNotice = buildPostApprovalNotice(task);
            notice.hidden = workspaceNotice === '';
            notice.textContent = workspaceNotice;
        }
        form?.classList.remove('is-hidden');
        if (sections) {
            captureGuidedSectionState();
            sections.innerHTML = `${renderFormErrorSummary(state.formErrors, task.code)}${renderTaskSections(task.code, state.activePayload || task.payload || {})}`;
        }
        if (staffSections) {
            staffSections.innerHTML = renderStaffSections(task.staffSections || [], task.reviewerRemarks);
            staffSections.hidden = staffSections.innerHTML.trim() === '';
        }
        if (saveButton) {
            saveButton.disabled = !isTaskEditable(task);
        }
        if (submitButton) {
            submitButton.disabled = !isTaskEditable(task);
            submitButton.hidden = !state.reviewerMode && task.code === 'availment_form' && state.availmentPage !== 2;
        }

        applyFormEditability(task);
        applyFieldErrors(state.formErrors);
    }

    function renderSectionNavigator(task) {
        const nav = document.getElementById('formSectionNav');
        if (!nav) {
            return;
        }

        if ((task.code || '') === 'availment_form') {
            nav.hidden = true;
            nav.innerHTML = '';
            return;
        }

        const sections = sectionDefinitionsForTask(task.code || '');
        if (sections.length === 0) {
            nav.hidden = true;
            nav.innerHTML = '';
            return;
        }

        nav.hidden = false;
        nav.innerHTML = sections.map((section) => `
            <a class="form-section-nav__link" href="#${escapeAttribute(section.id)}">${escapeHtml(section.label)}</a>
        `).join('');
    }

    function sectionDefinitionsForTask(code) {
        const map = {
            availment_form: [
                { id: 'section-client-data', label: 'Client Data' },
                { id: 'section-family-enterprise', label: 'Family Enterprise' },
                { id: 'section-individual-assistance', label: 'Individual Assistance' },
                { id: 'section-income', label: 'Income' },
                { id: 'section-physical-requirements', label: 'Physical Requirements' },
                { id: 'section-psycho-social', label: 'Psycho-Social' },
                { id: 'section-client-commitment', label: 'Responsibility' },
                { id: 'section-signature', label: 'Signature' },
            ],
            validation_form: [
                { id: 'section-applicant-info', label: 'Applicant Info' },
                { id: 'section-checklist', label: 'Checklist' },
                { id: 'section-eligibility-assessment', label: 'Eligibility' },
                { id: 'section-assessment', label: 'Assessment' },
                { id: 'section-validator-signature', label: 'Validator' },
                { id: 'section-signature', label: 'Signature' },
            ],
            mungkahing_proyekto: [
                { id: 'section-project-info', label: 'Project Info' },
                { id: 'section-rationale', label: 'Rationale' },
                { id: 'section-modality', label: 'Modality' },
                { id: 'section-materials', label: 'Materials' },
                { id: 'section-labor', label: 'Labor' },
                { id: 'section-tools', label: 'Tools' },
                { id: 'section-expenses', label: 'Expenses' },
                { id: 'section-sales', label: 'Sales' },
                { id: 'section-profit', label: 'Profit' },
                { id: 'section-capital-fund', label: 'Capital Fund' },
                { id: 'section-signature', label: 'Signature' },
            ],
            business_plan: [
                { id: 'section-overview', label: 'Overview' },
                { id: 'section-marketing-plan', label: 'Marketing Plan' },
                { id: 'section-production-plan', label: 'Production Plan' },
                { id: 'section-management-plan', label: 'Organization & Management' },
                { id: 'section-financial-plan', label: 'Financial Plan' },
                { id: 'section-signature', label: 'Signature' },
            ],
            buhat_sa_pagpanumpa: [
                { id: 'section-beneficiary-info', label: 'Beneficiary Info' },
                { id: 'section-program-details', label: 'Program Details' },
                { id: 'section-co-maker', label: 'Co-maker' },
                { id: 'section-dates', label: 'Dates' },
                { id: 'section-signatures', label: 'Signatures' },
            ],
        };

        return map[code] || [];
    }
})();
