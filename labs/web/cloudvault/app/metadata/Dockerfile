FROM python:3.12-slim
WORKDIR /srv

COPY metadata/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared ./shared
COPY metadata/app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9100"]

EXPOSE 9100
