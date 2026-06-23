<?php /** @var string $baseUrl */ ?>
<?php /** @var array|null $authUser */ ?>
<?php
$applicantCssVersion = @filemtime(base_path('public/assets/css/dashboards/applicant.css')) ?: time();
$postApprovalCssVersion = @filemtime(base_path('public/assets/css/dashboards/post-approval.css')) ?: time();
$notificationsCssVersion = @filemtime(base_path('public/assets/css/components/notifications.css')) ?: time();
$applicantJsVersion = @filemtime(base_path('public/assets/js/dashboards/applicant.js')) ?: time();
$applicantProfileJsVersion = @filemtime(base_path('public/assets/js/dashboards/applicant-profile.js')) ?: time();
$languageToggleJsVersion = @filemtime(base_path('public/assets/js/dashboards/language-toggle.js')) ?: time();
$supportHelpdeskJsVersion = @filemtime(base_path('public/assets/js/dashboards/support-helpdesk.js')) ?: time();
$notificationsJsVersion = @filemtime(base_path('public/assets/js/shared/notifications.js')) ?: time();
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
    <title>SMART LEAP | Applicant Portal</title>

    <!-- Applicant and post-approval styles used across profile, application, training, and support pages. -->
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/applicant.css?v=<?= urlencode((string) $applicantCssVersion) ?>">
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
                <a class="sidebar-link" href="#application-page"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M8 7h8" stroke-linecap="round"/><path d="M8 12h8" stroke-linecap="round"/><path d="M8 17h5" stroke-linecap="round"/><rect x="5" y="3" width="14" height="18" rx="2" stroke-linejoin="round"/></svg></span><span data-i18n-key="application">Application</span></a>
                <!-- Training page for schedules, notices, attendance, and certificate readiness. -->
                <a class="sidebar-link" href="#training-page"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M3 9l9-4 9 4-9 4-9-4z" stroke-linejoin="round"/><path d="M7 11v5c0 1.66 2.91 3 5 3s5-1.34 5-3v-5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span data-i18n-key="training">Training</span></a>
                <!-- Support page for help-desk contact and conversation history. -->
                <a class="sidebar-link" href="#support-page"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M7 7h10a3 3 0 013 3v4a3 3 0 01-3 3h-3l-3 4-3-4H7a3 3 0 01-3-3v-4a3 3 0 013-3z" stroke-linejoin="round"/></svg></span><span data-i18n-key="support">Support</span></a>
            </nav>
        </aside>
        <button type="button" class="sidebar-overlay" id="sidebarOverlay" aria-hidden="true" tabindex="-1"></button>
        <div class="portal-loader" id="portalLoader" aria-live="polite">
            <div class="portal-loader__orb" aria-hidden="true"></div>
            <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="" class="portal-loader__logo">
            <strong class="portal-loader__title">SMART LEAP</strong>
            <p class="portal-loader__copy" id="portalLoaderCopy">Loading your applicant portal...</p>
        </div>
        <div class="dash-content">
            <header class="mobile-topbar applicant-contextbar" aria-label="Applicant portal navigation">
                <!-- Compact top bar shown on smaller screens for title, notifications, language, and account access. -->
                <div class="applicant-contextbar__brand">
                    <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="SMART LEAP logo" class="applicant-contextbar__logo">
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
                <section id="dashboard-home" class="dash-page dash-page--home">
                    <section class="panel dash-section panel--hero applicant-current-step" aria-labelledby="nextStepHeading">
                        <!-- Current-step card points the applicant to the single most important next action. -->
                        <div class="applicant-current-step__main">
                            <div class="panel-header panel-header--compact">
                                <h3 id="nextStepHeading">Current step</h3>
                                <p class="panel-subtitle">This is the most important action to complete right now.</p>
                            </div>
                            <span class="journey-pill" id="nextStepStatus">Loading current status</span>
                            <strong class="applicant-current-step__title" id="nextStepTitle">Loading your next step</strong>
                            <p class="applicant-current-step__copy" id="nextStepDescription">Please wait while the workspace checks your current workflow stage.</p>
                            <div class="applicant-current-step__actions">
                                <!-- JS rewrites this label and destination based on the applicant's current workflow step. -->
                                <button type="button" class="btn-primary" id="nextStepAction" disabled>Loading</button>
                            </div>
                        </div>
                        <aside class="applicant-current-step__aside" aria-label="Current step context">
                            <div class="current-step-meta">
                                <span class="overview-label">Current workflow status</span>
                                <strong class="overview-value" id="dashboardSnapshotStatus">Loading</strong>
                                <p class="overview-meta" id="dashboardSnapshotDate">Checking your latest workflow record.</p>
                            </div>
                            <div class="current-step-meta">
                                <span class="overview-label">What happens next</span>
                                <strong class="overview-value" id="dashboardSnapshotPdo">Loading</strong>
                                <p class="overview-meta" id="dashboardSnapshotRemark">Preparing your current-step guidance.</p>
                            </div>
                        </aside>
                    </section>
                    <section id="overview" class="panel dash-section dash-section--summary panel--summary applicant-journey-panel" aria-labelledby="overviewHeading">
                        <div class="panel-header">
                            <h3 id="overviewHeading">Progress overview</h3>
                            <p class="panel-subtitle">Three milestones from profile completion to training progress.</p>
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
                                <p class="panel-subtitle">Only items that need attention or explain the next movement in your application.</p>
                            </div>
                            <ul class="attention-list" id="applicantAlertList">
                                <li class="attention-list__empty">Important updates will appear here while your application moves through review.</li>
                            </ul>
                        </section>
                    </section>
                </section>
                <section id="profile-page" class="dash-page">
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
                <section id="application-page" class="dash-page">
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
                <section id="training-page" class="dash-page">
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
                <section id="support-page" class="dash-page helpdesk-page" data-helpdesk-root>
                    <header class="helpdesk-header panel">
                        <div>
                            <span class="support-card__eyebrow">SMART LEAP Help Desk</span>
                            <h2>Support Center</h2>
                            <p>Submit a concern, track replies, and get help from Social Worker support.</p>
                        </div>
                        <a class="btn-outline" href="#helpdeskNewConcern">New concern</a>
                    </header>
                    <div class="helpdesk-layout">
                        <div class="helpdesk-main">
                            <section class="panel helpdesk-card" id="helpdeskNewConcern" aria-labelledby="helpdeskFormHeading">
                                <div class="panel-header">
                                    <h3 id="helpdeskFormHeading">Submit New Concern</h3>
                                    <p class="panel-subtitle">Tell us what you need help with. Your concern will be routed to Social Worker support.</p>
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
                            <section class="panel helpdesk-card" aria-labelledby="helpdeskTicketsHeading">
                                <div class="panel-header panel-header--compact">
                                    <div>
                                        <span class="support-card__eyebrow">My Concerns</span>
                                        <h3 id="helpdeskTicketsHeading">My Concerns</h3>
                                    </div>
                                </div>
                                <div class="helpdesk-ticket-list" data-helpdesk-ticket-list>
                                    <p class="helpdesk-empty">No concerns submitted yet. Use the form to submit a concern when you need help from Social Worker support.</p>
                                </div>
                            </section>
                        </div>
                    </div>
                </section>
            </main>
            <nav class="applicant-mobile-tabbar" aria-label="Applicant mobile navigation">
                <a class="applicant-tabbar__link is-active" href="#dashboard-home">
                    <span class="applicant-tabbar__icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M3 11.5L12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10.5V20h13V10.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                    <span class="applicant-tabbar__label" data-i18n-key="overview">Overview</span>
                </a>
                <a class="applicant-tabbar__link" href="#application-page">
                    <span class="applicant-tabbar__icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M8 7h8" stroke-linecap="round"/><path d="M8 12h8" stroke-linecap="round"/><path d="M8 17h5" stroke-linecap="round"/><rect x="5" y="3" width="14" height="18" rx="2" stroke-linejoin="round"/></svg></span>
                    <span class="applicant-tabbar__label" data-i18n-key="application">Application</span>
                </a>
                <a class="applicant-tabbar__link" href="#training-page">
                    <span class="applicant-tabbar__icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M3 9l9-4 9 4-9 4-9-4z" stroke-linejoin="round"/><path d="M7 11v5c0 1.66 2.91 3 5 3s5-1.34 5-3v-5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                    <span class="applicant-tabbar__label" data-i18n-key="training">Training</span>
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
            <footer class="dash-footer"></footer>
        </div>
    </div>
    <div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="true"></div>
    <script src="<?= $baseUrl ?>/assets/js/shared/notifications.js?v=<?= urlencode((string) $notificationsJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/language-toggle.js?v=<?= urlencode((string) $languageToggleJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/applicant.js?v=<?= urlencode((string) $applicantJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/applicant-profile.js?v=<?= urlencode((string) $applicantProfileJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/support-helpdesk.js?v=<?= urlencode((string) $supportHelpdeskJsVersion) ?>" defer></script>
</body>
</html>
