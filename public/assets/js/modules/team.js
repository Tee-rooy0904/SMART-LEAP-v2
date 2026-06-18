/*
 * SMART LEAP FILE GUIDE
 * Shared team management module.
 * Builds staff roster tables, team filters, add/edit staff modals, assignment controls, and signature management interactions.
 */
(function () {
  const { qs, on, setHTML } = window.App.dom;
  const { formatDate } = window.App.format;

  const state = {
    filters: { role: '', status: '', districtCode: '', search: '' },
    staff: [],
    meta: { roles: [], statuses: [], districts: [], barangays: [], trainingGroups: [] },
    editingId: null,
    signatureBusy: false,
  };

  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');

  const routeUrl = (path) => `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;
  const teamSection = () => qs('#team-section');
  const teamModalHost = () => {
    let host = document.getElementById('team-modal-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'team-modal-host';
      document.body.appendChild(host);
    }
    return host;
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
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => body.append(`${key}[]`, item));
        return;
      }
      body.append(key, value ?? '');
    });

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

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const firstError = (errors) => {
    if (!errors || typeof errors !== 'object') return '';
    const values = Object.values(errors);
    return values.length ? values[0] : '';
  };

  const getRoleLabel = (role) => {
    const match = (state.meta.roles || []).find((item) => item.value === role);
    return match ? match.label : role;
  };

  const isProjectDevelopmentOfficerRole = (role, labelOverride = '') => {
    const value = String(role || '').trim().toLowerCase();
    const label = String(labelOverride || getRoleLabel(role) || '').trim().toLowerCase();
    if (value === 'social_worker' || label.includes('social worker')) return false;
    if (value === 'admin' || label.includes('admin')) return false;
    return value === 'pdo'
      || value === 'project_officer'
      || label === 'pdo'
      || label.includes('project officer')
      || label.includes('project development officer');
  };

  const statusClass = (status) => {
    const value = String(status || '').toLowerCase();
    if (value === 'active') return 'is-success';
    if (value === 'disabled') return 'is-danger';
    return 'is-warning';
  };

  const statusLabel = (status) => {
    const value = String(status || '').toLowerCase();
    if (value === 'active') return 'Enable';
    if (value === 'disabled') return 'Disabled';
    return status || 'Unknown';
  };

  const roleDescription = (role) => {
    if (role === 'pdo') {
      return 'Project Development Officers can be assigned to districts for applicant, beneficiary, training, and repayment operations.';
    }
    if (role === 'social_worker') {
      return '';
    }
    if (role === 'admin') {
      return 'Administrators manage system-wide access, oversight, and configuration.';
    }
    return '';
  };

  const deriveNameParts = (staff = null) => {
    const fullName = String(staff?.name || '').trim();
    const firstName = String(staff?.firstName || '').trim();
    const middleName = String(staff?.middleName || '').trim();
    const lastName = String(staff?.lastName || '').trim();
    if (firstName || lastName) {
      return { firstName, middleName, lastName };
    }
    const parts = fullName.split(/\s+/).filter(Boolean);
    return {
      firstName: parts.shift() || '',
      middleName: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
      lastName: parts.length ? parts[parts.length - 1] : '',
    };
  };

  const composeFullName = ({ firstName = '', middleName = '', lastName = '' }) => {
    return [firstName, middleName, lastName].map((value) => String(value || '').trim()).filter(Boolean).join(' ').trim();
  };

  const photoMarkup = (staff = null) => {
    const initials = composeFullName(deriveNameParts(staff)).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'SL';
    if (staff?.photo) {
      return `<div class="team-profile-photo__frame"><img src="${escapeHtml(staff.photo)}" alt="${escapeHtml(staff.name || 'Staff profile photo')}"></div>`;
    }
    return `<div class="team-profile-photo__frame team-profile-photo__frame--placeholder" aria-hidden="true">${escapeHtml(initials)}</div>`;
  };

  const updateAssignmentSummary = () => {
    const block = qs('#team-assignment-block');
    if (!block) return;

    const selectedInput = block.querySelector('input[name="districtCode"]:checked');
    const selectedDistrictName = String(selectedInput?.dataset.districtName || '').trim();
    const counts = [qs('#team-assignment-count'), qs('#team-assignment-side-count')].filter(Boolean);
    const selected = qs('#team-assignment-selected');

    counts.forEach((count) => {
      count.textContent = selectedDistrictName ? '1 selected' : '0 selected';
    });

    if (selected) {
      selected.innerHTML = selectedDistrictName
        ? `<span>${escapeHtml(selectedDistrictName)}</span>`
        : '<em>No district assigned yet.</em>';
    }
  };

  const filterAssignmentOptions = (query) => {
    const value = String(query || '').trim().toLowerCase();
    document.querySelectorAll('[data-district-option]').forEach((option) => {
      const name = String(option.dataset.districtName || '').toLowerCase();
      option.hidden = Boolean(value) && !name.includes(value);
    });
  };

  const getVisibleStaff = () => {
    const districtCode = String(state.filters.districtCode || '');
    return (state.staff || []).filter((item) => {
      if (!districtCode) return true;
      return (item.assignedDistricts || []).some((district) => String(district.code) === districtCode);
    });
  };

  const renderShell = () => {
    const section = teamSection();
    if (!section) return;

    setHTML(section, `
      <div class="admin-section-tools">
        <div class="applications-header__actions">
          <button type="button" class="app-btn-primary" id="team-focus-form">Add Staff</button>
        </div>
      </div>
      <div class="applications-filters" id="team-filters"></div>
      <div class="team-workspace-grid">
        <div class="table-card team-table-shell" id="team-table-card"></div>
      </div>
      <div class="notice" id="team-notice" hidden></div>
    `);
    renderModalShell();
  };

  const renderModalShell = () => {
    setHTML(teamModalHost(), `
      <div class="team-modal" id="team-modal" hidden>
        <div class="team-modal__backdrop" data-team-modal-close></div>
        <div class="team-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="team-modal-title">
          <div id="team-form-card"></div>
        </div>
      </div>
    `);
  };

  const renderFilters = () => {
    const root = qs('#team-filters');
    if (!root) return;

    const roleOptions = (state.meta.roles || []).map((role) => `
      <option value="${role.value}" ${state.filters.role === role.value ? 'selected' : ''}>${role.label}</option>
    `).join('');
    const statusOptions = (state.meta.statuses || []).map((status) => `
      <option value="${status.value}" ${state.filters.status === status.value ? 'selected' : ''}>${statusLabel(status.value || status.label)}</option>
    `).join('');
    const districtOptions = (state.meta.districts || []).map((district) => `
      <option value="${district.code}" ${String(state.filters.districtCode) === String(district.code) ? 'selected' : ''}>${district.district}</option>
    `).join('');

    setHTML(root, `
      <div class="filter-group filter-group--search">
        <span class="filter-label">Search</span>
        <div class="filter-search applications-search">
          <i class="fas fa-search"></i>
          <input type="search" id="team-filter-search" placeholder="Search staff by name or email" value="${escapeHtml(state.filters.search)}">
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">Role</span>
        <select id="team-filter-role" class="filter-select">
          <option value="">All roles</option>
          ${roleOptions}
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">Status</span>
        <select id="team-filter-status" class="filter-select">
          <option value="">All statuses</option>
          ${statusOptions}
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">District</span>
        <select id="team-filter-district" class="filter-select">
          <option value="">All districts</option>
          ${districtOptions}
        </select>
      </div>
    `);
  };

  const renderTable = () => {
    const root = qs('#team-table-card');
    if (!root) return;

    const rows = getVisibleStaff().map((item) => `
      <tr>
        <td>
          <div class="applicant-cell">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.email)}</span>
          </div>
        </td>
        <td>${escapeHtml(item.roleLabel || getRoleLabel(item.role))}</td>
        <td>${item.assignedDistricts?.length ? escapeHtml(item.assignedDistricts[0].district) : '--'}</td>
        <td><span class="status-badge ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span></td>
        <td>${formatDate(item.lastLoginAt)}</td>
        <td class="actions">
          <button class="team-action-button team-action-button--primary" data-team-edit="${item.id}">Edit</button>
          <button class="team-action-button team-action-button--soft" data-team-status="${item.id}" data-next-status="${item.status === 'disabled' ? 'active' : 'disabled'}">${item.status === 'disabled' ? 'Enable' : 'Disable'}</button>
        </td>
      </tr>
    `).join('');

    setHTML(root, `
      <div class="table-toolbar">
        <h4>Staff Accounts</h4>
        <span class="chip">${getVisibleStaff().length} records</span>
      </div>
      <div class="table-wrapper">
        <table class="data-table team-roster-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Assigned District</th>
              <th>Status</th>
              <th>Last Active</th>
              <th class="actions">Actions</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6">No staff accounts found for the current filter set.</td></tr>'}</tbody>
        </table>
      </div>
    `);
  };

  const renderForm = () => {
    const root = qs('#team-form-card');
    if (!root) return;

    const editing = state.staff.find((item) => item.id === state.editingId) || null;
    const nameParts = deriveNameParts(editing);
    const roleValue = editing ? editing.role : 'pdo';
    const statusValue = editing ? editing.status : 'active';
    const selectedDistrictCode = String(editing?.assignedDistricts?.[0]?.code || '');
    const selectedRoleLabel = getRoleLabel(roleValue);
    const isPdo = isProjectDevelopmentOfficerRole(roleValue, selectedRoleLabel);
    const modalTitle = editing ? 'Edit Staff Account' : 'Add Staff Account';
    const assignedCount = selectedDistrictCode ? 1 : 0;
    setHTML(root, `
      <div class="team-form-header">
        <div>
          <span class="team-form-kicker">Staff Editor</span>
          <h4>${editing ? escapeHtml(editing.name) : 'Create a new staff profile'}</h4>
        </div>
        <button class="team-action-button team-action-button--soft" id="team-cancel-edit" type="button" aria-label="Close add staff modal">Close</button>
      </div>
      <form id="team-form" class="team-form-layout team-form-layout--stacked">
        <input type="hidden" name="staffId" value="${editing ? editing.id : ''}">
        <div class="team-form-main">
          <section class="team-form-panel team-form-panel--hero">
            <div class="team-form-hero">
              <div class="team-profile-photo">
                ${photoMarkup(editing)}
              </div>
              <div class="team-form-hero__copy">
                <span class="team-form-panel__eyebrow">Staff Summary</span>
                <h5>${editing ? escapeHtml(editing.name) : 'New staff account'}</h5>
                <div class="team-role-pills">
                  <span class="team-role-pill" id="team-role-summary">${escapeHtml(selectedRoleLabel)}</span>
                  ${isPdo ? '<span class="team-role-pill is-active" id="team-coverage-summary">District Coverage Enabled</span>' : ''}
                </div>
              </div>
              ${isPdo ? `<div class="team-form-hero__meta" id="team-coverage-snapshot">
                <span class="team-form-side__eyebrow">Coverage Snapshot</span>
                <strong id="team-assignment-side-count">${assignedCount} selected</strong>
              </div>` : ''}
            </div>
          </section>

          <section class="team-form-panel">
            <div class="team-form-panel__header">
              <div>
                <span class="team-form-panel__eyebrow">Identity</span>
                <h5>Staff profile</h5>
              </div>
            </div>
            <div class="team-form-grid">
              <label>
                <span>First name</span>
                <input type="text" name="firstName" value="${escapeHtml(nameParts.firstName)}" required>
              </label>
              <label>
                <span>Middle name</span>
                <input type="text" name="middleName" value="${escapeHtml(nameParts.middleName)}">
              </label>
              <label>
                <span>Last name</span>
                <input type="text" name="lastName" value="${escapeHtml(nameParts.lastName)}" required>
              </label>
              <label>
                <span>Email</span>
                <input type="email" name="email" value="${editing ? escapeHtml(editing.email) : ''}" required>
              </label>
              <label>
                <span>Contact Number</span>
                <input type="text" name="contactNumber" value="${editing?.contactNumber ? escapeHtml(editing.contactNumber) : ''}">
              </label>
              <label>
                <span>Position</span>
                <input type="text" name="positionTitle" value="${editing?.positionTitle ? escapeHtml(editing.positionTitle) : escapeHtml(selectedRoleLabel)}">
              </label>
            </div>
          </section>

          <section class="team-form-panel">
            <div class="team-form-panel__header">
              <div>
                <span class="team-form-panel__eyebrow">Access Control</span>
                <h5>Role and portal status</h5>
              </div>
            </div>
            <div class="team-form-grid">
              <label>
                <span>Role</span>
                <select name="role" id="team-role-select">
                  ${(state.meta.roles || []).map((role) => `<option value="${role.value}" ${role.value === roleValue ? 'selected' : ''}>${role.label}</option>`).join('')}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select name="status">
                  ${(state.meta.statuses || []).map((status) => `<option value="${status.value}" ${status.value === statusValue ? 'selected' : ''}>${statusLabel(status.value || status.label)}</option>`).join('')}
                </select>
              </label>
              <label class="team-form-grid__wide">
                <span>${editing ? 'Password Reset' : 'Password'}</span>
                <input type="password" name="password" ${editing ? '' : 'required'}>
              </label>
            </div>
          </section>

          ${isPdo ? `<section class="team-form-panel team-assignment-panel" id="team-assignment-block">
            <div class="team-assignment-panel__header">
              <div>
                <span class="team-form-panel__eyebrow">District Coverage</span>
                <h5>District coverage</h5>
              </div>
              <span class="team-assignment-count" id="team-assignment-count">${assignedCount} selected</span>
            </div>
            <div class="team-assignment-toolbar">
              <label class="team-assignment-search">
                <span>Search district</span>
                <input type="search" id="team-assignment-search" placeholder="Type a district name">
              </label>
              <button type="button" class="team-action-button team-action-button--soft" id="team-assignment-clear">Clear district</button>
            </div>
            <div class="team-assignment-selected" id="team-assignment-selected">
              ${selectedDistrictCode && editing?.assignedDistricts?.length
                ? `<span>${escapeHtml(editing.assignedDistricts[0].district)}</span>`
                : '<em>No district assigned yet.</em>'}
            </div>
            <div class="team-assignment-grid">
              ${(state.meta.districts || []).map((district) => `
                <label class="team-assignment-option ${selectedDistrictCode === String(district.code) ? 'is-selected' : ''}" data-district-option data-district-name="${escapeHtml(district.district)}">
                  <input type="radio" name="districtCode" value="${district.code}" data-district-name="${escapeHtml(district.district)}" ${selectedDistrictCode === String(district.code) ? 'checked' : ''}>
                  <span class="team-assignment-option__text"><strong>${district.district}</strong><small>${escapeHtml(district.office || '')}</small></span>
                </label>
              `).join('')}
            </div>
          </section>` : ''}

          <div class="team-form-actions">
            <button type="button" class="team-action-button team-action-button--soft" id="team-form-cancel">Cancel</button>
            <button type="submit" class="team-action-button team-action-button--primary">${editing ? 'Save Changes' : 'Create Account'}</button>
          </div>
        </div>
      </form>
    `);
  };

  const showNotice = (message, tone = 'info') => {
    const notice = qs('#team-notice');
    if (!notice) return;
    notice.hidden = false;
    notice.className = `notice ${tone}`;
    notice.textContent = message;
  };

  const load = async () => {
    const response = await apiGet('api/team', {
      role: state.filters.role,
      status: state.filters.status,
      search: state.filters.search,
    });
    if (response.redirect) {
      window.location.href = routeUrl(response.redirect);
      return;
    }
    if (!response.ok) {
      showNotice(response.message || 'Unable to load staff accounts.', 'danger');
      return;
    }

    state.staff = response.staff || [];
    state.meta = response.meta || state.meta;
    renderFilters();
    renderTable();
    renderForm();
  };

  const createOrUpdate = async (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      showNotice('Unable to read the team form.', 'danger');
      return;
    }

    const formData = new FormData(form);
    const payload = {
      staffId: formData.get('staffId') || '',
      name: formData.get('name') || '',
      email: formData.get('email') || '',
      role: formData.get('role') || '',
      status: formData.get('status') || 'active',
      contactNumber: formData.get('contactNumber') || '',
      positionTitle: formData.get('positionTitle') || '',
      password: formData.get('password') || '',
      districtCode: formData.get('districtCode') || '',
      trainingGroupNumber: '',
    };
    payload.firstName = formData.get('firstName') || '';
    payload.middleName = formData.get('middleName') || '';
    payload.lastName = formData.get('lastName') || '';
    payload.name = composeFullName(payload);
    payload.districtCodes = payload.districtCode ? [payload.districtCode] : [];
    const districtMap = new Map((state.meta.districts || []).map((district) => [String(district.code), district]));
    payload.barangayIds = payload.districtCodes.flatMap((code) => {
      const district = districtMap.get(String(code));
      return (district?.barangays || []).map((barangay) => barangay.id);
    });
    if (payload.role !== 'pdo') {
      payload.barangayIds = [];
      payload.districtCodes = [];
      payload.trainingGroupNumber = '';
    }

    const isEditing = Boolean(payload.staffId);
    const response = await apiPost(isEditing ? 'api/team/update' : 'api/team', payload);
    if (response.redirect) {
      window.location.href = routeUrl(response.redirect);
      return;
    }
    if (!response.ok) {
      showNotice(firstError(response.errors) || 'Unable to save staff account.', 'danger');
      return;
    }

    if (payload.role === 'pdo') {
      const targetStaff = (response.staff || []).find((item) => String(item.id) === String(payload.staffId))
        || (response.staff || []).find((item) => item.email === payload.email);
      if (targetStaff) {
        const assignmentResponse = await apiPost('api/team/assignments', {
          staffId: targetStaff.id,
          barangayIds: payload.barangayIds,
        });
        if (assignmentResponse.redirect) {
          window.location.href = routeUrl(assignmentResponse.redirect);
          return;
        }
        if (!assignmentResponse.ok) {
          showNotice(firstError(assignmentResponse.errors) || 'Staff saved, but district assignment failed.', 'danger');
          await load();
          return;
        }
      }
    }

    state.editingId = null;
    showNotice(isEditing ? 'Staff account updated.' : 'Staff account created.', 'success');
    closeFormModal();
    await load();
  };

  const uploadSignature = async () => {
    const editing = state.staff.find((item) => item.id === state.editingId) || null;
    const input = document.getElementById('team-signature-input');
    if (!editing || !(input instanceof HTMLInputElement)) {
      showNotice('Open an existing staff profile first before uploading a signature.', 'danger');
      return;
    }

    const file = input.files?.[0];
    if (!file) {
      showNotice('Choose a signature file to upload.', 'danger');
      return;
    }

    const formData = new FormData();
    formData.append('staffId', String(editing.id));
    formData.append('signature', file);

    state.signatureBusy = true;
    renderForm();
    const response = await apiFormPost('api/team/signature', formData);
    state.signatureBusy = false;

    if (response.redirect) {
      window.location.href = routeUrl(response.redirect);
      return;
    }
    if (!response.ok) {
      renderForm();
      showNotice(firstError(response.errors) || response.message || 'Unable to save the PDO signature.', 'danger');
      return;
    }

    state.staff = response.teamStaff || state.staff;
    state.editingId = editing.id;
    renderTable();
    renderForm();
    showNotice(response.message || 'Saved signature updated.', 'success');
  };

  const openFormModal = () => {
    if (!qs('#team-modal')) {
      renderModalShell();
      renderForm();
    }
    const modal = qs('#team-modal');
    if (!modal) return;
    modal.hidden = false;
    modal.classList.add('is-open');
    document.body.classList.add('team-modal-open');
  };

  const closeFormModal = () => {
    const modal = qs('#team-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.hidden = true;
    document.body.classList.remove('team-modal-open');
  };

  const bind = () => {
    const section = teamSection();
    if (!section || section.dataset.teamBound === 'true') return;
    section.dataset.teamBound = 'true';

    on(section, 'change', (event) => {
      if (event.target.id === 'team-filter-role') {
        state.filters.role = event.target.value;
        load();
      }
      if (event.target.id === 'team-filter-status') {
        state.filters.status = event.target.value;
        load();
      }
      if (event.target.id === 'team-filter-district') {
        state.filters.districtCode = event.target.value;
        renderTable();
      }
    });

    on(section, 'input', (event) => {
      if (event.target.id === 'team-filter-search') {
        state.filters.search = event.target.value;
        load();
      }
    });

    on(section, 'click', async (event) => {
      if (event.target.closest('#team-focus-form')) {
        state.editingId = null;
        renderForm();
        openFormModal();
        return;
      }

      const edit = event.target.closest('[data-team-edit]');
      if (edit) {
        state.editingId = Number(edit.dataset.teamEdit);
        renderForm();
        openFormModal();
        return;
      }

      const statusButton = event.target.closest('[data-team-status]');
      if (statusButton) {
        const staffId = Number(statusButton.dataset.teamStatus || 0);
        const nextStatus = String(statusButton.dataset.nextStatus || '');
        if (staffId > 0 && nextStatus) {
          apiPost('api/team/status', { staffId, status: nextStatus }).then(async (response) => {
            if (response.redirect) {
              window.location.href = routeUrl(response.redirect);
              return;
            }
            if (!response.ok) {
              showNotice(firstError(response.errors) || 'Unable to update staff status.', 'danger');
              return;
            }
            showNotice(`Staff account ${nextStatus === 'disabled' ? 'disabled' : 'enabled'}.`, 'success');
            await load();
          });
        }
      }

    });

    on(document, 'change', (event) => {
      if (event.target.id === 'team-role-select') {
        const assignmentBlock = qs('#team-assignment-block');
        const roleSummary = qs('#team-role-summary');
        const coverageSummary = qs('#team-coverage-summary');
        const coverageSnapshot = qs('#team-coverage-snapshot');
        const roleDescriptionText = qs('#team-role-description');
        const signaturePanel = document.querySelector('.team-form-panel .team-signature-panel')?.closest('.team-form-panel');
        const selectedRoleLabel = event.target.selectedOptions?.[0]?.textContent || '';
        const isPdoRole = isProjectDevelopmentOfficerRole(event.target.value, selectedRoleLabel);
        if (assignmentBlock) {
          assignmentBlock.hidden = !isPdoRole;
        }
        if (signaturePanel) {
          signaturePanel.hidden = !isPdoRole;
        }
        if (roleSummary) {
          roleSummary.textContent = getRoleLabel(event.target.value);
        }
        if (coverageSummary) {
          coverageSummary.hidden = !isPdoRole;
          coverageSummary.textContent = 'District Coverage Enabled';
          coverageSummary.classList.add('is-active');
        }
        if (coverageSnapshot) {
          coverageSnapshot.hidden = !isPdoRole;
        }
        if (roleDescriptionText) {
          const nextDescription = roleDescription(event.target.value);
          roleDescriptionText.textContent = nextDescription;
          roleDescriptionText.hidden = !nextDescription;
        }
        if (!isPdoRole) {
          document.querySelectorAll('#team-assignment-block input[name="districtCode"]').forEach((input) => {
            input.checked = false;
            input.closest('.team-assignment-option')?.classList.remove('is-selected');
          });
        }
        updateAssignmentSummary();
      }

      const assignmentOption = event.target.closest('.team-assignment-option');
      if (assignmentOption && event.target.name === 'districtCode') {
        document.querySelectorAll('#team-assignment-block .team-assignment-option').forEach((option) => {
          option.classList.toggle('is-selected', option.contains(event.target) && event.target.checked);
        });
        updateAssignmentSummary();
      }
    });

    on(document, 'input', (event) => {
      if (event.target.id === 'team-assignment-search') {
        filterAssignmentOptions(event.target.value);
      }
    });

    on(document, 'click', (event) => {
      if (event.target.closest('#team-cancel-edit') || event.target.closest('#team-form-cancel') || event.target.closest('[data-team-modal-close]')) {
        state.editingId = null;
        renderForm();
        closeFormModal();
      }

      if (event.target.closest('#team-assignment-clear')) {
        document.querySelectorAll('#team-assignment-block input[name="districtCode"]').forEach((input) => {
          input.checked = false;
          input.closest('.team-assignment-option')?.classList.remove('is-selected');
        });
        const search = qs('#team-assignment-search');
        if (search) search.value = '';
        filterAssignmentOptions('');
        updateAssignmentSummary();
      }
    });

    on(document, 'keydown', (event) => {
      if (event.key === 'Escape') {
        state.editingId = null;
        renderForm();
        closeFormModal();
      }
    });

    on(document, 'submit', (event) => {
      if (event.target.id === 'team-form') {
        createOrUpdate(event);
      }
    });
  };

  const init = () => {
    if (!teamSection()) return;
    renderShell();
    bind();
    load();
  };

  window.App.modules = window.App.modules || {};
  window.App.modules.team = { init };
})();
