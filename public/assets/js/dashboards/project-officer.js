(function () {
  // Authenticated staff identity used to gate access to the PDO-only dashboard.
  const authUser = window.SMARTLEAP_AUTH_USER || null;
  // Server-rendered bootstrap payload for the first scoped dashboard and repayment paint.
  const initialData = window.SMARTLEAP_PO_INITIAL && typeof window.SMARTLEAP_PO_INITIAL === 'object' ? window.SMARTLEAP_PO_INITIAL : {};
  const initialOverview = initialData.overview && typeof initialData.overview === 'object' ? initialData.overview : {};
  const initialRepaymentData = initialData.repaymentData && typeof initialData.repaymentData === 'object' ? initialData.repaymentData : {};
  const baseUrl = String(window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');
  // Training status vocabulary used by the PDO training pipeline views.
  const trainingStatuses = ['Not Scheduled', 'Scheduled', 'Notified', 'Attended', 'Excused', 'Missed'];
  const livelihoodCategories = ['Establishment', 'Buy and Sell', 'Homemade', 'Livestock', 'Services'];
  const TOTAL_REPAYMENT_MONTHS = 24;
  const TOTAL_REPAYMENT_AMOUNT = 625 * TOTAL_REPAYMENT_MONTHS;
  // Color maps keep dashboard charts and status chips consistent with workflow meaning.
  const APPLICATION_STATUS_COLORS = {
    draft: '#cbd5e1',
    submitted: '#f2994a',
    under_review: '#31d0c6',
    checked_by_pdo: '#3e78ff',
    requirements_verified: '#2d8cff',
    for_assessment: '#7c3aed',
    approved: '#16a34a',
    approved_for_training: '#0ea5e9',
    training_ongoing: '#8b5cf6',
    completed: '#059669',
    needs_documents: '#f59e0b',
    needs_correction: '#ef8f34',
    rejected: '#dc2626',
    flagged: '#be123c',
  };
  const BENEFICIARY_STATUS_COLORS = {
    active: '#16a34a',
    inactive: '#f59e0b',
    deceased: '#dc2626',
    application_workspace: '#3e78ff',
    pending: '#7c3aed',
  };
  const REPAYMENT_STATUS_COLORS = {
    no_upload_yet: '#cfdcf0',
    under_review: '#3e78ff',
    needs_correction: '#f2994a',
    rejected: '#ef4444',
    partial_paid: '#31d0c6',
    fully_paid: '#8c61ff',
  };
  const TRAINING_ATTENDANCE_COLORS = {
    attended: '#16a34a',
    absent: '#ef4444',
    excused: '#8b5cf6',
    pending: '#f59e0b',
  };
  const FALLBACK_CHART_COLORS = ['#1d4ed8', '#16a34a', '#f97316', '#7c3aed', '#dc2626', '#0891b2', '#be185d', '#4d7c0f'];
  const today = new Date();
  const currentReportMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const currentReportYear = String(today.getFullYear());
  const formatReportCurrencyLabel = (value) => {
    const amount = safeNumber(value);
    if (!Number.isFinite(amount) || amount === 0) return '\u20b10';
    if (Math.abs(amount) >= 100000) {
      return `\u20b1${amount.toLocaleString('en-PH', { notation: 'compact', maximumFractionDigits: 2 }).replace(/\s+/g, '')}`;
    }
    return `\u20b1${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };
  const buildRepaymentCycleMonths = (yearValue) => {
    const baseYear = Number.parseInt(yearValue, 10) || Number.parseInt(currentReportYear, 10);
    return Array.from({ length: 12 }, (_, index) => `${baseYear}-${String(index + 1).padStart(2, '0')}`);
  };
  const defaultCycleMonth = (() => {
    const cycleMonths = buildRepaymentCycleMonths(currentReportYear);
    return cycleMonths.includes(currentReportMonth) ? currentReportMonth : cycleMonths[0];
  })();
  const deriveRepaymentQuarter = (monthValue) => {
    const [, monthPart] = String(monthValue || '').split('-');
    const monthNumber = Number.parseInt(monthPart, 10);
    if (!monthNumber) return '1';
    return String(Math.floor((monthNumber - 1) / 3) + 1);
  };
  const niceAxisStep = (rawMax) => {
    const safeMax = Math.max(safeNumber(rawMax), 1);
    const roughStep = safeMax / 5;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep || 1));
    const normalized = roughStep / magnitude;
    let niceNormalized = 1;
    if (normalized <= 1) niceNormalized = 1;
    else if (normalized <= 2) niceNormalized = 2;
    else if (normalized <= 2.5) niceNormalized = 2.5;
    else if (normalized <= 5) niceNormalized = 5;
    else niceNormalized = 10;
    return niceNormalized * magnitude;
  };
  const sectionTitles = {
    clients: 'Dashboard',
    applications: 'Application Review',
    training: 'Training Pipeline',
    repayments: 'Repayment Checking',
    beneficiaries: 'Beneficiaries',
    reports: 'Reports',
  };
  // Shared client state for scoped applications, beneficiaries, repayments, reports, and training subviews.
  const state = { applications: Array.isArray(initialOverview.applications) ? initialOverview.applications : [], roster: Array.isArray(initialOverview.roster) ? initialOverview.roster : [], summary: initialOverview.summary || {}, scopeBarangays: Array.isArray(initialOverview.scopeBarangays) ? initialOverview.scopeBarangays : [], beneficiarySummary: initialOverview.beneficiarySummary || {}, beneficiaryRoster: Array.isArray(initialOverview.beneficiaryRoster) ? initialOverview.beneficiaryRoster : [], repaymentRecords: Array.isArray(initialRepaymentData.payments) ? initialRepaymentData.payments : [], dashboardLoaded: false, activeApplication: null, activePreviewToken: '', activePreviewOwnerId: null, activeBeneficiaryId: null, beneficiaryFilters: { search: '', barangay: '', repayment: '', status: '', batch: '' }, reportsInitialized: false, reports: { period: 'monthly', month: defaultCycleMonth, quarter: deriveRepaymentQuarter(defaultCycleMonth), year: currentReportYear, repaymentYear: '1', from: '', to: '', search: '', barangay: '', pdo: '', serviceType: '', gender: '', repayment: '', refreshTimer: null, refreshing: false, liveRequestId: 0 }, searchTimers: {}, returnToApplicationModal: false, assistanceReceivedSelection: false, repayments: { workspace: null, syncObserver: null, syncingDetail: false, modal: null, syncTimer: null }, training: { view: 'overview', subview: 'attendance', programs: [], summary: {}, eligibleInvitees: [], seminarForms: [], selectedProgramId: null, activeProgram: null, lastUpdatedInviteeId: null, lastNotifiedInviteeId: null, savingProgram: false, syncingInvitees: false, sendingProgramNotice: '', removingProgramId: null, confirmRemoveProgramId: null, busyInvitees: {}, rosterSearch: '', rosterFilter: '', assignmentSearch: '', assignmentFilter: '', assignedSearch: '', assignedFilter: '', noticeSelection: [], noticeFilters: { search: '', status: '' }, noticeWarning: '', attendanceEditorId: null, attendanceDrafts: {}, sessionFilter: '', groupFilter: '', activityFilter: '', overviewStatusFilter: '' } };
  const routeUrl = (path) => `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;
  const absoluteRouteUrl = (path) => new URL(routeUrl(path), window.location.origin).toString();

  function formatBatchNo(value) {
    const text = String(value || '').trim();
    if (!text) return 'Batch 1';
    return /^\d+$/.test(text) ? `Batch ${text}` : text;
  }

  document.addEventListener('DOMContentLoaded', init);

  // Guard access, bootstrap shared modal systems, and load the first dashboard and training payloads.
  function init() {
    if (!authUser || !String(authUser.role || '').toLowerCase().includes('project')) {
      window.location.href = `${baseUrl}/login`;
      return;
    }
    bind();
    initApplicationModalStack();
    initRepaymentWorkspace();
    showSection(new URLSearchParams(window.location.search).get('section') || 'clients');
    loadDashboard();
    loadTraining();
  }

  // Register all PDO workspace controls: section navigation, reports filters, training tools, and scoped tables.
  function bind() {
    document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => { showSection(button.dataset.section || 'clients'); closeSidebar(); }));
    document.querySelector('[data-sidebar-close]')?.addEventListener('click', closeSidebar);
    document.getElementById('po-refresh')?.addEventListener('click', async () => { await loadDashboard(); await loadTraining(); });
    document.getElementById('po-training-add-session')?.addEventListener('click', openNewTrainingSession);
    document.getElementById('po-training-back')?.addEventListener('click', () => switchTrainingView('overview'));
    const poAppSearch = document.getElementById('po-app-search');
    const poAppSearchClear = document.getElementById('po-app-search-clear');
    const updatePoAppSearchClear = () => {
      if (poAppSearchClear) poAppSearchClear.style.display = poAppSearch?.value ? 'inline-flex' : 'none';
    };
    poAppSearch?.addEventListener('input', () => {
      updatePoAppSearchClear();
      debounceRender('application-search', renderApplicationsTable);
    });
    poAppSearch?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && poAppSearch.value) {
        poAppSearch.value = '';
        updatePoAppSearchClear();
        renderApplicationsTable();
      }
    });
    poAppSearchClear?.addEventListener('click', () => {
      if (poAppSearch) poAppSearch.value = '';
      updatePoAppSearchClear();
      renderApplicationsTable();
      poAppSearch?.focus();
    });

    document.getElementById('po-app-filter')?.addEventListener('change', renderApplicationsTable);
    document.getElementById('po-app-livelihood-filter')?.addEventListener('change', renderApplicationsTable);
    document.getElementById('po-app-batch-filter')?.addEventListener('change', renderApplicationsTable);

    const poBenSearch = document.getElementById('poBeneficiarySearch');
    const poBenSearchClear = document.getElementById('poBeneficiarySearchClear');
    const updatePoBenSearchClear = () => {
      if (poBenSearchClear) {
        poBenSearchClear.style.display = poBenSearch?.value ? 'inline-flex' : 'none';
        poBenSearchClear.classList.toggle('is-visible', !!poBenSearch?.value);
      }
    };
    poBenSearch?.addEventListener('input', (event) => {
      state.beneficiaryFilters.search = String(event.target.value || '');
      updatePoBenSearchClear();
      debounceRender('beneficiary-search', renderBeneficiariesTable);
    });
    poBenSearch?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && poBenSearch.value) {
        poBenSearch.value = '';
        state.beneficiaryFilters.search = '';
        updatePoBenSearchClear();
        renderBeneficiariesTable();
      }
    });
    poBenSearchClear?.addEventListener('click', () => {
      if (poBenSearch) poBenSearch.value = '';
      state.beneficiaryFilters.search = '';
      updatePoBenSearchClear();
      renderBeneficiariesTable();
      poBenSearch?.focus();
    });

    const poRepaySearch = document.getElementById('po-repayment-search');
    const poRepaySearchClear = document.getElementById('po-repayment-search-clear');
    const updatePoRepaySearchClear = () => {
      if (poRepaySearchClear) poRepaySearchClear.style.display = poRepaySearch?.value ? 'inline-flex' : 'none';
    };
    poRepaySearch?.addEventListener('input', () => {
      updatePoRepaySearchClear();
    });
    poRepaySearch?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && poRepaySearch.value) {
        poRepaySearch.value = '';
        updatePoRepaySearchClear();
        poRepaySearch.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    poRepaySearchClear?.addEventListener('click', () => {
      if (poRepaySearch) {
        poRepaySearch.value = '';
        updatePoRepaySearchClear();
        poRepaySearch.dispatchEvent(new Event('input', { bubbles: true }));
        poRepaySearch.focus();
      }
    });
    document.getElementById('poBeneficiaryBarangayFilter')?.addEventListener('change', (event) => {
      state.beneficiaryFilters.barangay = String(event.target.value || '');
      renderBeneficiariesTable();
    });
    document.getElementById('poBeneficiaryRepaymentFilter')?.addEventListener('change', (event) => {
      state.beneficiaryFilters.repayment = String(event.target.value || '');
      renderBeneficiariesTable();
    });
    document.getElementById('poBeneficiaryStatusFilter')?.addEventListener('change', (event) => {
      state.beneficiaryFilters.status = String(event.target.value || '');
      renderBeneficiariesTable();
    });
    document.getElementById('poBeneficiaryBatchFilter')?.addEventListener('change', (event) => {
      state.beneficiaryFilters.batch = String(event.target.value || '');
      renderBeneficiariesTable();
    });
    ['poReportsPeriod', 'poReportsMonth', 'poReportsQuarter', 'poReportsYear', 'poReportsRepaymentYear', 'poReportsFrom', 'poReportsTo', 'poReportsServiceType', 'poReportsGender'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', handleReportFilterChange);
    });
    document.getElementById('poReportsSearch')?.addEventListener('input', handleReportFilterChange);
    document.getElementById('poReportsRefresh')?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); refreshReportsRealtime(); });
    document.getElementById('reports-section')?.addEventListener('input', handleReportsSectionEvent);
    document.getElementById('reports-section')?.addEventListener('change', handleReportsSectionEvent);
    document.getElementById('reports-section')?.addEventListener('click', handleReportsSectionEvent);
    initStaffAccountMenu('poAccountMenuTrigger', 'poAccountMenuPanel', 'poAccountProfile', 'poAccountPassword', 'Project Officer');
    document.getElementById('po-logout')?.addEventListener('click', handleLogout);
    document.querySelector('#po-app-table tbody')?.addEventListener('click', handleApplicationClick);
    document.getElementById('clients-section')?.addEventListener('click', handleOverviewClick);
    document.getElementById('beneficiaries-section')?.addEventListener('click', handleBeneficiarySectionClick);
    document.getElementById('repayments-section')?.addEventListener('click', handleRepaymentSectionClick);
    document.getElementById('poBeneficiaryModal')?.addEventListener('click', (event) => {
      const assistanceButton = event.target.closest('[data-po-beneficiary-assistance-record]');
      if (assistanceButton) {
        recordBeneficiaryAssistanceReceived(Number(assistanceButton.dataset.poBeneficiaryAssistanceRecord || 0));
        return;
      }
      const sendCoMakerButton = event.target.closest('[data-po-send-co-maker-email]');
      if (sendCoMakerButton) {
        sendCoMakerRegistrationEmail(sendCoMakerButton);
        return;
      }
      if (event.target.closest('[data-po-beneficiary-modal-close]')) {
        closeBeneficiaryModal();
      }
    });
    document.getElementById('poApplicationModal')?.addEventListener('click', handleReviewClick);
    document.getElementById('poApplicationModal')?.addEventListener('change', handleReviewChange);
    document.getElementById('po-app-modal-livelihood-category-input')?.addEventListener('change', handleLivelihoodCategoryChange);
    document.getElementById('po-app-modal-approve')?.addEventListener('click', openApprovalSummary);
    document.getElementById('po-app-modal-assisted')?.addEventListener('change', () => {
      state.assistanceReceivedSelection = !!document.getElementById('po-app-modal-assisted')?.checked;
      renderAssistanceStatus(state.activeApplication);
      setText('po-app-assistance-proof-status', assistanceProofStatusLabel(assistanceProofTaskFor(state.activeApplication), state.activeApplication));
      renderRequirementNavigator();
      renderPreviewPanel();
      renderRequirementInspector();
      updateFinalApprovalDecisionState(state.activeApplication);
    });
    document.getElementById('po-app-assisted-record')?.addEventListener('click', recordAssistanceReceivedNow);
    document.getElementById('po-summary-back')?.addEventListener('click', () => { state.returnToApplicationModal = true; });
    document.getElementById('po-summary-confirm')?.addEventListener('click', async () => {
      state.returnToApplicationModal = false;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('poApprovalSummaryModal')).hide();
      await submitApplicationDecision('approve');
    });
    document.getElementById('training-section')?.addEventListener('click', handleTrainingClick);
    document.getElementById('training-section')?.addEventListener('submit', handleTrainingSubmit);
    document.getElementById('training-section')?.addEventListener('input', handleTrainingInput);
    document.getElementById('training-section')?.addEventListener('change', handleTrainingInput);
    document.getElementById('poAttendanceModalClose')?.addEventListener('click', closeAttendanceModal);
    document.getElementById('poAttendanceModalBackdrop')?.addEventListener('click', closeAttendanceModal);
    document.getElementById('poAttendanceModal')?.addEventListener('click', handleAttendanceModalClick);
    document.getElementById('poAttendanceModal')?.addEventListener('input', handleAttendanceModalInput);
    document.getElementById('poAttendanceModal')?.addEventListener('change', handleAttendanceModalInput);
  }

  function initApplicationModalStack() {
    const applicationModal = document.getElementById('poApplicationModal');
    const summaryModal = document.getElementById('poApprovalSummaryModal');
    if (applicationModal) {
      applicationModal.addEventListener('show.bs.modal', () => document.body.classList.add('po-application-modal-open'));
      applicationModal.addEventListener('hidden.bs.modal', () => document.body.classList.remove('po-application-modal-open'));
    }
    if (summaryModal) {
      summaryModal.addEventListener('show.bs.modal', () => document.body.classList.add('po-summary-modal-open'));
      summaryModal.addEventListener('hidden.bs.modal', () => {
        document.body.classList.remove('po-summary-modal-open');
        if (state.returnToApplicationModal && state.activeApplication) {
          state.returnToApplicationModal = false;
          bootstrap.Modal.getOrCreateInstance(applicationModal).show();
        }
      });
    }
  }

  function closeSidebar() {
    const shell = document.getElementById('mainSystem');
    if (shell) shell.dataset.sidebarOpen = 'false';
  }

  function initStaffAccountMenu(triggerId, panelId, profileId, passwordId, roleLabel) {
    const trigger = document.getElementById(triggerId);
    const panel = document.getElementById(panelId);
    const profileButton = document.getElementById(profileId);
    const passwordButton = document.getElementById(passwordId);
    if (!trigger || !panel) return;

    const setExpanded = (expanded) => {
      trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      panel.hidden = !expanded;
    };
    const closeMenu = () => setExpanded(false);

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setExpanded(trigger.getAttribute('aria-expanded') !== 'true');
    });
    profileButton?.addEventListener('click', () => {
      closeMenu();
      openStaffProfileModal(roleLabel);
    });
    passwordButton?.addEventListener('click', () => {
      closeMenu();
      openStaffPasswordModal(roleLabel);
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.staff-account-menu')) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
        closeStaffProfile();
      }
    });
  }

  async function getSelfStaffProfile() {
    const response = await apiGet('api/team/self');
    if (!response.ok) {
      throw new Error(response.message || 'Unable to load your profile.');
    }
    return response.staff || null;
  }

  function splitNameParts(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts.shift() || '',
      middleName: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
      lastName: parts.length ? parts[parts.length - 1] : '',
    };
  }

  async function copyTextToClipboard(value) {
    const text = String(value || '');
    if (!text) return false;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Fall back to the legacy copy path below.
      }
    }

    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', 'readonly');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.focus();
    input.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }

    document.body.removeChild(input);
    return copied;
  }

  function composeFullName(parts = {}) {
    return [parts.firstName, parts.middleName, parts.lastName]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ');
  }

  function staffProfileMarkup({ roleLabel, staff, saving = false, error = '' }) {
    const nameParts = splitNameParts(staff?.name || authUser?.name || '');
    const avatarMarkup = staff?.photo
      ? `<div class="admin-profile-modal__avatar admin-record-sheet__avatar has-photo" style="background-image:url('${escapeHtml(staff.photo)}')" aria-hidden="true"></div>`
      : `<div class="admin-profile-modal__avatar admin-record-sheet__avatar" aria-hidden="true">${escapeHtml(getInitials(staff?.name || authUser?.name || roleLabel))}</div>`;
    return `
      <div class="modal-overlay" data-staff-profile-modal>
        <div class="modal-card admin-profile-modal" role="dialog" aria-modal="true" aria-labelledby="staffProfileTitle">
          <div class="modal-header">
            <div class="po-modal-title-block">
              <h2 class="modal-title" id="staffProfileTitle">Profile</h2>
            </div>
            <button type="button" class="modal-close" data-staff-profile-close aria-label="Close profile modal">&times;</button>
          </div>
          <form id="staffSelfProfileForm" class="modal-body admin-profile-modal__form">
            <section class="admin-record-sheet admin-record-sheet--account">
              <div class="admin-record-sheet__hero">
                <div class="admin-record-sheet__avatar-wrap">
                  ${avatarMarkup}
                  <label class="admin-profile-photo-action">
                    <input type="file" id="poProfilePhotoInput" accept=".jpg,.jpeg,.png" hidden ${saving ? 'disabled' : ''}>
                    <span class="app-btn-outline">${saving ? 'Uploading...' : 'Change Photo'}</span>
                  </label>
                </div>
                <div class="admin-record-sheet__identity">
                  <span class="admin-record-sheet__eyebrow">User Profile</span>
                  <h3>${escapeHtml(staff?.name || authUser?.name || roleLabel)}</h3>
                  <p>${escapeHtml(roleLabel)}</p>
                </div>
              </div>
              ${error ? `<div class="notice danger admin-profile-modal__notice">${escapeHtml(error)}</div>` : ''}
              <section class="admin-record-sheet__section admin-record-sheet__section--violet">
                <div class="admin-record-sheet__section-head"><span>User Information</span></div>
                <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
                  <label class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">First Name</span>
                    <input class="admin-profile-modal__input" type="text" name="firstName" value="${escapeHtml(nameParts.firstName)}" required>
                  </label>
                  <label class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">Middle Name</span>
                    <input class="admin-profile-modal__input" type="text" name="middleName" value="${escapeHtml(nameParts.middleName)}">
                  </label>
                  <label class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">Last Name</span>
                    <input class="admin-profile-modal__input" type="text" name="lastName" value="${escapeHtml(nameParts.lastName)}" required>
                  </label>
                  <article class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">Role</span>
                    <span class="admin-profile-modal__value">${escapeHtml(roleLabel)}</span>
                  </article>
                </div>
              </section>
              <section class="admin-record-sheet__section admin-record-sheet__section--aqua">
                <div class="admin-record-sheet__section-head"><span>Contact Information</span></div>
                <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
                  <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                    <span class="admin-profile-modal__label">Email Address</span>
                    <input class="admin-profile-modal__input" type="email" name="email" value="${escapeHtml(staff?.email || authUser?.email || '')}" required readonly>
                  </label>
                  <label class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">Contact Number</span>
                    <input class="admin-profile-modal__input" type="text" name="contactNumber" value="${escapeHtml(staff?.contactNumber || '')}">
                  </label>
                </div>
              </section>
            </section>
          </form>
          <div class="modal-footer">
            <button type="button" class="app-btn-outline" data-staff-profile-close>Back</button>
            <button type="submit" form="staffSelfProfileForm" class="app-btn-primary"${saving ? ' disabled' : ''}>${saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    `;
  }

  async function openStaffProfileModal(roleLabel) {
    closeStaffProfile();
    let staff = null;
    let saving = false;
    let photoBusy = false;
    let error = '';

    try {
      staff = await getSelfStaffProfile();
    } catch (loadError) {
      showToast(loadError.message || 'Unable to load your profile.', 'warning');
      return;
    }

    const render = () => {
      closeStaffProfile();
      const modal = document.createElement('div');
      modal.innerHTML = staffProfileMarkup({ roleLabel, staff, saving: saving || photoBusy, error });
      const overlay = modal.firstElementChild;
      if (!overlay) return;
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay || event.target.closest('[data-staff-profile-close]')) closeStaffProfile();
      });
      overlay.querySelector('#poProfilePhotoInput')?.addEventListener('change', async (event) => {
        const input = event.currentTarget;
        const file = input?.files?.[0];
        if (!file || photoBusy) return;
        if (file.size > 5 * 1024 * 1024) {
          input.value = '';
          return showToast('Profile photo must be 5 MB or less.', 'warning');
        }

        photoBusy = true;
        render();
        const reader = new FileReader();
        reader.onerror = () => {
          photoBusy = false;
          input.value = '';
          showToast('Unable to read the selected photo.', 'warning');
          render();
        };
        reader.onload = async () => {
          const response = await fetch(routeUrl('account/profile-photo'), {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json;charset=UTF-8',
            },
            credentials: 'same-origin',
            body: JSON.stringify({ photoDataUrl: String(reader.result || '') }),
          }).then(parseJson).catch(() => ({ ok: false, message: 'Unable to reach the server right now.' }));

          photoBusy = false;
          input.value = '';
          if (!response.ok) {
            showToast(response.message || 'Unable to save the profile photo.', 'warning');
            return render();
          }

          staff = { ...(staff || {}), ...(response.data?.user || {}), photo: response.data?.user?.photo || staff?.photo || null };
          if (authUser) {
            authUser.photo = staff.photo || authUser.photo || null;
          }
          showToast(response.message || 'Profile photo updated.', 'success');
          render();
        };
        reader.readAsDataURL(file);
      });
      overlay.querySelector('#staffSelfProfileForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (saving || photoBusy) return;
        const form = event.currentTarget;
        const formData = new FormData(form);
        const payload = {
          firstName: formData.get('firstName') || '',
          middleName: formData.get('middleName') || '',
          lastName: formData.get('lastName') || '',
          email: formData.get('email') || '',
          contactNumber: formData.get('contactNumber') || '',
        };
        saving = true;
        error = '';
        render();
        const response = await apiPost('api/team/self', payload);
        saving = false;
        if (!response.ok) {
          error = firstError(response.errors) || response.message || 'Unable to save your profile.';
          return render();
        }
        staff = response.staff || { ...staff, ...payload, name: composeFullName(payload) };
        if (authUser) {
          authUser.name = staff.name || composeFullName(payload);
          authUser.email = staff.email || payload.email;
        }
        showToast(response.message || 'Profile updated.', 'success');
        render();
      });
      document.body.appendChild(overlay);
    };

    render();
  }

  function openStaffPasswordModal(roleLabel) {
    closeStaffProfile();
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div class="modal-overlay" data-staff-profile-modal>
        <div class="modal-card admin-profile-modal" role="dialog" aria-modal="true" aria-labelledby="staffPasswordTitle">
          <div class="modal-header">
            <div class="po-modal-title-block">
              <h2 class="modal-title" id="staffPasswordTitle">Change Password</h2>
            </div>
            <button type="button" class="modal-close" data-staff-profile-close aria-label="Close password modal">&times;</button>
          </div>
          <form id="staffPasswordForm" class="modal-body admin-profile-modal__form">
            <section class="admin-record-sheet admin-record-sheet--account">
              <section class="admin-record-sheet__section admin-record-sheet__section--amber">
                <div class="admin-record-sheet__section-head"><span>${escapeHtml(roleLabel)}</span></div>
                <div class="admin-record-sheet__grid">
                  <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                    <span class="admin-profile-modal__label">Current Password</span>
                    <div class="password-input-wrap">
                      <input class="admin-profile-modal__input" type="password" name="currentPassword" required autofocus>
                      <button type="button" class="password-toggle-btn" aria-label="Toggle password visibility" tabindex="-1">
                        <svg class="eye-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm0-8c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"/></svg>
                      </button>
                    </div>
                  </label>
                  <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                    <span class="admin-profile-modal__label">New Password</span>
                    <div class="password-input-wrap">
                      <input class="admin-profile-modal__input" type="password" name="newPassword" required minlength="8">
                      <button type="button" class="password-toggle-btn" aria-label="Toggle password visibility" tabindex="-1">
                        <svg class="eye-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm0-8c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"/></svg>
                      </button>
                    </div>
                    <div class="password-strength" hidden>
                      <div class="password-strength__bar"><div class="password-strength__fill"></div></div>
                      <div class="password-strength__hints"></div>
                    </div>
                  </label>
                  <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                    <span class="admin-profile-modal__label">Confirm New Password</span>
                    <div class="password-input-wrap">
                      <input class="admin-profile-modal__input" type="password" name="confirmPassword" required minlength="8">
                      <button type="button" class="password-toggle-btn" aria-label="Toggle password visibility" tabindex="-1">
                        <svg class="eye-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm0-8c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"/></svg>
                      </button>
                    </div>
                    <div class="password-match-feedback" hidden></div>
                  </label>
                  <div class="notice danger admin-profile-modal__notice" id="staffPasswordError" hidden></div>
                </div>
              </section>
            </section>
          </form>
          <div class="modal-footer">
            <button type="button" class="app-btn-outline" data-staff-profile-close>Back</button>
            <button type="submit" form="staffPasswordForm" class="app-btn-primary">Save Password</button>
          </div>
        </div>
      </div>
    `;
    const overlay = modal.firstElementChild;
    if (!overlay) return;

    wirePasswordToggleStaff(overlay);
    wirePasswordStrengthStaff(overlay, 'input[name="newPassword"]');
    wirePasswordMatchStaff(overlay, 'input[name="newPassword"]', 'input[name="confirmPassword"]');

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-staff-profile-close]')) closeStaffProfile();
    });
    overlay.querySelector('#staffPasswordForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const errorNode = overlay.querySelector('#staffPasswordError');
      const submitButton = overlay.querySelector('[form="staffPasswordForm"]');
      submitButton.disabled = true;
      if (errorNode) {
        errorNode.hidden = true;
        errorNode.textContent = '';
      }
      const body = new URLSearchParams();
      body.set('currentPassword', String(form.currentPassword?.value || ''));
      body.set('newPassword', String(form.newPassword?.value || ''));
      body.set('confirmPassword', String(form.confirmPassword?.value || ''));
      try {
        const response = await fetch(routeUrl('account/change-password'), {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
          credentials: 'same-origin',
          body: body.toString(),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || 'Unable to change password.');
        }
        showToast(payload.message || 'Password updated.', 'success');
        closeStaffProfile();
      } catch (requestError) {
        if (errorNode) {
          errorNode.hidden = false;
          errorNode.textContent = requestError.message || 'Unable to change password.';
        }
      } finally {
        submitButton.disabled = false;
      }
    });
    document.body.appendChild(overlay);
  }

  function wirePasswordToggleStaff(root) {
    root.querySelectorAll('.password-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.password-input-wrap');
        const input = wrap?.querySelector('input');
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.classList.toggle('is-visible', isPassword);
      });
    });
  }

  function wirePasswordStrengthStaff(root, inputSelector) {
    const input = root.querySelector(inputSelector);
    if (!input) return;
    const strengthEl = root.querySelector('.password-strength');
    const fillEl = root.querySelector('.password-strength__fill');
    const hintsEl = root.querySelector('.password-strength__hints');
    if (!strengthEl || !fillEl) return;

    input.addEventListener('input', () => {
      const val = input.value;
      if (!val) { strengthEl.hidden = true; return; }
      strengthEl.hidden = false;

      let score = 0;
      const hints = [];
      if (val.length >= 8) { score += 25; } else { hints.push('At least 8 characters'); }
      if (/[a-z]/.test(val) && /[A-Z]/.test(val)) { score += 25; } else { hints.push('Uppercase & lowercase'); }
      if (/\d/.test(val)) { score += 25; } else { hints.push('At least one number'); }
      if (/[^a-zA-Z0-9]/.test(val)) { score += 25; } else { hints.push('At least one symbol'); }

      let level = 'weak';
      if (score >= 100) level = 'strong';
      else if (score >= 75) level = 'medium';
      else if (score >= 50) level = 'fair';

      fillEl.className = 'password-strength__fill';
      fillEl.classList.add(`strength--${level}`);

      if (hintsEl) {
        hintsEl.innerHTML = hints.map((h) => `<span class="strength-hint">${h}</span>`).join('');
      }
    });
  }

  function wirePasswordMatchStaff(root, pwSelector, confirmSelector) {
    const pw = root.querySelector(pwSelector);
    const confirm = root.querySelector(confirmSelector);
    if (!pw || !confirm) return;
    const feedbackEl = root.querySelector('.password-match-feedback');
    if (!feedbackEl) return;

    const check = () => {
      if (!confirm.value) { feedbackEl.hidden = true; return; }
      feedbackEl.hidden = false;
      if (pw.value === confirm.value) {
        feedbackEl.textContent = 'Passwords match';
        feedbackEl.className = 'password-match-feedback match--ok';
      } else {
        feedbackEl.textContent = 'Passwords do not match';
        feedbackEl.className = 'password-match-feedback match--error';
      }
    };

    pw.addEventListener('input', check);
    confirm.addEventListener('input', check);
  }

  function closeStaffProfile() {
    document.querySelector('[data-staff-profile-modal]')?.remove();
  }

  function getInitials(name) {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'PO';
  }

  // Switch the visible PDO workspace and trigger any section-specific refresh or rendering work.
  function showSection(section) {
    const allowedSections = new Set(['clients', 'applications', 'training', 'repayments', 'beneficiaries', 'reports']);
    const nextSection = allowedSections.has(section) ? section : 'clients';
    if (nextSection === 'training') switchTrainingView('overview');
    document.querySelectorAll('[data-section]').forEach((button) => button.classList.toggle('active', button.dataset.section === nextSection));
    setText('poHeaderTitle', sectionTitles[nextSection] || 'Dashboard');
    document.querySelectorAll('[data-role-section]').forEach((panel) => { panel.style.display = panel.id === `${nextSection}-section` ? 'block' : 'none'; });
    if (nextSection === 'repayments') {
      renderRepaymentRosterDirect();
      state.repayments.workspace?.syncBeneficiaries?.();
      state.repayments.workspace?.refresh?.();
    }
    if (nextSection === 'reports') {
      initReports();
      if (document.getElementById('poReportsPeriod')) {
        syncReportsFilterControls();
        fetchPoReportData();
        startReportsRealtimeRefresh();
      } else {
        stopReportsRealtimeRefresh();
      }
    } else {
      stopReportsRealtimeRefresh();
    }
    const url = new URL(window.location.href);
    url.searchParams.set('section', nextSection);
    window.history.replaceState({}, '', url.toString());
  }

  async function apiGet(path, params = {}) {
    const query = new URLSearchParams(params);
    const url = query.toString() ? `${routeUrl(path)}?${query}` : routeUrl(path);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  }

  async function apiPost(path, payload) {
    const body = new URLSearchParams();
    Object.entries(payload || {}).forEach(([key, value]) => Array.isArray(value) ? value.forEach((item) => body.append(`${key}[]`, item)) : body.append(key, value ?? ''));
    try {
      const response = await fetch(routeUrl(path), { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, credentials: 'same-origin', body: body.toString() });
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  }

  async function apiFormPost(path, formData) {
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
  }

  async function apiJsonPost(path, payload) {
    try {
      const response = await fetch(routeUrl(path), { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json;charset=UTF-8' }, credentials: 'same-origin', body: JSON.stringify(payload || {}) });
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  }

  async function apiFormPost(path, formData) {
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
  }

  async function parseJson(response) {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) return { ok: false, message: response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unexpected server response.' };
    return response.json();
  }

  async function loadDashboard() {
    const [response, repaymentResponse] = await Promise.all([
      apiGet('api/applications/dashboard'),
      apiGet('api/repayments'),
    ]);
    state.repaymentRecords = Array.isArray(repaymentResponse?.data?.payments) ? repaymentResponse.data.payments : [];
    if (!response.ok) {
      renderLoadError(response.message || 'Unable to load the project officer dashboard.');
      if (document.getElementById('reports-section')?.style.display !== 'none') {
        fetchPoReportData();
      }
      state.repayments.workspace?.refresh?.();
      return;
    }
    state.applications = response.data?.applications || [];
    state.roster = response.data?.roster || [];
    state.summary = response.data?.summary || {};
    state.beneficiarySummary = response.data?.beneficiarySummary || {};
    state.beneficiaryRoster = Array.isArray(response.data?.beneficiaryRoster) ? response.data.beneficiaryRoster : [];
    state.trainingAttendanceSummary = response.data?.trainingAttendanceSummary || { segments: [], total: 0 };
    state.scopeBarangays = response.data?.scopeBarangays || [];
    state.dashboardLoaded = true;
    const scopeDistricts = Array.from(new Set(
      state.scopeBarangays
        .map((item) => String(item?.district || '').trim())
        .filter(Boolean)
    ));
    const scopeText = scopeDistricts.length
      ? scopeDistricts.join(', ')
      : (state.scopeBarangays.length ? 'Assigned district not set' : 'No assigned districts');
    setText('poSummaryClients', String(state.summary.applications || 0));
    setText('poHeaderBarangays', scopeText);
    setText('poHeaderScope', `${state.roster.length} scoped applicant${state.roster.length === 1 ? '' : 's'}`);
    renderOverviewSummary();
    renderApplicationsTable();
    renderBeneficiaryFilters();
    renderBeneficiariesTable();
    if (document.getElementById('reports-section')?.style.display !== 'none') {
      fetchPoReportData();
    }
    renderRepaymentRosterDirect();
    initRepaymentWorkspace();
    state.repayments.workspace?.syncBeneficiaries?.();
    state.repayments.workspace?.refresh?.();
  }

  function collectPoReportFiltersFromControls() {
    const selectedPeriod = reportControlValue('poReportsPeriod', state.reports.period || 'monthly') || 'monthly';
    state.reports.period = ['monthly', 'quarterly', 'yearly'].includes(selectedPeriod) ? selectedPeriod : 'monthly';
    state.reports.month = reportControlValue('poReportsMonth', state.reports.month || defaultCycleMonth) || defaultCycleMonth;
    state.reports.quarter = reportControlValue('poReportsQuarter', state.reports.quarter || '1') || '1';
    state.reports.year = reportControlValue('poReportsYear', state.reports.year || currentReportYear) || currentReportYear;
    state.reports.repaymentYear = reportControlValue('poReportsRepaymentYear', state.reports.repaymentYear || '1') || '1';
    state.reports.from = reportControlValue('poReportsFrom', state.reports.from || '');
    state.reports.to = reportControlValue('poReportsTo', state.reports.to || '');
    state.reports.search = reportControlValue('poReportsSearch', state.reports.search || '');
    state.reports.barangay = '';
    state.reports.pdo = '';
    state.reports.serviceType = reportControlValue('poReportsServiceType', state.reports.serviceType || '');
    state.reports.gender = reportControlValue('poReportsGender', state.reports.gender || '');
    state.reports.repayment = '';
    return {
      period: state.reports.period,
      month: state.reports.month,
      quarter: state.reports.quarter,
      year: state.reports.year,
      repaymentYear: state.reports.repaymentYear,
      from: state.reports.from,
      to: state.reports.to,
      barangay: state.reports.barangay,
      pdo: state.reports.pdo,
      serviceType: state.reports.serviceType,
      gender: state.reports.gender,
      repayment: state.reports.repayment,
    };
  }

  function optionListFromApi(values) {
    return Array.isArray(values) ? values.filter((value) => String(value || '').trim() !== '') : [];
  }

  function initReports() {
    const reports = window.App?.modules?.reports;
    if (!reports || typeof reports.init !== 'function') {
      return false;
    }
    if (state.reportsInitialized) {
      if (typeof reports.render === 'function') reports.render();
      return true;
    }
    state.reportsInitialized = true;
    reports.init();
    return true;
  }

  function populatePoReportOptionsFromApi(options = {}) {
    const fill = (id, values, selected, label) => {
      const node = document.getElementById(id);
      if (!node) return;
      const current = normalizeFilterValue(selected || node.value || '');
      node.innerHTML = `<option value="">${escapeHtml(label)}</option>${optionListFromApi(values).map((value) => {
        const optionValue = typeof value === 'object' && value !== null ? normalizeFilterValue(value.value) : normalizeFilterValue(value);
        const optionLabel = typeof value === 'object' && value !== null ? String(value.label ?? value.value ?? '') : String(value);
        return `<option value="${escapeHtml(optionValue)}"${optionValue === current ? ' selected' : ''}>${escapeHtml(optionLabel)}</option>`;
      }).join('')}`;
      node.value = current;
    };

    const cycleMonths = buildRepaymentCycleMonths(state.reports.year || currentReportYear, state.reports.repaymentYear || '1');
    fill('poReportsMonth', cycleMonths.map((value) => ({
      value,
      label: new Date(`${value}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
    })), state.reports.month, 'Select repayment month');
    fill('poReportsServiceType', options.serviceTypes, state.reports.serviceType, 'All service types');
    fill('poReportsGender', options.genders, state.reports.gender, 'All genders');
    fill('poReportsYear', options.years, state.reports.year, 'Select year');
    fill('poReportsRepaymentYear', [
      { value: '1', label: 'Year 1' },
      { value: '2', label: 'Year 2' },
    ], state.reports.repaymentYear, 'Select repayment cycle');
    const quarterOptions = Array.isArray(options.repaymentQuarters) && options.repaymentQuarters.length
      ? options.repaymentQuarters
          .filter((item) => String(item.year || '') === String(state.reports.year || currentReportYear))
          .map((item) => ({ value: String(item.quarter || ''), label: String(item.label || `Q${item.quarter || ''}`) }))
      : [
          { value: '1', label: 'Q1 (Jan - Mar)' },
          { value: '2', label: 'Q2 (Apr - Jun)' },
          { value: '3', label: 'Q3 (Jul - Sep)' },
          { value: '4', label: 'Q4 (Oct - Dec)' },
        ];
    fill('poReportsQuarter', quarterOptions.length ? quarterOptions : [
      { value: '1', label: 'Q1 (Jan - Mar)' },
      { value: '2', label: 'Q2 (Apr - Jun)' },
      { value: '3', label: 'Q3 (Jul - Sep)' },
      { value: '4', label: 'Q4 (Oct - Dec)' },
    ], state.reports.quarter, 'Select repayment quarter');
  }

  function renderPoReportsApiPayload(report) {
    if (!report || typeof report !== 'object') return;
    populatePoReportOptionsFromApi(report.options || {});
    syncReportsFilterControls();

    const records = Array.isArray(report.records) ? report.records : [];
    const search = normalizeFilterValue(state.reports.search);
    const visibleRecords = search
      ? records.filter((record) => [record.name, record.email, record.businessName, record.barangay, record.assignedPdo, record.serviceType, record.sector].some((value) => normalizeFilterValue(value).includes(search)))
      : records;
    const metrics = report.repaymentAnalytics?.periodMetrics || report.summary?.repaymentPerformance || {};
    const label = String(metrics.label || report.filters?.periodLabel || 'Selected period');
    const targetAmount = safeNumber(metrics.targetAmount);
    const actualCollectedAmount = safeNumber(metrics.actualCollectedAmount);
    const gapAmount = safeNumber(metrics.gapAmount);
    const roiPercent = safeNumber(metrics.roiPercent);
    const beneficiaryCount = safeNumber(metrics.scopedBeneficiaries ?? records.length);
    const obligationCount = safeNumber(metrics.obligationCount);
    // Use the server-computed summary directly — it runs through currentPopulationRecords()
    // and normalizeServiceType() so distributions are consistent with the full report data.
    // Client-side re-computation via buildPoReportSummary produces different buckets because
    // it skips the isCurrentPopulation filter and uses different service-type keyword matching.
    const summary = report.summary || {};

    setText('poReportsResultCount', `${visibleRecords.length} unique ${visibleRecords.length === 1 ? 'person' : 'people'} shown - ${label}`);
    setText('poReportsTargetAmount', formatPesoAmount(targetAmount));
    setText('poReportsActualCollected', formatPesoAmount(actualCollectedAmount));
    setText('poReportsGapAmount', formatPesoAmount(gapAmount));
    setText('poReportsRoiPercent', `${roiPercent.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`);
      setText('poReportsTargetMeta', label);
      setText('poReportsActualMeta', `${beneficiaryCount} scoped beneficiar${beneficiaryCount === 1 ? 'y' : 'ies'}`);
      setText('poReportsGapMeta', `${obligationCount} repayment month${obligationCount === 1 ? '' : 's'} covered`);

      renderPoReportsPerformanceChart(
        document.getElementById('poReportsPerformanceBars'),
      state.reports.period === 'monthly'
        ? (Array.isArray(report.repaymentAnalytics?.monthlyBreakdown) ? report.repaymentAnalytics.monthlyBreakdown : [])
        : (Array.isArray(report.repaymentAnalytics?.breakdown) ? report.repaymentAnalytics.breakdown : []),
      state.reports.period
    );
    renderPoReportsDistribution(document.getElementById('poReportsGenderDonut'), summary.genderDistribution, {
      label: 'Scoped gender distribution chart',
      centerLabel: 'Gender',
    });
    renderPoReportsDistribution(document.getElementById('poReportsServiceDonut'), summary.serviceTypeDistribution, {
      label: 'Scoped service type distribution chart',
      centerLabel: 'Services',
    });
    renderPoReportsDistribution(document.getElementById('poReportsSectorDonut'), summary.sectorDistribution, {
      label: 'Scoped sector distribution chart',
      centerLabel: 'Sectors',
    });
  }

  function buildPoReportSummary(records) {
    const safeRecords = Array.isArray(records) ? records : [];
    const normalizeServiceCategory = (value) => {
      const text = String(value || '').trim().toLowerCase();
      if (!text) return 'Unclassified';
      if (text.includes('buy') || text.includes('sell')) return 'Buy and Sell';
      if (text.includes('food') || text.includes('beverage') || text.includes('balut') || text.includes('snack') || text.includes('eatery') || text.includes('carinderia') || text.includes('restaurant')) return 'Homemade';
      if (text.includes('livestock') || text.includes('animal') || text.includes('poultry') || text.includes('hog')) return 'Livestock';
      if (text.includes('service') || text.includes('repair') || text.includes('salon')) return 'Services';
      if (text.includes('home') || text.includes('production') || text.includes('homemade') || text.includes('processing')) return 'Homemade';
      if (text.includes('establishment') || text.includes('store') || text.includes('shop')) return 'Establishment';
      return 'Establishment';
    };
    const countBy = (resolver) => {
      const map = new Map();
      safeRecords.forEach((record) => {
        const label = String(resolver(record) || 'Not Set').trim() || 'Not Set';
        map.set(label, (map.get(label) || 0) + 1);
      });
      return Array.from(map.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => Number(right.count || 0) - Number(left.count || 0) || String(left.label).localeCompare(String(right.label)));
    };

    return {
      totalPeople: safeRecords.length,
      beneficiaryCount: safeRecords.filter((record) => !!record.isBeneficiary).length,
      pipelineOnlyCount: safeRecords.filter((record) => !record.isBeneficiary).length,
      genderDistribution: countBy((record) => record.gender),
      serviceTypeDistribution: countBy((record) => normalizeServiceCategory(record.serviceType || record.businessType)),
      sectorDistribution: countBy((record) => record.sector),
    };
  }

  function indicatorTextColor() {
    return '#ffffff';
  }

  function polarToCartesian(cx, cy, radius, angleInDegrees) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + (radius * Math.cos(angleInRadians)),
      y: cy + (radius * Math.sin(angleInRadians)),
    };
  }

  function donutArcPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
    if (endAngle - startAngle >= 359.999) {
      const topOuter = polarToCartesian(cx, cy, outerRadius, 0);
      const bottomOuter = polarToCartesian(cx, cy, outerRadius, 180);
      const topInner = polarToCartesian(cx, cy, innerRadius, 0);
      const bottomInner = polarToCartesian(cx, cy, innerRadius, 180);

      return [
        `M ${topOuter.x} ${topOuter.y}`,
        `A ${outerRadius} ${outerRadius} 0 1 0 ${bottomOuter.x} ${bottomOuter.y}`,
        `A ${outerRadius} ${outerRadius} 0 1 0 ${topOuter.x} ${topOuter.y}`,
        `L ${topInner.x} ${topInner.y}`,
        `A ${innerRadius} ${innerRadius} 0 1 1 ${bottomInner.x} ${bottomInner.y}`,
        `A ${innerRadius} ${innerRadius} 0 1 1 ${topInner.x} ${topInner.y}`,
        'Z',
      ].join(' ');
    }

    const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
    const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
    const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
    const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerStart.x} ${innerStart.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
      'Z',
    ].join(' ');
  }

  function sliceLabelMarkup(slice, cx, cy, labelRadius, ringThickness) {
    const midAngle = slice.startAngle + ((slice.endAngle - slice.startAngle) / 2);
    const point = polarToCartesian(cx, cy, labelRadius, midAngle);
    const share = slice.endAngle - slice.startAngle;
    const countFontSize = share <= 34 ? 13 : 16;
    const percentFontSize = share <= 34 ? 10.5 : 12.5;
    const percentText = `${slice.percentage.toFixed(1)}%`;
    const dyOffset = Math.min(10, Math.max(7, ringThickness * 0.16));
    return `
      <text class="reports-donut__slice-label" x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}" fill="${slice.textColor}">
        <tspan class="reports-donut__slice-count" x="${point.x.toFixed(2)}" dy="-${dyOffset}" style="font-size:${countFontSize}px;">${escapeHtml(String(slice.count))}</tspan>
        <tspan class="reports-donut__slice-percent" x="${point.x.toFixed(2)}" dy="${dyOffset + 12}" style="font-size:${percentFontSize}px;">${escapeHtml(percentText)}</tspan>
      </text>
    `;
  }

  function renderPoReportsDistribution(root, rows, options = {}) {
    if (!root) return;
    const safeRows = Array.isArray(rows) ? rows.filter((row) => safeNumber(row?.count) > 0) : [];
    const total = safeRows.reduce((sum, row) => sum + safeNumber(row.count), 0);
    if (!safeRows.length || total <= 0) {
      root.innerHTML = '<p class="reports-empty">No data available.</p>';
      return;
    }
    const slices = safeRows.map((row, index) => {
      const count = safeNumber(row.count);
      const share = total > 0 ? (count / total) * 100 : 0;
      const color = FALLBACK_CHART_COLORS[index % FALLBACK_CHART_COLORS.length];
      const percentage = Number(share.toFixed(1));
      return {
        color,
        textColor: indicatorTextColor(color),
        count,
        percentage,
        label: row.label,
        share,
      };
    });

    const cx = 160;
    const cy = 160;
    const outerRadius = 122;
    const innerRadius = 66;
    const ringThickness = outerRadius - innerRadius;
    const labelRadius = innerRadius + (ringThickness / 2);
    let runningAngle = 0;
    const donutSlices = slices.map((slice) => {
      const sweepAngle = total > 0 ? (slice.count / total) * 360 : 0;
      const startAngle = runningAngle;
      const endAngle = runningAngle + sweepAngle;
      runningAngle = endAngle;
      return {
        ...slice,
        startAngle,
        endAngle,
        path: donutArcPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle),
      };
    });

    root.innerHTML = `
      <div class="reports-donut" role="img" aria-label="${escapeHtml(options.label || 'Distribution chart')}">
        <div class="reports-donut__chart-shell">
          <svg class="reports-donut__svg" viewBox="0 0 320 320" aria-hidden="true">
            <circle class="reports-donut__track" cx="${cx}" cy="${cy}" r="${outerRadius}"></circle>
            ${donutSlices.map((slice) => `<path d="${slice.path}" fill="${slice.color}"></path>`).join('')}
            ${donutSlices.map((slice) => sliceLabelMarkup(slice, cx, cy, labelRadius, ringThickness)).join('')}
          </svg>
        </div>
        <div class="reports-donut__legend">
          ${donutSlices.map((slice) => {
            return `
              <div class="reports-donut__legend-row">
                <span class="reports-donut__legend-swatch" style="--legend-color:${slice.color};"></span>
                <span class="reports-donut__legend-label">${escapeHtml(slice.label)}</span>
                <strong class="reports-donut__legend-count">${slice.count}</strong>
                <span class="reports-donut__legend-percent">${slice.percentage.toFixed(1)}%</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  async function fetchPoReportData() {
    const reportsSection = document.getElementById('reports-section');
    if (!reportsSection || reportsSection.style.display === 'none') return;
    if (!document.getElementById('poReportsPeriod')) {
      initReports();
      return;
    }
    const requestId = safeNumber(state.reports.liveRequestId) + 1;
    state.reports.liveRequestId = requestId;
    const filters = collectPoReportFiltersFromControls();
    syncReportsFilterControls();
    setText('poReportsResultCount', 'Loading live scoped report...');

    const response = await apiGet('pdo/reports/data', filters);
    if (state.reports.liveRequestId !== requestId) return;
    if (!response.ok || !response.data) {
      setText('poReportsResultCount', response.message || 'Unable to load live scoped report.');
      return;
    }

    renderPoReportsApiPayload(response.data);
  }

  async function refreshReportsRealtime() {
    if (state.reports.refreshing) return;
    const reportsSection = document.getElementById('reports-section');
    if (!reportsSection || reportsSection.style.display === 'none') return;
    state.reports.refreshing = true;
    try {
      await fetchPoReportData();
    } finally {
      state.reports.refreshing = false;
    }
  }

  function startReportsRealtimeRefresh() {
    if (state.reports.refreshTimer) return;
    state.reports.refreshTimer = window.setInterval(refreshReportsRealtime, 10000);
  }

  function stopReportsRealtimeRefresh() {
    if (!state.reports.refreshTimer) return;
    window.clearInterval(state.reports.refreshTimer);
    state.reports.refreshTimer = null;
  }

  // Connect the shared repayment review workspace to the PDO-scoped beneficiary roster and modal controls.
  function initRepaymentWorkspace() {
    if (!window.SMARTLEAP_REPAYMENT_REVIEW?.createWorkspace || state.repayments.workspace) {
      return;
    }
    state.repayments.workspace = window.SMARTLEAP_REPAYMENT_REVIEW.createWorkspace({
      actorName: authUser?.name || 'Project Officer',
      actorRole: 'Project Officer',
      notify: showToast,
      initialPayments: state.repaymentRecords,
      recordModalId: 'poRepaymentRecordModal',
      recordCloseId: 'poRepaymentRecordClose',
      beneficiaryRecordsProvider: () => Array.isArray(state.beneficiaryRoster) ? state.beneficiaryRoster : [],
      onPaymentsUpdated: (payments) => {
        state.repaymentRecords = Array.isArray(payments) ? payments : [];
        renderOverviewSummary();
        renderBeneficiaryFilters();
        renderBeneficiariesTable();
        renderReportsSection();
        renderRepaymentRosterDirect();
      },
      ids: {
        search: 'po-repayment-search',
        stateFilter: 'po-repayment-status',
        fromDateFilter: 'po-repayment-from-date',
        toDateFilter: 'po-repayment-to-date',
        resetFilters: 'po-repayment-reset',
        approvedCount: 'po-repayment-approved',
        pendingCount: 'po-repayment-pending',
        partialCount: 'po-repayment-partial',
        fullCount: 'po-repayment-full',
        rosterBody: 'poRepaymentRosterBody',
        rosterCount: 'po-repayment-roster-count',
        modalRoot: 'poRepaymentModal',
        modalClose: 'poRepaymentModalClose',
        modalStatus: 'poRepaymentModalStatus',
        modalTitle: 'poRepaymentModalTitle',
        modalSubtitle: 'poRepaymentModalSubtitle',
        beneficiaryName: 'poRepaymentBeneficiaryName',
        business: 'poRepaymentBusiness',
        barangay: 'poRepaymentBarangay',
        assignedPdo: 'poRepaymentAssignedPdo',
        submittedAt: 'poRepaymentSubmittedAt',
        summaryOutstanding: 'poRepaymentSummaryOutstanding',
        summaryVerified: 'poRepaymentSummaryVerified',
        summaryProgress: 'poRepaymentSummaryProgress',
        summaryStanding: 'poRepaymentSummaryStanding',
        paymentDate: 'poRepaymentPaymentDate',
        orNumber: 'poRepaymentOrNumber',
        amount: 'poRepaymentAmount',
        submissionType: 'poRepaymentSubmissionType',
        coverage: 'poRepaymentCoverage',
        submittedBy: 'poRepaymentSubmittedBy',
        uploadStatus: 'poRepaymentUploadStatus',
        hardCopyStatus: 'poRepaymentHardCopyStatus',
        duplicateWarning: 'poRepaymentDuplicateWarning',
        decisionGrid: 'poRepaymentDecisionGrid',
        remarksGroup: 'poRepaymentRemarksGroup',
        proofName: 'poRepaymentProofName',
        proofType: 'poRepaymentProofType',
        proofDate: 'poRepaymentProofDate',
        proofPreview: 'poRepaymentProofPreview',
        openProof: 'poRepaymentOpenProof',
        downloadProof: 'poRepaymentDownloadProof',
        fullscreenProof: 'poRepaymentFullscreenProof',
        historyBody: 'poRepaymentHistoryBody',
        remarks: 'po-repayment-remarks',
        decisionCards: 'poRepaymentDecisionCards',
        decisionGuide: 'poRepaymentDecisionGuide',
        decisionNote: 'poRepaymentDecisionNote',
        close: 'poRepaymentClose',
      },
      emptyColspan: 12,
      emptyRosterMessage: 'No scoped beneficiaries matched the current filters.',
      bodyModalClass: 'po-repayment-modal-open',
    });
  }

  function renderLoadError(message) {
    const applications = document.querySelector('#po-app-table tbody');
    const attention = document.getElementById('poAttentionStrip');
    const trainingSnapshot = document.getElementById('poOverviewTrainingSnapshot');
    const beneficiarySnapshot = document.getElementById('poOverviewBeneficiarySnapshot');
    const beneficiaryTableBody = document.getElementById('poBeneficiaryTableBody');
    if (attention) attention.innerHTML = `<div class="po-empty">${escapeHtml(message)}</div>`;
    if (trainingSnapshot) trainingSnapshot.innerHTML = `<div class="po-empty">${escapeHtml(message)}</div>`;
    if (beneficiarySnapshot) beneficiarySnapshot.innerHTML = `<div class="po-empty">${escapeHtml(message)}</div>`;
    if (applications) applications.innerHTML = `<tr><td colspan="7" class="text-center text-muted">${escapeHtml(message)}</td></tr>`;
    if (beneficiaryTableBody) beneficiaryTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">${escapeHtml(message)}</td></tr>`;
  }

  function renderAttentionStrip() {
    const root = document.getElementById('poAttentionStrip');
    if (!root) return;
    const priorities = state.applications
      .slice()
      .sort((left, right) => priorityWeight(right) - priorityWeight(left) || toTime(left.submittedAt) - toTime(right.submittedAt))
      .slice(0, 3);
    root.innerHTML = priorities.length
      ? priorities.map((item, index) => {
        const readiness = readinessLabel(item.status);
        return `<article class="po-attention-card po-attention-card--rank-${index + 1}"><div class="po-attention-card__rail"><span class="po-attention-card__rank">0${index + 1}</span></div><div class="po-attention-card__body"><div class="po-attention-card__top"><div class="po-attention-card__identity"><strong>${escapeHtml(item.applicantName || '--')}</strong><span>${escapeHtml(item.barangay || '--')}</span></div><span class="po-status-pill po-status-pill--readiness ${readinessBadgeClass(item.status)}">${escapeHtml(readiness)}</span></div><div class="po-attention-card__status-grid"><div class="po-attention-card__status-block"><span>Case Status</span><strong>${escapeHtml(item.status || '--')}</strong></div><div class="po-attention-card__status-block"><span>Submitted</span><strong>${escapeHtml(formatDate(item.submittedAt))}</strong></div></div><button type="button" class="action-button po-case-action po-attention-card__action" data-open-application="${item.id}"><i class="fas fa-folder-open"></i><span>Open Review</span></button></div></article>`;
      }).join('')
      : '<div class="po-empty">No priority cases loaded.</div>';
  }

  function renderApplicationsTable() {
    const tbody = document.querySelector('#po-app-table tbody');
    if (!tbody) return;
    const filterSelect = document.getElementById('po-app-filter');
    const livelihoodFilterSelect = document.getElementById('po-app-livelihood-filter');
    if (filterSelect) {
      const currentValue = String(filterSelect.value || '');
      const statuses = Array.from(new Set(state.applications.map((item) => String(item.status || '').trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
      filterSelect.innerHTML = `<option value="">All statuses</option>${statuses.map((status) => `<option value="${escapeHtml(status)}"${currentValue === status ? ' selected' : ''}>${escapeHtml(status)}</option>`).join('')}`;
    }
    if (livelihoodFilterSelect) {
      const currentValue = String(livelihoodFilterSelect.value || '');
      const availableCategories = Array.from(new Set(state.applications.map((item) => String(item.livelihoodCategory || '').trim()).filter(Boolean)));
      const options = Array.from(new Set([...livelihoodCategories, ...availableCategories])).sort((left, right) => left.localeCompare(right));
      livelihoodFilterSelect.innerHTML = `<option value="">All categories</option>${options.map((category) => `<option value="${escapeHtml(category)}"${currentValue === category ? ' selected' : ''}>${escapeHtml(category)}</option>`).join('')}`;
    }
    const batchFilterSelect = document.getElementById('po-app-batch-filter');
    if (batchFilterSelect) {
      const currentValue = String(batchFilterSelect.value || '');
      const rawBatches = Array.from(new Set(state.applications.map((item) => formatBatchNo(item.batchNo)).filter(Boolean)));
      ['Batch 1', 'Batch 2', 'Batch 3'].forEach((b) => {
        if (!rawBatches.includes(b)) rawBatches.push(b);
      });
      const sortedBatches = rawBatches.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.replace(/\D/g, '') || '0', 10);
        return numA - numB;
      });
      batchFilterSelect.innerHTML = `<option value="">All batches</option>${sortedBatches.map((b) => `<option value="${escapeHtml(b)}"${currentValue === b ? ' selected' : ''}>${escapeHtml(b)}</option>`).join('')}`;
    }
    const filter = String(document.getElementById('po-app-filter')?.value || '');
    const livelihoodCategory = String(document.getElementById('po-app-livelihood-filter')?.value || '');
    const batchFilter = String(document.getElementById('po-app-batch-filter')?.value || '');
    const search = String(document.getElementById('po-app-search')?.value || '').toLowerCase();
    const filtered = state.applications.filter((item) => {
      const matchesStatus = !filter || item.status === filter;
      const matchesLivelihoodCategory = !livelihoodCategory || String(item.livelihoodCategory || '').trim() === livelihoodCategory;
      const matchesBatch = !batchFilter || formatBatchNo(item.batchNo) === batchFilter;
      return matchesStatus && matchesLivelihoodCategory && matchesBatch && applicationMatchesSearch(item, search);
    });
    tbody.innerHTML = filtered.map((item) => `<tr><td><div class="po-application-identity"><div class="table-primary">${escapeHtml(item.applicantName)}</div><div class="table-secondary">${escapeHtml(item.businessName || 'No business name recorded')}</div><div class="table-tertiary">${escapeHtml(item.email || item.contactNumber || '--')}</div></div></td><td><div class="po-location-cell"><strong>${escapeHtml(item.barangay || '--')}</strong><span>${escapeHtml(item.contactNumber || 'No contact number')}</span></div></td><td><span class="po-batch-pill">${escapeHtml(formatBatchNo(item.batchNo))}</span></td><td><div class="po-progress-cell"><strong>${item.verifiedRequirementCount || 0} / ${item.requiredRequirementCount || 0}</strong><span>verified of required requirements</span></div></td><td><span class="po-status-pill po-status-pill--workflow ${statusClass(item.status)}">${escapeHtml(item.status || '--')}</span></td><td><span class="po-status-pill po-status-pill--readiness ${readinessBadgeClass(item.status)}">${escapeHtml(readinessLabel(item.status))}</span></td><td><div class="po-date-cell"><strong>${formatDate(item.submittedAt)}</strong><span>submission date</span></div></td><td class="text-center"><button type="button" class="action-button po-case-action" data-open-application="${item.id}"><i class="fas fa-folder-open"></i><span>Open Review</span></button></td></tr>`).join('') || '<tr><td colspan="8" class="text-center text-muted">No scoped applications found.</td></tr>';
    setText('po-app-table-caption', filter ? `${filter} queue` : 'Queue review list');
  }

  function normalizeFilterValue(value) {
    return String(value || '').trim().toLowerCase();
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

  function uniqueSorted(values) {
    return Array.from(new Set((values || []).filter(Boolean))).sort((left, right) => String(left).localeCompare(String(right)));
  }

  function getScopedBeneficiaryRecords() {
    return buildScopedRepaymentRoster(state.beneficiaryRoster, state.repaymentRecords).map((record) => ({
      ...record,
      statusKey: normalizeDashboardKey(record.programStatus || 'active'),
      statusLabel: beneficiaryStatusLabel(record.programStatus || 'active'),
      serviceTypeLabel: String(record.serviceType || record.businessType || record.sectorOtherSpecify || 'Not set'),
    }));
  }

  function getScopedPaidBeneficiaryReportRecords() {
    return getScopedBeneficiaryRecords().filter((record) => {
      const repayment = record.repayment || {};
      return safeNumber(repayment.verifiedAmount) > 0 || safeNumber(repayment.monthsPaid) > 0;
    });
  }

  function handleRepaymentSectionClick(event) {
    const trigger = event.target.closest('[data-repayment-open]');
    if (!trigger) return;
    event.preventDefault();
    initRepaymentWorkspace();
    state.repayments.workspace?.syncBeneficiaries?.();
    if (!state.repayments.workspace?.openBeneficiary) {
      showToast('Repayment workspace is still loading. Please try again.', 'warning');
      return;
    }
    state.repayments.workspace.openBeneficiary(trigger.getAttribute('data-repayment-open') || '');
  }

  function renderBeneficiaryFilters() {
    const records = getScopedBeneficiaryRecords();
    const barangayFilter = document.getElementById('poBeneficiaryBarangayFilter');
    const search = document.getElementById('poBeneficiarySearch');
    const repayment = document.getElementById('poBeneficiaryRepaymentFilter');
    const status = document.getElementById('poBeneficiaryStatusFilter');
    if (barangayFilter) {
      const current = normalizeFilterValue(state.beneficiaryFilters.barangay);
      const options = uniqueSorted(records.map((item) => item.barangay || 'Unassigned'));
      barangayFilter.innerHTML = `<option value="">All barangays</option>${options.map((value) => {
        const normalized = normalizeFilterValue(value);
        return `<option value="${escapeHtml(normalized)}"${current === normalized ? ' selected' : ''}>${escapeHtml(value)}</option>`;
      }).join('')}`;
    }
    if (search && search.value !== state.beneficiaryFilters.search) {
      search.value = state.beneficiaryFilters.search;
    }
    if (repayment) repayment.value = state.beneficiaryFilters.repayment || '';
    if (status) status.value = state.beneficiaryFilters.status || '';
    const batchFilter = document.getElementById('poBeneficiaryBatchFilter');
    if (batchFilter) {
      const current = normalizeFilterValue(state.beneficiaryFilters.batch);
      const rawBatches = uniqueSorted(records.map((item) => formatBatchNo(item.batchNo || 'Batch 3')));
      ['Batch 1', 'Batch 2', 'Batch 3'].forEach((b) => {
        if (!rawBatches.includes(b)) rawBatches.push(b);
      });
      const sortedBatches = rawBatches.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.replace(/\D/g, '') || '0', 10);
        return numA - numB;
      });
      batchFilter.innerHTML = `<option value="">All batches</option>${sortedBatches.map((value) => {
        const normalized = normalizeFilterValue(value);
        return `<option value="${escapeHtml(normalized)}"${current === normalized ? ' selected' : ''}>${escapeHtml(value)}</option>`;
      }).join('')}`;
    }
  }

  function filterBeneficiaryRecords(records = getScopedBeneficiaryRecords()) {
    const search = normalizeFilterValue(state.beneficiaryFilters.search);
    return records.filter((record) => {
      const searchable = normalizeFilterValue([
        record.name,
        record.email,
        record.contactNumber,
        record.businessName,
        record.barangay,
        record.serviceTypeLabel,
      ].join(' '));
      const barangay = normalizeFilterValue(record.barangay || 'Unassigned');
      const repayment = normalizeDashboardKey(record.repayment?.key || 'no_upload_yet');
      const status = normalizeDashboardKey(record.programStatus || 'active');
      const recordBatch = normalizeFilterValue(formatBatchNo(record.batchNo || 'Batch 3'));

      return (!search || searchable.includes(search))
        && (!state.beneficiaryFilters.barangay || barangay === state.beneficiaryFilters.barangay)
        && (!state.beneficiaryFilters.repayment || repayment === state.beneficiaryFilters.repayment)
        && (!state.beneficiaryFilters.status || status === state.beneficiaryFilters.status)
        && (!state.beneficiaryFilters.batch || recordBatch === state.beneficiaryFilters.batch);
    });
  }

  function renderBeneficiariesTable() {
    const body = document.getElementById('poBeneficiaryTableBody');
    const count = document.getElementById('poBeneficiaryRosterCount');
    if (!body) return;
    const rows = filterBeneficiaryRecords();
    if (count) {
      count.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    }
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7">No scoped beneficiary records found.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((record) => `
      <tr>
        <td>
          <div class="admin-beneficiary-person">
            <strong>${escapeHtml(record.name || 'Unnamed beneficiary')}</strong>
            <span>${escapeHtml(record.businessName || 'No business name')}</span>
            <small>${escapeHtml(record.email || record.contactNumber || 'No contact')}</small>
          </div>
        </td>
        <td>
          <div class="admin-beneficiary-stack">
            <strong>${escapeHtml(record.barangay || 'Unassigned')}</strong>
            <span>${escapeHtml(record.assignedPdo || authUser?.name || 'Project Officer')}</span>
          </div>
        </td>
        <td>
          <div class="admin-beneficiary-stack admin-beneficiary-stack--program">
            <strong>${escapeHtml(record.serviceTypeLabel)}</strong>
          </div>
        </td>
        <td>
          <div class="admin-beneficiary-stack admin-beneficiary-stack--repayment">
            ${repaymentStandingChip(record.repayment?.key || record.repayment?.label || 'no_upload_yet')}
          </div>
        </td>
        <td>
          <span class="${beneficiaryStatusClass(record.statusKey, 'po-status-pill po-status-pill--workflow')}">${escapeHtml(record.statusLabel)}</span>
        </td>
        <td>${escapeHtml(formatActivityTime(record.lastActivity))}</td>
        <td class="actions">
          <div class="admin-beneficiary-actions">
            <button type="button" class="team-action-button team-action-button--primary" data-po-beneficiary-view="${safeNumber(record.id)}">View Details</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderRepaymentRosterDirect() {
    const body = document.getElementById('poRepaymentRosterBody');
    const count = document.getElementById('po-repayment-roster-count');
    if (!body) return;

    const records = getScopedBeneficiaryRecords();
    const ordered = records.slice().sort((left, right) => {
      const rightActivity = toTime(right.lastActivity);
      const leftActivity = toTime(left.lastActivity);
      return rightActivity - leftActivity || String(left.name || '').localeCompare(String(right.name || ''));
    });

    if (count) {
      count.textContent = `${ordered.length} ${ordered.length === 1 ? 'beneficiary' : 'beneficiaries'}`;
    }
    setText('po-repayment-approved', String(ordered.length));
    setText('po-repayment-pending', String(ordered.filter((record) => ['uploaded', 'under_review'].includes(String(record.repayment?.key || ''))).length));
    setText('po-repayment-partial', String(ordered.filter((record) => record.repayment?.key === 'partial_paid').length));
    setText('po-repayment-full', String(ordered.filter((record) => record.repayment?.key === 'fully_paid').length));

    if (!ordered.length) {
      body.innerHTML = '<tr><td colspan="12">No scoped beneficiaries found.</td></tr>';
      return;
    }

    body.innerHTML = ordered.map((record) => {
      const repayment = record.repayment || {};
      const repaymentRate = `${safeNumber(repayment.rate ?? repayment.repaymentRate).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
      const openKey = safeNumber(record.id) > 0 ? `id:${safeNumber(record.id)}` : `name:${String(record.name || '').trim().toLowerCase()}`;
      return `
        <tr>
          <td>
            <div class="admin-repayment-person">
              <strong>${escapeHtml(record.name || 'Unnamed beneficiary')}</strong>
              <span>${escapeHtml(record.businessName || 'No business name')}</span>
            </div>
          </td>
          <td>${escapeHtml(record.gender || '--')}</td>
          <td>${escapeHtml(record.ageGroup || '--')}</td>
          <td>${escapeHtml(record.serviceTypeLabel || record.serviceType || '--')}</td>
          <td>${escapeHtml(record.barangay || '--')}</td>
          <td>${escapeHtml(record.assignedPdo || authUser?.name || '--')}</td>
          <td>${repaymentStandingChip(repayment.key || 'no_upload_yet')}</td>
          <td>${escapeHtml(formatPhpAmount(repayment.verifiedAmount || repayment.paidAmount || 0))}</td>
          <td>${escapeHtml(String(repayment.monthsPassed || 0))}</td>
          <td>${escapeHtml(String(repayment.monthsPaid || 0))}</td>
          <td>${escapeHtml(`${repaymentRate} (${repayment.monthsPaidFraction || '0/0'})`)}</td>
          <td class="actions">
            <button type="button" class="app-btn-outline" data-repayment-open="${escapeHtml(openKey)}">Open Repayments</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function findBeneficiaryRecord(beneficiaryId) {
    return getScopedBeneficiaryRecords().find((record) => safeNumber(record.id) === safeNumber(beneficiaryId)) || null;
  }

  function closeBeneficiaryModal() {
    const modal = document.getElementById('poBeneficiaryModal');
    if (modal) modal.hidden = true;
    state.activeBeneficiaryId = null;
  }

  function splitNameParts(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts.shift() || '',
      middleName: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
      lastName: parts.length ? parts[parts.length - 1] : '',
    };
  }

  function formatCoMakerRegistrationStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'active') return 'Approved';
    if (!normalized) return 'Not submitted';
    return normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function openBeneficiaryModal(beneficiaryId) {
    const modal = document.getElementById('poBeneficiaryModal');
    const title = document.getElementById('poBeneficiaryModalTitle');
    const body = document.getElementById('poBeneficiaryModalBody');
    const beneficiary = findBeneficiaryRecord(beneficiaryId);
    if (!modal || !title || !body || !beneficiary) return;

    state.activeBeneficiaryId = safeNumber(beneficiary.id);
    const initials = getInitials(beneficiary.name || 'Beneficiary');
    const approvalDate = beneficiary.approvalDate ? formatDate(beneficiary.approvalDate) : 'Not recorded';
    const assistanceReceived = beneficiary.approvedAt ? formatDateTimeDetailed(beneficiary.approvedAt) : '';
    const firstDueDate = beneficiary.firstRepaymentDueDate ? formatDate(beneficiary.firstRepaymentDueDate) : '';
    const assistanceAction = !beneficiary.approvedAt
      ? `<button type="button" class="team-action-button team-action-button--soft" data-po-beneficiary-assistance-record="${safeNumber(beneficiary.id)}">Record Assistance Received Last Month</button>`
      : '';
    const statusKey = normalizeDashboardKey(beneficiary.programStatus || 'active');
    const coMaker = beneficiary.coMakerRegistration || null;
    const avatarMarkup = beneficiary.photo
      ? `<div class="admin-profile-modal__avatar admin-record-sheet__avatar has-photo" style="background-image:url('${escapeAttribute(beneficiary.photo)}')" aria-hidden="true"></div>`
      : `<div class="admin-record-sheet__avatar" aria-hidden="true">${escapeHtml(initials)}</div>`;

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
              <span class="${beneficiaryStatusClass(statusKey, 'admin-record-sheet__pill')}">${escapeHtml(beneficiary.statusLabel)}</span>
              <span class="admin-record-sheet__pill admin-record-sheet__pill--soft">${escapeHtml(beneficiary.repayment?.label || 'No Upload Yet')}</span>
            </div>
          </div>
        </div>
        <section class="admin-record-sheet__section admin-record-sheet__section--violet">
          <div class="admin-record-sheet__section-head"><span>Demographic Information</span></div>
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
          <div class="admin-record-sheet__section-head"><span>Business and Assignment</span></div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            <article class="admin-record-sheet__field admin-record-sheet__field--wide"><span>Business Name</span><strong>${escapeHtml(beneficiary.businessName || 'No business name')}</strong></article>
            <article class="admin-record-sheet__field"><span>Livelihood Category</span><strong>${escapeHtml(beneficiary.livelihoodCategory || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Service Type</span><strong>${escapeHtml(beneficiary.serviceTypeLabel)}</strong></article>
            <article class="admin-record-sheet__field"><span>Business Type</span><strong>${escapeHtml(beneficiary.businessType || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Sector</span><strong>${escapeHtml(beneficiary.sector || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Other Sector</span><strong>${escapeHtml(beneficiary.sectorOtherSpecify || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Assigned PDO</span><strong>${escapeHtml(beneficiary.assignedPdo || authUser?.name || 'Project Officer')}</strong></article>
            <article class="admin-record-sheet__field"><span>Batch No</span><strong>${escapeHtml(beneficiary.batchNo || 'Not set')}</strong></article>
            <article class="admin-record-sheet__field"><span>Status</span><strong>${escapeHtml(beneficiary.statusLabel)}</strong></article>
            <article class="admin-record-sheet__field"><span>Approval Date</span><strong>${escapeHtml(approvalDate)}</strong></article>
            <article class="admin-record-sheet__field admin-record-sheet__field--wide">
              <span>Assistance Received</span>
              <strong>${escapeHtml(assistanceReceived || 'Not recorded')}</strong>
              <small>${escapeHtml(firstDueDate ? `First repayment due date: ${firstDueDate}` : 'Record this to normalize repayment reports.')}</small>
              ${assistanceAction}
            </article>
            <article class="admin-record-sheet__field"><span>Last Activity</span><strong>${escapeHtml(formatActivityTime(beneficiary.lastActivity))}</strong></article>
          </div>
        </section>
        <section class="admin-record-sheet__section admin-record-sheet__section--amber">
          <div class="admin-record-sheet__section-head"><span>Repayment Summary</span></div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            <article class="admin-record-sheet__field"><span>Repayment Status</span><strong>${escapeHtml(beneficiary.repayment?.label || 'No Upload Yet')}</strong></article>
            <article class="admin-record-sheet__field"><span>Uploaded Receipts</span><strong>${escapeHtml(String(safeNumber(beneficiary.repayment?.recordCount || 0)))}</strong></article>
            <article class="admin-record-sheet__field"><span>Verified Amount</span><strong>${escapeHtml(`PHP ${safeNumber(beneficiary.repayment?.verifiedAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}</strong></article>
            <article class="admin-record-sheet__field"><span>Repayment Rate</span><strong>${escapeHtml(`${safeNumber(beneficiary.repayment?.rate || 0)}% (${beneficiary.repayment?.monthsPaidFraction || '0/0'})`)}</strong></article>
            <article class="admin-record-sheet__field"><span>Ledger Standing</span><strong>${escapeHtml(statusKey === 'deceased' ? 'Closed' : 'Active under current beneficiary')}</strong></article>
          </div>
        </section>
        ${statusKey === 'deceased' ? `
        <section class="admin-record-sheet__section admin-record-sheet__section--aqua">
          <div class="admin-record-sheet__section-head"><span>Co-maker Account</span></div>
          <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
            ${!coMaker ? `
            <article class="admin-record-sheet__field admin-record-sheet__field--wide">
              <span>Official Gmail invitation</span>
              <div class="po-co-maker-callout">
                <div class="po-co-maker-callout__header">
                  <span class="po-co-maker-callout__eyebrow">Required PDO Action</span>
                  <strong>Send the co-maker Gmail link now</strong>
                </div>
                <p class="po-co-maker-callout__copy">This beneficiary is already tagged deceased. The next step is for the assigned PDO to send the official Gmail registration link to the co-maker. Admin will only review and approve the registration after the co-maker submits it.</p>
                <div class="po-co-maker-callout__steps" aria-label="Co-maker registration steps">
                  <span>1. Admin tags Deceased</span>
                  <span>2. PDO sends Gmail link</span>
                  <span>3. Admin reviews submission</span>
                </div>
                <label class="po-co-maker-callout__input">
                  <span>Co-maker Gmail Address</span>
                  <div class="admin-record-sheet__link-share po-co-maker-callout__actions">
                    <input class="admin-profile-modal__input" id="poCoMakerGmailInput" type="email" placeholder="co-maker@gmail.com" autocomplete="email">
                    <button type="button" class="team-action-button team-action-button--soft" data-po-send-co-maker-email="${safeNumber(beneficiary.id)}">Send Gmail Link</button>
                  </div>
                </label>
              </div>
            </article>
            ` : `
            <article class="admin-record-sheet__field admin-record-sheet__field--wide">
              <span>Registration Progress</span>
              <div class="po-co-maker-callout po-co-maker-callout--submitted">
                <div class="po-co-maker-callout__header">
                  <span class="po-co-maker-callout__eyebrow">Co-maker Registration Started</span>
                  <strong>${escapeHtml(formatCoMakerRegistrationStatus(coMaker.registrationStatus))}</strong>
                </div>
                <p class="po-co-maker-callout__copy">The Gmail link for this deceased beneficiary has already been used for registration. You can review the submitted co-maker details below while Admin handles the approval decision.</p>
              </div>
            </article>
            <article class="admin-record-sheet__field">
              <span>Submitted Name</span>
              <strong>${escapeHtml(coMaker.name || 'Not set')}</strong>
            </article>
            <article class="admin-record-sheet__field">
              <span>Registration Status</span>
              <strong>${escapeHtml(formatCoMakerRegistrationStatus(coMaker.registrationStatus))}</strong>
            </article>
            <article class="admin-record-sheet__field">
              <span>Email</span>
              <strong>${escapeHtml(coMaker.email || 'No email')}</strong>
            </article>
            <article class="admin-record-sheet__field">
              <span>Contact Number</span>
              <strong>${escapeHtml(coMaker.contactNumber || 'No contact')}</strong>
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
            </article>
            `}
          </div>
        </section>
        ` : ''}
        </section>
      `;
    modal.hidden = false;
  }

  async function recordBeneficiaryAssistanceReceived(beneficiaryId) {
    if (!beneficiaryId) return;
    if (!window.confirm('Record the assistance received date as the same day last month and rebuild this beneficiary repayment schedule?')) return;
    const response = await apiPost('pdo/beneficiaries/assistance-received', {
      beneficiaryProfileId: beneficiaryId,
    });
    if (!response.ok) return showToast(response.message || firstError(response.errors) || 'Unable to record assistance release.', 'warning');
    showToast(
      `Assistance received date recorded ${formatDateTimeDetailed(response.approvedAt)}. First repayment due date is ${formatDate(response.firstRepaymentDueDate)}.`,
      'success'
    );
    await loadDashboard();
    openBeneficiaryModal(beneficiaryId);
  }

  async function sendCoMakerRegistrationEmail(button) {
    const beneficiaryId = safeNumber(button?.dataset?.poSendCoMakerEmail);
    const emailInput = document.getElementById('poCoMakerGmailInput');
    const email = String(emailInput?.value || '').trim();
    if (!beneficiaryId || !email) {
      showToast('Enter the co-maker Gmail address first.', 'warning');
      return;
    }

    button.disabled = true;
    button.textContent = 'Sending...';
    try {
      const response = await apiPost('pdo/co-maker-registrations/send-email', {
        beneficiaryProfileId: beneficiaryId,
        email,
      });
      if (!response.ok) {
        showToast(firstError(response.errors) || response.message || 'Unable to send the co-maker registration email.', 'warning');
        return;
      }
      showToast(response.message || 'Co-maker registration email sent.', 'success');
      emailInput.value = '';
    } finally {
      button.disabled = false;
      button.textContent = 'Send Gmail Link';
    }
  }

  function clearBeneficiaryFilters() {
    state.beneficiaryFilters = { search: '', barangay: '', repayment: '', status: '' };
    renderBeneficiaryFilters();
    renderBeneficiariesTable();
  }

  function handleBeneficiarySectionClick(event) {
    const viewButton = event.target.closest('[data-po-beneficiary-view]');
    if (viewButton) {
      openBeneficiaryModal(viewButton.dataset.poBeneficiaryView);
      return;
    }
  }

  function countByText(items, resolver) {
    return items.reduce((map, item) => {
      const key = String(resolver(item) || '').trim().toLowerCase();
      if (!key) return map;
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map());
  }

  function countMatching(map, labels) {
    return labels.reduce((total, label) => total + Number(map.get(String(label).toLowerCase()) || 0), 0);
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function normalizeDashboardKey(value) {
    return String(value || 'Unspecified').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unspecified';
  }

  function dashboardLabel(value) {
    return String(value || 'Unspecified')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }

  function countDashboardEntries(items, resolver) {
    return items.reduce((map, item) => {
      const raw = resolver(item);
      const key = normalizeDashboardKey(raw);
      const entry = map.get(key) || { key, label: dashboardLabel(raw || key), count: 0 };
      entry.count += 1;
      map.set(key, entry);
      return map;
    }, new Map());
  }

  function normalizeRepaymentStage(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (!normalized) return 'uploaded';
    if (['pending', 'submitted', 'underreview', 'reviewing'].includes(normalized)) return 'under_review';
    if (['needscorrection', 'correctionrequired'].includes(normalized)) return 'needs_correction';
    if (['rejected', 'flagged', 'invalid'].includes(normalized)) return 'rejected';
    if (['partialverified', 'partiallyverified'].includes(normalized)) return 'partial_verified';
    if (['credited'].includes(normalized)) return 'credited';
    if (['verified', 'verifiedupload', 'approved'].includes(normalized)) return 'verified';
    return 'uploaded';
  }

  function repaymentStandingLabel(key) {
    return ({
      no_upload_yet: 'No Upload Yet',
      under_review: 'Under Review',
      needs_correction: 'Needs Correction',
      rejected: 'Rejected',
      partial_paid: 'Partial Paid',
      fully_paid: 'Fully Paid',
    })[normalizeDashboardKey(key)] || dashboardLabel(key);
  }

  function repaymentStandingTone(keyOrLabel) {
    const key = normalizeDashboardKey(keyOrLabel);
    if (['no_upload_yet', 'no_upload', 'none'].includes(key)) return 'muted';
    if (['under_review', 'uploaded', 'pending_verification', 'submitted'].includes(key)) return 'uploaded';
    if (['needs_correction', 'correction_required'].includes(key)) return 'needs-correction';
    if (['rejected', 'invalid'].includes(key)) return 'rejected';
    if (['partial_paid', 'partially_verified', 'partial_verified'].includes(key)) return 'warning';
    if (['fully_paid', 'fully_verified', 'verified', 'paid'].includes(key)) return 'success';
    return 'muted';
  }

  function repaymentStandingChip(keyOrLabel, fallbackLabel = 'No Upload Yet') {
    const label = repaymentStandingLabel(keyOrLabel || fallbackLabel);
    const tone = repaymentStandingTone(keyOrLabel || label);
    return `<span class="repayment-state-chip repayment-state-chip--${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function beneficiaryStatusLabel(status) {
    const key = normalizeDashboardKey(status || 'active');
    return ({
      active: 'Active',
      inactive: 'Inactive',
      deceased: 'Deceased',
      application_workspace: 'Application Workspace',
      pending: 'Pending',
    })[key] || dashboardLabel(status || key);
  }

  function beneficiaryStatusClass(status, baseClass = '') {
    const key = normalizeDashboardKey(status || 'active');
    const normalized = ['active', 'inactive', 'deceased'].includes(key) ? key : 'active';
    const scoped = baseClass ? `${baseClass} ` : '';
    return `${scoped}beneficiary-status beneficiary-status--${normalized}`.trim();
  }

  function buildScale(max) {
    const safeMax = Math.max(0, Math.ceil(safeNumber(max)));
    if (safeMax <= 4) {
      const maxValue = Math.max(safeMax, 1);
      return {
        maxValue,
        ticks: Array.from({ length: maxValue + 1 }, (_, index) => maxValue - index),
      };
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

  function shortChartLabel(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '--';
    if (words.length === 1) return words[0];
    if (words.length === 2 && words[0].length <= 8 && words[1].length <= 8) {
      return `${words[0]}\n${words[1]}`;
    }
    return words.map((word) => word.charAt(0)).join('');
  }

  function resolveChartColor(colors, key, index) {
    return colors?.[key] || FALLBACK_CHART_COLORS[index % FALLBACK_CHART_COLORS.length] || '#94a3b8';
  }

  function renderPoDashboardChart(rootId, entries, colors = {}, emptyText = 'No records available.') {
    const root = document.getElementById(rootId);
    if (!root) return;
    const preserveZero = entries.some((item) => item?.forceDisplay);
    const items = preserveZero ? entries : entries.filter((item) => Number(item.count || 0) > 0);
    if (!items.length) {
      root.innerHTML = `<div class="admin-v1-empty-chart">${escapeHtml(emptyText)}</div>`;
      return;
    }
    const counts = items.map((item) => safeNumber(item.count));
    const maxCount = Math.max(...counts, 1);
    const scale = buildScale(maxCount);
    const denseClass = items.length > 12 ? ' is-dense' : '';
    root.innerHTML = `
      <div class="admin-v1-column-chart${denseClass}" style="--bar-count:${items.length};" role="img" aria-label="${escapeHtml(rootId)}">
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
              const color = resolveChartColor(colors, item.key, index);
              return `
                <article class="admin-v1-column-chart__group">
                  <div class="admin-v1-column-chart__bar-wrap">
                    <div class="admin-v1-column-chart__bar" style="height:${height}%; --bar-color:${color};" title="${escapeHtml(item.label)}: ${count}"></div>
                  </div>
                  <span class="admin-v1-column-chart__label">${escapeHtml(shortChartLabel(item.label))}</span>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderPoDashboardLegend(legendId, footerId, entries, colors = {}, footerBuilder, emptyText) {
    const legend = document.getElementById(legendId);
    const footer = document.getElementById(footerId);
    if (!legend || !footer) return;

    const preserveZero = entries.some((item) => item?.forceDisplay);
    const items = preserveZero ? entries : entries.filter((item) => safeNumber(item.count) > 0);
    const total = items.reduce((sum, item) => sum + safeNumber(item.count), 0);
    if (!items.length || (!preserveZero && total <= 0)) {
      legend.innerHTML = '';
      footer.textContent = emptyText;
      return;
    }

    legend.innerHTML = items.map((item, index) => {
      const count = safeNumber(item.count);
      const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
      const color = resolveChartColor(colors, item.key, index);
      return `
        <span class="admin-v1-legend__item">
          <span class="admin-v1-legend__dot" style="background:${color};"></span>
          <span>${escapeHtml(item.label)}</span>
          <strong>${count}</strong>
          <small>${percentage}%</small>
        </span>
      `;
    }).join('');

    footer.textContent = typeof footerBuilder === 'function' ? footerBuilder(items, total) : emptyText;
  }

  function normalizeMonthValue(value) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : '';
  }

  function shiftMonthValue(value, offset) {
    const month = normalizeMonthValue(value);
    if (!month) return '';
    const parsed = new Date(`${month}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setMonth(parsed.getMonth() + Number(offset || 0));
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  }

  function deriveFirstDueMonth(record) {
    const firstDueMonth = normalizeMonthValue(record?.firstRepaymentDueDate || '');
    if (firstDueMonth) return firstDueMonth;
    const approvalMonth = normalizeMonthValue(record?.approvedAt || record?.approvalDate || '');
    return approvalMonth ? shiftMonthValue(approvalMonth, 1) : '';
  }

  function monthDiffInclusive(startMonth, endMonth) {
    const start = normalizeMonthValue(startMonth);
    const end = normalizeMonthValue(endMonth);
    if (!start || !end || end < start) return 0;
    const [startYear, startNumber] = start.split('-').map(Number);
    const [endYear, endNumber] = end.split('-').map(Number);
    return ((endYear - startYear) * 12) + (endNumber - startNumber) + 1;
  }

  function syncReportsFilterControls() {
    const period = document.getElementById('poReportsPeriod');
    const month = document.getElementById('poReportsMonth');
    const quarter = document.getElementById('poReportsQuarter');
    const year = document.getElementById('poReportsYear');
    const repaymentYear = document.getElementById('poReportsRepaymentYear');
    const from = document.getElementById('poReportsFrom');
    const to = document.getElementById('poReportsTo');
    const search = document.getElementById('poReportsSearch');
    const serviceType = document.getElementById('poReportsServiceType');
    const gender = document.getElementById('poReportsGender');
    const activePeriod = ['monthly', 'quarterly', 'yearly'].includes(String(state.reports.period || ''))
      ? state.reports.period
      : 'monthly';
    state.reports.period = activePeriod;
    const fieldVisibility = {
      month: activePeriod === 'monthly',
      quarter: activePeriod === 'quarterly',
      repaymentYear: true,
      year: true,
    };
    if (period) period.value = state.reports.period || 'monthly';
    if (month) {
      month.value = state.reports.month || defaultCycleMonth;
      month.disabled = !fieldVisibility.month;
    }
    if (quarter) {
      quarter.value = state.reports.quarter || '1';
      quarter.disabled = !fieldVisibility.quarter;
    }
    if (year) {
      year.value = state.reports.year || currentReportYear;
      year.disabled = !fieldVisibility.year;
    }
    if (repaymentYear) {
      repaymentYear.value = state.reports.repaymentYear || '1';
      repaymentYear.disabled = !fieldVisibility.repaymentYear;
    }
    if (from) {
      from.value = state.reports.from || '';
      from.disabled = !fieldVisibility.from;
    }
    if (to) {
      to.value = state.reports.to || '';
      to.disabled = !fieldVisibility.to;
    }
    if (search && search.value !== state.reports.search) search.value = state.reports.search || '';
    if (serviceType) serviceType.value = state.reports.serviceType || '';
    if (gender) gender.value = state.reports.gender || '';
    document.querySelectorAll('[data-po-report-filter-field]').forEach((field) => {
      const key = String(field.dataset.poReportFilterField || '');
      field.hidden = !fieldVisibility[key];
    });
  }

  function handleReportFilterChange(event) {
    const id = String(event.target?.id || '');
    if (id === 'poReportsPeriod') {
      const nextPeriod = String(event.target.value || 'monthly');
      state.reports.period = ['monthly', 'quarterly', 'yearly'].includes(nextPeriod) ? nextPeriod : 'monthly';
    }
    if (id === 'poReportsMonth') state.reports.month = String(event.target.value || defaultCycleMonth);
    if (id === 'poReportsQuarter') state.reports.quarter = String(event.target.value || '1');
    if (id === 'poReportsYear') state.reports.year = String(event.target.value || currentReportYear);
    if (id === 'poReportsRepaymentYear') state.reports.repaymentYear = String(event.target.value || '1');
    if (id === 'poReportsFrom') state.reports.from = String(event.target.value || '');
    if (id === 'poReportsTo') state.reports.to = String(event.target.value || '');
    if (id === 'poReportsSearch') state.reports.search = String(event.target.value || '');
    if (id === 'poReportsServiceType') state.reports.serviceType = String(event.target.value || '');
    if (id === 'poReportsGender') state.reports.gender = String(event.target.value || '');
    if (id === 'poReportsYear' || id === 'poReportsRepaymentYear') {
      const cycleMonths = buildRepaymentCycleMonths(state.reports.year || currentReportYear, state.reports.repaymentYear || '1');
      if (!cycleMonths.includes(state.reports.month)) {
        state.reports.month = cycleMonths[0];
      }
    }
    syncReportsFilterControls();
    fetchPoReportData();
  }

  function handleReportsSectionEvent(event) {
    const target = event.target;
    const id = String(target?.id || '');
    if (!id.startsWith('poReports')) return;
    if (event.type === 'click') {
      if (id === 'poReportsRefresh') {
        event.preventDefault();
        refreshReportsRealtime();
      }
      return;
    }
    if (event.type === 'input' && id !== 'poReportsSearch') return;
    handleReportFilterChange(event);
  }

  function clearReportsFilters() {
    state.reports = {
      ...state.reports,
      period: 'monthly',
      month: defaultCycleMonth,
      quarter: deriveRepaymentQuarter(defaultCycleMonth),
      year: currentReportYear,
      repaymentYear: '1',
      from: '',
      to: '',
      search: '',
      barangay: '',
      pdo: '',
      serviceType: '',
      gender: '',
      repayment: '',
    };
    syncReportsFilterControls();
    fetchPoReportData();
  }

  function repaymentMetaFromPayment(payment) {
    const beneficiaryId = Number(payment?.beneficiaryId || 0);
    const name = String(payment?.beneficiaryName || '').trim();
    return {
      id: beneficiaryId,
      name: name || 'Unknown beneficiary',
      email: String(payment?.beneficiaryEmail || '').trim(),
      businessName: String(payment?.beneficiaryBusiness || 'No business name').trim(),
      barangay: String(payment?.beneficiaryBarangay || 'Unassigned').trim(),
      assignedPdo: String(payment?.assignedPdo || authUser?.name || 'Project Officer').trim(),
      birthdate: String(payment?.beneficiaryBirthdate || '').trim(),
      age: Number.isFinite(Number(payment?.beneficiaryAge)) ? Number(payment.beneficiaryAge) : null,
      gender: String(payment?.beneficiaryGender || 'Not Set').trim(),
      serviceType: String(payment?.beneficiaryServiceType || '').trim(),
      businessType: String(payment?.beneficiaryServiceType || '').trim(),
      programStatus: String(payment?.beneficiaryStatus || 'active').trim() || 'active',
      approvalDate: String(payment?.beneficiaryApprovedAt || payment?.beneficiaryApprovalDate || payment?.paymentDate || payment?.submittedAt || '').trim(),
      approvedAt: String(payment?.beneficiaryApprovedAt || payment?.beneficiaryApprovalDate || '').trim(),
      firstRepaymentDueDate: '',
      lastActivity: String(payment?.reviewedAt || payment?.verifiedAt || payment?.submittedAt || payment?.paymentDate || '').trim(),
    };
  }

  function buildScopedRepaymentRoster(metaRecords, rawPayments) {
    const metaById = new Map();
    const metaByEmail = new Map();
    const metaByName = new Map();
    (metaRecords || []).forEach((record) => {
      const id = Number(record.id || 0);
      if (id > 0) metaById.set(id, record);
      const email = String(record.email || '').trim().toLowerCase();
      if (email) metaByEmail.set(email, record);
      const name = String(record.name || '').trim().toLowerCase();
      if (name) metaByName.set(name, record);
    });

    const grouped = new Map();
    (metaRecords || []).forEach((record) => {
      const id = Number(record.id || 0);
      const key = id > 0 ? `id:${id}` : (String(record.email || '').trim().toLowerCase() ? `email:${String(record.email || '').trim().toLowerCase()}` : `name:${String(record.name || '').trim().toLowerCase()}`);
      grouped.set(key, { key, meta: record, records: [] });
    });

    (rawPayments || []).forEach((payment) => {
      const beneficiaryId = Number(payment.beneficiaryId || 0);
      const email = String(payment.beneficiaryEmail || '').trim().toLowerCase();
      const name = String(payment.beneficiaryName || '').trim().toLowerCase();
      const meta = beneficiaryId > 0
        ? metaById.get(beneficiaryId)
        : (email ? metaByEmail.get(email) : metaByName.get(name));
      const key = beneficiaryId > 0 ? `id:${beneficiaryId}` : (email ? `email:${email}` : `name:${name}`);
      if (!grouped.has(key)) {
        grouped.set(key, { key, meta: meta || repaymentMetaFromPayment(payment), records: [] });
      }
      grouped.get(key).records.push({
        stage: normalizeRepaymentStage(payment.stage),
        amount: safeNumber(payment.amount || payment.allocatedAmount || 0),
        month: String(payment.month || payment.coverageFrom || payment.coverageMonth || ''),
        paymentDate: String(payment.paymentDate || payment.submittedAt || ''),
        submittedAt: String(payment.submittedAt || payment.paymentDate || ''),
      });
    });

    return Array.from(grouped.values()).map((entry) => {
      const records = entry.records.slice().sort((left, right) => toTime(right.submittedAt) - toTime(left.submittedAt));
      const verifiedRecords = records.filter((record) => ['verified', 'partial_verified', 'credited'].includes(record.stage));
      const hasCreditedRecord = records.some((record) => record.stage === 'credited');
      const verifiedMonths = new Set(verifiedRecords.map((record) => record.month).filter(Boolean));
      const verifiedAmount = verifiedRecords.reduce((sum, record) => sum + safeNumber(record.amount), 0);
      const verifiedAmountByMonth = verifiedRecords.reduce((map, record) => {
        const month = normalizeMonthValue(record.month);
        if (!month) return map;
        map[month] = safeNumber(map[month]) + safeNumber(record.amount);
        return map;
      }, {});
      const firstDueMonth = deriveFirstDueMonth(entry.meta || {});
      const currentMonth = currentReportMonth;
      const lastPlanMonth = firstDueMonth ? shiftMonthValue(firstDueMonth, TOTAL_REPAYMENT_MONTHS - 1) : '';
      const effectiveEndMonth = firstDueMonth && lastPlanMonth
        ? (currentMonth < lastPlanMonth ? currentMonth : lastPlanMonth)
        : '';
      const calendarMonthsPassed = firstDueMonth && effectiveEndMonth ? monthDiffInclusive(firstDueMonth, effectiveEndMonth) : 0;
      const monthsPaid = Array.from(verifiedMonths).filter((month) => {
        const normalized = normalizeMonthValue(month);
        if (!normalized) return false;
        if (firstDueMonth && normalized < firstDueMonth) return false;
        if (lastPlanMonth && normalized > lastPlanMonth) return false;
        return true;
      }).length;
      const rateDenominator = Math.max(calendarMonthsPassed, monthsPaid);
      const rate = rateDenominator > 0 ? Math.round((monthsPaid / rateDenominator) * 10000) / 100 : 0;

      let repaymentKey = 'no_upload_yet';
      if (!records.length) {
        repaymentKey = 'no_upload_yet';
      } else if (records.some((record) => record.stage === 'uploaded' || record.stage === 'under_review')) {
        repaymentKey = 'under_review';
      } else if (records.some((record) => record.stage === 'needs_correction')) {
        repaymentKey = 'needs_correction';
      } else if (records.some((record) => record.stage === 'rejected') && verifiedAmount <= 0) {
        repaymentKey = 'rejected';
      } else if (hasCreditedRecord || verifiedMonths.size >= TOTAL_REPAYMENT_MONTHS || verifiedAmount >= TOTAL_REPAYMENT_AMOUNT) {
        repaymentKey = 'fully_paid';
      } else if (verifiedMonths.size > 0 || verifiedAmount > 0) {
        repaymentKey = 'partial_paid';
      }

      return {
        ...entry.meta,
        repayment: {
          key: repaymentKey,
          label: repaymentStandingLabel(repaymentKey),
          verifiedAmount,
          verifiedMonthCount: verifiedMonths.size,
          verifiedAmountByMonth,
          calendarMonthsPassed,
          monthsPassed: rateDenominator,
          monthsPaid,
          monthsPaidFraction: `${monthsPaid}/${rateDenominator}`,
          rate,
          recordCount: records.length,
        },
        repaymentRecords: records,
      };
    });
  }

  function renderOverviewSummary() {
    const beneficiaryTotal = Number(state.beneficiarySummary?.total ?? 0);
    const scopedRepaymentRoster = buildScopedRepaymentRoster(state.beneficiaryRoster, state.repaymentRecords);
    const repaymentCounts = countByText(scopedRepaymentRoster, (item) => item.repayment?.label || item.repayment?.key);
    const repaymentTotal = countMatching(repaymentCounts, ['Fully Paid', 'Fully Verified'])
      + countMatching(repaymentCounts, ['Partial Paid', 'Partially Verified'])
      + countMatching(repaymentCounts, ['Under Review'])
      + countMatching(repaymentCounts, ['Needs Correction'])
      + countMatching(repaymentCounts, ['Rejected']);
    setText('poSummaryClients', String(state.summary.applications || 0));
    setText('poSummaryRepayments', String(repaymentTotal));
    setText('poSummaryBeneficiaries', String(beneficiaryTotal));
    updateSidebarBadges();
    renderOverviewCharts();
  }

  function formatPhpAmount(value) {
    return `PHP ${safeNumber(value).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatPesoAmount(value) {
    return `\u20b1${safeNumber(value).toLocaleString('en-PH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }

  function setSidebarBadge(section, count) {
    const badge = document.querySelector(`[data-section-badge="${section}"]`);
    if (!badge) return;
    const safeCount = Math.max(0, safeNumber(count));
    if (safeCount <= 0) {
      badge.textContent = '';
      badge.hidden = true;
      return;
    }
    badge.textContent = String(safeCount);
    badge.hidden = false;
  }

  function countActionableRepaymentSubmissions(records) {
    return (records || []).reduce((total, record) => {
      const stage = normalizeRepaymentStage(record?.stage);
      return ['under_review', 'needs_correction', 'rejected'].includes(stage) ? total + 1 : total;
    }, 0);
  }

  function updateSidebarBadges() {
    setSidebarBadge('applications', Array.isArray(state.applications) ? state.applications.length : 0);
    setSidebarBadge('repayments', countActionableRepaymentSubmissions(state.repaymentRecords));
  }

  function renderOverviewCharts() {
    const beneficiaryCounts = countDashboardEntries(state.beneficiaryRoster, (item) => beneficiaryStatusLabel(item.programStatus || 'active'));
    const repaymentCounts = countDashboardEntries(
      buildScopedRepaymentRoster(state.beneficiaryRoster, state.repaymentRecords),
      (item) => item.repayment?.label || item.repayment?.key || 'No Upload Yet'
    );
    const trainingDistribution = state.trainingAttendanceSummary || initialOverview.trainingAttendanceSummary || { segments: [], total: 0 };

    const beneficiaryEntries = [
      { key: 'deceased', label: 'Deceased', count: safeNumber(beneficiaryCounts.get('deceased')?.count || 0), forceDisplay: true },
      { key: 'inactive', label: 'Inactive', count: safeNumber(beneficiaryCounts.get('inactive')?.count || 0), forceDisplay: true },
      { key: 'active', label: 'Active', count: safeNumber(beneficiaryCounts.get('active')?.count || 0), forceDisplay: true },
    ];
    const repaymentEntries = Array.from(repaymentCounts.values());
    const trainingEntries = Array.isArray(trainingDistribution?.segments) ? trainingDistribution.segments : [];

    renderPoDashboardChart('poTrainingAttendanceChart', trainingEntries, TRAINING_ATTENDANCE_COLORS, 'No attendance records yet.');
    renderPoDashboardLegend(
      'poTrainingAttendanceLegend',
      'poTrainingAttendanceFooter',
      trainingEntries,
      TRAINING_ATTENDANCE_COLORS,
      (items, total) => {
        const largest = items.slice().sort((left, right) => safeNumber(right.count) - safeNumber(left.count))[0];
        return largest ? `${largest.label}: ${safeNumber(largest.count)} of ${total}.` : 'No attendance records yet.';
      },
      'No attendance records yet.'
    );

    renderPoDashboardChart('poBeneficiariesStatusChart', beneficiaryEntries, BENEFICIARY_STATUS_COLORS, 'No beneficiary records yet.');
    renderPoDashboardLegend(
      'poBeneficiariesStatusLegend',
      'poBeneficiariesStatusFooter',
      beneficiaryEntries,
      BENEFICIARY_STATUS_COLORS,
      (_items, total) => `${total} scoped beneficiar${total === 1 ? 'y' : 'ies'} tracked.`,
      'No beneficiary records yet.'
    );

    renderPoDashboardChart('poRepaymentVerificationRateChart', repaymentEntries, REPAYMENT_STATUS_COLORS, 'No repayment records yet.');
    renderPoDashboardLegend(
      'poRepaymentVerificationRateLegend',
      'poRepaymentVerificationRateFooter',
      repaymentEntries,
      REPAYMENT_STATUS_COLORS,
      (items, total) => {
        const largest = items.slice().sort((left, right) => safeNumber(right.count) - safeNumber(left.count))[0];
        const percentage = largest && total > 0 ? Math.round((safeNumber(largest.count) / total) * 100) : 0;
        return largest ? `${largest.label}: ${safeNumber(largest.count)} records, ${percentage}%.` : 'No repayment records yet.';
      },
      'No repayment records yet.'
    );
  }

  function renderPoReportsPerformanceChart(root, rows, period = 'monthly') {
    if (!root) return;
    const safeRows = Array.isArray(rows) ? rows : [];
    if (!safeRows.length) {
      root.innerHTML = '<p class="reports-empty">No repayment records yet.</p>';
      return;
    }

    const series = [
      { key: 'targetAmount', label: 'Target', color: '#2563eb' },
      { key: 'actualCollectedAmount', label: 'Actual', color: '#16a34a' },
      { key: 'gapAmount', label: 'Gap', color: '#dc2626' },
    ];
    const values = [];
    safeRows.forEach((row) => {
      series.forEach((item) => values.push(safeNumber(row[item.key])));
    });
    const rawMax = Math.max(...values, 1);
    const step = niceAxisStep(rawMax);
    const maxValue = Math.max(step, Math.ceil(rawMax / step) * step);
    const ticks = [];
    for (let value = maxValue; value >= 0; value -= step) {
      ticks.push(value);
    }

    const xAxisTitle = period === 'quarterly' ? 'Quarters' : period === 'yearly' ? 'Years' : 'Months';

    root.innerHTML = `
      <div class="reports-monthly-payment-chart" role="img" aria-label="Repayment performance for scoped PDO beneficiaries">
        <div class="reports-monthly-payment-chart__body">
          <div class="reports-monthly-payment-chart__axis-title">Payments</div>
          <div class="reports-monthly-payment-chart__axis">
            ${ticks.map((value) => `<span>${escapeHtml(Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</span>`).join('')}
          </div>
          <div class="reports-monthly-payment-chart__plot">
            <div class="reports-monthly-payment-chart__canvas" style="--month-count:${safeRows.length};">
              <div class="reports-monthly-payment-chart__guides">
                ${ticks.map(() => '<i></i>').join('')}
              </div>
              <div class="reports-monthly-payment-chart__groups">
                ${safeRows.map((row) => `
                  <article class="reports-monthly-payment-chart__group">
                    <div class="reports-monthly-payment-chart__bars">
                      ${series.map((item) => {
                        const value = safeNumber(row[item.key]);
                        const height = maxValue > 0 ? Math.max(value > 0 ? 3 : 0, (value / maxValue) * 100) : 0;
                        return `
                          <span class="reports-monthly-payment-chart__bar" style="--bar-height:${height}%;--bar-color:${item.color};" title="${escapeHtml(item.label)}: ${formatPesoAmount(value)}">
                            <strong>${escapeHtml(formatReportCurrencyLabel(value))}</strong>
                          </span>
                        `;
                      }).join('')}
                    </div>
                    <span class="reports-monthly-payment-chart__month">${escapeHtml(String(row.label || row.period || '').toUpperCase())}</span>
                  </article>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="reports-monthly-payment-chart__legend">
            ${series.map((item) => `<span><i style="background:${item.color}"></i>${escapeHtml(item.label)}</span>`).join('')}
          </div>
        </div>
        <div class="reports-monthly-payment-chart__x-title">${escapeHtml(xAxisTitle)}</div>
      </div>
    `;
  }

  function reportControlValue(id, fallback = '') {
    const node = document.getElementById(id);
    return String(node?.value ?? fallback ?? '');
  }

  // Build the PDO reports view from the currently selected filters and live scoped analytics payload.
  function renderReportsSection() {
    if (initReports()) {
      return;
    }
    syncReportsFilterControls();
    if (document.getElementById('reports-section')?.style.display !== 'none') {
      fetchPoReportData();
    }
  }

  function renderOverviewContextCards() {
    renderAssignedBarangaysCard();
    renderTrainingSnapshotCard();
    renderBeneficiarySnapshotCard();
  }

  function renderAssignedBarangaysCard() {
    const barangayList = document.getElementById('poBarangayList');
    if (!barangayList) return;
    barangayList.innerHTML = state.scopeBarangays.length
      ? state.scopeBarangays.map((item) => `<span class="po-mini-chip">${escapeHtml(item.name)}</span>`).join('')
      : '<span class="po-mini-chip">No assignments yet</span>';
  }

  function renderTrainingSnapshotCard() {
    const root = document.getElementById('poOverviewTrainingSnapshot');
    if (!root) return;
    const summary = state.training.summary || {};
    const attendancePending = Math.max(0, Number(summary.participants || 0) - Number(summary.completed || 0));
    root.innerHTML = `<div class="po-overview-mini-list"><div class="po-overview-stat-line"><span>Active Training Programs</span><strong>${escapeHtml(String(summary.total || 0))}</strong></div><div class="po-overview-stat-line"><span>Participants Assigned</span><strong>${escapeHtml(String(summary.participants || 0))}</strong></div><div class="po-overview-stat-line"><span>Attendance Pending</span><strong>${escapeHtml(String(attendancePending))}</strong></div></div><div class="po-overview-quick-actions"><button type="button" class="action-button po-case-action" data-overview-open-section="training"><i class="fas fa-chalkboard-user"></i><span>Open Training Pipeline</span></button></div>`;
  }

  function renderBeneficiarySnapshotCard() {
    const root = document.getElementById('poOverviewBeneficiarySnapshot');
    if (!root) return;
    const activeBeneficiaries = Number(state.beneficiarySummary?.total ?? 0);
    const pendingVerification = Number(state.beneficiarySummary?.pendingVerification ?? state.beneficiarySummary?.pending ?? 0);
    const verifiedRepayments = Number(state.beneficiarySummary?.verifiedRepayments ?? state.beneficiarySummary?.verified ?? 0);
    root.innerHTML = `<div class="po-overview-mini-list"><div class="po-overview-stat-line"><span>Active Beneficiaries</span><strong>${escapeHtml(String(activeBeneficiaries))}</strong></div><div class="po-overview-stat-line"><span>Pending Verification</span><strong>${escapeHtml(String(pendingVerification))}</strong></div><div class="po-overview-stat-line"><span>Verified Repayments</span><strong>${escapeHtml(String(verifiedRepayments))}</strong></div></div><div class="po-overview-quick-actions"><button type="button" class="action-button po-case-action" data-overview-open-section="repayments"><i class="fas fa-wallet"></i><span>Open Repayment Checking</span></button></div>`;
  }

  async function handleOverviewClick(event) {
    const button = event.target.closest('[data-open-application]');
    if (button) {
      return handleApplicationClick(event);
    }
    const sectionButton = event.target.closest('[data-overview-open-section]');
    if (!sectionButton) return;
    showSection(String(sectionButton.dataset.overviewOpenSection || 'clients'));
  }

  async function handleApplicationClick(event) {
    const button = event.target.closest('[data-open-application]');
    if (!button) return;
    const response = await apiGet('api/applications/show', { id: Number(button.dataset.openApplication) });
    if (!response.ok || !response.application) return showToast(response.message || 'Unable to load the application.', 'warning');
    state.activePreviewToken = '';
    state.activePreviewOwnerId = Number(response.application.id || 0) || null;
    state.activeApplication = response.application;
    renderApplicationModal();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('poApplicationModal')).show();
  }

  // Render the scoped application review modal, including requirement navigation and approval readiness.
  function renderApplicationModal() {
    const app = state.activeApplication;
    const ready = app.approvalReadiness || {};
    setText('po-app-modal-applicant', app.applicantName || '--');
    setText('po-app-modal-submitted', formatDate(app.submittedAt));
    setText('po-app-modal-status', app.status || '--');
    setStatusChipClass('po-app-modal-status', app.status);
    setText('po-app-modal-barangay', app.barangay || '--');
    setText('po-app-modal-business', app.businessName || '--');
    setText('po-app-modal-contact', app.contactNumber || app.email || '--');
    setText('po-app-modal-batch-no', formatBatchNo(app.batchNo));
    const livelihoodCategoryInput = document.getElementById('po-app-modal-livelihood-category-input');
    if (livelihoodCategoryInput) {
      livelihoodCategoryInput.value = app.livelihoodCategory || '';
    }
    setText('po-app-modal-sector', app.sector || '--');
    setText('po-app-modal-sector-other', app.sectorOtherSpecify || '--');
    setText('po-app-modal-livelihood', app.livelihood || '--');
    setText('po-app-readiness-status', ready.overallStatus || 'Under Review');
    setText('po-app-upload-summary', `${ready.uploadSummary?.approved || 0} / ${ready.uploadSummary?.total || 0}`);
    const trainingForms = (app.formRequirements || []).filter((r) => String(r.key || '').toLowerCase() !== 'fund_release_evidence');
    setText('po-app-form-summary', `${ready.formSummary?.approved || 0} / ${ready.formSummary?.total || trainingForms.length}`);

    const trainingProgress = ready.trainingStatus?.displayStatus || ready.trainingStatus?.status || '--';
    const trainingCompletion = ready.trainingStatus?.completionStatus || '';
    setText('po-app-training-status', trainingCompletion ? `${trainingProgress} - ${trainingCompletion}` : trainingProgress);
    setText('po-app-training-chip', ready.trainingStatus?.completed ? 'Training Completed' : 'Training Pending');
    setStatusChipClass('po-app-training-chip', ready.trainingStatus?.completed ? 'Completed' : 'Pending');
    const assistanceProofTask = assistanceProofTaskFor(app);
    const assistanceProofStatus = assistanceProofStatusLabel(assistanceProofTask, app);
    setText('po-app-assistance-proof-status', assistanceProofStatus);
    setText('po-upload-review-count', formatRequirementCount(app.requirements || []));
    setText('po-form-review-count', formatRequirementCount(trainingForms));
    setText('po-review-total-count', formatRequirementCount([...(app.requirements || []), ...(app.formRequirements || [])]));
    const blockerList = document.getElementById('po-app-readiness-blockers');
    if (blockerList) blockerList.innerHTML = (ready.blockers || []).length
      ? ready.blockers.map((item) => `<li class="po-blocker-item"><span class="po-blocker-item__icon" aria-hidden="true">!</span><span>${escapeHtml(item)}</span></li>`).join('')
      : '<li class="po-blocker-item po-blocker-item--clear"><span class="po-blocker-item__icon" aria-hidden="true">OK</span><span>Ready for approval action. No blocking reasons recorded.</span></li>';
    setText('po-decision-status-note', ready.canApprove ? 'Application is ready for approval.' : 'Approval is currently blocked.');
    setText('po-decision-blocker-note', ready.canApprove
      ? 'All required upload requirements, fill-up form requirements, training conditions, and proof of assistance are satisfied.'
      : ((ready.blockers || []).slice(0, 2).join(' | ') || 'Resolve any blocking requirement, training issue, or proof of assistance before approval.'));
    const approveButton = document.getElementById('po-app-modal-approve');
    if (approveButton) approveButton.disabled = !ready.canApprove;
    ensureActivePreview(app);
    renderRequirementNavigator();
    renderPreviewPanel();
    renderRequirementInspector();
    const assistanceToggle = document.getElementById('po-app-modal-assisted');
    if (assistanceToggle) assistanceToggle.checked = String(app.status || '').toLowerCase() === 'completed';
    state.assistanceReceivedSelection = !!assistanceToggle?.checked;
    renderAssistanceStatus(app);
    updateFinalApprovalDecisionState(app);
  }

  function finalApprovalDecisionState(app = state.activeApplication) {
    const ready = app?.approvalReadiness || {};
    const assistance = app?.assistanceStatus || null;
    const assistanceToggle = document.getElementById('po-app-modal-assisted');
    const alreadyApproved = !!assistance?.isApprovedBeneficiary || String(app?.status || '').toLowerCase() === 'completed';
    const assistanceConfirmed = alreadyApproved || !!state.assistanceReceivedSelection || !!assistanceToggle?.checked;
    const assistanceProofTask = assistanceProofTaskFor(app);

    if (alreadyApproved) {
      return {
        enabled: false,
        title: 'Applicant is already an approved beneficiary.',
        statusTitle: 'Already approved beneficiary.',
        statusCopy: 'Assistance has already been recorded for this applicant.',
      };
    }

    if (!ready.canApprove) {
      if (assistanceConfirmed
        && assistanceProofTask
        && String(assistanceProofTask.status || '').toLowerCase() === 'locked'
        && !formRequirementFile(assistanceProofTask)?.url) {
        return {
          enabled: false,
          title: 'Upload and review the proof of assistance before final approval.',
          statusTitle: 'Proof of assistance still needed.',
          statusCopy: 'Upload the proof of assistance received, then review and approve that requirement before final approval.',
        };
      }
      return {
        enabled: false,
        title: ((ready.blockers || []).slice(0, 2).join(' | ')) || 'Resolve the blocking reasons before approval.',
        statusTitle: 'Approval is currently blocked.',
        statusCopy: ((ready.blockers || []).slice(0, 2).join(' | ')) || 'Resolve any blocking requirement or training issue before approval.',
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
  }

  function updateFinalApprovalDecisionState(app = state.activeApplication) {
    const finalApproval = finalApprovalDecisionState(app);
    setText('po-decision-status-note', finalApproval.statusTitle);
    setText('po-decision-blocker-note', finalApproval.statusCopy);
    const approveButton = document.getElementById('po-app-modal-approve');
    if (approveButton) {
      approveButton.disabled = !finalApproval.enabled;
      approveButton.title = finalApproval.title;
    }
  }

  function isAssistanceConfirmed(app = state.activeApplication) {
    const assistance = app?.assistanceStatus || null;
    const assistanceToggle = document.getElementById('po-app-modal-assisted');
    const alreadyApproved = !!assistance?.isApprovedBeneficiary || String(app?.status || '').toLowerCase() === 'completed';
    return alreadyApproved || !!state.assistanceReceivedSelection || !!assistanceToggle?.checked;
  }

  function isAssistanceProofRequirement(item) {
    return String(item?.key || item?.type || '').toLowerCase() === 'fund_release_evidence'
      || String(item?.type || '').toLowerCase() === 'final_assistance_proof';
  }

  function assistanceProofTaskFor(app = state.activeApplication) {
    return (app?.formRequirements || []).find((item) => isAssistanceProofRequirement(item)) || null;
  }

  function isAssistanceProofLocked(item, app = state.activeApplication) {
    if (!isAssistanceProofRequirement(item)) return false;
    const status = String(item?.status || '').toLowerCase();
    if (['submitted', 'verified', 'approved', 'needs correction', 'needs_correction', 'rejected'].includes(status)) return false;
    if (formRequirementFile(item)?.url) return false;
    return !isAssistanceConfirmed(app);
  }

  function assistanceProofStatusLabel(item, app = state.activeApplication) {
    if (!item) return 'Not yet uploaded';
    if (isAssistanceProofLocked(item, app)) return 'Locked';
    const status = String(item.status || '').toLowerCase();
    if (status === 'verified' || status === 'approved') return 'Verified';
    if (status === 'submitted') return 'Submitted';
    if (status === 'needs correction' || status === 'needs_correction') return 'Needs Correction';
    if (status === 'rejected') return 'Rejected';
    if (formRequirementFile(item)?.url) return 'Uploaded';
    return 'Pending';
  }

  function visualRequirementStatus(item, app = state.activeApplication) {
    if (isAssistanceProofRequirement(item) && !isAssistanceProofLocked(item, app)) {
      const status = String(item?.status || '').toLowerCase();
      if (status === 'locked' || status === '') return 'Pending';
    }
    return item?.status || 'Pending';
  }

  function renderAssistanceStatus(app = state.activeApplication) {
    const root = document.getElementById('po-app-assisted-status');
    const title = document.getElementById('po-app-assisted-status-title');
    const copy = document.getElementById('po-app-assisted-status-copy');
    const recordButton = document.getElementById('po-app-assisted-record');
    const assistanceToggle = document.getElementById('po-app-modal-assisted');
    if (!root || !title || !copy) return;

    const assistance = app?.assistanceStatus || null;
    const previewEnabled = !!assistanceToggle?.checked;
    if (recordButton) recordButton.hidden = true;
    if (assistance?.isApprovedBeneficiary) {
      title.textContent = 'Already an approved beneficiary';
      copy.textContent = assistance.approvedAt
        ? `Assistance received on ${formatDateTimeDetailed(assistance.approvedAt)}. First repayment due date is ${formatDate(assistance.firstRepaymentDueDate)}.`
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
      copy.textContent = 'Once you approve this as already assisted, the system will record the exact approval date and time. The first repayment due date will be set one month later.';
      root.hidden = false;
      return;
    }

    root.hidden = true;
    title.textContent = '';
    copy.textContent = '';
    if (recordButton) recordButton.hidden = true;
  }

  function formatRequirementCount(items) {
    const total = items.length || 0;
    return `${total} ${total === 1 ? 'item' : 'items'}`;
  }

  function formReviewTaskId(item) {
    return Number(item?.reviewTaskId || item?.taskId || item?.id || 0);
  }

  function ensureActivePreview(app) {
    const appId = Number(app?.id || 0) || null;
    if (state.activePreviewOwnerId !== appId) {
      state.activePreviewToken = '';
      state.activePreviewOwnerId = appId;
    }
    if (resolvePreviewItem(state.activePreviewToken, app)) return;
    const firstUpload = (app.requirements || []).find((item) => item.file?.url);
    if (firstUpload) {
      state.activePreviewToken = `upload:${String(firstUpload.key)}`;
      return;
    }
    const firstForm = (app.formRequirements || []).find((item) => formReviewUrl(item, true));
    state.activePreviewToken = firstForm ? `form:${String(formReviewTaskId(firstForm) || firstForm.key || '')}` : '';
  }

  function resolvePreviewItem(token, app = state.activeApplication) {
    if (!token || !app) return null;
    const [kind, rawId] = String(token).split(':');
    if (kind === 'upload') return (app.requirements || []).find((item) => String(item.key) === rawId) ? { kind, item: (app.requirements || []).find((item) => String(item.key) === rawId) } : null;
    if (kind === 'form') return (app.formRequirements || []).find((item) => String(formReviewTaskId(item) || item.key || '') === rawId) ? { kind, item: (app.formRequirements || []).find((item) => String(formReviewTaskId(item) || item.key || '') === rawId) } : null;
    return null;
  }

  function renderPreviewPanel() {
    const root = document.getElementById('po-app-preview');
    if (!root) return;
    const preview = resolvePreviewItem(state.activePreviewToken);
    if (!preview) {
      setText('po-preview-title', 'Select a requirement');
      setText('po-preview-chip', 'No preview');
      root.innerHTML = '<div class="po-preview-empty">Select an uploaded requirement or fill-up form to review it here.</div>';
      return;
    }

    const item = preview.item;
    const isFinalAssistanceProof = preview.kind === 'form' && isAssistanceProofRequirement(item);
    const proofLocked = isFinalAssistanceProof && isAssistanceProofLocked(item);
    const submittedLabel = preview.kind === 'upload' ? (item.file?.name || item.label || '--') : (item.label || '--');
    setText('po-preview-title', submittedLabel);
    setText('po-preview-chip', preview.kind === 'upload'
      ? 'Upload Requirement'
      : (isFinalAssistanceProof ? 'Final Assistance Requirement' : 'Fill-up Form Requirement'));

    if (preview.kind === 'upload') {
      const url = item.file?.url || '';
      const mime = String(item.file?.type || '').toLowerCase();
      if (!url) {
        root.innerHTML = '<div class="po-preview-empty">No file was submitted for this requirement.</div>';
        return;
      }
      if (mime.startsWith('image/')) {
        root.innerHTML = `<div class="po-preview-frame po-preview-frame--image"><img src="${escapeHtml(url)}" alt="${escapeHtml(item.label || 'Requirement preview')}"></div>`;
        return;
      }
      if (mime.includes('pdf') || mime.startsWith('text/')) {
        root.innerHTML = `<div class="po-preview-frame"><iframe src="${escapeHtml(url)}" title="${escapeHtml(item.label || 'Requirement preview')}"></iframe></div>`;
        return;
      }
      root.innerHTML = `<div class="po-preview-file-card"><strong>${escapeHtml(item.file?.name || item.label || 'Requirement file')}</strong><span>${escapeHtml(item.file?.type || 'File preview is not available in-panel.')}</span><a class="action-button" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open file</a></div>`;
      return;
    }

    const uploadedFormFile = preview.kind === 'form' ? formRequirementFile(item) : null;
    const reviewUrl = formReviewUrl(item, false);
    if (isFinalAssistanceProof && uploadedFormFile?.url) {
      renderPreviewFile(root, uploadedFormFile, item.label || 'Proof of Assistance Received');
      return;
    }
    if (isFinalAssistanceProof && proofLocked) {
      root.innerHTML = `<div class="po-preview-file-card"><strong>${escapeHtml(item.label || 'Proof of Assistance Received')}</strong><span>Check "Already received assistance" first to unlock this upload requirement in the review modal.</span></div>`;
      return;
    }
    root.innerHTML = `<div class="po-preview-file-card"><strong>${escapeHtml(item.label || 'Fill-up form')}</strong><span>${escapeHtml(isFinalAssistanceProof
      ? 'Upload the official proof here, then open the review sheet to verify it before approval.'
      : 'Review the requirement status here, or open the applicant-filled form separately for full paper-form checking.')}</span>${isFinalAssistanceProof
      ? (uploadedFormFile?.url
        ? `<a class="action-button" href="${escapeHtml(reviewUrl)}" data-open-form-review="${escapeHtml(reviewUrl)}">Open review sheet</a><a class="action-button action-button--quiet" href="${escapeHtml(uploadedFormFile.url)}" target="_blank" rel="noopener">Open uploaded proof</a>`
        : '<span class="po-preview-empty">Upload the proof file from the requirement navigator to continue.</span>')
      : `<a class="action-button" href="${escapeHtml(reviewUrl)}" data-open-form-review="${escapeHtml(reviewUrl)}">Review applicant form</a>${uploadedFormFile?.url ? `<a class="action-button action-button--quiet" href="${escapeHtml(uploadedFormFile.url)}" target="_blank" rel="noopener">Open uploaded copy</a>` : ''}`}</div>`;
  }

  function requirementSubmissionLabel(kind, item) {
    if (kind === 'upload') return item.file?.url ? 'Submitted' : 'Missing';
    if (isAssistanceProofLocked(item)) return 'Locked';
    return ['submitted', 'verified', 'rejected', 'needs correction'].includes(String(item.status || '').toLowerCase()) ? 'Submitted' : 'Missing';
  }

  function requirementSubmissionClass(kind, item) {
    const label = requirementSubmissionLabel(kind, item);
    if (label === 'Submitted') return 'is-info';
    if (label === 'Locked') return 'is-muted';
    return 'is-danger';
  }

  function formReviewUrl(item, embedded = false) {
    const taskId = formReviewTaskId(item);
    if (taskId > 0) {
      return routeUrl(`post-approval-review?task_id=${encodeURIComponent(String(taskId))}${embedded ? '&embed=1' : ''}`);
    }

    const fallbackUrl = String(item?.reviewUrl || '').trim();
    if (!fallbackUrl) return '';

    if (embedded) {
      return fallbackUrl.includes('embed=1')
        ? fallbackUrl
        : `${fallbackUrl}${fallbackUrl.includes('?') ? '&' : '?'}embed=1`;
    }

    return fallbackUrl
      .replace(/([?&])embed=1(&?)/, (_, prefix, suffix) => (prefix === '?' && suffix ? '?' : suffix ? prefix : ''))
      .replace(/[?&]$/, '');
  }

  function getReviewItems(app = state.activeApplication) {
    if (!app) return [];
    return [
      ...(app.requirements || []).map((item) => ({ token: `upload:${String(item.key)}`, kind: 'upload', item })),
      ...(app.formRequirements || []).map((item) => ({ token: `form:${String(formReviewTaskId(item) || item.key || '')}`, kind: 'form', item })),
    ];
  }

  function renderRequirementNavigator() {
    const root = document.getElementById('po-requirement-nav');
    if (!root) return;
    const items = getReviewItems();
    if (!items.length) {
      root.innerHTML = '<div class="po-preview-empty">No requirements loaded.</div>';
      return;
    }
    root.innerHTML = items.map(({ token, kind, item }) => {
      const selected = state.activePreviewToken === token;
      const itemKey = String(kind === 'upload' ? item.key : formReviewTaskId(item) || item.key || '');
      const formUploadKey = String(kind === 'form' ? item.key || formReviewTaskId(item) || '' : itemKey);
      const uploadedFormFile = kind === 'form' ? formRequirementFile(item) : null;
      const proofLocked = kind === 'form' && isAssistanceProofLocked(item);
      const statusValue = visualRequirementStatus(item);
      const statusLabel = requirementStatusLabel(statusValue);
      const uploadControl = kind === 'form'
        ? `<div class="po-requirement-card__actions"><input class="po-review-upload-input" id="po-form-upload-${escapeAttribute(formUploadKey)}" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" data-form-upload-input="${escapeAttribute(formUploadKey)}" hidden><button type="button" class="action-button action-button--quiet po-requirement-card__upload" data-trigger-form-upload="${escapeAttribute(formUploadKey)}" ${proofLocked ? 'disabled title="Confirm \\"Already received assistance\\" first."' : ''}>${proofLocked ? 'Locked until assistance is confirmed' : (uploadedFormFile?.url ? 'Replace uploaded file' : 'Upload file')}</button></div>`
        : '';
      return `<article class="po-requirement-card ${selected ? 'is-active' : ''}"><button type="button" class="po-requirement-card__select" data-select-requirement="${escapeAttribute(token)}"><div class="po-requirement-card__top"><strong>${escapeHtml(item.label || '--')}</strong><span class="po-status-pill ${requirementStatusClass(statusValue)}">${escapeHtml(statusLabel)}</span></div><div class="po-requirement-card__meta"><span>${escapeHtml(item.typeLabel || '--')}</span><span class="po-status-pill ${requirementSubmissionClass(kind, item)}">${escapeHtml(requirementSubmissionLabel(kind, item))}</span></div></button>${uploadControl}</article>`;
    }).join('');
  }

  function renderRequirementInspector() {
    const root = document.getElementById('po-review-inspector');
    if (!root) return;
    const preview = resolvePreviewItem(state.activePreviewToken);
    if (!preview) {
      setText('po-inspector-title', 'Select a requirement');
      setText('po-inspector-chip', 'No selection');
      root.innerHTML = '<div class="po-preview-empty">Select a requirement from the navigator to review it.</div>';
      return;
    }
    const { kind, item } = preview;
    const itemKey = String(kind === 'upload' ? item.key : formReviewTaskId(item) || item.key || '');
    const statusValue = visualRequirementStatus(item);
    const statusLabel = requirementStatusLabel(statusValue);
    const reviewUrl = kind === 'upload' ? '' : formReviewUrl(item, false);
    const uploadedFormFile = kind === 'form' ? formRequirementFile(item) : null;
    const formSubmittedOnline = kind === 'form' && requirementSubmissionLabel(kind, item) === 'Submitted';
    const canReviewUpload = kind === 'upload' && !!item.file?.url;
    const isFinalAssistanceProof = kind === 'form' && isAssistanceProofRequirement(item);
    const proofLocked = isFinalAssistanceProof && isAssistanceProofLocked(item);
    const canReviewForm = kind === 'form' && !proofLocked && (item.canReview !== false) && (requirementSubmissionLabel(kind, item) === 'Submitted');
    const canReviewItem = canReviewUpload || canReviewForm;
    const showInlineDecisionActions = canReviewUpload;
    const reviewActions = showInlineDecisionActions
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
              ? (proofLocked
                ? 'Check "Already received assistance" first to unlock this proof upload.'
                : 'Upload the proof file first, then review it here before final approval.')
              : 'This form requirement cannot be reviewed until the PDO form upload is submitted.')
        }</div>`;
    setText('po-inspector-title', item.label || 'Requirement');
    setText('po-inspector-chip', item.typeLabel || '--');
    root.innerHTML = `<div class="po-inspector-summary"><div class="po-inspector-summary__row"><span>Submission State</span><strong><span class="po-status-pill ${requirementSubmissionClass(kind, item)}">${escapeHtml(requirementSubmissionLabel(kind, item))}</span></strong></div><div class="po-inspector-summary__row"><span>Requirement Status</span><strong><span class="po-status-pill ${requirementStatusClass(statusValue)}">${escapeHtml(statusLabel)}</span></strong></div></div>${kind === 'form' ? `<div class="po-inspector-summary"><div class="po-inspector-summary__row"><span>${escapeHtml(isFinalAssistanceProof ? 'Upload control' : 'Online form')}</span><strong>${escapeHtml(isFinalAssistanceProof ? (proofLocked ? 'Locked until assistance is confirmed' : 'Pending') : (formSubmittedOnline ? 'Submitted by applicant' : 'Not submitted yet'))}</strong></div><div class="po-inspector-summary__row"><span>${escapeHtml(isFinalAssistanceProof ? 'Uploaded proof' : 'Optional uploaded copy')}</span><strong>${escapeHtml(uploadedFormFile?.name || 'No file uploaded')}</strong></div><div class="po-inspector-summary__row"><span>Submitted / uploaded</span><strong>${uploadedFormFile?.uploadedAt ? escapeHtml(formatDate(uploadedFormFile.uploadedAt)) : '--'}</strong></div></div><div class="po-inspector-actions">${isFinalAssistanceProof ? `${uploadedFormFile?.url ? `<a class="action-button" href="${escapeHtml(uploadedFormFile.url)}" target="_blank" rel="noopener">Open uploaded proof</a>` : ''}${uploadedFormFile?.url ? `<a class="action-button action-button--quiet" href="${escapeHtml(formReviewUrl(item, false))}" data-open-form-review="${escapeHtml(formReviewUrl(item, false))}">Open review sheet</a>` : ''}` : `<a class="action-button" href="${escapeHtml(formReviewUrl(item, false))}" data-open-form-review="${escapeHtml(formReviewUrl(item, false))}">Review applicant form</a>`}</div>` : ''}${reviewActions}${reviewNote}`;
  }

  async function handleReviewClick(event) {
    const formReviewLink = event.target.closest('[data-open-form-review]');
    if (formReviewLink) {
      event.preventDefault();
      const url = String(formReviewLink.dataset.openFormReview || '').trim();
      if (url) {
        window.location.href = url;
      }
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
    const preview = event.target.closest('[data-open-preview]');
    if (preview) {
      state.activePreviewToken = preview.dataset.openPreview || '';
      renderRequirementNavigator();
      renderPreviewPanel();
      renderRequirementInspector();
      return;
    }
    const uploadTrigger = event.target.closest('[data-trigger-form-upload]');
    if (uploadTrigger) {
      document.getElementById(`po-form-upload-${uploadTrigger.dataset.triggerFormUpload}`)?.click();
      return;
    }
    const reviewAction = event.target.closest('[data-review-item]');
    if (reviewAction) {
      const [kind, itemKey, decision] = String(reviewAction.dataset.reviewItem || '').split(':');
      if (!kind || !itemKey || !decision) return;
      await submitRequirementReview(kind, itemKey, decision);
    }
  }

  async function handleReviewChange(event) {
    const input = event.target.closest('[data-form-upload-input]');
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    const requirementKey = String(input.dataset.formUploadInput || '').trim();
    if (!requirementKey || !state.activeApplication?.id) return;
    const formRequirement = (state.activeApplication.formRequirements || []).find((item) => String(item.key || '') === requirementKey);
    if (isAssistanceProofRequirement(formRequirement) && !isAssistanceConfirmed(state.activeApplication)) {
      input.value = '';
      showToast('Confirm "Already received assistance" first before uploading the proof of assistance.', 'warning');
      return;
    }

    const formData = new FormData();
    formData.append('applicationId', String(state.activeApplication.id));
    formData.append('requirementKey', requirementKey);
    formData.append('file', input.files[0]);
    if (isAssistanceProofRequirement(formRequirement)) {
      formData.append('assistanceConfirmed', '1');
    }

    const response = await apiFormPost('api/applications/upload-form-requirement', formData);
    input.value = '';
    if (!response.ok) {
      showToast(firstError(response.errors) || response.message || 'Unable to upload the form file.', 'warning');
      return;
    }
    if (response.application) {
      state.activeApplication = response.application;
      renderApplicationModal();
    } else {
      await refreshActiveApplication();
    }
    showToast('Form file uploaded.', 'success');
  }

  async function refreshActiveApplication() {
    if (!state.activeApplication?.id) return;
    const response = await apiGet('api/applications/show', { id: state.activeApplication.id });
    if (response.ok && response.application) {
      state.activeApplication = response.application;
      renderApplicationModal();
    }
    await loadDashboard();
  }

  async function handleLivelihoodCategoryChange(event) {
    if (!state.activeApplication?.id) return;
    const input = event.target;
    if (!(input instanceof HTMLSelectElement)) return;
    const livelihoodCategory = String(input.value || '').trim();
    const response = await apiPost('api/applications/update-livelihood-category', {
      applicationId: state.activeApplication.id,
      livelihoodCategory,
    });

    if (!response.ok) {
      showToast(firstError(response.errors) || response.message || 'Unable to save the generalized business category.', 'warning');
      input.value = state.activeApplication?.livelihoodCategory || '';
      return;
    }

    if (response.application) {
      state.activeApplication = response.application;
      renderApplicationModal();
    }
    await loadDashboard();
    showToast('Generalized business category saved.', 'success');
  }

  async function submitRequirementReview(kind, itemKey, decision) {
    if (!state.activeApplication?.id) return;
    const app = state.activeApplication;
    const preview = resolvePreviewItem(`${kind}:${itemKey}`, app);
    if (!preview?.item) return;

    const isCorrection = decision === 'needs_correction';
    const correctionRemark = isCorrection
      ? String(window.prompt(`Enter the correction note for ${preview.item.label || 'this requirement'}.`, 'Please review and resubmit this requirement.') || '').trim()
      : '';
    if (isCorrection && !correctionRemark) return;

    let response;
    if (kind === 'upload') {
      response = await apiPost('api/applications/review-requirement', {
        applicationId: app.id,
        requirementKey: itemKey,
        decision,
        remarks: isCorrection ? correctionRemark : 'Requirement approved by PDO.',
        applicantRemark: correctionRemark,
      });
    } else {
      const taskResponse = await apiGet('api/post-approval-review/task', { task_id: itemKey });
      if (!taskResponse.ok || !taskResponse.task) {
        showToast(taskResponse.message || 'Unable to load the form details for review.', 'warning');
        return;
      }
      response = await apiJsonPost('api/post-approval-review/review', {
        taskId: Number(itemKey),
        status: decision === 'approve' ? 'Verified' : 'Needs Correction',
        remarks: isCorrection ? correctionRemark : 'Form requirement approved by PDO.',
        applicantVisibleRemark: correctionRemark,
        staffForm: taskResponse.task?.payload?.staffReview || {},
      });
    }

    if (!response.ok) {
      showToast(firstError(response.errors) || response.message || 'Unable to save this requirement review.', 'warning');
      return;
    }

    await refreshActiveApplication();
    showToast(isCorrection ? 'Requirement marked for correction.' : 'Requirement approved.', 'success');
  }

  function openApprovalSummary() {
    if (!state.activeApplication) return;
    state.assistanceReceivedSelection = !!document.getElementById('po-app-modal-assisted')?.checked;
    const ready = state.activeApplication.approvalReadiness || {};
    const finalApproval = finalApprovalDecisionState(state.activeApplication);
    const trainingSummary = ready.trainingStatus?.completionStatus
      ? `${ready.trainingStatus?.displayStatus || ready.trainingStatus?.status || '--'} - ${ready.trainingStatus?.completionStatus}`
      : (ready.trainingStatus?.displayStatus || ready.trainingStatus?.status || '--');
    const assistanceProofTask = assistanceProofTaskFor(state.activeApplication);
    const assistanceProofStatus = assistanceProofStatusLabel(assistanceProofTask, state.activeApplication);
    const assistanceConfirmed = isAssistanceConfirmed(state.activeApplication);
    setText('po-summary-applicant', state.activeApplication.applicantName || 'Applicant');
    setText('po-summary-case-title', `${state.activeApplication.applicantName || 'Applicant'} approval check`);
    setText('po-summary-barangay', state.activeApplication.barangay || '--');
    setText('po-summary-upload', `${ready.uploadSummary?.approved || 0} / ${ready.uploadSummary?.total || 0}`);
    setText('po-summary-form', `${ready.formSummary?.approved || 0} / ${ready.formSummary?.total || 0}`);
    setText('po-summary-training', trainingSummary);
    setText('po-summary-assistance-proof', assistanceProofStatus);
    setText('po-summary-assistance-confirmation', assistanceConfirmed ? 'Confirmed' : 'Waiting for checkbox');
    setText(
      'po-summary-checklist-intro',
      assistanceConfirmed
        ? 'Each approval group below is ready to be double-checked before confirming the beneficiary record.'
        : 'Confirm "Already received assistance" first, then complete the final proof review before confirming approval.'
    );
    setText(
      'po-summary-readiness-text',
      finalApproval.enabled
        ? 'All required application requirements, training conditions, proof checks, and assistance confirmation are satisfied. Assistance received will be recorded when this approval is confirmed.'
        : finalApproval.statusCopy
    );
    setText('po-summary-status-chip', finalApproval.enabled ? 'Ready for Approval' : 'Approval Blocked');
    setStatusChipClass('po-summary-status-chip', finalApproval.enabled ? 'Approved' : (ready.overallStatus || 'Pending'));
    const list = document.getElementById('po-summary-checklist');
    if (list) {
      list.innerHTML = [
        buildApprovalSummaryGroup('Upload Requirements', state.activeApplication.requirements || []),
        buildApprovalSummaryGroup('Fill-up Form Requirements', (state.activeApplication.formRequirements || []).filter((r) => String(r.key || '').toLowerCase() !== 'fund_release_evidence')),
        buildApprovalSummaryGroup('Training', [{
          label: 'Training seminars',
          status: ready.trainingStatus?.completed ? 'approved' : 'pending',
          detail: trainingSummary,
        }]),
        buildApprovalSummaryGroup('Proof of Assistance Received', [{
          label: 'Proof of Assistance Received',
          status: assistanceProofTask ? assistanceProofTask.status : 'missing',
          detail: assistanceProofTask
            ? (isAssistanceProofLocked(assistanceProofTask, state.activeApplication)
              ? 'Locked until "Already received assistance" is checked.'
              : (assistanceProofTask.submittedAt ? `Submitted ${formatDate(assistanceProofTask.submittedAt)}` : assistanceProofStatus))
            : 'PDO has not yet uploaded proof of assistance release.',
        }]),
        buildApprovalSummaryGroup('Approval Confirmation', [{
          label: 'Already received assistance',
          status: assistanceConfirmed ? 'approved' : 'pending',
          detail: assistanceConfirmed
            ? 'Assistance release has been confirmed in this approval flow.'
            : 'Check the assistance confirmation box in the application review modal to unlock final approval.',
        }]),
      ].join('');
    }
    const blockers = document.getElementById('po-summary-blockers');
    if (blockers) blockers.innerHTML = (ready.blockers || []).length
      ? ready.blockers.map((item) => `<li class="po-blocker-item"><span class="po-blocker-item__icon" aria-hidden="true">!</span><span>${escapeHtml(item)}</span></li>`).join('')
      : `<li class="po-blocker-item po-blocker-item--clear"><span class="po-blocker-item__icon" aria-hidden="true">${finalApproval.enabled ? 'OK' : '!'}</span><span>${escapeHtml(finalApproval.enabled ? 'Ready for approval action. No blocking reasons recorded.' : finalApproval.statusCopy)}</span></li>`;
    const confirm = document.getElementById('po-summary-confirm');
    if (confirm) confirm.disabled = !finalApproval.enabled;
    state.returnToApplicationModal = false;
    const applicationModal = document.getElementById('poApplicationModal');
    const summaryModal = document.getElementById('poApprovalSummaryModal');
    const showSummary = () => bootstrap.Modal.getOrCreateInstance(summaryModal).show();
    if (applicationModal?.classList.contains('show')) {
      applicationModal.addEventListener('hidden.bs.modal', showSummary, { once: true });
      bootstrap.Modal.getOrCreateInstance(applicationModal).hide();
    } else {
      showSummary();
    }
  }

  function buildApprovalSummaryGroup(title, items) {
    const approvedCount = Array.isArray(items)
      ? items.filter((item) => requirementStatusLabel(visualRequirementStatus(item, state.activeApplication)) === 'Approved').length
      : 0;
    const totalCount = Array.isArray(items) ? items.length : 0;
    const rows = Array.isArray(items) && items.length
      ? items.map((item) => {
        const detail = item?.detail ? `<small>${escapeHtml(item.detail)}</small>` : '';
        const statusValue = visualRequirementStatus(item, state.activeApplication);
        return `<div class="po-summary-checkitem"><div class="po-summary-checkitem__copy"><strong>${escapeHtml(item?.label || '--')}</strong>${detail}</div><span class="po-status-pill ${requirementStatusClass(statusValue)}">${escapeHtml(requirementStatusLabel(statusValue))}</span></div>`;
      }).join('')
      : '<div class="po-summary-checkitem po-summary-checkitem--empty"><div class="po-summary-checkitem__copy"><strong>No items recorded</strong></div></div>';
    return `<section class="po-summary-group"><div class="po-summary-group__header"><span>${escapeHtml(title)}</span><strong class="po-summary-group__count">${totalCount > 0 ? `${approvedCount} / ${totalCount}` : '0 / 0'}</strong></div><div class="po-summary-group__items">${rows}</div></section>`;
  }

  function formRequirementFile(item) {
    return item && typeof item === 'object' && item.file && item.file.url ? item.file : (item?.file || null);
  }

  function renderPreviewFile(root, file, label) {
    const url = file?.url || '';
    const mime = String(file?.type || '').toLowerCase();
    if (!url) {
      root.innerHTML = '<div class="po-preview-empty">No file was uploaded for this form.</div>';
      return;
    }
    if (mime.startsWith('image/')) {
      root.innerHTML = `<div class="po-preview-frame po-preview-frame--image"><img src="${escapeHtml(url)}" alt="${escapeHtml(label || 'Uploaded form preview')}"></div>`;
      return;
    }
    if (mime.includes('pdf') || mime.startsWith('text/')) {
      root.innerHTML = `<div class="po-preview-frame"><iframe src="${escapeHtml(url)}" title="${escapeHtml(label || 'Uploaded form preview')}"></iframe></div>`;
      return;
    }
    root.innerHTML = `<div class="po-preview-file-card"><strong>${escapeHtml(file?.name || label || 'Uploaded form file')}</strong><span>${escapeHtml(file?.type || 'File preview is not available in-panel.')}</span><a class="action-button" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open file</a></div>`;
  }

  async function submitApplicationDecision(decision) {
    if (!state.activeApplication) return;
    const receivedAssistance = decision === 'approve'
      ? (state.assistanceReceivedSelection || !!document.getElementById('po-app-modal-assisted')?.checked)
      : false;
    const defaultRemarks = decision === 'reject' ? 'Application rejected by reviewer.' : '';
    const response = await apiPost('api/applications/review', {
      applicationId: state.activeApplication.id,
      decision,
      remarks: defaultRemarks,
      receivedAssistance: receivedAssistance ? '1' : '0',
    });
    if (!response.ok) return showToast(firstError(response.errors) || response.message || 'Unable to update the application.', 'warning');
    if (decision === 'approve' && receivedAssistance && response.application?.assistanceStatus?.isApprovedBeneficiary) {
      const assistance = response.application.assistanceStatus;
      showToast(
        `Approved beneficiary recorded ${formatDateTimeDetailed(assistance.approvedAt)}. First repayment due date is ${formatDate(assistance.firstRepaymentDueDate)}.`,
        'success'
      );
    } else {
      showToast(response.message || 'Application updated.', 'success');
    }
    state.assistanceReceivedSelection = false;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('poApplicationModal')).hide();
    await loadDashboard();
    await loadTraining();
  }

  async function recordAssistanceReceivedNow() {
    if (!state.activeApplication?.id) return;
    if (!window.confirm('Record the assistance received date as now and rebuild this beneficiary repayment schedule?')) return;
    const button = document.getElementById('po-app-assisted-record');
    if (button) button.disabled = true;
    const response = await apiPost('api/applications/assistance-received', {
      applicationId: state.activeApplication.id,
    });
    if (button) button.disabled = false;
    if (!response.ok) return showToast(firstError(response.errors) || response.message || 'Unable to record assistance release.', 'warning');
    state.activeApplication = response.application || state.activeApplication;
    renderApplicationModal();
    const assistance = response.application?.assistanceStatus || {};
    showToast(
      `Assistance received date recorded ${formatDateTimeDetailed(assistance.approvedAt)}. First repayment due date is ${formatDate(assistance.firstRepaymentDueDate)}.`,
      'success'
    );
    await loadDashboard();
  }

  async function loadTraining() {
    const response = await apiGet('api/training');
    if (!response.ok) return renderTrainingError(response.message || 'Unable to load training records.');
    state.training.programs = response.data?.programs || [];
    state.training.summary = response.data?.summary || {};
    state.training.seminarForms = response.data?.seminarForms || [];
    state.training.eligibleInvitees = response.data?.eligibleInvitees || [];
    state.training.sessionFilter = state.training.sessionFilter || '';
    state.training.groupFilter = state.training.groupFilter || '';
    state.training.activityFilter = state.training.activityFilter || '';
    state.training.overviewStatusFilter = state.training.overviewStatusFilter || '';
    state.training.noticeSelection = [];
    state.training.noticeWarning = '';
    await hydrateScopedTrainingDetails();
    syncScopedTrainingFilters();
    renderOverviewSummary();
    renderTrainingSnapshotCard();
    if (!state.training.programs.some((item) => item.id === state.training.selectedProgramId)) {
      state.training.selectedProgramId = null;
      state.training.activeProgram = null;
      state.training.view = 'overview';
    }
    if (state.training.view === 'session' && state.training.selectedProgramId) {
      renderTrainingOverview();
      return loadTrainingProgram(state.training.selectedProgramId, false);
    }
    renderTrainingOverview();
  }

  async function hydrateScopedTrainingDetails() {
    const programs = Array.isArray(state.training.programs) ? state.training.programs : [];
    if (!programs.length) return;
    const detailed = await Promise.all(programs.map(async (program) => {
      if (!program?.id) return program;
      const response = await apiGet('api/training/show', { id: program.id });
      return response.ok && response.program ? { ...program, ...response.program } : program;
    }));
    state.training.programs = detailed;
  }

  async function loadTrainingProgram(programId, showError = true) {
    const response = await apiGet('api/training/show', { id: programId });
    if (!response.ok) {
      if (showError) renderTrainingError(response.message || 'Unable to load training program detail.');
      return;
    }
    state.training.selectedProgramId = programId;
    state.training.activeProgram = response.program || null;
    state.training.noticeSelection = [];
    state.training.noticeWarning = '';
    state.training.subview = 'attendance';
    switchTrainingView('session');
  }

  function renderTrainingOverview() {
    switchTrainingView('overview', false);
    renderTrainingSummary();
    renderTrainingQueue();
  }

  function renderTrainingSummary() {
    // KPI stat cards removed — overview uses the Scoped Participants table instead.
    const root = document.getElementById('po-training-summary');
    if (root) root.innerHTML = '';
  }

  function renderTrainingStatCard(label, value, helper, eyebrow) {
    const successLabels = new Set(['Completed']);
    const tone = successLabels.has(String(label || '')) ? ' po-snapshot-card--success' : '';
    return `<article class="po-training-card po-snapshot-card${tone}"><div class="po-snapshot-card__eyebrow">${escapeHtml(eyebrow)}</div><div class="po-snapshot-card__body"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div><small class="po-snapshot-card__meta">${escapeHtml(helper)}</small></article>`;
  }

  function renderTrainingQueue() {
    const root = document.getElementById('po-training-program-list');
    if (!root) return;
    const rows = scopedTrainingRows();
    const sessionOpts = scopedSessionOptionsAll();
    const groupOpts = scopedGroupOptionsAll();
    root.innerHTML = `
      <section class="po-training-attendance-panel">
        <div class="po-training-attendance-panel__header">
          <div><span class="po-panel-label">Operations Workspace</span><h4>Scoped Participants</h4></div>
          <div class="po-training-row-actions">
            <span class="chip">${escapeHtml(`${rows.length} ${rows.length === 1 ? 'participant' : 'participants'}`)}</span>
          </div>
        </div>
        <div class="po-training-roster-toolbar">
          <label class="po-search-control" aria-label="Search participant or business"><i class="fas fa-magnifying-glass"></i><input id="po-training-activity-filter" type="search" placeholder="Search participant or business" value="${escapeHtml(state.training.activityFilter || '')}"></label>
          <label class="po-filter-field" for="po-training-session-filter"><span>Session</span><select id="po-training-session-filter" class="section-filter"><option value="">All sessions</option>${sessionOpts.map((o) => `<option value="${escapeHtml(o.value)}" ${state.training.sessionFilter === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></label>
          <label class="po-filter-field" for="po-training-group-filter"><span>Group</span><select id="po-training-group-filter" class="section-filter"><option value="">All groups</option>${groupOpts.map((o) => `<option value="${escapeHtml(o.value)}" ${state.training.groupFilter === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></label>
          <label class="po-filter-field" for="po-training-overview-status-filter"><span>Status</span><select id="po-training-overview-status-filter" class="section-filter"><option value="">All statuses</option><option value="Scheduled" ${state.training.overviewStatusFilter === 'Scheduled' ? 'selected' : ''}>Scheduled</option><option value="Notified" ${state.training.overviewStatusFilter === 'Notified' ? 'selected' : ''}>Notified</option><option value="Attended" ${state.training.overviewStatusFilter === 'Attended' ? 'selected' : ''}>Present</option><option value="Missed" ${state.training.overviewStatusFilter === 'Missed' ? 'selected' : ''}>Absent</option><option value="Excused" ${state.training.overviewStatusFilter === 'Excused' ? 'selected' : ''}>Excused</option><option value="Completed" ${state.training.overviewStatusFilter === 'Completed' ? 'selected' : ''}>Completed</option></select></label>
        </div>
        <div class="data-table-wrapper">
          <table class="data-table po-training-attendance-table">
            <thead><tr><th>Participant</th><th>Business / Group</th><th>Session</th><th>Workflow Status</th><th>Attendance Status</th><th>Completion Status</th><th>Notice</th><th>Actions</th></tr></thead>
            <tbody>${rows.map((row) => renderOverviewScopedRow(row)).join('') || '<tr><td colspan="8" class="text-center text-muted">No scoped participants found.</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function scopedTrainingRows() {
    const session = String(state.training.sessionFilter || '');
    const group = String(state.training.groupFilter || '');
    const search = String(state.training.activityFilter || '').toLowerCase();
    const statusFilter = String(state.training.overviewStatusFilter || '');
    const rows = [];
    (state.training.programs || []).forEach((program) => {
      if (session !== '' && String(program.roundNumber || '') !== session) return;
      if (group !== '' && String(program.targetGroupNumber || '') !== group) return;
      (program.invitees || []).forEach((invitee) => {
        if (search) {
          const haystack = [invitee.user?.name, invitee.businessName].join(' ').toLowerCase();
          if (!haystack.includes(search)) return;
        }
        if (statusFilter) {
          const workflowMatch = deriveTrainingWorkflowStatus(invitee) === statusFilter;
          const attendanceMatch = deriveTrainingAttendanceStatus(invitee) === statusFilter;
          const completionMatch = deriveTrainingCompletionStatus(invitee) === statusFilter;
          if (!workflowMatch && !attendanceMatch && !completionMatch) return;
        }
        rows.push({ program, invitee });
      });
    });
    return rows;
  }

  function renderOverviewScopedRow(row) {
    const { program, invitee } = row;
    const workflowLabel = deriveTrainingWorkflowStatus(invitee);
    const attendanceStatus = deriveTrainingAttendanceStatus(invitee);
    const attendanceLabel = attendanceDisplayLabel(attendanceStatus);
    const completionLabel = deriveTrainingCompletionStatus(invitee);
    const completionClass = completionLabel === 'Completed' ? 'po-training-status-chip--completed' : 'po-training-status-chip--warning';
    const noticeDate = invitee.lastNoticeSentAt || invitee.notifiedAt ? formatDate(invitee.lastNoticeSentAt || invitee.notifiedAt) : '';
    const groupLabel = invitee.batchGroupNumber ? `Group ${escapeHtml(String(invitee.batchGroupNumber))}` : 'Batch';
    const sessionLabel = `Session ${escapeHtml(String(program.roundNumber || '--'))}`;
    return `<tr class="${state.training.lastUpdatedInviteeId === invitee.id ? 'is-updated' : ''}">
      <td class="po-training-attendance-col po-training-attendance-col--participant">${renderTrainingAttendanceCompactCell(`<div class="table-primary">${escapeHtml(invitee.user?.name || '--')}</div>`, `<span class="table-secondary">${escapeHtml(invitee.contactNumber || invitee.user?.email || '')}</span>`, 'po-training-roster-cell--participant')}</td>
      <td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<strong>${escapeHtml(invitee.businessName || '--')}</strong>`, escapeHtml(groupLabel), 'po-training-roster-cell--business')}</td>
      <td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<strong>${escapeHtml(sessionLabel)}</strong>`, escapeHtml(`Group ${program.targetGroupNumber || invitee.batchGroupNumber || '--'}`), 'po-training-roster-cell--status')}</td>
      <td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<span class="po-training-status-chip ${workflowLabel === 'Notified' ? 'po-training-status-chip--notified' : 'po-training-status-chip--scheduled'}">${escapeHtml(workflowLabel)}</span>`, '', 'po-training-roster-cell--status')}</td>
      <td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<span class="po-training-status-chip ${attendanceStatus === 'Not Marked' ? 'po-training-status-chip--warning' : statusClass(attendanceStatus)}">${escapeHtml(attendanceLabel)}</span>`, '', 'po-training-roster-cell--status')}</td>
      <td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<span class="po-training-status-chip ${completionClass} po-training-completion-chip">${escapeHtml(completionLabel)}</span>`, '', 'po-training-roster-cell--status')}</td>
      <td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<span class="po-table-state">${escapeHtml(noticeDate || 'Pending notice')}</span>`, '', 'po-training-roster-cell--status')}</td>
      <td class="actions po-training-attendance-col po-training-attendance-col--action"><button type="button" class="app-btn-outline" data-training-overview-editor="${invitee.id}">Check Attendance</button></td>
    </tr>`;
  }

  function scopedSessionOptionsAll() {
    const sessions = [...new Set((state.training.programs || [])
      .map((p) => Number(p.roundNumber || 0))
      .filter((v) => v > 0))]
      .sort((a, b) => a - b);
    return sessions.map((v) => ({ value: String(v), label: `Session ${v}` }));
  }

  function scopedGroupOptionsAll() {
    const session = String(state.training.sessionFilter || '');
    const programs = session !== ''
      ? (state.training.programs || []).filter((p) => String(p.roundNumber || '') === session)
      : (state.training.programs || []);
    const groups = [...new Set(programs
      .map((p) => Number(p.targetGroupNumber || 0))
      .filter((v) => v > 0))]
      .sort((a, b) => a - b);
    return groups.map((v) => ({ value: String(v), label: `Group ${v}` }));
  }

  function renderScopedTrainingRow(row) {
    const { program, invitee } = row;
    const attendance = deriveTrainingAttendanceStatus(invitee);
    const attendanceLabel = attendanceDisplayLabel(attendance);
    const proof = invitee.proofAttachment;
    const forms = trainingFormLabels(program.seminarFormCodes || []);
    const proofMeta = ['Absent', 'Excused'].includes(attendanceLabel)
      ? (proof?.file_path ? 'Applicant proof uploaded' : 'Waiting for applicant proof')
      : (attendanceLabel === 'Not Marked' ? 'Waiting for PDO attendance mark' : 'No proof required');
    const formsMarkup = forms.length
      ? `<div class="po-training-form-cluster">${forms.map((label) => `<span class="training-form-chip">${escapeHtml(label)}</span>`).join('')}</div>`
      : '<span class="po-status-chip is-muted">No forms</span>';
    return `<tr class="po-training-scoped-row ${state.training.lastUpdatedInviteeId === invitee.id ? 'is-updated' : ''}" data-training-open="${program.id}" title="Open session details"><td>${renderTrainingAttendanceCompactCell(`<div class="table-primary">${escapeHtml(invitee.user?.name || '--')}</div>`, `<span class="table-secondary">${escapeHtml(invitee.businessName || 'No business name')}</span>`, 'po-training-roster-cell--participant')}</td><td>${renderTrainingAttendanceCompactCell(`<span class="po-training-status-chip ${attendance === 'Not Marked' ? 'po-training-status-chip--warning' : statusClass(attendance)}">${escapeHtml(attendanceLabel)}</span>`, escapeHtml(proofMeta), 'po-training-roster-cell--status')}</td><td>${renderTrainingAttendanceCompactCell(`<strong>${escapeHtml(`Session ${program.roundNumber || '--'} / Group ${program.targetGroupNumber || invitee.batchGroupNumber || '--'}`)}</strong>`, escapeHtml(invitee.batchGroupNumber ? `Participant group ${invitee.batchGroupNumber}` : 'Scoped session'), 'po-training-roster-cell--status')}</td><td>${renderTrainingAttendanceCompactCell(`<strong>${escapeHtml(program.programName || '--')}</strong>`, escapeHtml(program.speaker || 'Speaker to be announced'), 'po-training-roster-cell--status')}</td><td>${renderTrainingAttendanceCompactCell(`<strong>${escapeHtml(formatTimeRange(program.startTime, program.endTime))}</strong>`, escapeHtml(formatDate(program.date || program.startsAt)), 'po-training-roster-cell--status')}</td><td>${renderTrainingAttendanceCompactCell(`<strong>${escapeHtml(program.venue || '--')}</strong>`, escapeHtml(invitee.barangay || 'Scoped venue'), 'po-training-roster-cell--status')}</td><td>${renderTrainingAttendanceCompactCell(`<strong>${escapeHtml(program.whatToBring || '--')}</strong>`, escapeHtml(program.instructions || 'No extra reminder'), 'po-training-roster-cell--status')}</td><td>${renderTrainingAttendanceCompactCell(formsMarkup, escapeHtml(forms.length ? `${forms.length} assigned form${forms.length === 1 ? '' : 's'}` : 'No forms assigned'), 'po-training-roster-cell--status')}</td></tr>`;
  }

  function trainingFormLabels(codes) {
    const forms = new Map((state.training.seminarForms || []).map((form) => [form.code, form.label]));
    return (codes || []).map((code) => forms.get(code) || code);
  }

  function scopedSessionOptions() {
    const sessions = [...new Set((state.training.programs || [])
      .map((program) => Number(program.roundNumber || 0))
      .filter((value) => value > 0))]
      .sort((left, right) => left - right);
    return sessions.map((value) => ({ value: String(value), label: `Session ${value}` }));
  }

  function scopedGroupOptions() {
    const session = Number(state.training.sessionFilter || 0);
    const groups = [...new Set((state.training.programs || [])
      .filter((program) => Number(program.roundNumber || 0) === session)
      .map((program) => Number(program.targetGroupNumber || 0))
      .filter((value) => value > 0))]
      .sort((left, right) => left - right);
    return groups.map((value) => ({ value: String(value), label: `Group ${value}` }));
  }

  function syncScopedTrainingFilters() {
    // Filters now default to empty string (show all) — no forced selection needed.
  }

  function renderTrainingSessionView() {
    const shell = document.getElementById('po-training-session-shell');
    if (!shell) return;
    const program = state.training.activeProgram;
    if (!program) {
      renderTrainingEmptyState('attendance', 'Select a training session to open its operations workspace.');
      return;
    }
    const invitees = program.invitees || [];
    const contextRoot = document.getElementById('po-training-session-context');
    if (contextRoot) contextRoot.innerHTML = `<div class="po-training-detail-shell">${buildTrainingSessionHeader(program, invitees)}${buildTrainingOperationsRail(program, invitees)}</div>`;
    renderTrainingSubnav(program);
    renderTrainingAttendanceView(program, invitees);
    syncTrainingSubviewVisibility();
  }

  function renderTrainingSubnav() {
    const root = document.getElementById('po-training-subnav');
    if (!root) return;
    root.innerHTML = '';
  }

  function syncTrainingSubviewVisibility() {
    const views = {
      details: document.getElementById('po-training-session-detail-view'),
      assignment: document.getElementById('po-training-assignment-view'),
      forms: document.getElementById('po-training-forms-view'),
      notices: document.getElementById('po-training-notices-view'),
      attendance: document.getElementById('po-training-attendance-view'),
    };
    Object.entries(views).forEach(([key, node]) => {
      if (node) node.style.display = key === 'attendance' ? 'grid' : 'none';
    });
  }

  function renderTrainingSessionDetailsView(program, invitees) {
    const root = document.getElementById('po-training-session-detail-view');
    if (!root) return;
    const sessionForm = `<form id="po-training-session-form" class="po-training-session-form" data-program-id="${program.id || ''}">${buildSessionSetup(program, invitees)}${buildParticipantEssentials(program)}<div class="po-training-session-actions"><button type="submit" class="action-button po-case-action" data-training-save-program ${state.training.savingProgram ? 'disabled' : ''}>${state.training.savingProgram ? (program.isDraft ? 'Creating Session...' : 'Saving Session Details...') : 'Save Session Details'}</button></div></form>`;
    root.innerHTML = sessionForm;
  }

  function renderTrainingAssignmentView(program, invitees) {
    const root = document.getElementById('po-training-assignment-view');
    if (!root) return;
    root.innerHTML = program.isDraft ? renderTrainingEmptyStateMarkup('assignment', 'Save this session first before assigning participants.') : `${buildTrainingAssignmentSummary(program, invitees)}${buildParticipantAssignment(program, invitees)}`;
  }

  function renderTrainingFormsView(program, invitees) {
    const root = document.getElementById('po-training-forms-view');
    if (!root) return;
    root.innerHTML = program.isDraft ? renderTrainingEmptyStateMarkup('forms', 'Save this session first before opening seminar forms.') : buildTrainingFormsWorkspace(program, invitees);
  }

  function renderTrainingNoticesView(program, invitees) {
    const root = document.getElementById('po-training-notices-view');
    if (!root) return;
    root.innerHTML = program.isDraft ? renderTrainingEmptyStateMarkup('notices', 'Save this session first before sending notices.') : `${buildTrainingNoticeSummary(invitees)}${buildAnnouncementPanel(program, invitees)}${buildTrainingNoticesTable(program, invitees)}`;
  }

  function renderTrainingAttendanceView(program, invitees) {
    const root = document.getElementById('po-training-attendance-view');
    if (!root) return;
    root.innerHTML = program.isDraft ? renderTrainingEmptyStateMarkup('attendance', 'Save this session first before tracking attendance.') : `${buildTrainingAttendanceSummary(invitees)}${buildParticipantRoster(program, invitees)}`;
  }

  function renderTrainingEmptyState(view, message) {
    const map = {
      details: document.getElementById('po-training-session-detail-view'),
      assignment: document.getElementById('po-training-assignment-view'),
      forms: document.getElementById('po-training-forms-view'),
      notices: document.getElementById('po-training-notices-view'),
      attendance: document.getElementById('po-training-attendance-view'),
    };
    const node = map[view];
    if (node) node.innerHTML = renderTrainingEmptyStateMarkup(view, message);
  }

  function renderTrainingEmptyStateMarkup(view, message) {
    return `<section class="po-training-empty-state"><span class="po-panel-label">${escapeHtml(String(view || '').replace(/^\w/, (m) => m.toUpperCase()))}</span><h4>${escapeHtml(message)}</h4></section>`;
  }

  function buildTrainingSessionHeader(program, invitees) {
    const yearly = getYearlyBatch(program);
    return `<section class="po-training-session-hero"><div class="po-training-session-hero__head"><div class="po-training-session-hero__identity"><span class="po-panel-label">Selected Session</span><h3>${escapeHtml(program.programName || 'New Training Session')}</h3></div><div class="po-training-row-actions"><button type="button" class="action-button action-button--quiet" data-training-action="back-overview">Back to Sessions</button><div class="po-training-session-hero__status"><span class="po-status-pill ${statusClass(program.status)}">${escapeHtml(program.status || 'Scheduled')}</span></div></div></div><div class="po-training-session-hero__meta"><article><span>Date</span><strong>${escapeHtml(formatDate(program.date || program.startsAt))}</strong></article><article><span>Venue / Place</span><strong>${escapeHtml(program.venue || '--')}</strong></article><article><span>Speaker / Facilitator</span><strong>${escapeHtml(program.speaker || '--')}</strong></article><article><span>Participant Count</span><strong>${escapeHtml(String(invitees.length || 0))}</strong></article><article><span>Batch Year</span><strong>${escapeHtml(String(yearly.batchYear || '--'))}</strong></article></div></section>`;
  }

  function buildTrainingOperationsRail(program, invitees) {
    const selectedFormCount = Array.isArray(program.seminarFormCodes) ? program.seminarFormCodes.length : 0;
    const stage = deriveTrainingSessionStage(invitees);
    const notified = invitees.filter((invitee) => deriveTrainingWorkflowStatus(invitee) === 'Notified').length;
    const attendanceMarked = invitees.filter((invitee) => deriveTrainingAttendanceStatus(invitee) !== 'Not Marked').length;
    const completed = invitees.filter((invitee) => deriveTrainingCompletionStatus(invitee) === 'Completed').length;
    return `<section class="po-training-operations-rail po-training-operations-rail--compact"><article><span>Session Stage</span><strong>${escapeHtml(stage)}</strong></article><article><span>Seminar Forms</span><strong>${escapeHtml(String(selectedFormCount))}</strong></article></section>`;
  }

  function deriveTrainingSessionStage(invitees) {
    if (!invitees.length) return 'Draft';
    const notifiedCount = invitees.filter((invitee) => deriveTrainingWorkflowStatus(invitee) === 'Notified').length;
    const attendanceMarked = invitees.some((invitee) => deriveTrainingAttendanceStatus(invitee) !== 'Not Marked');
    const allCompleted = invitees.every((invitee) => deriveTrainingCompletionStatus(invitee) === 'Completed');
    if (!notifiedCount) return 'Participants Locked';
    if (allCompleted) return 'Completed';
    if (!attendanceMarked) return 'Notice Sent';
    return 'Attendance Open';
  }

  function deriveTrainingWorkflowStatus(invitee) {
    return invitee.lastNoticeSentAt || invitee.notifiedAt ? 'Notified' : 'Scheduled';
  }

  function deriveTrainingAttendanceStatus(invitee) {
    const status = String(invitee.status || '');
    if (status === 'Completed') return 'Attended';
    if (['Attended', 'Excused', 'Missed'].includes(status)) return status;
    return 'Not Marked';
  }

  function deriveTrainingCompletionStatus(invitee) {
    return invitee.completedByAttendance || String(invitee.completionStatus || '') === 'Completed' ? 'Completed' : 'Incomplete';
  }

  function attendanceDisplayLabel(status) {
    if (status === 'Attended') return 'Present';
    if (status === 'Missed') return 'Absent';
    return status || 'Not Marked';
  }

  function buildSessionSetup(program, invitees) {
    const seminarForms = state.training.seminarForms || [];
    const selectedSeminarForms = new Set(Array.isArray(program.seminarFormCodes) ? program.seminarFormCodes : []);
    return `<section class="po-training-work-block"><div class="po-training-work-block__header"><div><span class="po-panel-label">Session Details</span><h4>Session Details</h4></div></div><div class="po-training-setup"><label class="po-training-field po-training-setup__identity"><span>Program Name</span><input class="section-filter" type="text" name="program.programName" value="${escapeHtml(program.programName || '')}" placeholder="Program Name"></label><div class="po-training-setup__grid"><label class="po-training-field"><span>Date</span><input class="section-filter" type="date" name="program.date" value="${escapeHtml(normalizeDateInput(program.date || program.startsAt))}"></label><label class="po-training-field"><span>Venue / Place</span><input class="section-filter" type="text" name="program.venue" value="${escapeHtml(program.venue || '')}" placeholder="Venue / Place"></label><label class="po-training-field"><span>Start Time</span><input class="section-filter" type="time" name="program.startTime" value="${escapeHtml(normalizeTimeInput(program.startTime))}"></label><label class="po-training-field"><span>Speaker / Facilitator</span><input class="section-filter" type="text" name="program.speaker" value="${escapeHtml(program.speaker || '')}" placeholder="Speaker / Facilitator"></label><label class="po-training-field"><span>End Time</span><input class="section-filter" type="time" name="program.endTime" value="${escapeHtml(normalizeTimeInput(program.endTime))}"></label></div><div class="po-training-field po-training-field--stacked"><span>Seminar Forms</span><div class="po-training-assignment__list">${seminarForms.map((form) => `<label class="po-training-assignment__item"><input type="checkbox" name="program.seminarFormCodes[]" value="${escapeHtml(form.code)}" ${selectedSeminarForms.has(form.code) ? 'checked' : ''}><span class="po-training-assignment__copy"><strong>${escapeHtml(form.label)}</strong></span></label>`).join('')}</div></div></div></section>`;
  }

  function buildParticipantEssentials(program) {
    return `<section class="po-training-work-block"><div class="po-training-work-block__header"><div><span class="po-panel-label">Participant Essentials</span><h4>Participant Essentials</h4></div></div><div class="po-training-essentials"><label class="po-training-field po-training-field--stacked"><span>What to Bring</span><textarea class="po-inline-remarks po-training-compact-textarea" name="program.whatToBring" rows="3" placeholder="What to Bring">${escapeHtml(program.whatToBring || '')}</textarea></label><label class="po-training-field po-training-field--stacked"><span>Instructions / Reminders</span><textarea class="po-inline-remarks po-training-compact-textarea" name="program.instructions" rows="3" placeholder="Instructions / Reminders">${escapeHtml(program.instructions || '')}</textarea></label></div></section>`;
  }

  function buildParticipantAssignment(program, invitees) {
    const eligible = state.training.eligibleInvitees || [];
    const selectedIds = new Set(invitees.map((invitee) => Number(invitee.applicantProfileId)));
    const ordered = eligible.slice().sort((left, right) => {
      const leftSelected = selectedIds.has(Number(left.applicantProfileId)) ? 1 : 0;
      const rightSelected = selectedIds.has(Number(right.applicantProfileId)) ? 1 : 0;
      if (leftSelected !== rightSelected) return rightSelected - leftSelected;
      return String(left.name || '').localeCompare(String(right.name || ''));
    });

    return `<section class="po-training-work-block po-training-assignment"><div class="po-training-work-block__header"><div><span class="po-panel-label">Participant Assignment</span><h4>Assign Participants</h4></div><span class="chip">${escapeHtml(`${eligible.length} eligible`)}</span></div><div class="po-training-validation-banner">Alphabetical yearly grouping only. Barangay is not used.</div><form id="po-training-invitees-form" class="po-training-assignment__form" data-program-id="${program.id}">${ordered.length ? `<div class="po-training-assignment__list">${ordered.map((invitee) => `<label class="po-training-assignment__item"><input type="checkbox" name="invitees.applicantProfileIds[]" value="${invitee.applicantProfileId}" ${selectedIds.has(Number(invitee.applicantProfileId)) ? 'checked' : ''} ${state.training.syncingInvitees ? 'disabled' : ''}><span class="po-training-assignment__copy"><strong>${escapeHtml(invitee.name || '--')}</strong><small>${escapeHtml(invitee.businessName || 'No business name recorded')}</small></span></label>`).join('')}</div>` : '<div class="po-empty">No eligible applicants are available for this session yet.</div>'}<div class="po-training-session-actions"><button type="submit" class="action-button po-case-action" ${state.training.syncingInvitees || !ordered.length ? 'disabled' : ''}>${state.training.syncingInvitees ? 'Saving Participants...' : 'Save Participants'}</button></div></form></section>`;
  }

  function buildTrainingAssignmentSummary(program, invitees) {
    const yearly = getYearlyBatch(program);
    return `<section class="po-training-workspace"><header class="po-training-workspace__header"><div><span class="po-panel-label">Participant Assignment</span><h4>Assignment Workspace</h4></div></header><div class="po-training-summary-rail"><article class="po-training-summary-card"><span>Yearly Assigned</span><strong>${escapeHtml(String(yearly.yearlyAssignedCount || 0))}</strong></article><article class="po-training-summary-card"><span>Remaining Capacity</span><strong>${escapeHtml(String(yearly.yearlyRemainingCapacity ?? 255))}</strong></article><article class="po-training-summary-card"><span>Group 1</span><strong>${escapeHtml(String(yearly.yearlyGroup1Count || 0))}</strong></article><article class="po-training-summary-card"><span>Group 2</span><strong>${escapeHtml(String(yearly.yearlyGroup2Count || 0))}</strong></article><article class="po-training-summary-card"><span>Group 3</span><strong>${escapeHtml(String(yearly.yearlyGroup3Count || 0))}</strong></article></div></section>`;
  }

  function buildTrainingFormsWorkspace(program, invitees) {
    const seminarForms = state.training.seminarForms || [];
    const selected = new Set(Array.isArray(program.seminarFormCodes) ? program.seminarFormCodes : []);
    const affected = invitees.length;
    return `<section class="po-training-workspace"><header class="po-training-workspace__header"><div><span class="po-panel-label">Seminar Forms</span><h4>Seminar Forms</h4></div></header><div class="po-training-summary-rail"><article class="po-training-summary-card"><span>Selected Forms</span><strong>${selected.size}</strong></article><article class="po-training-summary-card"><span>Assigned Participants</span><strong>${affected}</strong></article></div>${affected === 0 ? '<div class="po-training-validation-banner po-training-validation-banner--warning">No assigned participants are available.</div>' : ''}<section class="po-training-work-block"><div class="po-training-form-list">${seminarForms.map((form) => `<label class="po-training-assignment__item"><input type="checkbox" name="program.seminarFormCodes[]" value="${escapeHtml(form.code)}" form="po-training-session-form" ${selected.has(form.code) ? 'checked' : ''}><span class="po-training-assignment__copy"><strong>${escapeHtml(form.label)}</strong></span></label>`).join('') || '<div class="po-empty">No seminar forms are currently configured for this training session.</div>'}</div><div class="po-training-row-actions"><button type="submit" form="po-training-session-form" class="action-button po-case-action" ${affected === 0 ? 'disabled' : ''}>Save Form Access</button></div></section></section>`;
  }

  function buildTrainingNoticeSummary(invitees) {
    const counts = {
      participants: invitees.length,
      notified: invitees.filter((invitee) => invitee.lastNoticeSentAt || invitee.notifiedAt).length,
      attended: invitees.filter((invitee) => String(invitee.status || '') === 'Attended').length,
      excused: invitees.filter((invitee) => String(invitee.status || '') === 'Excused').length,
      counted: invitees.filter((invitee) => ['Attended', 'Completed'].includes(String(invitee.status || ''))).length,
    };
    return `<section class="po-training-roster-summary">${renderTrainingStatCard('Participants', counts.participants, 'Assigned to this session', 'Roster')}${renderTrainingStatCard('Notified', counts.notified, 'Participant notices sent', 'Notices')}${renderTrainingStatCard('Present', counts.attended, 'Attendance already recorded', 'Attendance')}${renderTrainingStatCard('Excused', counts.excused, 'Approved attendance exceptions', 'Excused')}${renderTrainingStatCard('Counted', counts.counted, 'Seminars credited toward requirement', 'Credit')}</section>`;
  }

  function buildTrainingNoticesTable(program, invitees) {
    if (!invitees.length) {
      return renderTrainingEmptyStateMarkup('notices', 'No assigned participants are available. Notices can only be sent after participant assignment.');
    }
    const search = String(state.training.noticeFilters.search || '').toLowerCase();
    const status = String(state.training.noticeFilters.status || '');
    const filtered = invitees.filter((invitee) => {
      const noticeStatus = invitee.lastNoticeSentAt || invitee.notifiedAt ? 'Notified' : 'Not Sent';
      const matchesSearch = !search || [invitee.user?.name, invitee.businessName].some((value) => String(value || '').toLowerCase().includes(search));
      const matchesStatus = !status || noticeStatus === status;
      return matchesSearch && matchesStatus;
    });
    const selected = new Set((state.training.noticeSelection || []).map(Number));
    const allVisibleSelected = filtered.length > 0 && filtered.every((invitee) => selected.has(Number(invitee.id)));
    const pendingIds = invitees.filter((invitee) => !(invitee.lastNoticeSentAt || invitee.notifiedAt)).map((invitee) => Number(invitee.id));
    const hasSelection = selected.size > 0;
    const busySendAll = state.training.sendingProgramNotice === 'pending';
    const busySendSelected = state.training.sendingProgramNotice === 'selected';
    const busyResendSelected = state.training.sendingProgramNotice === 'resend-selected';
    return `<section class="po-training-workspace"><header class="po-training-workspace__header"><div><span class="po-panel-label">Notice Monitoring</span><h4>Participant Notice Table</h4></div></header><div class="po-training-notice-actionbar"><div class="po-training-notice-bulk-actions"><button type="button" class="action-button po-case-action" data-training-notice-action="pending" ${!pendingIds.length || busySendAll ? 'disabled' : ''}>${busySendAll ? 'Sending Notice...' : 'Send Notice to All Pending'}</button><button type="button" class="action-button" data-training-notice-action="selected" ${!hasSelection || busySendSelected ? 'disabled' : ''}>${busySendSelected ? 'Sending Notice...' : 'Send to Selected'}</button><button type="button" class="action-button action-button--quiet" data-training-notice-action="resend-selected" ${!hasSelection || busyResendSelected ? 'disabled' : ''}>${busyResendSelected ? 'Resending Notice...' : 'Resend Selected'}</button><button type="button" class="action-button action-button--quiet" data-training-notice-action="refresh">Refresh Notice States</button></div><div class="po-training-notice-selectionbar"><label class="po-search-control" aria-label="Search participant or business"><i class="fas fa-magnifying-glass"></i><input id="po-training-notice-search" type="search" placeholder="Search participant or business" value="${escapeHtml(state.training.noticeFilters.search || '')}"></label><label class="po-filter-field" for="po-training-notice-status"><span>Status</span><select id="po-training-notice-status" class="section-filter"><option value="">All</option><option value="Not Sent" ${status === 'Not Sent' ? 'selected' : ''}>Not Sent</option><option value="Notified" ${status === 'Notified' ? 'selected' : ''}>Notified</option></select></label></div></div>${state.training.noticeWarning ? `<div class="po-training-validation-banner po-training-validation-banner--warning">${escapeHtml(state.training.noticeWarning)}</div>` : ''}<div class="data-table-wrapper"><table class="data-table po-training-notice-table"><thead><tr><th class="po-training-notice-table__checkbox"><input type="checkbox" data-training-notice-select-all ${allVisibleSelected ? 'checked' : ''}></th><th>Participant</th><th>Business</th><th>Group</th><th>Notice Status</th><th>Last Notice Sent</th><th>Seminar Forms</th><th>Attendance Status</th></tr></thead><tbody>${filtered.map((invitee) => {
      const noticeStatus = invitee.lastNoticeSentAt || invitee.notifiedAt ? 'Notified' : 'Not Sent';
      const formsState = Array.isArray(program.seminarFormCodes) && program.seminarFormCodes.length ? `${program.seminarFormCodes.length} open` : 'Closed';
      return `<tr><td class="po-training-notice-table__checkbox"><input type="checkbox" data-training-notice-select="${invitee.id}" ${selected.has(Number(invitee.id)) ? 'checked' : ''}></td><td><div class="table-primary">${escapeHtml(invitee.user?.name || '--')}</div></td><td>${escapeHtml(invitee.businessName || '--')}</td><td>${invitee.batchGroupNumber ? `Group ${escapeHtml(String(invitee.batchGroupNumber))}` : 'Batch'}</td><td><span class="po-training-notice-readonly-chip ${noticeStatus === 'Notified' ? 'po-training-status-chip--notified' : 'po-training-status-chip--warning'}">${escapeHtml(noticeStatus)}</span></td><td>${escapeHtml(invitee.lastNoticeSentAt ? formatDate(invitee.lastNoticeSentAt) : 'Pending notice')}</td><td>${escapeHtml(formsState)}</td><td>${escapeHtml(attendanceDisplayLabel(deriveTrainingAttendanceStatus(invitee)))}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="text-center text-muted">No assigned participants are available. Notices can only be sent after participant assignment.</td></tr>'}</tbody></table></div></section>`;
  }

  function buildTrainingAttendanceSummary(invitees) {
    const counts = {
      participants: invitees.length,
      notified: invitees.filter((invitee) => invitee.lastNoticeSentAt || invitee.notifiedAt).length,
      attended: invitees.filter((invitee) => deriveTrainingAttendanceStatus(invitee) === 'Attended').length,
      excused: invitees.filter((invitee) => deriveTrainingAttendanceStatus(invitee) === 'Excused').length,
      missed: invitees.filter((invitee) => deriveTrainingAttendanceStatus(invitee) === 'Missed').length,
      completed: invitees.filter((invitee) => deriveTrainingCompletionStatus(invitee) === 'Completed').length,
    };
    return `<section class="po-training-summary-rail"><article class="po-training-summary-card"><span>Participants</span><strong>${counts.participants}</strong></article><article class="po-training-summary-card"><span>Notified</span><strong>${counts.notified}</strong></article><article class="po-training-summary-card"><span>Present</span><strong>${counts.attended}</strong></article><article class="po-training-summary-card"><span>Excused</span><strong>${counts.excused}</strong></article><article class="po-training-summary-card"><span>Absent</span><strong>${counts.missed}</strong></article><article class="po-training-summary-card"><span>Completed</span><strong>${counts.completed}</strong></article></section>`;
  }

  function buildAnnouncementPanel(program, invitees) {
    return `<section class="po-training-work-block po-training-announcement"><div class="po-training-work-block__header"><div><span class="po-panel-label">Participant Notice Preview</span><h4>${escapeHtml(program.programName || '--')}</h4></div></div><div class="po-training-announcement__preview"><div class="po-training-preview-grid"><div><span>Date</span><strong>${escapeHtml(formatDate(program.date || program.startsAt))}</strong></div><div><span>Time</span><strong>${escapeHtml(formatTimeRange(program.startTime, program.endTime))}</strong></div><div><span>Venue</span><strong>${escapeHtml(program.venue || '--')}</strong></div><div><span>Speaker</span><strong>${escapeHtml(program.speaker || '--')}</strong></div></div><div class="po-training-preview-copy"><div><span>What to Bring</span><p>${escapeHtml(program.whatToBring || '--')}</p></div><div><span>Instructions / Reminders</span><p>${escapeHtml(program.instructions || '--')}</p></div></div></div></section>`;
  }

  function renderTrainingAttendanceCompactCell(primary, secondary = '', modifier = '') {
    const className = ['po-training-roster-cell', modifier].filter(Boolean).join(' ');
    return `<div class="${className}"><div class="po-training-roster-cell__primary">${primary}</div><div class="po-training-roster-cell__secondary">${secondary || '&nbsp;'}</div></div>`;
  }

  function getTrainingAttendanceDraft(invitee) {
    const draft = state.training.attendanceDrafts[String(invitee.id)] || {};
    const fallbackStatus = deriveTrainingAttendanceStatus(invitee);
    return {
      status: String(draft.status || (fallbackStatus === 'Not Marked' ? '' : fallbackStatus)),
      remarks: typeof draft.remarks === 'string' ? draft.remarks : String(invitee.remarks || ''),
    };
  }

  function updateTrainingAttendanceDraft(trainingInviteeId, field, value, rerender = false) {
    const key = String(trainingInviteeId);
    const current = state.training.attendanceDrafts[key] || {};
    state.training.attendanceDrafts[key] = { ...current, [field]: value };
    if (rerender) renderTrainingSessionView();
  }

  function updateTrainingAttendanceDraftInline(trainingInviteeId, field, value, rerenderFn) {
    const key = String(trainingInviteeId);
    const current = state.training.attendanceDrafts[key] || {};
    state.training.attendanceDrafts[key] = { ...current, [field]: value };
    if (typeof rerenderFn === 'function') rerenderFn();
  }

  function isAttendanceDateBypassApplicant(invitee) {
    const name = String(invitee?.user?.name || '').toLowerCase();
    return ['lisadora', 'andrea', 'maria', 'mariel'].some((allowed) => name.includes(allowed));
  }

  function sessionDateValue(program) {
    const raw = String(program?.date || program?.startsAt || '').trim();
    return raw ? raw.slice(0, 10) : '';
  }

  function todayDateValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function isAttendanceDateLockedForInvitee(invitee) {
    if (isAttendanceDateBypassApplicant(invitee)) return false;
    const program = state.training.activeProgram || findProgramForInvitee(invitee?.id);
    return isAttendanceDateLockedForProgram(program);
  }

  function renderTrainingAttendanceEditorRow(invitee, program) {
    const saveBusy = !!state.training.busyInvitees[`attendance-${invitee.id}`];
    const proof = invitee.proofAttachment;
    const draft = getTrainingAttendanceDraft(invitee);
    const needsApplicantProof = ['Excused', 'Missed'].includes(String(draft.status || ''));
    const resolvedProgram = program || state.training.activeProgram || findProgramForInvitee(invitee.id);
    const dateLocked = isAttendanceDateLockedForProgram(resolvedProgram);
    const dateLockedAttr = dateLocked ? 'disabled' : '';
    const existingProofName = proof?.file_path ? String(proof.file_path).split('/').pop() : '';
    const completionLabel = deriveTrainingCompletionStatus(invitee);
    const noticeLabel = deriveTrainingWorkflowStatus(invitee);
    const lastUpdated = invitee.proofAttachment?.updated_at || invitee.lastNoticeSentAt || invitee.notifiedAt || '';
    return `<tr class="po-training-attendance-editor-row"><td colspan="8"><div class="po-training-editor"><div class="po-training-editor__meta"><div class="po-training-editor__meta-item"><span>Participant</span><strong>${escapeHtml(invitee.user?.name || '--')}</strong></div><div class="po-training-editor__meta-item"><span>Workflow</span><strong>${escapeHtml(noticeLabel)}</strong></div><div class="po-training-editor__meta-item"><span>Attendance</span><strong>${escapeHtml(attendanceDisplayLabel(deriveTrainingAttendanceStatus(invitee)))}</strong></div><div class="po-training-editor__meta-item"><span>Completion</span><strong>${escapeHtml(completionLabel)}</strong></div><div class="po-training-editor__meta-item"><span>Last Updated</span><strong>${escapeHtml(lastUpdated ? formatDate(lastUpdated) : 'No recent update')}</strong></div></div><div class="po-training-editor__body"><section class="po-training-editor__column po-training-editor__column--decision"><div class="po-training-editor__section-title"><span class="po-panel-label">Session Actions</span><h5>Execution Controls</h5></div><div class="po-training-status-preset-list"><button type="button" class="po-training-status-preset ${draft.status === 'Attended' ? 'is-active' : ''}" data-training-editor-status="${invitee.id}:Attended" ${dateLockedAttr}>Mark Present</button><button type="button" class="po-training-status-preset ${draft.status === 'Missed' ? 'is-active' : ''}" data-training-editor-status="${invitee.id}:Missed" ${dateLockedAttr}>Mark Absent</button><button type="button" class="po-training-status-preset ${draft.status === 'Excused' ? 'is-active' : ''}" data-training-editor-status="${invitee.id}:Excused" ${dateLockedAttr}>Mark Excused</button></div>${dateLocked ? `<div class="po-training-editor-validation">Attendance opens on ${escapeHtml(formatDate(sessionDateValue(resolvedProgram)))}.</div>` : ''}<div class="po-filter-field"><span>Selected Status</span><div class="po-training-proof-state"><strong>${escapeHtml(attendanceDisplayLabel(draft.status))}</strong></div></div></section><section class="po-training-editor__column po-training-editor__column--proof"><div class="po-training-editor__section-title"><span class="po-panel-label">Applicant Proof</span><h5>Absent / Excused Proof</h5></div><div class="po-training-proof-block ${needsApplicantProof ? 'is-active' : 'is-disabled'}"><div class="po-training-proof-state"><strong>${proof?.file_path ? 'Proof uploaded by applicant' : (needsApplicantProof ? 'Waiting for applicant proof' : 'Proof not required')}</strong></div>${proof?.file_path ? `<div class="po-training-proof-file"><span>${escapeHtml(existingProofName || 'Existing proof file')}</span><a class="action-link" href="${escapeHtml(routeUrl(proof.file_path))}" target="_blank" rel="noopener">View proof</a></div>` : ''}${needsApplicantProof && !proof?.file_path ? '<div class="po-training-editor-validation">Applicant must upload proof from the Training page after you save this status.</div>' : ''}</div></section><section class="po-training-editor__column po-training-editor__column--remarks"><div class="po-training-editor__section-title"><span class="po-panel-label">Remarks and Save</span><h5>Remarks and Save</h5></div><div class="po-training-remarks-block"><label class="po-filter-field"><span>Remarks</span><textarea id="po-training-remarks-${invitee.id}" class="po-inline-remarks po-training-compact-textarea" data-training-remarks="${invitee.id}" rows="5" placeholder="Add remarks" ${saveBusy ? 'disabled' : ''}>${escapeHtml(draft.remarks)}</textarea></label>${needsApplicantProof ? '<div class="po-training-editor-validation">Save the attendance mark first so the applicant can upload the required proof.</div>' : ''}<div class="po-training-editor-footer"><button type="button" class="action-button po-case-action" data-training-save-status="${invitee.id}" ${saveBusy || dateLocked ? 'disabled' : ''}>${saveBusy ? 'Saving...' : 'Save Update'}</button><button type="button" class="action-button action-button--quiet" data-training-overview-editor="${invitee.id}">Close</button></div></div></section></div></div></td></tr>`;
  }

  function findProgramForInvitee(inviteeId) {
    return (state.training.programs || []).find((p) =>
      (p.invitees || []).some((inv) => Number(inv.id) === Number(inviteeId))
    ) || null;
  }

  function isAttendanceDateLockedForProgram(program) {
    if (!program) return false;
    const sessionDate = sessionDateValue(program);
    return sessionDate !== '' && todayDateValue() < sessionDate;
  }

  function renderTrainingAttendanceCompactRow(invitee, program, saveBusy, editorOpen) {
    const workflowLabel = deriveTrainingWorkflowStatus(invitee);
    const attendanceLabel = deriveTrainingAttendanceStatus(invitee);
    const completionLabel = deriveTrainingCompletionStatus(invitee);
    const completionClass = completionLabel === 'Completed' ? 'po-training-status-chip--completed' : 'po-training-status-chip--warning';
    const noticeSecondary = invitee.lastNoticeSentAt || invitee.notifiedAt ? formatDate(invitee.lastNoticeSentAt || invitee.notifiedAt) : '';
    const groupLabel = invitee.batchGroupNumber ? `Group ${escapeHtml(String(invitee.batchGroupNumber))}` : 'Batch';
    return `<tr class="${state.training.lastUpdatedInviteeId === invitee.id ? 'is-updated' : ''}"><td class="po-training-attendance-col po-training-attendance-col--participant">${renderTrainingAttendanceCompactCell(`<div class="table-primary">${escapeHtml(invitee.user?.name || '--')}</div>`, `<span class="table-secondary">${escapeHtml(invitee.contactNumber || invitee.user?.email || '')}</span>`, 'po-training-roster-cell--participant')}</td><td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<strong>${escapeHtml(invitee.businessName || '--')}</strong>`, escapeHtml(groupLabel), 'po-training-roster-cell--business')}</td><td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<span class="po-training-status-chip ${workflowLabel === 'Notified' ? 'po-training-status-chip--notified' : 'po-training-status-chip--scheduled'}">${escapeHtml(workflowLabel)}</span>`, '', 'po-training-roster-cell--status')}</td><td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<span class="po-training-status-chip ${attendanceLabel === 'Not Marked' ? 'po-training-status-chip--warning' : statusClass(attendanceLabel)}">${escapeHtml(attendanceDisplayLabel(attendanceLabel))}</span>`, '', 'po-training-roster-cell--status')}</td><td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<span class="po-training-status-chip ${completionClass} po-training-completion-chip">${escapeHtml(completionLabel)}</span>`, '', 'po-training-roster-cell--status')}</td><td class="po-training-attendance-col">${renderTrainingAttendanceCompactCell(`<span class="po-table-state">${escapeHtml(noticeSecondary || 'Pending notice')}</span>`, '', 'po-training-roster-cell--status')}</td><td class="actions po-training-attendance-col po-training-attendance-col--action">${renderTrainingAttendanceCompactCell(`<div class="po-training-row-actions"><button type="button" class="po-training-action-trigger" data-training-open-editor="${invitee.id}">Open</button></div>`, '', 'po-training-roster-cell--action')}</td></tr>${editorOpen ? renderTrainingAttendanceEditorRow(invitee) : ''}`;
  }

  function buildParticipantRoster(program, invitees) {
    const search = state.training.rosterSearch.toLowerCase();
    const filter = state.training.rosterFilter;
    const filtered = invitees.filter((invitee) => {
      const matchesSearch = !search || [invitee.user?.name, invitee.businessName].some((value) => String(value || '').toLowerCase().includes(search));
      const matchesFilter = !filter
        || deriveTrainingWorkflowStatus(invitee) === filter
        || deriveTrainingAttendanceStatus(invitee) === filter
        || deriveTrainingCompletionStatus(invitee) === filter;
      return matchesSearch && matchesFilter;
    });
    return `<section class="po-training-attendance-panel"><div class="po-training-attendance-panel__header"><div><span class="po-panel-label">Operations Workspace</span><h4>Scoped Participants</h4></div><div class="po-training-row-actions"><span class="chip">${escapeHtml(`${invitees.length} ${invitees.length === 1 ? 'participant' : 'participants'}`)}</span></div></div><div class="po-training-roster-toolbar"><label class="po-search-control" aria-label="Search participant or business"><i class="fas fa-magnifying-glass"></i><input id="po-training-roster-search" type="search" placeholder="Search participant or business" value="${escapeHtml(state.training.rosterSearch)}"></label><label class="po-filter-field" for="po-training-roster-filter"><span>Status</span><select id="po-training-roster-filter" class="section-filter"><option value="">All statuses</option><option value="Scheduled" ${filter === 'Scheduled' ? 'selected' : ''}>Scheduled</option><option value="Notified" ${filter === 'Notified' ? 'selected' : ''}>Notified</option><option value="Attended" ${filter === 'Attended' ? 'selected' : ''}>Present</option><option value="Missed" ${filter === 'Missed' ? 'selected' : ''}>Absent</option><option value="Excused" ${filter === 'Excused' ? 'selected' : ''}>Excused</option><option value="Completed" ${filter === 'Completed' ? 'selected' : ''}>Completed</option></select></label></div><div class="data-table-wrapper"><table class="data-table po-training-attendance-table"><thead><tr><th>Participant</th><th>Business / Group</th><th>Workflow Status</th><th>Attendance Status</th><th>Completion Status</th><th>Notice</th><th>Actions</th></tr></thead><tbody>${filtered.map((invitee) => {
        const saveBusy = !!state.training.busyInvitees[`attendance-${invitee.id}`];
        const editorOpen = Number(state.training.attendanceEditorId) === Number(invitee.id);
        return renderTrainingAttendanceCompactRow(invitee, program, saveBusy, editorOpen);
      }).join('') || '<tr><td colspan="7" class="text-center text-muted">No scoped participants found.</td></tr>'}</tbody></table></div></section>`;
  }

  function getYearlyBatch(program) {
    return program?.yearlyBatch || state.training.summary?.yearlyBatch || {
      batchYear: new Date().getFullYear(),
      yearlyBatchCapacity: 255,
      yearlyAssignedCount: 0,
      yearlyRemainingCapacity: 255,
      yearlyGroup1Count: 0,
      yearlyGroup2Count: 0,
      yearlyGroup3Count: 0,
      yearlySessionCountUsed: 0,
      yearlySessionCountRemaining: 3,
      groupRosters: { group1: [], group2: [], group3: [] },
    };
  }

  function sessionOrdinal(program) {
    const ordered = (state.training.programs || []).slice().sort((left, right) => String(left.date || left.startsAt || '').localeCompare(String(right.date || right.startsAt || '')));
    const index = ordered.findIndex((item) => Number(item.id) === Number(program.id));
    return `Training ${Math.max(1, index + 1)} of 3`;
  }

  function renderTrainingError(message) {
    const summary = document.getElementById('po-training-summary');
    const list = document.getElementById('po-training-program-list');
    const detail = document.getElementById('po-training-session-context');
    if (summary) summary.innerHTML = `<article class="po-training-card po-snapshot-card"><div class="po-snapshot-card__eyebrow">Training</div><div class="po-snapshot-card__body"><span>Training</span><strong>--</strong></div><small class="po-snapshot-card__meta">Summary unavailable</small></article>`;
    if (list) list.innerHTML = `<div class="po-empty">${escapeHtml(message)}</div>`;
    if (detail) detail.innerHTML = `<div class="po-training-empty-state"><h4>${escapeHtml(message)}</h4></div>`;
  }

  function switchTrainingView(view, rerender = true) {
    state.training.view = view === 'session' ? 'session' : 'overview';
    const overviewView = document.getElementById('po-training-overview-view');
    const sessionView = document.getElementById('po-training-session-view');
    if (overviewView) overviewView.style.display = state.training.view === 'overview' ? 'grid' : 'none';
    if (sessionView) sessionView.style.display = state.training.view === 'session' ? 'grid' : 'none';
    if (!rerender) return;
    if (state.training.view === 'session') {
      renderTrainingSessionView();
      return;
    }
    renderTrainingOverview();
  }

  function switchTrainingSubview(subview) {
    state.training.subview = 'attendance';
    renderTrainingSessionView();
  }

  function handleTrainingInput(event) {
    const sessionFilter = event.target.closest('#po-training-session-filter');
    if (sessionFilter) {
      state.training.sessionFilter = String(sessionFilter.value || '');
      state.training.groupFilter = '';
      return renderTrainingOverview();
    }
    const groupFilter = event.target.closest('#po-training-group-filter');
    if (groupFilter) {
      state.training.groupFilter = String(groupFilter.value || '');
      return renderTrainingOverview();
    }
    const activityFilter = event.target.closest('#po-training-activity-filter');
    if (activityFilter) {
      state.training.activityFilter = String(activityFilter.value || '');
      const cursor = activityFilter.selectionStart;
      debounceRender('training-activity-filter', () => {
        renderTrainingOverview();
        const input = document.getElementById('po-training-activity-filter');
        if (input) {
          input.focus();
          try { input.setSelectionRange(cursor, cursor); } catch (_) {}
        }
      }, 200);
      return;
    }
    const overviewStatusFilter = event.target.closest('#po-training-overview-status-filter');
    if (overviewStatusFilter) {
      state.training.overviewStatusFilter = String(overviewStatusFilter.value || '');
      return renderTrainingOverview();
    }
    const search = event.target.closest('#po-training-roster-search');
    if (search) {
      state.training.rosterSearch = String(search.value || '');
      const cursor = search.selectionStart;
      debounceRender('training-roster-search', () => {
        renderTrainingSessionView();
        const input = document.getElementById('po-training-roster-search');
        if (input) {
          input.focus();
          try { input.setSelectionRange(cursor, cursor); } catch (_) {}
        }
      }, 200);
      return;
    }
    const filter = event.target.closest('#po-training-roster-filter');
    if (filter) {
      state.training.rosterFilter = String(filter.value || '');
      return renderTrainingSessionView();
    }
    const noticeSearch = event.target.closest('#po-training-notice-search');
    if (noticeSearch) {
      state.training.noticeFilters.search = String(noticeSearch.value || '');
      const cursor = noticeSearch.selectionStart;
      debounceRender('training-notice-search', () => {
        renderTrainingSessionView();
        const input = document.getElementById('po-training-notice-search');
        if (input) {
          input.focus();
          try { input.setSelectionRange(cursor, cursor); } catch (_) {}
        }
      }, 200);
      return;
    }
    const noticeStatus = event.target.closest('#po-training-notice-status');
    if (noticeStatus) {
      state.training.noticeFilters.status = String(noticeStatus.value || '');
      return renderTrainingSessionView();
    }
    const attendanceStatus = event.target.closest('[data-training-status-select]');
    if (attendanceStatus) {
      updateTrainingAttendanceDraft(Number(attendanceStatus.dataset.trainingStatusSelect), 'status', String(attendanceStatus.value || ''), true);
      return;
    }
    const attendanceRemarks = event.target.closest('[data-training-remarks]');
    if (attendanceRemarks) {
      updateTrainingAttendanceDraft(Number(attendanceRemarks.dataset.trainingRemarks), 'remarks', String(attendanceRemarks.value || ''), false);
      return;
    }
    const noticeSelect = event.target.closest('[data-training-notice-select]');
    if (noticeSelect) {
      toggleTrainingNoticeSelection(Number(noticeSelect.dataset.trainingNoticeSelect), noticeSelect.checked);
      return renderTrainingSessionView();
    }
    const noticeSelectAll = event.target.closest('[data-training-notice-select-all]');
    if (noticeSelectAll) {
      toggleTrainingNoticeSelectionAll(noticeSelectAll.checked);
      return renderTrainingSessionView();
    }
  }

  // ─── Attendance modal (overview table) ───────────────────────────────────

  function openAttendanceModal(inviteeId) {
    state.training.attendanceEditorId = inviteeId;
    const backdrop = document.getElementById('poAttendanceModalBackdrop');
    const modal = document.getElementById('poAttendanceModal');
    if (!backdrop || !modal) return;
    renderAttendanceModalBody(inviteeId);
    backdrop.hidden = false;
    backdrop.removeAttribute('aria-hidden');
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeAttendanceModal() {
    const inviteeId = state.training.attendanceEditorId;
    if (inviteeId) delete state.training.attendanceDrafts[String(inviteeId)];
    state.training.attendanceEditorId = null;
    const backdrop = document.getElementById('poAttendanceModalBackdrop');
    const modal = document.getElementById('poAttendanceModal');
    if (backdrop) { backdrop.hidden = true; backdrop.setAttribute('aria-hidden', 'true'); }
    if (modal) { modal.hidden = true; modal.setAttribute('aria-hidden', 'true'); }
    document.body.style.overflow = '';
  }

  function renderAttendanceModalBody(inviteeId) {
    const program = findProgramForInvitee(inviteeId);
    const invitee = (program?.invitees || []).find((inv) => Number(inv.id) === Number(inviteeId))
      || (state.training.programs || []).flatMap((p) => p.invitees || []).find((inv) => Number(inv.id) === Number(inviteeId));
    const meta = document.getElementById('poAttendanceModalMeta');
    const body = document.getElementById('poAttendanceModalBody');
    if (!invitee || !body) return;

    const noticeLabel = deriveTrainingWorkflowStatus(invitee);
    const attendanceStatus = deriveTrainingAttendanceStatus(invitee);
    const attendanceLabel = attendanceDisplayLabel(attendanceStatus);
    const completionLabel = deriveTrainingCompletionStatus(invitee);
    const lastUpdated = invitee.proofAttachment?.updated_at || invitee.lastNoticeSentAt || invitee.notifiedAt || '';
    const sessionLabel = program ? `Session ${program.roundNumber || '--'}` : '--';
    const groupLabel = program ? `Group ${program.targetGroupNumber || invitee.batchGroupNumber || '--'}` : '--';
    const activityName = program?.programName || '--';
    const venue = program?.venue || '--';
    const dateLabel = program?.date ? formatDate(program.date) : '--';
    const timeLabel = program ? formatTimeRange(program.startTime, program.endTime) : '--';

    const attendanceChipClass = attendanceStatus === 'Attended' ? 'atm-chip--present'
      : attendanceStatus === 'Missed' ? 'atm-chip--absent'
      : attendanceStatus === 'Excused' ? 'atm-chip--excused'
      : 'atm-chip--unmarked';
    const completionChipClass = completionLabel === 'Completed' ? 'atm-chip--completed' : 'atm-chip--incomplete';
    const noticeChipClass = noticeLabel === 'Notified' ? 'atm-chip--notified' : 'atm-chip--scheduled';

    const saveBusy = !!state.training.busyInvitees[`attendance-${inviteeId}`];
    const proof = invitee.proofAttachment;
    const draft = getTrainingAttendanceDraft(invitee);
    const needsApplicantProof = ['Excused', 'Missed'].includes(String(draft.status || ''));
    const dateLocked = isAttendanceDateLockedForProgram(program);
    const dateLockedAttr = dateLocked ? 'disabled' : '';
    const existingProofName = proof?.file_path ? String(proof.file_path).split('/').pop() : '';
    const selectedStatusChip = draft.status
      ? `<span class="atm-selected-chip atm-selected-chip--${draft.status === 'Attended' ? 'present' : draft.status === 'Missed' ? 'absent' : draft.status === 'Excused' ? 'excused' : 'none'}">${escapeHtml(attendanceDisplayLabel(draft.status))}</span>`
      : `<span class="atm-selected-chip atm-selected-chip--none">Not set</span>`;

    if (meta) {
      const initials = (invitee.user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
      meta.innerHTML = `
        <div class="atm-hero">
          <div class="atm-hero__avatar">${escapeHtml(initials)}</div>
          <div class="atm-hero__identity">
            <strong class="atm-hero__name">${escapeHtml(invitee.user?.name || '--')}</strong>
            <span class="atm-hero__sub">${escapeHtml(invitee.businessName || invitee.contactNumber || '')}</span>
          </div>
          <div class="atm-hero__chips">
            <span class="atm-chip ${noticeChipClass}">${escapeHtml(noticeLabel)}</span>
            <span class="atm-chip ${attendanceChipClass}">${escapeHtml(attendanceLabel)}</span>
            <span class="atm-chip ${completionChipClass}">${escapeHtml(completionLabel)}</span>
          </div>
        </div>
        <div class="atm-session-strip">
          <div class="atm-session-strip__item"><i class="fas fa-calendar-day"></i><span>${escapeHtml(activityName)}</span></div>
          <div class="atm-session-strip__item"><i class="fas fa-layer-group"></i><span>${escapeHtml(sessionLabel)} · ${escapeHtml(groupLabel)}</span></div>
          <div class="atm-session-strip__item"><i class="fas fa-map-marker-alt"></i><span>${escapeHtml(venue)}</span></div>
          <div class="atm-session-strip__item"><i class="fas fa-clock"></i><span>${escapeHtml(dateLabel)} · ${escapeHtml(timeLabel)}</span></div>
          ${lastUpdated ? `<div class="atm-session-strip__item"><i class="fas fa-history"></i><span>Updated ${escapeHtml(formatDate(lastUpdated))}</span></div>` : ''}
        </div>
      `;
    }

    body.innerHTML = `
      <div class="atm-body">

        <section class="atm-section atm-section--actions">
          <div class="atm-section__label"><i class="fas fa-check-circle"></i> Mark Attendance</div>
          ${dateLocked ? `<div class="atm-locked-notice"><i class="fas fa-lock"></i> Attendance opens on ${escapeHtml(formatDate(sessionDateValue(program)))}.</div>` : ''}
          <div class="atm-action-buttons">
            <button type="button" class="atm-action-btn atm-action-btn--present ${draft.status === 'Attended' ? 'is-active' : ''}" data-training-editor-status="${inviteeId}:Attended" ${dateLockedAttr}>
              <i class="fas fa-user-check"></i>
              <span>Present</span>
            </button>
            <button type="button" class="atm-action-btn atm-action-btn--absent ${draft.status === 'Missed' ? 'is-active' : ''}" data-training-editor-status="${inviteeId}:Missed" ${dateLockedAttr}>
              <i class="fas fa-user-times"></i>
              <span>Absent</span>
            </button>
            <button type="button" class="atm-action-btn atm-action-btn--excused ${draft.status === 'Excused' ? 'is-active' : ''}" data-training-editor-status="${inviteeId}:Excused" ${dateLockedAttr}>
              <i class="fas fa-user-slash"></i>
              <span>Excused</span>
            </button>
          </div>
          <div class="atm-selected-status">
            <span class="atm-selected-label">Selected:</span>
            ${selectedStatusChip}
          </div>
        </section>

        <section class="atm-section atm-section--proof ${needsApplicantProof ? 'is-required' : ''}">
          <div class="atm-section__label"><i class="fas fa-file-upload"></i> Applicant Proof</div>
          <div class="atm-proof-state">
            ${proof?.file_path
              ? `<div class="atm-proof-uploaded"><i class="fas fa-check-circle"></i><div><strong>Proof uploaded</strong><span>${escapeHtml(existingProofName || 'Uploaded file')}</span></div><a class="atm-proof-link" href="${escapeHtml(routeUrl(proof.file_path))}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> View</a></div>`
              : needsApplicantProof
                ? `<div class="atm-proof-pending"><i class="fas fa-hourglass-half"></i><div><strong>Waiting for applicant</strong><span>Applicant uploads after you save this status.</span></div></div>`
                : `<div class="atm-proof-na"><i class="fas fa-minus-circle"></i><div><strong>Not required</strong><span>Only needed for Absent or Excused.</span></div></div>`
            }
          </div>
        </section>

        <section class="atm-section atm-section--remarks">
          <div class="atm-section__label"><i class="fas fa-comment-alt"></i> Remarks</div>
          <textarea id="po-training-remarks-${inviteeId}" class="atm-remarks" data-training-remarks="${inviteeId}" rows="4" placeholder="Optional — add notes about this participant's attendance…" ${saveBusy ? 'disabled' : ''}>${escapeHtml(draft.remarks)}</textarea>
        </section>

      </div>
      <footer class="atm-footer">
        <button type="button" class="atm-footer-btn atm-footer-btn--cancel" id="poAttendanceModalCloseBtn">Cancel</button>
        <button type="button" class="atm-footer-btn atm-footer-btn--save" data-training-save-status="${inviteeId}" ${saveBusy || dateLocked ? 'disabled' : ''}>
          ${saveBusy ? '<i class="fas fa-spinner fa-spin"></i> Saving…' : '<i class="fas fa-save"></i> Save Attendance'}
        </button>
      </footer>
    `;
    document.getElementById('poAttendanceModalCloseBtn')?.addEventListener('click', closeAttendanceModal);
  }

  function handleAttendanceModalClick(event) {
    const editorStatus = event.target.closest('[data-training-editor-status]');
    if (editorStatus) {
      const [inviteeId, status] = String(editorStatus.dataset.trainingEditorStatus || '').split(':');
      updateTrainingAttendanceDraftInline(Number(inviteeId), 'status', String(status || ''), () => renderAttendanceModalBody(Number(inviteeId)));
      return;
    }
    const save = event.target.closest('[data-training-save-status]');
    if (save) {
      saveTrainingAttendanceRow(Number(save.dataset.trainingSaveStatus));
    }
  }

  function handleAttendanceModalInput(event) {
    const remarks = event.target.closest('[data-training-remarks]');
    if (remarks) {
      const inviteeId = Number(remarks.dataset.trainingRemarks);
      updateTrainingAttendanceDraftInline(inviteeId, 'remarks', remarks.value);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  async function handleTrainingClick(event) {
    const backOverview = event.target.closest('[data-training-action="back-overview"]');
    if (backOverview) {
      state.training.attendanceEditorId = null;
      state.training.attendanceDrafts = {};
      return switchTrainingView('overview');
    }
    const subview = event.target.closest('[data-training-subview]');
    if (subview) return switchTrainingSubview(String(subview.dataset.trainingSubview || 'details'));
    const open = event.target.closest('[data-training-open]');
    if (open) {
      state.training.confirmRemoveProgramId = null;
      return loadTrainingProgram(Number(open.dataset.trainingOpen));
    }
    const remove = event.target.closest('[data-training-remove]');
    if (remove) return handleTrainingRemove(Number(remove.dataset.trainingRemove));
    const noticeAction = event.target.closest('[data-training-notice-action]');
    if (noticeAction && state.training.activeProgram) {
      const action = String(noticeAction.dataset.trainingNoticeAction || '');
      if (action === 'pending') return sendTrainingNoticesToAllPending();
      if (action === 'selected') return sendTrainingNoticesToSelected();
      if (action === 'resend-selected') return resendTrainingNoticesToSelected();
      if (action === 'refresh') return refreshTrainingNoticeStates();
    }
    const openEditor = event.target.closest('[data-training-open-editor]');
    if (openEditor) {
      const inviteeId = Number(openEditor.dataset.trainingOpenEditor);
      const isClosing = Number(state.training.attendanceEditorId) === inviteeId;
      state.training.attendanceEditorId = isClosing ? null : inviteeId;
      if (isClosing) delete state.training.attendanceDrafts[String(inviteeId)];
      return renderTrainingSessionView();
    }
    const overviewEditor = event.target.closest('[data-training-overview-editor]');
    if (overviewEditor) {
      const inviteeId = Number(overviewEditor.dataset.trainingOverviewEditor);
      openAttendanceModal(inviteeId);
      return;
    }
    const quickStatus = event.target.closest('[data-training-quick-status]');
    if (quickStatus) {
      const [inviteeId, status] = String(quickStatus.dataset.trainingQuickStatus || '').split(':');
      const select = document.querySelector(`[data-training-status-select="${inviteeId}"]`);
      if (select) {
        select.value = status || select.value;
      }
      return;
    }
    const overviewStatus = event.target.closest('[data-training-overview-status]');
    if (overviewStatus) {
      const [inviteeId, status] = String(overviewStatus.dataset.trainingOverviewStatus || '').split(':');
      return saveTrainingAttendanceQuick(Number(inviteeId), String(status || ''));
    }
    const editorStatus = event.target.closest('[data-training-editor-status]');
    if (editorStatus) {
      const [inviteeId, status] = String(editorStatus.dataset.trainingEditorStatus || '').split(':');
      const rerender = () => {
        if (state.training.view === 'overview') {
          renderAttendanceModalBody(Number(inviteeId));
        } else {
          renderTrainingSessionView();
        }
      };
      updateTrainingAttendanceDraftInline(Number(inviteeId), 'status', String(status || 'Notified'), rerender);
      return;
    }
    const save = event.target.closest('[data-training-save-status]');
    if (save) return saveTrainingAttendanceRow(Number(save.dataset.trainingSaveStatus));
  }

  async function handleTrainingSubmit(event) {
    const inviteeForm = event.target.closest('#po-training-invitees-form');
    if (inviteeForm && state.training.activeProgram?.id && !state.training.syncingInvitees) {
      event.preventDefault();
      const formData = new FormData(inviteeForm);
      const applicantProfileIds = formData.getAll('invitees.applicantProfileIds[]').map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
      state.training.syncingInvitees = true;
      renderTrainingSessionView();
      const response = await apiPost('api/training/invitees', { programId: state.training.activeProgram.id, applicantProfileIds });
      state.training.syncingInvitees = false;
      if (!response.ok) {
        renderTrainingSessionView();
        return showToast(firstError(response.errors) || response.message || 'Unable to save participants.', 'warning');
      }
      showToast('Session participants updated.', 'success');
      await loadTrainingProgram(state.training.activeProgram.id, false);
      await loadTraining();
      return;
    }

    const form = event.target.closest('#po-training-session-form');
    if (!form || !state.training.activeProgram || state.training.savingProgram) return;
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      programId: state.training.activeProgram.id,
      programName: String(formData.get('program.programName') || ''),
      description: state.training.activeProgram.description || '',
      date: String(formData.get('program.date') || ''),
      startTime: String(formData.get('program.startTime') || ''),
      endTime: String(formData.get('program.endTime') || ''),
      venue: String(formData.get('program.venue') || ''),
      speaker: String(formData.get('program.speaker') || ''),
      whatToBring: String(formData.get('program.whatToBring') || ''),
      instructions: String(formData.get('program.instructions') || ''),
      trainingMode: 'batch',
      seminarFormCodes: formData.getAll('program.seminarFormCodes[]'),
      status: state.training.activeProgram.status || 'Scheduled',
    };
    state.training.savingProgram = true;
    renderTrainingSessionView();
    const response = await apiPost(state.training.activeProgram.isDraft ? 'api/training' : 'api/training/update', payload);
    state.training.savingProgram = false;
    if (!response.ok) {
      renderTrainingSessionView();
      return showToast(firstError(response.errors) || response.message || 'Unable to save session details.', 'warning');
    }
    showToast(state.training.activeProgram.isDraft ? 'Training session created.' : 'Session details updated.', 'success');
    if (response.programId) {
      state.training.selectedProgramId = Number(response.programId);
      state.training.activeProgram = null;
      await loadTrainingProgram(Number(response.programId), false);
      await loadTraining();
      return;
    }
    if (state.training.selectedProgramId) await loadTrainingProgram(state.training.selectedProgramId, false);
    await loadTraining();
  }

  async function sendTrainingNotices(programId, inviteeIds = [], mode = 'send') {
    const busyKey = inviteeIds.length === 1 ? `invitee-${inviteeIds[0]}` : `program-${mode}`;
    if (state.training.busyInvitees[busyKey]) return;
    state.training.busyInvitees[busyKey] = true;
    if (inviteeIds.length !== 1) {
      state.training.sendingProgramNotice = mode;
    }
    renderTrainingSessionView();
    const response = await apiPost('api/training/notices', { programId, inviteeIds });
    if (!response.ok) {
      delete state.training.busyInvitees[busyKey];
      state.training.sendingProgramNotice = '';
      renderTrainingSessionView();
      return showToast(firstError(response.errors) || response.message || 'Unable to send notices.', 'warning');
    }
    state.training.lastNotifiedInviteeId = inviteeIds.length === 1 ? inviteeIds[0] : null;
    showToast(inviteeIds.length === 1 ? 'Participant notice sent.' : 'Training notices sent.', 'success');
    await loadTrainingProgram(programId, false);
    await loadTraining();
    delete state.training.busyInvitees[busyKey];
    state.training.sendingProgramNotice = '';
    renderTrainingSessionView();
  }

  function toggleTrainingNoticeSelection(inviteeId, checked) {
    const selected = new Set((state.training.noticeSelection || []).map(Number));
    if (checked) selected.add(Number(inviteeId));
    else selected.delete(Number(inviteeId));
    state.training.noticeSelection = Array.from(selected);
    state.training.noticeWarning = '';
  }

  function toggleTrainingNoticeSelectionAll(checked) {
    const invitees = Array.isArray(state.training.activeProgram?.invitees) ? state.training.activeProgram.invitees : [];
    const search = String(state.training.noticeFilters.search || '').toLowerCase();
    const status = String(state.training.noticeFilters.status || '');
    const filtered = invitees.filter((invitee) => {
      const noticeStatus = invitee.lastNoticeSentAt || invitee.notifiedAt ? 'Notified' : 'Not Sent';
      const matchesSearch = !search || [invitee.user?.name, invitee.businessName].some((value) => String(value || '').toLowerCase().includes(search));
      const matchesStatus = !status || noticeStatus === status;
      return matchesSearch && matchesStatus;
    }).map((invitee) => Number(invitee.id));
    state.training.noticeSelection = checked ? filtered : [];
    state.training.noticeWarning = '';
  }

  async function sendTrainingNoticesToAllPending() {
    const invitees = Array.isArray(state.training.activeProgram?.invitees) ? state.training.activeProgram.invitees : [];
    const pendingIds = invitees.filter((invitee) => !(invitee.lastNoticeSentAt || invitee.notifiedAt)).map((invitee) => Number(invitee.id));
    if (!pendingIds.length) {
      state.training.noticeWarning = 'No assigned participants are available. Notices can only be sent after participant assignment.';
      return renderTrainingSessionView();
    }
    state.training.noticeWarning = '';
    return sendTrainingNotices(state.training.activeProgram.id, pendingIds, 'pending');
  }

  async function sendTrainingNoticesToSelected() {
    const selectedIds = (state.training.noticeSelection || []).map(Number).filter(Boolean);
    if (!selectedIds.length) {
      state.training.noticeWarning = 'Select at least one participant to send a notice.';
      return renderTrainingSessionView();
    }
    state.training.noticeWarning = '';
    return sendTrainingNotices(state.training.activeProgram.id, selectedIds, 'selected');
  }

  async function resendTrainingNoticesToSelected() {
    const selectedIds = (state.training.noticeSelection || []).map(Number).filter(Boolean);
    if (!selectedIds.length) {
      state.training.noticeWarning = 'Select at least one participant to resend a notice.';
      return renderTrainingSessionView();
    }
    state.training.noticeWarning = '';
    return sendTrainingNotices(state.training.activeProgram.id, selectedIds, 'resend-selected');
  }

  async function refreshTrainingNoticeStates() {
    state.training.noticeWarning = '';
    if (!state.training.selectedProgramId) return;
    await loadTrainingProgram(state.training.selectedProgramId, false);
    await loadTraining();
  }

  async function handleTrainingRemove(programId) {
    if (state.training.removingProgramId === programId) return;
    if (state.training.confirmRemoveProgramId !== programId) {
      state.training.confirmRemoveProgramId = programId;
      return renderTrainingQueue();
    }

    state.training.removingProgramId = programId;
    renderTrainingQueue();
    const response = await apiPost('api/training/delete', { programId });
    state.training.removingProgramId = null;
    state.training.confirmRemoveProgramId = null;
    if (!response.ok) {
      renderTrainingQueue();
      return showToast(firstError(response.errors) || response.message || 'Unable to remove training session.', 'warning');
    }

    if (state.training.selectedProgramId === programId) {
      state.training.selectedProgramId = null;
      state.training.activeProgram = null;
      state.training.view = 'overview';
    }

    showToast('Training session removed.', 'success');
    await loadTraining();
  }

  async function saveTrainingAttendanceQuick(trainingInviteeId, status) {
    if (!trainingInviteeId || !['Attended', 'Excused', 'Missed'].includes(status)) {
      return showToast('Choose Present, Absent, or Excused before saving attendance.', 'warning');
    }

    if (state.training.busyInvitees[`attendance-${trainingInviteeId}`]) return null;
    state.training.busyInvitees[`attendance-${trainingInviteeId}`] = true;
    renderTrainingQueue();

    const formData = new FormData();
    formData.append('trainingInviteeId', String(trainingInviteeId));
    formData.append('status', status);
    formData.append('remarks', '');

    const response = await apiFormPost('api/training/attendance', formData);
    delete state.training.busyInvitees[`attendance-${trainingInviteeId}`];
    if (!response.ok) {
      renderTrainingQueue();
      return showToast(firstError(response.errors) || response.message || 'Unable to update attendance.', 'warning');
    }

    state.training.lastUpdatedInviteeId = trainingInviteeId;
    showToast('Attendance record updated.', 'success');
    await loadTraining();
    return null;
  }

  async function updateTrainingAttendance(trainingInviteeId) {
    const draft = state.training.attendanceDrafts[String(trainingInviteeId)] || {};
    // Find invitee from active program (session view) or any scoped program (overview).
    const invitee = (state.training.activeProgram?.invitees || []).find((item) => Number(item.id) === Number(trainingInviteeId))
      || (state.training.programs || []).flatMap((p) => p.invitees || []).find((item) => Number(item.id) === Number(trainingInviteeId));
    const program = state.training.activeProgram || findProgramForInvitee(trainingInviteeId);
    const status = String(draft.status || '').trim();
    const rerenderCurrent = () => {
      const modal = document.getElementById('poAttendanceModal');
      if (modal && !modal.hidden && state.training.attendanceEditorId) {
        renderAttendanceModalBody(state.training.attendanceEditorId);
      } else if (state.training.view === 'overview') {
        renderTrainingQueue();
      } else {
        renderTrainingSessionView();
      }
    };
    if (!['Attended', 'Excused', 'Missed'].includes(status)) {
      showToast('Choose Present, Absent, or Excused before saving attendance.', 'warning');
      return;
    }
    if (invitee && isAttendanceDateLockedForProgram(program) && ['Attended', 'Excused', 'Missed'].includes(status)) {
      showToast(`Attendance opens on ${formatDate(sessionDateValue(program))}.`, 'warning');
      return;
    }
    const remarksSource = draft.remarks ?? document.querySelector(`[data-training-remarks="${trainingInviteeId}"]`)?.value ?? '';
    const remarks = String(remarksSource).trim();
    const proofInput = document.querySelector(`[data-training-proof="${trainingInviteeId}"]`);
    if (state.training.busyInvitees[`attendance-${trainingInviteeId}`]) return;
    state.training.busyInvitees[`attendance-${trainingInviteeId}`] = true;
    rerenderCurrent();
    const formData = new FormData();
    formData.append('trainingInviteeId', String(trainingInviteeId));
    formData.append('status', status);
    formData.append('remarks', remarks);
    const proofFile = proofInput instanceof HTMLInputElement ? proofInput.files?.[0] : null;
    if (proofFile) {
      formData.append('proofAttachment', proofFile);
    }
    const response = await apiFormPost('api/training/attendance', formData);
    if (!response.ok) {
      delete state.training.busyInvitees[`attendance-${trainingInviteeId}`];
      rerenderCurrent();
      return showToast(firstError(response.errors) || response.message || 'Unable to update attendance.', 'warning');
    }
    showToast('Attendance record updated.', 'success');
    state.training.lastUpdatedInviteeId = trainingInviteeId;
    delete state.training.attendanceDrafts[String(trainingInviteeId)];
    state.training.attendanceEditorId = null;
    // Close the modal if it was used for this update, then refresh data and re-render the table.
    closeAttendanceModal();
    if (state.training.selectedProgramId) await loadTrainingProgram(state.training.selectedProgramId, false);
    await loadTraining();
    delete state.training.busyInvitees[`attendance-${trainingInviteeId}`];
    rerenderCurrent();
  }

  // Persist one invitee's attendance row after validating the allowed status set and completion rules.
  function saveTrainingAttendanceRow(trainingInviteeId) {
    return updateTrainingAttendance(trainingInviteeId);
  }

  // Start the PDO workflow for setting up a new training session for the current yearly batch.
  function openNewTrainingSession() {
    state.training.selectedProgramId = null;
    state.training.subview = 'details';
    state.training.rosterSearch = '';
    state.training.rosterFilter = '';
    state.training.noticeSelection = [];
    state.training.noticeWarning = '';
    state.training.noticeFilters = { search: '', status: '' };
    state.training.activeProgram = {
      id: null,
      isDraft: true,
      programName: '',
      description: '',
      date: '',
      startTime: '',
      endTime: '',
      venue: '',
      speaker: '',
      whatToBring: '',
      instructions: '',
      trainingMode: 'batch',
      seminarFormCodes: [],
      status: 'Scheduled',
      invitees: [],
    };
    switchTrainingView('session');
  }

  async function handleLogout() {
    try {
      await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        credentials: 'same-origin',
        body: new URLSearchParams({ entryPoint: 'staff' }).toString(),
      });
    } finally {
      window.location.href = `${baseUrl}/login`;
    }
  }

  function readinessLabel(status) {
    if (status === 'Flagged') return 'Needs Documents';
    if (status === 'Needs Correction') return 'Needs Correction';
    if (status === 'Submitted' || status === 'Under Review' || status === 'Pending') return 'Under Review';
    if (status === 'Checked by PDO' || status === 'Requirements Verified' || status === 'For Assessment' || status === 'Approved' || status === 'Approved for Training') return 'Ready';
    return 'Under Review';
  }

  function applicationMatchesSearch(item, search) {
    if (!search) return true;
    return [item.applicantName, item.barangay, item.businessName, item.email, item.contactNumber].some((value) => String(value || '').toLowerCase().includes(search));
  }

  function priorityWeight(item) {
    const readiness = readinessLabel(item.status);
    if (readiness === 'Ready') return 4;
    if (readiness === 'Needs Correction') return 3;
    if (readiness === 'Needs Documents') return 2;
    return 1;
  }

  function debounceRender(key, callback, delay = 140) {
    window.clearTimeout(state.searchTimers[key]);
    state.searchTimers[key] = window.setTimeout(callback, delay);
  }

  function latestNoticeDate(invitees) {
    const values = invitees.map((invitee) => invitee.lastNoticeSentAt || invitee.notifiedAt).filter(Boolean).sort((left, right) => toTime(right) - toTime(left));
    return values.length ? formatDate(values[0]) : '';
  }

  function normalizeDateInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function normalizeTimeInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.length >= 5 ? raw.slice(0, 5) : raw;
  }

  function formatTimeRange(start, end) {
    const startLabel = formatTimeLabel(start);
    const endLabel = formatTimeLabel(end);
    if (!startLabel && !endLabel) return '--';
    if (!endLabel) return startLabel;
    if (!startLabel) return endLabel;
    return `${startLabel} - ${endLabel}`;
  }

  function formatTimeLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parts = raw.slice(0, 5).split(':');
    if (parts.length !== 2) return raw;
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return raw;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  }

  function showToast(message, type = 'info') {
    const root = document.getElementById('poToastStack');
    if (!root) return;
    const toast = document.createElement('div');
    toast.className = `po-toast po-toast--${type}`;
    toast.textContent = message;
    root.appendChild(toast);
    window.setTimeout(() => toast.classList.add('is-visible'), 10);
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  function requirementStatusLabel(status) {
    const value = String(status || '').toLowerCase();
    if (['verified', 'approved'].includes(value)) return 'Approved';
    if (value === 'needs correction') return 'Needs Correction';
    if (value === 'rejected') return 'Rejected';
    if (['submitted', 'pending', 'unlocked', 'in progress'].includes(value)) return 'Pending';
    return value === 'missing' ? 'Missing' : (status || 'Pending');
  }

  function requirementStatusClass(status) {
    const value = requirementStatusLabel(status).toLowerCase();
    if (value === 'approved') return 'is-success';
    if (value === 'rejected' || value === 'missing') return 'is-danger';
    if (value === 'pending' || value === 'needs correction') return 'is-warning';
    return 'is-muted';
  }

  function statusClass(status) {
    const value = String(status || '').toLowerCase();
    if (['approved', 'checked by pdo', 'verified', 'completed', 'attended'].includes(value)) return 'is-success';
    if (['excused'].includes(value)) return 'is-warning';
    if (['rejected', 'flagged', 'missing', 'missed'].includes(value)) return 'is-danger';
    if (['needs correction', 'notified', 'scheduled', 'submitted', 'under review', 'pending'].includes(value)) return 'is-warning';
    return 'is-muted';
  }

  function trainingModeLabel() {
    return 'Yearly Batch - 3 Trainings - 3 Groups x 100';
  }

  function readinessBadgeClass(status) {
    const value = String(status || '').toLowerCase();
    if (value.includes('approved') || value.includes('ready') || value.includes('checked by pdo')) return 'is-success';
    if (value.includes('needs correction') || value.includes('needs documents') || value.includes('flagged')) return 'is-danger';
    return 'is-warning';
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function setStatusChipClass(id, status) {
    const node = document.getElementById(id);
    if (!node) return;
    node.classList.remove('is-success', 'is-warning', 'is-danger', 'is-muted', 'po-status-chip--header');
    node.classList.add('po-status-chip--header', statusClass(status));
  }

  function formatDate(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTimeDetailed(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function toTime(value) {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function firstError(errors) {
    if (!errors || typeof errors !== 'object') return '';
    const values = Object.values(errors);
    return values.length ? values[0] : '';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
