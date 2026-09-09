FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if required by playwright or others (optional, add if needed)
# RUN apt-get update && apt-get install -y ...

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers if playwright is in requirements
RUN playwright install --with-deps chromium

COPY . .

# Run uvicorn on port 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
