FROM php:8.3-apache

RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2.8 /usr/bin/composer /usr/bin/composer

RUN a2enmod rewrite

COPY src/app/apache/php8-handler.conf /etc/apache2/conf-available/php8-handler.conf
COPY src/app/apache/snapconnect.conf /etc/apache2/sites-available/snapconnect.conf
RUN a2enconf php8-handler \
 && a2dissite 000-default \
 && a2ensite snapconnect

COPY src/app/php/app.ini /usr/local/etc/php/conf.d/app.ini

WORKDIR /var/www
COPY src/app/composer.json src/app/composer.lock ./
RUN composer install --no-dev --classmap-authoritative --no-interaction --no-progress \
 && rm /usr/bin/composer

COPY src/app/src src/
COPY src/app/public public/
COPY src/app/seeds seeds/
RUN mkdir -p public/uploads data \
 && chown -R www-data:www-data public/uploads data \
 && chown -R root:root src public/*.php

COPY flag.txt /var/www/flag.txt
RUN chown root:www-data /var/www/flag.txt \
 && chmod 440 /var/www/flag.txt

COPY entrypoint.sh /usr/local/bin/snapconnect-entrypoint
RUN chmod 755 /usr/local/bin/snapconnect-entrypoint

EXPOSE 80

HEALTHCHECK --interval=5s --timeout=4s --start-period=15s --retries=10 \
    CMD php -r 'exit(strpos((string) @file_get_contents("http://127.0.0.1/health.php"), "\"status\":\"ok\"") !== false ? 0 : 1);'

ENTRYPOINT ["snapconnect-entrypoint"]
