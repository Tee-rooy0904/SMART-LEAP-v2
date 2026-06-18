<?php
declare(strict_types=1);

return static function (): bool {
    return !is_authenticated();
};