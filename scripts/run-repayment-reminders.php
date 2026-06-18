<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script must be run from the command line.\n");
    exit(1);
}

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Services\RepaymentReminderService;

$startedAt = date('Y-m-d H:i:s');
$summary = (new RepaymentReminderService())->syncDaily();

fwrite(
    STDOUT,
    sprintf(
        "[%s] Repayment reminders synced. Beneficiaries processed: %d. Notifications created: %d.%s",
        $startedAt,
        (int) ($summary['beneficiaries'] ?? 0),
        (int) ($summary['notifications'] ?? 0),
        PHP_EOL
    )
);
