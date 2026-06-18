<?php
/**
 * SMART LEAP FILE GUIDE
 * Applicant account activation and co-maker account creation page.
 * Lets selected Stage 1 registrants activate a private applicant account, and also supports co-maker account creation when accessed from a co-maker invitation flow.
 */
/** @var string $baseUrl */
/** @var string[] $butuanBarangays */
/** @var string $signupMode */
/** @var array|null $coMakerContext */
/** @var string|null $signupError */
$signupMode = $signupMode ?? 'applicant';
$isCoMakerMode = $signupMode === 'co-maker';
$coMakerContext = is_array($coMakerContext ?? null) ? $coMakerContext : null;
$signupError = isset($signupError) ? (string) $signupError : '';
$portalCssVersion = @filemtime(base_path('public/assets/css/public/portal.css')) ?: time();
$signupCssVersion = @filemtime(base_path('public/assets/css/public/signup.css')) ?: time();
$portalJsVersion = @filemtime(base_path('public/assets/js/public/portal.js')) ?: time();
$signupJsVersion = @filemtime(base_path('public/assets/js/public/signup.js')) ?: time();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | <?= $isCoMakerMode ? 'Create Co-maker Account' : 'Create Account' ?></title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=<?= urlencode((string) $portalCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/signup.css?v=<?= urlencode((string) $signupCssVersion) ?>">
    <script defer src="<?= $baseUrl ?>/assets/js/public/portal.js?v=<?= urlencode((string) $portalJsVersion) ?>"></script>
    <script defer src="<?= $baseUrl ?>/assets/js/public/signup.js?v=<?= urlencode((string) $signupJsVersion) ?>"></script>
</head>
<body class="portal-page portal-page--signup">
    <div class="page-shell">
        <?php require __DIR__ . '/../layouts/public-flow-header.php'; ?>

        <main class="page" id="content">
            <section class="signup-page">
                <div class="container signup-shell">
                    <section class="auth-card signup-card" aria-labelledby="signupHeading">
                        <div class="auth-card__top">
                            <h2 id="signupHeading"><?= $isCoMakerMode ? 'Create co-maker account' : 'Activate your account' ?></h2>
                            <p>
                                <?= $isCoMakerMode
                                    ? 'Complete your co-maker account details for the deceased primary beneficiary record before continuing to the beneficiary portal.'
                                    : 'Your Stage 1 application is already on file. Set your portal password to activate your applicant account.' ?>
                            </p>
                        </div>

                        <form id="signupForm" novalidate>
                            <input type="hidden" id="signupRegistrationMode" name="registrationMode" value="<?= $isCoMakerMode ? 'co-maker' : 'applicant' ?>">
                            <?php if ($isCoMakerMode): ?>
                                <input type="hidden" id="signupBeneficiaryProfileId" name="beneficiaryProfileId" value="<?= (int) ($coMakerContext['beneficiaryProfileId'] ?? 0) ?>">
                                <input type="hidden" id="signupInviteToken" name="inviteToken" value="<?= htmlspecialchars((string) ($coMakerContext['inviteToken'] ?? ''), ENT_QUOTES) ?>">
                            <?php endif; ?>

                            <?php if ($signupError !== ''): ?>
                                <p class="auth-feedback" data-tone="danger"><?= htmlspecialchars($signupError, ENT_QUOTES) ?></p>
                            <?php elseif ($isCoMakerMode && $coMakerContext !== null): ?>
                                <section class="signup-section">
                                    <div class="signup-section__header">
                                        <span class="signup-section__eyebrow">Primary beneficiary record</span>
                                    </div>
                                    <div class="auth-grid">
                                        <label class="field">
                                            <span>Primary beneficiary</span>
                                            <input type="text" value="<?= htmlspecialchars((string) ($coMakerContext['primaryBeneficiaryName'] ?? ''), ENT_QUOTES) ?>" readonly>
                                        </label>
                                        <label class="field">
                                            <span>Business name</span>
                                            <input type="text" value="<?= htmlspecialchars((string) ($coMakerContext['primaryBusinessName'] ?? ''), ENT_QUOTES) ?>" readonly>
                                        </label>
                                        <label class="field">
                                            <span>Barangay</span>
                                            <input type="text" value="<?= htmlspecialchars((string) ($coMakerContext['primaryBarangay'] ?? ''), ENT_QUOTES) ?>" readonly>
                                        </label>
                                        <label class="field">
                                            <span>Assigned PDO</span>
                                            <input type="text" value="<?= htmlspecialchars((string) (($coMakerContext['assignedPdo']['name'] ?? '') ?: 'Unassigned'), ENT_QUOTES) ?>" readonly>
                                        </label>
                                    </div>
                                </section>
                            <?php endif; ?>

                            <section class="signup-section">
                                <div class="signup-section__header">
                                    <span class="signup-section__eyebrow"><?= $isCoMakerMode ? 'Account details' : 'Account access' ?></span>
                                </div>
                                <div class="auth-grid">
                                    <?php if ($isCoMakerMode): ?>
                                        <label class="field">
                                            <span>First name</span>
                                            <input type="text" id="signupFirstName" name="firstName" autocomplete="given-name" required>
                                            <small data-error-for="signupFirstName"></small>
                                        </label>

                                        <label class="field">
                                            <span>Middle name</span>
                                            <input type="text" id="signupMiddleName" name="middleName" autocomplete="additional-name">
                                            <small data-error-for="signupMiddleName"></small>
                                        </label>

                                        <label class="field">
                                            <span>Last name</span>
                                            <input type="text" id="signupLastName" name="lastName" autocomplete="family-name" required>
                                            <small data-error-for="signupLastName"></small>
                                        </label>
                                    <?php endif; ?>

                                    <label class="field<?= $isCoMakerMode ? '' : ' field--wide' ?>">
                                        <span>Email address</span>
                                        <input type="email" id="signupEmail" name="email" autocomplete="email" value="<?= htmlspecialchars((string) ($_GET['email'] ?? $coMakerContext['invitedEmail'] ?? ''), ENT_QUOTES) ?>" required>
                                        <small data-error-for="signupEmail"></small>
                                    </label>
                                </div>
                            </section>

                            <section class="signup-section">
                                <div class="signup-section__header">
                                    <span class="signup-section__eyebrow">Portal security</span>
                                </div>
                                <div class="auth-grid auth-grid--password">
                                    <label class="field">
                                        <span>Password</span>
                                        <div class="field__secure">
                                            <input type="password" id="signupPassword" name="password" autocomplete="new-password" required>
                                            <button type="button" class="field-toggle toggle-visibility" data-toggle="signupPassword" aria-label="Show password">Show</button>
                                        </div>
                                        <small data-error-for="signupPassword"></small>
                                        <small class="password-hint-short">Use 8+ characters with uppercase, lowercase, and a number.</small>
                                        <div class="password-hints" id="passwordHints" aria-live="polite">
                                            <span data-hint="length">8+ characters</span>
                                            <span data-hint="number">Includes a number</span>
                                            <span data-hint="upper">Uppercase letter</span>
                                            <span data-hint="lower">Lowercase letter</span>
                                        </div>
                                    </label>

                                    <label class="field">
                                        <span>Confirm password</span>
                                        <div class="field__secure">
                                            <input type="password" id="signupPasswordConfirm" name="confirmPassword" autocomplete="new-password" required>
                                            <button type="button" class="field-toggle toggle-visibility" data-toggle="signupPasswordConfirm" aria-label="Show password">Show</button>
                                        </div>
                                        <small data-error-for="signupPasswordConfirm"></small>
                                    </label>
                                </div>
                                <?php if (!$isCoMakerMode): ?>
                                    <p class="auth-card__subaction">We’ll send a six-digit verification code to this email before your portal access goes live.</p>
                                <?php endif; ?>
                            </section>

                            <?php if ($isCoMakerMode): ?>
                                <section class="signup-section signup-section--profile">
                                    <div class="signup-section__header">
                                        <span class="signup-section__eyebrow">Co-maker details</span>
                                    </div>

                                    <div class="auth-grid signup-grid--profile">
                                        <label class="field">
                                            <span>Contact number</span>
                                            <input type="tel" id="signupContactNumber" name="contactNumber" placeholder="09xxxxxxxxx" required>
                                            <small data-error-for="signupContactNumber"></small>
                                        </label>

                                        <label class="field">
                                            <span>Age</span>
                                            <input type="number" id="signupAge" name="age" min="1" max="120" placeholder="Enter age" required>
                                            <small data-error-for="signupAge"></small>
                                        </label>

                                        <label class="field">
                                            <span>Gender</span>
                                            <select id="signupGender" name="gender" required>
                                                <option value="">Select gender</option>
                                                <option value="Female">Female</option>
                                                <option value="Male">Male</option>
                                                <option value="Non-binary">Non-binary</option>
                                                <option value="Prefer not to say">Prefer not to say</option>
                                            </select>
                                            <small data-error-for="signupGender"></small>
                                        </label>

                                        <label class="field field--full">
                                            <span>Relationship to primary beneficiary</span>
                                            <input type="text" id="signupRelationshipToPrimaryBeneficiary" name="relationshipToPrimaryBeneficiary" placeholder="e.g., Spouse, Child, Sibling" required>
                                            <small data-error-for="signupRelationshipToPrimaryBeneficiary"></small>
                                        </label>

                                        <article class="field">
                                            <span>Valid ID</span>
                                            <input type="file" id="signupValidIdInput" name="validId" accept=".jpg,.jpeg,.png,.pdf" required>
                                            <small class="field-helper">JPG, PNG, or PDF.</small>
                                            <small data-error-for="signupValidIdInput"></small>
                                        </article>

                                        <article class="field">
                                            <span>Relationship document</span>
                                            <input type="file" id="signupRelationshipDocumentInput" name="relationshipDocument" accept=".jpg,.jpeg,.png,.pdf" required>
                                            <small class="field-helper">Upload proof of relationship to the primary beneficiary.</small>
                                            <small data-error-for="signupRelationshipDocumentInput"></small>
                                        </article>
                                    </div>
                                </section>
                            <?php endif; ?>

                            <button type="submit" class="auth-submit signup-submit" id="signupSubmit"<?= $signupError !== '' ? ' disabled' : '' ?>><?= $isCoMakerMode ? 'Create co-maker account' : 'Activate account' ?></button>

                            <p class="auth-feedback" id="signupFeedback" role="alert" hidden></p>
                        </form>
                    </section>
                </div>
            </section>
        </main>

        <?php
        $publicFooterVariant = 'flow';
        require __DIR__ . '/../layouts/public-footer.php';
        ?>

        <div class="auth-loading-screen" id="authLoadingScreen" hidden aria-live="polite" aria-label="Loading">
            <div class="auth-loading-screen__orb" aria-hidden="true"></div>
            <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="" class="auth-loading-screen__logo">
            <strong class="auth-loading-screen__title">SMART LEAP</strong>
            <p class="auth-loading-screen__copy" id="authLoadingCopy">Creating your SMART LEAP account...</p>
        </div>

        <?php if ($isCoMakerMode): ?>
        <div class="signup-confirm" id="signupConfirmModal" hidden>
            <div class="signup-confirm__backdrop" data-close-signup-confirm></div>
            <div class="signup-confirm__dialog" role="dialog" aria-modal="true" aria-labelledby="signupConfirmHeading">
                <div class="signup-confirm__header">
                    <span class="signup-confirm__eyebrow">Review details</span>
                    <h3 id="signupConfirmHeading">Please review your co-maker account details before we save them.</h3>
                    <p>Check the details below. If everything looks right, continue and we will create your co-maker account and open your beneficiary portal.</p>
                </div>
                <div class="signup-confirm__body">
                    <div class="signup-confirm__hero">
                        <div class="signup-confirm__photo-frame">
                            <img id="signupConfirmPhoto" src="" alt="Applicant profile photo preview" hidden>
                            <div class="signup-confirm__photo-placeholder" id="signupConfirmPhotoPlaceholder">No photo</div>
                        </div>
                        <div class="signup-confirm__hero-copy">
                            <strong id="signupConfirmName">--</strong>
                            <span id="signupConfirmEmail">--</span>
                        </div>
                    </div>
                    <div class="signup-confirm__grid" id="signupConfirmGrid"></div>
                </div>
                <div class="signup-confirm__actions">
                    <button type="button" class="signup-confirm__back" data-close-signup-confirm>Go back</button>
                    <button type="button" class="auth-submit signup-confirm__submit" id="signupConfirmSubmit">Yes, save and continue</button>
                </div>
            </div>
        </div>
        <?php endif; ?>
    </div>
    <script>
        window.SMARTLEAP_SIGNUP_MODE = <?= json_encode($signupMode, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_CO_MAKER_CONTEXT = <?= json_encode($coMakerContext, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_BARANGAYS = <?= json_encode($butuanBarangays ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    </script>
</body>
</html>
