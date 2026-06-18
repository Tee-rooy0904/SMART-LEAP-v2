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
    <title>SMART LEAP | Forgot Password</title>
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
                    <section class="auth-card portal-login-card" aria-labelledby="forgotPasswordHeading">
                        <div class="auth-card__top">
                            <h2 id="forgotPasswordHeading">Reset password</h2>
                            <p>Enter your registered email. SMART LEAP will send a reset code that expires in 20 minutes.</p>
                        </div>

                        <form id="forgotPasswordForm" class="login-form" novalidate>
                            <input type="hidden" name="entryPoint" value="<?= htmlspecialchars($entryPoint, ENT_QUOTES) ?>">
                            <label class="field">
                                <span>Email address</span>
                                <input type="email" id="email" name="email" value="<?= htmlspecialchars($email, ENT_QUOTES) ?>" autocomplete="email" required>
                            </label>
                            <button type="submit" class="auth-submit">Send reset code</button>
                            <p class="auth-card__subaction"><a class="text-link" href="<?= $baseUrl ?>/portal/login">Back to sign in</a></p>
                        </form>
                    </section>
                </div>
            </section>
        </main>

        <?php require __DIR__ . '/../layouts/public-footer.php'; ?>
    </div>
    <script>
    (() => {
        const form = document.getElementById('forgotPasswordForm');
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
                submit.disabled = false;
            }
        });
    })();
    </script>
</body>
</html>
