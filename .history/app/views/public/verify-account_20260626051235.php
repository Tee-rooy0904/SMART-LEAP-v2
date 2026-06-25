<?php /** @var string $baseUrl */ ?>
<?php /** @var string $email */ ?>
<?php /** @var string $entryPoint */ ?>
<?php
$verificationEntryPoint = strtolower(trim($entryPoint ?? 'portal'));
$heading = 'Verify your SMART LEAP account';
$copy = 'Enter the six-digit code sent to your registered email. Your portal account stays inactive until verification is complete.';
$submitLabel = 'Verify account';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Verify Account</title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=44">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/signup.css?v=6">
    <script defer src="<?= $baseUrl ?>/assets/js/public/portal.js?v=18"></script>
    <script defer src="<?= $baseUrl ?>/assets/js/public/verify-account.js?v=2"></script>
</head>
<body class="portal-page portal-page--signup">
    <div class="page-shell">
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
                    <div class="header-actions">
                        <a class="header-action header-action--ghost" href="<?= $baseUrl ?>/portal">Back to Portal</a>
                    </div>
                </div>
            </div>
        </header>

        <main class="page" id="content">
            <section class="signup-page signup-page--verify">
                <div class="container signup-shell">
                    <section class="auth-card signup-card verify-card" aria-labelledby="verifyHeading">
                        <div class="auth-card__top">
                            <h2 id="verifyHeading"><?= htmlspecialchars($heading, ENT_QUOTES) ?></h2>
                            <p><?= htmlspecialchars($copy, ENT_QUOTES) ?></p>
                        </div>

                        <form id="verifyAccountForm" novalidate>
                            <input type="hidden" id="verifyEntryPoint" name="entryPoint" value="<?= htmlspecialchars($verificationEntryPoint, ENT_QUOTES) ?>">
                            <label class="field">
                                <span>Email address</span>
                                <input type="email" id="verifyEmail" name="email" value="<?= htmlspecialchars($email, ENT_QUOTES) ?>" autocomplete="email" required>
                                <small data-error-for="verifyEmail"></small>
                            </label>

                            <label class="field">
                                <span>Verification code</span>
                                <input type="text" id="verifyCode" name="code" inputmode="numeric" maxlength="6" placeholder="123456" required>
                                <small data-error-for="verifyCode"></small>
                            </label>

                            <div class="verify-actions">
                                <button type="submit" class="auth-submit" id="verifySubmit" data-default-label="<?= htmlspecialchars($submitLabel, ENT_QUOTES) ?>"><?= htmlspecialchars($submitLabel, ENT_QUOTES) ?></button>
                                <button type="button" class="header-action header-action--ghost verify-resend" id="resendCodeButton">Resend code</button>
                            </div>

                            <p class="auth-feedback" id="verifyFeedback" role="alert" hidden></p>
                            <p class="auth-card__subaction">
                                Already verified? <a class="text-link" href="<?= $baseUrl ?>/portal">Sign in</a>
                            </p>
                        </form>
                    </section>
                </div>
            </section>
        </main>

        <div class="auth-loading-screen" id="authLoadingScreen" hidden aria-live="polite" aria-label="Loading">
            <div class="auth-loading-screen__orb" aria-hidden="true"></div>
            <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="" class="auth-loading-screen__logo">
            <strong class="auth-loading-screen__title">SMART LEAP</strong>
            <p class="auth-loading-screen__copy" id="authLoadingCopy">Preparing your secure verification session...</p>
        </div>
    </div>
</body>
</html>
