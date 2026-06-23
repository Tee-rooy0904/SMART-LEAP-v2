(function () {
    const form = document.getElementById('stageOneForm');
    if (!form) return;

    const PROFILE_PHOTO_MAX_SIZE = 5 * 1024 * 1024;
    const AUTH_LOADER_MIN_MS = 2400;
    let authLoaderStartedAt = 0;

    const fields = {
        firstName: document.getElementById('stageOneFirstName'),
        middleName: document.getElementById('stageOneMiddleName'),
        lastName: document.getElementById('stageOneLastName'),
        email: document.getElementById('stageOneEmail'),
        birthdate: document.getElementById('stageOneBirthdate'),
        age: document.getElementById('stageOneAge'),
        gender: document.getElementById('stageOneGender'),
        contactNumber: document.getElementById('stageOneContactNumber'),
        address: document.getElementById('stageOneAddress'),
        barangay: document.getElementById('stageOneBarangay'),
        is4ps: document.getElementById('stageOne4ps'),
        educationalAttainment: document.getElementById('stageOneEducationalAttainment'),
        sector: document.getElementById('stageOneSector'),
        sectorOtherSpecify: document.getElementById('stageOneSectorOtherSpecify'),
        livelihood: document.getElementById('stageOneLivelihood'),
        businessName: document.getElementById('stageOneBusinessName'),
        profilePhoto: document.getElementById('stageOneProfilePhoto'),
        businessPhoto: document.getElementById('stageOneBusinessPhoto'),
        validIdPhoto: document.getElementById('stageOneValidIdPhoto'),
    };

    const feedback = document.getElementById('stageOneFeedback');
    const submitBtn = document.getElementById('stageOneSubmit');
    const successPanel = document.getElementById('stageOneSuccess');
    const successMessage = document.getElementById('stageOneSuccessMessage');
    const card = form.closest('.stage-one-card');
    const profilePreview = document.getElementById('stageOneProfilePhotoPreview');
    const profilePlaceholder = document.getElementById('stageOneProfilePhotoPlaceholder');
    const sectorOtherWrap = document.getElementById('stageOneSectorOtherWrap');
    const codeModal = document.getElementById('stageOneCodeModal');
    const codeInput = document.getElementById('stageOneEmailCode');
    const codeFeedback = document.getElementById('stageOneCodeFeedback');
    const codeSubmitBtn = document.getElementById('stageOneVerifySubmit');
    const codeResendBtn = document.getElementById('stageOneResendCode');

    function publicBase() {
        const match = window.location.pathname.match(/^(.*\/public)(?:\/.*)?$/);
        return match ? match[1] : '';
    }

    function routeUrl(path) {
        const trimmed = String(path || '').replace(/^\/+/, '');
        return `${publicBase()}/${trimmed}`;
    }

    function submitUrl() {
        const action = form.getAttribute('action') || form.action;
        return action && action.trim() !== '' ? action : routeUrl('portal/apply');
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

    async function settleLoader() {
        const elapsed = Date.now() - authLoaderStartedAt;
        const remaining = Math.max(0, AUTH_LOADER_MIN_MS - elapsed);
        if (remaining > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, remaining));
        }
        setAuthLoading(false);
    }

    function autoResizeTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
    }

    function setPhotoPreview(file) {
        if (!profilePreview || !profilePlaceholder) return;
        if (!file) {
            profilePreview.hidden = true;
            profilePreview.src = '';
            profilePlaceholder.hidden = false;
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            profilePreview.src = typeof reader.result === 'string' ? reader.result : '';
            profilePreview.hidden = false;
            profilePlaceholder.hidden = true;
        };
        reader.readAsDataURL(file);
    }

    function updateFileLabel(input, labelId) {
        const label = document.getElementById(labelId);
        if (!label) return;
        const file = input?.files?.[0];
        label.textContent = file ? file.name : 'No file selected.';
        label.classList.toggle('is-selected', Boolean(file));
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
            clearFieldError('stageOneSectorOtherSpecify');
        }
    }

    function resetErrors() {
        feedback.hidden = true;
        feedback.textContent = '';
        form.querySelectorAll('[data-error-for]').forEach((error) => {
            error.textContent = '';
            error.removeAttribute('data-visible');
        });
    }

    function clearFieldError(fieldId) {
        const error = form.querySelector(`[data-error-for="${fieldId}"]`);
        if (!error) return;
        error.textContent = '';
        error.removeAttribute('data-visible');
    }

    function showFieldError(fieldId, message) {
        const error = form.querySelector(`[data-error-for="${fieldId}"]`);
        if (!error) return;
        error.textContent = message;
        error.setAttribute('data-visible', 'true');
    }

    function setFeedback(type, message) {
        feedback.hidden = false;
        feedback.dataset.tone = type;
        feedback.textContent = message;
    }

    function setCodeFeedback(type, message) {
        if (!codeFeedback) return;
        codeFeedback.hidden = !message;
        codeFeedback.dataset.tone = type;
        codeFeedback.textContent = message;
    }

    function disableForm(disabled) {
        submitBtn.disabled = disabled;
        submitBtn.textContent = disabled ? 'Sending verification code...' : 'Submit Registration';
    }

    function setCodeSubmitting(disabled) {
        if (codeSubmitBtn) {
            codeSubmitBtn.disabled = disabled;
            codeSubmitBtn.textContent = disabled ? 'Submitting...' : 'Verify and submit';
        }
        if (codeResendBtn) {
            codeResendBtn.disabled = disabled;
        }
    }

    function openCodeModal() {
        if (!codeModal || !codeInput) return;
        setCodeFeedback('', '');
        codeInput.value = '';
        codeModal.hidden = false;
        codeModal.removeAttribute('hidden');
        document.body.classList.add('stage-one-code-open');
        window.setTimeout(() => codeInput.focus(), 80);
    }

    function closeCodeModal() {
        if (!codeModal) return;
        codeModal.hidden = true;
        codeModal.setAttribute('hidden', 'hidden');
        document.body.classList.remove('stage-one-code-open');
    }

    function appendFormFields(formData, verificationCode = '') {
        formData.append('firstName', fields.firstName.value.trim());
        formData.append('middleName', fields.middleName.value.trim());
        formData.append('lastName', fields.lastName.value.trim());
        formData.append('email', fields.email.value.trim());
        formData.append('birthdate', fields.birthdate.value);
        formData.append('age', fields.age.value);
        formData.append('gender', fields.gender.value);
        formData.append('contactNumber', fields.contactNumber.value.trim());
        formData.append('address', fields.address.value.trim());
        formData.append('completeAddress', fields.address.value.trim());
        formData.append('barangay', fields.barangay.value);
        formData.append('is4ps', fields.is4ps.value);
        formData.append('educationalAttainment', fields.educationalAttainment.value);
        formData.append('sector', fields.sector.value);
        formData.append('sectorOtherSpecify', fields.sectorOtherSpecify.value.trim());
        formData.append('livelihood', fields.livelihood.value.trim());
        formData.append('businessName', fields.businessName.value.trim());
        if (verificationCode) {
            formData.append('emailVerificationCode', verificationCode);
        }
    }

    function buildRegistrationFormData(verificationCode) {
        const formData = new FormData();
        appendFormFields(formData, verificationCode);
        formData.append('profilePhoto', fields.profilePhoto.files[0]);
        formData.append('businessPhoto', fields.businessPhoto.files[0]);
        formData.append('validIdPhoto', fields.validIdPhoto.files[0]);
        return formData;
    }

    async function requestEmailCode() {
        const formData = new FormData();
        appendFormFields(formData);

        const response = await fetch(routeUrl('portal/apply/email-code'), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
            body: formData,
        });

        return {
            response,
            payload: await response.json().catch(() => ({})),
        };
    }

    function validate() {
        resetErrors();
        let valid = true;

        const fieldChecks = [
            ['stageOneFirstName', fields.firstName.value.trim(), 'Enter your first name.'],
            ['stageOneLastName', fields.lastName.value.trim(), 'Enter your last name.'],
            ['stageOneEmail', fields.email.value.trim(), 'Enter a valid email address.'],
            ['stageOneBirthdate', fields.birthdate.value, 'Enter a valid birthdate.'],
            ['stageOneGender', fields.gender.value, 'Select your gender.'],
            ['stageOneContactNumber', fields.contactNumber.value.trim(), 'Enter a valid contact number.'],
            ['stageOneAddress', fields.address.value.trim(), 'Enter your complete address.'],
            ['stageOneBarangay', fields.barangay.value, 'Select your barangay.'],
            ['stageOne4ps', fields.is4ps.value, 'Select your 4Ps membership.'],
            ['stageOneEducationalAttainment', fields.educationalAttainment.value, 'Select your educational attainment.'],
            ['stageOneSector', fields.sector.value, 'Select your sector.'],
            ['stageOneLivelihood', fields.livelihood.value.trim(), 'Enter your specific business type.'],
            ['stageOneBusinessName', fields.businessName.value.trim(), 'Enter your microbusiness name.'],
        ];

        fieldChecks.forEach(([fieldId, value, message]) => {
            if (!String(value || '').trim()) {
                valid = false;
                showFieldError(fieldId, message);
            }
        });

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim())) {
            valid = false;
            showFieldError('stageOneEmail', 'Enter a valid email address.');
        }

        const contactDigits = fields.contactNumber.value.replace(/\D+/g, '');
        if (contactDigits.length < 10 || contactDigits.length > 13) {
            valid = false;
            showFieldError('stageOneContactNumber', 'Enter a valid contact number.');
        }

        const age = calculateAge(fields.birthdate.value);
        if (!age) {
            valid = false;
            showFieldError('stageOneBirthdate', 'Birthdate is invalid.');
        } else {
            fields.age.value = age;
        }

        if (fields.sector.value === 'Other' && !fields.sectorOtherSpecify.value.trim()) {
            valid = false;
            showFieldError('stageOneSectorOtherSpecify', 'Please specify the other sector.');
        }

        const profileFile = fields.profilePhoto.files?.[0];
        if (!profileFile) {
            valid = false;
            showFieldError('stageOneProfilePhoto', 'Upload your profile photo.');
        } else if (!['image/jpeg', 'image/png'].includes(profileFile.type)) {
            valid = false;
            showFieldError('stageOneProfilePhoto', 'Upload a JPG or PNG file only.');
        } else if (profileFile.size > PROFILE_PHOTO_MAX_SIZE) {
            valid = false;
            showFieldError('stageOneProfilePhoto', 'Profile photo must be 5 MB or less.');
        }

        if (!fields.businessPhoto.files?.length) {
            valid = false;
            showFieldError('stageOneBusinessPhoto', 'Upload a photo of your existing business.');
        }

        if (!fields.validIdPhoto.files?.length) {
            valid = false;
            showFieldError('stageOneValidIdPhoto', 'Upload a photo or copy of your valid ID.');
        }

        return valid;
    }

    fields.profilePhoto?.addEventListener('change', () => {
        const file = fields.profilePhoto.files?.[0] || null;
        updateFileLabel(fields.profilePhoto, 'stageOneProfilePhotoName');
        setPhotoPreview(file);
    });
    fields.businessPhoto?.addEventListener('change', () => updateFileLabel(fields.businessPhoto, 'stageOneBusinessPhotoName'));
    fields.validIdPhoto?.addEventListener('change', () => updateFileLabel(fields.validIdPhoto, 'stageOneValidIdPhotoName'));
    fields.birthdate?.addEventListener('change', syncAgeFromBirthdate);
    fields.sector?.addEventListener('change', toggleSectorOther);
    fields.address?.addEventListener('input', () => autoResizeTextarea(fields.address));
    codeInput?.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D+/g, '').slice(0, 6);
    });
    document.querySelectorAll('[data-stage-one-code-close]').forEach((button) => {
        button.addEventListener('click', closeCodeModal);
    });
    codeResendBtn?.addEventListener('click', async () => {
        if (codeResendBtn.disabled) return;
        setCodeSubmitting(true);
        setCodeFeedback('info', 'Sending a fresh verification code...');
        try {
            const { response, payload } = await requestEmailCode();
            setCodeFeedback(response.ok && payload.ok ? 'success' : 'danger', payload.message || 'Unable to send a fresh code.');
        } catch (error) {
            setCodeFeedback('danger', 'Unable to send a fresh code right now.');
        } finally {
            setCodeSubmitting(false);
        }
    });
    autoResizeTextarea(fields.address);
    syncAgeFromBirthdate();
    toggleSectorOther();

    async function submitVerifiedRegistration() {
        const verificationCode = codeInput?.value.trim() || '';
        if (!verificationCode || verificationCode.length !== 6) {
            setCodeFeedback('danger', 'Enter the six-digit code sent to your email.');
            return;
        }

        setCodeSubmitting(true);
        setAuthLoading(true, 'Verifying your email and submitting your registration...');
        try {
            const formData = buildRegistrationFormData(verificationCode);

            const response = await fetch(submitUrl(), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
                body: formData,
            });
            const payload = await response.json().catch(() => ({}));

            await settleLoader();

            if (!response.ok || !payload.ok) {
                const fieldMap = {
                    firstName: 'stageOneFirstName',
                    middleName: 'stageOneMiddleName',
                    lastName: 'stageOneLastName',
                    email: 'stageOneEmail',
                    birthdate: 'stageOneBirthdate',
                    age: 'stageOneAge',
                    gender: 'stageOneGender',
                    contactNumber: 'stageOneContactNumber',
                    address: 'stageOneAddress',
                    completeAddress: 'stageOneAddress',
                    barangay: 'stageOneBarangay',
                    is4ps: 'stageOne4ps',
                    educationalAttainment: 'stageOneEducationalAttainment',
                    sector: 'stageOneSector',
                    sectorOtherSpecify: 'stageOneSectorOtherSpecify',
                    livelihood: 'stageOneLivelihood',
                    businessName: 'stageOneBusinessName',
                    profilePhoto: 'stageOneProfilePhoto',
                    businessPhoto: 'stageOneBusinessPhoto',
                    validIdPhoto: 'stageOneValidIdPhoto',
                    emailVerificationCode: 'stageOneEmailCode',
                };

                Object.entries(payload.errors || {}).forEach(([key, message]) => {
                    if (key === 'emailVerificationCode') {
                        setCodeFeedback('danger', message);
                    } else if (fieldMap[key]) {
                        showFieldError(fieldMap[key], message);
                    }
                });
                setCodeFeedback('danger', payload.message || 'Unable to submit the application right now.');
                setCodeSubmitting(false);
                return;
            }

            disableForm(false);
            setCodeSubmitting(false);
            resetErrors();
            if (successMessage) {
                successMessage.textContent = payload.message || 'Your email is verified and your registration is now ready for Admin validation.';
            }
            card?.classList.add('is-complete');
            closeCodeModal();
            form.hidden = true;
            successPanel.hidden = false;
            successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (error) {
            await settleLoader();
            console.error('Stage 1 registration failed', error);
            setCodeFeedback('danger', 'Unable to submit the application right now.');
            setCodeSubmitting(false);
        }
    }

    codeSubmitBtn?.addEventListener('click', submitVerifiedRegistration);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submitBtn.disabled) return;

        if (!validate()) {
            setFeedback('danger', 'Please complete the required application fields.');
            return;
        }

        disableForm(true);
        setAuthLoading(true, 'Sending your email verification code...');

        try {
            const { response, payload } = await requestEmailCode();
            await settleLoader();
            if (!response.ok || !payload.ok) {
                const fieldMap = {
                    firstName: 'stageOneFirstName',
                    lastName: 'stageOneLastName',
                    email: 'stageOneEmail',
                };
                Object.entries(payload.errors || {}).forEach(([key, message]) => {
                    if (fieldMap[key]) {
                        showFieldError(fieldMap[key], message);
                    }
                });
                setFeedback('danger', payload.message || 'Unable to send a verification code right now.');
                disableForm(false);
                return;
            }

            disableForm(false);
            resetErrors();
            openCodeModal();
            setCodeFeedback('success', payload.message || 'Verification code sent. Check your email inbox or spam folder.');
        } catch (error) {
            await settleLoader();
            console.error('Stage 1 verification code failed', error);
            setFeedback('danger', 'Unable to send a verification code right now.');
            disableForm(false);
        }
    });
})();
