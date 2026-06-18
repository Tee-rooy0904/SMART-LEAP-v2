/*
 * SMART LEAP FILE GUIDE
 * Shared frontend helper for a ut h.
 * Provides reusable browser-side utilities consumed by multiple SMART LEAP pages or modules.
 */
(function () {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) {
        return;
    }

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const entryPointInput = loginForm.querySelector('input[name="entryPoint"]');
    const submitButton = loginForm.querySelector('button[type="submit"], .login-btn');
    const submitDefaultText = submitButton?.textContent || 'Login';
    const showPasswordControl = document.getElementById('showPassword');
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

    function setAuthLoading(active, message) {
        const overlay = document.getElementById('authLoadingScreen');
        const copy = document.getElementById('authLoadingCopy');
        if (!overlay) {
            return;
        }

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

    function removeAlert() {
        document.querySelector('.auth-inline-alert')?.remove();
    }

    function showAlert(message, type) {
        removeAlert();
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} auth-inline-alert mt-3`;
        alert.textContent = message;
        loginForm.appendChild(alert);
    }

    function setSubmitting(isSubmitting) {
        if (!submitButton) {
            return;
        }

        submitButton.disabled = isSubmitting;
        submitButton.textContent = isSubmitting ? 'Logging in...' : submitDefaultText;
    }

    async function performLogin() {
        removeAlert();

        const email = emailInput?.value.trim() ?? '';
        const password = passwordInput?.value ?? '';

        if (!email || !password) {
            showAlert('Email and password are required.', 'danger');
            return;
        }

        setSubmitting(true);
        setAuthLoading(true, 'Authorizing your SMART LEAP access...');
        let isRedirecting = false;

        try {
            const response = await fetch(routeUrl('auth/login'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
                body: new URLSearchParams({
                    email,
                    password,
                    entryPoint: entryPointInput?.value || 'staff',
                }).toString(),
            });

            const payload = await response.json();
            if (!response.ok || !payload.ok) {
                if (payload.requiresVerification && payload.redirect) {
                    isRedirecting = true;
                    redirectAfterLoader(payload.redirect);
                    return;
                }
                showAlert(payload.message || 'Invalid credentials.', 'danger');
                setAuthLoading(false);
                return;
            }

            showAlert('Login successful. Redirecting...', 'success');
            isRedirecting = true;
            redirectAfterLoader(payload.redirect || 'applicant-dashboard#profile-page');
        } catch (error) {
            console.error('Login request failed', error);
            showAlert('Unable to process login right now. Please try again.', 'danger');
            setAuthLoading(false);
        } finally {
            if (!isRedirecting && document.visibilityState !== 'hidden') {
                setAuthLoading(false);
                setSubmitting(false);
            } else if (!isRedirecting) {
                setSubmitting(false);
            }
        }
    }

    window.login = performLogin;

    loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        performLogin();
    });

    if (showPasswordControl) {
        if (showPasswordControl.tagName === 'INPUT' && showPasswordControl.type === 'checkbox') {
            showPasswordControl.addEventListener('change', () => {
                if (!passwordInput) {
                    return;
                }

                passwordInput.type = showPasswordControl.checked ? 'text' : 'password';
            });
        } else {
            showPasswordControl.addEventListener('click', (event) => {
                event.preventDefault();
                if (!passwordInput) {
                    return;
                }

                const revealing = passwordInput.type === 'password';
                passwordInput.type = revealing ? 'text' : 'password';
                showPasswordControl.textContent = revealing ? 'Hide' : 'Show';
            });
        }
    }
})();
