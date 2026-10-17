ALTER TABLE applicant_profiles
    ADD COLUMN IF NOT EXISTS educational_attainment VARCHAR(80) NULL AFTER household_size;
