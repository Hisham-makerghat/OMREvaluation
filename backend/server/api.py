"""JSON API. Every route needs an approved user; user management needs an admin."""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone

from flask import Blueprint, Response, abort, current_app, g, jsonify, request
from sqlalchemy.exc import OperationalError

from omr import load_pages
from .auth import require_admin, require_user
from .models import Batch, Sheet, Test, User

api = Blueprint("api", __name__, url_prefix="/api")
QUESTION_RE = re.compile(r"^q\d+$")


def db():
    return current_app.extensions["db_session"]


def engine():
    return current_app.extensions["omr_engine"]


def storage():
    return current_app.extensions["storage"]


def now():
    return datetime.now(timezone.utc)


# ---- who am I -----------------------------------------------------------------

@api.get("/me")
def me():
    user = getattr(g, "user", None)
    if user is None:
        return jsonify({"signed_in": False}), 401
    return jsonify({"signed_in": True, "user": user.to_dict(),
                    "sheet": {"question_count": len(engine().question_labels),
                              "field_labels": engine().field_labels}})


# ---- users (admin) -------------------------------------------------------------

@api.get("/users")
@require_admin
def list_users():
    users = db().query(User).order_by(User.status.desc(), User.created_at).all()
    return jsonify([u.to_dict() for u in users])


@api.patch("/users/<user_id>")
@require_admin
def update_user(user_id):
    user = db().get(User, user_id) or abort(404)
    body = request.get_json(force=True) or {}
    if "status" in body:
        if body["status"] not in ("pending", "approved", "disabled"):
            abort(400, "bad status")
        if user.id == g.user.id and body["status"] != "approved":
            abort(400, "you cannot disable your own account")
        user.status = body["status"]
        if body["status"] == "approved":
            user.approved_by = g.user.email
    if "role" in body:
        if body["role"] not in ("teacher", "admin"):
            abort(400, "bad role")
        if user.id == g.user.id and body["role"] != "admin":
            abort(400, "you cannot remove your own admin role")
        user.role = body["role"]
    if "name" in body:
        user.name = str(body["name"])[:200]
    db().commit()
    return jsonify(user.to_dict())


# ---- tests and answer keys ------------------------------------------------------

def _validate_test(body, question_count_max):
    name = (body.get("name") or "").strip()
    if not name:
        abort(400, "name is required")
    qn = int(body.get("question_count") or question_count_max)
    if not 1 <= qn <= question_count_max:
        abort(400, f"question_count must be between 1 and {question_count_max}")
    options = (body.get("options") or "ABCDE").upper()
    if not re.fullmatch(r"[A-Z]{2,26}", options):
        abort(400, "options must be letters, for example ABCD")
    key = body.get("answer_key") or {}
    clean = {}
    for i in range(1, qn + 1):
        v = (key.get(f"q{i}") or "").strip().upper()
        if v and (len(v) != 1 or v not in options):
            abort(400, f"answer for q{i} must be one of {options}")
        if v:
            clean[f"q{i}"] = v
    return name, qn, options, clean


@api.get("/tests")
@require_user
def list_tests():
    q = db().query(Test)
    if request.args.get("include_archived") != "1":
        q = q.filter(Test.archived.is_(False))
    return jsonify([t.to_dict() for t in q.order_by(Test.created_at.desc()).all()])


@api.post("/tests")
@require_user
def create_test():
    body = request.get_json(force=True) or {}
    name, qn, options, key = _validate_test(body, len(engine().question_labels))
    t = Test(name=name, question_count=qn, options=options,
             marks_correct=float(body.get("marks_correct", 1)),
             marks_incorrect=float(body.get("marks_incorrect", 0)),
             marks_unmarked=float(body.get("marks_unmarked", 0)),
             created_by=g.user.email)
    t.answer_key = key
    db().add(t)
    db().commit()
    return jsonify(t.to_dict()), 201


@api.get("/tests/<test_id>")
@require_user
def get_test(test_id):
    t = db().get(Test, test_id) or abort(404)
    return jsonify(t.to_dict())


@api.put("/tests/<test_id>")
@require_user
def update_test(test_id):
    t = db().get(Test, test_id) or abort(404)
    body = request.get_json(force=True) or {}
    merged = {**t.to_dict(), **body}
    name, qn, options, key = _validate_test(merged, len(engine().question_labels))
    t.name, t.question_count, t.options = name, qn, options
    t.marks_correct = float(merged.get("marks_correct", 1))
    t.marks_incorrect = float(merged.get("marks_incorrect", 0))
    t.marks_unmarked = float(merged.get("marks_unmarked", 0))
    t.answer_key = key
    t.archived = bool(merged.get("archived", False))
    db().commit()
    return jsonify(t.to_dict())


# ---- batches and sheets -----------------------------------------------------------

@api.get("/batches")
@require_user
def list_batches():
    q = db().query(Batch).order_by(Batch.created_at.desc())
    if request.args.get("test_id"):
        q = q.filter(Batch.test_id == request.args["test_id"])
    return jsonify([b.to_dict() for b in q.limit(200).all()])


@api.post("/batches")
@require_user
def create_batch():
    body = request.get_json(force=True) or {}
    test = db().get(Test, body.get("test_id") or "") or abort(400, "test_id is required")
    if not test.answer_key:
        abort(400, "this test has no answer key yet")
    b = Batch(test_id=test.id, name=(body.get("name") or "").strip()[:200], created_by=g.user.email)
    db().add(b)
    db().commit()
    return jsonify(b.to_dict()), 201


@api.get("/batches/<batch_id>")
@require_user
def get_batch(batch_id):
    b = db().get(Batch, batch_id) or abort(404)
    return jsonify(b.to_dict())


@api.post("/batches/<batch_id>/finish")
@require_user
def finish_batch(batch_id):
    b = db().get(Batch, batch_id) or abort(404)
    b.status, b.finished_at = "finished", now()
    db().commit()
    return jsonify(b.to_dict())


@api.delete("/batches/<batch_id>")
@require_user
def delete_batch(batch_id):
    b = db().get(Batch, batch_id) or abort(404)
    if b.created_by != g.user.email and g.user.role != "admin":
        abort(403, "only the uploader or an admin can delete a batch")
    storage().delete_prefix(f"batches/{b.id}")
    db().delete(b)
    db().commit()
    return "", 204


@api.post("/batches/<batch_id>/sheets")
@require_user
def upload_sheet(batch_id):
    """One request per scanned page. The browser normally sends a shrunk JPEG; a PDF also works
    and every page of it is read."""
    b = db().get(Batch, batch_id) or abort(404)
    if b.status != "open":
        abort(400, "this batch is finished")
    f = request.files.get("file") or abort(400, "file is required")
    data = f.read()
    if not data:
        abort(400, "empty file")
    source_name = (request.form.get("source_name") or f.filename or "sheet")[:300]
    page_offset = int(request.form.get("page_no") or 1)
    try:
        pages = load_pages(data, f.filename or source_name)
    except ValueError as exc:
        abort(400, str(exc))

    test = b.test
    results = []
    for i, page in enumerate(pages):
        page_no = page_offset + i
        r = engine().evaluate(page, test.answer_key, name=f"{b.id}-{page_no}",
                              marks_correct=test.marks_correct, marks_incorrect=test.marks_incorrect,
                              marks_unmarked=test.marks_unmarked)
        sheet = Sheet(batch_id=b.id, source_name=source_name, page_no=page_no,
                      status="ok" if r.ok else "error", error_reason=r.error_reason,
                      score=r.score, needs_review=r.needs_review, review_reason=r.review_reason)
        import json
        sheet.fields_json = json.dumps(r.fields)
        sheet.answers_json = json.dumps(r.answers)
        db().add(sheet)
        db().flush()
        prefix = f"batches/{b.id}/{sheet.id}"
        if len(pages) == 1:
            sheet.input_path = f"{prefix}/input{_ext(f.filename)}"
            storage().put(sheet.input_path, data, f.mimetype or "application/octet-stream")
        else:
            import cv2
            ok, jpg = cv2.imencode(".jpg", page, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ok:
                sheet.input_path = f"{prefix}/input.jpg"
                storage().put(sheet.input_path, jpg.tobytes(), "image/jpeg")
        if r.checked_image_jpeg:
            sheet.checked_path = f"{prefix}/checked.jpg"
            storage().put(sheet.checked_path, r.checked_image_jpeg, "image/jpeg")
        results.append(sheet)
    db().commit()
    return jsonify([s.to_dict() for s in results]), 201


def _ext(filename):
    name = (filename or "").lower()
    for ext in (".pdf", ".jpg", ".jpeg", ".png"):
        if name.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext
    return ".bin"


@api.get("/batches/<batch_id>/sheets")
@require_user
def list_sheets(batch_id):
    b = db().get(Batch, batch_id) or abort(404)
    sheets = sorted(b.sheets, key=lambda s: (s.source_name, s.page_no))
    return jsonify([s.to_dict() for s in sheets])


@api.get("/sheets/<sheet_id>/image")
@require_user
def sheet_image(sheet_id):
    s = db().get(Sheet, sheet_id) or abort(404)
    key = s.checked_path if request.args.get("kind", "checked") == "checked" else s.input_path
    if not key:
        abort(404)
    data = storage().get(key)
    mime = "application/pdf" if key.endswith(".pdf") else ("image/png" if key.endswith(".png") else "image/jpeg")
    return Response(data, mimetype=mime, headers={"Cache-Control": "private, max-age=3600"})


@api.get("/batches/<batch_id>/results.csv")
@require_user
def results_csv(batch_id):
    b = db().get(Batch, batch_id) or abort(404)
    qlabels = [f"q{i}" for i in range(1, b.test.question_count + 1)]
    flabels = engine().field_labels
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["file", "page", "status", "needs_review", "reason", "score"] + flabels + qlabels)
    for s in sorted(b.sheets, key=lambda s: (s.source_name, s.page_no)):
        f, a = s.fields, s.answers
        w.writerow([s.source_name, s.page_no, s.status, "yes" if s.needs_review else "",
                    s.error_reason or s.review_reason, "" if s.score is None else s.score]
                   + [f.get(k, "") for k in flabels] + [a.get(k, "") for k in qlabels])
    fname = re.sub(r"[^A-Za-z0-9_-]+", "_", f"{b.test.name}_{b.created_at:%Y-%m-%d}") + ".csv"
    return Response(out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# ---- errors as JSON -----------------------------------------------------------------

@api.errorhandler(400)
@api.errorhandler(401)
@api.errorhandler(403)
@api.errorhandler(404)
@api.errorhandler(413)
def _json_error(err):
    return jsonify({"error": getattr(err, "description", str(err))}), err.code


@api.errorhandler(OperationalError)
def _db_error(err):
    current_app.logger.exception("database error")
    return jsonify({"error": "the database is starting up or unavailable, please try again in a minute"}), 503
