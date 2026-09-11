FROM python:3.8.14-buster

# Install packages
RUN printf '%s\n' \
    'deb http://archive.debian.org/debian buster main' \
    'deb http://archive.debian.org/debian buster-updates main' \
    'deb http://archive.debian.org/debian-security buster/updates main' \
    > /etc/apt/sources.list \
    && apt-get -o Acquire::Check-Valid-Until=false update \
    && apt-get install -y wget supervisor gnupg nginx uwsgi libcurl4-openssl-dev python3-dev \
    uwsgi-plugin-python3 python3-pycurl psmisc gcc \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy flag
COPY flag.txt /root/flag

# Add readflag binary
COPY config/readflag.c /
RUN gcc -o /readflag /readflag.c && chmod 4755 /readflag && rm /readflag.c

# Setup app
RUN mkdir -p /app

# Switch working environment
WORKDIR /app

# Add application
COPY challenge .
RUN chown -R www-data:www-data /app/profiles

# Install dependencies
RUN python -m venv venv
RUN . /app/venv/bin/activate && pip install -r requirements.txt

# Copy configs
COPY config/supervisord.conf /etc/supervisord.conf
COPY config/nginx.conf /etc/nginx/nginx.conf

# Expose port the server is reachable on
EXPOSE 80

# Disable pycache
ENV PYTHONDONTWRITEBYTECODE=1

# Run supervisord
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
