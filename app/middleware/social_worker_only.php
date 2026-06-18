<?php
declare(strict_types=1);

return static function (): bool {
    return has_role(ROLE_SOCIAL_WORKER);
};