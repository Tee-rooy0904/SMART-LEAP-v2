<?php /** @var string $baseUrl */ ?>
<?php /** @var array|null $authUser */ ?>
<?php /** @var array $overview */ ?>
<?php
$adminCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin.css')) ?: time();
$adminComponentsCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-components.css')) ?: time();
$adminDashboardCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-dashboard.css')) ?: time();
$adminReportsCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-reports.css')) ?: time();
$adminApplicationsCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-applications.css')) ?: time();
$adminValidationCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-validation.css')) ?: time();
$adminTrainingCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-training.css')) ?: time();
$adminTeamCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-team.css')) ?: time();
$adminBeneficiariesCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-beneficiaries.css')) ?: time();
$adminRepaymentsCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-repayments.css')) ?: time();
$projectOfficerCssVersion = @filemtime(base_path('public/assets/css/dashboards/project-officer.css')) ?: time();
$postApprovalCssVersion = @filemtime(base_path('public/assets/css/dashboards/post-approval.css')) ?: time();
$postApprovalReviewCssVersion = @filemtime(base_path('public/assets/css/dashboards/post-approval-review.css')) ?: time();
$notificationsCssVersion = @filemtime(base_path('public/assets/css/components/notifications.css')) ?: time();
$adminJsVersion = @filemtime(base_path('public/assets/js/dashboards/admin.js')) ?: time();
$notificationsJsVersion = @filemtime(base_path('public/assets/js/shared/notifications.js')) ?: time();
$dashboardModuleJsVersion = @filemtime(base_path('public/assets/js/modules/dashboard.js')) ?: time();
$applicationsModuleJsVersion = @filemtime(base_path('public/assets/js/modules/applications.js')) ?: time();
$validationModuleJsVersion = @filemtime(base_path('public/assets/js/modules/validation.js')) ?: time();
$teamModuleJsVersion = @filemtime(base_path('public/assets/js/modules/team.js')) ?: time();
$beneficiariesModuleJsVersion = @filemtime(base_path('public/assets/js/modules/beneficiaries.js')) ?: time();
$coMakerRegistrationsModuleJsVersion = @filemtime(base_path('public/assets/js/modules/co-maker-registrations.js')) ?: time();
$repaymentWorkspaceJsVersion = @filemtime(base_path('public/assets/js/dashboards/repayment-review-workspace.js')) ?: time();
$reportsModuleJsVersion = @filemtime(base_path('public/assets/js/modules/reports.js')) ?: time();
$trainingModuleJsVersion = @filemtime(base_path('public/assets/js/modules/training.js')) ?: time();

$applicationSummary = $overview['applicationSummary'] ?? [];
$trainingSummary = $overview['trainingSummary'] ?? [];
$staffSummary = $overview['staffSummary'] ?? [];
$beneficiarySummary = $overview['beneficiarySummary'] ?? [];
$repaymentSummary = $overview['repaymentSummary'] ?? [];
$workflowDistribution = $overview['workflowDistribution'] ?? ['stages' => [], 'total' => 0];
$repaymentDistribution = $overview['repaymentDistribution'] ?? ['segments' => [], 'total' => 0];
$recentActivity = $overview['recentActivity'] ?? [];
$generatedAt = (string) ($overview['generatedAt'] ?? date(DATE_ATOM));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Core document metadata for the Admin Control Center shell. -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Browser tab title for the Admin-only workspace. -->
    <title>SMART LEAP Admin Control Center</title>

    <!-- Shared and admin-specific dashboard styles used across the shell and mounted sections. -->
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/project-officer.css?v=<?= urlencode((string) $projectOfficerCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin.css?v=<?= urlencode((string) $adminCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-components.css?v=<?= urlencode((string) $adminComponentsCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-dashboard.css?v=<?= urlencode((string) $adminDashboardCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-reports.css?v=<?= urlencode((string) $adminReportsCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-applications.css?v=<?= urlencode((string) $adminApplicationsCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-validation.css?v=<?= urlencode((string) $adminValidationCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-training.css?v=<?= urlencode((string) $adminTrainingCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-team.css?v=<?= urlencode((string) $adminTeamCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-beneficiaries.css?v=<?= urlencode((string) $adminBeneficiariesCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-repayments.css?v=<?= urlencode((string) $adminRepaymentsCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/post-approval.css?v=<?= urlencode((string) $postApprovalCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/post-approval-review.css?v=<?= urlencode((string) $postApprovalReviewCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/components/notifications.css?v=<?= urlencode((string) $notificationsCssVersion) ?>">

    <!-- Icon font used by navigation, cards, and action controls in the admin portal. -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">
</head>
<body class="admin-control-body">
    <!-- Bootstrap values consumed by the admin frontend modules after page load. -->
    <script>
        window.SMARTLEAP_BASE_URL = <?= json_encode($baseUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_AUTH_USER = <?= json_encode($authUser ?? null, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_ADMIN_OVERVIEW = <?= json_encode($overview ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    </script>

    <div id="mainSystem" class="admin-shell">
        <aside id="adminSidebar" class="admin-sidebar" aria-hidden="false">
            <!-- Admin branding shown at the top of the persistent left navigation. -->
            <div class="sidebar-brand">
                <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="SMART LEAP logo" class="brand-logo">
                <div class="brand-copy">
                    <h1 class="brand-title">SMART LEAP</h1>
                    <span class="brand-tag">Administrator</span>
                </div>
            </div>

            <!-- Admin can jump between every major workspace from this primary control rail. -->
            <nav class="sidebar-nav" aria-label="Admin navigation">
                <!-- Dashboard overview and KPI analytics workspace. -->
                <button class="nav-link active" type="button" data-section="dashboard"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-5H4v5Z"/></svg><span>Dashboard</span></button>
                <!-- Stage 1 public registration validation queue for pending, selected, and saved registrants. -->
                <button class="nav-link" type="button" data-section="validation"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4v1.5h8V8H8Zm0 3.5V13h5v-1.5H8Zm8.7 1.1 1.1 1.1-4.1 4.1-2.1-2.1 1.1-1.1 1 1 3-3Z"/></svg><span>Application for Validation</span><span class="nav-badge" data-section-badge="validation"></span></button>
                <!-- Stage 2 applicant review and workflow management workspace. -->
                <button class="nav-link" type="button" data-section="applications"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Zm7 1.5V8h3.5L13 4.5ZM8.5 12h7v1.5h-7V12Zm0 4h5v1.5h-5V16Z"/></svg><span>Applications</span><span class="nav-badge" data-section-badge="applications"></span></button>
                <!-- Training management entry point for sessions, participants, attendance, and notices. -->
                <button class="nav-link" type="button" data-section="training"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3 8.5l9 4.5 9-4.5L12 4Zm-5 7.2V16c0 2 3.4 3.5 5 3.5s5-1.5 5-3.5v-4.8l-5 2.5-5-2.5Z"/></svg><span>Training</span><span class="nav-badge" data-section-badge="training"></span></button>
                <!-- Staff management area for Social Worker and PDO accounts and assignments. -->
                <button class="nav-link" type="button" data-section="team"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4Zm8-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-.8 0-1.5.1-2.2.4 1.4.9 2.2 2.2 2.2 3.6v1h5v-2c0-1.7-2.2-3-5-3Z"/></svg><span>Team</span><span class="nav-badge" data-section-badge="team"></span></button>
                <!-- Active beneficiary roster and status oversight workspace. -->
                <button class="nav-link" type="button" data-section="beneficiaries"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM8 13c-3 0-5.5 1.6-5.5 3.6V20h11v-3.4C13.5 14.6 11 13 8 13Zm8 0c-.9 0-1.8.1-2.5.4 1.2.9 2 2 2 3.2V20h6v-3.4C21.5 14.6 19 13 16 13Z"/></svg><span>Beneficiaries</span><span class="nav-badge" data-section-badge="beneficiaries"></span></button>
                <!-- Co-maker and successor registration review workspace. -->
                <button class="nav-link" type="button" data-section="co-makers"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a4 4 0 0 1 4 4c0 .73-.2 1.42-.54 2.01A4.99 4.99 0 0 1 19 13v5h-2v-5a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v5H3v-5a4.99 4.99 0 0 1 3.54-4.79A3.96 3.96 0 0 1 6 6a4 4 0 0 1 6-3.46A3.98 3.98 0 0 1 12 2Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 13h2v5h-2v-5Zm-1.59-3L20 10.41 21.41 9 24 11.59 21.41 14.17 20 12.76 18.41 14 17 12.59 18.59 11 17 9.41 18.41 8 20 9.59Z"/></svg><span>Co-maker Registrations</span><span class="nav-badge" data-section-badge="co-makers"></span></button>
                <!-- Repayment verification workspace with shared modal review flow. -->
                <button class="nav-link" type="button" data-section="repayments"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V3Zm2 5h6V6.5H9V8Zm0 4h6v-1.5H9V12Zm0 4h4v-1.5H9V16Z"/></svg><span>Repayments</span><span class="nav-badge" data-section-badge="repayments"></span></button>
                <!-- Reports workspace for exports, charts, and cross-module analytics. -->
                <button class="nav-link" type="button" data-section="reports"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16v2H4v-2Zm2-2h3V9H6v8Zm5 0h3V4h-3v13Zm5 0h3v-6h-3v6Z"/></svg><span>Reports</span></button>
            </nav>

        </aside>

        <div class="content-area">
            <header class="content-header admin-topbar">
                <!-- Section title changes as the admin moves between dashboard workspaces. -->
                <div class="content-headline">
                    <span id="adminSectionEyebrow" class="admin-topbar__eyebrow">Welcome back</span>
                    <h1 id="adminSectionTitle"><?= htmlspecialchars((string) ($authUser['name'] ?? 'Admin'), ENT_QUOTES) ?></h1>
                </div>

                <div class="admin-topbar__actions">
                    <!-- Manual top-level refresh for the active Admin workspace. -->
                    <button type="button" class="app-btn-outline admin-refresh-button" id="adminRefreshButton" aria-label="Refresh admin dashboard">
                        <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h8V3l-3.3 3.3Z"/></svg>
                    </button>
                    <!-- These account actions open profile and password modals or end the admin session. -->
                    <div class="admin-account-menu">
                        <button type="button" class="app-btn-outline admin-account-menu__trigger" id="adminAccountMenuTrigger" aria-expanded="false">
                            <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"/></svg>
                            <span>Account</span>
                        </button>
                        <div class="admin-account-menu__panel" id="adminAccountMenuPanel" hidden>
                            <div class="admin-account-menu__actions">
                                <button type="button" class="app-btn-ghost admin-account-menu__action" id="adminAccountProfile">
                                    <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"/></svg>
                                    <span>Profile</span>
                                </button>
                                <button type="button" class="app-btn-ghost admin-account-menu__action" id="adminAccountPassword">
                                    <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z"/></svg>
                                    <span>Change Password</span>
                                </button>
                                <button type="button" class="app-btn-outline app-btn-outline--danger admin-account-menu__action admin-account-menu__action--danger" id="system-logout">
                                    <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h8v2H6v12h6v2H4V4Zm12.6 4.4L21.2 13l-4.6 4.6-1.4-1.4 2.2-2.2H10v-2h7.4l-2.2-2.2 1.4-1.4Z"/></svg>
                                    <span>Logout</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main class="content-main">
                <!-- Each required partial below owns one admin workspace and is hydrated by its matching JS module. -->
                <?php require __DIR__ . '/admin/sections/dashboard.php'; ?>
                <?php require __DIR__ . '/admin/sections/validation.php'; ?>
                <?php require __DIR__ . '/admin/sections/applications.php; ?>
                <?php require __DIR__ . '/admin/sections/training.php'; ?>
                <?php require __DIR__ . '/admin/sections/team.php'; ?>
                <?php require __DIR__ . '/admin/sections/beneficiaries.php'; ?>
                <?php require __DIR__ . '/admin/sections/co-makers.php'; ?>
                <?php require __DIR__ . '/admin/sections/repayments.php'; ?>
                <?php require __DIR__ . '/admin/sections/reports.php'; ?>
            </main>

            <div id="modal-root"></div>
        </div>
    </div>

    <script src="<?= $baseUrl ?>/assets/js/shared/dom.js" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/shared/format.js" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/shared/state.js" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/modules/dashboard.js?v=<?= urlencode((string) $dashboardModuleJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/modules/applications.js?v=<?= urlencode((string) $applicationsModuleJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/modules/validation.js?v=<?= urlencode((string) $validationModuleJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/modules/training.js?v=<?= $trainingModuleJsVersion ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/modules/team.js?v=<?= urlencode((string) $teamModuleJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/modules/beneficiaries.js?v=<?= urlencode((string) $beneficiariesModuleJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/modules/co-maker-registrations.js?v=<?= urlencode((string) $coMakerRegistrationsModuleJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/modules/reports.js?v=<?= urlencode((string) $reportsModuleJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/repayment-review-workspace.js?v=<?= urlencode((string) $repaymentWorkspaceJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/shared/notifications.js?v=<?= urlencode((string) $notificationsJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/admin.js?v=<?= urlencode((string) $adminJsVersion) ?>" defer></script>
</body>
</html>
