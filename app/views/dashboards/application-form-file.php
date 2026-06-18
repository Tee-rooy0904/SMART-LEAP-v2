<?php /** @var string $baseUrl */ ?>
<?php /** @var array|null $authUser */ ?>
<?php /** @var string $taskCode */ ?>
<?php
$role = strtolower((string) ($authUser['role'] ?? 'applicant'));
$isBeneficiary = $role === 'beneficiary';
$dashboardPath = $isBeneficiary ? $baseUrl . '/beneficiary-dashboard#repayments' : $baseUrl . '/applicant-dashboard#application-page';
$dashboardLabel = $isBeneficiary ? 'Beneficiary' : 'Applicant';
$isStandaloneForm = in_array($taskCode, ['availment_form', 'business_plan', 'validation_form', 'buhat_sa_pagpanumpa', 'mungkahing_proyekto'], true);
$applicantCssVersion = @filemtime(base_path('public/assets/css/dashboards/applicant.css')) ?: time();
$postApprovalCssVersion = @filemtime(base_path('public/assets/css/dashboards/post-approval.css')) ?: time();
$notificationsCssVersion = @filemtime(base_path('public/assets/css/components/notifications.css')) ?: time();
$postApprovalFormJsVersion = @filemtime(base_path('public/assets/js/dashboards/post-approval-form.js')) ?: time();
$notificationsJsVersion = @filemtime(base_path('public/assets/js/shared/notifications.js')) ?: time();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Online Form</title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/applicant.css?v=<?= urlencode((string) $applicantCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/post-approval.css?v=<?= urlencode((string) $postApprovalCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/components/notifications.css?v=<?= urlencode((string) $notificationsCssVersion) ?>">
</head>
<body class="post-approval-form-page<?= $isStandaloneForm ? ' standalone-form-page' : '' ?>">
    <script>
        window.SMARTLEAP_AUTH_USER = <?= json_encode($authUser ?? null, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_BASE_URL = <?= json_encode($baseUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_POST_APPROVAL_CODE = <?= json_encode($taskCode, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    </script>

    <?php if ($isStandaloneForm): ?>
        <main class="standalone-form-shell">
            <section class="standalone-form-panel">
                <div class="post-approval-workspace post-approval-workspace--page">
                    <div class="post-approval-notice" id="postApprovalWorkspaceNotice">
                        Loading form workspace...
                    </div>
                    <form id="postApprovalForm" class="post-approval-form is-hidden">
                        <div class="post-approval-form__sections" id="postApprovalFormSections"></div>
                        <div class="post-approval-form__staff" id="postApprovalStaffSections" hidden></div>
                        <div class="form-actions post-approval-form__actions post-approval-form__actions--sticky">
                            <a class="btn-outline post-approval-form__back-action" href="<?= htmlspecialchars($dashboardPath, ENT_QUOTES, 'UTF-8') ?>">&larr; Back to application</a>
                            <button type="button" class="btn-outline" id="postApprovalSaveButton">Save progress</button>
                            <button type="submit" class="btn-primary" id="postApprovalSubmitButton">Submit form</button>
                        </div>
                    </form>
                </div>
            </section>
        </main>
    <?php else: ?>
        <div class="dashboard-shell">
            <aside class="dash-sidebar" id="appSidebar" aria-label="<?= htmlspecialchars($dashboardLabel, ENT_QUOTES, 'UTF-8') ?> navigation">
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

                <nav class="sidebar-nav">
                    <a class="sidebar-link" href="<?= htmlspecialchars($dashboardPath, ENT_QUOTES, 'UTF-8') ?>"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M3 11.5L12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10.5V20h13V10.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Dashboard</span></a>
                    <a class="sidebar-link is-active" href="<?= htmlspecialchars($dashboardPath, ENT_QUOTES, 'UTF-8') ?>"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M12 3l7 4v5c0 4.5-2.6 7.9-7 9-4.4-1.1-7-4.5-7-9V7l7-4z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Online Forms</span></a>
                </nav>

                <button type="button" class="btn-outline sidebar-logout" id="logoutButton">Logout</button>
            </aside>
            <button type="button" class="sidebar-overlay" id="sidebarOverlay" aria-hidden="true" tabindex="-1"></button>

            <div class="dash-content">
                <header class="mobile-topbar" aria-label="<?= htmlspecialchars($dashboardLabel, ENT_QUOTES, 'UTF-8') ?> mobile navigation">
                    <div class="mobile-topbar__brand">
                        <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="SMART LEAP seal" class="mobile-topbar__logo">
                        <strong class="mobile-topbar__title">SMART LEAP</strong>
                    </div>
                    <button
                        type="button"
                        class="mobile-topbar__menu"
                        id="sidebarToggle"
                        aria-label="Open navigation"
                        aria-controls="appSidebar"
                        aria-expanded="false"
                    >
                        <span class="mobile-topbar__menu-box" aria-hidden="true">
                            <span></span>
                            <span></span>
                            <span></span>
                        </span>
                    </button>
                </header>
                <main class="dash-main post-main">
                    <section class="panel post-form-panel">
                        <div class="post-approval-workspace post-approval-workspace--page">
                            <div class="post-form-header-stack">
                                <div class="dash-page__header post-form-page-header">
                                    <div>
                                        <p class="dash-page__eyebrow">SMART LEAP Application Form</p>
                                        <h1 id="formPageTitle">Application Form</h1>
                                        <p class="dash-page__lead" id="formPageSubtitle">This page explains what you are filling out before you start the form.</p>
                                    </div>
                                </div>
                                <section class="form-status-strip" aria-label="Form status">
                                    <article class="form-status-strip__item">
                                        <span class="overview-label">Status</span>
                                        <strong class="overview-value" id="formPageStatus">Loading</strong>
                                    </article>
                                    <article class="form-status-strip__item">
                                        <span class="overview-label">Progress</span>
                                        <strong class="overview-value" id="formPageCompletion">0%</strong>
                                    </article>
                                    <article class="form-status-strip__item">
                                        <span class="overview-label">Review</span>
                                        <strong class="overview-value" id="formPageReview">Awaiting draft</strong>
                                    </article>
                                </section>
                                <nav class="form-section-nav" id="formSectionNav" aria-label="Form sections" hidden></nav>
                            </div>
                            <section class="form-guidance-card" aria-labelledby="formGuidanceHeading">
                                <div class="form-guidance-card__header">
                                    <h3 id="formGuidanceHeading">Before you start</h3>
                                    <p id="formGuidanceSummary">Loading guidance for this form.</p>
                                </div>
                                <div class="form-guidance-card__grid">
                                    <article class="form-guidance-item"><span class="overview-label">Step</span><strong id="formGuidanceStep">Loading</strong></article>
                                    <article class="form-guidance-item"><span class="overview-label">Estimated time</span><strong id="formGuidanceTime">Loading</strong></article>
                                    <article class="form-guidance-item"><span class="overview-label">Prepare first</span><strong id="formGuidancePrep">Loading</strong></article>
                                </div>
                            </section>
                            <div class="post-approval-notice" id="postApprovalWorkspaceNotice">
                                Loading form workspace...
                            </div>
                            <form id="postApprovalForm" class="post-approval-form is-hidden">
                                <div class="post-approval-form__sections" id="postApprovalFormSections"></div>
                                <div class="post-approval-form__staff" id="postApprovalStaffSections" hidden></div>
                                <div class="form-actions post-approval-form__actions post-approval-form__actions--sticky">
                                    <a class="btn-outline post-approval-form__back-action" href="<?= htmlspecialchars($dashboardPath, ENT_QUOTES, 'UTF-8') ?>">&larr; Back to application</a>
                                    <button type="button" class="btn-outline" id="postApprovalSaveButton">Save progress</button>
                                    <button type="submit" class="btn-primary" id="postApprovalSubmitButton">Submit form</button>
                                </div>
                            </form>
                        </div>
                    </section>
                </main>

                <footer class="dash-footer">
                    <p>SMART LEAP - City Government of Butuan &amp; CSWDD - Empowering homegrown enterprises.</p>
                </footer>
            </div>
        </div>
    <?php endif; ?>

    <div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="true"></div>

    <script src="<?= $baseUrl ?>/assets/js/shared/notifications.js?v=<?= urlencode((string) $notificationsJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/post-approval-form.js?v=<?= urlencode((string) $postApprovalFormJsVersion) ?>" defer></script>
</body>
</html>
