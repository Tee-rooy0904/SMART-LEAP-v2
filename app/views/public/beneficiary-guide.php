<?php /** @var string $baseUrl */ ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP Beneficiary Guide</title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=44">
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
                    <h1 class="section-title">Approved applicants use the same portal for training, repayment monitoring, and the next steps before full beneficiary continuation.</h1>
                    <p class="page-intro">This guide explains what happens after approval, including the possible SMART LEAP assistance package worth up to PHP 15,000, training requirements, repayment records, and the later records continued in the same portal.</p>
                </div>
            </section>

            <section class="content-section">
                <div class="container content-grid portal-grid--three">
                    <article class="content-card">
                        <h2>Training and attendance</h2>
                        <ul class="content-list">
                            <li>Watch for the official training schedule and portal notices.</li>
                            <li>Attend the sessions required by the program.</li>
                            <li>Check attendance updates and completion status in the portal.</li>
                        </ul>
                    </article>
                    <article class="content-card">
                        <h2>Proof upload and record updates</h2>
                        <ul class="content-list">
                            <li>Check the portal for required post-approval steps and official notices.</li>
                            <li>Upload clear and complete receipt or proof files.</li>
                            <li>Follow reviewer notes when a record needs correction.</li>
                        </ul>
                    </article>
                    <article class="content-card">
                        <h2>Repayment and verification</h2>
                        <ul class="content-list">
                            <li>Use the repayments area for official review and payment tracking.</li>
                            <li>Partially verified means the office accepted the upload but the record is not yet complete.</li>
                            <li>Fully verified means the submission has met the office confirmation requirements for that record.</li>
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
