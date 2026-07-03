ALTER TABLE training_programs
    MODIFY COLUMN training_scope_mode VARCHAR(20) NOT NULL DEFAULT 'batch',
    ADD COLUMN seminar_form_codes JSON NULL AFTER batch_group_size;

UPDATE training_programs
SET training_scope_mode = 'batch'
WHERE LOWER(TRIM(COALESCE(training_scope_mode, ''))) <> 'batch';
