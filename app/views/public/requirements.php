<?php /** @var string $baseUrl */ ?>
<?php /** @var array $requirements */ ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP Requirements</title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=44">
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
                    <h1 class="section-title">Prepare complete and readable files before starting your SMART LEAP application.</h1>
                    <p class="page-intro">Use this page as a checklist so you can upload clear and complete documents without delay.</p>
                </div>
            </section>

            <section class="content-section">
                <div class="container content-grid portal-grid--three">
                    <article class="content-card">
                        <h2>Prepare these first</h2>
                        <ul class="content-list">
                            <?php $renderedRequirementLabels = []; ?>
                            <?php if ($requirements !== []): ?>
                                <?php foreach ($requirements as $requirement): ?>
                                    <?php
                                        $label = (string) ($requirement->attributes['label'] ?? 'Requirement');
                                        if (stripos($label, 'endorsement') !== false) {
                                            continue;
                                        }
                                        $renderedRequirementLabels[] = $label;
                                    ?>
                                    <li>
                                        <?= htmlspecialchars($label) ?>
                                        <span class="small-note"> - <?= htmlspecialchars((string) ($requirement->attributes['description'] ?? 'Prepare this document before starting your application.')) ?></span>
                                    </li>
                                <?php endforeach; ?>
                                <?php if (!in_array('Barangay Clearance', $renderedRequirementLabels, true)): ?>
                                    <li>Barangay Clearance</li>
                                <?php endif; ?>
                            <?php else: ?>
                                <li>Valid ID</li>
                                <li>Barangay Clearance</li>
                                <li>Health Certificate</li>
                                <li>Cedula</li>
                            <?php endif; ?>
                        </ul>
                    </article>
                    <article class="content-card">
                        <h2>File quality reminders</h2>
                        <ul class="content-list">
                            <li>Use a clear scan or a bright photo.</li>
                            <li>Make sure all document edges and text are visible.</li>
                        </ul>
                    </article>
                    <article class="content-card">
                        <h2>Before you begin</h2>
                        <ul class="content-list">
                            <li>Use an active email address for official notices.</li>
                            <li>Prepare complete information before you submit.</li>
                            <li>Check the portal again for review updates, training schedules, and official notices.</li>
                        </ul>
                    </article>
                </div>
            </section>
        </main>

        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>
    </div>

    <script src="<?= $baseUrl ?>/assets/js/public/portal.js?v=18" defer></script>
</body>
</html>
