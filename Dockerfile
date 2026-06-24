FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_URL=sqlite:////app/data/nimo.db

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY nimo ./nimo
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "nimo.main:app", "--host", "0.0.0.0", "--port", "8000"]
