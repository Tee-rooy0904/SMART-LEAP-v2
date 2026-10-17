USE smartleap;

ALTER TABLE account_verification_codes
    ADD COLUMN challenge_type VARCHAR(40) NOT NULL DEFAULT 'account_activation' AFTER user_id;

UPDATE account_verification_codes
SET challenge_type = 'account_activation'
WHERE challenge_type IS NULL OR challenge_type = '';

