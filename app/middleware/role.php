<?php
declare(strict_types=1);

return static function (string ...$roles): bool {
    return has_role(...$roles);
};