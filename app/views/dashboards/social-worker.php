<?php /** @var string $baseUrl */ ?>
<?php /** @var array|null $authUser */ ?>
<?php /** @var array $overview */ ?>
<?php
$adminCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin.css')) ?: time();
$adminComponentsCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-components.css')) ?: time();
$adminBeneficiariesCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-beneficiaries.css')) ?: time();
$adminValidationCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-validation.css')) ?: time();
$adminReportsCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-reports.css')) ?: time();
$socialWorkerCssVersion = @filemtime(base_path('public/assets/css/dashboards/social-worker.css')) ?: time();
$notificationsCssVersion = @filemtime(base_path('public/assets/css/components/notifications.css')) ?: time();
$reportsModuleJsVersion = @filemtime(base_path('public/assets/js/modules/reports.js')) ?: time();
$socialWorkerJsVersion = @filemtime(base_path('public/assets/js/dashboards/social-worker.js')) ?: time();
$notificationsJsVersion = @filemtime(base_path('public/assets/js/shared/notifications.js')) ?: time();

$applicationSummary = $overview['applicationSummary'] ?? [];
$assessmentQueue = $overview['assessmentQueue'] ?? [];
$recentApplications = $overview['recentApplications'] ?? [];
$validationState = $overview['validationState'] ?? ['summary' => [], 'pending' => [], 'selected' => [], 'saved' => []];
$validationSummary = $validationState['summary'] ?? [];
$beneficiarySummary = $overview['beneficiarySummary'] ?? [];
$beneficiaryRosterSummary = $overview['beneficiaryRosterSummary'] ?? [];
$coMakerRegistrationSummary = $overview['coMakerRegistrationSummary'] ?? [];
$repaymentSummary = $overview['repaymentSummary'] ?? [];
$generatedAt = date(DATE_ATOM);
$jsonFlags = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Core document metadata for the Social Worker dashboard shell. -->
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Browser tab title for the Social Worker oversight workspace. -->
  <title>SMART LEAP | Social Worker</title>

  <!-- Shared admin component styles plus Social Worker-specific dashboard styling. -->
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin.css?v=<?= urlencode((string) $adminCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-components.css?v=<?= urlencode((string) $adminComponentsCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-beneficiaries.css?v=<?= urlencode((string) $adminBeneficiariesCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-validation.css?v=<?= urlencode((string) $adminValidationCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-reports.css?v=<?= urlencode((string) $adminReportsCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/social-worker.css?v=<?= urlencode((string) $socialWorkerCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/components/notifications.css?v=<?= urlencode((string) $notificationsCssVersion) ?>">

  <!-- Icon font used in navigation, KPI cards, and action buttons. -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">
</head>
<body class="admin-control-body social-worker-body">
  <!-- Bootstrap values consumed by the Social Worker dashboard scripts and reports module. -->
  <script>
    window.SMARTLEAP_BASE_URL = <?= json_encode($baseUrl, $jsonFlags) ?>;
    window.SMARTLEAP_AUTH_USER = <?= json_encode($authUser ?? null, $jsonFlags) ?>;
    window.SMARTLEAP_SOCIAL_WORKER_OVERVIEW = <?= json_encode($overview ?? [], $jsonFlags) ?>;
    window.SMARTLEAP_REPORT_EXPORT_BASE = 'social-worker/reports/export';
  </script>

  <div id="mainSystem" class="admin-shell social-worker-shell" data-sidebar-open="false">
      <aside id="adminSidebar" class="admin-sidebar" aria-label="Social worker navigation" aria-hidden="false">
        <!-- Social Worker branding at the top of the fixed navigation column. -->
        <div class="sidebar-brand">
          <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="SMART LEAP logo" class="brand-logo">
          <div class="brand-copy">
            <h1 class="brand-title">SMART LEAP</h1>
            <span class="brand-tag">Social Worker</span>
          </div>
        </div>

        <!-- Social worker navigation stays focused on oversight and reporting. -->
        <nav class="sidebar-nav" aria-label="Social worker navigation">
        <!-- Social Worker KPI and chart overview. -->
        <button class="nav-link active" type="button" data-section="dashboard">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-5H4v5Z"/></svg><span>Dashboard</span>
        </button>
        <!-- Stage 1 validation oversight. -->
        <button class="nav-link" type="button" data-section="validation">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4v2h10V8H7Zm0 4v2h7v-2H7Z"/></svg><span>Validation</span><span class="nav-badge" data-section-badge="validation"></span>
        </button>
        <!-- Applicant oversight list for review-state monitoring. -->
        <button class="nav-link" type="button" data-section="applications">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Zm7 1.5V8h3.5L13 4.5ZM8.5 12h6v1.5h-6V12Zm0 4H13v1.5H8.5V16Z"/></svg><span>Applicants</span><span class="nav-badge" data-section-badge="applications"></span>
        </button>
        <!-- Beneficiary oversight list for status and repayment monitoring. -->
        <button class="nav-link" type="button" data-section="beneficiaries">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM8 13c-3 0-5.5 1.6-5.5 3.6V20h11v-3.4C13.5 14.6 11 13 8 13Zm8 0c-.9 0-1.8.1-2.5.4 1.2.9 2 2 2 3.2V20h6v-3.4C21.5 14.6 19 13 16 13Z"/></svg><span>Beneficiaries</span>
        </button>
        <!-- Read-only co-maker registrations overview. -->
        <button class="nav-link" type="button" data-section="co-makers">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm6 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM3 20v-1c0-2.8 3.1-5 6-5s6 2.2 6 5v1H3Zm12 0v-.7c0-1.1-.3-2.1-.9-3 2.4.2 4.9 1.8 4.9 3.7v1H15Z"/></svg><span>Co-makers</span><span class="nav-badge" data-section-badge="co-makers"></span>
        </button>
        <!-- Support concern oversight and reply workspace. -->
        <button class="nav-link" type="button" data-section="support">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm3 5h10v2H7v-2Z"/></svg><span>Support</span><span class="nav-badge" data-section-badge="support"></span>
        </button>
        <!-- Read-only repayment oversight. -->
        <button class="nav-link" type="button" data-section="repayments">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l1 4v14H5V7l1-4Zm2.2 2-.5 2h8.6l-.5-2H8.2ZM8 11h8v2H8v-2Zm0 4h8v2H8v-2Z"/></svg><span>Repayments</span>
        </button>
        <!-- Export-oriented reports workspace for Social Worker oversight data. -->
        <button class="nav-link" type="button" data-section="reports">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16v2H4v-2Zm2-2h3V9H6v8Zm5 0h3V4h-3v13Zm5 0h3v-6h-3v6Z"/></svg><span>Reports</span>
        </button>
      </nav>

    </aside>

    <div class="sidebar-backdrop" data-sidebar-close></div>

    <div class="content-area">
      <header class="content-header admin-topbar">
        <!-- Mobile-friendly sidebar toggle for smaller Social Worker viewports. -->
        <button type="button" class="sidebar-toggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="adminSidebar">
          <span class="sidebar-toggle-icon" aria-hidden="true"></span>
        </button>

        <!-- Section title and eyebrow update as the Social Worker changes workspaces. -->
        <div class="content-headline">
          <h1 id="swSectionTitle">Dashboard</h1>
        </div>

        <div class="admin-topbar__actions">
          <!-- Refresh reloads oversight counts, applicant queues, beneficiary lists, and support data. -->
          <button type="button" class="app-btn-outline admin-refresh-button" id="swRefreshButton" aria-label="Refresh social worker dashboard">
            <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h8V3l-3.3 3.3Z"/></svg>
          </button>
          <!-- Account actions for Social Worker profile, password maintenance, and logout. -->
          <div class="admin-account-menu staff-account-menu">
            <button type="button" class="app-btn-outline admin-account-menu__trigger" id="swAccountMenuTrigger" aria-expanded="false">
              <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"/></svg>
              <span>Account</span>
            </button>
            <div class="admin-account-menu__panel" id="swAccountMenuPanel" hidden>
              <div class="admin-account-menu__actions">
                <button type="button" class="app-btn-ghost admin-account-menu__action" id="swAccountProfile">
                  <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"/></svg>
                  <span>Profile</span>
                </button>
                <button type="button" class="app-btn-ghost admin-account-menu__action" id="swAccountPassword">
                  <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z"/></svg>
                  <span>Change Password</span>
                </button>
                <button type="button" class="app-btn-outline app-btn-outline--danger admin-account-menu__action admin-account-menu__action--danger" id="sw-logout">
                  <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h8v2H6v12h6v2H4V4Zm12.6 4.4L21.2 13l-4.6 4.6-1.4-1.4 2.2-2.2H10v-2h7.4l-2.2-2.2 1.4-1.4Z"/></svg>
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main class="content-main">
        <section id="dashboard-section" class="admin-section is-active" data-role-section>
          <div class="sw-page-stack">
            <section class="sw-summary-strip sw-summary-strip--overview sw-dashboard-kpi-strip" aria-label="Social Worker oversight summary">
              <article class="metric-card metric-card--soft sw-dashboard-kpi sw-dashboard-kpi--applications">
                <div class="sw-dashboard-kpi__eyebrow">Applications</div>
                <div class="sw-dashboard-kpi__main">
                  <div class="sw-dashboard-kpi__copy">
                    <strong class="metric-card__value" id="swDashApplicationsTotal"><?= (int) ($applicationSummary['total'] ?? 0) ?></strong>
                  </div>
                  <span class="sw-dashboard-kpi__icon" aria-hidden="true"><i class="fas fa-folder-open"></i></span>
                </div>
              </article>
              <article class="metric-card metric-card--soft sw-dashboard-kpi sw-dashboard-kpi--repayments">
                <div class="sw-dashboard-kpi__eyebrow">Repayments</div>
                <div class="sw-dashboard-kpi__main">
                  <div class="sw-dashboard-kpi__copy">
                    <strong class="metric-card__value" id="swDashRepaymentsPending"><?= (int) (($repaymentSummary['fullyPaid'] ?? $repaymentSummary['fully_paid'] ?? 0) + ($repaymentSummary['partialPaid'] ?? $repaymentSummary['partial_paid'] ?? 0) + ($repaymentSummary['underReview'] ?? $repaymentSummary['under_review'] ?? 0) + ($repaymentSummary['needsCorrection'] ?? $repaymentSummary['needs_correction'] ?? 0)) ?></strong>
                  </div>
                  <span class="sw-dashboard-kpi__icon" aria-hidden="true"><i class="fas fa-receipt"></i></span>
                </div>
              </article>
              <article class="metric-card metric-card--soft sw-dashboard-kpi sw-dashboard-kpi--beneficiaries">
                <div class="sw-dashboard-kpi__eyebrow">Beneficiaries</div>
                <div class="sw-dashboard-kpi__main">
                  <div class="sw-dashboard-kpi__copy">
                    <strong class="metric-card__value" id="swDashBeneficiariesTotal"><?= (int) ($beneficiarySummary['total'] ?? $beneficiarySummary['active'] ?? 0) ?></strong>
                  </div>
                  <span class="sw-dashboard-kpi__icon" aria-hidden="true"><i class="fas fa-users"></i></span>
                </div>
              </article>
            </section>

            <section class="sw-dashboard-chart-grid" aria-label="Social Worker dashboard charts">
              <article class="admin-layout-card sw-dashboard-chart-card">
                <h2>Applicants by Status</h2>
                <div class="sw-dashboard-chart" id="swApplicantsStatusChart"></div>
                <div class="sw-dashboard-legend" id="swApplicantsStatusLegend"></div>
                <div class="sw-dashboard-chart-footer" id="swApplicantsStatusFooter">No application records yet.</div>
              </article>
              <article class="admin-layout-card sw-dashboard-chart-card">
                <h2>Beneficiaries by Status</h2>
                <div class="sw-dashboard-chart" id="swBeneficiariesStatusChart"></div>
                <div class="sw-dashboard-legend" id="swBeneficiariesStatusLegend"></div>
                <div class="sw-dashboard-chart-footer" id="swBeneficiariesStatusFooter">No beneficiary records yet.</div>
              </article>
              <article class="admin-layout-card sw-dashboard-chart-card">
                <h2>Repayment Verification Rate</h2>
                <div class="sw-dashboard-chart" id="swRepaymentVerificationRateChart"></div>
                <div class="sw-dashboard-legend" id="swRepaymentVerificationRateLegend"></div>
                <div class="sw-dashboard-chart-footer" id="swRepaymentVerificationRateFooter">No repayment records yet.</div>
              </article>
            </section>
          </div>
        </section>

        <section id="validation-section" class="admin-section" data-role-section hidden>
          <div class="sw-page-stack">
            <section class="sw-summary-strip sw-summary-strip--compact" aria-label="Validation overview">
              <article class="admin-layout-card">
                <span class="admin-section-eyebrow">Pending</span>
                <strong class="metric-card__value" data-sw-validation-pending><?= (int) ($validationSummary['pending'] ?? 0) ?></strong>
              </article>
              <article class="admin-layout-card">
                <span class="admin-section-eyebrow">Selected</span>
                <strong class="metric-card__value" data-sw-validation-selected><?= (int) ($validationSummary['selected'] ?? 0) ?></strong>
              </article>
              <article class="admin-layout-card">
                <span class="admin-section-eyebrow">Saved</span>
                <strong class="metric-card__value" data-sw-validation-saved><?= (int) ($validationSummary['saved'] ?? 0) ?></strong>
              </article>
            </section>

            <div class="validation-tabs sw-validation-tabs" role="tablist" aria-label="Social Worker validation queues">
              <button type="button" class="validation-tab is-active" data-sw-validation-tab="pending" role="tab" aria-selected="true">Pending <span data-sw-validation-tab-count="pending"><?= (int) ($validationSummary['pending'] ?? 0) ?></span></button>
              <button type="button" class="validation-tab" data-sw-validation-tab="selected" role="tab" aria-selected="false">Selected <span data-sw-validation-tab-count="selected"><?= (int) ($validationSummary['selected'] ?? 0) ?></span></button>
              <button type="button" class="validation-tab" data-sw-validation-tab="saved" role="tab" aria-selected="false">Saved <span data-sw-validation-tab-count="saved"><?= (int) ($validationSummary['saved'] ?? 0) ?></span></button>
            </div>

            <section class="filters-row admin-beneficiaries-filters sw-admin-filters sw-admin-filters--single-search">
              <label class="filter-group filter-group--search">
                <span class="filter-label">Search</span>
                <div class="filter-search">
                  <i class="fas fa-search"></i>
                  <input type="search" id="swValidationSearch" placeholder="Search applicant, email, or address" autocomplete="off">
                </div>
              </label>
            </section>

            <section class="table-card">
              <div class="table-wrapper sw-table-wrapper">
                <table class="admin-data-table">
                  <thead>
                    <tr>
                      <th>Applicant</th>
                      <th>Email</th>
                      <th>Contact</th>
                      <th>Address</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody data-sw-validation-body>
                    <tr><td colspan="7">Loading validation records...</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>

        <section id="applications-section" class="admin-section" data-role-section hidden>
          <div class="sw-page-stack">
            <section class="filters-row admin-beneficiaries-filters sw-admin-filters">
              <label class="filter-group filter-group--search">
                <span class="filter-label">Search</span>
                <div class="filter-search">
                  <i class="fas fa-search"></i>
                  <input type="search" id="swApplicationSearch" placeholder="Search applicant, email, or business" autocomplete="off">
                </div>
              </label>
              <label class="filter-group">
                <span class="filter-label">Status</span>
                <select class="filter-select" id="swApplicationStatus">
                  <option value="">All application statuses</option>
                  <option value="requirements verified">Requirements Verified</option>
                  <option value="for assessment">For Assessment</option>
                  <option value="under review">Under Review</option>
                  <option value="needs correction">Needs Correction</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
            </section>

            <section class="table-card">
              <div class="table-wrapper sw-table-wrapper">
                <table class="admin-data-table">
                  <thead>
                    <tr>
                      <th>Applicant</th>
                      <th>Business</th>
                      <th>Barangay</th>
                      <th>Status</th>
                      <th>Requirements</th>
                      <th>Updated</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody data-sw-applications-body>
                    <tr><td colspan="7">Loading applications...</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>

        <section id="beneficiaries-section" class="admin-section" data-role-section hidden>
          <div class="sw-page-stack">
            <section class="table-card">
              <div class="filters-row admin-beneficiaries-filters sw-admin-filters sw-admin-filters--three">
                <label class="filter-group filter-group--search">
                  <span class="filter-label">Search</span>
                  <div class="filter-search">
                    <i class="fas fa-search"></i>
                    <input type="search" id="swBeneficiarySearch" placeholder="Search beneficiary, business, barangay, or PDO" autocomplete="off">
                  </div>
                </label>
                <label class="filter-group">
                  <span class="filter-label">Barangay</span>
                  <select class="filter-select" id="swBeneficiaryBarangay">
                    <option value="">All barangays</option>
                  </select>
                </label>
                <label class="filter-group">
                  <span class="filter-label">Assigned PDO</span>
                  <select class="filter-select" id="swBeneficiaryPdo">
                    <option value="">All PDOs</option>
                  </select>
                </label>
                <label class="filter-group">
                  <span class="filter-label">Repayment</span>
                  <select class="filter-select" id="swBeneficiaryRepayment">
                    <option value="">All repayment states</option>
                    <option value="no_upload">No Upload Yet</option>
                    <option value="under_review">Under Review</option>
                    <option value="needs_follow_up">Needs Follow-up</option>
                    <option value="partial_paid">Partial Paid</option>
                    <option value="fully_paid">Fully Paid</option>
                  </select>
                </label>
              </div>
            </section>

            <section class="table-card">
              <div class="table-wrapper sw-table-wrapper">
                <table class="admin-data-table">
                  <thead>
                    <tr>
                      <th>Beneficiary</th>
                      <th>Gender</th>
                      <th>Age Group</th>
                      <th>Service Type</th>
                      <th>Barangay</th>
                      <th>Assigned PDO</th>
                      <th>Repayment</th>
                      <th>Verified Amount</th>
                      <th>Rate</th>
                      <th class="actions">Action</th>
                    </tr>
                  </thead>
                  <tbody data-sw-beneficiaries-body>
                    <tr><td colspan="10">Loading beneficiaries...</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>

        <section id="co-makers-section" class="admin-section" data-role-section hidden>
          <div class="sw-page-stack">
            <section class="filters-row admin-beneficiaries-filters sw-admin-filters sw-admin-filters--three">
              <label class="filter-group filter-group--search">
                <span class="filter-label">Search</span>
                <div class="filter-search">
                  <i class="fas fa-search"></i>
                  <input type="search" id="swCoMakerSearch" placeholder="Search co-maker or primary beneficiary" autocomplete="off">
                </div>
              </label>
              <label class="filter-group">
                <span class="filter-label">Status</span>
                <select class="filter-select" id="swCoMakerStatus">
                  <option value="">All statuses</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label class="filter-group">
                <span class="filter-label">Assigned PDO</span>
                <select class="filter-select" id="swCoMakerPdo">
                  <option value="">All PDOs</option>
                </select>
              </label>
            </section>

            <section class="table-card">
              <div class="table-wrapper sw-table-wrapper">
                <table class="admin-data-table">
                  <thead>
                    <tr>
                      <th>Co-maker</th>
                      <th>Primary Beneficiary</th>
                      <th>Relationship</th>
                      <th>Assigned PDO</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody data-sw-co-makers-body>
                    <tr><td colspan="7">Loading co-maker registrations...</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>

        <section id="repayments-section" class="admin-section" data-role-section hidden>
          <div class="sw-page-stack">
            <section class="filters-row admin-beneficiaries-filters sw-admin-filters">
              <label class="filter-group filter-group--search">
                <span class="filter-label">Search</span>
                <div class="filter-search">
                  <i class="fas fa-search"></i>
                  <input type="search" id="swRepaymentSearch" placeholder="Search payer, beneficiary, business, or OR number" autocomplete="off">
                </div>
              </label>
              <label class="filter-group">
                <span class="filter-label">Status</span>
                <select class="filter-select" id="swRepaymentStatus">
                  <option value="">All repayment states</option>
                  <option value="under_review">Under Review</option>
                  <option value="needs_correction">Needs Correction</option>
                  <option value="rejected">Rejected</option>
                  <option value="partial_paid">Partial Paid</option>
                  <option value="fully_paid">Fully Paid</option>
                </select>
              </label>
            </section>

            <section class="table-card">
              <div class="table-wrapper sw-table-wrapper">
                <table class="admin-data-table">
                  <thead>
                    <tr>
                      <th>Current Payer</th>
                      <th>Beneficiary</th>
                      <th>Coverage</th>
                      <th>Amount</th>
                      <th>OR Number</th>
                      <th>Payment Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody data-sw-repayments-body>
                    <tr><td colspan="8">Loading repayments...</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>

        <section id="support-section" class="admin-section" data-role-section hidden>
          <div class="sw-page-stack">
            <section class="sw-support-grid" aria-label="Support concern workspace">
              <article class="table-card">
                <div class="section-header">
                  <div>
                    <h2>Assigned Support Concerns</h2>
                    <p class="section-subtitle" data-sw-ticket-count>0 tickets</p>
                  </div>
                </div>
                <div class="sw-ticket-list" data-sw-ticket-list>
                  <p class="sw-empty">Loading support concerns...</p>
                </div>
              </article>
              <article class="table-card sw-ticket-detail" data-sw-ticket-detail>
                <p class="sw-empty">Select a support concern to read the conversation and send a reply.</p>
              </article>
            </section>
          </div>
        </section>

        <section id="reports-section" class="admin-section" data-role-section hidden>
          <div class="admin-reports-loading">Loading reports.</div>
        </section>
      </main>

      <div id="swModalRoot"></div>
    </div>
  </div>

  <script src="<?= $baseUrl ?>/assets/js/shared/notifications.js?v=<?= urlencode((string) $notificationsJsVersion) ?>" defer></script>
  <script src="<?= $baseUrl ?>/assets/js/modules/reports.js?v=<?= urlencode((string) $reportsModuleJsVersion) ?>" defer></script>
  <script src="<?= $baseUrl ?>/assets/js/dashboards/social-worker.js?v=<?= urlencode((string) $socialWorkerJsVersion) ?>" defer></script>
</body>
</html>
