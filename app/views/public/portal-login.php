<?php /** @var string $baseUrl */ ?>
<?php $faviconVersion = @filemtime(base_path('public/assets/img/logo-mark.png')) ?: time(); ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Sign In</title>
    <link rel="icon" type="image/png" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="apple-touch-icon" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=<?= urlencode((string) (@filemtime(base_path('public/assets/css/public/portal.css')) ?: time())) ?>">
    <script defer src="<?= $baseUrl ?>/assets/js/public/portal.js?v=<?= urlencode((string) (@filemtime(base_path('public/assets/js/public/portal.js')) ?: time())) ?>"></script>
</head>
<body class="portal-page portal-page--login">
    <div class="page-shell">
        <?php require __DIR__ . '/../layouts/public-flow-header.php'; ?>

        <main class="page" id="content">
            <section class="portal-login-page">
                <div class="container portal-login-shell">
                    <section class="auth-card portal-login-card" aria-labelledby="portalLoginHeading">
                        <div class="auth-card__panel">
                            <div class="auth-card__panel-content">
                                <span class="auth-card__panel-tag">Applicant &amp; Beneficiary Portal</span>
                                <h3 class="auth-card__panel-title">Manage your SMART LEAP account</h3>
                                <p class="auth-card__panel-note">For approved for validation applicants and SMART LEAP beneficiaries only.</p>
                                <div class="auth-card__audience-rail" aria-label="Portal access guide">
                                    <article class="auth-card__audience-card auth-card__audience-card--applicant is-active" data-portal-audience-card="applicant">
                                        <div class="auth-card__audience-head">
                                            <span class="auth-card__audience-icon" aria-hidden="true">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a8 8 0 0 0 8-8"/><path d="M3 10a9 9 0 0 1 18 0"/><path d="M9 15h6"/><path d="M10 18h4"/><path d="M10 8a2 2 0 1 1 4 0c0 1.5-2 2-2 4"/></svg>
                                            </span>
                                            <div>
                                                <strong>Applicant access</strong>
                                                <p>For approved-for-validation applicants continuing their requirements and application progress.</p>
                                            </div>
                                        </div>
                                        <ul class="auth-card__audience-list">
                                            <li>Upload missing requirements and corrections</li>
                                            <li>Track your validation, review, and training status</li>
                                            <li>Read notices before moving to beneficiary status</li>
                                        </ul>
                                    </article>

                                    <article class="auth-card__audience-card auth-card__audience-card--beneficiary" data-portal-audience-card="beneficiary">
                                        <div class="auth-card__audience-head">
                                            <span class="auth-card__audience-icon" aria-hidden="true">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 11l2 2 4-4"/></svg>
                                            </span>
                                            <div>
                                                <strong>Beneficiary access</strong>
                                                <p>For active SMART LEAP beneficiaries managing updates, notices, and repayment-related records.</p>
                                            </div>
                                        </div>
                                        <ul class="auth-card__audience-list">
                                            <li>View your beneficiary status and official updates</li>
                                            <li>Open repayment records and upload proof when needed</li>
                                            <li>Keep your account and livelihood information current</li>
                                        </ul>
                                    </article>
                                </div>

                                <div class="auth-card__panel-highlights" aria-hidden="true">
                                    <span>Progress tracking</span>
                                    <span>Document uploads</span>
                                    <span>Official notices</span>
                                </div>
                            </div>
                        </div>

                        <div class="auth-card__form">
                            <div class="auth-card__top">
                                <span class="auth-card__eyebrow">Welcome back</span>
                                <h2 id="portalLoginHeading">Sign in</h2>
                                <p class="auth-card__eligibility">For approved for validation applicants and SMART LEAP beneficiaries only.</p>
                            </div>

                            <form id="loginForm" class="login-form" novalidate>
                                <input type="hidden" name="entryPoint" value="portal">

                                <label class="field field--icon">
                                    <span>Email address</span>
                                    <span class="field__icon" aria-hidden="true">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                    </span>
                                    <input type="email" id="email" name="email" autocomplete="email" placeholder="your@email.com" required>
                                </label>

                                <label class="field field--icon">
                                    <span>Password</span>
                                    <span class="field__icon" aria-hidden="true">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    </span>
                                    <div class="field__secure">
                                        <input type="password" id="password" name="password" placeholder="Enter your password" autocomplete="current-password" required>
                                        <button type="button" class="field-toggle toggle-visibility" id="showPassword" data-action="toggle-password" aria-label="Show password">Show</button>
                                    </div>
                                </label>

                                <div class="auth-inline-actions">
                                    <label class="checkbox-field">
                                        <input type="checkbox" id="rememberMe" name="remember">
                                        <span class="checkbox-field__label">Remember me</span>
                                    </label>
                                    <a class="text-link" href="<?= $baseUrl ?>/forgot-password?entryPoint=portal">Forgot password?</a>
                                </div>

                                <p class="auth-feedback auth-error" id="authError" role="alert" hidden></p>

                                <button type="submit" class="auth-submit" id="signInBtn">
                                    <span class="auth-submit__text">Sign in</span>
                                    <span class="auth-submit__spinner" hidden>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" stroke-linecap="round"/></svg>
                                    </span>
                                </button>

                                <p class="auth-card__security">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    Secure, encrypted connection
                                </p>
                            </form>
                        </div>
                    </section>
                </div>
            </section>
        </main>

        <?php $publicFooterVariant = 'flow'; ?>
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
