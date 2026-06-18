<?php /** @var string $baseUrl */ ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About SMART LEAP</title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=44">
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
                    <h1 class="section-title">SMART LEAP helps Butuan City microbusiness owners move from application to program support through one guided portal.</h1>
                    <p class="page-intro">SMART LEAP is a City Social Welfare and Development Department program for Butuan City residents who are running or preparing a microbusiness or livelihood activity. The portal helps applicants prepare requirements, receive review updates, complete post-approval steps, and continue later beneficiary records in one official workspace.</p>
                </div>
            </section>

            <section class="content-section">
                <div class="container content-grid portal-grid--three">
                    <article class="content-card">
                        <h2>What SMART LEAP means</h2>
                        <p>SMART LEAP stands for Sustainable Market and Technology Driven Livelihood and Employment Assistance Program. It is designed to help qualified Butuan City residents strengthen small livelihood activities, with eligible approved applicants moving forward to assistance worth up to PHP 15,000 and a monitored 24-month repayment schedule.</p>
                    </article>
                    <article class="content-card">
                        <h2>Program purpose</h2>
                        <ul class="content-list">
                            <li>Support eligible residents who are operating or preparing to improve microbusinesses and livelihood activities.</li>
                            <li>Provide a structured path toward possible assistance worth up to PHP 15,000 for qualified approved applicants.</li>
                            <li>Help applicants follow a clearer and traceable CSWDD review process.</li>
                            <li>Guide approved applicants and later beneficiaries through training, documentation, proof uploads, and repayment monitoring at PHP 625 per month for 24 months.</li>
                            <li>Keep official notices and reviewer remarks inside one secure portal account.</li>
                        </ul>
                    </article>
                    <article class="content-card">
                        <h2>Who can use the portal</h2>
                        <ul class="content-list">
                            <li>Residents of Butuan City who operate microbusinesses or livelihood activities and need SMART LEAP program support.</li>
                            <li>Applicants preparing to submit complete personal, business, and document requirements for CSWDD review.</li>
                            <li>Approved applicants who continue using the same portal account for training, repayment monitoring, and later beneficiary records when they move forward in the program.</li>
                            <li>Users who need official notices, program guidance, reviewer remarks, or record updates from the SMART LEAP team.</li>
                        </ul>
                    </article>
                    <article class="content-card">
                        <h2>What to prepare first</h2>
                        <ul class="content-list">
                            <li>A valid email address that you can check regularly.</li>
                            <li>Clear copies of the files you plan to upload.</li>
                            <li>Accurate personal details that match your records.</li>
                            <li>A current barangay clearance and other local records required during application review.</li>
                            <li>Basic information about your microbusiness or livelihood activity, including name, type, location, and current status.</li>
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
