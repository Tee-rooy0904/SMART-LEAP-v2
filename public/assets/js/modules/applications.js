/*
 * SMART LEAP FILE GUIDE
 * Shared applications module for reviewer dashboards.
 * Builds application KPIs, filters, lists, and the detailed application modal used in admin and social worker applicant-review sections.
 */
(function () {
  const { qs, on, setHTML } = window.App.dom;
  const { formatDate } = window.App.format;

  const state = {
    filters: { status: '', barangayId: '', assignedPdoId: '', livelihoodCategory: '', search: '' },
    data: { applications: [], summary: {}, barangays: [], assignedPdos: [] },
    activeApplication: null,
    activePreviewToken: '',
    activePreviewOwnerId: null,
    assistanceReceivedSelection: false,
  };
  const livelihoodCategories = ['Establishment', 'Buy and Sell', 'Homemade', 'Livestock', 'Services'];

  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');

  const routeUrl = (path) => `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;

  const formatBatchNo = (value) => {
    const text = String(value || '').trim();
    if (!text) return 'Batch 1';
    return /^\d+$/.test(text) ? `Batch ${text}` : text;
  };

  const parseJson = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        message: response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unexpected server response.',
      };
    }
    return response.json();
  };

  const apiGet = async (path, params = {}) => {
    const query = new URLSearchParams(params);
    const url = query.toString() ? `${routeUrl(path)}?${query}` : routeUrl(path);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  };

  const apiPost = async (path, payload) => {
    const body = new URLSearchParams();
    Object.entries(payload || {}).forEach(([key, value]) => body.append(key, value ?? ''));
    try {
      const response = await fetch(routeUrl(path), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        credentials: 'same-origin',
        body: body.toString(),
      });
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  };

  const apiJsonPost = async (path, payload) => {
    try {
      const response = await fetch(routeUrl(path), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json;charset=UTF-8',
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload || {}),
      });
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  };

  const apiFormPost = async (path, formData) => {
    try {
      const response = await fetch(routeUrl(path), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        body: formData,
      });
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  };

  const section = () => qs('#applications-section');

  const renderShell = () => {
    const target = section();
    if (!target) return;
    setHTML(target, `
      <div class="po-section-shell applications-review-shell">
        <section class="po-section-board">
          <div id="applications-kpis"></div>
          <div id="applications-filters"></div>
          <div id="applications-table"></div>
        </section>
        <div class="notice" id="applications-notice" hidden></div>
      </div>
    `);
  };

  const renderSummary = () => {
    const summary = state.data.summary || {};
    const root = qs('#applications-kpis');
    if (!root) return;
    setHTML(root, `
      <section class="po-application-toolbar po-application-toolbar--admin">
        <div class="po-application-toolbar__summary">
          <article class="po-snapshot-card po-application-stat">
            <div class="po-snapshot-card__eyebrow">In Progress</div>
            <div class="po-snapshot-card__body">
              <strong>${summary.inProgress || 0}</strong>
              <span>Still preparing submissions and requirements</span>
            </div>
          </article>
          <article class="po-snapshot-card po-application-stat">
            <div class="po-snapshot-card__eyebrow">Ready for Review</div>
            <div class="po-snapshot-card__body">
              <strong>${summary.readyForReview || 0}</strong>
              <span>Ready for review and assessment movement</span>
            </div>
          </article>
          <article class="po-snapshot-card po-application-stat">
            <div class="po-snapshot-card__eyebrow">Approved</div>
            <div class="po-snapshot-card__body">
              <strong>${summary.approved || 0}</strong>
              <span>Approved and moved forward in the pipeline</span>
            </div>
          </article>
          <article class="po-snapshot-card po-application-stat">
            <div class="po-snapshot-card__eyebrow">Needs Correction</div>
            <div class="po-snapshot-card__body">
              <strong>${summary.needsCorrection || 0}</strong>
              <span>Cases still waiting on applicant updates</span>
            </div>
          </article>
        </div>
      </section>
    `);
  };

  const renderFilters = () => {
    const root = qs('#applications-filters');
    if (!root) return;

    const statuses = ['', 'Submitted', 'Under Review', 'Requirements Verified', 'For Assessment', 'Approved for Training', 'Rejected', 'Needs Documents', 'Needs Correction'];
    setHTML(root, `
      <section class="po-application-toolbar po-application-toolbar--admin">
        <div class="po-application-toolbar__controls po-application-toolbar__controls--admin">
          <label class="po-filter-field po-filter-field--search" for="applications-search">
            <span>Search</span>
            <input id="applications-search" class="section-filter" type="search" placeholder="Search applicant, barangay, business, or email" value="${escapeHtml(state.filters.search)}">
          </label>
          <label class="po-filter-field" for="applications-status">
            <span>Status Filter</span>
            <select id="applications-status" class="section-filter">
              ${statuses.map((status) => `<option value="${status}" ${state.filters.status === status ? 'selected' : ''}>${status || 'All statuses'}</option>`).join('')}
            </select>
          </label>
          <label class="po-filter-field" for="applications-livelihood-category">
            <span>Livelihood Category</span>
            <select id="applications-livelihood-category" class="section-filter">
              <option value="">All categories</option>
              ${livelihoodCategories.map((category) => `<option value="${category}" ${state.filters.livelihoodCategory === category ? 'selected' : ''}>${category}</option>`).join('')}
            </select>
          </label>
          <label class="po-filter-field" for="applications-barangay">
            <span>Barangay</span>
            <select id="applications-barangay" class="section-filter">
              <option value="">All barangays</option>
              ${(state.data.barangays || []).map((barangay) => `<option value="${barangay.id}" ${String(state.filters.barangayId) === String(barangay.id) ? 'selected' : ''}>${barangay.name}</option>`).join('')}
            </select>
          </label>
          <label class="po-filter-field" for="applications-assigned-pdo">
            <span>Assigned PDO</span>
            <select id="applications-assigned-pdo" class="section-filter">
              <option value="">All PDOs</option>
              ${(state.data.assignedPdos || []).map((pdo) => `<option value="${pdo.id}" ${String(state.filters.assignedPdoId) === String(pdo.id) ? 'selected' : ''}>${pdo.name}</option>`).join('')}
            </select>
          </label>
          <div class="applications-toolbar__actions">
            <button class="app-btn-ghost" id="applications-reset">Reset</button>
          </div>
        </div>
      </section>
    `);
  };

  const renderTable = () => {
    const root = qs('#applications-table');
    if (!root) return;
    const rows = (state.data.applications || []).map((application) => `
      <tr>
        <td>
          <div class="po-application-identity">
            <div class="table-primary">${escapeHtml(application.applicantName)}</div>
            <div class="table-secondary">${escapeHtml(application.businessName || 'No business name recorded')}</div>
            <div class="table-tertiary">${escapeHtml(application.email || application.contactNumber || '--')}</div>
          </div>
        </td>
        <td>
          <div class="po-location-cell">
            <strong>${escapeHtml(application.barangay || '--')}</strong>
            <span>${escapeHtml(application.contactNumber || 'No contact number')}</span>
          </div>
        </td>
        <td><span class="po-batch-pill">${escapeHtml(formatBatchNo(application.batchNo))}</span></td>
        <td>
          <div class="po-progress-cell">
            <strong>${application.verifiedRequirementCount || application.uploadedRequirementCount || 0} / ${application.requiredRequirementCount || 0}</strong>
            <span>verified of required requirements</span>
          </div>
        </td>
        <td><span class="po-status-pill po-status-pill--workflow ${statusClass(application.status)}">${escapeHtml(application.status || '--')}</span></td>
        <td><span class="po-status-pill po-status-pill--readiness ${readinessBadgeClass(application.status)}">${escapeHtml(readinessLabel(application.status))}</span></td>
        <td>
          <div class="po-location-cell po-location-cell--pdo">
            <strong>${escapeHtml(application.assignedPdoName || '--')}</strong>
            <span>${escapeHtml(application.assignedPdoEmail || application.assignedPdoUsername || 'Review owner')}</span>
          </div>
        </td>
        <td>
          <div class="po-date-cell">
            <strong>${formatDate(application.submittedAt)}</strong>
            <span>submission date</span>
          </div>
        </td>
        <td class="actions">
          <button class="action-button action-button--review" data-open-application="${application.id}">
            <i class="fas fa-folder-open"></i>
            <span>Open Review</span>
          </button>
        </td>
      </tr>
    `).join('');

    const total = (state.data.applications || []).length;
    const caption = state.filters.status ? `${state.filters.status} queue` : 'Queue review list';
    setHTML(root, `
      <div class="data-table-card applications-table-shell">
        <header class="data-table-card__header">
          <h3>Application review queue</h3>
          <span class="chip">${total} ${total === 1 ? 'application' : 'applications'} | ${escapeHtml(caption)}</span>
        </header>
        <div class="table-wrapper">
          <table class="data-table applications-table applications-table--modern">
            <colgroup>
              <col class="applications-table__col--applicant">
              <col class="applications-table__col--barangay">
              <col class="applications-table__col--batch">
              <col class="applications-table__col--requirements">
              <col class="applications-table__col--status">
              <col class="applications-table__col--readiness">
              <col class="applications-table__col--pdo">
              <col class="applications-table__col--submitted">
              <col class="applications-table__col--actions">
            </colgroup>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Barangay</th>
                <th>Batch</th>
                <th>Uploads</th>
                <th>Application Status</th>
                <th>Readiness</th>
                <th>Assigned PDO</th>
                <th>Submitted</th>
                <th class="actions">Actions</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="9" class="text-center text-muted">No applications found.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `);
  };

  const renderModal = (application) => {
    const root = qs('#modal-root');
    if (!root || !application) return;
    state.assistanceReceivedSelection = String(application.status || '').toLowerCase() === 'completed';
    setHTML(root, buildModalMarkup(application));
    ensureActivePreview(application);
    renderRequirementNavigator();
    renderPreviewPanel();
    renderRequirementInspector();
    renderAssistanceStatus(application);
    updateApprovalDecisionState(application);
  };

  const finalApprovalState = (application = state.activeApplication) => {
    const readiness = application?.approvalReadiness || {};
    const assistance = application?.assistanceStatus || null;
    const assistanceToggle = qs('#admin-app-modal-assisted');
    const alreadyApproved = !!assistance?.isApprovedBeneficiary || String(application?.status || '').toLowerCase() === 'completed';
    const assistanceConfirmed = alreadyApproved || !!state.assistanceReceivedSelection || !!assistanceToggle?.checked;

    if (alreadyApproved) {
      return {
        enabled: false,
        title: 'Applicant is already an approved beneficiary.',
        statusTitle: 'Already approved beneficiary.',
        statusCopy: 'Assistance has already been recorded for this applicant.',
      };
    }

    if (!readiness.canApprove) {
      return {
        enabled: false,
        title: ((readiness.blockers || []).slice(0, 2).join(' | ')) || 'Resolve the blocking reasons before approval.',
        statusTitle: 'Approval is currently blocked.',
        statusCopy: ((readiness.blockers || []).slice(0, 2).join(' | ')) || 'Resolve any blocking requirement or training issue before approval.',
      };
    }

    if (!assistanceConfirmed) {
      return {
        enabled: false,
        title: 'Confirm "Already received assistance" before final approval.',
        statusTitle: 'Assistance confirmation required.',
        statusCopy: 'All requirements are cleared. Confirm that assistance was already released before final approval.',
      };
    }

    return {
      enabled: true,
      title: 'Approve this applicant and record assistance release.',
      statusTitle: 'Application is ready for final approval.',
      statusCopy: 'All uploads, training forms, assistance proof, training conditions, and assistance confirmation are satisfied.',
    };
  };

  const updateApprovalDecisionState = (application = state.activeApplication) => {
    const finalApproval = finalApprovalState(application);
    const title = qs('#admin-app-decision-title');
    const copy = qs('#admin-app-decision-copy');
    const approveButton = qs('#admin-app-modal-approve');
    if (title) title.textContent = finalApproval.statusTitle;
    if (copy) copy.textContent = finalApproval.statusCopy;
    if (approveButton) {
      approveButton.disabled = !finalApproval.enabled;
      approveButton.title = finalApproval.title;
    }
  };

  const buildModalMarkup = (application) => {
    const readiness = application.approvalReadiness || {};
    const finalApproval = finalApprovalState(application);
    const uploadSummary = readiness.uploadSummary || { approved: 0, total: 0 };
    const formSummary = readiness.formSummary || { approved: 0, total: 0 };
    const trainingStatus = readiness.trainingStatus || {};
    const blockers = (readiness.blockers || []).length
      ? readiness.blockers.map((item) => `<li class="po-blocker-item"><span class="po-blocker-item__icon" aria-hidden="true">!</span><span>${escapeHtml(item)}</span></li>`).join('')
      : '<li class="po-blocker-item po-blocker-item--clear"><span class="po-blocker-item__icon" aria-hidden="true">OK</span><span>Ready for approval action. No blocking reasons recorded.</span></li>';

    return `
      <div class="modal-overlay application-review-modal" data-app-modal>
        <div class="modal-card application-review-modal__card po-review-modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div class="po-modal-title-block">
              <span class="po-panel-label po-modal-eyebrow">Application Case</span>
              <h3 class="modal-title">Application Review</h3>
              <small class="po-modal-subtitle">Submitted on <span>${formatDate(application.submittedAt)}</span></small>
            </div>
            <div class="po-modal-header-actions">
              <span class="po-status-chip po-status-chip--header ${statusClass(application.status)}">${escapeHtml(application.status || '--')}</span>
              <button class="modal-close" type="button" data-close-modal aria-label="Close">&times;</button>
            </div>
          </div>
          <div class="modal-body">
            <section class="po-case-identity">
              <article class="po-case-identity__block">
                <span class="po-panel-label">Applicant</span>
                <strong>${escapeHtml(application.applicantName || '--')}</strong>
                <div class="po-case-identity__row"><span>Business</span><strong>${escapeHtml(application.businessName || '--')}</strong></div>
                <div class="po-case-identity__row"><span>Barangay</span><strong>${escapeHtml(application.barangay || '--')}</strong></div>
              </article>
              <article class="po-case-identity__block">
                <span class="po-panel-label">Case Details</span>
                <div class="po-case-identity__row"><span>Contact</span><strong>${escapeHtml(application.contactNumber || application.email || '--')}</strong></div>
                <div class="po-case-identity__row"><span>Batch No</span><strong>${escapeHtml(formatBatchNo(application.batchNo))}</strong></div>
                <div class="po-case-identity__row">
                  <span>General category</span>
                  <select id="admin-app-modal-livelihood-category-input" class="section-filter">
                    <option value="">Select category</option>
                    <option value="Establishment" ${application.livelihoodCategory === 'Establishment' ? 'selected' : ''}>Establishment</option>
                    <option value="Buy and Sell" ${application.livelihoodCategory === 'Buy and Sell' ? 'selected' : ''}>Buy and Sell</option>
                    <option value="Homemade" ${application.livelihoodCategory === 'Homemade' ? 'selected' : ''}>Homemade</option>
                    <option value="Livestock" ${application.livelihoodCategory === 'Livestock' ? 'selected' : ''}>Livestock</option>
                    <option value="Services" ${application.livelihoodCategory === 'Services' ? 'selected' : ''}>Services</option>
                  </select>
                </div>
                <div class="po-case-identity__row"><span>Specific business type</span><strong>${escapeHtml(application.livelihood || '--')}</strong></div>
                <div class="po-case-identity__row"><span>Sector</span><strong>${escapeHtml(application.sector || '--')}</strong></div>
                <div class="po-case-identity__row"><span>Other sector</span><strong>${escapeHtml(application.sectorOtherSpecify || '--')}</strong></div>
              </article>
            </section>
            <section class="po-readiness-panel">
              <div class="po-readiness-panel__header">
                <div>
                  <span class="po-panel-label">Readiness Summary</span>
                  <h6>${escapeHtml(readiness.overallStatus || 'Under Review')}</h6>
                </div>
                <span class="po-status-chip ${trainingStatus.completed ? 'is-success' : 'is-warning'}">${trainingStatus.completed ? 'Training Completed' : 'Training Pending'}</span>
              </div>
              <div class="po-readiness-grid">
                <article class="po-readiness-card"><span>Upload Requirements</span><strong>${uploadSummary.approved || 0} / ${uploadSummary.total || 0}</strong></article>
                <article class="po-readiness-card"><span>Fill-up Form Requirements</span><strong>${formSummary.approved || 0} / ${formSummary.total || 0}</strong></article>
                <article class="po-readiness-card"><span>Training Status</span><strong>${escapeHtml(trainingStatus.displayStatus || trainingStatus.status || '--')}</strong></article>
              </div>
              <div class="po-blocker-box">
                <span class="po-panel-label">Blocking Reasons</span>
                <ul class="po-blocker-list">${blockers}</ul>
              </div>
            </section>
            <section class="po-review-workspace">
              <article class="po-requirement-nav">
                <div class="po-review-section__header">
                  <div>
                    <span class="po-panel-label">Requirement Navigator</span>
                    <h6>All Requirements</h6>
                  </div>
                  <span class="po-status-chip is-muted">${formatRequirementCount([...(application.requirements || []), ...(application.formRequirements || [])])}</span>
                </div>
                <div id="admin-requirement-nav" class="po-requirement-nav__list"></div>
              </article>
              <article class="po-preview-panel">
                <div class="po-review-section__header">
                  <div>
                    <span class="po-panel-label">Requirement Viewer</span>
                    <h6 id="admin-preview-title">Select a requirement</h6>
                  </div>
                  <span class="po-status-chip is-muted" id="admin-preview-chip">No preview</span>
                </div>
                <div id="admin-app-preview" class="po-preview-surface"></div>
              </article>
              <article class="po-review-inspector">
                <div class="po-review-section__header">
                  <div>
                    <span class="po-panel-label">Requirement Details</span>
                    <h6 id="admin-inspector-title">Select a requirement</h6>
                  </div>
                  <span class="po-status-chip is-muted" id="admin-inspector-chip">No selection</span>
                </div>
                <div id="admin-review-inspector" class="po-review-inspector__body"></div>
              </article>
            </section>
            <section class="po-readiness-panel">
              <div class="po-review-section__header">
                <div>
                  <span class="po-panel-label">Status History</span>
                  <h6>Application Timeline</h6>
                </div>
              </div>
              <ul class="profile-checklist profile-checklist--timeline">
                ${(application.history || []).map((entry) => `<li><div><strong>${escapeHtml(entry.toStatus)}</strong><div>${escapeHtml(entry.actorName)} • ${formatDate(entry.createdAt)}</div></div><span>${escapeHtml(entry.remarks || '--')}</span></li>`).join('') || '<li>No status history yet.</li>'}
              </ul>
            </section>
            <section class="po-decision-panel">
              <label class="po-toggle-field" for="admin-app-modal-assisted">
                <input type="checkbox" id="admin-app-modal-assisted" ${String(application.status || '').toLowerCase() === 'completed' ? 'checked' : ''}>
                <span>
                  <strong>Already received assistance</strong>
                  <small>Tag this applicant as already assisted so the case moves directly to the beneficiary record.</small>
                </span>
              </label>
              <article class="po-assisted-status-box" id="admin-app-assisted-status" hidden>
                <strong id="admin-app-assisted-status-title">Already an approved beneficiary</strong>
                <small id="admin-app-assisted-status-copy">Assistance approval details will appear here.</small>
                <button type="button" class="btn btn-sm btn-outline-primary" id="admin-app-assisted-record" hidden>Record Assistance Received Now</button>
              </article>
            </section>
          </div>
          <div class="modal-footer">
            <div class="po-decision-rail">
              <div class="po-decision-rail__summary">
                <span class="po-panel-label">Decision Control</span>
                <strong id="admin-app-decision-title">${escapeHtml(finalApproval.statusTitle)}</strong>
                <small id="admin-app-decision-copy">${escapeHtml(finalApproval.statusCopy)}</small>
              </div>
              <div class="po-decision-rail__actions">
                <button type="button" class="btn btn-outline-secondary" data-close-modal>Close</button>
                <button type="button" class="btn btn-danger" data-review-action="reject">Reject</button>
                <button type="button" class="btn btn-success" id="admin-app-modal-approve" data-review-action="approve" ${finalApproval.enabled ? '' : 'disabled'} title="${escapeAttribute(finalApproval.title)}">Approve</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  const formatRequirementCount = (items) => {
    const total = items.length || 0;
    return `${total} ${total === 1 ? 'item' : 'items'}`;
  };

  const ensureActivePreview = (application) => {
    const appId = Number(application?.id || 0) || null;
    if (state.activePreviewOwnerId !== appId) {
      state.activePreviewToken = '';
      state.activePreviewOwnerId = appId;
    }
    if (resolvePreviewItem(state.activePreviewToken, application)) return;
    const firstUpload = (application.requirements || []).find((item) => item.file?.url);
    if (firstUpload) {
      state.activePreviewToken = `upload:${String(firstUpload.key)}`;
      return;
    }
    const firstForm = (application.formRequirements || []).find((item) => formReviewUrl(item, true));
    state.activePreviewToken = firstForm ? `form:${String(firstForm.id)}` : '';
  };

  const resolvePreviewItem = (token, application = state.activeApplication) => {
    if (!token || !application) return null;
    const [kind, rawId] = String(token).split(':');
    if (kind === 'upload') {
      const item = (application.requirements || []).find((entry) => String(entry.key) === rawId);
      return item ? { kind, item } : null;
    }
    if (kind === 'form') {
      const item = (application.formRequirements || []).find((entry) => String(entry.id) === rawId);
      return item ? { kind, item } : null;
    }
    return null;
  };

  const requirementStatusLabel = (status) => {
    const value = String(status || '').toLowerCase();
    if (['verified', 'approved'].includes(value)) return 'Approved';
    if (['rejected', 'needs correction'].includes(value)) return 'Rejected';
    if (['submitted', 'pending', 'unlocked', 'in progress'].includes(value)) return 'Pending';
    return value === 'missing' ? 'Missing' : (status || 'Pending');
  };

  const requirementStatusClass = (status) => {
    const value = requirementStatusLabel(status).toLowerCase();
    if (value === 'approved') return 'is-success';
    if (value === 'rejected' || value === 'missing') return 'is-danger';
    if (value === 'pending') return 'is-warning';
    return 'is-muted';
  };

  const requirementSubmissionLabel = (kind, item) => {
    if (kind === 'upload') return item.file?.url ? 'Submitted' : 'Missing';
    return ['submitted', 'verified', 'rejected', 'needs correction'].includes(String(item.status || '').toLowerCase()) ? 'Submitted' : 'Missing';
  };

  const requirementSubmissionClass = (kind, item) => requirementSubmissionLabel(kind, item) === 'Submitted' ? 'is-info' : 'is-danger';

  const getReviewItems = (application = state.activeApplication) => {
    if (!application) return [];
    return [
      ...(application.requirements || []).map((item) => ({ token: `upload:${String(item.key)}`, kind: 'upload', item })),
      ...(application.formRequirements || []).map((item) => ({ token: `form:${String(item.id)}`, kind: 'form', item })),
    ];
  };

  const renderRequirementNavigator = () => {
    const root = qs('#admin-requirement-nav');
    if (!root) return;
    const items = getReviewItems();
    if (!items.length) {
      setHTML(root, '<div class="po-preview-empty">No requirements loaded.</div>');
      return;
    }
    setHTML(root, items.map(({ token, kind, item }) => {
      const selected = state.activePreviewToken === token;
      const itemKey = String(kind === 'upload' ? item.key : item.id);
      const formUploadKey = String(kind === 'form' ? item.key || item.id : itemKey);
      const uploadedFormFile = kind === 'form' ? formRequirementFile(item) : null;
      const uploadControl = kind === 'form'
        ? `<div class="po-requirement-card__actions"><input class="po-review-upload-input" id="admin-form-upload-${escapeAttribute(formUploadKey)}" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" data-form-upload-input="${escapeAttribute(formUploadKey)}" hidden><button type="button" class="action-button action-button--quiet po-requirement-card__upload" data-trigger-form-upload="${escapeAttribute(formUploadKey)}">${uploadedFormFile?.url ? 'Replace uploaded file' : 'Upload file'}</button></div>`
        : '';
      return `<article class="po-requirement-card ${selected ? 'is-active' : ''}"><button type="button" class="po-requirement-card__select" data-select-requirement="${escapeAttribute(token)}"><div class="po-requirement-card__top"><strong>${escapeHtml(item.label || '--')}</strong><span class="po-status-pill ${requirementStatusClass(item.status)}">${escapeHtml(requirementStatusLabel(item.status))}</span></div><div class="po-requirement-card__meta"><span>${escapeHtml(item.typeLabel || '--')}</span><span class="po-status-pill ${requirementSubmissionClass(kind, item)}">${escapeHtml(requirementSubmissionLabel(kind, item))}</span></div></button>${uploadControl}</article>`;
    }).join(''));
  };

  const renderPreviewPanel = () => {
    const root = qs('#admin-app-preview');
    if (!root) return;
    const preview = resolvePreviewItem(state.activePreviewToken);
    const title = qs('#admin-preview-title');
    const chip = qs('#admin-preview-chip');
    if (!preview) {
      if (title) title.textContent = 'Select a requirement';
      if (chip) chip.textContent = 'No preview';
      setHTML(root, '<div class="po-preview-empty">Select an uploaded requirement or fill-up form to review it here.</div>');
      return;
    }

    const item = preview.item;
    if (title) title.textContent = preview.kind === 'upload' ? (item.file?.name || item.label || '--') : (item.label || '--');
    if (chip) chip.textContent = preview.kind === 'upload' ? 'Upload Requirement' : 'Fill-up Form Requirement';

    if (preview.kind === 'upload') {
      const url = item.file?.url || '';
      const mime = String(item.file?.type || '').toLowerCase();
      if (!url) {
        setHTML(root, '<div class="po-preview-empty">No file was submitted for this requirement.</div>');
        return;
      }
      if (mime.startsWith('image/')) {
        setHTML(root, `<div class="po-preview-frame po-preview-frame--image"><img src="${escapeHtml(url)}" alt="${escapeHtml(item.label || 'Requirement preview')}"></div>`);
        return;
      }
      if (mime.includes('pdf') || mime.startsWith('text/')) {
        setHTML(root, `<div class="po-preview-frame"><iframe src="${escapeHtml(url)}" title="${escapeHtml(item.label || 'Requirement preview')}"></iframe></div>`);
        return;
      }
      setHTML(root, `<div class="po-preview-file-card"><strong>${escapeHtml(item.file?.name || item.label || 'Requirement file')}</strong><span>${escapeHtml(item.file?.type || 'File preview is not available in-panel.')}</span><a class="action-button" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open file</a></div>`);
      return;
    }

    const uploadedFormFile = formRequirementFile(item);
    const reviewUrl = formReviewUrl(item, false);
    setHTML(root, `
      <div class="po-preview-file-card">
        <strong>${escapeHtml(item.label || 'Fill-up form')}</strong>
        <span>Review the requirement status here, or open the applicant-filled form separately for full paper-form checking.</span>
        <a class="action-button" href="${escapeHtml(reviewUrl)}" data-open-form-review="${escapeHtml(reviewUrl)}">View / Check form</a>
        ${uploadedFormFile?.url ? `<a class="action-button action-button--quiet" href="${escapeHtml(uploadedFormFile.url)}" target="_blank" rel="noopener">Open uploaded copy</a>` : ''}
      </div>
    `);
  };

  const renderRequirementInspector = () => {
    const root = qs('#admin-review-inspector');
    const title = qs('#admin-inspector-title');
    const chip = qs('#admin-inspector-chip');
    if (!root) return;
    const preview = resolvePreviewItem(state.activePreviewToken);
    if (!preview) {
      if (title) title.textContent = 'Select a requirement';
      if (chip) chip.textContent = 'No selection';
      setHTML(root, '<div class="po-preview-empty">Select a requirement from the navigator to review it.</div>');
      return;
    }

    const { kind, item } = preview;
    const itemKey = String(kind === 'upload' ? item.key : item.id);
    const statusLabel = requirementStatusLabel(item.status);
    const uploadedFormFile = kind === 'form' ? formRequirementFile(item) : null;
    const formSubmittedOnline = kind === 'form' && requirementSubmissionLabel(kind, item) === 'Submitted';
    if (title) title.textContent = item.label || 'Requirement';
    if (chip) chip.textContent = item.typeLabel || '--';
    const canReviewUpload = kind === 'upload' && !!item.file?.url;
    const isFinalAssistanceProof = kind === 'form' && String(item.type || '') === 'final_assistance_proof';
    const canReviewForm = kind === 'form' && (item.canReview !== false) && (requirementSubmissionLabel(kind, item) === 'Submitted');
    const canReviewItem = canReviewUpload || canReviewForm;
    const reviewActions = canReviewItem
      ? `<div class="po-inspector-actions">
          <button type="button" class="action-button action-button--success" data-review-item="${escapeAttribute(kind)}:${escapeAttribute(itemKey)}:approve">Approve</button>
          <button type="button" class="action-button action-button--warning" data-review-item="${escapeAttribute(kind)}:${escapeAttribute(itemKey)}:needs_correction">Needs Correction</button>
        </div>`
      : '';
    const reviewNote = canReviewItem
      ? ''
      : `<div class="po-inspector-note">${
        kind === 'upload'
          ? 'This requirement cannot be reviewed until a file is uploaded.'
          : (isFinalAssistanceProof
            ? 'This final proof cannot be reviewed until the applicant uploads and submits it.'
            : 'This form requirement cannot be reviewed until the applicant submits it or staff uploads a checked copy.')
      }</div>`;
    setHTML(root, `<div class="po-inspector-summary"><div class="po-inspector-summary__row"><span>Submission State</span><strong><span class="po-status-pill ${requirementSubmissionClass(kind, item)}">${escapeHtml(requirementSubmissionLabel(kind, item))}</span></strong></div><div class="po-inspector-summary__row"><span>Requirement Status</span><strong><span class="po-status-pill ${requirementStatusClass(item.status)}">${escapeHtml(statusLabel)}</span></strong></div></div>${kind === 'form' ? `<div class="po-inspector-summary"><div class="po-inspector-summary__row"><span>${escapeHtml(isFinalAssistanceProof ? 'Final proof' : 'Online form')}</span><strong>${escapeHtml(formSubmittedOnline ? 'Submitted by applicant' : 'Not submitted yet')}</strong></div><div class="po-inspector-summary__row"><span>${escapeHtml(isFinalAssistanceProof ? 'Uploaded proof' : 'Optional uploaded copy')}</span><strong>${escapeHtml(uploadedFormFile?.name || 'No file uploaded')}</strong></div><div class="po-inspector-summary__row"><span>Submitted / uploaded</span><strong>${uploadedFormFile?.uploadedAt ? escapeHtml(formatDate(uploadedFormFile.uploadedAt)) : '--'}</strong></div></div><div class="po-inspector-actions"><a class="action-button" href="${escapeHtml(formReviewUrl(item, false))}" data-open-form-review="${escapeHtml(formReviewUrl(item, false))}">View / Check form</a></div>` : ''}${reviewActions}${reviewNote}`);
  };

  const renderAssistanceStatus = (application = state.activeApplication) => {
    const root = qs('#admin-app-assisted-status');
    const title = qs('#admin-app-assisted-status-title');
    const copy = qs('#admin-app-assisted-status-copy');
    const recordButton = qs('#admin-app-assisted-record');
    const assistanceToggle = qs('#admin-app-modal-assisted');
    if (!root || !title || !copy) return;

    const assistance = application?.assistanceStatus || null;
    const previewEnabled = !!assistanceToggle?.checked;
    if (recordButton) recordButton.hidden = true;
    if (assistance?.isApprovedBeneficiary) {
      title.textContent = 'Already an approved beneficiary';
      copy.textContent = assistance.approvedAt
        ? `Assistance received on ${formatDate(assistance.approvedAt)}. First repayment due date is ${formatDate(assistance.firstRepaymentDueDate)}.`
        : 'This beneficiary is active, but the assistance received date has not been recorded yet.';
      if (recordButton) {
        recordButton.textContent = 'Record Assistance Received Now';
        recordButton.hidden = !!assistance.approvedAt;
      }
      root.hidden = false;
      return;
    }

    if (previewEnabled) {
      title.textContent = 'Will become an approved beneficiary on approval';
      copy.textContent = 'Once you approve this as already assisted, the system will record the assistance date and move the case straight into the beneficiary record.';
      root.hidden = false;
      return;
    }

    root.hidden = true;
    title.textContent = '';
    copy.textContent = '';
    if (recordButton) recordButton.hidden = true;
  };

  const load = async () => {
    const response = await apiGet('api/applications', state.filters);
    if (response.redirect) {
      window.location.href = routeUrl(response.redirect);
      return;
    }
    if (!response.ok) {
      showNotice(response.message || 'Unable to load applications.', 'danger');
      return;
    }
    state.data = response.data || state.data;
    renderSummary();
    renderFilters();
    renderTable();
  };

  const openApplication = async (applicationId) => {
    const response = await apiGet('api/applications/show', { id: applicationId });
    if (response.redirect) {
      window.location.href = routeUrl(response.redirect);
      return;
    }
    if (!response.ok) {
      showNotice(response.message || 'Unable to load application details.', 'danger');
      return;
    }
    state.activeApplication = response.application;
    renderModal(state.activeApplication);
  };

  const refreshActiveApplication = async () => {
    if (!state.activeApplication?.id) return;
    const response = await apiGet('api/applications/show', { id: state.activeApplication.id });
    if (response.redirect) {
      window.location.href = routeUrl(response.redirect);
      return;
    }
    if (response.ok && response.application) {
      state.activeApplication = response.application;
      renderModal(state.activeApplication);
    }
  };

  const uploadFormFile = async (requirementKey, file) => {
    if (!state.activeApplication?.id) return;
    const formData = new FormData();
    formData.append('applicationId', String(state.activeApplication.id));
    formData.append('requirementKey', String(requirementKey));
    formData.append('file', file);
    const response = await apiFormPost('api/applications/upload-form-requirement', formData);
    if (!response.ok) {
      showNotice(firstError(response.errors) || response.message || 'Unable to upload the form file.', 'danger');
      return;
    }
    if (response.application) {
      state.activeApplication = response.application;
      renderModal(state.activeApplication);
    } else {
      await refreshActiveApplication();
    }
    showNotice('Form file uploaded.', 'success');
  };

  const handleLivelihoodCategoryChange = async (event) => {
    if (!state.activeApplication?.id) return;
    const input = event.target;
    if (!(input instanceof HTMLSelectElement)) return;
    const livelihoodCategory = String(input.value || '').trim();
    const response = await apiPost('api/applications/update-livelihood-category', {
      applicationId: state.activeApplication.id,
      livelihoodCategory,
    });

    if (!response.ok) {
      showNotice(firstError(response.errors) || response.message || 'Unable to save the generalized business category.', 'danger');
      input.value = state.activeApplication?.livelihoodCategory || '';
      return;
    }

    if (response.application) {
      state.activeApplication = response.application;
      renderModal(state.activeApplication);
    }
    await load();
    showNotice('Generalized business category saved.', 'success');
  };

  const submitRequirementReview = async (kind, itemKey, decision) => {
    if (!state.activeApplication?.id) return;
    const preview = resolvePreviewItem(`${kind}:${itemKey}`, state.activeApplication);
    if (!preview?.item) return;

    const isCorrection = decision === 'needs_correction';
    const correctionRemark = isCorrection
      ? String(window.prompt(`Enter the correction note for ${preview.item.label || 'this requirement'}.`, 'Please review and resubmit this requirement.') || '').trim()
      : '';
    if (isCorrection && !correctionRemark) return;

    let response;
    if (kind === 'upload') {
      response = await apiPost('api/applications/review-requirement', {
        applicationId: state.activeApplication.id,
        requirementKey: itemKey,
        decision,
        remarks: isCorrection ? correctionRemark : 'Requirement approved by reviewer.',
        applicantRemark: correctionRemark,
      });
    } else {
      const taskResponse = await apiGet('api/post-approval-review/task', { task_id: itemKey });
      if (!taskResponse.ok || !taskResponse.task) {
        showNotice(taskResponse.message || 'Unable to load the form details for review.', 'danger');
        return;
      }
      response = await apiJsonPost('api/post-approval-review/review', {
        taskId: Number(itemKey),
        status: decision === 'approve' ? 'Verified' : 'Needs Correction',
        remarks: isCorrection ? correctionRemark : 'Form requirement approved by reviewer.',
        applicantVisibleRemark: correctionRemark,
        staffForm: taskResponse.task?.payload?.staffReview || {},
      });
    }

    if (!response.ok) {
      showNotice(firstError(response.errors) || response.message || 'Unable to save this requirement review.', 'danger');
      return;
    }

    await refreshActiveApplication();
    showNotice(isCorrection ? 'Requirement marked for correction.' : 'Requirement approved.', 'success');
  };

  const submitReview = async (decision) => {
    if (!state.activeApplication) return;
    const remarks = decision === 'reject' ? 'Application rejected by reviewer.' : '';
    const receivedAssistance = decision === 'approve'
      ? (state.assistanceReceivedSelection || !!qs('#admin-app-modal-assisted')?.checked)
      : false;
    const response = await apiPost('api/applications/review', {
      applicationId: state.activeApplication.id,
      decision,
      remarks,
      receivedAssistance: receivedAssistance ? '1' : '0',
    });
    if (response.redirect) {
      window.location.href = routeUrl(response.redirect);
      return;
    }
    if (!response.ok) {
      showNotice(firstError(response.errors) || 'Unable to update application.', 'danger');
      return;
    }
    if (decision === 'approve' && receivedAssistance && response.application?.assistanceStatus?.isApprovedBeneficiary) {
      const assistance = response.application.assistanceStatus;
      showNotice(
        `Approved beneficiary recorded ${formatDate(assistance.approvedAt)}. First repayment due date is ${formatDate(assistance.firstRepaymentDueDate)}.`,
        'success'
      );
    } else {
      showNotice(response.message || 'Application updated.', 'success');
    }
    state.assistanceReceivedSelection = false;
    closeModal();
    await load();
  };

  const recordAssistanceReceivedNow = async () => {
    if (!state.activeApplication?.id) return;
    if (!window.confirm('Record the assistance received date as now and rebuild this beneficiary repayment schedule?')) return;
    const button = qs('#admin-app-assisted-record');
    if (button) button.disabled = true;
    const response = await apiPost('api/applications/assistance-received', {
      applicationId: state.activeApplication.id,
    });
    if (button) button.disabled = false;
    if (!response.ok) {
      showNotice(firstError(response.errors) || response.message || 'Unable to record assistance release.', 'danger');
      return;
    }
    state.activeApplication = response.application || state.activeApplication;
    renderModal(state.activeApplication);
    showNotice(response.message || 'Assistance received date recorded.', 'success');
    await load();
  };

  const closeModal = () => {
    setHTML(qs('#modal-root'), '');
    state.activeApplication = null;
    state.activePreviewToken = '';
    state.activePreviewOwnerId = null;
    state.assistanceReceivedSelection = false;
  };

  const showNotice = (message, tone = 'info') => {
    const notice = qs('#applications-notice');
    if (!notice) return;
    notice.hidden = false;
    notice.className = `notice ${tone}`;
    notice.textContent = message;
  };

  const bind = () => {
    const target = section();
    if (!target || target.dataset.applicationsBound === 'true') return;
    target.dataset.applicationsBound = 'true';
    on(target, 'change', (event) => {
      if (event.target.id === 'applications-status') {
        state.filters.status = event.target.value;
        load();
      }
      if (event.target.id === 'applications-barangay') {
        state.filters.barangayId = event.target.value;
        load();
      }
      if (event.target.id === 'applications-assigned-pdo') {
        state.filters.assignedPdoId = event.target.value;
        load();
      }
      if (event.target.id === 'applications-livelihood-category') {
        state.filters.livelihoodCategory = event.target.value;
        load();
      }
    });

    on(target, 'input', (event) => {
      if (event.target.id === 'applications-search') {
        state.filters.search = event.target.value;
        load();
      }
    });

    on(target, 'click', async (event) => {
      const reset = event.target.closest('#applications-reset');
      if (reset) {
        state.filters = { status: '', barangayId: '', assignedPdoId: '', livelihoodCategory: '', search: '' };
        await load();
        return;
      }

      const openButton = event.target.closest('[data-open-application]');
      if (openButton) {
        await openApplication(openButton.dataset.openApplication);
      }
    });

    on(document, 'click', (event) => {
      const formReviewLink = event.target.closest('[data-open-form-review]');
      if (formReviewLink) {
        const url = String(formReviewLink.dataset.openFormReview || '').trim();
        if (url) {
          window.location.href = url;
        }
        return;
      }

      if (event.target.closest('[data-close-modal]') || (event.target.matches('[data-app-modal]'))) {
        closeModal();
        return;
      }

      const select = event.target.closest('[data-select-requirement]');
      if (select) {
        state.activePreviewToken = select.dataset.selectRequirement || '';
        renderRequirementNavigator();
        renderPreviewPanel();
        renderRequirementInspector();
        return;
      }

      const uploadTrigger = event.target.closest('[data-trigger-form-upload]');
      if (uploadTrigger) {
        document.getElementById(`admin-form-upload-${uploadTrigger.dataset.triggerFormUpload}`)?.click();
        return;
      }

      const reviewItem = event.target.closest('[data-review-item]');
      if (reviewItem) {
        const [kind, itemKey, decision] = String(reviewItem.dataset.reviewItem || '').split(':');
        if (!kind || !itemKey || !decision) return;
        submitRequirementReview(kind, itemKey, decision);
        return;
      }

      const assistanceRecord = event.target.closest('#admin-app-assisted-record');
      if (assistanceRecord) {
        recordAssistanceReceivedNow();
        return;
      }

      const action = event.target.closest('[data-review-action]');
      if (action) {
        submitReview(action.dataset.reviewAction);
      }
    });

    on(document, 'change', async (event) => {
      if (event.target.id === 'admin-app-modal-livelihood-category-input') {
        await handleLivelihoodCategoryChange(event);
        return;
      }
      if (event.target.id === 'admin-app-modal-assisted') {
        state.assistanceReceivedSelection = !!event.target.checked;
        renderAssistanceStatus();
        updateApprovalDecisionState();
        return;
      }
      const input = event.target.closest('[data-form-upload-input]');
      if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
      const requirementKey = String(input.dataset.formUploadInput || '').trim();
      if (!requirementKey) return;
      const file = input.files[0];
      input.value = '';
      await uploadFormFile(requirementKey, file);
    });
  };

  const statusClass = (status) => {
    const value = String(status || '').toLowerCase();
    if (['approved', 'approved for training', 'verified', 'completed', 'attended'].includes(value)) return 'is-success';
    if (['rejected', 'flagged', 'missing', 'missed'].includes(value)) return 'is-danger';
    if (['needs documents', 'needs correction', 'submitted', 'under review', 'pending', 'for assessment', 'requirements verified', 'notified', 'scheduled'].includes(value)) return 'is-warning';
    if (value === 'info') return 'is-info';
    return 'is-muted';
  };

  const readinessLabel = (status) => {
    const value = String(status || '').toLowerCase();
    if (['approved for training', 'approved', 'requirements verified'].includes(value)) return 'Ready';
    if (['needs correction', 'rejected'].includes(value)) return 'Needs Correction';
    if (['needs documents'].includes(value)) return 'Needs Documents';
    if (['submitted', 'under review', 'for assessment'].includes(value)) return 'Under Review';
    return status || 'Under Review';
  };

  const readinessBadgeClass = (status) => {
    const readiness = readinessLabel(status).toLowerCase();
    if (readiness === 'ready') return 'is-success';
    if (readiness === 'needs correction') return 'is-danger';
    if (readiness === 'needs documents') return 'is-warning';
    return 'is-muted';
  };

  const firstError = (errors) => {
    if (!errors || typeof errors !== 'object') return '';
    const values = Object.values(errors);
    return values.length ? values[0] : '';
  };

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const cssEscape = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/"/g, '\\"');
  };

  const formReviewUrl = (item, embedded = false) => {
    const taskId = Number(item?.id || 0);
    if (taskId > 0) {
      return routeUrl(`post-approval-review?task_id=${encodeURIComponent(String(taskId))}${embedded ? '&embed=1' : ''}`);
    }
    return String(item?.reviewUrl || '');
  };

  const formRequirementFile = (item) => (item && typeof item === 'object' && item.file ? item.file : null);

  const renderPreviewFile = (root, file, label) => {
    const url = file?.url || '';
    const mime = String(file?.type || '').toLowerCase();
    if (!url) {
      setHTML(root, '<div class="po-preview-empty">No file was uploaded for this form.</div>');
      return;
    }
    if (mime.startsWith('image/')) {
      setHTML(root, `<div class="po-preview-frame po-preview-frame--image"><img src="${escapeHtml(url)}" alt="${escapeHtml(label || 'Uploaded form preview')}"></div>`);
      return;
    }
    if (mime.includes('pdf') || mime.startsWith('text/')) {
      setHTML(root, `<div class="po-preview-frame"><iframe src="${escapeHtml(url)}" title="${escapeHtml(label || 'Uploaded form preview')}"></iframe></div>`);
      return;
    }
    setHTML(root, `<div class="po-preview-file-card"><strong>${escapeHtml(file?.name || label || 'Uploaded form file')}</strong><span>${escapeHtml(file?.type || 'File preview is not available in-panel.')}</span><a class="action-button" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open file</a></div>`);
  };

  const init = () => {
    renderShell();
    bind();
    load();
  };

  const escapeAttribute = (value) => escapeHtml(value);

  window.App.modules = window.App.modules || {};
  window.App.modules.applications = { init };
})();
