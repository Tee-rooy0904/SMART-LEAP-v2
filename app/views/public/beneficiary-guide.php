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
    <title>SMART LEAP Beneficiary Guide</title>
    <link rel="icon" type="image/png" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="apple-touch-icon" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=<?= urlencode((string) $portalStylesVersion) ?>">
</head>
<body class="portal-page portal-page--content">
    <div class="page-shell">
        <?php
        $activeNav = 'beneficiary';
        $isHome = false;
        require __DIR__ . '/../layouts/public-header.php';
        ?>

        <main class="page page--content">
            <section class="content-hero">
                <div class="container content-hero__inner">
                    <span class="section-kicker">Beneficiary Guide</span>
                    <h1 class="section-title">The same SMART LEAP account continues after applicant approval into training, beneficiary updates, and repayment monitoring.</h1>
                    <p class="page-intro">Applicants do not lose their earlier records when they become beneficiaries. The current system keeps the same account, so application progress, training activity, notices, and later repayment records stay connected in one place.</p>
                </div>
            </section>

            <section class="content-section portal-section">
                <div class="container portal-fact-strip">
                    <article class="portal-fact-card">
                        <span class="portal-fact-card__label">Same account</span>
                        <strong>Application history stays visible</strong>
                        <p>Your earlier applicant records and training information remain part of the same portal account.</p>
                    </article>
                    <article class="portal-fact-card">
                        <span class="portal-fact-card__label">Repayment access</span>
                        <strong>Available once beneficiary records are active</strong>
                        <p>The repayments area becomes part of your portal when the beneficiary side of your record is already in use.</p>
                    </article>
                    <article class="portal-fact-card">
                        <span class="portal-fact-card__label">Office review</span>
                        <strong>Uploads can still need correction</strong>
                        <p>Beneficiary records, proof uploads, and repayment submissions may still return with reviewer remarks when something is incomplete.</p>
                    </article>
                </div>
            </section>

            <section class="content-section portal-section">
                <div class="container content-grid portal-grid--three">
                    <article class="content-card portal-rich-card">
                        <span class="portal-rich-card__eyebrow">Training</span>
                        <h2>Training schedules and attendance</h2>
                        <ul class="content-list">
                            <li>Watch your notices for official training schedules, session details, and instructions.</li>
                            <li>Attend the required sessions connected to your group and current training round.</li>
                            <li>Your attendance and completion history remain visible in the same account.</li>
                        </ul>
                    </article>
                    <article class="content-card portal-rich-card">
                        <span class="portal-rich-card__eyebrow">Beneficiary continuation</span>
                        <h2>Post-approval records</h2>
                        <ul class="content-list">
                            <li>Check portal notices for any next step after approval, training, or assistance release.</li>
                            <li>Keep your account details and livelihood information updated when needed.</li>
                            <li>Your applicant-side history is still visible even after your beneficiary side is active.</li>
                        </ul>
                    </article>
                    <article class="content-card portal-rich-card">
                        <span class="portal-rich-card__eyebrow">Repayment monitoring</span>
                        <h2>Proof uploads and verification</h2>
                        <ul class="content-list">
                            <li>Use the repayments area to upload official proof and monitor review results.</li>
                            <li>Partially verified means the upload passed initial review but still lacks final office confirmation.</li>
                            <li>Fully verified means the office has confirmed the complete submission for that repayment record.</li>
                        </ul>
                    </article>
                </div>
            </section>

            <section class="content-section portal-section portal-section--soft">
                <div class="container portal-support-strip">
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">Best practice</span>
                        <h3>Keep checking notices</h3>
                        <p>Training updates, reviewer remarks, and repayment guidance appear in the portal, so regular sign-in matters even after approval.</p>
                    </article>
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">Repayment review</span>
                        <h3>Upload clear official proof</h3>
                        <p>Readable OR or payment proof files help PDO and Admin verify your submission faster and reduce correction requests.</p>
                    </article>
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">Special case</span>
                        <h3>Co-maker access is repayment-only</h3>
                        <p>If a co-maker account is later issued for a deceased beneficiary case, that separate access is for repayment continuation only.</p>
                    </article>
                </div>
            </section>
        </main>

        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>
    </div>

    <script src="<?= $baseUrl ?>/assets/js/public/portal.js?v=<?= urlencode((string) $portalJsVersion) ?>" defer></script>
</body>
</html>
