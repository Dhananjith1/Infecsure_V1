# InfecSure Backend

This directory contains the FastAPI backend. The **repository-root [README](../README.md)** is the canonical source for project setup, environment configuration, testing, deployment, and the academic-prototype limitations.

## Run the backend

Run commands from the repository root:

```bash
python -m venv .venv
```

Activate the virtual environment on Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Or on macOS/Linux:

```bash
source .venv/bin/activate
```

Install backend dependencies and configure the root environment file:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Copy the root `.env.example` to `.env`, generate a unique `JWT_SECRET_KEY`, and configure Firebase credentials locally. Never commit `.env`, service-account JSON, or other credentials.

Start the API:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

## Tests

From the repository root:

```bash
pytest tests/ -v
```

## Demo data

Demo user and synthetic-data seeding is disabled by default. It requires `INFEC_SURE_ALLOW_DEMO_SEEDING=true`, the required environment variables, and a non-production environment. Never point demo scripts at a live hospital or production Firebase project.
