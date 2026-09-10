-- ThreadLine Challenge - Database Schema
-- Primary Vulnerability: BOLA (users table)
-- Secondary Vulnerability: Business Logic - Prefix Matching (coupons table)

DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS coupons;
DROP TABLE IF EXISTS cart_items;
DROP TABLE IF EXISTS carts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL
);

-- The "retention offer" table: only ONE valid offer exists,
-- tied to the target account's exact email. This is the only
-- place the exact email is considered "valid" for exact match.
CREATE TABLE offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exact_email TEXT NOT NULL UNIQUE,
    discount_amount INTEGER NOT NULL
);

CREATE TABLE carts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cart_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    price INTEGER NOT NULL,
    FOREIGN KEY (cart_id) REFERENCES carts(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    discount_amount INTEGER NOT NULL,
    linked_email TEXT NOT NULL,
    owner_user_id INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    applied_to_cart_id INTEGER,
    UNIQUE(linked_email),  -- prevents duplicate coupon generation races for the same email
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cart_id INTEGER NOT NULL,
    final_price INTEGER NOT NULL,
    status TEXT NOT NULL,
    flag_awarded INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (cart_id) REFERENCES carts(id)
);
