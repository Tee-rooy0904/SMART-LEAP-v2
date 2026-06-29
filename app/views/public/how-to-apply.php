<?php /** @var string $baseUrl */ ?>
<?php
$portalStylesVersion = @filemtime(base_path('public/assets/css/public/portal.css')) ?: time();
$portalJsVersion = @filemtime(base_path('public/assets/js/public/portal.js')) ?: time();
$faviconVersion = @filemtime(base_path('public/assets/img/logo-mark.png')) ?: time();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>How to Apply | SMART LEAP</title>
    <link rel="icon" type="image/png" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="apple-touch-icon" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=<?= urlencode((string) $portalStylesVersion) ?>">
</head>
<body class="portal-page portal-page--content">
    <div class="page-shell">
        <?php
        $activeNav = 'apply';
        $isHome = false;
        require __DIR__ . '/../layouts/public-header.php';
        ?>

        <main class="page page--content">
            <section class="content-hero">
                <div class="container content-hero__inner">
                    <span class="section-kicker">How to Apply</span>
                    <h1 class="section-title">Follow the SMART LEAP application process step by step.</h1>
                    <p class="page-intro">The current process begins on the public Stage 1 form, requires email-code verification before your registration appears in Admin validation, and gives private applicant portal access only to selected current-batch registrants.</p>
                </div>
            </section>

            <section class="content-section portal-section">
                <div class="container portal-fact-strip">
                    <article class="portal-fact-card">
                        <span class="portal-fact-card__label">Before review</span>
                        <strong>Email verification is required</strong>
                        <p>Your registration does not enter the Admin queue until the six-digit code sent to your email is accepted.</p>
                    </article>
                    <article class="portal-fact-card">
                        <span class="portal-fact-card__label">Batch placement</span>
                        <strong>Current batch or next batch</strong>
                        <p>Admin reviews which registrants move into the current yearly batch and which may wait for the next one.</p>
                    </article>
                    <article class="portal-fact-card">
                        <span class="portal-fact-card__label">Private account later</span>
                        <strong>Portal activation by notice</strong>
                        <p>The applicant portal password setup link is sent only to selected registrants through the official email notice.</p>
                    </article>
                </div>
            </section>

            <section class="content-section portal-section">
                <div class="container timeline-list portal-process-grid">
                    <article class="timeline-item is-active" tabindex="0" data-timeline-item data-detail-title="Stage 1 Public Registration" data-detail-copy="Click Apply Now and complete the Stage 1 public registration form with your personal details, address, contact details, valid ID, profile photo, and existing business photo.">
                        <span class="timeline-item__number">1</span>
                        <div><h2>Complete Stage 1 Registration</h2><p>Submit your personal details, business details, profile photo, valid ID, and business photo.</p></div>
                    </article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Email-Code Verification" data-detail-copy="Enter the six-digit code sent to your email. Your Stage 1 registration is queued for Admin validation only after the code is accepted.">
                        <span class="timeline-item__number">2</span>
                        <div><h2>Verify Your Email Code</h2><p>Confirm the email code first so your registration can enter the official review queue.</p></div>
                    </article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Admin Validation and Batch Review" data-detail-copy="CSWDD Admin checks your submitted information, uploaded files, and yearly batch availability before deciding the next action.">
                        <span class="timeline-item__number">3</span>
                        <div><h2>Admin Validation and Review</h2><p>Admin reviews your registration details and checks whether you can move into the active yearly batch.</p></div>
                    </article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Current Batch or Next Batch" data-detail-copy="The active yearly batch has a fixed limit. Some qualified registrants may be saved for the next batch instead of receiving immediate private portal access.">
                        <span class="timeline-item__number">4</span>
                        <div><h2>Wait for Batch Placement</h2><p>Some registrants proceed now, while others may be deferred to the next available batch.</p></div>
                    </article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Applicant Portal Invitation" data-detail-copy="Selected registrants receive the official password setup link by email. That invitation activates their private applicant portal access.">
                        <span class="timeline-item__number">5</span>
                        <div><h2>Receive the Portal Invitation</h2><p>Selected registrants get the secure password setup link through the email address they registered.</p></div>
                    </article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Applicant Portal Continuation" data-detail-copy="Inside the private applicant portal, monitor review status, respond to notices, upload follow-up requirements when needed, and check training updates if they become available.">
                        <span class="timeline-item__number">6</span>
                        <div><h2>Continue Inside the Applicant Portal</h2><p>Track your status, respond to reviewer notes, and follow any training or post-approval steps inside the same account.</p></div>
                    </article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Later Beneficiary Continuation" data-detail-copy="If you move forward through the program, the same account later continues into beneficiary records so your application history, training, and repayments stay connected.">
                        <span class="timeline-item__number">7</span>
                        <div><h2>Stay in the Same Account Later On</h2><p>If approved further, your applicant account continues into beneficiary use instead of being replaced by a different portal.</p></div>
                    </article>
                </div>
            </section>

            <section class="content-section portal-section portal-section--soft">
                <div class="container portal-support-strip">
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">Best preparation</span>
                        <h3>Use an email you can access immediately</h3>
                        <p>The verification code and later portal invitation both depend on the email address you enter during Stage 1 registration.</p>
                    </article>
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">Avoid delays</span>
                        <h3>Submit clear and complete files</h3>
                        <p>Blurred IDs, missing business proof, or incomplete details can slow validation and make follow-up corrections more likely.</p>
                    </article>
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">Important expectation</span>
                        <h3>Portal access comes after selection</h3>
                        <p>The private applicant portal is not open to every public registrant immediately. It is activated through official selection and notice.</p>
                    </article>
                </div>
            </section>
        </main>

        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>
    </div>

    <script src="<?= $baseUrl ?>/assets/js/public/portal.js?v=<?= urlencode((string) $portalJsVersion) ?>" defer></script>
</body>
</html>
