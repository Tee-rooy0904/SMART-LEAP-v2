<?php
declare(strict_types=1);

namespace App\Controllers;

class BeneficiaryDashboardController extends Controller
{
    public function show(): never
    {
        $this->redirectTo('applicant-dashboard#dashboard-home');
    }
}
