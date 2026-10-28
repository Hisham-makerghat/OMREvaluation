import csv
import io

from .conftest import ADMIN, FIXTURES, TEACHER, key_dict, principal_header


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


def test_a_placeholder_name_from_sign_in_is_not_shown(client):
    from server.models import User

    # Entra External ID sends "unknown" when the sign-up asked for no name.
    me = client.get("/api/me", headers=principal_header("new.teacher@example.org", "unknown")).get_json()
    assert me["user"]["name"] == ""
    # A real name sent at a later sign-in is kept.
    me = client.get("/api/me", headers=principal_header("new.teacher@example.org", "Priya Sharma")).get_json()
    assert me["user"]["name"] == "Priya Sharma"
    # People saved before this change with the placeholder show no name either.
    assert User(email="old@example.org", name="Unknown").to_dict()["name"] == ""


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
    # The results list shows each batch's average out of the most a sheet can score.
    assert batch["average_score"] == round(sum(s["score"] for s in sheets) / 2, 1)
    assert batch["max_score"] == 50

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


def test_sheet_layout_boxes_every_question_on_the_checked_picture(client, app):
    t = make_test(client)
    b = make_batch(client, t["id"])
    s = upload(client, b["id"], "double_marked.jpg")[0]
    r = client.get(f"/api/sheets/{s['id']}/layout", headers=ADMIN)
    assert r.status_code == 200 and r.mimetype == "application/json"
    boxes = r.json["boxes"]
    assert {f"q{i}" for i in range(1, 51)} <= set(boxes)
    assert {"Name", "Roll Number", "Mobile Number", "gender"} <= set(boxes)
    for left, top, right, bottom in boxes.values():
        assert 0 <= left < right <= 1 and 0 <= top < bottom <= 1
    # Answers sit under the name grid, down the page in columns of ten.
    assert boxes["q1"][1] > boxes["Name"][3]
    assert boxes["q2"][1] > boxes["q1"][3]
    assert boxes["q11"][0] > boxes["q1"][2]
    assert boxes["q15"][0] > boxes["q1"][2] and boxes["q15"][2] < boxes["q21"][0]

    # A sheet that could not be read has no checked picture, so no layout either.
    import numpy as np, cv2
    blank = cv2.imencode(".jpg", np.full((800, 600), 255, np.uint8))[1].tobytes()
    bad = client.post(f"/api/batches/{b['id']}/sheets", headers=ADMIN, content_type="multipart/form-data",
                      data={"file": (io.BytesIO(blank), "blank.jpg"), "source_name": "blank.jpg"}).json[0]
    assert client.get(f"/api/sheets/{bad['id']}/layout", headers=ADMIN).status_code == 404

    # Sheets checked before positions were recorded answer 404, not a server error.
    root = app.extensions["storage"].root
    for f in root.rglob("layout.json"):
        f.unlink()
    r = client.get(f"/api/sheets/{s['id']}/layout", headers=ADMIN)
    assert r.status_code == 404 and "error" in r.json


def test_a_page_sent_again_is_answered_with_the_sheet_already_saved(client, app, monkeypatch):
    """The browser sends retry=1 when it sends a page again because the reply was lost on the way.
    The server then answers with the sheet it saved the first time, without reading or saving it again."""
    t = make_test(client)
    b = make_batch(client, t["id"])
    first = upload(client, b["id"], "filled_sheet.jpg", page_no="3")[0]
    engine = app.extensions["omr_engine"]
    read = engine.evaluate
    pages_read = []

    def counted(*args, **kwargs):
        pages_read.append(kwargs["name"])
        return read(*args, **kwargs)

    monkeypatch.setattr(engine, "evaluate", counted)
    again = upload(client, b["id"], "filled_sheet.jpg", page_no="3", retry="1")
    assert [s["id"] for s in again] == [first["id"]]
    assert again[0]["score"] == first["score"] and again[0]["fields"] == first["fields"]
    assert pages_read == []
    assert client.get(f"/api/batches/{b['id']}", headers=ADMIN).json["sheet_count"] == 1

    # A resend of a page that was never saved (the first try did not get through) is read and saved.
    upload(client, b["id"], "filled_sheet.jpg", page_no="4", retry="1")
    assert len(pages_read) == 1
    assert client.get(f"/api/batches/{b['id']}", headers=ADMIN).json["sheet_count"] == 2


def test_first_tries_with_the_same_name_are_all_saved(client):
    """A first try never looks for a saved sheet: a tab still running an older version of the app
    sends no retry=1, and it can send two different photos that are both called image.jpg."""
    t = make_test(client)
    b = make_batch(client, t["id"])
    one = upload(client, b["id"], "filled_sheet.jpg", page_no="3")
    two = upload(client, b["id"], "filled_sheet.jpg", page_no="3")
    assert one[0]["id"] != two[0]["id"]
    assert client.get(f"/api/batches/{b['id']}", headers=ADMIN).json["sheet_count"] == 2


def test_a_resend_that_overtakes_the_first_try_is_not_saved_twice(client, app, monkeypatch):
    """The first try can still be running when the browser sends the page again. When the first try
    saves its sheet while the resend is reading the page, the resend answers with that sheet and saves
    nothing."""
    from server.models import Sheet

    t = make_test(client)
    b = make_batch(client, t["id"])
    engine = app.extensions["omr_engine"]
    read = engine.evaluate
    other_worker = app.extensions["db_session"].session_factory
    saved_by_first_try = []

    def read_while_the_first_try_finishes(*args, **kwargs):
        result = read(*args, **kwargs)
        with other_worker() as session:
            sheet = Sheet(batch_id=b["id"], source_name="filled_sheet.jpg", page_no=5, status="ok", score=44.0)
            session.add(sheet)
            session.commit()
            saved_by_first_try.append(sheet.id)
        return result

    monkeypatch.setattr(engine, "evaluate", read_while_the_first_try_finishes)
    again = upload(client, b["id"], "filled_sheet.jpg", page_no="5", retry="1")
    assert [s["id"] for s in again] == saved_by_first_try
    assert client.get(f"/api/batches/{b['id']}", headers=ADMIN).json["sheet_count"] == 1
    assert not any(app.extensions["storage"].root.rglob("*.jpg"))


def test_batch_list_counts_sheets_without_a_query_per_batch(client, app):
    """GET /api/batches loads the sheets of all listed batches in one query, and only the columns the
    counts need: the number of queries does not grow with the batches, and the long text is not read."""
    from sqlalchemy import event
    from server.models import Batch, Sheet

    t = make_test(client)
    new_session = app.extensions["db_session"].session_factory
    engine = new_session.kw["bind"]

    def add_batches(count):
        with new_session() as session:
            for n in range(count):
                b = Batch(test_id=t["id"], name=f"Class {n}", created_by="admin@example.org")
                session.add(b)
                session.flush()
                same_file = dict(batch_id=b.id, source_name="class.pdf")
                session.add_all([Sheet(**same_file, page_no=1, status="ok", score=40.0),
                                 Sheet(**same_file, page_no=2, status="ok", score=45.0, needs_review=True),
                                 Sheet(**same_file, page_no=3, status="error", error_reason="blurred")])
            session.commit()

    def list_batches():
        statements = []

        def record(_conn, _cursor, statement, *_rest):
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", record)
        try:
            r = client.get("/api/batches", headers=ADMIN)
        finally:
            event.remove(engine, "before_cursor_execute", record)
        assert r.status_code == 200
        return r.json, statements

    add_batches(2)
    _, few = list_batches()
    add_batches(6)
    batches, many = list_batches()
    assert len(batches) == 8
    assert len(many) == len(few)
    assert not any(col in s for s in many for col in ("answers_json", "fields_json", "error_reason", "review_reason"))
    for b in batches:
        assert (b["sheet_count"], b["read_count"], b["review_count"], b["error_count"]) == (3, 2, 1, 1)
        assert (b["test_name"], b["average_score"], b["max_score"]) == ("Endline Oct", 42.5, 50)
    # One batch on its own gives the same counts.
    assert client.get(f"/api/batches/{batches[0]['id']}", headers=ADMIN).json == batches[0]


def test_typed_names_are_nvarchar_on_sql_server():
    """SQL Server's VARCHAR keeps only Western European letters, so a batch named in Marathi was saved
    as question marks. SQLite keeps any text, so only the SQL Server table definitions show it."""
    from sqlalchemy.dialects import mssql
    from sqlalchemy.schema import CreateTable
    from server.models import Batch, Sheet, Test, User

    def column(model, name):
        ddl = str(CreateTable(model.__table__).compile(dialect=mssql.dialect()))
        return next(line.strip().rstrip(",").strip() for line in ddl.splitlines()
                    if line.strip().startswith(f"{name} "))

    assert column(User, "name") == "name NVARCHAR(200) NOT NULL"
    assert column(Test, "name") == "name NVARCHAR(200) NOT NULL"
    assert column(Batch, "name") == "name NVARCHAR(200) NOT NULL"
    assert column(Sheet, "source_name") == "source_name NVARCHAR(300) NOT NULL"


def test_names_in_marathi_come_back_as_typed(client):
    test_name = "गणित चाचणी"
    batch_name = "जि. प. शाळा महालपाटणे, इयत्ता ७"
    t = make_test(client, name=test_name)
    r = client.post("/api/batches", json={"test_id": t["id"], "name": batch_name}, headers=ADMIN)
    assert r.status_code == 201
    listed = client.get("/api/batches", headers=ADMIN).json[0]
    assert (listed["name"], listed["test_name"]) == (batch_name, test_name)


def test_a_picture_that_is_no_longer_kept_answers_404(client, app):
    """Storage deletes old pictures (docs/AZURE_SETUP.md) while the sheet stays in its batch. The
    picture then answers 404 with a plain reason, not a server error with the storage's own text."""
    t = make_test(client)
    b = make_batch(client, t["id"])
    s = upload(client, b["id"], "filled_sheet.jpg")[0]
    for f in app.extensions["storage"].root.rglob("*.jpg"):
        f.unlink()
    for kind in ("checked", "input"):
        r = client.get(f"/api/sheets/{s['id']}/image?kind={kind}", headers=ADMIN)
        assert r.status_code == 404
        assert r.json == {"error": "this picture is no longer kept"}
