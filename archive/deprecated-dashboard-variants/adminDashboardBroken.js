// SMART LEAP Admin Command Center Front-end
// Dashboard, Applications, Repayments, Reports, Team

const PROGRAM = {
    assistanceTotal: 15000,
    monthlyAmortization: 625,
    termMonths: 24
};

const STORAGE_KEYS = {
    beneficiaries: 'smartleap_admin_beneficiaries_v3',
    applications: 'smartleap_admin_applications_v3',
    users: 'smartleap_admin_users_v3'
};
const NOTIFICATIONS_KEY = 'smartleap_user_notifications_v1';

const REQUIREMENTS = [
    { key: 'validId', label: 'Valid ID' },
    { key: 'cedula', label: 'Cedula' },
    { key: 'healthCertificate', label: 'Health Certificate' }
];

let currentSection = 'dashboard';
let reportsDemographicsCollapsed = false;
let beneficiaries = [];
let applications = [];
let users = [];
let activeRepaymentBeneficiaryId = null;
let reportCharts = [];
let updatesChannel;
let trainingSnapshot = { sessions: [], beneficiaries: [], attendance: {} };
let trainingAggregate = { roster: [], total: 0, verifiedDocs: 0, attendanceRate: 0 };
let trainingUnsubscribe = null;
let activeTrainingBeneficiaryId = null;
let editingSessionId = null;
let trainingActivePanel = 'sessions';
const trainingFilters = { facilitator: 'all', focus: 'all', date: '' };
let trainingAttendanceSessionFilter = 'all';
let closeSidebarIfMobile = () => {};
let repaymentDetailOpen = false;
const ATTENDANCE_REMARKS_KEY = 'smartleap_training_attendance_remarks_v1';
let attendanceRemarks = {};
let activeAttendanceSessionId = null;
let activeAttendanceBeneficiaryId = null;
const attendanceModalState = { sectors: new Set(), search: '' };
let attendanceModalSelection = { status: 'pending' };
let dashboardCharts = [];
let dashboardSearchQuery = '';
const reportsFilters = {
    dateRange: 'this-month',
    customStart: '',
    customEnd: '',
    barangay: 'all'
};
const reportsTableState = { page: 1, pageSize: 8, sortKey: 'name', sortDir: 'asc' };
const SECTOR_FILTERS = [
    { key: 'pwd', label: 'PWD' },
    { key: 'senior', label: 'Senior Citizen' },
    { key: 'indigenous', label: 'Indigenous People' },
    { key: 'solo', label: 'Solo Parent' }
];
const filterState = {
    applications: { sectors: new Set(), search: '' },
    repayments: { sectors: new Set(), search: '' },
    training: { sectors: new Set(), search: '' },
    reports: { sectors: new Set(), search: '' }
};

const pesoFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });
const CURRENT_ADMIN_EMAIL = "admin@smartleap.gov.ph";

const staff = [
    { id: 0, name: "Admin User", role: "Admin", email: "admin@smartleap.gov.ph", phone: "", status: "active", hasHistory: true },
    { id: 1, name: "Alyssa Marino", role: "PDO", email: "alyssa@smartleap.gov.ph", phone: "0917 111 2222", status: "active", hasHistory: true },
    { id: 2, name: "Joel Paglinawan", role: "PDO", email: "joel@smartleap.gov.ph", phone: "0917 222 3344", status: "active", hasHistory: false },
    { id: 3, name: "Marian Cortez", role: "Social Worker", email: "marian@smartleap.gov.ph", phone: "0917 444 5566", status: "disabled", hasHistory: true },
    { id: 4, name: "Ivan Dela Cruz", role: "PDO", email: "ivan@smartleap.gov.ph", phone: "0917 777 8888", status: "active", hasHistory: false }
];

const barangays = [
    { id: "brgy-ag-ao", name: "Ag-ao" },
    { id: "brgy-agusan-pequeno", name: "Agusan Pequeño" },
    { id: "brgy-ambago", name: "Ambago" },
    { id: "brgy-ampayon", name: "Ampayon" },
    { id: "brgy-anticala", name: "Anticala" },
    { id: "brgy-aon-km-3", name: "AON KM 3" },
    { id: "brgy-aon-riverside", name: "AON Riverside" },
    { id: "brgy-babag", name: "Babag" },
    { id: "brgy-bad-as", name: "Bad-as" },
    { id: "brgy-banza", name: "Banza" },
    { id: "brgy-bayawan", name: "Bayawan" },
    { id: "brgy-bitan-agan", name: "Bitan-agan" },
    { id: "brgy-buhangin", name: "Buhangin" },
    { id: "brgy-cabcabon", name: "Cabcabon" },
    { id: "brgy-doongan", name: "Doongan" },
    { id: "brgy-dulag", name: "Dulag" },
    { id: "brgy-florida", name: "Florida" },
    { id: "brgy-fort-poyohon", name: "Fort Poyohon" },
    { id: "brgy-golden-ribbon", name: "Golden Ribbon" },
    { id: "brgy-holy-redeemer", name: "Holy Redeemer" },
    { id: "brgy-imadejas", name: "Imadejas" },
    { id: "brgy-jp-rizal", name: "J.P. Rizal" },
    { id: "brgy-kinamlutan", name: "Kinamlutan" },
    { id: "brgy-lapu-lapu", name: "Lapu-Lapu" },
    { id: "brgy-libertad", name: "Libertad" },
    { id: "brgy-limaha", name: "Limaha" },
    { id: "brgy-los-angeles", name: "Los Angeles" },
    { id: "brgy-lumbocan", name: "Lumbocan" },
    { id: "brgy-masao", name: "Masao" },
    { id: "brgy-maon", name: "Maon" },
    { id: "brgy-maug", name: "Maug" },
    { id: "brgy-nonong", name: "Nonong" },
    { id: "brgy-obrero", name: "Obrero" },
    { id: "brgy-ong-yiu", name: "Ong Yiu" },
    { id: "brgy-pagatpatan", name: "Pagatpatan" },
    { id: "brgy-pianing", name: "Pianing" },
    { id: "brgy-san-mateo", name: "San Mateo" },
    { id: "brgy-san-vicente", name: "San Vicente" },
    { id: "brgy-sto-nino", name: "Sto. Niño" },
    { id: "brgy-sumilihon", name: "Sumilihon" },
    { id: "brgy-tagabaca", name: "Tagabaca" },
    { id: "brgy-taguibo", name: "Taguibo" },
    { id: "brgy-taligaman", name: "Taligaman" },
    { id: "brgy-tinivisan", name: "Tinivisan" },
    { id: "brgy-tungao", name: "Tungao" },
    { id: "brgy-villa-kananga", name: "Villa Kananga" }
];

let assignments = {
    "brgy-ampayon": 1,
    "brgy-banza": 2,
    "brgy-bitaan": 1,
    "brgy-libertad": 4,
    "brgy-masao": 2
};

const teamState = {
    tab: "users",
    mode: "pdo",
    selectedPdoId: 1,
    selectedBarangayId: null,
    usersSearch: "",
    usersRole: "all",
    usersStatus: "all",
    pdoSearch: "",
    barangaySearch: "",
    assignmentsDraft: null,
    assignmentFilter: "all"
};

const TRAINING_SESSION_PRESETS = [
    'Sub-Project Identification',
    'Project Planning, Development & Management',
    'Financial Management / Bookkeeping',
    'Accountability Reporting',
    'Sustainability Evaluation Tool',
    'Community Volunteers Training',
    'Project Documentation',
    'Proposal Review & Finalization',
    'Implementation Preparation',
    'Turnover & Livelihood Assistance'
];

function normalizeStatus(status) {
    return String(status ?? '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
}

function isTrainingEligibleStatus(status) {
    const normalized = normalizeStatus(status);
    return normalized.includes('approved') || normalized.includes('released') || normalized.includes('beneficiary');
}

function buildFilterBarMarkup(scope, options = {}) {
    const pills = SECTOR_FILTERS.map((filter) => `
        <button type="button" class="filter-pill" data-filter="${filter.key}">${filter.label}</button>
    `).join('');
    const compactClass = options.compact ? ' section-filters--compact' : '';
    return `
        <div class="section-filters${compactClass}" data-filter-scope="${scope}">
            <div class="filter-pills">${pills}</div>
            <div class="filter-chips" data-filter-chips></div>
            <div class="filter-actions">
                <label class="filter-search">
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <input type="search" data-filter-search placeholder="Search by name...">
                </label>
                <button type="button" class="app-btn-ghost" data-filter-reset><i class="fas fa-broom"></i><span>Reset</span></button>
            </div>
        </div>`;
}

function initFilterBar(scope, onChange) {
    const container = document.querySelector(`[data-filter-scope="${scope}"]`);
    const state = filterState[scope];
    if (!container || !state) return;

    const pills = Array.from(container.querySelectorAll('.filter-pill'));
    pills.forEach((pill) => {
        const key = pill.dataset.filter;
        pill.classList.toggle('is-active', state.sectors.has(key));
        pill.addEventListener('click', () => {
            if (state.sectors.has(key)) {
                state.sectors.delete(key);
            } else {
                state.sectors.add(key);
            }
            updateFilterChips(scope, onChange);
            pills.forEach((btn) => btn.classList.toggle('is-active', state.sectors.has(btn.dataset.filter)));
            onChange?.();
        });
    });

    const searchInput = container.querySelector('[data-filter-search]');
    if (searchInput) {
        searchInput.value = state.search || '';
        searchInput.addEventListener('input', () => {
            state.search = searchInput.value.trim();
            updateFilterChips(scope, onChange);
            onChange?.();
        });
    }

    container.querySelector('[data-filter-reset]')?.addEventListener('click', () => {
        state.sectors.clear();
        state.search = '';
        pills.forEach((btn) => btn.classList.remove('is-active'));
        if (searchInput) searchInput.value = '';
        updateFilterChips(scope, onChange);
        onChange?.();
    });

    updateFilterChips(scope, onChange);
}


function updateFilterChips(scope, onChange) {
    const container = document.querySelector(`[data-filter-scope="${scope}"]`);
    const state = filterState[scope];
    if (!container || !state) return;
    const chipHost = container.querySelector('[data-filter-chips]');
    if (!chipHost) return;
    const chips = Array.from(state.sectors).map((key) => {
        const label = SECTOR_FILTERS.find((item) => item.key === key)?.label || key;
        return `<button type="button" class="filter-chip" data-filter="${key}">${label}<span aria-hidden="true">×</span></button>`;
    });
    chipHost.innerHTML = chips.join('') || '<span class="filter-chip filter-chip--empty">No filters</span>';
    chipHost.querySelectorAll('.filter-chip[data-filter]').forEach((chip) => {
        chip.addEventListener('click', () => {
            state.sectors.delete(chip.dataset.filter);
            updateFilterChips(scope, onChange);
            container.querySelectorAll('.filter-pill').forEach((pill) => {
                pill.classList.toggle('is-active', state.sectors.has(pill.dataset.filter));
            });
            onChange?.();
        });
    });
}


function getSectorKeysFromValue(value) {
    const normalized = String(value || '').toLowerCase();
    const keys = new Set();
    if (normalized.includes('pwd')) keys.add('pwd');
    if (normalized.includes('senior')) keys.add('senior');
    if (normalized.includes('indigenous') || normalized.includes('ip')) keys.add('indigenous');
    if (normalized.includes('solo')) keys.add('solo');
    return Array.from(keys);
}

function matchesSectorFilterText(text, scope) {
    const state = filterState[scope];
    if (!state?.sectors?.size) return true;
    const keys = getSectorKeysFromValue(text);
    if (!keys.length) return false;
    return keys.some((key) => state.sectors.has(key));
}

function matchesNameSearch(name, scope) {
    const query = (filterState[scope]?.search || '').toLowerCase();
    if (!query) return true;
    return String(name || '').toLowerCase().includes(query);
}

function getSectorText(record) {
    return [
        record?.profile?.sector,
        record?.profile?.sectorDetails,
        record?.sector,
        record?.program,
        record?.sectorDetails
    ].filter(Boolean).join(' ');
}

function filterByScope(list, scope, getName) {
    return list.filter((item) => {
        const nameValue = getName(item);
        return matchesNameSearch(nameValue, scope) && matchesSectorFilterText(getSectorText(item), scope);
    });
}

function countSector(list, key) {
    return list.filter((item) => {
        const sectors = getSectorKeysFromValue(getSectorText(item));
        return sectors.includes(key);
    }).length;
}

const APPLICANT_STATUS_LABELS = [
    'submitted',
    'pending',
    'pendingrequirements',
    'forvalidation',
    'underreview',
    'shortlisted',
    'approvedfortraining',
    'trainingongoing',
    'screening',
    'evaluation',
    'verification',
    'applicant'
];

const BENEFICIARY_STATUS_LABELS = [
    'active',
    'approved',
    'beneficiary',
    'released',
    'disbursed',
    'completed',
    'graduated',
    'monitoring',
    'forrelease',
    'postrelease',
    'ongoing'
];

const APPLICANT_STATUS_SET = new Set(APPLICANT_STATUS_LABELS.map(normalizeStatus));
const BENEFICIARY_STATUS_SET = new Set(BENEFICIARY_STATUS_LABELS.map(normalizeStatus));

function isBeneficiaryStatus(status) {
    const normalized = normalizeStatus(status);
    if (!normalized) return false;
    if (BENEFICIARY_STATUS_SET.has(normalized)) return true;
    const beneficiaryHints = ['active', 'beneficiary', 'released', 'disbursed', 'completed', 'graduated'];
    return beneficiaryHints.some(token => normalized.includes(token));
}

function isActiveBeneficiaryStatus(status) {
    const normalized = normalizeStatus(status);
    if (!normalized) return false;
    return ['active', 'released', 'beneficiary', 'monitoring', 'ongoing'].some((token) => normalized.includes(token));
}

function isApplicantStatus(status) {
    const normalized = normalizeStatus(status);
    if (!normalized) return true;
    if (isBeneficiaryStatus(status)) return false;
    if (APPLICANT_STATUS_SET.has(normalized)) return true;
    const applicantHints = ['pending', 'applicant', 'training', 'review', 'validation', 'shortlist', 'screen', 'verify'];
    return applicantHints.some(token => normalized.includes(token));
}

function getBeneficiaryRoster() {
    return beneficiaries.filter(entry => isBeneficiaryStatus(entry.applicationStatus || entry.status));
}

function getApplicantPool() {
    return beneficiaries.filter(entry => isApplicantStatus(entry.applicationStatus || entry.status));
}

function deriveProgramFromSector(sector) {
    const normalized = normalizeStatus(sector);
    if (!normalized) return '';
    if (normalized.includes('pantawid') || normalized === '4ps') return '4Ps';
    return 'Non-4Ps';
}

function computeAgeFromBirthday(birthday) {
    if (!birthday) return null;
    const birthDate = new Date(`${birthday}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const hasHadBirthday = today.getMonth() > birthDate.getMonth()
        || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
    if (!hasHadBirthday) age -= 1;
    return age >= 0 ? age : null;
}

function formatSectorLabel(sector) {
    if (!sector) return '';
    const value = sector.toString().trim();
    const lower = value.toLowerCase();
    if (lower.includes('pantawid') || lower === '4ps') return 'Pantawid (4Ps)';
    if (lower === 'none' || lower.includes('none of')) return 'None of the above';
    if (lower === 'pwd' || lower.includes('disability')) return 'Person with Disability (PWD)';
    if (lower === 'ip' || lower.includes('indigenous')) return 'Indigenous Peoples (IP)';
    return value;
}

function formatBeneficiaryAddress(beneficiary) {
    if (!beneficiary) return 'Not provided';
    const baseAddress = (beneficiary.address || beneficiary.completeAddress || beneficiary.location || '').trim();
    const barangay = (beneficiary.barangay || '').trim();
    const purok = (beneficiary.purok || '').trim();
    const segments = [];
    if (baseAddress) segments.push(baseAddress);
    const lowerCombined = () => segments.join(' ').toLowerCase();
    if (purok && !lowerCombined().includes(purok.toLowerCase())) segments.push(purok);
    if (barangay && !lowerCombined().includes(barangay.toLowerCase())) segments.push(barangay);
    return segments.filter(Boolean).join(', ') || 'Not provided';
}

document.addEventListener('DOMContentLoaded', initAdminDashboard);

function initAdminDashboard() {
    initResponsiveSidebar();
    ensureCoreModals();
    attachGlobalEvents();
    loadState();
    initTrainingShared();
    initReviewModal();
    renderSection('dashboard');
    subscribeRealtimeUpdates();
}

function ensureCoreModals() {
    const modalIds = [
        'beneficiaryModal',
        'beneficiaryProfileModal',
        'applicationModal',
        'repaymentModal',
        'repaymentEditModal',
        'userModal',
        'releaseVerificationModal'
    ];
    modalIds.forEach((id) => {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.querySelectorAll('[data-bs-dismiss="modal"]').forEach((btn) => {
            btn.addEventListener('click', () => hideModal(modal));
        });
    });
}

function showModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('show');
    modalEl.style.display = 'flex';
    modalEl.removeAttribute('aria-hidden');
    modalEl.setAttribute('aria-modal', 'true');
    document.body.classList.add('modal-open');
}

function hideModal(modalEl) {
    if (modalEl && modalEl.contains(document.activeElement)) { document.activeElement.blur(); }
    if (!modalEl) return;
    modalEl.classList.remove('show');
    modalEl.style.removeProperty('display');
    modalEl.setAttribute('aria-hidden', 'true');
    modalEl.removeAttribute('aria-modal');
    document.body.classList.remove('modal-open');
}


function initResponsiveSidebar() {
    const shell = document.getElementById('mainSystem');
    const sidebar = document.getElementById('adminSidebar');
    const toggle = document.querySelector('.sidebar-toggle');
    const backdrop = document.querySelector('[data-sidebar-close]');
    const mobileQuery = window.matchMedia('(max-width: 1080px)');

    if (!shell || !sidebar || !toggle) {
        closeSidebarIfMobile = () => {};
        return;
    }

    const isMobileView = () => mobileQuery.matches;

    const applyState = (open) => {
        const isOpen = Boolean(open);
        shell.dataset.sidebarOpen = isOpen ? 'true' : 'false';
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

        const hidden = isMobileView() ? !isOpen : false;
        if (hidden && sidebar.contains(document.activeElement)) { toggle.focus(); }
        sidebar.toggleAttribute('inert', hidden);
        sidebar.setAttribute('aria-hidden', hidden ? 'true' : 'false');
        document.body.classList.toggle('sidebar-open', isOpen && isMobileView());
    };

    const closeSidebar = () => applyState(false);

    const handleToggle = () => {
        if (!isMobileView()) {
            return;
        }
        const current = shell.dataset.sidebarOpen === 'true';
        applyState(!current);
    };

    const syncForViewport = () => {
        if (!isMobileView()) {
            document.body.classList.remove('sidebar-open');
            shell.dataset.sidebarOpen = 'false';
            sidebar.setAttribute('aria-hidden', 'false');
            toggle.setAttribute('aria-expanded', 'false');
            return;
        }
        closeSidebar();
    };

    toggle.addEventListener('click', handleToggle);
    backdrop?.addEventListener('click', closeSidebar);
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeSidebar();
        }
    });

    if (typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', syncForViewport);
    } else if (typeof mobileQuery.addListener === 'function') {
        mobileQuery.addListener(syncForViewport);
    } else {
        window.addEventListener('resize', syncForViewport);
    }

    closeSidebarIfMobile = () => {
        if (isMobileView()) {
            closeSidebar();
        }
    };

    syncForViewport();
}

function attachGlobalEvents() {
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            renderSection(link.dataset.section || 'dashboard');
            closeSidebarIfMobile();
        });
    });

    window.refreshDashboard = () => {
        renderSection(currentSection);
        showToast('Dashboard refreshed', 'info');
    };

    window.exportDashboard = () => {
        const roster = getDashboardFilteredRoster();
        const applicants = getDashboardFilteredApplicants();
        const summary = {
            totalBeneficiaries: roster.length,
            active: roster.filter((entry) => isActiveBeneficiaryStatus(entry.applicationStatus || entry.status)).length
        };
        summary.inactive = Math.max(summary.totalBeneficiaries - summary.active, 0);
        summary.totalAssistance = roster.reduce((sum, b) => sum + (Number(b.assistanceAmount) || PROGRAM.assistanceTotal), 0);
        summary.avgAssistance = summary.totalBeneficiaries ? Math.round(summary.totalAssistance / summary.totalBeneficiaries) : 0;
        const verifiedPayments = roster.flatMap((b) => (b.repayments || []).filter((payment) => (payment.status || '').toLowerCase() === 'verified'));
        summary.verifiedRepayments = verifiedPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
        summary.completionRate = summary.totalBeneficiaries
            ? Math.round(roster.reduce((sum, b) => sum + computeRepaymentProgress(b).progressPct, 0) / summary.totalBeneficiaries)
            : 0;

        const reqSummary = getRequirementsCompletionSummary(roster);
        const trainingSummary = getTrainingCompletionSummary(roster);

        const payload = {
            summary,
            requirements: reqSummary,
            training: trainingSummary,
            applicants
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'dashboard_export.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const bundleRefreshBtn = document.querySelector('[data-bundle-refresh]');
    if (bundleRefreshBtn) {
        const frame = document.getElementById('adminBundleFrame');
        bundleRefreshBtn.addEventListener('click', () => {
            if (!frame) { return; }
            const base = (frame.dataset.src || frame.getAttribute('src') || 'forms.html').split('?')[0];
            frame.dataset.src = base;
            frame.src = `${base}?ts=${Date.now()}`;
            showToast('Application bundle refreshed', 'info');
        });
    }
}


function renderSection(sectionName) {
    const normalized = ['dashboard', 'applications', 'repayments', 'training', 'reports', 'users'].includes(sectionName)
        ? sectionName
        : 'dashboard';
    currentSection = normalized;

    document.querySelectorAll('.content-card').forEach(card => {
        card.style.display = card.id === `${normalized}-section` ? 'block' : 'none';
    });

    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
        link.classList.toggle('active', (link.dataset.section || 'dashboard') === normalized);
    });

    if (normalized === 'dashboard') renderDashboard();
    if (normalized === 'applications') renderApplicationsSection();
    if (normalized === 'repayments') renderRepaymentsSection();
    if (normalized === 'training') renderTrainingSection();
    if (normalized === 'reports') renderReportsSection();
    if (normalized === 'users') renderUsersSection();
}

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------
function renderDashboard() {
    const section = document.getElementById('dashboard-section');
    if (!section) return;


    section.innerHTML = `
        <div class="dashboard-header">
            <div>
                <h3>Dashboard Overview</h3>
                <p>Quick operational snapshot for today’s monitoring.</p>
            </div>
            <div class="header-actions">
                <button type="button" class="app-btn-outline" id="dashboard-view-reports"><i class="fas fa-chart-line"></i><span>View Full Reports</span></button>
                <button type="button" class="app-btn-primary" id="beneficiary-create"><i class="fas fa-user-plus"></i><span>New beneficiary</span></button>
            </div>
        </div>
        <div class="dashboard-alerts" id="dashboard-alerts"></div>
        <div class="summary-grid" id="dashboard-summary"></div>
        <section class="dashboard-queue" id="dashboard-queue">
            <div class="section-header">
                <h4>Action Queue</h4>
                <p>Items that need attention today.</p>
            </div>
            <div class="queue-tabs" id="dashboard-queue-tabs">
                <button type="button" class="queue-tab is-active" data-queue-tab="pending">Pending proofs</button>
                <button type="button" class="queue-tab" data-queue-tab="requirements">Missing requirements</button>
                <button type="button" class="queue-tab" data-queue-tab="training">Upcoming trainings</button>
                <button type="button" class="queue-tab" data-queue-tab="overdue">Overdue repayments</button>
            </div>
            <div class="queue-table" id="dashboard-queue-table"></div>
        </section>
        <section class="dashboard-activity activity-widget" id="dashboard-activity">
            <div class="section-header">
                <h4>Recent Activity</h4>
                <p>Latest updates across beneficiaries and repayments.</p>
            </div>
            <ul class="activity-list" id="dashboard-activity-list"></ul>
        </section>
        <section class="dashboard-mini" id="dashboard-mini">
            <div class="section-header">
                <h4>Mini Insights</h4>
                <p>Quick trends based on recent data.</p>
            </div>
            <div class="dashboard-mini__empty" id="dashboard-mini-empty" hidden>
                <div class="empty-card">
                    <div class="empty-card__icon"><i class="fas fa-chart-line"></i></div>
                    <div>
                        <h4>No trend data yet</h4>
                        <p>Add beneficiaries and log receipts to generate insights.</p>
                    </div>
                </div>
            </div>
            <div class="chart-grid chart-grid--two" id="dashboard-charts">
                <article class="chart-card">
                    <div class="chart-card__header">
                        <h4>Repayment Trend</h4>
                        <p class="chart-card__meta">Monthly verified repayments (completion trend).</p>
                    </div>
                    <canvas id="dashboard-repayment-chart" aria-label="Repayment trend"></canvas>
                    <div class="chart-empty" data-chart="dashboard-repayment" style="display:none;">No results found.</div>
                </article>
                <article class="chart-card">
                    <div class="chart-card__header">
                        <h4>Sector Distribution</h4>
                        <p class="chart-card__meta">Applicants vs beneficiaries by sector.</p>
                    </div>
                    <canvas id="dashboard-sector-chart" aria-label="Sector distribution"></canvas>
                    <div class="chart-empty" data-chart="dashboard-sector" style="display:none;">No results found.</div>
                </article>
            </div>
        </section>`;

    section.querySelector('#beneficiary-create')?.addEventListener('click', () => openBeneficiaryModal());
    section.querySelector('#dashboard-view-reports')?.addEventListener('click', () => renderSection('reports'));

    renderDashboardAlerts();
    renderDashboardSummary();
    renderDashboardActionQueue();
    renderDashboardRecentActivity();
    buildDashboardCharts();
}

function renderDashboardSummary() {
    const container = document.getElementById('dashboard-summary');
    if (!container) return;
    const roster = getDashboardFilteredRoster();
    const totalBeneficiaries = roster.length;
    const activeBeneficiaries = roster.filter((entry) => isActiveBeneficiaryStatus(entry.applicationStatus || entry.status)).length;
    const inactiveBeneficiaries = Math.max(totalBeneficiaries - activeBeneficiaries, 0);
    const verifiedPayments = roster.flatMap((b) => (b.repayments || []).filter((payment) => (payment.status || '').toLowerCase() === 'verified'));
    const verifiedAmount = verifiedPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

    let totalReq = 0;
    let verifiedReq = 0;
    roster.forEach((beneficiary) => {
        const summary = calculateRequirementSummary(beneficiary.requirements || {});
        if (!summary) return;
        totalReq += summary.total;
        verifiedReq += summary.verified;
    });
    const clearanceRate = totalReq ? Math.round((verifiedReq / totalReq) * 100) : 0;
    const trainingAttendanceRate = trainingAggregate?.attendanceRate || 0;

    container.innerHTML = `
        <article class="summary-card">
          <div class="summary-card__header">
            <span class="summary-icon summary-icon--teal">
              <i class="fas fa-users" aria-hidden="true"></i>
            </span>
          </div>
          <h4>Total beneficiaries</h4>
          <div class="metric">${numberFormatter.format(totalBeneficiaries)}</div>
          <p class="meta">Active ${numberFormatter.format(activeBeneficiaries)} • Inactive ${numberFormatter.format(inactiveBeneficiaries)}</p>
        </article>
        <article class="summary-card">
          <div class="summary-card__header">
            <span class="summary-icon summary-icon--green">
              <i class="fas fa-graduation-cap" aria-hidden="true"></i>
            </span>
          </div>
          <h4>Training completion</h4>
          <div class="metric">${trainingAttendanceRate}%</div>
          <p class="meta">Current attendance completion rate</p>
        </article>
        <article class="summary-card">
          <div class="summary-card__header">
            <span class="summary-icon summary-icon--amber">
              <i class="fas fa-clipboard-check" aria-hidden="true"></i>
            </span>
          </div>
          <h4>Requirements compliance</h4>
          <div class="metric">${clearanceRate}%</div>
          <p class="meta">${numberFormatter.format(verifiedReq)}/${numberFormatter.format(totalReq)} verified</p>
        </article>
        <article class="summary-card">
          <div class="summary-card__header">
            <span class="summary-icon summary-icon--indigo">
              <i class="fas fa-coins" aria-hidden="true"></i>
            </span>
          </div>
          <h4>Total repayments</h4>
          <div class="metric">${pesoFormatter.format(verifiedAmount || 0)}</div>
          <p class="meta">Verified collections to date</p>
        </article>
    `;
}


let dashboardQueueTab = 'pending';

function focusDashboardQueue(tab) {
    dashboardQueueTab = tab || 'pending';
    renderDashboardActionQueue();
    const section = document.getElementById('dashboard-queue');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderDashboardActionQueue() {
    const table = document.getElementById('dashboard-queue-table');
    const tabs = document.querySelectorAll('#dashboard-queue-tabs .queue-tab');
    if (!table) return;

    tabs.forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.queueTab === dashboardQueueTab);
        btn.addEventListener('click', () => {
            dashboardQueueTab = btn.dataset.queueTab || 'pending';
            renderDashboardActionQueue();
        });
    });

    const roster = getDashboardFilteredRoster();
    const headers = ['Beneficiary', 'Month/Date', 'Amount', 'Status', 'Action'];
    const rows = [];

    if (dashboardQueueTab === 'requirements') {
        roster.forEach((b) => {
            const summary = evaluateRequirements(b.requirements || {});
            summary.missing.forEach((key) => {
                const label = REQUIREMENTS.find((req) => req.key === key)?.label || key;
                rows.push({
                    cols: [
                        escapeHtml(b.name || '--'),
                        escapeHtml(label),
                        '—',
                        '<span class="badge badge--amber">Missing</span>',
                        '<button type="button" class="queue-btn" data-action="review">Review</button>'
                    ]
                });
            });
        });
    } else if (dashboardQueueTab === 'training') {
        const sessions = getUpcomingTrainingSessions();
        sessions.forEach((session) => {
            rows.push({
                cols: [
                    escapeHtml(session.title || session.name || 'Training session'),
                    escapeHtml(session.dateLabel || 'TBD'),
                    '—',
                    '<span class="badge badge--teal">Upcoming</span>',
                    '<button type="button" class="queue-btn" data-action="view">View</button>'
                ]
            });
        });
    } else if (dashboardQueueTab === 'overdue') {
        const overdue = getOverdueRepaymentRows(roster);
        overdue.forEach((row) => rows.push(row));
    } else {
        const pending = getPendingProofRows(roster);
        pending.forEach((row) => rows.push(row));
    }

    const headerRow = headers.map((h) => `<th>${h}</th>`).join('');
    const bodyRows = rows.length
        ? rows.map((row) => `<tr>${row.cols.map((col) => `<td>${col}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="5" class="muted">No records found.</td></tr>`;

    table.innerHTML = `
        <div class="queue-table__wrap">
            <table class="queue-table__table">
                <thead><tr>${headerRow}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>`;
}


function getUpcomingTrainingSessions() {
    const sessions = trainingSnapshot?.sessions || [];
    const now = new Date();
    const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
    return sessions
        .map((session) => {
            const raw = session.date || session.startDate || session.scheduleDate || session.scheduledAt;
            const when = raw ? new Date(raw) : null;
            const participants = Array.isArray(session.participants) ? session.participants.length : (session.participantCount || 0);
            return { ...session, when, participants, dateLabel: raw ? formatDate(raw) : 'TBD' };
        })
        .filter((session) => session.when && !Number.isNaN(session.when.getTime()) && session.when >= now && session.when <= horizon)
        .sort((a, b) => a.when - b.when)
        .slice(0, 10);
}

function renderDashboardRecentActivity() {
    const list = document.getElementById('dashboard-activity-list');
    if (!list) return;

    const roster = getDashboardFilteredRoster();
    const events = [];

    roster.slice(0, 6).forEach((b, index) => {
        events.push({
            icon: 'fas fa-user-check',
            message: `${escapeHtml(b.name || 'Beneficiary')} profile reviewed`,
            time: `${index + 1}h ago`
        });
    });

    roster.flatMap((b) => b.repayments || []).slice(0, 4).forEach((p, index) => {
        events.push({
            icon: 'fas fa-receipt',
            message: `Receipt logged for ${escapeHtml(p.month || p.dueFor || 'repayment')}`,
            time: `${index + 2}h ago`
        });
    });

    list.innerHTML = events.slice(0, 10).map((item) => `
        <li class="activity-item">
            <span class="activity-icon"><i class="${item.icon}"></i></span>
            <div>
                <div>${item.message}</div>
                <div class="activity-time">${item.time}</div>
            </div>
        </li>`).join('') || '<li class="muted">No activity yet.</li>';
}
function toggleDashboardMiniInsights(hasData) {
    const emptyState = document.getElementById('dashboard-mini-empty');
    const charts = document.getElementById('dashboard-charts');
    if (!emptyState || !charts) return;
    emptyState.hidden = hasData;
    charts.classList.toggle('is-hidden', !hasData);
}
function renderBeneficiariesTable() {
    const tbody = document.querySelector('#beneficiaries-table tbody');
    if (!tbody) return;

    const roster = getDashboardFilteredRoster();

    const rows = roster.map(b => {
        const repayment = computeRepaymentProgress(b);
        const status = b.applicationStatus || b.status || 'Pending';
        const statusClass = status.toLowerCase() === 'active'
            ? 'badge-theme success'
            : ['rejected', 'dropped'].includes(status.toLowerCase())
                ? 'badge-theme danger'
                : 'badge-theme';
        const training = getTrainingProgress(b.id);
        const actions = [
            `<button type="button" class="action-button" data-action="profile" data-id="${b.id}"><i class="fas fa-id-card"></i><span>Profile</span></button>`
        ];
        actions.push(`<button type="button" class="action-button" data-action="edit" data-id="${b.id}"><i class="fas fa-pen"></i><span>Edit</span></button>`);

        return `
            <tr>
              <td>
                <div class="table-primary">${escapeHtml(b.name)}</div>
                <div class="table-secondary">${escapeHtml(formatBeneficiaryAddress(b))}</div>
                <div class="table-tertiary">${escapeHtml(b.contact || '')}</div>
              </td>
              <td>${escapeHtml(b.businessType || 'Not specified')}</td>
              <td>${pesoFormatter.format(b.assistanceAmount || PROGRAM.assistanceTotal)}</td>
              <td>
                <div class="progress-line" role="progressbar" aria-valuenow="${repayment.progressPct}" aria-valuemin="0" aria-valuemax="100">
                  <div class="progress-line__bar" style="width:${repayment.progressPct}%"></div>
                </div>
                <div class="progress-line__meta">${repayment.verifiedMonths}/${PROGRAM.termMonths} months ? ${pesoFormatter.format(repayment.totalVerifiedAmount)} paid</div>
                <div class="progress-line__meta muted">Remaining balance ${pesoFormatter.format(repayment.remainingBalance)}</div>
              </td>
              <td><span class="${statusClass}">${escapeHtml(status)}</span></td>
              <td class="actions">${actions.join('')}</td>
            </tr>`;
    }).join('');

    tbody.innerHTML = rows || '<tr><td colspan="7" class="text-center text-muted">No approved beneficiaries yet.</td></tr>';
    tbody.addEventListener('click', handleBeneficiariesActions, { once: true });

    const countChip = document.getElementById('beneficiary-count-chip');
    if (countChip) {
        countChip.textContent = `${numberFormatter.format(roster.length)} records`;
    }
}

function handleBeneficiariesActions(event) {
    const button = event.target.closest('button[data-action]');
    const tbody = document.querySelector('#beneficiaries-table tbody');
    if (!button) {
        tbody?.addEventListener('click', handleBeneficiariesActions, { once: true });
        return;
    }
    const rawId = button.dataset.id;
    const idNumber = Number(rawId);
    const action = button.dataset.action;
    if (action === 'profile') openBeneficiaryProfile(idNumber);
    if (action === 'training') { activeTrainingBeneficiaryId = rawId || idNumber; renderSection('training'); }
    if (action === 'repayments') openRepaymentModal(idNumber);
    if (action === 'edit') openBeneficiaryModal(idNumber);
    tbody?.addEventListener('click', handleBeneficiariesActions, { once: true });
}

function computeDashboardSnapshot() {
    const roster = getBeneficiaryRoster();
    const applicants = getApplicantPool();

    const total = roster.length;
    const active = roster.filter((b) => normalizeStatus(b.applicationStatus || b.status) === 'active').length;
    const pipelineStatusSet = new Set(['submitted', 'underreview', 'forvalidation', 'pendingrequirements', 'shortlisted', 'approvedfortraining'].map(normalizeStatus));
    const pendingStatusSet = new Set(['submitted', 'underreview', 'forvalidation', 'pendingrequirements'].map(normalizeStatus));

    const pipeline = applicants.filter((b) => pipelineStatusSet.has(normalizeStatus(b.applicationStatus || b.status))).length;
    const pendingApps = applicants.filter((b) => pendingStatusSet.has(normalizeStatus(b.applicationStatus || b.status))).length;

    let pendingReceipts = 0;
    let totalReq = 0;
    let verifiedReq = 0;

    roster.forEach((b) => {
        (b.repayments || []).forEach((payment) => {
            if ((payment.status || '').toLowerCase() !== 'verified') pendingReceipts += 1;
        });
    });

    const requirementSource = [...roster, ...applicants];
    const seenRequirementIds = new Set();
    requirementSource.forEach((b) => {
        if (b?.id != null) {
            const key = String(b.id);
            if (seenRequirementIds.has(key)) return;
            seenRequirementIds.add(key);
        }
        REQUIREMENTS.forEach((req) => {
            const entry = b.requirements?.[req.key];
            if (!entry) return;
            totalReq += 1;
            if (entry.status === 'verified') verifiedReq += 1;
        });
    });

    const trainingRoster = trainingAggregate?.roster || [];
    const trainingSessions = trainingSnapshot?.sessions?.length || 0;
    const trainingCompletionRate = trainingAggregate?.attendanceRate || 0;
    const trainingEligible = trainingRoster.filter(item => (item.progress?.present || 0) > 0 || (item.progress?.completion || 0) >= 50).length;

    return {
        totalBeneficiaries: total,
        activeBeneficiaries: active,
        pipelineBeneficiaries: pipeline,
        pendingApplications: pendingApps,
        pendingReceipts,
        totalRequirements: totalReq || 1,
        verifiedRequirements: verifiedReq,
        verificationRate: totalReq ? Math.round((verifiedReq / totalReq) * 100) : 0,
        trainingEligible,
        trainingCompletionRate,
        trainingSessions
    };
}


function computeRepaymentProgress(beneficiary) {
    const repayments = beneficiary.repayments || [];
    const verified = repayments.filter(payment => (payment.status || '').toLowerCase() === 'verified');
    const totalVerified = verified.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const months = verified.length;
    return {
        verifiedMonths: months,
        totalVerifiedAmount: totalVerified,
        remainingBalance: Math.max((beneficiary.assistanceAmount || PROGRAM.assistanceTotal) - totalVerified, 0),
        progressPct: Math.round(Math.min(100, (months / PROGRAM.termMonths) * 100))
    };
}

// Additional sections continue...
// -----------------------------------------------------------------------------
// Applications
// -----------------------------------------------------------------------------
function renderApplicationsSection() {
    const section = document.getElementById('applications-section');
    if (!section) return;

    section.innerHTML = `
        <div class="dashboard-header">
            <div>
                <h3>Applications (For Review)</h3>
                <p>Review submissions and keep statuses up-to-date.</p>
            </div>
            <div class="header-actions">
                <select id="applications-filter" class="field-select">
                    <option value="">All statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="UnderReview">Under Review</option>
                    <option value="Rejected">Rejected</option>
                </select>
                <button type="button" class="app-btn-ghost" id="applications-refresh"><i class="fas fa-rotate"></i><span>Refresh</span></button>
            </div>
        </div>
        ${buildFilterBarMarkup('applications')}
        <div class="applications-summary" id="applications-summary">
            <div class="summary-chip">
                <span>Pending</span>
                <strong id="applications-pending-count">0</strong>
            </div>
            <div class="summary-chip">
                <span>Rejected</span>
                <strong id="applications-rejected-count">0</strong>
            </div>
        </div>
        <div class="table-card">
            <div class="table-wrapper">
                <table class="data-table" id="applications-table">
                    <thead>
                        <tr>
                            <th>Applicant</th>
                            <th>Business Type</th>
                            <th>Requirements</th>
                            <th>Status</th>
                            <th>Submitted</th>
                            <th class="actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>`;

    section.querySelector('#applications-filter').addEventListener('change', renderApplicationsRows);
    section.querySelector('#applications-refresh').addEventListener('click', renderApplicationsRows);
    section.querySelector('#applications-table').addEventListener('click', handleApplicationsTableClick);
    initFilterBar('applications', renderApplicationsRows);
    renderApplicationsRows();
}

function renderApplicationsRows() {
    const tbody = document.querySelector('#applications-table tbody');
    if (!tbody) return;
    const filter = document.getElementById('applications-filter').value;

    ensureApplicationsCoverage();

    const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z]/g, '');
    const pendingStatusSet = new Set(['pending', 'submitted', 'underreview', 'forvalidation', 'pendingverification', 'pendingrequirements', 'shortlisted', 'approvedfortraining']);
    const rejectedStatusSet = new Set(['rejected', 'declined']);
    const approvedStatusSet = new Set(['approved', 'active', 'beneficiary', 'released']);

    const isPending = (status) => pendingStatusSet.has(normalize(status));
    const isRejected = (status) => rejectedStatusSet.has(normalize(status));
    const isApproved = (status) => approvedStatusSet.has(normalize(status));

    const filteredApps = applications
        .filter(app => !isApproved(app.status))
        .filter(app => {
            if (!filter) return true;
            if (filter === 'Pending') return isPending(app.status);
            if (filter === 'UnderReview') return normalize(app.status) === 'underreview';
            if (filter === 'Rejected') return isRejected(app.status);
            return app.status === filter;
        })
        .filter((app) => {
            const beneficiary = beneficiaries.find(b => b.id === app.beneficiaryId);
            const sectorText = [
                app.profile?.sector,
                app.profile?.sectorDetails,
                beneficiary?.sector,
                beneficiary?.program
            ].filter(Boolean).join(' ');
            return matchesNameSearch(app.applicantName || app.name || '', 'applications')
                && matchesSectorFilterText(sectorText, 'applications');

    const pendingCount = applications.filter(app => isPending(app.status) && !isApproved(app.status)).length;
    const rejectedCount = applications.filter(app => isRejected(app.status)).length;
    const pendingEl = document.getElementById('applications-pending-count');
    const rejectedEl = document.getElementById('applications-rejected-count');
    if (pendingEl) pendingEl.textContent = pendingCount;
    if (rejectedEl) rejectedEl.textContent = rejectedCount;

    const rows = filteredApps
        .map(app => {
            const beneficiary = beneficiaries.find(b => b.id === app.beneficiaryId);
            const requirements = app.requirements || beneficiary?.requirements || {};
            const summary = calculateRequirementSummary(requirements);
            const uploadsLabel = summary
                ? `${summary.uploaded}/${summary.total} uploaded${summary.verified ? ` • ${summary.verified} verified` : ''}`
                : 'Awaiting uploads';
            const statusClass = isRejected(app.status) ? 'badge-theme danger' : 'badge-theme';
            const profile = app.profile || beneficiary?.profile || {};
            const location = beneficiary ? formatBeneficiaryAddress(beneficiary) : (profile.barangay || '--');
            const sectorValue = profile.sector || beneficiary?.sector || profile.sectorDetails || '';
            const sector = formatSectorLabel(sectorValue);
            const contact = app.email || beneficiary?.contact || 'Not provided';
            const actionLabel = 'Review';
            return `
                <tr>
                    <td>
                        <div class="table-primary">${escapeHtml(app.applicantName)}</div>
                        <div class="table-secondary">${escapeHtml(contact)}</div>
                    </td>
                    <td>
                        <div class="table-primary">${escapeHtml(app.businessType || beneficiary?.businessType || 'Not provided')}</div>
                        <div class="table-secondary">${escapeHtml(location)}${sector ? ` • ${escapeHtml(sector)}` : ''}</div>
                    </td>
                    <td><span class="badge-theme">${escapeHtml(uploadsLabel)}</span></td>
                    <td><span class="${statusClass}">${app.status || 'Pending'}</span></td>
                    <td>${formatDate(app.submittedAt)}</td>
                    <td class="actions">
                        <button type="button" class="action-button" data-action="view" data-id="${app.id}"><i class="fas fa-clipboard-check"></i><span>${actionLabel}</span></button>
                    </td>
                </tr>`;
        }).join('');

    tbody.innerHTML = rows || '<tr><td colspan="6" class="text-center text-muted">No results found.</td></tr>';
}

function handleApplicationsTableClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    if (action === 'view') openApplicationModal(id);
    if (action === 'approve') attemptApplicationApproval(id);
    if (action === 'reject') setApplicationStatus(id, 'Rejected');
}

function openApplicationModal(applicationId) {
    const modal = document.getElementById('applicationModal');
    const app = applications.find(item => item.id === applicationId);
    if (!modal || !app) return;
    const beneficiary = beneficiaries.find(b => b.id === app.beneficiaryId);
    const requirements = app.requirements || beneficiary?.requirements || {};
    const profile = app.profile || beneficiary?.profile || {};

    document.getElementById('app-modal-id').value = app.id;
    document.getElementById('app-modal-title').textContent = app.applicantName;
    const statusBadge = document.getElementById('app-modal-status');
    statusBadge.textContent = app.status;
    statusBadge.className = app.status === 'Approved' ? 'badge-theme success' : app.status === 'Rejected' ? 'badge-theme danger' : 'badge-theme';
    document.getElementById('app-modal-submitted').textContent = formatDate(app.submittedAt);
    document.getElementById('app-modal-business').textContent = app.businessType || beneficiary?.businessType || 'Not provided';
    document.getElementById('app-modal-email').textContent = app.email || 'Not provided';
    document.getElementById('app-modal-contact').textContent = app.contactNumber || beneficiary?.contact || 'Not provided';
    const programSelect = document.getElementById('app-modal-program');
    const derivedProgram = deriveProgramFromSector(profile.sector || profile.sectorDetails || beneficiary?.sector);
    const preferredProgram = [profile.program, beneficiary?.program, derivedProgram].find(value => value && ['4Ps', 'Non-4Ps'].includes(value));
    programSelect.value = preferredProgram || 'Non-4Ps';

    const sectorDisplay = formatSectorLabel(profile.sector || profile.sectorDetails || beneficiary?.sector || '');
    document.getElementById('app-modal-sector').textContent = sectorDisplay || 'Not provided';
    document.getElementById('app-modal-barangay').textContent = beneficiary?.barangay || app.barangay || profile.barangay || 'Not provided';
    document.getElementById('app-modal-household').textContent = profile.householdSize ? `${profile.householdSize} member${profile.householdSize > 1 ? 's' : ''}` : 'Not provided';
    document.getElementById('app-modal-income').textContent = typeof profile.monthlyIncome === 'number' && !Number.isNaN(profile.monthlyIncome)
        ? pesoFormatter.format(profile.monthlyIncome)
        : 'Not provided';
    document.getElementById('app-modal-livelihood').textContent = profile.mainLivelihood || 'Not provided';

    const requirementsRoot = document.getElementById('app-modal-requirements');
    const list = requirementsRoot.cloneNode(false);
    requirementsRoot.replaceWith(list);

    const requirementSummary = evaluateRequirements(requirements);

    list.innerHTML = REQUIREMENTS.map(req => {
        const entry = requirements[req.key] || {};
        const status = entry.status || 'Uploaded';
        const statusLower = status.toLowerCase();
        const badgeClass = statusLower === 'verified'
            ? 'badge-theme success'
            : statusLower === 'missing'
                ? 'badge-theme danger'
                : 'badge-theme';
        const filesMarkup = (entry.files || []).map(file => {
            const href = file.dataUrl ? sanitizeDataUrl(file.dataUrl) : (file.url || '');
            const name = escapeHtml(file.name || 'Attachment');
            const metaParts = [];
            if (typeof file.size === 'number') metaParts.push(formatFileSize(file.size));
            if (file.uploadedAt) metaParts.push(formatDate(file.uploadedAt));
            const meta = metaParts.length ? `<span class="text-muted">${metaParts.join(' â€¢ ')}</span>` : '';
            if (href) {
                return `<li><a class="file-download" href="${escapeAttribute(href)}" download="${escapeAttribute(file.name || req.label)}">${name}</a> ${meta}</li>`;
            }
            return `<li>${name} ${meta}</li>`;
        }).join('');
        const remarks = entry.remarks ? `<p class="mini-note">${escapeHtml(entry.remarks)}</p>` : '';
        return `
            <li class="requirement-item" data-key="${req.key}">
                <div class="requirement-header">
                    <div>
                        <h5>${req.label}</h5>
                        ${remarks}
                    </div>
                    <span class="${badgeClass}">${status}</span>
                </div>
                <div class="requirement-files">${filesMarkup || '<p class="mini-note">No file uploaded</p>'}</div>
                <div class="requirement-actions">
                    <button type="button" class="action-button success" data-action="mark-verified" data-key="${req.key}"><i class="fas fa-check"></i><span>Mark verified</span></button>
                    <button type="button" class="action-button" data-action="mark-pending" data-key="${req.key}"><i class="fas fa-rotate-left"></i><span>Set pending</span></button>
                    <button type="button" class="action-button danger" data-action="mark-missing" data-key="${req.key}"><i class="fas fa-circle-exclamation"></i><span>Flag issue</span></button>
                </div>
            </li>`;
    }).join('');

    list.addEventListener('click', handleRequirementAction, { once: true });

    const approveBtn = document.getElementById('app-modal-approve');
    if (approveBtn) {
        approveBtn.disabled = requirementSummary.hasBlockingIssues;
        approveBtn.title = requirementSummary.hasBlockingIssues
            ? 'Approval blocked: missing or invalid requirements'
            : 'Approve application';
    }
    showModal(modal);
}

function handleRequirementAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
        document.getElementById('app-modal-requirements').addEventListener('click', handleRequirementAction, { once: true });
        return;
    }
    const action = button.dataset.action;
    const key = button.dataset.key;
    const applicationId = Number(document.getElementById('app-modal-id').value);
    const app = applications.find(item => item.id === applicationId);
    if (!app) return;
    const beneficiary = beneficiaries.find(b => b.id === app.beneficiaryId);

    const apply = status => {
        if (!app.requirements) app.requirements = {};
        if (!app.requirements[key]) app.requirements[key] = { files: [], remarks: '' };
        app.requirements[key].status = status;
        if (beneficiary) {
            if (!beneficiary.requirements) beneficiary.requirements = {};
            if (!beneficiary.requirements[key]) beneficiary.requirements[key] = { files: [], remarks: '' };
            beneficiary.requirements[key].status = status;
            persistBeneficiaries();
        }
        persistApplications();
        openApplicationModal(applicationId);
    };

    if (action === 'mark-verified') apply('Verified');
    if (action === 'mark-pending') apply('Uploaded');
    if (action === 'mark-missing') apply('Missing');
    document.getElementById('app-modal-requirements').addEventListener('click', handleRequirementAction, { once: true });
}

function attemptApplicationApproval(applicationId, options = {}) {
    const app = applications.find(item => item.id === applicationId);
    if (!app) return;
    const beneficiary = beneficiaries.find(b => b.id === app.beneficiaryId);
    const requirements = app.requirements || beneficiary?.requirements || {};
    const evaluation = evaluateRequirements(requirements);

    if (evaluation.hasBlockingIssues) {
        showToast('Approval blocked: missing or invalid requirements', 'warning');
        if (options.fromModal) {
            const approveBtn = document.getElementById('app-modal-approve');
            if (approveBtn) approveBtn.disabled = true;
        }
        sendRequirementIssueNotification(app, evaluation);
        return;
    }

    const summaryMessage = formatRequirementSummaryMessage(evaluation);
    const proceed = window.confirm(summaryMessage);
    if (!proceed) return;

    setApplicationStatus(applicationId, 'Approved');
    if (options.fromModal) hideModal(document.getElementById('applicationModal'));
}

function sendRequirementIssueNotification(app, evaluation) {
    const missingList = evaluation?.missing?.length
        ? evaluation.missing.map(key => REQUIREMENTS.find(r => r.key === key)?.label || key).join(', ')
        : 'requirements missing';
    showToast(`Beneficiary flagged: ${missingList}`, 'info');
}

function sendRejectionNotification(app, evaluation) {
    const email = app?.email || beneficiaries.find(b => b.id === app?.beneficiaryId)?.email;
    if (!email) return;
    const missingLabels = evaluation?.missing?.length
        ? evaluation.missing.map(key => REQUIREMENTS.find(r => r.key === key)?.label || key)
        : [];
    const pendingLabels = evaluation?.uploaded?.length
        ? evaluation.uploaded.map(key => REQUIREMENTS.find(r => r.key === key)?.label || key)
        : [];
    const parts = [];
    if (missingLabels.length) parts.push(`Missing: ${missingLabels.join(', ')}`);
    const message = parts.length
        ? `${parts.join(' | ')}. Please update the incorrect or incomplete items in your application portal.`
        : 'Please review your submitted requirements for accuracy.';
    storeApplicantNotification({
        email,
        title: 'Application rejected',
        message,
        timestamp: new Date().toISOString(),
        type: 'email'
    });
}

function storeApplicantNotification(payload) {
    if (!payload?.email) return;
    try {
        const list = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]');
        const safeList = Array.isArray(list) ? list : [];
        safeList.push(payload);
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(safeList));
    } catch (err) {
        console.warn('Unable to persist applicant notification', err);
    }
}

function setApplicationStatus(applicationId, status) {
    const app = applications.find(item => item.id === applicationId);
    if (!app) return;
    app.status = status;
    app.reviewedAt = new Date().toISOString();
    persistApplications();

    const beneficiary = beneficiaries.find(b => b.id === app.beneficiaryId);
    const evaluation = evaluateRequirements(app.requirements || beneficiary?.requirements || {});
    if (beneficiary) {
        if (status === 'Approved') {
            beneficiary.status = 'Active';
            beneficiary.applicationStatus = 'Active';
        } else if (status === 'Rejected') {
            beneficiary.status = 'Rejected';
            beneficiary.applicationStatus = 'Rejected';
        } else {
            beneficiary.status = 'Pending';
            beneficiary.applicationStatus = 'Pending';
        }
        persistBeneficiaries();
        syncTrainingBeneficiaries();
        updateTrainingDependentViews();
    }

    if (status === 'Rejected') {
        sendRejectionNotification(app, evaluation);
    }
    updateApplicantRole(app, status);

    renderApplicationsSection();
    renderDashboardSummary();
    renderBeneficiariesTable();
    showToast(`Application marked ${status.toLowerCase()}`, status === 'Rejected' ? 'warning' : 'success');
}

function updateApplicantRole(app, status) {
    if (!app?.email) return;
    try {
        const users = JSON.parse(localStorage.getItem('smartleap_users_v2') || '[]');
        if (!Array.isArray(users)) return;
        const match = users.find(user => (user.email || '').toLowerCase() === app.email.toLowerCase());
        if (!match) return;
        if (status === 'Approved') {
            match.role = 'Beneficiary';
        } else if (status === 'Rejected') {
            match.role = 'Applicant';
        }
        if (app.businessName || app.profile?.businessName) {
            match.businessName = app.businessName || app.profile?.businessName;
        }
        match.updatedAt = new Date().toISOString();
        localStorage.setItem('smartleap_users_v2', JSON.stringify(users));
    } catch (err) {
        console.warn('Unable to update applicant role', err);
    }
}

function mapBeneficiaryStatusToApplication(status) {
    const normalized = normalizeStatus(status);
    if (!normalized) return 'Pending';
    if (['rejected', 'dropped', 'declined'].some(token => normalized.includes(token))) return 'Rejected';
    if (isBeneficiaryStatus(status)) return 'Approved';
    return 'Pending';
}

function upsertApplicationFromBeneficiary(beneficiary, source = 'admin', persist = true) {
    if (!beneficiary) return false;
    const now = new Date().toISOString();
    const status = mapBeneficiaryStatusToApplication(beneficiary.status || beneficiary.applicationStatus);
    const matchIndex = applications.findIndex(app =>
        app.beneficiaryId === beneficiary.id ||
        (!!beneficiary.email && app.email && app.email.toLowerCase() === beneficiary.email.toLowerCase())
    );

    let changed = false;

    if (matchIndex >= 0) {
        const existing = applications[matchIndex];
        const nextRecord = {
            ...existing,
            applicantName: beneficiary.name || existing.applicantName || 'Beneficiary',
            email: beneficiary.email || existing.email || '',
            contact: beneficiary.contact || existing.contact || '',
            businessType: beneficiary.businessType || existing.businessType || '',
            requirements: beneficiary.requirements || existing.requirements || {},
            beneficiaryId: beneficiary.id,
            status,
            barangay: beneficiary.barangay || existing.barangay || '',
            sector: beneficiary.sector || existing.sector || '',
            address: beneficiary.address || existing.address || beneficiary.location || '',
            gender: beneficiary.gender || existing.gender || '',
            age: typeof beneficiary.age === 'number' && !Number.isNaN(beneficiary.age) ? beneficiary.age : existing.age,
            source: existing.source || source
        };
        if (!nextRecord.submittedAt) {
            nextRecord.submittedAt = deriveSubmissionDate(beneficiary, existing.submittedAt || now) || existing.submittedAt || toDateOnly(now) || now;
        } else {
            const derived = deriveSubmissionDate(beneficiary, nextRecord.submittedAt || existing.submittedAt || now);
            if (derived) nextRecord.submittedAt = derived;
        }
        const previousComparable = { ...existing };
        const nextComparable = { ...nextRecord, updatedAt: existing.updatedAt };
        const previous = JSON.stringify(previousComparable);
        const updated = JSON.stringify(nextComparable);
        if (previous !== updated) {
            nextRecord.updatedAt = now;
            applications[matchIndex] = nextRecord;
            changed = true;
        }
    } else {
        const submissionDate = deriveSubmissionDate(beneficiary, now) || toDateOnly(now) || now;
        applications.push({
            id: beneficiary.id,
            applicantName: beneficiary.name || 'Beneficiary',
            email: beneficiary.email || '',
            contact: beneficiary.contact || '',
            businessType: beneficiary.businessType || '',
            requirements: beneficiary.requirements || {},
            beneficiaryId: beneficiary.id,
            status,
            submittedAt: submissionDate,
            updatedAt: now,
            barangay: beneficiary.barangay || '',
            sector: beneficiary.sector || '',
            address: beneficiary.address || beneficiary.location || '',
            gender: beneficiary.gender || '',
            age: typeof beneficiary.age === 'number' && !Number.isNaN(beneficiary.age) ? beneficiary.age : undefined,
            source
        changed = true;
    }
    if (changed && persist) {
        persistApplications();
    }
    return changed;
}

function ensureApplicationsCoverage() {
    let updated = false;
    const applicants = getApplicantPool();
    applicants.forEach(applicant => {
        if (upsertApplicationFromBeneficiary(applicant, 'admin-sync', false)) {
            updated = true;
        }
    });
    if (updated) {
        persistApplications();
    }
}

function toDateOnly(value) {
    if (!value) return null;
    const str = String(value);
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    if (str.includes('T')) {
        return str.split('T')[0];
    }
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }
    return null;
}

function deriveSubmissionDate(source, fallback) {
    if (source && typeof source === 'object') {
        const candidates = ['submittedAt', 'applicationDate', 'appliedAt', 'createdAt', 'intakeDate', 'dateApplied', 'dateSubmitted'];
        for (const key of candidates) {
            const candidate = toDateOnly(source[key]);
            if (candidate) return candidate;
        }
    }
    return toDateOnly(fallback);
}

// -----------------------------------------------------------------------------
// Release Verification workspace
// -----------------------------------------------------------------------------

const STORAGE_KEYS_RELEASES = 'smartleap_admin_releases_v1';

function getReleaseRecords() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS_RELEASES);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function persistReleaseRecords(records) {
    localStorage.setItem(STORAGE_KEYS_RELEASES, JSON.stringify(records));
}

function getApplicationsReadyForRelease() {
    // Get all applications and check which ones have all 10 requirements complete
    return applications.filter(app => {
        if (!app.requirements) return false;
        
        // Check if all 10 requirements have files uploaded
        const requirementsCompleted = REQUIREMENTS.every(req => {
            const requirementData = app.requirements[req.key];
            return requirementData && requirementData.files && requirementData.files.length > 0;
        
        // Only include if not already released and has all requirements
        const isReleased = normalizeStatus(app.status) === 'released' || 
                          normalizeStatus(app.status) === 'active' ||
                          normalizeStatus(app.status) === 'disbursed';
        
        return requirementsCompleted && !isReleased;
    });
}

function renderReleasesSection() {
    const section = document.getElementById('releases-section');
    if (!section) return;

    // Get applications ready for verification (all 10 requirements complete)
    loadState();
    const readyForRelease = getApplicationsReadyForRelease();
    const records = getReleaseRecords();
    const pendingRecords = records.filter(r => !r.verificationStatus || r.verificationStatus === 'Pending');
    const verifiedRecords = records.filter(r => r.verificationStatus === 'Verified');
    const rejectedRecords = records.filter(r => r.verificationStatus === 'Rejected' || r.verificationStatus === 'Returned');

    section.innerHTML = `
        <div class="dashboard-header">
            <div>
                <h3>Verify Assistance Release Records</h3>
                <p>Review applicants who have completed all requirements and are ready to receive assistance.</p>
            </div>
            <div class="header-actions">
                <button type="button" class="app-btn-ghost" id="releases-refresh"><i class="fas fa-rotate"></i><span>Refresh</span></button>
            </div>
        </div>

        <div class="summary-grid" style="margin-bottom: 24px;">
            <div class="summary-card warning">
                <h6>Ready for Verification</h6>
                <strong>${numberFormatter.format(readyForRelease.length)}</strong>
            </div>
            <div class="summary-card success">
                <h6>Verified (Released)</h6>
                <strong>${numberFormatter.format(verifiedRecords.length)}</strong>
            </div>
            <div class="summary-card danger">
                <h6>Returned / Needs Revision</h6>
                <strong>${numberFormatter.format(rejectedRecords.length)}</strong>
            </div>
            <div class="summary-card">
                <h6>Total Applications</h6>
                <strong>${numberFormatter.format(applications.length)}</strong>
            </div>
        </div>

        <div class="table-card">
            <div class="table-toolbar">
                <h4>Applications Ready for Release</h4>
                <span class="chip" id="releases-count">${numberFormatter.format(readyForRelease.length)} ready</span>
            </div>
            <div class="table-wrapper">
                <table class="data-table" id="releases-table">
                    <thead>
                        <tr>
                            <th>Applicant</th>
                            <th>Business Type</th>
                            <th>Requirements</th>
                            <th>Sector</th>
                            <th>Status</th>
                            <th class="actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>`;

    // Refresh button handler
    const refreshBtn = section.querySelector('#releases-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', renderReleasesSection);
    }

    // Render table rows
    const tbody = section.querySelector('#releases-table tbody');
    if (!tbody) return;

    if (readyForRelease.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No applications ready for verification yet. Applicants must complete all 10 requirements first.</td></tr>`;
        return;
    }

    // Calculate requirements count for each application
    tbody.innerHTML = readyForRelease.map(app => {
        const completedCount = REQUIREMENTS.filter(req => {
            const reqData = app.requirements[req.key];
            return reqData && reqData.files && reqData.files.length > 0;
        }).length;
        
        const status = app.status || 'Pending';
        const statusClass = 'badge-theme warning';
        
        return `
            <tr>
                <td>
                    <div class="table-primary">${escapeHtml(app.applicantName || 'Unknown')}</div>
                    <div class="table-tertiary">${escapeHtml(app.email || app.contact || '')}</div>
                </td>
                <td>${escapeHtml(app.businessType || 'N/A')}</td>
                <td>
                    <span class="badge-theme success">${completedCount}/${REQUIREMENTS.length} Complete</span>
                </td>
                <td>${escapeHtml(app.sector || 'N/A')}</td>
                <td><span class="${statusClass}">Ready for Release</span></td>
                <td class="actions">
                    <button type="button" class="action-button" data-action="view" data-id="${escapeHtml(app.id)}">
                        <i class="fas fa-eye"></i><span>View</span>
                    </button>
                    <button type="button" class="action-button success" data-action="verify" data-id="${escapeHtml(app.id)}">
                        <i class="fas fa-check"></i><span>Verify</span>
                    </button>
                    <button type="button" class="action-button danger" data-action="reject" data-id="${escapeHtml(app.id)}">
                        <i class="fas fa-times"></i><span>Return</span>
                    </button>
                </td>
            </tr>`;
    }).join('');

    // Attach event listeners to action buttons
    tbody.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.dataset.action;
            const recordId = btn.dataset.id;
            handleReleaseAction(action, recordId);
    });
}

function handleReleaseAction(action, applicationId) {
    const application = applications.find(a => a.id === applicationId);
    if (!application) return;

    if (action === 'view') {
        openApplicationVerificationModal(application);
    } else if (action === 'verify') {
        verifyApplicationForRelease(applicationId);
    } else if (action === 'reject') {
        rejectApplicationForRelease(applicationId);
    }
}

function openApplicationVerificationModal(application) {
    const modal = document.getElementById('releaseVerificationModal');
    if (!modal) return;

    // Populate modal with application data
    document.getElementById('release-modal-pdo').textContent = 'Pending PDO Assignment';
    document.getElementById('release-modal-beneficiary').textContent = application.applicantName || 'Unknown';
    document.getElementById('release-modal-date').textContent = formatDate(application.submittedAt);
    document.getElementById('release-modal-type').textContent = application.businessType || 'N/A';
    document.getElementById('release-modal-amount').textContent = pesoFormatter.format(PROGRAM.assistanceTotal);
    document.getElementById('release-modal-mode').textContent = 'To be determined';
    document.getElementById('release-modal-location').textContent = application.barangay || 'N/A';
    document.getElementById('release-modal-or').textContent = 'Pending release';
    document.getElementById('release-modal-notes').textContent = application.notes || 'No notes provided.';
    
    const status = 'Ready for Verification';
    const statusEl = document.getElementById('release-modal-status');
    statusEl.textContent = status;
    statusEl.className = 'badge bg-warning';

    // Load uploaded documents
    const documentsEl = document.getElementById('release-modal-documents');
    if (application.requirements) {
        const documentList = [];
        REQUIREMENTS.forEach(req => {
            const reqData = application.requirements[req.key];
            if (reqData && reqData.files && reqData.files.length > 0) {
                reqData.files.forEach((file, idx) => {
                    documentList.push({
                        type: req.label,
                        filename: file.name || file.filename || 'Unknown',
                        size: file.sizeText || ''
                    });
                });
            }
        
        if (documentList.length > 0) {
            documentsEl.innerHTML = documentList.map(doc => `
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <i class="fas fa-file-pdf text-danger"></i>
                            <strong>${escapeHtml(doc.type)}</strong>
                            <p class="mb-0 small text-muted">${escapeHtml(doc.filename)} ${doc.size ? ' â€¢ ' + doc.size : ''}</p>
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            documentsEl.innerHTML = '<p class="text-muted">No documents uploaded.</p>';
        }
    } else {
        documentsEl.innerHTML = '<p class="text-muted">No documents uploaded.</p>';
    }

    // Set application ID
    document.getElementById('release-verification-record-id').value = application.id;
    document.getElementById('release-verification-remark').value = application.adminRemarks || '';

    // Update action button handlers
    const approveBtn = document.getElementById('release-verification-approve');
    const rejectBtn = document.getElementById('release-verification-reject');
    
    const newApproveBtn = approveBtn.cloneNode(true);
    const newRejectBtn = rejectBtn.cloneNode(true);
    approveBtn.parentNode.replaceChild(newApproveBtn, approveBtn);
    rejectBtn.parentNode.replaceChild(newRejectBtn, rejectBtn);

    newApproveBtn.addEventListener('click', () => {
        const remark = document.getElementById('release-verification-remark').value;
        verifyApplicationForRelease(application.id, remark);
        hideModal(modal);
    });

    newRejectBtn.addEventListener('click', () => {
        const remark = document.getElementById('release-verification-remark').value;
        rejectApplicationForRelease(application.id, remark);
        hideModal(modal);
    });

    showModal(modal);
}

function verifyApplicationForRelease(applicationId, remarks = '') {
    const appIndex = applications.findIndex(a => a.id === applicationId);
    if (appIndex === -1) return;

    const application = applications[appIndex];
    
    // Update application status to Released
    application.status = 'Released';
    application.adminRemarks = remarks;
    application.verifiedAt = new Date().toISOString();
    application.verifiedBy = 'Admin';
    
    persistApplications();

    // Update corresponding beneficiary status if exists
    const beneficiary = beneficiaries.find(b => b.id === application.beneficiaryId || b.email === application.email);
    if (beneficiary) {
        beneficiary.status = 'Released';
        beneficiary.applicationStatus = 'Released';
        beneficiary.assistanceReleaseDate = new Date().toISOString();
        persistBeneficiaries();
    }

    // Re-render sections
    renderReleasesSection();
    renderDashboardSummary();
    renderBeneficiariesTable();
    
    showToast('Application verified successfully! Status updated to Released.', 'success');
}

function rejectApplicationForRelease(applicationId, remarks = '') {
    const appIndex = applications.findIndex(a => a.id === applicationId);
    if (appIndex === -1) return;

    const application = applications[appIndex];
    
    // Update application status to Returned
    application.status = 'Returned';
    application.adminRemarks = remarks;
    application.rejectedAt = new Date().toISOString();
    application.rejectedBy = 'Admin';
    
    persistApplications();

    // Update corresponding beneficiary status if exists
    const beneficiary = beneficiaries.find(b => b.id === application.beneficiaryId || b.email === application.email);
    if (beneficiary) {
        beneficiary.status = 'Returned';
        beneficiary.applicationStatus = 'Returned';
        persistBeneficiaries();
    }

    // Re-render sections
    renderReleasesSection();
    renderDashboardSummary();
    renderBeneficiariesTable();
    
    showToast('Application returned for revision. Applicant will need to address the issues.', 'warning');
}

function openReleaseVerificationModal(record) {
    const modal = document.getElementById('releaseVerificationModal');
    if (!modal) return;

    document.getElementById('release-modal-pdo').textContent = record.pdoName || 'Unknown PDO';
    document.getElementById('release-modal-beneficiary').textContent = record.beneficiaryName || 'Unknown';
    document.getElementById('release-modal-date').textContent = formatDate(record.releaseDate);
    document.getElementById('release-modal-type').textContent = record.releaseType || 'N/A';
    document.getElementById('release-modal-amount').textContent = pesoFormatter.format(record.amount || 0);
    document.getElementById('release-modal-mode').textContent = record.modeOfRelease || 'N/A';
    document.getElementById('release-modal-location').textContent = record.location || 'N/A';
    document.getElementById('release-modal-or').textContent = record.orNumber || 'N/A';
    document.getElementById('release-modal-notes').textContent = record.notes || 'No notes provided.';
    
    const status = record.verificationStatus || 'Pending';
    const statusEl = document.getElementById('release-modal-status');
    statusEl.textContent = status;
    statusEl.className = status === 'Verified' ? 'badge bg-success' : status === 'Rejected' ? 'badge bg-danger' : 'badge bg-warning';

    // Load documents
    const documentsEl = document.getElementById('release-modal-documents');
    if (record.documents && record.documents.length > 0) {
        documentsEl.innerHTML = record.documents.map(doc => `
            <div class="col-md-6">
                <div class="card">
                    <div class="card-body">
                        <i class="fas fa-file-pdf text-danger"></i>
                        <strong>${escapeHtml(doc.type || 'Document')}</strong>
                        <p class="mb-0 small text-muted">${escapeHtml(doc.filename || 'Unknown file')}</p>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        documentsEl.innerHTML = '<p class="text-muted">No documents uploaded.</p>';
    }

    // Set record ID
    document.getElementById('release-verification-record-id').value = record.id;
    document.getElementById('release-verification-remark').value = record.adminRemarks || '';

    // Remove existing listeners and add new ones
    const approveBtn = document.getElementById('release-verification-approve');
    const rejectBtn = document.getElementById('release-verification-reject');
    
    const newApproveBtn = approveBtn.cloneNode(true);
    const newRejectBtn = rejectBtn.cloneNode(true);
    approveBtn.parentNode.replaceChild(newApproveBtn, approveBtn);
    rejectBtn.parentNode.replaceChild(newRejectBtn, rejectBtn);

    newApproveBtn.addEventListener('click', () => {
        const remark = document.getElementById('release-verification-remark').value;
        verifyReleaseRecord(record.id, 'Verified', remark);
        hideModal(modal);
    });

    newRejectBtn.addEventListener('click', () => {
        const remark = document.getElementById('release-verification-remark').value;
        verifyReleaseRecord(record.id, 'Rejected', remark);
        hideModal(modal);
    });

    showModal(modal);
}

function verifyReleaseRecord(recordId, status, remarks = '') {
    const records = getReleaseRecords();
    const recordIndex = records.findIndex(r => r.id === recordId);
    
    if (recordIndex === -1) return;

    records[recordIndex].verificationStatus = status;
    records[recordIndex].verifiedAt = new Date().toISOString();
    records[recordIndex].verifiedBy = 'Admin';
    records[recordIndex].adminRemarks = remarks;

    persistReleaseRecords(records);
    renderReleasesSection();
    
    const message = status === 'Verified' 
        ? 'Release record verified successfully!' 
        : 'Release record rejected.';
    
    showToast(message, status === 'Verified' ? 'success' : 'danger');
    
    if (currentSection === 'dashboard') {
        renderDashboardSummary();
    }
}

// -----------------------------------------------------------------------------
// Repayments workspace
// -----------------------------------------------------------------------------
function renderRepaymentsSection() {
    const section = document.getElementById('repayments-section');
    if (!section) return;

    const roster = getBeneficiaryRoster();

    if (!roster.length) {
        repaymentDetailOpen = false;
        activeRepaymentBeneficiaryId = null;
        section.innerHTML = `
            <div class="dashboard-header">
                <div>
                    <h3>Repayments</h3>
                    <p>Verify official receipts and monitor amortisation progress.</p>
                </div>
            </div>
            <div class="repayments-placeholder">
                <h4>No repayment records yet</h4>
                <p>Add beneficiaries and capture receipts to start tracking repayments.</p>
            </div>`;
        return;
    }

    const filteredRoster = filterByScope(roster, 'repayments', (b) => b.name || '');
    if (repaymentDetailOpen && (!activeRepaymentBeneficiaryId || !filteredRoster.some(b => b.id === activeRepaymentBeneficiaryId))) {
        activeRepaymentBeneficiaryId = filteredRoster[0]?.id ?? null;
    }
    if (!filteredRoster.length) {
        activeRepaymentBeneficiaryId = null;
        repaymentDetailOpen = false;
    }

    const rosterCount = filteredRoster.length;

    section.innerHTML = `
        <div class="dashboard-header">
            <div>
                <h3>Repayments</h3>
                <p>Verify digital receipts and reconcile with hard-copy submissions.</p>
            </div>
            <div class="header-actions">
                <button type="button" class="app-btn-ghost" id="repayments-refresh"><i class="fas fa-rotate"></i><span>Refresh</span></button>
            </div>
        </div>
        ${buildFilterBarMarkup('repayments')}
        <div class="repayments-roster">
            <div class="table-card">
                <div class="table-toolbar">
                    <h4>Beneficiaries</h4>
                    <span class="chip" id="repayments-count">${numberFormatter.format(rosterCount)} records</span>
                </div>
                <div class="table-wrapper">
                    <table class="data-table" id="repayments-beneficiaries">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Progress</th>
                                <th>Pending</th>
                                <th>Last receipt</th>
                                <th>Status</th>
                                <th class="actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        </div>
        <div class="repayments-detail is-hidden" id="repayments-detail"></div>`;

    section.querySelector('#repayments-refresh').addEventListener('click', renderRepaymentsSection);
    initFilterBar('repayments', renderRepaymentsSection);
    renderRepaymentsList(filteredRoster);
    renderRepaymentsDetail();

    const rosterBody = section.querySelector('#repayments-beneficiaries tbody');
    rosterBody.addEventListener('click', event => {
        const row = event.target.closest('tr[data-id]');
        if (!row) return;
        const button = event.target.closest('button[data-action]');
        const id = Number(row.dataset.id);

        if (button && button.dataset.action === 'log') {
            activeRepaymentBeneficiaryId = id;
            repaymentDetailOpen = true;
            renderRepaymentsList(filteredRoster);
            renderRepaymentsDetail();
            const detailPanel = document.getElementById('repayments-detail');
            detailPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        if (!button) {
            activeRepaymentBeneficiaryId = id;
            renderRepaymentsList(filteredRoster);
        }
    });
}

function renderRepaymentsList(filteredRoster = null) {
    const tbody = document.querySelector('#repayments-beneficiaries tbody');
    if (!tbody) return;

    const roster = filteredRoster || filterByScope(getBeneficiaryRoster(), 'repayments', (b) => b.name || '');

    const rows = roster.map(b => {
        const repayments = b.repayments || [];
        const progress = computeRepaymentProgress(b);
        const pending = repayments.filter(payment => (payment.status || '').toLowerCase() !== 'verified').length;
        const latest = repayments.slice().sort((a, c) => (c.paymentDate || '').localeCompare(a.paymentDate || '')).shift();
        const status = b.status || 'Pending';
        const statusClass = status.toLowerCase() === 'active'
            ? 'badge-theme success'
            : status.toLowerCase() === 'completed'
                ? 'badge-theme success'
                : status.toLowerCase() === 'rejected'
                    ? 'badge-theme danger'
                    : 'badge-theme';

        return `
            <tr data-id="${b.id}" class="${b.id === activeRepaymentBeneficiaryId ? 'is-active' : ''}">
                <td>
                    <div class="table-primary">${escapeHtml(b.name)}</div>
                    <div class="table-tertiary">${escapeHtml(b.businessType || 'Not specified')}</div>
                </td>
                <td>${progress.verifiedMonths}/${PROGRAM.termMonths} months</td>
                <td><span class="${pending ? 'badge-theme danger' : 'badge-theme success'}">${pending ? `${pending} pending` : 'All verified'}</span></td>
                <td>${latest ? `${formatDate(latest.paymentDate)} ? <span class="badge-theme">${escapeHtml(latest.status || 'Uploaded')}</span>` : 'No receipts'}</td>
                <td><span class="${statusClass}">${escapeHtml(status)}</span></td>
                <td class="actions">
                    <button type="button" class="action-button" data-action="log" data-id="${b.id}">
                        <i class="fas fa-receipt"></i><span>Log receipt</span>
                    </button>
                </td>
            </tr>`;
    }).join('');

    tbody.innerHTML = rows || '<tr><td colspan="6" class="text-center text-muted">No results found.</td></tr>';

    const countChip = document.getElementById('repayments-count');
    if (countChip) {
        countChip.textContent = `${numberFormatter.format(roster.length)} records`;
    }
}

function renderRepaymentsDetail() {
    const panel = document.getElementById('repayments-detail');
    if (!panel) return;
    if (!repaymentDetailOpen) {
        panel.innerHTML = '';
        panel.classList.add('is-hidden');
        return;
    }
    const beneficiary = beneficiaries.find(b => b.id === activeRepaymentBeneficiaryId);
    if (!beneficiary || !isBeneficiaryStatus(beneficiary.applicationStatus || beneficiary.status)) {
        repaymentDetailOpen = false;
        panel.innerHTML = '';
        panel.classList.add('is-hidden');
        return;
    }

    panel.classList.remove('is-hidden');

    const repayments = beneficiary.repayments || [];
    const progress = computeRepaymentProgress(beneficiary);
    const pending = repayments.filter(payment => (payment.status || '').toLowerCase() !== 'verified').length;
    const verified = repayments.length - pending;
    const latest = repayments.slice().sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')).shift();
    const status = beneficiary.status || 'Pending';
    const statusClass = status.toLowerCase() === 'active'
        ? 'badge-theme success'
        : status.toLowerCase() === 'completed'
            ? 'badge-theme success'
            : status.toLowerCase() === 'rejected'
                ? 'badge-theme danger'
                : 'badge-theme';

    const locationDisplay = formatBeneficiaryAddress(beneficiary);
    const sectorDisplay = formatSectorLabel(beneficiary.sector || (beneficiary.program === '4Ps' ? 'Pantawid' : beneficiary.program));

    const historyRows = repayments.slice().sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')).map(payment => {
        const statusLabel = payment.status || 'Uploaded';
        const statusTone = statusLabel.toLowerCase() === 'verified'
            ? 'badge-theme success'
            : statusLabel.toLowerCase().includes('flag') || statusLabel.toLowerCase().includes('need')
                ? 'badge-theme danger'
                : 'badge-theme';
        return `
            <tr>
                <td>${formatMonth(payment.dueFor)}</td>
                <td>${formatDate(payment.paymentDate)}</td>
                <td>${pesoFormatter.format(payment.amount || PROGRAM.monthlyAmortization)}</td>
                <td><span class="${statusTone}">${escapeHtml(statusLabel)}</span></td>
                <td class="or-cell">${escapeHtml(payment.orNumber || payment.proof || 'Not provided')}</td>
                <td class="actions">
                    <button type="button" class="action-button" data-action="review" data-id="${payment.id}"><i class="fas fa-eye"></i><span>Review</span></button><button type="button" class="action-button secondary" data-action="view-proof" data-id="${payment.id}"><i class="fas fa-file"></i><span>View proof</span></button>
                </td>
            </tr>`;
    }).join('') || '<tr><td colspan="6" class="text-center text-muted">No receipts logged yet.</td></tr>';

    panel.innerHTML = `
        <div class="detail-header">
            <div>
                <h4>${escapeHtml(beneficiary.name)}</h4>
                <div class="detail-meta">
                    <span>${escapeHtml(locationDisplay)}</span>
                    <span>${escapeHtml(beneficiary.contact || '')}</span>
                    <span>${escapeHtml(beneficiary.email || '')}</span>
                    <span>${escapeHtml(sectorDisplay || 'Not provided')}</span>
                </div>
            </div>
            <div class="detail-actions">
                <button type="button" class="app-btn-ghost" data-action="close-detail"><i class="fas fa-arrow-left"></i><span>Back to roster</span></button>
                <button type="button" class="app-btn-ghost" data-action="view-profile"><i class="fas fa-id-card"></i><span>View profile</span></button>
                <button type="button" class="app-btn-primary" data-action="log-receipt"><i class="fas fa-upload"></i><span>Log receipt</span></button>
            </div>
        </div>
        <div class="detail-summary-grid">
            <div class="detail-summary-card">
                <h6>Assistance</h6>
                <strong>${pesoFormatter.format(beneficiary.assistanceAmount || PROGRAM.assistanceTotal)}</strong>
                <span><span class="${statusClass}">${escapeHtml(status)}</span></span>
            </div>
            <div class="detail-summary-card">
                <h6>Progress</h6>
                <strong>${progress.verifiedMonths}/${PROGRAM.termMonths} months</strong>
                <span>${pesoFormatter.format(progress.totalVerifiedAmount)} verified</span>
            </div>
            <div class="detail-summary-card">
                <h6>Pending receipts</h6>
                <strong>${pending}</strong>
                <span>${verified} verified</span>
            </div>
            <div class="detail-summary-card">
                <h6>Balance</h6>
                <strong>${pesoFormatter.format(progress.remainingBalance)}</strong>
                <span>Last payment: ${latest ? formatDate(latest.paymentDate) : 'Not provided'}</span>
            </div>
        </div>
        <div class="table-card">
            <div class="table-toolbar">
                <h4>Payment history</h4>
                <div class="toolbar-actions">
                    <span class="chip">${numberFormatter.format(repayments.length)} receipts logged</span>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="data-table" id="repayments-history">
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th>Payment date</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>OR / Proof</th>
                            <th class="actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>${historyRows}</tbody>
                </table>
            </div>
        </div>`;

    panel.querySelector('[data-action="close-detail"]').addEventListener('click', () => {
        repaymentDetailOpen = false;
        activeRepaymentBeneficiaryId = null;
        panel.innerHTML = '';
        panel.classList.add('is-hidden');
        renderRepaymentsList();
        const roster = document.getElementById('repayments-beneficiaries');
        roster?.focus?.();
    });
    panel.querySelector('[data-action="view-profile"]').addEventListener('click', () => openBeneficiaryProfile(beneficiary.id));
    panel.querySelector('[data-action="log-receipt"]').addEventListener('click', () => openRepaymentModal(beneficiary.id));
    panel.querySelector('#repayments-history').addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        const paymentId = Number(button.dataset.id);
        applyRepaymentAction(beneficiary.id, paymentId, action);
    });
}

function applyRepaymentAction(beneficiaryId, paymentId, action) {
    const beneficiary = beneficiaries.find(b => b.id === beneficiaryId);
    if (!beneficiary) return;
    const payments = beneficiary.repayments || [];
    const payment = payments.find(entry => entry.id === paymentId);
    if (!payment) return;

    if (action === 'review') {
        openRepaymentReviewModal(beneficiary, payment);
        return;
    }

    if (action === 'view-proof') {
        openProofPreviewModal(payment);
        return;
    }

    if (action === 'edit') {
        openRepaymentEditModal(beneficiary, payment);
        return;
    }

    if (action === 'verify') {
        payment.status = 'Verified';
        payment.verifiedAt = new Date().toISOString();
        showToast('Receipt marked as verified', 'success');
    } else if (action === 'flag') {
        payment.status = 'Needs Verification';
        showToast('Receipt flagged for manual review', 'warning');
    } else if (action === 'delete') {
        if (!confirm('Remove this receipt from the log?')) return;
        beneficiary.repayments = payments.filter(entry => entry.id !== paymentId);
        showToast('Receipt removed from log', 'warning');
    }

    if (typeof persistBeneficiaries === 'function') {
        persistBeneficiaries();
    } else {
        console.warn('persistBeneficiaries is not defined; state changes will not be saved.');
    }
    renderDashboardSummary();
    renderBeneficiariesTable();
    if (currentSection === 'repayments') {
        renderRepaymentsList();
        renderRepaymentsDetail();
    }
}

function renderTrainingSection() {
    const section = document.getElementById("training-section");
    if (!section) return;

    if (!window.TrainingShared) {
        section.innerHTML = `
            <div class="dashboard-header">
                <div>
                    <h3>Training Applicants</h3>
                    <p>Training tools are unavailable. Include trainingShared.js to manage sessions.</p>
                </div>
            </div>
            <div class="table-card">
                <div class="table-wrapper"><p class="text-muted">Training utilities could not be initialised.</p></div>
            </div>`;
        return;
    }

    const roster = trainingAggregate?.roster || [];

    section.innerHTML = `
        <div class="dashboard-header">
            <div>
                <h3>Applicant Roster</h3>
                <p>Approved applicants for training attendance tracking.</p>
            </div>
            <div class="header-actions">
                <button type="button" class="app-btn-ghost" id="training-refresh"><i class="fas fa-rotate"></i><span>Refresh</span></button>
            </div>
        </div>
        ${buildFilterBarMarkup('training')}
        <div class="table-card">
            <div class="table-toolbar">
                <h4>Applicant roster</h4>
                <div class="toolbar-actions">
                    <span class="chip" id="training-roster-count">${numberFormatter.format(roster.length)} applicants</span>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="data-table" id="training-roster-table">
                    <thead>
                        <tr>
                            <th>Applicant name</th>
                            <th>Barangay / Location</th>
                            <th>Progress</th>
                            <th>Attendance</th>
                            <th>Remarks</th>
                            <th class="actions">Action</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
        <div class="attendance-modal" id="trainingAttendanceModal" aria-hidden="true">
            <div class="attendance-modal__backdrop" data-action="close-attendance"></div>
            <div class="attendance-modal__card" role="dialog" aria-modal="true" aria-labelledby="attendanceModalTitle">
                <header class="attendance-modal__header">
                    <div>
                        <h4 id="attendanceModalTitle">Training session</h4>
                        <p id="attendanceModalSchedule">Schedule</p>
                        <p id="attendanceModalMeta">Facilitator • Venue</p>
                    </div>
                    <button type="button" class="app-btn-ghost icon-button" data-action="close-attendance" aria-label="Close"><i class="fas fa-xmark"></i></button>
                </header>
                <div class="attendance-modal__body">
                    <div class="attendance-modal__profile">
                        <strong id="attendanceModalName">Applicant</strong>
                        <span id="attendanceModalBarangay">Barangay</span>
                    </div>
                    <div class="attendance-buttons" id="attendanceModalButtons"></div>
                    <label class="attendance-remarks">
                        <span>Remarks (optional)</span>
                        <textarea id="attendanceModalRemarks" rows="3" placeholder="Add remarks"></textarea>
                    </label>
                </div>
                <footer class="attendance-modal__footer">
                    <button type="button" class="app-btn-outline" id="attendanceModalExport"><i class="fas fa-download"></i><span>Export</span></button>
                    <div class="footer-actions">
                        <button type="button" class="app-btn-ghost" data-action="close-attendance">Close</button>
                        <button type="button" class="app-btn-primary" id="attendanceModalSave">Save</button>
                    </div>
                </footer>
            </div>
        </div>`;

    initFilterBar('training', renderTrainingRosterAdmin);

    section.querySelector('#trainingAttendanceModal')?.addEventListener('click', (event) => {
        const actionBtn = event.target.closest('[data-action="close-attendance"]');
        if (!actionBtn) return;
        closeAttendanceModal();
    });

    renderTrainingRosterAdmin();

    section.querySelector('#training-refresh')?.addEventListener('click', () => {
        syncTrainingBeneficiaries();
        updateTrainingDependentViews();
        showToast('Training roster refreshed', 'info');
    });
}

function renderTrainingSummaryAdmin() {
    const container = document.getElementById('training-admin-summary');
    if (!container) return;

    const sessions = trainingSnapshot.sessions || [];
    const roster = trainingAggregate?.roster || [];
    const attendanceLogged = roster.filter(item => (item.progress?.present || 0) > 0).length;
    const upcoming = typeof TrainingShared.getUpcomingSession === 'function' ? TrainingShared.getUpcomingSession() : null;
    const upcomingWindow = upcoming ? TrainingShared.formatSessionWindow(upcoming) : null;

    container.innerHTML = `
        <article class="summary-card">
            <h4>Participants</h4>
            <p class="metric">${numberFormatter.format(trainingAggregate?.total || roster.length)}</p>
            <p class="meta">${numberFormatter.format(attendanceLogged)} logged attendance</p>
        </article>
        <article class="summary-card">
            <h4>Sessions scheduled</h4>
            <p class="metric">${numberFormatter.format(sessions.length)}</p>
            <p class="meta">${upcomingWindow ? `${escapeHtml(upcomingWindow.dateText)} ? ${escapeHtml(upcomingWindow.timeRange)}` : 'All sessions completed'}</p>
        </article>
        <article class="summary-card">
            <h4>Documents cleared</h4>
            <p class="metric">${numberFormatter.format(trainingAggregate?.verifiedDocs || 0)}</p>
            <p class="meta">Verified requirements</p>
        </article>
        <article class="summary-card">
            <h4>Attendance rate</h4>
            <p class="metric">${trainingAggregate?.attendanceRate || 0}%</p>
            <p class="meta">Across all SMART LEAP sessions</p>
        </article>`;
}

function populateTrainingFilters(form, sessions = []) {
    if (!form) return;
    const facilitatorSelect = form.querySelector('#training-filter-facilitator');
    const focusSelect = form.querySelector('#training-filter-focus');
    const monthInput = form.querySelector('#training-filter-month');

    const facilitatorOptions = Array.from(new Set(sessions.map((session) => (session.facilitator || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const focusOptions = Array.from(new Set(sessions.map((session) => (session.focus || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

    if (facilitatorSelect) {
        facilitatorSelect.innerHTML = ['<option value="all">All facilitators</option>', ...facilitatorOptions.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)].join('');
        facilitatorSelect.value = trainingFilters.facilitator || 'all';
    }

    if (focusSelect) {
        focusSelect.innerHTML = ['<option value="all">All topics</option>', ...focusOptions.map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`)].join('');
        focusSelect.value = trainingFilters.focus || 'all';
    }

    if (monthInput) {
        monthInput.value = trainingFilters.date || '';
    }
}

function handleTrainingFilterChange(event) {
    const target = event.target;
    if (!target) return;
    if (target.id === 'training-filter-facilitator') {
        trainingFilters.facilitator = target.value || 'all';
    }
    if (target.id === 'training-filter-focus') {
        trainingFilters.focus = target.value || 'all';
    }
    if (target.id === 'training-filter-month') {
        trainingFilters.date = target.value || '';
    }
    renderTrainingScheduleAdmin();
}

function getFilteredTrainingSessions() {
    const sessions = trainingSnapshot.sessions || [];
    return sessions.filter((session) => {
        const facilitatorFilter = (trainingFilters.facilitator || 'all').toLowerCase();
        const focusFilter = (trainingFilters.focus || 'all').toLowerCase();
        const monthFilter = trainingFilters.date || '';

        const facilitator = (session.facilitator || '').toLowerCase().trim();
        const focus = (session.focus || '').toLowerCase().trim();
        const sessionMonth = extractSessionMonth(session);

        if (facilitatorFilter !== 'all' && facilitator !== facilitatorFilter) {
            return false;
        }
        if (focusFilter !== 'all' && focus !== focusFilter) {
            return false;
        }
        if (monthFilter && sessionMonth !== monthFilter) {
            return false;
        }
        return true;
    });
}

function extractSessionMonth(session) {
    if (!session) return '';
    const raw = session.start || session.date || session.scheduledAt || session.startsAt;
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function renderTrainingScheduleAdmin() {
    const panel = document.getElementById("training-schedule-panel");
    if (!panel) return;
    if (!window.TrainingComponents) {
        panel.innerHTML = '<div class="training-schedule-grid"><article class="training-schedule-empty">Training tools unavailable. Include trainingComponents.js.</article></div>';
        console.warn('Training components unavailable');
        return;
    }
    const filteredSessions = getFilteredTrainingSessions();
    let displaySessions = filteredSessions.slice();
    const toggleLabel = editingSessionId
        ? '<i class="fas fa-xmark" aria-hidden="true"></i><span>Cancel edit</span>'
        : '<i class="fas fa-plus-circle" aria-hidden="true"></i><span>Add session</span>';
    const toggleStateClass = editingSessionId ? ' is-active' : '';
    const targetSession = editingSessionId ? getSessionById(editingSessionId) : null;

    if (editingSessionId && targetSession && !displaySessions.some((session) => String(session.id) === String(editingSessionId))) {
        displaySessions = [targetSession, ...displaySessions];
    }

    const formHtml = TrainingComponents.buildSessionForm(targetSession, {
        visible: !!editingSessionId,
        submitLabel: editingSessionId ? 'Update session' : 'Create session',
        modulePresets: TRAINING_SESSION_PRESETS
    });

    const scheduleHtml = TrainingComponents.buildScheduleGrid(displaySessions, {
        renderActions: (session) => `
            <button type="button" class="icon-button" data-action="open-attendance" data-session-id="${escapeHtml(session.id || '')}" title="Check attendance" aria-label="Check attendance"><i class="fas fa-eye"></i></button>
            <button type="button" class="app-btn-ghost" data-action="edit-session" data-session-id="${escapeHtml(session.id || '')}"><i class="fas fa-pen"></i><span>Edit</span></button>
            <button type="button" class="app-btn-ghost danger" data-action="delete-session" data-session-id="${escapeHtml(session.id || '')}"><i class="fas fa-trash"></i><span>Delete</span></button>`,
        emptyCopy: filteredSessions.length ? 'No sessions match the current filters.' : 'No sessions scheduled yet.'
    });

    panel.innerHTML = `
        <div class="panel-header mini">
            <h3>Sessions</h3>
            <div class="panel-actions">
                <span class="chip muted">${numberFormatter.format(filteredSessions.length)} shown</span>
                <button type="button" class="btn-session-toggle${toggleStateClass}" id="training-session-toggle" aria-expanded="${editingSessionId ? 'true' : 'false'}">${toggleLabel}</button>
            </div>
        </div>
        ${formHtml}
        <div class="training-schedule-grid" id="training-admin-schedule-grid">${scheduleHtml}</div>`;

    const form = panel.querySelector('#training-session-form');
    const toggle = panel.querySelector('#training-session-toggle');
    const grid = panel.querySelector('#training-admin-schedule-grid');

    grid?.addEventListener('click', handleTrainingScheduleClick, { once: true });

    toggle?.addEventListener('click', () => {
        if (editingSessionId) {
            editingSessionId = null;
            resetTrainingSessionForm(form);
            form?.classList.add('is-hidden');
            renderTrainingScheduleAdmin();
            return;
        }
        if (!form) return;
        const isHidden = form.classList.toggle('is-hidden');
        if (!isHidden) {
            resetTrainingSessionForm(form);
        }
        toggle.classList.toggle('is-active', !isHidden);
        toggle.setAttribute('aria-expanded', (!isHidden).toString());
    });

    form?.addEventListener('submit', (event) => {
        event.preventDefault();
        const title = form.querySelector('#training-session-title').value.trim();
        const date = form.querySelector('#training-session-date').value;
        const startTime = form.querySelector('#training-session-start').value;
        const endTime = form.querySelector('#training-session-end').value;
        if (!title || !date || !startTime || !endTime) {
            showToast('Complete the required session details.', 'warning');
            return;
        }
        const startIso = new Date(`${date}T${startTime}`).toISOString();
        const endIso = new Date(`${date}T${endTime}`).toISOString();
        const payload = {
            title,
            label: form.querySelector('#training-session-title').value.trim() || title,
            start: startIso,
            end: endIso,
            venue: form.querySelector('#training-session-venue').value.trim(),
            facilitator: form.querySelector('#training-session-facilitator').value.trim(),
            focus: form.querySelector('#training-session-focus').value.trim(),
            status: form.querySelector('#training-session-status').value || 'Scheduled'
        };
        const sessionId = form.querySelector('#training-session-id').value;
        if (sessionId) {
            TrainingShared.updateSession(sessionId, payload);
            showToast('Session updated', 'success');
        } else {
            TrainingShared.createSession(payload);
            showToast('Session created', 'success');
        }
        editingSessionId = null;
        resetTrainingSessionForm(form);
        form?.classList.add('is-hidden');
    });

    form?.querySelector('[data-action="close-session-form"]')?.addEventListener('click', (event) => {
        event.preventDefault();
        editingSessionId = null;
        renderTrainingScheduleAdmin();
    });

    if (editingSessionId && targetSession) {
        form?.classList.remove('is-hidden');
        populateTrainingSessionForm(form, targetSession);
    }
}

function renderTrainingAttendanceAdmin() {
    const panel = document.getElementById("training-attendance-panel");
    if (!panel) return;
    if (!window.TrainingComponents) {
        panel.innerHTML = '<div class="training-attendance-fallback">Training attendance tools unavailable.</div>';
        console.warn('Training components unavailable');
        return;
    }
    const sessions = trainingSnapshot.sessions || [];
    const attendees = (trainingSnapshot.beneficiaries || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (!activeTrainingBeneficiaryId && attendees.length) {
        activeTrainingBeneficiaryId = attendees[0].id;
    }
    const selected = activeTrainingBeneficiaryId;
    const options = attendees.map((beneficiary) => `
        <option value="${beneficiary.id}" ${String(beneficiary.id) === String(selected) ? 'selected' : ''}>${escapeHtml(beneficiary.name || 'Beneficiary')}</option>`).join('');
    if (trainingAttendanceSessionFilter !== 'all' && !sessions.some((session) => String(session.id) === String(trainingAttendanceSessionFilter))) {
        trainingAttendanceSessionFilter = 'all';
    }
    const sessionOptions = ['<option value="all">All sessions</option>', ...sessions.map((session) => `<option value="${escapeHtml(session.id || '')}">${escapeHtml(session.title || session.label || 'Session')}</option>`)].join('');

    panel.innerHTML = `
        <div class="panel-header mini">
            <h3>Attendance</h3>
            <div class="panel-actions">
                <button type="button" class="app-btn-outline" id="training-attendance-export"><i class="fas fa-download"></i><span>Export report</span></button>
            </div>
        </div>
        <div class="training-attendance-controls">
            <label class="form-field">
                <span>Select beneficiary</span>
                <select id="training-beneficiary-select">${options}</select>
            </label>
            <label class="form-field">
                <span>Filter by session</span>
                <select id="training-session-filter">${sessionOptions}</select>
            </label>
            <div class="training-attendance-actions">
                <p class="panel-subtitle">View history per beneficiary or focus on a single session.</p>
            </div>
        </div>
        <div class="table-wrapper">
            <table class="data-table compact">
                <thead>
                    <tr>
                        <th>Session</th>
                        <th>Schedule</th>
                        <th>Mark attendance</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="training-admin-attendance-body"></tbody>
            </table>
        </div>
        <p class="panel-subtitle">Select a status to toggle between present, absent, and pending.</p>`;

    panel.querySelector('#training-beneficiary-select')?.addEventListener('change', (event) => {
        activeTrainingBeneficiaryId = event.target.value;
        renderTrainingAttendanceTableBody(activeTrainingBeneficiaryId);
    });
    const sessionFilter = panel.querySelector('#training-session-filter');
    if (sessionFilter) {
        sessionFilter.value = trainingAttendanceSessionFilter || 'all';
        sessionFilter.addEventListener('change', (event) => {
            trainingAttendanceSessionFilter = event.target.value || 'all';
            renderTrainingAttendanceTableBody(activeTrainingBeneficiaryId);
    }

    panel.querySelector('#training-attendance-export')?.addEventListener('click', exportAttendanceReport);

    renderTrainingAttendanceTableBody(selected);

    panel.querySelector('#training-admin-attendance-body')?.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action="set-attendance"]');
        if (!button) return;
        const sessionId = button.dataset.sessionId;
        const value = button.dataset.value;
        if (!sessionId || !activeTrainingBeneficiaryId) return;
        TrainingShared.toggleAttendance(activeTrainingBeneficiaryId, sessionId, value);
    });
}

function renderTrainingAttendanceTableBody(beneficiaryId) {
    if (!window.TrainingComponents) return;
    const tbody = document.getElementById('training-admin-attendance-body');
    if (!tbody) return;
    const sessions = trainingSnapshot.sessions || [];
    const filteredSessions = trainingAttendanceSessionFilter === 'all'
        ? sessions
        : sessions.filter((session) => String(session.id) === String(trainingAttendanceSessionFilter));
    const attendanceMap = TrainingShared.getAttendanceMap(beneficiaryId);
    const emptyCopy = filteredSessions.length
        ? 'No sessions scheduled.'
        : 'No sessions match the current filters.';
    tbody.innerHTML = TrainingComponents.buildAttendanceTable(filteredSessions, attendanceMap, {
        mode: 'manage',
        emptyCopy
    });
}

function renderTrainingRosterAdmin() {
    const tbody = document.querySelector('#training-roster-table tbody');
    if (!tbody) return;
    const roster = filterByScope(trainingAggregate?.roster || [], 'training', (item) => item.name || '')
        .filter((item) => isTrainingEligibleStatus(item.status || item.applicationStatus || ''));
    const countChip = document.getElementById('training-roster-count');
    if (countChip) {
        countChip.textContent = `${numberFormatter.format(roster.length)} applicants`;
    }
    if (!roster.length) {
        tbody.innerHTML = '<tr class="empty"><td colspan="6">No results found.</td></tr>';
        return;
    }
    tbody.innerHTML = roster.map((item) => {
        const progress = item.progress?.completion ?? 0;
        const present = item.progress?.present ?? 0;
        const sessionCount = item.progress?.sessionCount ?? (trainingSnapshot.sessions || []).length;
        const attendanceCopy = `${present}/${sessionCount}`;
        const remarks = item.remarks || '';
        return `
            <tr data-beneficiary-id="${item.id}">
                <td>
                    <div class="table-primary">${escapeHtml(item.name || 'Applicant')}</div>
                </td>
                <td>${escapeHtml(item.barangay || '-')}</td>
                <td>${progress}%</td>
                <td>${attendanceCopy}</td>
                <td>
                    <input type="text" class="training-remark-input" value="${escapeAttribute(remarks)}" placeholder="Add remarks">
                </td>
                <td class="actions">
                    <button type="button" class="icon-button" data-action="check-attendance" data-id="${item.id}" title="Check attendance"><i class="fas fa-eye"></i></button>
                </td>
            </tr>`;
    }).join('');
    tbody.addEventListener('click', handleTrainingRosterClick, { once: true });
    tbody.querySelectorAll('.training-remark-input').forEach((input) => {
        input.addEventListener('change', () => {
            const row = input.closest('tr');
            const beneficiaryId = row?.dataset?.beneficiaryId;
            if (!beneficiaryId) return;
            const rosterItem = trainingAggregate?.roster?.find((entry) => String(entry.id) === String(beneficiaryId));
            if (rosterItem) {
                rosterItem.remarks = input.value;
            }
            TrainingShared.upsertBeneficiary({ id: `brgy-${index + 1}`, name });
    });
}

function getDashboardFilteredRoster() {
    const roster = getBeneficiaryRoster();
    const query = dashboardSearchQuery.toLowerCase();
    if (!query) return roster;
    return roster.filter((entry) => (entry.name || '').toLowerCase().includes(query));
}

function getDashboardFilteredApplicants() {
    const applicants = getApplicantPool();
    const query = dashboardSearchQuery.toLowerCase();
    if (!query) return applicants;
    return applicants.filter((entry) => (entry.name || '').toLowerCase().includes(query));
}

function handleTrainingRosterClick(event) {
    const button = event.target.closest('button[data-action="check-attendance"]');
    const tbody = document.querySelector('#training-roster-table tbody');
    if (!button) {
        tbody?.addEventListener('click', handleTrainingRosterClick, { once: true });
        return;
    }
    activeAttendanceBeneficiaryId = button.dataset.id;
    openAttendanceModal(activeAttendanceBeneficiaryId);
    tbody?.addEventListener('click', handleTrainingRosterClick, { once: true });
}

function destroyDashboardCharts() {
    if (Array.isArray(dashboardCharts)) {
        dashboardCharts.forEach((chart) => { try { chart?.destroy(); } catch {} });
    }
    dashboardCharts = [];
}

function hasChartData(series) {
    if (!series) return false;
    if (Array.isArray(series.values)) {
        return (series.labels || []).length > 0 && series.values.some((value) => Number(value) > 0);
    }
    if (Array.isArray(series.labels)) {
        const combined = [];
        if (Array.isArray(series.applicants)) combined.push(...series.applicants);
        if (Array.isArray(series.beneficiaries)) combined.push(...series.beneficiaries);
        if (Array.isArray(series.values)) combined.push(...series.values);
        return series.labels.length > 0 && combined.some((value) => Number(value) > 0);
    }
    return false;
}

function renderEmptyChartCard(card, message, action) {
    if (!card) return;
    const actionMarkup = action?.label
        ? `<button type="button" class="app-btn-ghost" data-action="${action.action}"><i class="fas fa-arrow-right"></i><span>${action.label}</span></button>`
        : '';
    card.innerHTML = `
        <div class="empty-card">
            <div class="empty-card__icon"><i class="fas fa-chart-line"></i></div>
            <div>
                <h4>No data yet</h4>
                <p>${message}</p>
            </div>
            <div class="empty-card__actions">${actionMarkup}</div>
        </div>`;
    card.querySelector('[data-action="repayments"]')?.addEventListener('click', () => renderSection('repayments'));
    card.querySelector('[data-action="reports"]')?.addEventListener('click', () => renderSection('reports'));
}

function renderDashboardAlerts() {
    const container = document.getElementById('dashboard-alerts');
    if (!container) return;

    const roster = getDashboardFilteredRoster();
    const pendingProofs = roster.flatMap((b) => (b.repayments || [])).filter((p) => normalizeStatus(p.status || '') !== 'verified').length;
    const overdueCount = computeOverdueRepayments(roster);
    const missingRequirements = computeMissingRequirements(roster);
    const upcomingTrainings = computeUpcomingTrainings();

    container.innerHTML = `
        <div class="alerts-chips">
            <button type="button" class="alert-chip" data-queue-tab="pending">
                <span>Pending proofs</span>
                <strong>${numberFormatter.format(pendingProofs)}</strong>
            </button>
            <button type="button" class="alert-chip" data-queue-tab="requirements">
                <span>Missing requirements</span>
                <strong>${numberFormatter.format(missingRequirements)}</strong>
            </button>
            <button type="button" class="alert-chip" data-queue-tab="overdue">
                <span>Overdue repayments</span>
                <strong>${numberFormatter.format(overdueCount)}</strong>
            </button>
            <button type="button" class="alert-chip" data-queue-tab="training">
                <span>Upcoming trainings</span>
                <strong>${numberFormatter.format(upcomingTrainings)}</strong>
            </button>
        </div>`;

    container.querySelectorAll('[data-queue-tab]').forEach((btn) => {
        btn.addEventListener('click', () => focusDashboardQueue(btn.dataset.queueTab));
    });
}

function renderDashboardInsights(show) {
    const container = document.getElementById('dashboard-insights');
    if (!container) return;
    if (!show) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }

    const roster = getDashboardFilteredRoster();
    const pendingProofs = roster.flatMap((b) => (b.repayments || [])).filter((p) => normalizeStatus(p.status || '') !== 'verified').length;
    const overdueCount = computeOverdueRepayments(roster);
    const missingRequirements = computeMissingRequirements(roster);

    container.hidden = false;
    container.innerHTML = `
        <div class="insight-card">
            <span>Pending verifications</span>
            <strong>${numberFormatter.format(pendingProofs)}</strong>
        </div>
        <div class="insight-card">
            <span>Overdue repayments</span>
            <strong>${numberFormatter.format(overdueCount)}</strong>
        </div>
        <div class="insight-card">
            <span>Missing requirements</span>
            <strong>${numberFormatter.format(missingRequirements)}</strong>
        </div>`;
}

function computeMissingRequirements(roster) {
    return roster.reduce((count, beneficiary) => {
        const summary = calculateRequirementSummary(beneficiary.requirements || {});
        if (!summary) return count;
        return count + Math.max(summary.total - summary.verified, 0);
    }, 0);
}

function computeOverdueRepayments(roster) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let overdue = 0;
    roster.forEach((beneficiary) => {
        (beneficiary.repayments || []).forEach((payment) => {
            const status = normalizeStatus(payment.status || '');
            if (status === 'verified') return;
            const dueDate = payment.dueFor ? new Date(`${payment.dueFor}-01`) : null;
            if (dueDate && dueDate < startOfMonth) overdue += 1;
    });
    return overdue;
}

function computeUpcomingTrainings() {
    const sessions = trainingSnapshot?.sessions || [];
    const now = new Date();
    const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
    return sessions.filter((session) => {
        const raw = session.date || session.startDate || session.scheduleDate || session.scheduledAt;
        if (!raw) return false;
        const when = new Date(raw);
        return !Number.isNaN(when.getTime()) && when >= now && when <= horizon;
    }).length;
}
function buildDashboardCharts() {
    const repaymentCanvas = document.getElementById('dashboard-repayment-chart');
    const sectorCanvas = document.getElementById('dashboard-sector-chart');
    const repaymentFallback = document.querySelector('[data-chart="dashboard-repayment"]');
    const sectorFallback = document.querySelector('[data-chart="dashboard-sector"]');
    const chartGrid = document.getElementById('dashboard-charts');
    const useChartJs = typeof Chart === 'function';

    if (useChartJs) {
        destroyDashboardCharts();
    } else {
        dashboardCharts = [];
    }

    const roster = getDashboardFilteredRoster();
    const applicants = getDashboardFilteredApplicants();
    const repaymentSeries = buildDashboardRepaymentSeries(roster);
    const sectorSeries = buildDashboardSectorSeries(applicants, roster);

    const hasRepayment = hasChartData(repaymentSeries);
    const hasSector = hasChartData(sectorSeries);

    toggleDashboardMiniInsights(hasRepayment || hasSector);
    if (hasRepayment || hasSector) {
        chartGrid?.classList.remove('is-hidden');
    } else {
        chartGrid?.classList.add('is-hidden');
    }

    if (repaymentCanvas) {
        const card = repaymentCanvas.closest('.chart-card');
        const percentValues = repaymentSeries.values.map((value) => Math.round(value * 100));
        if (hasRepayment) {
            if (repaymentFallback) repaymentFallback.style.display = 'none';
            repaymentCanvas.style.display = 'block';
            if (useChartJs) {
                const ctx = repaymentCanvas.getContext('2d');
                dashboardCharts.push(new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: repaymentSeries.labels,
                        datasets: [{
                            data: percentValues,
                            borderColor: '#16A34A',
                            backgroundColor: 'rgba(22, 163, 74, 0.2)',
                            tension: 0.35,
                            fill: true,
                            pointRadius: 4,
                            pointBackgroundColor: '#16A34A'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                suggestedMax: 100,
                                ticks: { callback: (value) => `${value}%` }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: (context) => `Completion: ${context.parsed.y}%` } }
                        }
                    }
                }));
            }
        } else {
            if (repaymentFallback) repaymentFallback.style.display = 'none';
            if (repaymentCanvas) repaymentCanvas.style.display = "none";
            if (card) {
                renderEmptyChartCard(card, 'Log a receipt or add beneficiaries to generate trends.', {
                    label: 'Go to Repayments',
                    action: 'repayments'
                });
            }
        }
    }

    if (sectorCanvas) {
        const card = sectorCanvas.closest('.chart-card');
        if (hasSector) {
            if (sectorFallback) sectorFallback.style.display = 'none';
            sectorCanvas.style.display = 'block';
            if (useChartJs) {
                const ctx = sectorCanvas.getContext('2d');
                dashboardCharts.push(new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: sectorSeries.labels,
                        datasets: [
                            { label: 'Applicants', data: sectorApplicants, backgroundColor: '#2563EB' },
                            { label: 'Beneficiaries', data: sectorBeneficiaries, backgroundColor: '#16A34A' }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true } },
                        plugins: { tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.parsed.y}` } } }
                    }
                }));
            }
        } else {
            if (sectorFallback) sectorFallback.style.display = 'none';
            if (sectorCanvas) sectorCanvas.style.display = "none";
            if (card) {
                renderEmptyChartCard(card, 'Add beneficiaries to populate sector insights.', {
                    label: 'Go to Reports',
                    action: 'reports'
                });
            }
        }
    }
}

function buildDashboardRepaymentSeries(roster) {
    const monthMap = new Map();
    roster.forEach((beneficiary) => {
        (beneficiary.repayments || []).forEach((payment) => {
            if ((payment.status || '').toLowerCase() !== 'verified') return;
            const raw = payment.dueFor || payment.month || payment.paymentDate || '';
            const date = raw ? new Date(`${raw}-01`) : null;
            if (!date || Number.isNaN(date.getTime())) return;
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthMap.set(key, (monthMap.get(key) || 0) + 1);
    });

    const labels = Array.from(monthMap.keys()).sort((a, b) => a.localeCompare(b));
    if (!labels.length) {
        const fallback = getRecentMonthKeys(6);
        return { labels: fallback.map(formatMonthKey), values: fallback.map(() => 0) };
    }
    const values = labels.map((key) => {
        const verifiedCount = monthMap.get(key) || 0;
        return roster.length ? (verifiedCount / roster.length) : 0;
    });
    return { labels: labels.map(formatMonthKey), values };
}

function getRecentMonthKeys(count = 6) {
    const keys = [];
    const date = new Date();
    for (let i = 0; i < count; i += 1) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        keys.unshift(`${year}-${month}`);
        date.setMonth(date.getMonth() - 1);
    }
    return keys;
}

function formatMonthKey(value) {
    if (!value) return '';
    const [year, month] = String(value).split('-');
    if (!year || !month) return value;
    return formatMonth(`${year}-${month}-01`);
}

function buildDashboardSectorSeries(applicants, roster) {
    const labels = ['PWD', 'Senior Citizen', 'Indigenous People', 'Solo Parent'];
    const applicantCounts = labels.map((label) => countSectorByLabel(applicants, label));
    const beneficiaryCounts = labels.map((label) => countSectorByLabel(roster, label));
    return { labels, applicants: applicantCounts, beneficiaries: beneficiaryCounts };
}

function ensureRequirementEntry(collection, key) {
    const entry = collection[key] || { status: 'Uploaded', files: [], remarks: '' };
    if (!Array.isArray(entry.files)) entry.files = [];
    if (!entry.status) entry.status = 'Uploaded';
    if (typeof entry.remarks !== 'string') entry.remarks = '';
    collection[key] = entry;
    return entry;
}

function buildRequirementFilesMarkup(entry, key) {
    if (entry.files?.length) {
        const items = entry.files.map((file, index) => {
            const meta = formatRequirementFileMeta(file);
            const href = file.dataUrl ? sanitizeDataUrl(file.dataUrl) : (file.url || '');
            const nameMarkup = href
                ? `<a class="file-name link-download" href="${escapeAttribute(href)}" download="${escapeAttribute(file.name || 'Attachment')}">${escapeHtml(file.name || 'Attachment')}</a>`
                : `<span class="file-name">${escapeHtml(file.name || 'Attachment')}</span>`;
            const isImage = href && (href.startsWith('data:image') || /\.(png|jpe?g|gif|webp)$/i.test(href));
            const preview = isImage ? `<div class="file-preview"><img src="${escapeAttribute(href)}" alt="${escapeAttribute(file.name || 'Attachment')}"></div>` : '';
            return `<li><div class="requirement-file-chip"><div>${nameMarkup}${meta ? `<span class="file-meta">${meta}</span>` : ''}${preview}</div><button type="button" class="requirement-file-remove" data-req-remove="${key}" data-req-index="${index}" aria-label="Remove file"><i class="fas fa-times"></i></button></div></li>`;
        }).join('');
        return `<ul class="mini-file-list" data-req-files="${key}">${items}</ul>`;
    }
    return `<p class="mini-note" data-req-empty="${key}">No files linked.</p>`;
}

function refreshRequirementFiles(container, key, entry) {
    const target = container.querySelector(`[data-req-files="${key}"]`) || container.querySelector(`[data-req-empty="${key}"]`);
    if (!target) return;
    target.outerHTML = buildRequirementFilesMarkup(entry, key);
}

function formatRequirementFileMeta(file = {}) {
    const parts = [];
    if (typeof file.size === 'number') parts.push(formatFileSize(file.size));
    if (file.uploadedAt) parts.push(formatDate(file.uploadedAt));
    return parts.filter(Boolean).join(' â€¢ ');
}

function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb * 10) / 10} KB`;
    const mb = kb / 1024;
    return `${Math.round(mb * 10) / 10} MB`;
}

function calculateRequirementSummary(requirements = {}) {
    const values = Object.values(requirements).filter(entry => entry && typeof entry === 'object');
    if (!values.length) {
        return null;
    }
    let uploaded = 0;
    let verified = 0;
    values.forEach(entry => {
        if (Array.isArray(entry.files) && entry.files.length) {
            uploaded += 1;
        }
        const status = (entry.status || '').toLowerCase();
        if (status === 'verified' || status === 'approved') {
            verified += 1;
        }
    });
    return { uploaded, verified, total: values.length };
}

function evaluateRequirements(requirements = {}) {
    const summary = {
        verified: [],
        uploaded: [],
        missing: [],
        total: REQUIREMENTS.length
    };
    REQUIREMENTS.forEach(req => {
        const entry = requirements[req.key] || {};
        const files = Array.isArray(entry.files) ? entry.files : [];
        const status = (entry.status || '').toLowerCase();
        const hasFiles = files.length > 0;
        const isMissing = status === 'missing' || status === 'invalid' || !hasFiles;
        const isVerified = (status === 'verified' || status === 'approved') && hasFiles;

        if (isVerified) summary.verified.push(req.key);
        else if (isMissing) summary.missing.push(req.key);
        else summary.uploaded.push(req.key);
    });
    summary.hasBlockingIssues = summary.missing.length > 0;
    return summary;
}

function formatRequirementSummaryMessage(summary) {
    const toLabel = keys => keys.map(key => REQUIREMENTS.find(r => r.key === key)?.label || key).join(', ');
    const parts = [
        'Review requirements before approving:',
        `â€¢ Complete: ${summary.verified.length}/${summary.total}`
    ];
    if (summary.uploaded.length) parts.push(`â€¢ Pending review: ${toLabel(summary.uploaded)}`);
    if (summary.missing.length) parts.push(`â€¢ Missing/invalid: ${toLabel(summary.missing)}`);
    parts.push('Proceed with approval?');
    return parts.join('\
');
}

function sanitizeDataUrl(url) {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
    return '';
}

function escapeAttribute(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function renderBeneficiaryRequirementUploads() {
    const form = document.getElementById('beneficiary-form');
    const container = document.getElementById('beneficiary-requirements-upload');
    if (!form || !container) return;

    if (!form._requirementsDraft) {
        form._requirementsDraft = cloneRequirements();
    }
    const draft = form._requirementsDraft;
    const statusOptions = ['Uploaded', 'Pending', 'Missing', 'Verified'];

    container.innerHTML = `
        <div class="requirements-grid">
            ${REQUIREMENTS.map(req => {
                const entry = ensureRequirementEntry(draft, req.key);
                return `
                    <section class="requirement-item" data-req="${req.key}">
                        <header class="requirement-item__header">
                            <div>
                                <h6>${escapeHtml(req.label)}</h6>
                                <p class="small text-muted mb-0">Upload supporting files, set verification status, and leave remarks.</p>
                            </div>
                            <select class="form-select form-select-sm" data-req-status="${req.key}">
                                ${statusOptions.map(status => `<option value="${status}"${status === entry.status ? ' selected' : ''}>${status}</option>`).join('')}
                            </select>
                        </header>
                        <div class="requirement-item__body">
                            ${buildRequirementFilesMarkup(entry, req.key)}
                            <div class="requirement-upload-controls">
                                <input type="file" class="form-control form-control-sm requirement-upload-input" data-req-upload="${req.key}" multiple>
                                <small class="text-muted">Attach PDF, image, or document files.</small>
                            </div>
                            <textarea class="form-control form-control-sm" rows="2" placeholder="Remarks" data-req-remarks="${req.key}">${entry.remarks || ''}</textarea>
                        </div>
                    </section>`;
            }).join('')}
        </div>`;

    if (!container.dataset.bound) {
        container.addEventListener('change', async event => {
            const target = event.target;
            if (target.matches('[data-req-status]')) {
                const key = target.dataset.reqStatus;
                const entry = ensureRequirementEntry(draft, key);
                entry.status = target.value;
                return;
            }
            if (target.matches('[data-req-upload]')) {
                const key = target.dataset.reqUpload;
                const files = Array.from(target.files || []);
                if (!files.length) return;
                const entry = ensureRequirementEntry(draft, key);
                try {
                    const mapped = await readRequirementFiles(files);
                    entry.files = entry.files.concat(mapped.map(normalizeRequirementFile));
                    target.value = '';
                    refreshRequirementFiles(container, key, entry);
                } catch (err) {
                    console.warn('Unable to read requirement files', err);
                }
            }
        container.addEventListener('input', event => {
            const target = event.target;
            if (target.matches('[data-req-remarks]')) {
                const key = target.dataset.reqRemarks;
                const entry = ensureRequirementEntry(draft, key);
                entry.remarks = target.value;
            }
        container.addEventListener('click', event => {
            const control = event.target.closest('[data-req-remove]');
            if (!control) return;
            event.preventDefault();
            const key = control.dataset.reqRemove;
            const index = Number(control.dataset.reqIndex);
            const entry = ensureRequirementEntry(draft, key);
            if (!Array.isArray(entry.files)) entry.files = [];
            if (!Number.isNaN(index)) {
                entry.files.splice(index, 1);
                refreshRequirementFiles(container, key, entry);
            }
        container.dataset.bound = 'true';
    }
}






























function handleLogout() {
    if (!confirm('Sign out from SMART LEAP Admin?')) return;
    try { localStorage.removeItem(STORAGE_KEYS.beneficiaries); } catch {}
    try { localStorage.removeItem(STORAGE_KEYS.applications); } catch {}
    try { localStorage.removeItem(STORAGE_KEYS.users); } catch {}
    showToast('Signing out...', 'info');
    setTimeout(() => { window.location.href = 'index.html'; }, 800);
}


function loadState() {
function seedReportsDummyData() {
    if (Array.isArray(beneficiaries) && beneficiaries.length) return;

    const names = [
        'Ana Reyes','Joel Paglinawan','Maria Santos','Janelle Cruz','Ramon Diaz','Lito Garcia','Grace Mendez','Paolo Lim',
        'Kim Alvarez','Nina Delos Santos','Jasper Ong','Ivy Flores','Carla Bautista','Dion Mercado','Ella Navarro','Fritz Ramos'
    ];
    const barangayList = ['Ampayon','Banza','Bitaan','Libertad','Masao','Tiniwisan','Sumilihon','Villa Kananga'];
    const sectors = ['PWD','Senior Citizen','Indigenous People','Solo Parent'];
    const businessTypes = ['Establishment','Buy & Sell','Homemade','Livestock','Services'];
    const genders = ['Male','Female'];

    const seeded = [];
    let id = 1;

    for (let i = 0; i < 20; i += 1) {
        const isBeneficiary = i < 14;
        const name = names[i % names.length];
        const barangay = barangayList[i % barangayList.length];
        const sector = sectors[i % sectors.length];
        const businessType = businessTypes[i % businessTypes.length];
        const gender = genders[i % genders.length];
        const repayments = [];

        if (isBeneficiary) {
            for (let m = 1; m <= 6; m += 1) {
                repayments.push({
                    amount: 625,
                    status: m % 3 === 0 ? 'Pending' : 'Verified',
                    dueFor: `2025-0${m}`,
                    paymentDate: `2025-0${m}-15`
                });
            }
        }

        seeded.push({
            id: id++,
            name,
            email: `${name.toLowerCase().replace(/\s+/g,'')}@smartleap.gov.ph`,
            contact: '09' + (900000000 + i).toString(),
            barangay,
            sector,
            businessType,
            gender,
            status: isBeneficiary ? 'Active' : 'Pending',
            applicationStatus: isBeneficiary ? 'Active' : 'Pending',
            assistanceAmount: 15000,
            repayments,
            requirements: {
                validId: { status: isBeneficiary ? 'Verified' : 'Uploaded', files: [] },
                cedula: { status: isBeneficiary ? 'Verified' : 'Uploaded', files: [] },
                healthCertificate: { status: isBeneficiary ? 'Verified' : 'Missing', files: [] }
            }
    }

    beneficiaries = seeded;
}
    try {
        const rawBeneficiaries = localStorage.getItem(STORAGE_KEYS.beneficiaries);
        const rawApplications = localStorage.getItem(STORAGE_KEYS.applications);
        const rawUsers = localStorage.getItem(STORAGE_KEYS.users);
        const parsedBeneficiaries = rawBeneficiaries ? JSON.parse(rawBeneficiaries) : [];
        const parsedApplications = rawApplications ? JSON.parse(rawApplications) : [];
        const parsedUsers = rawUsers ? JSON.parse(rawUsers) : [];
        beneficiaries = Array.isArray(parsedBeneficiaries) ? parsedBeneficiaries : [];
        applications = Array.isArray(parsedApplications) ? parsedApplications : [];
        users = Array.isArray(parsedUsers) ? parsedUsers : [];
    } catch (err) {
        console.warn('Unable to load dashboard state', err);
        beneficiaries = Array.isArray(beneficiaries) ? beneficiaries : [];
        applications = Array.isArray(applications) ? applications : [];
        users = Array.isArray(users) ? users : [];
    }
}

function escapeHtml(value) {
    if (value == null) return '';
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function initTrainingShared() {
    if (window.TrainingShared && typeof TrainingShared.init === 'function') {
        TrainingShared.init();
    }
}
function getTrainingProgress(beneficiaryId) {
    if (!window.TrainingShared || beneficiaryId === undefined || beneficiaryId === null) return 0;
    const progress = TrainingShared.getBeneficiaryProgress?.(beneficiaryId) || TrainingShared.getBeneficiaryProgress?.(Number(beneficiaryId));
    return typeof progress === 'number' ? progress : (progress?.completion || 0);
}
function renderReportsSection() {
    const section = document.getElementById('reports-section');
    if (!section) return;

    section.innerHTML = `
        <div class="reports-shell reports-v2">
            <div class="reports-header">
                <div>
                    <h3>Reports & Analytics</h3>
                    <p>Filters, KPIs, and detailed operational analytics.</p>
                </div>
                <div class="reports-header__actions"></div>
            </div>
            
            <div class="reports-toolbar" id="reports-filters">
                <div class="reports-toolbar__row">
                    <div class="reports-filter-group">
                        <span class="reports-label">Date range</span>
                        <div class="reports-date-group">
                            <input type="date" id="reports-date-start">
                            <span class="reports-date-sep">to</span>
                            <input type="date" id="reports-date-end">
                        </div>
                    </div>
                    <div class="reports-filter-group">
                        <span class="reports-label">Sectors</span>
                        <div class="reports-chips" id="reports-sector-chips">
                            <button type="button" class="chip" data-sector="PWD">PWD</button>
                            <button type="button" class="chip" data-sector="Senior Citizen">Senior Citizen</button>
                            <button type="button" class="chip" data-sector="Indigenous People">Indigenous People</button>
                            <button type="button" class="chip" data-sector="Solo Parent">Solo Parent</button>
                        </div>
                    </div>
                </div>
                <div class="reports-toolbar__row">
                    <label class="reports-search">
                        <i class="fas fa-search" aria-hidden="true"></i>
                        <input type="search" id="reports-search" placeholder="Search by name or barangay">
                    </label>
                    <label class="reports-field">
                        <span>Barangay</span>
                        <select id="reports-barangay"></select>
                    </label>
                    <div class="reports-toolbar__actions">
                        <button type="button" class="app-btn-outline" id="reports-clear">Clear</button>
                        <button type="button" class="app-btn-ghost" id="reports-refresh">Refresh</button>
                        <button type="button" class="app-btn-outline" id="reports-export-csv">Export CSV</button>
                        <button type="button" class="app-btn-outline" id="reports-export-pdf">Export PDF</button>
                    </div>
                </div>
            </div>

            <div class="reports-kpis" id="reports-kpis"></div>

            <div class="reports-wrap">
                <div class="charts-grid">
                    <article class="chart-card chart-card--wide">
                        <div class="chart-card__header">
                            <h4>Repayment Rate</h4>
                            <p class="chart-card__meta">Monthly repayment completion rate.</p>
                        </div>
                        <div class="chart-wrap tall"><canvas id="reports-repayment-line"></canvas></div>
                    </article>
                    <article class="chart-card chart-card--narrow">
                        <div class="chart-card__header">
                            <h4>Gender Segregation</h4>
                            <p class="chart-card__meta">Male vs Female distribution.</p>
                        </div>
                        <div class="chart-wrap chart-wrap--small"><canvas id="reports-gender-pie"></canvas></div>
                    </article>
                </div>

                <div class="charts-stack">
                    <article class="chart-card full">
                        <div class="chart-card__header">
                            <h4>Business Type</h4>
                            <p class="chart-card__meta">Business type distribution.</p>
                        </div>
                        <div class="chart-wrap"><canvas id="reports-business-bar"></canvas></div>
                    </article>
                    <article class="chart-card full">
                        <div class="chart-card__header">
                            <h4>Beneficiaries by Sector</h4>
                            <p class="chart-card__meta">Applicants vs beneficiaries.</p>
                        </div>
                        <div class="chart-wrap"><canvas id="reports-sector-bar"></canvas></div>
                    </article>
                </div>
            </div>

            <div class="reports-table-block">
                <div class="tabbar" id="reports-tabs">
                    <button type="button" class="tab is-active" data-tab="repayments">Repayments</button>
                    <button type="button" class="tab" data-tab="training">Training</button>
                    <button type="button" class="tab" data-tab="compliance">Compliance</button>
                </div>
                <div class="reports-table-filters" id="reports-table-filters"></div>
                <div class="reports-table" id="reports-table"></div>
            </div>
        </div>`;

    initReportsFilters();
    updateReportsView();
}
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

    section.querySelectorAll('[data-team-close]').forEach((btn) => {
        btn.addEventListener('click', closeStaffModal);
    });


    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeStaffModal();
                    }
    });

    const modal = document.getElementById('team-modal');
    modal?.addEventListener('click', (event) => {
        if (event.target === modal) closeStaffModal();
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
            const ok = confirm(`Reassign ${barangay} from ${from} to ${to}?`);\n            if (!ok) {\n                renderBarangayList();\n                return;\n            }\n            teamState.assignmentsDraft[barangayId] = pdoId;\n            renderBarangayList();\n            updateAssignSaveState();\n            return;\n                teamState.assignmentsDraft[barangayId] = pdoId;
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
function reassignBarangay(barangayId, newPdoId) {
    if (!teamState.assignmentsDraft) teamState.assignmentsDraft = { ...assignments };
    const current = teamState.assignmentsDraft[barangayId];
    if (current === newPdoId) return;
    const barangay = barangays.find((b) => b.id === barangayId)?.name || 'Barangay';
    const from = current ? getStaffName(current) : 'Unassigned';
    const to = getStaffName(newPdoId);
    const ok = confirm(`Barangay ${barangay} is currently assigned to ${from}. Reassign to ${to}?`);
    if (!ok) return;
    teamState.assignmentsDraft[barangayId] = newPdoId;
    applyBarangaySearch();
}

function getCurrentAdmin() {
    return staff.find((u) => u.email === CURRENT_ADMIN_EMAIL) || staff.find((u) => u.role === "Admin") || staff[0];
}





const dateFormatter = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' });





function formatDate(value) {
    if (!value) return 'Not provided';
    try { return dateFormatter.format(new Date(`${value}T00:00:00`)); } catch { return value; }
}

function formatMonth(value) {
    if (!value) return 'Not provided';
    try { return monthFormatter.format(new Date(`${value}T00:00:00`)); } catch { return value; }
}


function countSectorByLabel(items, label) {
    if (!Array.isArray(items)) return 0;
    const target = String(label || '').toLowerCase();
    return items.filter((item) => {
        const raw = getSectorText?.(item) || item?.sector || item?.sectorDetails || '';
        const normalized = String(raw || '').toLowerCase();
        return normalized.includes(target) || (target === 'pwd' && normalized.includes('disability')) || (target.includes('indigenous') && normalized.includes('ip'));
    }).length;
}

function subscribeRealtimeUpdates() {
    // Placeholder: no realtime transport wired in this frontend-only setup.
}

function openRepaymentEditModal(beneficiary, payment = null) {
    const modal = document.getElementById('repaymentEditModal');
    if (!modal) return;
    if (window.bootstrap?.Modal) {
        showModal(modal);
    } else {
        modal.classList.add('show');
        modal.style.display = 'flex';
        modal.removeAttribute('aria-hidden');
        modal.setAttribute('aria-modal', 'true');
        document.body.classList.add('modal-open');
    }
}




const reviewModalState = {
    beneficiary: null,
    payment: null,
    proofUrl: ''
};

function initReviewModal() {
    const modal = document.getElementById('repaymentReviewModal');
    const proofModal = document.getElementById('proofPreviewModal');
    if (!modal) return;

    const bindClose = (root) => {
        root?.querySelectorAll('[data-modal-close]').forEach((btn) => {
            btn.addEventListener('click', () => closeAdminModal(root));
        root?.addEventListener('click', (event) => {
            if (event.target === root) closeAdminModal(root);
    };

    bindClose(modal);
    bindClose(proofModal);

    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (modal?.classList.contains('is-open')) closeAdminModal(modal);
        if (proofModal?.classList.contains('is-open')) closeAdminModal(proofModal);
    });

    modal.querySelector('#review-verify')?.addEventListener('click', () => {
        if (!confirm('Verify this receipt?')) return;
        updateReviewStatus('Verified');
    });
    modal.querySelector('#review-reject')?.addEventListener('click', () => {
        if (!confirm('Reject this receipt?')) return;
        updateReviewStatus('Rejected');
    });
    modal.querySelector('#review-save-draft')?.addEventListener('click', () => {
        showToast?.('Draft saved locally.', 'info');
    });
    modal.querySelector('#review-open-proof')?.addEventListener('click', () => {
        openProofPreviewModal(reviewModalState.payment);
    });
    modal.querySelector('#review-proof-input')?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const preview = modal.querySelector('#review-proof-preview');
        const openBtn = modal.querySelector('#review-open-proof');
        if (!preview || !openBtn) return;
        preview.innerHTML = `<div class="review-empty">${escapeHtml(file.name)}</div>`;
        const reader = new FileReader();
        reader.onload = () => {
            reviewModalState.proofUrl = String(reader.result || '');
            if (file.type.startsWith('image/')) {
                preview.innerHTML = `<img src="${escapeAttribute(reviewModalState.proofUrl)}" alt="Proof preview" style="max-width:100%; border-radius:12px;">`;
            }
            openBtn.hidden = false;
        };
        reader.readAsDataURL(file);
    });
}

function openRepaymentReviewModal(beneficiary, payment) {
    const modal = document.getElementById('repaymentReviewModal');
    if (!modal) return;

    const data = buildReviewData(beneficiary, payment);
    reviewModalState.beneficiary = data.beneficiary;
    reviewModalState.payment = data.payment;
    reviewModalState.proofUrl = data.proofUrl || '';

    modal.querySelector('#review-beneficiary-name').textContent = data.beneficiary.name;
    modal.querySelector('#review-beneficiary-meta').textContent = `${data.beneficiary.address} • ${data.beneficiary.phone}`;

    modal.querySelector('#review-name').textContent = data.beneficiary.name;
    modal.querySelector('#review-address').textContent = data.beneficiary.address;
    modal.querySelector('#review-phone').textContent = data.beneficiary.phone;
    modal.querySelector('#review-email').textContent = data.beneficiary.email;
    modal.querySelector('#review-sector').textContent = data.beneficiary.sector;

    modal.querySelector('#review-assistance').textContent = data.summary.assistance;
    modal.querySelector('#review-balance').textContent = data.summary.balance;
    modal.querySelector('#review-last-payment').textContent = data.summary.lastPayment;

    const historyList = modal.querySelector('#review-history-list');
    if (historyList) {
        if (!data.history.length) {
            historyList.innerHTML = '<div class="review-empty">No receipts logged yet.</div>';
        } else {
            historyList.innerHTML = data.history.map((item) => `
                <div class="review-history-item">
                    <strong>${escapeHtml(item.month)}</strong>
                    <span>${escapeHtml(item.amount)} • ${escapeHtml(item.status)}</span>
                </div>
            `).join('');
        }
    }
    const countChip = modal.querySelector('#review-receipt-count');
    if (countChip) countChip.textContent = `${data.history.length} receipts`;

    const monthSelect = modal.querySelector('#review-month');
    if (monthSelect) {
        monthSelect.innerHTML = data.monthOptions;
        monthSelect.value = data.payment.month || '';
    }
    modal.querySelector('#review-date').value = data.payment.date || '';
    modal.querySelector('#review-amount').value = data.payment.amount || '';
    modal.querySelector('#review-or').value = data.payment.orNumber || '';
    modal.querySelector('#review-notes').value = data.payment.notes || '';
    modal.querySelector('#review-remarks').value = '';

    updateReviewBadge(modal, data.payment.status);
    renderReviewProof(modal, data.proofUrl, data.payment.fileName);

    openAdminModal(modal);
}

function buildReviewData(beneficiary, payment) {
    const safeBeneficiary = beneficiary || {
        name: 'Maria Santos',
        address: 'Barangay Ampayon, Butuan City',
        phone: '09xx xxx xxxx',
        email: 'beneficiary@email.com',
        sector: 'Senior Citizen',
        assistanceAmount: PROGRAM.assistanceTotal
    };
    const repayments = safeBeneficiary.repayments || [];
    const latest = repayments.slice().sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')).shift();
    const summary = computeRepaymentProgress(safeBeneficiary);

    const history = repayments.slice().sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')).map((entry) => ({
        month: formatMonth(entry.dueFor) || '--',
        amount: pesoFormatter.format(entry.amount || PROGRAM.monthlyAmortization),
        status: entry.status || 'Pending'
    }));

    const paymentData = payment || {
        id: 1,
        dueFor: '',
        paymentDate: '',
        amount: PROGRAM.monthlyAmortization,
        orNumber: '',
        notes: '',
        status: 'Pending'
    };

    return {
        beneficiary: {
            name: safeBeneficiary.name || 'Beneficiary',
            address: formatBeneficiaryAddress(safeBeneficiary),
            phone: safeBeneficiary.contact || safeBeneficiary.phone || 'Not provided',
            email: safeBeneficiary.email || 'Not provided',
            sector: formatSectorLabel(safeBeneficiary.sector || safeBeneficiary.program || 'Not specified') || 'Not specified'
        },
        summary: {
            assistance: pesoFormatter.format(safeBeneficiary.assistanceAmount || PROGRAM.assistanceTotal),
            balance: pesoFormatter.format(summary.remainingBalance || 0),
            lastPayment: latest ? formatDate(latest.paymentDate || latest.verifiedAt || '') : 'No payments yet'
        },
        history,
        monthOptions: buildMonthOptions(paymentData.dueFor),
        payment: {
            month: paymentData.dueFor || '',
            date: paymentData.paymentDate || '',
            amount: paymentData.amount || '',
            orNumber: paymentData.orNumber || '',
            notes: paymentData.notes || '',
            status: paymentData.status || 'Pending',
            fileName: paymentData.proofName || paymentData.proof || ''
        },
        proofUrl: paymentData.proofUrl || paymentData.proof || ''
    };
}

function buildMonthOptions(selectedValue = '') {
    const options = ['','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'];
    return options.map((value) => {
        if (!value) return '<option value="">Select month</option>';
        const label = formatMonth(value);
        const selected = value === selectedValue ? 'selected' : '';
        return `<option value="${value}" ${selected}>${label}</option>`;
    }).join('');
}

function updateReviewStatus(status) {
    const modal = document.getElementById('repaymentReviewModal');
    if (!modal) return;
    updateReviewBadge(modal, status);
    if (reviewModalState.payment) {
        reviewModalState.payment.status = status;
    }
}

function updateReviewBadge(modal, status) {
    const badge = modal.querySelector('#review-status-badge');
    if (!badge) return;
    const normalized = String(status || 'Pending').toLowerCase();
    badge.textContent = status || 'Pending';
    badge.classList.remove('pending', 'verified', 'overdue');
    if (normalized.includes('verified')) badge.classList.add('verified');
    else if (normalized.includes('overdue') || normalized.includes('reject')) badge.classList.add('overdue');
    else badge.classList.add('pending');
}

function renderReviewProof(modal, proofUrl, fileName) {
    const preview = modal.querySelector('#review-proof-preview');
    const openBtn = modal.querySelector('#review-open-proof');
    if (!preview || !openBtn) return;
    if (!proofUrl && !fileName) {
        preview.innerHTML = '<div class="review-empty">No proof uploaded yet.</div>';
        openBtn.hidden = true;
        return;
    }
    if (proofUrl && proofUrl.startsWith('data:image')) {
        preview.innerHTML = `<img src="${escapeAttribute(proofUrl)}" alt="Proof preview" style="max-width:100%; border-radius:12px;">`;
    } else {
        preview.innerHTML = `<div class="review-empty">${escapeHtml(fileName || 'Proof attached')}</div>`;
    }
    openBtn.hidden = false;
}

function openProofPreviewModal(payment) {
    const modal = document.getElementById('proofPreviewModal');
    if (!modal) return;
    const content = modal.querySelector('#proof-preview-content');
    const proofUrl = payment?.proofUrl || payment?.proof || reviewModalState.proofUrl || '';
    if (!proofUrl) {
        content.innerHTML = '<div class="review-empty">No proof uploaded yet.</div>';
    } else if (proofUrl.startsWith('data:image')) {
        content.innerHTML = `<img src="${escapeAttribute(proofUrl)}" alt="Proof preview" style="max-width:100%; border-radius:12px;">`;
    } else {
        content.innerHTML = `<div class="review-empty">${escapeHtml(payment?.proofName || 'Proof attached')}</div>`;
    }
    openAdminModal(modal);
}

function openAdminModal(modal) {
    modal.classList.add('is-open');
    modal.removeAttribute('aria-hidden');
    document.body.classList.add('modal-open');
}

function closeAdminModal(modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}


function persistBeneficiaries() {
    try {
        localStorage.setItem(STORAGE_KEYS.beneficiaries, JSON.stringify(beneficiaries || []));
    } catch (err) {
        console.warn('Unable to persist beneficiaries', err);
    }
}

/* REPORTS & ANALYTICS REDESIGN START */
const reportsAbortKey = { controller: null };
let reportsCharts = [];
const reportsTableFilter = { gender: 'all', business: 'all', sector: 'all', month: 'all' };

function applyChartTableFilter({ tab, gender, business, sector, month } = {}) {
    if (tab) {
        setReportsTab(tab);
    }
    if (gender) reportsTableFilter.gender = gender;
    if (business) reportsTableFilter.business = business;
    if (sector) reportsTableFilter.sector = sector;
    if (month) reportsTableFilter.month = month;
    updateReportsView();
}

function getReportsTableRoster(roster) {
    return roster.filter((b) => {
        if (reportsTableFilter.gender !== 'all') {
            if (String(b.gender || '').toLowerCase() !== String(reportsTableFilter.gender).toLowerCase()) return false;
        }
        if (reportsTableFilter.business !== 'all') {
            const value = String(b.businessType || b.business || '').toLowerCase();
            if (value !== String(reportsTableFilter.business).toLowerCase()) return false;
        }
        if (reportsTableFilter.sector !== 'all') {
            const sectorLabel = formatSectorLabel(b.sector || b.program || '').replace('Person with Disability (PWD)', 'PWD');
            if (sectorLabel !== reportsTableFilter.sector) return false;
        }
        return true;
    });
}

function populateBarangayOptions(selectEl) {
    if (!selectEl) return;
    const list = Array.isArray(barangays) && barangays.length
        ? barangays.map((b) => b.name)
        : Array.from(new Set(getBeneficiaryRoster().map((b) => b.barangay).filter(Boolean)));
    const items = ['all', ...list.sort()];
    selectEl.innerHTML = items.map((b) => `<option value="${b === 'all' ? 'all' : b}">${b === 'all' ? 'All barangays' : b}</option>`).join('');
}
function initReportsFilters() {
    const toolbar = document.getElementById('reports-filters');
    if (!toolbar) return;

    if (reportsAbortKey.controller) {
        reportsAbortKey.controller.abort();
    }
    const controller = new AbortController();
    reportsAbortKey.controller = controller;
    const { signal } = controller;

    const startInput = document.getElementById('reports-date-start');
    const endInput = document.getElementById('reports-date-end');
    const barangaySelect = document.getElementById('reports-barangay');
    const searchInput = document.getElementById('reports-search');
    const chipButtons = Array.from(document.querySelectorAll('#reports-sector-chips .chip'));
    const clearBtn = document.getElementById('reports-clear');
    const refreshBtn = document.getElementById('reports-refresh');
    const exportCsvBtn = document.getElementById('reports-export-csv');
    const exportPdfBtn = document.getElementById('reports-export-pdf');

    populateBarangayOptions(barangaySelect);

    reportsFilters.dateRange = 'custom';
    startInput.value = reportsFilters.customStart || '';
    endInput.value = reportsFilters.customEnd || '';
    barangaySelect.value = reportsFilters.barangay || 'all';
    searchInput.value = filterState.reports.search || '';

    const syncChips = () => {
        chipButtons.forEach((btn) => {
            const key = btn.dataset.sector;
            btn.classList.toggle('is-active', filterState.reports.sectors.has(key));
    };

    chipButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.sector;
            if (filterState.reports.sectors.has(key)) {
                filterState.reports.sectors.delete(key);
            } else {
                filterState.reports.sectors.add(key);
            }
            reportsTableFilter.sector = filterState.reports.sectors.size ? Array.from(filterState.reports.sectors)[0] : 'all';
            clearReportsChartFilters();
            syncChips();
            updateReportsView();
        }, { signal });
    });

    startInput.addEventListener('change', () => {
        reportsFilters.customStart = startInput.value;
        clearReportsChartFilters();
        updateReportsView();
    }, { signal });

    endInput.addEventListener('change', () => {
        reportsFilters.customEnd = endInput.value;
        clearReportsChartFilters();
        updateReportsView();
    }, { signal });

    searchInput.addEventListener('input', () => {
        filterState.reports.search = searchInput.value.trim();
        updateReportsView();
    }, { signal });

    barangaySelect.addEventListener('change', () => {
        reportsFilters.barangay = barangaySelect.value || 'all';
        clearReportsChartFilters();
        updateReportsView();
    }, { signal });

    refreshBtn?.addEventListener('click', () => {
        clearReportsChartFilters();
        updateReportsView();
    }, { signal });

    exportCsvBtn?.addEventListener('click', () => exportReportsData(), { signal });
    exportPdfBtn?.addEventListener('click', () => {
        exportReportsData();
        showToast('PDF export started', 'info');
    }, { signal });

    syncChips();
}

function updateReportsView() {
    const container = document.querySelector('.reports-shell');
    if (!container) return;

    const roster = getReportsFilteredBeneficiaries();
    renderReportsKpis(roster);
    renderReportsCharts(roster);
    renderReportsTable(roster);
}

function renderReportsKpis(roster) {
    const target = document.getElementById('reports-kpis');
    if (!target) return;

    const compliance = getComplianceSummary(roster);
    const training = getReportsTrainingSummary(roster);
    const repayment = getReportsRepaymentSummary(roster);
    const repaymentPct = repayment.total ? Math.round((repayment.verified / repayment.total) * 100) : 0;

    target.innerHTML = `
        <div class="kpi-card">
            <span>Compliance Rate</span>
            <strong>${percent(compliance.verified, compliance.total)}</strong>
            <em>${compliance.verified}/${compliance.total} cleared</em>
        </div>
        <div class="kpi-card">
            <span>Training Completion</span>
            <strong>${percent(training.completed, training.total)}</strong>
            <em>${training.completed}/${training.total} completed</em>
        </div>
        <div class="kpi-card">
            <span>Repayment Verification</span>
            <strong>${repaymentPct}%</strong>
            <em>${repayment.verified}/${repayment.total} verified</em>
        </div>
        <div class="kpi-card">
            <span>Total Beneficiaries</span>
            <strong>${numberFormatter.format(roster.length)}</strong>
            <em>Active roster</em>
        </div>
    `;
}

function renderReportsCharts(roster) {
    if (typeof Chart !== 'function') return;
    destroyReportsCharts();

    const repaymentCtx = document.getElementById('reports-repayment-line')?.getContext('2d');
    const genderCtx = document.getElementById('reports-gender-pie')?.getContext('2d');
    const businessCtx = document.getElementById('reports-business-bar')?.getContext('2d');
    const sectorCtx = document.getElementById('reports-sector-bar')?.getContext('2d');

    const repaymentSeries = buildRepaymentRateSeries(roster);
    const genderSeries = buildGenderSeries(roster);
    const businessSeries = buildBusinessSeries(roster);
    const sectorSeries = buildSectorComparisonSeries(roster);

    if (repaymentCtx) {
        reportsCharts.push(new Chart(repaymentCtx, {
            type: 'line',
            data: {
                labels: repaymentSeries.labels,
                datasets: [{
                    label: 'Repayment %',
                    data: repaymentSeries.values,
                    borderColor: '#16A34A',
                    backgroundColor: 'rgba(22, 163, 74, 0.2)',
                    tension: 0.35,
                    fill: true,
                    pointRadius: 4,
                    pointBackgroundColor: '#16A34A'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: (value) => `${value}%` }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed.y}%` } }
                },
                onClick: (_, elements) => {
                    if (!elements.length) return;
                    const index = elements[0].index;
                    const monthKey = repaymentSeries.keys[index];
                    applyChartTableFilter({ tab: 'repayments', month: monthKey });
                }
            }
        }));
    }

    if (genderCtx) {
        reportsCharts.push(new Chart(genderCtx, {
            type: 'pie',
            data: {
                labels: genderSeries.labels,
                datasets: [{
                    data: genderSeries.values,
                    backgroundColor: ['#2563EB', '#F472B6']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.label}: ${ctx.parsed} (${genderSeries.percent(ctx.parsed)}%)`
                        }
                    }
                },
                onClick: (_, elements) => {
                    if (!elements.length) return;
                    const index = elements[0].index;
                    applyChartTableFilter({ gender: genderSeries.labels[index] });
                }
            }
        }));
    }
    if (businessCtx) {
        const businessLabels = ['Establishment', 'Buy & Sell', 'Homemade', 'Livestock', 'Services'];
        const businessFallback = [94, 88, 50, 16, 6];
        const businessValues = businessSeries.values.some((val) => val > 0)
            ? businessSeries.values
            : businessFallback;
        const businessTotal = businessValues.reduce((sum, val) => sum + val, 0) || 1;
        const businessMax = Math.max(...businessValues, 0);
        const businessSuggested = Math.max(100, Math.ceil(businessMax / 10) * 10);
        reportsCharts.push(new Chart(businessCtx, {
            type: 'bar',
            data: {
                labels: businessLabels,
                datasets: [{
                    label: 'Count',
                    data: businessValues,
                    backgroundColor: '#2563EB'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        ticks: { maxRotation: 0, minRotation: 0 }
                    },
                    y: {
                        beginAtZero: true,
                        suggestedMax: businessSuggested,
                        ticks: { stepSize: 10, precision: 0 }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const value = ctx.parsed.y || 0;
                                const pct = Math.round((value / businessTotal) * 100);
                                return `${ctx.label}: ${value} (${pct}%)`;
                            }
                        }
                    }
                },
                onClick: (_, elements) => {
                    if (!elements.length) return;
                    const index = elements[0].index;
                    applyChartTableFilter({ business: businessLabels[index] });
                }
            }
        }));
    }
    if (sectorCtx) {
        const sectorLabels = ['PWD', 'Senior Citizen', 'Indigenous People', 'Solo Parent'];
        const sectorValues = [...sectorSeries.applicants, ...sectorSeries.beneficiaries];
        const hasSectorData = sectorValues.some((val) => val > 0);
        const sectorFallback = {
            applicants: [48, 32, 14, 26],
            beneficiaries: [38, 24, 10, 18]
        };
        const sectorApplicants = hasSectorData ? sectorSeries.applicants : sectorFallback.applicants;
        const sectorBeneficiaries = hasSectorData ? sectorSeries.beneficiaries : sectorFallback.beneficiaries;
        const sectorMax = Math.max(...sectorApplicants, ...sectorBeneficiaries, 0);
        const sectorSuggested = Math.ceil(sectorMax / 5) * 5;
        reportsCharts.push(new Chart(sectorCtx, {
            type: 'bar',
            data: {
                labels: sectorLabels,
                datasets: [
                    { label: 'Applicants', data: sectorApplicants, backgroundColor: '#2563EB' },
                    { label: 'Beneficiaries', data: sectorBeneficiaries, backgroundColor: '#16A34A' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        ticks: { maxRotation: 0, minRotation: 0 }
                    },
                    y: {
                        beginAtZero: true,
                        suggestedMax: sectorSuggested,
                        ticks: { stepSize: 5, precision: 0 }
                    }
                },
                plugins: {
                    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}` } }
                },
                onClick: (_, elements) => {
                    if (!elements.length) return;
                    const index = elements[0].index;
                    applyChartTableFilter({ sector: sectorLabels[index] });
                }
            }
        }));
    }

}

function setReportsTab(tab) {
    document.querySelectorAll('#reports-tabs .tab').forEach((el) => {
        el.classList.toggle('is-active', el.dataset.tab === tab);
    });
}

function getReportsFilteredBeneficiaries() {
    const roster = getBeneficiaryRoster();
    const sectorFilters = filterState.reports.sectors;
    const barangay = reportsFilters.barangay || 'all';
    const query = (filterState.reports.search || '').toLowerCase();

    return roster.filter((b) => {
        if (sectorFilters.size) {
            const sectorLabel = formatSectorLabel(b.sector || b.program || '').replace('Person with Disability (PWD)', 'PWD');
            if (!sectorFilters.has(sectorLabel) && !sectorFilters.has(b.sector)) return false;
        }
        if (barangay !== 'all' && String(b.barangay || '') !== barangay) return false;
        if (query) {
            const name = String(b.name || '').toLowerCase();
            const brgy = String(b.barangay || '').toLowerCase();
            if (!name.includes(query) && !brgy.includes(query)) return false;
        }
        return true;
    });
}
function renderReportsTable(roster) {
    const container = document.getElementById('reports-table');
    if (!container) return;

    const tab = document.querySelector('#reports-tabs .tab.is-active')?.dataset.tab || 'repayments';
    const tableRoster = getReportsTableRoster(roster);
    const rows = buildReportsRowsForTab(tab, tableRoster);

    container.innerHTML = `
        <table class="table-clean">
            <thead>${renderReportsTableHead(tab)}</thead>
            <tbody>${rows.map((row) => row.html).join('') || `<tr><td colspan="6">No records found.</td></tr>`}</tbody>
        </table>`;

    document.querySelectorAll('#reports-tabs .tab').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
            setReportsTab(tabBtn.dataset.tab);
            updateReportsView();
    });

    renderReportsTableFilters();
}

function renderReportsTableFilters() {
    const container = document.getElementById('reports-table-filters');
    if (!container) return;

    const chips = [];
    if (reportsTableFilter.gender !== 'all') chips.push(`Gender: ${reportsTableFilter.gender}`);
    if (reportsTableFilter.business !== 'all') chips.push(`Business: ${reportsTableFilter.business}`);
    if (reportsTableFilter.sector !== 'all') chips.push(`Sector: ${reportsTableFilter.sector}`);
    if (reportsTableFilter.month !== 'all') chips.push(`Month: ${reportsTableFilter.month}`);

    container.innerHTML = chips.length
        ? chips.map((chip) => `<span class="chip">${chip}</span>`).join('') + '<button type="button" class="link-button" id="reports-clear-table">Clear chart filter</button>'
        : '';

    container.querySelector('#reports-clear-table')?.addEventListener('click', () => {
        reportsTableFilter.gender = 'all';
        reportsTableFilter.business = 'all';
        reportsTableFilter.sector = 'all';
        reportsTableFilter.month = 'all';
        updateReportsView();
    });
}

function renderReportsTableHead(tab) {
    if (tab === 'training') {
        return `
            <tr>
                <th>Name</th>
                <th>Barangay</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
            </tr>`;
    }
    if (tab === 'compliance') {
        return `
            <tr>
                <th>Name</th>
                <th>Barangay</th>
                <th>Status</th>
                <th>Missing</th>
                <th>Actions</th>
            </tr>`;
    }
    return `
        <tr>
            <th>Name</th>
            <th>Barangay</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
        </tr>`;
}

function buildReportsRowsForTab(tab, roster) {
    const rows = [];
    const { start, end } = getReportsDateRangeBounds();

    const inRange = (value) => {
        if (!value) return true;
        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return true;
        return (!start || date >= start) && (!end || date <= end);
    };

    if (tab === 'training') {
        roster.forEach((b) => {
            const progress = getTrainingProgress(b.id || b.beneficiaryId) || 0;
            const status = progress >= 1 ? 'Completed' : progress > 0 ? 'Ongoing' : 'Not started';
            const date = b.lastTraining || b.trainingDate || '';
            if (!inRange(date)) return;
            rows.push({
                html: `
                    <tr>
                        <td>${escapeHtml(b.name || '--')}</td>
                        <td>${escapeHtml(b.barangay || '--')}</td>
                        <td>${status}</td>
                        <td>${escapeHtml(date || '--')}</td>
                        <td><button class="btn-ghost">View</button></td>
                    </tr>`
            });
        return rows;
    }

    if (tab === 'compliance') {
        roster.forEach((b) => {
            const summary = calculateRequirementSummary(b.requirements || {}) || { total: 0, verified: 0 };
            const status = summary.total && summary.verified === summary.total ? 'Cleared' : 'Pending';
            rows.push({
                html: `
                    <tr>
                        <td>${escapeHtml(b.name || '--')}</td>
                        <td>${escapeHtml(b.barangay || '--')}</td>
                        <td>${status}</td>
                        <td>${Math.max(summary.total - summary.verified, 0)}</td>
                        <td><button class="btn-ghost">View</button></td>
                    </tr>`
            });
        return rows;
    }

    roster.forEach((b) => {
        (b.repayments || []).forEach((p) => {
            const date = p.paymentDate || p.dueFor || '';
            if (!inRange(date)) return;
            if (reportsTableFilter.month !== 'all' && date && !String(date).startsWith(reportsTableFilter.month)) return;
            rows.push({
                html: `
                    <tr>
                        <td>${escapeHtml(b.name || '--')}</td>
                        <td>${escapeHtml(b.barangay || '--')}</td>
                        <td>${formatCurrency(p.amount || 0)}</td>
                        <td>${escapeHtml(p.status || 'Pending')}</td>
                        <td>${escapeHtml(date || '--')}</td>
                        <td><button class="btn-ghost">View proof</button></td>
                    </tr>`
            });
    });

    return rows;
}


function getComplianceSummary(roster) {
    let total = 0;
    let verified = 0;
    roster.forEach((b) => {
        const summary = calculateRequirementSummary(b.requirements || {});
        if (!summary) return;
        total += summary.total;
        verified += summary.verified;
    });
    return { total, verified };
}

function getReportsRepaymentSummary(roster) {
    const { start, end } = getReportsDateRangeBounds();
    const payments = roster.flatMap((b) => b.repayments || []).filter((p) => {
        const raw = p.paymentDate || p.dueFor || '';
        if (!raw) return true;
        const date = new Date(`${raw}T00:00:00`);
        if (Number.isNaN(date.getTime())) return true;
        return (!start || date >= start) && (!end || date <= end);
    });
    const verified = payments.filter((p) => normalizeStatus(p.status || '') === 'verified');
    return { total: payments.length, verified: verified.length };
}

function getReportsTrainingSummary(roster) {
    const { start, end } = getReportsDateRangeBounds();
    let total = roster.length;
    let completed = 0;
    roster.forEach((b) => {
        const date = b.lastTraining || b.trainingDate || '';
        if (date) {
            const when = new Date(`${date}T00:00:00`);
            if (!Number.isNaN(when.getTime()) && ((start && when < start) || (end && when > end))) return;
        }
        const progress = getTrainingProgress(b.id || b.beneficiaryId) || 0;
        if (progress >= 1) completed += 1;
    });
    return { total, completed };
}

function getReportsDateRangeBounds() {
    const now = new Date();
    if (reportsFilters.dateRange === 'custom' && reportsFilters.customStart && reportsFilters.customEnd) {
        return {
            start: new Date(`${reportsFilters.customStart}T00:00:00`),
            end: new Date(`${reportsFilters.customEnd}T23:59:59`)
        };
    }
    if (reportsFilters.dateRange === 'last-3') {
        return {
            start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0)
        };
    }
    if (reportsFilters.dateRange === 'ytd') {
        return {
            start: new Date(now.getFullYear(), 0, 1),
            end: now
        };
    }
    return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0)
    };
}

function buildRepaymentRateSeries(roster) {
    const { start, end } = getReportsDateRangeBounds();
    const map = new Map();
    roster.forEach((b) => {
        (b.repayments || []).forEach((p) => {
            const raw = p.paymentDate || p.dueFor || '';
            if (!raw) return;
            const date = new Date(`${raw}T00:00:00`);
            if (Number.isNaN(date.getTime())) return;
            if ((start && date < start) || (end && date > end)) return;
            const key = raw.slice(0, 7);
            const entry = map.get(key) || { verified: 0, total: 0 };
            entry.total += 1;
            if (normalizeStatus(p.status || '') === 'verified') entry.verified += 1;
            map.set(key, entry);
    });

    const keys = Array.from(map.keys()).sort();
    const labels = keys.map((key) => formatMonth(`${key}-01`));
    const values = keys.map((key) => {
        const entry = map.get(key) || { verified: 0, total: 0 };
        return entry.total ? Math.round((entry.verified / entry.total) * 100) : 0;
    });

    return { keys, labels, values };
}

function buildGenderSeries(roster) {
    const male = roster.filter((b) => String(b.gender || '').toLowerCase() === 'male').length;
    const female = roster.filter((b) => String(b.gender || '').toLowerCase() === 'female').length;
    const total = male + female || 1;
    return {
        labels: ['Male', 'Female'],
        values: [male, female],
        percent: (value) => Math.round((value / total) * 100)
    };
}

function buildBusinessSeries(roster) {
    const categories = ['Establishment', 'Buy & Sell', 'Homemade', 'Livestock', 'Services'];
    const counts = categories.map((label) => roster.filter((b) => String(b.businessType || b.business || '').toLowerCase() === label.toLowerCase()).length);
    const total = counts.reduce((sum, val) => sum + val, 0) || 1;
    return {
        labels: categories,
        values: counts,
        percent: (value) => Math.round((value / total) * 100)
    };
}

function buildSectorComparisonSeries(roster) {
    const labels = ['PWD', 'Senior Citizen', 'Indigenous People', 'Solo Parent'];
    const applicants = getApplicantPool();
    return {
        labels,
        applicants: labels.map((label) => countSectorByLabel(applicants, label)),
        beneficiaries: labels.map((label) => countSectorByLabel(roster, label))
    };
}

function destroyReportsCharts() {
    if (!Array.isArray(reportsCharts)) return;
    reportsCharts.forEach((chart) => { try { chart.destroy(); } catch {} });
    reportsCharts = [];
}

function exportReportsData() {
    const roster = getReportsFilteredBeneficiaries();
    const payload = {
        filters: { ...reportsFilters, sectors: Array.from(filterState.reports.sectors) },
        kpis: {
            compliance: getComplianceSummary(roster),
            training: getTrainingSummary(roster),
            repayment: getRepaymentSummary(roster),
            totalBeneficiaries: roster.length
        },
        charts: {
            repayment: buildRepaymentRateSeries(roster),
            gender: buildGenderSeries(roster),
            business: buildBusinessSeries(roster),
            sector: buildSectorComparisonSeries(roster)
        },
        beneficiaries: roster
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reports_export.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
/* REPORTS & ANALYTICS REDESIGN END */
function toDateInput(date) {
    return date.toISOString().slice(0, 10);
}

function aggregateCounts(list, key) {
    return list.reduce((acc, item) => {
        acc[item[key]] = (acc[item[key]] || 0) + 1;
        return acc;
    }, {});
}

function fromCounts(counts) {
    return Object.entries(counts).map(([label, value]) => ({ label, value, variant: 'primary' }));
}

function countBy(list, status) {
    return list.filter((item) => item.status === status).length;
}

function formatCurrency(value) {
    const number = Number(value) || 0;
    if (typeof pesoFormatter !== 'undefined') {
        return pesoFormatter.format(number);
    }
    return `PHP ${number}`;
}
function percent(part, total) {
    if (!total) return '0%';
    return `${Math.round((part / total) * 100)}%`;
}


















































































































































































