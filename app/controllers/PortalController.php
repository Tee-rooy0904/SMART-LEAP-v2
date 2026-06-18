<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\PortalService;

class PortalController extends Controller
{
    public function show(): never
    {
        $portalService = new PortalService();
        $this->view('public/portal', [
            'authUser' => auth_user(),
            'quickView' => $portalService->quickViewForUser(auth_user()),
        ]);
    }

    public function showAbout(): never
    {
        $this->view('public/about-smart-leap');
    }

    public function showGuide(): never
    {
        $this->view('public/about-smart-leap');
    }

    public function showRequirements(): never
    {
        $requirements = [];
        try {
            $requirements = \App\Models\InitialRequirementType::all();
        } catch (\Throwable $e) {
            // Graceful fallback
        }
        $this->view('public/requirements', ['requirements' => $requirements]);
    }

    public function showHowToApply(): never
    {
        $this->view('public/how-to-apply');
    }

    public function showHowItWorks(): never
    {
        $this->view('public/how-to-apply');
    }

    public function showBeneficiaryGuide(): never
    {
        $this->view('public/beneficiary-guide');
    }

    public function showHelpCenter(): never
    {
        $this->view('public/help-center');
    }

    public function showHelp(): never
    {
        $this->view('public/help-center');
    }

    public function trackStatus(): never
    {
        $reference = trim((string) ($_GET['reference'] ?? ''));
        if ($reference === '') {
            response_json([
                'success' => false,
                'message' => 'Reference ID is required.',
            ], 422);
        }

        $tracker = (new PortalService())->trackerByReference($reference);
        if ($tracker === null) {
            response_json([
                'success' => false,
                'message' => 'No application record was found for that reference ID.',
            ], 404);
        }

        response_json([
            'success' => true,
            'message' => 'Application status loaded.',
            'data' => $tracker,
        ]);
    }
}
