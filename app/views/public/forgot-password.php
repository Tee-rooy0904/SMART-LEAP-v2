<?php /** @var string $baseUrl */ ?>
<?php
$email = (string) ($email ?? '');
$entryPoint = (string) ($entryPoint ?? 'portal');
$faviconVersion = @filemtime(base_path('public/assets/img/logo-mark.png')) ?: time();
$backToSignInHref = $entryPoint === 'staff' ? $baseUrl . '/login' : $baseUrl . '/portal/login';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Forgot Password</title>
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
                    <section class="auth-card portal-login-card portal-login-card--recovery" aria-labelledby="forgotPasswordHeading">
                        <div class="auth-card__panel">
                            <div class="auth-card__panel-content">
                                <span class="auth-card__panel-tag">Account recovery</span>
                                <h3 class="auth-card__panel-title">Reset your SMART LEAP password safely</h3>
                                <p class="auth-card__panel-note">Use your registered email address and we will send a one-time reset code that expires in 20 minutes.</p>

                                <div class="auth-card__recovery-steps" aria-label="Password recovery steps">
                                    <article class="auth-card__recovery-step">
                                        <span class="auth-card__recovery-index">1</span>
                                        <div>
                                            <strong>Confirm your email</strong>
                                            <p>Use the same email connected to your applicant, beneficiary, or staff account.</p>
                                        </div>
                                    </article>
                                    <article class="auth-card__recovery-step">
                                        <span class="auth-card__recovery-index">2</span>
                                        <div>
                                            <strong>Check your inbox</strong>
                                            <p>SMART LEAP will send a secure six-digit code for this recovery request.</p>
                                        </div>
                                    </article>
                                    <article class="auth-card__recovery-step">
                                        <span class="auth-card__recovery-index">3</span>
                                        <div>
                                            <strong>Create a new password</strong>
                                            <p>After verification, set a fresh password and return to sign in normally.</p>
                                        </div>
                                    </article>
                                </div>

                                <div class="auth-card__panel-highlights" aria-hidden="true">
                                    <span>20-minute code</span>
                                    <span>Secure recovery</span>
                                    <span>No office visit needed</span>
                                </div>
                            </div>
                        </div>

                        <div class="auth-card__form">
                            <div class="auth-card__top">
                                <span class="auth-card__eyebrow">Need access again?</span>
                                <h2 id="forgotPasswordHeading">Reset password</h2>
                                <p>Enter your registered email below. We will send a recovery code so you can continue to the password reset page.</p>
                            </div>

                            <form id="forgotPasswordForm" class="login-form" novalidate>
                                <input type="hidden" name="entryPoint" value="<?= htmlspecialchars($entryPoint, ENT_QUOTES) ?>">
                                <label class="field field--icon">
                                    <span>Email address</span>
                                    <span class="field__icon" aria-hidden="true">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                    </span>
                                    <input type="email" id="email" name="email" value="<?= htmlspecialchars($email, ENT_QUOTES) ?>" autocomplete="email" placeholder="your@email.com" required>
                                </label>
                                <p class="small-note">Make sure this matches the email used during portal registration or staff account setup.</p>
                                <p class="auth-feedback" id="forgotPasswordFeedback" role="alert" hidden></p>
                                <button type="submit" class="auth-submit" id="forgotPasswordSubmit">
                                    <span class="auth-submit__text">Send reset code</span>
                                    <span class="auth-submit__spinner" hidden>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" stroke-linecap="round"/></svg>
                                    </span>
                                </button>
                                <p class="auth-card__security">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    Recovery requests are sent through a secure, encrypted connection.
                                </p>
                                <p class="auth-card__subaction"><a class="text-link" href="<?= htmlspecialchars($backToSignInHref, ENT_QUOTES) ?>">Back to sign in</a></p>
                            </form>
                        </div>
                    </section>
                </div>
            </section>
        </main>

        <?php $publicFooterVariant = 'flow'; ?>
        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>
    </div>
    <script>
    (() => {
        const form = document.getElementById('forgotPasswordForm');
        const submit = document.getElementById('forgotPasswordSubmit');
        const feedback = document.getElementById('forgotPasswordFeedback');
        const publicBase = () => {
            const match = window.location.pathname.match(/^(.*\/public)(?:\/.*)?$/);
            return match ? match[1] : '';
        };
        const routeUrl = (path) => `${publicBase()}/${String(path || '').replace(/^\/+/, '')}`;
        const showAlert = (message, type) => {
            if (!feedback) {
                return;
            }
            feedback.textContent = message;
            feedback.dataset.tone = type === 'success' ? 'success' : 'danger';
            feedback.hidden = false;
        };
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (feedback) {
                feedback.hidden = true;
                feedback.textContent = '';
            }
            submit?.classList.add('is-loading');
            const spinner = submit?.querySelector('.auth-submit__spinner');
            if (spinner) {
                spinner.hidden = false;
            }
            if (submit) {
                submit.disabled = true;
            }
            try {
                const response = await fetch(routeUrl('auth/forgot-password'), {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    },
                    credentials: 'same-origin',
                    body: new URLSearchParams(new FormData(form)).toString(),
                });
                const payload = await response.json();
                if (!response.ok || !payload.ok) {
                    showAlert(payload.message || 'Unable to send reset code.', 'danger');
                    return;
                }
                showAlert(payload.message || 'Password reset code sent.', 'success');
                window.setTimeout(() => {
                    window.location.href = routeUrl(payload.redirect || 'reset-password');
                }, 700);
            } catch (error) {
                showAlert('Unable to send reset code right now.', 'danger');
            } finally {
                submit?.classList.remove('is-loading');
                if (spinner) {
                    spinner.hidden = true;
                }
                if (submit) {
                    submit.disabled = false;
                }
            }
        });
    })();
    </script>
</body>
</html>
