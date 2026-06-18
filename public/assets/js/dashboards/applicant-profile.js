/*
 * SMART LEAP FILE GUIDE
 * Dashboard script for a pp li ca nt p ro fi le.
 * Controls one role-specific workspace page, including its live state, interactions, and any page-owned modals or drawers.
 */
(function () {
    const REQUIRED_FILES = [
        { key: 'validId', label: 'Valid ID' },
        { key: 'healthCertificate', label: 'Health Certificate' },
        { key: 'cedula', label: 'Community Tax Certificate' },
        { key: 'barangayEndorsementLetter', label: 'Barangay Clearance' }
    ];

    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const PROFILE_PHOTO_MAX_SIZE = 5 * 1024 * 1024;
    const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
    const form = document.getElementById('profileCompletionForm');

    if (!form) return;

    let currentUser = null;
    let currentState = null;
    let docState = {};
    let boundPreviewEvents = false;
    let activePreviewUrl = null;
    let activePreviewKey = null;
    let formLocked = false;
    let portalSelectsBound = false;

    document.addEventListener('DOMContentLoaded', () => {
        init().catch((error) => {
            console.error('Profile completion init failed', error);
            showNotices('Unable to load your profile right now.', true);
        });
    });
    window.addEventListener('resize', enhancePortalSelects);

    function publicBase() {
        const match = window.location.pathname.match(/^(.*\/public)(?:\/.*)?$/);
        return match ? match[1] : '';
    }

    function routeUrl(path) {
        const trimmed = String(path || '').replace(/^\/+/, '');
        return `${publicBase()}/${trimmed}`;
    }

    function isDashboardEmbedded() {
        return Boolean(document.querySelector('.dashboard-shell') || document.getElementById('dashboard-home'));
    }

    async function init() {
        initDocState();
        populateBarangayOptions();
        enhancePortalSelects();
        bindEvents();

        const state = await fetchState();
        currentState = state;
        currentUser = state.user;

        hydrateHeader();
        hydrateExistingAplikasyon(state);
        syncProfileConditionalFields();
        syncAgeFromBirthdate();
        renderStatusBar(state.application);
        renderDocs();
        updateDocsCounter();
        renderReview();
        checkStatusAndRoute();
        updateSubmitState();
        syncPortalSelects();
        dispatchDashboardProfileState();
    }

    function populateBarangayOptions() {
        const select = document.getElementById('profileBarangay');
        const barangays = Array.isArray(window.SMARTLEAP_BARANGAYS) ? window.SMARTLEAP_BARANGAYS : [];
        if (!select || !barangays.length) return;

        select.innerHTML = [
            '<option value="">Select barangay</option>',
            ...barangays.map((barangay) => `<option value="${escapeHtml(barangay)}">${escapeHtml(barangay)}</option>`)
        ].join('');
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char]));
    }

    async function fetchState() {
        const response = await fetch(routeUrl('applicant-dashboard/profile/state'), {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const payload = await response.json();

        if (response.status === 401) {
            window.location.href = routeUrl('portal');
            throw new Error('Unauthenticated.');
        }

        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || 'Unable to load the profile state.');
        }

        return payload.data;
    }

    function initDocState() {
        docState = REQUIRED_FILES.reduce((acc, doc) => {
            acc[doc.key] = {
                status: 'Not uploaded yet',
                file: null,
                fileObj: null,
                persistedFile: null,
                persistedStatus: 'Not uploaded yet',
                reviewedAt: null,
                reviewerRemarks: '',
                canIlisi: true,
                error: ''
            };
            return acc;
        }, {});
    }

    function bindEvents() {
        document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
        document.getElementById('saveProfileChangesButton')?.addEventListener('click', () => persistProfile(false, 'profile'));
        document.getElementById('saveDraftButton')?.addEventListener('click', () => persistProfile(false, 'application'));
        document.getElementById('submitProfileButton')?.addEventListener('click', handleSubmitClick);
        document.getElementById('profileBirthdate')?.addEventListener('change', handleBirthdateChange);
        document.getElementById('profilePhotoInput')?.addEventListener('change', handleProfilePhotoChange);

        form.addEventListener('submit', (event) => {
            event.preventDefault();
        });

        form.addEventListener('input', (event) => {
            if (!event.target.matches('input, select')) {
                return;
            }

            syncProfileConditionalFields();
            validateField(event.target);
            renderReview();
            updateSubmitState();
        });

        form.addEventListener('change', (event) => {
            if (!event.target.matches('input, select')) {
                return;
            }

            syncProfileConditionalFields();
            renderReview();
            updateSubmitState();
        });

        bindPreviewEventsOnce();
    }

    function isMobileSelectViewport() {
        return window.matchMedia('(max-width: 960px)').matches;
    }

    function enhancePortalSelects() {
        if (!isMobileSelectViewport()) return;

        if (!portalSelectsBound) {
            document.addEventListener('click', (event) => {
                if (!event.target.closest('[data-portal-select-root]')) {
                    closeAllPortalSelects();
                }
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeAllPortalSelects();
                }
            });
            portalSelectsBound = true;
        }

        document.querySelectorAll('select').forEach((native) => {
            if (native.closest('[data-portal-select-root]') || native.closest('[data-select-root]') || native.multiple) {
                return;
            }

            const root = document.createElement('div');
            root.className = 'portal-select';
            root.dataset.portalSelectRoot = 'true';

            native.parentNode.insertBefore(root, native);
            root.appendChild(native);
            native.classList.add('portal-select__native');

            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'portal-select__trigger';
            trigger.setAttribute('data-portal-select-trigger', 'true');
            trigger.setAttribute('aria-expanded', 'false');

            const label = document.createElement('span');
            label.className = 'portal-select__label';
            label.setAttribute('data-portal-select-label', 'true');
            trigger.appendChild(label);

            const menu = document.createElement('div');
            menu.className = 'portal-select__menu';
            menu.setAttribute('data-portal-select-menu', 'true');
            menu.setAttribute('aria-hidden', 'true');

            Array.from(native.options).forEach((option) => {
                if (option.hidden) return;
                const optionButton = document.createElement('button');
                optionButton.type = 'button';
                optionButton.className = 'portal-select__option';
                optionButton.dataset.value = option.value;
                optionButton.textContent = option.textContent || '';
                optionButton.disabled = option.disabled && option.value === '';
                optionButton.addEventListener('click', () => {
                    native.value = option.value;
                    native.dispatchEvent(new Event('change', { bubbles: true }));
                    syncPortalSelect(root);
                    closeAllPortalSelects();
                    trigger.focus();
                });
                menu.appendChild(optionButton);
            });

            trigger.addEventListener('click', () => {
                const isOpen = root.classList.contains('is-open');
                closeAllPortalSelects();
                if (!isOpen) {
                    root.classList.add('is-open');
                    trigger.setAttribute('aria-expanded', 'true');
                    menu.setAttribute('aria-hidden', 'false');
                    syncMobileSelectOpenState();
                }
            });

            native.addEventListener('change', () => syncPortalSelect(root));

            root.appendChild(trigger);
            root.appendChild(menu);
            syncPortalSelect(root);
        });
    }

    function syncPortalSelects() {
        document.querySelectorAll('[data-portal-select-root]').forEach((root) => syncPortalSelect(root));
    }

    function syncPortalSelect(root) {
        const native = root?.querySelector('select');
        const label = root?.querySelector('[data-portal-select-label]');
        const options = Array.from(root?.querySelectorAll('.portal-select__option') || []);
        if (!native || !label) return;

        const selected = Array.from(native.options).find((option) => option.value === native.value) || native.options[0];
        label.textContent = selected?.textContent?.trim() || '';

        options.forEach((option) => {
            const isSelected = option.dataset.value === native.value;
            option.classList.toggle('is-selected', isSelected);
            option.setAttribute('aria-selected', String(isSelected));
        });
    }

    function closeAllPortalSelects() {
        document.querySelectorAll('[data-portal-select-root].is-open').forEach((root) => {
            root.classList.remove('is-open');
            root.querySelector('[data-portal-select-trigger]')?.setAttribute('aria-expanded', 'false');
            root.querySelector('[data-portal-select-menu]')?.setAttribute('aria-hidden', 'true');
        });
        syncMobileSelectOpenState();
    }

    function syncMobileSelectOpenState() {
        const hasOpenSelect = Boolean(document.querySelector('[data-portal-select-root].is-open, [data-select-root].is-open'));
        document.body.classList.toggle('mobile-select-open', hasOpenSelect);
    }

    function formatBatchNo(value) {
        const text = String(value || '').trim();
        if (!text) return 'Batch 1';
        return /^\d+$/.test(text) ? `Batch ${text}` : text;
    }

    function hydrateHeader() {
        const name = currentUser?.name || 'Applicant';
        const email = currentUser?.email || '--';
        setText('profilePageName', name);
        setText('profilePageEmail', email);
        setProfilePhotoPreview(getStoredProfilePhoto(currentUser));
    }

    function hydrateExistingAplikasyon(state) {
        const profile = state.profile;
        if (profile) {
            setValue('profileBirthdate', profile.birthdate);
            setValue('profileEdad', profile.age);
            setValue('profileGender', profile.gender);
            setValue('profileKontakNumber', profile.contactNumber);
            setValue('profileAddress', profile.address);
            setValue('profileBarangay', profile.barangay);
            setValue('profile4ps', profile.is4ps);
            setValue('profileEducationalAttainment', profile.educationalAttainment);
            setValue('profileSector', profile.sector);
            setValue('profileSectorOtherSpecify', profile.sectorOtherSpecify);
            setValue('profileLivelihood', profile.livelihood);
            setValue('profileBusinessName', profile.businessName);
            setValue('profileBatchNo', formatBatchNo(profile.batchNo));
        }

        REQUIRED_FILES.forEach((doc) => {
            const entry = state.requirements?.[doc.key];
            docState[doc.key] = {
                ...docState[doc.key],
                status: normalizeRequirementEntryStatus(entry),
                file: entry?.file || null,
                fileObj: null,
                persistedFile: entry?.file || null,
                persistedStatus: normalizeRequirementEntryStatus(entry),
                reviewedAt: entry?.reviewedAt || null,
                reviewerRemarks: entry?.reviewerRemarks || '',
                canIlisi: typeof entry?.canReplace === 'boolean' ? entry.canReplace : (typeof entry?.canIlisi === 'boolean' ? entry.canIlisi : true),
                error: ''
            };
        });
    }

    function syncAgeFromBirthdate() {
        const birthdate = getValue('profileBirthdate');
        const ageValue = getValue('profileEdad');
        if (!birthdate || ageValue) return;
        const computedEdad = calculateEdad(birthdate);
        if (computedEdad !== '') {
            setValue('profileEdad', String(computedEdad));
        }
    }

    function handleBirthdateChange(event) {
        const age = calculateEdad(event.target.value);
        const ageInput = document.getElementById('profileEdad');
        if (ageInput) {
            ageInput.value = age ? String(age) : '';
        }
        validateField(ageInput);
        syncProfileConditionalFields();
        renderReview();
        updateSubmitState();
    }

    function calculateEdad(dateString) {
        if (!dateString) return '';
        const birth = new Date(dateString);
        if (Number.isNaN(birth.getTime())) return '';

        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age -= 1;
        }
        return age;
    }

    function validateField(field) {
        if (!field) return true;
        const errorEl = document.querySelector(`[data-error-for="${field.id}"]`);
        if (!errorEl) return true;

        if (field.required && !field.value) {
            errorEl.textContent = 'This field is required.';
            return false;
        }

        if (field.id === 'profileBirthdate' && field.value && calculateEdad(field.value) === '') {
            errorEl.textContent = 'Birthdate is invalid.';
            return false;
        }

        if (field.id === 'profileKontakNumber' && field.value) {
            const contactDigits = String(field.value).replace(/\D+/g, '');
            if (contactDigits.length < 10 || contactDigits.length > 13) {
                errorEl.textContent = 'Enter a valid contact number.';
                return false;
            }
        }

        if (field.id === 'profileEdad' && getValue('profileBirthdate') && calculateEdad(getValue('profileBirthdate')) === '') {
            errorEl.textContent = 'Age could not be computed from the birthdate.';
            return false;
        }

        errorEl.textContent = '';
        return true;
    }

    function syncProfileConditionalFields() {
        const sector = getValue('profileSector');
        const otherWrap = document.getElementById('profileSectorOtherWrap');
        const otherInput = document.getElementById('profileSectorOtherSpecify');
        const showOther = String(sector || '').trim().toLowerCase() === 'other';

        if (otherWrap) {
            otherWrap.hidden = !showOther;
        }

        if (otherInput) {
            otherInput.disabled = !showOther;
            otherInput.required = showOther;
            if (!showOther) {
                otherInput.value = '';
                const errorEl = document.querySelector('[data-error-for="profileSectorOtherSpecify"]');
                if (errorEl) {
                    errorEl.textContent = '';
                }
            }
        }
    }

    function renderDocs() {
        const grid = document.getElementById('docGrid');
        if (!grid) return;

        grid.innerHTML = '';
        REQUIRED_FILES.forEach((doc) => {
            const entry = docState[doc.key];
            const isUploaded = Boolean(entry?.file);
            const hasPendingIlisiment = Boolean(entry?.fileObj);
            const inputId = `doc-input-${doc.key}`;
            const requirementState = getRequirementCardState(entry);
            const primaryAction = buildRequirementPrimaryAction(entry, requirementState, inputId, doc.key);
            const secondaryActions = buildRequirementSecondaryActions(entry, requirementState, inputId, doc.key);
            const tile = document.createElement('div');
            tile.className = `doc-tile ${requirementState.tileClass}`;
            tile.dataset.docKey = doc.key;
            tile.innerHTML = `
                <div class="doc-header">
                    <strong>${doc.label}</strong>
                    <span class="doc-status ${requirementState.statusClass}">${requirementState.statusLabel}</span>
                </div>
                <div class="doc-meta">${isUploaded ? formatFileMeta(entry.file) : 'No file selected.'}</div>
                ${hasPendingIlisiment ? '<div class="doc-note">New file selected. Save or submit to replace the current upload.</div>' : ''}
                ${requirementState.note ? `<div class="doc-note">${requirementState.note}</div>` : ''}
                <small data-error-for="file-${doc.key}">${entry?.error || ''}</small>
                <div class="doc-actions">
                    ${primaryAction}
                    ${secondaryActions}
                </div>
                <input id="${inputId}" class="doc-input" type="file" data-doc-input="${doc.key}" accept=".pdf,.png,.jpg,.jpeg" ${(formLocked || !requirementState.allowUpload) ? 'disabled' : ''}>
            `;
            grid.appendChild(tile);
        });

        grid.querySelectorAll('[data-doc-input]').forEach((input) => {
            input.addEventListener('change', handleDocChange);
        });

        grid.querySelectorAll('[data-doc-remove]').forEach((btn) => {
            btn.addEventListener('click', () => removeDoc(btn.dataset.docRemove));
        });
    }

    function buildRequirementPrimaryAction(entry, state, inputId, key) {
        if (entry?.file) {
            return `<button type="button" class="btn-primary" data-doc-preview="${key}">View file</button>`;
        }

        return `<label class="btn-primary ${state.allowUpload ? '' : 'is-disabled'}" for="${inputId}">Upload file</label>`;
    }

    function buildRequirementSecondaryActions(entry, state, inputId, key) {
        if (!entry?.file) {
            return '';
        }

        const actions = [];
        if (state.allowUpload) {
            actions.push(`<label class="btn-outline ${state.allowUpload ? '' : 'is-disabled'}" for="${inputId}">${entry?.fileObj ? 'Choose another file' : 'Replace file'}</label>`);
        }
        if (entry?.fileObj) {
            actions.push(`<button type="button" class="btn-outline" data-doc-remove="${key}">Clear selection</button>`);
        }
        return actions.join('');
    }

    function getRequirementCardState(entry) {
        const normalizedStatus = normalizeStatus(entry?.status || entry?.reviewStatus || entry?.review_status || '');
        const checked = Boolean(entry?.reviewedAt);
        const approved = ['verified', 'approved', 'complete', 'completed', 'approvedbypdo', 'pdoapproved', 'requirementsverified'].includes(normalizedStatus);
        const rejected = ['rejected', 'flagged', 'needscorrection', 'needsdocuments'].includes(normalizedStatus);
        const uploaded = Boolean(entry?.file);
        const replacementAllowed = entry?.canIlisi !== false;

        if (!uploaded) {
            return {
                statusLabel: 'Not uploaded yet',
                statusClass: '',
                tileClass: 'is-missing',
                note: 'Upload this requirement in the Application page.',
                allowUpload: !formLocked,
            };
        }

        if (approved || (checked && !rejected)) {
            return {
                statusLabel: 'Approved',
                statusClass: 'is-approved',
                tileClass: 'is-approved',
                note: 'This upload has been reviewed and approved. It can no longer be replaced.',
                allowUpload: false,
            };
        }

        if (rejected) {
            return {
                statusLabel: 'Rejected',
                statusClass: 'is-rejected',
                tileClass: 'is-rejected',
                note: entry?.reviewerRemarks ? `Review note: ${entry.reviewerRemarks}` : 'This upload needs a new file before you submit again.',
                allowUpload: !formLocked && replacementAllowed,
            };
        }

        return {
            statusLabel: checked ? 'Reviewed' : 'Submitted',
            statusClass: uploaded ? 'is-uploaded' : '',
            tileClass: uploaded ? 'is-uploaded' : '',
            note: checked
                ? 'This upload is already being checked by PDO/Admin and cannot be replaced right now.'
                : 'You can still replace this file until PDO/Admin review starts.',
            allowUpload: !formLocked && !checked && replacementAllowed,
        };
    }

    function normalizeRequirementEntryStatus(entry) {
        const normalizedStatus = normalizeStatus(entry?.status || entry?.reviewStatus || entry?.review_status || '');
        const uploaded = Boolean(entry?.file?.path || entry?.file || entry?.url);
        if (['verified', 'approved', 'complete', 'completed', 'approvedbypdo', 'pdoapproved', 'requirementsverified'].includes(normalizedStatus)) {
            return 'verified';
        }
        if (uploaded && (!normalizedStatus || normalizedStatus === 'missing' || normalizedStatus === 'notuploaded')) {
            return 'uploaded';
        }
        return entry?.status || (uploaded ? 'uploaded' : 'missing');
    }

    function handleDocChange(event) {
        const key = event.target.dataset.docInput;
        const file = event.target.files?.[0];
        if (!key || !file) return;

        const error = validateFile(file);
        if (error) {
            docState[key] = { ...docState[key], error };
        } else {
            docState[key] = {
                ...docState[key],
                status: docState[key]?.persistedFile ? 'Waiting for replacement' : 'Uploaded',
                file: buildFileMeta(file),
                fileObj: file,
                error: ''
            };
        }

        renderDocs();
        updateDocsCounter();
        renderReview();
        updateSubmitState();
    }

    function validateFile(file) {
        if (!ALLOWED_TYPES.includes(file.type)) {
            return 'Only PDF, PNG, or JPG files are allowed.';
        }
        if (file.size > MAX_FILE_SIZE) {
            return 'File size must be 5 MB or less.';
        }
        return '';
    }

    function buildFileMeta(file) {
        return {
            name: file.name,
            size: file.size,
            type: file.type,
            uploadedAt: new Date().toISOString()
        };
    }

    function formatFileMeta(file) {
        if (!file) return 'No file selected.';
        const size = file.size ? `${Math.round(file.size / 1024)} KB` : 'Saved';
        return `${file.name} | ${size} | ${file.type || 'file'}`;
    }

    function removeDoc(key) {
        const existing = docState[key] || {};
        docState[key] = {
            ...existing,
            status: existing.persistedFile ? (existing.persistedStatus || 'Uploaded') : 'Not uploaded yet',
            file: existing.persistedFile || null,
            fileObj: null,
            error: ''
        };
        renderDocs();
        updateDocsCounter();
        renderReview();
        updateSubmitState();
    }

    function renderReview() {
        const docsList = document.getElementById('reviewDocs');

        if (docsList) {
            docsList.innerHTML = REQUIRED_FILES.map((doc) => {
                const entry = docState[doc.key];
                return `<div><strong>${doc.label}:</strong> ${entry?.file ? 'Uploaded' : 'Missing'}</div>`;
            }).join('');
        }
    }

    function updateSubmitState() {
        syncProfileConditionalFields();
        updateProfileSaveButtonState();
        const submitBtn = document.getElementById('submitProfileButton');
        if (!submitBtn) return;
        submitBtn.disabled = formLocked || !(validateProfile(false) && isDocsComplete());
    }

    function updateProfileSaveButtonState(isBusy = false) {
        syncProfileConditionalFields();
        const saveBtn = document.getElementById('saveProfileChangesButton');
        if (!saveBtn) return;
        saveBtn.disabled = isBusy || formLocked || !validateProfile(false);
    }

    function validateProfile(showErrors) {
        const requiredIds = [
            'profileBirthdate',
            'profileGender',
            'profileKontakNumber',
            'profileAddress',
            'profileBarangay',
            'profile4ps',
            'profileEducationalAttainment',
            'profileSector',
            'profileLivelihood',
            'profileBusinessName'
        ];

        let valid = true;
        requiredIds.forEach((id) => {
            const field = document.getElementById(id);
            const errorEl = document.querySelector(`[data-error-for="${id}"]`);
            if (field?.required && !field.value) {
                if (showErrors && errorEl) {
                    errorEl.textContent = 'This field is required.';
                }
                valid = false;
            } else if (errorEl) {
                errorEl.textContent = '';
            }
        });

        const birthdate = getValue('profileBirthdate');
        if (birthdate && calculateEdad(birthdate) === '') {
            const errorEl = document.querySelector('[data-error-for="profileBirthdate"]');
            if (showErrors && errorEl) {
                errorEl.textContent = 'Birthdate is invalid.';
            }
            valid = false;
        }

        const contactNumber = getValue('profileKontakNumber');
        if (contactNumber) {
            const contactDigits = contactNumber.replace(/\D+/g, '');
            if (contactDigits.length < 10 || contactDigits.length > 13) {
                const errorEl = document.querySelector('[data-error-for="profileKontakNumber"]');
                if (showErrors && errorEl) {
                    errorEl.textContent = 'Enter a valid contact number.';
                }
                valid = false;
            }
        }

        const sectorOther = document.getElementById('profileSectorOtherSpecify');
        if (sectorOther?.required && !sectorOther.value) {
            const errorEl = document.querySelector('[data-error-for="profileSectorOtherSpecify"]');
            if (showErrors && errorEl) {
                errorEl.textContent = 'This field is required.';
            }
            valid = false;
        } else {
            const errorEl = document.querySelector('[data-error-for="profileSectorOtherSpecify"]');
            if (errorEl) {
                errorEl.textContent = '';
            }
        }

        return valid;
    }

    function isDocsComplete() {
        return REQUIRED_FILES.every((doc) => docState[doc.key]?.file && !docState[doc.key]?.error);
    }

    function updateDocsCounter() {
        const uploaded = REQUIRED_FILES.filter((doc) => docState[doc.key]?.file && !docState[doc.key]?.error).length;
        document.querySelectorAll('.docs-total-count').forEach((el) => {
            el.textContent = String(REQUIRED_FILES.length);
        });
        setText('docsUploadedCount', String(uploaded));
        document.querySelectorAll('.meta-badge').forEach((badge) => {
            badge.classList.toggle('is-complete', uploaded === REQUIRED_FILES.length);
        });
    }

    async function handleSubmitClick() {
        if (!validateProfile(true) || !isDocsComplete()) {
            showNotices('Please complete all required profile fields and uploads before submitting.', true, ['formNotice']);
            return;
        }

        await persistProfile(true, 'application');
    }

    function buildProfilePayload() {
        return {
            birthdate: getValue('profileBirthdate'),
            age: getValue('profileEdad'),
            gender: getValue('profileGender'),
            contactNumber: getValue('profileKontakNumber'),
            address: getValue('profileAddress'),
            barangay: getValue('profileBarangay'),
            is4ps: getValue('profile4ps'),
            educationalAttainment: getValue('profileEducationalAttainment'),
            sector: getValue('profileSector'),
            sectorOtherSpecify: getValue('profileSectorOtherSpecify'),
            livelihood: getValue('profileLivelihood'),
            businessName: getValue('profileBusinessName'),
            batchNo: formatBatchNo(getValue('profileBatchNo'))
        };
    }

    async function persistProfile(submit, origin) {
        if (formLocked && submit) return;
        if (origin === 'profile' && !validateProfile(true)) {
            showNotices('Complete all required profile fields before saving changes.', true, ['profileFormNotice']);
            return;
        }
        if (submit && (!validateProfile(true) || !isDocsComplete())) {
            showNotices('Please complete all required profile fields and uploads before submitting.', true, ['formNotice']);
            return;
        }

        clearServerErrors();
        toggleBusyState(true, submit);

        const formData = new FormData();
        Object.entries(buildProfilePayload()).forEach(([key, value]) => {
            formData.append(key, value);
        });
        formData.append('origin', origin);

        REQUIRED_FILES.forEach((doc) => {
            const file = docState[doc.key]?.fileObj;
            if (file) {
                formData.append(`documents[${doc.key}]`, file);
            }
        });

        try {
            const response = await fetch(routeUrl(submit ? 'applicant-dashboard/profile/submit' : 'applicant-dashboard/profile/save'), {
                method: 'POST',
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
                body: formData
            });
            const payload = await response.json();

            if (response.status === 401) {
                window.location.href = routeUrl('portal');
                return;
            }

            if (!response.ok || !payload.ok) {
                applyServerErrors(payload.errors || {});
                showNotices(payload.errors?.general || payload.message || 'Unable to save your profile.', true, noticeTargets(origin, submit));
                return;
            }

            currentState = payload.data;
            hydrateExistingAplikasyon(currentState);
            renderDocs();
            updateDocsCounter();
            renderReview();
            renderStatusBar(currentState.application);
            updateSubmitState();
            dispatchDashboardProfileState();
            showNotices(payload.message || successMessage(submit, origin), false, noticeTargets(origin, submit));

            if (submit) {
                lockForm();
            }
        } catch (error) {
            console.error('Profile save failed', error);
            showNotices('Unable to save your profile right now.', true, noticeTargets(origin, submit));
        } finally {
            toggleBusyState(false, submit);
        }
    }

    function successMessage(submit, origin) {
        if (submit) {
            return 'Application submitted for verification.';
        }
        if (origin === 'profile') {
            return 'Profile updated.';
        }
        return 'Application draft saved.';
    }

    function noticeTargets(origin, submit) {
        if (submit || origin === 'application') {
            return ['formNotice'];
        }
        return ['profileFormNotice'];
    }

    function renderStatusBar(application) {
        const app = application || currentState?.application;
        const status = app?.status || 'Draft';
        setText('statusValue', status);
        setText('statusUpdated', app?.updatedAt ? formatDate(app.updatedAt) : '--');

        const remark = document.getElementById('statusRemark');
        if (remark) {
            remark.textContent = app?.remarks || '';
            remark.hidden = !app?.remarks;
        }
    }

    function dispatchDashboardProfileState() {
        document.dispatchEvent(new CustomEvent('smartleap:profile-state', {
            detail: {
                user: currentState?.user || null,
                profile: currentState?.profile || null,
                application: currentState?.application || null,
                photo: getStoredProfilePhoto(currentState?.user || currentUser),
            }
        }));
    }

    function getStoredProfilePhoto(identity) {
        return identity?.photo || currentState?.user?.photo || currentUser?.photo || null;
    }

    function setProfilePhotoPreview(dataUrl) {
        const img = document.getElementById('profilePhotoPreview');
        const placeholder = document.getElementById('profilePhotoPlaceholder');
        if (!img || !placeholder) return;

        if (dataUrl) {
            img.src = dataUrl;
            img.classList.remove('is-hidden');
            placeholder.classList.add('is-hidden');
            return;
        }

        img.src = '';
        img.classList.add('is-hidden');
        placeholder.classList.remove('is-hidden');
    }

    async function handleProfilePhotoChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!['image/jpeg', 'image/png'].includes(file.type)) {
            showNotices('Only JPG or PNG files can be uploaded.', true, ['profileFormNotice']);
            event.target.value = '';
            return;
        }

        if (file.size > PROFILE_PHOTO_MAX_SIZE) {
            showNotices('Profile photo must be 5 MB or less.', true, ['profileFormNotice']);
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const response = await fetch(routeUrl('applicant-dashboard/profile/photo'), {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json;charset=UTF-8'
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({ photoDataUrl: reader.result })
                });
                const payload = await response.json();
                if (!response.ok || !payload.ok) {
                    throw new Error(payload.message || 'Unable to save the profile photo.');
                }

                currentState = {
                    ...(currentState || {}),
                    user: {
                        ...(currentState?.user || currentUser || {}),
                        ...(payload.data?.user || {}),
                    },
                };
                currentUser = currentState.user || currentUser;
                setProfilePhotoPreview(getStoredProfilePhoto(currentState?.user || currentUser));
                dispatchDashboardProfileState();
                showNotices(payload.message || 'Profile photo updated.', false, ['profileFormNotice']);
            } catch (error) {
                showNotices(error.message || 'Unable to save the profile photo.', true, ['profileFormNotice']);
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsDataURL(file);
    }

    function checkStatusAndRoute() {
        const app = currentState?.application || {};
        const status = normalizeStatus(currentState?.application?.status || '');
        const role = normalizeStatus(currentState?.user?.role || '');
        const canEditSubmission = typeof app.canEditSubmission === 'boolean' ? app.canEditSubmission : null;
        const editableStatuses = ['', 'draft', 'rejected', 'flagged', 'needscorrection', 'needsdocuments'];
        const lockedStatuses = [
            'submitted',
            'pendingverification',
            'underreview',
            'checkedbypdo',
            'requirementsverified',
            'forassessment',
            'approved',
            'approvedfortraining',
            'trainingongoing',
            'completed',
            'active',
            'released'
        ];

        if (!isDashboardEmbedded() && role === 'beneficiary') {
            window.location.href = routeUrl('beneficiary-dashboard');
            return;
        }

        if (!isDashboardEmbedded() && (status === 'approved' || status === 'active' || status === 'released')) {
            window.location.href = routeUrl(role === 'beneficiary' ? 'beneficiary-dashboard' : 'applicant-dashboard');
            return;
        }

        if (canEditSubmission === true) {
            unlockForm();
            return;
        }

        if (canEditSubmission === false) {
            lockForm();
            return;
        }

        if (editableStatuses.includes(status)) {
            unlockForm();
            return;
        }

        if (lockedStatuses.includes(status)) {
            lockForm();
            return;
        }

        unlockForm();
    }

    function setFormControlsDisabled(disabled) {
        document.querySelectorAll('#profileCompletionForm input, #profileCompletionForm select, #saveProfileChangesButton, #saveDraftButton, #submitProfileButton, [data-doc-upload], [data-doc-preview], [data-doc-remove], [data-doc-input]').forEach((el) => {
            el.disabled = disabled;
        });
    }

    function lockForm() {
        formLocked = true;
        setFormControlsDisabled(true);
        renderDocs();
        updateProfileSaveButtonState();
        updateSubmitState();
    }

    function unlockForm() {
        formLocked = false;
        setFormControlsDisabled(false);
        renderDocs();
        updateProfileSaveButtonState();
        updateSubmitState();
    }

    function bindPreviewEventsOnce() {
        if (boundPreviewEvents) return;
        boundPreviewEvents = true;

        const grid = document.getElementById('docGrid');
        const modal = document.getElementById('previewModal');
        const closeFooter = document.getElementById('closePreviewFooter');
        const replaceBtn = document.getElementById('replacePreview');

        grid?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-doc-preview]');
            if (!btn || btn.disabled) return;
            openPreview(btn.dataset.docPreview);
        });

        closeFooter?.addEventListener('click', closePreview);
        replaceBtn?.addEventListener('click', () => {
            if (!activePreviewKey || formLocked) return;
            triggerUploadPicker(document.querySelector(`[data-doc-input="${activePreviewKey}"]`));
        });

        modal?.addEventListener('click', (event) => {
            if (event.target === modal) {
                closePreview();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closePreview();
            }
        });
    }

    function openPreview(key) {
        const modal = document.getElementById('previewModal');
        const body = document.getElementById('previewBody');
        const entry = docState[key];
        if (!modal || !body || !entry?.file) return;

        activePreviewKey = key;
        const label = REQUIRED_FILES.find((doc) => doc.key === key)?.label || 'Document';
        setText('previewTitle', label);

        const statusBadge = modal.querySelector('.modal-status .doc-status');
        if (statusBadge) {
            statusBadge.textContent = 'Uploaded';
            statusBadge.classList.toggle('is-uploaded', true);
        }

        if (entry.fileObj) {
            if (activePreviewUrl) {
                URL.revokeObjectURL(activePreviewUrl);
            }
            activePreviewUrl = URL.createObjectURL(entry.fileObj);
            if ((entry.file.type || '').startsWith('image/')) {
                body.innerHTML = `<img src="${activePreviewUrl}" alt="${label} preview">`;
            } else {
                body.innerHTML = `<object data="${activePreviewUrl}" type="application/pdf" aria-label="${label} preview"></object>`;
            }
        } else if (entry.file.url) {
            const isImage = String(entry.file.type || '').startsWith('image/');
            body.innerHTML = isImage
                ? `<img src="${entry.file.url}" alt="${label} preview">`
                : `<object data="${entry.file.url}" type="application/pdf" aria-label="${label} preview"></object>`;
        } else {
            body.innerHTML = '<p>File preview is not available right now.</p>';
        }

        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closePreview() {
        if (activePreviewUrl) {
            URL.revokeObjectURL(activePreviewUrl);
        }
        activePreviewUrl = null;
        activePreviewKey = null;

        const body = document.getElementById('previewBody');
        const modal = document.getElementById('previewModal');
        if (body) body.innerHTML = '';
        if (modal) modal.hidden = true;
        document.body.style.overflow = '';
    }

    function triggerUploadPicker(input) {
        if (!input || input.disabled) return;

        try {
            if (typeof input.showPicker === 'function') {
                input.showPicker();
                return;
            }
        } catch (error) {
            console.warn('showPicker unavailable, falling back to click()', error);
        }

        input.focus({ preventScroll: true });
        input.click();
    }

    async function handleLogout() {
        try {
            const response = await fetch(routeUrl('auth/logout'), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin',
                body: new URLSearchParams({ entryPoint: 'portal' }).toString()
            });
            const payload = await response.json().catch(() => ({}));
            window.location.href = routeUrl(payload.redirect || 'portal');
        } finally {
            // Redirect is handled from the logout response or falls back to portal.
        }
    }

    function applyServerErrors(errors) {
        clearServerErrors();

        const fieldMap = {
            birthdate: 'profileBirthdate',
            age: 'profileEdad',
            gender: 'profileGender',
            contactNumber: 'profileKontakNumber',
            address: 'profileAddress',
            barangay: 'profileBarangay',
            is4ps: 'profile4ps',
            educationalAttainment: 'profileEducationalAttainment',
            sector: 'profileSector',
            sectorOtherSpecify: 'profileSectorOtherSpecify',
            livelihood: 'profileLivelihood',
            businessName: 'profileBusinessName'
        };

        Object.entries(fieldMap).forEach(([key, id]) => {
            const errorEl = document.querySelector(`[data-error-for="${id}"]`);
            if (errorEl && errors[key]) {
                errorEl.textContent = errors[key];
            }
        });

        REQUIRED_FILES.forEach((doc) => {
            if (errors[doc.key]) {
                docState[doc.key] = { ...docState[doc.key], error: errors[doc.key] };
            }
        });

        renderDocs();
        updateDocsCounter();
    }

    function clearServerErrors() {
        document.querySelectorAll('[data-error-for]').forEach((el) => {
            if (String(el.getAttribute('data-error-for') || '').startsWith('profile')) {
                el.textContent = '';
            }
        });

        REQUIRED_FILES.forEach((doc) => {
            docState[doc.key] = { ...docState[doc.key], error: '' };
        });

        hideNotices();
    }

    function toggleBusyState(isBusy, submit) {
        const saveProfileButton = document.getElementById('saveProfileChangesButton');
        const saveDraftButton = document.getElementById('saveDraftButton');
        const submitButton = document.getElementById('submitProfileButton');

        if (saveProfileButton) {
            saveProfileButton.disabled = isBusy || formLocked;
            saveProfileButton.textContent = isBusy && !submit ? 'Saving...' : 'Save changes';
        }

        if (saveDraftButton) {
            saveDraftButton.disabled = isBusy || formLocked;
            saveDraftButton.textContent = isBusy && !submit ? 'Saving...' : 'Save draft';
        }

        if (submitButton) {
            submitButton.disabled = isBusy || formLocked || !validateProfile(false) || !isDocsComplete();
            submitButton.textContent = isBusy && submit ? 'Submitting...' : 'Submit for verification';
        }

        updateProfileSaveButtonState(isBusy);
    }

    function formatDate(value) {
        if (!value) return '--';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '--';
        return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el && value != null) {
            el.value = value;
            if (el.tagName === 'SELECT') {
                syncPortalSelect(el.closest('[data-portal-select-root]'));
            }
        }
    }

    function getValue(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function showNotices(message, isError, targets = ['profileFormNotice', 'formNotice']) {
        targets.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = message;
            el.hidden = false;
            el.classList.toggle('error', Boolean(isError));
        });
    }

    function hideNotices() {
        ['profileFormNotice', 'formNotice'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.hidden = true;
            el.textContent = '';
            el.classList.remove('error');
        });
    }

    function normalizeStatus(value) {
        return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
    }
})();
