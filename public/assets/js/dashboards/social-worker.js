(function () {
  // Shared bootstrap values for the Social Worker workspace.
  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');
  const authUser = window.SMARTLEAP_AUTH_USER || {};
  let overview = window.SMARTLEAP_SOCIAL_WORKER_OVERVIEW || {};
  const APPLICATION_COLORS = {
    draft: '#cfdcf0',
    submitted: '#f2994a',
    under_review: '#31d0c6',
    checked_by_pdo: '#3e78ff',
    approved_for_training: '#1ba7e1',
    approved: '#8c61ff',
    needs_correction: '#f59e0b',
    rejected: '#dc2626',
  };
  const BENEFICIARY_COLORS = {
    active: '#16a34a',
    inactive: '#f59e0b',
    deceased: '#dc2626',
    pending: '#7c3aed',
  };
  const REPAYMENT_COLORS = {
    no_upload_yet: '#cfdcf0',
    under_review: '#3e78ff',
    needs_correction: '#f2994a',
    partial_paid: '#31d0c6',
    fully_paid: '#8c61ff',
  };
  const FALLBACK_CHART_COLORS = ['#1d4ed8', '#16a34a', '#f97316', '#7c3aed', '#dc2626', '#0891b2', '#be185d', '#4d7c0f'];

  // Client state for oversight lists, reports initialization, and help-desk tickets.
  const state = {
    section: 'dashboard',
    validationTab: 'pending',
    beneficiaryFilters: {
      search: '',
      barangay: '',
      pdo: '',
      repayment: '',
    },
    coMakerFilters: {
      search: '',
      status: '',
      pdo: '',
    },
    validationRecords: [
      ...(Array.isArray(overview.validationState?.pending) ? overview.validationState.pending : []),
      ...(Array.isArray(overview.validationState?.selected) ? overview.validationState.selected : []),
      ...(Array.isArray(overview.validationState?.saved) ? overview.validationState.saved : []),
    ],
    applications: Array.isArray(overview.assessmentQueue) ? overview.assessmentQueue.slice() : [],
    beneficiaries: Array.isArray(overview.beneficiaryRoster) ? overview.beneficiaryRoster.slice() : [],
    coMakers: Array.isArray(overview.coMakerRegistrations) ? overview.coMakerRegistrations.slice() : [],
    repayments: [],
    recentApplications: Array.isArray(overview.recentApplications) ? overview.recentApplications.slice() : [],
    tickets: [],
    activeTicketId: null,
    reportsInitialized: false,
    busy: false,
    overviewLoadPromise: null,
  };

  function asArray(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function syncOverviewState(nextOverview) {
    overview = nextOverview && typeof nextOverview === 'object' ? nextOverview : {};
    const validationState = overview.validationState || {};
    state.validationRecords = [
      ...asArray(validationState.pending),
      ...asArray(validationState.selected),
      ...asArray(validationState.saved),
    ];
    state.beneficiaries = asArray(overview.beneficiaryRoster);
    state.coMakers = asArray(overview.coMakerRegistrations);
    state.recentApplications = asArray(overview.recentApplications);
    populateBeneficiaryFilters();
    populateCoMakerFilters();
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  }

  function populateSelectOptions(selectId, values, emptyLabel, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;
    const currentValue = cleanText(selectedValue);
    const uniqueValues = uniqueSorted(values);
    select.innerHTML = [`<option value="">${escapeHtml(emptyLabel)}</option>`]
      .concat(uniqueValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`))
      .join('');
    select.value = uniqueValues.includes(currentValue) ? currentValue : '';
    if (!select.value) select.selectedIndex = 0;
  }

  function clearSelectState(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.value = '';
    select.selectedIndex = 0;
    delete select.dataset.userTouched;
  }

  function forceDefaultSelects(selectIds) {
    const apply = () => {
      selectIds.forEach((selectId) => {
        const select = document.getElementById(selectId);
        if (!select || select.dataset.userTouched === '1') return;
        select.value = '';
        select.selectedIndex = 0;
      });
    };
    apply();
    window.requestAnimationFrame(apply);
    window.setTimeout(apply, 80);
  }

  function selectFilterValue(selectId) {
    const select = document.getElementById(selectId);
    if (!select || select.dataset.userTouched !== '1') {
      return '';
    }
    return cleanText(select.value || '');
  }

  function selectFilterKey(selectId) {
    return normalizeKey(selectFilterValue(selectId));
  }

  function syncInputValue(inputId, value) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.value = value || '';
  }

  function syncBeneficiaryFilterControls() {
    syncInputValue('swBeneficiarySearch', state.beneficiaryFilters.search);
    populateSelectOptions(
      'swBeneficiaryBarangay',
      state.beneficiaries.map((item) => item.barangay || ''),
      'All barangays',
      state.beneficiaryFilters.barangay
    );
    populateSelectOptions(
      'swBeneficiaryPdo',
      state.beneficiaries.map((item) => item.assignedPdo || ''),
      'All PDOs',
      state.beneficiaryFilters.pdo
    );
    const repaymentSelect = document.getElementById('swBeneficiaryRepayment');
    if (repaymentSelect) {
      repaymentSelect.value = state.beneficiaryFilters.repayment || '';
      if (!repaymentSelect.value) repaymentSelect.selectedIndex = 0;
    }
  }

  function syncCoMakerFilterControls() {
    syncInputValue('swCoMakerSearch', state.coMakerFilters.search);
    const statusSelect = document.getElementById('swCoMakerStatus');
    if (statusSelect) {
      statusSelect.value = state.coMakerFilters.status || '';
      if (!statusSelect.value) statusSelect.selectedIndex = 0;
    }
    populateSelectOptions(
      'swCoMakerPdo',
      state.coMakers.map((item) => item.assignedPdo?.name || ''),
      'All PDOs',
      state.coMakerFilters.pdo
    );
  }

  function populateBeneficiaryFilters() {
    syncBeneficiaryFilterControls();
  }

  function populateCoMakerFilters() {
    syncCoMakerFilterControls();
  }

  // Section titles reused when the Social Worker moves between panes.
  const sectionMeta = {
    dashboard: 'Dashboard',
    validation: 'Applications for Validation',
    applications: 'Applicants',
    beneficiaries: 'Beneficiaries',
    'co-makers': 'Co-makers',
    support: 'Support',
    repayments: 'Repayments',
    reports: 'Reports',
  };

  syncOverviewState(overview);

  // Build same-origin API and navigation URLs for Social Worker actions.
  function routeUrl(path) {
    return `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console[type === 'error' ? 'error' : 'log'](message);
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function setText(target, value) {
    const node = typeof target === 'string' && target.startsWith('[')
      ? document.querySelector(target)
      : document.getElementById(target);
    if (node) node.textContent = String(value);
  }

  function normalizeKey(value) {
    return String(value || 'Unspecified').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unspecified';
  }

  function optionalFilterKey(value) {
    const text = cleanText(value);
    return text ? normalizeKey(text) : '';
  }

  function matchesFilterKey(actual, selected) {
    const selectedText = cleanText(selected);
    if (selectedText === '') return true;
    const current = normalizeKey(actual);
    const wanted = normalizeKey(selectedText);
    return current === wanted || current.startsWith(wanted);
  }

  function cleanText(value) {
    return value == null ? '' : String(value).trim();
  }

  function isDeceasedBeneficiary(beneficiary) {
    const raw = beneficiary?.programStatus || beneficiary?.beneficiaryStatus || beneficiary?.statusLabel || beneficiary?.status || '';
    return normalizeKey(raw) === 'deceased';
  }

  function activeCoMaker(beneficiary) {
    const registration = beneficiary?.coMakerRegistration;
    if (!registration || typeof registration !== 'object') return null;
    const status = normalizeKey(registration.registrationStatus || '');
    if (!['active', 'approved'].includes(status)) return null;
    return cleanText(registration.name) ? registration : null;
  }

  function responsiblePayerForBeneficiary(beneficiary, fallbackName = '') {
    const originalName = cleanText(beneficiary?.name || fallbackName || 'Unnamed beneficiary');
    const coMaker = isDeceasedBeneficiary(beneficiary) ? activeCoMaker(beneficiary) : null;
    if (!coMaker) {
      return {
        name: originalName,
        originalName,
        isCoMakerTakeover: false,
        relationship: '',
      };
    }
    return {
      name: cleanText(coMaker.name) || originalName,
      originalName,
      isCoMakerTakeover: true,
      relationship: cleanText(coMaker.relationshipToPrimaryBeneficiary),
    };
  }

  function beneficiaryForRepayment(repayment) {
    const beneficiaryId = Number(repayment?.beneficiaryId || 0);
    if (!beneficiaryId) return null;
    return state.beneficiaries.find((beneficiary) => Number(beneficiary.id || beneficiary.beneficiaryId || 0) === beneficiaryId) || null;
  }

  function titleCase(value) {
    return String(value || 'Unspecified')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }

  function normalizeGenderLabel(value) {
    const key = String(value || '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
    if (['male', 'lalaki', 'lalake'].includes(key)) return 'Male';
    if (['female', 'babaye', 'babae'].includes(key)) return 'Female';
    if (['non binary', 'nonbinary'].includes(key)) return 'Non-binary';
    if (['prefer not to say', 'dili gustong mosulti'].includes(key)) return 'Prefer not to say';
    return value || 'Unspecified';
  }

  function countBy(items, resolver) {
    return items.reduce((map, item) => {
      const raw = resolver(item);
      const key = normalizeKey(raw);
      const label = titleCase(raw || key);
      const entry = map.get(key) || { key, label, count: 0 };
      entry.count += 1;
      map.set(key, entry);
      return map;
    }, new Map());
  }

  function shortLabel(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '--';
    if (words.length === 1) return words[0];
    if (words.length === 2 && words[0].length <= 8 && words[1].length <= 8) return `${words[0]}\n${words[1]}`;
    return words.map((word) => word.charAt(0)).join('');
  }

  function buildScale(max) {
    const safeMax = Math.max(0, Math.ceil(safeNumber(max)));
    if (safeMax <= 4) {
      const maxValue = Math.max(safeMax, 1);
      return { maxValue, ticks: Array.from({ length: maxValue + 1 }, (_, index) => maxValue - index) };
    }
    const roughStep = safeMax / 4;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalizedStep = roughStep / magnitude;
    const stepUnit = normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;
    const step = Math.max(1, Math.ceil(stepUnit * magnitude));
    const maxValue = Math.max(step * 4, Math.ceil(safeMax / step) * step, 1);
    const ticks = [];
    for (let tick = maxValue; tick >= 0; tick -= step) ticks.push(tick);
    if (ticks[ticks.length - 1] !== 0) ticks.push(0);
    return { maxValue, ticks };
  }

  function chartColor(colors, item, index) {
    if (Array.isArray(colors)) return colors[index % colors.length] || '#94a3b8';
    return colors?.[item.key] || FALLBACK_CHART_COLORS[index % FALLBACK_CHART_COLORS.length] || '#94a3b8';
  }

  function percentOf(count, total) {
    if (!total) return '0%';
    const value = (safeNumber(count) / total) * 100;
    return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
  }

  function renderDashboardLegend(targetId, items, colors, total) {
    const root = document.getElementById(targetId);
    if (!root) return;
    root.innerHTML = items.map((item, index) => {
      const count = safeNumber(item.count);
      return `
        <span class="sw-dashboard-legend__item">
          <span class="sw-dashboard-legend__dot" style="background:${chartColor(colors, item, index)};"></span>
          <span>${escapeHtml(item.label)}</span>
          <strong>${count}</strong>
          <small>${percentOf(count, total)}</small>
        </span>
      `;
    }).join('');
  }

  function setDashboardFooter(targetId, text) {
    const node = document.getElementById(targetId);
    if (node) node.textContent = text;
  }

  // Render admin-style Social Worker dashboard charts from normalized counts.
  function renderDashboardChart(rootId, entries, options = {}) {
    const root = document.getElementById(rootId);
    if (!root) return;
    const colors = options.colors || FALLBACK_CHART_COLORS;
    const items = entries.filter((item) => safeNumber(item.count) > 0).slice(0, Number(options.limit || 24));
    if (!items.length) {
      root.innerHTML = '<div class="sw-dashboard-empty-chart">No records available.</div>';
      if (options.legendId) renderDashboardLegend(options.legendId, [], colors, 0);
      if (options.footerId) setDashboardFooter(options.footerId, options.emptyFooter || 'No records yet.');
      return;
    }
    const total = items.reduce((sum, item) => sum + safeNumber(item.count), 0);
    const scale = buildScale(Math.max(...items.map((item) => safeNumber(item.count)), 1));
    const denseClass = items.length > 10 ? ' is-dense' : '';
    root.innerHTML = `
      <div class="sw-dashboard-column-chart${denseClass}" style="--bar-count:${items.length};" role="img" aria-label="${escapeHtml(options.ariaLabel || 'Social Worker dashboard chart')}">
        <div class="sw-dashboard-column-chart__surface">
          <div class="sw-dashboard-column-chart__grid">
            ${scale.ticks.map((tickValue, index) => {
              const denominator = Math.max(scale.ticks.length - 1, 1);
              const position = (index / denominator) * 100;
              return `<span class="sw-dashboard-column-chart__guide" style="top:${position}%"><span>${tickValue}</span></span>`;
            }).join('')}
          </div>
          <div class="sw-dashboard-column-chart__bars">
            ${items.map((item, index) => {
              const count = safeNumber(item.count);
              const height = Math.max((count / scale.maxValue) * 100, count > 0 ? 12 : 0);
              return `
                <article class="sw-dashboard-column-chart__group">
                  <div class="sw-dashboard-column-chart__bar-wrap">
                    <i class="sw-dashboard-column-chart__bar" style="height:${height}%; --bar-color:${chartColor(colors, item, index)};" title="${escapeHtml(item.label)}: ${count}"></i>
                  </div>
                  <span>${escapeHtml(shortLabel(item.label))}</span>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
    if (options.legendId) renderDashboardLegend(options.legendId, items, colors, total);
    if (options.footerId) {
      setDashboardFooter(options.footerId, options.footerText ? options.footerText(items, total) : `${total} records tracked.`);
    }
  }

  // Recompute dashboard KPIs and charts from the latest oversight data in memory.
  function renderDashboardSummary() {
    const applicationSummary = overview.applicationSummary || {};
    const repaymentSummary = overview.repaymentSummary || {};
    const roster = state.beneficiaries.slice();
    const beneficiaryTotal = safeNumber(overview.beneficiarySummary?.total) || roster.length;
    const applicationCounts = countBy(state.applications, (application) => application.status || application.applicationStatus || 'Draft');
    const beneficiaryCounts = countBy(roster, (beneficiary) => beneficiary.statusLabel || beneficiary.programStatus || beneficiary.beneficiaryStatus || beneficiary.status || 'Active');
    const repaymentCounts = countBy(roster, (beneficiary) => beneficiary.repayment?.label || beneficiary.repayment?.key || 'No Upload Yet');
    const appValue = (key) => safeNumber(applicationCounts.get(normalizeKey(key))?.count);
    const repaymentValue = (key) => safeNumber(repaymentCounts.get(normalizeKey(key))?.count);

    setText('swDashApplicationsTotal', safeNumber(applicationSummary.total) || state.applications.length);
    setText('swDashBeneficiariesTotal', beneficiaryTotal);
    const repaymentTotal = (repaymentValue('Fully Paid') || repaymentValue('Fully Verified'))
      + (repaymentValue('Partial Paid') || repaymentValue('Partially Verified'))
      + repaymentValue('Under Review')
      + repaymentValue('Needs Correction')
      + repaymentValue('Rejected');
    setText('swDashRepaymentsPending', repaymentTotal);

    renderDashboardChart('swApplicantsStatusChart', Array.from(applicationCounts.values()), {
      colors: APPLICATION_COLORS,
      legendId: 'swApplicantsStatusLegend',
      footerId: 'swApplicantsStatusFooter',
      ariaLabel: 'Column chart of Social Worker application statuses',
      emptyFooter: 'No application records yet.',
      footerText: (items, total) => {
        const top = items[0];
        return top ? `${top.label}: ${top.count} of ${total}.` : `${total} application records tracked.`;
      },
    });
    renderDashboardChart('swBeneficiariesStatusChart', Array.from(beneficiaryCounts.values()), {
      colors: BENEFICIARY_COLORS,
      legendId: 'swBeneficiariesStatusLegend',
      footerId: 'swBeneficiariesStatusFooter',
      ariaLabel: 'Column chart of Social Worker beneficiary statuses',
      emptyFooter: 'No beneficiary records yet.',
      footerText: (_items, total) => `${total} beneficiaries tracked.`,
    });
    renderDashboardChart('swRepaymentVerificationRateChart', Array.from(repaymentCounts.values()), {
      colors: REPAYMENT_COLORS,
      legendId: 'swRepaymentVerificationRateLegend',
      footerId: 'swRepaymentVerificationRateFooter',
      ariaLabel: 'Column chart of Social Worker repayment verification states',
      emptyFooter: 'No repayment records yet.',
      footerText: (items, total) => {
        const top = items[0];
        return top ? `${top.label}: ${top.count} records, ${percentOf(top.count, total)}.` : `${total} repayment records tracked.`;
      },
    });
  }

  async function request(path, options = {}) {
    const response = await fetch(routeUrl(path), {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false || payload.success === false) {
      const firstError = payload.errors && typeof payload.errors === 'object'
        ? Object.values(payload.errors).find(Boolean)
        : '';
      throw new Error(payload.message || firstError || 'Request failed.');
    }
    return payload;
  }

  function refreshOverviewBadges() {
    const validationSummary = overview.validationSummary || overview.validationState?.summary || {};
    setText('[data-sw-validation-pending]', safeNumber(validationSummary.pending));
    setText('[data-sw-validation-selected]', safeNumber(validationSummary.selected));
    setText('[data-sw-validation-saved]', safeNumber(validationSummary.saved));
    setText('[data-sw-validation-tab-count="pending"]', safeNumber(validationSummary.pending));
    setText('[data-sw-validation-tab-count="selected"]', safeNumber(validationSummary.selected));
    setText('[data-sw-validation-tab-count="saved"]', safeNumber(validationSummary.saved));
  }

  function renderOverviewMetrics() {
    const beneficiarySummary = overview.beneficiaryRosterSummary || {};
    const activeNode = document.querySelector('[data-sw-beneficiary-active-count]');
    if (activeNode) {
      const activeCount = safeNumber(beneficiarySummary.active);
      activeNode.textContent = `${activeCount} ${activeCount === 1 ? 'active' : 'active'}`;
    }
    refreshOverviewBadges();
  }

  async function loadOverviewData() {
    if (state.overviewLoadPromise) {
      return state.overviewLoadPromise;
    }

    state.overviewLoadPromise = (async () => {
    try {
      const payload = await request('social-worker/overview-data');
      syncOverviewState(payload.data || {});
      renderOverviewMetrics();
      renderValidation();
      renderBeneficiaries();
      renderCoMakers();
      renderDashboardSummary();
    } catch (error) {
      console.warn('Unable to load Social Worker overview records', error);
      renderOverviewMetrics();
    } finally {
      state.overviewLoadPromise = null;
    }
    })();

    return state.overviewLoadPromise;
  }

  async function loadRepayments() {
    try {
      const payload = await request('api/repayments');
      state.repayments = Array.isArray(payload.data?.payments) ? payload.data.payments : [];
      renderRepayments();
      renderBeneficiaries();
      renderDashboardSummary();
    } catch (error) {
      console.warn('Unable to load Social Worker repayment records', error);
      renderRepayments();
    }
  }

  // Swap between dashboard, oversight tables, and reports panes.
  function setSection(section) {
    const nextSection = sectionMeta[section] ? section : 'dashboard';
    const previousSection = state.section;
    state.section = nextSection;
    document.querySelectorAll('[data-role-section]').forEach((panel) => {
      const active = panel.id === `${state.section}-section`;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    document.querySelectorAll('.admin-sidebar .nav-link[data-section]').forEach((link) => {
      link.classList.toggle('active', link.dataset.section === state.section);
    });
    const titleNode = document.getElementById('swSectionTitle');
    if (titleNode) titleNode.textContent = sectionMeta[state.section] || 'Dashboard';

    if (previousSection !== state.section) {
      resetSectionFilters(state.section);
    }

    if (state.section === 'reports') {
      initReports();
    } else if (state.section === 'support') {
      loadSupportTickets();
    }
  }

  function resetSectionFilters(section) {
    if (section === 'validation') {
      state.validationTab = 'pending';
      const search = document.getElementById('swValidationSearch');
      if (search) search.value = '';
      renderValidation();
      return;
    }
    if (section === 'applications') {
      const search = document.getElementById('swApplicationSearch');
      if (search) search.value = '';
      clearSelectState('swApplicationStatus');
      forceDefaultSelects(['swApplicationStatus']);
      renderApplications();
      return;
    }
    if (section === 'beneficiaries') {
      state.beneficiaryFilters = {
        search: '',
        barangay: '',
        pdo: '',
        repayment: '',
      };
      syncBeneficiaryFilterControls();
      renderBeneficiaries();
      return;
    }
    if (section === 'co-makers') {
      state.coMakerFilters = {
        search: '',
        status: '',
        pdo: '',
      };
      syncCoMakerFilterControls();
      renderCoMakers();
      return;
    }
    if (section === 'repayments') {
      const search = document.getElementById('swRepaymentSearch');
      if (search) search.value = '';
      clearSelectState('swRepaymentStatus');
      forceDefaultSelects(['swRepaymentStatus']);
      renderRepayments();
      return;
    }
    if (section === 'support') {
      state.activeTicketId = null;
      const detail = document.querySelector('[data-sw-ticket-detail]');
      if (detail) {
        detail.innerHTML = '<p class="sw-empty">Select a support concern to read the conversation and send a reply.</p>';
      }
      renderTickets();
    }
  }

  function initNavigation() {
    document.querySelectorAll('.admin-sidebar .nav-link[data-section], [data-section-jump]').forEach((control) => {
      control.addEventListener('click', (event) => {
        event.preventDefault();
        setSection(control.dataset.section || control.dataset.sectionJump || 'dashboard');
        closeSidebar();
      });
    });
  }

  function initSidebar() {
    const shell = document.getElementById('mainSystem');
    const toggle = document.querySelector('.sidebar-toggle');
    const backdrop = document.querySelector('[data-sidebar-close]');
    const setOpen = (open) => {
      shell?.setAttribute('data-sidebar-open', open ? 'true' : 'false');
      toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    toggle?.addEventListener('click', () => {
      setOpen(shell?.getAttribute('data-sidebar-open') !== 'true');
    });
    backdrop?.addEventListener('click', () => setOpen(false));
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024) setOpen(false);
    });
  }

  function closeSidebar() {
    const shell = document.getElementById('mainSystem');
    const toggle = document.querySelector('.sidebar-toggle');
    shell?.setAttribute('data-sidebar-open', 'false');
    toggle?.setAttribute('aria-expanded', 'false');
  }

  function initAccountMenu() {
    const trigger = document.getElementById('swAccountMenuTrigger');
    const panel = document.getElementById('swAccountMenuPanel');
    const profileButton = document.getElementById('swAccountProfile');
    const passwordButton = document.getElementById('swAccountPassword');
    if (!trigger || !panel) return;

    const setExpanded = (expanded) => {
      trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      panel.hidden = !expanded;
    };

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setExpanded(trigger.getAttribute('aria-expanded') !== 'true');
    });
    profileButton?.addEventListener('click', () => {
      setExpanded(false);
      openProfileModal();
    });
    passwordButton?.addEventListener('click', () => {
      setExpanded(false);
      openPasswordModal();
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.staff-account-menu')) setExpanded(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setExpanded(false);
        closeModal();
      }
    });
  }

  function initLogout() {
    const button = document.getElementById('sw-logout');
    button?.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await fetch(routeUrl('auth/logout'), {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
      } catch (error) {
        console.warn('Social worker logout failed', error);
      } finally {
        window.location.href = routeUrl('login');
      }
    });
  }

  function statusClass(status) {
    const value = String(status || '').toLowerCase();
    if (value.includes('approved') || value.includes('resolved')) return 'is-approved';
    if (value.includes('waiting') || value.includes('correction') || value.includes('review')) return 'is-warning';
    if (value.includes('reject') || value.includes('closed')) return 'is-rejected';
    if (value.includes('referred')) return 'is-referred';
    return '';
  }

  function renderApplicationRows(target, applications, columns = 7) {
    const body = document.querySelector(target);
    if (!body) return;
    if (!applications.length) {
      body.innerHTML = `<tr><td colspan="${columns}">No applicant records found.</td></tr>`;
      return;
    }
    body.innerHTML = applications.map((application) => {
      const id = Number(application.id || application.applicationId || 0);
      const applicant = application.applicantName || application.name || 'Unnamed applicant';
      const business = application.businessName || 'No business name yet';
      const requirements = `${Number(application.verifiedRequirementCount || 0)} / ${Number(application.requiredRequirementCount || application.uploadedRequirementCount || 0)}`;
      if (columns === 5) {
        return `
          <tr>
            <td><div class="sw-applicant-cell"><strong>${escapeHtml(applicant)}</strong><span>${escapeHtml(business)}</span></div></td>
            <td>${escapeHtml(application.barangay || '--')}</td>
            <td><span class="sw-status ${statusClass(application.status)}">${escapeHtml(application.status || '--')}</span></td>
            <td>${escapeHtml(formatDate(application.updatedAt || application.submittedAt))}</td>
            <td class="actions"><button type="button" class="app-btn-outline" data-open-case="${id}"><i class="fas fa-folder-open"></i><span>View</span></button></td>
          </tr>
        `;
      }
      return `
        <tr>
          <td><div class="sw-applicant-cell"><strong>${escapeHtml(applicant)}</strong><span>${escapeHtml(application.email || '')}</span></div></td>
          <td>${escapeHtml(business)}</td>
          <td>${escapeHtml(application.barangay || '--')}</td>
          <td><span class="sw-status ${statusClass(application.status)}">${escapeHtml(application.status || '--')}</span></td>
          <td>${escapeHtml(requirements)}</td>
          <td>${escapeHtml(formatDate(application.updatedAt || application.submittedAt))}</td>
          <td class="actions"><button type="button" class="app-btn-outline" data-open-case="${id}"><i class="fas fa-folder-open"></i><span>View</span></button></td>
        </tr>
      `;
    }).join('');
  }

  // Draw the applicant oversight table after search and status filters are applied.
  function renderApplications() {
    const search = String(document.getElementById('swApplicationSearch')?.value || '').toLowerCase();
    const status = String(document.getElementById('swApplicationStatus')?.value || '').toLowerCase();
    const filtered = state.applications.filter((application) => {
      const haystack = [
        application.applicantName,
        application.email,
        application.businessName,
        application.barangay,
        application.status,
      ].join(' ').toLowerCase();
      const statusValue = String(application.status || '').toLowerCase();
      return (!search || haystack.includes(search)) && (!status || statusValue === status);
    });

    renderApplicationRows('[data-sw-applications-body]', filtered, 7);
    renderApplicationRows('[data-sw-priority-body]', filtered.slice(0, 5), 5);
    const count = document.querySelector('[data-sw-application-count]');
    if (count) count.textContent = `${filtered.length} ${filtered.length === 1 ? 'case' : 'cases'}`;
    const applicationsBadge = document.querySelector('[data-section-badge="applications"]');
    if (applicationsBadge) applicationsBadge.textContent = filtered.length ? String(filtered.length) : '';

    renderRecentApplications();
    renderDashboardSummary();
  }

  function renderRecentApplications() {
    const recent = state.recentApplications.length ? state.recentApplications : state.applications.slice(0, 8);
    const body = document.querySelector('[data-sw-recent-body]');
    if (!body) return;
    if (!recent.length) {
      body.innerHTML = '<tr><td colspan="4">No recent applications loaded.</td></tr>';
      return;
    }
    body.innerHTML = recent.map((application) => `
      <tr>
        <td><div class="sw-applicant-cell"><strong>${escapeHtml(application.applicantName || 'Unnamed applicant')}</strong><span>${escapeHtml(application.businessName || '')}</span></div></td>
        <td>${escapeHtml(application.barangay || '--')}</td>
        <td><span class="sw-status ${statusClass(application.status)}">${escapeHtml(application.status || '--')}</span></td>
        <td>${escapeHtml(formatDate(application.updatedAt || application.submittedAt))}</td>
      </tr>
    `).join('');
  }

  async function loadApplications() {
    try {
      const payload = await request('api/applications');
      const data = payload.data || {};
      state.applications = Array.isArray(data.applications) ? data.applications : state.applications;
      state.recentApplications = state.applications.slice(0, 8);
      renderApplications();
    } catch (error) {
      showToast(error.message || 'Unable to load Social Worker applications.', 'error');
      renderApplications();
    }
  }

  function initApplicationFilters() {
    const searchInput = document.getElementById('swApplicationSearch');
    if (searchInput) searchInput.value = '';
    clearSelectState('swApplicationStatus');
    document.getElementById('swApplicationSearch')?.addEventListener('input', renderApplications);
    document.getElementById('swApplicationStatus')?.addEventListener('change', (event) => {
      event.currentTarget.dataset.userTouched = '1';
      renderApplications();
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-case]');
      if (!button) return;
      openCase(Number(button.dataset.openCase || 0));
    });
  }

  function renderValidation() {
    const body = document.querySelector('[data-sw-validation-body]');
    if (!body) return;

    if (!state.validationRecords.length) {
      const expected = safeNumber(overview.validationSummary?.pending)
        + safeNumber(overview.validationSummary?.selected)
        + safeNumber(overview.validationSummary?.saved);
      if (expected > 0 && !state.overviewLoadPromise) {
        body.innerHTML = '<tr><td colspan="7">Loading validation records...</td></tr>';
        void loadOverviewData();
      }
    }

    const search = String(document.getElementById('swValidationSearch')?.value || '').toLowerCase();
    const activeTab = ['pending', 'selected', 'saved'].includes(state.validationTab) ? state.validationTab : 'pending';
    document.querySelectorAll('[data-sw-validation-tab]').forEach((button) => {
      const active = button.getAttribute('data-sw-validation-tab') === activeTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const filtered = state.validationRecords.filter((record) => {
      const haystack = [
        record.fullName,
        record.email,
        record.contactNumber,
        record.completeAddress,
        record.statusLabel,
      ].join(' ').toLowerCase();
      const recordStatus = normalizeKey(record.statusKey || record.statusLabel || '');
      return (!search || haystack.includes(search)) && recordStatus === activeTab;
    });

    const count = document.querySelector('[data-sw-validation-count]');
    if (count) count.textContent = `${filtered.length} ${activeTab}`;
    const badge = document.querySelector('[data-section-badge="validation"]');
    if (badge) {
      const pendingCount = safeNumber(overview.validationSummary?.pending);
      badge.textContent = pendingCount ? String(pendingCount) : '';
    }

    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="7">No validation records matched the current filters.</td></tr>';
      return;
    }

    body.innerHTML = filtered.map((record) => `
      <tr>
        <td><div class="sw-applicant-cell"><strong>${escapeHtml(record.fullName || 'Unnamed applicant')}</strong><span>${escapeHtml(record.referenceCode || '')}</span></div></td>
        <td>${escapeHtml(record.email || '--')}</td>
        <td>${escapeHtml(record.contactNumber || '--')}</td>
        <td>${escapeHtml(record.completeAddress || '--')}</td>
        <td><span class="sw-status ${statusClass(record.statusLabel)}">${escapeHtml(record.statusLabel || '--')}</span></td>
        <td>${escapeHtml(formatDate(record.submittedAt))}</td>
        <td class="actions"><button type="button" class="app-btn-outline" data-open-validation-record="${Number(record.id || 0)}">View</button></td>
      </tr>
    `).join('');
  }

  function initValidationFilters() {
    const searchInput = document.getElementById('swValidationSearch');
    if (searchInput) searchInput.value = '';
    document.getElementById('swValidationSearch')?.addEventListener('input', renderValidation);
    document.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-sw-validation-tab]');
      if (tab) {
        state.validationTab = tab.getAttribute('data-sw-validation-tab') || 'pending';
        renderValidation();
        return;
      }
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-validation-record]');
      if (!button) return;
      openValidationRecord(Number(button.dataset.openValidationRecord || 0));
    });
  }

  function renderCoMakers() {
    const body = document.querySelector('[data-sw-co-makers-body]');
    if (!body) return;

    if (!state.coMakers.length) {
      const expected = safeNumber(overview.coMakerRegistrationSummary?.total);
      if (expected > 0 && !state.overviewLoadPromise) {
        body.innerHTML = '<tr><td colspan="7">Loading co-maker registrations...</td></tr>';
        void loadOverviewData();
      }
    }

    syncCoMakerFilterControls();
    const search = String(state.coMakerFilters.search || '').toLowerCase();
    const status = optionalFilterKey(state.coMakerFilters.status);
    const pdo = cleanText(state.coMakerFilters.pdo || '');
    const filtered = state.coMakers.filter((item) => {
      const haystack = [
        item.name,
        item.email,
        item.primaryBeneficiaryName,
        item.primaryBusinessName,
        item.relationshipToPrimaryBeneficiary,
        item.assignedPdo?.name,
      ].join(' ').toLowerCase();
      const itemStatus = normalizeKey(item.registrationStatus || '');
      return (!search || haystack.includes(search))
        && matchesFilterKey(itemStatus, status)
        && (!pdo || cleanText(item.assignedPdo?.name || '') === pdo);
    });

    const count = document.querySelector('[data-sw-co-maker-count]');
    if (count) count.textContent = `${filtered.length} ${filtered.length === 1 ? 'registration' : 'registrations'}`;
    const badge = document.querySelector('[data-section-badge="co-makers"]');
    if (badge) badge.textContent = filtered.length ? String(filtered.length) : '';

    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="7">No co-maker registrations matched the current filters.</td></tr>';
      return;
    }

    body.innerHTML = filtered.map((item) => `
      <tr>
        <td><div class="sw-applicant-cell"><strong>${escapeHtml(item.name || 'Unnamed co-maker')}</strong><span>${escapeHtml(item.email || '--')}</span></div></td>
        <td><div class="sw-applicant-cell"><strong>${escapeHtml(item.primaryBeneficiaryName || '--')}</strong><span>${escapeHtml(item.primaryBusinessName || '--')}</span></div></td>
        <td>${escapeHtml(item.relationshipToPrimaryBeneficiary || '--')}</td>
        <td>${escapeHtml(item.assignedPdo?.name || 'Unassigned')}</td>
        <td><span class="sw-status ${statusClass(item.registrationStatus)}">${escapeHtml(labelize(item.registrationStatus || 'inactive'))}</span></td>
        <td>${escapeHtml(formatDate(item.createdAt || item.updatedAt))}</td>
        <td class="actions"><button type="button" class="app-btn-outline" data-open-co-maker-record="${Number(item.id || 0)}">View</button></td>
      </tr>
    `).join('');
  }

  function initCoMakerFilters() {
    syncCoMakerFilterControls();
    document.getElementById('swCoMakerSearch')?.addEventListener('input', (event) => {
      state.coMakerFilters.search = cleanText(event.currentTarget.value || '');
      renderCoMakers();
    });
    document.getElementById('swCoMakerStatus')?.addEventListener('change', (event) => {
      state.coMakerFilters.status = cleanText(event.currentTarget.value || '');
      renderCoMakers();
    });
    document.getElementById('swCoMakerPdo')?.addEventListener('change', (event) => {
      state.coMakerFilters.pdo = cleanText(event.currentTarget.value || '');
      renderCoMakers();
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-co-maker-record]');
      if (!button) return;
      openCoMakerRecord(Number(button.dataset.openCoMakerRecord || 0));
    });
  }

  function renderRepayments() {
    const body = document.querySelector('[data-sw-repayments-body]');
    if (!body) return;

    const search = String(document.getElementById('swRepaymentSearch')?.value || '').toLowerCase();
    const status = String(document.getElementById('swRepaymentStatus')?.value || '').toLowerCase();
    const filtered = state.repayments.filter((record) => {
      const beneficiary = beneficiaryForRepayment(record);
      const payer = responsiblePayerForBeneficiary(beneficiary, record.beneficiaryName);
      const recordStatus = normalizeKey(record.statusLabel || record.status || '');
      const haystack = [
        payer.name,
        payer.originalName,
        record.beneficiaryName,
        record.beneficiaryBusiness,
        record.beneficiaryBarangay,
        record.orNumber,
        record.month,
        record.coverageFrom,
      ].join(' ').toLowerCase();
      return (!search || haystack.includes(search)) && matchesFilterKey(recordStatus, status);
    });

    const count = document.querySelector('[data-sw-repayment-count]');
    if (count) count.textContent = `${filtered.length} ${filtered.length === 1 ? 'repayment' : 'repayments'}`;

    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="8">No repayment records matched the current filters.</td></tr>';
      return;
    }

    body.innerHTML = filtered.map((record) => {
      const beneficiary = beneficiaryForRepayment(record);
      const payer = responsiblePayerForBeneficiary(beneficiary, record.beneficiaryName);
      return `
        <tr>
          <td><div class="sw-applicant-cell"><strong>${escapeHtml(payer.name || 'Unnamed payer')}</strong><span>${payer.isCoMakerTakeover ? `Current payer for ${escapeHtml(payer.originalName || 'deceased beneficiary')}` : escapeHtml(record.beneficiaryBusiness || '--')}</span></div></td>
          <td>${escapeHtml(record.beneficiaryName || payer.originalName || '--')}</td>
          <td>${escapeHtml(record.month || record.coverageFrom || '--')}</td>
          <td>${escapeHtml(money(record.amount || 0))}</td>
          <td>${escapeHtml(record.orNumber || '--')}</td>
          <td>${escapeHtml(formatDate(record.paymentDate || record.submittedAt))}</td>
          <td><span class="sw-status ${statusClass(record.statusLabel || record.status)}">${escapeHtml(record.statusLabel || labelize(record.status || 'No Upload Yet'))}</span></td>
          <td class="actions"><button type="button" class="app-btn-outline" data-open-repayment-record="${Number(record.id || 0)}">View</button></td>
        </tr>
      `;
    }).join('');
  }

  function initRepaymentFilters() {
    const searchInput = document.getElementById('swRepaymentSearch');
    if (searchInput) searchInput.value = '';
    clearSelectState('swRepaymentStatus');
    document.getElementById('swRepaymentSearch')?.addEventListener('input', renderRepayments);
    document.getElementById('swRepaymentStatus')?.addEventListener('change', (event) => {
      event.currentTarget.dataset.userTouched = '1';
      renderRepayments();
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-repayment-record]');
      if (!button) return;
      openRepaymentRecord(Number(button.dataset.openRepaymentRecord || 0));
    });
  }

  // Draw the beneficiary oversight table with read-only status and repayment monitoring.
  function renderBeneficiaries() {
    const body = document.querySelector('[data-sw-beneficiaries-body]');
    if (!body) return;

    if (!state.beneficiaries.length) {
      const expected = safeNumber(overview.beneficiarySummary?.total);
      if (expected > 0 && !state.overviewLoadPromise) {
        body.innerHTML = '<tr><td colspan="10">Loading beneficiaries...</td></tr>';
        void loadOverviewData();
      }
    }

    syncBeneficiaryFilterControls();
    const search = String(state.beneficiaryFilters.search || '').toLowerCase();
    const barangay = cleanText(state.beneficiaryFilters.barangay || '');
    const pdo = cleanText(state.beneficiaryFilters.pdo || '');
    const repayment = optionalFilterKey(state.beneficiaryFilters.repayment);
    const filtered = state.beneficiaries.filter((beneficiary) => {
      const repaymentKey = normalizeKey(beneficiary.repayment?.key || '');
      const payer = responsiblePayerForBeneficiary(beneficiary);
      const haystack = [
        payer.name,
        payer.originalName,
        payer.relationship,
        beneficiary.name,
        beneficiary.businessName,
        beneficiary.barangay,
        beneficiary.assignedPdo,
        beneficiary.gender,
        beneficiary.ageGroup,
        beneficiary.serviceType,
        beneficiary.repayment?.label,
      ].join(' ').toLowerCase();

      return (!search || haystack.includes(search))
        && (!barangay || cleanText(beneficiary.barangay || '') === barangay)
        && (!pdo || cleanText(beneficiary.assignedPdo || '') === pdo)
        && matchesFilterKey(repaymentKey, repayment);
    });

    const count = document.querySelector('[data-sw-beneficiary-count]');
    if (count) {
      count.textContent = `${filtered.length} ${filtered.length === 1 ? 'beneficiary' : 'beneficiaries'}`;
    }

    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="10">No beneficiaries matched the current filters.</td></tr>';
      renderDashboardSummary();
      return;
    }

    body.innerHTML = filtered.map((beneficiary) => {
      const repayment = beneficiary.repayment || {};
      const payer = responsiblePayerForBeneficiary(beneficiary);
      const rate = Number.isFinite(Number(repayment.repaymentRate)) ? `${Number(repayment.repaymentRate)}%` : '0%';
      const verified = money(repayment.paidAmount || repayment.verifiedAmount || 0);
      return `
        <tr>
          <td>
            <div class="sw-applicant-cell">
              <strong>${escapeHtml(payer.name || 'Unnamed beneficiary')}</strong>
              <span>${payer.isCoMakerTakeover ? `Current payer for ${escapeHtml(payer.originalName || 'deceased beneficiary')}` : escapeHtml(beneficiary.businessName || '')}</span>
              ${payer.isCoMakerTakeover && payer.relationship ? `<span>${escapeHtml(payer.relationship)}</span>` : ''}
            </div>
          </td>
          <td>${escapeHtml(beneficiary.gender || '--')}</td>
          <td>${escapeHtml(beneficiary.ageGroup || '--')}</td>
          <td>${escapeHtml(beneficiary.serviceType || beneficiary.businessType || '--')}</td>
          <td>${escapeHtml(beneficiary.barangay || '--')}</td>
          <td>${escapeHtml(beneficiary.assignedPdo || 'Unassigned')}</td>
          <td><span class="sw-status ${statusClass(repayment.label || repayment.key)}">${escapeHtml(repayment.label || 'No Upload Yet')}</span></td>
          <td>${escapeHtml(verified)}</td>
          <td>${escapeHtml(rate)}</td>
          <td class="actions"><button type="button" class="app-btn-outline" data-open-beneficiary="${Number(beneficiary.id || beneficiary.beneficiaryId || 0)}">View</button></td>
        </tr>
      `;
    }).join('');
    renderDashboardSummary();
  }

  function repaymentForBeneficiary(beneficiary) {
    const beneficiaryId = Number(beneficiary.id || beneficiary.beneficiaryId || 0);
    if (!beneficiaryId) return null;
    const matches = state.repayments
      .filter((repayment) => Number(repayment.beneficiaryId || 0) === beneficiaryId)
      .sort((a, b) => new Date(b.submittedAt || b.paymentDate || 0) - new Date(a.submittedAt || a.paymentDate || 0));
    return matches[0] || null;
  }

  function initBeneficiaryFilters() {
    syncBeneficiaryFilterControls();
    document.getElementById('swBeneficiarySearch')?.addEventListener('input', (event) => {
      state.beneficiaryFilters.search = cleanText(event.currentTarget.value || '');
      renderBeneficiaries();
    });
    document.getElementById('swBeneficiaryBarangay')?.addEventListener('change', (event) => {
      state.beneficiaryFilters.barangay = cleanText(event.currentTarget.value || '');
      renderBeneficiaries();
    });
    document.getElementById('swBeneficiaryPdo')?.addEventListener('change', (event) => {
      state.beneficiaryFilters.pdo = cleanText(event.currentTarget.value || '');
      renderBeneficiaries();
    });
    document.getElementById('swBeneficiaryRepayment')?.addEventListener('change', (event) => {
      state.beneficiaryFilters.repayment = cleanText(event.currentTarget.value || '');
      renderBeneficiaries();
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-beneficiary]');
      if (!button) return;
      openBeneficiaryRecord(Number(button.dataset.openBeneficiary || 0));
    });
  }

  function money(value) {
    const amount = Number(value);
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  function initReports() {
    const reports = window.App?.modules?.reports;
    if (!reports || typeof reports.init !== 'function') {
      return;
    }
    if (state.reportsInitialized) {
      if (typeof reports.render === 'function') reports.render();
      return;
    }
    state.reportsInitialized = true;
    reports.init();
  }

  function uploadCard(label, file) {
    const url = String(file?.url || '');
    if (!url) {
      return `
        <article class="validation-upload-card validation-upload-card--empty">
          <span class="validation-upload-card__label">${escapeHtml(label)}</span>
          <strong>No file uploaded</strong>
        </article>
      `;
    }

    const isImage = String(file?.mimeType || '').toLowerCase().startsWith('image/');
    return `
      <article class="validation-upload-card">
        <div class="validation-upload-card__head">
          <span class="validation-upload-card__label">${escapeHtml(label)}</span>
          <a href="${escapeHtml(url)}" class="app-btn-outline validation-upload-card__link" target="_blank" rel="noopener">Open file</a>
        </div>
        ${isImage ? `<div class="validation-upload-card__preview"><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}"></div>` : ''}
        <div class="validation-upload-card__meta">
          <strong>${escapeHtml(file?.name || 'Uploaded file')}</strong>
        </div>
      </article>
    `;
  }

  function oversightField(label, value, wide = false) {
    return `
      <article class="admin-record-sheet__field${wide ? ' admin-record-sheet__field--wide' : ''}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || '--')}</strong>
      </article>
    `;
  }

  function oversightPill(label, kind = 'soft') {
    const className = kind === 'primary'
      ? 'admin-record-sheet__pill admin-record-sheet__pill--primary'
      : 'admin-record-sheet__pill admin-record-sheet__pill--soft';
    return `<span class="${className}">${escapeHtml(label)}</span>`;
  }

  function overviewModalShell({ eyebrow, title, subtitle, pills = '', body }) {
    return `
      <div class="modal-card sw-oversight-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div class="po-modal-title-block">
            <span class="po-modal-eyebrow">${escapeHtml(eyebrow)}</span>
            <h2 class="modal-title">${escapeHtml(title)}</h2>
            <p class="po-modal-subtitle">${escapeHtml(subtitle)}</p>
          </div>
          <button type="button" class="modal-close" data-close-modal aria-label="Close overview modal">&times;</button>
        </div>
        <div class="modal-body">
          <section class="admin-record-sheet sw-oversight-sheet">
            <div class="admin-record-sheet__hero">
              <div class="admin-record-sheet__identity">
                <span class="admin-record-sheet__eyebrow">${escapeHtml(eyebrow)}</span>
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(subtitle)}</p>
              </div>
              ${pills ? `<div class="admin-record-sheet__pills">${pills}</div>` : ''}
            </div>
            ${body}
          </section>
        </div>
        <div class="modal-footer">
          <button type="button" class="app-btn-outline" data-close-modal>Close</button>
        </div>
      </div>
    `;
  }

  function openValidationRecord(recordId) {
    const record = state.validationRecords.find((item) => Number(item.id || 0) === Number(recordId));
    if (!record) {
      showToast('Validation record not found.', 'error');
      return;
    }

    openModal(overviewModalShell({
      eyebrow: 'Applications for Validation',
      title: record.fullName || 'Applicant',
      subtitle: `${record.statusLabel || '--'} | ${record.referenceCode || '--'}`,
      pills: [
        oversightPill(record.statusLabel || '--', 'primary'),
        oversightPill(`Submitted ${formatDate(record.submittedAt)}`),
      ].join(''),
      body: `
        <section class="admin-record-sheet__section admin-record-sheet__section--violet">
          <div class="admin-record-sheet__section-head"><span>Applicant Information</span></div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            ${oversightField('Email', record.email)}
            ${oversightField('Contact Number', record.contactNumber)}
            ${oversightField('Birthdate', record.birthdate || '--')}
            ${oversightField('Age', record.age ?? '--')}
            ${oversightField('Gender', record.gender || '--')}
            ${oversightField('Barangay', record.barangay || '--')}
            ${oversightField('4Ps Membership', record.is4ps || '--')}
            ${oversightField('Educational Attainment', record.educationalAttainment || '--')}
            ${oversightField('Sector', record.sector === 'Other' && record.sectorOtherSpecify ? `Other - ${record.sectorOtherSpecify}` : (record.sector || '--'))}
            ${oversightField('Specific Business Type', record.livelihood || '--')}
            ${oversightField('Microbusiness Name', record.businessName || '--')}
            ${oversightField('Reviewed By', record.reviewedByName || 'Not reviewed yet')}
            ${oversightField('Validated At', formatDate(record.validatedAt || ''))}
            ${oversightField('Complete Address', record.completeAddress, true)}
          </div>
        </section>
        <section class="admin-record-sheet__section admin-record-sheet__section--aqua">
          <div class="admin-record-sheet__section-head"><span>Uploaded Files</span></div>
          <div class="validation-upload-grid">
            ${uploadCard('Profile Photo', record.profilePhoto)}
            ${uploadCard('Business Photo', record.businessPhoto)}
            ${uploadCard('Valid ID', record.validIdPhoto)}
          </div>
        </section>
      `,
    }));
  }

  function openBeneficiaryRecord(beneficiaryId) {
    const beneficiary = state.beneficiaries.find((item) => Number(item.id || item.beneficiaryId || 0) === Number(beneficiaryId));
    if (!beneficiary) {
      showToast('Beneficiary record not found.', 'error');
      return;
    }
    const payer = responsiblePayerForBeneficiary(beneficiary);
    const repayment = beneficiary.repayment || {};

    openModal(overviewModalShell({
      eyebrow: 'Beneficiary Oversight',
      title: payer.name || beneficiary.name || 'Beneficiary',
      subtitle: `${beneficiary.businessName || '--'} | ${beneficiary.barangay || '--'}`,
      pills: [
        oversightPill(beneficiary.programStatus || beneficiary.beneficiaryStatus || 'Active', 'primary'),
        oversightPill(beneficiary.assignedPdo || 'Unassigned PDO'),
      ].join(''),
      body: `
        <section class="admin-record-sheet__section admin-record-sheet__section--violet">
          <div class="admin-record-sheet__section-head"><span>Beneficiary Profile</span></div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            ${oversightField('Original Beneficiary', beneficiary.name)}
            ${oversightField('Current Payer', payer.name)}
            ${oversightField('Assigned PDO', beneficiary.assignedPdo || 'Unassigned')}
            ${oversightField('Repayment State', repayment.label || 'No Upload Yet')}
            ${oversightField('Service Type', beneficiary.serviceType || beneficiary.businessType)}
            ${oversightField('Sector', beneficiary.sector || '--')}
            ${oversightField('Gender', beneficiary.gender)}
            ${oversightField('Age Group', beneficiary.ageGroup)}
            ${oversightField('Verified Amount', money(repayment.paidAmount || repayment.verifiedAmount || 0))}
            ${oversightField('Repayment Rate', Number.isFinite(Number(repayment.repaymentRate)) ? `${Number(repayment.repaymentRate)}%` : '0%')}
            ${oversightField('Address', beneficiary.address, true)}
          </div>
        </section>
      `,
    }));
  }

  function openCoMakerRecord(registrationId) {
    const item = state.coMakers.find((record) => Number(record.id || 0) === Number(registrationId));
    if (!item) {
      showToast('Co-maker registration not found.', 'error');
      return;
    }

    openModal(overviewModalShell({
      eyebrow: 'Co-maker Oversight',
      title: item.name || 'Co-maker',
      subtitle: `${item.primaryBeneficiaryName || '--'} | ${labelize(item.registrationStatus || 'inactive')}`,
      pills: [
        oversightPill(labelize(item.registrationStatus || 'inactive'), 'primary'),
        oversightPill(item.assignedPdo?.name || 'Unassigned PDO'),
      ].join(''),
      body: `
        <section class="admin-record-sheet__section admin-record-sheet__section--violet">
          <div class="admin-record-sheet__section-head"><span>Registration Details</span></div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            ${oversightField('Email', item.email)}
            ${oversightField('Contact Number', item.contactNumber)}
            ${oversightField('Age', item.age || '--')}
            ${oversightField('Gender', item.gender || '--')}
            ${oversightField('Relationship', item.relationshipToPrimaryBeneficiary)}
            ${oversightField('Assigned PDO', item.assignedPdo?.name || 'Unassigned')}
            ${oversightField('Primary Beneficiary', item.primaryBeneficiaryName || '--')}
            ${oversightField('Business', item.primaryBusinessName || '--')}
            ${oversightField('Address', item.primaryAddress || '--', true)}
          </div>
        </section>
        <section class="admin-record-sheet__section admin-record-sheet__section--aqua">
          <div class="admin-record-sheet__section-head"><span>Uploaded Files</span></div>
          <div class="validation-upload-grid">
            ${uploadCard('Valid ID', item.validId)}
            ${uploadCard('Relationship Document', item.relationshipDocument)}
          </div>
        </section>
      `,
    }));
  }

  function openRepaymentRecord(repaymentId) {
    const record = state.repayments.find((item) => Number(item.id || 0) === Number(repaymentId));
    if (!record) {
      showToast('Repayment record not found.', 'error');
      return;
    }
    const beneficiary = beneficiaryForRepayment(record);
    const payer = responsiblePayerForBeneficiary(beneficiary, record.beneficiaryName);

    const assignedPdo = beneficiary?.assignedPdo || record.assignedPdo?.name || record.assignedPdoName || '--';
    openModal(overviewModalShell({
      eyebrow: 'Repayment Oversight',
      title: payer.name || 'Current Payer',
      subtitle: `${record.beneficiaryName || payer.originalName || '--'} | ${record.statusLabel || labelize(record.status || 'No Upload Yet')}`,
      pills: [
        oversightPill(record.statusLabel || labelize(record.status || 'No Upload Yet'), 'primary'),
        oversightPill(assignedPdo),
      ].join(''),
      body: `
        <section class="admin-record-sheet__section admin-record-sheet__section--amber">
          <div class="admin-record-sheet__section-head"><span>Repayment Record</span></div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            ${oversightField('Beneficiary', record.beneficiaryName || payer.originalName || '--')}
            ${oversightField('Current Payer', payer.name || '--')}
            ${oversightField('Assigned PDO', assignedPdo)}
            ${oversightField('Business', record.beneficiaryBusiness || '--')}
            ${oversightField('Barangay', record.beneficiaryBarangay || beneficiary?.barangay || '--')}
            ${oversightField('Coverage Month', record.month || record.coverageFrom || '--')}
            ${oversightField('Payment Date', formatDate(record.paymentDate || record.submittedAt))}
            ${oversightField('Amount', money(record.amount || 0))}
            ${oversightField('Verified Amount', money(record.verifiedAmount || 0))}
            ${oversightField('OR Number', record.orNumber || '--')}
            ${oversightField('Hard Copy Status', hardCopyStatusLabel(record.hardCopyOfficeStatus))}
            ${oversightField('Last Updated', formatDate(record.updatedAt || record.submittedAt || record.paymentDate || ''))}
          </div>
        </section>
      `,
    }));
  }

  async function openCase(applicationId) {
    if (!applicationId) return;
    openModal(`
      <div class="sw-modal__header">
        <div><span class="admin-section-eyebrow">Application Case</span><h2>Loading case...</h2><p>Please wait while the applicant record loads.</p></div>
        <button type="button" class="sw-modal__close" data-close-modal aria-label="Close">&times;</button>
      </div>
      <div class="sw-modal__body"><p class="sw-empty">Loading application detail...</p></div>
    `);
    try {
      const payload = await request(`api/applications/show?id=${encodeURIComponent(applicationId)}`);
      renderCaseModal(payload.application || payload.data || {});
    } catch (error) {
      openModal(`
        <div class="sw-modal__header">
          <div><span class="admin-section-eyebrow">Application Case</span><h2>Unable to load case</h2><p>${escapeHtml(error.message)}</p></div>
          <button type="button" class="sw-modal__close" data-close-modal aria-label="Close">&times;</button>
        </div>
        <div class="sw-modal__body"><p class="sw-empty">The selected application could not be loaded right now.</p></div>
      `);
    }
  }

  // Open the applicant case modal in read-only oversight mode.
  function renderCaseModal(application) {
    const requirements = Array.isArray(application.requirements) ? application.requirements : [];
    const requirementList = requirements.length
      ? requirements.map((item) => `
          <article class="validation-record-card">
            <span class="validation-record-card__label">${escapeHtml(item.label || item.name || 'Requirement')}</span>
            <strong>${escapeHtml(labelize(item.reviewStatus || item.status || 'submitted'))}</strong>
            ${(item.fileUrl || item.url) ? `<a href="${escapeHtml(item.fileUrl || item.url)}" class="app-btn-outline validation-upload-card__link" target="_blank" rel="noopener">Open file</a>` : ''}
          </article>
        `).join('')
      : '<p class="sw-empty">No requirement files were attached to this application.</p>';

    const assignedPdo = application.assignedPdo?.name || application.assignedPdoName || application.assignedPdo || '--';
    openModal(overviewModalShell({
      eyebrow: 'Application Case',
      title: application.applicantName || 'Applicant',
      subtitle: `${application.businessName || 'No business name yet'} | ${application.barangay || '--'}`,
      pills: [
        oversightPill(application.status || '--', 'primary'),
        oversightPill(assignedPdo),
      ].join(''),
      body: `
        <section class="admin-record-sheet__section admin-record-sheet__section--violet">
          <div class="admin-record-sheet__section-head"><span>Applicant Information</span></div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            ${oversightField('Applicant Name', application.applicantName)}
            ${oversightField('Email', application.email)}
            ${oversightField('Contact Number', application.contactNumber)}
            ${oversightField('Assigned PDO', assignedPdo)}
            ${oversightField('Status', application.status || '--')}
            ${oversightField('Submitted', formatDate(application.submittedAt || application.updatedAt))}
            ${oversightField('Barangay', application.barangay || '--')}
            ${oversightField('Service Type', application.livelihoodCategory || application.livelihood || '--')}
            ${oversightField('Sector', application.sector || '--')}
            ${oversightField('Address', application.address || '--', true)}
          </div>
        </section>
        <section class="admin-record-sheet__section admin-record-sheet__section--aqua">
          <div class="admin-record-sheet__section-head"><span>Submitted Requirements</span></div>
          <div class="validation-upload-grid">
            ${requirementList}
          </div>
        </section>
      `,
    }));
  }

  function renderApplicantDataCorrectionForm(application) {
    return `
      <details class="sw-correction-card" open>
        <summary>
          <span>
            <span class="admin-section-eyebrow">Applicant Input Corrections</span>
            <strong>Edit Applicant Data</strong>
            <small>Correct wrong information inputted by the applicant or beneficiary. A correction reason is required and every save is audit logged.</small>
          </span>
          <span class="sw-correction-card__chevron">Correction editor</span>
        </summary>
        <form class="sw-correction-form" data-applicant-correction-form data-application-id="${Number(application.id || 0)}">
          <div class="sw-correction-grid">
            ${textInput('applicantName', 'Applicant name', application.applicantName)}
            ${textInput('businessName', 'Business name', application.businessName)}
            ${textInput('contactNumber', 'Contact number', application.contactNumber)}
            ${textInput('barangay', 'Barangay', application.barangay)}
            ${textInput('address', 'Address', application.address)}
            ${textInput('birthdate', 'Birthdate', application.birthdate, 'date')}
            ${textInput('age', 'Age', application.age, 'number', 'min="1" max="120"')}
            ${textInput('gender', 'Gender', application.gender)}
            ${textInput('householdSize', 'Household size', application.householdSize, 'number', 'min="1" max="99"')}
            ${textInput('educationalAttainment', 'Educational attainment', application.educationalAttainment)}
            ${textInput('sector', 'Sector', application.sector)}
            ${textInput('livelihood', 'Livelihood', application.livelihood)}
            <label class="sw-checkbox-field">
              <input type="checkbox" name="is4ps" value="1"${application.is4ps ? ' checked' : ''}>
              <span>4Ps household</span>
            </label>
            <label class="full">
              <span>Correction reason</span>
              <textarea name="correctionReason" rows="3" required minlength="10" placeholder="Explain what was wrong and why this correction is being made."></textarea>
            </label>
            <p class="sw-inline-error full" data-correction-error></p>
          </div>
          <div class="sw-correction-actions">
            <button type="submit" class="app-btn-primary">Save Applicant Data Correction</button>
          </div>
        </form>
      </details>
    `;
  }

  function textInput(name, label, value, type = 'text', attributes = '') {
    return `
      <label>
        <span>${escapeHtml(label)}</span>
        <input type="${escapeHtml(type)}" name="${escapeHtml(name)}" value="${escapeHtml(value ?? '')}" ${attributes}>
      </label>
    `;
  }

  async function saveApplicantDataCorrection(event) {
    event.preventDefault();
    if (state.busy) return;
    const form = event.currentTarget;
    const errorNode = form.querySelector('[data-correction-error]');
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    data.append('applicationId', form.dataset.applicationId || '');
    state.busy = true;
    if (button) button.disabled = true;
    if (errorNode) errorNode.textContent = '';
    try {
      const payload = await request('api/applications/update-applicant-data', { method: 'POST', body: data });
      showToast(payload.message || 'Applicant data corrected.', 'success');
      renderCaseModal(payload.application || {});
      await loadApplications();
    } catch (error) {
      if (errorNode) errorNode.textContent = error.message || 'Unable to update applicant data.';
      showToast(error.message || 'Unable to update applicant data.', 'error');
    } finally {
      state.busy = false;
      if (button) button.disabled = false;
    }
  }

  // Launch a repayment correction flow for records that still allow Social Worker intervention.
  function openRepaymentCorrection(repaymentId) {
    const repayment = state.repayments.find((record) => Number(record.id || 0) === Number(repaymentId));
    if (!repayment) {
      showToast('Repayment record not found.', 'error');
      return;
    }

    const beneficiary = beneficiaryForRepayment(repayment);
    const payer = responsiblePayerForBeneficiary(beneficiary, repayment.beneficiaryName);
    const contextLine = payer.isCoMakerTakeover
      ? `Current payer for ${payer.originalName || 'deceased beneficiary'}`
      : (repayment.beneficiaryBusiness || 'No business name');

    openModal(`
      <div class="sw-modal__header">
        <div>
          <span class="admin-section-eyebrow">Repayment Input Correction</span>
          <h2>${escapeHtml(payer.name || 'Beneficiary')}</h2>
          <p>${escapeHtml(contextLine)} | ${escapeHtml(repayment.beneficiaryBarangay || '--')}</p>
        </div>
        <button type="button" class="sw-modal__close" data-close-modal aria-label="Close">&times;</button>
      </div>
      <div class="sw-modal__body sw-modal__body--correction-only">
        <details class="sw-correction-card" open>
          <summary>
            <span>
              <span class="admin-section-eyebrow">Pre-PDO Repayment Data</span>
              <strong>Edit Repayment Data</strong>
              <small>Correct repayment information only when the submitted record has not yet been checked by PDO/Admin. The backend will reject locked records.</small>
            </span>
            <span class="sw-correction-card__chevron">Correction editor</span>
          </summary>
          <form class="sw-correction-form" data-repayment-correction-form data-repayment-id="${Number(repayment.id || 0)}">
            <div class="sw-correction-grid">
              ${textInput('month', 'Coverage month', repayment.month || repayment.coverageFrom, 'month')}
              ${textInput('paymentDate', 'Payment date', repayment.paymentDate, 'date')}
              ${textInput('amount', 'Submitted amount', repayment.amount, 'number', 'min="1" step="0.01"')}
              ${textInput('orNumber', 'OR number', repayment.orNumber)}
              <article class="sw-readonly-field">
                <span>Hard copy office status</span>
                <strong>${escapeHtml(hardCopyStatusLabel(repayment.hardCopyOfficeStatus))}</strong>
              </article>
              <label class="full">
                <span>Correction reason</span>
                <textarea name="correctionReason" rows="3" required minlength="10" placeholder="Explain what was wrong and why this repayment correction is being made."></textarea>
              </label>
              <p class="sw-inline-error full" data-repayment-correction-error></p>
            </div>
            <div class="sw-correction-actions">
              <button type="submit" class="app-btn-primary">Save Repayment Data Correction</button>
            </div>
          </form>
        </details>
      </div>
      <div class="sw-modal__footer">
        <button type="button" class="app-btn-outline" data-close-modal>Close</button>
      </div>
    `);

    document.querySelector('[data-repayment-correction-form]')?.addEventListener('submit', saveRepaymentDataCorrection);
  }

  function hardCopyStatusLabel(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ({
      not_submitted: 'Not Submitted',
      submitted_to_office: 'Submitted to Office',
      confirmed_by_office: 'Confirmed by Office',
    })[normalized] || 'Not Submitted';
  }

  async function saveRepaymentDataCorrection(event) {
    event.preventDefault();
    if (state.busy) return;
    const form = event.currentTarget;
    const errorNode = form.querySelector('[data-repayment-correction-error]');
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const payload = {
      repaymentId: Number(form.dataset.repaymentId || 0),
      month: data.get('month') || '',
      paymentDate: data.get('paymentDate') || '',
      amount: data.get('amount') || '',
      orNumber: data.get('orNumber') || '',
      correctionReason: data.get('correctionReason') || '',
    };

    state.busy = true;
    if (button) button.disabled = true;
    if (errorNode) errorNode.textContent = '';
    try {
      const response = await request('api/repayments/update-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showToast(response.message || 'Repayment data corrected.', 'success');
      closeModal();
      await loadRepayments();
    } catch (error) {
      if (errorNode) errorNode.textContent = error.message || 'Unable to update repayment data.';
      showToast(error.message || 'Unable to update repayment data.', 'error');
    } finally {
      state.busy = false;
      if (button) button.disabled = false;
    }
  }

  async function loadSupportTickets() {
    const list = document.querySelector('[data-sw-ticket-list]');
    if (list) list.innerHTML = '<p class="sw-empty">Loading support concerns...</p>';
    try {
      const payload = await request('staff/support/tickets');
      state.tickets = Array.isArray(payload.tickets) ? payload.tickets : (payload.data?.tickets || []);
      renderTickets();
    } catch (error) {
      if (list) list.innerHTML = `<p class="sw-empty">${escapeHtml(error.message || 'Unable to load support concerns.')}</p>`;
    }
  }

  function renderTickets() {
    const list = document.querySelector('[data-sw-ticket-list]');
    const count = document.querySelector('[data-sw-ticket-count]');
    const badge = document.querySelector('[data-section-badge="support"]');
    if (count) count.textContent = `${state.tickets.length} ${state.tickets.length === 1 ? 'ticket' : 'tickets'}`;
    if (badge) badge.textContent = state.tickets.length ? String(state.tickets.length) : '';
    if (!list) return;
    if (!state.tickets.length) {
      list.innerHTML = '<p class="sw-empty">No Social Worker support concerns are assigned right now.</p>';
      return;
    }
    list.innerHTML = state.tickets.map((ticket) => `
      <button type="button" class="sw-ticket-card ${String(ticket.id) === String(state.activeTicketId) ? 'is-active' : ''}" data-open-ticket="${Number(ticket.id || 0)}">
        <span class="sw-ticket-card__top">
          <strong>${escapeHtml(ticket.ticketNo || ticket.ticket_no || 'Ticket')}</strong>
          <span class="sw-status ${statusClass(ticket.status)}">${escapeHtml(ticket.status || 'New')}</span>
        </span>
        <h3>${escapeHtml(ticket.subject || 'Support concern')}</h3>
        <p>${escapeHtml(ticket.category || 'Other')} | ${escapeHtml(ticket.assignedRole || ticket.assigned_role || 'Social Worker')}</p>
        <span class="sw-ticket-card__meta">
          <small>${escapeHtml(formatDate(ticket.updatedAt || ticket.updated_at || ticket.createdAt))}</small>
          ${ticket.unreadForStaff || ticket.unread_for_staff ? '<span class="sw-status is-warning">Unread</span>' : ''}
        </span>
      </button>
    `).join('');
  }

  // Initialize the help-desk ticket list and bind the message composer for oversight support work.
  function initSupport() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-ticket]');
      if (button) openTicket(Number(button.dataset.openTicket || 0));
    });
  }

  async function openTicket(ticketId) {
    if (!ticketId) return;
    state.activeTicketId = ticketId;
    renderTickets();
    const detail = document.querySelector('[data-sw-ticket-detail]');
    if (detail) detail.innerHTML = '<p class="sw-empty">Loading conversation...</p>';
    try {
      const payload = await request(`staff/support/ticket?id=${encodeURIComponent(ticketId)}`);
      const detailData = payload.data || payload;
      const ticket = detailData.ticket || payload.ticket || {};
      renderTicketDetail({ ...ticket, messages: detailData.messages || payload.messages || [] });
    } catch (error) {
      if (detail) detail.innerHTML = `<p class="sw-empty">${escapeHtml(error.message || 'Unable to load ticket detail.')}</p>`;
    }
  }

  function renderTicketDetail(ticket) {
    const detail = document.querySelector('[data-sw-ticket-detail]');
    if (!detail || !ticket) return;
    const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    const closed = String(ticket.status || '').toLowerCase() === 'closed';
    detail.innerHTML = `
      <div class="section-header admin-section__header">
        <div>
          <span class="admin-section-eyebrow">${escapeHtml(ticket.ticketNo || ticket.ticket_no || 'Ticket')}</span>
          <h2>${escapeHtml(ticket.subject || 'Support concern')}</h2>
          <p class="section-subtitle">${escapeHtml(ticket.category || 'Other')} | Assigned to ${escapeHtml(ticket.assignedRole || 'Social Worker')}</p>
        </div>
        <span class="sw-status ${statusClass(ticket.status)}">${escapeHtml(ticket.status || 'New')}</span>
      </div>
      <div class="sw-ticket-thread">
        ${messages.length ? messages.map(renderMessage).join('') : '<p class="sw-empty">No messages recorded yet.</p>'}
      </div>
      ${closed ? '<p class="sw-empty">This concern is closed.</p>' : `
        <form class="sw-ticket-reply" data-ticket-reply data-ticket-id="${Number(ticket.id || 0)}">
          <textarea name="message" rows="4" required placeholder="Write a public reply to the applicant or beneficiary."></textarea>
          <label class="sw-ticket-status-field">
            <span>Ticket status after reply</span>
            <select name="nextStatus">
              <option value="">Keep current status</option>
              <option value="In Review">In Review</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </label>
          <p class="sw-inline-error" data-ticket-error></p>
          <div class="sw-ticket-reply__actions">
            <button type="submit" class="app-btn-primary">Send Reply</button>
          </div>
        </form>
      `}
    `;
    detail.querySelector('[data-ticket-reply]')?.addEventListener('submit', sendTicketReply);
  }

  function renderMessage(message) {
    const isStaff = String(message.senderType || '').toLowerCase() !== 'beneficiary' && String(message.senderType || '').toLowerCase() !== 'applicant';
    return `
      <article class="sw-ticket-message ${isStaff ? 'is-staff' : ''}">
        <div class="sw-ticket-message__meta">
          <strong>${escapeHtml(message.senderName || message.senderType || 'Sender')}</strong>
          <span>${escapeHtml(message.senderType || '')}</span>
          <span>${escapeHtml(formatDate(message.timestamp || message.createdAt))}</span>
        </div>
        <p>${escapeHtml(message.body || message.message || '')}</p>
      </article>
    `;
  }

  async function sendTicketReply(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const ticketId = Number(form.dataset.ticketId || 0);
    const errorNode = form.querySelector('[data-ticket-error]');
    const nextStatus = form.nextStatus?.value || '';
    const data = new FormData(form);
    data.delete('nextStatus');
    data.append('ticket_id', String(ticketId));
    try {
      await request('staff/support/ticket/messages', { method: 'POST', body: data });
      if (nextStatus) {
        const statusData = new FormData();
        statusData.append('ticket_id', String(ticketId));
        statusData.append('status', nextStatus);
        await request('staff/support/ticket/status', { method: 'POST', body: statusData });
      }
      showToast('Reply sent.', 'success');
      await loadSupportTickets();
      await openTicket(ticketId);
    } catch (error) {
      if (errorNode) errorNode.textContent = error.message || 'Unable to send reply.';
      showToast(error.message || 'Unable to send reply.', 'error');
    }
  }

  function openProfileModal() {
    let staff = null;
    let error = '';
    let saving = false;
    let photoBusy = false;

    const splitNameParts = (fullName) => {
      const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
      return {
        firstName: parts.shift() || '',
        middleName: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
        lastName: parts.length ? parts[parts.length - 1] : '',
      };
    };
    const composeFullName = (parts = {}) => [parts.firstName, parts.middleName, parts.lastName].map((value) => String(value || '').trim()).filter(Boolean).join(' ');

    const render = () => {
      if (!staff) {
        openModal(`
          <div class="sw-modal__header">
            <div><h2>Loading profile...</h2><p>Please wait while your account details are loaded.</p></div>
            <button type="button" class="sw-modal__close" data-close-modal aria-label="Close">&times;</button>
          </div>
          <div class="sw-modal__body"><p class="sw-empty">${escapeHtml(error || 'Loading account details...')}</p></div>
        `);
        return;
      }

      const nameParts = splitNameParts(staff?.name || '');
      const initials = (staff?.name || authUser?.name || 'SW')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'SW';
      openModal(`
        <div class="modal-card admin-profile-modal" role="dialog" aria-modal="true" aria-labelledby="swProfileModalTitle">
          <div class="modal-header">
            <div class="po-modal-title-block">
              <h2 class="modal-title" id="swProfileModalTitle">Profile</h2>
            </div>
            <button type="button" class="modal-close" data-close-modal aria-label="Close profile modal">&times;</button>
          </div>
          <form id="swProfileForm" class="modal-body admin-profile-modal__form">
            <section class="admin-record-sheet admin-record-sheet--account">
              <div class="admin-record-sheet__hero">
                <div class="admin-record-sheet__avatar-wrap">
                  <div class="admin-profile-modal__avatar admin-record-sheet__avatar ${staff?.photo ? 'has-photo' : ''}" ${staff?.photo ? `style="background-image:url('${escapeHtml(staff.photo)}')"` : ''} aria-hidden="true">${staff?.photo ? '' : escapeHtml(initials)}</div>
                  <label class="admin-profile-photo-action">
                    <input type="file" id="swProfilePhotoInput" accept=".jpg,.jpeg,.png" hidden ${photoBusy ? 'disabled' : ''}>
                    <span class="app-btn-outline">${photoBusy ? 'Uploading...' : 'Change Photo'}</span>
                  </label>
                </div>
                <div class="admin-record-sheet__identity">
                  <span class="admin-record-sheet__eyebrow">User Profile</span>
                  <h3>${escapeHtml(staff?.name || 'Social Worker')}</h3>
                  <p>Social Worker</p>
                </div>
              </div>
              ${error ? `<div class="notice danger admin-profile-modal__notice">${escapeHtml(error)}</div>` : ''}
              <section class="admin-record-sheet__section admin-record-sheet__section--violet">
                <div class="admin-record-sheet__section-head"><span>User Information</span></div>
                <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
                  <label class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">First Name</span>
                    <input class="admin-profile-modal__input" type="text" name="firstName" value="${escapeHtml(nameParts.firstName)}" required>
                  </label>
                  <label class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">Middle Name</span>
                    <input class="admin-profile-modal__input" type="text" name="middleName" value="${escapeHtml(nameParts.middleName)}">
                  </label>
                  <label class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">Last Name</span>
                    <input class="admin-profile-modal__input" type="text" name="lastName" value="${escapeHtml(nameParts.lastName)}" required>
                  </label>
                  <article class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">Role</span>
                    <span class="admin-profile-modal__value">Social Worker</span>
                  </article>
                </div>
              </section>
              <section class="admin-record-sheet__section admin-record-sheet__section--aqua">
                <div class="admin-record-sheet__section-head"><span>Contact Information</span></div>
                <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
                  <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                    <span class="admin-profile-modal__label">Email Address</span>
                    <input class="admin-profile-modal__input" type="email" name="email" value="${escapeHtml(staff?.email || '')}" required readonly>
                  </label>
                  <label class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">Contact Number</span>
                    <input class="admin-profile-modal__input" type="text" name="contactNumber" value="${escapeHtml(staff?.contactNumber || '')}">
                  </label>
                </div>
              </section>
            </section>
          </form>
          <div class="modal-footer">
            <button type="button" class="app-btn-outline" data-close-modal>Back</button>
            <button type="submit" form="swProfileForm" class="app-btn-primary"${saving ? ' disabled' : ''}>${saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      `);
      document.getElementById('swProfileForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (saving) return;
        const form = event.currentTarget;
        const formData = new FormData(form);
        const payload = {
          firstName: formData.get('firstName') || '',
          middleName: formData.get('middleName') || '',
          lastName: formData.get('lastName') || '',
          email: formData.get('email') || '',
          contactNumber: formData.get('contactNumber') || '',
        };
        saving = true;
        error = '';
        render();
        try {
          const body = new URLSearchParams(payload);
          const response = await request('api/team/self', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body,
          });
          staff = response.staff || { ...staff, ...payload, name: composeFullName(payload) };
          if (authUser) {
            authUser.name = staff.name || composeFullName(payload);
            authUser.email = staff.email || payload.email;
          }
          saving = false;
          showToast(response.message || 'Profile updated.', 'success');
          render();
        } catch (saveError) {
          saving = false;
          error = saveError.message || 'Unable to save your profile.';
          render();
        }
      });
      document.getElementById('swProfilePhotoInput')?.addEventListener('change', async (event) => {
        const input = event.currentTarget;
        const file = input?.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          error = 'Profile photo must be 5 MB or less.';
          return render();
        }
        photoBusy = true;
        error = '';
        render();
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const response = await request('account/profile-photo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json;charset=UTF-8' },
              body: JSON.stringify({ photoDataUrl: String(reader.result || '') }),
            });
            staff = { ...(staff || {}), ...(response.data?.user || {}), photo: response.data?.user?.photo || staff?.photo || null };
            if (authUser) {
              authUser.photo = response.data?.user?.photo || authUser.photo;
            }
            photoBusy = false;
            showToast(response.message || 'Profile photo updated.', 'success');
            render();
          } catch (uploadError) {
            photoBusy = false;
            error = uploadError.message || 'Unable to save the profile photo.';
            render();
          }
        };
        reader.readAsDataURL(file);
      });
    };

    render();
    request('api/team/self')
      .then((response) => {
        staff = response.staff || null;
        render();
      })
      .catch((loadError) => {
        error = loadError.message || 'Unable to load your profile.';
        showToast(error, 'error');
        render();
      });
  }

  function openPasswordModal() {
    openModal(`
      <div class="modal-card admin-profile-modal" role="dialog" aria-modal="true" aria-labelledby="swPasswordTitle">
        <div class="modal-header">
          <div class="po-modal-title-block">
            <h2 class="modal-title" id="swPasswordTitle">Change Password</h2>
          </div>
          <button type="button" class="modal-close" data-close-modal aria-label="Close password modal">&times;</button>
        </div>
        <form id="swPasswordForm" class="modal-body admin-profile-modal__form">
          <section class="admin-record-sheet admin-record-sheet--account">
            <section class="admin-record-sheet__section admin-record-sheet__section--amber">
              <div class="admin-record-sheet__section-head"><span>Social Worker</span></div>
              <div class="admin-record-sheet__grid">
                <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                  <span class="admin-profile-modal__label">Current Password</span>
                  <input class="admin-profile-modal__input" type="password" name="currentPassword" required>
                </label>
                <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                  <span class="admin-profile-modal__label">New Password</span>
                  <input class="admin-profile-modal__input" type="password" name="newPassword" minlength="8" required>
                </label>
                <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                  <span class="admin-profile-modal__label">Confirm New Password</span>
                  <input class="admin-profile-modal__input" type="password" name="confirmPassword" minlength="8" required>
                </label>
                <div class="notice danger admin-profile-modal__notice" id="swPasswordError" hidden></div>
              </div>
            </section>
          </section>
        </form>
        <div class="modal-footer">
          <button type="button" class="app-btn-outline" data-close-modal>Back</button>
          <button type="submit" form="swPasswordForm" class="app-btn-primary">Save Password</button>
        </div>
      </div>
    `);
    document.getElementById('swPasswordForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const errorNode = document.getElementById('swPasswordError');
      const submitButton = document.querySelector('[form="swPasswordForm"]');
      submitButton.disabled = true;
      if (errorNode) {
        errorNode.hidden = true;
        errorNode.textContent = '';
      }
      const body = new URLSearchParams();
      body.set('currentPassword', String(form.currentPassword?.value || ''));
      body.set('newPassword', String(form.newPassword?.value || ''));
      body.set('confirmPassword', String(form.confirmPassword?.value || ''));
      try {
        const response = await fetch(routeUrl('account/change-password'), {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
          credentials: 'same-origin',
          body: body.toString(),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || 'Unable to change password.');
        }
        showToast(payload.message || 'Password updated.', 'success');
        closeModal();
      } catch (requestError) {
        if (errorNode) {
          errorNode.hidden = false;
          errorNode.textContent = requestError.message || 'Unable to change password.';
        }
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  function openModal(content) {
    const root = document.getElementById('swModalRoot');
    if (!root) return;
    const isSharedModalCard = /class=["'][^"']*\bmodal-card\b/.test(content);
    root.innerHTML = `
      <div class="sw-modal" role="dialog" aria-modal="true">
        <div class="sw-modal__backdrop" data-close-modal></div>
        ${isSharedModalCard ? content : `<div class="sw-modal__dialog">${content}</div>`}
      </div>
    `;
    root.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });
  }

  function closeModal() {
    const root = document.getElementById('swModalRoot');
    if (root) root.innerHTML = '';
  }

  function formatDate(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function labelize(value) {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function initRefresh() {
    document.getElementById('swRefreshButton')?.addEventListener('click', async () => {
      try {
        await Promise.allSettled([loadOverviewData(), loadApplications(), loadRepayments(), loadSupportTickets()]);
        showToast('Social Worker oversight data refreshed.', 'success');
      } catch (error) {
        console.warn('Social worker refresh encountered an issue', error);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSidebar();
    initAccountMenu();
    initLogout();
    initValidationFilters();
    initApplicationFilters();
    initBeneficiaryFilters();
    initCoMakerFilters();
    initRepaymentFilters();
    initSupport();
    initRefresh();
    renderOverviewMetrics();
    renderValidation();
    renderApplications();
    renderBeneficiaries();
    renderCoMakers();
    renderRepayments();
    renderTickets();
    renderDashboardSummary();
    setSection('dashboard');
    loadOverviewData();
    loadApplications();
    loadRepayments();
    loadSupportTickets();
  });

  window.addEventListener('pageshow', () => {
    clearSelectState('swApplicationStatus');
    clearSelectState('swRepaymentStatus');
    forceDefaultSelects([
      'swApplicationStatus',
      'swRepaymentStatus',
    ]);
    state.validationTab = 'pending';
    state.beneficiaryFilters = {
      search: '',
      barangay: '',
      pdo: '',
      repayment: '',
    };
    state.coMakerFilters = {
      search: '',
      status: '',
      pdo: '',
    };
    syncBeneficiaryFilterControls();
    syncCoMakerFilterControls();

    renderValidation();
    renderApplications();
    renderBeneficiaries();
    renderCoMakers();
    renderRepayments();
  });
})();
