<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

define('APP_ROOT', dirname(__DIR__));
define('PUBLIC_ROOT', APP_ROOT . '/public');
define('UPLOAD_DIR', PUBLIC_ROOT . '/uploads');
define('DATA_DIR', APP_ROOT . '/data');
define('DB_PATH', DATA_DIR . '/app.db');
define('FLAG_PATH', APP_ROOT . '/flag.txt');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/uploads.php';
require_once __DIR__ . '/schema.php';
