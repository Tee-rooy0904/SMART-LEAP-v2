<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\DashboardMetricsService;

class SocialWorkerController extends Controller
{
    public function show(): never
    {
        $user = auth_user() ?? [];
        $this->view('dashboards/social-worker', [
            'authUser' => $user,
            'overview' => (new DashboardMetricsService())->socialWorkerOverview($user),
        ]);
    }

    public function overviewData(): never
    {
        $user = auth_user();
        if ($user === null) {
            response_json(['ok' => false, 'message' => 'Unauthenticated.'], 401);
        }

        response_json([
            'ok' => true,
            'data' => (new DashboardMetricsService())->socialWorkerOverview($user),
        ]);
    }
}
