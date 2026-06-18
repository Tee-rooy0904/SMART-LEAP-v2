(function () {
  window.App = window.App || {};
  window.App.modules = window.App.modules || {};

  const state = {
    bound: false,
    activeRegistrationId: 0,
    filters: {
      search: '',
      status: '',
      pdo: '',
    },
  };

  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');

  function routeUrl(path) {
    return `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;
  }

  function overview() {
    return window.SMARTLEAP_ADMIN_OVERVIEW || {};
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(value) {
    const parsed = new Date(value || '');
    if (Number.isNaN(parsed.getTime())) return 'Not recorded';
    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatDate(value) {
    const parsed = new Date(value || '');
    if (Number.isNaN(parsed.getTime())) return 'Not recorded';
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function registrations() {
    const items = Array.isArray(overview().coMakerRegistrations) ? overview().coMakerRegistrations : [];
    const filters = state.filters;
    const search = normalize(filters.search);

    return items.filter((item) => {
      const searchable = normalize([
        item.name,
        item.email,
        item.primaryBeneficiaryName,
        item.primaryBusinessName,
        item.primaryBarangay,
        item.assignedPdo?.name,
        item.relationshipToPrimaryBeneficiary,
      ].join(' '));
      const status = normalize(item.registrationStatus);
      const pdo = normalize(item.assignedPdo?.name || 'Unassigned');

      return (!search || searchable.includes(search))
        && (!filters.status || status === filters.status)
        && (!filters.pdo || pdo === filters.pdo);
    });
  }

  function registrationById(id) {
    const items = Array.isArray(overview().coMakerRegistrations) ? overview().coMakerRegistrations : [];
    return items.find((item) => Number(item.id || 0) === Number(id || 0)) || null;
  }

  function humanizeStatus(value) {
    const normalized = normalize(value);
    if (normalized === 'pending_review') return 'Pending Review';
    if (normalized === 'approved' || normalized === 'active') return 'Approved';
    if (normalized === 'deceased') return 'Deceased';
    if (normalized === 'rejected') return 'Rejected';
    if (normalized === 'inactive') return 'Inactive';
    return normalized ? normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Not Set';
  }

  function statusClass(value) {
    const normalized = normalize(value);
    if (normalized === 'approved' || normalized === 'active') return 'is-success';
    if (normalized === 'deceased' || normalized === 'rejected') return 'is-danger';
    if (normalized === 'pending_review') return 'is-warning';
    return 'is-muted';
  }

  function statusBadge(label, value) {
    return `<span class="status-badge ${statusClass(value)}">${escapeHtml(label)}</span>`;
  }

  function relationshipMeta(item) {
    const details = [];
    if (String(item.gender || '').trim() !== '') {
      details.push(escapeHtml(String(item.gender)));
    }
    if (Number(item.age || 0) > 0) {
      details.push(`${escapeHtml(String(item.age))} yrs old`);
    }
    return details.join(', ');
  }

  function renderSnapshots() {
    const root = qs('adminCoMakerSnapshots');
    if (!root) return;

    const summary = overview().coMakerRegistrationSummary || {};
    const cards = [
      ['Pending Review', Number(summary.pendingReview || 0)],
      ['Approved', Number(summary.approved || 0)],
      ['Rejected', Number(summary.rejected || 0)],
      ['Total', Number(summary.total || 0)],
    ];

    root.innerHTML = cards.map(([label, value]) => `
      <article class="metric-card metric-card--soft admin-beneficiaries-snapshot-card">
        <span class="metric-card__label">${escapeHtml(label)}</span>
        <strong class="metric-card__value">${value}</strong>
      </article>
    `).join('');
  }

  function renderPdoFilter() {
    const select = qs('adminCoMakerPdoFilter');
    if (!select) return;

    const values = Array.from(new Set((Array.isArray(overview().coMakerRegistrations) ? overview().coMakerRegistrations : [])
      .map((item) => String(item.assignedPdo?.name || 'Unassigned').trim())
      .filter(Boolean)))
      .sort((left, right) => left.localeCompare(right));

    const current = normalize(state.filters.pdo);
    select.innerHTML = `
      <option value="">All PDOs</option>
      ${values.map((value) => `<option value="${escapeHtml(normalize(value))}"${normalize(value) === current ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}
    `;
  }

  function renderTable() {
    const body = qs('adminCoMakerTableBody');
    const count = qs('adminCoMakerCount');
    if (!body) return;

    const rows = registrations();
    if (count) {
      count.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    }

    if (!rows.length) {
      body.innerHTML = '<div class="admin-co-maker-roster__empty">No co-maker registrations yet.</div>';
      return;
    }

    body.innerHTML = rows.map((item) => `
      <article class="admin-co-maker-roster__row">
        <div class="admin-co-maker-roster__cell admin-co-maker-roster__cell--co-maker">
          <div class="admin-beneficiary-person">
            <strong>${escapeHtml(item.name || 'Unnamed co-maker')}</strong>
            <span>${escapeHtml(item.email || 'No email')}</span>
            <small>${escapeHtml(item.contactNumber || 'No contact')}</small>
          </div>
        </div>
        <div class="admin-co-maker-roster__cell admin-co-maker-roster__cell--primary">
          <div class="admin-beneficiary-stack">
            <strong>${escapeHtml(item.primaryBeneficiaryName || 'Unknown primary')}</strong>
            <span>${escapeHtml(item.primaryBusinessName || 'No business name')}</span>
            <small>${escapeHtml(item.primaryBarangay || item.primaryAddress || 'No beneficiary details')}</small>
          </div>
        </div>
        <div class="admin-co-maker-roster__cell admin-co-maker-roster__cell--relationship">
          <div class="admin-co-maker-cell admin-co-maker-cell--relationship">
            <div class="admin-beneficiary-stack admin-beneficiary-stack--compact">
              <strong>${escapeHtml(item.relationshipToPrimaryBeneficiary || 'Not set')}</strong>
              ${relationshipMeta(item) ? `<small>${relationshipMeta(item)}</small>` : ''}
            </div>
          </div>
        </div>
        <div class="admin-co-maker-roster__cell admin-co-maker-roster__cell--status">
          <div class="admin-co-maker-cell admin-co-maker-cell--status">
            ${statusBadge(humanizeStatus(item.registrationStatus), item.registrationStatus)}
          </div>
        </div>
        <div class="admin-co-maker-roster__cell admin-co-maker-roster__cell--assigned">
          <div class="admin-co-maker-cell admin-co-maker-cell--stack">
            <div class="admin-beneficiary-stack admin-beneficiary-stack--compact">
              <strong>${escapeHtml(item.assignedPdo?.name || 'Unassigned')}</strong>
              <small>${escapeHtml(item.assignedPdo?.email || 'No PDO email')}</small>
            </div>
          </div>
        </div>
        <div class="admin-co-maker-roster__cell admin-co-maker-roster__cell--submitted">
          <div class="admin-co-maker-cell admin-co-maker-cell--stack">
            <div class="admin-beneficiary-stack admin-beneficiary-stack--compact">
              <strong>${escapeHtml(formatDate(item.createdAt || item.updatedAt))}</strong>
              <small>${escapeHtml(item.accountActive ? 'Portal access active' : 'Portal access disabled')}</small>
            </div>
          </div>
        </div>
        <div class="admin-co-maker-roster__cell admin-co-maker-roster__cell--actions">
          <div class="admin-co-maker-cell admin-co-maker-cell--actions">
            <button type="button" class="action-button action-button--review" data-open-co-maker="${item.id}">View</button>
          </div>
        </div>
      </article>
    `).join('');
  }

  function fileCardMarkup(label, file) {
    const url = String(file?.url || '');
    const mimeType = String(file?.mimeType || '');
    const isImage = mimeType.startsWith('image/');

    if (!url) {
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
          <a href="${escapeHtml(url)}" class="app-btn-outline validation-upload-card__link" target="_blank" rel="noopener">Open file</a>
        </div>
        ${isImage ? `<div class="validation-upload-card__preview"><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}"></div>` : ''}
        <div class="validation-upload-card__meta">
          <strong>${escapeHtml(file?.name || 'Uploaded file')}</strong>
          <span>${escapeHtml(mimeType || '--')}</span>
        </div>
      </article>
    `;
  }

  function buildModalMarkup(item) {
    const pending = normalize(item.registrationStatus) === 'pending_review';
    const portalState = item.accountActive ? 'Portal access active' : 'Portal access disabled';
    const portalStateKey = item.accountActive ? 'approved' : 'inactive';
    const beneficiaryState = item.primaryBeneficiaryStatus || 'deceased';

    return `
      <div class="modal-overlay co-maker-review-modal" data-co-maker-modal>
        <div class="modal-card co-maker-review-modal__card validation-review-modal__card" role="dialog" aria-modal="true" aria-labelledby="coMakerModalTitle">
          <div class="modal-header">
            <div class="validation-review-modal__title">
              <span class="admin-inline-pill">Co-maker Registration</span>
              <h3 class="modal-title" id="coMakerModalTitle">${escapeHtml(item.name || 'Unnamed co-maker')}</h3>
              <small>Submitted ${escapeHtml(formatDateTime(item.createdAt || item.updatedAt))}</small>
            </div>
            <div class="validation-review-modal__status">
              ${statusBadge(humanizeStatus(item.registrationStatus), item.registrationStatus)}
              <button class="modal-close" type="button" data-close-co-maker-modal aria-label="Close">&times;</button>
            </div>
          </div>
          <div class="modal-body validation-review-modal__body">
            <section class="validation-record-grid">
              <article class="validation-record-card">
                <span class="validation-record-card__label">Email</span>
                <strong>${escapeHtml(item.email || 'No email')}</strong>
              </article>
              <article class="validation-record-card">
                <span class="validation-record-card__label">Contact Number</span>
                <strong>${escapeHtml(item.contactNumber || 'No contact number')}</strong>
              </article>
              <article class="validation-record-card">
                <span class="validation-record-card__label">Age</span>
                <strong>${escapeHtml(item.age ? String(item.age) : 'Not set')}</strong>
              </article>
              <article class="validation-record-card">
                <span class="validation-record-card__label">Gender</span>
                <strong>${escapeHtml(item.gender || 'Not set')}</strong>
              </article>
              <article class="validation-record-card">
                <span class="validation-record-card__label">Relationship</span>
                <strong>${escapeHtml(item.relationshipToPrimaryBeneficiary || 'Not set')}</strong>
              </article>
              <article class="validation-record-card">
                <span class="validation-record-card__label">Assigned PDO</span>
                <strong>${escapeHtml(item.assignedPdo?.name || 'Unassigned')}</strong>
                <p>${escapeHtml(item.assignedPdo?.email || 'No PDO email')}</p>
              </article>
              <article class="validation-record-card">
                <span class="validation-record-card__label">Primary Beneficiary Status</span>
                <strong>${statusBadge(humanizeStatus(beneficiaryState), beneficiaryState)}</strong>
              </article>
              <article class="validation-record-card">
                <span class="validation-record-card__label">Portal Access</span>
                <strong>${statusBadge(portalState, portalStateKey)}</strong>
              </article>
              <article class="validation-record-card validation-record-card--wide">
                <span class="validation-record-card__label">Primary Beneficiary</span>
                <strong>${escapeHtml(item.primaryBeneficiaryName || 'Unknown primary beneficiary')}</strong>
                <p>${escapeHtml(item.primaryBusinessName || 'No business name')}</p>
                <p>${escapeHtml(item.primaryBarangay || item.primaryAddress || 'No beneficiary location')}</p>
              </article>
            </section>

            <section class="validation-upload-grid">
              ${fileCardMarkup('Valid ID', item.validId)}
              ${fileCardMarkup('Relationship Document', item.relationshipDocument)}
            </section>
          </div>
          <div class="modal-footer validation-review-modal__footer">
            <button type="button" class="btn btn-outline-secondary" data-close-co-maker-modal>Close</button>
            ${pending ? `<button type="button" class="btn btn-danger" data-co-maker-reject="${item.id}">Reject</button>` : ''}
            ${pending ? `<button type="button" class="btn btn-success" data-co-maker-approve="${item.id}">Approve</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function closeModal() {
    const root = qs('modal-root');
    if (root) {
      root.innerHTML = '';
    }
    state.activeRegistrationId = 0;
  }

  function openModal(id) {
    const root = qs('modal-root');
    const item = registrationById(id);
    if (!root || !item) return;
    state.activeRegistrationId = Number(id || 0);
    root.innerHTML = buildModalMarkup(item);
  }

  async function review(id, decision) {
    const body = new URLSearchParams();
    body.set('registrationId', String(id || 0));
    body.set('decision', decision);

    try {
      const response = await fetch(routeUrl('admin/co-maker-registrations/review'), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        credentials: 'same-origin',
        body: body.toString(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        return { ok: false, message: data.message || 'Unable to update co-maker registration.' };
      }
      return data;
    } catch (_error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  }

  function render() {
    if (!qs('co-makers-section')) return;
    renderSnapshots();
    renderPdoFilter();
    renderTable();
    if (state.activeRegistrationId > 0) {
      openModal(state.activeRegistrationId);
    }
  }

  function bind() {
    const section = qs('co-makers-section');
    const modalRoot = qs('modal-root');
    if (!section || state.bound) return;
    state.bound = true;

    qs('adminCoMakerClearFilters')?.addEventListener('click', () => {
      state.filters = { search: '', status: '', pdo: '' };
      if (qs('adminCoMakerSearch')) qs('adminCoMakerSearch').value = '';
      if (qs('adminCoMakerStatusFilter')) qs('adminCoMakerStatusFilter').value = '';
      render();
    });

    qs('adminCoMakerSearch')?.addEventListener('input', (event) => {
      state.filters.search = String(event.target.value || '');
      renderTable();
    });
    qs('adminCoMakerStatusFilter')?.addEventListener('change', (event) => {
      state.filters.status = normalize(event.target.value || '');
      renderTable();
    });
    qs('adminCoMakerPdoFilter')?.addEventListener('change', (event) => {
      state.filters.pdo = normalize(event.target.value || '');
      renderTable();
    });

    section.addEventListener('click', (event) => {
      const view = event.target.closest('[data-open-co-maker]');
      if (!view) return;
      openModal(Number(view.dataset.openCoMaker || 0));
    });

    modalRoot?.addEventListener('click', async (event) => {
      const close = event.target.closest('[data-close-co-maker-modal]');
      const approve = event.target.closest('[data-co-maker-approve]');
      const reject = event.target.closest('[data-co-maker-reject]');
      const overlay = event.target.matches('[data-co-maker-modal]');

      if (close || overlay) {
        closeModal();
        return;
      }

      if (!approve && !reject) return;

      const id = Number((approve || reject).dataset.coMakerApprove || (approve || reject).dataset.coMakerReject || 0);
      const decision = approve ? 'approve' : 'reject';
      const result = await review(id, decision);
      if (!result.ok) {
        window.App?.adminShell?.notify?.(result.message || 'Unable to update co-maker registration.', true);
        return;
      }
      closeModal();
      await window.App?.adminShell?.refresh?.('manual');
      window.App?.adminShell?.notify?.(result.message || 'Co-maker registration updated.', false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.activeRegistrationId > 0) {
        closeModal();
      }
    });
  }

  function init() {
    bind();
    render();
  }

  window.App.modules.coMakerRegistrations = { init, render };
})();
