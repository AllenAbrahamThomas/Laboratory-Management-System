# Lab Management System

A full-stack lab management application with a Django + PostgreSQL backend and an Angular frontend.

## Project Overview

- `backend/` contains the Django REST API, models, serializers, and database migrations.
- `frontend/` contains the Angular application for lab staff workflows.
- `docker-compose.yml` orchestrates PostgreSQL, Adminer, the backend, and the frontend.

## Architecture & Flow

1. `docker compose up --build --detach` starts the full stack:
   - `db` runs PostgreSQL.
   - `adminer` provides a database admin UI.
   - `backend` builds and runs Django.
   - `frontend` builds and serves the Angular app.

2. The Angular app runs on `http://localhost:4200` and communicates with the backend at `http://localhost:8000`.
3. The backend uses Django REST Framework to expose lab-related APIs and connects to PostgreSQL.
4. User workflows include login, dashboard access, patient registration, lab result entry, and reports.

## Backend

### Key folders

- `backend/accounts/` - authentication and user-related models, views, serializers.
- `backend/lab/` - lab data models, endpoints, and business logic.
- `backend/lab_backend/` - Django project settings and URL configuration.

### Dependencies

Defined in `backend/requirements.txt`:

- `Django>=5.2,<5.3`
- `djangorestframework>=3.15,<3.16`
- `django-cors-headers>=4.4,<4.5`
- `psycopg[binary]>=3.2,<3.3`
- `pypdf>=4.3,<5.0`

### Configuration

Backend settings read environment variables from `backend/.env` or `backend/.env.example`, and from container environment values.

Important environment variables:

- `DEBUG` - enable debug mode (`1` / `0`)
- `SECRET_KEY` - Django secret key
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` - PostgreSQL connection
- `CORS_ALLOWED_ORIGINS` - allowed origins for the Angular app
- `LAB_NAME`, `LAB_ADDRESS`, etc. - lab metadata used in the app

## Frontend

### Key folders

- `frontend/src/app/pages/` - page-level Angular components.
- `frontend/src/app/services/` - app services for authentication, clock, and visit handling.
- `frontend/src/app/app.routes.ts` - primary routes:
  - `/` -> Login
  - `/dashboard` -> Dashboard

### Dependencies

Defined in `frontend/package.json`:

- Angular 20 packages (`@angular/core`, `@angular/common`, etc.)
- `rxjs`
- `zone.js`
- `typescript`
- Angular CLI and build tooling

## Docker Compose Setup

`docker-compose.yml` defines:

- `db` - PostgreSQL 15 database service
- `adminer` - database browser on port `8080`
- `backend` - Django backend on port `8000`
- `frontend` - Angular app on port `4200`

The backend waits for the database health check before starting.

## Running Locally

### Prerequisites

- Docker Desktop
- Node.js / npm (for local frontend development, optional when using Docker)

### Start with Docker

```bash
docker compose up --build --detach
```

### Stop

```bash
docker compose down
```

### Backend only (optional)

From `backend/`:

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### Frontend only (optional)

From `frontend/`:

```bash
npm install
npm start -- --host 0.0.0.0
```

## Notes

- The Django backend is configured to allow CORS from `http://localhost:4200` and `http://127.0.0.1:4200`.
- Replace the development `SECRET_KEY` before production use.
- PostgreSQL data is persisted in Docker volume `postgres_data`.

## Helpful URLs

- Frontend: `http://localhost:4200`
- Backend API: `http://localhost:8000`
- Adminer: `http://localhost:8080`

## Project Structure Summary

- `backend/`
  - Django project and apps
  - REST API and lab models
  - PostgreSQL integration
- `frontend/`
  - Angular UI
  - Login + dashboard routing
  - service-based state and API access

The repository includes `backend/.env.example` to simplify onboarding for developers.