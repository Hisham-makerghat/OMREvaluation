"""All settings come from environment variables so the same code runs on a laptop and on Azure."""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("OMR_DATA_DIR", BACKEND_DIR / "data"))


def _first_existing(*paths):
    """First path that exists; otherwise the first non-empty one."""
    candidates = [Path(p) for p in paths if p]
    for p in candidates:
        if p.is_dir():
            return p
    return candidates[0]


class Settings:
    # Database. Default is a SQLite file for laptops and the pilot. On Azure, set DATABASE_URL to the
    # Azure SQL connection URL described in docs/AZURE_SETUP.md.
    DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{DATA_DIR / 'omr.db'}"

    # Sheet images. Local folder by default; Azure Blob Storage when AZURE_STORAGE_ACCOUNT_URL is set.
    STORAGE_ROOT = Path(os.environ.get("OMR_STORAGE_ROOT", DATA_DIR / "sheets"))
    AZURE_STORAGE_ACCOUNT_URL = os.environ.get("AZURE_STORAGE_ACCOUNT_URL", "")
    AZURE_STORAGE_CONTAINER = os.environ.get("AZURE_STORAGE_CONTAINER", "omr-sheets")

    # Sign-in. On Azure App Service, built-in authentication puts the signed-in user in a request header.
    # On a laptop, set DEV_USER_EMAIL to act as that user without any sign-in.
    ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
    DEV_USER_EMAIL = os.environ.get("DEV_USER_EMAIL", "").strip().lower()

    # Built React page. The deploy workflow copies frontend/build into backend/static_site.
    STATIC_DIR = _first_existing(os.environ.get("OMR_STATIC_DIR"), BACKEND_DIR / "static_site",
                                 BACKEND_DIR.parent / "frontend" / "build")

    TEMPLATE_PATH = Path(os.environ.get("OMR_TEMPLATE", BACKEND_DIR / "template.json"))
    MAX_UPLOAD_BYTES = int(os.environ.get("OMR_MAX_UPLOAD_MB", "25")) * 1024 * 1024
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-not-secret")


settings = Settings()
