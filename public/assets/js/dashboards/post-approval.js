/*
 * SMART LEAP FILE GUIDE
 * Dashboard script for p os t a pp ro va l.
 * Controls one role-specific workspace page, including its live state, interactions, and any page-owned modals or drawers.
 */
(function () {
    const state = {
        baseUrl: window.SMARTLEAP_BASE_URL || '',
        authUser: window.SMARTLEAP_AUTH_USER || null,
        tracker: null,
    };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindStaticEvents();
        await loadTrackerState();
    }

    function bindStaticEvents() {
        document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
        document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebarMenu);
        document.getElementById('sidebarClose')?.addEventListener('click', closeSidebarMenuOnMobile);
        document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebarMenuOnMobile);
        window.addEventListener('resize', syncSidebarMenuState);
        window.setInterval(renderTaskCountdowns, 60000);
        document.addEventListener('keydown', handleGlobalKeydown);
        syncSidebarMenuState();
    }

    async function loadTrackerState() {
        try {
            const payload = await fetchJson('api/post-approval');
            if (!payload.ok) {
                throw new Error(payload.message || 'Unable to load post-approval tasks.');
            }

            state.tracker = payload.state || null;
            renderTracker();
        } catch (error) {
            renderFatalState(error.message || 'Unable to load post-approval tasks.');
        }
    }

    function renderTracker() {
        renderIdentity();

        if (!state.tracker) {
            renderFatalState('Post-approval tracker is unavailable.');
            return;
        }

        const tasks = Array.isArray(state.tracker.tasks) ? state.tracker.tasks : [];
        const summary = state.tracker.summary || {};
        const firstActionable = tasks.find((task) => task.interactive && ['Unlocked', 'In Progress', 'Needs Correction', 'Rejected'].includes(task.status))
            || tasks.find((task) => task.interactive)
            || tasks[0]
            || null;
        const remarkTask = tasks.find((task) => task.reviewerRemarks);

        setText('trackerPriority', firstActionable ? firstActionable.title : 'Waiting for training completion');
        setText('trackerNextAction', firstActionable ? (firstActionable.interactive ? 'What to do next: open the available form below.' : 'What to do next: wait for the earlier step to finish.') : 'Forms will appear here when available.');
        setText('trackerUnlockedAt', state.tracker.unlockedAt ? formatDateTime(state.tracker.unlockedAt) : 'Not unlocked');
        setText('trackerUnlockMeta', state.tracker.isUnlocked
            ? `Unlocked after training completion${state.tracker.unlockedAt ? ` on ${formatDateTime(state.tracker.unlockedAt)}` : ''}.`
            : 'Training completion has not unlocked your post-approval tasks yet.');
        setText('trackerTaskCount', `${tasks.length} task${tasks.length === 1 ? '' : 's'}`);
        setText('trackerTaskChip', `${tasks.length} task${tasks.length === 1 ? '' : 's'}`);
        setText('trackerProgressMeta', tasks.length > 0
            ? `${(summary.submitted || 0) + (summary.inProgress || 0) + (summary.needsCorrection || 0)} form${(((summary.submitted || 0) + (summary.inProgress || 0) + (summary.needsCorrection || 0)) === 1) ? '' : 's'} still need action or review.`
            : 'No post-approval tasks are currently available.');
        setText('trackerFeedbackSummary', remarkTask ? 'Please review' : 'No fix needed');
        setText('trackerFeedbackMeta', remarkTask ? remarkTask.reviewerRemarks : 'If a reviewer asks for changes, the note will appear here.');
        setText('trackerSubtitle', state.tracker.isUnlocked
            ? 'Look for the form marked available now. Waiting forms cannot be opened yet.'
            : 'This tracker will activate once training completion unlocks the post-approval phase.');

        renderTaskCards(tasks);
    }

    function renderIdentity() {
        const authUser = state.authUser || {};
        const displayName = authUser.name || 'Applicant';
        const initial = (displayName.trim().charAt(0) || 'A').toUpperCase();

        setText('sidebarUserName', displayName);

        ['sidebarAvatar'].forEach((id) => {
            const node = document.getElementById(id);
            if (node) {
                node.textContent = initial;
            }
        });
    }

    function renderTaskCards(tasks) {
        const container = document.getElementById('trackerTaskCards');
        if (!container) {
            return;
        }

        if (tasks.length === 0) {
            container.innerHTML = '<article class="post-approval-taskcard is-empty">Post-approval tasks will appear here after training completion.</article>';
            return;
        }

        container.innerHTML = tasks.map((task, index) => {
            const isAvailable = task.interactive && String(task.status || '') !== 'Locked';
            const href = isAvailable
                ? routeUrl(`post-approval-form?code=${encodeURIComponent(task.code)}`)
                : '';
            const summary = task.summary || task.helpText || 'Task details will appear here.';
            const progressText = buildTaskProgressText(task);
            const primaryState = buildTaskPrimaryState(task);
            const schedule = buildTaskSchedule(task, state.tracker?.schedule || null);

            return `
                <article class="post-approval-taskcard ${isAvailable ? 'is-clickable' : 'is-disabled'}" ${isAvailable ? '' : 'aria-disabled="true"'}>
                    <div class="post-approval-taskcard__meta">
                        <span class="post-approval-taskcard__index">Step ${index + 1}</span>
                        <span class="post-approval-taskcard__status status-${slugify(task.status)}">${escapeHtml(task.status)}</span>
                        <span class="post-approval-taskcard__badge ${isAvailable ? '' : 'is-muted'}">${escapeHtml(primaryState)}</span>
                    </div>
                    <strong>${escapeHtml(task.title)}</strong>
                    <p>${escapeHtml(summary)}</p>
                    <div class="post-approval-taskcard__schedule" data-task-countdown="${escapeAttribute(schedule.closesAt || '')}">
                        <span>${escapeHtml(schedule.openedText)}</span>
                        <span>${escapeHtml(schedule.closesText)}</span>
                        <strong>${escapeHtml(schedule.remainingText)}</strong>
                    </div>
                    <div class="post-approval-taskcard__footer">
                        <span>${escapeHtml(progressText)}</span>
                        <span class="post-approval-taskcard__actions">
                            ${task.reviewerRemarks ? '<span class="post-approval-taskcard__issue">Reviewer remarks</span>' : ''}
                            ${isAvailable ? '<span class="tracker-task-open">Open task</span>' : '<span class="post-approval-taskcard__locked-note">Unavailable</span>'}
                        </span>
                    </div>
                    ${isAvailable ? `<a class="post-approval-taskcard__overlay" href="${escapeAttribute(href)}" aria-label="Open ${escapeAttribute(task.title)}"></a>` : ''}
                </article>
            `;
        }).join('');
    }

    function renderFatalState(message) {
        showToast(message, 'warning');
        setText('trackerSubtitle', message);
        const container = document.getElementById('trackerTaskCards');
        if (container) {
            container.innerHTML = `<article class="post-approval-taskcard is-empty">${escapeHtml(message)}</article>`;
        }
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
            throw new Error(payload.message || 'Request failed.');
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
            closeSidebarMenuOnMobile();
        }
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

    function buildTaskSchedule(task, fallbackSchedule = null) {
        const schedule = task?.schedule || {};
        const openedAt = schedule.openedAt || fallbackSchedule?.openedAt || task?.startedAt || '';
        const closesAt = task?.dueDate || schedule.closesAt || fallbackSchedule?.closesAt || '';
        const programTitle = schedule.programTitle || '';

        return {
            openedAt,
            closesAt,
            openedText: openedAt ? `Opened: ${formatDateTime(openedAt)}` : 'Opened: Waiting for admin schedule',
            closesText: closesAt ? `Closes: ${formatDateTime(closesAt)}` : 'Closes: No close time set yet',
            remainingText: buildCountdownText(closesAt, programTitle),
        };
    }

    function buildCountdownText(closesAt, label = '') {
        if (!closesAt) {
            return 'No countdown available';
        }

        const deadline = new Date(closesAt).getTime();
        if (Number.isNaN(deadline)) {
            return `Closes on ${closesAt}`;
        }

        const diff = deadline - Date.now();
        if (diff <= 0) {
            return label ? `Closed for ${label}` : 'Closed';
        }

        const totalMinutes = Math.ceil(diff / 60000);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0 || days > 0) parts.push(`${hours}h`);
        parts.push(`${minutes}m`);

        return `Time left: ${parts.join(' ')}`;
    }

    function renderTaskCountdowns() {
        document.querySelectorAll('[data-task-countdown]').forEach((node) => {
            const deadline = node.getAttribute('data-task-countdown') || '';
            const countdown = node.querySelector('strong');
            if (countdown) {
                countdown.textContent = buildCountdownText(deadline);
            }
        });
    }

    function slugify(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function buildTaskProgressText(task) {
        const normalized = String(task.status || '').toLowerCase();
        if (normalized === 'verified') return 'Done';
        if (normalized === 'submitted') return 'Sent and waiting for review';
        if (normalized === 'needs correction') return 'Needs correction before it can move forward';
        if (normalized === 'rejected') return 'Returned for changes';
        if (normalized === 'locked') return 'Waiting for the earlier form';
        return `${task.completion || 0}% complete`;
    }

    function buildTaskPrimaryState(task) {
        const normalized = String(task.status || '').toLowerCase();
        if (normalized === 'verified') return 'Done';
        if (normalized === 'locked') return 'Waiting for earlier step';
        if (task.interactive) return 'Available now';
        return 'Waiting for earlier step';
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
})();
