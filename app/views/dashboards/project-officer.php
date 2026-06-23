<?php /** @var string $baseUrl */ ?>
<?php /** @var array|null $authUser */ ?>
<?php
$adminCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin.css')) ?: time();
$adminDashboardCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-dashboard.css')) ?: time();
$adminComponentsCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-components.css')) ?: time();
$adminBeneficiariesCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-beneficiaries.css')) ?: time();
$adminReportsCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-reports.css')) ?: time();
$adminValidationCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-validation.css')) ?: time();
$projectOfficerCssVersion = @filemtime(base_path('public/assets/css/dashboards/project-officer.css')) ?: time();
$postApprovalCssVersion = @filemtime(base_path('public/assets/css/dashboards/post-approval.css')) ?: time();
$postApprovalReviewCssVersion = @filemtime(base_path('public/assets/css/dashboards/post-approval-review.css')) ?: time();
$notificationsCssVersion = @filemtime(base_path('public/assets/css/components/notifications.css')) ?: time();
$reportsModuleJsVersion = @filemtime(base_path('public/assets/js/modules/reports.js')) ?: time();
$projectOfficerJsVersion = @filemtime(base_path('public/assets/js/dashboards/project-officer.js')) ?: time();
$repaymentWorkspaceJsVersion = @filemtime(base_path('public/assets/js/dashboards/repayment-review-workspace.js')) ?: time();
$notificationsJsVersion = @filemtime(base_path('public/assets/js/shared/notifications.js')) ?: time();
$overview = is_array($overview ?? null) ? $overview : [];
$repaymentData = is_array($repaymentData ?? null) ? $repaymentData : ['payments' => []];
$initialRepaymentBeneficiaries = array_values(array_filter($overview['beneficiaryRoster'] ?? [], static fn ($row): bool => is_array($row)));
$initialPaymentsByBeneficiary = [];
foreach (($repaymentData['payments'] ?? []) as $payment) {
    if (!is_array($payment)) {
        continue;
    }
    $beneficiaryId = (int) ($payment['beneficiaryId'] ?? 0);
    if ($beneficiaryId <= 0) {
        continue;
    }
    $initialPaymentsByBeneficiary[$beneficiaryId][] = $payment;
}
$monthsPassedFor = static function (string $firstRepaymentDueDate, string $approvedAt = '', string $approvalDate = ''): int {
    $anchor = $firstRepaymentDueDate;
    $alreadyFirstDue = true;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}/', $anchor)) {
        $anchor = $approvedAt !== '' ? $approvedAt : $approvalDate;
        $alreadyFirstDue = false;
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}/', $anchor)) {
        return 0;
    }
    try {
        $start = new DateTimeImmutable(substr($anchor, 0, 7) . '-01');
        if (!$alreadyFirstDue) {
            $start = $start->modify('+1 month');
        }
        $today = new DateTimeImmutable('first day of this month');
    } catch (Throwable) {
        return 0;
    }
    if ($today < $start) {
        return 0;
    }
    $diff = (((int) $today->format('Y') - (int) $start->format('Y')) * 12) + ((int) $today->format('n') - (int) $start->format('n')) + 1;
    return max(0, min(24, $diff));
};
$normalizeRepaymentStage = static function (string $stage): string {
    $normalized = preg_replace('/[^a-z]/', '', strtolower(trim($stage))) ?? '';
    if ($normalized === '') {
        return 'uploaded';
    }
    if (in_array($normalized, ['pending', 'submitted', 'underreview', 'reviewing'], true)) {
        return 'under_review';
    }
    if (in_array($normalized, ['needscorrection', 'correctionrequired'], true)) {
        return 'needs_correction';
    }
    if (in_array($normalized, ['rejected', 'flagged', 'invalid'], true)) {
        return 'rejected';
    }
    if (in_array($normalized, ['partialverified', 'partiallyverified'], true)) {
        return 'partial_verified';
    }
    if ($normalized === 'credited') {
        return 'credited';
    }
    if (in_array($normalized, ['verified', 'verifiedupload', 'approved'], true)) {
        return 'verified';
    }
    return 'uploaded';
};
$initialRepaymentRows = array_map(static function (array $beneficiary) use ($initialPaymentsByBeneficiary, $monthsPassedFor, $normalizeRepaymentStage): array {
    $payments = $initialPaymentsByBeneficiary[(int) ($beneficiary['id'] ?? 0)] ?? [];
    $verifiedAmount = 0.0;
    $verifiedMonths = [];
    $pending = false;
    foreach ($payments as $payment) {
        $stage = $normalizeRepaymentStage((string) ($payment['stage'] ?? ''));
        if (in_array($stage, ['uploaded', 'under_review'], true)) {
            $pending = true;
        }
        if (in_array($stage, ['verified', 'credited', 'partial_verified'], true)) {
            $verifiedAmount += (float) ($payment['amount'] ?? $payment['allocatedAmount'] ?? 0);
            $month = substr((string) ($payment['month'] ?? $payment['coverageFrom'] ?? ''), 0, 7);
            if (preg_match('/^\d{4}-\d{2}$/', $month)) {
                $verifiedMonths[$month] = true;
            }
        }
    }
    $monthsPassed = $monthsPassedFor(
        (string) ($beneficiary['firstRepaymentDueDate'] ?? ''),
        (string) ($beneficiary['approvedAt'] ?? ''),
        (string) ($beneficiary['approvalDate'] ?? '')
    );
    $monthsPaid = count($verifiedMonths);
    $calendarMonthsPassed = $monthsPassed;
    $rateDenominator = max($calendarMonthsPassed, $monthsPaid);
    $hasNeedsCorrection = array_reduce($payments, static fn (bool $carry, array $payment): bool => $carry || $normalizeRepaymentStage((string) ($payment['stage'] ?? '')) === 'needs_correction', false);
    $hasRejected = array_reduce($payments, static fn (bool $carry, array $payment): bool => $carry || $normalizeRepaymentStage((string) ($payment['stage'] ?? '')) === 'rejected', false);
    $hasCredited = array_reduce($payments, static fn (bool $carry, array $payment): bool => $carry || $normalizeRepaymentStage((string) ($payment['stage'] ?? '')) === 'credited', false);
    $repaymentKey = $pending ? 'under_review' : ($hasNeedsCorrection ? 'needs_correction' : ($hasRejected && $verifiedAmount <= 0 ? 'rejected' : ($hasCredited || $verifiedAmount >= 15000 || $monthsPaid >= 24 ? 'fully_paid' : ($verifiedAmount > 0 ? 'partial_paid' : 'no_upload_yet'))));
    return [
        'beneficiary' => $beneficiary,
        'repaymentKey' => $repaymentKey,
        'repaymentLabel' => ['under_review' => 'Under Review', 'needs_correction' => 'Needs Correction', 'rejected' => 'Rejected', 'fully_paid' => 'Fully Paid', 'partial_paid' => 'Partial Paid', 'no_upload_yet' => 'No Upload Yet'][$repaymentKey] ?? 'No Upload Yet',
        'verifiedAmount' => $verifiedAmount,
        'calendarMonthsPassed' => $calendarMonthsPassed,
        'monthsPassed' => $rateDenominator,
        'monthsPaid' => $monthsPaid,
        'rate' => $rateDenominator > 0 ? round(($monthsPaid / $rateDenominator) * 100, 2) : 0.0,
        'monthsPaidFraction' => $monthsPaid . '/' . $rateDenominator,
    ];
}, $initialRepaymentBeneficiaries);
$initialRepaymentPendingCount = count(array_filter($initialRepaymentRows, static fn (array $row): bool => $row['repaymentKey'] === 'under_review'));
$initialRepaymentPartialCount = count(array_filter($initialRepaymentRows, static fn (array $row): bool => $row['repaymentKey'] === 'partial_paid'));
$initialRepaymentFullCount = count(array_filter($initialRepaymentRows, static fn (array $row): bool => $row['repaymentKey'] === 'fully_paid'));
$initialRepaymentTone = static fn (string $key): string => [
    'no_upload_yet' => 'muted',
    'under_review' => 'uploaded',
    'needs_correction' => 'needs-correction',
    'rejected' => 'rejected',
    'partial_paid' => 'warning',
    'fully_paid' => 'success',
][$key] ?? 'muted';
$escapeHtml = static fn ($value): string => htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
$initialReportMonth = date('Y-m');
$initialReportTargetAmount = count($initialRepaymentRows) * 625;
$initialReportActualAmount = 0.0;
$initialScopedBeneficiaryIds = array_fill_keys(array_map(static fn (array $row): int => (int) ($row['beneficiary']['id'] ?? 0), $initialRepaymentRows), true);
foreach (($repaymentData['payments'] ?? []) as $payment) {
    if (!is_array($payment)) {
        continue;
    }
    $beneficiaryId = (int) ($payment['beneficiaryId'] ?? 0);
    $paymentMonth = substr((string) (($payment['month'] ?? '') ?: (($payment['coverageFrom'] ?? '') ?: ($payment['paymentDate'] ?? ''))), 0, 7);
    if ($beneficiaryId > 0 && isset($initialScopedBeneficiaryIds[$beneficiaryId]) && $paymentMonth === $initialReportMonth && $normalizeRepaymentStage((string) ($payment['stage'] ?? '')) === 'verified') {
        $initialReportActualAmount += (float) ($payment['amount'] ?? $payment['allocatedAmount'] ?? 0);
    }
}
$initialReportGapAmount = max(0, $initialReportTargetAmount - $initialReportActualAmount);
$initialReportRoiPercent = $initialReportTargetAmount > 0 ? round(($initialReportActualAmount / $initialReportTargetAmount) * 100, 2) : 0.0;
$initialReportRawMax = max($initialReportTargetAmount, $initialReportActualAmount, $initialReportGapAmount, 1);
$initialReportStep = $initialReportRawMax <= 5000 ? 1000 : ($initialReportRawMax <= 20000 ? 5000 : 20000);
$initialReportMaxValue = max($initialReportStep, (int) ceil($initialReportRawMax / $initialReportStep) * $initialReportStep);
$initialReportTicks = [];
for ($tick = $initialReportMaxValue; $tick >= 0; $tick -= $initialReportStep) {
    $initialReportTicks[] = $tick;
}
$initialReportBars = [
    ['label' => 'Target', 'amount' => $initialReportTargetAmount, 'color' => '#2563eb'],
    ['label' => 'Actual', 'amount' => $initialReportActualAmount, 'color' => '#16a34a'],
    ['label' => 'Gap', 'amount' => $initialReportGapAmount, 'color' => '#dc2626'],
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Core document metadata for the PDO dashboard shell. -->
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Browser tab title for the Project Development Officer workspace. -->
  <title>SMART LEAP - Project Officer</title>

  <!-- Shared dashboard, reporting, beneficiary, repayment, and PDO-specific styles used in this workspace. -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" crossorigin="anonymous">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin.css?v=<?= $adminCssVersion ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-dashboard.css?v=<?= urlencode((string) $adminDashboardCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-components.css?v=<?= urlencode((string) $adminComponentsCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-beneficiaries.css?v=<?= urlencode((string) $adminBeneficiariesCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-reports.css?v=<?= urlencode((string) $adminReportsCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/admin-validation.css?v=<?= urlencode((string) $adminValidationCssVersion) ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/project-officer.css?v=<?= $projectOfficerCssVersion ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/post-approval.css?v=<?= $postApprovalCssVersion ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/dashboards/post-approval-review.css?v=<?= $postApprovalReviewCssVersion ?>">
  <link rel="stylesheet" href="<?= $baseUrl ?>/assets/css/components/notifications.css?v=<?= $notificationsCssVersion ?>">
</head>
<body>
  <!-- Bootstrap values consumed by the PDO frontend logic for scoped dashboards, reports, training, and repayments. -->
  <script>
    window.SMARTLEAP_AUTH_USER = <?= json_encode($authUser ?? null, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    window.SMARTLEAP_BASE_URL = <?= json_encode($baseUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
    window.SMARTLEAP_REPORTS_API_PATH = 'pdo/reports/data';
    window.SMARTLEAP_REPORT_EXPORT_BASE = 'pdo/reports/export';
    window.SMARTLEAP_PO_INITIAL = <?= json_encode([
        'overview' => $overview,
        'repaymentData' => $repaymentData,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  </script>

  <div id="mainSystem" class="admin-shell project-officer-shell" data-sidebar-open="false">
      <aside id="adminSidebar" class="admin-sidebar" aria-label="Project officer navigation" aria-hidden="false">
        <!-- PDO branding shown at the top of the fixed left navigation. -->
        <div class="sidebar-brand">
          <img src="<?= $baseUrl ?>/assets/img/SMARTLEAP.png" alt="SMART LEAP seal" class="brand-logo">
          <div class="brand-copy">
            <h1 class="brand-title">SMART LEAP</h1>
            <span class="brand-tag">Project Officer</span>
          </div>
        </div>

      <!-- PDO navigation is limited to scoped review, training, repayment, beneficiary, and reporting work. -->
      <nav class="sidebar-nav">
        <!-- Dashboard snapshot for the PDO's current scoped caseload and repayments. -->
        <button type="button" class="nav-link active po-nav-link" data-section="clients">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16v2H4v-2Zm2-2h3V9H6v8Zm5 0h3V4h-3v13Zm5 0h3v-6h-3v6Z"/></svg>
          <span class="po-nav-copy"><strong>Dashboard</strong></span>
        </button>
        <!-- Scoped application review workspace for applicants assigned to this PDO. -->
        <button type="button" class="nav-link po-nav-link" data-section="applications">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Zm7 1.5V8h3.5L13 4.5ZM8.5 12h6v1.5h-6V12Zm0 4H13v1.5H8.5V16Zm9.7-1.8 1.1 1.1-3.8 3.8-2.1-2.1 1.1-1.1 1 1 2.7-2.7Z"/></svg>
          <span class="po-nav-copy"><strong>Application Review</strong></span>
          <span class="nav-badge" data-section-badge="applications" hidden></span>
        </button>
        <!-- Training pipeline for session setup, notices, participant assignment, and attendance checking. -->
        <button type="button" class="nav-link po-nav-link" data-section="training">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3 8.5l9 4.5 9-4.5L12 4Zm-5 7.2V16c0 2 3.4 3.5 5 3.5s5-1.5 5-3.5v-4.8l-5 2.5-5-2.5Z"/></svg>
          <span class="po-nav-copy"><strong>Training Pipeline</strong></span>
        </button>
        <!-- Repayment checking workspace for scoped beneficiary uploads and proof review. -->
        <button type="button" class="nav-link po-nav-link" data-section="repayments">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V3Zm2 5h6V6.5H9V8Zm0 4h6v-1.5H9V12Zm0 4h4v-1.5H9V16Z"/></svg>
          <span class="po-nav-copy"><strong>Repayment Checking</strong></span>
          <span class="nav-badge" data-section-badge="repayments" hidden></span>
        </button>
        <!-- Beneficiary roster and scoped profile detail workspace. -->
        <button type="button" class="nav-link po-nav-link" data-section="beneficiaries">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-3.999-4A4 4 0 0 0 16 11Zm-8 0A4 4 0 1 0 4 7a4 4 0 0 0 4 4Zm0 2c-3.314 0-6 1.79-6 4v2h8v-2c0-1.002.337-1.933.904-2.688A8.24 8.24 0 0 0 8 13Zm8 0a8.1 8.1 0 0 0-4.612 1.312C10.82 15.067 10.5 15.998 10.5 17v2h11v-2c0-2.21-2.91-4-5.5-4Z"/></svg>
          <span class="po-nav-copy"><strong>Beneficiaries</strong></span>
        </button>
        <!-- PDO reports page with scoped repayment and training analytics filters. -->
        <button type="button" class="nav-link po-nav-link" data-section="reports">
          <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h14v2H5v-2Zm1-3h2V8H6v8Zm5 0h2V4h-2v12Zm5 0h2v-6h-2v6Z"/></svg>
          <span class="po-nav-copy"><strong>Reports</strong></span>
        </button>
      </nav>

    </aside>

    <div class="sidebar-backdrop" data-sidebar-close></div>

    <div class="content-area">
      <header class="content-header">
        <!-- Header chips summarize the PDO's current geographic scope and scoped applicant count. -->
        <div class="po-header-shell">
          <div class="content-headline">
            <h1 id="poHeaderTitle">Dashboard</h1>
            <div class="po-header-meta">
              <span class="po-header-chip"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg><span id="poHeaderBarangays">No assigned barangays</span></span>
              <span class="po-header-chip"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4Zm10.7-1.7-4.2 4.2-1.8-1.8-1.4 1.4 3.2 3.2 5.6-5.6-1.4-1.4Z"/></svg><span id="poHeaderScope">0 scoped applicants</span></span>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <!-- Manual refresh pulls the latest scoped dashboard, roster, repayment, and training state. -->
          <button type="button" class="btn-ghost" id="po-refresh"><svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h8V3l-3.3 3.3Z"/></svg><span>Refresh</span></button>
          <!-- Account actions for viewing PDO profile info, changing password, or logging out. -->
          <div class="admin-account-menu staff-account-menu">
            <button type="button" class="app-btn-outline admin-account-menu__trigger" id="poAccountMenuTrigger" aria-expanded="false">
              <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"/></svg>
              <span>Account</span>
            </button>
            <div class="admin-account-menu__panel" id="poAccountMenuPanel" hidden>
              <div class="admin-account-menu__actions">
                <button type="button" class="app-btn-ghost admin-account-menu__action" id="poAccountProfile">
                  <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"/></svg>
                  <span>Profile</span>
                </button>
                <button type="button" class="app-btn-ghost admin-account-menu__action" id="poAccountPassword">
                  <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z"/></svg>
                  <span>Change Password</span>
                </button>
                <button type="button" class="app-btn-outline app-btn-outline--danger admin-account-menu__action admin-account-menu__action--danger" id="po-logout">
                  <svg class="admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h8v2H6v12h6v2H4V4Zm12.6 4.4L21.2 13l-4.6 4.6-1.4-1.4 2.2-2.2H10v-2h7.4l-2.2-2.2 1.4-1.4Z"/></svg>
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main class="content-main">
        <section id="clients-section" class="content-card" data-role-section>
          <div class="po-home-shell po-overview-dashboard">
            <section class="po-overview-summary-row" aria-label="Case metrics">
              <article class="po-kpi-card po-snapshot-card po-kpi-card--applications">
                <div class="po-snapshot-card__eyebrow">Applications</div>
                <div class="po-kpi-card__main">
                  <div class="po-snapshot-card__body">
                    <strong class="po-kpi-card__value" id="poSummaryClients">0</strong>
                  </div>
                  <span class="po-kpi-card__icon" aria-hidden="true"><i class="fas fa-folder-open"></i></span>
                </div>
              </article>
              <article class="po-kpi-card po-snapshot-card po-kpi-card--repayments">
                <div class="po-snapshot-card__eyebrow">Repayments</div>
                <div class="po-kpi-card__main">
                  <div class="po-snapshot-card__body">
                    <strong class="po-kpi-card__value" id="poSummaryRepayments">0</strong>
                  </div>
                  <span class="po-kpi-card__icon" aria-hidden="true"><i class="fas fa-receipt"></i></span>
                </div>
              </article>
              <article class="po-kpi-card po-snapshot-card po-kpi-card--beneficiaries">
                <div class="po-snapshot-card__eyebrow">Beneficiaries</div>
                <div class="po-kpi-card__main">
                  <div class="po-snapshot-card__body">
                    <strong class="po-kpi-card__value" id="poSummaryBeneficiaries">0</strong>
                  </div>
                  <span class="po-kpi-card__icon" aria-hidden="true"><i class="fas fa-users"></i></span>
                </div>
              </article>
            </section>

            <section class="po-dashboard-chart-grid" aria-label="Project Officer dashboard charts">
              <article class="po-overview-card po-dashboard-chart-card admin-v1-panel admin-v1-panel--graph">
                <div class="admin-v1-panel__title-row"><h2>Applicants by Status</h2></div>
                <div class="admin-v1-workflow-chart po-dashboard-chart" id="poApplicantsStatusChart"></div>
                <div class="admin-v1-legend" id="poApplicantsStatusLegend"></div>
                <div class="admin-v1-panel__footer" id="poApplicantsStatusFooter">No applicant records yet.</div>
              </article>
              <article class="po-overview-card po-dashboard-chart-card admin-v1-panel admin-v1-panel--graph">
                <div class="admin-v1-panel__title-row"><h2>Beneficiaries by Status</h2></div>
                <div class="admin-v1-workflow-chart po-dashboard-chart" id="poBeneficiariesStatusChart"></div>
                <div class="admin-v1-legend" id="poBeneficiariesStatusLegend"></div>
                <div class="admin-v1-panel__footer" id="poBeneficiariesStatusFooter">No beneficiary records yet.</div>
              </article>
              <article class="po-overview-card po-dashboard-chart-card admin-v1-panel admin-v1-panel--graph">
                <div class="admin-v1-panel__title-row"><h2>Repayment Verification Rate</h2></div>
                <div class="admin-v1-repayment-chart po-dashboard-chart" id="poRepaymentVerificationRateChart"></div>
                <div class="admin-v1-legend" id="poRepaymentVerificationRateLegend"></div>
                <div class="admin-v1-panel__footer" id="poRepaymentVerificationRateFooter">No repayment records yet.</div>
              </article>
            </section>
          </div>
        </section>

        <section id="applications-section" class="content-card" data-role-section style="display:none;">
          <div class="po-section-shell">
            <section class="po-section-board">
              <div class="po-application-toolbar">
                <div class="po-application-toolbar__controls">
                  <label class="po-filter-field" for="po-app-search">
                    <span>Search</span>
                    <input id="po-app-search" class="section-filter" type="search" placeholder="Search applicant, barangay, or business">
                  </label>
                  <label class="po-filter-field" for="po-app-filter">
                    <span>Status Filter</span>
                    <select id="po-app-filter" class="section-filter">
                      <option value="">All statuses</option>
                    </select>
                  </label>
                  <label class="po-filter-field" for="po-app-livelihood-filter">
                    <span>Livelihood Category</span>
                    <select id="po-app-livelihood-filter" class="section-filter">
                      <option value="">All categories</option>
                      <option value="Establishment">Establishment</option>
                      <option value="Buy and Sell">Buy and Sell</option>
                      <option value="Homemade">Homemade</option>
                      <option value="Livestock">Livestock</option>
                      <option value="Services">Services</option>
                    </select>
                  </label>
                </div>
              </div>

              <div class="data-table-card">
                <header class="data-table-card__header">
                  <h3>Scoped applications</h3>
                  <span class="chip" id="po-app-table-caption">Queue review list</span>
                </header>
                <div class="data-table-wrapper">
                  <table class="data-table" id="po-app-table">
                    <colgroup>
                      <col class="po-app-table__col--applicant">
                      <col class="po-app-table__col--barangay">
                      <col class="po-app-table__col--batch">
                      <col class="po-app-table__col--uploads">
                      <col class="po-app-table__col--status">
                      <col class="po-app-table__col--readiness">
                      <col class="po-app-table__col--submitted">
                      <col class="po-app-table__col--actions">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Applicant</th>
                        <th>Barangay</th>
                        <th>Batch</th>
                        <th>Uploads</th>
                        <th>Application Status</th>
                        <th>Readiness</th>
                        <th>Submitted</th>
                        <th class="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody></tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section id="training-section" class="content-card" data-role-section style="display:none;">
          <div id="po-training-overview-view" class="po-section-shell">
            <section class="po-section-board">
              <div id="po-training-program-list" class="po-training-program-list">
                <div class="po-empty">No scoped training sessions found.</div>
              </div>
            </section>
          </div>

          <div id="po-training-session-view" class="po-section-shell" style="display:none;">
            <section class="po-section-board">
              <div id="po-training-session-shell" class="po-training-shell">
                <div id="po-training-session-context" class="po-training-detail"></div>
                <div id="po-training-session-detail-view" class="po-training-workspace"></div>
                <div id="po-training-assignment-view" class="po-training-workspace" style="display:none;"></div>
                <div id="po-training-forms-view" class="po-training-workspace" style="display:none;"></div>
                <div id="po-training-notices-view" class="po-training-workspace" style="display:none;"></div>
                <div id="po-training-attendance-view" class="po-training-workspace" style="display:none;"></div>
              </div>
            </section>
          </div>
        </section>

        <section id="repayments-section" class="content-card" data-role-section style="display:none;">
          <div class="po-section-shell po-repayment-shell">
            <section class="po-section-board">
              <div class="po-repayment-page">
                <section class="data-table-card po-repayment-filters">
                  <header class="data-table-card__header">
                    <div>
                      <span class="po-panel-label">Filter</span>
                      <h3>Beneficiary Filters</h3>
                    </div>
                  </header>
                  <div class="po-repayment-filters__grid">
                    <label class="po-filter-field po-repayment-filter-field--search" for="po-repayment-search">
                      <span>Search beneficiary</span>
                      <input id="po-repayment-search" class="section-filter" type="search" placeholder="Search beneficiary, business, or OR number">
                    </label>
                    <label class="po-filter-field" for="po-repayment-status">
                      <span>Repayment State</span>
                      <select id="po-repayment-status" class="section-filter">
                        <option value="">All repayment states</option>
                        <option value="no_upload_yet">No Upload Yet</option>
                        <option value="under_review">Under Review</option>
                        <option value="needs_correction">Needs Correction</option>
                        <option value="rejected">Rejected</option>
                        <option value="partial_paid">Partial Paid</option>
                        <option value="fully_paid">Fully Paid</option>
                      </select>
                    </label>
                    <label class="po-filter-field" for="po-repayment-from-date">
                      <span>From date</span>
                      <input id="po-repayment-from-date" class="section-filter" type="date">
                    </label>
                    <label class="po-filter-field" for="po-repayment-to-date">
                      <span>To date</span>
                      <input id="po-repayment-to-date" class="section-filter" type="date">
                    </label>
                  </div>
                </section>

                <section class="data-table-card po-repayment-roster">
                  <header class="data-table-card__header">
                    <div>
                      <span class="po-panel-label">Beneficiaries</span>
                      <h3>Beneficiary Roster</h3>
                    </div>
                    <span class="chip" id="po-repayment-roster-count"><?= count($initialRepaymentRows) ?> <?= count($initialRepaymentRows) === 1 ? 'beneficiary' : 'beneficiaries' ?></span>
                  </header>
                  <div class="data-table-wrapper po-repayment-table-wrapper">
                    <table class="data-table po-repayment-table">
                      <thead>
                        <tr>
                          <th>Beneficiary</th>
                          <th>Gender</th>
                          <th>Age Group</th>
                          <th>Service Type</th>
                          <th>Barangay</th>
                          <th>Assigned PDO</th>
                          <th>Repayment</th>
                          <th>Verified Amount</th>
                          <th>Months Passed</th>
                          <th>Months Paid</th>
                          <th>Repayment Rate</th>
                          <th class="actions">Action</th>
                        </tr>
                      </thead>
                      <tbody id="poRepaymentRosterBody">
                        <?php if ($initialRepaymentRows === []): ?>
                          <tr>
                            <td colspan="12">No scoped beneficiaries found.</td>
                          </tr>
                        <?php else: ?>
                          <?php foreach ($initialRepaymentRows as $initialRepaymentRow): ?>
                            <?php
                              $beneficiary = $initialRepaymentRow['beneficiary'];
                              $beneficiaryId = (int) ($beneficiary['id'] ?? 0);
                              $name = trim((string) ($beneficiary['name'] ?? '')) ?: 'Unnamed beneficiary';
                              $businessName = trim((string) ($beneficiary['businessName'] ?? '')) ?: 'No business name';
                              $serviceType = trim((string) (($beneficiary['serviceType'] ?? '') ?: (($beneficiary['businessType'] ?? '') ?: ($beneficiary['sectorOtherSpecify'] ?? '')))) ?: '--';
                              $repaymentKey = (string) $initialRepaymentRow['repaymentKey'];
                              $repaymentRate = number_format((float) $initialRepaymentRow['rate'], 0);
                              if (fmod((float) $initialRepaymentRow['rate'], 1.0) !== 0.0) {
                                  $repaymentRate = number_format((float) $initialRepaymentRow['rate'], 2);
                              }
                            ?>
                            <tr>
                              <td>
                                <div class="admin-repayment-person">
                                  <strong><?= $escapeHtml($name) ?></strong>
                                  <span><?= $escapeHtml($businessName) ?></span>
                                </div>
                              </td>
                              <td><?= $escapeHtml($beneficiary['gender'] ?? '--') ?></td>
                              <td><?= $escapeHtml($beneficiary['ageGroup'] ?? '--') ?></td>
                              <td><?= $escapeHtml($serviceType) ?></td>
                              <td><?= $escapeHtml($beneficiary['barangay'] ?? '--') ?></td>
                              <td><?= $escapeHtml(($beneficiary['assignedPdo'] ?? '') ?: ($authUser['name'] ?? '--')) ?></td>
                              <td><span class="repayment-state-chip repayment-state-chip--<?= $escapeHtml($initialRepaymentTone($repaymentKey)) ?>"><?= $escapeHtml($initialRepaymentRow['repaymentLabel']) ?></span></td>
                              <td>PHP <?= number_format((float) $initialRepaymentRow['verifiedAmount'], 2) ?></td>
                              <td><?= (int) $initialRepaymentRow['monthsPassed'] ?></td>
                              <td><?= (int) $initialRepaymentRow['monthsPaid'] ?></td>
                              <td><?= $escapeHtml($repaymentRate) ?>% (<?= $escapeHtml($initialRepaymentRow['monthsPaidFraction'] ?? '0/0') ?>)</td>
                              <td class="actions">
                                <button type="button" class="app-btn-outline" data-repayment-open="id:<?= $beneficiaryId ?>">Open Repayments</button>
                              </td>
                            </tr>
                          <?php endforeach; ?>
                        <?php endif; ?>
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </section>
          </div>

          <div class="po-repayment-modal-shell" id="poRepaymentModal" aria-hidden="true">
            <div class="po-repayment-modal-shell__backdrop" data-repayment-modal-close></div>
            <div class="po-repayment-modal-shell__dialog" role="dialog" aria-modal="true" aria-labelledby="poRepaymentModalTitle">
              <header class="po-repayment-modal-shell__header">
                <div class="po-repayment-modal-shell__copy">
                  <span class="po-panel-label">Repayment Review</span>
                  <h3 id="poRepaymentModalTitle">Beneficiary repayment review</h3>
                  <p id="poRepaymentModalSubtitle">Select a beneficiary repayment record.</p>
                </div>
                <div class="po-repayment-modal-shell__actions">
                  <span class="po-status-chip is-muted" id="poRepaymentModalStatus">No Upload Yet</span>
                  <button type="button" class="po-repayment-modal-shell__close" id="poRepaymentModalClose" aria-label="Close repayment review modal">&times;</button>
                </div>
              </header>

              <div class="po-repayment-modal-shell__body">
                <section class="po-repayment-modal-shell__summary">
                  <article class="po-summary-card">
                    <span>Outstanding Balance</span>
                    <strong id="poRepaymentSummaryOutstanding">PHP 0.00</strong>
                  </article>
                  <article class="po-summary-card">
                    <span>Verified Amount</span>
                    <strong id="poRepaymentSummaryVerified">PHP 0.00</strong>
                  </article>
                  <article class="po-summary-card">
                    <span>Repayment Compliance</span>
                    <strong id="poRepaymentSummaryProgress">0 / 0 months</strong>
                  </article>
                  <article class="po-summary-card">
                    <span>Current Repayment Standing</span>
                    <strong id="poRepaymentSummaryStanding">No Upload Yet</strong>
                  </article>
                </section>

                <section class="po-repayment-modal-shell__top">
                  <article class="po-preview-panel po-repayment-proof-panel">
                    <div class="po-review-section__header">
                      <div>
                        <span class="po-panel-label">Uploaded OR / Proof</span>
                        <h6>Proof / Receipt Preview</h6>
                      </div>
                    </div>
                    <div class="po-repayment-proof-meta">
                      <strong id="poRepaymentProofName">No proof uploaded</strong>
                      <span id="poRepaymentProofType">--</span>
                      <small id="poRepaymentProofDate">--</small>
                    </div>
                    <div class="staff-proof-preview" id="poRepaymentProofPreview">No proof preview available.</div>
                    <div class="po-repayment-proof-actions">
                      <button type="button" class="app-btn-outline" id="poRepaymentOpenProof">Open file</button>
                      <button type="button" class="app-btn-outline" id="poRepaymentDownloadProof">Download file</button>
                      <button type="button" class="app-btn-outline" id="poRepaymentFullscreenProof">Fullscreen</button>
                    </div>
                  </article>

                  <div class="po-repayment-modal-shell__details">
                    <article class="po-requirement-nav po-repayment-beneficiary-panel">
                      <div class="po-review-section__header">
                        <div>
                          <span class="po-panel-label">Beneficiary Summary</span>
                          <h6 id="poRepaymentBeneficiaryName">Beneficiary</h6>
                        </div>
                      </div>
                      <div class="po-repayment-detail-grid">
                        <article><span>Business</span><strong id="poRepaymentBusiness">--</strong></article>
                        <article><span>Barangay</span><strong id="poRepaymentBarangay">--</strong></article>
                        <article><span>Assigned PDO</span><strong id="poRepaymentAssignedPdo">--</strong></article>
                        <article><span>Submission date</span><strong id="poRepaymentSubmittedAt">--</strong></article>
                      </div>
                    </article>

                    <article class="po-requirement-nav po-repayment-submission-panel">
                      <div class="po-review-section__header">
                        <div>
                          <span class="po-panel-label">OR Details</span>
                          <h6>Submission Details</h6>
                        </div>
                      </div>
                      <div class="po-repayment-detail-grid">
                        <article><span>OR number</span><strong id="poRepaymentOrNumber">--</strong></article>
                        <article><span>Payment date</span><strong id="poRepaymentPaymentDate">--</strong></article>
                        <article><span>Submitted by</span><strong id="poRepaymentSubmittedBy">--</strong></article>
                        <article><span>Submission type</span><strong id="poRepaymentSubmissionType">--</strong></article>
                        <article><span>Coverage month(s)</span><strong id="poRepaymentCoverage">--</strong></article>
                        <article><span>Amount</span><strong id="poRepaymentAmount">PHP 0.00</strong></article>
                        <article><span>Uploaded status</span><strong id="poRepaymentUploadStatus">--</strong></article>
                        <article><span>Hard copy submitted to office</span><strong id="poRepaymentHardCopyStatus">Not tracked</strong></article>
                      </div>
                      <div class="po-blocker-box is-hidden" id="poRepaymentDuplicateWarning"></div>
                    </article>
                  </div>
                </section>

                <section class="data-table-card po-repayment-history-panel">
                  <header class="data-table-card__header">
                    <div>
                      <span class="po-panel-label">Repayment History</span>
                      <h3>Repayment History</h3>
                    </div>
                  </header>
                  <div class="data-table-wrapper">
                    <table class="data-table po-repayment-history-table">
                      <colgroup>
                        <col>
                        <col>
                        <col>
                        <col>
                        <col>
                        <col>
                        <col>
                        <col>
                        <col>
                        <col>
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Coverage Month</th>
                          <th>Expected Amount</th>
                          <th>Submitted Amount</th>
                          <th>OR Number</th>
                          <th>Proof</th>
                          <th>Submission Status</th>
                          <th>Verification Result</th>
                          <th>Reviewer</th>
                          <th>Remarks</th>
                          <th>Date Reviewed</th>
                        </tr>
                      </thead>
                      <tbody id="poRepaymentHistoryBody">
                        <tr>
                          <td colspan="10">No repayment history recorded yet.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>

                <section class="po-decision-panel po-repayment-decision-panel">
                  <div class="po-review-section__header">
                    <div>
                      <span class="po-panel-label">Review Decision</span>
                      <h6>Decision Actions</h6>
                    </div>
                  </div>
                  <div class="po-repayment-decision-grid">
                    <label class="po-filter-field" for="po-repayment-remarks">
                      <span>Remarks</span>
                      <textarea id="po-repayment-remarks" class="section-filter staff-review-remarks" rows="5" placeholder="Record review findings, correction notes, or rejection basis."></textarea>
                    </label>
                    <div class="po-repayment-decision-actions">
                      <p class="po-repayment-decision-note" id="poRepaymentDecisionNote">Open a beneficiary repayment record to review proof and apply a decision.</p>
                      <label class="po-filter-field po-repayment-office-status-group" for="poRepaymentHardCopyInput">
                        <span>Hard copy office status</span>
                        <select id="poRepaymentHardCopyInput" class="section-filter">
                          <option value="not_submitted">Not Submitted</option>
                          <option value="submitted_to_office">Submitted to Office</option>
                          <option value="confirmed_by_office">Confirmed by Office</option>
                        </select>
                      </label>
                      <div class="po-decision-rail__actions">
                        <button type="button" class="app-btn-outline" id="poRepaymentVerifyPartial">Verify Partial</button>
                        <button type="button" class="app-btn-primary" id="poRepaymentVerifyFull">Verify Fully</button>
                        <button type="button" class="app-btn-outline" id="poRepaymentNeedsCorrection">Needs Correction</button>
                        <button type="button" class="app-btn-danger" id="poRepaymentReject">Reject</button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <footer class="po-repayment-modal-shell__footer">
                <button type="button" class="app-btn-outline" id="poRepaymentClose">Close</button>
              </footer>
            </div>
          </div>
        </section>

        <section id="beneficiaries-section" class="content-card" data-role-section style="display:none;">
          <div class="po-section-shell po-beneficiaries-shell">
            <section class="po-section-board">
              <div class="filters-row admin-beneficiaries-filters po-beneficiaries-filters">
                <label class="filter-group filter-group--search">
                  <span class="filter-label">Search</span>
                  <div class="filter-search">
                    <i class="fas fa-search"></i>
                    <input type="search" id="poBeneficiarySearch" placeholder="Name, business, email, barangay">
                  </div>
                </label>
                <label class="filter-group">
                  <span class="filter-label">Barangay</span>
                  <select class="filter-select" id="poBeneficiaryBarangayFilter">
                    <option value="">All barangays</option>
                  </select>
                </label>
                <label class="filter-group">
                  <span class="filter-label">Repayment</span>
                  <select class="filter-select" id="poBeneficiaryRepaymentFilter">
                    <option value="">All repayment states</option>
                    <option value="no_upload_yet">No Upload Yet</option>
                    <option value="under_review">Under Review</option>
                    <option value="needs_correction">Needs Correction</option>
                    <option value="rejected">Rejected</option>
                    <option value="partial_paid">Partial Paid</option>
                    <option value="fully_paid">Fully Paid</option>
                  </select>
                </label>
                <label class="filter-group">
                  <span class="filter-label">Beneficiary Status</span>
                  <select class="filter-select" id="poBeneficiaryStatusFilter">
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="deceased">Deceased</option>
                  </select>
                </label>
              </div>

              <div class="table-card admin-beneficiaries-table-card">
                <div class="admin-beneficiaries-table-head">
                  <h3>Scoped Beneficiaries</h3>
                  <span class="admin-inline-pill" id="poBeneficiaryRosterCount">0 records</span>
                </div>
                <div class="table-wrapper">
                  <table class="data-table admin-beneficiaries-table po-beneficiaries-table">
                    <thead>
                      <tr>
                        <th>Beneficiary</th>
                        <th>Barangay</th>
                        <th>Service Type</th>
                        <th>Repayment</th>
                        <th>Status</th>
                        <th>Last Activity</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody id="poBeneficiaryTableBody">
                      <tr><td colspan="7">No scoped beneficiary records yet.</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section id="reports-section" class="content-card" data-role-section style="display:none;">
          <div class="admin-reports-loading">Loading reports.</div>
        </section>
      </main>

      <footer class="content-footer">
        <span>SMART LEAP - City Government of Butuan - CSWDD</span>
      </footer>
    </div>
  </div>

  <div class="modal fade" id="poApplicationModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-scrollable po-review-modal-dialog">
      <div class="modal-content po-review-modal">
          <div class="modal-header">
            <div class="po-modal-title-block">
              <span class="po-panel-label po-modal-eyebrow">Application Case</span>
              <h5 class="modal-title" id="po-app-modal-title">Application Review</h5>
              <small class="po-modal-subtitle">Submitted on <span id="po-app-modal-submitted">--</span></small>
            </div>
            <div class="po-modal-header-actions">
            <span class="po-status-chip po-status-chip--header" id="po-app-modal-status">Pending</span>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
        </div>
        <div class="modal-body">
          <input type="hidden" id="po-app-modal-id">

          <section class="po-case-identity">
            <article class="po-case-identity__block">
              <span class="po-panel-label">Applicant</span>
              <strong id="po-app-modal-applicant">--</strong>
              <div class="po-case-identity__row"><span>Business</span><strong id="po-app-modal-business">--</strong></div>
              <div class="po-case-identity__row"><span>Barangay</span><strong id="po-app-modal-barangay">--</strong></div>
            </article>
            <article class="po-case-identity__block">
              <span class="po-panel-label">Case Details</span>
              <div class="po-case-identity__row"><span>Contact</span><strong id="po-app-modal-contact">--</strong></div>
              <div class="po-case-identity__row"><span>Batch No</span><strong id="po-app-modal-batch-no">--</strong></div>
              <div class="po-case-identity__row">
                <span>General category</span>
                <select id="po-app-modal-livelihood-category-input" class="section-filter">
                  <option value="">Select category</option>
                  <option value="Establishment">Establishment</option>
                  <option value="Buy and Sell">Buy and Sell</option>
                  <option value="Homemade">Homemade</option>
                  <option value="Livestock">Livestock</option>
                  <option value="Services">Services</option>
                </select>
              </div>
              <div class="po-case-identity__row"><span>Specific business type</span><strong id="po-app-modal-livelihood">--</strong></div>
              <div class="po-case-identity__row"><span>Sector</span><strong id="po-app-modal-sector">--</strong></div>
              <div class="po-case-identity__row"><span>Other sector</span><strong id="po-app-modal-sector-other">--</strong></div>
            </article>
          </section>

          <section class="po-readiness-panel">
            <div class="po-readiness-panel__header">
              <div>
                <span class="po-panel-label">Readiness Summary</span>
                <h6 id="po-app-readiness-status">Under Review</h6>
              </div>
              <span class="po-status-chip" id="po-app-training-chip">Training Pending</span>
            </div>
            <div class="po-readiness-grid">
              <article class="po-readiness-card"><span>Upload Requirements</span><strong id="po-app-upload-summary">0 / 0</strong></article>
              <article class="po-readiness-card"><span>Fill-up Form Requirements</span><strong id="po-app-form-summary">0 / 0</strong></article>
              <article class="po-readiness-card"><span>Training Status</span><strong id="po-app-training-status">--</strong></article>
              <article class="po-readiness-card"><span>Proof of Assistance</span><strong id="po-app-assistance-proof-status">--</strong></article>
            </div>
            <div class="po-blocker-box">
              <span class="po-panel-label">Blocking Reasons</span>
              <ul id="po-app-readiness-blockers" class="po-blocker-list">
                <li>No blocking reasons.</li>
              </ul>
            </div>
          </section>

          <section class="po-review-workspace">
            <article class="po-requirement-nav">
              <div class="po-review-section__header">
                <div>
                  <span class="po-panel-label">Requirement Navigator</span>
                  <h6>All Requirements</h6>
                </div>
                <span class="po-status-chip is-muted" id="po-review-total-count">0 items</span>
              </div>
              <div id="po-requirement-nav" class="po-requirement-nav__list">
                <div class="po-preview-empty">No requirements loaded.</div>
              </div>
            </article>

            <article class="po-preview-panel">
              <div class="po-review-section__header">
                <div>
                  <span class="po-panel-label">Requirement Viewer</span>
                  <h6 id="po-preview-title">Select a requirement</h6>
                </div>
                <span class="po-status-chip is-muted" id="po-preview-chip">No preview</span>
              </div>
              <div id="po-app-preview" class="po-preview-surface">
                <div class="po-preview-empty">Select an uploaded requirement or fill-up form to review it here.</div>
              </div>
            </article>

            <article class="po-review-inspector">
              <div class="po-review-section__header">
                <div>
                  <span class="po-panel-label">Requirement Details</span>
                  <h6 id="po-inspector-title">Select a requirement</h6>
                </div>
                <span class="po-status-chip is-muted" id="po-inspector-chip">No selection</span>
              </div>
              <div id="po-review-inspector" class="po-review-inspector__body">
                <div class="po-preview-empty">Select a requirement from the navigator to review it.</div>
              </div>
            </article>
          </section>

          <section class="po-decision-panel">
            <label class="po-toggle-field" for="po-app-modal-assisted">
              <input type="checkbox" id="po-app-modal-assisted">
              <span>
                <strong>Already received assistance</strong>
                <small>Tag this applicant as already assisted so the case moves directly to the beneficiary record.</small>
              </span>
            </label>
            <article class="po-assisted-status-box" id="po-app-assisted-status" hidden>
              <strong id="po-app-assisted-status-title">Already an approved beneficiary</strong>
              <small id="po-app-assisted-status-copy">Assistance approval details will appear here.</small>
              <button type="button" class="btn btn-sm btn-outline-primary" id="po-app-assisted-record" hidden>Record Assistance Received Now</button>
            </article>
          </section>
        </div>
        <div class="modal-footer">
          <div class="po-decision-rail">
            <div class="po-decision-rail__summary">
              <span class="po-panel-label">Decision Control</span>
              <strong id="po-decision-status-note">Review readiness is pending.</strong>
              <small id="po-decision-blocker-note">Resolve any blocking requirement or training issue before approval.</small>
            </div>
            <div class="po-decision-rail__actions">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
              <button type="button" class="btn btn-danger" id="po-app-modal-reject">Reject</button>
              <button type="button" class="btn btn-success" id="po-app-modal-approve">Approve</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="poApprovalSummaryModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable po-summary-modal-dialog">
      <div class="modal-content po-summary-modal">
        <div class="modal-header">
          <div class="po-modal-title-block">
            <span class="po-modal-eyebrow">Application Case</span>
            <h5 class="modal-title">Approval Readiness Summary</h5>
            <small id="po-summary-applicant">Applicant</small>
          </div>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <section class="po-summary-hero">
            <div class="po-summary-hero__copy">
              <span class="po-panel-label">Final Approval Check</span>
              <h6 id="po-summary-case-title">Readiness review</h6>
              <p id="po-summary-readiness-text">Review readiness is pending.</p>
            </div>
            <div class="po-summary-hero__status">
              <span class="po-status-pill po-status-chip--header" id="po-summary-status-chip">Pending</span>
            </div>
          </section>
          <div class="po-summary-grid">
            <article class="po-summary-card">
              <span>Barangay</span>
              <strong id="po-summary-barangay">--</strong>
              <small>Scoped review area</small>
            </article>
            <article class="po-summary-card">
              <span>Upload Requirements</span>
              <strong id="po-summary-upload">0 / 0</strong>
              <small>Approved required uploads</small>
            </article>
            <article class="po-summary-card">
              <span>Fill-up Form Requirements</span>
              <strong id="po-summary-form">0 / 0</strong>
              <small>Verified application forms</small>
            </article>
            <article class="po-summary-card">
              <span>Training Status</span>
              <strong id="po-summary-training">--</strong>
              <small>PDO-verified seminar progress</small>
            </article>
            <article class="po-summary-card">
              <span>Proof of Assistance</span>
              <strong id="po-summary-assistance-proof">--</strong>
              <small>PDO upload — proof assistance was released</small>
            </article>
          </div>
          <div class="po-summary-layout">
            <section class="po-summary-section">
              <div class="po-summary-section__header">
                <span class="po-panel-label">Checklist</span>
                <h6>Requirement Checklist</h6>
              </div>
              <div class="po-summary-checklist" id="po-summary-checklist"></div>
            </section>
            <aside class="po-summary-section po-summary-section--decision">
              <div class="po-summary-section__header">
                <span class="po-panel-label">Approval Control</span>
                <h6>Blocking Reasons</h6>
              </div>
              <ul class="po-blocker-list" id="po-summary-blockers"></ul>
            </aside>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" id="po-summary-back" data-bs-dismiss="modal">Back</button>
          <button type="button" class="btn btn-success" id="po-summary-confirm">Confirm Approval</button>
        </div>
      </div>
    </div>
  </div>

  <div class="admin-beneficiary-modal" id="poBeneficiaryModal" hidden>
    <button type="button" class="admin-beneficiary-modal__backdrop" data-po-beneficiary-modal-close aria-label="Close beneficiary details"></button>
    <section class="admin-beneficiary-modal__panel" role="dialog" aria-modal="true" aria-labelledby="poBeneficiaryModalTitle">
      <div class="admin-beneficiary-modal__header">
        <div>
          <span class="admin-inline-pill">Beneficiary</span>
          <h3 id="poBeneficiaryModalTitle">Beneficiary Details</h3>
        </div>
        <button type="button" class="app-btn-outline" data-po-beneficiary-modal-close>Close</button>
      </div>
      <div class="admin-beneficiary-modal__body" id="poBeneficiaryModalBody"></div>
      <div class="admin-beneficiary-modal__footer">
        <button type="button" class="team-action-button team-action-button--soft" data-po-beneficiary-modal-close>Close</button>
      </div>
    </section>
  </div>

  <div class="po-toast-stack" id="poToastStack" aria-live="polite" aria-atomic="true"></div>
  <div id="modal-root"></div>

  <!-- Attendance check modal for the PDO training pipeline overview -->
  <div class="po-attendance-modal-backdrop" id="poAttendanceModalBackdrop" hidden aria-hidden="true"></div>
  <div class="po-attendance-modal" id="poAttendanceModal" hidden role="dialog" aria-modal="true" aria-labelledby="poAttendanceModalTitle">
    <div class="po-attendance-modal__dialog">
      <header class="po-attendance-modal__header">
        <div class="atm-header-top">
          <div class="atm-header-eyebrow"><i class="fas fa-chalkboard-user"></i> Attendance Check</div>
          <button type="button" class="po-attendance-modal__close" id="poAttendanceModalClose" aria-label="Close attendance modal">&times;</button>
        </div>
        <div id="poAttendanceModalMeta"></div>
      </header>
      <div class="po-attendance-modal__body" id="poAttendanceModalBody"></div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" crossorigin="anonymous"></script>
  <script src="<?= $baseUrl ?>/assets/js/dashboards/repayment-review-workspace.js?v=<?= $repaymentWorkspaceJsVersion ?>" defer></script>
  <script src="<?= $baseUrl ?>/assets/js/shared/notifications.js?v=<?= $notificationsJsVersion ?>" defer></script>
  <script src="<?= $baseUrl ?>/assets/js/modules/reports.js?v=<?= urlencode((string) $reportsModuleJsVersion) ?>" defer></script>
  <script src="<?= $baseUrl ?>/assets/js/dashboards/project-officer.js?v=<?= $projectOfficerJsVersion ?>" defer></script>
</body>
</html>
