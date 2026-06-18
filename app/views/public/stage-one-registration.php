<?php /** @var string $baseUrl */ ?>
<?php /** @var string[] $butuanBarangays */ ?>
<?php
$stageOneFlash = is_array($stageOneFlash ?? null) ? $stageOneFlash : [];
$stageOneOldInput = is_array($stageOneOldInput ?? null) ? $stageOneOldInput : [];
$stageOneSuccess = !empty($stageOneFlash['ok']);
$stageOneFeedbackMessage = trim((string) ($stageOneFlash['message'] ?? ''));
$stageOneFeedbackTone = $stageOneSuccess ? 'success' : 'danger';
$oldValue = static function (string $key) use ($stageOneOldInput): string {
    return trim((string) ($stageOneOldInput[$key] ?? ''));
};
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Stage 1 Registration</title>
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/portal.css?v=<?= urlencode((string) (@filemtime(base_path('public/assets/css/public/portal.css')) ?: time())) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/signup.css?v=<?= urlencode((string) (@filemtime(base_path('public/assets/css/public/signup.css')) ?: time())) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/public/stage-one-registration.css?v=<?= urlencode((string) (@filemtime(base_path('public/assets/css/public/stage-one-registration.css')) ?: time())) ?>">
    <script defer src="<?= $baseUrl ?>/assets/js/public/portal.js?v=<?= urlencode((string) (@filemtime(base_path('public/assets/js/public/portal.js')) ?: time())) ?>"></script>
    <script defer src="<?= $baseUrl ?>/assets/js/public/stage-one-registration.js?v=<?= urlencode((string) (@filemtime(base_path('public/assets/js/public/stage-one-registration.js')) ?: time())) ?>"></script>
</head>
<body class="portal-page portal-page--signup portal-page--stage-one">
    <div class="page-shell">
        <?php require __DIR__ . '/../layouts/public-flow-header.php'; ?>

        <main class="page" id="content">
            <section class="signup-page stage-one-page">
                <div class="container signup-shell stage-one-shell">
                    <section class="auth-card signup-card stage-one-card" aria-labelledby="stageOneHeading">
                        <div class="auth-card__top">
                            <span class="portal-chip">Stage 1 Public Registration</span>
                            <h2 id="stageOneHeading">Start your SMART LEAP application.</h2>
                        </div>

                        <form id="stageOneForm" method="post" action="<?= $baseUrl ?>/portal/apply" novalidate enctype="multipart/form-data"<?= $stageOneSuccess ? ' hidden' : '' ?>>
                            <?= csrf_field() ?>
                            <section class="signup-section">
                                <div class="signup-section__header">
                                    <span class="signup-section__eyebrow">Personal information</span>
                                </div>
                                <div class="signup-profile-photo">
                                    <div class="signup-profile-photo__frame">
                                        <img id="stageOneProfilePhotoPreview" src="" alt="Profile photo preview" hidden>
                                        <div class="signup-profile-photo__placeholder" id="stageOneProfilePhotoPlaceholder">Profile photo</div>
                                    </div>
                                    <div class="signup-profile-photo__actions">
                                        <label class="btn-outline signup-profile-photo__button">
                                            Upload photo
                                            <input type="file" id="stageOneProfilePhoto" name="profilePhoto" accept=".jpg,.jpeg,.png" hidden required>
                                        </label>
                                        <p class="signup-profile-photo__note">JPG or PNG, up to 5MB.</p>
                                        <small class="field-file-name" id="stageOneProfilePhotoName">No file selected.</small>
                                        <small data-error-for="stageOneProfilePhoto"></small>
                                    </div>
                                </div>

                                <div class="auth-grid">
                                    <label class="field">
                                        <span>First name</span>
                                        <input type="text" id="stageOneFirstName" name="firstName" autocomplete="given-name" value="<?= htmlspecialchars($oldValue('firstName'), ENT_QUOTES) ?>" required>
                                        <small data-error-for="stageOneFirstName"></small>
                                    </label>

                                    <label class="field">
                                        <span>Middle name</span>
                                        <input type="text" id="stageOneMiddleName" name="middleName" autocomplete="additional-name" value="<?= htmlspecialchars($oldValue('middleName'), ENT_QUOTES) ?>">
                                        <small data-error-for="stageOneMiddleName"></small>
                                    </label>

                                    <label class="field">
                                        <span>Last name</span>
                                        <input type="text" id="stageOneLastName" name="lastName" autocomplete="family-name" value="<?= htmlspecialchars($oldValue('lastName'), ENT_QUOTES) ?>" required>
                                        <small data-error-for="stageOneLastName"></small>
                                    </label>

                                    <label class="field">
                                        <span>Email address</span>
                                        <input type="email" id="stageOneEmail" name="email" autocomplete="email" value="<?= htmlspecialchars($oldValue('email'), ENT_QUOTES) ?>" required>
                                        <small data-error-for="stageOneEmail"></small>
                                    </label>

                                    <label class="field">
                                        <span>Birthdate</span>
                                        <input type="date" id="stageOneBirthdate" name="birthdate" value="<?= htmlspecialchars($oldValue('birthdate'), ENT_QUOTES) ?>" required>
                                        <small data-error-for="stageOneBirthdate"></small>
                                    </label>

                                    <label class="field">
                                        <span>Age</span>
                                        <input type="number" id="stageOneAge" name="age" readonly>
                                        <small class="field-helper">Automatically computed from your birthdate.</small>
                                        <small data-error-for="stageOneAge"></small>
                                    </label>

                                    <label class="field">
                                        <span>Gender</span>
                                        <select id="stageOneGender" name="gender" required>
                                            <option value=""<?= $oldValue('gender') === '' ? ' selected' : '' ?>>Select gender</option>
                                            <option value="Female"<?= $oldValue('gender') === 'Female' ? ' selected' : '' ?>>Female</option>
                                            <option value="Male"<?= $oldValue('gender') === 'Male' ? ' selected' : '' ?>>Male</option>
                                            <option value="Non-binary"<?= $oldValue('gender') === 'Non-binary' ? ' selected' : '' ?>>Non-binary</option>
                                            <option value="Prefer not to say"<?= $oldValue('gender') === 'Prefer not to say' ? ' selected' : '' ?>>Prefer not to say</option>
                                        </select>
                                        <small data-error-for="stageOneGender"></small>
                                    </label>

                                    <label class="field">
                                        <span>Contact number</span>
                                        <input type="text" id="stageOneContactNumber" name="contactNumber" inputmode="tel" autocomplete="tel" placeholder="09xxxxxxxxx" value="<?= htmlspecialchars($oldValue('contactNumber'), ENT_QUOTES) ?>" required>
                                        <small data-error-for="stageOneContactNumber"></small>
                                    </label>

                                    <label class="field field--full">
                                        <span>Complete address</span>
                                        <textarea id="stageOneAddress" class="field-textarea field-textarea--address" name="address" rows="2" placeholder="House no., purok/sitio, street, subdivision" required><?= htmlspecialchars($oldValue('address'), ENT_QUOTES) ?></textarea>
                                        <small class="field-helper">Enter your house number and street details here. You will choose your barangay separately below.</small>
                                        <small data-error-for="stageOneAddress"></small>
                                    </label>

                                    <label class="field">
                                        <span>Barangay</span>
                                        <select id="stageOneBarangay" name="barangay" required>
                                            <option value=""<?= $oldValue('barangay') === '' ? ' selected' : '' ?>>Select barangay</option>
                                            <?php foreach (($butuanBarangays ?? []) as $barangay): ?>
                                                <option value="<?= htmlspecialchars($barangay, ENT_QUOTES) ?>"<?= $oldValue('barangay') === $barangay ? ' selected' : '' ?>><?= htmlspecialchars($barangay, ENT_QUOTES) ?></option>
                                            <?php endforeach; ?>
                                        </select>
                                        <small data-error-for="stageOneBarangay"></small>
                                    </label>

                                    <label class="field">
                                        <span>4Ps membership</span>
                                        <select id="stageOne4ps" name="is4ps" required>
                                            <option value=""<?= $oldValue('is4ps') === '' ? ' selected' : '' ?>>Select</option>
                                            <option value="Yes"<?= $oldValue('is4ps') === 'Yes' ? ' selected' : '' ?>>Yes</option>
                                            <option value="No"<?= $oldValue('is4ps') === 'No' ? ' selected' : '' ?>>No</option>
                                        </select>
                                        <small data-error-for="stageOne4ps"></small>
                                    </label>

                                    <label class="field">
                                        <span>Highest educational attainment</span>
                                        <select id="stageOneEducationalAttainment" name="educationalAttainment" required>
                                            <option value=""<?= $oldValue('educationalAttainment') === '' ? ' selected' : '' ?>>Select attainment</option>
                                            <option value="Kindergarten"<?= $oldValue('educationalAttainment') === 'Kindergarten' ? ' selected' : '' ?>>Kindergarten</option>
                                            <option value="Elementary"<?= $oldValue('educationalAttainment') === 'Elementary' ? ' selected' : '' ?>>Elementary</option>
                                            <option value="JHS"<?= $oldValue('educationalAttainment') === 'JHS' ? ' selected' : '' ?>>JHS</option>
                                            <option value="SHS Grad"<?= $oldValue('educationalAttainment') === 'SHS Grad' ? ' selected' : '' ?>>SHS grad</option>
                                            <option value="Tertiary"<?= $oldValue('educationalAttainment') === 'Tertiary' ? ' selected' : '' ?>>Tertiary</option>
                                        </select>
                                        <small data-error-for="stageOneEducationalAttainment"></small>
                                    </label>

                                    <label class="field">
                                        <span>Sector</span>
                                        <select id="stageOneSector" name="sector" required>
                                            <option value=""<?= $oldValue('sector') === '' ? ' selected' : '' ?>>Select sector</option>
                                            <option value="Indigenous People"<?= $oldValue('sector') === 'Indigenous People' ? ' selected' : '' ?>>Indigenous People</option>
                                            <option value="Senior Citizen"<?= $oldValue('sector') === 'Senior Citizen' ? ' selected' : '' ?>>Senior Citizen</option>
                                            <option value="Solo Parent"<?= $oldValue('sector') === 'Solo Parent' ? ' selected' : '' ?>>Solo Parent</option>
                                            <option value="PWD"<?= $oldValue('sector') === 'PWD' ? ' selected' : '' ?>>PWD</option>
                                            <option value="None"<?= $oldValue('sector') === 'None' ? ' selected' : '' ?>>None</option>
                                            <option value="Other"<?= $oldValue('sector') === 'Other' ? ' selected' : '' ?>>Other (please specify)</option>
                                        </select>
                                        <small data-error-for="stageOneSector"></small>
                                    </label>

                                    <label class="field" id="stageOneSectorOtherWrap"<?= $oldValue('sector') === 'Other' ? '' : ' hidden' ?>>
                                        <span>Other sector</span>
                                        <input type="text" id="stageOneSectorOtherSpecify" name="sectorOtherSpecify" placeholder="Please specify" value="<?= htmlspecialchars($oldValue('sectorOtherSpecify'), ENT_QUOTES) ?>"<?= $oldValue('sector') === 'Other' ? '' : ' disabled' ?>>
                                        <small data-error-for="stageOneSectorOtherSpecify"></small>
                                    </label>
                                </div>
                            </section>

                            <section class="signup-section">
                                <div class="signup-section__header">
                                    <span class="signup-section__eyebrow">Microbusiness details</span>
                                </div>
                                <div class="auth-grid">
                                    <label class="field">
                                        <span>Specific business type</span>
                                        <input type="text" id="stageOneLivelihood" name="livelihood" placeholder="e.g., Sari-sari store" value="<?= htmlspecialchars($oldValue('livelihood'), ENT_QUOTES) ?>" required>
                                        <small data-error-for="stageOneLivelihood"></small>
                                    </label>

                                    <label class="field">
                                        <span>Microbusiness name</span>
                                        <input type="text" id="stageOneBusinessName" name="businessName" placeholder="e.g., Maria's Sari-sari Store" value="<?= htmlspecialchars($oldValue('businessName'), ENT_QUOTES) ?>" required>
                                        <small data-error-for="stageOneBusinessName"></small>
                                    </label>
                                </div>

                                <div class="auth-grid auth-grid--uploads">
                                    <label class="field field--upload">
                                        <span>Photo of existing business</span>
                                        <input type="file" id="stageOneBusinessPhoto" name="businessPhoto" accept=".jpg,.jpeg,.png,.webp,.heic,.heif" required>
                                        <small class="field-file-name" id="stageOneBusinessPhotoName">No file selected.</small>
                                        <small data-error-for="stageOneBusinessPhoto"></small>
                                    </label>

                                    <label class="field field--upload">
                                        <span>Photo of valid ID</span>
                                        <input type="file" id="stageOneValidIdPhoto" name="validIdPhoto" accept=".jpg,.jpeg,.png,.webp,.pdf,.heic,.heif" required>
                                        <small class="field-file-name" id="stageOneValidIdPhotoName">No file selected.</small>
                                        <small data-error-for="stageOneValidIdPhoto"></small>
                                    </label>
                                </div>
                            </section>

                            <div class="stage-one-actions">
                                <button type="submit" class="auth-submit signup-submit" id="stageOneSubmit">Submit Registration</button>
                            </div>

                            <p class="auth-feedback" id="stageOneFeedback" role="alert" data-tone="<?= htmlspecialchars($stageOneFeedbackTone, ENT_QUOTES) ?>"<?= !$stageOneSuccess && $stageOneFeedbackMessage === '' ? ' hidden' : '' ?>><?= htmlspecialchars($stageOneSuccess ? '' : $stageOneFeedbackMessage, ENT_QUOTES) ?></p>
                        </form>

                        <section class="stage-one-success" id="stageOneSuccess"<?= $stageOneSuccess ? '' : ' hidden' ?> aria-live="polite" aria-labelledby="stageOneSuccessHeading">
                            <div class="stage-one-success__card">
                                <div class="stage-one-success__mark" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                                        <path d="M5 12.5 9.2 16.7 19 7.4" />
                                    </svg>
                                </div>
                                <div class="stage-one-success__content">
                                    <span class="stage-one-success__eyebrow">Registration submitted</span>
                                    <h3 id="stageOneSuccessHeading">Your SMART LEAP registration was received.</h3>
                                    <p id="stageOneSuccessMessage"><?= htmlspecialchars($stageOneSuccess && $stageOneFeedbackMessage !== '' ? $stageOneFeedbackMessage : 'Watch your email for account activation once you are selected for the current batch.', ENT_QUOTES) ?></p>
                                </div>

                                <div class="stage-one-success__next" aria-label="What happens next">
                                    <div>
                                        <strong>1. Initial screening</strong>
                                        <span>CSWDD reviews your basic information and uploaded requirements.</span>
                                    </div>
                                    <div>
                                        <strong>2. Account activation email</strong>
                                        <span>Selected applicants receive a secure link so they can activate portal access.</span>
                                    </div>
                                    <div>
                                        <strong>3. Set your password</strong>
                                        <span>Once verified, you can sign in and track your application inside the portal.</span>
                                    </div>
                                </div>

                                <a class="stage-one-success__action" href="<?= $baseUrl ?>/portal">Back to Main Page</a>
                            </div>
                        </section>
                    </section>
                </div>
            </section>
        </main>

        <?php
        $publicFooterVariant = 'flow';
        require __DIR__ . '/../layouts/public-footer.php';
        ?>
    </div>

    <div class="auth-loading-screen" id="authLoadingScreen" hidden aria-live="polite" aria-label="Loading">
        <div class="auth-loading-screen__orb" aria-hidden="true"></div>
        <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="" class="auth-loading-screen__logo">
        <strong class="auth-loading-screen__title">SMART LEAP</strong>
        <p class="auth-loading-screen__copy" id="authLoadingCopy">Submitting your Stage 1 registration...</p>
    </div>
</body>
</html>
