(function () {
    const form = document.getElementById('signupForm');
    if (!form) return;

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const AUTH_LOADER_MIN_MS = 2400;
    const signupMode = String(window.SMARTLEAP_SIGNUP_MODE || 'applicant').toLowerCase();
    const isCoMakerMode = signupMode === 'co-maker';

    const fields = {
        registrationMode: document.getElementById('signupRegistrationMode'),
        beneficiaryProfileId: document.getElementById('signupBeneficiaryProfileId'),
        firstName: document.getElementById('signupFirstName'),
        middleName: document.getElementById('signupMiddleName'),
        lastName: document.getElementById('signupLastName'),
        email: document.getElementById('signupEmail'),
        password: document.getElementById('signupPassword'),
        confirmPassword: document.getElementById('signupPasswordConfirm'),
        birthdate: document.getElementById('signupBirthdate'),
        age: document.getElementById('signupAge'),
        gender: document.getElementById('signupGender'),
        contactNumber: document.getElementById('signupContactNumber'),
        relationshipToPrimaryBeneficiary: document.getElementById('signupRelationshipToPrimaryBeneficiary'),
        validIdInput: document.getElementById('signupValidIdInput'),
        relationshipDocumentInput: document.getElementById('signupRelationshipDocumentInput'),
        address: document.getElementById('signupAddress'),
        barangay: document.getElementById('signupBarangay'),
        is4ps: document.getElementById('signup4ps'),
        educationalAttainment: document.getElementById('signupEducationalAttainment'),
        sector: document.getElementById('signupSector'),
        sectorOtherSpecify: document.getElementById('signupSectorOtherSpecify'),
        livelihood: document.getElementById('signupLivelihood'),
        businessName: document.getElementById('signupBusinessName'),
        photoInput: document.getElementById('signupPhotoInput'),
    };

    const feedback = document.getElementById('signupFeedback');
    const passwordHints = document.getElementById('passwordHints');
    const submitBtn = document.getElementById('signupSubmit');
    const toggleButtons = document.querySelectorAll('.toggle-visibility');
    const photoPreview = document.getElementById('signupPhotoPreview');
    const photoPlaceholder = document.getElementById('signupPhotoPlaceholder');
    const sectorOtherWrap = document.getElementById('signupSectorOtherWrap');
    const confirmModal = document.getElementById('signupConfirmModal');
    const confirmGrid = document.getElementById('signupConfirmGrid');
    const confirmName = document.getElementById('signupConfirmName');
    const confirmEmail = document.getElementById('signupConfirmEmail');
    const confirmPhoto = document.getElementById('signupConfirmPhoto');
    const confirmPhotoPlaceholder = document.getElementById('signupConfirmPhotoPlaceholder');
    const confirmSubmitBtn = document.getElementById('signupConfirmSubmit');
    const closeConfirmButtons = document.querySelectorAll('[data-close-signup-confirm]');

    let authLoaderStartedAt = 0;
    let photoDataUrl = '';

    function fieldValue(field) {
        return field ? field.value : '';
    }

    function autoResizeTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
    }

    function publicBase() {
        const match = window.location.pathname.match(/^(.*\/public)(?:\/.*)?$/);
        return match ? match[1] : '';
    }

    function routeUrl(path) {
        const trimmed = String(path || '').replace(/^\/+/, '');
        return `${publicBase()}/${trimmed}`;
    }

    function setAuthLoading(active, message) {
        const overlay = document.getElementById('authLoadingScreen');
        const copy = document.getElementById('authLoadingCopy');
        if (!overlay) return;
        if (copy && message) {
            copy.textContent = message;
        }
        if (active) {
            authLoaderStartedAt = Date.now();
        }
        overlay.hidden = !active;
        document.body.classList.toggle('auth-loading', active);
    }

    function redirectAfterLoader(path) {
        const elapsed = Date.now() - authLoaderStartedAt;
        const remaining = Math.max(0, AUTH_LOADER_MIN_MS - elapsed);
        window.setTimeout(() => {
            window.location.href = routeUrl(path);
        }, remaining);
    }

    function togglePasswordHints(visible) {
        if (!passwordHints) return;
        passwordHints.classList.toggle('is-visible', visible);
    }

    function updatePasswordHints(value) {
        const hints = {
            length: value.length >= 8,
            number: /\d/.test(value),
            upper: /[A-Z]/.test(value),
            lower: /[a-z]/.test(value)
        };

        Object.entries(hints).forEach(([key, satisfied]) => {
            const hint = passwordHints.querySelector(`[data-hint="${key}"]`);
            if (hint) {
                hint.classList.toggle('is-valid', satisfied);
            }
        });
    }

    function setFeedback(type, message) {
        feedback.hidden = false;
        feedback.dataset.tone = type;
        feedback.textContent = message;
    }

    function clearFeedback() {
        feedback.hidden = true;
        feedback.textContent = '';
        delete feedback.dataset.tone;
    }

    function setFieldError(fieldId, message) {
        const error = form.querySelector(`[data-error-for="${fieldId}"]`);
        if (!error) return;
        error.textContent = message;
        error.setAttribute('data-visible', 'true');
    }

    function clearFieldError(fieldId) {
        const error = form.querySelector(`[data-error-for="${fieldId}"]`);
        if (!error) return;
        error.textContent = '';
        error.removeAttribute('data-visible');
    }

    function resetErrors() {
        clearFeedback();
        form.querySelectorAll('[data-error-for]').forEach((error) => {
            error.textContent = '';
            error.removeAttribute('data-visible');
        });
    }

    function firstFieldErrorMessage() {
        const firstError = form.querySelector('[data-error-for][data-visible="true"]');
        return firstError ? String(firstError.textContent || '').trim() : '';
    }

    function disableForm(state) {
        submitBtn.disabled = state;
        submitBtn.textContent = state
            ? (isCoMakerMode ? 'Saving co-maker account...' : 'Activating account...')
            : (isCoMakerMode ? 'Create co-maker account' : 'Activate account');
        if (confirmSubmitBtn) {
            confirmSubmitBtn.disabled = state;
            confirmSubmitBtn.textContent = state ? 'Saving...' : 'Yes, save and continue';
        }
    }

    function sanitizeText(value) {
        return String(value || '').replace(/[&<>"']/g, function (character) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[character];
        });
    }

    function calculateAge(birthdate) {
        if (!birthdate) return '';
        const current = new Date();
        const birth = new Date(`${birthdate}T00:00:00`);
        if (Number.isNaN(birth.getTime())) return '';

        let age = current.getFullYear() - birth.getFullYear();
        const monthDelta = current.getMonth() - birth.getMonth();
        if (monthDelta < 0 || (monthDelta === 0 && current.getDate() < birth.getDate())) {
            age -= 1;
        }

        return age >= 0 ? String(age) : '';
    }

    function syncAgeFromBirthdate() {
        if (!fields.birthdate || !fields.age) return;
        fields.age.value = calculateAge(fields.birthdate.value);
    }

    function toggleSectorOther() {
        if (!fields.sector || !sectorOtherWrap || !fields.sectorOtherSpecify) return;
        const isOther = fields.sector.value === 'Other';
        sectorOtherWrap.hidden = !isOther;
        fields.sectorOtherSpecify.disabled = !isOther;
        if (!isOther) {
            fields.sectorOtherSpecify.value = '';
            clearFieldError('signupSectorOtherSpecify');
        }
    }

    function setPhotoPreview(dataUrl) {
        if (!photoPreview || !photoPlaceholder) return;
        photoDataUrl = dataUrl || '';
        if (photoDataUrl) {
            photoPreview.src = photoDataUrl;
            photoPreview.hidden = false;
            photoPlaceholder.hidden = true;
        } else {
            photoPreview.src = '';
            photoPreview.hidden = true;
            photoPlaceholder.hidden = false;
        }
    }

    function formatFieldLabel(label) {
        return `<span class="signup-confirm__label">${sanitizeText(label)}</span>`;
    }

    function fieldValueOrFallback(value) {
        const normalized = String(value || '').trim();
        return normalized !== '' ? sanitizeText(normalized) : '<em>--</em>';
    }

    function buildSummaryMarkup() {
        const values = collectPayload();
        const summaryItems = isCoMakerMode
            ? [
                ['Full name', [values.firstName, values.middleName, values.lastName].filter(Boolean).join(' ')],
                ['Email address', values.email],
                ['Contact number', values.contactNumber],
                ['Age', values.age],
                ['Gender', values.gender],
                ['Relationship to primary beneficiary', values.relationshipToPrimaryBeneficiary],
                ['Primary beneficiary', window.SMARTLEAP_CO_MAKER_CONTEXT?.primaryBeneficiaryName || ''],
                ['Business name', window.SMARTLEAP_CO_MAKER_CONTEXT?.primaryBusinessName || ''],
                ['Assigned PDO', window.SMARTLEAP_CO_MAKER_CONTEXT?.assignedPdo?.name || ''],
                ['Valid ID', fields.validIdInput?.files?.[0]?.name || ''],
                ['Relationship document', fields.relationshipDocumentInput?.files?.[0]?.name || '']
            ]
            : [
                ['Email address', values.email],
                ['Password', 'Ready to set'],
                ['Verification', 'Email code required after saving']
            ];

        confirmName.textContent = isCoMakerMode
            ? (summaryItems[0][1] || '--')
            : 'Applicant account activation';
        confirmEmail.textContent = values.email || '--';

        if (isCoMakerMode || !photoDataUrl) {
            confirmPhoto.src = '';
            confirmPhoto.hidden = true;
            confirmPhotoPlaceholder.hidden = false;
        } else {
            confirmPhoto.src = photoDataUrl;
            confirmPhoto.hidden = false;
            confirmPhotoPlaceholder.hidden = true;
        }

        confirmGrid.innerHTML = summaryItems.map(([label, value]) => (
            `<div class="signup-confirm__item">${formatFieldLabel(label)}<strong>${fieldValueOrFallback(value)}</strong></div>`
        )).join('');
    }

    function openConfirmModal() {
        if (!confirmModal || !confirmGrid || !confirmName || !confirmEmail || !confirmPhoto || !confirmPhotoPlaceholder) {
            return;
        }
        if (!validate()) {
            return;
        }
        buildSummaryMarkup();
        confirmModal.hidden = false;
        confirmModal.removeAttribute('hidden');
        document.body.classList.add('signup-confirm-open');
    }

    function closeConfirmModal() {
        if (!confirmModal) return;
        confirmModal.hidden = true;
        confirmModal.setAttribute('hidden', 'hidden');
        document.body.classList.remove('signup-confirm-open');
    }

    function collectPayload() {
        const payload = {
            registrationMode: fields.registrationMode?.value || (isCoMakerMode ? 'co-maker' : 'applicant'),
            beneficiaryProfileId: fields.beneficiaryProfileId?.value || '',
            firstName: fieldValue(fields.firstName).trim(),
            middleName: fieldValue(fields.middleName).trim(),
            lastName: fieldValue(fields.lastName).trim(),
            email: fieldValue(fields.email).trim(),
            password: fieldValue(fields.password),
            contactNumber: fieldValue(fields.contactNumber).trim(),
            relationshipToPrimaryBeneficiary: fieldValue(fields.relationshipToPrimaryBeneficiary).trim(),
            birthdate: fieldValue(fields.birthdate),
            age: fieldValue(fields.age),
            gender: fieldValue(fields.gender),
            address: fieldValue(fields.address).trim(),
            barangay: fieldValue(fields.barangay),
            is4ps: fieldValue(fields.is4ps),
            educationalAttainment: fieldValue(fields.educationalAttainment),
            sector: fieldValue(fields.sector),
            sectorOtherSpecify: fieldValue(fields.sectorOtherSpecify).trim(),
            livelihood: fieldValue(fields.livelihood).trim(),
            businessName: fieldValue(fields.businessName).trim(),
            photoDataUrl: photoDataUrl
        };

        return payload;
    }

    function validate() {
        resetErrors();
        let valid = true;
        const payload = collectPayload();
        const requiredTextFields = isCoMakerMode
            ? [
                ['signupFirstName', payload.firstName, 'Enter your first name.'],
                ['signupLastName', payload.lastName, 'Enter your last name.'],
                ['signupEmail', payload.email, 'Enter your email address.'],
                ['signupPassword', payload.password, 'Enter your password.'],
                ['signupPasswordConfirm', fields.confirmPassword.value, 'Confirm your password.'],
                ['signupContactNumber', payload.contactNumber, 'Enter your contact number.'],
                ['signupAge', payload.age, 'Enter your age.'],
                ['signupGender', payload.gender, 'Select your gender.'],
                ['signupRelationshipToPrimaryBeneficiary', payload.relationshipToPrimaryBeneficiary, 'Enter your relationship to the primary beneficiary.'],
            ]
            : [
                ['signupEmail', payload.email, 'Enter your email address.'],
                ['signupPassword', payload.password, 'Enter your password.'],
                ['signupPasswordConfirm', fields.confirmPassword.value, 'Confirm your password.'],
            ];

        requiredTextFields.forEach(([fieldId, value, message]) => {
            if (!String(value || '').trim()) {
                valid = false;
                setFieldError(fieldId, message);
            }
        });

        if (isCoMakerMode && (!payload.firstName || payload.firstName.length < 2)) {
            valid = false;
            setFieldError('signupFirstName', 'Enter your first name.');
        }

        if (isCoMakerMode && (!payload.lastName || payload.lastName.length < 2)) {
            valid = false;
            setFieldError('signupLastName', 'Enter your last name.');
        }

        if (!EMAIL_PATTERN.test(payload.email)) {
            valid = false;
            setFieldError('signupEmail', 'Enter a valid email address (e.g., juan@example.com).');
        }

        if (!payload.password || payload.password.length < 8) {
            valid = false;
            setFieldError('signupPassword', 'Password must be at least 8 characters.');
        } else if (!/\d/.test(payload.password) || !/[A-Z]/.test(payload.password) || !/[a-z]/.test(payload.password)) {
            valid = false;
            setFieldError('signupPassword', 'Include uppercase, lowercase, and numeric characters.');
        }

        if (payload.password !== fields.confirmPassword.value) {
            valid = false;
            setFieldError('signupPasswordConfirm', 'Passwords do not match.');
        }

        if (isCoMakerMode) {
            const age = Number(payload.age || 0);
            if (!Number.isFinite(age) || age < 1 || age > 120) {
                valid = false;
                setFieldError('signupAge', 'Enter a valid age.');
            }
        }

        if (isCoMakerMode) {
            const contactDigits = payload.contactNumber.replace(/\D+/g, '');
            if (contactDigits.length < 10 || contactDigits.length > 13) {
                valid = false;
                setFieldError('signupContactNumber', 'Enter a valid contact number.');
            }

            if (!fields.validIdInput?.files?.[0]) {
                valid = false;
                setFieldError('signupValidIdInput', 'Upload your valid ID.');
            }
            if (!fields.relationshipDocumentInput?.files?.[0]) {
                valid = false;
                setFieldError('signupRelationshipDocumentInput', 'Upload your relationship document.');
            }
        }

        return valid;
    }

    async function submitSignup() {
        disableForm(true);
        setAuthLoading(true, 'Creating your SMART LEAP account...');
        let isRedirecting = false;

        try {
            const payload = collectPayload();
            const formData = new FormData();
            Object.entries(payload).forEach(([key, value]) => formData.append(key, value ?? ''));
            if (isCoMakerMode) {
                if (fields.validIdInput?.files?.[0]) formData.append('validId', fields.validIdInput.files[0]);
                if (fields.relationshipDocumentInput?.files?.[0]) formData.append('relationshipDocument', fields.relationshipDocumentInput.files[0]);
            }
            const response = await fetch(routeUrl('signup'), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
                body: formData,
            });

            const result = await response.json();
            if (!response.ok || !result.ok) {
                const fieldMap = {
                    firstName: 'signupFirstName',
                    middleName: 'signupMiddleName',
                    lastName: 'signupLastName',
                    email: 'signupEmail',
                    password: 'signupPassword',
                    beneficiaryProfileId: 'signupBeneficiaryProfileId',
                    relationshipToPrimaryBeneficiary: 'signupRelationshipToPrimaryBeneficiary',
                    validId: 'signupValidIdInput',
                    relationshipDocument: 'signupRelationshipDocumentInput'
                };

                Object.entries(result.errors || {}).forEach(([key, message]) => {
                    if (fieldMap[key]) {
                        setFieldError(fieldMap[key], message);
                    }
                });

                setFeedback('danger', result.errors?.general || result.message || 'We could not create your account right now.');
                closeConfirmModal();
                return;
            }

            setFeedback('success', result.message || 'Your account is ready. Redirecting...');
            isRedirecting = true;
            redirectAfterLoader(result.redirect || 'applicant-dashboard');
        } catch (error) {
            console.error('Signup failed', error);
            setFeedback('danger', 'We could not create your account right now. Please try again.');
            closeConfirmModal();
        } finally {
            if (!isRedirecting && document.visibilityState !== 'hidden') {
                setAuthLoading(false);
                disableForm(false);
            } else if (!isRedirecting) {
                disableForm(false);
            }
        }
    }

    toggleButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.toggle;
            const input = document.getElementById(targetId);
            if (!input) return;
            const isPassword = input.getAttribute('type') === 'password';
            input.setAttribute('type', isPassword ? 'text' : 'password');
            button.setAttribute('aria-label', `${isPassword ? 'Hide' : 'Show'} password`);
            button.textContent = isPassword ? 'Hide' : 'Show';
            button.classList.toggle('is-visible', !isPassword);
        });
    });

    fields.password?.addEventListener('focus', () => togglePasswordHints(true));
    fields.password?.addEventListener('blur', () => togglePasswordHints(Boolean(fields.password.value)));
    fields.password?.addEventListener('input', () => {
        updatePasswordHints(fields.password.value);
        togglePasswordHints(Boolean(fields.password.value));
    });

    fields.birthdate?.addEventListener('change', syncAgeFromBirthdate);
    fields.sector?.addEventListener('change', toggleSectorOther);
    fields.address?.addEventListener('input', () => autoResizeTextarea(fields.address));
    fields.photoInput?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        clearFieldError('signupPhotoInput');
        if (!file) {
            setPhotoPreview('');
            return;
        }

        if (!['image/jpeg', 'image/png'].includes(file.type)) {
            setFieldError('signupPhotoInput', 'Upload a JPG or PNG file only.');
            event.target.value = '';
            setPhotoPreview('');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setFieldError('signupPhotoInput', 'Profile photo must be 5 MB or less.');
            event.target.value = '';
            setPhotoPreview('');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setPhotoPreview(typeof reader.result === 'string' ? reader.result : '');
        };
        reader.readAsDataURL(file);
    });

    closeConfirmButtons.forEach((button) => {
        button.addEventListener('click', closeConfirmModal);
    });

    if (confirmSubmitBtn) {
        confirmSubmitBtn.addEventListener('click', () => {
            if (confirmSubmitBtn.disabled) return;
            submitSignup();
        });
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (submitBtn.disabled) return;

        const isValid = validate();
        if (!isValid) {
            closeConfirmModal();
            setFeedback('danger', firstFieldErrorMessage() || 'Please review the highlighted fields before continuing.');
            return;
        }

        if (isCoMakerMode) {
            openConfirmModal();
            return;
        }

        submitSignup();
    });

    updatePasswordHints(fields.password?.value || '');
    toggleSectorOther();
    syncAgeFromBirthdate();
    autoResizeTextarea(fields.address);
    closeConfirmModal();
})();
