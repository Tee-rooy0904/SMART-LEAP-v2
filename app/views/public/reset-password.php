<?php /** @var string $baseUrl */ ?>
<?php
$email = (string) ($email ?? '');
$entryPoint = (string) ($entryPoint ?? 'portal');
$faviconVersion = @filemtime(base_path('public/assets/img/logo-mark.png')) ?: time();
$requestNewCodeHref = $baseUrl . '/forgot-password?email=' . urlencode($email) . '&entryPoint=' . urlencode($entryPoint);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Reset Password</title>
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
                    <section class="auth-card portal-login-card portal-login-card--recovery" aria-labelledby="resetPasswordHeading">
                        <div class="auth-card__panel">
                            <div class="auth-card__panel-content">
                                <span class="auth-card__panel-tag">Final recovery step</span>
                                <h3 class="auth-card__panel-title">Create a fresh SMART LEAP password</h3>
                                <p class="auth-card__panel-note">Use the reset code from your email, choose a new password, and sign in again with the updated credentials.</p>

                                <div class="auth-card__recovery-steps" aria-label="Password reset reminders">
                                    <article class="auth-card__recovery-step">
                                        <span class="auth-card__recovery-index">1</span>
                                        <div>
                                            <strong>Enter the active code</strong>
                                            <p>The six-digit reset code only works for a limited time, so use the most recent one sent to your email.</p>
                                        </div>
                                    </article>
                                    <article class="auth-card__recovery-step">
                                        <span class="auth-card__recovery-index">2</span>
                                        <div>
                                            <strong>Choose a secure password</strong>
                                            <p>Use a password you have not used before and make it easy for you to remember but hard to guess.</p>
                                        </div>
                                    </article>
                                    <article class="auth-card__recovery-step">
                                        <span class="auth-card__recovery-index">3</span>
                                        <div>
                                            <strong>Sign in again</strong>
                                            <p>Once the reset succeeds, return to the sign-in page and continue with your updated password.</p>
                                        </div>
                                    </article>
                                </div>

                                <div class="auth-card__panel-highlights" aria-hidden="true">
                                    <span>Secure password update</span>
                                    <span>One-time code</span>
                                    <span>Fast sign-in recovery</span>
                                </div>
                            </div>
                        </div>

                        <div class="auth-card__form">
                            <div class="auth-card__top">
                                <span class="auth-card__eyebrow">Password update</span>
                                <h2 id="resetPasswordHeading">Set new password</h2>
                                <p>Complete the code and password fields below. After a successful reset, SMART LEAP will send you back to sign in.</p>
                            </div>

                            <form id="resetPasswordForm" class="login-form" novalidate>
                                <input type="hidden" name="entryPoint" value="<?= htmlspecialchars($entryPoint, ENT_QUOTES) ?>">

                                <label class="field field--icon">
                                    <span>Email address</span>
                                    <span class="field__icon" aria-hidden="true">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                    </span>
                                    <input type="email" id="email" name="email" value="<?= htmlspecialchars($email, ENT_QUOTES) ?>" autocomplete="email" placeholder="your@email.com" required>
                                </label>

                                <label class="field field--icon">
                                    <span>Reset code</span>
                                    <span class="field__icon" aria-hidden="true">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11h6"/><path d="M9 15h4"/><path d="M5 4h10l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
                                    </span>
                                    <input type="text" id="code" name="code" inputmode="numeric" maxlength="6" placeholder="Six-digit code" required>
                                </label>

                                <label class="field field--icon">
                                    <span>New password</span>
                                    <span class="field__icon" aria-hidden="true">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    </span>
                                    <div class="field__secure">
                                        <input type="password" id="newPassword" name="newPassword" autocomplete="new-password" placeholder="Enter new password" required>
                                        <button type="button" class="field-toggle" data-toggle-target="newPassword" aria-label="Show new password">Show</button>
                                    </div>
                                </label>

                                <label class="field field--icon">
                                    <span>Confirm new password</span>
                                    <span class="field__icon" aria-hidden="true">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    </span>
                                    <div class="field__secure">
                                        <input type="password" id="confirmPassword" name="confirmPassword" autocomplete="new-password" placeholder="Confirm new password" required>
                                        <button type="button" class="field-toggle" data-toggle-target="confirmPassword" aria-label="Show confirm password">Show</button>
                                    </div>
                                </label>

                                <p class="small-note">Use at least 8 characters and make sure both password fields match exactly.</p>
                                <p class="auth-feedback" id="resetPasswordFeedback" role="alert" hidden></p>

                                <button type="submit" class="auth-submit" id="resetPasswordSubmit">
                                    <span class="auth-submit__text">Reset password</span>
                                    <span class="auth-submit__spinner" hidden>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" stroke-linecap="round"/></svg>
                                    </span>
                                </button>

                                <p class="auth-card__security">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    Your new password is submitted through a secure, encrypted connection.
                                </p>

                                <p class="auth-card__subaction"><a class="text-link" href="<?= htmlspecialchars($requestNewCodeHref, ENT_QUOTES) ?>">Request a new code</a></p>
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
        const form = document.getElementById('resetPasswordForm');
        const submit = document.getElementById('resetPasswordSubmit');
        const feedback = document.getElementById('resetPasswordFeedback');
        const newPassword = document.getElementById('newPassword');
        const confirmPassword = document.getElementById('confirmPassword');
        const code = document.getElementById('code');
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
        const clearAlert = () => {
            if (!feedback) {
                return;
            }
            feedback.hidden = true;
            feedback.textContent = '';
        };
        document.querySelectorAll('[data-toggle-target]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const targetId = button.getAttribute('data-toggle-target');
                const input = targetId ? document.getElementById(targetId) : null;
                if (!(input instanceof HTMLInputElement)) {
                    return;
                }
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                button.textContent = show ? 'Hide' : 'Show';
            });
        });
        code?.addEventListener('input', clearAlert);
        newPassword?.addEventListener('input', clearAlert);
        confirmPassword?.addEventListener('input', clearAlert);
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearAlert();
            const codeValue = (code?.value || '').trim();
            if (codeValue.length !== 6) {
                showAlert('Enter the complete six-digit reset code.', 'danger');
                code?.focus();
                return;
            }
            if ((newPassword?.value || '').length < 8) {
                showAlert('Your new password must be at least 8 characters long.', 'danger');
                newPassword?.focus();
                return;
            }
            if ((newPassword?.value || '') !== (confirmPassword?.value || '')) {
                showAlert('The password confirmation does not match.', 'danger');
                confirmPassword?.focus();
                return;
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
                const response = await fetch(routeUrl('auth/reset-password'), {
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
                    showAlert(payload.message || 'Unable to reset password.', 'danger');
                    return;
                }
                showAlert(payload.message || 'Password reset successful.', 'success');
                window.setTimeout(() => {
                    window.location.href = routeUrl(payload.redirect || 'portal/login');
                }, 900);
            } catch (error) {
                showAlert('Unable to reset password right now.', 'danger');
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
