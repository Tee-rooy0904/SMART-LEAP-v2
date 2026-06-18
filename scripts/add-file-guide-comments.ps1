$ErrorActionPreference = 'Stop'

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$repoRoot = Split-Path -Parent $PSScriptRoot
$reportPath = Join-Path $repoRoot 'tmp/file-guide-commented.txt'

function RelativePath([string]$root, [string]$path) {
    $normalizedRoot = [System.IO.Path]::GetFullPath($root).TrimEnd('\', '/')
    $normalizedPath = [System.IO.Path]::GetFullPath($path)
    if ($normalizedPath.StartsWith($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $normalizedPath.Substring($normalizedRoot.Length).TrimStart('\', '/')
    }
    return $normalizedPath
}

function Humanize([string]$name) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($name)
    $base = $base -replace '([a-z0-9])([A-Z])', '$1 $2'
    $base = $base -replace '[-_]+', ' '
    $base = $base -replace '\s+', ' '
    return $base.Trim()
}

function BuildHeader([string]$relativePath) {
    $path = $relativePath.Replace('\', '/')
    $name = [System.IO.Path]::GetFileName($path)

    $custom = @{
        'app/controllers/AdminDashboardController.php' = @(
            'Admin dashboard controller for the SMART LEAP control center.',
            'Renders the main admin shell, serves live overview state, and handles admin-only beneficiary and co-maker review actions triggered from the dashboard UI.'
        )
        'app/controllers/ApplicantDashboardController.php' = @(
            'Applicant portal controller for the private Stage 2 workspace.',
            'Owns applicant dashboard rendering, profile completion endpoints, dashboard state, certificate download, and the applicant-side post-approval entry pages.'
        )
        'app/controllers/ApplicationController.php' = @(
            'Application workflow controller used by reviewer workspaces.',
            'Handles application lists, record review, requirement review, assessment saves, applicant data correction, and PDO livelihood category updates.'
        )
        'app/controllers/AuthController.php' = @(
            'Authentication controller for staff and portal users.',
            'Owns sign-in, account verification, password reset, password change, profile photo save, and logout flows across public and staff entry points.'
        )
        'app/controllers/BeneficiaryDashboardController.php' = @(
            'Beneficiary portal controller for the post-approval workspace.',
            'Renders the beneficiary dashboard, serves live repayment/profile state, accepts beneficiary profile updates, feedback, and profile photo changes.'
        )
        'app/controllers/PortalController.php' = @(
            'Public portal content controller.',
            'Serves the information pages, portal quick-view home page, public tracker lookup, and public guidance pages such as requirements and how to apply.'
        )
        'app/controllers/PostApprovalComplianceController.php' = @(
            'Applicant and beneficiary post-approval form controller.',
            'Handles save, submit, show, and upload actions for availment and related compliance form payloads inside the post-approval workspace.'
        )
        'app/controllers/PostApprovalReviewController.php' = @(
            'Reviewer controller for post-approval submissions.',
            'Serves the staff review workspace, task detail lookups, review decisions, and supporting file uploads for post-approval requirements.'
        )
        'app/controllers/ProjectOfficerController.php' = @(
            'Project Development Officer dashboard controller.',
            'Renders the PDO workspace and accepts scoped beneficiary status changes, assistance receipt recording, co-maker review, and PDO repayment report data requests.'
        )
        'app/controllers/RepaymentController.php' = @(
            'Repayment workflow controller for beneficiary uploads and staff review.',
            'Handles repayment listings, beneficiary submission, data correction, and review actions across admin, social worker, PDO, and beneficiary workspaces.'
        )
        'app/controllers/ReportController.php' = @(
            'Shared reporting controller for admin and social worker export actions.',
            'Builds report datasets and export output for CSV, Excel-style markup, and printable report pages.'
        )
        'app/controllers/SocialWorkerController.php' = @(
            'Social worker dashboard controller.',
            'Renders the social worker oversight workspace used for applicant monitoring, beneficiary oversight, reports, and help-desk access.'
        )
        'app/controllers/StageOneRegistrationController.php' = @(
            'Stage 1 public registration controller.',
            'Serves the public pre-screening form and the admin validation endpoints used to review, select, or save public registrants for a future batch.'
        )
        'app/controllers/TeamController.php' = @(
            'Team management controller for staff accounts and signatures.',
            'Owns staff roster list/create/update actions, status changes, self-profile editing, and signature state/upload endpoints.'
        )
        'app/controllers/TrainingController.php' = @(
            'Training operations controller for admin and PDO staff.',
            'Handles training session CRUD, invitee syncing, notice sending, attendance updates, and training session deletion.'
        )
        'app/controllers/TrainingWorkspaceController.php' = @(
            'Training workspace page router.',
            'Maps admin, PDO, and applicant training URLs to the correct static training HTML workspace and injects authenticated bootstrap data.'
        )
        'app/services/ApplicationService.php' = @(
            'Core application workflow service.',
            'Owns applicant/application retrieval, reviewer detail payloads, requirement review logic, assessment persistence, dashboard summaries, and workflow readiness calculations.'
        )
        'app/services/ApplicantDashboardService.php' = @(
            'Applicant dashboard state service.',
            'Builds the private applicant workspace payload: profile progress, application review state, requirement summaries, training progress, post-approval summary, and next-step guidance.'
        )
        'app/services/AttendanceService.php' = @(
            'Training attendance rules service.',
            'Applies attendance updates, unlocks or revokes post-approval access, and enforces the training completion workflow tied to attendance records.'
        )
        'app/services/AuthService.php' = @(
            'Authentication and account lifecycle service.',
            'Handles login access rules, applicant or portal account registration, password reset and verification challenges, role-based redirects, and session payload creation.'
        )
        'app/services/BeneficiaryProfileService.php' = @(
            'Beneficiary profile and status service.',
            'Promotes approved applicants into beneficiary records, updates beneficiary statuses, tracks assistance receipt, and manages successor/co-maker repayment links.'
        )
        'app/services/CoMakerRegistrationService.php' = @(
            'Co-maker registration service for deceased-beneficiary repayment succession.',
            'Builds public and staff registration flows, stores co-maker documents, reviews registrations, creates linked accounts, and syncs successor beneficiary records.'
        )
        'app/services/DashboardMetricsService.php' = @(
            'Shared dashboard metrics aggregator.',
            'Builds KPI, distribution, queue, and overview datasets that feed role dashboards such as admin, social worker, and PDO.'
        )
        'app/services/PortalService.php' = @(
            'Public portal quick-view and tracker service.',
            'Builds the portal home quick-view for applicants, beneficiaries, or co-makers and resolves public tracker progress by application reference code.'
        )
        'app/services/PostApprovalComplianceService.php' = @(
            'Post-approval form engine for applicant and beneficiary compliance records.',
            'Defines supported form payloads, validation, save/submit logic, upload handling, completion percentages, and task definitions for availment and related documents.'
        )
        'app/services/PostApprovalReviewService.php' = @(
            'Staff review service for post-approval submissions.',
            'Loads reviewer queues, task detail data, file context, and applies review decisions for applicant or beneficiary post-approval records.'
        )
        'app/services/ReportService.php' = @(
            'Reporting service for admin, social worker, and PDO reports.',
            'Builds filtered repayment, beneficiary, application, and training analytics datasets, including export-ready summaries, KPI cards, and chart series.'
        )
        'app/services/RepaymentLedgerService.php' = @(
            'Repayment data orchestration service.',
            'Builds repayment rosters, beneficiary upload context, repayment review payloads, and staff-facing repayment state used across dashboard and report pages.'
        )
        'app/services/StageOneRegistrationService.php' = @(
            'Stage 1 public registration and batch-selection service.',
            'Validates public registration submissions, stores business and valid-ID files, enforces yearly batch capacity, and sends Stage 2 invitation emails to selected registrants.'
        )
        'app/services/SupportService.php' = @(
            'Support ticket workflow service.',
            'Creates, lists, routes, updates, and audits help-desk tickets, messages, attachments, and ticket activity for portal users and staff.'
        )
        'app/services/TeamService.php' = @(
            'Staff team management service.',
            'Builds the team roster, creates and updates staff accounts, syncs barangay assignments, manages account status, and stores signature metadata.'
        )
        'app/services/TrainingEligibilityService.php' = @(
            'Training eligibility evaluation service.',
            'Determines which applicants are ready for training based on application status, requirement approvals, staff assignment, and scope rules.'
        )
        'app/services/TrainingService.php' = @(
            'Training session and invitee workflow service.',
            'Builds training overviews, session detail payloads, invitee lists, notice state, attendance context, and training-related analytics.'
        )
        'app/views/dashboards/admin.php' = @(
            'Admin Control Center view shell.',
            'Defines the admin sidebar and section mounts for Dashboard, Application for Validation, Applications, Training, Team, Co-maker Registrations, Beneficiaries, Repayments, and Reports.'
        )
        'app/views/dashboards/project-officer.php' = @(
            'Project Development Officer dashboard view shell.',
            'Contains the PDO dashboard snapshots, scoped training pipeline, beneficiary roster, open repayments modal, beneficiary detail modal, application review modal, and PDO repayment/training report filters.'
        )
        'app/views/dashboards/social-worker.php' = @(
            'Social worker dashboard view shell.',
            'Hosts the social worker overview KPIs plus the applicant list, beneficiary oversight, report export area, and help-desk/support section.'
        )
        'app/views/dashboards/applicant.php' = @(
            'Private applicant portal view.',
            'Defines the applicant overview, profile editor, application workspace, requirement upload area, training status panels, support/help-desk UI, and account controls.'
        )
        'app/views/dashboards/beneficiary.php' = @(
            'Beneficiary portal view.',
            'Defines the beneficiary overview, profile editor, repayment upload/review workspace, repayment tracker, support area, and beneficiary activity sections.'
        )
        'app/views/dashboards/post-approval-form.php' = @(
            'Post-approval form workspace view.',
            'Renders the applicant or beneficiary form-filling interface for availment and related compliance forms, including autosave and submission controls.'
        )
        'app/views/dashboards/post-approval-review.php' = @(
            'Staff post-approval review workspace view.',
            'Provides the reviewer-facing panel for checking submitted post-approval forms, reviewer notes, supporting uploads, and approval or correction actions.'
        )
        'app/views/dashboards/training-static-page.php' = @(
            'Training workspace wrapper view.',
            'Loads one of the static training HTML pages and injects the authenticated base URL and current user bootstrap values used by the training scripts.'
        )
        'app/views/dashboards/admin/sections/validation.php' = @(
            'Admin validation section partial.',
            'Renders the Stage 1 intake validation board with pending, selected, and saved tabs plus the Open Validation action that launches per-registrant review.'
        )
        'app/views/dashboards/admin/sections/beneficiaries.php' = @(
            'Admin beneficiaries section partial.',
            'Contains beneficiary snapshots, roster filters, export and refresh buttons, and the admin beneficiary detail/status modal.'
        )
        'app/views/dashboards/admin/sections/repayments.php' = @(
            'Admin repayments section partial.',
            'Contains beneficiary repayment filters, repayment roster, repayment review modal, and repayment detail panes for upload verification and status actions.'
        )
        'app/views/dashboards/admin/sections/reports.php' = @(
            'Admin reports section partial.',
            'Hosts the shared reporting filters, KPI cards, chart containers, export buttons, and report table used by the admin reports module.'
        )
        'app/views/public/portal.php' = @(
            'Public SMART LEAP portal home page.',
            'Shows the public entry hero, Apply Now flow, quick-view tracker for signed-in portal users, and top-level guidance links for the two-stage application process.'
        )
        'app/views/public/stage-one-registration.php' = @(
            'Stage 1 public registration page.',
            'Contains the public intake form for initial applicant details, valid ID upload, and existing-business proof before admin batch validation.'
        )
        'app/views/public/login.php' = @(
            'Staff login page for the internal SMART LEAP workspace.',
            'Defines the sign-in UI used by Admin, Social Worker, and Project Development Officer users to enter the CSWDD staff system.'
        )
        'app/views/public/staff-login.php' = @(
            'Staff login page for the internal SMART LEAP workspace.',
            'Defines the sign-in UI used by Admin, Social Worker, and Project Development Officer users to enter the CSWDD staff system.'
        )
        'app/views/public/portal-login.php' = @(
            'Portal login page for private SMART LEAP accounts.',
            'Defines the sign-in UI used by Stage 2 applicants, beneficiaries, and authorized co-makers to access the private portal.'
        )
        'app/views/public/signup.php' = @(
            'Stage 2 private account creation page.',
            'Lets selected registrants create a private applicant account, and also supports co-maker account creation when accessed from a co-maker invitation flow.'
        )
        'app/views/public/how-to-apply.php' = @(
            'Public How to Apply page.',
            'Explains the two-stage process from Stage 1 public registration, through admin batch validation, to Stage 2 private applicant portal access.'
        )
        'app/views/public/requirements.php' = @(
            'Public requirements checklist page.',
            'Shows the applicant document checklist, file quality reminders, and pre-submission notices before Stage 1 or Stage 2 uploads.'
        )
        'app/views/reports/print.php' = @(
            'Printable report export view.',
            'Formats filtered report data into a print-friendly layout used for PDF or print exports of SMART LEAP reports.'
        )
        'public/assets/js/dashboards/admin.js' = @(
            'Client-side controller for the Admin Control Center.',
            'Coordinates section switching, live state refresh, dashboard snapshots, validation flows, and admin-only modals together with the shared modules.'
        )
        'public/assets/js/dashboards/project-officer.js' = @(
            'Client-side controller for the PDO dashboard.',
            'Drives scoped applications, training pipeline views, attendance editor, notice sending, beneficiary roster, open repayments modal, beneficiary modal, and PDO repayment or training report updates.'
        )
        'public/assets/js/dashboards/social-worker.js' = @(
            'Client-side controller for the social worker dashboard.',
            'Handles section switching, applicant and beneficiary oversight state, report exports, and the social worker support/help-desk interface.'
        )
        'public/assets/js/dashboards/applicant.js' = @(
            'Client-side controller for the applicant portal.',
            'Updates the applicant overview, requirements and status cards, account menu, training panels, support workspace, and section navigation.'
        )
        'public/assets/js/dashboards/beneficiary.js' = @(
            'Client-side controller for the beneficiary portal.',
            'Updates beneficiary overview cards, repayment upload actions, repayment tracker, profile editing, and beneficiary support or activity views.'
        )
        'public/assets/js/dashboards/repayment-review-workspace.js' = @(
            'Shared repayment review modal script.',
            'Drives beneficiary repayment detail panels, uploaded-proof previews, review actions, month coverage context, and repayment modal interactions used by staff dashboards.'
        )
        'public/assets/js/modules/applications.js' = @(
            'Shared applications module for reviewer dashboards.',
            'Builds application KPIs, filters, lists, and the detailed application modal used in admin and social worker applicant-review sections.'
        )
        'public/assets/js/modules/beneficiaries.js' = @(
            'Shared beneficiaries module for staff dashboards.',
            'Builds beneficiary filters, roster rows, summary cards, export controls, and beneficiary detail/status modal content.'
        )
        'public/assets/js/modules/reports.js' = @(
            'Shared reporting module.',
            'Applies report filters, refreshes KPI cards, renders repayment and training charts, updates result tables, and triggers report exports for admin and social worker reports.'
        )
        'public/assets/js/modules/team.js' = @(
            'Shared team management module.',
            'Builds staff roster tables, team filters, add/edit staff modals, assignment controls, and signature management interactions.'
        )
        'public/assets/js/modules/training.js' = @(
            'Shared admin training module.',
            'Coordinates the admin training workspace entry points, session lists, and navigation into the dedicated training pages.'
        )
        'public/assets/js/modules/validation.js' = @(
            'Stage 1 validation module for the admin dashboard.',
            'Builds pending, selected, and saved registrant lists plus the per-record validation modal and review actions.'
        )
        'public/assets/js/public/stage-one-registration.js' = @(
            'Stage 1 public registration script.',
            'Validates the public intake form, manages upload previews or errors, and submits the Stage 1 registration request.'
        )
        'public/assets/js/public/signup.js' = @(
            'Stage 2 account creation script.',
            'Validates account creation fields, toggles password visibility, handles applicant/co-maker signup rules, and submits the signup form.'
        )
        'public/assets/js/public/verify-account.js' = @(
            'Account verification script.',
            'Handles verification code submission, resend actions, loading feedback, and redirect behavior after account verification succeeds.'
        )
    }

    if ($custom.ContainsKey($path)) {
        return $custom[$path]
    }

    if ($path -like 'app/models/*') {
        return @("Database model for $(Humanize $name) records.", 'Maps one SMART LEAP entity table and its row-level persistence behavior.')
    }
    if ($path -like 'app/helpers/*') {
        return @("Helper functions for $(Humanize $name).", 'Provides shared utility functions used across controllers, services, and views.')
    }
    if ($path -like 'app/middleware/*') {
        return @("Middleware for $(Humanize $name).", 'Applies access control or request guards before the matched route handler executes.')
    }
    if ($path -like 'app/config/*') {
        return @("Configuration file for $(Humanize $name).", 'Stores environment-driven settings used by the live SMART LEAP application.')
    }
    if ($path -like 'app/routes/*') {
        return @("Route definitions for $(Humanize $name).", 'Maps HTTP endpoints to controllers and middleware for this area of the SMART LEAP system.')
    }
    if ($path -like 'app/mail/templates/*') {
        return @("Email template for $(Humanize $name).", 'Renders the HTML body sent for this notification or workflow email.')
    }
    if ($path -like 'app/mail/partials/*') {
        return @("Reusable email partial for $(Humanize $name).", 'Provides shared email layout markup used by SMART LEAP mail templates.')
    }
    if ($path -like 'app/views/layouts/*') {
        return @("Layout template for $(Humanize $name).", 'Provides shared shell markup used by one or more SMART LEAP pages.')
    }
    if ($path -like 'app/views/partials/*') {
        return @("Reusable view partial for $(Humanize $name).", 'Encapsulates a shared UI fragment that is rendered inside larger SMART LEAP pages.')
    }
    if ($path -like 'app/views/errors/*') {
        return @("Error page view for $(Humanize $name).", 'Shows the user-facing fallback page for this HTTP error condition.')
    }
    if ($path -like 'app/views/public/*') {
        return @("Public portal view for $(Humanize $name).", 'Defines one public-facing SMART LEAP page used before or outside the private applicant or beneficiary dashboards.')
    }
    if ($path -like 'app/views/dashboards/admin/sections/*') {
        return @("Admin section partial for $(Humanize $name).", 'Provides the markup mount for one area of the Admin Control Center and its related tables, filters, or modal containers.')
    }
    if ($path -like 'app/views/dashboards/*') {
        return @("Dashboard view for $(Humanize $name).", 'Defines a live role-based SMART LEAP workspace and the markup mounts that its frontend scripts control.')
    }
    if ($path -like 'app/views/reports/*') {
        return @("Report view for $(Humanize $name).", 'Formats SMART LEAP report output for preview, print, or export.')
    }
    if ($path -like 'app/controllers/*') {
        return @("Controller for $(Humanize $name) routes.", 'Accepts HTTP requests for this feature area and delegates business logic to the appropriate service layer.')
    }
    if ($path -like 'app/services/*') {
        return @("Service layer for $(Humanize $name).", 'Contains the business rules, workflow orchestration, and data-shaping logic for this SMART LEAP feature area.')
    }
    if ($path -like 'public/assets/js/shared/*') {
        return @("Shared frontend helper for $(Humanize $name).", 'Provides reusable browser-side utilities consumed by multiple SMART LEAP pages or modules.')
    }
    if ($path -like 'public/assets/js/modules/*') {
        return @("Frontend module for $(Humanize $name).", 'Builds one reusable dashboard section, table, chart, or modal workflow inside the staff workspaces.')
    }
    if ($path -like 'public/assets/js/dashboards/*') {
        return @("Dashboard script for $(Humanize $name).", 'Controls one role-specific workspace page, including its live state, interactions, and any page-owned modals or drawers.')
    }
    if ($path -like 'public/assets/js/public/*') {
        return @("Public portal script for $(Humanize $name).", 'Handles browser-side behavior for one public SMART LEAP page or account-access flow.')
    }
    if ($path -like 'public/assets/js/training/*') {
        return @("Training workspace script for $(Humanize $name).", 'Controls one static training page used by admin, PDO, or applicant training flows.')
    }
    if ($path -like 'public/training/*.html') {
        return @("Training workspace page for $(Humanize $name).", 'Provides the static HTML shell that is injected into the authenticated training workspace wrapper.')
    }

    return @("SMART LEAP file for $(Humanize $name).", 'Supports one part of the live application codebase.')
}

function PhpCommentBlock([string[]]$lines) {
    $block = @('/**')
    foreach ($line in $lines) {
        $block += ' * ' + $line
    }
    $block += ' */'
    return $block
}

function JsCommentBlock([string[]]$lines) {
    $block = @('/*')
    foreach ($line in $lines) {
        $block += ' * ' + $line
    }
    $block += ' */'
    return $block
}

function HtmlCommentBlock([string[]]$lines) {
    $block = @('<!--')
    foreach ($line in $lines) {
        $block += '  ' + $line
    }
    $block += '-->'
    return $block
}

$files = @()
$files += Get-ChildItem (Join-Path $repoRoot 'app') -Recurse -File -Include *.php | ForEach-Object { $_.FullName }
$files += Get-ChildItem (Join-Path $repoRoot 'public/assets/js') -Recurse -File -Include *.js | ForEach-Object { $_.FullName }
$files += Get-ChildItem (Join-Path $repoRoot 'public/training') -Recurse -File -Include *.html | ForEach-Object { $_.FullName }

$changed = [System.Collections.Generic.List[string]]::new()

foreach ($fullPath in $files) {
    $relativePath = (RelativePath $repoRoot $fullPath).Replace('\', '/')
    $content = [System.IO.File]::ReadAllText($fullPath)
    if ($content.Contains('SMART LEAP FILE GUIDE')) {
        continue
    }

    $headerLines = @('SMART LEAP FILE GUIDE') + (BuildHeader $relativePath)
    $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
    $newContent = $content

    if ($ext -eq '.php') {
        $parts = $content -split "`r?`n", 2
        if ($parts.Count -gt 0 -and $parts[0].StartsWith('<?php')) {
            $comment = (PhpCommentBlock $headerLines) -join "`r`n"
            $newContent = if ($parts.Count -eq 1) {
                $parts[0] + "`r`n" + $comment + "`r`n"
            } else {
                $parts[0] + "`r`n" + $comment + "`r`n" + $parts[1]
            }
        }
    } elseif ($ext -eq '.js') {
        $comment = (JsCommentBlock $headerLines) -join "`r`n"
        $newContent = $comment + "`r`n" + $content
    } elseif ($ext -eq '.html') {
        $comment = (HtmlCommentBlock $headerLines) -join "`r`n"
        if ($content.StartsWith('<!DOCTYPE html>')) {
            $newContent = '<!DOCTYPE html>' + "`r`n" + $comment + $content.Substring(15)
        } else {
            $newContent = $comment + "`r`n" + $content
        }
    }

    if ($newContent -ne $content) {
        [System.IO.File]::WriteAllText($fullPath, $newContent, $utf8NoBom)
        $changed.Add($relativePath)
    }
}

[System.IO.File]::WriteAllLines($reportPath, $changed, $utf8NoBom)
Write-Output ('Commented files: ' + $changed.Count)
