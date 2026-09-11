FROM python:3.12-slim
WORKDIR /srv

COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared ./shared
COPY worker/app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]

EXPOSE 9000
