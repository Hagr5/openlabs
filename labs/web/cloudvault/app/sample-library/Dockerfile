FROM python:3.12-slim
WORKDIR /srv

COPY sample-library/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY sample-library/app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9200"]

EXPOSE 9200
