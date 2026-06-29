<?php /** @var string $baseUrl */ ?>
<?php /** @var array $requirements */ ?>
<?php
$portalStylesVersion = @filemtime(base_path('public/assets/css/public/portal.css')) ?: time();
$portalJsVersion = @filemtime(base_path('public/assets/js/public/portal.js')) ?: time();
$faviconVersion = @filemtime(base_path('public/assets/img/logo-mark.png')) ?: time();
$followUpRequirements = [];
if ($requirements !== []) {
    foreach ($requirements as $requirement) {
        $label = trim((string) ($requirement->attributes['label'] ?? ''));
        if ($label === '' || stripos($label, 'endorsement') !== false) {
            continue;
        }
        $followUpRequirements[] = [
            'label' => $label,
            'description' => trim((string) ($requirement->attributes['description'] ?? ''))
        ];
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP Requirements</title>
    <link rel="icon" type="image/png" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="apple-touch-icon" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=<?= urlencode((string) $portalStylesVersion) ?>">
</head>
<body class="portal-page portal-page--content">
    <div class="page-shell">
        <?php
        $activeNav = 'requirements';
        $isHome = false;
        require __DIR__ . '/../layouts/public-header.php';
        ?>

        <main class="page page--content">
            <section class="content-hero">
                <div class="container content-hero__inner">
                    <span class="section-kicker">Requirements</span>
                    <h1 class="section-title">Prepare the right files for Stage 1 first, then watch your portal for any follow-up requirements later.</h1>
                    <p class="page-intro">The current system does not ask for every document on day one. Public Stage 1 needs the basic registration details and initial proof files first, while other items may appear later in your private portal or through reviewer notices.</p>
                </div>
            </section>

            <section class="content-section portal-section">
                <div class="container content-grid portal-grid--three">
                    <article class="content-card portal-rich-card">
                        <span class="portal-rich-card__eyebrow">Stage 1 public registration</span>
                        <h2>Required when you first apply</h2>
                        <ul class="content-list">
                            <li>One clear profile photo.</li>
                            <li>One clear photo or file of your valid ID.</li>
                            <li>One clear photo of your existing business or livelihood activity.</li>
                            <li>Your complete personal, address, contact, and business information.</li>
                        </ul>
                    </article>
                    <article class="content-card portal-rich-card">
                        <span class="portal-rich-card__eyebrow">Before you submit</span>
                        <h2>Information to prepare</h2>
                        <ul class="content-list">
                            <li>An active email address for the verification code and official notices.</li>
                            <li>Your barangay, complete address, birthdate, contact number, and basic demographic information.</li>
                            <li>Your business name and specific livelihood or microbusiness type.</li>
                        </ul>
                    </article>
                    <article class="content-card portal-rich-card">
                        <span class="portal-rich-card__eyebrow">Later in the process</span>
                        <h2>Possible follow-up requirements</h2>
                        <p class="small-note">These may appear later in the private portal or when a reviewer asks for additional support.</p>
                        <ul class="content-list">
                            <?php if ($followUpRequirements !== []): ?>
                                <?php foreach ($followUpRequirements as $requirement): ?>
                                    <li>
                                        <?= htmlspecialchars($requirement['label']) ?>
                                        <?php if ($requirement['description'] !== ''): ?>
                                            <span class="small-note"> - <?= htmlspecialchars($requirement['description']) ?></span>
                                        <?php endif; ?>
                                    </li>
                                <?php endforeach; ?>
                            <?php else: ?>
                                <li>Additional documents requested by reviewer notice.</li>
                                <li>Portal forms that open only when your record reaches the right step.</li>
                                <li>Training or post-approval proof files when applicable.</li>
                            <?php endif; ?>
                        </ul>
                    </article>
                </div>
            </section>

            <section class="content-section portal-section portal-section--soft">
                <div class="container portal-support-strip">
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">File quality</span>
                        <h3>Keep uploads readable</h3>
                        <p>Use a bright photo or clean scan. Make sure names, numbers, document edges, and dates can be read without zooming too much.</p>
                    </article>
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">Common delay</span>
                        <h3>Do not submit unclear files</h3>
                        <p>Blurry uploads, cropped IDs, and dark business photos often lead to follow-up correction notices and a slower review.</p>
                    </article>
                    <article class="portal-support-card portal-surface-card">
                        <span class="portal-support-card__label">After submission</span>
                        <h3>Keep checking your notices</h3>
                        <p>Once your private portal is activated, that is where reviewer notes, additional requirements, training updates, and beneficiary notices appear.</p>
                    </article>
                </div>
            </section>
        </main>

        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>
    </div>

    <script src="<?= $baseUrl ?>/assets/js/public/portal.js?v=<?= urlencode((string) $portalJsVersion) ?>" defer></script>
</body>
</html>
