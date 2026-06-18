<?php
declare(strict_types=1);

/** @var string $baseUrl */
/** @var array<int, array{label:string, href:string, class?:string}> $flowHeaderLinks */
$flowHeaderLinks = is_array($flowHeaderLinks ?? null) ? $flowHeaderLinks : [];
?>
<header class="site-header flow-header" id="top">
    <div class="container header-shell flow-header__shell">
        <div class="flow-header__main">
            <a class="brand" href="<?= $baseUrl ?>/portal" aria-label="SMART LEAP home">
                <div class="brand-logo" aria-hidden="true">
                    <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="">
                </div>
                <div class="brand-copy">
                    <strong class="brand-wordmark">SMART LEAP</strong>
                </div>
            </a>

            <?php if ($flowHeaderLinks !== []): ?>
                <nav class="flow-header__actions" aria-label="Page actions">
                    <?php foreach ($flowHeaderLinks as $flowHeaderLink): ?>
                        <?php
                        $flowHeaderClass = trim((string) ($flowHeaderLink['class'] ?? ''));
                        $flowHeaderClass = $flowHeaderClass === '' ? 'header-action' : 'header-action ' . $flowHeaderClass;
                        ?>
                        <a class="<?= htmlspecialchars($flowHeaderClass, ENT_QUOTES) ?>" href="<?= htmlspecialchars($flowHeaderLink['href'], ENT_QUOTES) ?>">
                            <?= htmlspecialchars($flowHeaderLink['label'], ENT_QUOTES) ?>
                        </a>
                    <?php endforeach; ?>
                </nav>
            <?php endif; ?>
        </div>
    </div>
</header>
