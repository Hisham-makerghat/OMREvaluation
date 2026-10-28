import csv
import io

from .conftest import ADMIN, FIXTURES, TEACHER, key_dict


def make_test(client, headers=ADMIN, **over):
    body = {"name": "Endline Oct", "question_count": 50, "options": "ABCDE", "answer_key": key_dict(), **over}
    r = client.post("/api/tests", json=body, headers=headers)
    assert r.status_code == 201, r.json
    return r.json


def make_batch(client, test_id, headers=ADMIN):
    r = client.post("/api/batches", json={"test_id": test_id, "name": "Class 7A"}, headers=headers)
    assert r.status_code == 201, r.json
    return r.json


def upload(client, batch_id, name, headers=ADMIN, **form):
    data = {"file": (open(FIXTURES / name, "rb"), name), "source_name": name, **form}
    r = client.post(f"/api/batches/{batch_id}/sheets", data=data, headers=headers, content_type="multipart/form-data")
    assert r.status_code == 201, r.json
    return r.json


def test_requires_sign_in(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/tests").status_code == 401


def test_admin_from_settings_is_approved(client):
    r = client.get("/api/me", headers=ADMIN)
    assert r.status_code == 200
    assert r.json["user"]["role"] == "admin" and r.json["user"]["status"] == "approved"
    assert r.json["sheet"]["question_count"] == 50


def test_new_user_waits_for_approval_then_admin_approves(client):
    r = client.get("/api/me", headers=TEACHER)
    assert r.json["user"]["status"] == "pending"
    assert client.get("/api/tests", headers=TEACHER).status_code == 403

    users = client.get("/api/users", headers=ADMIN).json
    teacher = next(u for u in users if u["email"] == "teacher@example.org")
    r = client.patch(f"/api/users/{teacher['id']}", json={"status": "approved"}, headers=ADMIN)
    assert r.status_code == 200 and r.json["approved_by"] == "admin@example.org"
    assert client.get("/api/tests", headers=TEACHER).status_code == 200
    # teachers cannot manage users
    assert client.get("/api/users", headers=TEACHER).status_code == 403


def test_answer_key_validation(client):
    r = client.post("/api/tests", json={"name": "x", "answer_key": {"q1": "Z"}}, headers=ADMIN)
    assert r.status_code == 400 and "q1" in r.json["error"]
    r = client.post("/api/tests", json={"name": "", "answer_key": {}}, headers=ADMIN)
    assert r.status_code == 400


def test_reads_a_filled_sheet(client):
    t = make_test(client)
    b = make_batch(client, t["id"])
    sheets = upload(client, b["id"], "filled_sheet.jpg")
    assert len(sheets) == 1
    s = sheets[0]
    assert s["status"] == "ok"
    assert s["fields"] == {"Mobile Number": "9876500011", "Name": "ASHA PATIL", "Roll Number": "2301", "gender": "Female"}
    assert s["score"] == 44
    assert s["needs_review"] is False
    assert s["answers"]["q1"] == "A" and s["answers"]["q4"] == "A"   # q4 was answered wrongly on purpose
    img = client.get(f"/api/sheets/{s['id']}/image", headers=ADMIN)
    assert img.status_code == 200 and img.mimetype == "image/jpeg" and len(img.data) > 10000
    orig = client.get(f"/api/sheets/{s['id']}/image?kind=input", headers=ADMIN)
    assert orig.status_code == 200 and orig.mimetype == "image/jpeg"


def test_every_page_of_a_pdf_is_read(client):
    t = make_test(client)
    b = make_batch(client, t["id"])
    sheets = upload(client, b["id"], "two_sheets.pdf")
    assert [s["page_no"] for s in sheets] == [1, 2]
    assert [s["fields"]["Name"] for s in sheets] == ["VIKRAM RAO", "MEERA IYER"]
    assert [s["score"] for s in sheets] == [47, 40]


def test_double_marked_sheet_is_flagged(client):
    t = make_test(client)
    b = make_batch(client, t["id"])
    s = upload(client, b["id"], "double_marked.jpg")[0]
    assert s["status"] == "ok" and s["needs_review"] is True
    assert "q15" in s["review_reason"]
    assert s["answers"]["q15"] == "CD" and s["score"] == 38


def test_unreadable_image_is_reported_not_crashed(client):
    import numpy as np, cv2
    t = make_test(client)
    b = make_batch(client, t["id"])
    blank = cv2.imencode(".jpg", np.full((800, 600), 255, np.uint8))[1].tobytes()
    r = client.post(f"/api/batches/{b['id']}/sheets", headers=ADMIN, content_type="multipart/form-data",
                    data={"file": (io.BytesIO(blank), "blank.jpg"), "source_name": "blank.jpg"})
    assert r.status_code == 201
    assert r.json[0]["status"] == "error" and "corner targets" in r.json[0]["error_reason"]
    r = client.post(f"/api/batches/{b['id']}/sheets", headers=ADMIN, content_type="multipart/form-data",
                    data={"file": (io.BytesIO(b"not an image"), "x.txt")})
    assert r.status_code == 400


def test_batch_counts_csv_and_marks_scheme(client):
    t = make_test(client, marks_incorrect=-0.25)
    b = make_batch(client, t["id"])
    upload(client, b["id"], "filled_sheet.jpg")
    upload(client, b["id"], "double_marked.jpg")
    batch = client.get(f"/api/batches/{b['id']}", headers=ADMIN).json
    assert (batch["sheet_count"], batch["read_count"], batch["review_count"], batch["error_count"]) == (2, 2, 1, 0)
    # Asha: 44 right, 6 wrong -> 44 - 1.5
    sheets = client.get(f"/api/batches/{b['id']}/sheets", headers=ADMIN).json
    asha = next(s for s in sheets if s["fields"]["Name"] == "ASHA PATIL")
    assert asha["score"] == 42.5

    r = client.get(f"/api/batches/{b['id']}/results.csv", headers=ADMIN)
    assert r.status_code == 200 and r.mimetype == "text/csv"
    rows = list(csv.reader(io.StringIO(r.data.decode())))
    assert rows[0][:6] == ["file", "page", "status", "needs_review", "reason", "score"]
    assert "q50" in rows[0] and len(rows) == 3

    r = client.post(f"/api/batches/{b['id']}/finish", headers=ADMIN)
    assert r.json["status"] == "finished"
    assert client.post(f"/api/batches/{b['id']}/sheets", headers=ADMIN, content_type="multipart/form-data",
                       data={"file": (open(FIXTURES / "filled_sheet.jpg", "rb"), "a.jpg")}).status_code == 400


def test_delete_batch_removes_rows_and_files(client, app):
    t = make_test(client)
    b = make_batch(client, t["id"])
    s = upload(client, b["id"], "filled_sheet.jpg")[0]
    root = app.extensions["storage"].root
    assert any(root.rglob("checked.jpg"))
    assert client.delete(f"/api/batches/{b['id']}", headers=ADMIN).status_code == 204
    assert client.get(f"/api/batches/{b['id']}", headers=ADMIN).status_code == 404
    assert not any(root.rglob("checked.jpg"))
    assert client.get(f"/api/sheets/{s['id']}/image", headers=ADMIN).status_code == 404


def test_table_creation_survives_a_concurrent_start(tmp_path):
    """Two workers booting on a fresh database must not crash on 'table already exists'."""
    import threading
    from sqlalchemy import create_engine
    from server.models import create_tables

    url = f"sqlite:///{tmp_path / 'race.db'}"
    errors = []

    def boot():
        try:
            create_tables(create_engine(url))
        except Exception as exc:  # pragma: no cover - the assertion below reports it
            errors.append(exc)

    threads = [threading.Thread(target=boot) for _ in range(6)]
    for t in threads: t.start()
    for t in threads: t.join()
    assert errors == []
