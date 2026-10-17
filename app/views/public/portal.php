<?php /** @var string $baseUrl */ ?>
<?php
$portalUser = isset($authUser) && is_array($authUser) ? $authUser : null;
$portalQuickView = isset($quickView) && is_array($quickView) ? $quickView : null;
$portalJsVersion = @filemtime(base_path('public/assets/js/public/portal.js')) ?: time();
$transitionsCssVersion = @filemtime(base_path('public/assets/css/shared/transitions.css')) ?: time();
$uiInteractiveJsVersion = @filemtime(base_path('public/assets/js/shared/ui-interactive.js')) ?: time();
$faviconVersion = @filemtime(base_path('public/assets/img/logo-mark.png')) ?: time();
$isCoMakerQuickView = $portalQuickView !== null && (string) ($portalQuickView['type'] ?? '') === 'co-maker';
$primaryActionHref = $portalQuickView
    ? $baseUrl . '/' . ltrim((string) ($portalQuickView['actionPath'] ?? 'applicant-dashboard'), '/')
    : $baseUrl . '/portal/apply';
$primaryActionLabel = $portalQuickView
    ? (string) ($portalQuickView['actionLabel'] ?? 'Open Dashboard')
    : 'Apply Now';
$heroTitle = $portalQuickView
    ? ($isCoMakerQuickView ? 'Open your co-maker repayment access.' : 'Continue your SMART LEAP record.')
    : 'Start your SMART LEAP registration here.';
$heroSecondaryHref = $portalQuickView
    ? ($isCoMakerQuickView ? '' : '#portal-progress')
    : '';
$heroSecondaryLabel = $portalQuickView
    ? ($isCoMakerQuickView ? '' : 'View Current Step')
    : '';
$heroBody = $portalQuickView
    ? ($isCoMakerQuickView ? 'This account is only for repayment access linked to a deceased primary beneficiary. It is not part of the applicant training or beneficiary application workflow.' : 'Continue from your current SMART LEAP step, review the latest notices, and keep your record complete.')
    : 'Submit one complete Stage 1 application with your profile, demographic details, business information, valid ID, and existing business photo. You will verify your email by code before Admin validation, and selected applicants receive an email to set their applicant portal password.';
$heroFactLine = $portalQuickView
    ? ($isCoMakerQuickView ? 'Upload repayment receipts and follow PDO/Admin verification from the beneficiary dashboard.' : 'Stay updated on your current review, training, or beneficiary record.')
    : 'SMART LEAP serves Butuan City residents with microbusinesses or livelihood activities who need organized CSWDD screening before the full applicant workflow.';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP Applicant and Beneficiary Portal</title>
    <link rel="icon" type="image/png" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="apple-touch-icon" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=<?= urlencode((string) (@filemtime(base_path('public/assets/css/public/portal.css')) ?: time())) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/shared/transitions.css?v=<?= urlencode((string) $transitionsCssVersion) ?>">
</head>
<body class="portal-page portal-page--home">
    <div class="portal-backdrop" aria-hidden="true">
        <span class="portal-backdrop__orb portal-backdrop__orb--left"></span>
        <span class="portal-backdrop__orb portal-backdrop__orb--right"></span>
        <span class="portal-backdrop__horizon"></span>
        <span class="portal-backdrop__city"></span>
    </div>

    <div class="page-shell">
        <?php
        $activeNav = 'home';
        $isHome = true;
        $showLoginNav = false;
        require __DIR__ . '/../layouts/public-header.php';
        ?>

        <main class="page page--home" id="content">
            <section class="home-hero portal-hero<?= $portalQuickView === null ? ' portal-hero--photo' : '' ?>" id="home">
                <div class="container home-hero__grid<?= $portalQuickView === null ? ' home-hero__grid--public' : '' ?>">
                    <div class="home-hero__copy">
                        <div class="home-hero__copy-inner">
                            <h1 class="home-hero__title"><?= htmlspecialchars($heroTitle, ENT_QUOTES) ?></h1>
                            <p class="home-hero__text"><?= htmlspecialchars($heroBody, ENT_QUOTES) ?></p>
                            <p class="home-hero__fact"><?= htmlspecialchars($heroFactLine, ENT_QUOTES) ?></p>
                        </div>

                        <div class="home-hero__actions">
                            <a class="header-action header-action--solid" href="<?= htmlspecialchars($primaryActionHref, ENT_QUOTES) ?>"><?= htmlspecialchars($primaryActionLabel, ENT_QUOTES) ?></a>
                            <?php if ($heroSecondaryLabel !== '' && $heroSecondaryHref !== ''): ?>
                            <a class="portal-hero__link text-link" href="<?= htmlspecialchars($heroSecondaryHref, ENT_QUOTES) ?>"><?= htmlspecialchars($heroSecondaryLabel, ENT_QUOTES) ?></a>
                            <?php endif; ?>
                        </div>
                    </div>

                    <?php if ($portalQuickView !== null): ?>
                    <aside class="auth-card auth-card--portal portal-quick-view" id="authShell" aria-label="Portal quick view">
                        <div class="auth-card__top portal-quick-view__top">
                            <h2><?= htmlspecialchars((string) ($portalQuickView['userName'] ?? 'SMART LEAP User'), ENT_QUOTES) ?></h2>
                            <p class="portal-quick-view__status"><?= htmlspecialchars((string) ($portalQuickView['statusLine'] ?? ''), ENT_QUOTES) ?></p>
                        </div>

                        <?php if (!$isCoMakerQuickView): ?>
                        <div class="portal-progress" id="portal-progress" aria-label="SMART LEAP progress tracker">
                            <?php foreach (($portalQuickView['steps'] ?? []) as $step): ?>
                                <div class="portal-progress__step is-<?= htmlspecialchars((string) ($step['state'] ?? 'upcoming'), ENT_QUOTES) ?>">
                                    <span class="portal-progress__dot" aria-hidden="true"><?= (int) ($step['number'] ?? 0) ?></span>
                                    <span class="portal-progress__label"><?= htmlspecialchars((string) ($step['label'] ?? ''), ENT_QUOTES) ?></span>
                                </div>
                            <?php endforeach; ?>
                        </div>
                        <?php endif; ?>

                        <div class="portal-quick-view__meta">
                            <?php if ($isCoMakerQuickView): ?>
                            <div class="portal-quick-view__meta-card">
                                <span class="portal-quick-view__meta-label">Primary beneficiary</span>
                                <strong><?= htmlspecialchars((string) (($portalQuickView['primaryBeneficiaryName'] ?? '') ?: 'Linked beneficiary'), ENT_QUOTES) ?></strong>
                            </div>
                            <div class="portal-quick-view__meta-card">
                                <span class="portal-quick-view__meta-label">Relationship</span>
                                <strong><?= htmlspecialchars((string) (($portalQuickView['relationshipToPrimaryBeneficiary'] ?? '') ?: 'Not set'), ENT_QUOTES) ?></strong>
                            </div>
                            <div class="portal-quick-view__meta-card">
                                <span class="portal-quick-view__meta-label">Access type</span>
                                <strong>Repayment only</strong>
                            </div>
                            <?php else: ?>
                            <div class="portal-quick-view__meta-card">
                                <span class="portal-quick-view__meta-label">Current step</span>
                                <strong><?= htmlspecialchars((string) ($portalQuickView['currentStepLabel'] ?? ''), ENT_QUOTES) ?></strong>
                            </div>
                            <div class="portal-quick-view__meta-card">
                                <span class="portal-quick-view__meta-label">Progress</span>
                                <strong><?= (int) ($portalQuickView['progressPercent'] ?? 0) ?>%</strong>
                            </div>
                            <div class="portal-quick-view__meta-card">
                                <span class="portal-quick-view__meta-label">Reference ID</span>
                                <strong><?= htmlspecialchars((string) (($portalQuickView['reference'] ?? null) ?: 'Not available yet'), ENT_QUOTES) ?></strong>
                            </div>
                            <?php endif; ?>
                        </div>

                        <p class="portal-quick-view__helper"><?= htmlspecialchars((string) ($portalQuickView['helperText'] ?? ''), ENT_QUOTES) ?></p>

                        <a class="auth-submit portal-quick-view__action" href="<?= $baseUrl ?>/<?= htmlspecialchars(ltrim((string) ($portalQuickView['actionPath'] ?? 'applicant-dashboard'), '/'), ENT_QUOTES) ?>">
                            <?= htmlspecialchars((string) ($portalQuickView['actionLabel'] ?? 'Open Dashboard'), ENT_QUOTES) ?>
                        </a>
                    </aside>
                    <?php endif; ?>
                </div>
            </section>

            <div class="portal-home-content">
                <section class="content-section portal-section" aria-labelledby="portal-readiness">
                    <div class="container">
                        <div class="portal-section__head">
                            <span class="section-kicker">Start Here</span>
                            <h2 id="portal-readiness" class="section-title">Understand the current SMART LEAP process before you apply.</h2>
                            <p class="portal-section__lead">The public portal now has one clear flow: Stage 1 registration, email-code verification, Admin batch review, applicant portal activation for selected registrants, then the same account continues later for training and beneficiary records.</p>
                        </div>

                        <div class="portal-fact-strip">
                            <article class="portal-fact-card">
                                <span class="portal-fact-card__label">Public start</span>
                                <strong>Stage 1 registration</strong>
                                <p>Submit your personal details, business details, valid ID, profile photo, and existing business photo first.</p>
                            </article>
                            <article class="portal-fact-card">
                                <span class="portal-fact-card__label">Before Admin review</span>
                                <strong>Email-code verification</strong>
                                <p>Your registration enters the queue only after the six-digit code sent to your email is accepted.</p>
                            </article>
                            <article class="portal-fact-card">
                                <span class="portal-fact-card__label">Same account later</span>
                                <strong>Applicant to beneficiary</strong>
                                <p>If you move forward in the program, the same portal account continues for training, notices, and repayments.</p>
                            </article>
                        </div>

                        <div class="content-grid portal-grid--three">
                            <article class="content-card portal-rich-card">
                                <span class="portal-rich-card__eyebrow">Who can register</span>
                                <h3>For Butuan City livelihood applicants</h3>
                                <ul class="content-list">
                                    <li>Residents of Butuan City with an existing microbusiness or livelihood activity.</li>
                                    <li>Applicants ready to provide accurate personal, contact, address, and business details.</li>
                                    <li>Users who can monitor notices and complete any follow-up steps inside the portal.</li>
                                </ul>
                            </article>
                            <article class="content-card portal-rich-card">
                                <span class="portal-rich-card__eyebrow">Prepare first</span>
                                <h3>What to have ready</h3>
                                <ul class="content-list">
                                    <li>An active email address that you can access during verification and later notices.</li>
                                    <li>A profile photo, one clear valid ID file, and one clear photo of your existing business.</li>
                                    <li>Your complete address, barangay, contact number, and microbusiness details.</li>
                                </ul>
                            </article>
                            <article class="content-card portal-rich-card">
                                <span class="portal-rich-card__eyebrow">After submission</span>
                                <h3>What happens next</h3>
                                <ul class="content-list">
                                    <li>Admin reviews who will be placed in the current yearly batch and who may wait for the next batch.</li>
                                    <li>Selected registrants receive the official portal password setup link by email.</li>
                                    <li>The applicant portal later shows notices, training updates, and beneficiary continuation steps.</li>
                                </ul>
                            </article>
                        </div>
                    </div>
                </section>

            </div>

        </main>
        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>
    </div>

    <div class="auth-loading-screen" id="authLoadingScreen" hidden aria-live="polite" aria-label="Loading">
        <div class="auth-loading-screen__orb" aria-hidden="true"></div>
        <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="" class="auth-loading-screen__logo">
        <strong class="auth-loading-screen__title">SMART LEAP</strong>
        <p class="auth-loading-screen__copy" id="authLoadingCopy">Securing your SMART LEAP session...</p>
    </div>

    <script src="<?= $baseUrl ?>/assets/js/public/portal.js?v=<?= urlencode((string) $portalJsVersion) ?>" defer></script>
    <script src="<?= $baseUrl ?>/assets/js/shared/ui-interactive.js?v=<?= urlencode((string) $uiInteractiveJsVersion) ?>" defer></script>
</body>
</html>
