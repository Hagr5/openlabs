"""Conservative Gunicorn defaults for the disposable challenge service."""

bind = "0.0.0.0:8000"
workers = 1
threads = 2
timeout = 30
graceful_timeout = 10
keepalive = 2
accesslog = "-"
errorlog = "-"
loglevel = "info"
preload_app = False
