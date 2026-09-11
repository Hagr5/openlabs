USE firmdrama;

INSERT INTO roles (id, name, description) VALUES
    (1, 'Associate', 'Normal employee access'),
    (3, 'Senior Partner', 'Partner access without Facilities administration'),
    (10, 'Facilities Operator', 'Operational ticket ownership'),
    (499, 'Managing Partner', 'Full Facilities Desk administration')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description);

INSERT INTO users (id, username, display_name, password_hash, role_id, department, phone_extension, is_login_enabled, created_at) VALUES
    (1, 'thisismike', 'Mike', 'pbkdf2_sha256$600000$ZmlybWRyYW1hLXBoYXNlMi1zYWx0$nYLT69TQ5tBo0M-FeRzzAPvgXLBKDoJIgG4bQYd6tG8', 1, 'Corporate', '4102', TRUE, '2026-01-10 09:00:00'),
    (2, 'james', 'James', 'disabled-james-record', 3, 'Corporate Litigation', '1701', FALSE, '2025-11-02 09:00:00'),
    (3, 'olivia', 'Olivia', 'disabled-olivia-record', 499, 'Executive Office', '1001', FALSE, '2025-08-18 09:00:00'),
    (4, 'facilities.ops', 'Facilities Operations', 'disabled-facilities-record', 10, 'Facilities', '2200', FALSE, '2025-12-01 09:00:00')
ON DUPLICATE KEY UPDATE username=VALUES(username), display_name=VALUES(display_name), password_hash=VALUES(password_hash), role_id=VALUES(role_id), department=VALUES(department), phone_extension=VALUES(phone_extension), is_login_enabled=VALUES(is_login_enabled), created_at=VALUES(created_at);

INSERT INTO rooms (id, name, floor, capacity, confidentiality_level, status) VALUES
    (12, 'The War Room', '17', 14, 'partner-confidential', 'available'),
    (14, 'The Library', '17', 8, 'confidential', 'available'),
    (18, 'The Hudson Room', '18', 20, 'internal', 'available')
ON DUPLICATE KEY UPDATE name=VALUES(name), floor=VALUES(floor), capacity=VALUES(capacity), confidentiality_level=VALUES(confidentiality_level), status=VALUES(status);

INSERT INTO dashboards (id, user_id, dashboard_type, created_at) VALUES
    (1001, 1, 'employee', '2026-01-10 09:05:00'),
    (1042, 2, 'senior-partner', '2025-11-02 09:05:00'),
    (1499, 3, 'managing-partner', '2025-08-18 09:05:00')
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), dashboard_type=VALUES(dashboard_type), created_at=VALUES(created_at);

INSERT INTO bookings (id, room_id, user_id, matter_code, purpose, starts_at, ends_at, status) VALUES
    (7001, 12, 2, 'NH-2187', 'Private partner review', '2026-09-03 15:00:00', '2026-09-03 16:30:00', 'confirmed'),
    (7002, 14, 1, 'MR-4102', 'Internal case preparation', '2026-09-04 10:00:00', '2026-09-04 11:00:00', 'confirmed')
ON DUPLICATE KEY UPDATE room_id=VALUES(room_id), user_id=VALUES(user_id), matter_code=VALUES(matter_code), purpose=VALUES(purpose), starts_at=VALUES(starts_at), ends_at=VALUES(ends_at), status=VALUES(status);

INSERT INTO dashboard_booking_links (booking_id, dashboard_id) VALUES
    (7001, 1042),
    (7002, 1001)
ON DUPLICATE KEY UPDATE dashboard_id=VALUES(dashboard_id);

INSERT INTO conversations (id, subject, confidentiality, created_at) VALUES
    (5001, 'Regarding Mike\'s position', 'strictly-private', '2026-08-28 08:30:00')
ON DUPLICATE KEY UPDATE subject=VALUES(subject), confidentiality=VALUES(confidentiality), created_at=VALUES(created_at);

INSERT INTO conversation_participants (conversation_id, user_id) VALUES
    (5001, 2), (5001, 3)
ON DUPLICATE KEY UPDATE conversation_id=VALUES(conversation_id), user_id=VALUES(user_id);

INSERT INTO messages (id, conversation_id, sender_id, recipient_id, body, sender_role_id, created_at, is_private) VALUES
    (9001, 5001, 2, 3, 'Olivia, we need to discuss Mike\'s recent review before anyone makes a final decision.', 3, '2026-08-28 08:30:00', TRUE),
    (9002, 5001, 3, 2, 'I have already made my position clear. The missed deadlines are becoming a pattern.', 499, '2026-08-28 08:42:00', TRUE),
    (9003, 5001, 2, 3, 'You are overlooking the work he did on the North Harbor matter. I will speak with the partners before this is final.', 3, '2026-08-28 08:55:00', TRUE),
    (9004, 5001, 3, 2, 'This is not an emotional decision, James. The firm cannot protect people from consequences forever.', 499, '2026-08-28 09:07:00', TRUE),
    (9005, 5001, 2, 3, 'Then make sure the profile records are accurate before you put anything in motion. Mike deserves a fair process.', 3, '2026-08-28 09:20:00', TRUE),
    (9006, 5001, 3, 2, 'James, I approved temporary managing-partner Facilities authority for the North Harbor response while I am in client meetings. RoomReserve applies my executive access profile during emergency delegations, so activate it before 17:00.\nINTERMEDIATE_FLAG_PLACEHOLDER\nUse approval ID: DELEGATION_APPROVAL_PLACEHOLDER', 499, '2026-08-28 09:34:00', TRUE)
ON DUPLICATE KEY UPDATE conversation_id=VALUES(conversation_id), sender_id=VALUES(sender_id), recipient_id=VALUES(recipient_id), body=VALUES(body), sender_role_id=VALUES(sender_role_id), created_at=VALUES(created_at), is_private=VALUES(is_private);

INSERT INTO tickets (id, title, body, owner_id, status, api_generation, created_at) VALUES
    (3001, 'War Room display replacement', 'The display intermittently loses signal during partner meetings.', 4, 'open', 'v3', '2026-08-29 11:00:00'),
    (4001, 'Library access-card reader', 'The card reader outside The Library has been intermittent since Monday.', 1, 'scheduled', 'employee', '2026-09-02 09:15:00'),
    (1001, 'Legacy projector request', 'Please confirm the replacement projector model and delivery window.', 4, 'open', 'v1', '2025-06-11 14:00:00')
ON DUPLICATE KEY UPDATE title=VALUES(title), body=VALUES(body), owner_id=VALUES(owner_id), status=VALUES(status), api_generation=VALUES(api_generation), created_at=VALUES(created_at);
