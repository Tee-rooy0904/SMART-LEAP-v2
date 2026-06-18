<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\BarangayAssignmentService;
use App\Services\TeamService;

class StaffAssignmentController extends Controller
{
    public function sync(): never
    {
        $service = new BarangayAssignmentService();
        $barangayIds = $_POST['barangayIds'] ?? [];
        if (!is_array($barangayIds)) {
            $barangayIds = [];
        }

        $result = $service->syncAssignments(
            (int) ($_POST['staffId'] ?? 0),
            $barangayIds,
            (int) (auth_user()['id'] ?? 0)
        );
        if (!$result['ok']) {
            response_json($result, 422);
        }

        response_json([
            'ok' => true,
            'staff' => (new TeamService())->listStaff(),
        ]);
    }
}
