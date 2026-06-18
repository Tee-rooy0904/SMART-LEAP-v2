<?php /** @var string $baseUrl */ ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP Help Center</title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=44">
</head>
<body class="portal-page portal-page--content">
    <div class="page-shell">
        <?php
        $activeNav = 'help';
        $isHome = false;
        require __DIR__ . '/../layouts/public-header.php';
        ?>

        <main class="page page--content">
            <section class="content-hero">
                <div class="container content-hero__inner">
                    <span class="section-kicker">Help Center</span>
                    <h1 class="section-title">Get official help for sign-in, portal guidance, and SMART LEAP support.</h1>
                    <p class="page-intro">Use this page when you need a short answer, a support contact, or a reminder about the correct portal step.</p>
                </div>
            </section>

            <section class="content-section">
                <div class="container content-grid portal-grid--three">
                    <article class="content-card">
                        <h2>Sign-in help</h2>
                        <ul class="content-list">
                            <li>Use the Forgot password link if you cannot sign in.</li>
                            <li>Make sure you are using the email address tied to your account.</li>
                            <li>Check for Caps Lock if the password keeps failing.</li>
                        </ul>
                    </article>
                    <article class="content-card">
                        <h2>Portal guidance</h2>
                        <ul class="content-list">
                            <li>Use the Home page for the full public service overview.</li>
                            <li>Read the Requirements page before you upload files.</li>
                            <li>Use the Beneficiary Guide after your approval.</li>
                        </ul>
                    </article>
                        <article class="content-card">
                            <h2>Contact</h2>
                            <ul class="content-list">
                                <li>cswdd@butuan.gov.ph</li>
                                <li>Office hours: Monday to Friday, 8:00 AM to 5:00 PM</li>
                                <li>City Government of Butuan - CSWDD</li>
                            </ul>
                        </article>
                </div>
            </section>

            <section class="content-section">
                <div class="container content-stack">
                    <button class="content-card interactive-card is-open" type="button" data-accordion-trigger aria-expanded="true">
                        <span class="interactive-card__header">
                            <span>
                                <h2>How do I create an account?</h2>
                                <span class="interactive-card__summary">Use the Create Account button in the header.</span>
                            </span>
                            <span class="interactive-card__icon" aria-hidden="true">+</span>
                        </span>
                        <span class="interactive-card__body" data-accordion-panel>
                            <span class="interactive-card__text">Click Create Account, fill in your details, and use an active email address so SMART LEAP can send official notices.</span>
                        </span>
                    </button>

                    <button class="content-card interactive-card" type="button" data-accordion-trigger aria-expanded="false">
                        <span class="interactive-card__header">
                            <span>
                                <h2>What if my uploaded file is unclear?</h2>
                                <span class="interactive-card__summary">Use a clearer scan or photo and resubmit the file.</span>
                            </span>
                            <span class="interactive-card__icon" aria-hidden="true">+</span>
                        </span>
                        <span class="interactive-card__body" data-accordion-panel hidden>
                            <span class="interactive-card__text">If the reviewer asks for correction, replace the file with a clearer copy and watch the portal for the updated review state.</span>
                        </span>
                    </button>

                    <button class="content-card interactive-card" type="button" data-accordion-trigger aria-expanded="false">
                        <span class="interactive-card__header">
                            <span>
                                <h2>What happens after approval?</h2>
                                <span class="interactive-card__summary">The same portal becomes your beneficiary workspace.</span>
                            </span>
                            <span class="interactive-card__icon" aria-hidden="true">+</span>
                        </span>
                        <span class="interactive-card__body" data-accordion-panel hidden>
                            <span class="interactive-card__text">After approval, applicants continue inside the same account for training notices, repayment records, and official updates as they move into beneficiary processing.</span>
                        </span>
                    </button>
                </div>
            </section>
        </main>

        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>
    </div>

    <script src="<?= $baseUrl ?>/assets/js/public/portal.js?v=18" defer></script>
</body>
</html>
