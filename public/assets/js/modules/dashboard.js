(function () {
  window.App = window.App || {};
  window.App.modules = window.App.modules || {};

  const WORKFLOW_COLORS = {
    submitted: '#f2994a',
    under_review: '#31d0c6',
    checked_by_pdo: '#3e78ff',
    approved: '#8c61ff',
    training_scheduled: '#e07a4f',
    training_completed: '#2dbeb5',
    post_approval_compliance: '#7c8aa5',
    beneficiary_active: '#5a67d8',
  };

  const BENEFICIARY_STATUS_COLORS = {
    active: '#16a34a',
    inactive: '#f59e0b',
    deceased: '#dc2626',
  };

  const REPAYMENT_COLORS = {
    no_upload_yet: '#cfdcf0',
    under_review: '#3e78ff',
    needs_correction: '#f2994a',
    partial_paid: '#31d0c6',
    fully_paid: '#8c61ff',
  };

  const ANALYTIC_COLORS = ['#1d4ed8', '#16a34a', '#f97316', '#7c3aed', '#dc2626', '#0891b2', '#be185d', '#4d7c0f'];

  const TRAINING_COLORS = {
    scheduled: '#1d4ed8',
    attended: '#16a34a',
    excused: '#f97316',
    absent: '#dc2626',
  };

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function firstNumber(source, keys) {
    for (const key of keys) {
      if (source && Object.prototype.hasOwnProperty.call(source, key)) {
        return safeNumber(source[key]);
      }
    }
    return 0;
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function distributionCount(items, keys) {
    if (!Array.isArray(items)) return 0;
    const wanted = new Set(keys.map((key) => String(key).toLowerCase()));
    return items.reduce((total, item) => {
      const key = String(item?.key || '').toLowerCase();
      const label = String(item?.label || '').toLowerCase().replace(/\s+/g, '_');
      return wanted.has(key) || wanted.has(label) ? total + safeNumber(item?.count) : total;
    }, 0);
  }

  function normalizeKey(value) {
    return String(value || 'Unspecified').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unspecified';
  }

  function titleCase(value) {
    return String(value || 'Unspecified')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }

  function countBy(items, resolver) {
    if (!Array.isArray(items)) return [];
    const map = items.reduce((result, item) => {
      const raw = resolver(item);
      const key = normalizeKey(raw);
      const entry = result.get(key) || { key, label: titleCase(raw || key), count: 0 };
      entry.count += 1;
      result.set(key, entry);
      return result;
    }, new Map());

    return Array.from(map.values()).sort((left, right) => safeNumber(right.count) - safeNumber(left.count));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function shortLabel(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '--';
    if (words.length === 1) return words[0];
    if (words.length === 2 && words[0].length <= 8 && words[1].length <= 8) {
      return `${words[0]}\n${words[1]}`;
    }
    return words.map((word) => word.charAt(0)).join('');
  }

  function buildScale(max) {
    const safeMax = Math.max(0, Math.ceil(safeNumber(max)));
    if (safeMax <= 4) {
      const maxValue = Math.max(safeMax, 1);
      const ticks = Array.from({ length: maxValue + 1 }, (_, index) => maxValue - index);
      return { maxValue, ticks };
    }

    const targetSegments = 4;
    const roughStep = safeMax / targetSegments;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalizedStep = roughStep / magnitude;
    const stepUnit = normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;
    const step = Math.max(1, Math.ceil(stepUnit * magnitude));
    const maxValue = Math.max(step * targetSegments, Math.ceil(safeMax / step) * step, 1);
    const ticks = [];

    for (let tick = maxValue; tick >= 0; tick -= step) {
      ticks.push(tick);
    }

    if (ticks[ticks.length - 1] !== 0) {
      ticks.push(0);
    }

    return { maxValue, ticks };
  }

  function resolveColor(colors, key, index) {
    if (Array.isArray(colors)) {
      return colors[index % colors.length] || '#94a3b8';
    }
    return colors?.[key] || ANALYTIC_COLORS[index % ANALYTIC_COLORS.length] || '#94a3b8';
  }

  function renderColumnChart(chart, items, colors, ariaLabel, emptyText) {
    if (!chart) return;
    if (!items.length) {
      chart.innerHTML = `<div class="admin-v1-empty-chart">${escapeHtml(emptyText)}</div>`;
      return;
    }

    const counts = items.map((item) => safeNumber(item.count));
    const maxCount = Math.max(...counts, 1);
    const scale = buildScale(maxCount);
    const denseClass = items.length > 12 ? ' is-dense' : '';
    chart.innerHTML = `
      <div class="admin-v1-column-chart${denseClass}" style="--bar-count:${items.length};" role="img" aria-label="${escapeHtml(ariaLabel)}">
        <div class="admin-v1-column-chart__surface">
          <div class="admin-v1-column-chart__grid">
            ${scale.ticks.map((tickValue, index) => {
              const denominator = Math.max(scale.ticks.length - 1, 1);
              const position = (index / denominator) * 100;
              return `
                <span class="admin-v1-column-chart__guide" style="top:${position}%">
                  <span class="admin-v1-column-chart__tick">${tickValue}</span>
                </span>
              `;
            }).join('')}
          </div>
          <div class="admin-v1-column-chart__bars">
            ${items.map((item, index) => {
              const count = safeNumber(item.count);
              const height = Math.max((count / scale.maxValue) * 100, count > 0 ? 12 : 0);
              const color = resolveColor(colors, item.key, index);
              return `
                <article class="admin-v1-column-chart__group">
                  <div class="admin-v1-column-chart__bar-wrap">
                    <div class="admin-v1-column-chart__bar" style="height:${height}%; --bar-color:${color};" title="${escapeHtml(item.label)}: ${count}"></div>
                  </div>
                  <span class="admin-v1-column-chart__label">${escapeHtml(shortLabel(item.label))}</span>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderHorizontalChart(chart, items, colors, ariaLabel, emptyText) {
    if (!chart) return;
    const activeItems = items.filter((item) => safeNumber(item.count) > 0).slice(0, 8);
    if (!activeItems.length) {
      chart.innerHTML = `<div class="admin-v1-empty-chart">${escapeHtml(emptyText)}</div>`;
      return;
    }

    const maxCount = Math.max(...activeItems.map((item) => safeNumber(item.count)), 1);
    chart.innerHTML = `
      <div class="admin-v1-bar-chart" role="img" aria-label="${escapeHtml(ariaLabel)}">
        ${activeItems.map((item, index) => {
          const count = safeNumber(item.count);
          const width = Math.max((count / maxCount) * 100, count > 0 ? 8 : 0);
          const color = resolveColor(colors, item.key, index);
          return `
            <article class="admin-v1-bar-chart__row">
              <span>${escapeHtml(item.label)}</span>
              <div class="admin-v1-bar-chart__track">
                <i style="width:${width}%; --bar-color:${color};" title="${escapeHtml(item.label)}: ${count}"></i>
              </div>
              <strong>${count}</strong>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderKpis(data) {
    const applicationSummary = data.applicationSummary || {};
    const staffSummary = data.staffSummary || {};
    const beneficiarySummary = data.beneficiarySummary || {};
    const repaymentSummary = data.repaymentSummary || {};
    const workflowStages = Array.isArray(data.workflowDistribution?.stages) ? data.workflowDistribution.stages : [];
    const repaymentSegments = Array.isArray(data.repaymentDistribution?.segments) ? data.repaymentDistribution.segments : [];

    const applicationBreakdown = {
      draft: firstNumber(applicationSummary, ['draft', 'drafts']) || distributionCount(workflowStages, ['draft']),
      submitted: firstNumber(applicationSummary, ['submitted']) || distributionCount(workflowStages, ['submitted']),
      underReview: firstNumber(applicationSummary, ['underReview', 'under_review']) || distributionCount(workflowStages, ['under_review']),
      needsCorrection: firstNumber(applicationSummary, ['needsCorrection', 'needs_correction']) || distributionCount(workflowStages, ['needs_correction']),
      forAssessment: firstNumber(applicationSummary, ['forAssessment', 'for_assessment']) || distributionCount(workflowStages, ['for_assessment']),
      rejected: firstNumber(applicationSummary, ['rejected']) || distributionCount(workflowStages, ['rejected']),
      approvedForTraining: firstNumber(applicationSummary, ['approvedForTraining', 'approved_for_training']) || distributionCount(workflowStages, ['approved', 'approved_for_training']),
    };

    const repaymentBreakdown = {
      fullyPaid: firstNumber(repaymentSummary, ['fullyPaid', 'fully_paid', 'fullyVerified', 'fully_verified']) || distributionCount(repaymentSegments, ['fully_paid', 'fully_verified']),
      partialPaid: firstNumber(repaymentSummary, ['partialPaid', 'partial_paid', 'partialVerified', 'partial_verified']) || distributionCount(repaymentSegments, ['partial_paid', 'partial_verified']),
      underReview: firstNumber(repaymentSummary, ['underReview', 'under_review']) || distributionCount(repaymentSegments, ['under_review']),
      noUpload: firstNumber(repaymentSummary, ['noUploadYet', 'no_upload_yet']) || distributionCount(repaymentSegments, ['no_upload_yet']),
      needsCorrection: firstNumber(repaymentSummary, ['needsCorrection', 'needs_correction', 'overdueAccounts', 'overdue_accounts']) || distributionCount(repaymentSegments, ['needs_correction', 'rejected']),
    };
    const visibleStaffBreakdown = {
      socialWorker: firstNumber(staffSummary, ['socialWorker', 'socialWorkers', 'social_worker', 'social_workers']),
      pdo: firstNumber(staffSummary, ['pdo', 'projectOfficer', 'project_officer']),
    };
    const totalRepaymentAccounts = repaymentBreakdown.fullyPaid
      + repaymentBreakdown.partialPaid
      + repaymentBreakdown.underReview
      + repaymentBreakdown.needsCorrection;

    const targets = {
      adminKpiTotalApplications: safeNumber(applicationSummary.total),
      adminKpiUnderReview: applicationBreakdown.underReview,
      adminKpiActiveBeneficiaries: safeNumber(beneficiarySummary.total ?? beneficiarySummary.active),
      adminKpiPendingRepayments: totalRepaymentAccounts,
      adminKpiActiveStaff: visibleStaffBreakdown.socialWorker + visibleStaffBreakdown.pdo,
      adminKpiApplicationsDraft: applicationBreakdown.draft,
      adminKpiApplicationsSubmitted: applicationBreakdown.submitted,
      adminKpiApplicationsUnderReview: applicationBreakdown.underReview,
      adminKpiApplicationsNeedsCorrection: applicationBreakdown.needsCorrection,
      adminKpiReviewUnderReview: applicationBreakdown.underReview,
      adminKpiReviewForAssessment: applicationBreakdown.forAssessment,
      adminKpiReviewApprovedTraining: applicationBreakdown.approvedForTraining,
      adminKpiReviewRejected: applicationBreakdown.rejected,
      adminKpiBeneficiariesActive: safeNumber(beneficiarySummary.active),
      adminKpiBeneficiariesTotal: safeNumber(beneficiarySummary.total),
      adminKpiBeneficiariesPendingVerification: firstNumber(beneficiarySummary, ['pendingVerification', 'pending']) || safeNumber(repaymentSummary.pendingVerification),
      adminKpiBeneficiariesCompletedRepayment: repaymentBreakdown.fullyPaid,
      adminKpiRepaymentsFullyPaid: repaymentBreakdown.fullyPaid,
      adminKpiRepaymentsPartialPaid: repaymentBreakdown.partialPaid,
      adminKpiRepaymentsUnderReview: repaymentBreakdown.underReview,
      adminKpiRepaymentsNoUpload: repaymentBreakdown.noUpload,
      adminKpiStaffSocialWorker: visibleStaffBreakdown.socialWorker,
      adminKpiStaffPdo: visibleStaffBreakdown.pdo,
      adminKpiStaffDisabled: firstNumber(staffSummary, ['disabled']),
    };

    Object.entries(targets).forEach(([id, value]) => {
      setText(id, value);
    });

    setText('adminKpiActiveStaffMeta', `SW ${visibleStaffBreakdown.socialWorker} | PDO ${visibleStaffBreakdown.pdo}`);
  }

  function renderWorkflowDistribution(data) {
    const chart = document.getElementById('adminWorkflowDistributionChart');
    const legend = document.getElementById('adminWorkflowLegend');
    const footer = document.getElementById('adminWorkflowFooter');
    if (!chart || !legend || !footer) return;

    const distribution = data.workflowDistribution || { stages: [], total: 0 };
    const stages = Array.isArray(distribution.stages) ? distribution.stages : [];
    const total = safeNumber(distribution.total);

    if (!stages.length || total <= 0) {
      chart.innerHTML = '<div class="admin-v1-empty-chart">No workflow records yet.</div>';
      legend.innerHTML = '';
      footer.textContent = 'No workflow records yet.';
      return;
    }

    const largest = stages.slice().sort((left, right) => safeNumber(right.count) - safeNumber(left.count))[0];
    const activeStages = stages.filter((stage) => safeNumber(stage.count) > 0);
    const zeroStages = stages.filter((stage) => safeNumber(stage.count) <= 0);

    renderColumnChart(chart, stages, WORKFLOW_COLORS, 'Column chart of workflow status distribution', 'No workflow records yet.');

    legend.innerHTML = activeStages.map((stage) => `
      <span class="admin-v1-legend__item">
        <span class="admin-v1-legend__dot admin-v1-legend__dot--${escapeHtml(stage.key)}" style="background:${WORKFLOW_COLORS[stage.key] || '#94a3b8'};"></span>
        <span>${escapeHtml(stage.label)}</span>
        <strong>${safeNumber(stage.count)}</strong>
        <small>${total > 0 ? Math.round((safeNumber(stage.count) / total) * 100) : 0}%</small>
      </span>
    `).join('') + (zeroStages.length ? `
      <span class="admin-v1-legend__summary">${zeroStages.length} stage${zeroStages.length === 1 ? '' : 's'} currently at 0.</span>
    ` : '');

    footer.textContent = largest
      ? `${largest.label}: ${safeNumber(largest.count)} of ${total}.`
      : 'No workflow records yet.';
  }

  function renderBeneficiaryStatusDistribution(data) {
    const chart = document.getElementById('adminBeneficiaryStatusChart');
    const legend = document.getElementById('adminBeneficiaryStatusLegend');
    const footer = document.getElementById('adminBeneficiaryStatusFooter');
    if (!chart || !legend || !footer) return;

    const distribution = data.beneficiaryStatusDistribution || { segments: [], total: 0 };
    const segments = Array.isArray(distribution.segments) ? distribution.segments : [];
    const total = safeNumber(distribution.total);

    if (!segments.length || total <= 0) {
      chart.innerHTML = '<div class="admin-v1-empty-chart">No beneficiary records yet.</div>';
      legend.innerHTML = '';
      footer.textContent = 'No beneficiary records yet.';
      return;
    }

    renderColumnChart(chart, segments, BENEFICIARY_STATUS_COLORS, 'Column chart of beneficiary status distribution', 'No beneficiary records yet.');
    legend.innerHTML = segments.map((segment) => `
      <span class="admin-v1-legend__item">
        <span class="admin-v1-legend__dot" style="background:${BENEFICIARY_STATUS_COLORS[segment.key] || '#94a3b8'};"></span>
        <span>${escapeHtml(segment.label)}</span>
        <strong>${safeNumber(segment.count)}</strong>
        <small>${total > 0 ? Math.round((safeNumber(segment.count) / total) * 100) : 0}%</small>
      </span>
    `).join('');
    footer.textContent = `${safeNumber(data.beneficiarySummary?.total ?? data.beneficiarySummary?.active ?? 0)} beneficiaries tracked.`;
  }

  function renderRepaymentDistribution(data) {
    const chart = document.getElementById('adminRepaymentDistributionChart');
    const legend = document.getElementById('adminRepaymentLegend');
    const footer = document.getElementById('adminRepaymentFooter');
    if (!chart || !legend || !footer) return;

    const distribution = data.repaymentDistribution || { segments: [], total: 0 };
    const segments = Array.isArray(distribution.segments) ? distribution.segments : [];
    const total = safeNumber(distribution.total);

    if (!segments.length || total <= 0) {
      chart.innerHTML = '<div class="admin-v1-empty-chart">No repayment records yet.</div>';
      legend.innerHTML = '';
      footer.textContent = 'No repayment records yet.';
      return;
    }

    renderColumnChart(chart, segments, REPAYMENT_COLORS, 'Column chart of repayment status distribution', 'No repayment records yet.');

    const largest = segments.slice().sort((left, right) => safeNumber(right.count) - safeNumber(left.count))[0];
    const zeroSegments = segments.filter((segment) => safeNumber(segment.count) <= 0);
    const percentage = largest && total > 0 ? Math.round((safeNumber(largest.count) / total) * 100) : 0;

    legend.innerHTML = segments.map((segment) => `
      <span class="admin-v1-legend__item">
        <span class="admin-v1-legend__dot" style="background:${REPAYMENT_COLORS[segment.key] || '#94a3b8'};"></span>
        <span>${escapeHtml(segment.label)}</span>
        <strong>${safeNumber(segment.count)}</strong>
        <small>${total > 0 ? Math.round((safeNumber(segment.count) / total) * 100) : 0}%</small>
      </span>
    `).join('') + (zeroSegments.length ? `
      <span class="admin-v1-legend__summary">${zeroSegments.length} segment${zeroSegments.length === 1 ? '' : 's'} currently at 0.</span>
    ` : '');

    footer.textContent = largest
      ? `${largest.label}: ${safeNumber(largest.count)} records, ${percentage}%.`
      : 'No repayment records yet.';
  }

  function render(data = window.SMARTLEAP_ADMIN_OVERVIEW || {}) {
    renderKpis(data);
    renderBeneficiaryStatusDistribution(data);
    renderWorkflowDistribution(data);
    renderRepaymentDistribution(data);
  }

  function init() {}

  window.App.modules.dashboard = { init, render };
})();
