<?php /** @var string $baseUrl */ ?>
/**
 * SMART LEAP FILE GUIDE
 * Public portal view for h el p.
 * Defines one public-facing SMART LEAP page used before or outside the private applicant or beneficiary dashboards.
 */
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP Help</title>
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
                        <a class="nav-link" href="<?= $baseUrl ?>/portal/how-it-works">How It Works</a>
                        <a class="nav-link is-active" href="<?= $baseUrl ?>/portal/help">Tabang</a>
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
                    <a class="mobile-link" href="<?= $baseUrl ?>/portal/how-it-works">How It Works</a>
                    <a class="mobile-link is-active" href="<?= $baseUrl ?>/portal/help">Tabang</a>
                </div>
            </div>
        </header>

        <main class="page page--content">
            <section class="content-hero">
                <div class="container content-hero__inner">
                    <span class="section-kicker">Tabang</span>
                    <h1 class="section-title">Get official help for account access, portal questions, and SMART LEAP guidance.</h1>
                    <p class="page-intro">Gamita ang sakto nga support channel depende kung ang imong concern bahin sa access, giya, o opisyal nga program follow-up.</p>
                </div>
            </section>
            <section class="content-section">
                <div class="container content-grid">
                    <button class="content-card interactive-card is-open" type="button" data-accordion-trigger aria-expanded="true">
                        <span class="interactive-card__header">
                            <span>
                                <h2>SMART LEAP Suporta Desk</h2>
                                <span class="interactive-card__summary">General public portal questions and service guidance.</span>
                            </span>
                            <span class="interactive-card__icon" aria-hidden="true">+</span>
                        </span>
                        <span class="interactive-card__body" data-accordion-panel>
                            <span class="interactive-card__text">Gamita kini nga kontak para sa general public portal questions ug service guidance.</span>
                            <a href="mailto:cswdd@butuan.gov.ph">cswdd@butuan.gov.ph</a>
                        </span>
                    </button>
                    <button class="content-card interactive-card" type="button" data-accordion-trigger aria-expanded="false">
                        <span class="interactive-card__header">
                            <span>
                                <h2>Giya sa Assigned PDO</h2>
                                <span class="interactive-card__summary">Aplikasyon progress clarification and next-step guidance.</span>
                            </span>
                            <span class="interactive-card__icon" aria-hidden="true">+</span>
                        </span>
                        <span class="interactive-card__body" data-accordion-panel hidden>
                            <span class="interactive-card__text">Gamita kini nga channel kung kinahanglan nimo ug klaripikasyon bahin sa application progress o opisyal nga next-step guidance.</span>
                            <a href="mailto:socialworker@smartleap.gov.ph">socialworker@smartleap.gov.ph</a>
                        </span>
                    </button>
                    <button class="content-card interactive-card" type="button" data-accordion-trigger aria-expanded="false">
                        <span class="interactive-card__header">
                            <span>
                                <h2>Tabang sa Account</h2>
                                <span class="interactive-card__summary">Sign-in problems, verification issues, and email concerns.</span>
                            </span>
                            <span class="interactive-card__icon" aria-hidden="true">+</span>
                        </span>
                        <span class="interactive-card__body" data-accordion-panel hidden>
                            <span class="interactive-card__text">Gamita ang imong registered email kung mangayo ug tabang sa sign-in problems, verification issues, ug account access concerns.</span>
                        </span>
                    </button>
                    <button class="content-card interactive-card" type="button" data-accordion-trigger aria-expanded="false">
                        <span class="interactive-card__header">
                            <span>
                                <h2>Portal Questions</h2>
                                <span class="interactive-card__summary">Unsa ang angay andamon, where to click, and how to continue.</span>
                            </span>
                            <span class="interactive-card__icon" aria-hidden="true">+</span>
                        </span>
                        <span class="interactive-card__body" data-accordion-panel hidden>
                            <span class="interactive-card__text">Gamita kini nga seksyon kung kinahanglan nimo ug tabang kung asa mopislit, unsay andamon, ug unsaon pagpadayon sa portal. Bantayi ang imong email ug portal notices para sa opisyal nga updates.</span>
                        </span>
                    </button>
                </div>
            </section>
        </main>
    </div>

    <script src="<?= $baseUrl ?>/assets/js/public/portal.js?v=18" defer></script>
</body>
</html>
