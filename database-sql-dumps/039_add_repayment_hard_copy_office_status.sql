ALTER TABLE repayments
    ADD COLUMN hard_copy_office_status VARCHAR(40) NOT NULL DEFAULT 'not_submitted' AFTER proof_mime_type;
