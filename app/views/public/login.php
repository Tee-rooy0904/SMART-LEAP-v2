<?php /** @var string $baseUrl */ ?>
<?php
$sharedStylesVersion = @filemtime(base_path('public/assets/css/shared/styles.css')) ?: time();
$authJsVersion = @filemtime(base_path('public/assets/js/shared/auth.js')) ?: time();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSWDD-SMART LEAP Admin System</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="<?= $baseUrl ?>/assets/css/shared/styles.css?v=<?= urlencode((string) $sharedStylesVersion) ?>" rel="stylesheet">
</head>
<body>
    <div id="loginPage" class="login-page">
        <div class="login-shell">
            <div class="login-card-logos" aria-label="CSWDD and City of Butuan official seal">
                <img src="<?= $baseUrl ?>/assets/img/CSWD logo.png" alt="CSWDD Logo" class="login-card-logo login-card-logo--cswdd">
                <img src="<?= $baseUrl ?>/assets/img/cityOfButuan.png" alt="City of Butuan Official Seal" class="login-card-logo login-card-logo--city-seal">
            </div>
            <div class="login-container">
                <div class="login-left-panel">
                    <span class="login-office-badge">Official staff access</span>
                    <div class="logo-container">
                        <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="SMART LEAP Logo" class="cswdd-logo-img">
                    </div>
                    
                    <div class="system-title">
                        <h2>SMART LEAP</h2>
                        <p>City Social Welfare and Development Department</p>
                    </div>
                </div>
                    
                <div class="login-right-panel">
                    <div class="login-header">
                        <span>Government Officials Portal</span>
                        <h1>Staff Login</h1>
                    </div>
                    
                    <form id="loginForm" class="login-form" novalidate>
                        <input type="hidden" name="entryPoint" value="staff">
                        <div class="form-group">
                            <label for="email">Email</label>
                            <input type="email" id="email" name="email" placeholder="username" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" name="password" placeholder="Enter your password" required>
                        </div>
                        
                        <div class="form-check">
                            <input type="checkbox" id="showPassword" class="form-check-input">
                            <label for="showPassword" class="form-check-label">Show Password</label>
                        </div>
                        
                        <button type="submit" class="login-btn">Login</button>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <!-- Main System Container - Placeholder for redirection -->
    <div id="mainSystem" style="display: none;">
        <!-- This div is kept as a placeholder for the login/logout functionality -->
    </div>

    <div class="auth-loading-screen auth-loading-screen--staff" id="authLoadingScreen" hidden aria-live="polite" aria-label="Loading">
        <div class="auth-loading-screen__orb" aria-hidden="true"></div>
        <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="" class="auth-loading-screen__logo">
        <strong class="auth-loading-screen__title">SMART LEAP</strong>
        <p class="auth-loading-screen__copy" id="authLoadingCopy">Authorizing staff access...</p>
    </div>

    <!-- Scripts -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="<?= $baseUrl ?>/assets/js/shared/auth.js?v=<?= urlencode((string) $authJsVersion) ?>"></script>
</body>
</html>
