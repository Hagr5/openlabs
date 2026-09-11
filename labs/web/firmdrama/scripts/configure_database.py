"""Create the local application database account without exposing its password in argv."""

from __future__ import annotations

import os

import pymysql


socket_path = os.getenv("FIRMDRAMA_MYSQL_SOCKET", "/run/mysqld/firmdrama-mysql.sock")
password = os.environ["FIRMDRAMA_DB_PASSWORD"]

connection = pymysql.connect(user="root", unix_socket=socket_path, autocommit=True)
try:
    with connection.cursor() as cursor:
        cursor.execute(
            "CREATE DATABASE IF NOT EXISTS firmdrama CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        cursor.execute(
            "CREATE USER IF NOT EXISTS 'firmdrama'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY %s",
            (password,),
        )
        cursor.execute(
            "ALTER USER 'firmdrama'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY %s",
            (password,),
        )
        cursor.execute("REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'firmdrama'@'127.0.0.1'")
        cursor.execute(
            "GRANT SELECT, INSERT, UPDATE, DELETE ON firmdrama.* TO 'firmdrama'@'127.0.0.1'"
        )
        cursor.execute("FLUSH PRIVILEGES")
finally:
    connection.close()
