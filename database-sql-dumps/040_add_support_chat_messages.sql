CREATE TABLE IF NOT EXISTS support_chat_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    participant_user_id BIGINT UNSIGNED NOT NULL,
    sender_user_id BIGINT UNSIGNED NOT NULL,
    recipient_role VARCHAR(80) NOT NULL,
    body TEXT NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_support_chat_participant_role (participant_user_id, recipient_role),
    INDEX idx_support_chat_sender (sender_user_id),
    CONSTRAINT fk_support_chat_participant FOREIGN KEY (participant_user_id) REFERENCES users(id),
    CONSTRAINT fk_support_chat_sender FOREIGN KEY (sender_user_id) REFERENCES users(id)
);
