<?php
declare(strict_types=1);

return static function (): bool {
    return has_role(ROLE_ADMIN, ROLE_SOCIAL_WORKER);
};
