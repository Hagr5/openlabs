#!/bin/sh
set -eu

# Every container start returns the lab to its initial state: no uploads
# beyond the seeded avatars, no leftover tokens, a freshly seeded database.
find /var/www/public/uploads -maxdepth 1 -type f -delete
rm -f /var/www/data/app.db /var/www/data/app.db-wal /var/www/data/app.db-shm

php /var/www/src/init_db.php
chown -R www-data:www-data /var/www/data /var/www/public/uploads

exec apache2-foreground
