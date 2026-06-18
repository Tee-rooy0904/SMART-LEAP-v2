/*
 * SMART LEAP FILE GUIDE
 * Account verification script.
 * Handles verification code submission, resend actions, loading feedback, and redirect behavior after account verification succeeds.
 */
(function () {
    const form = document.getElementById('verifyAccountForm');
    if (!form) return;

    const emailInput = document.getElementById('verifyEmail');
    const codeInput = document.getElementById('verifyCode');
    const entryPointInput = document.getElementById('verifyEntryPoint');
    const submitButton = document.getElementById('verifySubmit');
    const resendButton = document.getElementById('resendCodeButton');
    const feedback = document.getElementById('verifyFeedback');
    const AUTH_LOADER_MIN_MS = 2400;
    let authLoaderStartedAt = 0;

    function publicBase() {
        const match = window.location.pathname.match(/^(.*\/public)(?:\/.*)?$/);
        return match ? match[1] : '';
    }

    function routeUrl(path) {
        const trimmed = String(path || '').replace(/^\/+/, '');
        return `${publicBase()}/${trimmed}`;
    }

    function setFeedback(tone, message) {
        if (!feedback) return;
        feedback.hidden = false;
        feedback.dataset.tone = tone;
        feedback.textContent = message;
    }

    function setSubmitting(isSubmitting, label) {
        if (!submitButton) return;
        submitButton.disabled = isSubmitting;
        submitButton.textContent = isSubmitting ? label : (submitButton.dataset.defaultLabel || 'Verify account');
    }

    function showLoader(message) {
        const overlay = document.getElementById('authLoadingScreen');
        const copy = document.getElementById('authLoadingCopy');
        if (!overlay) return;
        if (copy && message) copy.textContent = message;
        authLoaderStartedAt = Date.now();
        overlay.hidden = false;
        document.body.classList.add('auth-loading');
    }

    function hideLoader() {
        const overlay = document.getElementById('authLoadingScreen');
        if (!overlay) return;
        overlay.hidden = true;
        document.body.classList.remove('auth-loading');
    }

    function redirectAfterLoader(path) {
        const elapsed = Date.now() - authLoaderStartedAt;
        const remaining = Math.max(0, AUTH_LOADER_MIN_MS - elapsed);
        window.setTimeout(() => {
            window.location.href = routeUrl(path);
        }, remaining);
    }

    codeInput?.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D+/g, '').slice(0, 6);
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = emailInput?.value.trim() ?? '';
        const code = codeInput?.value.trim() ?? '';
        const entryPoint = entryPointInput?.value || 'portal';

        if (!email || !code) {
            setFeedback('danger', 'Enter your registered email and six-digit verification code.');
            return;
        }

        setSubmitting(true, 'Verifying...');
        showLoader('Verifying your SMART LEAP account...');
        let isRedirecting = false;

        try {
            const response = await fetch(routeUrl('auth/verify-account'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Accept: 'application/json',
                },
                credentials: 'same-origin',
                body: new URLSearchParams({ email, code, entryPoint }).toString(),
            });
            const payload = await response.json();
            if (!response.ok || !payload.ok) {
                hideLoader();
                setFeedback('danger', payload.message || 'Verification failed.');
                return;
            }

            setFeedback('success', payload.message || 'Account verified. Redirecting...');
            isRedirecting = true;
            redirectAfterLoader(payload.redirect || 'applicant-dashboard#profile-page');
        } catch (error) {
            hideLoader();
            setFeedback('danger', 'We could not verify your account right now.');
        } finally {
            if (!isRedirecting) {
                setSubmitting(false, 'Verifying...');
            }
        }
    });

    resendButton?.addEventListener('click', async () => {
        const email = emailInput?.value.trim() ?? '';
        if (!email) {
            setFeedback('danger', 'Enter your email address first.');
            return;
        }

        resendButton.disabled = true;
        showLoader('Sending a new verification code...');

        try {
            const response = await fetch(routeUrl('auth/resend-verification'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Accept: 'application/json',
                },
                credentials: 'same-origin',
                body: new URLSearchParams({ email }).toString(),
            });
            const payload = await response.json();
            setFeedback(response.ok && payload.ok ? 'success' : 'danger', payload.message || 'We could not resend the verification code.');
        } catch (error) {
            setFeedback('danger', 'We could not resend the verification code right now.');
        } finally {
            hideLoader();
            resendButton.disabled = false;
        }
    });
})();
