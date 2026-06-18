(function () {
    'use strict';

    // MODULE: State
    const state = {
        currentSection: 'dashboard',
        team: {
            tab: 'staff',
            staffSearch: '',
            staffRole: 'all',
            staffStatus: 'all',
            assignmentSearch: '',
            assignmentFilter: 'all',
            selectedPdoId: null,
            modalMode: 'add',
            modalStaffId: null
        }
    };

    // MODULE: Helpers
    const qs = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const on = (el, ev, cb, opts) => el && el.addEventListener(ev, cb, opts);
    const formatCurrency = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n || 0);
    const debounce = (fn, delay = 200) => {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), delay);
        };
    };

    // Mock Data
    const staff = [
        { id: 1, name: 'Admin User', role: 'Admin', email: 'admin@smartleap.gov.ph', phone: '', status: 'active' },
        { id: 2, name: 'Alyssa Marino', role: 'PDO', email: 'alyssa@smartleap.gov.ph', phone: '0917 111 2222', status: 'active' },
        { id: 3, name: 'Joel Paglinawan', role: 'PDO', email: 'joel@smartleap.gov.ph', phone: '0917 222 3344', status: 'active' },
        { id: 4, name: 'Marian Cortez', role: 'Social Worker', email: 'marian@smartleap.gov.ph', phone: '0917 444 5566', status: 'disabled' }
    ];

    const barangays = [
        'Ag-ao','Agusan Pequeño','Ambago','Ampayon','Anticala','Baan KM 3','Baan Riverside','Babag','Bading','Banza','Bayanihan','Bilay','Bitan-agan','Bonbon','Bugsukan','Buhangin','Cabcabon','Doongan','Dulag','Florida','Fort Poyohon','Golden Ribbon','Holy Redeemer','Imadejas','J.P. Rizal','Kinamlutan','Lapu-Lapu','Libertad','Limaha','Los Angeles','Lumbocan','Maguinda','Mahay','Mahogany','Maon','Maug','Nonchong','Obrero','Ong Yiu','Pagatpatan','Pianing','San Mateo','San Vicente','Sto. Niño','Sumilihon','Tagabaca','Taguibo','Taligaman','Tiniwisan','Tungao','Villa Kananga'
    ].map((name, i) => ({ id: `brgy-${i + 1}`, name }));

    const assignments = new Map(); // barangayId -> staffId (PDO)

    // MODULE: Init
    function init() {
        bindSidebarNav();
        renderSection(state.currentSection);
    }

    function bindSidebarNav() {
        qsa('.sidebar-nav .nav-link').forEach((link) => {
            on(link, 'click', (e) => {
                e.preventDefault();
                const section = link.dataset.section || 'dashboard';
                renderSection(section);
            });
        });
    }

    function renderSection(section) {
        state.currentSection = section;
        qsa('.content-card').forEach((card) => {
            card.style.display = card.id === `${section}-section` ? 'block' : 'none';
        });
        if (section === 'users') renderTeam();
        if (section === 'reports') renderReportsStub();
        if (section === 'dashboard') renderDashboardStub();
    }

    // MODULE: Dashboard (stub)
    function renderDashboardStub() {
        // Keep existing HTML driven layout; no-op for clean baseline
    }

    // MODULE: Reports (stub)
    function renderReportsStub() {
        // Keep existing HTML driven layout; no-op for clean baseline
    }

    // MODULE: Team
    function renderTeam() {
        const section = qs('#users-section');
        if (!section) return;
        section.innerHTML = `
            <div class="dashboard-header">
                <div>
                    <h3>Team</h3>
                    <p>Manage staff accounts, assignments, and accountability.</p>
                </div>
            </div>
            <div class="team-tabs" id="team-tabs">
                <button type="button" class="team-tab ${state.team.tab === 'staff' ? 'is-active' : ''}" data-team-tab="staff">Staff</button>
                <button type="button" class="team-tab ${state.team.tab === 'assignments' ? 'is-active' : ''}" data-team-tab="assignments">Assignments</button>
                <button type="button" class="team-tab ${state.team.tab === 'roles' ? 'is-active' : ''}" data-team-tab="roles">Roles & Permissions</button>
            </div>
            <div class="team-content" id="team-content"></div>
            ${renderStaffModal()}
            ${renderConfirmModal()}
        `;

        qsa('#team-tabs .team-tab').forEach((tab) => {
            on(tab, 'click', () => {
                state.team.tab = tab.dataset.teamTab;
                renderTeamTab();
            });
        });

        renderTeamTab();
    }

    function renderTeamTab() {
        if (state.team.tab === 'staff') renderStaffTab();
        if (state.team.tab === 'assignments') renderAssignmentsTab();
        if (state.team.tab === 'roles') renderRolesTab();
    }

    // Staff tab
    function renderStaffTab() {
        const content = qs('#team-content');
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
            </div>
        `;

        const search = qs('#team-search');
        const role = qs('#team-role-filter');
        const status = qs('#team-status-filter');

        search.value = state.team.staffSearch;
        role.value = state.team.staffRole;
        status.value = state.team.staffStatus;

        on(search, 'input', debounce(() => { state.team.staffSearch = search.value; renderStaffTable(); }));
        on(role, 'change', () => { state.team.staffRole = role.value; renderStaffTable(); });
        on(status, 'change', () => { state.team.staffStatus = status.value; renderStaffTable(); });

        on(qs('#team-add'), 'click', () => openStaffModal('add'));

        renderStaffTable();
    }

    function renderStaffTable() {
        const container = qs('#team-users-table');
        if (!container) return;
        const query = state.team.staffSearch.toLowerCase();

        const filtered = staff.filter((u) => {
            if (state.team.staffRole !== 'all' && u.role !== state.team.staffRole) return false;
            if (state.team.staffStatus !== 'all' && u.status !== state.team.staffStatus) return false;
            if (!query) return true;
            return `${u.name} ${u.email}`.toLowerCase().includes(query);
        });

        const rows = filtered.map((u) => {
            const assignedCount = u.role === 'PDO' ? countAssigned(u.id) : '—';
            return `
                <tr>
                    <td>${u.name}</td>
                    <td>${u.role}</td>
                    <td>${u.email}</td>
                    <td><span class="status-badge ${u.status === 'active' ? 'status-badge--active' : 'status-badge--disabled'}">${u.status}</span></td>
                    <td>${assignedCount}</td>
                    <td>
                        <button class="app-btn-outline btn-sm" data-action="view" data-id="${u.id}">View</button>
                        <button class="kebab-button" data-action="menu" data-id="${u.id}">?</button>
                        <div class="dropdown-panel" data-menu="${u.id}">
                            <button data-action="edit" data-id="${u.id}">Edit</button>
                            <button data-action="toggle" data-id="${u.id}">${u.status === 'active' ? 'Disable' : 'Enable'}</button>
                            <button class="danger" data-action="remove" data-id="${u.id}">Remove</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="table-clean">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Assigned Barangays</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="6" class="muted">No staff found.</td></tr>'}</tbody>
            </table>
        `;

        qsa('.kebab-button').forEach((btn) => {
            on(btn, 'click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const panel = qs(`[data-menu="${id}"]`);
                if (panel) panel.classList.toggle('is-open');
            });
        });

        on(document, 'click', () => qsa('.dropdown-panel').forEach((p) => p.classList.remove('is-open')), { once: true });

        qsa('[data-action="view"],[data-action="edit"]').forEach((btn) => on(btn, 'click', () => openStaffModal('edit', btn.dataset.id)));
        qsa('[data-action="toggle"]').forEach((btn) => on(btn, 'click', () => toggleStaff(btn.dataset.id)));
        qsa('[data-action="remove"]').forEach((btn) => on(btn, 'click', () => confirmRemove(btn.dataset.id)));
    }

    function countAssigned(pdoId) {
        let count = 0;
        assignments.forEach((v) => { if (String(v) === String(pdoId)) count += 1; });
        return count;
    }

    // Assignments tab
    function renderAssignmentsTab() {
        const content = qs('#team-content');
        if (!content) return;

        content.innerHTML = `
            <div class="team-card">
                <div class="assignments-header">
                    <input type="search" id="assign-search" placeholder="Search barangay">
                    <select id="assign-filter">
                        <option value="all">All</option>
                        <option value="assigned">Assigned</option>
                        <option value="unassigned">Unassigned</option>
                        <option value="pdo">By PDO</option>
                    </select>
                    <select id="assign-pdo">
                        <option value="all">All PDOs</option>
                        ${staff.filter((u) => u.role === 'PDO').map((u) => `<option value="${u.id}">${u.name}</option>`).join('')}
                    </select>
                </div>
                <div class="assignments-table" id="assignments-table"></div>
            </div>
        `;

        const search = qs('#assign-search');
        const filter = qs('#assign-filter');
        const pdo = qs('#assign-pdo');

        on(search, 'input', debounce(() => { state.team.assignmentSearch = search.value; renderAssignmentsTable(); }));
        on(filter, 'change', () => { state.team.assignmentFilter = filter.value; renderAssignmentsTable(); });
        on(pdo, 'change', () => { state.team.selectedPdoId = pdo.value === 'all' ? null : Number(pdo.value); renderAssignmentsTable(); });

        renderAssignmentsTable();
    }

    function renderAssignmentsTable() {
        const container = qs('#assignments-table');
        if (!container) return;

        const query = state.team.assignmentSearch.toLowerCase();
        const filter = state.team.assignmentFilter;
        const filterPdo = state.team.selectedPdoId;

        const rows = barangays
            .filter((b) => b.name.toLowerCase().includes(query))
            .filter((b) => {
                const assigned = assignments.get(b.id);
                if (filter === 'assigned') return !!assigned;
                if (filter === 'unassigned') return !assigned;
                if (filter === 'pdo' && filterPdo) return assigned === filterPdo;
                return true;
            })
            .map((b) => {
                const assignedId = assignments.get(b.id);
                const assignedUser = staff.find((u) => u.id === assignedId);
                const status = assignedUser ? 'Assigned' : 'Unassigned';
                return `
                    <div class="assignments-row">
                        <div>${b.name}</div>
                        <div>${assignedUser ? assignedUser.name : 'Unassigned'}</div>
                        <div><span class="badge ${assignedUser ? 'badge--green' : 'badge--gray'}">${status}</span></div>
                        <div>
                            <button class="app-btn-outline btn-sm" data-action="assign" data-id="${b.id}">Assign</button>
                        </div>
                    </div>
                `;
            }).join('');

        container.innerHTML = rows || '<div class="muted">No barangays found.</div>';

        qsa('[data-action="assign"]').forEach((btn) => {
            on(btn, 'click', () => openAssignModal(btn.dataset.id));
        });
    }

    function openAssignModal(barangayId) {
        const pdoOptions = staff.filter((u) => u.role === 'PDO').map((u) => `<option value="${u.id}">${u.name}</option>`).join('');
        const modal = qs('#team-confirm');
        if (!modal) return;
        qs('#team-confirm-title').textContent = 'Assign PDO';
        qs('#team-confirm-message').innerHTML = `
            <label class="assignments-field">Select PDO</label>
            <select id="assign-select">${pdoOptions}</select>
        `;
        modal.classList.add('is-open');
        modal.removeAttribute('aria-hidden');

        on(qs('#team-confirm-ok'), 'click', () => {
            const selected = Number(qs('#assign-select').value);
            assignments.set(barangayId, selected);
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            renderAssignmentsTable();
        }, { once: true });
    }

    // Roles tab
    function renderRolesTab() {
        const content = qs('#team-content');
        if (!content) return;
        content.innerHTML = `
            <div class="team-card">
                <h4>Roles & Permissions</h4>
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
            </div>
        `;
    }

    // Modals
    function renderStaffModal() {
        return `
            <div class="team-modal" id="team-modal" aria-hidden="true">
                <div class="team-modal__backdrop" data-team-close></div>
                <div class="team-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="team-modal-title">
                    <div class="team-modal__header">
                        <h4 id="team-modal-title">Add Staff</h4>
                        <button type="button" class="icon-button" data-team-close aria-label="Close">×</button>
                    </div>
                    <div class="team-modal__body">
                        <input type="hidden" id="team-user-id">
                        <label>Full Name</label>
                        <input type="text" id="team-user-name">
                        <label>Role</label>
                        <select id="team-user-role">
                            <option value="Admin">Admin</option>
                            <option value="PDO">PDO</option>
                            <option value="Social Worker">Social Worker</option>
                        </select>
                        <label>Email</label>
                        <input type="email" id="team-user-email">
                        <label>Phone</label>
                        <input type="text" id="team-user-phone">
                        <label>Status</label>
                        <select id="team-user-status">
                            <option value="active">Active</option>
                            <option value="disabled">Disabled</option>
                        </select>
                    </div>
                    <div class="team-modal__footer">
                        <button type="button" class="app-btn-ghost" data-team-close>Cancel</button>
                        <button type="button" class="app-btn-primary" id="team-user-save">Save</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderConfirmModal() {
        return `
            <div class="team-confirm" id="team-confirm" aria-hidden="true">
                <div class="team-confirm__backdrop" data-team-close></div>
                <div class="team-confirm__dialog" role="dialog" aria-modal="true" aria-labelledby="team-confirm-title">
                    <h4 id="team-confirm-title">Confirm</h4>
                    <div id="team-confirm-message"></div>
                    <div class="team-confirm__actions">
                        <button type="button" class="app-btn-ghost" data-team-close>Cancel</button>
                        <button type="button" class="app-btn-primary" id="team-confirm-ok">Confirm</button>
                    </div>
                </div>
            </div>
        `;
    }

    function openStaffModal(mode, id) {
        const modal = qs('#team-modal');
        if (!modal) return;
        const title = qs('#team-modal-title');
        const saveBtn = qs('#team-user-save');
        if (mode === 'edit') {
            const u = staff.find((x) => String(x.id) === String(id));
            if (!u) return;
            title.textContent = 'Edit Staff';
            saveBtn.textContent = 'Update';
            qs('#team-user-id').value = u.id;
            qs('#team-user-name').value = u.name;
            qs('#team-user-role').value = u.role;
            qs('#team-user-email').value = u.email;
            qs('#team-user-phone').value = u.phone || '';
            qs('#team-user-status').value = u.status;
        } else {
            title.textContent = 'Add Staff';
            saveBtn.textContent = 'Save';
            qs('#team-user-id').value = '';
            qs('#team-user-name').value = '';
            qs('#team-user-role').value = 'PDO';
            qs('#team-user-email').value = '';
            qs('#team-user-phone').value = '';
            qs('#team-user-status').value = 'active';
        }
        modal.classList.add('is-open');
        modal.removeAttribute('aria-hidden');

        on(saveBtn, 'click', () => {
            const uid = qs('#team-user-id').value;
            const payload = {
                name: qs('#team-user-name').value.trim(),
                role: qs('#team-user-role').value,
                email: qs('#team-user-email').value.trim(),
                phone: qs('#team-user-phone').value.trim(),
                status: qs('#team-user-status').value
            };
            if (uid) {
                const target = staff.find((s) => String(s.id) === String(uid));
                Object.assign(target, payload);
            } else {
                const nextId = Math.max(0, ...staff.map((s) => s.id)) + 1;
                staff.push({ id: nextId, ...payload });
            }
            modal.classList.remove('is-open');
            renderStaffTable();
        }, { once: true });
    }

    function toggleStaff(id) {
        const u = staff.find((s) => String(s.id) === String(id));
        if (!u) return;
        u.status = u.status === 'active' ? 'disabled' : 'active';
        renderStaffTable();
    }

    function confirmRemove(id) {
        const modal = qs('#team-confirm');
        if (!modal) return;
        qs('#team-confirm-title').textContent = 'Remove Staff';
        qs('#team-confirm-message').textContent = 'Are you sure you want to remove this staff member?';
        modal.classList.add('is-open');
        on(qs('#team-confirm-ok'), 'click', () => {
            const idx = staff.findIndex((s) => String(s.id) === String(id));
            if (idx >= 0) staff.splice(idx, 1);
            modal.classList.remove('is-open');
            renderStaffTable();
        }, { once: true });
    }

    // Startup
    document.addEventListener('DOMContentLoaded', init);
})();
