<?php
declare(strict_types=1);

namespace App\Controllers;

abstract class Controller
{
    protected function view(string $view, array $data = [], int $status = 200): never
    {
        response_view($view, $data, $status);
    }

    protected function redirectTo(string $path): never
    {
        redirect($path);
    }
}