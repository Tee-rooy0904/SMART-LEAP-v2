/**
 * SMART LEAP UI/UX Enhancement: Interactive Helpers, Elderly Easy-Read Mode,
 * and Staff Dark Theme Manager
 */
(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // 1. ELDERLY & EASY-READ ACCESSIBILITY CONTROLLER
    // -------------------------------------------------------------------------
    const EASY_READ_STORAGE_KEY = 'smartleap_easy_read_mode';

    function initEasyReadMode() {
        const isEnabled = localStorage.getItem(EASY_READ_STORAGE_KEY) === 'true';
        if (isEnabled) {
            document.body.classList.add('easy-read-mode');
        }

        updateEasyReadToggleButtons(isEnabled);

        document.addEventListener('click', function (event) {
            const toggleBtn = event.target.closest('[data-action="toggle-easy-read"], #easyReadToggle');
            if (!toggleBtn) return;

            event.preventDefault();
            const nowActive = document.body.classList.toggle('easy-read-mode');
            localStorage.setItem(EASY_READ_STORAGE_KEY, nowActive ? 'true' : 'false');
            updateEasyReadToggleButtons(nowActive);

            // Announce to assistive tech
            const liveRegion = document.getElementById('a11yLiveAnnouncer');
            if (liveRegion) {
                liveRegion.textContent = nowActive
                    ? 'Easy read mode enabled with enlarged text and high contrast.'
                    : 'Standard text view restored.';
            }
        });
    }

    function updateEasyReadToggleButtons(isActive) {
        const buttons = document.querySelectorAll('[data-action="toggle-easy-read"], #easyReadToggle');
        buttons.forEach(function (btn) {
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            const label = btn.querySelector('.easy-read-label');
            if (label) {
                label.textContent = isActive ? 'Normal Text' : 'Aa Easy Read';
            }
        });
    }

    // -------------------------------------------------------------------------
    // 2. STAFF DARK MODE CONTROLLER
    // -------------------------------------------------------------------------
    const THEME_STORAGE_KEY = 'smartleap_staff_theme';

    function applyStaffTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (document.body) document.body.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (document.body) document.body.removeAttribute('data-theme');
        }
        updateThemeToggleIcons(theme === 'dark');
    }

    function updateThemeToggleIcons(isDark) {
        const toggleButtons = document.querySelectorAll('[data-action="toggle-theme"], #staffThemeToggle');
        toggleButtons.forEach(function (btn) {
            btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
            btn.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
            btn.innerHTML = isDark
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
        });
    }

    function initStaffTheme() {
        const isStaffPage = document.body && (
            document.body.classList.contains('admin-control-body') ||
            document.body.classList.contains('project-officer-body') ||
            document.body.classList.contains('social-worker-body') ||
            document.querySelector('.admin-shell, .project-officer-shell, .social-worker-shell') !== null
        );

        if (!isStaffPage) return;

        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
        applyStaffTheme(savedTheme);

        document.addEventListener('click', function (event) {
            const btn = event.target.closest('[data-action="toggle-theme"], #staffThemeToggle');
            if (!btn) return;

            event.preventDefault();
            const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

            document.documentElement.classList.add('theme-transitioning');
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
            applyStaffTheme(nextTheme);

            setTimeout(function () {
                document.documentElement.classList.remove('theme-transitioning');
            }, 450);
        });
    }

    // -------------------------------------------------------------------------
    // 3. FORM FEEDBACK & ERROR SHAKE
    // -------------------------------------------------------------------------
    function initFormFeedback() {
        // Observe error messages or alert boxes being revealed or inserted
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
                    const target = mutation.target;
                    if (!target.hidden && (target.classList.contains('auth-error') || target.classList.contains('alert-danger') || target.id === 'authError')) {
                        target.classList.remove('auth-error-shake');
                        void target.offsetWidth;
                        target.classList.add('auth-error-shake');
                    }
                } else if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1 && (node.classList.contains('auth-inline-alert') || node.classList.contains('alert-danger') || node.classList.contains('auth-error'))) {
                            node.classList.remove('auth-error-shake');
                            void node.offsetWidth;
                            node.classList.add('auth-error-shake');
                        }
                    });
                }
            });
        });

        document.querySelectorAll('.auth-error, #authError, [role="alert"]').forEach(function (el) {
            observer.observe(el, { attributes: true });
        });

        document.querySelectorAll('form').forEach(function (form) {
            observer.observe(form, { childList: true });
        });
    }

    // -------------------------------------------------------------------------
    // 4. SMOOTH TAB AND HASH NAVIGATION
    // -------------------------------------------------------------------------
    function initSmoothNavigation() {
        function triggerActiveSectionAnimation() {
            const hash = window.location.hash;
            if (!hash) return;
            const targetSection = document.querySelector(hash);
            if (targetSection && (targetSection.classList.contains('dash-section') || targetSection.classList.contains('tab-pane'))) {
                targetSection.classList.remove('fade-slide-in');
                void targetSection.offsetWidth;
                targetSection.classList.add('fade-slide-in');
            }
        }

        window.addEventListener('hashchange', triggerActiveSectionAnimation);
    }

    // -------------------------------------------------------------------------
    // INITIALIZATION
    // -------------------------------------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initEasyReadMode();
            initStaffTheme();
            initFormFeedback();
            initSmoothNavigation();
        });
    } else {
        initEasyReadMode();
        initStaffTheme();
        initFormFeedback();
        initSmoothNavigation();
    }
})();
