FROM python:3.12-alpine

WORKDIR /srv
COPY app/ .
RUN pip install --no-cache-dir -r requirements.txt

USER 65534

EXPOSE 8378
CMD ["gunicorn", "-c", "gunicorn.conf.py", "server:app"]
