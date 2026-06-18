<?php /** @var string $baseUrl */ ?>
<?php
$email = (string) ($email ?? '');
$entryPoint = (string) ($entryPoint ?? 'portal');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Reset Password</title>
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
                    <section class="auth-card portal-login-card" aria-labelledby="resetPasswordHeading">
                        <div class="auth-card__top">
                            <h2 id="resetPasswordHeading">Set new password</h2>
                            <p>Use the code sent to your email, then sign in again with your new password.</p>
                        </div>

                        <form id="resetPasswordForm" class="login-form" novalidate>
                            <input type="hidden" name="entryPoint" value="<?= htmlspecialchars($entryPoint, ENT_QUOTES) ?>">
                            <label class="field">
                                <span>Email address</span>
                                <input type="email" id="email" name="email" value="<?= htmlspecialchars($email, ENT_QUOTES) ?>" autocomplete="email" required>
                            </label>
                            <label class="field">
                                <span>Reset code</span>
                                <input type="text" id="code" name="code" inputmode="numeric" maxlength="6" placeholder="Six-digit code" required>
                            </label>
                            <label class="field">
                                <span>New password</span>
                                <input type="password" id="newPassword" name="newPassword" autocomplete="new-password" required>
                            </label>
                            <label class="field">
                                <span>Confirm new password</span>
                                <input type="password" id="confirmPassword" name="confirmPassword" autocomplete="new-password" required>
                            </label>
                            <button type="submit" class="auth-submit">Reset password</button>
                            <p class="auth-card__subaction"><a class="text-link" href="<?= $baseUrl ?>/forgot-password?email=<?= urlencode($email) ?>&entryPoint=<?= urlencode($entryPoint) ?>">Request a new code</a></p>
                        </form>
                    </section>
                </div>
            </section>
        </main>

        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>
    </div>
    <script>
    (() => {
        const form = document.getElementById('resetPasswordForm');
        const publicBase = () => {
            const match = window.location.pathname.match(/^(.*\/public)(?:\/.*)?$/);
            return match ? match[1] : '';
        };
        const routeUrl = (path) => `${publicBase()}/${String(path || '').replace(/^\/+/, '')}`;
        const showAlert = (message, type) => {
            document.querySelector('.auth-inline-alert')?.remove();
            const alert = document.createElement('div');
            alert.className = `auth-error auth-inline-alert ${type === 'success' ? 'is-success' : ''}`;
            alert.textContent = message;
            form.appendChild(alert);
        };
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
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
                submit.disabled = false;
            }
        });
    })();
    </script>
</body>
</html>
