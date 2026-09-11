FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    DB_PATH=/data/invoiceportal.db \
    JWT_SECRET=changeme2024

RUN mkdir -p /data && chmod 755 /data

COPY app/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app/ /app/

WORKDIR /app

CMD ["python3", "app.py"]
