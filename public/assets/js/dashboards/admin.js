(function () {
  // Shared namespace used by the Admin shell to hand off section ownership to specialized modules.
  window.App = window.App || {};
  window.App.modules = window.App.modules || {};

  // Auth and route bootstrap values supplied by the server-rendered admin shell.
  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');
  const authUser = window.SMARTLEAP_AUTH_USER || null;
  let repaymentWorkspace = null;

  // Top-level admin shell state for overview refreshes and live status timers.
  const state = {
    overview: window.SMARTLEAP_ADMIN_OVERVIEW || {},
    fetchPromise: null,
    refreshTimers: [],
    statusTimer: null,
  };

  // Header copy applied when the admin switches between major workspaces.
  const SECTION_META = {
    dashboard: {
      eyebrow: 'Admin Workspace',
      title: 'Dashboard',
    },
    validation: {
      eyebrow: 'Admin Workspace',
      title: 'Application for Validation',
    },
    applications: { eyebrow: 'Admin Workspace', title: 'Applications' },
    training: { eyebrow: 'Admin Workspace', title: 'Training' },
    team: { eyebrow: 'Admin Workspace', title: 'Team' },
    beneficiaries: { eyebrow: 'Admin Workspace', title: 'Beneficiaries' },
    'co-makers': { eyebrow: 'Admin Workspace', title: 'Co-maker Registrations' },
    repayments: { eyebrow: 'Admin Workspace', title: 'Repayments' },
    reports: { eyebrow: 'Admin Workspace', title: 'Reports' },
  };

  // Build same-origin admin endpoints used by the shell and mounted modules.
  function routeUrl(path) {
    return `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;
  }

  // Normalize API responses so shell-level fetch helpers return a consistent shape.
  async function parseJson(response) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        message: response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unexpected server response.',
      };
    }
    return response.json();
  }

  // Generic GET helper for admin shell and module bootstrap requests.
  async function apiGet(path, params = {}) {
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
  }

  // Generic POST helper for admin profile, password, and other shell-owned mutations.
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
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  }

  // Small DOM helpers reused throughout the Admin shell logic.
  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function firstError(errors) {
    if (!errors || typeof errors !== 'object') return '';
    const values = Object.values(errors);
    return values.length ? values[0] : '';
  }

  function splitNameParts(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts.shift() || '',
      middleName: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
      lastName: parts.length ? parts[parts.length - 1] : '',
    };
  }

  function composeFullName(parts = {}) {
    return [parts.firstName, parts.middleName, parts.lastName]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ');
  }

  function getInitials(name, fallback = 'A') {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || fallback;
  }

  function sectionElement(section) {
    return document.getElementById(`${section}-section`);
  }

  function updateHeader(section) {
    const eyebrow = document.getElementById('adminSectionEyebrow');
    const title = document.getElementById('adminSectionTitle');
    const meta = SECTION_META[section] || SECTION_META.dashboard;

    if (eyebrow) eyebrow.textContent = meta.eyebrow || 'Admin Workspace';
    if (title) title.textContent = meta.title || 'Dashboard';
  }

  function setSection(nextSection) {
    const section = SECTION_META[nextSection] ? nextSection : 'dashboard';
    const headline = document.querySelector('.content-headline');
    document.body.dataset.adminSection = section;

    qsa('[data-role-section]').forEach((panel) => {
      const active = panel.id === `${section}-section`;
      panel.hidden = !active;
      panel.style.display = active ? '' : 'none';
    });

    qsa('.nav-link[data-section]').forEach((button) => {
      button.classList.toggle('active', button.dataset.section === section);
    });

    updateHeader(section);
    headline?.classList.remove('is-hidden');
    if (section === 'repayments') {
      repaymentWorkspace?.refresh?.();
    }
    if (section === 'reports') {
      requestAnimationFrame(() => window.App?.modules?.reports?.render?.());
    }
    window.location.hash = section;
  }

  window.App.adminShell = {
    setSection,
    refresh: (reason = 'manual') => fetchDashboardData(reason),
    notify: (message, isError = false) => showLiveStatus(message, isError),
  };

  function triggerCommand(command) {
    switch (command) {
      case 'create-training':
        setSection('training');
        requestAnimationFrame(() => qs('#training-focus-create')?.click());
        break;
      case 'add-staff':
        setSection('team');
        break;
      default:
        break;
    }
  }

  function initNavigation() {
    qsa('.nav-link[data-section]').forEach((button) => {
      button.addEventListener('click', () => setSection(button.dataset.section || 'dashboard'));
    });

    qsa('[data-section-link]').forEach((trigger) => {
      trigger.addEventListener('click', () => setSection(trigger.dataset.sectionLink || 'dashboard'));
    });

    qsa('[data-quick-action]').forEach((trigger) => {
      trigger.addEventListener('click', () => triggerCommand(trigger.dataset.quickAction || ''));
    });

  }

  function renderNavBadges(data) {
    const applicationSummary = data.applicationSummary || {};
    const repaymentSummary = data.repaymentSummary || {};
    const trainingSummary = data.trainingSummary || {};

    const counts = {
      validation: safeNumber(data.validationSummary?.pending),
      applications: safeNumber(applicationSummary.underReview),
      repayments: safeNumber(repaymentSummary.pendingVerification)
        + safeNumber(repaymentSummary.needsCorrection)
        + safeNumber(repaymentSummary.rejected),
      training: safeNumber(trainingSummary.scheduled),
      team: 0,
      beneficiaries: 0,
      'co-makers': safeNumber(data.coMakerRegistrationSummary?.pendingReview),
      };

    Object.entries(counts).forEach(([key, value]) => {
      const badge = document.querySelector(`[data-section-badge="${key}"]`);
      if (!badge) return;
      badge.textContent = value > 0 ? String(value) : '';
      badge.hidden = value <= 0;
    });
  }

  function initSidebar() {
    const shell = document.getElementById('mainSystem');
    shell?.removeAttribute('data-sidebar-open');
  }

  function initAccountMenu() {
    const trigger = document.getElementById('adminAccountMenuTrigger');
    const panel = document.getElementById('adminAccountMenuPanel');
    if (!trigger || !panel) return;

    const setExpanded = (expanded) => {
      trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      panel.hidden = !expanded;
    };

    const closeAccountMenu = () => setExpanded(false);

    window.App.adminShell.closeAccountMenu = closeAccountMenu;

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setExpanded(trigger.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.admin-account-menu')) {
        closeAccountMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeAccountMenu();
      }
    });
  }

  async function resolveAdminStaffRecord() {
    const response = await apiGet('api/team/self');
    if (!response.ok) return null;
    return response.staff || null;
  }

  function profileAvatarMarkup(staff, initials) {
    const photo = String(staff?.photo || authUser?.photo || '').trim();
    if (photo) {
      return `<div class="admin-profile-modal__avatar admin-record-sheet__avatar has-photo" style="background-image:url('${escapeHtml(photo)}')" aria-hidden="true"></div>`;
    }
    return `<div class="admin-profile-modal__avatar admin-record-sheet__avatar" aria-hidden="true">${escapeHtml(initials)}</div>`;
  }

  function adminProfileMarkup({ roleLabel, staff = null, error = '', saving = false }) {
    const nameParts = splitNameParts(staff?.name || authUser?.name || '');
    const fullName = staff?.name || authUser?.name || 'Administrator';
    const email = staff?.email || authUser?.email || '';
    return `
      <div class="modal-overlay" data-admin-profile-overlay>
        <div class="modal-card admin-profile-modal" role="dialog" aria-modal="true" aria-labelledby="adminProfileModalTitle">
          <div class="modal-header">
            <div class="po-modal-title-block">
              <h2 class="modal-title" id="adminProfileModalTitle">Profile</h2>
            </div>
            <button type="button" class="modal-close" data-admin-profile-close aria-label="Close profile modal">&times;</button>
          </div>
          <form id="adminProfileForm" class="modal-body admin-profile-modal__form">
            <section class="admin-record-sheet admin-record-sheet--account">
              <div class="admin-record-sheet__hero">
                <div class="admin-record-sheet__avatar-wrap">
                  ${profileAvatarMarkup(staff, getInitials(fullName))}
                  <label class="admin-profile-photo-action">
                    <input type="file" id="adminProfilePhotoInput" accept=".jpg,.jpeg,.png" hidden ${saving ? 'disabled' : ''}>
                    <span class="app-btn-outline">${saving ? 'Uploading...' : 'Change Photo'}</span>
                  </label>
                </div>
                <div class="admin-record-sheet__identity">
                  <span class="admin-record-sheet__eyebrow">User Profile</span>
                  <h3>${escapeHtml(fullName)}</h3>
                  <p>${escapeHtml(roleLabel)}</p>
                </div>
              </div>
              <section class="admin-record-sheet__section admin-record-sheet__section--violet">
                <div class="admin-record-sheet__section-head">
                  <span>User Information</span>
                </div>
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
                <div class="admin-record-sheet__section-head">
                  <span>Contact Information</span>
                </div>
                <div class="admin-record-sheet__grid admin-record-sheet__grid--two">
                  <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                    <span class="admin-profile-modal__label">Email Address</span>
                    <input class="admin-profile-modal__input" type="email" name="email" value="${escapeHtml(email)}" required readonly>
                  </label>
                  <label class="admin-record-sheet__field">
                    <span class="admin-profile-modal__label">Contact Number</span>
                    <input class="admin-profile-modal__input" type="text" name="contactNumber" value="${escapeHtml(staff?.contactNumber || '')}">
                  </label>
                </div>
              </section>
              ${error ? `<div class="notice danger admin-profile-modal__notice">${escapeHtml(error)}</div>` : ''}
            </section>
          </form>
          <div class="modal-footer">
            <button type="button" class="app-btn-outline" data-admin-profile-close>Back</button>
            <button type="submit" form="adminProfileForm" class="app-btn-primary" id="adminProfileSave"${saving ? ' disabled' : ''}>${saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    `;
  }

  function openAdminProfileModal() {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    let currentStaff = null;
    let currentError = '';
    let isSaving = false;
    let photoBusy = false;

    const closeModal = () => {
      document.removeEventListener('keydown', handleEscape);
      modalRoot.innerHTML = '';
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };

    const renderModal = () => {
      modalRoot.innerHTML = adminProfileMarkup({
        roleLabel: 'Administrator',
        staff: currentStaff,
        error: currentError,
        saving: isSaving || photoBusy,
      });

      modalRoot.querySelectorAll('[data-admin-profile-close]').forEach((button) => {
        button.addEventListener('click', closeModal);
      });

      modalRoot.querySelector('[data-admin-profile-overlay]')?.addEventListener('click', (event) => {
        if (event.target.hasAttribute('data-admin-profile-overlay')) {
          closeModal();
        }
      });

      modalRoot.querySelector('#adminProfilePhotoInput')?.addEventListener('change', async (event) => {
        const input = event.currentTarget;
        const file = input?.files?.[0];
        if (!file || photoBusy) return;
        if (file.size > 5 * 1024 * 1024) {
          currentError = 'Profile photo must be 5 MB or less.';
          return renderModal();
        }
        photoBusy = true;
        currentError = '';
        renderModal();
        const reader = new FileReader();
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
          if (!response.ok) {
            currentError = response.message || 'Unable to save the profile photo.';
            return renderModal();
          }

          currentStaff = await resolveAdminStaffRecord();
          if (authUser && response.data?.user) {
            authUser.photo = response.data.user.photo || authUser.photo || null;
          }
          showLiveStatus(response.message || 'Profile photo updated.', false);
          renderModal();
        };
        reader.readAsDataURL(file);
      });

      modalRoot.querySelector('#adminProfileForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!currentStaff || isSaving || photoBusy) return;
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        const formData = new FormData(form);
        const payload = {
          firstName: formData.get('firstName') || '',
          middleName: formData.get('middleName') || '',
          lastName: formData.get('lastName') || '',
          email: formData.get('email') || '',
          contactNumber: formData.get('contactNumber') || '',
        };
        isSaving = true;
        currentError = '';
        renderModal();
        const response = await apiPost('api/team/update', {
          staffId: currentStaff.id,
          name: composeFullName(payload),
          email: payload.email || '',
          role: currentStaff.role || 'admin',
          status: currentStaff.status || 'active',
          contactNumber: payload.contactNumber || '',
          positionTitle: currentStaff.positionTitle || '',
        });
        isSaving = false;
        if (!response.ok) {
          currentError = firstError(response.errors) || response.message || 'Unable to save your profile.';
          return renderModal();
        }
        currentStaff = await resolveAdminStaffRecord();
        if (currentStaff) {
          authUser.name = currentStaff.name || composeFullName(payload) || authUser.name;
          authUser.email = currentStaff.email || payload.email || authUser.email;
        }
        showLiveStatus('Profile updated.', false);
        currentError = '';
        renderModal();
      });
    };

    currentStaff = {
      name: authUser?.name || 'Administrator',
      email: authUser?.email || '',
      contactNumber: '',
      role: 'admin',
      status: 'active',
      positionTitle: 'Administrator',
    };
    renderModal();

    resolveAdminStaffRecord().then((staff) => {
      if (staff) {
        currentStaff = staff;
        renderModal();
      }
    }).catch(() => {
      currentError = 'Unable to load your account details right now.';
      renderModal();
    });

    document.addEventListener('keydown', handleEscape);
  }

  function initProfileModal() {
    const button = document.getElementById('adminAccountProfile');
    if (!button) return;

    button.addEventListener('click', () => {
      window.App.adminShell?.closeAccountMenu?.();
      openAdminProfileModal();
    });
  }

  function openAdminPasswordModal() {
    const existing = document.querySelector('[data-admin-password-modal]');
    existing?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.dataset.adminPasswordModal = 'true';
    modal.innerHTML = `
      <div class="modal-card admin-profile-modal" role="dialog" aria-modal="true" aria-labelledby="adminPasswordModalTitle">
        <div class="modal-header">
          <div class="po-modal-title-block">
            <h2 class="modal-title" id="adminPasswordModalTitle">Change Password</h2>
          </div>
          <button type="button" class="modal-close" data-admin-password-close aria-label="Close password modal">&times;</button>
        </div>
        <form id="adminPasswordForm" class="modal-body admin-profile-modal__form">
          <section class="admin-record-sheet admin-record-sheet--account">
            <section class="admin-record-sheet__section admin-record-sheet__section--amber">
              <div class="admin-record-sheet__section-head">
                <span>Administrator</span>
              </div>
              <div class="admin-record-sheet__grid">
                <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                  <span class="admin-profile-modal__label">Current Password</span>
                  <input class="admin-profile-modal__input" type="password" name="currentPassword" required>
                </label>
                <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                  <span class="admin-profile-modal__label">New Password</span>
                  <input class="admin-profile-modal__input" type="password" name="newPassword" required minlength="8">
                </label>
                <label class="admin-record-sheet__field admin-record-sheet__field--wide">
                  <span class="admin-profile-modal__label">Confirm New Password</span>
                  <input class="admin-profile-modal__input" type="password" name="confirmPassword" required minlength="8">
                </label>
                <div class="notice danger admin-profile-modal__notice" id="adminPasswordError" hidden></div>
              </div>
            </section>
          </section>
        </form>
        <div class="modal-footer">
          <button type="button" class="app-btn-outline" data-admin-password-close>Back</button>
          <button type="submit" form="adminPasswordForm" class="app-btn-primary">Save Password</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-admin-password-close]')) {
        modal.remove();
      }
    });
    modal.querySelector('#adminPasswordForm')?.addEventListener('submit', submitAdminPasswordChange);
    document.body.appendChild(modal);
  }

  async function submitAdminPasswordChange(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorNode = document.getElementById('adminPasswordError');
    const submitButton = document.querySelector('[form="adminPasswordForm"]');
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
      showLiveStatus(payload.message || 'Password updated.', false);
      document.querySelector('[data-admin-password-modal]')?.remove();
    } catch (error) {
      if (errorNode) {
        errorNode.hidden = false;
        errorNode.textContent = error.message || 'Unable to change password.';
      }
    } finally {
      submitButton.disabled = false;
    }
  }

  function initChangePasswordModal() {
    const button = document.getElementById('adminAccountPassword');
    if (!button) return;
    button.addEventListener('click', () => {
      window.App.adminShell?.closeAccountMenu?.();
      openAdminPasswordModal();
    });
  }

  function initLogout() {
    const button = document.getElementById('system-logout');
    if (!button) return;

    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await fetch(routeUrl('auth/logout'), {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
      } catch (error) {
        console.warn('Admin logout failed', error);
      } finally {
        window.location.href = routeUrl('login');
      }
    });
  }

  // Boot each admin workspace module after the shell is ready so section-specific logic stays isolated.
  function initModules() {
    const modules = window.App?.modules || {};
    modules.dashboard?.init?.();
    modules.validation?.init?.();
    modules.applications?.init?.();
    modules.training?.init?.();
    modules.team?.init?.();
    modules.beneficiaries?.init?.();
    modules.coMakerRegistrations?.init?.();
  }

  // Wire the shared repayment review modal into the Admin repayment roster and decision buttons.
  function initRepaymentWorkspace() {
    if (!window.SMARTLEAP_REPAYMENT_REVIEW?.createWorkspace || repaymentWorkspace) {
      return;
    }
    repaymentWorkspace = window.SMARTLEAP_REPAYMENT_REVIEW.createWorkspace({
      actorName: authUser?.name || 'Administrator',
      actorRole: 'Admin',
      notify: (message, tone) => showLiveStatus(message, tone === 'warning'),
      beneficiaryRecordsProvider: () => {
        const overview = window.SMARTLEAP_ADMIN_OVERVIEW || {};
        const roster = Array.isArray(overview.beneficiaryRoster) ? overview.beneficiaryRoster : [];
        return roster.filter((beneficiary) => {
          const approvalDate = String(beneficiary?.approvalDate || '').trim();
          return approvalDate !== '';
        });
      },
      ids: {
        search: 'adminRepaymentSearch',
        barangayFilter: 'adminRepaymentBarangayFilter',
        pdoFilter: 'adminRepaymentPdoFilter',
        stateFilter: 'adminRepaymentStateFilter',
        fromDateFilter: 'adminRepaymentFromDate',
        toDateFilter: 'adminRepaymentToDate',
        resetFilters: 'adminRepaymentResetFilters',
        approvedCount: 'adminRepaymentApprovedCount',
        pendingCount: 'adminRepaymentPendingBeneficiaryCount',
        partialCount: 'adminRepaymentPartialCount',
        fullCount: 'adminRepaymentFullCount',
        rosterBody: 'adminRepaymentRosterBody',
        rosterCount: 'adminRepaymentRosterCount',
        modalRoot: 'adminRepaymentModal',
        modalClose: 'adminRepaymentModalClose',
        modalStatus: 'adminRepaymentModalStatus',
        modalTitle: 'adminRepaymentModalTitle',
        modalSubtitle: 'adminRepaymentModalSubtitle',
        beneficiaryName: 'adminRepaymentBeneficiaryName',
        business: 'adminRepaymentBusiness',
        barangay: 'adminRepaymentBarangay',
        assignedPdo: 'adminRepaymentAssignedPdo',
        submittedAt: 'adminRepaymentSubmittedAt',
        summaryOutstanding: 'adminRepaymentSummaryOutstanding',
        summaryVerified: 'adminRepaymentSummaryVerified',
        summaryProgress: 'adminRepaymentSummaryProgress',
        summaryStanding: 'adminRepaymentSummaryStanding',
        paymentDate: 'adminRepaymentPaymentDate',
        orNumber: 'adminRepaymentOrNumber',
        amount: 'adminRepaymentAmount',
        submissionType: 'adminRepaymentSubmissionType',
        coverage: 'adminRepaymentCoverage',
        submittedBy: 'adminRepaymentSubmittedBy',
        uploadStatus: 'adminRepaymentUploadStatus',
        hardCopyStatus: 'adminRepaymentHardCopyStatus',
        hardCopyInput: 'adminRepaymentHardCopyInput',
        duplicateWarning: 'adminRepaymentDuplicateWarning',
        proofName: 'adminRepaymentProofName',
        proofType: 'adminRepaymentProofType',
        proofDate: 'adminRepaymentProofDate',
        proofPreview: 'adminRepaymentProofPreview',
        openProof: 'adminRepaymentOpenProof',
        downloadProof: 'adminRepaymentDownloadProof',
        fullscreenProof: 'adminRepaymentFullscreenProof',
        historyBody: 'adminRepaymentHistoryBody',
        remarks: 'adminRepaymentRemarks',
        verifyPartial: 'adminRepaymentVerifyPartial',
        verifyFull: 'adminRepaymentVerifyFull',
        needsCorrection: 'adminRepaymentNeedsCorrection',
        reject: 'adminRepaymentReject',
        close: 'adminRepaymentClose',
        decisionNote: 'adminRepaymentDecisionNote',
      },
      barangayAllLabel: 'All barangays',
      pdoAllLabel: 'All PDOs',
      emptyColspan: 12,
      emptyRosterMessage: 'No approved beneficiaries with repayment records available yet.',
      bodyModalClass: 'admin-repayment-modal-open',
    });
  }

  function setDashboardLoading(isLoading) {
    document.getElementById('dashboard-section')?.classList.toggle('is-loading', isLoading);
    const refreshButton = document.getElementById('adminRefreshButton');
    if (refreshButton) {
      refreshButton.disabled = isLoading;
    }
  }

  function showLiveStatus(message, isError) {
    const node = document.getElementById('adminLiveStatusMessage');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    node.dataset.state = isError ? 'error' : 'info';
    if (state.statusTimer) {
      window.clearTimeout(state.statusTimer);
    }
    state.statusTimer = window.setTimeout(() => {
      node.hidden = true;
    }, 5000);
  }

  // Repaint the Admin KPI strip and top-level dashboard charts from the latest overview payload.
  function renderDashboard(data) {
    state.overview = data || {};
    window.SMARTLEAP_ADMIN_OVERVIEW = state.overview;
    window.App?.modules?.dashboard?.render?.(state.overview);
    window.App?.modules?.beneficiaries?.render?.();
    window.App?.modules?.coMakerRegistrations?.render?.();
    renderNavBadges(state.overview);
  }

  async function fetchDashboardData(reason) {
    if (document.hidden) {
      return state.overview;
    }
    if (reason !== 'manual' && document.body.dataset.adminSection === 'reports') {
      return state.overview;
    }
    if (state.fetchPromise) {
      return state.fetchPromise;
    }

    setDashboardLoading(reason === 'manual');
    state.fetchPromise = fetch(routeUrl('admin/state'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || 'Failed to load admin dashboard state.');
        }
        renderDashboard(payload.data || {});
        return payload.data || {};
      })
      .catch((error) => {
        console.warn('Admin dashboard live update failed', error);
        if (reason === 'manual') {
          showLiveStatus('Unable to refresh dashboard right now.', true);
        } else {
          const node = document.getElementById('adminLiveStatusMessage');
          if (node) {
            node.hidden = true;
            node.textContent = '';
          }
        }
        return state.overview;
      })
      .finally(() => {
        setDashboardLoading(false);
        state.fetchPromise = null;
      });

    return state.fetchPromise;
  }

  // Keep the dashboard fresh in the background while still allowing an explicit manual refresh.
  function initLiveRefresh() {
    document.getElementById('adminRefreshButton')?.addEventListener('click', () => {
      fetchDashboardData('manual');
    });

    state.refreshTimers.push(window.setInterval(() => { fetchDashboardData('activity'); }, 15000));
    state.refreshTimers.push(window.setInterval(() => { fetchDashboardData('kpi'); }, 30000));
    state.refreshTimers.push(window.setInterval(() => { fetchDashboardData('chart'); }, 60000));
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderDashboard(state.overview);
    initModules();
    initRepaymentWorkspace();
    initNavigation();
    initSidebar();
    initAccountMenu();
    initProfileModal();
    initChangePasswordModal();
    initLogout();
    initLiveRefresh();

    const initialSection = (window.location.hash || '').replace(/^#/, '');
    setSection(initialSection || 'dashboard');
  });
})();
