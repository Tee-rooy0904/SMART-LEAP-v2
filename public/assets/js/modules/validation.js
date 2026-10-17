(function () {
  const { qs, delegate, setHTML } = window.App.dom;
  const { formatDate } = window.App.format;

  const state = {
    data: {
      summary: {
        batchCapacity: 300,
        pending: 0,
        pendingClean: 0,
        possibleDuplicates: 0,
        markedDuplicates: 0,
        selected: 0,
        saved: 0,
        remaining: 300,
      },
      pending: [],
      possibleDuplicates: [],
      markedDuplicates: [],
      selected: [],
      saved: [],
    },
    activeId: 0,
    activeTab: 'pending',
    selectedBatch: '',
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
            <label class="validation-hardcopy-field"><span>Sector</span><select name="sector" data-hardcopy-sector required><option value="">Select sector</option><option>Indigenous People</option><option>Senior Citizen</option><option>Solo Parent</option><option>PWD</option><option>None</option><option>Other</option></select></label>
            <label class="validation-hardcopy-field" data-hardcopy-sector-other-wrap hidden><span>Other sector</span><input name="sectorOtherSpecify" type="text" data-hardcopy-sector-other disabled></label>
            <label class="validation-hardcopy-field"><span>Specific business type</span><select name="livelihood" data-hardcopy-livelihood required><option value="">Select business type</option><option>Sari-sari store</option><option>Fruit stand</option><option>Ukay-ukay</option><option>Food cart</option><option>General merchandise</option><option>Other</option></select></label>
            <label class="validation-hardcopy-field" data-hardcopy-livelihood-other-wrap hidden><span>Other business type</span><input name="livelihoodOtherSpecify" type="text" data-hardcopy-livelihood-other disabled></label>
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
      ['validationTabPendingCount', summary.pendingClean || summary.pending || 0],
      ['validationTabSelectedCount', summary.selected || 0],
      ['validationTabSavedCount', summary.saved || 0],
      ['validationTabDupCount', summary.possibleDuplicates || 0],
      ['validationTabMarkedCount', summary.markedDuplicates || 0],
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

    const activeBatch = summary.activeBatch || 'Batch 3';
    const viewBatch = summary.viewBatch || activeBatch;
    const nextBatch = summary.nextBatch || 'Batch 4';
    const selLabel = document.getElementById('validationSelectedBatchLabel');
    if (selLabel) selLabel.textContent = `Selected for ${viewBatch}`;
    const savLabel = document.getElementById('validationSavedBatchLabel');
    if (savLabel) savLabel.textContent = `Saved for ${nextBatch}`;
    const activePill = document.getElementById('validationActiveBatchPill');
    if (activePill) activePill.textContent = activeBatch;
    const switchBtnBadge = document.getElementById('batchSwitchButtonBadge');
    if (switchBtnBadge) switchBtnBadge.textContent = activeBatch;

    const cohortFilter = document.getElementById('validationCohortFilter');
    if (cohortFilter) {
      const all = Array.isArray(summary.allBatches) ? summary.allBatches : ['Batch 1', 'Batch 2', 'Batch 3'];
      const currentVal = state.selectedBatch || activeBatch;
      cohortFilter.innerHTML = `
        <option value="${activeBatch}" ${currentVal === activeBatch ? 'selected' : ''}>${activeBatch} (Active)</option>
        ${all.filter((b) => b !== activeBatch).map((b) => `<option value="${b}" ${currentVal === b ? 'selected' : ''}>${b}</option>`).join('')}
        <option value="all" ${currentVal === 'all' ? 'selected' : ''}>All Batches</option>
      `;
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
    const dupBody = qs('#validationDupTableBody');
    const markedBody = qs('#validationMarkedTableBody');
    const selectedBody = qs('#validationApprovedTableBody');
    const savedBody = qs('#validationDeferredTableBody');
    if (!pendingBody || !selectedBody || !savedBody) return;

    setHTML(
      pendingBody,
      state.data.pending.length
        ? state.data.pending.map((record) => tableRowMarkup(record, formatDate(record.submittedAt), 'Open Validation', 'pending')).join('')
        : '<tr><td colspan="6">No pending registrations yet.</td></tr>'
    );

    if (dupBody) {
      setHTML(
        dupBody,
        state.data.possibleDuplicates.length
          ? state.data.possibleDuplicates.map((record) => tableRowMarkup(record, formatDate(record.submittedAt), 'Review Duplicate', 'dup')).join('')
          : '<tr><td colspan="6">No possible duplicates detected.</td></tr>'
      );
    }

    if (markedBody) {
      setHTML(
        markedBody,
        state.data.markedDuplicates.length
          ? state.data.markedDuplicates.map((record) => tableRowMarkup(record, formatDate(record.submittedAt), 'View Details', 'marked')).join('')
          : '<tr><td colspan="6">No marked duplicates yet.</td></tr>'
      );
    }

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
    const nextTab = ['pending', 'possibleDuplicates', 'markedDuplicates', 'selected', 'saved'].includes(tabKey) ? tabKey : 'pending';
    state.activeTab = nextTab;

    document.querySelectorAll('[data-validation-tab]').forEach((button) => {
      const active = button.getAttribute('data-validation-tab') === nextTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.style.color = '';
      button.style.webkitTextFillColor = '';
      const badge = button.querySelector('span');
      if (badge instanceof HTMLElement) {
        badge.style.color = '';
        badge.style.webkitTextFillColor = '';
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

  const duplicateWarningMarkup = (matchedRecord, matchedFields) => {
    if (!matchedRecord) return '';
    const fields = Array.isArray(matchedFields) && matchedFields.length
      ? `<ul class="validation-dup-fields">${matchedFields.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
      : '';
    return `
      <div class="validation-dup-warning">
        <div class="validation-dup-warning__head">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"/></svg>
          <strong>Possible Duplicate Applicant Found</strong>
        </div>
        <p>This applicant has similar information with an existing record. Please review before approving.</p>
        ${fields}
        <div class="validation-dup-matched">
          <span class="validation-record-card__label">Matched Applicant</span>
          <div class="validation-dup-matched__grid">
            <span><strong>Name:</strong> ${escapeHtml(matchedRecord.fullName || '--')}</span>
            <span><strong>Email:</strong> ${escapeHtml(matchedRecord.email || '--')}</span>
            <span><strong>Contact:</strong> ${escapeHtml(matchedRecord.contactNumber || '--')}</span>
            <span><strong>Birthdate:</strong> ${escapeHtml(matchedRecord.birthdate || '--')}</span>
            <span><strong>Address:</strong> ${escapeHtml(matchedRecord.completeAddress || '--')}</span>
            <span><strong>Status:</strong> ${escapeHtml(matchedRecord.statusLabel || '--')}</span>
            <span><strong>Submitted:</strong> ${escapeHtml(formatDate(matchedRecord.submittedAt))}</span>
          </div>
        </div>
      </div>
    `;
  };

  const buildModalMarkup = (record, matchedRecord = null, matchedFields = []) => {
    const isPossibleDup = record.isPossibleDuplicate && !record.isMarkedDuplicate;
    const isMarkedDup   = record.isMarkedDuplicate;
    const isPending     = record.statusKey === 'pending';

    const footerButtons = (() => {
      if (!isPending) {
        return `<button type="button" class="btn btn-outline-secondary" data-close-validation-modal>Close</button>`;
      }
      if (isPossibleDup) {
        return `
          <button type="button" class="btn btn-outline-secondary" data-close-validation-modal>Close</button>
          <button type="button" class="btn btn-warning" data-dup-action="mark_duplicate" data-registration-id="${record.id}" data-duplicate-of="${record.duplicateOf || 0}">Mark as Duplicate</button>
          <button type="button" class="btn btn-success" data-dup-action="approve_anyway" data-registration-id="${record.id}">Approve Anyway</button>
        `;
      }
      if (isMarkedDup) {
        return `<button type="button" class="btn btn-outline-secondary" data-close-validation-modal>Close</button>`;
      }
      return `
        <button type="button" class="btn btn-outline-secondary" data-close-validation-modal>Close</button>
        <button type="button" class="btn btn-success" data-validation-action="approve" data-registration-id="${record.id}">Approve for Current Batch</button>
      `;
    })();

    return `
      <div class="modal-overlay validation-review-modal" data-validation-modal>
        <div class="modal-card validation-review-modal__card" role="dialog" aria-modal="true" aria-labelledby="validationModalTitle">
          <div class="modal-header">
            <div class="validation-review-modal__title">
              <span class="admin-inline-pill">${isPossibleDup ? 'Duplicate Check' : isMarkedDup ? 'Marked Duplicate' : (isPending ? 'Validation Review' : 'Registration Details')}</span>
              <h3 class="modal-title" id="validationModalTitle">${escapeHtml(record.fullName)}</h3>
              <small>Submitted ${formatDate(record.submittedAt)}</small>
            </div>
            <div class="validation-review-modal__status">
              ${isPossibleDup ? '<span class="status-badge is-warning">Possible Duplicate</span>' : ''}
              ${isMarkedDup ? '<span class="status-badge is-muted">Marked Duplicate</span>' : ''}
              <span class="status-badge ${statusClass(record.statusKey)}">${escapeHtml(record.statusLabel)}</span>
              <button class="modal-close" type="button" data-close-validation-modal aria-label="Close">&times;</button>
            </div>
          </div>
          <div class="modal-body validation-review-modal__body">
            ${isPossibleDup ? duplicateWarningMarkup(matchedRecord, matchedFields) : ''}
            ${isMarkedDup && record.duplicateNote ? `<div class="validation-dup-marked-note"><strong>Note:</strong> ${escapeHtml(record.duplicateNote)}</div>` : ''}
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
            ${footerButtons}
          </div>
        </div>
      </div>
    `;
  };

  const closeModal = () => {
    const root = qs('#modal-root');
    if (root) {
      setHTML(root, '');
    }
    state.activeId = 0;
  };

  const syncHardcopyConditionalFields = () => {
    const form = document.getElementById('validationHardcopyForm');
    if (!(form instanceof HTMLFormElement)) return;

    const syncOther = (selectName, wrapSelector, inputSelector) => {
      const select = form.querySelector(`[data-hardcopy-${selectName}]`);
      const wrap = form.querySelector(wrapSelector);
      const input = form.querySelector(inputSelector);
      if (!(select instanceof HTMLSelectElement) || !(wrap instanceof HTMLElement) || !(input instanceof HTMLInputElement)) return;

      const isOther = select.value === 'Other';
      wrap.hidden = !isOther;
      input.disabled = !isOther;
      input.required = isOther;
      if (!isOther) input.value = '';
    };

    syncOther('sector', '[data-hardcopy-sector-other-wrap]', '[data-hardcopy-sector-other]');
    syncOther('livelihood', '[data-hardcopy-livelihood-other-wrap]', '[data-hardcopy-livelihood-other]');
  };

  const openHardcopyModal = () => {
    const root = qs('#modal-root');
    if (!root) return;
    setHTML(root, hardcopyFieldMarkup());
    syncHardcopyConditionalFields();
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
    setHTML(root, buildModalMarkup(response.registration, response.matchedRecord || null, response.matchedFields || []));
  };

  const handleDuplicateReview = async (button) => {
    const registrationId = Number(button.dataset.registrationId || 0);
    const action = button.dataset.dupAction || '';
    const duplicateOf = Number(button.dataset.duplicateOf || 0);
    if (!registrationId || !action) return;

    button.disabled = true;
    const response = await apiPost('api/validation/review-duplicate', { registrationId, action, duplicateOf });
    button.disabled = false;

    if (!response.ok) {
      renderNotice(response.message || 'Unable to process duplicate action.', 'danger');
      return;
    }

    state.data = response.state || state.data;
    renderSummary();
    renderTables();
    setActiveTab(state.activeTab);
    renderNotice(response.message || 'Duplicate action saved.', 'info');
    closeModal();
  };

  const refresh = async (noticeMessage = '', noticeTone = 'info') => {
    const params = state.selectedBatch ? { batch: state.selectedBatch } : {};
    const response = await apiGet('api/validation', params);
    if (!response.ok) {
      renderNotice(response.message || 'Unable to load validation records.', 'danger');
      return;
    }

    const d = response.data || {};
    state.data = {
      summary: d.summary || state.data.summary,
      pending: Array.isArray(d.pending) ? d.pending : [],
      possibleDuplicates: Array.isArray(d.possibleDuplicates) ? d.possibleDuplicates : [],
      markedDuplicates: Array.isArray(d.markedDuplicates) ? d.markedDuplicates : [],
      selected: Array.isArray(d.selected) ? d.selected : [],
      saved: Array.isArray(d.saved) ? d.saved : [],
    };
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

  let currentBatchMetrics = null;

  const updateBatchExplanationAndAction = () => {
    if (!currentBatchMetrics) return;
    const select = document.getElementById('batchModalTargetSelect');
    if (!select) return;

    const target = select.value;
    const active = currentBatchMetrics.activeBatch || 'Batch 3';
    const next = currentBatchMetrics.nextBatch || 'Batch 4';
    const waitlisted = Number(currentBatchMetrics.waitlistedCount || 0);

    const explanationEl = document.getElementById('batchModalExplanationText');
    const btnTextEl = document.getElementById('batchModalBtnText');

    if (target === active) {
      if (explanationEl) {
        explanationEl.textContent = `${active} is currently active. Public Stage 1 registrations and intake processes are assigned to ${active}.`;
      }
      if (btnTextEl) {
        btnTextEl.textContent = `Keep ${active}`;
      }
    } else if (target === next) {
      if (explanationEl) {
        explanationEl.textContent = `Advancing to ${next} will activate a new intake cohort. ${waitlisted > 0 ? `${waitlisted} waitlisted applicant(s) will automatically be promoted to Pending in ${next}.` : 'New public registrants will be enrolled in ' + next + '.'}`;
      }
      if (btnTextEl) {
        btnTextEl.textContent = `Advance to ${next}`;
      }
    } else {
      if (explanationEl) {
        explanationEl.textContent = `Switching to ${target} will set the active intake cohort to ${target} for review and intake validation.`;
      }
      if (btnTextEl) {
        btnTextEl.textContent = `Switch to ${target}`;
      }
    }
  };

  const openBatchModal = async () => {
    const modal = document.getElementById('batchSwitchModal');
    if (!modal) return;

    const feedback = document.getElementById('batchModalFeedback');
    if (feedback) {
      feedback.hidden = true;
      feedback.textContent = '';
    }

    const res = await apiGet('api/validation/batch-metrics');
    if (res.ok && res.data) {
      currentBatchMetrics = res.data;
      const d = res.data;
      const active = d.activeBatch || 'Batch 3';
      const next = d.nextBatch || 'Batch 4';
      const all = Array.isArray(d.allBatches) ? d.allBatches : ['Batch 1', 'Batch 2', 'Batch 3'];

      const activeEl = document.getElementById('batchModalActiveName');
      if (activeEl) activeEl.textContent = active;

      const waitEl = document.getElementById('batchModalWaitlistCount');
      if (waitEl) waitEl.textContent = `${d.waitlistedCount || 0} applicants`;

      const select = document.getElementById('batchModalTargetSelect');
      if (select) {
        select.innerHTML = '';
        all.forEach((b) => {
          const opt = document.createElement('option');
          opt.value = b;
          opt.textContent = b === active ? `${b} (Current Active)` : b;
          if (b === active) opt.selected = true;
          select.appendChild(opt);
        });

        if (!all.includes(next)) {
          const nextOpt = document.createElement('option');
          nextOpt.value = next;
          nextOpt.textContent = `+ Advance to ${next} (New Cohort)`;
          select.appendChild(nextOpt);
        }
      }

      updateBatchExplanationAndAction();
    }

    modal.hidden = false;
  };

  const closeBatchModal = () => {
    const modal = document.getElementById('batchSwitchModal');
    if (modal) modal.hidden = true;
  };

  const handleSwitchBatchConfirm = async () => {
    const btn = document.getElementById('confirmSwitchBatchBtn');
    const feedback = document.getElementById('batchModalFeedback');
    const select = document.getElementById('batchModalTargetSelect');
    const targetBatch = select ? select.value : '';

    if (!targetBatch) return;

    const activeEl = document.getElementById('batchModalActiveName');
    const currentActive = activeEl ? activeEl.textContent.trim() : '';

    if (targetBatch === currentActive) {
      closeBatchModal();
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Switching...';
    }

    const res = await apiPost('api/validation/switch-batch', { targetBatch });

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-check mr-1"></i> <span id="batchModalBtnText">Switch to ${escapeHtml(targetBatch)}</span>`;
    }

    if (!res.ok) {
      if (feedback) {
        feedback.className = 'notice danger';
        feedback.textContent = res.message || 'Failed to switch batch.';
        feedback.hidden = false;
      }
      return;
    }

    closeBatchModal();
    state.selectedBatch = targetBatch;
    await refresh(res.message || `Active batch set to ${targetBatch}.`, 'info');
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

      if (targetNode.matches('[data-batch-modal-close]') || targetNode.closest('[data-batch-modal-close]')) {
        closeBatchModal();
      }

      const actionButton = targetNode.closest('[data-validation-action]');
      if (actionButton instanceof HTMLElement) {
        handleReview(actionButton);
      }

      const dupButton = targetNode.closest('[data-dup-action]');
      if (dupButton instanceof HTMLElement) {
        handleDuplicateReview(dupButton);
      }
    });

    const batchModal = document.getElementById('batchSwitchModal');
    if (batchModal) {
      batchModal.addEventListener('click', (e) => {
        if (e.target === batchModal) {
          closeBatchModal();
        }
      });
    }

    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.id === 'validationHardcopyForm') {
        event.preventDefault();
        handleHardcopySubmit(form);
      }
    });

    document.addEventListener('change', (event) => {
      const targetNode = event.target;
      if (targetNode instanceof HTMLElement && targetNode.closest('#validationHardcopyForm')) {
        syncHardcopyConditionalFields();
      }
    });

    document.getElementById('validationRefreshButton')?.addEventListener('click', () => {
      refresh('Validation queue refreshed.');
    });

    document.getElementById('validationHardcopyButton')?.addEventListener('click', openHardcopyModal);
    document.getElementById('validationCohortFilter')?.addEventListener('change', (event) => {
      state.selectedBatch = event.target.value;
      refresh();
    });
    document.getElementById('batchSwitchButton')?.addEventListener('click', openBatchModal);
    document.getElementById('confirmSwitchBatchBtn')?.addEventListener('click', handleSwitchBatchConfirm);
    document.getElementById('batchModalTargetSelect')?.addEventListener('change', updateBatchExplanationAndAction);

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
