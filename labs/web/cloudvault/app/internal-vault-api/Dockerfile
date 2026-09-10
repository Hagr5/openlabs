FROM python:3.12-slim
WORKDIR /srv

COPY internal-vault-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared ./shared
COPY internal-vault-api/app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9300"]

EXPOSE 9300
