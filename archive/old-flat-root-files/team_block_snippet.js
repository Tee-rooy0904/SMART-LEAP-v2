function renderUsersSection() {
    const section = document.getElementById('users-section');
    if (!section) return;

    section.innerHTML = `
        <div class="dashboard-header">
            <div>
                <h3>Team</h3>
                <p>Manage staff accounts, assignments, and accountability.</p>
            </div>
        </div>
        <div class="team-tabs" id="team-tabs">
            <button type="button" class="team-tab is-active" data-team-tab="staff">Staff</button>
            <button type="button" class="team-tab" data-team-tab="assignments">Assignments</button>
            <button type="button" class="team-tab" data-team-tab="roles">Roles & Permissions</button>
        </div>
        <div class="team-content" id="team-content"></div>

        <div class="team-modal" id="team-modal" aria-hidden="true">
            <div class="team-modal__backdrop" data-team-close></div>
            <div class="team-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="team-modal-title">
                <div class="team-modal__header">
                    <h4 id="team-modal-title">Add Staff</h4>
                    <button type="button" class="icon-button" data-team-close aria-label="Close"><i class="fas fa-times"></i></button>
                </div>
                <div class="team-modal__body">
                    <input type="hidden" id="team-user-id">
                    <div class="team-field">
                        <label>Full Name</label>
                        <input type="text" id="team-user-name" placeholder="Enter full name">
                    </div>
                    <div class="team-field">
                        <label>Role</label>
                        <select id="team-user-role">
                            <option value="Admin">Admin</option>
                            <option value="PDO">PDO</option>
                            <option value="Social Worker">Social Worker</option>
                        </select>
                    </div>
                    <div class="team-field">
                        <label>Email</label>
                        <input type="email" id="team-user-email" placeholder="name@smartleap.gov.ph">
                    </div>
                    <div class="team-field">
                        <label>Phone (optional)</label>
                        <input type="text" id="team-user-phone" placeholder="09xx xxx xxxx">
                    </div>
                    <div class="team-field">
                        <label>Status</label>
                        <select id="team-user-status">
                            <option value="active">Active</option>
                            <option value="disabled">Disabled</option>
                        </select>
                    </div>
                </div>
                <div class="team-modal__footer">
                    <button type="button" class="app-btn-ghost" data-team-close>Cancel</button>
                    <button type="button" class="app-btn-primary" id="team-user-save">Save</button>
                </div>
            </div>
        </div>

        <div class="team-confirm" id="team-confirm" aria-hidden="true">
            <div class="team-confirm__backdrop" data-confirm-close></div>
            <div class="team-confirm__dialog" role="dialog" aria-modal="true" aria-labelledby="team-confirm-title">
                <h4 id="team-confirm-title">Confirm</h4>
                <p id="team-confirm-message"></p>
                <div class="team-confirm__actions">
                    <button type="button" class="app-btn-ghost" data-confirm-close>Cancel</button>
                    <button type="button" class="app-btn-primary" id="team-confirm-ok">Confirm</button>
                </div>
            </div>
        </div>`;

    bindTeamEvents();
    renderTeamSection();
}

function bindTeamEvents() {
    const section = document.getElementById('users-section');
    if (!section) return;

    section.querySelectorAll('#team-tabs .team-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            teamState.tab = tab.dataset.teamTab || 'staff';
            renderTeamSection();
        });
    });

    section.querySelectorAll('[data-team-close]').forEach((btn) => {
        btn.addEventListener('click', closeStaffModal);
    });

    section.querySelectorAll('[data-confirm-close]').forEach((btn) => {
        btn.addEventListener('click', closeConfirmModal);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeStaffModal();
            closeConfirmModal();
        }
    });

    const modal = document.getElementById('team-modal');
    modal?.addEventListener('click', (event) => {
        if (event.target === modal) closeStaffModal();
    });

    const confirmModal = document.getElementById('team-confirm');
    confirmModal?.addEventListener('click', (event) => {
        if (event.target === confirmModal) closeConfirmModal();
    });

    document.addEventListener('click', (event) => {
        const editBtn = event.target.closest('[data-staff-id]');
        if (editBtn && editBtn.dataset.staffId) {
            openStaffModal({ mode: 'edit', staffId: Number(editBtn.dataset.staffId) });
            return;
        }
        const assignBtn = event.target.closest('[data-staff-action="assign"]');
        if (assignBtn) {
            const id = Number(assignBtn.dataset.staffId);
            teamState.tab = 'assignments';
            teamState.selectedPdoId = id;
            renderTeamSection();
            return;
        }
        const toggleBtn = event.target.closest('[data-staff-action="toggle"]');
        if (toggleBtn) {
            closeAllKebabMenus();
            toggleUserStatus(Number(toggleBtn.dataset.staffId));
            return;
        }
        const deleteBtn = event.target.closest('[data-staff-action="delete"]');
        if (deleteBtn) {
            closeAllKebabMenus();
            deleteUser(Number(deleteBtn.dataset.staffId));
        }
    });
}

function renderTeamSection() {
    const content = document.getElementById('team-content');
    if (!content) return;

    document.querySelectorAll('#team-tabs .team-tab').forEach((tab) => {
        tab.classList.toggle('is-active', tab.dataset.teamTab === teamState.tab);
    });

    if (teamState.tab === 'assignments') {
        renderAssignmentsTab();
        return;
    }

    if (teamState.tab === 'roles') {
        content.innerHTML = `
            <div class="team-card">
                <h4>Roles & Permissions</h4>
                <p class="muted">View-only access matrix.</p>
                <table class="permission-table">
                    <thead>
                        <tr>
                            <th>Module</th>
                            <th>Admin</th>
                            <th>PDO</th>
                            <th>Social Worker</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>Dashboard</td><td>Full</td><td>Edit</td><td>View</td></tr>
                        <tr><td>Applications</td><td>Full</td><td>Edit</td><td>View</td></tr>
                        <tr><td>Repayments</td><td>Full</td><td>Edit</td><td>View</td></tr>
                        <tr><td>Training</td><td>Full</td><td>View</td><td>Edit</td></tr>
                        <tr><td>Reports</td><td>Full</td><td>View</td><td>View</td></tr>
                        <tr><td>Team</td><td>Full</td><td>None</td><td>None</td></tr>
                    </tbody>
                </table>
            </div>`;
        return;
    }

    renderStaffTab();
}

function renderStaffTab() {
    const content = document.getElementById('team-content');
    if (!content) return;

    content.innerHTML = `
        <div class="team-card">
            <div class="team-toolbar">
                <div class="team-toolbar__filters">
                    <input type="search" id="team-search" placeholder="Search by name or email">
                    <select id="team-role-filter">
                        <option value="all">All roles</option>
                        <option value="Admin">Admin</option>
                        <option value="PDO">PDO</option>
                        <option value="Social Worker">Social Worker</option>
                    </select>
                    <select id="team-status-filter">
                        <option value="all">All status</option>
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                    </select>
                </div>
                <div class="team-toolbar__actions">
                    <button type="button" class="app-btn-primary" id="team-add">+ Add Staff</button>
                </div>
            </div>
            <div class="team-table" id="team-users-table"></div>
        </div>`;

    const search = document.getElementById('team-search');
    const roleFilter = document.getElementById('team-role-filter');
    const statusFilter = document.getElementById('team-status-filter');

    search.value = teamState.usersSearch;
    roleFilter.value = teamState.usersRole;
    statusFilter.value = teamState.usersStatus;

    search.addEventListener('input', () => { teamState.usersSearch = search.value; applyUsersFiltersAndSearch(); });
    roleFilter.addEventListener('change', () => { teamState.usersRole = roleFilter.value; applyUsersFiltersAndSearch(); });
    statusFilter.addEventListener('change', () => { teamState.usersStatus = statusFilter.value; applyUsersFiltersAndSearch(); });

    document.getElementById('team-add')?.addEventListener('click', () => openStaffModal({ mode: 'add' }));

    applyUsersFiltersAndSearch();
}

function applyUsersFiltersAndSearch() {
    const query = teamState.usersSearch.toLowerCase();
    const role = teamState.usersRole;
    const status = teamState.usersStatus;

    const filtered = staff.filter((user) => {
        if (role !== 'all' && user.role !== role) return false;
        if (status !== 'all' && user.status !== status) return false;
        if (!query) return true;
        const hay = `${user.name} ${user.email}`.toLowerCase();
        return hay.includes(query);
    });

    renderUsersTable(filtered);
}

function renderUsersTable(list) {
    const container = document.getElementById('team-users-table');
    if (!container) return;

    const rows = list.map((user) => {
        const assignedCount = user.role === 'PDO' ? Object.values(assignments).filter((id) => id === user.id).length : 0;
        const statusBadge = user.status === 'active' ? 'status-badge status-badge--active' : 'status-badge status-badge--disabled';
        const roleBadge = user.role === 'Admin' ? 'perm-badge perm-badge--full' : user.role === 'PDO' ? 'perm-badge perm-badge--edit' : 'perm-badge perm-badge--view';
        return `
            <tr>
                <td>
                    <div class="staff-name">${escapeHtml(user.name)}</div>
                    <div class="muted">${escapeHtml(user.email)}</div>
                </td>
                <td><span class="${roleBadge}">${escapeHtml(user.role)}</span></td>
                <td><span class="${statusBadge}">${user.status}</span></td>
                <td>${user.role === 'PDO' ? assignedCount : '—'}</td>
                <td class="table-actions">
                    <button type="button" class="kebab-button" data-kebab="${user.id}" aria-label="More actions">?</button>
                    <div class="dropdown-panel" data-kebab-panel="${user.id}">
                        <button type="button" data-staff-id="${user.id}">Edit</button>
                        ${user.role === 'PDO' ? `<button type="button" data-staff-action="assign" data-staff-id="${user.id}">Assign barangays</button>` : ''}
                        <button type="button" data-staff-action="toggle" data-staff-id="${user.id}">${user.status === 'active' ? 'Disable' : 'Enable'}</button>
                        <button type="button" class="danger" data-staff-action="delete" data-staff-id="${user.id}">Remove</button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="table-clean">
            <thead>
                <tr>
                    <th>Name + Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Assigned barangays</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5" class="muted">No staff found.</td></tr>'}</tbody>
        </table>`;

    initKebabMenus();
}

function initKebabMenus() {
    const container = document.getElementById('team-users-table');
    if (!container) return;

    container.querySelectorAll('.kebab-button').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const id = btn.dataset.kebab;
            const panel = container.querySelector(`[data-kebab-panel="${id}"]`);
            const isOpen = panel?.classList.contains('is-open');
            closeAllKebabMenus();
            if (panel && !isOpen) panel.classList.add('is-open');
        });
    });

    document.addEventListener('click', closeAllKebabMenus, { once: true });
}

function closeAllKebabMenus() {
    document.querySelectorAll('.dropdown-panel.is-open').forEach((panel) => panel.classList.remove('is-open'));
}

function openStaffModal({ mode, staffId } = {}) {
    const modal = document.getElementById('team-modal');
    if (!modal) return;
    modal.dataset.mode = mode || 'add';
    modal.dataset.staffId = staffId ? String(staffId) : '';

    const title = document.getElementById('team-modal-title');
    const saveBtn = document.getElementById('team-user-save');

    if (modal.dataset.mode === 'edit') {
        title.textContent = 'Edit Staff';
        saveBtn.textContent = 'Update';
        const staffMember = staff.find((item) => item.id === Number(staffId));
        if (staffMember) loadStaffIntoForm(staffMember);
    } else {
        title.textContent = 'Add Staff';
        saveBtn.textContent = 'Save';
        clearStaffForm();
    }

    modal.classList.add('is-open');
    modal.removeAttribute('aria-hidden');
    document.getElementById('team-user-save').onclick = handleStaffFormSubmit;
}

function closeStaffModal() {
    const modal = document.getElementById('team-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
}

function clearStaffForm() {
    document.getElementById('team-user-id').value = '';
    document.getElementById('team-user-name').value = '';
    document.getElementById('team-user-role').value = 'PDO';
    document.getElementById('team-user-email').value = '';
    document.getElementById('team-user-phone').value = '';
    document.getElementById('team-user-status').value = 'active';
}

function loadStaffIntoForm(user) {
    document.getElementById('team-user-id').value = user.id || '';
    document.getElementById('team-user-name').value = user.name || '';
    document.getElementById('team-user-role').value = user.role || 'PDO';
    document.getElementById('team-user-email').value = user.email || '';
    document.getElementById('team-user-phone').value = user.phone || '';
    document.getElementById('team-user-status').value = user.status || 'active';

    const isCurrentAdmin = user.email === CURRENT_ADMIN_EMAIL;
    document.getElementById('team-user-role').disabled = isCurrentAdmin;
    document.getElementById('team-user-status').disabled = isCurrentAdmin;
}

function handleStaffFormSubmit() {
    const modal = document.getElementById('team-modal');
    if (!modal) return;
    const mode = modal.dataset.mode || 'add';
    const staffId = modal.dataset.staffId ? Number(modal.dataset.staffId) : null;

    if (mode === 'edit') {
        updateStaff(staffId);
    } else {
        createStaff();
    }
}

function createStaff() {
    const name = document.getElementById('team-user-name').value.trim();
    const role = document.getElementById('team-user-role').value;
    const email = document.getElementById('team-user-email').value.trim();
    const phone = document.getElementById('team-user-phone').value.trim();
    const status = document.getElementById('team-user-status').value;

    if (!name || !email || !role) {
        showToast('Please complete required fields.', 'warning');
        return;
    }

    if (role === 'Admin' && status !== 'active') {
        alert('At least one active admin is required.');
        return;
    }

    const nextId = Math.max(0, ...staff.map((item) => item.id)) + 1;
    staff.push({ id: nextId, name, role, email, phone, status, hasHistory: false });
    closeStaffModal();
    renderUsersTab();
}

function updateStaff(staffId) {
    const user = staff.find((item) => item.id === staffId);
    if (!user) return;

    const name = document.getElementById('team-user-name').value.trim();
    const role = document.getElementById('team-user-role').value;
    const email = document.getElementById('team-user-email').value.trim();
    const phone = document.getElementById('team-user-phone').value.trim();
    const status = document.getElementById('team-user-status').value;

    if (!name || !email || !role) {
        showToast('Please complete required fields.', 'warning');
        return;
    }

    const currentAdmin = getCurrentAdmin();
    if (currentAdmin && currentAdmin.id === user.id && status !== 'active') {
        alert('You cannot disable your own account.');
        return;
    }

    if (role === 'Admin' && status !== 'active') {
        const activeAdmins = staff.filter((u) => u.role === 'Admin' && u.status === 'active' && u.id !== user.id).length;
        if (activeAdmins < 1) {
            alert('At least one active admin is required.');
            return;
        }
    }

    Object.assign(user, { name, role, email, phone, status });
    closeStaffModal();
    renderUsersTab();
}

function toggleUserStatus(userId) {
    const user = staff.find((item) => item.id === userId);
    if (!user) return;
    if (user.email === CURRENT_ADMIN_EMAIL) {
        alert('You cannot disable your own account.');
        return;
    }
    const next = user.status === 'active' ? 'disabled' : 'active';
    if (user.role === 'Admin' && next === 'disabled') {
        const activeAdmins = staff.filter((u) => u.role === 'Admin' && u.status === 'active').length;
        if (activeAdmins <= 1) {
            alert('At least one active admin is required.');
            return;
        }
    }
    const ok = confirm(`Set ${user.name} to ${next}?`);
    if (!ok) return;
    user.status = next;
    renderUsersTab();
}

function deleteUser(userId) {
    const user = staff.find((item) => item.id === userId);
    if (!user) return;
    if (user.email === CURRENT_ADMIN_EMAIL) {
        alert('You cannot remove your own account.');
        return;
    }
    const assignedCount = Object.values(assignments).filter((id) => id === userId).length;
    if (assignedCount > 0) {
        alert('This account has assigned barangays. Reassign them before removal.');
        return;
    }
    if (user.hasHistory) {
        alert('This account has transaction history and cannot be deleted. Disable instead.');
        return;
    }
    if (user.role === 'Admin') {
        const activeAdmins = staff.filter((u) => u.role === 'Admin' && u.status === 'active').length;
        if (activeAdmins <= 1) {
            alert('At least one active admin is required.');
            return;
        }
    }
    const ok = confirm(`Remove ${user.name}? This cannot be undone.`);
    if (!ok) return;
    const confirmation = prompt('Type REMOVE to confirm deletion.');
    if (confirmation !== 'REMOVE') {
        alert('Deletion cancelled.');
        return;
    }
    const idx = staff.findIndex((item) => item.id === userId);
    if (idx >= 0) staff.splice(idx, 1);
    renderUsersTab();
}

function renderAssignmentsTab() {
    const content = document.getElementById('team-content');
    if (!content) return;

    if (!teamState.assignmentsDraft) {
        teamState.assignmentsDraft = { ...assignments };
    }

    const pdoList = staff.filter((user) => user.role === 'PDO');
    const selectedPdo = pdoList.find((user) => user.id === teamState.selectedPdoId) || pdoList[0];
    if (selectedPdo) teamState.selectedPdoId = selectedPdo.id;

    content.innerHTML = `
        <div class="team-card">
            <div class="assignments-header">
                <div class="assignments-header__left">
                    <label class="assignments-field">
                        <span>PDO</span>
                        <select id="pdo-select">
                            ${pdoList.map((pdo) => `<option value="${pdo.id}">${escapeHtml(pdo.name)}</option>`).join('')}
                        </select>
                    </label>
                    <span class="chip" id="assigned-count">Assigned: 0</span>
                </div>
                <div class="assignments-header__right">
                    <input type="search" id="barangay-search" placeholder="Search barangay">
                    <select id="assignment-filter">
                        <option value="all">All</option>
                        <option value="unassigned">Unassigned</option>
                        <option value="assigned-self">Assigned to this PDO</option>
                        <option value="assigned-other">Assigned to others</option>
                    </select>
                </div>
            </div>

            <div class="assignments-actions">
                <button type="button" class="app-btn-outline" id="team-unassign-all">Unassign all from this PDO</button>
                <div class="assignments-actions__right">
                    <button type="button" class="app-btn-ghost" id="team-assign-reset">Reset Changes</button>
                    <button type="button" class="app-btn-primary" id="team-assign-save">Save Changes</button>
                </div>
            </div>

            <div class="assignments-table" id="barangay-list"></div>
        </div>`;

    const pdoSelect = document.getElementById('pdo-select');
    const searchInput = document.getElementById('barangay-search');
    const filterSelect = document.getElementById('assignment-filter');

    pdoSelect.value = selectedPdo?.id || '';
    pdoSelect.addEventListener('change', () => {
        teamState.selectedPdoId = Number(pdoSelect.value);
        updateAssignmentsHeader();
        renderBarangayList();
    });

    searchInput.value = teamState.barangaySearch || '';
    searchInput.addEventListener('input', () => {
        teamState.barangaySearch = searchInput.value;
        renderBarangayList();
    });

    filterSelect.value = teamState.assignmentFilter || 'all';
    filterSelect.addEventListener('change', () => {
        teamState.assignmentFilter = filterSelect.value;
        renderBarangayList();
    });

    document.getElementById('team-unassign-all').addEventListener('click', () => {
        if (!teamState.assignmentsDraft) return;
        Object.keys(teamState.assignmentsDraft).forEach((key) => {
            if (teamState.assignmentsDraft[key] === teamState.selectedPdoId) {
                delete teamState.assignmentsDraft[key];
            }
        });
        renderBarangayList();
        updateAssignSaveState();
    });

    document.getElementById('team-assign-reset').addEventListener('click', () => {
        teamState.assignmentsDraft = { ...assignments };
        renderBarangayList();
        updateAssignmentsHeader();
        updateAssignSaveState();
    });

    document.getElementById('team-assign-save').addEventListener('click', () => {
        if (!hasAssignmentChanges()) return;
        assignments = { ...teamState.assignmentsDraft };
        showToast('Assignments updated.', 'success');
        updateAssignmentsHeader();
        updateAssignSaveState();
    });

    updateAssignmentsHeader();
    renderBarangayList();
    updateAssignSaveState();
}

function updateAssignmentsHeader() {
    const countEl = document.getElementById('assigned-count');
    if (!countEl) return;
    const count = Object.values(teamState.assignmentsDraft || {}).filter((id) => id === teamState.selectedPdoId).length;
    countEl.textContent = `Assigned: ${count}/47`;
}

function renderPdoList() {
    return;
}

function renderBarangayList() {
    const container = document.getElementById('barangay-list');
    if (!container) return;

    const search = (teamState.barangaySearch || '').toLowerCase();
    const filter = teamState.assignmentFilter || 'all';
    const currentPdoId = teamState.selectedPdoId;

    const list = barangays.filter((b) => b.name.toLowerCase().includes(search));

    const filtered = list.filter((b) => {
        const assignedTo = teamState.assignmentsDraft?.[b.id];
        if (filter === 'unassigned') return !assignedTo;
        if (filter === 'assigned-self') return assignedTo === currentPdoId;
        if (filter === 'assigned-other') return assignedTo && assignedTo !== currentPdoId;
        return true;
    });

    container.innerHTML = filtered.map((b) => {
        const assignedTo = teamState.assignmentsDraft?.[b.id];
        const checked = assignedTo === currentPdoId;
        const helper = assignedTo && assignedTo !== currentPdoId
            ? `Assigned to ${getStaffName(assignedTo)}`
            : assignedTo === currentPdoId
                ? 'Assigned to this PDO'
                : 'Unassigned';
        return `
            <div class="assignments-row">
                <label class="assignments-cell">
                    <input type="checkbox" data-barangay-id="${b.id}" ${checked ? 'checked' : ''}>
                    <span>${b.name}</span>
                </label>
                <span class="assignments-helper">${helper}</span>
            </div>`;
    }).join('') || '<div class="muted">No barangays found.</div>';

    container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.addEventListener('change', () => {
            toggleBarangayAssignment(currentPdoId, input.dataset.barangayId, input.checked);
        });
    });

    updateAssignmentsHeader();
    updateAssignSaveState();
}

function selectPDO(pdoId) {
    teamState.selectedPdoId = pdoId;
    renderAssignmentsTab();
}

function applyBarangaySearch() {
    renderBarangayList();
}

function toggleBarangayAssignment(pdoId, barangayId, checked) {
    if (!teamState.assignmentsDraft) teamState.assignmentsDraft = { ...assignments };
    const current = teamState.assignmentsDraft[barangayId];

    if (checked) {
        if (current && current !== pdoId) {
            const barangay = barangays.find((b) => b.id === barangayId)?.name || 'Barangay';
            const from = getStaffName(current);
            const to = getStaffName(pdoId);
            showConfirmModal(`Reassign ${barangay} from ${from} to ${to}?`).then((ok) => {
                if (!ok) {
                    renderBarangayList();
                    return;
                }
                teamState.assignmentsDraft[barangayId] = pdoId;
                renderBarangayList();
                updateAssignSaveState();
            });
            return;
        }
        teamState.assignmentsDraft[barangayId] = pdoId;
    } else {
        if (current === pdoId) delete teamState.assignmentsDraft[barangayId];
    }

    renderBarangayList();
    updateAssignSaveState();
}

function showConfirmModal(message) {
    const modal = document.getElementById('team-confirm');
    const msg = document.getElementById('team-confirm-message');
    const okBtn = document.getElementById('team-confirm-ok');
    return new Promise((resolve) => {
        if (!modal) return resolve(false);
        msg.textContent = message;
        modal.classList.add('is-open');
        modal.removeAttribute('aria-hidden');

        const onClose = (result) => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            okBtn.onclick = null;
            resolve(result);
        };

        okBtn.onclick = () => onClose(true);
        modal.querySelectorAll('[data-confirm-close]').forEach((btn) => {
            btn.onclick = () => onClose(false);
        });
    });
}

function closeConfirmModal() {
    const modal = document.getElementById('team-confirm');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
}

function getCurrentAdmin() {
    return staff.find((u) => u.email === CURRENT_ADMIN_EMAIL) || staff.find((u) => u.role === 'Admin') || staff[0];
}

function getStaffName(id) {
    const user = staff.find((item) => item.id === id);
    return user?.name || 'PDO';
}

function hasAssignmentChanges() {
    const draft = teamState.assignmentsDraft || {};
    const saved = assignments || {};
    const keys = new Set([...Object.keys(draft), ...Object.keys(saved)]);
    for (const key of keys) {
        if (draft[key] !== saved[key]) return true;
    }
    return false;
}

function updateAssignSaveState() {
    const btn = document.getElementById('team-assign-save');
    if (!btn) return;
    btn.disabled = !hasAssignmentChanges();
}
