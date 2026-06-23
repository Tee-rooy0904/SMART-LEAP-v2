(function () {
  const { qs, delegate, setHTML } = window.App.dom;
  const { formatDate } = window.App.format;

  const state = {
    data: {
      summary: {
        batchCapacity: 300,
        pending: 0,
        selected: 0,
        saved: 0,
        remaining: 300,
      },
      pending: [],
      selected: [],
      saved: [],
    },
    activeId: 0,
    activeTab: 'pending',
  };

  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');
  const routeUrl = (path) => `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;

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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const section = () => qs('#validation-section');

  const statusClass = (statusKey) => {
    if (statusKey === 'selected') return 'is-success';
    if (statusKey === 'saved_next_batch') return 'is-muted';
    return 'is-warning';
  };

  const emailStatusClass = (record) => {
    if (record.selectionEmailNeedsResend) return 'is-danger';
    if (record.selectionEmailReady) return 'is-success';
    return 'is-muted';
  };

  const emailStatusLabel = (record) => {
    if (record.selectionEmailNeedsResend) return 'Failed';
    if (record.selectionEmailReady) return 'Sent';
    return 'Not Required';
  };

  const emailStatusMeta = (record) => {
    if (record.selectionEmailSentAt) {
      return `Sent ${formatDate(record.selectionEmailSentAt)}`;
    }
    if (record.selectionEmailFailedAt) {
      return `Last failed ${formatDate(record.selectionEmailFailedAt)}`;
    }
    return record.statusKey === 'selected' ? 'Approval notice not sent' : 'No approval email needed';
  };

  const emailStatusMarkup = (record, compact = false) => {
    if (record.statusKey !== 'selected') {
      return compact ? '--' : `
        <div class="validation-email-state">
          <span class="status-badge is-muted">Not Required</span>
        </div>
      `;
    }

    const badge = `<span class="status-badge ${emailStatusClass(record)}">${escapeHtml(emailStatusLabel(record))}</span>`;
    const meta = `<span class="${compact ? 'validation-email-state__meta' : 'validation-email-card__meta'}">${escapeHtml(emailStatusMeta(record))}</span>`;
    const error = record.selectionEmailNeedsResend && record.selectionEmailError
      ? `<span class="${compact ? 'validation-email-state__error' : 'validation-email-card__error'}">${escapeHtml(record.selectionEmailError)}</span>`
      : '';

    if (compact) {
      return `<div class="validation-email-state">${badge}${meta}</div>${error}`;
    }

    return `
      <div class="validation-email-card__state">
        ${badge}
        ${meta}
      </div>
      ${error}
    `;
  };

  const fileCardMarkup = (label, file) => {
    if (!file || !file.url) {
      return `
        <article class="validation-upload-card validation-upload-card--empty">
          <div>
            <span class="validation-upload-card__label">${escapeHtml(label)}</span>
            <strong>No file uploaded.</strong>
          </div>
        </article>
      `;
    }

    return `
      <article class="validation-upload-card">
        <div class="validation-upload-card__head">
          <span class="validation-upload-card__label">${escapeHtml(label)}</span>
          <a href="${escapeHtml(file.url)}" class="app-btn-outline validation-upload-card__link" target="_blank" rel="noopener">Open file</a>
        </div>
        ${file.isImage ? `<div class="validation-upload-card__preview"><img src="${escapeHtml(file.url)}" alt="${escapeHtml(label)}"></div>` : ''}
        <div class="validation-upload-card__meta">
          <strong>${escapeHtml(file.name || 'Uploaded file')}</strong>
          <span>${escapeHtml(file.mimeType || '--')}</span>
        </div>
      </article>
    `;
  };

  const hardcopyFieldMarkup = () => `
    <div class="modal-overlay validation-review-modal" data-hardcopy-modal>
      <div class="modal-card validation-review-modal__card validation-hardcopy-modal__card" role="dialog" aria-modal="true" aria-labelledby="validationHardcopyTitle">
        <div class="modal-header">
          <div class="validation-review-modal__title">
            <span class="admin-inline-pill">Staff Hardcopy Intake</span>
            <h3 class="modal-title" id="validationHardcopyTitle">Encode manual applicant form</h3>
            <small>For Admin and PDO-uploaded hardcopy registrations.</small>
          </div>
          <button class="modal-close" type="button" data-close-hardcopy-modal aria-label="Close">&times;</button>
        </div>
        <form class="modal-body validation-review-modal__body validation-hardcopy-form" id="validationHardcopyForm" enctype="multipart/form-data">
          <div class="validation-hardcopy-feedback" id="validationHardcopyFeedback" hidden></div>
          <section class="validation-hardcopy-grid">
            <label class="validation-hardcopy-field"><span>First name</span><input name="firstName" type="text" required></label>
            <label class="validation-hardcopy-field"><span>Middle name</span><input name="middleName" type="text"></label>
            <label class="validation-hardcopy-field"><span>Last name</span><input name="lastName" type="text" required></label>
            <label class="validation-hardcopy-field"><span>Email address</span><input name="email" type="email" required></label>
            <label class="validation-hardcopy-field"><span>Birthdate</span><input name="birthdate" type="date" required></label>
            <label class="validation-hardcopy-field"><span>Age</span><input name="age" type="number" min="1" max="120"></label>
            <label class="validation-hardcopy-field"><span>Gender</span><select name="gender" required><option value="">Select gender</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option></select></label>
            <label class="validation-hardcopy-field"><span>Contact number</span><input name="contactNumber" type="text" placeholder="09xxxxxxxxx" required></label>
            <label class="validation-hardcopy-field"><span>Barangay</span><input name="barangay" type="text" required></label>
            <label class="validation-hardcopy-field"><span>4Ps membership</span><select name="is4ps" required><option value="">Select</option><option>Yes</option><option>No</option></select></label>
            <label class="validation-hardcopy-field"><span>Educational attainment</span><select name="educationalAttainment" required><option value="">Select attainment</option><option>Kindergarten</option><option>Elementary</option><option>JHS</option><option>SHS Grad</option><option>Tertiary</option></select></label>
            <label class="validation-hardcopy-field"><span>Sector</span><select name="sector" required><option value="">Select sector</option><option>Indigenous People</option><option>Senior Citizen</option><option>Solo Parent</option><option>PWD</option><option>None</option><option>Other</option></select></label>
            <label class="validation-hardcopy-field"><span>Other sector</span><input name="sectorOtherSpecify" type="text"></label>
            <label class="validation-hardcopy-field"><span>Specific business type</span><input name="livelihood" type="text" required></label>
            <label class="validation-hardcopy-field"><span>Microbusiness name</span><input name="businessName" type="text" required></label>
            <label class="validation-hardcopy-field validation-hardcopy-field--wide"><span>Complete address</span><textarea name="completeAddress" rows="2" required></textarea></label>
          </section>
          <section class="validation-hardcopy-grid validation-hardcopy-grid--uploads">
            <label class="validation-hardcopy-field"><span>Profile photo</span><input name="profilePhoto" type="file" accept=".jpg,.jpeg,.png" required></label>
            <label class="validation-hardcopy-field"><span>Existing business photo</span><input name="businessPhoto" type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif" required></label>
            <label class="validation-hardcopy-field"><span>Valid ID copy</span><input name="validIdPhoto" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.heic,.heif" required></label>
            <label class="validation-hardcopy-field"><span>Scanned hardcopy form</span><input name="hardcopyForm" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.heic,.heif" required></label>
          </section>
        </form>
        <div class="modal-footer validation-review-modal__footer">
          <button type="button" class="btn btn-outline-secondary" data-close-hardcopy-modal>Close</button>
          <button type="submit" form="validationHardcopyForm" class="btn btn-success" id="validationHardcopySubmit">Save to Validation Queue</button>
        </div>
      </div>
    </div>
  `;

  const renderSummary = () => {
    const summary = state.data.summary || {};
    const pairs = [
      ['validationBatchCapacity', summary.batchCapacity || 300],
      ['validationPendingCount', summary.pending || 0],
      ['validationApprovedCount', summary.selected || 0],
      ['validationDeferredCount', summary.saved || 0],
    ];
    pairs.forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = String(value);
    });

    const badgePairs = [
      ['validationPendingBadge', `${summary.pending || 0} pending`],
      ['validationSelectedBadge', `${summary.selected || 0} selected`],
      ['validationDeferredBadge', `${summary.saved || 0} saved`],
      ['validationTabPendingCount', summary.pending || 0],
      ['validationTabSelectedCount', summary.selected || 0],
      ['validationTabSavedCount', summary.saved || 0],
    ];
    badgePairs.forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = String(value);
    });

    const emailFailureCount = Number(summary.selectionEmailFailures || 0);
    const emailMeta = document.getElementById('validationEmailFailureMeta');
    if (emailMeta) {
      emailMeta.textContent = emailFailureCount > 0 ? `${emailFailureCount} failed notices` : 'Approval emails are up to date';
    }

    const emailBadge = document.getElementById('validationSelectedEmailBadge');
    if (emailBadge) {
      emailBadge.hidden = emailFailureCount <= 0;
      emailBadge.textContent = `${emailFailureCount} failed`;
    }

    const navBadge = document.querySelector('[data-section-badge="validation"]');
    if (navBadge) {
      const pending = Number(summary.pending || 0);
      navBadge.textContent = pending > 0 ? String(pending) : '';
      navBadge.hidden = pending <= 0;
    }
  };

  const tableRowMarkup = (record, dateLabel, actionLabel = 'Open Validation', mode = 'pending') => `
    <tr>
      <td>
        <div class="validation-person-cell">
          <strong>${escapeHtml(record.fullName)}</strong>
        </div>
      </td>
      <td>${escapeHtml(record.completeAddress || '--')}</td>
      <td>${escapeHtml(record.contactNumber || '--')}</td>
      <td>${escapeHtml(record.email || '--')}</td>
      <td>${escapeHtml(dateLabel)}</td>
      ${mode === 'selected' ? `<td>${emailStatusMarkup(record, true)}</td>` : ''}
      <td class="actions">
        <button class="action-button action-button--review" data-open-validation="${record.id}">
          <i class="fas fa-folder-open"></i>
          <span>${escapeHtml(actionLabel)}</span>
        </button>
      </td>
    </tr>
  `;

  const renderTables = () => {
    const pendingBody = qs('#validationPendingTableBody');
    const selectedBody = qs('#validationApprovedTableBody');
    const savedBody = qs('#validationDeferredTableBody');
    if (!pendingBody || !selectedBody || !savedBody) return;

    setHTML(
      pendingBody,
      state.data.pending.length
        ? state.data.pending.map((record) => tableRowMarkup(record, formatDate(record.submittedAt), 'Open Validation', 'pending')).join('')
        : '<tr><td colspan="6">No pending registrations yet.</td></tr>'
    );

    setHTML(
      selectedBody,
      state.data.selected.length
        ? state.data.selected.map((record) => tableRowMarkup(record, formatDate(record.validatedAt || record.submittedAt), 'View Details', 'selected')).join('')
        : '<tr><td colspan="7">No selected registrations yet.</td></tr>'
    );

    setHTML(
      savedBody,
      state.data.saved.length
        ? state.data.saved.map((record) => tableRowMarkup(record, formatDate(record.validatedAt || record.submittedAt), 'View Details', 'saved')).join('')
        : '<tr><td colspan="6">No saved registrations yet.</td></tr>'
    );
  };

  const setActiveTab = (tabKey) => {
    const nextTab = ['pending', 'selected', 'saved'].includes(tabKey) ? tabKey : 'pending';
    state.activeTab = nextTab;

    document.querySelectorAll('[data-validation-tab]').forEach((button) => {
      const active = button.getAttribute('data-validation-tab') === nextTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.style.color = active ? '#ffffff' : '#18385b';
      button.style.webkitTextFillColor = active ? '#ffffff' : '#18385b';
      const badge = button.querySelector('span');
      if (badge instanceof HTMLElement) {
        badge.style.color = '#ffffff';
        badge.style.webkitTextFillColor = '#ffffff';
      }
    });

    document.querySelectorAll('[data-validation-panel]').forEach((panel) => {
      const active = panel.getAttribute('data-validation-panel') === nextTab;
      panel.hidden = !active;
    });
  };

  const renderNotice = (message = '', tone = 'info') => {
    const node = qs('#validationNotice');
    if (!node) return;
    if (!message) {
      node.hidden = true;
      node.textContent = '';
      node.className = 'notice info validation-notice';
      return;
    }

    node.hidden = false;
    node.textContent = message;
    node.className = `notice ${tone} validation-notice`;
  };

  const buildModalMarkup = (record) => `
    <div class="modal-overlay validation-review-modal" data-validation-modal>
      <div class="modal-card validation-review-modal__card" role="dialog" aria-modal="true" aria-labelledby="validationModalTitle">
        <div class="modal-header">
          <div class="validation-review-modal__title">
            <span class="admin-inline-pill">${record.statusKey === 'pending' ? 'Validation Review' : 'Registration Details'}</span>
            <h3 class="modal-title" id="validationModalTitle">${escapeHtml(record.fullName)}</h3>
            <small>Submitted ${formatDate(record.submittedAt)}</small>
          </div>
          <div class="validation-review-modal__status">
            <span class="status-badge ${statusClass(record.statusKey)}">${escapeHtml(record.statusLabel)}</span>
            <button class="modal-close" type="button" data-close-validation-modal aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="modal-body validation-review-modal__body">
          <section class="validation-record-grid">
            <article class="validation-record-card">
              <span class="validation-record-card__label">Registrant Name</span>
              <strong>${escapeHtml(record.fullName)}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Email</span>
              <strong>${escapeHtml(record.email)}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Contact</span>
              <strong>${escapeHtml(record.contactNumber)}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Birthdate</span>
              <strong>${escapeHtml(record.birthdate || '--')}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Age</span>
              <strong>${escapeHtml(record.age ?? '--')}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Gender</span>
              <strong>${escapeHtml(record.gender || '--')}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Barangay</span>
              <strong>${escapeHtml(record.barangay || '--')}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">4Ps Membership</span>
              <strong>${escapeHtml(record.is4ps || '--')}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Educational Attainment</span>
              <strong>${escapeHtml(record.educationalAttainment || '--')}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Sector</span>
              <strong>${escapeHtml(record.sector === 'Other' && record.sectorOtherSpecify ? `Other - ${record.sectorOtherSpecify}` : (record.sector || '--'))}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Specific Business Type</span>
              <strong>${escapeHtml(record.livelihood || '--')}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Microbusiness Name</span>
              <strong>${escapeHtml(record.businessName || '--')}</strong>
            </article>
            <article class="validation-record-card">
              <span class="validation-record-card__label">Submission Channel</span>
              <strong>${escapeHtml(record.submissionChannelLabel || 'Online applicant form')}</strong>
            </article>
            ${record.statusKey === 'selected' ? `
            <article class="validation-record-card validation-email-card">
              <span class="validation-record-card__label">Approval Email</span>
              ${emailStatusMarkup(record)}
            </article>` : ''}
            <article class="validation-record-card validation-record-card--wide">
              <span class="validation-record-card__label">Complete Address</span>
              <strong>${escapeHtml(record.completeAddress)}</strong>
            </article>
          </section>

          <section class="validation-upload-grid">
            ${fileCardMarkup('Profile Photo', record.profilePhoto)}
            ${fileCardMarkup('Existing Business Photo', record.businessPhoto)}
            ${fileCardMarkup('Valid ID', record.validIdPhoto)}
            ${record.submissionChannel === 'staff_hardcopy' ? fileCardMarkup('Scanned Hardcopy Form', record.hardcopyForm) : ''}
          </section>
        </div>
        <div class="modal-footer validation-review-modal__footer">
          <button type="button" class="btn btn-outline-secondary" data-close-validation-modal>Close</button>
          ${record.statusKey === 'pending'
            ? `<button type="button" class="btn btn-success" data-validation-action="approve" data-registration-id="${record.id}">Approve for Current Batch</button>`
            : ''}
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    const root = qs('#modal-root');
    if (root) {
      setHTML(root, '');
    }
    state.activeId = 0;
  };

  const openHardcopyModal = () => {
    const root = qs('#modal-root');
    if (!root) return;
    setHTML(root, hardcopyFieldMarkup());
  };

  const closeHardcopyModal = () => {
    const root = qs('#modal-root');
    if (root) {
      setHTML(root, '');
    }
  };

  const setHardcopyFeedback = (message = '', tone = 'danger') => {
    const node = document.getElementById('validationHardcopyFeedback');
    if (!node) return;
    node.hidden = message === '';
    node.textContent = message;
    node.dataset.tone = tone;
  };

  const handleHardcopySubmit = async (form) => {
    const submitButton = document.getElementById('validationHardcopySubmit');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
    }

    const response = await apiFormPost('api/validation/staff-entry', new FormData(form));

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Save to Validation Queue';
    }

    if (!response.ok) {
      const errors = Object.values(response.errors || {}).filter(Boolean);
      setHardcopyFeedback(errors.length ? errors.join(' ') : (response.message || 'Unable to save the hardcopy applicant.'), 'danger');
      return;
    }

    closeHardcopyModal();
    await refresh(response.message || 'Hardcopy applicant saved to the validation queue.', 'info');
  };

  const openModal = async (registrationId) => {
    const root = qs('#modal-root');
    if (!root) return;

    const response = await apiGet('api/validation/show', { id: registrationId });
    if (!response.ok || !response.registration) {
      renderNotice(response.message || 'Unable to load the registration.', 'danger');
      return;
    }

    state.activeId = registrationId;
    setHTML(root, buildModalMarkup(response.registration));
  };

  const refresh = async (noticeMessage = '', noticeTone = 'info') => {
    const response = await apiGet('api/validation');
    if (!response.ok) {
      renderNotice(response.message || 'Unable to load validation records.', 'danger');
      return;
    }

    state.data = response.data || state.data;
    renderSummary();
    renderTables();
    setActiveTab(state.activeTab);
    renderNotice(noticeMessage, noticeTone);
  };

  const handleReview = async (button) => {
    const registrationId = Number(button.dataset.registrationId || 0);
    const action = button.dataset.validationAction || '';
    if (!registrationId || !action) return;

    button.disabled = true;
    const response = await apiPost('api/validation/review', {
        registrationId,
        action,
      });
    button.disabled = false;

    if (!response.ok) {
      renderNotice(response.message || 'Unable to update the validation email state.', 'danger');
      return;
    }

    state.data = response.state || state.data;
    renderSummary();
    renderTables();
    setActiveTab(state.activeTab);
    renderNotice(response.message || 'Validation decision saved.', 'info');

    closeModal();
  };

  const bindEvents = () => {
    const target = section();
    if (!target || target.dataset.validationBound === 'true') return;

    delegate(target, 'click', '[data-open-validation]', (_event, trigger) => {
      openModal(Number(trigger.dataset.openValidation || 0));
    });

    delegate(target, 'click', '[data-validation-tab]', (_event, trigger) => {
      setActiveTab(trigger.dataset.validationTab || 'pending');
    });

    document.addEventListener('click', (event) => {
      const targetNode = event.target;
      if (!(targetNode instanceof HTMLElement)) return;

      if (targetNode.matches('[data-close-validation-modal]')) {
        closeModal();
      }

      if (targetNode.matches('[data-close-hardcopy-modal]')) {
        closeHardcopyModal();
      }

      const actionButton = targetNode.closest('[data-validation-action]');
      if (actionButton instanceof HTMLElement) {
        handleReview(actionButton);
      }
    });

    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.id === 'validationHardcopyForm') {
        event.preventDefault();
        handleHardcopySubmit(form);
      }
    });

    document.getElementById('validationRefreshButton')?.addEventListener('click', () => {
      refresh('Validation queue refreshed.');
    });

    document.getElementById('validationHardcopyButton')?.addEventListener('click', openHardcopyModal);

    target.dataset.validationBound = 'true';
  };

  window.App = window.App || {};
  window.App.modules = window.App.modules || {};
  window.App.modules.validation = {
    init() {
      bindEvents();
      setActiveTab(state.activeTab);
      refresh();
    },
    refresh,
  };
})();
