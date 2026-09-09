FROM python:3.12-slim

WORKDIR /challenge

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --shell /usr/sbin/nologin challenge

COPY app ./app

RUN chown -R challenge:challenge /challenge

USER challenge

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "app.app:app"]
