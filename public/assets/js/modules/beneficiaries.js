/*
 * SMART LEAP FILE GUIDE
 * Shared beneficiaries module for staff dashboards.
 * Builds beneficiary filters, roster rows, summary cards, export controls, and beneficiary detail/status modal content.
 */
(function () {
  window.App = window.App || {};
  window.App.modules = window.App.modules || {};

  const state = {
    bound: false,
    filters: {
      search: '',
      barangay: '',
      pdo: '',
      repayment: '',
    },
    selectedBeneficiaryId: null,
  };

  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');
  const BENEFICIARY_STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'deceased', label: 'Deceased' },
  ];

  function routeUrl(path) {
    return `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;
  }

  async function apiPost(path, payload) {
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
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
      return response.ok ? data : { ok: false, ...data };
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  }

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function firstError(errors) {
    if (!errors || typeof errors !== 'object') return '';
    for (const value of Object.values(errors)) {
      if (Array.isArray(value) && value.length && value[0]) return String(value[0]);
      if (typeof value === 'string' && value.trim() !== '') return value;
    }
    return '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatActivityTime(value) {
    const parsed = new Date(value || '');
    if (Number.isNaN(parsed.getTime())) {
      return 'No time';
    }
    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatCoMakerStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'active') return 'Approved';
    if (!normalized) return 'Not submitted';
    return normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function normalizeFilterValue(value) {
    return String(value || '').trim().toLowerCase();
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
  }

  function overview() {
    return window.SMARTLEAP_ADMIN_OVERVIEW || {};
  }

  function isApprovedBeneficiary(beneficiary) {
    if (!beneficiary || typeof beneficiary !== 'object') return false;
    const approvalDate = String(beneficiary.approvalDate || '').trim();
    return approvalDate !== '';
  }

  function getBeneficiaryRoster(data = overview()) {
    const roster = Array.isArray(data.beneficiaryRoster) ? data.beneficiaryRoster : [];
    return roster.filter(isApprovedBeneficiary);
  }

  function renderFilterOptions(select, values, currentValue, allLabel) {
    if (!select) return;
    const normalizedCurrent = normalizeFilterValue(currentValue);
    select.innerHTML = `
      <option value="">${escapeHtml(allLabel)}</option>
      ${values.map((value) => {
        const normalized = normalizeFilterValue(value);
        return `<option value="${escapeHtml(normalized)}"${normalized === normalizedCurrent ? ' selected' : ''}>${escapeHtml(value)}</option>`;
      }).join('')}
    `;
  }

  function renderFilters(data = overview()) {
    const roster = getBeneficiaryRoster(data);
    renderFilterOptions(
      document.getElementById('adminBeneficiaryBarangayFilter'),
      uniqueSorted(roster.map((beneficiary) => beneficiary.barangay || 'Unassigned')),
      state.filters.barangay,
      'All barangays'
    );
    renderFilterOptions(
      document.getElementById('adminBeneficiaryPdoFilter'),
      uniqueSorted(roster.map((beneficiary) => beneficiary.assignedPdo || 'Unassigned')),
      state.filters.pdo,
      'All PDOs'
    );

    const search = document.getElementById('adminBeneficiarySearch');
    if (search && search.value !== state.filters.search) {
      search.value = state.filters.search;
    }

    const repayment = document.getElementById('adminBeneficiaryRepaymentFilter');
    if (repayment) repayment.value = state.filters.repayment;
  }

  function renderSnapshots(data = overview()) {
    const root = document.getElementById('adminBeneficiarySnapshots');
    if (!root) return;

    const summary = data.beneficiaryRosterSummary || {};
    const beneficiarySummary = data.beneficiarySummary || {};
    const cards = [
      ['Active Beneficiaries', safeNumber(summary.active || beneficiarySummary.active)],
      ['Pending Repayment', safeNumber(summary.pendingRepayment)],
      ['Needs Follow-up', safeNumber(summary.needsFollowUp)],
      ['No Upload Yet', safeNumber(summary.noUploadYet)],
    ];

    root.innerHTML = cards.map(([label, value]) => `
      <article class="metric-card metric-card--soft admin-beneficiaries-snapshot-card">
        <span class="metric-card__label">${escapeHtml(label)}</span>
        <strong class="metric-card__value">${value}</strong>
      </article>
    `).join('');
  }

  function filteredBeneficiaries(data = overview()) {
    const filters = state.filters;
    const search = normalizeFilterValue(filters.search);
    return getBeneficiaryRoster(data).filter((beneficiary) => {
      const repaymentKey = normalizeFilterValue(beneficiary.repayment?.key);
      const barangay = normalizeFilterValue(beneficiary.barangay || 'Unassigned');
      const pdo = normalizeFilterValue(beneficiary.assignedPdo || 'Unassigned');
      const searchable = normalizeFilterValue([
        beneficiary.name,
        beneficiary.email,
        beneficiary.contactNumber,
        beneficiary.businessName,
        beneficiary.businessType,
        beneficiary.barangay,
        beneficiary.assignedPdo,
      ].join(' '));

      return (!search || searchable.includes(search))
        && (!filters.barangay || barangay === filters.barangay)
        && (!filters.pdo || pdo === filters.pdo)
        && (!filters.repayment || repaymentKey === filters.repayment);
    });
  }

  function statusClass(value) {
    return normalizeFilterValue(value).replace(/[^a-z0-9]+/g, '-');
  }

  function beneficiaryStatusClass(value, baseClass = '') {
    const normalized = normalizeStatusValue(value);
    const scoped = baseClass ? `${baseClass} ` : '';
    return `${scoped}beneficiary-status beneficiary-status--${normalized}`.trim();
  }

  function normalizeStatusValue(value) {
    const normalized = normalizeFilterValue(value);
    return ['active', 'inactive', 'deceased'].includes(normalized) ? normalized : 'active';
  }

  function renderTable(data = overview()) {
    const body = document.getElementById('adminBeneficiaryTableBody');
    const count = document.getElementById('adminBeneficiaryRosterCount');
    if (!body) return;

    const rows = filteredBeneficiaries(data);
    if (count) {
      count.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    }

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6">No approved beneficiary records yet.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((beneficiary) => {
      const repayment = beneficiary.repayment || {};
      const programLabel = beneficiary.programStatus || 'Not Set';
      const beneficiaryStatusKey = normalizeStatusValue(beneficiary.programStatus || beneficiary.status || 'active');
      const repaymentLabel = repayment.label || 'No Upload Yet';
      return `
        <tr>
          <td>
            <div class="admin-beneficiary-person">
              <strong>${escapeHtml(beneficiary.name || 'Unnamed beneficiary')}</strong>
              <span>${escapeHtml(beneficiary.businessName || 'No business name')}</span>
              <small>${escapeHtml(beneficiary.email || beneficiary.contactNumber || 'No contact')}</small>
            </div>
          </td>
          <td>
            <div class="admin-beneficiary-stack">
              <strong>${escapeHtml(beneficiary.barangay || 'Unassigned')}</strong>
              <span>${escapeHtml(beneficiary.assignedPdo || 'Unassigned')}</span>
            </div>
          </td>
          <td>
            <div class="admin-beneficiary-stack admin-beneficiary-stack--program">
              <strong><span class="${beneficiaryStatusClass(beneficiaryStatusKey, 'admin-status-chip')}">${escapeHtml(programLabel)}</span></strong>
            </div>
          </td>
          <td>
            <div class="admin-beneficiary-stack admin-beneficiary-stack--repayment">
              <strong>${escapeHtml(repaymentLabel)}</strong>
              <small>${safeNumber(repayment.uploadedReceipts)} receipt${safeNumber(repayment.uploadedReceipts) === 1 ? '' : 's'}</small>
            </div>
          </td>
          <td>${escapeHtml(formatActivityTime(beneficiary.lastActivity))}</td>
          <td class="actions">
            <div class="admin-beneficiary-actions">
              <button type="button" class="team-action-button team-action-button--primary" data-beneficiary-view="${safeNumber(beneficiary.id)}">View Details</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function beneficiaryById(id) {
    return getBeneficiaryRoster().find((beneficiary) => safeNumber(beneficiary.id) === safeNumber(id)) || null;
  }

  function eligibleRepaymentSuccessors(currentBeneficiary) {
    const currentId = safeNumber(currentBeneficiary?.id);
    const currentSuccessorId = safeNumber(currentBeneficiary?.repaymentSuccessorBeneficiaryProfileId);
    return getBeneficiaryRoster()
      .filter((beneficiary) => {
        const beneficiaryId = safeNumber(beneficiary.id);
        if (!beneficiaryId || beneficiaryId === currentId) return false;
        if (normalizeStatusValue(beneficiary.programStatus || beneficiary.status || '') === 'deceased') return false;
        const replacementFor = safeNumber(beneficiary.replacementForBeneficiaryId);
        return replacementFor === 0 || replacementFor === currentId || beneficiaryId === currentSuccessorId;
      })
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  }

  function closeModal() {
    const modal = document.getElementById('adminBeneficiaryModal');
    if (modal) modal.hidden = true;
    state.selectedBeneficiaryId = null;
  }

  function openModal(id) {
    const modal = document.getElementById('adminBeneficiaryModal');
    const title = document.getElementById('adminBeneficiaryModalTitle');
    const body = document.getElementById('adminBeneficiaryModalBody');
    const beneficiary = beneficiaryById(id);
    if (!modal || !title || !body || !beneficiary) return;

    const repayment = beneficiary.repayment || {};
    const approvalDate = beneficiary.approvalDate ? formatActivityTime(beneficiary.approvalDate) : 'Not recorded';
    const initials = String(beneficiary.name || 'Beneficiary')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'B';
    const avatarMarkup = beneficiary.photo
      ? `<div class="admin-profile-modal__avatar admin-record-sheet__avatar has-photo" style="background-image:url('${escapeHtml(beneficiary.photo)}')" aria-hidden="true"></div>`
      : `<div class="admin-record-sheet__avatar" aria-hidden="true">${escapeHtml(initials)}</div>`;
    const serviceTypeLabel = beneficiary.serviceType || beneficiary.businessType || beneficiary.sectorOtherSpecify || 'Not set';
    const coMaker = beneficiary.coMakerRegistration || null;
    const beneficiaryStatusKey = normalizeStatusValue(beneficiary.programStatus || beneficiary.status || 'active');
    state.selectedBeneficiaryId = safeNumber(beneficiary.id);
    title.textContent = beneficiary.name || 'Beneficiary Details';
    body.innerHTML = `
      <section class="admin-record-sheet admin-record-sheet--beneficiary">
        <div class="admin-record-sheet__hero">
          <div class="admin-record-sheet__avatar-wrap">
            ${avatarMarkup}
          </div>
          <div class="admin-record-sheet__identity">
            <span class="admin-record-sheet__eyebrow">Beneficiary Profile</span>
            <h3>${escapeHtml(beneficiary.name || 'Unnamed beneficiary')}</h3>
            <p>${escapeHtml(beneficiary.businessName || 'No business name')}</p>
            <div class="admin-record-sheet__pills">
              <span class="${beneficiaryStatusClass(beneficiaryStatusKey, 'admin-record-sheet__pill')}">${escapeHtml(beneficiary.programStatus || 'Not Set')}</span>
              <span class="admin-record-sheet__pill admin-record-sheet__pill--soft">${escapeHtml(repayment.label || 'No Upload Yet')}</span>
            </div>
          </div>
        </div>
        <section class="admin-record-sheet__section admin-record-sheet__section--violet">
          <div class="admin-record-sheet__section-head">
            <span>Demographic Information</span>
          </div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            <article class="admin-record-sheet__field"><span>Name</span><strong>${escapeHtml(beneficiary.name || 'Unnamed beneficiary')}</strong></article>
            <article class="admin-record-sheet__field"><span>Gender</span><strong>${escapeHtml(beneficiary.gender || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Age</span><strong>${escapeHtml(beneficiary.age ? String(beneficiary.age) : 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Age Group</span><strong>${escapeHtml(beneficiary.ageGroup || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Birthdate</span><strong>${escapeHtml(beneficiary.birthdate || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field admin-record-sheet__field--wide"><span>Email</span><strong>${escapeHtml(beneficiary.email || 'No email')}</strong></article>
            <article class="admin-record-sheet__field"><span>Contact Number</span><strong>${escapeHtml(beneficiary.contactNumber || 'No contact')}</strong></article>
            <article class="admin-record-sheet__field"><span>4Ps Membership</span><strong>${escapeHtml(beneficiary.is4ps || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Educational Attainment</span><strong>${escapeHtml(beneficiary.educationalAttainment || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field admin-record-sheet__field--wide"><span>Complete Address</span><strong>${escapeHtml(beneficiary.address || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Barangay</span><strong>${escapeHtml(beneficiary.barangay || 'Unassigned')}</strong></article>
          </div>
        </section>
        <section class="admin-record-sheet__section admin-record-sheet__section--aqua">
          <div class="admin-record-sheet__section-head">
            <span>Business and Assignment</span>
          </div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            <article class="admin-record-sheet__field admin-record-sheet__field--wide"><span>Business Name</span><strong>${escapeHtml(beneficiary.businessName || 'No business name')}</strong></article>
            <article class="admin-record-sheet__field"><span>Livelihood Category</span><strong>${escapeHtml(beneficiary.livelihoodCategory || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Service Type</span><strong>${escapeHtml(serviceTypeLabel)}</strong></article>
            <article class="admin-record-sheet__field"><span>Business Type</span><strong>${escapeHtml(beneficiary.businessType || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Sector</span><strong>${escapeHtml(beneficiary.sector || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Other Sector</span><strong>${escapeHtml(beneficiary.sectorOtherSpecify || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Assigned PDO</span><strong>${escapeHtml(beneficiary.assignedPdo || 'Unassigned')}</strong></article>
            <article class="admin-record-sheet__field"><span>Batch No</span><strong>${escapeHtml(beneficiary.batchNo || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Program Status</span><strong>${escapeHtml(beneficiary.programStatus || 'Not Set')}</strong></article>
            <label class="admin-record-sheet__field">
              <span>Beneficiary Status</span>
              <select class="admin-profile-modal__input" id="adminBeneficiaryStatusInput">
                ${BENEFICIARY_STATUS_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${normalizeStatusValue(beneficiary.programStatus || beneficiary.status || 'active') === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
              </select>
            </label>
            <article class="admin-record-sheet__field"><span>Approval Date</span><strong>${escapeHtml(approvalDate)}</strong></article>
            <article class="admin-record-sheet__field"><span>Last Activity</span><strong>${escapeHtml(formatActivityTime(beneficiary.lastActivity))}</strong></article>
          </div>
        </section>
        <section class="admin-record-sheet__section admin-record-sheet__section--amber">
          <div class="admin-record-sheet__section-head">
            <span>Repayment Summary</span>
          </div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            <article class="admin-record-sheet__field"><span>Repayment Status</span><strong>${escapeHtml(repayment.label || 'No Upload Yet')}</strong></article>
            <article class="admin-record-sheet__field"><span>Uploaded Receipts</span><strong>${safeNumber(repayment.uploadedReceipts)}</strong></article>
            <article class="admin-record-sheet__field"><span>Verified Amount</span><strong>${escapeHtml(`PHP ${Number(repayment.paidAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}</strong></article>
            <article class="admin-record-sheet__field"><span>Verified Installments</span><strong>${escapeHtml(`${safeNumber(repayment.verifiedInstallments)} / ${safeNumber(repayment.totalDueInstallments)}`)}</strong></article>
          </div>
        </section>
        ${beneficiaryStatusKey === 'deceased'
          ? `
        <section class="admin-record-sheet__section admin-record-sheet__section--aqua">
          <div class="admin-record-sheet__section-head">
            <span>Co-maker Account</span>
          </div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
                  ${!coMaker
                    ? `
                    <article class="admin-record-sheet__field admin-record-sheet__field--wide">
                      <span>Official Gmail invitation</span>
                      <strong>Awaiting PDO Gmail invitation</strong>
                      <small>Admin only tags the beneficiary as active or deceased. The assigned PDO sends the co-maker registration Gmail link, and Admin still handles the approval.</small>
                    </article>
                    `
                    : ''}
                  ${coMaker
                    ? `
                    <article class="admin-record-sheet__field">
                      <span>Submitted Name</span>
                      <strong>${escapeHtml(coMaker.name || 'Not set')}</strong>
                    </article>
                    <article class="admin-record-sheet__field">
                      <span>Registration Status</span>
                      <strong>${escapeHtml(formatCoMakerStatus(coMaker.registrationStatus))}</strong>
                    </article>
                    <article class="admin-record-sheet__field">
                      <span>Email</span>
                      <strong>${escapeHtml(coMaker.email || 'No email')}</strong>
                    </article>
                    <article class="admin-record-sheet__field">
                      <span>Contact Number</span>
                      <strong>${escapeHtml(coMaker.contactNumber || 'No contact')}</strong>
                    </article>
                    <article class="admin-record-sheet__field">
                      <span>Age</span>
                      <strong>${escapeHtml(coMaker.age ? String(coMaker.age) : 'Not set')}</strong>
                    </article>
                    <article class="admin-record-sheet__field">
                      <span>Gender</span>
                      <strong>${escapeHtml(coMaker.gender || 'Not set')}</strong>
                    </article>
                    <article class="admin-record-sheet__field admin-record-sheet__field--wide">
                      <span>Relationship to Primary Beneficiary</span>
                      <strong>${escapeHtml(coMaker.relationshipToPrimaryBeneficiary || 'Not set')}</strong>
                    </article>
                    <article class="admin-record-sheet__field">
                      <span>Valid ID</span>
                      ${coMaker?.validId?.url ? `<small><a href="${escapeHtml(coMaker.validId.url)}" target="_blank" rel="noopener">View submitted file</a></small>` : '<small>No file uploaded yet.</small>'}
                    </article>
                    <article class="admin-record-sheet__field">
                      <span>Relationship Document</span>
                      ${coMaker?.relationshipDocument?.url ? `<small><a href="${escapeHtml(coMaker.relationshipDocument.url)}" target="_blank" rel="noopener">View submitted file</a></small>` : '<small>No file uploaded yet.</small>'}
                    </article>`
                    : `
                    <article class="admin-record-sheet__field admin-record-sheet__field--wide">
                      <span>Registration Status</span>
                      <strong>Awaiting co-maker self-registration</strong>
                    </article>`
                  }
          </div>
        </section>
            `
          : ``}
      </section>
    `;
    modal.hidden = false;

    const saveButton = document.getElementById('adminBeneficiaryStatusSave');
    if (saveButton) {
      saveButton.onclick = async () => {
        const statusInput = document.getElementById('adminBeneficiaryStatusInput');
        const nextStatus = normalizeStatusValue(statusInput?.value || '');
        saveButton.disabled = true;
        const response = await apiPost('admin/beneficiaries/status', {
          beneficiaryProfileId: beneficiary.id,
          status: nextStatus,
        });
        saveButton.disabled = false;
        if (!response.ok) {
          window.App?.adminShell?.notify?.(response.message || 'Unable to update beneficiary status.', true);
          return;
        }
        await window.App?.adminShell?.refresh?.('manual');
        window.App?.adminShell?.notify?.(response.message || 'Beneficiary record updated.', false);
        openModal(id);
      };
    }
  }

  function exportCsv() {
    const rows = filteredBeneficiaries();
    const headers = ['Name', 'Email', 'Business', 'Barangay', 'Assigned PDO', 'Program Status', 'Repayment', 'Last Activity'];
    const csvRows = [
      headers,
      ...rows.map((beneficiary) => [
        beneficiary.name || '',
        beneficiary.email || '',
        beneficiary.businessName || '',
        beneficiary.barangay || '',
        beneficiary.assignedPdo || '',
        beneficiary.programStatus || '',
        beneficiary.repayment?.label || '',
        beneficiary.lastActivity || '',
      ]),
    ];
    const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'smart-leap-beneficiaries.csv';
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }

  function render() {
    const section = document.getElementById('beneficiaries-section');
    if (!section) return;
    const data = overview();
    renderSnapshots(data);
    renderFilters(data);
    renderTable(data);
  }

  function bind() {
    const section = document.getElementById('beneficiaries-section');
    if (!section || state.bound) return;
    state.bound = true;
    document.getElementById('adminBeneficiaryModal')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-beneficiary-modal-close]')) {
        closeModal();
      }
    });

      document.getElementById('adminBeneficiaryRefresh')?.addEventListener('click', () => {
        window.App?.adminShell?.refresh?.('manual');
      });

    document.getElementById('adminBeneficiaryExport')?.addEventListener('click', exportCsv);

    section.addEventListener('input', (event) => {
      if (event.target.id === 'adminBeneficiarySearch') {
        state.filters.search = event.target.value || '';
        renderTable();
      }
    });

    section.addEventListener('change', (event) => {
      const target = event.target;
      if (target.id === 'adminBeneficiaryBarangayFilter') state.filters.barangay = target.value || '';
      if (target.id === 'adminBeneficiaryPdoFilter') state.filters.pdo = target.value || '';
      if (target.id === 'adminBeneficiaryRepaymentFilter') state.filters.repayment = target.value || '';
      renderTable();
    });

      section.addEventListener('click', (event) => {
        const viewButton = event.target.closest('[data-beneficiary-view]');
        if (viewButton) {
          openModal(viewButton.dataset.beneficiaryView);
          return;
        }

        const link = event.target.closest('[data-section-link]');
        if (link) {
          window.App?.adminShell?.setSection?.(link.dataset.sectionLink || 'dashboard');
        }
    });
  }

  function init() {
    bind();
    render();
  }

  window.App.modules.beneficiaries = { init, render };
})();
