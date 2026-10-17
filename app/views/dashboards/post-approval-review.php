<?php /** @var string $baseUrl */ ?>
<?php /** @var array|null $authUser */ ?>
<?php /** @var int $taskId */ ?>
<?php /** @var bool $embedded */ ?>
<?php
$reviewCssVersion = (string) @filemtime(base_path('public/assets/css/dashboards/post-approval-review.css'));
$postApprovalCssVersion = (string) @filemtime(base_path('public/assets/css/dashboards/post-approval.css'));
$reviewJsVersion = (string) @filemtime(base_path('public/assets/js/dashboards/post-approval-review.js'));
$faviconVersion = @filemtime(base_path('public/assets/img/logo-mark.png')) ?: time();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Application Form Review</title>
    <link rel="icon" type="image/png" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="apple-touch-icon" href="<?= $baseUrl ?>/assets/img/logo-mark.png?v=<?= urlencode((string) $faviconVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/post-approval.css?v=<?= urlencode($postApprovalCssVersion) ?>">
    <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/post-approval-review.css?v=<?= urlencode($reviewCssVersion) ?>">
</head>
<body class="<?= !empty($embedded) ? 'review-body--embedded' : '' ?>">
    <script>
        window.SMARTLEAP_AUTH_USER = <?= json_encode($authUser ?? null, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_BASE_URL = <?= json_encode($baseUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_REVIEW_TASK_ID = <?= json_encode((int) ($taskId ?? 0), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
        window.SMARTLEAP_REVIEW_EMBEDDED = <?= json_encode(!empty($embedded), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    </script>

    <div class="review-shell">
        <header class="review-header <?= !empty($embedded) ? 'is-embedded' : '' ?>">
            <div>
                <p class="eyebrow">SMART LEAP Staff Review</p>
                <h1>Application Form Review</h1>
                <p class="subtitle"><?= !empty($embedded)
                    ? 'Review the submitted fill-up form requirement in its paper-faithful layout.'
                    : 'Review submitted fill-up form requirements and record the staff decision.' ?></p>
            </div>
            <div class="review-user">
                <strong><?= htmlspecialchars($authUser['name'] ?? 'Staff', ENT_QUOTES, 'UTF-8') ?></strong>
                <span><?= htmlspecialchars($authUser['role'] ?? '', ENT_QUOTES, 'UTF-8') ?></span>
            </div>
        </header>

        <main class="review-layout">
            <section class="review-panel review-summary">
                <h2>Queue summary</h2>
                <div class="summary-grid">
                    <article><span>Submitted</span><strong id="summarySubmitted">0</strong></article>
                    <article><span>Needs Correction</span><strong id="summaryNeedsCorrection">0</strong></article>
                    <article><span>Verified</span><strong id="summaryVerified">0</strong></article>
                    <article><span>Rejected</span><strong id="summaryRejected">0</strong></article>
                </div>
            </section>

            <section class="review-panel review-queue">
                <div class="section-head">
                    <h2>Review queue</h2>
                    <button type="button" class="btn-outline" id="refreshReviewQueue">Refresh</button>
                </div>
                <div id="reviewTaskList" class="task-list">
                    <article class="empty-state">No Availment or Validation forms are available for review yet.</article>
                </div>
            </section>

            <section class="review-panel review-workspace">
                <div class="section-head">
                    <div>
                        <h2 id="reviewWorkspaceTitle">Select a submitted form</h2>
                        <p id="reviewWorkspaceMeta">Choose a task from the queue to inspect the applicant submission and complete staff review fields.</p>
                    </div>
                    <span class="status-chip" id="reviewWorkspaceStatus">Idle</span>
                </div>

                <div id="reviewApplicantCard" class="applicant-card is-hidden"></div>

                <form id="reviewForm" class="review-form is-hidden">
                    <div class="workspace-columns">
                        <div class="workspace-column">
                            <h3>Review document</h3>
                            <div id="reviewApplicantSections" class="workspace-sections"></div>
                        </div>
                        <div class="workspace-column">
                            <h3>Review tools</h3>
                            <div id="reviewStaffSections" class="workspace-sections"></div>
                        </div>
                    </div>

                    <section class="submission-history">
                        <h3>Submission history</h3>
                        <div id="reviewSubmissionHistory" class="history-list"></div>
                    </section>

                    <section class="decision-block">
                        <h3>Review decision</h3>
                        <div class="decision-grid">
                            <label class="form-field">
                                <span>Status</span>
                                <select id="reviewDecisionStatus" name="review.status">
                                    <option value="Verified">Verified</option>
                                    <option value="Needs Correction">Needs Correction</option>
                                    <option value="Rejected">Rejected</option>
                                </select>
                            </label>
                            <label class="form-field full">
                                <span>Staff remarks</span>
                                <textarea id="reviewDecisionRemarks" name="review.remarks" rows="3" placeholder="Internal note for staff use."></textarea>
                            </label>
                            <label class="form-field full">
                                <span>Applicant-visible remark</span>
                                <textarea id="reviewDecisionApplicantRemark" name="review.applicant_visible_remark" rows="3" placeholder="Required for Needs Correction or Rejected."></textarea>
                            </label>
                        </div>
                    </section>

                    <div class="form-actions">
                        <button type="submit" class="btn-primary" id="saveReviewDecision">Save review decision</button>
                    </div>
                </form>
            </section>
        </main>
    </div>

    <div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="true"></div>

    <script src="<?= $baseUrl ?>/assets/js/dashboards/post-approval-review.js?v=<?= urlencode($reviewJsVersion) ?>" defer></script>
</body>
</html>
