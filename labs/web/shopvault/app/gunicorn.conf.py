"""
Gunicorn configuration for production.
Never use Flask dev server in the container.
"""

import os

# Server socket
bind = "0.0.0.0:8378"
backlog = 2048

# Worker processes
# CHALLENGE-CRITICAL: must stay 1. lockout_store (app/lockout.py) is an
# in-process dict with no shared backend. Multiple workers/replicas would
# split login attempts across processes and silently break the intended
# lockout + X-Forwarded-For-bypass vulnerability.
workers = 1
worker_class = "sync"
worker_connections = 1000
timeout = 30

# Logging
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'
errorlog = "-"
accesslog = "-"
loglevel = "info"

# Security
limit_request_fields = 100
limit_request_line = 8190

# Process naming
proc_name = "shopvault"
