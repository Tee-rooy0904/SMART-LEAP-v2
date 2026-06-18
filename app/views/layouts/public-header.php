<?php
declare(strict_types=1);

/** @var string $baseUrl */
$activeNav = $activeNav ?? 'home';
$isHome = $isHome ?? false;

$navLink = static function (string $label, string $href, string $key, string $extraClass = '') use ($activeNav): string {
    $activeClass = $activeNav === $key ? ' is-active' : '';

    return sprintf(
        '<a class="nav-link%s%s" href="%s">%s</a>',
        $activeClass,
        $extraClass !== '' ? ' ' . trim($extraClass) : '',
        htmlspecialchars($href, ENT_QUOTES),
        htmlspecialchars($label, ENT_QUOTES)
    );
};
?>
<header class="site-header" id="top">
    <div class="container header-shell">
        <div class="header-main">
            <a class="brand" href="<?= $baseUrl ?>/portal" aria-label="SMART LEAP home">
                <div class="brand-logo" aria-hidden="true">
                    <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="">
                </div>
                <div class="brand-copy">
                    <strong class="brand-wordmark">SMART LEAP</strong>
                </div>
            </a>

            <nav class="primary-nav" aria-label="Primary navigation">
                <?= $navLink('Home', $baseUrl . '/portal', 'home') ?>
                <?= $navLink('About SMART LEAP', $baseUrl . '/portal/about-smart-leap', 'about') ?>
                <?= $navLink('Requirements', $baseUrl . '/portal/requirements', 'requirements') ?>
                <?= $navLink('How to Apply', $baseUrl . '/portal/how-to-apply', 'apply') ?>
                <?= $navLink('Beneficiary Guide', $baseUrl . '/portal/beneficiary-guide', 'beneficiary') ?>
            </nav>

            <div class="header-actions">
                <button id="menuBtn" class="menu-btn" aria-controls="mobileNav" aria-expanded="false" aria-label="Open navigation">
                    <span class="menu-btn__line"></span>
                    <span class="menu-btn__line"></span>
                    <span class="menu-btn__line"></span>
                </button>
            </div>
        </div>

        <aside id="mobileNav" class="mobile-nav" aria-label="Mobile navigation" hidden>
            <nav class="mobile-nav__links" aria-label="Mobile primary navigation">
                <?= $navLink('Home', $baseUrl . '/portal', 'home', 'mobile-link') ?>
                <?= $navLink('About SMART LEAP', $baseUrl . '/portal/about-smart-leap', 'about', 'mobile-link') ?>
                <?= $navLink('Requirements', $baseUrl . '/portal/requirements', 'requirements', 'mobile-link') ?>
                <?= $navLink('How to Apply', $baseUrl . '/portal/how-to-apply', 'apply', 'mobile-link') ?>
                <?= $navLink('Beneficiary Guide', $baseUrl . '/portal/beneficiary-guide', 'beneficiary', 'mobile-link') ?>
            </nav>
        </aside>
    </div>
</header>
