# Gunicorn production config. Kept as a file (not CLI flags) so operators
# can inspect/tune it without touching the Dockerfile.

# Bind on all interfaces INSIDE the container; the platform edge (VPN/proxy)
# owns external exposure.
bind = "0.0.0.0:8000"

# Worker math for a 0.5-CPU / 256MB container:
#   2 workers x 4 threads = 8 concurrent requests, ~60MB RSS per worker.
workers = 2
threads = 4
worker_class = "gthread"

# Kill workers hung >30s (SSTI payloads sometimes loop).
timeout = 30
graceful_timeout = 10

# Log to stdout/stderr — the platform's log driver collects them.
accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(M)sms'

# Reload is FORBIDDEN in production images (code-change oracle for attackers).
reload = False
