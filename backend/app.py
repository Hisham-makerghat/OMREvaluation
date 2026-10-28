"""Entry point. Run locally with:  DEV_USER_EMAIL=you@example.org ADMIN_EMAILS=you@example.org flask --app app run
On Azure App Service the startup command is:  gunicorn --bind 0.0.0.0:8000 --timeout 120 --workers 2 app:app
"""
from __future__ import annotations

import hashlib
import logging
import os
import posixpath
import sys
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import safe_join

BACKEND_DIR = Path(__file__).resolve().parent
os.chdir(BACKEND_DIR)                       # the OMRChecker core reads template.json and omr_marker.jpg from cwd
sys.path.insert(0, str(BACKEND_DIR))

from omr import Engine                      # noqa: E402
from server.api import api                  # noqa: E402
from server.auth import load_current_user   # noqa: E402
from server.config import settings          # noqa: E402
from server.models import make_session_factory  # noqa: E402
from server.storage import make_storage     # noqa: E402

ONE_YEAR = 365 * 24 * 60 * 60   # seconds


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
    etags = {}   # built file -> ((its time, its size), hash of its content)

    def content_etag(file: Path) -> str:
        """An ETag made from the file's content, worked out again only when the file changes.
        Werkzeug's own comes from the file's time, which every deploy changes, so browsers would
        download files that did not change (pdf.worker.min.js, 1.1 MB) again after each deploy."""
        stat = file.stat()
        known = etags.get(file)
        if known is None or known[0] != (stat.st_mtime_ns, stat.st_size):
            known = etags[file] = ((stat.st_mtime_ns, stat.st_size), hashlib.sha1(file.read_bytes()).hexdigest())
        return known[1]

    def send_built(name: str):
        """Sends one built file. App Service does not compress, so CI keeps a gzipped copy (name.gz)
        of each text file, under a third of the size for the scripts; Werkzeug sends it with the
        original file's type and Content-Encoding: gzip. Files under static/ have their content's
        hash in their names, so browsers may keep them a year. The rest (index.html,
        pdf.worker.min.js) is checked on every visit and answered with 304 Not Modified while it
        has not changed."""
        has_gz = (static_dir / f"{name}.gz").is_file()
        sent = f"{name}.gz" if has_gz and request.accept_encodings.quality("gzip") > 0 else name
        long_lived = name.startswith("static/")
        res = send_from_directory(static_dir, sent, etag=content_etag(static_dir / sent),
                                  max_age=ONE_YEAR if long_lived else None)
        if sent != name:   # the gzipped copy: give the file's name as it is once unpacked
            res.headers.set("Content-Disposition", "inline", filename=posixpath.basename(name))
        if long_lived:
            res.cache_control.immutable = True
        if has_gz:
            res.vary.add("Accept-Encoding")
        return res

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path):
        # normpath turns "a/../b" into "b"; safe_join turns away a name that would leave the folder.
        name = posixpath.normpath(path) if path else ""
        file = safe_join(str(static_dir), name) if name else None
        if file and os.path.isfile(file):
            return send_built(name)
        if not (static_dir / "index.html").is_file():
            return ("The web page has not been built. Run `npm run build` in frontend/ "
                    "or deploy through the GitHub Actions workflow."), 503
        return send_built("index.html")

    return app


app = create_app()
