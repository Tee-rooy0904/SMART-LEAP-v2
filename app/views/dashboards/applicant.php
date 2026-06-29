<?php /** @var string $baseUrl */ ?>
<?php /** @var array|null $authUser */ ?>
<?php
$applicantCssVersion = @filemtime(base_path('public/assets/css/dashboards/applicant.css')) ?: time();
$beneficiaryCssVersion = @filemtime(base_path('public/assets/css/dashboards/beneficiary.css')) ?: time();
$postApprovalCssVersion = @filemtime(base_path('public/assets/css/dashboards/post-approval.css')) ?: time();
$notificationsCssVersion = @filemtime(base_path('public/assets/css/components/notifications.css')) ?: time();
$applicantJsVersion = @filemtime(base_path('public/assets/js/dashboards/applicant.js')) ?: time();
$applicantBeneficiaryJsVersion = @filemtime(base_path('public/assets/js/dashboards/applicant-beneficiary.js')) ?: time();
$applicantProfileJsVersion = @filemtime(base_path('public/assets/js/dashboards/applicant-profile.js')) ?: time();
$languageToggleJsVersion = @filemtime(base_path('public/assets/js/dashboards/language-toggle.js')) ?: time();
$supportHelpdeskJsVersion = @filemtime(base_path('public/assets/js/dashboards/support-helpdesk.js')) ?: time();
$notificationsJsVersion = @filemtime(base_path('public/assets/js/shared/notifications.js')) ?: time();
$faviconVersion = @filemtime(base_path('public/assets/img/logo-mark.png')) ?: time();
$butuanBarangays = array_map(
    static fn (array $row): string => (string) ($row['name'] ?? ''),
    (new \App\Services\BarangayCatalogService())->all()
);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Core document metadata for the private applicant portal. -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Browser tab title for the Stage 2 applicant workspace. -->
    <title>SMART LEAP | Dashboard</title>
    <link rel="icon" type="image/png" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="apple-touch-icon" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">

    <!-- Applicant and post-approval styles used across profile, application, training, and support pages. -->
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/applicant.css?v=<?= urlencode((string) $applicantCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/beneficiary.css?v=<?= urlencode((string) $beneficiaryCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/post-approval.css?v=<?= urlencode((string) $postApprovalCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/components/notifications.css?v=<?= urlencode((string) $notificationsCssVersion) ?>">
</head>
<body class="applicant-dashboard-page">
    <!-- Bootstrap values consumed by the applicant dashboard scripts after page load. -->
    <script>
        window.SMARTLEAP_AUTH_USER = <?= json_encode($authUser ?? null, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_BASE_URL = <?= json_encode($baseUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_BARANGAYS = <?= json_encode($butuanBarangays, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    </script>
    <div class="dashboard-shell">
        <aside class="dash-sidebar" id="appSidebar" aria-label="Applicant portal navigation">
            <!-- Applicant portal branding and mobile drawer close button. -->
            <div class="sidebar-drawer__top">
                <div class="sidebar-brand">
                    <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="SMART LEAP seal" class="sidebar-logo">
                    <div class="sidebar-brand__copy"><strong class="sidebar-title">SMART LEAP</strong></div>
                </div>
                <button type="button" class="sidebar-drawer__close" id="sidebarClose" aria-label="Close navigation">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <!-- Applicant routing is intentionally narrow: overview, application, training, and support. -->
            <nav class="sidebar-nav">
                <!-- Overview page showing current step, milestones, and important updates. -->
                <a class="sidebar-link is-active" href="#dashboard-home"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M3 11.5L12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10.5V20h13V10.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span data-i18n-key="overview">Overview</span></a>
                <!-- Application page for profile completion, requirements, and workflow review status. -->
                <a class="sidebar-link" href="#application-page" data-applicant-nav><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M8 7h8" stroke-linecap="round"/><path d="M8 12h8" stroke-linecap="round"/><path d="M8 17h5" stroke-linecap="round"/><rect x="5" y="3" width="14" height="18" rx="2" stroke-linejoin="round"/></svg></span><span data-i18n-key="application">Application</span></a>
                <!-- Training page for schedules, notices, attendance, and certificate readiness. -->
                <a class="sidebar-link" href="#training-page" data-applicant-nav><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M3 9l9-4 9 4-9 4-9-4z" stroke-linejoin="round"/><path d="M7 11v5c0 1.66 2.91 3 5 3s5-1.34 5-3v-5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span data-i18n-key="training">Training</span></a>
                <!-- Repayment page is visible to applicants but locked until beneficiary approval is confirmed. -->
                <a class="sidebar-link" href="#repayments" data-beneficiary-nav><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><rect x="6" y="4" width="12" height="16" rx="2" stroke-linejoin="round"/><path d="M9 9h6" stroke-linecap="round"/><path d="M9 12h6" stroke-linecap="round"/><path d="M9 15h3" stroke-linecap="round"/></svg></span><span data-i18n-key="repayments">Repayments</span></a>
                <!-- Support page for help-desk contact and conversation history. -->
                <a class="sidebar-link" href="#support-page"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M7 7h10a3 3 0 013 3v4a3 3 0 01-3 3h-3l-3 4-3-4H7a3 3 0 01-3-3v-4a3 3 0 013-3z" stroke-linejoin="round"/></svg></span><span data-i18n-key="support">Support</span></a>
            </nav>
        </aside>
        <button type="button" class="sidebar-overlay" id="sidebarOverlay" aria-hidden="true" tabindex="-1"></button>
        <div class="portal-loader" id="portalLoader" aria-live="polite">
            <div class="portal-loader__orb" aria-hidden="true"></div>
            <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="" class="portal-loader__logo">
            <strong class="portal-loader__title">SMART LEAP</strong>
            <p class="portal-loader__copy" id="portalLoaderCopy">Loading your portal...</p>
        </div>
        <div class="dash-content">
            <header class="mobile-topbar applicant-contextbar" aria-label="Applicant portal navigation">
                <!-- Compact top bar shown on smaller screens for title, notifications, language, and account access. -->
                <div class="applicant-contextbar__brand">
                    <strong class="mobile-topbar__title" id="mobileTopbarTitle" data-i18n-key="overview">Overview</strong>
                </div>
                <div class="applicant-contextbar__actions">
                    <div class="applicant-contextbar__notifications" id="applicantNotificationMount"></div>
                    <div class="portal-language-toggle" role="group" aria-label="Select language">
                        <button type="button" class="portal-language-toggle__button is-active" data-language-option="en">English</button>
                        <button type="button" class="portal-language-toggle__button" data-language-option="ceb">Tagalog</button>
                    </div>
                    <div class="mobile-topbar__account">
                        <!-- Mobile account trigger opens profile, password, and sign-out actions. -->
                        <button
                            type="button"
                            class="mobile-topbar__avatar"
                            id="applicantAccountToggle"
                            aria-label="Open account menu"
                            aria-haspopup="menu"
                            aria-expanded="false"
                        >
                            <span class="mobile-topbar__avatar-initial" id="mobileAccountAvatar" aria-hidden="true">A</span>
                        </button>
                    </div>
                </div>
            </header>
            <div class="applicant-account-sheet" id="applicantAccountSheet" role="menu" aria-hidden="true" hidden>
                <div class="applicant-account-sheet__header">
                    <strong class="applicant-account-sheet__title">Account</strong>
                    <button type="button" class="applicant-account-sheet__close" id="applicantAccountClose" aria-label="Close account menu">&times;</button>
                </div>
                <button type="button" class="applicant-account-sheet__item" id="applicantAccountProfile" role="menuitem" data-i18n-key="profile">Profile</button>
                <button type="button" class="applicant-account-sheet__item" id="applicantAccountPassword" role="menuitem" data-i18n-key="changePassword">Change Password</button>
                <button type="button" class="applicant-account-sheet__item" id="applicantAccountLogout" role="menuitem" data-i18n-key="signOut">Sign Out</button>
            </div>
            <main class="dash-main">
                <!-- ── BENEFICIARY OVERVIEW PAGE ──────────────────────────────────────── -->
                <!-- Shows only when user is beneficiary AND hash is overview/dashboard-home -->
                <section id="beneficiary-page" class="dash-page unified-beneficiary-page is-route-hidden" data-beneficiary-page>
                    <section class="dash-section unified-beneficiary-hero" aria-labelledby="unifiedBeneficiaryHeading">
                        <div class="panel beneficiary-balance-card unified-beneficiary-balance-card">
                            <div class="beneficiary-balance-card__body">
                                <span class="label">Current balance</span>
                                <strong id="unifiedBeneficiaryBalance">&#8369;0.00</strong>
                                <p id="unifiedBeneficiaryStanding">Loading beneficiary standing.</p>
                            </div>
                            <div class="beneficiary-balance-card__actions">
                                <button type="button" class="btn-primary" id="unifiedBeneficiaryPrimaryAction">Upload receipt</button>
                            </div>
                        </div>
                    </section>
                    <section class="panel dash-section panel--summary beneficiary-repayment-hero" aria-labelledby="unifiedBeneficiaryHeading">
                        <div class="panel-header panel-header--compact">
                            <h3 id="unifiedBeneficiaryHeading">Beneficiary overview</h3>
                            <p class="panel-subtitle">Your SMART LEAP beneficiary record and repayment standing.</p>
                        </div>
                        <div class="beneficiary-inline-metrics beneficiary-inline-metrics--hero" role="list">
                            <article class="overview-card overview-card--balance" role="listitem">
                                <span class="overview-label">Next due</span>
                                <strong class="overview-value" id="unifiedBeneficiaryNextDue">--</strong>
                            </article>
                            <article class="overview-card" role="listitem">
                                <span class="overview-label">Pending verification</span>
                                <strong class="overview-value" id="unifiedBeneficiaryPending">0 receipts</strong>
                            </article>
                            <article class="overview-card" role="listitem">
                                <span class="overview-label">Repayment progress</span>
                                <strong class="overview-value" id="unifiedBeneficiaryProgress">0/24 months</strong>
                            </article>
                            <article class="overview-card" role="listitem">
                                <span class="overview-label">Assigned PDO</span>
                                <strong class="overview-value" id="unifiedBeneficiaryPdo">--</strong>
                            </article>
                        </div>
                    </section>
                    <section class="panel dash-section beneficiary-progress-row" aria-labelledby="unifiedRepaymentProgressHeading">
                        <div class="beneficiary-progress-row__main">
                            <div class="beneficiary-progress-row__head">
                                <div>
                                    <span class="beneficiary-progress-row__label" id="unifiedRepaymentProgressHeading">Repayment completion</span>
                                    <strong class="beneficiary-progress-row__value" id="unifiedBeneficiaryProgressText">0/24 months</strong>
                                </div>
                                <p class="beneficiary-progress-row__meta" id="unifiedBeneficiaryRate">0% complete</p>
                            </div>
                            <div class="beneficiary-progress-row__track" role="progressbar" aria-labelledby="unifiedRepaymentProgressHeading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                                <div class="beneficiary-progress-row__fill" id="unifiedBeneficiaryProgressFill"></div>
                            </div>
                        </div>
                    </section>
                </section>
                <!-- ── REPAYMENTS PAGE ─────────────────────────────────────────────────── -->
                <!-- Separate top-level page — repayment schedule + history ONLY.           -->
                <!-- Shown when hash is #repayments (beneficiary) or locked page otherwise. -->
                <section id="repayments-page" class="dash-page unified-repayments-page is-route-hidden">
                    <section id="repayments-panel" class="dash-section unified-repayments-panel" aria-labelledby="unifiedRepaymentsHeading">
                        <div class="beneficiary-repayment-stack">
                            <section class="panel dash-section panel--info application-workspace-panel repayment-block repayment-actions">
                                <div class="panel-header panel-header--compact">
                                    <h3 id="unifiedRepaymentsHeading">Repayment schedule</h3>
                                    <p class="panel-subtitle">Choose a repayment month, upload the official receipt, then wait for PDO/Admin verification.</p>
                                </div>
                                <div class="repayment-actions__grid repayment-actions__grid--single">
                                    <div class="repayment-action-card repayment-action-card--form">
                                        <div class="repayment-flow-steps" aria-label="Repayment upload steps">
                                            <span class="repayment-flow-step is-active">1. Pick repayment month</span>
                                            <span class="repayment-flow-step">2. Upload receipt</span>
                                            <span class="repayment-flow-step">3. Wait for verification</span>
                                        </div>
                                        <div class="repayment-due-list" id="unifiedRepaymentDueList" aria-live="polite"></div>
                                    </div>
                                </div>
                            </section>
                            <section class="panel dash-section panel--review repayment-block history repayment-history-block">
                                <div class="history-header">
                                    <div class="panel-header panel-header--compact">
                                        <h3>Repayment history</h3>
                                    </div>
                                    <p class="history-summary-line" id="unifiedHistoryCounter">0 receipts</p>
                                </div>
                                <div class="history-filters">
                                    <label>
                                        <span>Status</span>
                                        <select id="unifiedHistoryFilterStatus">
                                            <option value="">All</option>
                                            <option value="verified">Verified</option>
                                            <option value="uploaded">Uploaded</option>
                                            <option value="pending">Pending</option>
                                            <option value="needs_correction">Needs correction</option>
                                            <option value="rejected">Rejected</option>
                                        </select>
                                    </label>
                                    <label>
                                        <span>Month</span>
                                        <input type="month" id="unifiedHistoryFilterMonth">
                                    </label>
                                </div>
                                <div class="history-metrics" role="list">
                                    <article class="history-metric history-metric--verified" role="listitem">
                                        <span class="history-metric__label">Verified receipts</span>
                                        <strong class="history-metric__value" id="unifiedHistoryVerifiedCount">0 receipts</strong>
                                    </article>
                                    <article class="history-metric history-metric--pending" role="listitem">
                                        <span class="history-metric__label">Pending verification</span>
                                        <strong class="history-metric__value" id="unifiedHistoryPendingCount">0 receipts</strong>
                                    </article>
                                    <article class="history-metric history-metric--uploaded" role="listitem">
                                        <span class="history-metric__label">Uploaded online</span>
                                        <strong class="history-metric__value" id="unifiedHistoryUploadedCount">0 receipts</strong>
                                    </article>
                                </div>
                                <div class="table-responsive">
                                    <table class="table history-table">
                                        <thead>
                                            <tr>
                                                <th>Month</th>
                                                <th>Paid on</th>
                                                <th>Amount</th>
                                                <th>Status</th>
                                                <th>OR / Proof</th>
                                                <th>Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody id="unifiedHistoryTableBody">
                                            <tr class="empty"><td colspan="6">No receipts submitted yet.</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div class="repayment-history-cards" id="unifiedHistoryCardList">
                                    <article class="history-card history-card--empty">No receipts submitted yet.</article>
                                </div>
                            </section>
                        </div>
                    </section>
                </section>
                <section id="beneficiary-locked-page" class="dash-page unified-beneficiary-locked is-route-hidden" data-beneficiary-locked-page>
                    <section class="panel dash-section panel--summary unified-beneficiary-locked__card">
                        <div class="unified-beneficiary-locked__hero">
                            <span class="unified-beneficiary-locked__icon" aria-hidden="true">B</span>
                            <span class="unified-beneficiary-locked__status">Beneficiary tools locked</span>
                        </div>
                        <div class="unified-beneficiary-locked__content">
                            <span class="support-card__eyebrow">Beneficiary Access</span>
                            <h2>You're not a beneficiary yet</h2>
                            <p>Repayments and beneficiary records will open once your PDO/Admin confirms your SMART LEAP beneficiary approval. Until then, your applicant workspace remains the right place to track requirements, training, and updates.</p>
                            <div class="unified-beneficiary-locked__steps" aria-label="What you can do now">
                                <span>Monitor your current application step</span>
                                <span>Complete pending requirements or training</span>
                                <span>Contact support if something looks incorrect</span>
                            </div>
                            <div class="panel-actions">
                                <a class="btn-primary" href="#dashboard-home">Back to overview</a>
                                <a class="btn-outline" href="#support-page">Contact support</a>
                            </div>
                        </div>
                    </section>
                </section>
                <section id="dashboard-home" class="dash-page dash-page--home is-route-hidden">
                    <section class="panel dash-section panel--hero applicant-current-step" aria-labelledby="nextStepHeading">
                        <!-- Current-step card points the applicant to the single most important next action. -->
                        <div class="applicant-current-step__main">
                            <div class="applicant-current-step__eyebrow">
                                <div class="panel-header panel-header--compact">
                                    <h3 id="nextStepHeading">Current step</h3>
                                    <p class="panel-subtitle">Focus on one clear next action at a time.</p>
                                </div>
                                <span class="journey-pill" id="nextStepStatus">Loading current status</span>
                            </div>
                            <div class="applicant-current-step__content">
                                <div class="applicant-current-step__copy-block">
                                    <strong class="applicant-current-step__title" id="nextStepTitle">Loading your next step</strong>
                                    <p class="applicant-current-step__copy" id="nextStepDescription">Please wait while the workspace checks your current workflow stage.</p>
                                </div>
                                <div class="applicant-current-step__actions">
                                    <!-- JS rewrites this label and destination based on the applicant's current workflow step. -->
                                    <button type="button" class="btn-primary" id="nextStepAction" disabled>Loading</button>
                                </div>
                            </div>
                            <p class="applicant-current-step__support-note">Your dashboard updates automatically as your profile, uploads, training, and certificate readiness move forward.</p>
                        </div>
                        <div class="current-step-meta" id="dashboardSnapshotLive" hidden>
                            <span class="overview-label">Workflow status</span>
                            <strong class="overview-value" id="dashboardSnapshotStatus">Loading</strong>
                            <p class="overview-meta" id="dashboardSnapshotDate">Checking your latest workflow record.</p>
                        </div>
                    </section>
                    <section id="overview" class="panel dash-section dash-section--summary panel--summary applicant-journey-panel" aria-labelledby="overviewHeading">
                        <div class="panel-header">
                            <h3 id="overviewHeading">Progress overview</h3>
                            <p class="panel-subtitle">See your profile, application, training, and certificate progress in one row.</p>
                        </div>
                        <div class="applicant-journey-strip" role="list" aria-label="Milestones sa proseso sa aplikante">
                            <article class="journey-step" id="journeyStepProfile" role="listitem">
                                <span class="journey-step__index">1</span>
                                <div class="journey-step__body">
                                    <span class="journey-step__label">Profile</span>
                                    <strong class="journey-step__value" id="dashboardProfileCompletion">0%</strong>
                                    <p class="journey-step__meta" id="dashboardProfileCompletionNote">Make sure your profile stays updated.</p>
                                </div>
                            </article>
                            <article class="journey-step" id="journeyStepAplikasyon" role="listitem">
                                <span class="journey-step__index">2</span>
                                <div class="journey-step__body">
                                    <span class="journey-step__label">Application review</span>
                                    <strong class="journey-step__value" id="dashboardRequirementsSummary">0/3 uploaded</strong>
                                    <p class="journey-step__meta" id="dashboardRequirementsSummaryNote">Upload and verification progress.</p>
                                </div>
                            </article>
                            <article class="journey-step" id="journeyStepTraining" role="listitem">
                                <span class="journey-step__index">3</span>
                                <div class="journey-step__body">
                                    <span class="journey-step__label">Training</span>
                                    <strong class="journey-step__value" id="dashboardTrainingCompletion">0% complete</strong>
                                    <p class="journey-step__meta" id="dashboardTrainingCompletionNote">Sessions and attendance appear in Training.</p>
                                </div>
                            </article>
                        </div>
                    </section>
                    <section class="dashboard-attention-grid">
                        <section class="panel dash-section panel--review applicant-alerts-panel" aria-labelledby="importantUpdatesHeading">
                            <div class="panel-header">
                                <h3 id="importantUpdatesHeading">Important updates</h3>
                                <p class="panel-subtitle">Only the updates that need your attention or explain the next movement in your application.</p>
                            </div>
                            <ul class="attention-list" id="applicantAlertList">
                                <li class="attention-list__empty">Important updates will appear here while your application moves through review.</li>
                            </ul>
                        </section>
                    </section>
                </section>
                <section id="profile-page" class="dash-page is-route-hidden">
                    <section class="dash-section profile-editor-workspace" aria-labelledby="profileWorkspaceHeading">
                        <!-- This status bar mirrors the applicant's latest application workflow state and remarks. -->
                        <div class="status-bar" aria-live="polite">
                            <div>
                                <span class="status-label">Application status</span>
                                <strong id="statusValue">Draft</strong>
                                <span class="status-dot" aria-hidden="true"></span>
                                <span class="status-updated">Last updated: <span id="statusUpdated">--</span></span>
                            </div>
                            <div class="status-remark" id="statusRemark" hidden></div>
                        </div>

                        <div class="profile-editor-layout">
                        <aside class="profile-photo profile-editor-photo">
                            <div class="profile-photo__frame">
                                <img id="profilePhotoPreview" src="" alt="Profile photo preview" class="is-hidden">
                                <div class="profile-photo__placeholder" id="profilePhotoPlaceholder">No photo</div>
                            </div>
                            <label class="btn-outline profile-photo__upload">
                                Upload photo
                                <input type="file" id="profilePhotoInput" accept=".jpg,.jpeg,.png" hidden>
                            </label>
                            <p class="profile-photo__note">JPG or PNG, up to 5MB.</p>
                        </aside>

                        <!-- This form is the main Stage 2 applicant profile editor that feeds completion progress. -->
                        <form id="profileCompletionForm" class="profile-form" novalidate>
                            <section class="panel profile-editor-panel profile-editor-panel--personal">
                                <div class="panel-header">
                                    <button type="button" class="btn-outline small applicant-profile-back" data-open-dashboard-home>Back</button>
                                    <h2 id="profileWorkspaceHeading">Personal Information</h2>
                                </div>
                                <div class="form-grid">
                                    <label class="form-field">
                                        <span>Birthdate <em>*</em></span>
                                        <input type="date" id="profileBirthdate" name="birthdate" required>
                                        <small data-error-for="profileBirthdate"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Age <em>Auto-filled</em></span>
                                        <input type="number" id="profileEdad" name="age" readonly>
                                        <small class="field-helper">Automatically computed from the birthdate.</small>
                                        <small data-error-for="profileEdad"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Gender <em>*</em></span>
                                        <select id="profileGender" name="gender" required>
                                            <option value="">Select gender</option>
                                            <option value="Female">Female</option>
                                            <option value="Male">Male</option>
                                            <option value="Non-binary">Non-binary</option>
                                            <option value="Prefer not to say">Prefer not to say</option>
                                        </select>
                                        <small data-error-for="profileGender"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Contact number <em>*</em></span>
                                        <input type="tel" id="profileKontakNumber" name="contactNumber" placeholder="09xxxxxxxxx" required>
                                        <small data-error-for="profileKontakNumber"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Complete address <em>*</em></span>
                                        <input type="text" id="profileAddress" name="address" placeholder="House no., street, city" required>
                                        <small data-error-for="profileAddress"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Barangay <em>*</em></span>
                                        <select id="profileBarangay" name="barangay" required>
                                            <option value="">Select barangay</option>
                                        </select>
                                        <small data-error-for="profileBarangay"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>4Ps membership <em>*</em></span>
                                        <select id="profile4ps" name="is4ps" required>
                                            <option value="">Select</option>
                                            <option value="Yes">Yes</option>
                                            <option value="No">No</option>
                                        </select>
                                        <small data-error-for="profile4ps"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Highest educational attainment <em>*</em></span>
                                        <select id="profileEducationalAttainment" name="educationalAttainment" required>
                                            <option value="">Select attainment</option>
                                            <option value="Kindergarten">Kindergarten</option>
                                            <option value="Elementary">Elementary</option>
                                            <option value="JHS">JHS</option>
                                            <option value="SHS Grad">SHS grad</option>
                                            <option value="Tertiary">Tertiary</option>
                                        </select>
                                        <small data-error-for="profileEducationalAttainment"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Sector <em>*</em></span>
                                        <select id="profileSector" name="sector" required>
                                            <option value="">Select sector</option>
                                            <option value="Indigenous People">Indigenous People</option>
                                            <option value="Senior Citizen">Senior Citizen</option>
                                            <option value="Solo Parent">Solo Parent</option>
                                            <option value="PWD">PWD</option>
                                            <option value="None">None</option>
                                            <option value="Other">Other (please specify)</option>
                                        </select>
                                        <small data-error-for="profileSector"></small>
                                    </label>
                                    <label class="form-field" id="profileSectorOtherWrap" hidden>
                                        <span>Other sector <em>*</em></span>
                                        <input type="text" id="profileSectorOtherSpecify" name="sectorOtherSpecify" placeholder="Please specify" disabled>
                                        <small data-error-for="profileSectorOtherSpecify"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Specific business type / Klase sa negosyo <em>*</em></span>
                                        <input type="text" id="profileLivelihood" name="livelihood" placeholder="e.g., Sari-sari store" required>
                                        <small data-error-for="profileLivelihood"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Microbusiness name <em>*</em></span>
                                        <input type="text" id="profileBusinessName" name="businessName" placeholder="e.g., Maria's Sari-sari Store" required>
                                        <small data-error-for="profileBusinessName"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Batch No</span>
                                        <input type="text" id="profileBatchNo" name="batchNo" value="Batch 1" readonly>
                                        <small class="field-helper">Assigned by CSWDD for the current SMART LEAP intake.</small>
                                    </label>
                                </div>
                                <div class="notice" id="profileFormNotice" hidden></div>
                                <div class="panel-actions panel-actions--profile">
                                    <button type="button" class="btn-primary" id="saveProfileChangesButton">Save Changes</button>
                                </div>
                            </section>
                        </form>
                        </div>
                    </section>
                </section>
                <section id="application-page" class="dash-page is-route-hidden">
                    <section class="panel dash-section panel--summary application-status-hero" aria-labelledby="applicationSummaryHeading">
                        <div class="application-status-hero__main">
                            <div class="panel-header panel-header--compact">
                                <h3 id="applicationSummaryHeading">Application status</h3>
                                <p class="panel-subtitle">This shows your current review stage and the next required step.</p>
                            </div>
                            <div class="application-status-hero__content">
                                <span class="journey-pill" id="applicationStatusPill">Draft</span>
                                <strong class="application-status-hero__title" id="applicationStatusValue">Draft</strong>
                                <p class="application-status-hero__copy" id="applicationStatusNextStep">Start by uploading your required files, then submit them for PDO/Admin verification.</p>
                            </div>
                        </div>
                        <div class="application-status-hero__meta">
                            <article class="current-step-meta">
                                <span class="overview-label">Last reviewed</span>
                                <strong class="overview-value" id="applicationStatusReviewedDate">Not reviewed yet</strong>
                                <p class="overview-meta" id="applicationStatusDates">Not submitted yet.</p>
                            </article>
                            <article class="current-step-meta">
                                <span class="overview-label">Assigned officer</span>
                                <strong class="overview-value" id="assignedPdoName">Not assigned</strong>
                                <p class="overview-meta" id="assignedPdoEmail">Assigned PDO details will appear here.</p>
                            </article>
                        </div>
                    </section>
                    <section class="panel dash-section panel--summary application-upload-panel" aria-labelledby="applicationUploadsHeading">
                        <div class="panel-header">
                            <h3 id="applicationUploadsHeading">Upload requirements</h3>
                            <p class="panel-subtitle">Upload the files required for your application here. PDF, PNG, or JPG only. Up to 5 MB per file.</p>
                            <p class="panel-meta">
                                <span>Required: <span class="docs-total-count">4</span> documents (Valid ID, Health Certificate, Community Tax Certificate, Barangay Clearance)</span>
                                <span class="meta-sep">&bull;</span>
                                <span class="meta-badge">Uploaded: <span id="docsUploadedCount">0</span>/<span class="docs-total-count">4</span></span>
                            </p>
                        </div>
                        <div class="doc-grid" id="docGrid"></div>
                        <div class="action-bar application-action-bar">
                            <button type="button" class="btn-primary" id="submitProfileButton">Submit for verification</button>
                        </div>
                    </section>
                </section>
                <section id="training-page" class="dash-page is-route-hidden">
                    <section class="panel dash-section training-subsection training-subsection--schedule panel--info" aria-labelledby="trainingScheduleHeading">
                        <div class="panel-header"><h3 id="trainingScheduleHeading">Schedule list</h3><p class="panel-subtitle">Dates, venues, and preparation notes for each assigned session.</p></div>
                        <div class="training-schedule-grid" id="trainingScheduleGrid"><article class="training-schedule-empty">No training schedule yet. Wait for notice updates from CSWDD.</article></div>
                    </section>
                    <section id="application-form-files" class="panel dash-section training-subsection application-form-files-panel" aria-labelledby="applicationFormFilesHeading">
                        <div class="panel-header application-form-files-panel__header">
                            <h3 id="applicationFormFilesHeading">Training application forms</h3>
                            <p class="panel-subtitle">Opened forms are grouped by the training session where Admin made them available.</p>
                        </div>
                        <div class="doc-grid applicant-form-card-grid applicant-form-card-grid--training" id="applicationFormCards"></div>
                    </section>
                    <section class="panel dash-section panel--records training-attendance-panel" aria-labelledby="trainingAttendanceHeading">
                        <div class="panel-header panel-header--spaced"><h3 id="trainingAttendanceHeading">Attendance</h3><p class="panel-subtitle">Attendance is easier to read on mobile and shows the latest status first.</p></div>
                        <div class="attendance-card-list" id="attendanceCardList"><article class="attendance-card attendance-card--empty">Attendance updates will appear once sessions are assigned.</article></div>
                        <div class="table-wrapper table-wrapper--soft training-attendance-table-wrap">
                            <table class="attendance-table">
                                <thead><tr><th scope="col">Session</th><th scope="col">Date &amp; Time</th><th scope="col">Status</th><th scope="col">Remarks</th><th scope="col">Notice</th></tr></thead>
                                <tbody id="attendanceTableBody"><tr class="empty"><td colspan="5">Attendance updates will appear once sessions are assigned.</td></tr></tbody>
                            </table>
                        </div>
                    </section>
                </section>
                <section id="support-page" class="dash-page helpdesk-page is-route-hidden" data-helpdesk-root>
                    <header class="helpdesk-header panel">
                        <div>
                            <span class="support-card__eyebrow">SMART LEAP Help Desk</span>
                            <h2>Support Center</h2>
                            <p>Submit a concern, check staff replies, and get help for applicant, beneficiary, training, or repayment concerns in one place.</p>
                        </div>
                        <a class="btn-outline" href="#helpdeskNewConcern">New concern</a>
                    </header>
                    <section class="helpdesk-summary" aria-label="Support concern summary">
                        <article class="helpdesk-stat">
                            <span>Open concerns</span>
                            <strong data-helpdesk-summary="open">0</strong>
                            <small>Active concerns still being worked on.</small>
                        </article>
                        <article class="helpdesk-stat">
                            <span>Waiting for staff</span>
                            <strong data-helpdesk-summary="waitingForStaff">0</strong>
                            <small>Concerns queued for SMART LEAP support review.</small>
                        </article>
                        <article class="helpdesk-stat">
                            <span>Resolved</span>
                            <strong data-helpdesk-summary="resolved">0</strong>
                            <small>Concerns already completed or addressed.</small>
                        </article>
                        <article class="helpdesk-stat">
                            <span>Unread updates</span>
                            <strong data-helpdesk-summary="unread">0</strong>
                            <small>Replies or updates you still need to read.</small>
                        </article>
                    </section>
                    <div class="helpdesk-layout">
                        <div class="helpdesk-main">
                            <section class="panel helpdesk-card helpdesk-card--composer" id="helpdeskNewConcern" aria-labelledby="helpdeskFormHeading">
                                <div class="panel-header">
                                    <div>
                                        <span class="support-card__eyebrow">New concern</span>
                                        <h3 id="helpdeskFormHeading">Submit a Concern</h3>
                                    </div>
                                    <p class="panel-subtitle">Describe the issue clearly so SMART LEAP support can route it faster and reply with the right next step.</p>
                                </div>
                                <form class="helpdesk-form" data-helpdesk-form novalidate>
                                    <label class="form-field">
                                        <span>Concern category *</span>
                                        <select name="category" required>
                                            <option value="">Choose category</option>
                                            <option>Account/Login</option>
                                            <option>Application</option>
                                            <option>Upload/Requirement</option>
                                            <option>Training</option>
                                            <option>Repayment</option>
                                            <option>Receipt/OR Concern</option>
                                            <option>Business/Livelihood</option>
                                            <option>Correction Clarification</option>
                                            <option>Other</option>
                                        </select>
                                        <small data-helpdesk-error="category"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Subject *</span>
                                        <input type="text" name="subject" maxlength="180" placeholder="Briefly describe your concern" required>
                                        <small data-helpdesk-error="subject"></small>
                                    </label>
                                    <label class="form-field full">
                                        <span>Message *</span>
                                        <textarea name="message" rows="5" maxlength="5000" placeholder="Explain your concern clearly. Include the month, OR number, document name, or screenshot details if applicable." required></textarea>
                                        <small data-helpdesk-error="message"></small>
                                    </label>
                                    <label class="form-field">
                                        <span>Related record</span>
                                        <select name="related_record_id">
                                            <option value="">No related record selected</option>
                                        </select>
                                    </label>
                                    <label class="form-field">
                                        <span>Attachment</span>
                                        <input type="file" name="attachment" accept=".jpg,.jpeg,.png,.webp,.pdf">
                                        <small class="field-helper">Screenshots, receipts, proof, or supporting documents. Max 5MB.</small>
                                    </label>
                                    <p class="helpdesk-form__status full" data-helpdesk-form-status role="status" aria-live="polite"></p>
                                    <div class="form-actions full">
                                        <button type="submit" class="btn-primary">Submit concern</button>
                                    </div>
                                </form>
                            </section>
                            <section class="panel helpdesk-card helpdesk-card--tickets" aria-labelledby="helpdeskTicketsHeading">
                                <div class="panel-header panel-header--compact">
                                    <div>
                                        <span class="support-card__eyebrow">Concern tracker</span>
                                        <h3 id="helpdeskTicketsHeading">My Concerns</h3>
                                    </div>
                                    <p class="panel-subtitle">Open any concern to review the full conversation and latest staff response.</p>
                                </div>
                                <div class="helpdesk-ticket-list" data-helpdesk-ticket-list>
                                    <p class="helpdesk-empty">No concerns submitted yet. Use the form to submit a concern when you need help from Social Worker support.</p>
                                </div>
                            </section>
                        </div>
                        <aside class="helpdesk-side">
                            <section class="panel helpdesk-card helpdesk-card--conversation" aria-labelledby="helpdeskConversationHeading">
                                <div class="panel-header panel-header--compact">
                                    <div>
                                        <span class="support-card__eyebrow">Conversation</span>
                                        <h3 id="helpdeskConversationHeading">Selected Concern</h3>
                                    </div>
                                    <p class="panel-subtitle">Read updates, send replies, and continue the same concern thread here.</p>
                                </div>
                                <div class="helpdesk-conversation" data-helpdesk-conversation>
                                    <div class="helpdesk-empty-state">
                                        <strong>No concern selected yet</strong>
                                        <p>Choose a concern from your list to open the full conversation with SMART LEAP support.</p>
                                    </div>
                                </div>
                            </section>
                            <section class="panel helpdesk-card helpdesk-card--guide" aria-labelledby="helpdeskGuideHeading">
                                <div class="panel-header panel-header--compact">
                                    <div>
                                        <span class="support-card__eyebrow">Support tips</span>
                                        <h3 id="helpdeskGuideHeading">Before You Submit</h3>
                                    </div>
                                </div>
                                <div class="helpdesk-guide-list">
                                    <article class="helpdesk-guide-item">
                                        <strong>Use the closest category</strong>
                                        <p>Select the category that best matches your issue so staff can route it without delay.</p>
                                    </article>
                                    <article class="helpdesk-guide-item">
                                        <strong>Add exact details</strong>
                                        <p>Include document names, training titles, repayment months, OR numbers, or screenshots when relevant.</p>
                                    </article>
                                    <article class="helpdesk-guide-item">
                                        <strong>Keep one issue per concern</strong>
                                        <p>A single clear concern is easier to track, respond to, and resolve than multiple unrelated issues in one ticket.</p>
                                    </article>
                                </div>
                            </section>
                        </aside>
                    </div>
                </section>
            </main>
            <nav class="applicant-mobile-tabbar" aria-label="Applicant mobile navigation">
                <a class="applicant-tabbar__link is-active" href="#dashboard-home">
                    <span class="applicant-tabbar__icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M3 11.5L12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10.5V20h13V10.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                    <span class="applicant-tabbar__label" data-i18n-key="overview">Overview</span>
                </a>
                <a class="applicant-tabbar__link" href="#application-page" data-applicant-nav>
                    <span class="applicant-tabbar__icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M8 7h8" stroke-linecap="round"/><path d="M8 12h8" stroke-linecap="round"/><path d="M8 17h5" stroke-linecap="round"/><rect x="5" y="3" width="14" height="18" rx="2" stroke-linejoin="round"/></svg></span>
                    <span class="applicant-tabbar__label" data-i18n-key="application">Application</span>
                </a>
                <a class="applicant-tabbar__link" href="#training-page" data-applicant-nav>
                    <span class="applicant-tabbar__icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M3 9l9-4 9 4-9 4-9-4z" stroke-linejoin="round"/><path d="M7 11v5c0 1.66 2.91 3 5 3s5-1.34 5-3v-5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                    <span class="applicant-tabbar__label" data-i18n-key="training">Training</span>
                </a>
                <a class="applicant-tabbar__link" href="#repayments" data-beneficiary-nav>
                    <span class="applicant-tabbar__icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><rect x="6" y="4" width="12" height="16" rx="2" stroke-linejoin="round"/><path d="M9 9h6" stroke-linecap="round"/><path d="M9 12h6" stroke-linecap="round"/><path d="M9 15h3" stroke-linecap="round"/></svg></span>
                    <span class="applicant-tabbar__label" data-i18n-key="repayments">Repayments</span>
                </a>
                <a class="applicant-tabbar__link" href="#support-page">
                    <span class="applicant-tabbar__icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M7 7h10a3 3 0 013 3v4a3 3 0 01-3 3h-3l-3 4-3-4H7a3 3 0 01-3-3v-4a3 3 0 013-3z" stroke-linejoin="round"/></svg></span>
                    <span class="applicant-tabbar__label" data-i18n-key="support">Support</span>
                </a>
            </nav>
            <div class="modal" id="previewModal" hidden>
                <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="previewTitle">
                    <div class="modal-header">
                        <div>
                            <h3 id="previewTitle">Document preview</h3>
                            <div class="modal-status">
                                <span class="doc-status">Not uploaded yet</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-body" id="previewBody"></div>
                    <div class="modal-footer">
                        <button type="button" class="btn-outline" id="replacePreview">Replace</button>
                        <button type="button" class="btn-primary" id="closePreviewFooter">Close</button>
                    </div>
                </div>
            </div>
            <div class="beneficiary-repayment-modal" id="unifiedRepaymentUploadModal" hidden>
                <button type="button" class="beneficiary-repayment-modal__backdrop" data-unified-repayment-modal-close aria-label="Close repayment upload"></button>
                <section class="beneficiary-repayment-modal__panel" role="dialog" aria-modal="true" aria-labelledby="unifiedRepaymentUploadModalTitle">
                    <header class="beneficiary-repayment-modal__header">
                        <div>
                            <span class="support-card__eyebrow">Submit Official Receipt</span>
                            <h3 id="unifiedRepaymentUploadModalTitle">Repayment receipt</h3>
                            <p id="unifiedRepaymentUploadModalCopy">Upload the OR for the selected repayment month.</p>
                        </div>
                        <button type="button" class="beneficiary-repayment-modal__close" data-unified-repayment-modal-close aria-label="Close">&times;</button>
                    </header>
                    <form id="unifiedRepaymentUploadForm" class="form-grid repayment-upload-form beneficiary-repayment-modal__form">
                        <label class="form-field">
                            <span>OR month *</span>
                            <input type="month" id="unifiedUploadMonth" name="month" required readonly>
                        </label>
                        <label class="form-field">
                            <span>Amount paid *</span>
                            <input type="number" id="unifiedUploadAmount" name="amount" min="0" step="0.01" placeholder="&#8369;625.00" required>
                        </label>
                        <label class="form-field">
                            <span>Payment date *</span>
                            <input type="date" id="unifiedUploadDate" name="paymentDate" required>
                        </label>
                        <label class="form-field">
                            <span>OR number *</span>
                            <input type="text" id="unifiedUploadOr" name="or" placeholder="BC 2670412" required>
                            <small class="field-helper">Use the official receipt number printed beside "NO." on the receipt.</small>
                        </label>
                        <label class="form-field full repayment-upload-form__file">
                            <span>Upload OR file *</span>
                            <input type="file" id="unifiedUploadFile" name="file" accept=".jpg,.jpeg,.png,.pdf" required>
                            <small class="field-helper">Accepted file types: JPG, PNG, or PDF.</small>
                        </label>
                        <label class="form-field full repayment-upload-form__notes">
                            <span>Notes for verifier</span>
                            <textarea id="unifiedUploadNotes" name="notes" rows="3" placeholder="Optional message"></textarea>
                        </label>
                        <div class="form-actions full beneficiary-repayment-modal__actions">
                            <button type="button" class="btn-outline" data-unified-repayment-modal-close>Cancel</button>
                            <button type="submit" class="btn-primary repayment-upload-form__submit">Submit receipt</button>
                        </div>
                    </form>
                </section>
            </div>
            <footer class="dash-footer"></footer>
        </div>
    </div>
    <div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="true"></div>
    <script src="<?= $baseUrl ?>/assets/js/shared/notifications.js?v=<?= urlencode((string) $notificationsJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/language-toggle.js?v=<?= urlencode((string) $languageToggleJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/applicant.js?v=<?= urlencode((string) $applicantJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/applicant-beneficiary.js?v=<?= urlencode((string) $applicantBeneficiaryJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/applicant-profile.js?v=<?= urlencode((string) $applicantProfileJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/support-helpdesk.js?v=<?= urlencode((string) $supportHelpdeskJsVersion) ?>" defer></script>
</body>
</html>
