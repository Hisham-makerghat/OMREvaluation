import base64
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

FIXTURES = Path(__file__).parent / "fixtures"
ANSWER_KEY = "ABCDBACEDCABDECBADCEBDACEABCDEDCBAEDACBECADBEACDBA"


def make_app(tmp_path, **settings):
    """An app with its database and sheet pictures in tmp_path. No built page unless STATIC_DIR is given."""
    from app import create_app

    cfg = SimpleNamespace(
        DATABASE_URL=f"sqlite:///{tmp_path / 'test.db'}",
        STORAGE_ROOT=tmp_path / "sheets",
        AZURE_STORAGE_ACCOUNT_URL="",
        AZURE_STORAGE_CONTAINER="",
        ADMIN_EMAILS={"admin@example.org"},
        DEV_USER_EMAIL="",
        STATIC_DIR=tmp_path / "nostatic",
        TEMPLATE_PATH=BACKEND / "template.json",
        MAX_UPLOAD_BYTES=25 * 1024 * 1024,
        SECRET_KEY="test",
    )
    vars(cfg).update(settings)
    application = create_app(cfg)
    application.config["TESTING"] = True
    return application


@pytest.fixture()
def app(tmp_path):
    return make_app(tmp_path)


@pytest.fixture()
def client(app):
    return app.test_client()


def principal_header(email, name="Test User"):
    """What Azure App Service built-in authentication sends after a successful sign-in."""
    payload = {"auth_typ": "aad", "name_typ": "name", "role_typ": "roles",
               "claims": [{"typ": "emails", "val": email}, {"typ": "name", "val": name}]}
    return {"x-ms-client-principal": base64.b64encode(json.dumps(payload).encode()).decode()}


ADMIN = principal_header("admin@example.org", "Admin")
TEACHER = principal_header("teacher@example.org", "Teacher")


def key_dict():
    return {f"q{i + 1}": ch for i, ch in enumerate(ANSWER_KEY)}
