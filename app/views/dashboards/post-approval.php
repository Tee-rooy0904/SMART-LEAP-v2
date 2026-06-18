<?php /** @var string $baseUrl */ ?>
<?php /** @var array|null $authUser */ ?>
<?php
$applicantCssVersion = @filemtime(base_path('public/assets/css/dashboards/applicant.css')) ?: time();
$postApprovalCssVersion = @filemtime(base_path('public/assets/css/dashboards/post-approval.css')) ?: time();
$notificationsCssVersion = @filemtime(base_path('public/assets/css/components/notifications.css')) ?: time();
$postApprovalJsVersion = @filemtime(base_path('public/assets/js/dashboards/post-approval.js')) ?: time();
$notificationsJsVersion = @filemtime(base_path('public/assets/js/shared/notifications.js')) ?: time();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Post-Approval Tasks</title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/applicant.css?v=<?= urlencode((string) $applicantCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/post-approval.css?v=<?= urlencode((string) $postApprovalCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/components/notifications.css?v=<?= urlencode((string) $notificationsCssVersion) ?>">
</head>
<body class="post-approval-page">
    <script>
        window.SMARTLEAP_AUTH_USER = <?= json_encode($authUser ?? null, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_BASE_URL = <?= json_encode($baseUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    </script>

    <div class="dashboard-shell">
        <aside class="dash-sidebar" id="appSidebar" aria-label="Applicant navigation">
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
                <a class="sidebar-link" href="<?= $baseUrl ?>/applicant-dashboard#dashboard-home"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M3 11.5L12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10.5V20h13V10.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Dashboard</span></a>
                <a class="sidebar-link" href="<?= $baseUrl ?>/applicant-dashboard#application-page"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><circle cx="12" cy="8" r="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20a8 8 0 0116 0" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Application</span></a>
                <a class="sidebar-link" href="<?= $baseUrl ?>/applicant-dashboard#training-page"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M3 9l9-4 9 4-9 4-9-4z" stroke-linejoin="round"/><path d="M7 11v5c0 1.66 2.91 3 5 3s5-1.34 5-3v-5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Training</span></a>
                <a class="sidebar-link is-active" href="<?= $baseUrl ?>/post-approval"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M12 3l7 4v5c0 4.5-2.6 7.9-7 9-4.4-1.1-7-4.5-7-9V7l7-4z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Post-Approval</span></a>
                <a class="sidebar-link" href="<?= $baseUrl ?>/applicant-dashboard#support-page"><span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M7 7h10a3 3 0 013 3v4a3 3 0 01-3 3h-3l-3 4-3-4H7a3 3 0 01-3-3v-4a3 3 0 013-3z" stroke-linejoin="round"/></svg></span><span>Support</span></a>
            </nav>

            <button type="button" class="btn-outline sidebar-logout" id="logoutButton">Logout</button>
        </aside>
        <button type="button" class="sidebar-overlay" id="sidebarOverlay" aria-hidden="true" tabindex="-1"></button>

        <div class="dash-content">
            <header class="mobile-topbar" aria-label="Applicant mobile navigation">
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
                <section class="panel post-panel post-tracker-shell">
                    <div class="post-tracker-shell__hero">
                        <div class="post-tracker-shell__copy">
                            <div class="panel-header panel-header--compact">
                                <h2>Task tracker</h2>
                                <p class="panel-subtitle" id="trackerSubtitle">Check this page first so you know what to do next.</p>
                            </div>
                            <strong class="post-tracker-shell__priority" id="trackerPriority">Await training unlock</strong>
                            <p class="post-tracker-shell__next" id="trackerNextAction">Open task when available</p>
                        </div>
                        <div class="post-tracker-shell__summary post-approval-summary">
                            <article class="post-approval-metric">
                                <span class="overview-label">Unlocked on</span>
                                <strong class="overview-value" id="trackerUnlockedAt">Not unlocked</strong>
                                <p class="overview-meta" id="trackerUnlockMeta">Training completion has not unlocked your post-approval tasks yet.</p>
                            </article>
                            <article class="post-approval-metric">
                                <span class="overview-label">Forms on this page</span>
                                <strong class="overview-value" id="trackerTaskCount">0 tasks</strong>
                                <p class="overview-meta" id="trackerProgressMeta">No post-approval tasks are currently available.</p>
                            </article>
                            <article class="post-approval-metric">
                                <span class="overview-label">Need to fix</span>
                                <strong class="overview-value" id="trackerFeedbackSummary">No remarks</strong>
                                <p class="overview-meta" id="trackerFeedbackMeta">Reviewer instructions and correction notes will be summarized here.</p>
                            </article>
                        </div>
                    </div>
                    <div class="tracker-list-head">
                        <div>
                            <h3>Forms in order</h3>
                            <p class="panel-subtitle">Only forms that are ready now should look openable.</p>
                        </div>
                        <span class="chip" id="trackerTaskChip">0 tasks</span>
                    </div>
                    <div class="post-approval-taskcards tracker-taskcards" id="trackerTaskCards">
                        <article class="post-approval-taskcard is-empty">Post-approval tasks will appear here after training completion.</article>
                    </div>
                </section>
            </main>

            <footer class="dash-footer">
                <p>SMART LEAP - City Government of Butuan &amp; CSWDD - Empowering homegrown enterprises.</p>
            </footer>
        </div>
    </div>

    <div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="true"></div>

    <script src="<?= $baseUrl ?>/assets/js/shared/notifications.js?v=<?= urlencode((string) $notificationsJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/dashboards/post-approval.js?v=<?= urlencode((string) $postApprovalJsVersion) ?>" defer></script>
</body>
</html>
