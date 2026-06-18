/*
 * SMART LEAP FILE GUIDE
 * Public portal script for p or ta l.
 * Handles browser-side behavior for one public SMART LEAP page or account-access flow.
 */
(function () {
    const AUTH_LOADER_MIN_MS = 2400;
    const MAX_PUBLIC_FILE_BYTES = 2 * 1024 * 1024;
    const ALLOWED_PUBLIC_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
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

    function ensureToastStack() {
        let stack = document.getElementById('portalToastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'portalToastStack';
            stack.className = 'portal-toast-stack';
            stack.setAttribute('aria-live', 'polite');
            stack.setAttribute('aria-atomic', 'true');
            document.body.appendChild(stack);
        }

        return stack;
    }

    function showPortalToast(message, tone = 'danger') {
        const stack = ensureToastStack();
        const toast = document.createElement('div');
        toast.className = `portal-toast portal-toast--${tone}`;
        toast.textContent = message;
        stack.appendChild(toast);

        window.requestAnimationFrame(() => {
            toast.classList.add('is-visible');
        });

        window.setTimeout(() => {
            toast.classList.remove('is-visible');
            window.setTimeout(() => toast.remove(), 220);
        }, 2600);
    }

    function ensureFileNameHint(input) {
        const field = input.closest('.field') || input.parentElement;
        if (!field) return null;

        let hint = field.querySelector('.field-file-name');
        if (!hint) {
            hint = document.createElement('small');
            hint.className = 'field-file-name';
            field.appendChild(hint);
        }

        return hint;
    }

    function flashInvalidField(field) {
        if (!field) return;
        field.classList.remove('is-file-invalid');
        void field.offsetWidth;
        field.classList.add('is-file-invalid');
        window.setTimeout(() => field.classList.remove('is-file-invalid'), 520);
    }

    function checkFileIntegrity(input) {
        if (!input || !input.files || !input.files.length) {
            return true;
        }

        const file = input.files[0];
        const field = input.closest('.field') || input.parentElement;
        const nameHint = ensureFileNameHint(input);
        const extension = (file.name.split('.').pop() || '').toLowerCase();
        const extensionAllowed = ['pdf', 'jpg', 'jpeg', 'png'].includes(extension);
        const mimeAllowed = ALLOWED_PUBLIC_FILE_TYPES.includes(file.type);

        field?.classList.remove('is-file-valid', 'is-file-invalid');

        if (file.size > MAX_PUBLIC_FILE_BYTES) {
            input.value = '';
            if (nameHint) nameHint.textContent = '';
            flashInvalidField(field);
            showPortalToast('File rejected. Upload a PDF, JPG, or PNG that is 2MB or less.', 'danger');
            return false;
        }

        if (!mimeAllowed && !extensionAllowed) {
            input.value = '';
            if (nameHint) nameHint.textContent = '';
            flashInvalidField(field);
            showPortalToast('Invalid file type. Only PDF, JPG, and PNG files are allowed.', 'danger');
            return false;
        }

        field?.classList.add('is-file-valid');
        if (nameHint) {
            nameHint.textContent = file.name;
        }

        return true;
    }

    function closeMobileNav() {
        const mobileNav = document.getElementById('mobileNav');
        const menuBtn = document.getElementById('menuBtn');
        if (!mobileNav) return;
        mobileNav.classList.remove('is-open');
        menuBtn?.setAttribute('aria-expanded', 'false');
        window.setTimeout(() => {
            mobileNav.hidden = true;
        }, 180);
    }

    function setupMobileNav() {
        const menuBtn = document.getElementById('menuBtn');
        const mobileNav = document.getElementById('mobileNav');
        if (!menuBtn || !mobileNav) return;

        menuBtn.addEventListener('click', () => {
            const isOpen = menuBtn.getAttribute('aria-expanded') === 'true';
            if (isOpen) {
                closeMobileNav();
                return;
            }

            mobileNav.hidden = false;
            window.requestAnimationFrame(() => {
                mobileNav.classList.add('is-open');
            });
            menuBtn.setAttribute('aria-expanded', 'true');
        });

        document.querySelectorAll('.mobile-link').forEach((link) => {
            link.addEventListener('click', closeMobileNav);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeMobileNav();
        });
    }

    function setupAuth() {
        const form = document.getElementById('authForm') || document.getElementById('loginForm');
        const email = document.getElementById('email');
        const password = document.getElementById('password');
        let authError = form?.querySelector('.auth-error, .auth-feedback') || document.querySelector('.auth-error, .auth-feedback');
        const signInBtn = document.getElementById('signInBtn') || form?.querySelector('button[type="submit"]');
        const entryPoint = form?.querySelector('input[name="entryPoint"]');
        const capsHint = document.getElementById('capsHint');

        if (form && !authError) {
            authError = document.createElement('p');
            authError.className = 'auth-error auth-inline-alert';
            authError.hidden = true;
            authError.setAttribute('role', 'alert');
            form.appendChild(authError);
        }

        document.querySelectorAll('[data-action="open-auth"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                const authShell = document.getElementById('authShell');
                if (!authShell) return;
                event.preventDefault();
                authShell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                email?.focus({ preventScroll: true });
                closeMobileNav();
            });
        });

        const togglePasswordButton = document.querySelector('[data-action="toggle-password"], #showPassword');
        togglePasswordButton?.addEventListener('click', (event) => {
            event.preventDefault();
            if (!password) return;
            const show = password.type === 'password';
            password.type = show ? 'text' : 'password';
            event.currentTarget.textContent = show ? 'Hide' : 'Show';
        });

        password?.addEventListener('keyup', (event) => {
            const isOn = event.getModifierState && event.getModifierState('CapsLock');
            if (capsHint) capsHint.hidden = !isOn;
        });

        password?.addEventListener('blur', () => {
            if (capsHint) capsHint.hidden = true;
        });

        const clearError = () => {
            if (authError) authError.hidden = true;
        };
        email?.addEventListener('input', clearError);
        password?.addEventListener('input', clearError);

        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const emailVal = email?.value.trim() ?? '';
            const passVal = password?.value ?? '';

            if (!emailVal || !passVal) {
                if (authError) {
                    authError.textContent = 'Email and password are required.';
                    authError.hidden = false;
                }
                return;
            }

            if (signInBtn) {
                signInBtn.disabled = true;
                signInBtn.textContent = 'Signing in...';
            }
            setAuthLoading(true, 'Securing your SMART LEAP session...');
            let isRedirecting = false;

            try {
                const response = await fetch(routeUrl('auth/login'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        Accept: 'application/json'
                    },
                    credentials: 'same-origin',
                    body: new URLSearchParams({
                        email: emailVal,
                        password: passVal,
                        entryPoint: entryPoint?.value || 'portal'
                    }).toString()
                });

                const payload = await response.json();
                if (!response.ok || !payload.ok) {
                    if (payload.requiresVerification && payload.redirect) {
                        isRedirecting = true;
                        redirectAfterLoader(payload.redirect);
                        return;
                    }
                    if (authError) {
                        authError.textContent = payload.message || 'Incorrect email or password.';
                        authError.hidden = false;
                    }
                    setAuthLoading(false);
                    return;
                }

                isRedirecting = true;
                redirectAfterLoader(payload.redirect || 'applicant-dashboard#profile-page');
            } catch (error) {
                setAuthLoading(false);
                if (authError) {
                    authError.textContent = 'Unable to sign in right now.';
                    authError.hidden = false;
                }
            } finally {
                if (!isRedirecting && document.visibilityState !== 'hidden') {
                    setAuthLoading(false);
                    if (signInBtn) {
                        signInBtn.disabled = false;
                        signInBtn.textContent = 'Sign in';
                    }
                } else if (!isRedirecting && signInBtn) {
                    signInBtn.disabled = false;
                    signInBtn.textContent = 'Sign in';
                }
                if (isRedirecting) {
                    return;
                }
            }
        });
    }

    function setupFileIntegrityChecks() {
        document.querySelectorAll('input[type="file"]').forEach((input) => {
            input.addEventListener('change', () => {
                checkFileIntegrity(input);
            });
        });
    }

    function setupAccordions() {
        document.querySelectorAll('[data-accordion-trigger]').forEach((trigger) => {
            const panel = trigger.querySelector('[data-accordion-panel]');
            if (!panel) return;

            trigger.addEventListener('click', () => {
                const isOpen = trigger.getAttribute('aria-expanded') === 'true';
                trigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
                trigger.classList.toggle('is-open', !isOpen);
                panel.hidden = isOpen;
            });
        });
    }

    function setupSelectableCards() {
        const cards = Array.from(document.querySelectorAll('[data-select-card]'));
        if (!cards.length) return;

        const activate = (card) => {
            cards.forEach((item) => item.classList.toggle('is-active', item === card));
        };

        cards.forEach((card) => {
            card.addEventListener('click', () => activate(card));
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    activate(card);
                }
            });
        });
    }

    function setupTimelineDetails() {
        const items = Array.from(document.querySelectorAll('[data-timeline-item]'));
        if (!items.length) return;

        const activate = (item) => {
            items.forEach((entry) => entry.classList.toggle('is-active', entry === item));
        };

        items.forEach((item) => {
            item.addEventListener('click', () => activate(item));
            item.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    activate(item);
                }
            });
        });
    }

    function setupScrollReveal() {
        if (document.body.classList.contains('portal-page--signup')) {
            document.querySelectorAll('.auth-card, .portal-reveal').forEach((item) => {
                item.classList.add('is-visible');
            });
            return;
        }

        const revealItems = Array.from(document.querySelectorAll([
            '.home-hero__copy',
            '.auth-card',
            '.portal-section__head',
            '.content-hero__inner',
            '.content-card:not(.portal-static-copy)',
            '.timeline-item',
            '.portal-support-card',
            '.portal-privacy-card',
            '.interactive-card'
        ].join(',')));

        if (!revealItems.length) {
            return;
        }

        if (!('IntersectionObserver' in window)) {
            revealItems.forEach((item) => item.classList.add('portal-reveal', 'is-visible'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                entry.target.classList.toggle('is-visible', entry.isIntersecting);
            });
        }, {
            threshold: 0.18,
            rootMargin: '-8% 0px -8% 0px'
        });

        revealItems.forEach((item) => {
            item.classList.add('portal-reveal');
            observer.observe(item);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupMobileNav();
        setupAuth();
        setupFileIntegrityChecks();
        setupAccordions();
        setupSelectableCards();
        setupTimelineDetails();
        setupScrollReveal();
    });
})();
