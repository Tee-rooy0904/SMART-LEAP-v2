(function () {
  const authUser = window.SMARTLEAP_AUTH_USER || null;
  if (!authUser) return;

  const state = {
    notifications: [],
    open: false,
    loading: false,
    root: null,
    panel: null,
    toggle: null,
    pollTimer: null,
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const mount = resolveMountPoint();
    if (!mount) return;

    state.root = document.createElement('div');
    state.root.className = 'smart-notification-center';
    state.root.innerHTML = notificationShell();
    insertIntoMount(mount, state.root);
    state.toggle = state.root.querySelector('[data-notification-toggle]');
    state.panel = state.root.querySelector('[data-notification-panel]');

    state.toggle?.addEventListener('click', togglePanel);
    state.root.querySelector('[data-notification-refresh]')?.addEventListener('click', () => loadNotifications(true));
    state.root.querySelector('[data-notification-mark-all]')?.addEventListener('click', markAllRead);
    state.root.querySelector('[data-notification-list]')?.addEventListener('click', handleListClick);

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (
        state.open
        && state.root
        && !state.root.contains(target)
        && !(state.panel && state.panel.contains(target))
      ) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    });

    loadNotifications(false);
    state.pollTimer = window.setInterval(() => loadNotifications(false), 60000);
    window.SMARTLEAP_NOTIFICATION_CENTER_CLOSE = () => setOpen(false);
    document.addEventListener('smartleap:close-notifications', () => setOpen(false));
    window.addEventListener('resize', syncFloatingPanelLayout);
  }

  function resolveMountPoint() {
    return document.querySelector('#beneficiaryNotificationMount')
      || document.querySelector('#applicantNotificationMount')
      || document.querySelector('.admin-topbar__actions')
      || document.querySelector('.project-officer-shell .header-actions')
      || document.querySelector('.social-worker-shell .header-actions')
      || document.querySelector('.mobile-topbar')
      || document.querySelector('.content-header .header-actions')
      || document.querySelector('.content-header')
      || document.body;
  }

  function insertIntoMount(mount, root) {
    if (mount.id === 'beneficiaryNotificationMount' || mount.id === 'applicantNotificationMount') {
      mount.appendChild(root);
      return;
    }

    if (mount === document.body) {
      root.classList.add('smart-notification-center--floating');
      mount.appendChild(root);
      return;
    }

    const accountMenu = mount.querySelector('.admin-account-menu, .mobile-topbar__account');
    if (accountMenu && accountMenu.parentElement === mount) {
      mount.insertBefore(root, accountMenu);
      return;
    }

    if (mount.classList.contains('mobile-topbar')) {
      mount.appendChild(root);
      return;
    }

    mount.insertBefore(root, mount.firstChild);
  }

  function notificationShell() {
    return `
      <button type="button" class="smart-notification-toggle" data-notification-toggle aria-expanded="false" aria-label="Open notifications">
        <span class="smart-notification-toggle__icon" aria-hidden="true">!</span>
        <span class="smart-notification-toggle__text">Notifications</span>
        <span class="smart-notification-toggle__badge" data-notification-badge hidden>0</span>
      </button>
      <section class="smart-notification-panel" data-notification-panel hidden>
        <header class="smart-notification-panel__header">
          <div>
            <span class="smart-notification-panel__eyebrow">Notification Center</span>
            <h2>Updates</h2>
          </div>
          <button type="button" class="smart-notification-panel__refresh" data-notification-refresh>Refresh</button>
        </header>
        <div class="smart-notification-panel__meta" data-notification-meta>Loading updates...</div>
        <ul class="smart-notification-list" data-notification-list>
          <li class="smart-notification-empty">Loading notifications...</li>
        </ul>
        <footer class="smart-notification-panel__footer">
          <button type="button" class="smart-notification-mark" data-notification-mark-all>Mark all as read</button>
        </footer>
      </section>
    `;
  }

  async function loadNotifications(showLoading) {
    if (state.loading) return;
    state.loading = true;
    if (showLoading) {
      setMeta('Refreshing updates...');
    }

    try {
      const response = await fetch(routeUrl('api/notifications'), {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || 'Unable to load notifications.');
      }

      state.notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
      render();
      dispatchUpdate();
    } catch (error) {
      setMeta(error.message || 'Unable to load notifications.');
      renderListError();
    } finally {
      state.loading = false;
    }
  }

  function render() {
    renderBadge();
    renderList();
    const unread = unreadNotifications().length;
    const total = state.notifications.length;
    setMeta(total === 0
      ? 'No notifications yet.'
      : `${unread} unread update${unread === 1 ? '' : 's'} out of ${total}.`);
  }

  function renderBadge() {
    const badge = state.root?.querySelector('[data-notification-badge]');
    const count = unreadNotifications().length;
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count <= 0;
  }

  function renderList() {
    const list = state.panel?.querySelector('[data-notification-list]');
    if (!list) return;

    if (!state.notifications.length) {
      list.innerHTML = '<li class="smart-notification-empty">No notifications yet.</li>';
      return;
    }

    list.innerHTML = state.notifications.map((item) => {
      const id = Number(item.id || 0);
      const isRead = Boolean(item.isRead);
      return `
        <li class="smart-notification-item ${isRead ? 'is-read' : 'is-unread'}">
          <div class="smart-notification-item__main">
            <div class="smart-notification-item__top">
              <strong>${escapeHtml(item.title || 'Notification')}</strong>
              <span>${escapeHtml(formatDateTime(item.sentAt || item.createdAt))}</span>
            </div>
            <p>${escapeHtml(item.message || '')}</p>
            <small>${escapeHtml(channelLabel(item.channel || 'in_app'))}</small>
          </div>
          ${!isRead && id > 0 ? `<button type="button" data-notification-read="${id}" class="smart-notification-item__read">Mark read</button>` : ''}
        </li>
      `;
    }).join('');
  }

  function renderListError() {
    const list = state.panel?.querySelector('[data-notification-list]');
    if (list) {
      list.innerHTML = '<li class="smart-notification-empty">Unable to load notifications right now.</li>';
    }
  }

  function handleListClick(event) {
    const button = event.target.closest('[data-notification-read]');
    if (!button) return;
    const id = Number(button.dataset.notificationRead || 0);
    if (id > 0) {
      markRead([id]);
    }
  }

  function togglePanel(event) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!state.open);
  }

  function setOpen(open) {
    state.open = Boolean(open);
    const panel = state.panel;
    const toggle = state.toggle;
    syncFloatingPanelLayout();
    if (panel) panel.hidden = !state.open;
    if (toggle) toggle.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    document.dispatchEvent(new CustomEvent('smartleap:notifications-toggle', {
      detail: { open: state.open },
    }));
    if (state.open) {
      loadNotifications(false);
    }
  }

  function markAllRead() {
    const ids = unreadNotifications().map((item) => Number(item.id || 0)).filter((id) => id > 0);
    markRead(ids);
  }

  async function markRead(ids) {
    const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : [])
      .map((id) => Number(id || 0))
      .filter((id) => id > 0)));
    if (!uniqueIds.length) return;

    state.notifications = state.notifications.map((item) => uniqueIds.includes(Number(item.id || 0))
      ? { ...item, isRead: true }
      : item);
    render();

    try {
      const response = await fetch(routeUrl('api/notifications/read'), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json;charset=UTF-8',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ ids: uniqueIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || 'Unable to mark notifications read.');
      }
      if (Array.isArray(payload.notifications)) {
        state.notifications = payload.notifications;
        render();
        dispatchUpdate();
      }
    } catch (error) {
      setMeta(error.message || 'Unable to mark notifications read.');
      loadNotifications(false);
    }
  }

  function unreadNotifications() {
    return state.notifications.filter((item) => !item.isRead);
  }

  function setMeta(text) {
    const node = state.panel?.querySelector('[data-notification-meta]');
    if (node) node.textContent = text;
  }

  function shouldFloatForPortalMobile() {
    return Boolean(
      ['beneficiaryNotificationMount', 'applicantNotificationMount'].includes(state.root?.parentElement?.id || '')
      && window.matchMedia
      && window.matchMedia('(max-width: 720px)').matches
    );
  }

  function syncFloatingPanelLayout() {
    const panel = state.panel;
    const root = state.root;
    const toggle = state.toggle;
    if (!panel || !root || !toggle) {
      return;
    }

    if (shouldFloatForPortalMobile()) {
      if (panel.parentElement !== document.body) {
        document.body.appendChild(panel);
      }
      panel.classList.add('smart-notification-panel--beneficiary-mobile');
      const rect = toggle.getBoundingClientRect();
      panel.style.top = `${Math.max(72, Math.round(rect.bottom + 10))}px`;
      panel.style.left = '12px';
      panel.style.right = '12px';
      panel.style.width = 'auto';
      return;
    }

    if (shouldFloatForStaffShell()) {
      if (panel.parentElement !== document.body) {
        document.body.appendChild(panel);
      }
      panel.classList.add('smart-notification-panel--staff-floating');
      const rect = toggle.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const panelWidth = Math.min(420, Math.max(320, viewportWidth - 24));
      const left = Math.max(12, Math.min(Math.round(rect.right - panelWidth), viewportWidth - panelWidth - 12));
      panel.style.top = `${Math.max(12, Math.round(rect.bottom + 12))}px`;
      panel.style.left = `${left}px`;
      panel.style.right = 'auto';
      panel.style.width = `${panelWidth}px`;
      return;
    }

    if (panel.parentElement !== root) {
      root.appendChild(panel);
    }
    panel.classList.remove('smart-notification-panel--beneficiary-mobile');
    panel.classList.remove('smart-notification-panel--staff-floating');
    panel.style.top = '';
    panel.style.left = '';
    panel.style.right = '';
    panel.style.width = '';
  }

  function shouldFloatForStaffShell() {
    return Boolean(
      document.querySelector('.project-officer-shell, .admin-shell, .social-worker-shell')
      && !['beneficiaryNotificationMount', 'applicantNotificationMount'].includes(state.root?.parentElement?.id || '')
    );
  }

  function dispatchUpdate() {
    document.dispatchEvent(new CustomEvent('smartleap:notifications-updated', {
      detail: { notifications: state.notifications.slice() },
    }));
  }

  function routeUrl(path) {
    const base = String(window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');
    const cleanPath = String(path || '').replace(/^\/+/, '');
    if (base) return `${base}/${cleanPath}`;
    const match = window.location.pathname.match(/^(.*\/public)(?:\/.*)?$/);
    return `${match ? match[1] : ''}/${cleanPath}`;
  }

  function channelLabel(channel) {
    const value = String(channel || '').replace(/_/g, ' ').trim();
    return value ? value.replace(/\b\w/g, (char) => char.toUpperCase()) : 'In App';
  }

  function formatDateTime(value) {
    const parsed = new Date(value || '');
    if (Number.isNaN(parsed.getTime())) return '--';
    return parsed.toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }
})();
