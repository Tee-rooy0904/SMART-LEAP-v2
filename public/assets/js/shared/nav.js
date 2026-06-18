(function () {
  const { qs, qsa, on } = window.App.dom;
  const { state } = window.App.state;

  const sectionMap = {
    dashboard: '#dashboard-section',
    applications: '#applications-section',
    repayments: '#repayments-section',
    training: '#training-section',
    reports: '#reports-section',
    users: '#users-section',
  };

  const setActiveSection = (key) => {
    state.activeSection = key;
    Object.keys(sectionMap).forEach((sectionKey) => {
      const el = qs(sectionMap[sectionKey]);
      if (!el) return;
      el.style.display = sectionKey === key ? '' : 'none';
    });

    qsa('.sidebar-nav .nav-link').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.section === key);
    });

    if (window.App.modules && window.App.modules[key] && window.App.modules[key].render) {
      window.App.modules[key].render();
    }
  };

  const initNav = () => {
    qsa('.sidebar-nav .nav-link').forEach((btn) => {
      on(btn, 'click', () => {
        const section = btn.dataset.section;
        if (section) setActiveSection(section);
      });
    });

    const toggle = qs('.sidebar-toggle');
    const shell = qs('#mainSystem');
    const backdrop = qs('.sidebar-backdrop');

    on(toggle, 'click', () => {
      if (!shell) return;
      const isOpen = shell.dataset.sidebarOpen === 'true';
      shell.dataset.sidebarOpen = isOpen ? 'false' : 'true';
    });

    on(backdrop, 'click', () => {
      if (!shell) return;
      shell.dataset.sidebarOpen = 'false';
    });

    setActiveSection(state.activeSection || 'dashboard');
  };

  window.App = window.App || {};
  window.App.modules = window.App.modules || {};
  window.App.modules.nav = { init: initNav, setActiveSection };
})();
