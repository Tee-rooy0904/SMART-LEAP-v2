ALTER TABLE beneficiary_profiles
    ADD COLUMN replacement_for_beneficiary_profile_id BIGINT UNSIGNED NULL AFTER assigned_staff_profile_id,
    ADD INDEX idx_beneficiary_profiles_replacement_for (replacement_for_beneficiary_profile_id);
