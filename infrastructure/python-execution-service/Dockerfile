
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed for scipy, lxml, sklearn, etc.
RUN apt-get update && apt-get install -y gcc g++ libgomp1 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run expects the container to listen on $PORT (default 8080)
ENV PORT=8080

# Use gunicorn for production
# 1 worker + threads because we are blocking on subprocess primarily, 
# but for safety let's use a few threads.
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app
