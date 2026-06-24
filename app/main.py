"""
InfecSure — FastAPI Application Entry Point
============================================
AI-Powered Infection Monitoring and Outbreak Response System
Divisional Hospital, Thalangama, Colombo, Sri Lanka
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import auth, users, wards, audits, gate, lab, lab_results, pathogens, alerts, ocr, reports, heatmap, notices, public, prediction
from app.services.auth_service import seed_default_users

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
)
logger = logging.getLogger("infecsure")

settings = get_settings()


# ─── Lifespan (startup / shutdown) ───────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: seed default users. Shutdown: (nothing extra needed)."""
    logger.info("🚀 InfecSure backend starting up...")
    logger.info(f"Loaded CORS origins: {settings.cors_origins}")
    try:
        await seed_default_users()
    except Exception as e:
        logger.warning(f"User seeding skipped: {e}")
    logger.info("✅ InfecSure backend ready.")
    yield
    logger.info("🛑 InfecSure backend shutting down.")


# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="InfecSure API",
    description=(
        "**InfecSure** — AI-Powered Infection Monitoring and Outbreak Response System\n\n"
        "Developed for the Infection Control Unit of Divisional Hospital, Thalangama, "
        "Colombo, Sri Lanka.\n\n"
        "### Authentication\n"
        "All endpoints (except `/auth/login`) require a `Bearer` JWT token.\n"
        "Obtain a token via `POST /auth/login`.\n\n"
        "### Credentials\n"
        "User passwords are verified through Firebase Authentication. "
        "Set `FIREBASE_WEB_API_KEY` and create role profiles in Firestore.\n"
    ),
    version="1.0.0",
    contact={
        "name": "InfecSure Dev Team — IIT 04",
        "email": "iit22006@std.uwu.ac.lk",
    },
    license_info={"name": "Academic Project — UWU IIT 372-2"},
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Global Exception Handlers ────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal error occurred. Please contact the system administrator."},
    )

# ─── Include Routers ─────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(wards.router)
app.include_router(audits.router)
app.include_router(lab.router)
app.include_router(lab_results.router)
app.include_router(pathogens.router)
app.include_router(alerts.router)
app.include_router(gate.router)
app.include_router(ocr.router)
app.include_router(reports.router)
app.include_router(heatmap.router)
app.include_router(notices.router)
app.include_router(public.router)
app.include_router(prediction.router)


# ─── Root Health Check ────────────────────────────────────────────────────────

@app.get("/", tags=["Health"], summary="Health check")
async def root():
    """System health check — returns version and status."""
    return {
        "system": "InfecSure",
        "version": "1.0.0",
        "status": "operational",
        "environment": settings.app_env,
        "description": "AI-Powered Infection Monitoring and Outbreak Response System",
        "hospital": "Divisional Hospital, Thalangama, Colombo, Sri Lanka",
    }


@app.get("/health", tags=["Health"], summary="Detailed health check")
async def health():
    """Returns detailed health status for infrastructure monitoring."""
    from app.config import db, firebase_credentials_available, firebase_init_error
    try:
        if not firebase_credentials_available():
            raise RuntimeError(firebase_init_error() or "Firebase unavailable")
        db.collection("_health").limit(1).get()
        db_status = "connected"
        db_detail = None
    except Exception as exc:
        db_status = "error"
        db_detail = str(exc)

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "components": {
            "api": "ok",
            "database": db_status,
        },
        "detail": {"database": db_detail} if db_detail else {},
    }
