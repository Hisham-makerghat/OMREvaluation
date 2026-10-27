"""Entry point. Run locally with:  DEV_USER_EMAIL=you@example.org ADMIN_EMAILS=you@example.org flask --app app run
On Azure App Service the startup command is:  gunicorn --bind 0.0.0.0:8000 --timeout 120 --workers 2 app:app
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from flask import Flask, g, jsonify, send_from_directory

BACKEND_DIR = Path(__file__).resolve().parent
os.chdir(BACKEND_DIR)                       # the OMRChecker core reads template.json and omr_marker.jpg from cwd
sys.path.insert(0, str(BACKEND_DIR))

from omr import Engine                      # noqa: E402
from server.api import api                  # noqa: E402
from server.auth import load_current_user   # noqa: E402
from server.config import settings          # noqa: E402
from server.models import make_session_factory  # noqa: E402
from server.storage import make_storage     # noqa: E402


def create_app(cfg=settings) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = cfg.MAX_UPLOAD_BYTES
    app.config["SECRET_KEY"] = cfg.SECRET_KEY
    logging.basicConfig(level=logging.INFO)

    Path(cfg.STORAGE_ROOT).parent.mkdir(parents=True, exist_ok=True)
    _, session = make_session_factory(cfg.DATABASE_URL)
    app.extensions["db_session"] = session
    app.extensions["storage"] = make_storage(cfg)
    app.extensions["omr_engine"] = Engine(cfg.TEMPLATE_PATH)
    app.extensions["settings"] = cfg
    app.register_blueprint(api)

    @app.before_request
    def _load_user():
        g.user = load_current_user(session, cfg)

    @app.teardown_appcontext
    def _close_session(_exc):
        session.remove()

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    static_dir = Path(cfg.STATIC_DIR)

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path):
        if path and (static_dir / path).is_file():
            return send_from_directory(static_dir, path)
        index = static_dir / "index.html"
        if not index.is_file():
            return ("The web page has not been built. Run `npm run build` in frontend/ "
                    "or deploy through the GitHub Actions workflow."), 503
        return send_from_directory(static_dir, "index.html")

    return app


app = create_app()
