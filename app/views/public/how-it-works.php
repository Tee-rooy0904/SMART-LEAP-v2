<?php /** @var string $baseUrl */ ?>
/**
 * SMART LEAP FILE GUIDE
 * Public portal view for h ow i t w or ks.
 * Defines one public-facing SMART LEAP page used before or outside the private applicant or beneficiary dashboards.
 */
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>How SMART LEAP Works</title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=44">
</head>
<body class="portal-page">
    <div class="page-shell">
        <header class="site-header">
            <div class="container header-shell">
                <div class="header-main">
                    <a class="brand" href="<?= $baseUrl ?>/portal">
                        <div class="brand-logo" aria-hidden="true"><img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt=""></div>
                        <div class="brand-copy"><strong class="brand-wordmark">SMART LEAP</strong></div>
                    </a>
                    <nav class="primary-nav" aria-label="Pangunang nabigasyon">
                        <a class="nav-link" href="<?= $baseUrl ?>/portal">Home</a>
                        <a class="nav-link" href="<?= $baseUrl ?>/portal/guide">Guide</a>
                        <a class="nav-link" href="<?= $baseUrl ?>/portal/requirements">Mga Kinahanglanon</a>
                        <a class="nav-link is-active" href="<?= $baseUrl ?>/portal/how-it-works">How It Works</a>
                        <a class="nav-link" href="<?= $baseUrl ?>/portal/help">Tabang</a>
                    </nav>
                    <div class="header-actions">
                        <a class="header-action header-action--ghost" href="<?= $baseUrl ?>/signup">Create Account</a>
                        <a class="header-action header-action--solid" href="<?= $baseUrl ?>/portal">Sign In</a>
                        <button id="menuBtn" class="menu-btn" aria-controls="mobileNav" aria-expanded="false" aria-label="Ablihi ang nabigasyon"><span class="menu-btn__line"></span><span class="menu-btn__line"></span><span class="menu-btn__line"></span></button>
                    </div>
                </div>
                <div id="mobileNav" class="mobile-nav" hidden>
                    <a class="mobile-link" href="<?= $baseUrl ?>/portal">Home</a>
                    <a class="mobile-link" href="<?= $baseUrl ?>/portal/guide">Guide</a>
                    <a class="mobile-link" href="<?= $baseUrl ?>/portal/requirements">Mga Kinahanglanon</a>
                    <a class="mobile-link is-active" href="<?= $baseUrl ?>/portal/how-it-works">How It Works</a>
                    <a class="mobile-link" href="<?= $baseUrl ?>/portal/help">Tabang</a>
                </div>
            </div>
        </header>

        <main class="page page--content">
            <section class="content-hero">
                <div class="container content-hero__inner">
                    <span class="section-kicker">How it works</span>
                    <h1 class="section-title">Follow the SMART LEAP service flow from public registration to beneficiary continuation.</h1>
                    <p class="page-intro">This page explains the SMART LEAP flow: one complete Stage 1 application first, then private applicant portal activation for batch-approved registrants.</p>
                </div>
            </section>
            <section class="content-section">
                <div class="container timeline-list">
                    <article class="timeline-item is-active" tabindex="0" data-timeline-item data-detail-title="Stage 1 Public Registration" data-detail-copy="Start from the public portal by submitting your full applicant profile, demographic details, valid ID, and proof of existing microbusiness."><span class="timeline-item__number">1</span><div><h2>Stage 1 Public Registration</h2><p>Submit your full applicant profile and initial proof files.</p></div></article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Admin Batch Validation" data-detail-copy="CSWDD reviews Stage 1 registrants and validates who can move into the active SMART LEAP batch."><span class="timeline-item__number">2</span><div><h2>Admin Batch Validation</h2><p>CSWDD reviews Stage 1 registrants for batch selection.</p></div></article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Current Batch or Next Batch" data-detail-copy="Selected registrants proceed to the current batch, while others may be saved for the next batch when the active batch is already full."><span class="timeline-item__number">3</span><div><h2>Current Batch or Next Batch</h2><p>Validated registrants are assigned either to the active batch or the next one.</p></div></article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Account Activation Email" data-detail-copy="If selected for the current batch, you receive an official email notice with the secure link to activate your private applicant portal account."><span class="timeline-item__number">4</span><div><h2>Account Activation Email</h2><p>Selected registrants receive the secure activation link through email.</p></div></article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Activate Applicant Portal Account" data-detail-copy="Batch-approved registrants verify their email, set their password, and enter the private SMART LEAP applicant portal using the official invitation."><span class="timeline-item__number">5</span><div><h2>Activate Applicant Portal Account</h2><p>Verify your email, set your password, and enter the private applicant portal.</p></div></article>
                    <article class="timeline-item" tabindex="0" data-timeline-item data-detail-title="Track Application Progress" data-detail-copy="Inside the private applicant portal, monitor status updates, respond to follow-up requirements, and check training schedules and official notices."><span class="timeline-item__number">6</span><div><h2>Track Application Progress</h2><p>Monitor status, respond to follow-up requirements, and check your training schedules inside the portal.</p></div></article>
                </div>
            </section>
        </main>
    </div>

    <script src="<?= $baseUrl ?>/assets/js/public/portal.js?v=18" defer></script>
</body>
</html>
