<?php
declare(strict_types=1);

use App\Controllers\RepaymentController;

return [
    'GET /api/repayments' => ['handler' => [RepaymentController::class, 'index'], 'middleware' => ['auth']],
    'POST /api/repayments/update-data' => ['handler' => [RepaymentController::class, 'updateData'], 'middleware' => ['auth']],
    'POST /api/repayments/review' => ['handler' => [RepaymentController::class, 'review'], 'middleware' => ['auth']],
    'POST /beneficiary-dashboard/repayments/submit' => ['handler' => [RepaymentController::class, 'submitBeneficiary'], 'middleware' => ['auth', 'beneficiary']],
];
