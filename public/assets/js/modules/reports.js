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
    { value: '1', label: 'Q1' },
    { value: '2', label: 'Q2' },
    { value: '3', label: 'Q3' },
    { value: '4', label: 'Q4' },
  ];
  const repaymentCycleStartMonth = 5;

  const padMonth = (value) => String(value).padStart(2, '0');
  const shiftMonthValue = (monthValue, offset) => {
    const parsed = new Date(`${monthValue}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return monthValue;
    parsed.setMonth(parsed.getMonth() + Number(offset || 0));
    return `${parsed.getFullYear()}-${padMonth(parsed.getMonth() + 1)}`;
  };
  const buildRepaymentCycleMonths = (yearValue) => {
    const baseYear = Number.parseInt(yearValue, 10) || Number.parseInt(currentYear, 10);
    const startMonth = `${baseYear}-${padMonth(repaymentCycleStartMonth)}`;
    return Array.from({ length: 12 }, (_, index) => shiftMonthValue(startMonth, index));
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
    const normalized = (monthNumber - repaymentCycleStartMonth + 12) % 12;
    return String(Math.floor(normalized / 3) + 1);
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

  const today = new Date();
  const currentYear = String(today.getFullYear());
  const currentCycleMonth = `${currentYear}-${padMonth(today.getMonth() + 1)}`;
  const defaultCycleMonth = (() => {
    const cycleMonths = buildRepaymentCycleMonths(currentYear);
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
    from: '',
    to: '',
    district: '',
    sector: '',
    serviceType: '',
    gender: '',
    ageGroup: '',
    pdo: '',
    repayment: '',
    search: '',
    ...(state.filters.reports || {}),
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const routeUrl = (path) => `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;

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
    const params = new URLSearchParams();
    [
      ['period', filters.period || 'monthly'],
      ['month', filters.month],
      ['quarter', filters.quarter],
      ['year', filters.year],
      ['repaymentYear', filters.repaymentYear],
      ['from', filters.from],
      ['to', filters.to],
      ['district', normalizeFilterValue(filters.district)],
      ['sector', normalizeFilterValue(filters.sector)],
      ['serviceType', normalizeFilterValue(filters.serviceType)],
      ['gender', normalizeFilterValue(filters.gender)],
      ['ageGroup', normalizeFilterValue(filters.ageGroup)],
      ['pdo', normalizeFilterValue(filters.pdo)],
      ['repayment', normalizeFilterValue(filters.repayment)],
    ].forEach(([key, value]) => {
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
    const url = query.toString() ? `${routeUrl('api/reports')}?${query}` : routeUrl('api/reports');

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

  const buildToolbar = () => {
    const filters = state.filters.reports;
    const options = reportData?.options || {};
    const period = ['monthly', 'quarterly', 'yearly'].includes(String(filters.period || ''))
      ? filters.period
      : 'monthly';
    filters.period = period;
    const years = optionList(options.years).length ? optionList(options.years) : [currentYear];
    const repaymentYear = String(filters.repaymentYear || '1');
    const cycleBaseYear = String((Number.parseInt(filters.year || currentYear, 10) || Number.parseInt(currentYear, 10)) + (repaymentYear === '2' ? 1 : 0));
    const cycleMonths = buildRepaymentCycleMonths(cycleBaseYear);
    const selectedMonth = cycleMonths.includes(filters.month) ? filters.month : cycleMonths[0];

    const periodControls = `
        <div class="reports-field">
          <span class="reports-label">Year</span>
          <select id="reports-year">
            ${years.map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(filters.year || currentYear, value)}>${escapeHtml(value)}</option>`).join('')}
          </select>
        </div>
        <div class="reports-field">
          <span class="reports-label">Repayment Cycle</span>
          <select id="reports-repayment-year">
            <option value="1" ${selectedAttr(repaymentYear, '1')}>Year 1</option>
            <option value="2" ${selectedAttr(repaymentYear, '2')}>Year 2</option>
          </select>
        </div>
        ${period === 'monthly' ? `
          <div class="reports-field">
            <span class="reports-label">Repayment Month</span>
            <select id="reports-month">
              ${cycleMonths.map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(selectedMonth, value)}>${escapeHtml(labelCycleMonth(value))}</option>`).join('')}
            </select>
          </div>
        ` : ''}
        ${period === 'quarterly' ? `
          <div class="reports-field">
            <span class="reports-label">Repayment Quarter</span>
            <select id="reports-quarter">
              ${quarterLabels.map((item) => `<option value="${escapeHtml(item.value)}" ${selectedAttr(filters.quarter || '1', item.value)}>${escapeHtml(item.label)} (${item.value === '1' ? 'May-Jul' : item.value === '2' ? 'Aug-Oct' : item.value === '3' ? 'Nov-Jan' : 'Feb-Apr'})</option>`).join('')}
            </select>
          </div>
        ` : ''}
      `;

    return `
      <div class="reports-toolbar reports-filter-card">
        <div class="reports-filter-grid reports-filter-grid--realtime">
          <div class="reports-filter-group reports-search">
            <span class="reports-label">Search</span>
            <i class="fas fa-search" aria-hidden="true"></i>
            <input type="search" id="reports-search" placeholder="Search person, business, or PDO" value="${escapeHtml(filters.search)}">
          </div>
          <div class="reports-field">
            <span class="reports-label">View Type</span>
            <select id="reports-period">
              <option value="monthly" ${selectedAttr(period, 'monthly')}>Monthly</option>
              <option value="quarterly" ${selectedAttr(period, 'quarterly')}>Quarterly</option>
              <option value="yearly" ${selectedAttr(period, 'yearly')}>Yearly</option>
            </select>
          </div>
          ${periodControls}
          <div class="reports-field">
            <span class="reports-label">District</span>
            <select id="reports-district">
              <option value="" ${selectedAttr(filters.district, '')}>All districts</option>
              ${optionList(options.districts).map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(filters.district, value)}>${escapeHtml(value)}</option>`).join('')}
            </select>
          </div>
          <div class="reports-field">
            <span class="reports-label">Sector</span>
            <select id="reports-sector">
              <option value="" ${selectedAttr(filters.sector, '')}>All sectors</option>
              ${optionList(options.sectors).map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(filters.sector, value)}>${escapeHtml(value)}</option>`).join('')}
            </select>
          </div>
          <div class="reports-field">
            <span class="reports-label">Assigned PDO</span>
            <select id="reports-pdo">
              <option value="" ${selectedAttr(filters.pdo, '')}>All PDOs</option>
              ${optionList(options.pdos).map((value) => `<option value="${escapeHtml(value)}" ${selectedAttr(filters.pdo, value)}>${escapeHtml(value)}</option>`).join('')}
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
        </div>
        <div class="reports-filter-actions">
          <span class="reports-result-count" id="reports-summary-chips"></span>
          <div class="reports-toolbar__actions">
            <button class="app-btn-outline" id="reports-refresh" type="button">Refresh</button>
            <button class="app-btn-outline" id="reports-export-csv" type="button">Export CSV</button>
            <button class="app-btn-outline" id="reports-export-pdf" type="button">Export PDF</button>
          </div>
        </div>
      </div>
    `;
  };

  const buildSummaryChips = (items, metrics) => {
    const node = qs('#reports-summary-chips');
    if (!node) return;
    const label = metrics?.label || reportData?.filters?.periodLabel || 'Selected period';
    node.textContent = `${items.length} ${items.length === 1 ? 'unique person' : 'unique people'} shown - ${label}`;
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
    const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    if (!rows.length || total <= 0) {
      root.innerHTML = '<p class="reports-empty">No data available.</p>';
      return;
    }
    const slices = rows.map((row, index) => {
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

    const xAxisTitle = period === 'quarterly' ? 'Quarters' : period === 'yearly' ? 'Years' : 'Months';

    root.innerHTML = `
      <div class="reports-monthly-payment-chart" role="img" aria-label="${escapeHtml(`Repayment performance by ${xAxisTitle.toLowerCase()}`)}">
        <div class="reports-monthly-payment-chart__body">
          <div class="reports-monthly-payment-chart__axis-title">Payments</div>
          <div class="reports-monthly-payment-chart__axis">
            ${ticks.map((value) => `<span>${escapeHtml(Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</span>`).join('')}
          </div>
          <div class="reports-monthly-payment-chart__plot">
            <div class="reports-monthly-payment-chart__canvas" style="--month-count:${rows.length};">
              <div class="reports-monthly-payment-chart__guides">
                ${ticks.map(() => '<i></i>').join('')}
              </div>
              <div class="reports-monthly-payment-chart__groups">
                ${rows.map((row) => `
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
        <div class="reports-monthly-payment-chart__x-title">${escapeHtml(xAxisTitle)}</div>
      </div>
    `;
  };

  const buildPerformanceSection = (metrics) => `
    <div class="charts-grid" id="reports-performance-shell">
      <div class="chart-card chart-card--full">
        <div class="chart-card__header">
          <div>
            <h4>Repayment Performance</h4>
          </div>
        </div>
        <div class="reports-repayment-status-kpis">
          ${[
            { label: 'Target Amount', value: formatCurrency(metrics.targetAmount || 0), meta: metrics.label || 'Selected period', color: '#2563eb' },
            { label: 'Actual Collected', value: formatCurrency(metrics.actualCollectedAmount || 0), meta: `${metrics.scopedBeneficiaries || 0} scoped beneficiaries`, color: '#16a34a' },
            { label: 'Gap', value: formatCurrency(metrics.gapAmount || 0), meta: `${metrics.obligationCount || 0} repayment months covered`, color: '#dc2626' },
            { label: 'ROI', value: formatPercent(metrics.roiPercent || 0), meta: 'Actual / target x 100', color: '#7c3aed' },
          ].map((card) => `
            <article class="reports-repayment-status-kpi" style="--kpi-color:${card.color}">
              <span>${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(card.value)}</strong>
              <small>${escapeHtml(card.meta)}</small>
            </article>
          `).join('')}
        </div>
        <div class="chart-wrap reports-monthly-payment-chart-wrap" id="reports-performance-bars"></div>
      </div>
      <div class="chart-card">
        <div class="chart-card__header">
          <h4>Gender Segregation</h4>
        </div>
        <div class="chart-wrap" id="reports-gender-donut"></div>
      </div>
      <div class="chart-card">
        <div class="chart-card__header">
          <h4>Service Type Distribution</h4>
        </div>
        <div class="chart-wrap" id="reports-service-donut"></div>
      </div>
      <div class="chart-card">
        <div class="chart-card__header">
          <h4>Sector Distribution</h4>
        </div>
        <div class="chart-wrap" id="reports-sector-donut"></div>
      </div>
    </div>
  `;

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

    const items = records();
    const summary = currentSummary(items);
    const metrics = reportData?.repaymentAnalytics?.periodMetrics || reportData?.summary?.repaymentPerformance || {
      label: 'Selected period',
      targetAmount: 0,
      actualCollectedAmount: 0,
      gapAmount: 0,
      roiPercent: 0,
      scopedBeneficiaries: items.length,
      obligationCount: 0,
    };
    const repaymentPeriod = reportData?.filters?.period || state.filters.reports.period || 'monthly';
    const repaymentBreakdown = repaymentPeriod === 'monthly'
      ? (Array.isArray(reportData?.repaymentAnalytics?.monthlyBreakdown) ? reportData.repaymentAnalytics.monthlyBreakdown : [])
      : (Array.isArray(reportData?.repaymentAnalytics?.breakdown) ? reportData.repaymentAnalytics.breakdown : []);
    if (refreshToolbar) {
      renderToolbarOnly();
    }
    const performanceBody = qs('#reports-performance-body', content);
    if (!performanceBody) return;
    performanceBody.innerHTML = buildPerformanceSection(metrics);
    buildSummaryChips(items, metrics);

    renderMonthlyPaymentChart(qs('#reports-performance-bars'), repaymentBreakdown, repaymentPeriod);
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

  const exportReport = (formatType) => {
    const query = buildReportQuery();
    if (formatType === 'pdf') {
      query.set('autoprint', '1');
    }
    const target = routeUrl(`${reportExportBase()}/${formatType}`);
    window.open(query.toString() ? `${target}?${query}` : target, '_blank', 'noopener');
  };

  const bindEvents = () => {
    if (bound) return;
    bound = true;

    const section = qs('#reports-section');
    if (!section) return;

    section.addEventListener('input', (event) => {
      const id = event.target?.id || '';
      if (id === 'reports-search') {
        state.filters.reports.search = event.target.value;
        updateReportsView({ refreshToolbar: false });
      }
    });

    section.addEventListener('change', (event) => {
      const id = event.target?.id || '';
      if (!id.startsWith('reports-')) return;
      if (id === 'reports-period') {
        state.filters.reports.period = event.target.value;
        if (state.filters.reports.period === 'monthly') {
          const cycleBaseYear = String((Number.parseInt(state.filters.reports.year || currentYear, 10) || Number.parseInt(currentYear, 10)) + (String(state.filters.reports.repaymentYear || '1') === '2' ? 1 : 0));
          const cycleMonths = buildRepaymentCycleMonths(cycleBaseYear);
          state.filters.reports.month = cycleMonths.includes(state.filters.reports.month) ? state.filters.reports.month : cycleMonths[0];
        }
        if (state.filters.reports.period === 'quarterly' && !quarterLabels.some((item) => item.value === String(state.filters.reports.quarter || ''))) {
          state.filters.reports.quarter = '1';
        }
        renderToolbarOnly();
        updateReportsView();
        fetchReportData();
        return;
      }
      if (id === 'reports-year') state.filters.reports.year = event.target.value;
      else if (id === 'reports-repayment-year') state.filters.reports.repaymentYear = event.target.value;
      else if (id === 'reports-month') state.filters.reports.month = event.target.value;
      else if (id === 'reports-quarter') state.filters.reports.quarter = event.target.value;
      else if (id === 'reports-from') state.filters.reports.from = event.target.value;
      else if (id === 'reports-to') state.filters.reports.to = event.target.value;
      else if (id === 'reports-district') state.filters.reports.district = event.target.value;
      else if (id === 'reports-pdo') state.filters.reports.pdo = event.target.value;
      else if (id === 'reports-sector') state.filters.reports.sector = event.target.value;
      else if (id === 'reports-service-type') state.filters.reports.serviceType = event.target.value;
      else if (id === 'reports-gender') state.filters.reports.gender = event.target.value;
      if (id === 'reports-year' || id === 'reports-repayment-year') {
        const cycleBaseYear = String((Number.parseInt(state.filters.reports.year || currentYear, 10) || Number.parseInt(currentYear, 10)) + (String(state.filters.reports.repaymentYear || '1') === '2' ? 1 : 0));
        const cycleMonths = buildRepaymentCycleMonths(cycleBaseYear);
        if (!cycleMonths.includes(state.filters.reports.month)) {
          state.filters.reports.month = cycleMonths[0];
        }
      }
      if (id === 'reports-year' || id === 'reports-repayment-year' || id === 'reports-period') {
        renderToolbarOnly();
        updateReportsView();
      }
      fetchReportData();
    });

    section.addEventListener('click', (event) => {
      const id = event.target?.id || '';
      if (id === 'reports-refresh') {
        fetchReportData();
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

