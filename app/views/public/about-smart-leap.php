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
    <title>About SMART LEAP</title>
    <link rel="icon" type="image/png" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="apple-touch-icon" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=<?= urlencode((string) $portalStylesVersion) ?>">
</head>
<body class="portal-page portal-page--content">
    <div class="page-shell">
        <?php
        $activeNav = 'about';
        $isHome = false;
        require __DIR__ . '/../layouts/public-header.php';
        ?>

        <main class="page page--content">
            <section class="content-hero">
                <div class="container content-hero__inner">
                    <span class="section-kicker">About SMART LEAP</span>
                    <h1 class="section-title">SMART LEAP now uses one guided account journey from Stage 1 registration to later beneficiary continuation.</h1>
                    <p class="page-intro">SMART LEAP is a City Social Welfare and Development Department program for Butuan City residents with microbusiness or livelihood activities. The current system starts with public Stage 1 registration, then selected registrants activate a private applicant portal, and the same account later continues into beneficiary use when they move forward in the program.</p>
                </div>
            </section>

            <section class="content-section portal-section">
                <div class="container">
                    <div class="portal-fact-strip">
                        <article class="portal-fact-card">
                            <span class="portal-fact-card__label">Public entry</span>
                            <strong>Stage 1 registration first</strong>
                            <p>The process begins on the public portal, not inside a private dashboard.</p>
                        </article>
                        <article class="portal-fact-card">
                            <span class="portal-fact-card__label">Private access later</span>
                            <strong>Applicant portal by invitation</strong>
                            <p>Only selected current-batch registrants receive the secure password setup link.</p>
                        </article>
                        <article class="portal-fact-card">
                            <span class="portal-fact-card__label">Same account later</span>
                            <strong>Beneficiary continuation</strong>
                            <p>Application history, training, and later repayment records stay connected in one account.</p>
                        </article>
                    </div>
                </div>
            </section>

            <section class="content-section portal-section">
                <div class="container content-grid portal-grid--three">
                    <article class="content-card portal-rich-card">
                        <span class="portal-rich-card__eyebrow">Program overview</span>
                        <h2>What SMART LEAP is</h2>
                        <p>SMART LEAP stands for Sustainable Market and Technology Driven Livelihood and Employment Assistance Program. It is designed to help qualified Butuan City residents strengthen microbusinesses or livelihood activities through a more organized CSWDD process.</p>
                    </article>
                    <article class="content-card portal-rich-card">
                        <span class="portal-rich-card__eyebrow">Current portal flow</span>
                        <h2>How the system now works</h2>
                        <ul class="content-list">
                            <li>Public users start with one complete Stage 1 registration and email-code verification.</li>
                            <li>Admin reviews registrants for yearly batch placement and applicant portal activation.</li>
                            <li>The same account later stays active for training, notices, beneficiary updates, and repayments.</li>
                        </ul>
                    </article>
                    <article class="content-card portal-rich-card">
                        <span class="portal-rich-card__eyebrow">Possible support</span>
                        <h2>What qualified users may reach</h2>
                        <ul class="content-list">
                            <li>Structured applicant review and follow-up notices inside the portal.</li>
                            <li>Training scheduling and attendance tracking for those who move forward.</li>
                            <li>Possible assistance worth up to PHP 15,000 and repayment monitoring at PHP 625 per month for 24 months.</li>
                        </ul>
                    </article>
                </div>
            </section>

            <section class="content-section portal-section portal-section--soft">
                <div class="container portal-support-strip">
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">Who should use it</span>
                        <h3>Applicants and later beneficiaries</h3>
                        <p>Use the public portal if you are preparing your Stage 1 registration, and use the same private account later if you are selected and activated for applicant or beneficiary access.</p>
                    </article>
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">Important reminder</span>
                        <h3>Approval is not automatic</h3>
                        <p>Submitting Stage 1 does not instantly create private portal access. Activation happens only after Admin batch review and official notice.</p>
                    </article>
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">Special access case</span>
                        <h3>Co-maker accounts are different</h3>
                        <p>Co-maker access is used only for repayment continuation linked to a deceased primary beneficiary. It does not replace the full applicant workflow.</p>
                    </article>
                </div>
            </section>
        </main>

        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>
    </div>

    <script src="<?= $baseUrl ?>/assets/js/public/portal.js?v=<?= urlencode((string) $portalJsVersion) ?>" defer></script>
</body>
</html>
