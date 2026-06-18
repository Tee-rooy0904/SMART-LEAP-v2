<?php
/**
 * SMART LEAP FILE GUIDE
 * Route definitions for a pi p os t a pp ro va l.
 * Maps HTTP endpoints to controllers and middleware for this area of the SMART LEAP system.
 */

declare(strict_types=1);

use App\Controllers\PostApprovalComplianceController;
use App\Controllers\PostApprovalReviewController;

return [
    'GET /api/post-approval' => ['handler' => [PostApprovalComplianceController::class, 'index'], 'middleware' => ['auth', 'applicant']],
    'GET /api/post-approval/task' => ['handler' => [PostApprovalComplianceController::class, 'show'], 'middleware' => ['auth', 'applicant']],
    'POST /api/post-approval/save' => ['handler' => [PostApprovalComplianceController::class, 'save'], 'middleware' => ['auth', 'applicant']],
    'POST /api/post-approval/submit' => ['handler' => [PostApprovalComplianceController::class, 'submit'], 'middleware' => ['auth', 'applicant']],
    'POST /api/post-approval/upload' => ['handler' => [PostApprovalComplianceController::class, 'upload'], 'middleware' => ['auth', 'applicant']],
    'POST /api/post-approval/clear-upload' => ['handler' => [PostApprovalComplianceController::class, 'clearUpload'], 'middleware' => ['auth', 'applicant']],
    'GET /api/post-approval-review' => ['handler' => [PostApprovalReviewController::class, 'index'], 'middleware' => ['auth']],
    'GET /api/post-approval-review/task' => ['handler' => [PostApprovalReviewController::class, 'task'], 'middleware' => ['auth']],
    'POST /api/post-approval-review/review' => ['handler' => [PostApprovalReviewController::class, 'review'], 'middleware' => ['auth']],
    'POST /api/post-approval-review/upload' => ['handler' => [PostApprovalReviewController::class, 'upload'], 'middleware' => ['auth']],
];
