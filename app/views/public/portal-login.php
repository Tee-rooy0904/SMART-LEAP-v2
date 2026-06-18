<?php /** @var string $baseUrl */ ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Sign In</title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=<?= urlencode((string) (@filemtime(base_path('public/assets/css/public/portal.css')) ?: time())) ?>">
    <script defer src="<?= $baseUrl ?>/assets/js/public/portal.js?v=<?= urlencode((string) (@filemtime(base_path('public/assets/js/public/portal.js')) ?: time())) ?>"></script>
</head>
<body class="portal-page portal-page--login">
    <div class="page-shell">
        <?php
        $activeNav = 'login';
        $isHome = false;
        require __DIR__ . '/../layouts/public-header.php';
        ?>

        <main class="page" id="content">
            <section class="portal-login-page">
                <div class="container portal-login-shell">
                    <section class="auth-card portal-login-card" aria-labelledby="portalLoginHeading">
                        <div class="auth-card__top">
                            <h2 id="portalLoginHeading">Sign in</h2>
                        </div>

                        <form id="loginForm" class="login-form" novalidate>
                            <input type="hidden" name="entryPoint" value="portal">

                            <label class="field">
                                <span>Email address</span>
                                <input type="email" id="email" name="email" autocomplete="email" required>
                            </label>

                            <label class="field">
                                <span>Password</span>
                                <div class="field__secure">
                                    <input type="password" id="password" name="password" placeholder="Enter your password" autocomplete="current-password" required>
                                    <button type="button" class="field-toggle toggle-visibility" id="showPassword" data-action="toggle-password" aria-label="Show password">Show</button>
                                </div>
                            </label>

                            <div class="auth-inline-actions auth-inline-actions--end">
                                <a class="text-link" href="<?= $baseUrl ?>/forgot-password?entryPoint=portal">Forgot password?</a>
                            </div>

                            <p class="auth-feedback auth-error" id="authError" role="alert" hidden></p>
                            <button type="submit" class="auth-submit" id="signInBtn">Sign in</button>
                            <p class="auth-card__subaction">Do not have an account? <a class="text-link" href="<?= $baseUrl ?>/signup">Create account</a></p>
                        </form>
                    </section>
                </div>
            </section>
        </main>

        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>

        <div class="auth-loading-screen" id="authLoadingScreen" hidden aria-live="polite" aria-label="Loading">
            <div class="auth-loading-screen__orb" aria-hidden="true"></div>
            <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="" class="auth-loading-screen__logo">
            <strong class="auth-loading-screen__title">SMART LEAP</strong>
            <p class="auth-loading-screen__copy" id="authLoadingCopy">Authorizing your SMART LEAP access...</p>
        </div>
    </div>
</body>
</html>
