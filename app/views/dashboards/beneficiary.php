<?php /** @var string $baseUrl */ ?>
<?php
$beneficiaryCssVersion = @filemtime(base_path('public/assets/css/dashboards/beneficiary.css')) ?: time();
$applicantCssVersion = @filemtime(base_path('public/assets/css/dashboards/applicant.css')) ?: time();
$notificationsCssVersion = @filemtime(base_path('public/assets/css/components/notifications.css')) ?: time();
$beneficiaryJsVersion = @filemtime(base_path('public/assets/js/dashboards/beneficiary.js')) ?: time();
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
    <!-- Core document metadata for the beneficiary portal. -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Browser tab title for the beneficiary workspace. -->
    <title>SMART LEAP | Beneficiary Dashboard</title>

    <!-- Shared applicant shell styles plus beneficiary-specific repayment and account styling. -->
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/applicant.css?v=<?= urlencode((string) $applicantCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/beneficiary.css?v=<?= urlencode((string) $beneficiaryCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/components/notifications.css?v=<?= urlencode((string) $notificationsCssVersion) ?>">

        <!-- Bootstrap values consumed by beneficiary scripts for profile, repayments, and notifications. -->
        <script>
        window.SMARTLEAP_AUTH_USER = <?= json_encode($authUser ?? null, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_BASE_URL = <?= json_encode($baseUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_BARANGAYS = <?= json_encode($butuanBarangays, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    </script>
</head>
<body>
    <div class="dashboard-shell">
        <aside class="dash-sidebar" id="appSidebar" aria-label="Beneficiary portal navigation">
            <!-- Beneficiary portal branding and mobile drawer close button. -->
            <div class="sidebar-drawer__top">
                <div class="sidebar-brand">
                    <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="SMART LEAP seal" class="sidebar-logo">
                    <div class="sidebar-brand__copy">
                        <strong class="sidebar-title">SMART LEAP</strong>
                    </div>
                </div>
                <button type="button" class="sidebar-drawer__close" id="sidebarClose" aria-label="Close navigation">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <!-- Beneficiary navigation centers on repayments, support, and the running activity record. -->
            <nav class="sidebar-nav">
                <!-- Overview page showing repayment standing and primary next actions. -->
                <a class="sidebar-link is-active" href="#overview">
                    <span class="sidebar-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" role="presentation">
                            <path d="M3 11.5L12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M5.5 10.5V20h13V10.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span data-i18n-key="overview">Overview</span>
                </a>
                <!-- Repayments page for proof upload, verification history, and repayment tracking. -->
                <a class="sidebar-link" href="#repayments" data-role="beneficiary">
                    <span class="sidebar-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" role="presentation">
                            <rect x="6" y="4" width="12" height="16" rx="2" stroke-linejoin="round"/>
                            <path d="M9 9h6" stroke-linecap="round"/>
                            <path d="M9 12h6" stroke-linecap="round"/>
                            <path d="M9 15h3" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <span data-i18n-key="repayments">Repayments</span>
                </a>
                <!-- Support page for contacting staff and reviewing help responses. -->
                <a class="sidebar-link" href="#support-feedback">
                    <span class="sidebar-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" role="presentation">
                            <path d="M7 7h10a3 3 0 013 3v4a3 3 0 01-3 3h-3l-3 4-3-4H7a3 3 0 01-3-3v-4a3 3 0 013-3z" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span data-i18n-key="support">Support</span>
                </a>
            </nav>
        </aside>
        <button type="button" class="sidebar-overlay" id="sidebarOverlay" aria-hidden="true" tabindex="-1"></button>
        <div class="portal-loader" id="portalLoader" aria-live="polite">
            <div class="portal-loader__orb" aria-hidden="true"></div>
            <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="" class="portal-loader__logo">
            <strong class="portal-loader__title">SMART LEAP</strong>
            <p class="portal-loader__copy" id="portalLoaderCopy">Loading your beneficiary portal...</p>
        </div>
        <div class="dash-content">
            <header class="mobile-topbar beneficiary-contextbar" aria-label="Beneficiary portal navigation">
                <!-- Compact top bar shown on smaller screens for context, language, notifications, and account access. -->
                <div class="beneficiary-contextbar__brand">
                    <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="SMART LEAP logo" class="beneficiary-contextbar__logo">
                    <strong class="mobile-topbar__title" id="mobileTopbarTitle" data-i18n-key="overview">Overview</strong>
                </div>
                <div class="beneficiary-contextbar__actions">
                    <div class="beneficiary-contextbar__notifications" id="beneficiaryNotificationMount"></div>
                    <div class="portal-language-toggle" role="group" aria-label="Select language">
                        <button type="button" class="portal-language-toggle__button is-active" data-language-option="en">English</button>
                        <button type="button" class="portal-language-toggle__button" data-language-option="ceb">Tagalog</button>
                    </div>
                    <div class="mobile-topbar__account">
                        <!-- Mobile account trigger opens profile, password, and sign-out actions. -->
                        <button
                            type="button"
                            class="mobile-topbar__avatar"
                            id="mobileAccountToggle"
                            aria-label="Open account menu"
                            aria-haspopup="menu"
                            aria-expanded="false"
                        >
                            <span class="mobile-topbar__avatar-initial" id="mobileAccountAvatar" aria-hidden="true">B</span>
                        </button>
                        <div class="mobile-account-menu" id="mobileAccountMenu" role="menu" aria-hidden="true">
                            <button type="button" class="mobile-account-menu__item" id="mobileAccountProfile" role="menuitem" data-i18n-key="profile">Profile</button>
                            <button type="button" class="mobile-account-menu__item" id="mobileAccountPassword" role="menuitem" data-i18n-key="changePassword">Change Password</button>
                            <button type="button" class="mobile-account-menu__item" id="mobileAccountLogout" role="menuitem" data-i18n-key="signOut">Sign Out</button>
                        </div>
                    </div>
                </div>
            </header>
            <main class="dash-main">
                <section id="overview" class="dash-page dash-page--home dash-section">
                    <section class="dash-section beneficiary-command-band" aria-labelledby="beneficiaryCurrentStandingHeading">
                        <!-- Hidden compatibility fields keep older beneficiary widgets and JS selectors working. -->
                        <h3 class="sr-only" id="beneficiaryCurrentStandingHeading">Summary sa repayment</h3>
                        <div class="sr-only">
                            <div class="banner-avatar" id="bannerAvatar" aria-hidden="true">M</div>
                            <span class="banner-greeting" id="bannerGreeting">Benepisyaryo</span>
                            <p class="banner-email" id="userEmail">you@gmail.com</p>
                            <span id="overviewName"></span>
                            <span id="overviewBusiness"></span>
                            <span id="overviewEmail"></span>
                            <span id="heroBeneficiaryStatus">Aktibong benepisyaryo</span>
                            <span id="overviewActionStatus">Aktibong benepisyaryo</span>
                            <span id="heroBeneficiaryTitle">Sakto sa dagan ang account</span>
                            <span id="heroBeneficiaryCopy">Wala pay update.</span>
                            <span id="overviewOutstanding">&#8369;0.00</span>
                            <span data-compat="overviewProgress">0/24 months</span>
                            <span id="overviewPendingVerification">0 resibo</span>
                            <span data-compat="overviewDue">Next due --</span>
                            <span data-compat="overviewRate">0% kompleto</span>
                            <span id="bannerLabelNextDue">Pending verification</span>
                            <span id="bannerNextDue">0 resibo</span>
                        </div>
                        <!-- Balance card highlights the beneficiary's current repayment exposure and quick actions. -->
                        <div class="panel beneficiary-balance-card" aria-label="Benepisyaryo repayment summary">
                            <div class="beneficiary-balance-card__body">
                                <span class="label" id="bannerLabelOutstanding">Current balance</span>
                                <strong id="bannerOutstanding">&#8369;0.00</strong>
                            </div>
                            <div class="beneficiary-balance-card__actions" id="overviewBalanceActions"></div>
                        </div>
                    </section>
                    <section class="panel dash-section panel--summary beneficiary-repayment-hero" aria-label="Repayment snapshot">
                        <h3 class="sr-only" id="repaymentStandingHeading">Repayment snapshot</h3>
                        <p class="sr-only" id="repaymentStandingCopy">A quick snapshot of your current repayment status.</p>
                        <div class="beneficiary-inline-metrics beneficiary-inline-metrics--hero" role="list">
                            <article class="overview-card overview-card--balance" role="listitem">
                                <span class="overview-label">Next due</span>
                                <strong class="overview-value" id="repaymentStandingOutstanding">Completed</strong>
                            </article>
                            <article class="overview-card" role="listitem">
                                <span class="overview-label">Pending verification</span>
                                <strong class="overview-value" id="repaymentStandingPending">0 resibo</strong>
                            </article>
                            <article class="overview-card" role="listitem">
                                <span class="overview-label">Uploaded receipts</span>
                                <strong class="overview-value" id="repaymentStandingOverdue">0 resibo</strong>
                            </article>
                            <article class="overview-card" role="listitem">
                                <span class="overview-label">Needs follow-up</span>
                                <strong class="overview-value" id="repaymentStandingVerified">Active beneficiary</strong>
                            </article>
                        </div>
                    </section>
                    <section class="panel dash-section beneficiary-progress-row" aria-labelledby="beneficiaryKinatibuk-anProgressHeading">
                        <!-- Progress row summarizes month coverage and routes the user into repayment upload. -->
                        <div class="beneficiary-progress-row__main">
                            <div class="beneficiary-progress-row__head">
                                <div>
                                    <span class="beneficiary-progress-row__label" id="overviewProgressLabel">Repayment progress</span>
                                    <strong class="beneficiary-progress-row__value" id="overviewProgress">0/24 months</strong>
                                </div>
                                <p class="beneficiary-progress-row__meta" id="overviewRate">0% complete</p>
                            </div>
                            <div class="beneficiary-progress-row__track" role="progressbar" aria-labelledby="beneficiaryKinatibuk-anProgressHeading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                                <div class="beneficiary-progress-row__fill" id="overviewProgressFill"></div>
                            </div>
                            <p class="beneficiary-progress-row__note is-hidden" id="overviewDue"></p>
                        </div>
                        <div class="beneficiary-progress-row__actions" id="overviewProgressActions">
                            <span class="sr-only" id="bannerLabelRate">Aksyon sa repayment</span>
                            <!-- This primary CTA routes the beneficiary straight into the repayment workspace. -->
                            <button type="button" class="btn-primary" id="overviewRepaymentsBtn">I-upload ang resibo</button>
                        </div>
                    </section>
                    <div class="beneficiary-overview-lower-grid">
                        <section class="panel dash-section panel--review beneficiary-updates-panel" aria-labelledby="beneficiaryUpdatesHeading">
                            <div class="panel-header panel-header--compact">
                                <h3 id="beneficiaryUpdatesHeading">Updates</h3>
                            </div>
                            <div class="beneficiary-update-stack">
                                <div class="beneficiary-update-row">
                                    <span class="chip">Reminder</span>
                                    <p id="overviewReminder">Wala pay pahinumdom.</p>
                                </div>
                                <div class="beneficiary-update-row">
                                    <span class="chip">Verification</span>
                                    <p id="overviewAccountAlert">Wala pay account alert.</p>
                                </div>
                                <div class="beneficiary-update-row">
                                    <span class="chip">Suporta</span>
                                    <p id="overviewSupport">Need help? Contact Social Worker support.</p>
                                </div>
                            </div>
                        </section>
                        <section class="panel dash-section panel--support support-page-panel beneficiary-support-preview" aria-labelledby="beneficiarySupportPreviewHeading" data-role="beneficiary">
                            <div class="panel-header panel-header--compact">
                                <h3 id="beneficiarySupportPreviewHeading">Suporta</h3>
                            </div>
                            <div class="beneficiary-support-mini">
                                <div class="beneficiary-support-mini__copy">
                                    <span class="overview-label">Social Worker Support</span>
                                    <strong class="support-card__primary" id="overviewSupportWorker">SMART LEAP Social Worker</strong>
                                    <p class="support-card__meta" id="overviewSupportWorkerContact">sw@smartleap.local</p>
                                    <p class="beneficiary-support-mini__hint">Contact Social Worker support for repayment, correction, and verification concerns.</p>
                                </div>
                            </div>
                        </section>
                    </div>
                </section>

                <section id="profile" class="dash-page dash-section" data-role="beneficiary">
                    <section class="panel dash-section profile-editor-workspace beneficiary-profile-workspace">
                        <!-- Beneficiary profile workspace for editable personal and livelihood details. -->
                        <div class="profile-card beneficiary-profile-card">
                            <aside class="profile-photo beneficiary-profile-photo">
                                <div class="profile-photo__frame">
                                    <img id="profilePhotoPreview" src="" alt="Preview sa litrato sa profile" class="is-hidden">
                                    <div class="profile-photo__placeholder" id="profilePhotoPlaceholder">No photo</div>
                                </div>
                                <label class="btn-outline profile-photo__upload">
                                    Upload photo
                                    <input type="file" id="profilePhotoInput" accept=".jpg,.jpeg,.png" hidden>
                                </label>
                                <p class="profile-photo__note">JPG or PNG, max 5MB.</p>
                            </aside>
                            <!-- Beneficiaries can still correct profile data here while protected fields remain system-owned. -->
                            <form id="beneficiaryProfileForm" class="beneficiary-profile-form">
                                <section class="panel profile-editor-panel beneficiary-profile-panel" id="beneficiaryPersonalSection">
                                    <div class="panel-header panel-header--compact">
                                        <button type="button" class="btn-outline small beneficiary-profile-back" id="beneficiaryProfileBack">Back</button>
                                    </div>
                                    <div class="panel-header panel-header--compact">
                                        <h3 id="beneficiaryPersonalHeading">Personal details</h3>
                                    </div>
                                    <div class="form-grid">
                                        <label class="form-field">
                                            <span>Full name *</span>
                                            <input type="text" id="beneficiaryName" name="fullName" required>
                                        </label>
                                        <label class="form-field">
                                            <span>Email *</span>
                                            <input type="email" id="beneficiaryEmail" name="email" required>
                                        </label>
                                        <label class="form-field" id="beneficiaryBirthdateField">
                                            <span>Birthdate *</span>
                                            <input type="date" id="beneficiaryBirthdate" name="birthdate" required>
                                        </label>
                                        <label class="form-field" id="beneficiaryAgeField">
                                            <span>Age</span>
                                            <input type="number" id="beneficiaryEdad" name="age" readonly>
                                        </label>
                                        <label class="form-field" id="beneficiaryGenderField">
                                            <span>Gender *</span>
                                            <select id="beneficiaryGender" name="gender" required>
                                                <option value="">Select gender</option>
                                                <option value="Babaye">Female</option>
                                                <option value="Lalaki">Male</option>
                                                <option value="Non-binary">Non-binary</option>
                                                <option value="Dili gustong mosulti">Prefer not to say</option>
                                            </select>
                                        </label>
                                        <label class="form-field" id="beneficiaryRelationshipField" hidden>
                                            <span>Relationship to primary beneficiary *</span>
                                            <input type="text" id="beneficiaryRelationshipToPrimary" name="relationshipToPrimaryBeneficiary">
                                        </label>
                                    </div>
                                </section>
                                <section class="panel profile-editor-panel beneficiary-profile-panel" id="beneficiaryBusinessSection">
                                    <div class="panel-header panel-header--compact">
                                        <h3>Business details</h3>
                                    </div>
                                    <div class="form-grid">
                                        <label class="form-field">
                                            <span>Business name *</span>
                                            <input type="text" id="beneficiaryBusiness" name="businessName" required>
                                        </label>
                                        <label class="form-field">
                                            <span>Batch No</span>
                                            <input type="text" id="beneficiaryBatchNo" name="batchNo" value="Batch 1" readonly>
                                        </label>
                                        <label class="form-field">
                                            <span>Specific business type / Klase sa negosyo *</span>
                                            <input type="text" id="beneficiaryLivelihood" name="livelihood" required>
                                        </label>
                                        <label class="form-field">
                                            <span>Barangay *</span>
                                            <select id="beneficiaryBarangay" name="barangay" required>
                                                <option value="">Select barangay</option>
                                                <?php foreach ($butuanBarangays as $barangay): ?>
                                                    <option value="<?= htmlspecialchars($barangay, ENT_QUOTES, 'UTF-8') ?>"><?= htmlspecialchars($barangay, ENT_QUOTES, 'UTF-8') ?></option>
                                                <?php endforeach; ?>
                                            </select>
                                        </label>
                                    </div>
                                </section>
                                <section class="panel profile-editor-panel beneficiary-profile-panel" id="beneficiaryContactSection">
                                    <div class="panel-header panel-header--compact">
                                        <h3>Contact details</h3>
                                    </div>
                                    <div class="form-grid">
                                        <label class="form-field">
                                            <span>Contact number *</span>
                                            <input type="tel" id="beneficiaryKontak" name="contactNumber" required>
                                        </label>
                                        <label class="form-field">
                                            <span>Complete address *</span>
                                            <input type="text" id="beneficiaryAddress" name="address" required>
                                        </label>
                                        <article class="form-field" id="beneficiaryPrimaryBeneficiaryField" hidden>
                                            <span>Primary beneficiary</span>
                                            <strong id="beneficiaryPrimaryBeneficiaryName">Primary beneficiary</strong>
                                        </article>
                                    </div>
                                </section>
                                <section class="panel profile-editor-panel beneficiary-profile-panel" id="beneficiaryProgramSection">
                                    <div class="panel-header panel-header--compact">
                                        <h3>Program profile</h3>
                                    </div>
                                    <div class="form-grid">
                                        <label class="form-field">
                                            <span>4Ps membership *</span>
                                            <select id="beneficiary4ps" name="is4ps" required>
                                                <option value="">Select</option>
                                                <option value="Yes">Yes</option>
                                                <option value="No">No</option>
                                            </select>
                                        </label>
                                        <label class="form-field">
                                            <span>Highest educational attainment *</span>
                                            <select id="beneficiaryEducationalAttainment" name="educationalAttainment" required>
                                                <option value="">Select attainment</option>
                                                <option value="Kindergarten">Kindergarten</option>
                                                <option value="Elementary">Elementary</option>
                                                <option value="JHS">JHS</option>
                                                <option value="SHS Grad">SHS grad</option>
                                                <option value="Tertiary">Tertiary</option>
                                            </select>
                                        </label>
                                        <label class="form-field">
                                            <span>Sector *</span>
                                            <select id="beneficiarySector" name="sector" required>
                                                <option value="">Select sector</option>
                                                <option value="Indigenous People">Indigenous People</option>
                                                <option value="Senior Citizen">Senior Citizen</option>
                                                <option value="Solo Parent">Solo Parent</option>
                                                <option value="PWD">PWD</option>
                                                <option value="None">None</option>
                                                <option value="Other">Other (please specify)</option>
                                            </select>
                                        </label>
                                        <label class="form-field" id="beneficiarySectorOtherWrap" hidden>
                                            <span>Other sector *</span>
                                            <input type="text" id="beneficiarySectorOtherSpecify" name="sectorOtherSpecify" placeholder="Please specify" disabled>
                                        </label>
                                    </div>
                                </section>
                                <section class="panel profile-editor-panel beneficiary-profile-panel" id="beneficiaryAssignedPdoSection">
                                    <div class="panel-header panel-header--compact">
                                        <h3>Assigned PDO</h3>
                                    </div>
                                    <div class="profile-readonly">
                                        <strong id="assignedPDOName">Project Officer</strong>
                                        <span id="assignedPDOKontak">projectofficer@smartleap.gov.ph</span>
                                    </div>
                                </section>
                                <div class="form-actions full beneficiary-profile-actions">
                                    <button type="submit" class="btn-primary">Save changes</button>
                                </div>
                            </form>
                        </div>
                    </section>
                </section>

                <section id="requirements-progress" class="dash-page dash-section" data-role="applicant-extra">
                    <section class="panel dash-section panel--summary">
                    <div class="requirements-progress">
                        <div class="requirements-progress__meta">
                            <strong id="requirementsProgressCount">0/8 requirements</strong>
                            <span id="requirementsProgressStatus">Pending review</span>
                        </div>
                        <div class="requirements-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                            <div class="requirements-progress__fill" id="requirementsProgressFill"></div>
                            <span class="requirements-progress__marker" data-value="3">3/8</span>
                            <span class="requirements-progress__marker" data-value="7">7/8</span>
                            <span class="requirements-progress__marker" data-value="8">8/8</span>
                        </div>
                        <ul class="requirements-list" id="requirementsList">
                            <li class="empty">Requirement uploads will appear once reviewed.</li>
                        </ul>
                    </div>
                    </section>
                </section>

                <section id="notifications-panel" class="dash-page dash-section" data-role="applicant-extra">
                    <section class="panel dash-section panel--summary">
                    <ul class="notification-list" id="notificationList">
                        <li class="empty">Wala pay notifications.</li>
                    </ul>
                    </section>
                </section>

                <section id="repayments" class="dash-page dash-section" data-role="beneficiary">
                    <div class="beneficiary-repayment-stack">
                        <section class="panel dash-section panel--info application-workspace-panel repayment-block repayment-actions" aria-labelledby="repaymentActionsHeading">
                            <div class="panel-header panel-header--compact">
                                <h3 id="repaymentActionsHeading">I-upload ang opisyal nga resibo</h3>
                            </div>
                            <div class="repayment-actions__grid repayment-actions__grid--single">
                                <div class="repayment-action-card repayment-action-card--form">
                                    <p class="repayment-action-card__intro">Log your payment record for review.</p>
                                    <div class="repayment-flow-steps" aria-label="Repayment upload steps">
                                        <span class="repayment-flow-step is-active">1. Add official receipt</span>
                                        <span class="repayment-flow-step">2. Submit</span>
                                    </div>
                                    <div class="repayment-due-list" id="repaymentDueList" aria-live="polite"></div>
                                    <form id="uploadForm" class="form-grid repayment-upload-form">
                                        <div id="singleMonthFields" class="repayment-form-mode">
                                            <label class="form-field">
                                                <span>OR month *</span>
                                                <input type="month" id="uploadMonth" name="month" required>
                                            </label>
                                            <label class="form-field">
                                                <span>Amount paid *</span>
                                                <input type="number" id="uploadAmount" name="amount" min="0" step="0.01" placeholder="&#8369;625.00" required>
                                            </label>
                                            <label class="form-field">
                                                <span>Payment date *</span>
                                                <input type="date" id="uploadDate" name="paymentDate" required>
                                            </label>
                                            <label class="form-field">
                                                <span>OR number *</span>
                                                <input type="text" id="uploadOr" name="or" placeholder="BC 2670412" required>
                                                <small class="field-helper">Use the official receipt number printed beside "NO." on the receipt.</small>
                                            </label>
                                            <label class="form-field full repayment-upload-form__file">
                                                <span>Upload OR file *</span>
                                                <input type="file" id="uploadFile" name="file" accept=".jpg,.jpeg,.png,.pdf" required>
                                                <small class="field-helper">Accepted file types: JPG, PNG, or PDF.</small>
                                            </label>
                                            <label class="form-field full repayment-upload-form__notes">
                                                <span>Notes for verifier</span>
                                                <textarea id="uploadNotes" name="notes" rows="3" placeholder="Optional message"></textarea>
                                            </label>
                                        </div>
                                        <div class="form-actions full">
                                            <button type="submit" class="btn-primary repayment-upload-form__submit">Submit receipt</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </section>

                        <section class="panel dash-section panel--summary application-workspace-panel repayment-block beneficiary-repayment-tracker" aria-labelledby="repaymentTrackerHeading">
                            <div class="panel-header panel-header--compact">
                                <h3 id="repaymentTrackerHeading">Repayment tracker</h3>
                            </div>
                            <div class="progress-body">
                                <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                                    <div class="progress-bar__fill" id="progressFill"></div>
                                </div>
                                <div class="repayment-tracker-metrics" role="list">
                                    <article class="repayment-tracker-metric" role="listitem">
                                        <span class="overview-label">Verified</span>
                                        <strong class="overview-value" id="progressVerified">0 months verified</strong>
                                    </article>
                                    <article class="repayment-tracker-metric" role="listitem">
                                        <span class="overview-label">Pending verification</span>
                                        <strong class="overview-value" id="progressPending">0 pending verification</strong>
                                    </article>
                                    <article class="repayment-tracker-metric" role="listitem">
                                        <span class="overview-label">Na-upload</span>
                                        <strong class="overview-value" id="progressUploaded">0 na-upload</strong>
                                    </article>
                                    <article class="repayment-tracker-metric" role="listitem">
                                        <span class="overview-label">Kinahanglan follow-up</span>
                                        <strong class="overview-value" id="progressOverdue">0 resibo</strong>
                                    </article>
                                </div>
                            </div>
                        </section>

                        <section class="panel dash-section panel--review repayment-block history repayment-history-block" aria-labelledby="historyHeading">
                            <div class="history-header">
                                <div class="panel-header panel-header--compact">
                                    <h3 id="historyHeading">Repayment history</h3>
                                </div>
                                <p class="history-summary-line" id="historyCounter">0 resibo</p>
                            </div>
                            <div class="history-filters">
                                <label>
                                    <span>Status</span>
                                    <select id="historyFilterStatus">
                                        <option value="">All</option>
                                        <option value="verified">Verified</option>
                                        <option value="uploaded">Na-upload</option>
                                        <option value="pending">Pending</option>
                                        <option value="needs_correction">Kinahanglan ayuhon</option>
                                        <option value="rejected">Rejected</option>
                                    </select>
                                </label>
                                <label>
                                    <span>Month</span>
                                    <input type="month" id="historyFilterMonth">
                                </label>
                            </div>
                            <div class="history-metrics" role="list">
                                <article class="history-metric history-metric--verified" role="listitem">
                                    <span class="history-metric__label">Verified receipts</span>
                                    <strong class="history-metric__value" id="historyVerifiedCount">0 resibo</strong>
                                </article>
                                <article class="history-metric history-metric--pending" role="listitem">
                                    <span class="history-metric__label">Pending verification</span>
                                    <strong class="history-metric__value" id="historyPendingCount">0 resibo</strong>
                                </article>
                                <article class="history-metric history-metric--uploaded" role="listitem">
                                    <span class="history-metric__label">Na-upload online</span>
                                    <strong class="history-metric__value" id="historyUploadedCount">0 resibo</strong>
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
                                    <tbody id="historyTableBody">
                                        <tr class="empty">
                                            <td colspan="6">Wala pay resibo. I-log ang unang OR para magsugod.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div class="repayment-history-cards" id="historyCardList">
                                <article class="history-card history-card--empty">Wala pay resibo. I-log ang unang OR para magsugod.</article>
                            </div>
                        </section>
                    </div>
                </section>

                <section id="support-feedback" class="dash-page dash-section helpdesk-page" aria-label="Support Center" data-helpdesk-root>
                    <header class="helpdesk-header panel">
                        <div>
                            <span class="support-card__eyebrow">SMART LEAP Help Desk</span>
                            <h2>Support Center</h2>
                            <p>Submit a concern, track replies, and get help from Social Worker support.</p>
                        </div>
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

            <nav class="beneficiary-mobile-tabbar" aria-label="Beneficiary mobile navigation">
                <a class="beneficiary-tabbar__link is-active" href="#overview">
                    <span class="beneficiary-tabbar__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" role="presentation">
                            <path d="M3 11.5L12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M5.5 10.5V20h13V10.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="beneficiary-tabbar__label" data-i18n-key="overview">Overview</span>
                </a>
                <a class="beneficiary-tabbar__link" href="#repayments" data-role="beneficiary">
                    <span class="beneficiary-tabbar__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" role="presentation">
                            <rect x="6" y="4" width="12" height="16" rx="2" stroke-linejoin="round"/>
                            <path d="M9 9h6" stroke-linecap="round"/>
                            <path d="M9 12h6" stroke-linecap="round"/>
                            <path d="M9 15h3" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <span class="beneficiary-tabbar__label" data-i18n-key="repayments">Repayments</span>
                </a>
                <a class="beneficiary-tabbar__link" href="#support-feedback">
                    <span class="beneficiary-tabbar__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" role="presentation">
                            <path d="M7 7h10a3 3 0 013 3v4a3 3 0 01-3 3h-3l-3 4-3-4H7a3 3 0 01-3-3v-4a3 3 0 013-3z" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="beneficiary-tabbar__label" data-i18n-key="support">Support</span>
                </a>
            </nav>

            <footer class="dash-footer">
            </footer>
        </div>
    </div>

    <div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="true"></div>

    <script src="<?= $baseUrl ?>/assets/js/shared/notifications.js?v=<?= urlencode((string) $notificationsJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/language-toggle.js?v=<?= urlencode((string) $languageToggleJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/beneficiary.js?v=<?= urlencode((string) $beneficiaryJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/support-helpdesk.js?v=<?= urlencode((string) $supportHelpdeskJsVersion) ?>" defer></script>
</body>
</html>
