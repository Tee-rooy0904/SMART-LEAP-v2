<?php
declare(strict_types=1);

namespace App\Models;

use PDO;

class InitialRequirementType
{
    public array $attributes = [];

    public static function all(): array
    {
        try {
            $stmt = db()->query("SELECT * FROM initial_requirement_types WHERE is_required = 1 AND code <> 'business_plan' ORDER BY id ASC");
            $results = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $model = new self();
                $model->attributes = $row;
                $results[] = $model;
            }
            return $results;
        } catch (\Throwable $e) {
            log_database_query_failure('InitialRequirementType::all', $e);
            return [];
        }
    }
}
