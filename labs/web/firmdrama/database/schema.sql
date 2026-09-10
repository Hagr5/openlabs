CREATE DATABASE IF NOT EXISTS firmdrama CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE firmdrama;

CREATE TABLE IF NOT EXISTS roles (
    id INT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    display_name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL,
    department VARCHAR(120) NOT NULL,
    phone_extension VARCHAR(20) NOT NULL DEFAULT '',
    is_login_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rooms (
    id INT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    floor VARCHAR(40) NOT NULL,
    capacity INT NOT NULL,
    confidentiality_level VARCHAR(60) NOT NULL,
    status VARCHAR(30) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dashboards (
    id INT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    dashboard_type VARCHAR(60) NOT NULL,
    created_at DATETIME NOT NULL,
    CONSTRAINT fk_dashboards_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    user_id INT NOT NULL,
    matter_code VARCHAR(40) NOT NULL,
    purpose VARCHAR(255) NOT NULL,
    starts_at DATETIME(6) NOT NULL,
    ends_at DATETIME(6) NOT NULL,
    status VARCHAR(30) NOT NULL,
    CONSTRAINT fk_bookings_room FOREIGN KEY (room_id) REFERENCES rooms(id),
    CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dashboard_booking_links (
    booking_id INT PRIMARY KEY,
    dashboard_id INT NOT NULL,
    CONSTRAINT fk_dashboard_booking_links_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
    CONSTRAINT fk_dashboard_booking_links_dashboard FOREIGN KEY (dashboard_id) REFERENCES dashboards(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversations (
    id INT PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    confidentiality VARCHAR(60) NOT NULL,
    created_at DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id INT NOT NULL,
    user_id INT NOT NULL,
    PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT fk_participants_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    CONSTRAINT fk_participants_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
    id INT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id INT NOT NULL,
    recipient_id INT NOT NULL,
    body TEXT NOT NULL,
    sender_role_id INT NOT NULL,
    created_at DATETIME NOT NULL,
    is_private BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id),
    CONSTRAINT fk_messages_recipient FOREIGN KEY (recipient_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
    id INT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    owner_id INT NOT NULL,
    status VARCHAR(30) NOT NULL,
    api_generation VARCHAR(10) NOT NULL,
    created_at DATETIME NOT NULL,
    CONSTRAINT fk_tickets_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS flags (
    id INT PRIMARY KEY,
    stage VARCHAR(30) NOT NULL UNIQUE,
    value CHAR(30) NOT NULL,
    generated_at DATETIME NOT NULL,
    reset_id CHAR(32) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS delegation_approvals (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    approval_hash CHAR(64) NOT NULL UNIQUE,
    intended_user_id INT NOT NULL,
    delegated_role_id INT NOT NULL,
    source_message_id INT NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME NULL,
    reset_id CHAR(32) NOT NULL,
    CONSTRAINT fk_delegation_approvals_user FOREIGN KEY (intended_user_id) REFERENCES users(id),
    CONSTRAINT fk_delegation_approvals_role FOREIGN KEY (delegated_role_id) REFERENCES roles(id),
    CONSTRAINT fk_delegation_approvals_message FOREIGN KEY (source_message_id) REFERENCES messages(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    actor_id INT NULL,
    action VARCHAR(100) NOT NULL,
    object_type VARCHAR(80) NOT NULL,
    object_id VARCHAR(80) NOT NULL,
    created_at DATETIME NOT NULL,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB;
