(function () {
  window.App = window.App || {};
  window.App.modules = window.App.modules || {};
  window.App.state = window.App.state || {};

  const app = window.App;
  const dom = app.dom || {};
  const format = app.format || {};
  const qs = dom.qs || ((selector, root = document) => root.querySelector(selector));
  const setHTML = dom.setHTML || ((node, html) => { if (node) node.innerHTML = html; });
  const formatCurrency = format.formatCurrency || ((value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const formatDate = format.formatDate || ((value) => value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '--');
  const formatPercent = format.formatPercent || ((value) => `${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`);
  const formatChartCurrencyLabel = (value) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount === 0) return '\u20b10';
    if (Math.abs(amount) >= 100000) {
      return `\u20b1${amount.toLocaleString('en-PH', { notation: 'compact', maximumFractionDigits: 2 }).replace(/\s+/g, '')}`;
    }
    return `\u20b1${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');
  const chartPalette = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#eab308', '#be185d', '#475569', '#65a30d'];
  const quarterLabels = [
    { value: '1', label: 'Q1 (Jan - Mar)' },
    { value: '2', label: 'Q2 (Apr - Jun)' },
    { value: '3', label: 'Q3 (Jul - Sep)' },
    { value: '4', label: 'Q4 (Oct - Dec)' },
  ];

  const padMonth = (value) => String(value).padStart(2, '0');
  const shiftMonthValue = (monthValue, offset) => {
    const parsed = new Date(`${monthValue}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return monthValue;
    parsed.setMonth(parsed.getMonth() + Number(offset || 0));
    return `${parsed.getFullYear()}-${padMonth(parsed.getMonth() + 1)}`;
  };
  const buildCalendarYearMonths = (yearValue) => {
    const baseYear = Number.parseInt(yearValue, 10) || Number.parseInt(currentYear, 10);
    return Array.from({ length: 12 }, (_, index) => `${baseYear}-${padMonth(index + 1)}`);
  };
  const labelCycleMonth = (monthValue) => {
    const [yearValue, monthNumber] = String(monthValue || '').split('-').map(Number);
    if (!yearValue || !monthNumber) return monthValue;
    return new Date(yearValue, monthNumber - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
  };
  const deriveRepaymentQuarter = (monthValue) => {
    const [, monthNumberRaw] = String(monthValue || '').split('-');
    const monthNumber = Number.parseInt(monthNumberRaw, 10);
    if (!monthNumber) return '1';
    return String(Math.floor((monthNumber - 1) / 3) + 1);
  };
  const niceAxisStep = (rawMax) => {
    const safeMax = Math.max(Number(rawMax) || 0, 1);
    const roughStep = safeMax / 5;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep || 1));
    const normalized = roughStep / magnitude;
    let niceNormalized = 1;
    if (normalized <= 1) niceNormalized = 1;
    else if (normalized <= 2) niceNormalized = 2;
    else if (normalized <= 2.5) niceNormalized = 2.5;
    else if (normalized <= 5) niceNormalized = 5;
    else niceNormalized = 10;
    return niceNormalized * magnitude;
  };

  let bound = false;
  let reportData = null;
  let loading = false;
  let errorMessage = '';
  let requestId = 0;
  let searchTimer = 0;

  const today = new Date();
  const currentYear = String(today.getFullYear());
  const formatDateInput = (date) => {
    const safe = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    return `${safe.getFullYear()}-${padMonth(safe.getMonth() + 1)}-${String(safe.getDate()).padStart(2, '0')}`;
  };
  const isoWeekInput = (date) => {
    const safe = date instanceof Date && !Number.isNaN(date.getTime()) ? new Date(date) : new Date();
    safe.setHours(0, 0, 0, 0);
    safe.setDate(safe.getDate() + 3 - ((safe.getDay() + 6) % 7));
    const week1 = new Date(safe.getFullYear(), 0, 4);
    const week = 1 + Math.round(((safe - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${safe.getFullYear()}-W${String(week).padStart(2, '0')}`;
  };
  const currentCycleMonth = `${currentYear}-${padMonth(today.getMonth() + 1)}`;
  const defaultCycleMonth = (() => {
    const cycleMonths = buildCalendarYearMonths(currentYear);
    return cycleMonths.includes(currentCycleMonth) ? currentCycleMonth : cycleMonths[0];
  })();

  const state = app.state;
  state.filters = state.filters || {};
  state.filters.reports = {
    period: 'monthly',
    month: defaultCycleMonth,
    quarter: deriveRepaymentQuarter(defaultCycleMonth),
    year: currentYear,
    repaymentYear: '1',
    date: formatDateInput(today),
    week: isoWeekInput(today),

    sector: '',
    serviceType: '',
    gender: '',
    ageGroup: '',
    pdo: '',
    repayment: '',
    search: '',
    trainingSession: '',
    trainingGroup: '',
    activeReport: 'repayments',
    ...(state.filters.reports || {}),
  };
  if (['all', 'daily', 'weekly'].includes(String(state.filters.reports.period || '').toLowerCase())) {
    state.filters.reports.period = 'monthly';
  }
  if (!['repayments', 'demographics', 'training'].includes(String(state.filters.reports.activeReport || ''))) {
    state.filters.reports.activeReport = 'repayments';
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const routeUrl = (path) => `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;
  const reportApiPath = () => String(window.SMARTLEAP_REPORTS_API_PATH || 'api/reports');

  const reportExportBase = () => {
    if (window.SMARTLEAP_REPORT_EXPORT_BASE) {
      return String(window.SMARTLEAP_REPORT_EXPORT_BASE);
    }
    const path = window.location.pathname || '';
    return path.includes('social-worker') ? 'social-worker/reports/export' : 'admin/reports/export';
  };

  const selectedAttr = (current, value) => String(current || '') === String(value || '') ? 'selected' : '';

  const optionList = (values) => Array.isArray(values) ? values.filter((value) => String(value || '').trim() !== '') : [];

  const normalizeFilterValue = (value) => {
    const raw = String(value || '').trim();
    return raw === 'All' ? '' : raw;
  };

  const filterSearch = (items) => {
    const search = String(state.filters.reports.search || '').trim().toLowerCase();
    if (!search) return items;
    return items.filter((record) => [
      record.name,
      record.email,
      record.businessName,
      record.barangay,
      record.assignedPdo,
      record.serviceType,
      record.sector,
    ].some((value) => String(value || '').toLowerCase().includes(search)));
  };

  const records = () => filterSearch(Array.isArray(reportData?.records) ? reportData.records : []);

  const buildReportQuery = () => {
    const filters = state.filters.reports;
    const activeReport = String(filters.activeReport || 'repayments');
    const params = new URLSearchParams();
    const queryFields = [
      ['period', filters.period || 'all'],
      ['month', filters.month],
      ['quarter', filters.quarter],
      ['year', filters.year],
      ['repaymentYear', filters.repaymentYear],
      ['date', filters.date],
      ['week', filters.week],

      ['search', filters.search],
      ['ageGroup', normalizeFilterValue(filters.ageGroup)],
      ['pdo', normalizeFilterValue(filters.pdo)],
      ['repayment', normalizeFilterValue(filters.repayment)],
    ];
    if (activeReport === 'demographics') {
      queryFields.push(
        ['sector', normalizeFilterValue(filters.sector)],
        ['serviceType', normalizeFilterValue(filters.serviceType)],
        ['gender', normalizeFilterValue(filters.gender)],
      );
    }
    if (activeReport === 'training') {
      queryFields.push(
        ['trainingSession', normalizeFilterValue(filters.trainingSession)],
        ['trainingGroup', normalizeFilterValue(filters.trainingGroup)],
      );
    }
    queryFields.forEach(([key, value]) => {
      if (String(value || '').trim() !== '') params.set(key, value);
    });
    return params;
  };

  const fetchReportData = async () => {
    const currentRequest = ++requestId;
    loading = true;
    errorMessage = '';
    renderStatus();

    const query = buildReportQuery();
    const url = query.toString() ? `${routeUrl(reportApiPath())}?${query}` : routeUrl(reportApiPath());

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : { ok: false, message: 'Unexpected server response.' };
      if (!response.ok || payload.ok === false || payload.success === false) {
        throw new Error(payload.message || 'Unable to load report data.');
      }
      if (currentRequest !== requestId) return;
      reportData = payload.data || {};
    } catch (error) {
      if (currentRequest !== requestId) return;
      reportData = null;
      errorMessage = error.message || 'Unable to load report data.';
    } finally {
      if (currentRequest === requestId) {
        loading = false;
        renderReportShell();
        updateReportsView();
      }
    }
  };

  const countBy = (items, resolver) => {
    const map = new Map();
    items.forEach((item) => {
      const label = String(resolver(item) || 'Not Set').trim() || 'Not Set';
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
  };

  const normalizeServiceCategory = (value) => {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return 'Unclassified';
    if (text.includes('buy') || text.includes('sell')) return 'Buy and Sell';
    if (text.includes('food') || text.includes('beverage') || text.includes('balut') || text.includes('snack') || text.includes('eatery') || text.includes('carinderia') || text.includes('restaurant')) return 'Homemade';
    if (text.includes('livestock') || text.includes('animal') || text.includes('poultry') || text.includes('hog')) return 'Livestock';
    if (text.includes('service') || text.includes('repair') || text.includes('salon')) return 'Services';
    if (text.includes('home') || text.includes('production') || text.includes('homemade') || text.includes('processing')) return 'Homemade';
    if (text.includes('establishment') || text.includes('store') || text.includes('shop')) return 'Establishment';
    return 'Establishment';
  };

  const currentSummary = (items) => ({
    totalPeople: items.length,
    beneficiaryCount: items.filter((record) => !!record.isBeneficiary).length,
    pipelineOnlyCount: items.filter((record) => !record.isBeneficiary).length,
    genderDistribution: countBy(items, (record) => record.gender),
    serviceTypeDistribution: countBy(items, (record) => normalizeServiceCategory(record.serviceType || record.businessType)),
    sectorDistribution: countBy(items, (record) => record.sector),
    barangayDistribution: countBy(items, (record) => record.barangay),
  });

  const scheduledRepaymentMonthsForYear = (yearValue) => {
    const year = String(yearValue || '').trim();
    const months = Array.isArray(reportData?.options?.repaymentMonths) ? reportData.options.repaymentMonths : [];
    return months
      .map((value) => String(value || '').trim())
      .filter((value) => /^\d{4}-\d{2}$/.test(value) && value.startsWith(`${year}-`))
      .sort();
  };

  const scheduledRepaymentQuartersForYear = (yearValue) => {
    const year = Number.parseInt(yearValue, 10);
    const quarters = Array.isArray(reportData?.options?.repaymentQuarters) ? reportData.options.repaymentQuarters : [];
    const matched = quarters
      .filter((item) => Number(item?.year || 0) === year)
      .map((item) => ({
        value: String(item.quarter || ''),
        label: String(item.label || `Q${item.quarter || ''}`),
      }))
      .filter((item) => /^[1-4]$/.test(item.value))
      .sort((left, right) => Number(left.value) - Number(right.value));
    return matched.length ? matched : quarterLabels;
  };

  const scheduledRepaymentYears = (period) => {
    if (period === 'monthly') {
      const years = new Set((Array.isArray(reportData?.options?.repaymentMonths) ? reportData.options.repaymentMonths : [])
        .map((value) => String(value || '').slice(0, 4))
        .filter((value) => /^\d{4}$/.test(value)));
      return Array.from(years).sort();
    }
    if (period === 'quarterly') {
      const years = new Set((Array.isArray(reportData?.options?.repaymentQuarters) ? reportData.options.repaymentQuarters : [])
        .map((item) => String(item?.year || ''))
        .filter((value) => /^\d{4}$/.test(value)));
      return Array.from(years).sort();
    }
    return [];
  };

  const buildToolbar = () => {
    const filters = state.filters.reports;
    const options = reportData?.options || {};
    const activeReport = String(filters.activeReport || 'repayments');
    const period = ['monthly', 'quarterly', 'yearly'].includes(String(filters.period || ''))
      ? filters.period
      : 'monthly';
    filters.period = period;
    const scheduledYears = scheduledRepaymentYears(period);
    const years = scheduledYears.length ? scheduledYears : (optionList(options.years).length ? optionList(options.years) : [currentYear]);
    const selectedYear = years.includes(String(filters.year || '')) ? String(filters.year) : String(years[0] || currentYear);
    filters.year = selectedYear;
    const cycleMonths = period === 'monthly'
      ? scheduledRepaymentMonthsForYear(selectedYear)
      : buildCalendarYearMonths(selectedYear);
    const selectedMonth = cycleMonths.includes(filters.month) ? filters.month : (cycleMonths[0] || '');
    if (period === 'monthly') filters.month = selectedMonth;
    const quarterOptions = period === 'quarterly' ? scheduledRepaymentQuartersForYear(selectedYear) : quarterLabels;
    const selectedQuarter = quarterOptions.some((item) => item.value === String(filters.quarter || ''))
      ? String(filters.quarter)
      : String(quarterOptions[0]?.value || '1');
    if (period === 'quarterly') filters.quarter = selectedQuarter;

    const yearControl = `
        <div class="reports-field">
          <span class="reports-label">Year</span>
          <select id="reports-year">
            ${years.map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(selectedYear, value)}>${escapeHtml(value)}</option>`).join('')}
          </select>
        </div>
      `;
    const repaymentYearControl = `
        <div class="reports-field">
          <span class="reports-label">Repayment Year</span>
          <select id="reports-repayment-year">
            <option value="1" ${selectedAttr(filters.repaymentYear || '1', '1')}>Year 1 (Months 1-12)</option>
            <option value="2" ${selectedAttr(filters.repaymentYear || '1', '2')}>Year 2 (Months 13-24)</option>
          </select>
        </div>
      `;

    const periodControls = `
        ${['monthly', 'quarterly'].includes(period) ? yearControl : ''}
        ${period === 'yearly' ? repaymentYearControl : ''}
        ${period === 'monthly' ? `
          <div class="reports-field">
            <span class="reports-label">Repayment Month</span>
            <select id="reports-month" ${cycleMonths.length ? '' : 'disabled'}>
              ${cycleMonths.length
                ? cycleMonths.map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(selectedMonth, value)}>${escapeHtml(labelCycleMonth(value))}</option>`).join('')
                : '<option value="">No repayment months</option>'}
            </select>
          </div>
        ` : ''}
        ${period === 'quarterly' ? `
          <div class="reports-field">
            <span class="reports-label">Repayment Quarter</span>
            <select id="reports-quarter" ${quarterOptions.length ? '' : 'disabled'}>
              ${quarterOptions.length
                ? quarterOptions.map((item) => `<option value="${escapeHtml(item.value)}" ${selectedAttr(selectedQuarter, item.value)}>${escapeHtml(item.label)}</option>`).join('')
                : '<option value="">No repayment quarters</option>'}
            </select>
          </div>
        ` : ''}
      `;

    const repaymentControls = activeReport === 'repayments' ? `
          <div class="reports-field">
            <span class="reports-label">View Type</span>
            <select id="reports-period">
              <option value="monthly" ${selectedAttr(period, 'monthly')}>Monthly</option>
              <option value="quarterly" ${selectedAttr(period, 'quarterly')}>Quarterly</option>
              <option value="yearly" ${selectedAttr(period, 'yearly')}>Yearly</option>
            </select>
          </div>
          ${periodControls}
      ` : '';

    const authRole = String(window.SMARTLEAP_AUTH_USER?.role || '').toLowerCase();
    const isPdo = authRole.includes('project');

    const pdoControl = isPdo ? '' : `
          <div class="reports-field">
            <span class="reports-label">Assigned PDO</span>
            <select id="reports-pdo">
              <option value="" ${selectedAttr(filters.pdo, '')}>All PDOs</option>
              ${optionList(options.pdos).map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(filters.pdo, value)}>${escapeHtml(value)}</option>`).join('')}
            </select>
          </div>
      `;

    const populationControls = activeReport === 'demographics' ? `
          <div class="reports-field">
            <span class="reports-label">Sector</span>
            <select id="reports-sector">
              <option value="" ${selectedAttr(filters.sector, '')}>All sectors</option>
              ${optionList(options.sectors).map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(filters.sector, value)}>${escapeHtml(value)}</option>`).join('')}
            </select>
          </div>
          <div class="reports-field">
            <span class="reports-label">Service Type</span>
            <select id="reports-service-type">
              <option value="" ${selectedAttr(filters.serviceType, '')}>All service types</option>
              ${optionList(options.serviceTypes).map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(filters.serviceType, value)}>${escapeHtml(value)}</option>`).join('')}
            </select>
          </div>
          <div class="reports-field">
            <span class="reports-label">Gender</span>
            <select id="reports-gender">
              <option value="" ${selectedAttr(filters.gender, '')}>All genders</option>
              ${optionList(options.genders).map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(filters.gender, value)}>${escapeHtml(value)}</option>`).join('')}
            </select>
          </div>
      ` : '';

    const trainingControls = activeReport === 'training' ? `
          <div class="reports-field">
            <span class="reports-label">Training Session</span>
            <select id="reports-training-session">
              <option value="" ${selectedAttr(filters.trainingSession, '')}>All sessions</option>
              ${optionList(options.trainingSessions || [1, 2, 3]).map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(filters.trainingSession, String(value))}>Session ${escapeHtml(value)}</option>`).join('')}
            </select>
          </div>
          <div class="reports-field">
            <span class="reports-label">Training Group</span>
            <select id="reports-training-group">
              <option value="" ${selectedAttr(filters.trainingGroup, '')}>All groups</option>
              ${optionList(options.trainingGroups || [1, 2, 3]).map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(filters.trainingGroup, String(value))}>Group ${escapeHtml(value)}</option>`).join('')}
            </select>
          </div>
      ` : '';

    return `
      <div class="reports-toolbar reports-filter-card">
        <div class="reports-filter-grid reports-filter-grid--realtime">
          <div class="reports-filter-group">
            <span class="reports-label">Search</span>
            <div class="reports-search-box">
              <i class="fas fa-search reports-search-icon" aria-hidden="true"></i>
              <input type="search" id="reports-search" class="reports-search-input" placeholder="Search person, business, or PDO" value="${escapeHtml(filters.search)}" autocomplete="off">
              <button type="button" class="reports-search-clear${filters.search ? ' is-visible' : ''}" id="reports-search-clear" aria-label="Clear search" title="Clear search">
                <i class="fas fa-times" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          ${repaymentControls}
          ${pdoControl}
          ${populationControls}
          ${trainingControls}
        </div>
        <div class="reports-filter-actions">
          <div class="reports-toolbar__actions">
            <button class="app-btn-outline" id="reports-refresh" type="button">Refresh</button>
            <button class="app-btn-outline" id="reports-export-csv" type="button">Export CSV</button>
            <button class="app-btn-outline" id="reports-export-pdf" type="button">Export PDF</button>
          </div>
        </div>
      </div>
    `;
  };

  const renderStatus = () => {
    const status = qs('#reports-status');
    if (!status) return;
    if (loading) {
      status.innerHTML = '<div class="admin-reports-loading">Loading live report data.</div>';
      return;
    }
    status.innerHTML = errorMessage ? `<div class="admin-alert admin-alert--danger">${escapeHtml(errorMessage)}</div>` : '';
  };

  const indicatorTextColor = () => '#ffffff';

  const normalizeDistributionRows = (rows) => {
    const source = Array.isArray(rows)
      ? rows
      : Array.isArray(rows?.segments)
        ? rows.segments
        : Array.isArray(rows?.stages)
          ? rows.stages
          : Array.isArray(rows?.rows)
            ? rows.rows
            : [];

    return source
      .map((row) => ({
        label: String(row?.label || row?.name || row?.key || 'Not Set').trim() || 'Not Set',
        count: Number(row?.count || row?.value || 0),
      }))
      .filter((row) => Number.isFinite(row.count) && row.count > 0);
  };

  const polarToCartesian = (cx, cy, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + (radius * Math.cos(angleInRadians)),
      y: cy + (radius * Math.sin(angleInRadians)),
    };
  };

  const donutArcPath = (cx, cy, outerRadius, innerRadius, startAngle, endAngle) => {
    if (endAngle - startAngle >= 359.999) {
      const topOuter = polarToCartesian(cx, cy, outerRadius, 0);
      const bottomOuter = polarToCartesian(cx, cy, outerRadius, 180);
      const topInner = polarToCartesian(cx, cy, innerRadius, 0);
      const bottomInner = polarToCartesian(cx, cy, innerRadius, 180);

      return [
        `M ${topOuter.x} ${topOuter.y}`,
        `A ${outerRadius} ${outerRadius} 0 1 0 ${bottomOuter.x} ${bottomOuter.y}`,
        `A ${outerRadius} ${outerRadius} 0 1 0 ${topOuter.x} ${topOuter.y}`,
        `L ${topInner.x} ${topInner.y}`,
        `A ${innerRadius} ${innerRadius} 0 1 1 ${bottomInner.x} ${bottomInner.y}`,
        `A ${innerRadius} ${innerRadius} 0 1 1 ${topInner.x} ${topInner.y}`,
        'Z',
      ].join(' ');
    }

    const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
    const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
    const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
    const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerStart.x} ${innerStart.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
      'Z',
    ].join(' ');
  };

  const sliceLabelMarkup = (slice, cx, cy, labelRadius, ringThickness) => {
    const midAngle = slice.startAngle + ((slice.endAngle - slice.startAngle) / 2);
    const point = polarToCartesian(cx, cy, labelRadius, midAngle);
    const share = slice.endAngle - slice.startAngle;
    const countFontSize = share <= 34 ? 13 : 16;
    const percentFontSize = share <= 34 ? 10.5 : 12.5;
    const percentText = `${slice.percentage.toFixed(1)}%`;
    const dyOffset = Math.min(10, Math.max(7, ringThickness * 0.16));
    return `
      <text class="reports-donut__slice-label" x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}" fill="${slice.textColor}">
        <tspan class="reports-donut__slice-count" x="${point.x.toFixed(2)}" dy="-${dyOffset}" style="font-size:${countFontSize}px;">${escapeHtml(String(slice.count))}</tspan>
        <tspan class="reports-donut__slice-percent" x="${point.x.toFixed(2)}" dy="${dyOffset + 12}" style="font-size:${percentFontSize}px;">${escapeHtml(percentText)}</tspan>
      </text>
    `;
  };

  const renderDistributionChart = (root, rows, options = {}) => {
    if (!root) return;
    const safeRows = normalizeDistributionRows(rows);
    const total = safeRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    if (!safeRows.length || total <= 0) {
      root.innerHTML = '<p class="reports-empty">No data available.</p>';
      return;
    }
    const slices = safeRows.map((row, index) => {
      const count = Number(row.count || 0);
      const share = total > 0 ? (count / total) * 100 : 0;
      const color = chartPalette[index % chartPalette.length];
      const percentage = Number(share.toFixed(1));
      return {
        color,
        textColor: indicatorTextColor(color),
        count,
        percentage,
        label: row.label,
        share,
      };
    });

    const cx = 160;
    const cy = 160;
    const outerRadius = 122;
    const innerRadius = 66;
    const ringThickness = outerRadius - innerRadius;
    const labelRadius = innerRadius + (ringThickness / 2);
    let runningAngle = 0;
    const donutSlices = slices.map((slice) => {
      const sweepAngle = total > 0 ? (slice.count / total) * 360 : 0;
      const startAngle = runningAngle;
      const endAngle = runningAngle + sweepAngle;
      runningAngle = endAngle;
      return {
        ...slice,
        startAngle,
        endAngle,
        path: donutArcPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle),
      };
    });

    root.innerHTML = `
      <div class="reports-donut" role="img" aria-label="${escapeHtml(options.label || 'Distribution chart')}">
        <div class="reports-donut__chart-shell">
          <svg class="reports-donut__svg" viewBox="0 0 320 320" aria-hidden="true">
            <circle class="reports-donut__track" cx="${cx}" cy="${cy}" r="${outerRadius}"></circle>
            ${donutSlices.map((slice) => `<path d="${slice.path}" fill="${slice.color}"></path>`).join('')}
            ${donutSlices.map((slice) => sliceLabelMarkup(slice, cx, cy, labelRadius, ringThickness)).join('')}
          </svg>
        </div>
        <div class="reports-donut__legend">
          ${donutSlices.map((slice) => {
            return `
              <div class="reports-donut__legend-row">
                <span class="reports-donut__legend-swatch" style="--legend-color:${slice.color};"></span>
                <span class="reports-donut__legend-label">${escapeHtml(slice.label)}</span>
                <strong class="reports-donut__legend-count">${slice.count}</strong>
                <span class="reports-donut__legend-percent">${slice.percentage.toFixed(1)}%</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  const renderMonthlyPaymentChart = (root, rows, period = 'monthly') => {
    if (!root) return;
    if (!rows.length) {
      root.innerHTML = '<p class="reports-empty">No repayment records yet.</p>';
      return;
    }

    const series = [
      { key: 'targetAmount', label: 'Target', color: '#2563eb' },
      { key: 'actualCollectedAmount', label: 'Actual', color: '#16a34a' },
      { key: 'gapAmount', label: 'Gap', color: '#dc2626' },
    ];
    const rawMax = Math.max(...rows.flatMap((row) => series.map((item) => Number(row[item.key] || 0))), 1);
    const step = niceAxisStep(rawMax);
    const maxValue = Math.max(step, Math.ceil(rawMax / step) * step);
    const ticks = [];
    for (let value = maxValue; value >= 0; value -= step) {
      ticks.push(value);
    }

    const chartGranularity = (selectedPeriod, points) => {
      const hasDailyDates = Array.isArray(points) && points.some((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.period || '')));
      if (hasDailyDates) return 'daily';
      return selectedPeriod;
    };
    const granularity = chartGranularity(period, rows);
    const xAxisTitle = period === 'daily'
      ? 'Days'
      : granularity === 'daily'
        ? 'Days'
        : period === 'weekly'
        ? 'Weeks'
        : period === 'quarterly'
          ? 'Quarters'
          : period === 'yearly'
            ? 'Years'
            : period === 'all'
              ? 'Months'
              : 'Months';

    const chunks = [];
    for (let index = 0; index < rows.length; index += 6) {
      chunks.push(rows.slice(index, index + 6));
    }

    const renderChunk = (chunk, chunkIndex) => `
      <div class="reports-monthly-payment-chart" role="img" aria-label="${escapeHtml(`Repayment performance by ${xAxisTitle.toLowerCase()}`)}">
        <div class="reports-monthly-payment-chart__body">
          <div class="reports-monthly-payment-chart__axis-title">Payments</div>
          <div class="reports-monthly-payment-chart__axis">
            ${ticks.map((value) => `<span>${escapeHtml(Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</span>`).join('')}
          </div>
          <div class="reports-monthly-payment-chart__plot">
            <div class="reports-monthly-payment-chart__canvas" style="--month-count:${chunk.length};">
              <div class="reports-monthly-payment-chart__guides">
                ${ticks.map(() => '<i></i>').join('')}
              </div>
              <div class="reports-monthly-payment-chart__groups">
                ${chunk.map((row) => `
                  <article class="reports-monthly-payment-chart__group">
                    <div class="reports-monthly-payment-chart__bars">
                      ${series.map((item) => {
                        const value = Number(row[item.key] || 0);
                        const height = maxValue > 0 ? Math.max(value > 0 ? 3 : 0, (value / maxValue) * 100) : 0;
                        return `
                          <span class="reports-monthly-payment-chart__bar" style="--bar-height:${height}%;--bar-color:${item.color};" title="${escapeHtml(item.label)}: ${formatCurrency(value)}">
                            <strong>${escapeHtml(formatChartCurrencyLabel(value))}</strong>
                          </span>
                        `;
                      }).join('')}
                    </div>
                    <span class="reports-monthly-payment-chart__month">${escapeHtml(String(row.label || row.period || '').toUpperCase())}</span>
                  </article>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="reports-monthly-payment-chart__legend">
            ${series.map((item) => `<span><i style="background:${item.color}"></i>${escapeHtml(item.label)}</span>`).join('')}
          </div>
        </div>
        <div class="reports-monthly-payment-chart__x-title">${escapeHtml(chunks.length > 1 ? `${xAxisTitle} - Part ${chunkIndex + 1}` : xAxisTitle)}</div>
      </div>
    `;

    root.innerHTML = chunks.map((chunk, index) => renderChunk(chunk, index)).join('');
  };

  const reportCards = (summary, metrics) => [
    {
      key: 'repayments',
      eyebrow: 'Repayments',
      title: formatCurrency(metrics.actualCollectedAmount || 0),
      copy: `${formatCurrency(metrics.targetAmount || 0)} target for ${metrics.label || 'selected period'}.`,
    },
    {
      key: 'demographics',
      eyebrow: 'Donut Graphs',
      title: `${summary.totalPeople || 0} people`,
      copy: 'Gender, service type, and sector distribution for current applicants and beneficiaries.',
    },
    {
      key: 'training',
      eyebrow: 'Training Attendance',
      title: `${(reportData?.trainingAnalytics?.rows || []).length} rows`,
      copy: 'Attendance table filtered by training session and group number.',
    },
  ];

  const buildReportsLauncher = (summary, metrics) => {
    const activeReport = String(state.filters.reports.activeReport || 'repayments');
    return `
    <section class="reports-report-tabs" aria-label="Report type">
      ${reportCards(summary, metrics).map((card) => `
        <button type="button" class="reports-report-chip ${activeReport === card.key ? 'is-active' : ''}" data-report-open="${escapeHtml(card.key)}">
          <span>${escapeHtml(card.eyebrow)}</span>
          <small>${escapeHtml(card.copy)}</small>
        </button>
      `).join('')}
    </section>
  `;
  };

  const repaymentKpiCards = (metrics) => {
    const period = reportData?.filters?.period || state.filters.reports.period || 'all';
    const isAll = period === 'all';
    const isPaymentDriven = metrics?.targetMode === 'payment_beneficiaries';
    const periodUnit = period === 'quarterly'
        ? 'quarter'
        : period === 'yearly'
          ? 'year'
          : 'month';
    return [
      {
        label: isAll ? 'Expected Due' : 'Expected Due',
        value: formatCurrency(metrics.targetAmount || 0),
        meta: metrics.label || 'Selected period',
        color: '#2563eb',
      },
      {
        label: 'Actual Collected',
        value: formatCurrency(metrics.actualCollectedAmount || 0),
        meta: isPaymentDriven
          ? `${metrics.paymentBeneficiaryCount || 0} beneficiaries paid in the selected ${periodUnit}`
          : `${metrics.scopedBeneficiaries || 0} beneficiaries with due obligations`,
        color: '#16a34a',
      },
      {
        label: 'Gap',
        value: formatCurrency(metrics.gapAmount || 0),
        meta: isPaymentDriven
          ? `${metrics.obligationCount || 0} paid beneficiaries counted for target`
          : `${metrics.obligationCount || 0} due obligations`,
        color: '#dc2626',
      },
      {
        label: 'ROI',
        value: formatPercent(metrics.roiPercent || 0),
        meta: isPaymentDriven ? 'Collected / payment-based target x 100' : 'Collected / expected due x 100',
        color: '#7c3aed',
      },
    ];
  };

  const buildPerformanceSection = (metrics, reportType = 'all') => `
    <div class="charts-grid" id="reports-performance-shell">
      ${['all', 'repayments'].includes(reportType) ? `<div class="chart-card chart-card--full">
        <div class="chart-card__header">
          <div>
            <h4>Repayment Performance</h4>
          </div>
        </div>
        <div class="reports-repayment-status-kpis">
          ${repaymentKpiCards(metrics).map((card) => `
            <article class="reports-repayment-status-kpi" style="--kpi-color:${card.color}">
              <span>${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(card.value)}</strong>
              <small>${escapeHtml(card.meta)}</small>
            </article>
          `).join('')}
        </div>
        <div class="chart-wrap reports-monthly-payment-chart-wrap" id="reports-performance-bars"></div>
      </div>
      <div class="chart-card chart-card--full reports-payment-participants-card">
        <div class="reports-payment-participants-summary" aria-label="Payment participant summary">
          <span id="reports-payment-participants-count">0 payments</span>
          <span><strong id="reports-payment-participants-total">₱0</strong> collected in this table</span>
          <span><strong id="reports-payment-participants-months">0</strong> coverage months</span>
        </div>
        <div class="table-wrapper reports-payment-participants-wrap">
          <table class="data-table reports-payment-participants-table">
            <thead>
              <tr>
                <th>Beneficiary</th>
                <th>Business</th>
                <th>Barangay</th>
                <th>Assigned PDO</th>
                <th>Coverage Month</th>
                <th>Payment Date</th>
                <th>Expected</th>
                <th>Amount Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="reports-payment-participants-body">
              <tr><td colspan="9">No payments found for the selected period.</td></tr>
            </tbody>
          </table>
        </div>
      </div>` : ''}
      ${['all', 'demographics'].includes(reportType) ? `<div class="chart-card chart-card--distribution">
        <div class="chart-card__header">
          <h4>Gender Segregation</h4>
        </div>
        <div class="chart-wrap" id="reports-gender-donut"></div>
      </div>
      <div class="chart-card chart-card--distribution">
        <div class="chart-card__header">
          <h4>Service Type Distribution</h4>
        </div>
        <div class="chart-wrap" id="reports-service-donut"></div>
      </div>
      <div class="chart-card chart-card--distribution">
        <div class="chart-card__header">
          <h4>Sector Distribution</h4>
        </div>
        <div class="chart-wrap" id="reports-sector-donut"></div>
      </div>
      <div class="chart-card chart-card--full reports-demographic-participants-card">
        <div class="reports-payment-participants-summary reports-demographic-participants-summary" aria-label="Demographic participant summary">
          <span id="reports-demographic-participants-count">0 participants</span>
          <span><strong id="reports-demographic-applicants-count">0</strong> applicants</span>
          <span><strong id="reports-demographic-beneficiaries-count">0</strong> beneficiaries</span>
        </div>
        <div class="table-wrapper reports-payment-participants-wrap reports-demographic-participants-wrap">
          <table class="data-table reports-payment-participants-table reports-demographic-participants-table">
            <thead>
              <tr>
                <th>Population</th>
                <th>Participant</th>
                <th>Business</th>
                <th>Barangay</th>
                <th>Assigned PDO</th>
                <th>Service Type</th>
                <th>Sector</th>
                <th>Gender</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="reports-demographic-participants-body">
              <tr><td colspan="9">No applicant or beneficiary records found for the selected filters.</td></tr>
            </tbody>
          </table>
        </div>
      </div>` : ''}
      ${['all', 'training'].includes(reportType) ? `<div class="chart-card chart-card--full">
        <div class="chart-card__header">
          <div>
            <h4>Training Attendance</h4>
            <small>Filtered by session and group number.</small>
          </div>
        </div>
        <div class="reports-training-attendance-shell">
          <div id="reports-training-attendance-summary"></div>
          <div class="table-wrapper reports-training-attendance-wrap">
            <table class="data-table reports-training-attendance-table">
              <thead>
                <tr>
                  <th>Participant Name</th>
                  <th>Session</th>
                  <th>Group</th>
                  <th>PDO</th>
                  <th>Activity</th>
                  <th>Location</th>
                  <th>Attendance</th>
                  <th>Proof</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody id="reports-training-attendance-body">
                <tr><td colspan="9">No training attendance records found.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>` : ''}
    </div>
  `;

  const attendanceLabel = (status) => {
    const text = String(status || '').trim().toLowerCase();
    if (text === 'completed') return 'Completed';
    if (['attended', 'present'].includes(text)) return 'Present';
    if (['missed', 'absent'].includes(text)) return 'Absent';
    if (text === 'excused') return 'Excused';
    if (text === 'notified') return 'Notified';
    if (text === 'scheduled') return 'Scheduled';
    return text ? text.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Pending';
  };

  const paymentStatusClass = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'paid_on_time') return 'reports-payment-chip--paid';
    if (s === 'partial_delayed') return 'reports-payment-chip--partial';
    if (s === 'pending_verification') return 'reports-payment-chip--pending';
    if (s === 'overdue_unpaid') return 'reports-payment-chip--overdue';
    if (s === 'upcoming') return 'reports-payment-chip--upcoming';
    return '';
  };

  const paymentStatusLabel = (status) => {
    const map = {
      paid_on_time: 'Paid on Time',
      partial_delayed: 'Partial / Delayed',
      pending_verification: 'Pending Verification',
      overdue_unpaid: 'Overdue Unpaid',
      upcoming: 'Upcoming',
    };
    return map[String(status || '').toLowerCase()] || String(status || '--').replace(/_/g, ' ');
  };

  const formatMonth = (value) => {
    if (!value) return '--';
    try {
      return new Date(`${value}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    } catch (_) { return value; }
  };

  /**
   * Build payment participant rows from the filteredObligations.
   * One row per verified payment - if a beneficiary paid 2 months in the
   * selected period they appear twice (once per coverage month).
   */
  const buildPaymentParticipantRows = (obligations, period) => {
    const rows = [];
    (Array.isArray(obligations) ? obligations : []).forEach((ob) => {
        // One row per obligation that has activity (paid/partial/pending)
        const hasActivity = ['paid_on_time', 'partial_delayed', 'pending_verification'].includes(String(ob.status || ''));
        if (!hasActivity) return;
        rows.push({
          beneficiaryName: ob.beneficiaryName || '--',
          businessName: ob.businessName || '--',
          barangay: ob.barangay || '--',
          assignedPdo: ob.assignedPdo || '--',
          dueMonth: ob.dueMonth || '--',
          paymentDate: ob.paymentDate || '--',
          expectedAmount: ob.expectedAmount || 0,
          amountPaid: ob.amountRepresented || 0,
          status: ob.status,
          statusLabel: ob.statusLabel || paymentStatusLabel(ob.status),
        });
    });

    // Sort by coverage month asc, then by name
    rows.sort((a, b) => {
      const monthCmp = String(a.dueMonth).localeCompare(String(b.dueMonth));
      if (monthCmp !== 0) return monthCmp;
      return String(a.beneficiaryName).localeCompare(String(b.beneficiaryName));
    });

    return rows;
  };

  const renderPaymentParticipantsTable = (obligations, period) => {
    const body = qs('#reports-payment-participants-body');
    const countNode = qs('#reports-payment-participants-count');
    const totalNode = qs('#reports-payment-participants-total');
    const monthsNode = qs('#reports-payment-participants-months');
    if (!body) return;

    const rows = buildPaymentParticipantRows(obligations, period);
    const totalPaid = rows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);
    const monthCount = new Set(rows.map((row) => String(row.dueMonth || '')).filter(Boolean)).size;

    if (countNode) {
      countNode.textContent = `${rows.length} ${rows.length === 1 ? 'payment' : 'payments'}`;
    }
    if (totalNode) totalNode.textContent = formatCurrency(totalPaid);
    if (monthsNode) monthsNode.textContent = String(monthCount);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9">No verified payments found for the selected period.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((row) => `
      <tr>
        <td>
          <div class="reports-person-cell">
            <strong>${escapeHtml(row.beneficiaryName)}</strong>
          </div>
        </td>
        <td>${escapeHtml(row.businessName)}</td>
        <td>${escapeHtml(row.barangay)}</td>
        <td>${escapeHtml(row.assignedPdo)}</td>
        <td>${escapeHtml(formatMonth(row.dueMonth))}</td>
        <td>${escapeHtml(row.paymentDate && row.paymentDate !== '--' ? formatDate(row.paymentDate) : '--')}</td>
        <td>${escapeHtml(formatCurrency(row.expectedAmount))}</td>
        <td><strong>${escapeHtml(formatCurrency(row.amountPaid))}</strong></td>
        <td><span class="reports-payment-chip ${paymentStatusClass(row.status)}">${escapeHtml(row.statusLabel)}</span></td>
      </tr>
    `).join('');
  };

  const renderTrainingAttendanceTable = (rows) => {
    const body = qs('#reports-training-attendance-body');
    if (!body) return;
    const list = Array.isArray(rows) ? rows : [];
    body.innerHTML = list.length ? list.map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.participantName || '--')}</strong><br><small>${escapeHtml(row.businessName || '')}</small></td>
        <td>${escapeHtml(`Session ${row.sessionNumber || '--'}`)}</td>
        <td>${escapeHtml(`Group ${row.groupNumber || '--'}`)}</td>
        <td>${escapeHtml(row.assignedPdo || 'Unassigned')}</td>
        <td>${escapeHtml(row.activityName || '--')}</td>
        <td>${escapeHtml(row.location || '--')}</td>
        <td><span class="reports-training-attendance-chip reports-training-attendance-chip--${escapeHtml(trainingAttendanceTone(row.status))}">${escapeHtml(attendanceLabel(row.status))}</span></td>
        <td>${row.proofPath ? `<a class="action-link" href="${escapeHtml(routeUrl(row.proofPath))}" target="_blank" rel="noopener">${escapeHtml(row.proofName || 'View proof')}</a>` : '<span class="reports-training-attendance-chip reports-training-attendance-chip--slate">No proof</span>'}</td>
        <td>${escapeHtml(row.remarks || '--')}</td>
      </tr>
    `).join('') : '<tr><td colspan="9">No training attendance records found.</td></tr>';
  };

  const trainingAttendanceTone = (status) => {
    const text = String(status || '').trim().toLowerCase();
    if (text === 'completed') return 'blue';
    if (['attended', 'present'].includes(text)) return 'emerald';
    if (['missed', 'absent'].includes(text)) return 'rose';
    if (text === 'excused') return 'amber';
    return 'slate';
  };

  const buildTrainingAttendanceSummary = (trainingAnalytics = {}) => {
    const root = qs('#reports-training-attendance-summary');
    if (!root) return;

    const summary = trainingAnalytics.summary || {};
    const breakdown = Array.isArray(trainingAnalytics.breakdown) ? trainingAnalytics.breakdown : [];
    const filters = trainingAnalytics.filters || {};
    const filterParts = [];
    if (Number(filters.session || 0) > 0) filterParts.push(`Session ${filters.session}`);
    if (Number(filters.group || 0) > 0) filterParts.push(`Group ${filters.group}`);

    root.innerHTML = `
      <div class="reports-training-attendance-summary">
        <div class="reports-training-attendance-summary__header">
          <div class="reports-training-attendance-summary__title-wrap">
            <strong class="reports-training-attendance-summary__title">${escapeHtml(filterParts.length ? filterParts.join(' | ') : 'All Sessions and Groups')}</strong>
            <span class="reports-training-attendance-summary__subtitle">${escapeHtml(`${summary.participants || 0} participant${Number(summary.participants || 0) === 1 ? '' : 's'} matched the current report filters.`)}</span>
          </div>
          <div class="reports-training-attendance-summary__chips">
            <span class="reports-training-attendance-summary__chip reports-training-attendance-summary__chip--present">
              <span class="reports-training-chip-dot"></span>Present <strong>${escapeHtml(String(summary.present || 0))}</strong>
            </span>
            <span class="reports-training-attendance-summary__chip reports-training-attendance-summary__chip--absent">
              <span class="reports-training-chip-dot"></span>Absent <strong>${escapeHtml(String(summary.absent || 0))}</strong>
            </span>
            <span class="reports-training-attendance-summary__chip reports-training-attendance-summary__chip--excused">
              <span class="reports-training-chip-dot"></span>Excused <strong>${escapeHtml(String(summary.excused || 0))}</strong>
            </span>
            <span class="reports-training-attendance-summary__chip reports-training-attendance-summary__chip--completed">
              <span class="reports-training-chip-dot"></span>Completed <strong>${escapeHtml(String(summary.completed || 0))}</strong>
            </span>
          </div>
        </div>
        <div class="reports-training-attendance-breakdown">
          ${breakdown.map((item) => `
            <article class="reports-training-attendance-breakdown__card">
              <span class="reports-training-attendance-breakdown__session">${escapeHtml(item.label || `Session ${item.session || '--'}`)}</span>
              <strong>${escapeHtml(String((item.present || 0) + (item.absent || 0) + (item.excused || 0)))}</strong>
              <small class="reports-training-attendance-breakdown__meta">
                <span class="breakdown-tag breakdown-tag--present">${escapeHtml(String(item.present || 0))} present</span> ·
                <span class="breakdown-tag breakdown-tag--absent">${escapeHtml(String(item.absent || 0))} absent</span> ·
                <span class="breakdown-tag breakdown-tag--excused">${escapeHtml(String(item.excused || 0))} excused</span>
              </small>
            </article>
          `).join('')}
        </div>
      </div>
    `;
  };

  const sortParticipantRecords = (items) => [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const stageCmp = String(left.populationStage || '').localeCompare(String(right.populationStage || ''));
    if (stageCmp !== 0) return stageCmp;
    return String(left.name || '').localeCompare(String(right.name || ''));
  });

  const renderDemographicParticipantsTable = (items) => {
    const body = qs('#reports-demographic-participants-body');
    const countNode = qs('#reports-demographic-participants-count');
    const applicantsNode = qs('#reports-demographic-applicants-count');
    const beneficiariesNode = qs('#reports-demographic-beneficiaries-count');
    if (!body) return;

    const rows = sortParticipantRecords(items);
    const applicantCount = rows.filter((row) => !row.isBeneficiary).length;
    const beneficiaryCount = rows.filter((row) => !!row.isBeneficiary).length;

    if (countNode) {
      countNode.textContent = `${rows.length} ${rows.length === 1 ? 'participant' : 'participants'}`;
    }
    if (applicantsNode) applicantsNode.textContent = String(applicantCount);
    if (beneficiariesNode) beneficiariesNode.textContent = String(beneficiaryCount);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9">No applicant or beneficiary records found for the selected filters.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.populationStage || (row.isBeneficiary ? 'Beneficiary' : 'Applicant'))}</td>
        <td>
          <div class="reports-person-cell">
            <strong>${escapeHtml(row.name || '--')}</strong>
            <small>${escapeHtml(row.email || '--')}</small>
          </div>
        </td>
        <td>${escapeHtml(row.businessName || '--')}</td>
        <td>${escapeHtml(row.barangay || '--')}</td>
        <td>${escapeHtml(row.assignedPdo || 'Unassigned')}</td>
        <td>${escapeHtml(row.serviceType || '--')}</td>
        <td>${escapeHtml(row.sector || '--')}</td>
        <td>${escapeHtml(row.gender || '--')}</td>
        <td>${escapeHtml(row.programStatus || '--')}</td>
      </tr>
    `).join('');
  };

  const renderToolbarOnly = () => {
    const content = qs('#reports-content');
    if (!content) return;
    let toolbar = qs('#reports-toolbar-shell', content);
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'reports-toolbar-shell';
      content.appendChild(toolbar);
    }
    toolbar.innerHTML = buildToolbar();
  };

  const updateReportsView = ({ refreshToolbar = true } = {}) => {
    const content = qs('#reports-content');
    if (!content) return;

    const activeEl = document.activeElement;
    const isSearchFocused = activeEl && activeEl.id === 'reports-search';
    const selectionStart = isSearchFocused ? activeEl.selectionStart : null;
    const selectionEnd = isSearchFocused ? activeEl.selectionEnd : null;

    const items = records();
    const summary = reportData?.summary || currentSummary(items);
    const metrics = reportData?.repaymentAnalytics?.periodMetrics || reportData?.summary?.repaymentPerformance || {
      label: 'Selected period',
      targetAmount: 0,
      actualCollectedAmount: 0,
      gapAmount: 0,
      roiPercent: 0,
      scopedBeneficiaries: items.length,
      obligationCount: 0,
    };
    const repaymentPeriod = reportData?.filters?.period || state.filters.reports.period || 'all';
    const repaymentBreakdown = Array.isArray(reportData?.repaymentAnalytics?.breakdown)
      ? reportData.repaymentAnalytics.breakdown
      : [];
    const activeReport = String(state.filters.reports.activeReport || 'repayments');
    content.innerHTML = `
      ${buildReportsLauncher(summary, metrics)}
      <div id="reports-toolbar-shell"></div>
      <div id="reports-performance-body"></div>
    `;
    if (refreshToolbar) renderToolbarOnly();

    if (isSearchFocused) {
      const newSearchInput = qs('#reports-search');
      if (newSearchInput) {
        newSearchInput.focus();
        if (selectionStart !== null && selectionEnd !== null) {
          try { newSearchInput.setSelectionRange(selectionStart, selectionEnd); } catch (_) {}
        }
      }
    }
    const performanceBody = qs('#reports-performance-body', content);
    if (!performanceBody) return;
    performanceBody.innerHTML = buildPerformanceSection(metrics, activeReport);
    renderMonthlyPaymentChart(qs('#reports-performance-bars'), repaymentBreakdown, repaymentPeriod);
    renderPaymentParticipantsTable(
      reportData?.repaymentAnalytics?.obligations || [],
      repaymentPeriod
    );
    renderDistributionChart(qs('#reports-gender-donut'), summary.genderDistribution || [], {
      label: 'Gender distribution chart',
      centerLabel: 'Gender',
    });
    renderDistributionChart(qs('#reports-service-donut'), summary.serviceTypeDistribution || [], {
      label: 'Service type distribution chart',
      centerLabel: 'Services',
    });
    renderDistributionChart(qs('#reports-sector-donut'), summary.sectorDistribution || [], {
      label: 'Sector distribution chart',
      centerLabel: 'Sectors',
    });
    renderDemographicParticipantsTable(items);
    buildTrainingAttendanceSummary(reportData?.trainingAnalytics || {});
    renderTrainingAttendanceTable(reportData?.trainingAnalytics?.rows || []);
  };

  const renderReportShell = () => {
    const section = qs('#reports-section');
    if (!section) return;
    renderStatus();
    const content = qs('#reports-content');
    if (content) return;
    section.innerHTML = `
      <div id="reports-status"></div>
      <div id="reports-content">
        <div id="reports-toolbar-shell"></div>
        <div id="reports-performance-body"></div>
      </div>
    `;
    renderStatus();
  };

  const printReportInPlace = (url) => {
    const frameId = 'reports-export-print-frame';
    let frame = document.getElementById(frameId);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = frameId;
      frame.setAttribute('aria-hidden', 'true');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      frame.style.border = '0';
      document.body.appendChild(frame);
    }

    frame.onload = () => {
      try {
        const win = frame.contentWindow;
        if (!win) throw new Error('Missing print window.');
        win.focus();
        window.setTimeout(() => win.print(), 120);
      } catch (_) {
        window.open(url, '_blank', 'noopener');
      }
    };
    frame.src = url;
  };

  const exportReport = (formatType) => {
    const query = buildReportQuery();
    const target = routeUrl(`${reportExportBase()}/${formatType}`);
    const url = query.toString() ? `${target}?${query}` : target;
    if (formatType === 'pdf') {
      printReportInPlace(url);
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  const bindEvents = () => {
    if (bound) return;
    bound = true;

    const section = qs('#reports-section');
    if (!section) return;

    section.addEventListener('input', (event) => {
      const id = event.target?.id || '';
      if (id === 'reports-search') {
        const val = event.target.value;
        state.filters.reports.search = val;
        const clearBtn = qs('#reports-search-clear');
        if (clearBtn) clearBtn.classList.toggle('is-visible', Boolean(val.trim()));
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(fetchReportData, 350);
      }
    });

    section.addEventListener('keydown', (event) => {
      const id = event.target?.id || '';
      if (id === 'reports-search') {
        if (event.key === 'Enter') {
          event.preventDefault();
          window.clearTimeout(searchTimer);
          fetchReportData();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.target.value = '';
          state.filters.reports.search = '';
          const clearBtn = qs('#reports-search-clear');
          if (clearBtn) clearBtn.classList.remove('is-visible');
          window.clearTimeout(searchTimer);
          fetchReportData();
        }
      }
    });

    section.addEventListener('search', (event) => {
      const id = event.target?.id || '';
      if (id === 'reports-search') {
        state.filters.reports.search = event.target.value;
        const clearBtn = qs('#reports-search-clear');
        if (clearBtn) clearBtn.classList.toggle('is-visible', Boolean(event.target.value.trim()));
        window.clearTimeout(searchTimer);
        fetchReportData();
      }
    });

    section.addEventListener('change', (event) => {
      const id = event.target?.id || '';
      if (!id.startsWith('reports-')) return;
      if (id === 'reports-period') {
        state.filters.reports.period = event.target.value;
        if (state.filters.reports.period === 'monthly') {
          const years = scheduledRepaymentYears('monthly');
          if (years.length && !years.includes(String(state.filters.reports.year || ''))) {
            state.filters.reports.year = years[0];
          }
          const cycleMonths = scheduledRepaymentMonthsForYear(state.filters.reports.year || currentYear);
          state.filters.reports.month = cycleMonths.includes(state.filters.reports.month) ? state.filters.reports.month : (cycleMonths[0] || '');
        }
        if (state.filters.reports.period === 'quarterly') {
          const years = scheduledRepaymentYears('quarterly');
          if (years.length && !years.includes(String(state.filters.reports.year || ''))) {
            state.filters.reports.year = years[0];
          }
          const quarters = scheduledRepaymentQuartersForYear(state.filters.reports.year || currentYear);
          state.filters.reports.quarter = quarters.some((item) => item.value === String(state.filters.reports.quarter || ''))
            ? String(state.filters.reports.quarter)
            : String(quarters[0]?.value || '1');
        }
        renderToolbarOnly();
        updateReportsView();
        fetchReportData();
        return;
      }
      if (id === 'reports-year') state.filters.reports.year = event.target.value;
      else if (id === 'reports-month') state.filters.reports.month = event.target.value;
      else if (id === 'reports-quarter') state.filters.reports.quarter = event.target.value;
      else if (id === 'reports-repayment-year') state.filters.reports.repaymentYear = event.target.value;
      else if (id === 'reports-pdo') state.filters.reports.pdo = event.target.value;
      else if (id === 'reports-sector') state.filters.reports.sector = event.target.value;
      else if (id === 'reports-service-type') state.filters.reports.serviceType = event.target.value;
      else if (id === 'reports-gender') state.filters.reports.gender = event.target.value;
      else if (id === 'reports-training-session') state.filters.reports.trainingSession = event.target.value;
      else if (id === 'reports-training-group') state.filters.reports.trainingGroup = event.target.value;
      if (id === 'reports-year') {
        if (state.filters.reports.period === 'monthly') {
          const cycleMonths = scheduledRepaymentMonthsForYear(state.filters.reports.year || currentYear);
          state.filters.reports.month = cycleMonths.includes(state.filters.reports.month) ? state.filters.reports.month : (cycleMonths[0] || '');
        }
        if (state.filters.reports.period === 'quarterly') {
          const quarters = scheduledRepaymentQuartersForYear(state.filters.reports.year || currentYear);
          state.filters.reports.quarter = quarters.some((item) => item.value === String(state.filters.reports.quarter || ''))
            ? String(state.filters.reports.quarter)
            : String(quarters[0]?.value || '1');
        }
      }
      if (id === 'reports-year' || id === 'reports-period' || id === 'reports-repayment-year') {
        renderToolbarOnly();
        updateReportsView();
      }
      fetchReportData();
    });

    section.addEventListener('click', (event) => {
      const clearBtn = event.target.closest('#reports-search-clear');
      if (clearBtn) {
        const searchInput = qs('#reports-search');
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        state.filters.reports.search = '';
        clearBtn.classList.remove('is-visible');
        window.clearTimeout(searchTimer);
        fetchReportData();
        return;
      }

      const openReport = event.target.closest('[data-report-open]');
      if (openReport) {
        state.filters.reports.activeReport = openReport.getAttribute('data-report-open') || 'repayments';
        updateReportsView();
        return;
      }
      const id = event.target?.id || '';
      if (id === 'reports-refresh') {
        fetchReportData();
        return;
      }
      const tableExport = event.target.closest('[data-report-export]');
      if (tableExport) {
        exportReport(tableExport.getAttribute('data-report-export') || 'csv');
        return;
      }
      if (id === 'reports-export-csv') {
        exportReport('csv');
        return;
      }
      if (id === 'reports-export-pdf') {
        exportReport('pdf');
      }
    });
  };

  const init = () => {
    renderReportShell();
    bindEvents();
    fetchReportData();
  };

  const renderReports = () => {
    renderReportShell();
    bindEvents();
    if (!reportData && !loading) {
      fetchReportData();
      return;
    }
    updateReportsView();
  };

  window.App.modules.reports = { init, render: renderReports, refresh: fetchReportData };
})();
