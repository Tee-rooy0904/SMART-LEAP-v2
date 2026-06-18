(function () {
    // Auth bootstrap from the server-rendered beneficiary shell.
    const AUTH_USER = window.SMARTLEAP_AUTH_USER || null;
    // Legacy local-storage keys kept for beneficiary-side repayment state compatibility.
    const STORAGE_KEYS = {
        payments: 'smartleap_beneficiary_payments_v1',
        submissions: 'smartleap_beneficiary_submissions_v1',
    };
    // Repayment plan constants used by tracker math and upload validation.
    const PROFILE_PHOTO_MAX_SIZE = 5 * 1024 * 1024;
    const PORTAL_LOADER_MIN_MS = 3000;
    const REPAYMENT_PLAN_MONTHS = 24;
    const MONTHLY_REPAYMENT_AMOUNT = 625;
    const TOTAL_REPAYMENT_AMOUNT = REPAYMENT_PLAN_MONTHS * MONTHLY_REPAYMENT_AMOUNT;
    const SUPPORTED_PROOF_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];
    const SUPPORTED_PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
    const OVERVIEW_ACTION_MOBILE_QUERY = window.matchMedia ? window.matchMedia('(max-width: 720px)') : null;
    window.addEventListener('resize', () => {
        enhancePortalSelects();
        syncPortalSelects();
    });

    // Working user snapshot used throughout profile, repayment, support, and activity rendering.
    let user = {
        id: AUTH_USER?.id || null,
        name: AUTH_USER?.name || '',
        fullName: AUTH_USER?.name || '',
        email: AUTH_USER?.email || '',
        role: AUTH_USER?.role || 'Benepisyaryo'
    };
    // Beneficiary-side state for payments, feedback, notifications, and hydrated backend records.
    let payments = [];
    let groupedSubmissions = [];
    let feedbackEntries = [];
    let applicationRecord = null;
    let beneficiaryRecord = null;
    let repaymentAccount = null;
    let notifications = [];
    let beneficiaryId = Number(AUTH_USER?.id || 0) || null;
    let roleView = 'beneficiary';
    let loaderStartedAt = Date.now();
    let supportRecipient = 'social_worker';
    let supportChatTimer = null;
    let portalSelectsBound = false;

    const REQUIREMENT_ITEMS = [
        { key: 'validId', label: 'Valid ID' },
        { key: 'healthSertipiko', label: 'Health Sertipiko' },
        { key: 'cedula', label: 'Cedula' },
        { key: 'mungkahingProyekto', label: 'Project proposal' },
        { key: 'businessPlan', label: 'Business plan' },
        { key: 'individualProfile', label: 'Individual profile' },
        { key: 'availmentForm', label: 'Availment form' },
        { key: 'validationForm', label: 'Validation form' }
    ];

    document.addEventListener('DOMContentLoaded', init);

    // Load cached state, hydrate from the backend, then bind controls and render the full portal.
    async function init() {
        loadState();
        await hydrateBackendState();
        bindEvents();
        renderAll();
        markPortalReady();
    }

    function publicBase() {
        const match = window.location.pathname.match(/^(.*\/public)(?:\/.*)?$/);
        return match ? match[1] : '';
    }

    // Resolve beneficiary dashboard endpoints relative to the public-facing portal base.
    function routeUrl(path) {
        const trimmed = String(path || '').replace(/^\/+/, '');
        return `${publicBase()}/${trimmed}`;
    }

    // Load the latest beneficiary, repayment, feedback, and notification data from the server.
    async function hydrateBackendState() {
        try {
            const response = await fetch(routeUrl('beneficiary-dashboard/state'), {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin'
            });
            const payload = await response.json();
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || 'Unable to load beneficiary state.');
            }
            applyBackendState(payload.data || {});
        } catch (error) {
            console.warn('Unable to hydrate beneficiary state', error);
        }
    }

    function applyBackendState(data) {
        if (!data || typeof data !== 'object') {
            return;
        }

        if (data.user) {
            user = {
                ...user,
                id: data.user.id || user.id || null,
                name: data.user.name || user.name || '',
                fullName: data.user.name || user.fullName || user.name || '',
                email: data.user.email || user.email || '',
                role: data.user.role || user.role || 'Benepisyaryo',
                photo: data.user.photo || user.photo || null
            };
            beneficiaryId = Number(user?.id || 0) || null;
        }

        if (data.profile) {
            user = {
                ...user,
                businessName: data.profile.businessName || user.businessName || '',
                barangay: data.profile.barangay || user.barangay || '',
                contactNumber: data.profile.contactNumber || user.contactNumber || '',
                contact: data.profile.contactNumber || user.contact || '',
                address: data.profile.address || user.address || '',
                birthdate: data.profile.birthdate || user.birthdate || '',
                age: data.profile.age || user.age || '',
                gender: data.profile.gender || user.gender || '',
                is4ps: data.profile.is4ps || user.is4ps || '',
                educationalAttainment: data.profile.educationalAttainment || user.educationalAttainment || '',
                sector: data.profile.sector || user.sector || '',
                sectorOtherSpecify: data.profile.sectorOtherSpecify || user.sectorOtherSpecify || '',
                batchNo: data.profile.batchNo || user.batchNo || '',
                livelihoodCategory: data.profile.livelihoodCategory || user.livelihoodCategory || '',
                livelihood: data.profile.livelihood || user.livelihood || ''
            };
        }

        applicationRecord = data.application || applicationRecord;
        beneficiaryRecord = {
            ...(beneficiaryRecord || {}),
            ...(data.beneficiary || {}),
            profile: data.profile || beneficiaryRecord?.profile || null,
        };
        beneficiaryId = Number(data.beneficiary?.id || user?.id || 0) || null;
        if (data.repayments && typeof data.repayments === 'object') {
            payments = normalizePayments(data.repayments.payments || []);
            groupedSubmissions = normalizeGroupedSubmissions(data.repayments.submissions || []);
            repaymentAccount = data.repayments.account && typeof data.repayments.account === 'object'
                ? data.repayments.account
                : null;
            clearLegacyRepaymentStorage();
        }

        if (Array.isArray(data.feedback)) {
            feedbackEntries = data.feedback
                .filter((entry) => entry && typeof entry === 'object')
                .map((entry) => ({
                    id: Number(entry.id || 0) || null,
                    message: String(entry.message || '').trim(),
                    timestamp: entry.timestamp || entry.createdAt || ''
                }))
                .filter((entry) => entry.message !== '');
            clearLegacyFeedbackStorage();
        }

        if (Array.isArray(data.notifications)) {
            notifications = data.notifications.slice();
            clearLegacyNotificationsStorage();
        }
    }

    function loadState() {
        user = {
            ...user,
            id: AUTH_USER?.id || user.id || null,
            name: AUTH_USER?.name || user.name || '',
            fullName: AUTH_USER?.name || user.fullName || user.name || '',
            email: AUTH_USER?.email || user.email || '',
            role: AUTH_USER?.role || user.role || 'Benepisyaryo'
        };
        beneficiaryRecord = null;
        applicationRecord = null;
        roleView = 'beneficiary';
        beneficiaryId = Number(user?.id || 0) || null;

        payments = [];
        groupedSubmissions = [];
        repaymentAccount = null;

        feedbackEntries = [];

        notifications = [];

    }

    async function postJson(path, payload) {
        const response = await fetch(routeUrl(path), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json;charset=UTF-8'
            },
            credentials: 'same-origin',
            body: JSON.stringify(payload || {})
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
            throw new Error(result.message || 'Unable to save the repayment record.');
        }
        return result;
    }

    async function fetchJson(path) {
        const response = await fetch(routeUrl(path), {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
            throw new Error(result.message || 'Unable to load data.');
        }
        return result;
    }

    function clearLegacyRepaymentStorage() {
        try {
            localStorage.removeItem(STORAGE_KEYS.payments);
            localStorage.removeItem(STORAGE_KEYS.submissions);
        } catch (error) {
            console.warn('Unable to clear legacy repayment storage', error);
        }
    }

    function clearLegacyFeedbackStorage() {
        try {
            localStorage.removeItem('smartleap_beneficiary_feedback_v1');
        } catch (error) {
            console.warn('Unable to clear legacy feedback storage', error);
        }
    }

    function clearLegacyNotificationsStorage() {
        try {
            localStorage.removeItem('smartleap_user_notifications_v1');
        } catch (error) {
            console.warn('Unable to clear legacy notifications storage', error);
        }
    }

    function bindEvents() {
        document.getElementById('uploadForm')?.addEventListener('submit', handleUploadSubmit);
        document.getElementById('feedbackForm')?.addEventListener('submit', handleFeedbackSubmit);
        document.getElementById('supportChatForm')?.addEventListener('submit', handleSupportChatSubmit);
        document.querySelectorAll('[data-support-recipient]').forEach((button) => {
            button.addEventListener('click', () => {
                supportRecipient = button.dataset.supportRecipient || 'social_worker';
                document.querySelectorAll('[data-support-recipient]').forEach((item) => {
                    item.classList.toggle('is-active', item === button);
                });
                loadSupportChat();
            });
        });
        document.getElementById('beneficiaryProfileForm')?.addEventListener('submit', handleBeneficiaryProfileSubmit);
        document.getElementById('beneficiaryProfileForm')?.addEventListener('input', handleBeneficiaryProfileStateChange);
        document.getElementById('beneficiaryProfileForm')?.addEventListener('change', handleBeneficiaryProfileStateChange);
        document.getElementById('profilePhotoInput')?.addEventListener('change', handleProfilePhotoChange);
        document.getElementById('beneficiaryBirthdate')?.addEventListener('change', handleBeneficiaryBirthdateChange);
        document.getElementById('beneficiaryProfileBack')?.addEventListener('click', () => {
            window.location.hash = '#overview';
            applyRouteVisibility();
        });
        document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
        document.getElementById('mobileAccountLogout')?.addEventListener('click', handleLogout);
        document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebarMenu);
        document.getElementById('sidebarClose')?.addEventListener('click', closeSidebarMenuOnMobile);
        document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebarMenuOnMobile);
        document.getElementById('mobileAccountToggle')?.addEventListener('click', toggleMobileAccountMenu);
        document.getElementById('mobileAccountProfile')?.addEventListener('click', () => {
            closeMobileAccountMenu();
            window.location.hash = '#profile';
            applyRouteVisibility();
        });
        document.getElementById('mobileAccountPassword')?.addEventListener('click', () => {
            closeMobileAccountMenu();
            openChangePasswordModal();
        });
        document.getElementById('historyFilterStatus')?.addEventListener('change', renderHistory);
        document.getElementById('historyFilterMonth')?.addEventListener('change', renderHistory);
        document.getElementById('historyTableBody')?.addEventListener('click', handleHistoryTableClick);
        document.getElementById('historyCardList')?.addEventListener('click', handleHistoryTableClick);
        document.getElementById('repaymentDueList')?.addEventListener('click', handleRepaymentDueAction);
        document.getElementById('uploadMonth')?.addEventListener('change', syncRepaymentMode);
        document.getElementById('overviewRepaymentsBtn')?.addEventListener('click', () => {
            routeToRepayments(document.getElementById('overviewRepaymentsBtn')?.dataset.target || 'upload');
        });
        document.getElementById('overviewUploadReceiptBtn')?.addEventListener('click', () => {
            routeToRepayments('upload');
        });
        document.getElementById('overviewViewRecordsBtn')?.addEventListener('click', () => {
            routeToRepayments('history');
        });
        document.getElementById('overviewSupportBtn')?.addEventListener('click', () => {
            window.location.hash = '#support-feedback';
            applyRouteVisibility();
        });
        document.addEventListener('click', (event) => {
            const mobileMenu = document.getElementById('mobileAccountMenu');
            const clickedInsideAccount = event.target.closest('.mobile-topbar__account')
                || (mobileMenu && mobileMenu.contains(event.target));
            if (!clickedInsideAccount) {
                closeMobileAccountMenu();
            }
            if (!event.target.closest('[data-select-root]')) {
                closeAllCustomSelects();
            }
            if (!event.target.closest('[data-portal-select-root]')) {
                closeAllPortalSelects();
            }
        });
        document.addEventListener('keydown', handleCustomSelectKeydown);
        document.addEventListener('smartleap:notifications-toggle', (event) => {
            if (event.detail?.open) {
                closeMobileAccountMenu();
            }
        });
        document.querySelectorAll('[data-select-root]').forEach(setupCustomSelect);
        enhancePortalSelects();
        document.querySelectorAll('.sidebar-link, .beneficiary-tabbar__link').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const targetId = (link.getAttribute('href') || '').replace('#', '');
                if (targetId) {
                    window.location.hash = `#${targetId}`;
                    applyRouteVisibility();
                    closeSidebarMenuOnMobile();
                }
            });
        });

        initRouting();
        initializeRepaymentWorkspace();
        syncOverviewPrimaryActionPlacement();
        syncMobileAccountMenuLayer();
        OVERVIEW_ACTION_MOBILE_QUERY?.addEventListener?.('change', syncOverviewPrimaryActionPlacement);
        window.addEventListener('resize', syncMobileAccountMenuLayer);
    }

    function syncOverviewPrimaryActionPlacement() {
        const button = document.getElementById('overviewRepaymentsBtn');
        const mobileActions = document.getElementById('overviewBalanceActions');
        const desktopActions = document.getElementById('overviewProgressActions');
        if (!button || !mobileActions || !desktopActions) {
            return;
        }

        const useMobilePlacement = Boolean(OVERVIEW_ACTION_MOBILE_QUERY?.matches);
        if (useMobilePlacement) {
            if (button.parentElement !== mobileActions) {
                mobileActions.appendChild(button);
            }
            desktopActions.classList.add('is-relocated');
            return;
        }

        if (button.parentElement !== desktopActions) {
            desktopActions.appendChild(button);
        }
        desktopActions.classList.remove('is-relocated');
    }

    function setupCustomSelect(root) {
        const native = root?.querySelector('select');
        const trigger = root?.querySelector('[data-select-trigger]');
        const menu = root?.querySelector('[data-select-menu]');
        const options = Array.from(root?.querySelectorAll('[data-select-option]') || []);
        if (!root || !native || !trigger || !menu || !options.length) {
            return;
        }

        const sync = () => syncCustomSelect(root);
        trigger.addEventListener('click', () => {
            const isOpen = root.classList.contains('is-open');
            closeAllCustomSelects();
            closeAllPortalSelects();
            if (!isOpen) {
                root.classList.add('is-open');
                trigger.setAttribute('aria-expanded', 'true');
                menu.setAttribute('aria-hidden', 'false');
                syncMobileSelectOpenState();
            }
        });

        options.forEach((option) => {
            option.addEventListener('click', () => {
                native.value = option.dataset.value || '';
                native.dispatchEvent(new Event('change', { bubbles: true }));
                sync();
                closeAllCustomSelects();
                trigger.focus();
            });
        });

        native.addEventListener('change', sync);
        sync();
    }

    function syncCustomSelect(root) {
        const native = root?.querySelector('select');
        const label = root?.querySelector('[data-select-label]');
        const options = Array.from(root?.querySelectorAll('[data-select-option]') || []);
        if (!native || !label) {
            return;
        }
        const selectedOption = options.find((option) => option.dataset.value === native.value) || options[0];
        label.textContent = selectedOption?.textContent?.trim() || '';
        options.forEach((option) => {
            const isSelected = option === selectedOption;
            option.classList.toggle('is-selected', isSelected);
            option.setAttribute('aria-selected', String(isSelected));
        });
    }

    function closeAllCustomSelects() {
        document.querySelectorAll('[data-select-root].is-open').forEach((root) => {
            root.classList.remove('is-open');
            root.querySelector('[data-select-trigger]')?.setAttribute('aria-expanded', 'false');
            root.querySelector('[data-select-menu]')?.setAttribute('aria-hidden', 'true');
        });
        syncMobileSelectOpenState();
    }

    function handleCustomSelectKeydown(event) {
        if (event.key === 'Escape') {
            closeAllCustomSelects();
            closeAllPortalSelects();
        }
    }

    function isMobileSelectViewport() {
        return window.matchMedia('(max-width: 960px)').matches;
    }

    function enhancePortalSelects() {
        if (!isMobileSelectViewport()) return;

        if (!portalSelectsBound) {
            portalSelectsBound = true;
        }

        document.querySelectorAll('select').forEach((native) => {
            if (native.closest('[data-select-root]') || native.closest('[data-portal-select-root]') || native.multiple) {
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
            trigger.dataset.portalSelectTrigger = 'true';
            trigger.setAttribute('aria-expanded', 'false');

            const label = document.createElement('span');
            label.className = 'portal-select__label';
            label.dataset.portalSelectLabel = 'true';
            trigger.appendChild(label);

            const menu = document.createElement('div');
            menu.className = 'portal-select__menu';
            menu.dataset.portalSelectMenu = 'true';
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
                closeAllCustomSelects();
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
        const hasOpenSelect = Boolean(document.querySelector('[data-select-root].is-open, [data-portal-select-root].is-open'));
        document.body.classList.toggle('mobile-select-open', hasOpenSelect);
    }

    function toggleSidebarMenu() {
        const sidebar = document.querySelector('.dash-sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const toggle = document.getElementById('sidebarToggle');
        if (!sidebar) return;

        closeMobileAccountMenu();
        const isOpen = !sidebar.classList.contains('is-open');
        sidebar.classList.toggle('is-open', isOpen);
        overlay?.classList.toggle('is-visible', isOpen);
        toggle?.setAttribute('aria-expanded', String(isOpen));
    }

    function closeSidebarMenuOnMobile() {
        const sidebar = document.querySelector('.dash-sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const toggle = document.getElementById('sidebarToggle');
        sidebar?.classList.remove('is-open');
        overlay?.classList.remove('is-visible');
        toggle?.setAttribute('aria-expanded', 'false');
    }

    function initializeRepaymentWorkspace() {
        syncRepaymentMode();
    }

    // Repaint the full beneficiary portal after state changes or after fresh data arrives.
    function renderAll() {
        renderUser();
        applyRoleVisibility();
        renderSummary();
        renderOverview();
        renderRequirements();
        renderNotifications();
        renderProfileEditor();
        renderBeneficiaryProfile();
        if (roleView === 'beneficiary') {
            renderProgress();
            renderHistory();
            renderFeedback();
            renderAudit();
        }
        loadSupportChat(true);
        startSupportChatPolling();
    }

    function renderUser() {
        const name = user.fullName || user.name || 'Benepisyaryo';
        const isCoMaker = isCoMakerPortal();
        const business = isCoMaker
            ? [
                beneficiaryRecord?.relationshipToPrimaryBeneficiary,
                beneficiaryRecord?.primaryBeneficiaryName ? `Paying for ${beneficiaryRecord.primaryBeneficiaryName}` : '',
            ].filter(Boolean).join(' | ')
            : (user.businessName
                || user.business
                || applicationRecord?.businessName
                || applicationRecord?.profile?.businessName
                || beneficiaryRecord?.businessName
                || beneficiaryRecord?.businessType
                || applicationRecord?.businessType
                || user.barangay
                || user.location
                || (roleView === 'applicant' ? 'Profile sa aplikante' : '')
                || 'No business recorded');
        const firstName = (name || '').split(' ')[0] || name || 'Benepisyaryo';
        const avatarInitial = (name || 'B').trim().charAt(0)?.toUpperCase() || 'B';
        const photo = getStoredProfilePhoto(user);

        setText('bannerGreeting', '');
        setText('userEmail', '');
        setText('sidebarUserName', name);
        setText('sidebarUserBusiness', business || 'No business recorded');
        setText('mobileAccountName', firstName || name || 'Benepisyaryo');
        setAvatarNode(document.getElementById('bannerAvatar'), avatarInitial, photo);
        setAvatarNode(document.getElementById('sidebarAvatar'), avatarInitial, photo);
        setMobileAvatar(avatarInitial, photo);
    }

    function isCoMakerPortal() {
        return roleView === 'beneficiary' && Boolean(beneficiaryRecord?.isCoMaker);
    }

    function setBeneficiaryFieldVisibility(element, visible) {
        if (!element) return;
        element.hidden = !visible;
        element.querySelectorAll('input, select, textarea, button').forEach((control) => {
            if (!Object.prototype.hasOwnProperty.call(control.dataset, 'originalRequired')) {
                control.dataset.originalRequired = control.required ? 'true' : 'false';
            }
            if (!Object.prototype.hasOwnProperty.call(control.dataset, 'originalDisabled')) {
                control.dataset.originalDisabled = control.disabled ? 'true' : 'false';
            }
            control.disabled = visible ? control.dataset.originalDisabled === 'true' : true;
            control.required = visible ? control.dataset.originalRequired === 'true' : false;
        });
    }

    function getRepaymentMetrics() {
        const scheduleItems = getRepaymentScheduleItems();
        const displayPayments = getDisplayPayments();
        const verifiedPayments = displayPayments.filter((p) => mapPaymentStage(p.stage) === 'verified');
        const pendingPayments = displayPayments.filter((p) => mapPaymentStage(p.stage) === 'pending');
        const uploadedPayments = displayPayments.filter((p) => mapPaymentStage(p.stage) === 'uploaded');
        const totalVerifiedAmount = verifiedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const outstanding = Math.max(TOTAL_REPAYMENT_AMOUNT - totalVerifiedAmount, 0);
        const verifiedMonths = verifiedPayments.length;
        const repaymentRate = Math.round((verifiedMonths / REPAYMENT_PLAN_MONTHS) * 100);
        const rateDisplay = Math.min(100, Math.max(0, repaymentRate));
        const actionItems = scheduleItems.filter((item) => item.actionable);
        const nextPending = actionItems[0] || scheduleItems.find((item) => !['verified', 'pending_review'].includes(item.state)) || null;
        const nextDue = nextPending ? formatMonth(padMonth(nextPending.month)) : 'Nahuman';
        const overdueCount = scheduleItems.filter((item) => item.state === 'overdue').length;
        const pendingCount = pendingPayments.length;
        const uploadedCount = uploadedPayments.length;
        const pendingVerificationCount = pendingCount + uploadedCount;
        const percent = Math.round((verifiedMonths / REPAYMENT_PLAN_MONTHS) * 100);
        const nextAmount = nextPending ? formatCurrency(nextPending.amount || MONTHLY_REPAYMENT_AMOUNT) : formatCurrency(0);

        let statusLabel = 'Active beneficiary';
        let heroTitle = 'Upload your latest receipt';
        let heroCopy = 'Submit your next OR.';
        let reminder = 'Prepare your next OR.';
        let primaryActionLabel = 'Upload receipt';
        let primaryActionTarget = 'upload';

        if (overdueCount > 0) {
            statusLabel = 'Overdue payment';
            heroTitle = 'Submit late payment';
            heroCopy = nextPending ? `${formatMonth(padMonth(nextPending.month))} is overdue and needs proof.` : 'An overdue payment needs proof.';
            reminder = nextPending
                ? `Submit late payment for ${formatMonth(padMonth(nextPending.month))}.`
                : 'Submit the missing late payment as soon as possible.';
            primaryActionLabel = 'Submit late payment';
            primaryActionTarget = 'upload';
        } else if (pendingVerificationCount > 0) {
            statusLabel = 'Pending verification';
            heroTitle = 'Receipt under verification';
            heroCopy = 'Wait for review.';
            reminder = 'A receipt is already under review.';
            primaryActionLabel = 'View repayments';
            primaryActionTarget = 'repayments';
        } else if (verifiedMonths > 0) {
            statusLabel = 'On track';
            heroTitle = nextPending ? 'Upload your latest receipt' : 'Account on track';
            heroCopy = nextPending ? `Next due ${formatMonth(padMonth(nextPending.month))}.` : 'All uploaded receipts are clear.';
            reminder = nextPending ? `Next due ${formatMonth(padMonth(nextPending.month))}.` : 'No pending OR uploads right now.';
            if (!nextPending) {
                primaryActionLabel = 'View repayments';
                primaryActionTarget = 'repayments';
            }
        } else {
            heroTitle = 'Upload your latest receipt';
            heroCopy = 'Start your repayment record with your first OR.';
        }

        return {
            outstanding,
            verifiedMonths,
            pendingCount,
            uploadedCount,
            pendingVerificationCount,
            overdueCount,
            nextPending,
            nextDue,
            nextAmount,
            scheduleItems,
            rateDisplay,
            percent,
            statusLabel,
            heroTitle,
            heroCopy,
            reminder,
            primaryActionLabel,
            primaryActionTarget,
            programLabel: verifiedMonths > 0 || pendingCount > 0 || uploadedCount > 0 ? 'Released' : 'Active beneficiary',
        };
    }

    function getBeneficiaryAttentionSummary(metrics) {
        if (metrics.overdueCount > 0) {
            return { title: `${metrics.overdueCount} item${metrics.overdueCount === 1 ? '' : 's'} need action`, meta: 'Overdue receipts need action.' };
        }
        if (metrics.pendingCount > 0 || metrics.uploadedCount > 0) {
            return { title: 'Awaiting verification', meta: 'A receipt is waiting for review.' };
        }
        return { title: 'No issues', meta: 'No active repayment issues.' };
    }

    function buildOverviewUpdates(metrics) {
        const reminder = metrics.nextPending
            ? (metrics.overdueCount > 0
                ? `Upload the OR for ${formatMonth(padMonth(metrics.nextPending.month))}.`
                : `Next due ${formatMonth(padMonth(metrics.nextPending.month))}.`)
            : 'No due month queued.';
        const verification = metrics.pendingVerificationCount > 0
            ? `${formatCount(metrics.pendingVerificationCount, 'receipt')} waiting for review.`
            : 'No receipts pending verification.';
        const support = repaymentAccount?.isRepaymentSuccessor
            ? `You are paying for the account of ${String(repaymentAccount.replacementForName || 'the linked deceased beneficiary')}. Open Support for repayment help if needed.`
            : 'Open Support for Social Worker help with repayments, corrections, or verification concerns.';
        return { reminder, verification, support };
    }

    function getSocialWorkerSupportContact() {
        const sources = [
            applicationRecord?.socialWorker,
            applicationRecord?.assignedSocialWorker,
            beneficiaryRecord?.socialWorker,
            beneficiaryRecord?.assignedSocialWorker,
            beneficiaryRecord?.supportContact,
            user?.socialWorker,
        ];
        const contact = sources.find((item) => item && typeof item === 'object') || {};

        return {
            name: contact.name || contact.fullName || contact.full_name || 'SMART LEAP Social Worker',
            email: contact.email || contact.contact || contact.contactNumber || 'sw@smartleap.local',
        };
    }

    function renderSummary() {
        if (roleView === 'beneficiary') {
            const metrics = getRepaymentMetrics();

            setText('bannerLabelOutstanding', 'Current balance');
            setText('bannerLabelProgress', 'Payment progress');
            setText('bannerLabelNextDue', 'Pending verification');
            setText('bannerLabelRate', 'Aksyon sa repayment');
            setText('bannerOutstanding', formatCurrency(metrics.outstanding));
            setText('bannerProgress', `${metrics.verifiedMonths}/${REPAYMENT_PLAN_MONTHS} months`);
            setText('bannerNextDue', formatCount(metrics.pendingVerificationCount, 'receipt'));
            setText('bannerRate', `${metrics.rateDisplay}% complete`);

            setText('supportNextDue', metrics.nextDue);
            setText('supportOutstanding', `Unpaid ${formatCurrency(metrics.outstanding)}`);
            setText('supportRate', `Completion ${metrics.rateDisplay}%`);
            setText('supportStanding', metrics.statusLabel);
            return;
        }

        const requirementSummary = (!applicationRecord && !beneficiaryRecord)
            ? { completed: 0, total: 8, issueCount: 0 }
            : calculateRequirementSummary(applicationRecord, beneficiaryRecord);
        const completed = requirementSummary.completed;
        const total = requirementSummary.total || 8;
        const statusLabel = requirementSummary.issueCount > 0
            ? 'Action needed'
            : completed >= total
                ? 'Ready for approval'
                : 'Pending review';
        setText('bannerLabelOutstanding', 'Requirement status');
        setText('bannerLabelProgress', 'Mga Kinahanglanon progress');
        setText('bannerLabelNextDue', 'Current stage');
        setText('bannerLabelRate', 'Approval status');
        setText('bannerOutstanding', `${completed}/${total} submitted`);
        setText('bannerProgress', `${completed}/${total} complete`);
        setText('bannerNextDue', statusLabel);
        setText('bannerRate', statusLabel);
    }

    function renderProgress() {
        const metrics = getRepaymentMetrics();
        const displayPayments = getDisplayPayments();
        const submittedCount = displayPayments.length;
        const pendingVerificationCount = metrics.pendingCount + metrics.uploadedCount;
        const followUpCount = displayPayments.filter((payment) => {
            const stage = mapPaymentStage(payment.stage);
            return stage === 'needs_correction' || stage === 'rejected';
        }).length;

        const fill = document.getElementById('progressFill');
        if (fill) {
            fill.style.width = `${Math.min(100, metrics.percent)}%`;
            fill.parentElement?.setAttribute('aria-valuenow', String(metrics.percent));
        }
        setText('progressVerified', `${metrics.verifiedMonths} months verified`);
        setText('progressPending', `${pendingVerificationCount} awaiting review`);
        setText('progressUploaded', `${metrics.uploadedCount} submitted online`);
        setText('progressOverdue', `${metrics.overdueCount} need follow-up`);
        setText('repaymentStandingOutstanding', metrics.nextDue || 'Nahuman');
        setText('repaymentStandingVerified', formatCount(followUpCount, 'issue'));
        setText('repaymentStandingPending', formatCount(pendingVerificationCount, 'receipt'));
        setText('repaymentStandingOverdue', formatCount(submittedCount, 'receipt'));
        setText('repaymentStandingTitle', 'Kinahanglan follow-up');
        setText('repaymentStandingCopy', followUpCount > 0 ? `${formatCount(followUpCount, 'issue')} need follow-up.` : 'No follow-up needed.');
        document.getElementById('repaymentStandingVerified')?.closest('.overview-card')?.classList.toggle('has-follow-up', followUpCount > 0);
        renderRepaymentDueList(metrics.scheduleItems);
        syncRepaymentMode();
    }

    function renderRepaymentDueList(items = getRepaymentScheduleItems()) {
        const root = document.getElementById('repaymentDueList');
        if (!root) return;
        const visible = items.filter((item) => item.state !== 'verified').slice(0, 6);
        if (!visible.length) {
            root.innerHTML = '<div class="repayment-due-list__empty">No repayment due items need action right now.</div>';
            return;
        }

        root.innerHTML = visible.map((item) => {
            const payment = item.payment || null;
            const status = repaymentScheduleStatus(item);
            const action = item.actionable
                ? `<button type="button" class="btn-outline small" data-repayment-due-action="${escapeHtml(item.month)}">${item.isOverdue ? (item.state === 'needs_correction' ? 'Submit New Late Receipt' : 'Submit Late Payment') : (item.state === 'needs_correction' ? 'Submit New Receipt' : 'Submit Payment')}</button>`
                : payment
                    ? '<span class="repayment-due-list__locked">Awaiting review</span>'
                    : '';
            return `
                <article class="repayment-due-item ${item.isOverdue ? 'is-overdue' : ''}">
                    <div>
                        <span class="repayment-due-item__label">${item.isOverdue ? 'Overdue month' : 'Due month'}</span>
                        <strong>${escapeHtml(formatMonth(padMonth(item.month)))}</strong>
                        <small>${escapeHtml(status.helper)}</small>
                    </div>
                    <span class="status-badge ${status.className}">${escapeHtml(status.label)}</span>
                    ${action}
                </article>
            `;
        }).join('');
    }

    function renderHistory() {
        const tbody = document.getElementById('historyTableBody');
        const cardList = document.getElementById('historyCardList');
        const counter = document.getElementById('historyCounter');
        if (!tbody) return;

        const displayPayments = getDisplayPayments();
        const verifiedCount = displayPayments.filter((p) => mapPaymentStage(p.stage) === 'verified').length;
        const pendingCount = displayPayments.filter((p) => mapPaymentStage(p.stage) === 'pending').length;
        const uploadedCount = displayPayments.filter((p) => mapPaymentStage(p.stage) === 'uploaded').length;
        setText('historyVerifiedCount', formatCount(verifiedCount, 'receipt'));
        setText('historyPendingCount', formatCount(pendingCount, 'receipt'));
        setText('historyUploadedCount', formatCount(uploadedCount, 'receipt'));

        tbody.innerHTML = '';
        if (!displayPayments.length) {
            tbody.innerHTML = '<tr class="empty"><td colspan="6">No receipts yet. Log the first OR to begin.</td></tr>';
            if (cardList) {
                cardList.innerHTML = '<article class="history-card history-card--empty">No receipts yet. Log the first OR to begin.</article>';
            }
            counter && (counter.textContent = '0 receipts');
            return;
        }

        const statusFilter = (document.getElementById('historyFilterStatus')?.value || '').toLowerCase();
        const monthFilter = document.getElementById('historyFilterMonth')?.value || '';
        const filtered = displayPayments.filter((payment) => {
            const status = mapPaymentStage(payment.stage);
            const statusMatch = !statusFilter || status === statusFilter;
            const monthMatch = !monthFilter || (payment.month || '') === monthFilter;
            return statusMatch && monthMatch;
        });

        const sorted = filtered.slice().sort((a, b) => (b.month || '').localeCompare(a.month || ''));
        const rows = sorted
            .map((payment) => {
                const statusInfo = getPaymentStatus(payment);
                const stage = mapPaymentStage(payment.stage);
                const proof = payment.proof || '';
                const proofName = payment.proofName ? escapeHtml(payment.proofName) : 'View file';
                const proofAction = proof
                    ? `<button type="button" class="btn-outline small" data-action="view-proof" data-proof="${escapeHtml(proof)}" data-proof-name="${proofName}">${proofName}</button>`
                    : '<span class="muted">No file</span>';
                const remarks = buildPaymentRemarks(payment);
                const reviewNote = buildPaymentReviewNote(payment);
                const followUpAction = stage === 'needs_correction' || stage === 'rejected'
                    ? '<div class="history-followup"><button type="button" class="btn-outline small history-followup-action" data-action="fix-receipt">Replace this receipt</button><p class="history-followup-hint">Open Repayments to upload a new receipt for this month.</p></div>'
                    : '';
                return `
                <tr>
                    <td>${formatMonth(padMonth(payment.month))}</td>
                    <td>${formatDate(payment.paymentDate)}</td>
                    <td>${formatCurrency(payment.amount)}</td>
                    <td><span class="status-badge ${statusInfo.className}">${statusInfo.label}</span></td>
                    <td>${proofAction}</td>
                    <td><div class="history-review-note">${escapeHtml(reviewNote)}</div><div class="history-remarks-note">${escapeHtml(remarks)}</div>${followUpAction}</td>
                </tr>`;
            })
            .join('');
        const cards = sorted
            .map((payment) => {
                const statusInfo = getPaymentStatus(payment);
                const stage = mapPaymentStage(payment.stage);
                const proof = payment.proof || '';
                const proofName = payment.proofName ? escapeHtml(payment.proofName) : 'View file';
                const proofAction = proof
                    ? `<button type="button" class="btn-outline small" data-action="view-proof" data-proof="${escapeHtml(proof)}" data-proof-name="${proofName}">${proofName}</button>`
                    : '<span class="muted">No file</span>';
                const remarks = buildPaymentRemarks(payment);
                const reviewNote = buildPaymentReviewNote(payment);
                const followUpAction = stage === 'needs_correction' || stage === 'rejected'
                    ? '<div class="history-card__followup"><button type="button" class="btn-outline small history-followup-action" data-action="fix-receipt">Replace this receipt</button><p class="history-followup-hint">Open Repayments to upload a new receipt for this month.</p></div>'
                    : '';
                return `
                <article class="history-card">
                    <div class="history-card__top">
                        <div>
                            <span class="history-card__label">Month</span>
                            <strong class="history-card__value">${formatMonth(padMonth(payment.month))}</strong>
                        </div>
                        <span class="status-badge ${statusInfo.className}">${statusInfo.label}</span>
                    </div>
                    <div class="history-card__grid">
                        <div>
                            <span class="history-card__label">Paid on</span>
                            <strong>${formatDate(payment.paymentDate)}</strong>
                        </div>
                        <div>
                            <span class="history-card__label">Amount</span>
                            <strong>${formatCurrency(payment.amount)}</strong>
                        </div>
                        <div class="history-card__proof">
                            <span class="history-card__label">OR / Proof</span>
                            ${proofAction}
                        </div>
                        <div class="history-card__review">
                            <span class="history-card__label">Review</span>
                            <p>${escapeHtml(reviewNote)}</p>
                        </div>
                        <div class="history-card__remarks">
                            <span class="history-card__label">Remarks</span>
                            <p>${escapeHtml(remarks)}</p>
                        </div>
                        ${followUpAction}
                    </div>
                </article>`;
            })
            .join('');
        tbody.innerHTML = rows || '<tr class="empty"><td colspan="6">No receipts yet. Log the first OR to begin.</td></tr>';
        if (cardList) {
            cardList.innerHTML = cards || '<article class="history-card history-card--empty">No receipts yet. Log the first OR to begin.</article>';
        }
        counter && (counter.textContent = `${filtered.length} ${filtered.length === 1 ? 'receipt' : 'receipts'}`);
    }

    function renderFeedback() {
        const list = document.getElementById('feedbackList');
        if (!list) return;
        list.innerHTML = '';
        if (!feedbackEntries.length) {
            list.innerHTML = '<li class="empty">No feedback submitted yet.</li>';
            return;
        }
        feedbackEntries.slice().reverse().forEach((entry) => {
            const item = document.createElement('li');
            item.innerHTML = `<div>${escapeHtml(entry.message)}</div><span>${formatDateTime(entry.timestamp)}</span>`;
            list.appendChild(item);
        });
    }

    function renderAudit() {
        const auditList = document.getElementById('auditList');
        if (!auditList) return;
        const timelinePanel = auditList.closest('.activity-timeline-panel');
        const latestCard = document.querySelector('.activity-latest-card');
        const auditEntries = buildAuditFromPayments(payments);
        const verifiedCount = auditEntries.filter((entry) => entry.kind === 'verified').length;
        const uploadedCount = auditEntries.filter((entry) => entry.kind === 'uploaded').length;
        const latestEntry = auditEntries[0] || null;
        setText('activityVerifiedCount', String(verifiedCount));
        setText('activityUploadedCount', String(uploadedCount));
        setText('activityLatestTitle', latestEntry ? latestEntry.title : 'No activity yet');
        setText('activityLatestMeta', latestEntry ? formatDateTime(latestEntry.timestamp) : 'Recent beneficiary actions will appear here.');
        timelinePanel?.classList.toggle('is-empty', !auditEntries.length);
        latestCard?.classList.toggle('is-empty', !latestEntry);
        auditList.innerHTML = '';
        if (!auditEntries.length) {
            auditList.innerHTML = '<li class="empty">No activity yet.</li>';
            return;
        }
        auditEntries.forEach((entry) => {
            const item = document.createElement('li');
            item.className = 'timeline-item';
            item.innerHTML = `
                <div class="timeline-item__head">
                    <strong class="timeline-title">${entry.title}</strong>
                    <span class="timeline-meta">${formatDateTime(entry.timestamp)}</span>
                </div>
                <p class="timeline-copy">${entry.message}</p>
            `;
            auditList.appendChild(item);
        });
    }

    function applyRoleVisibility() {
        const isBeneficiary = roleView === 'beneficiary';
        document.querySelectorAll('[data-role="beneficiary"]').forEach((element) => {
            element.classList.toggle('is-hidden', !isBeneficiary);
        });
        document.querySelectorAll('[data-role="applicant"]').forEach((element) => {
            element.classList.toggle('is-hidden', isBeneficiary);
        });
        document.querySelectorAll('[data-role="applicant-extra"]').forEach((element) => {
            element.classList.add('is-hidden');
        });
        const status = beneficiaryRecord?.applicationStatus || beneficiaryRecord?.status || applicationRecord?.status || user?.status || '';
        const isReleased = isReleasedStatus(status);
        document.querySelectorAll('[data-access="released"]').forEach((element) => {
            element.classList.toggle('is-hidden', !isReleased);
        });

        const activeLink = document.querySelector('.sidebar-link.is-active');
        if (activeLink?.classList.contains('is-hidden')) {
            activeLink.classList.remove('is-active');
            const firstVisible = Array.from(document.querySelectorAll('.sidebar-link')).find((link) => !link.classList.contains('is-hidden'));
            firstVisible?.classList.add('is-active');
        }

        applyRouteVisibility();
    }


    function initRouting() {
        window.addEventListener('hashchange', applyRouteVisibility);
        applyRouteVisibility();
    }

    function applyRouteVisibility() {
        const sidebarLinks = Array.from(document.querySelectorAll('.sidebar-link'));
        const tabbarLinks = Array.from(document.querySelectorAll('.beneficiary-tabbar__link'));
        const sections = Array.from(document.querySelectorAll('.dash-main > section[id]'));
        const visibleLinks = sidebarLinks.filter((link) => !link.classList.contains('is-hidden'));
        const hashId = window.location.hash.replace('#', '');
        const requestedId = hashId;
        const fallbackLink = visibleLinks[0];
        const requestedSection = sections.find((section) => section.id === requestedId && !section.classList.contains('is-hidden'));
        const targetSection = requestedSection || sections.find((section) => section.id === ((fallbackLink?.getAttribute('href') || '').replace('#', '')));
        const targetLink = visibleLinks.find((link) => (link.getAttribute('href') || '').replace('#', '') === targetSection?.id);
        const activeLink = targetLink || null;
        const activeId = targetSection?.id || ((fallbackLink?.getAttribute('href') || '').replace('#', ''));
        const banner = document.querySelector('.dash-banner');

        sidebarLinks.forEach((link) => link.classList.toggle('is-active', link === activeLink));
        tabbarLinks.forEach((link) => {
            const href = (link.getAttribute('href') || '').replace('#', '');
            link.classList.toggle('is-active', href === activeId);
        });
        sections.forEach((section) => {
            const shouldIpakita = section.id === activeId && !section.classList.contains('is-hidden');
            section.classList.toggle('is-route-hidden', !shouldIpakita);
        });
        if (banner) {
            banner.classList.toggle('is-route-hidden', activeId !== 'overview');
        }

        updateMobileTopbarTitle(activeLink, activeId);
        closeMobileAccountMenu();
        if (targetSection && hashId !== activeId) {
            window.history.replaceState(null, '', `#${activeId}`);
        }
    }

    function toggleMobileAccountMenu(event) {
        event?.preventDefault();
        event?.stopPropagation();
        const menu = document.getElementById('mobileAccountMenu');
        const toggle = document.getElementById('mobileAccountToggle');
        if (!menu || !toggle) {
            return;
        }
        const willOpen = !menu.classList.contains('is-open');
        closeMobileAccountMenu();
        document.dispatchEvent(new CustomEvent('smartleap:close-notifications'));
        syncMobileAccountMenuLayer();
        menu.classList.toggle('is-open', willOpen);
        menu.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
        toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (willOpen) {
            positionMobileAccountMenu();
        }
    }

    function closeMobileAccountMenu() {
        const menu = document.getElementById('mobileAccountMenu');
        const toggle = document.getElementById('mobileAccountToggle');
        menu?.classList.remove('is-open');
        menu?.setAttribute('aria-hidden', 'true');
        toggle?.setAttribute('aria-expanded', 'false');
    }

    function syncMobileAccountMenuLayer() {
        const menu = document.getElementById('mobileAccountMenu');
        const account = document.querySelector('.mobile-topbar__account');
        if (!menu || !account) {
            return;
        }

        if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
            if (menu.parentElement !== document.body) {
                document.body.appendChild(menu);
            }
            menu.classList.add('mobile-account-menu--floating');
            positionMobileAccountMenu();
            return;
        }

        if (menu.parentElement !== account) {
            account.appendChild(menu);
        }
        menu.classList.remove('mobile-account-menu--floating');
        menu.style.top = '';
        menu.style.right = '';
        menu.style.left = '';
        menu.style.width = '';
    }

    function positionMobileAccountMenu() {
        const menu = document.getElementById('mobileAccountMenu');
        const toggle = document.getElementById('mobileAccountToggle');
        if (!menu || !toggle || !(window.matchMedia && window.matchMedia('(max-width: 720px)').matches)) {
            return;
        }

        const rect = toggle.getBoundingClientRect();
        menu.style.top = `${Math.max(72, Math.round(rect.bottom + 10))}px`;
        menu.style.right = '12px';
        menu.style.left = 'auto';
        menu.style.width = `${Math.min(220, Math.max(180, Math.round(window.innerWidth - 24)))}px`;
    }

    function updateMobileTopbarTitle(activeLink, activeId) {
        const title = document.getElementById('mobileTopbarTitle');
        if (!title) {
            return;
        }
        const keyMap = {
            overview: 'overview',
            profile: 'profile',
            repayments: 'repayments',
            'support-feedback': 'support',
        };
        const activeKey = keyMap[activeId] || 'overview';
        title.dataset.i18nKey = activeKey;
        const translatedLabel = window.SMARTLEAP_I18N?.translate?.(activeKey);
        const linkLabel = activeLink?.querySelector('span:last-child')?.textContent?.trim();
        const fallbackMap = {
            overview: 'Overview',
            profile: 'Profile',
            repayments: 'Repayments',
            'support-feedback': 'Support',
        };
        title.textContent = translatedLabel || linkLabel || fallbackMap[activeId] || 'Overview';
    }

    function openChangePasswordModal() {
        closeCenteredModal();
        const modal = document.createElement('div');
        modal.className = 'beneficiary-centered-modal';
        modal.dataset.centeredModal = 'true';
        modal.innerHTML = `
            <div class="beneficiary-centered-modal__backdrop" data-close-centered-modal></div>
            <div class="beneficiary-centered-modal__card" role="dialog" aria-modal="true" aria-labelledby="beneficiaryPasswordTitle">
                <button type="button" class="beneficiary-centered-modal__close" data-close-centered-modal aria-label="Close">&times;</button>
                <div class="beneficiary-centered-modal__header">
                    <span class="panel-eyebrow">Account Security</span>
                    <h3 id="beneficiaryPasswordTitle">Change Password</h3>
                    <p>Update your account password using your current password first.</p>
                </div>
                <form id="beneficiaryChangePasswordForm" class="beneficiary-centered-modal__form">
                    <label class="form-field">
                        <span>Current password</span>
                        <input type="password" name="currentPassword" required>
                    </label>
                    <label class="form-field">
                        <span>New password</span>
                        <input type="password" name="newPassword" required minlength="8">
                    </label>
                    <label class="form-field">
                        <span>Confirm new password</span>
                        <input type="password" name="confirmPassword" required minlength="8">
                    </label>
                    <div class="notice error" id="beneficiaryPasswordError" hidden></div>
                    <div class="beneficiary-centered-modal__actions">
                        <button type="button" class="btn-outline" data-close-centered-modal>Back</button>
                        <button type="submit" class="btn-primary">Save Password</button>
                    </div>
                </form>
            </div>
        `;
        modal.addEventListener('click', (event) => {
            if (event.target.closest('[data-close-centered-modal]')) {
                closeCenteredModal();
            }
        });
        modal.querySelector('#beneficiaryChangePasswordForm')?.addEventListener('submit', submitChangePassword);
        document.body.appendChild(modal);
    }

    function closeCenteredModal() {
        document.querySelector('[data-centered-modal="true"]')?.remove();
    }

    async function submitChangePassword(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const errorNode = document.getElementById('beneficiaryPasswordError');
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        if (errorNode) {
            errorNode.hidden = true;
            errorNode.textContent = '';
        }

        const formData = new URLSearchParams();
        formData.set('currentPassword', String(form.currentPassword?.value || ''));
        formData.set('newPassword', String(form.newPassword?.value || ''));
        formData.set('confirmPassword', String(form.confirmPassword?.value || ''));

        try {
            const response = await fetch(routeUrl('account/change-password'), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                },
                credentials: 'same-origin',
                body: formData.toString(),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || 'Unable to change password.');
            }
            showToast(payload.message || 'Password updated.', 'success');
            closeCenteredModal();
        } catch (error) {
            if (errorNode) {
                errorNode.hidden = false;
                errorNode.textContent = error.message || 'Unable to change password.';
            }
        } finally {
            submitButton.disabled = false;
        }
    }

    function renderOverview() {
        if (roleView === 'beneficiary') {
            const metrics = getRepaymentMetrics();
            const attentionSummary = getBeneficiaryAttentionSummary(metrics);
            const updates = buildOverviewUpdates(metrics);

            setText('overviewName', '');
            setText('overviewBusiness', '');
            setText('overviewEmail', '');
            setText('overviewOutstanding', formatCurrency(metrics.outstanding));
            setText('overviewProgress', `${metrics.verifiedMonths}/24 months`);
            setText('overviewPendingVerification', formatCount(metrics.pendingVerificationCount, 'receipt'));
            setText('overviewRate', `${metrics.rateDisplay}% complete`);
            setText('heroBeneficiaryStatus', metrics.statusLabel);
            setText('overviewActionStatus', metrics.statusLabel);
            setText('heroBeneficiaryTitle', metrics.heroTitle);
            setText('heroBeneficiaryCopy', metrics.heroCopy);
            const overviewDue = document.getElementById('overviewDue');
            if (overviewDue) {
                const dueText = metrics.nextPending ? `Next due ${metrics.nextDue}` : '';
                overviewDue.textContent = dueText;
                overviewDue.classList.toggle('is-hidden', !dueText);
            }
            const overviewProgressFill = document.getElementById('overviewProgressFill');
            if (overviewProgressFill) {
                overviewProgressFill.style.width = `${Math.min(100, metrics.percent)}%`;
                overviewProgressFill.parentElement?.setAttribute('aria-valuenow', String(metrics.percent));
            }
            setText('overviewReminder', updates.reminder);
            setText('overviewAccountAlert', metrics.pendingVerificationCount > 0 ? updates.verification : attentionSummary.meta);
            const socialWorkerSupport = getSocialWorkerSupportContact();
            setText('overviewSupportWorker', socialWorkerSupport.name);
            setText('overviewSupportWorkerContact', socialWorkerSupport.email);
            setText('overviewSupport', updates.support);
            const repaymentsButton = document.getElementById('overviewRepaymentsBtn');
            if (repaymentsButton) {
                repaymentsButton.textContent = metrics.primaryActionLabel;
                repaymentsButton.dataset.target = metrics.primaryActionTarget;
            }

            return;
        }

        const statusEl = document.getElementById('overviewStatus');
        const statusNoteEl = document.getElementById('overviewStatusNote');
        const requirementsEl = document.getElementById('overviewRequirementsPercent');
        const requirementsNoteEl = document.getElementById('overviewRequirementsNote');
        const nextDueEl = document.getElementById('overviewNextDue');
        const nextDueNoteEl = document.getElementById('overviewNextDueNote');
        if (!statusEl || !requirementsEl || !nextDueEl) return;

        const status = beneficiaryRecord?.applicationStatus || beneficiaryRecord?.status || applicationRecord?.status || user?.status || 'Active';
        const summary = calculateRequirementSummary(applicationRecord, beneficiaryRecord);
        statusEl.textContent = status;
        if (statusNoteEl) {
            statusNoteEl.textContent = 'Awaiting approval and release status.';
        }

        requirementsEl.textContent = `${summary.completed}/${summary.total || 8}`;
        if (requirementsNoteEl) {
            requirementsNoteEl.textContent = summary.issueCount > 0
                ? 'Some requirements still need correction.'
                : 'Continue submitting complete requirements.';
        }

        nextDueEl.textContent = status;
        if (nextDueNoteEl) nextDueNoteEl.textContent = 'Review the application and notifications pages for updates.';
    }

    function renderProfileEditor() {
        const form = document.getElementById('profileForm');
        if (!form) return;
        const nameInput = document.getElementById('profileName');
        const emailInput = document.getElementById('profileEmail');
        const barangayInput = document.getElementById('profileBarangay');
        const contactInput = document.getElementById('profileKontak');
        if (!nameInput || !emailInput || !barangayInput || !contactInput) return;

        const fullName = user.fullName || user.name || applicationRecord?.applicantName || beneficiaryRecord?.name || '';
        const email = user.email || applicationRecord?.email || beneficiaryRecord?.email || '';
        const barangay = user.barangay || applicationRecord?.barangay || beneficiaryRecord?.barangay || beneficiaryRecord?.location || '';
        const contact = user.contactNumber || user.contact || applicationRecord?.contactNumber || beneficiaryRecord?.contact || '';

        nameInput.value = fullName;
        emailInput.value = email;
        barangayInput.value = barangay;
        contactInput.value = contact;
    }

    function renderBeneficiaryProfile() {
        if (roleView !== 'beneficiary') return;
        const form = document.getElementById('beneficiaryProfileForm');
        if (!form) return;
        const isCoMaker = isCoMakerPortal();
        const nameInput = document.getElementById('beneficiaryName');
        const businessInput = document.getElementById('beneficiaryBusiness');
        const emailInput = document.getElementById('beneficiaryEmail');
        const contactInput = document.getElementById('beneficiaryKontak');
        const barangayInput = document.getElementById('beneficiaryBarangay');
        const birthdateInput = document.getElementById('beneficiaryBirthdate');
        const ageInput = document.getElementById('beneficiaryEdad');
        const genderInput = document.getElementById('beneficiaryGender');
        const addressInput = document.getElementById('beneficiaryAddress');
        const is4psInput = document.getElementById('beneficiary4ps');
        const educationalAttainmentInput = document.getElementById('beneficiaryEducationalAttainment');
        const sectorInput = document.getElementById('beneficiarySector');
        const sectorOtherInput = document.getElementById('beneficiarySectorOtherSpecify');
        const batchNoInput = document.getElementById('beneficiaryBatchNo');
        const livelihoodInput = document.getElementById('beneficiaryLivelihood');
        const relationshipField = document.getElementById('beneficiaryRelationshipField');
        const relationshipInput = document.getElementById('beneficiaryRelationshipToPrimary');
        const primaryBeneficiaryField = document.getElementById('beneficiaryPrimaryBeneficiaryField');
        const primaryBeneficiaryName = document.getElementById('beneficiaryPrimaryBeneficiaryName');
        const personalHeading = document.getElementById('beneficiaryPersonalHeading');
        const personalSection = document.getElementById('beneficiaryPersonalSection');
        const businessSection = document.getElementById('beneficiaryBusinessSection');
        const contactSection = document.getElementById('beneficiaryContactSection');
        const programSection = document.getElementById('beneficiaryProgramSection');
        const birthdateField = document.getElementById('beneficiaryBirthdateField');
        const ageField = document.getElementById('beneficiaryAgeField');
        const genderField = document.getElementById('beneficiaryGenderField');
        const addressField = addressInput?.closest('.form-field');
        const pdoName = document.getElementById('assignedPDOName');
        const pdoKontak = document.getElementById('assignedPDOKontak');
        if (!nameInput || !businessInput || !emailInput || !contactInput || !barangayInput) return;

        const profile = beneficiaryRecord?.profile || {};
        const formatBatchNo = (value) => {
            const text = String(value || '').trim();
            if (!text) return 'Batch 1';
            return /^\d+$/.test(text) ? `Batch ${text}` : text;
        };
        nameInput.value = user.fullName || user.name || beneficiaryRecord?.name || '';
        emailInput.value = user.email || beneficiaryRecord?.email || '';
        contactInput.value = user.contactNumber || user.contact || profile.contactNumber || beneficiaryRecord?.contact || '';

        if (isCoMaker) {
            if (personalHeading) personalHeading.textContent = 'Co-maker details';
            setBeneficiaryFieldVisibility(personalSection, true);
            setBeneficiaryFieldVisibility(contactSection, true);
            setBeneficiaryFieldVisibility(businessSection, false);
            setBeneficiaryFieldVisibility(programSection, false);
            setBeneficiaryFieldVisibility(birthdateField, false);
            setBeneficiaryFieldVisibility(ageField, false);
            setBeneficiaryFieldVisibility(genderField, false);
            setBeneficiaryFieldVisibility(addressField, false);
            setBeneficiaryFieldVisibility(relationshipField, true);
            if (relationshipInput) {
                relationshipInput.disabled = false;
                relationshipInput.required = true;
                relationshipInput.value = beneficiaryRecord?.relationshipToPrimaryBeneficiary || profile.relationshipToPrimaryBeneficiary || '';
            }
            if (primaryBeneficiaryField) primaryBeneficiaryField.hidden = false;
            if (primaryBeneficiaryName) {
                primaryBeneficiaryName.textContent = beneficiaryRecord?.primaryBeneficiaryName || 'Primary beneficiary';
            }
            if (addressInput) addressInput.value = '';
            barangayInput.value = '';
            if (birthdateInput) birthdateInput.value = '';
            if (ageInput) ageInput.value = '';
            if (genderInput) genderInput.value = '';
            if (is4psInput) is4psInput.value = '';
            if (educationalAttainmentInput) educationalAttainmentInput.value = '';
            if (sectorInput) sectorInput.value = '';
            if (sectorOtherInput) sectorOtherInput.value = '';
            if (batchNoInput) batchNoInput.value = '';
            if (livelihoodInput) livelihoodInput.value = '';
            businessInput.value = beneficiaryRecord?.primaryBusinessName || '';
        } else {
            if (personalHeading) personalHeading.textContent = 'Personal details';
            setBeneficiaryFieldVisibility(personalSection, true);
            setBeneficiaryFieldVisibility(contactSection, true);
            setBeneficiaryFieldVisibility(businessSection, true);
            setBeneficiaryFieldVisibility(programSection, true);
            setBeneficiaryFieldVisibility(birthdateField, true);
            setBeneficiaryFieldVisibility(ageField, true);
            setBeneficiaryFieldVisibility(genderField, true);
            setBeneficiaryFieldVisibility(addressField, true);
            setBeneficiaryFieldVisibility(relationshipField, false);
            if (relationshipInput) {
                relationshipInput.required = false;
                relationshipInput.disabled = true;
                relationshipInput.value = '';
            }
            if (primaryBeneficiaryField) primaryBeneficiaryField.hidden = true;

            businessInput.value = user.businessName || user.business || profile.businessName || beneficiaryRecord?.businessName || beneficiaryRecord?.businessType || '';
            barangayInput.value = user.barangay || profile.barangay || beneficiaryRecord?.barangay || '';
            if (birthdateInput) birthdateInput.value = user.birthdate || profile.birthdate || '';
            if (ageInput) ageInput.value = user.age || profile.age || '';
            if (genderInput) genderInput.value = user.gender || profile.gender || '';
            if (addressInput) addressInput.value = user.address || profile.address || '';
            if (is4psInput) is4psInput.value = user.is4ps || profile.is4ps || '';
            if (educationalAttainmentInput) educationalAttainmentInput.value = user.educationalAttainment || profile.educationalAttainment || '';
            if (sectorInput) sectorInput.value = user.sector || profile.sector || '';
            if (sectorOtherInput) sectorOtherInput.value = user.sectorOtherSpecify || profile.sectorOtherSpecify || '';
            if (batchNoInput) batchNoInput.value = formatBatchNo(user.batchNo || profile.batchNo);
            if (livelihoodInput) livelihoodInput.value = user.livelihood || profile.livelihood || '';
        }

        const assignedPdo = applicationRecord?.assignedPdo || beneficiaryRecord?.assignedPdo || {};
        if (pdoName) pdoName.textContent = assignedPdo.name || beneficiaryRecord?.pdoName || 'Project Officer';
        if (pdoKontak) pdoKontak.textContent = assignedPdo.email || beneficiaryRecord?.pdoKontak || 'projectofficer@smartleap.gov.ph';

        setProfilePhotoPreview(getStoredProfilePhoto(user));
        syncBeneficiaryConditionalFields();
        syncPortalSelects();
        updateBeneficiarySaveButtonState();
    }

    function handleBeneficiaryProfileStateChange() {
        syncBeneficiaryConditionalFields();
        updateBeneficiarySaveButtonState();
    }

    function syncBeneficiaryConditionalFields() {
        if (isCoMakerPortal()) {
            const otherWrap = document.getElementById('beneficiarySectorOtherWrap');
            const otherInput = document.getElementById('beneficiarySectorOtherSpecify');
            if (otherWrap) otherWrap.hidden = true;
            if (otherInput) {
                otherInput.disabled = true;
                otherInput.required = false;
                otherInput.value = '';
            }
            return;
        }
        const sector = String(document.getElementById('beneficiarySector')?.value || '').trim().toLowerCase();
        const otherWrap = document.getElementById('beneficiarySectorOtherWrap');
        const otherInput = document.getElementById('beneficiarySectorOtherSpecify');
        const showOther = sector === 'other';
        if (otherWrap) {
            otherWrap.hidden = !showOther;
        }
        if (otherInput) {
            otherInput.disabled = !showOther;
            otherInput.required = showOther;
            if (!showOther) {
                otherInput.value = '';
            }
        }
    }

    function updateBeneficiarySaveButtonState() {
        syncBeneficiaryConditionalFields();
        const button = document.querySelector('#beneficiaryProfileForm button[type="submit"]');
        const form = document.getElementById('beneficiaryProfileForm');
        if (!button || !form) return;
        button.disabled = !form.checkValidity();
    }

    function handleBeneficiaryBirthdateChange(event) {
        const ageInput = document.getElementById('beneficiaryEdad');
        if (!ageInput) return;
        const age = calculateEdad(event.target.value);
        ageInput.value = age ? String(age) : '';
    }

    function renderRequirements() {
        const list = document.getElementById('requirementsList');
        const countEl = document.getElementById('requirementsProgressCount');
        const statusEl = document.getElementById('requirementsProgressStatus');
        const fillEl = document.getElementById('requirementsProgressFill');
        const barEl = document.querySelector('.requirements-progress__bar');
        if (!list || !countEl || !statusEl || !fillEl || !barEl) return;

        if (!applicationRecord && !beneficiaryRecord) {
            countEl.textContent = '0/8 requirements';
            statusEl.textContent = 'Pending review';
            fillEl.style.width = '0%';
            barEl.setAttribute('aria-valuenow', '0');
            list.innerHTML = '<li class="empty">Requirement uploads will appear once reviewed.</li>';
            document.querySelectorAll('.requirements-progress__marker').forEach((marker) => {
                const value = Number(marker.dataset.value || 0);
                marker.style.left = `${Math.min(100, Math.max(0, (value / 8) * 100))}%`;
            });
            return;
        }

        const summary = calculateRequirementSummary(applicationRecord, beneficiaryRecord);
        const total = summary.total || 8;
        const completed = Math.min(summary.completed, total);
        const percent = total ? Math.round((completed / total) * 100) : 0;

        countEl.textContent = `${completed}/${total} requirements`;
        statusEl.textContent = summary.issueCount > 0
            ? 'Action needed'
            : completed >= total
                ? 'Ready for approval'
                : 'Pending review';
        fillEl.style.width = `${percent}%`;
        barEl.setAttribute('aria-valuenow', String(percent));

        list.innerHTML = '';
        if (!summary.items.length) {
            list.innerHTML = '<li class="empty">Requirement uploads will appear once reviewed.</li>';
            return;
        }
        summary.items.forEach((item) => {
            const entry = document.createElement('li');
            entry.innerHTML = `<span>${escapeHtml(item.label)}</span><span class="requirement-status ${item.statusClass}">${escapeHtml(item.statusLabel)}</span>`;
            list.appendChild(entry);
        });

        document.querySelectorAll('.requirements-progress__marker').forEach((marker) => {
            const value = Number(marker.dataset.value || 0);
            marker.style.left = `${Math.min(100, Math.max(0, (value / total) * 100))}%`;
        });
    }

    function renderNotifications() {
        const list = document.getElementById('notificationList');
        if (!list) return;
        const items = buildNotificationFeed();
        list.innerHTML = '';
        if (!items.length) {
            list.innerHTML = '<li class="empty">No notifications yet.</li>';
            return;
        }
        items.slice(0, 8).forEach((item) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="notification-title">${escapeHtml(item.title)}</div>
                <div>${escapeHtml(item.message)}</div>
                <div class="notification-meta">${escapeHtml(item.meta)}</div>
            `;
            list.appendChild(li);
        });
        markNotificationsRead(items.slice(0, 8).map((item) => item.notificationId));
    }

    function handleProfileSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (!form.reportValidity()) return;

        const name = form.fullName.value.trim();
        const email = form.email.value.trim().toLowerCase();
        const barangay = form.barangay.value.trim();
        const contact = form.contact.value.trim();

        user = {
            ...user,
            name,
            fullName: name,
            email,
            barangay,
            contactNumber: contact,
            contact
        };

        if (applicationRecord) {
            applicationRecord.applicantName = name;
            applicationRecord.email = email;
            applicationRecord.barangay = barangay;
            applicationRecord.contactNumber = contact;
        }
        if (beneficiaryRecord) {
            beneficiaryRecord.name = name;
            beneficiaryRecord.email = email;
            beneficiaryRecord.barangay = barangay;
            beneficiaryRecord.contact = contact;
        }

        persistProfileUpdate();
        renderUser();
        showToast('Na-update ang profile.', 'success');
    }

    async function handleBeneficiaryProfileSubmit(event) {
        event.preventDefault();
        const form = event.target;
        syncBeneficiaryConditionalFields();
        if (!form.reportValidity()) return;

        const payload = isCoMakerPortal()
            ? {
                fullName: form.fullName.value.trim(),
                email: form.email.value.trim().toLowerCase(),
                contactNumber: form.contactNumber.value.trim(),
                relationshipToPrimaryBeneficiary: form.relationshipToPrimaryBeneficiary?.value?.trim?.() || '',
            }
            : {
                fullName: form.fullName.value.trim(),
                businessName: form.businessName.value.trim(),
                email: form.email.value.trim().toLowerCase(),
                contactNumber: form.contactNumber.value.trim(),
                barangay: form.barangay.value.trim(),
                birthdate: form.birthdate.value,
                age: form.age.value,
                gender: form.gender.value,
                address: form.address.value.trim(),
                is4ps: form.is4ps.value,
                educationalAttainment: form.educationalAttainment.value,
                sector: form.sector.value,
                sectorOtherSpecify: form.sectorOtherSpecify?.value?.trim?.() || '',
                batchNo: form.batchNo.value.trim(),
                livelihood: form.livelihood.value.trim()
            };

        try {
            const response = await fetch(routeUrl('beneficiary-dashboard/profile/save'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    Accept: 'application/json'
                },
                credentials: 'same-origin',
                body: new URLSearchParams(payload)
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                throw new Error(result.errors?.general || result.errors?.email || result.message || 'Unable to update profile.');
            }

            applyBackendState(result.data || {});
            renderAll();
            showToast(result.message || 'Na-update ang profile.', 'success');
        } catch (error) {
            showToast(error.message || 'Unable to update profile.', 'warning');
        }
    }

    async function handleProfilePhotoChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const isValidType = ['image/jpeg', 'image/png'].includes(file.type);
        if (!isValidType) {
            showToast('Only JPG or PNG files can be uploaded.', 'warning');
            event.target.value = '';
            return;
        }
        if (file.size > PROFILE_PHOTO_MAX_SIZE) {
            showToast('Photo must be 5MB or less.', 'warning');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const result = await postJson('beneficiary-dashboard/profile/photo', {
                    photoDataUrl: reader.result
                });
                applyBackendState(result.data || {});
                setProfilePhotoPreview(getStoredProfilePhoto(user));
                renderUser();
                showToast(result.message || 'Na-update ang profile photo.', 'success');
            } catch (error) {
                showToast(error?.message || 'Unable to save profile photo right now.', 'warning');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsDataURL(file);
    }

    function setProfilePhotoPreview(dataUrl) {
        const img = document.getElementById('profilePhotoPreview');
        const placeholder = document.getElementById('profilePhotoPlaceholder');
        if (!img || !placeholder) return;
        if (dataUrl) {
            img.src = dataUrl;
            img.classList.remove('is-hidden');
            placeholder.classList.add('is-hidden');
        } else {
            img.src = '';
            img.classList.add('is-hidden');
            placeholder.classList.remove('is-hidden');
        }
    }

    function syncRepaymentMode() {
        const singleFields = document.getElementById('singleMonthFields');
        const submitButton = document.querySelector('#uploadForm button[type="submit"]');
        const month = normalizeMonthValue(document.getElementById('uploadMonth')?.value || '');
        const scheduleItem = getRepaymentScheduleItems().find((item) => item.month === month);
        singleFields?.classList.remove('is-hidden');
        toggleFieldGroup(singleFields, true);

        if (submitButton) {
            submitButton.textContent = scheduleItem?.isOverdue ? 'Submit late payment' : 'Submit receipt';
        }
    }

    function handleRepaymentDueAction(event) {
        const button = event.target.closest('[data-repayment-due-action]');
        if (!button) return;
        const month = normalizeMonthValue(button.dataset.repaymentDueAction || '');
        if (!month) return;
        const monthInput = document.getElementById('uploadMonth');
        const amountInput = document.getElementById('uploadAmount');
        const dateInput = document.getElementById('uploadDate');
        const notesInput = document.getElementById('uploadNotes');
        if (monthInput) monthInput.value = month;
        if (amountInput && !amountInput.value) amountInput.value = String(MONTHLY_REPAYMENT_AMOUNT);
        if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
        if (notesInput && !notesInput.value && isMonthOverdue(month)) {
            notesInput.value = `Late payment for ${formatMonth(padMonth(month))}.`;
        }
        syncRepaymentMode();
        document.getElementById('uploadForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        monthInput?.focus();
    }

    function toggleFieldGroup(container, enabled) {
        if (!container) return;
        container.querySelectorAll('input, select, textarea, button').forEach((field) => {
            if (field.id === 'addBatchReceipt') {
                field.disabled = !enabled;
                return;
            }
            if (field.type === 'submit') {
                return;
            }
            field.disabled = !enabled;
        });
    }

    async function handleUploadSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (!form.reportValidity()) return;

        try {
            const workingPayments = clonePaymentsState();
            let result = { payments: [], submissions: [] };

            const month = normalizeMonthValue(document.getElementById('uploadMonth')?.value || '');
            const paymentDate = String(document.getElementById('uploadDate')?.value || '');
            const amount = roundCurrency(document.getElementById('uploadAmount')?.value || 0);
            const orNumber = sanitizeOrNumber(document.getElementById('uploadOr')?.value || '');
            const notes = String(document.getElementById('uploadNotes')?.value || '').trim();
            const file = document.getElementById('uploadFile')?.files?.[0];

            if (!month || amount <= 0 || !paymentDate || !orNumber) {
                throw new Error('Complete the official receipt details before submitting.');
            }
            const existingForMonth = getPaymentsForMonth(month).find((payment) => ['uploaded', 'pending'].includes(mapPaymentStage(payment.stage)));
            if (existingForMonth) {
                throw new Error(`A payment for ${formatMonth(padMonth(month))} is already submitted and waiting for review.`);
            }
            const dateValidationMessage = validatePaymentDateAgainstMonth(paymentDate, month);
            if (dateValidationMessage) {
                throw new Error(dateValidationMessage);
            }
            const proof = await readProofFile(file);
            result = createSingleMonthSubmission({
                month,
                paymentDate,
                amount,
                orNumber,
                notes,
                ...proof
            }, { paymentList: workingPayments });

            const response = await postJson('beneficiary-dashboard/repayments/submit', {
                payments: result.payments,
                submissions: result.submissions || [],
            });
            applyBackendState({ repayments: response.data || {} });
            clearLegacyRepaymentStorage();
            renderSummary();
            renderProgress();
            renderHistory();
            renderAudit();
            renderOverview();
            showToast('Receipt uploaded. Pending verification.', 'info');
            form.reset();
            syncRepaymentMode();
        } catch (error) {
            showToast(error?.message || 'Unable to submit the repayment record.', 'warning');
        }
    }

    async function handleFeedbackSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (!form.reportValidity()) return;
        const message = form.feedbackMessage.value.trim();
        if (!message) return;

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            const result = await postJson('beneficiary-dashboard/feedback', { message });
            feedbackEntries = Array.isArray(result?.data?.feedback) ? result.data.feedback : feedbackEntries;
            renderFeedback();
            showToast(result?.message || 'Thanks! Feedback received.', 'success');
            form.reset();
        } catch (error) {
            showToast(error?.message || 'Unable to send feedback right now.', 'warning');
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    }

    async function loadSupportChat(silent = false) {
        const stream = document.getElementById('supportChatMessages');
        if (!stream) return;

        try {
            const result = await fetchJson(`api/support-chat/messages?recipient=${encodeURIComponent(supportRecipient)}`);
            renderSupportChat(result.messages || []);
            setSupportChatStatus('');
        } catch (error) {
            if (!silent) {
                setSupportChatStatus(error?.message || 'Unable to load chat messages.');
            }
        }
    }

    async function handleSupportChatSubmit(event) {
        event.preventDefault();
        const input = document.getElementById('supportChatInput');
        const message = String(input?.value || '').trim();
        if (!message) return;

        setSupportChatStatus('Sending...');
        try {
            const result = await postJson('api/support-chat/messages', {
                recipient: supportRecipient,
                message
            });
            if (input) input.value = '';
            renderSupportChat(result.messages || []);
            setSupportChatStatus('Message sent.');
        } catch (error) {
            setSupportChatStatus(error?.message || 'Unable to send your message.');
        }
    }

    function renderSupportChat(messages) {
        const stream = document.getElementById('supportChatMessages');
        if (!stream) return;

        if (!Array.isArray(messages) || messages.length === 0) {
            stream.innerHTML = '<p class="support-chat__empty">Messages from your support team will appear here.</p>';
            return;
        }

        stream.innerHTML = messages.map((message) => `
            <article class="support-chat__message ${message.isOwn ? 'is-own' : ''}">
                <strong>${escapeHtml(message.senderName || 'SMART LEAP support')}</strong>
                <p>${escapeHtml(message.body || '')}</p>
                <span>${escapeHtml(formatDateTime(message.createdAt))}</span>
            </article>
        `).join('');
        stream.scrollTop = stream.scrollHeight;
    }

    function setSupportChatStatus(message) {
        const status = document.getElementById('supportChatStatus');
        if (status) {
            status.textContent = message || '';
        }
    }

    function startSupportChatPolling() {
        if (supportChatTimer || !document.getElementById('supportChatMessages')) {
            return;
        }

        supportChatTimer = window.setInterval(() => {
            if ((window.location.hash || '').replace('#', '') === 'support-feedback') {
                loadSupportChat(true);
            }
        }, 10000);
    }

    function showPortalLoader(copy) {
        const loader = document.getElementById('portalLoader');
        const copyNode = document.getElementById('portalLoaderCopy');
        if (!loader) {
            return;
        }

        if (copyNode && copy) {
            copyNode.textContent = copy;
        }

        loaderStartedAt = Date.now();
        loader.hidden = false;
        document.body.classList.remove('portal-ready');
    }

    function routeToRepayments(target) {
        window.location.hash = '#repayments';
        applyRouteVisibility();
        window.setTimeout(() => {
            if (target === 'history') {
                document.getElementById('historyHeading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                document.getElementById('historyFilterStatus')?.focus();
                return;
            }
            if (target === 'repayments') {
                const repaymentTarget = document.getElementById('repaymentActionsHeading') || document.getElementById('uploadForm');
                repaymentTarget?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            document.getElementById('uploadForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.getElementById('uploadMonth')?.focus();
        }, 0);
    }

    function hidePortalLoader() {
        const loader = document.getElementById('portalLoader');
        if (!loader) {
            document.body.classList.add('portal-ready');
            return;
        }

        loader.setAttribute('hidden', 'hidden');
        document.body.classList.add('portal-ready');
    }

    function markPortalReady() {
        const remaining = Math.max(0, PORTAL_LOADER_MIN_MS - (Date.now() - loaderStartedAt));
        window.setTimeout(hidePortalLoader, remaining);
    }

    async function handleLogout() {
        showPortalLoader('Signing you out of SMART LEAP...');
        try {
            const response = await fetch(`${window.SMARTLEAP_BASE_URL || ''}/auth/logout`, {
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
            const remaining = Math.max(0, PORTAL_LOADER_MIN_MS - (Date.now() - loaderStartedAt));
            window.setTimeout(() => {
                window.location.href = `${window.SMARTLEAP_BASE_URL || ''}/${String(payload.redirect || 'portal').replace(/^\/+/, '')}`;
            }, remaining);
        } catch (error) {
            hidePortalLoader();
            showToast('Unable to sign out right now.', 'warning');
        }
    }

    function handleHistoryTableClick(event) {
        const followUpButton = event.target.closest('button[data-action="fix-receipt"]');
        if (followUpButton) {
            routeToRepayments('upload');
            return;
        }
        const button = event.target.closest('button[data-action="view-proof"]');
        if (!button) return;
        const proof = button.getAttribute('data-proof') || '';
        if (!proof) return;
        const win = window.open('', '_blank', 'noopener');
        if (!win) return;
        if (proof.startsWith('data:') || proof.startsWith('http')) {
            win.location.href = proof;
            return;
        }
        win.document.write(`<pre>${escapeHtml(proof)}</pre>`);
    }

    function normalizeStatus(value) {
        return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
    }

    function slugify(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pending';
    }

    function calculateRequirementSummary(application, beneficiary) {
        const requirements = application?.requirements || beneficiary?.requirements || {};
        const items = [];
        let completed = 0;
        let issueCount = 0;
        const total = REQUIREMENT_ITEMS.length;

        REQUIREMENT_ITEMS.forEach((req) => {
            const entry = requirements?.[req.key] || {};
            const files = Array.isArray(entry.files) ? entry.files : [];
            const status = normalizeStatus(entry.status || entry.reviewStatus || entry.review_status || '');
            const hasFiles = files.length > 0 || Boolean(entry.file?.path || entry.filePath || entry.url);
            const isComplete = hasFiles && [
                'verified',
                'approved',
                'complete',
                'completed',
                'requirementsverified',
                'approvedbypdo',
                'pdoapproved'
            ].includes(status);
            const isKulang = !hasFiles || status === 'missing';
            const isIssue = status === 'invalid' || status === 'incorrect' || status === 'rejected';

            let statusLabel = 'Uploaded';
            let statusClass = 'requirement-status--pending';
            if (isComplete) {
                statusLabel = 'Complete';
                statusClass = 'requirement-status--complete';
                completed += 1;
            } else if (isKulang) {
                statusLabel = 'Missing';
                statusClass = 'requirement-status--missing';
                issueCount += 1;
            } else if (isIssue) {
                statusLabel = 'Incorrect';
                statusClass = 'requirement-status--issue';
                issueCount += 1;
            }

            items.push({
                key: req.key,
                label: req.label,
                statusLabel,
                statusClass
            });
        });

        return {
            completed,
            total,
            issueCount,
            items
        };
    }

    function buildNotificationFeed() {
        const items = [];
        const status = applicationRecord?.status || beneficiaryRecord?.applicationStatus || beneficiaryRecord?.status || 'Pending';
        const statusMeta = applicationRecord?.reviewedAt || beneficiaryRecord?.releaseDate || '';
        items.push({
            title: 'Approval status',
            message: `Current status: ${status}`,
            meta: statusMeta ? formatDateTime(statusMeta) : 'Awaiting review'
        });

        const pdoMessage = applicationRecord?.pdoMessage || applicationRecord?.notes || beneficiaryRecord?.notes;
        if (pdoMessage) {
            items.push({
                title: 'PDO message',
                message: pdoMessage,
                meta: 'Project Development Officer'
            });
        }

        const nextPendingPayment = payments.find((payment) => payment.stage !== 'verified');
        if (nextPendingPayment) {
            items.push({
                title: 'Repayment reminder',
                message: `Prepare the OR for ${formatMonth(padMonth(nextPendingPayment.month))}.`,
                meta: 'Upload your receipt once payment is made'
            });
        }

        if (Array.isArray(notifications) && notifications.length) {
            notifications.forEach((entry) => {
                items.push({
                    notificationId: Number(entry.id || 0) || null,
                    title: entry.title || 'Update',
                    message: entry.message || '',
                    meta: (entry.sentAt || entry.createdAt || entry.timestamp) ? formatDateTime(entry.sentAt || entry.createdAt || entry.timestamp) : 'Just now'
                });
            });
        }

        return items;
    }

    async function markNotificationsRead(ids) {
        const notificationIds = Array.from(new Set((Array.isArray(ids) ? ids : [])
            .map((value) => Number(value || 0))
            .filter((value) => value > 0)));
        const unreadIds = notificationIds.filter((id) => {
            const entry = notifications.find((item) => Number(item?.id || 0) === id);
            return entry && !entry.isRead;
        });

        if (!unreadIds.length) {
            return;
        }

        notifications = notifications.map((entry) => unreadIds.includes(Number(entry.id || 0))
            ? { ...entry, isRead: true }
            : entry);

        try {
            await postJson('api/notifications/read', { ids: unreadIds });
        } catch (error) {
            console.warn('Unable to mark notifications as read', error);
        }
    }

    function persistProfileUpdate() {
        renderUser();
        renderOverview();
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

    function getStoredProfilePhoto(identity) {
        return identity?.photo || user?.photo || null;
    }

    function setAvatarNode(node, fallbackInitial, photo) {
        if (!node) return;
        if (photo) {
            node.textContent = '';
            node.style.backgroundImage = `url("${photo}")`;
            node.classList.add('has-photo');
            return;
        }

        node.style.backgroundImage = '';
        node.classList.remove('has-photo');
        node.textContent = fallbackInitial;
    }

    function setMobileAvatar(fallbackInitial, photo) {
        const button = document.getElementById('mobileAccountToggle');
        const badge = document.getElementById('mobileAccountAvatar');
        if (photo) {
            button?.classList.add('has-photo');
            if (badge) {
                badge.textContent = fallbackInitial;
                badge.style.backgroundImage = `url("${photo}")`;
                badge.classList.add('has-photo');
            }
            return;
        }

        button?.classList.remove('has-photo');
        if (badge) {
            badge.style.backgroundImage = '';
            badge.classList.remove('has-photo');
            badge.textContent = fallbackInitial;
        }
    }

    function persistPayments() {
        try {
            localStorage.setItem(STORAGE_KEYS.payments, JSON.stringify(payments));
        } catch (err) {
            console.warn('Unable to save payments', err);
        }
    }

    function persistGroupedSubmissions() {
        try {
            localStorage.setItem(STORAGE_KEYS.submissions, JSON.stringify(groupedSubmissions));
        } catch (err) {
            console.warn('Unable to save grouped submissions', err);
        }
    }

    function normalizePayments(list) {
        return (Array.isArray(list) ? list : [])
            .map((payment) => normalizePaymentRecord(payment))
            .filter(Boolean);
    }

    function normalizePaymentRecord(payment) {
        if (!payment || typeof payment !== 'object') {
            return null;
        }
        const month = normalizeMonthValue(payment.month || payment.coverageMonth || '');
        if (!month) {
            return null;
        }
        return {
            id: payment.id || createSubmissionId('PAY'),
            month,
            paymentDate: String(payment.paymentDate || payment.date || ''),
            amount: roundCurrency(payment.amount || payment.allocatedAmount || 0),
            stage: mapPaymentStage(payment.stage),
            verifiedBy: String(payment.verifiedBy || ''),
            verifiedAt: String(payment.verifiedAt || ''),
            notes: String(payment.notes || payment.adminRemarks || ''),
            adminRemarks: String(payment.adminRemarks || ''),
            orNumber: sanitizeOrNumber(payment.orNumber || payment.or || ''),
            proof: String(payment.proof || ''),
            proofName: String(payment.proofName || payment.fileName || ''),
            proofType: String(payment.proofType || payment.fileType || ''),
            submittedAt: String(payment.submittedAt || payment.createdAt || payment.paymentDate || ''),
            beneficiaryId: payment.beneficiaryId != null ? Number(payment.beneficiaryId) || null : null,
            beneficiaryName: String(payment.beneficiaryName || payment.name || ''),
            beneficiaryBusiness: String(payment.beneficiaryBusiness || payment.businessName || ''),
            beneficiaryBarangay: String(payment.beneficiaryBarangay || payment.barangay || ''),
            beneficiaryEmail: String(payment.beneficiaryEmail || payment.email || ''),
            reviewedBy: String(payment.reviewedBy || payment.verifiedBy || ''),
            reviewedByRole: String(payment.reviewedByRole || ''),
            reviewedAt: String(payment.reviewedAt || payment.verifiedAt || ''),
            parentSubmissionId: payment.parentSubmissionId || null,
            coverageFrom: normalizeMonthValue(payment.coverageFrom || payment.month || ''),
            coverageTo: normalizeMonthValue(payment.coverageTo || payment.month || ''),
            allocatedAmount: roundCurrency(payment.allocatedAmount ?? payment.amount ?? 0),
            creditApplied: roundCurrency(payment.creditApplied || 0),
            remainingCredit: roundCurrency(payment.remainingCredit || 0)
        };
    }

    function normalizeGroupedSubmissions(list) {
        return (Array.isArray(list) ? list : [])
            .map((submission) => {
                if (!submission || typeof submission !== 'object') {
                    return null;
                }
                return {
                    submissionId: submission.submissionId || createSubmissionId('SUB'),
                    submissionType: submission.submissionType || 'grouped',
                    status: mapPaymentStage(submission.status || ''),
                    paymentDate: String(submission.paymentDate || ''),
                    submittedAt: String(submission.submittedAt || submission.paymentDate || ''),
                    totalAmount: roundCurrency(submission.totalAmount || 0),
                    orNumber: sanitizeOrNumber(submission.orNumber || ''),
                    proof: String(submission.proof || ''),
                    proofName: String(submission.proofName || ''),
                    proofType: String(submission.proofType || ''),
                    notes: String(submission.notes || ''),
                    coveredMonths: uniqueMonths(submission.coveredMonths || []),
                    beneficiaryId: submission.beneficiaryId != null ? Number(submission.beneficiaryId) || null : null,
                    beneficiaryName: String(submission.beneficiaryName || submission.name || ''),
                    beneficiaryBusiness: String(submission.beneficiaryBusiness || submission.businessName || ''),
                    beneficiaryBarangay: String(submission.beneficiaryBarangay || submission.barangay || ''),
                    beneficiaryEmail: String(submission.beneficiaryEmail || submission.email || ''),
                    reviewedBy: String(submission.reviewedBy || ''),
                    reviewedByRole: String(submission.reviewedByRole || ''),
                    reviewedAt: String(submission.reviewedAt || ''),
                    rows: Array.isArray(submission.rows) ? submission.rows.map((row) => ({
                        month: normalizeMonthValue(row.month || ''),
                        amount: roundCurrency(row.amount || 0),
                        paymentDate: String(row.paymentDate || ''),
                        orNumber: sanitizeOrNumber(row.orNumber || ''),
                        proof: String(row.proof || ''),
                        proofName: String(row.proofName || ''),
                        proofType: String(row.proofType || ''),
                        notes: String(row.notes || '')
                    })) : []
                };
            })
            .filter(Boolean);
    }

    function createSubmissionId(prefix = 'SUB') {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    }

    function roundCurrency(value) {
        const amount = Number(value || 0);
        return Math.round(amount * 100) / 100;
    }

    function sanitizeOrNumber(value) {
        return String(value || '').trim().replace(/\s+/g, ' ');
    }

    function normalizeOrNumber(value) {
        return sanitizeOrNumber(value).toLowerCase();
    }

    function normalizeMonthValue(value) {
        const text = String(value || '').trim();
        const match = text.match(/^(\d{4})-(\d{2})/);
        if (!match) {
            return '';
        }
        return `${match[1]}-${match[2]}`;
    }

    function uniqueMonths(values) {
        return Array.from(new Set((Array.isArray(values) ? values : []).map(normalizeMonthValue).filter(Boolean))).sort();
    }

    function enumerateMonths(fromMonth, toMonth) {
        const start = parseMonth(fromMonth);
        const end = parseMonth(toMonth);
        if (!start || !end || start > end) {
            return [];
        }
        const months = [];
        const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cursor <= end) {
            months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
            cursor.setMonth(cursor.getMonth() + 1);
        }
        return months;
    }

    function validatePaymentDateAgainstMonth(paymentDate, referenceMonth) {
        const date = new Date(paymentDate || '');
        const monthDate = parseMonth(referenceMonth);
        if (Number.isNaN(date.getTime()) || !monthDate) {
            return 'Enter a valid payment date.';
        }
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        if (date < monthStart) {
            return `The payment date cannot be earlier than ${formatMonth(padMonth(referenceMonth))}.`;
        }
        return '';
    }

    function repaymentStartMonth() {
        const source = beneficiaryRecord?.repaymentSourceApprovalDate
            || beneficiaryRecord?.repaymentSourceApprovedAt
            || beneficiaryRecord?.approvalDate
            || beneficiaryRecord?.approvedAt
            || applicationRecord?.reviewedAt
            || applicationRecord?.submittedAt
            || '';
        const date = new Date(source || '');
        if (Number.isNaN(date.getTime())) {
            const firstPayment = payments
                .map((payment) => normalizeMonthValue(payment.month))
                .filter(Boolean)
                .sort()[0];
            return firstPayment || normalizeMonthValue(new Date().toISOString().slice(0, 7));
        }
        const firstDueMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
        return `${firstDueMonth.getFullYear()}-${String(firstDueMonth.getMonth() + 1).padStart(2, '0')}`;
    }

    function getRepaymentWindowMonths() {
        const start = repaymentStartMonth();
        return Array.from({ length: REPAYMENT_PLAN_MONTHS }, (_, index) => addMonths(start, index)).filter(Boolean);
    }

    function getDisplayPayments() {
        const validMonths = new Set(getRepaymentWindowMonths());
        return payments.filter((payment) => validMonths.has(normalizeMonthValue(payment.month)));
    }

    function addMonths(month, offset) {
        const date = parseMonth(month);
        if (!date) return '';
        const next = new Date(date.getFullYear(), date.getMonth() + offset, 1);
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
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

    function isLatePayment(payment) {
        const monthDate = parseMonth(payment?.month);
        const paidAt = new Date(payment?.paymentDate || '');
        if (!monthDate || Number.isNaN(paidAt.getTime())) {
            return false;
        }
        const dueEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);
        return paidAt > dueEnd;
    }

    function bestPaymentForMonth(month) {
        const records = getPaymentsForMonth(month);
        if (!records.length) return null;
        const priority = { verified: 5, uploaded: 4, pending: 4, needs_correction: 3, rejected: 2 };
        return records.slice().sort((left, right) => {
            const leftScore = priority[mapPaymentStage(left.stage)] || 1;
            const rightScore = priority[mapPaymentStage(right.stage)] || 1;
            if (leftScore !== rightScore) return rightScore - leftScore;
            return new Date(right.submittedAt || right.paymentDate || '').getTime() - new Date(left.submittedAt || left.paymentDate || '').getTime();
        })[0];
    }

    function getRepaymentScheduleItems() {
        const months = getRepaymentWindowMonths();
        return months.map((month) => {
            const payment = bestPaymentForMonth(month);
            const stage = payment ? mapPaymentStage(payment.stage) : 'unpaid';
            const isOverdue = isMonthOverdue(month);
            let state = 'upcoming';
            if (stage === 'verified') state = 'verified';
            else if (['uploaded', 'pending'].includes(stage)) state = 'pending_review';
            else if (['needs_correction', 'rejected'].includes(stage)) state = 'needs_correction';
            else if (isOverdue) state = 'overdue';
            else if (month === currentMonthValue()) state = 'due';
            return {
                month,
                payment,
                stage,
                state,
                isOverdue,
                actionable: ['overdue', 'due', 'needs_correction'].includes(state),
            };
        });
    }

    function repaymentScheduleStatus(item) {
        if (item.state === 'verified') {
            return { label: item.payment && isLatePayment(item.payment) ? 'Late Payment Accepted' : 'Paid', className: 'status-verified', helper: 'Accepted by PDO/Admin.' };
        }
        if (item.state === 'pending_review') {
            return { label: item.isOverdue ? 'Late Payment Submitted' : 'Submitted', className: 'status-pending', helper: 'Waiting for PDO/Admin review.' };
        }
        if (item.state === 'needs_correction') {
            return { label: item.isOverdue ? 'Late Payment Requires New Receipt' : 'Requires New Receipt', className: 'status-pending', helper: 'Upload a new receipt for this month.' };
        }
        if (item.state === 'overdue') {
            return { label: 'Overdue', className: 'status-overdue', helper: 'Submit late payment proof for this month.' };
        }
        if (item.state === 'due') {
            return { label: 'Due Now', className: 'status-uploaded', helper: 'Submit payment proof for this month.' };
        }
        return { label: 'Upcoming', className: 'status-uploaded', helper: 'No action needed yet.' };
    }

    function mapPaymentStage(stage) {
        const normalized = normalizeStatus(stage);
        if (!normalized) return 'uploaded';
        if (normalized === 'verified') return 'verified';
        if (normalized === 'uploaded') return 'uploaded';
        if (normalized === 'pending' || normalized === 'pendingverification') return 'pending';
        if (normalized === 'needscorrection' || normalized === 'needscorrection') return 'needs_correction';
        if (normalized === 'rejected' || normalized === 'flagged') return 'rejected';
        return 'uploaded';
    }

    function getPaymentsForMonth(month) {
        const normalized = normalizeMonthValue(month);
        return getDisplayPayments().filter((payment) => normalizeMonthValue(payment.month) === normalized);
    }

    function isPaymentLocked(payment) {
        return !isPaymentEditable(payment);
    }

    function getSubmissionPayments(submissionId) {
        return payments.filter((payment) => payment.parentSubmissionId && payment.parentSubmissionId === submissionId);
    }

    function removeSubmissionById(submissionId) {
        if (!submissionId) return;
        payments = payments.filter((payment) => payment.parentSubmissionId !== submissionId);
        groupedSubmissions = groupedSubmissions.filter((submission) => submission.submissionId !== submissionId);
    }

    function planEditableMonthIlisiment(months, paymentList = payments) {
        const targetMonths = uniqueMonths(months);
        const sourcePayments = Array.isArray(paymentList) ? paymentList : payments;
        const collisions = sourcePayments.filter((payment) => targetMonths.includes(normalizeMonthValue(payment.month)));
        if (!collisions.length) {
            return { ok: true, paymentIdsToRemove: [], parentIdsToRemove: [] };
        }

        const locked = collisions.find((payment) => isPaymentLocked(payment));
        if (locked) {
            return { ok: false, message: `The record for ${formatMonth(padMonth(locked.month))} is already locked after review.` };
        }

        const parentIds = Array.from(new Set(collisions.map((payment) => payment.parentSubmissionId).filter(Boolean)));
        for (const parentId of parentIds) {
            const groupedMonths = uniqueMonths(getSubmissionPayments(parentId).map((payment) => payment.month));
            const everyMonthIncluded = groupedMonths.every((month) => targetMonths.includes(month));
            if (!everyMonthIncluded) {
                return { ok: false, message: 'A grouped catch-up receipt already covers one of the selected months. Replace the full grouped receipt instead.' };
            }
        }

        return {
            ok: true,
            paymentIdsToRemove: collisions.map((payment) => payment.id),
            parentIdsToRemove: parentIds
        };
    }

    function applyIlisimentPlan(plan) {
        if (!plan?.ok) {
            return;
        }
        (plan.parentIdsToRemove || []).forEach(removeSubmissionById);
        const paymentIds = new Set(plan.paymentIdsToRemove || []);
        if (paymentIds.size) {
            payments = payments.filter((payment) => !paymentIds.has(payment.id));
        }
    }

    function stripIlisimentPlanFromPayments(paymentList, plan) {
        if (!plan?.ok) {
            return normalizePayments(paymentList);
        }
        const paymentIds = new Set(plan.paymentIdsToRemove || []);
        return normalizePayments((Array.isArray(paymentList) ? paymentList : []).filter((payment) => !paymentIds.has(payment.id)));
    }

    function findDuplicateOrNumber(orNumber, options = {}) {
        const normalized = normalizeOrNumber(orNumber);
        if (!normalized) {
            return null;
        }
        const ignoredIds = new Set(options.ignorePaymentIds || []);
        const sourcePayments = Array.isArray(options.paymentList) ? options.paymentList : payments;
        return sourcePayments.find((payment) => {
            if (ignoredIds.has(payment.id)) {
                return false;
            }
            return normalizeOrNumber(payment.orNumber) === normalized;
        }) || null;
    }

    function clonePaymentsState() {
        return normalizePayments(payments.map((payment) => ({ ...payment })));
    }

    function getCarryOverSources(paymentList, excludedPaymentIds = []) {
        const excluded = new Set(excludedPaymentIds);
        return paymentList
            .filter((payment) => !excluded.has(payment.id))
            .filter((payment) => Number(payment.remainingCredit || 0) > 0)
            .filter((payment) => mapPaymentStage(payment.stage) !== 'rejected')
            .sort((a, b) => {
                const dateA = new Date(a.paymentDate || padMonth(a.month)).getTime();
                const dateB = new Date(b.paymentDate || padMonth(b.month)).getTime();
                return dateA - dateB;
            });
    }

    function consumeCarryOver(paymentList, requestedAmount, excludedPaymentIds = []) {
        let remainingRequest = roundCurrency(requestedAmount);
        let totalApplied = 0;
        const sources = getCarryOverSources(paymentList, excludedPaymentIds);
        for (const source of sources) {
            if (remainingRequest <= 0) {
                break;
            }
            const available = roundCurrency(source.remainingCredit || 0);
            if (available <= 0) {
                continue;
            }
            const applied = roundCurrency(Math.min(available, remainingRequest));
            source.remainingCredit = roundCurrency(available - applied);
            totalApplied = roundCurrency(totalApplied + applied);
            remainingRequest = roundCurrency(remainingRequest - applied);
        }
        return totalApplied;
    }

    // Guard beneficiary uploads so only accepted OR or proof formats and sizes enter the workflow.
    function validateProofFile(file) {
        if (!(file instanceof File)) {
            return 'Please upload an OR file.';
        }
        const extension = String(file.name || '').split('.').pop()?.toLowerCase() || '';
        const hasValidExtension = SUPPORTED_PROOF_EXTENSIONS.includes(extension);
        const hasValidType = !file.type || SUPPORTED_PROOF_MIME_TYPES.includes(file.type);
        if (!hasValidExtension || !hasValidType) {
            return 'Upload a JPG, PNG, or PDF file only.';
        }
        return '';
    }

    function readProofFile(file) {
        return new Promise((resolve, reject) => {
            const validationMessage = validateProofFile(file);
            if (validationMessage) {
                reject(new Error(validationMessage));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                resolve({
                    proof: String(reader.result || ''),
                    proofName: file.name || 'proof',
                    proofType: file.type || ''
                });
            };
            reader.onerror = () => reject(new Error('Unable to read the uploaded OR file.'));
            reader.readAsDataURL(file);
        });
    }

    function getBeneficiarySubmissionMeta() {
        return {
            beneficiaryId,
            beneficiaryName: user.fullName || user.name || '',
            beneficiaryBusiness: user.businessName || beneficiaryRecord?.businessName || applicationRecord?.businessName || '',
            beneficiaryBarangay: user.barangay || beneficiaryRecord?.profile?.barangay || applicationRecord?.barangay || '',
            beneficiaryEmail: user.email || ''
        };
    }

    function buildMonthlyPaymentRecord({
        month,
        paymentDate,
        amount,
        notes,
        orNumber,
        proof,
        proofName,
        proofType,
        parentSubmissionId = null,
        coverageFrom = null,
        coverageTo = null,
        allocatedAmount = 0,
        creditApplied = 0,
        remainingCredit = 0,
        submittedAt = new Date().toISOString(),
        beneficiaryId: recordBeneficiaryId = null,
        beneficiaryName = '',
        beneficiaryBusiness = '',
        beneficiaryBarangay = '',
        beneficiaryEmail = ''
    }) {
        const normalizedMonth = normalizeMonthValue(month);
        return normalizePaymentRecord({
            id: createSubmissionId('PAY'),
            month: normalizedMonth,
            paymentDate,
            amount: roundCurrency(amount),
            stage: 'uploaded',
            verifiedBy: '',
            verifiedAt: '',
            notes,
            adminRemarks: '',
            orNumber,
            proof,
            proofName,
            proofType,
            submittedAt,
            beneficiaryId: recordBeneficiaryId,
            beneficiaryName,
            beneficiaryBusiness,
            beneficiaryBarangay,
            beneficiaryEmail,
            parentSubmissionId,
            coverageFrom: coverageFrom || normalizedMonth,
            coverageTo: coverageTo || normalizedMonth,
            allocatedAmount,
            creditApplied,
            remainingCredit
        });
    }

    // Convert one beneficiary upload into the normalized monthly submission record used by the UI and backend sync.
    function createSingleMonthSubmission(data, context = {}) {
        const paymentList = context.paymentList || payments;
        const meta = getBeneficiarySubmissionMeta();
        const submittedAt = new Date().toISOString();
        const replacement = planEditableMonthIlisiment([data.month], paymentList);
        if (!replacement.ok) {
            throw new Error(replacement.message);
        }
        const duplicateOr = findDuplicateOrNumber(data.orNumber, {
            paymentList,
            ignorePaymentIds: replacement.paymentIdsToRemove
        });
        if (duplicateOr) {
            throw new Error('That OR number already exists in your repayment records.');
        }
        const creditApplied = consumeCarryOver(paymentList, MONTHLY_REPAYMENT_AMOUNT, replacement.paymentIdsToRemove);
        const remainingCredit = roundCurrency(Math.max(0, Number(data.amount || 0) + creditApplied - MONTHLY_REPAYMENT_AMOUNT));
        return {
            payments: [
                buildMonthlyPaymentRecord({
                    month: data.month,
                    paymentDate: data.paymentDate,
                    amount: data.amount,
                    notes: data.notes,
                    orNumber: data.orNumber,
                    proof: data.proof,
                    proofName: data.proofName,
                    proofType: data.proofType,
                    submittedAt,
                    ...meta,
                    allocatedAmount: roundCurrency(Number(data.amount || 0) + creditApplied),
                    creditApplied,
                    remainingCredit
                })
            ],
            submissions: [],
            replacementPlan: replacement,
            paymentList
        };
    }

    function buildAuditFromPayments(list) {
        const verifiedAudits = list
            .filter((p) => mapPaymentStage(p.stage) === 'verified')
            .map((p) => ({
                title: 'Receipt verified',
                kind: 'verified',
                message: `${p.verifiedBy || 'Admin'} verified ${formatMonth(padMonth(p.month))} receipt (${formatCurrency(p.amount)}).`,
                timestamp: p.verifiedAt || new Date().toISOString()
            }));

        const uploadedAudits = list
            .filter((p) => mapPaymentStage(p.stage) === 'uploaded' || mapPaymentStage(p.stage) === 'pending')
            .map((p) => ({
                title: 'Receipt uploaded',
                kind: 'uploaded',
                message: `Uploaded OR ${p.orNumber || ''} for ${formatMonth(padMonth(p.month))}. Awaiting verification.`,
                timestamp: new Date().toISOString()
            }));

        return verifiedAudits.concat(uploadedAudits)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 12);
    }

    function getPaymentStatus(payment) {
        const stage = mapPaymentStage(payment.stage);
        const late = isLatePayment(payment);
        if (stage === 'verified') return { label: late ? 'Late Payment Accepted' : 'Verified', className: 'status-verified' };
        if (stage === 'uploaded') return { label: late ? 'Late Payment Submitted' : 'Uploaded', className: 'status-uploaded' };
        if (stage === 'pending') return { label: late ? 'Late Payment Submitted' : 'Pending verification', className: 'status-pending' };
        if (stage === 'needs_correction') return { label: late ? 'Late Receipt Needs Update' : 'Receipt Needs Update', className: 'status-pending' };
        if (stage === 'rejected') return { label: late ? 'Late Receipt Rejected' : 'Receipt Rejected', className: 'status-overdue' };
        return { label: 'Uploaded', className: 'status-uploaded' };
    }

    function hasPaymentBeenNasusi(payment) {
        const stage = normalizeStatus(payment?.stage || '');
        if (Boolean(payment?.verifiedAt) || Boolean(payment?.verifiedBy)) {
            return true;
        }
        return ['verified', 'rejected', 'flagged', 'needscorrection', 'checked', 'reviewed'].includes(stage);
    }

    function isPaymentEditable(payment) {
        const stage = mapPaymentStage(payment?.stage || '');
        if (['rejected', 'needs_correction'].includes(stage)) {
            return true;
        }
        if (['uploaded', 'pending'].includes(stage)) {
            return false;
        }
        return !hasPaymentBeenNasusi(payment);
    }

    function mapAttendanceBadge(status) {
        const key = String(status || 'pending').toLowerCase();
        const map = {
            present: { label: 'Present', className: 'present' },
            absent: { label: 'Absent', className: 'absent' },
            late: { label: 'Late', className: 'late' },
            excused: { label: 'Excused', className: 'excused' },
            pending: { label: 'Pending', className: 'pending' }
        };
        return map[key] || map.pending;
    }

    function resolveAttendanceStatus(value) {
        if (!value) return 'pending';
        if (typeof value === 'string') return value;
        return value.status || value.state || 'pending';
    }

    function formatVerification(payment) {
        const stage = mapPaymentStage(payment.stage);
        if (stage === 'verified') {
            const dateText = formatDate(payment.verifiedAt);
            return `${payment.verifiedBy || 'Admin'}${dateText ? ` - ${dateText}` : ''}${payment.notes ? ` - ${escapeHtml(payment.notes)}` : ''}`;
        }
        if (stage === 'uploaded') {
            return payment.notes ? escapeHtml(payment.notes) : 'Uploaded for verification.';
        }
        if (stage === 'pending') {
            return payment.notes ? escapeHtml(payment.notes) : 'Pending verification.';
        }
        if (stage === 'needs_correction') {
            return payment.notes ? escapeHtml(payment.notes) : 'This receipt needs to be replaced with a corrected upload.';
        }
        if (stage === 'rejected') {
            return payment.notes ? escapeHtml(payment.notes) : 'This receipt was rejected. Upload a new receipt for this month.';
        }
        return 'For upload';
    }

    function buildPaymentRemarks(payment) {
        const parts = [];
        if (payment.parentSubmissionId && payment.coverageFrom && payment.coverageTo && payment.coverageFrom !== payment.coverageTo) {
            parts.push(`Covered by grouped OR (${payment.coverageFrom} to ${payment.coverageTo})`);
        }
        if (Number(payment.creditApplied || 0) > 0) {
            parts.push(`Credit applied ${formatCurrency(payment.creditApplied)}`);
        }
        if (Number(payment.remainingCredit || 0) > 0) {
            parts.push(`Remaining credit ${formatCurrency(payment.remainingCredit)}`);
        }
        if (payment.adminRemarks) {
            parts.push(payment.adminRemarks);
        } else if (payment.notes) {
            parts.push(payment.notes);
        }
        return parts.length ? parts.join(' | ') : '-';
    }

    // Summarize the reviewer-facing result of a payment so the beneficiary immediately sees what happened next.
    function buildPaymentReviewNote(payment) {
        const stage = mapPaymentStage(payment?.stage);
        const reviewerName = String(payment?.reviewedBy || payment?.verifiedBy || '').trim();
        const reviewerRole = String(payment?.reviewedByRole || '').trim().replace(/_/g, ' ');
        const reviewedAt = String(payment?.reviewedAt || payment?.verifiedAt || '').trim();
        const actor = reviewerName
            || (reviewerRole ? reviewerRole.replace(/\b\w/g, (char) => char.toUpperCase()) : 'PDO/Admin');
        const dateText = formatDate(reviewedAt);

        if (stage === 'verified') {
            return `Verified by ${actor}${dateText ? ` on ${dateText}` : ''}`;
        }
        if (stage === 'needs_correction') {
            return `${actor} requested correction${dateText ? ` on ${dateText}` : ''}`;
        }
        if (stage === 'rejected') {
            return `${actor} rejected this receipt${dateText ? ` on ${dateText}` : ''}`;
        }
        if (stage === 'pending' || stage === 'uploaded') {
            return 'Awaiting PDO/Admin verification';
        }
        return actor && dateText ? `Reviewed by ${actor} on ${dateText}` : 'For review';
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function showToast(message, tone = 'info') {
        const stack = document.getElementById('toastStack');
        if (!stack) return;
        const toast = document.createElement('div');
        toast.className = `toast ${tone}`;
        toast.textContent = message;
        stack.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade');
            toast.style.opacity = '0';
        }, 2800);
        setTimeout(() => {
            toast.remove();
        }, 3600);
    }

    function setProgressBar(id, percent) {
        const bar = document.getElementById(id);
        if (bar) {
            const safe = Math.max(0, Math.min(100, Math.round(percent)));
            bar.style.width = `${safe}%`;
        }
    }

    function formatCount(count, singular, plural) {
        const value = Number(count) || 0;
        const label = value === 1 ? (singular || '') : (plural || `${singular || ''}s`);
        return `${value} ${label}`.trim();
    }

    function formatCurrency(value) {
        const amount = Number(value || 0);
        return `\u20B1${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    function formatDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function formatMonth(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    }

    function padMonth(monthText) {
        if (!monthText) return '';
        const [year, month] = monthText.split('-');
        if (!year || !month) return monthText;
        return `${year}-${month.padStart(2, '0')}-01`;
    }

    function parseMonth(monthText) {
        if (!monthText) return null;
        const date = new Date(padMonth(monthText));
        if (Number.isNaN(date.getTime())) return null;
        return date;
    }

    function isReleasedStatus(status) {
        const normalized = normalizeStatus(status);
        return normalized.includes('released') || normalized.includes('beneficiary');
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value ?? '';
        return div.innerHTML;
    }
})();












