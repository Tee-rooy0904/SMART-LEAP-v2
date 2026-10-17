<?php
declare(strict_types=1);

use App\Controllers\AdminDashboardController;
use App\Controllers\ApplicantDashboardController;
use App\Controllers\AuthController;
use App\Controllers\BeneficiaryDashboardController;
use App\Controllers\PortalController;
use App\Controllers\PostApprovalReviewController;
use App\Controllers\ProjectOfficerController;
use App\Controllers\ReportController;
use App\Controllers\SignupController;
use App\Controllers\SocialWorkerController;
use App\Controllers\StageOneRegistrationController;
use App\Controllers\TrainingWorkspaceController;

return [
    'GET /' => ['handler' => [AuthController::class, 'showLogin'], 'middleware' => ['guest']],
    'GET /login' => ['handler' => [AuthController::class, 'showLogin'], 'middleware' => ['guest']],
    'GET /portal/login' => ['handler' => [AuthController::class, 'showPortalLogin'], 'middleware' => ['guest']],
    'GET /portal-login' => ['handler' => [AuthController::class, 'showPortalLogin'], 'middleware' => ['guest']],
    'GET /forgot-password' => ['handler' => [AuthController::class, 'showForgotPassword'], 'middleware' => ['guest']],
    'GET /reset-password' => ['handler' => [AuthController::class, 'showResetPassword'], 'middleware' => ['guest']],
    'POST /account/change-password' => ['handler' => [AuthController::class, 'changePassword'], 'middleware' => ['auth']],
    'POST /account/profile-photo' => ['handler' => [AuthController::class, 'saveProfilePhoto'], 'middleware' => ['auth']],
    'GET /portal' => ['handler' => [PortalController::class, 'show']],
    'GET /portal/about-smart-leap' => ['handler' => [PortalController::class, 'showAbout']],
    'GET /portal/guide' => ['handler' => [PortalController::class, 'showGuide']],
    'GET /portal/requirements' => ['handler' => [PortalController::class, 'showRequirements']],
    'GET /portal/how-to-apply' => ['handler' => [PortalController::class, 'showHowToApply']],
    'GET /portal/how-it-works' => ['handler' => [PortalController::class, 'showHowItWorks']],
    'GET /portal/beneficiary-guide' => ['handler' => [PortalController::class, 'showBeneficiaryGuide']],
    'GET /portal/help-center' => ['handler' => [PortalController::class, 'showHelpCenter']],
    'GET /portal/help' => ['handler' => [PortalController::class, 'showHelp']],
    'GET /portal/tracker' => ['handler' => [PortalController::class, 'trackStatus']],
    'GET /portal/apply' => ['handler' => [StageOneRegistrationController::class, 'show']],
    'POST /portal/apply/email-code' => ['handler' => [StageOneRegistrationController::class, 'requestEmailVerification']],
    'POST /portal/apply' => ['handler' => [StageOneRegistrationController::class, 'submit']],
    'GET /signup' => ['handler' => [SignupController::class, 'show'], 'middleware' => ['guest']],
    'POST /signup' => ['handler' => [SignupController::class, 'register'], 'middleware' => ['guest']],
    'GET /profile-completion' => ['handler' => [ApplicantDashboardController::class, 'redirectProfileCompletion'], 'middleware' => ['auth', 'applicant']],
    'GET /profile-completion/state' => ['handler' => [ApplicantDashboardController::class, 'profileState'], 'middleware' => ['auth', 'applicant']],
    'POST /profile-completion/save' => ['handler' => [ApplicantDashboardController::class, 'saveProfileDraft'], 'middleware' => ['auth', 'applicant']],
    'POST /profile-completion/submit' => ['handler' => [ApplicantDashboardController::class, 'submitProfile'], 'middleware' => ['auth', 'applicant']],
    'GET /admin' => ['handler' => [AdminDashboardController::class, 'show'], 'middleware' => ['auth', 'admin']],
    'GET /admin/state' => ['handler' => [AdminDashboardController::class, 'state'], 'middleware' => ['auth', 'admin']],
    'POST /admin/beneficiaries/status' => ['handler' => [AdminDashboardController::class, 'updateBeneficiaryStatus'], 'middleware' => ['auth', 'admin']],
    'POST /admin/co-maker-registrations/review' => ['handler' => [AdminDashboardController::class, 'reviewCoMakerRegistration'], 'middleware' => ['auth', 'admin']],
    'GET /admin/reports/export/csv' => ['handler' => [ReportController::class, 'exportCsv'], 'middleware' => ['auth', 'admin']],
    'GET /admin/reports/export/excel' => ['handler' => [ReportController::class, 'exportExcel'], 'middleware' => ['auth', 'admin']],
    
    'GET /admin/reports/export/pdf' => ['handler' => [ReportController::class, 'exportPdf'], 'middleware' => ['auth', 'admin']],
    'GET /admin/training' => ['handler' => [TrainingWorkspaceController::class, 'showAdmin'], 'middleware' => ['auth', 'admin']],
    'GET /admin/training/session' => ['handler' => [TrainingWorkspaceController::class, 'showAdmin'], 'middleware' => ['auth', 'admin']],
    'GET /admin/training/eligible-applicants' => ['handler' => [TrainingWorkspaceController::class, 'showAdmin'], 'middleware' => ['auth', 'admin']],
    'GET /admin/training/assignment' => ['handler' => [TrainingWorkspaceController::class, 'showAdmin'], 'middleware' => ['auth', 'admin']],
    'GET /admin/training/forms' => ['handler' => [TrainingWorkspaceController::class, 'showAdmin'], 'middleware' => ['auth', 'admin']],
    'GET /admin/training/notices' => ['handler' => [TrainingWorkspaceController::class, 'showAdmin'], 'middleware' => ['auth', 'admin']],
    'GET /admin/training/attendance' => ['handler' => [TrainingWorkspaceController::class, 'showAdmin'], 'middleware' => ['auth', 'admin']],
    'GET /project-officer' => ['handler' => [ProjectOfficerController::class, 'show'], 'middleware' => ['auth', 'project_officer']],
    'GET /pdo/reports/data' => ['handler' => [ProjectOfficerController::class, 'reportData'], 'middleware' => ['auth', 'project_officer']],
    'GET /pdo/reports/export/csv' => ['handler' => [ReportController::class, 'exportCsv'], 'middleware' => ['auth', 'project_officer']],
    'GET /pdo/reports/export/excel' => ['handler' => [ReportController::class, 'exportExcel'], 'middleware' => ['auth', 'project_officer']],
    'GET /pdo/reports/export/pdf' => ['handler' => [ReportController::class, 'exportPdf'], 'middleware' => ['auth', 'project_officer']],
    'POST /pdo/beneficiaries/status' => ['handler' => [ProjectOfficerController::class, 'updateBeneficiaryStatus'], 'middleware' => ['auth', 'project_officer']],
    'POST /pdo/co-maker-registrations/send-email' => ['handler' => [ProjectOfficerController::class, 'sendCoMakerRegistrationEmail'], 'middleware' => ['auth', 'project_officer']],
    'POST /pdo/beneficiaries/assistance-received' => ['handler' => [ProjectOfficerController::class, 'recordBeneficiaryAssistanceReceived'], 'middleware' => ['auth', 'project_officer']],
    'GET /pdo/training' => ['handler' => [TrainingWorkspaceController::class, 'showPdo'], 'middleware' => ['auth', 'project_officer']],
    'GET /pdo/training/session' => ['handler' => [TrainingWorkspaceController::class, 'showPdo'], 'middleware' => ['auth', 'project_officer']],
    'GET /pdo/training/operations' => ['handler' => [TrainingWorkspaceController::class, 'showPdo'], 'middleware' => ['auth', 'project_officer']],
    'GET /social-worker' => ['handler' => [SocialWorkerController::class, 'show'], 'middleware' => ['auth', 'social_worker']],
    'GET /social-worker/overview-data' => ['handler' => [SocialWorkerController::class, 'overviewData'], 'middleware' => ['auth', 'social_worker']],
    'GET /social-worker/reports/export/csv' => ['handler' => [ReportController::class, 'exportCsv'], 'middleware' => ['auth', 'admin_or_social_worker']],
    'GET /social-worker/reports/export/excel' => ['handler' => [ReportController::class, 'exportExcel'], 'middleware' => ['auth', 'admin_or_social_worker']],
    'GET /social-worker/reports/export/pdf' => ['handler' => [ReportController::class, 'exportPdf'], 'middleware' => ['auth', 'admin_or_social_worker']],
    'GET /applicant-dashboard' => ['handler' => [ApplicantDashboardController::class, 'show'], 'middleware' => ['auth', 'applicant']],
    'GET /applicant-dashboard/profile/state' => ['handler' => [ApplicantDashboardController::class, 'profileState'], 'middleware' => ['auth', 'applicant']],
    'POST /applicant-dashboard/profile/save' => ['handler' => [ApplicantDashboardController::class, 'saveProfileDraft'], 'middleware' => ['auth', 'applicant']],
    'POST /applicant-dashboard/profile/submit' => ['handler' => [ApplicantDashboardController::class, 'submitProfile'], 'middleware' => ['auth', 'applicant']],
    'POST /applicant-dashboard/profile/photo' => ['handler' => [ApplicantDashboardController::class, 'saveProfilePhoto'], 'middleware' => ['auth', 'applicant']],
    'GET /applicant/training' => ['handler' => [TrainingWorkspaceController::class, 'showApplicant'], 'middleware' => ['auth', 'applicant']],
    'GET /applicant/training/forms' => ['handler' => [TrainingWorkspaceController::class, 'showApplicant'], 'middleware' => ['auth', 'applicant']],
    'GET /applicant/training/notices' => ['handler' => [TrainingWorkspaceController::class, 'showApplicant'], 'middleware' => ['auth', 'applicant']],
    'GET /applicant-dashboard/state' => ['handler' => [ApplicantDashboardController::class, 'state'], 'middleware' => ['auth', 'applicant']],
    'GET /applicant-dashboard/certificate/download' => ['handler' => [ApplicantDashboardController::class, 'downloadCertificate'], 'middleware' => ['auth', 'applicant']],
    'GET /post-approval' => ['handler' => [ApplicantDashboardController::class, 'showPostApproval'], 'middleware' => ['auth', 'applicant']],
    'GET /post-approval-form' => ['handler' => [ApplicantDashboardController::class, 'showPostApprovalForm'], 'middleware' => ['auth', 'applicant']],
    'GET /application-form-file' => ['handler' => [ApplicantDashboardController::class, 'showApplicationFormFile'], 'middleware' => ['auth', 'applicant']],
    'GET /post-approval-review' => ['handler' => [PostApprovalReviewController::class, 'show'], 'middleware' => ['auth']],
    'GET /beneficiary-dashboard' => ['handler' => [BeneficiaryDashboardController::class, 'show'], 'middleware' => ['auth', 'beneficiary']],
];
