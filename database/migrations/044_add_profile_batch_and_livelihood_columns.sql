ALTER TABLE applicant_profiles
    ADD COLUMN IF NOT EXISTS batch_no VARCHAR(40) NULL AFTER educational_attainment,
    ADD COLUMN IF NOT EXISTS sector_other_specify VARCHAR(160) NULL AFTER sector,
    ADD COLUMN IF NOT EXISTS livelihood_category VARCHAR(120) NULL AFTER sector_other_specify;
