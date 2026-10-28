"""Who is calling? App Service built-in authentication has already checked the password.
It passes the signed-in user to us in the x-ms-client-principal header. We only decide
whether that email is approved, and whether it is an admin."""
from __future__ import annotations

import base64
import json
from functools import wraps

from flask import abort, g, request

from .models import User, real_name

EMAIL_CLAIMS = ("emails", "email", "preferred_username", "upn",
                "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
                "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name")
NAME_CLAIMS = ("name", "http://schemas.microsoft.com/identity/claims/displayname")


def identity_from_request(settings):
    """Return (email, display name) or (None, None)."""
    raw = request.headers.get("x-ms-client-principal")
    if raw:
        try:
            principal = json.loads(base64.b64decode(raw))
        except Exception:
            abort(401, "could not read sign-in information")
        claims = {}
        for c in principal.get("claims", []):
            claims.setdefault(c.get("typ"), c.get("val"))
        email = next((claims[k] for k in EMAIL_CLAIMS if claims.get(k) and "@" in str(claims[k])), None)
        if not email:
            abort(401, "sign-in did not include an email address")
        name = real_name(next((claims[k] for k in NAME_CLAIMS if claims.get(k)), ""))
        return email.strip().lower(), name
    if settings.DEV_USER_EMAIL:
        return settings.DEV_USER_EMAIL, "Local developer"
    return None, None


def load_current_user(db, settings) -> User | None:
    email, name = identity_from_request(settings)
    if not email:
        return None
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None:
        is_admin = email in settings.ADMIN_EMAILS
        user = User(email=email, name=name, role="admin" if is_admin else "teacher",
                    status="approved" if is_admin else "pending", approved_by="ADMIN_EMAILS setting" if is_admin else None)
        db.add(user)
        db.commit()
        return user
    changed = False
    if name and not real_name(user.name):
        # Signed up while the sign-in sent no name (or the placeholder "unknown"): keep the real one now.
        user.name = name
        changed = True
    if email in settings.ADMIN_EMAILS and (user.role != "admin" or user.status != "approved"):
        user.role, user.status = "admin", "approved"
        changed = True
    if changed:
        db.commit()
    return user


def require_user(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        user = getattr(g, "user", None)
        if user is None:
            abort(401, "sign in required")
        if user.status != "approved":
            abort(403, "your account is waiting for approval" if user.status == "pending" else "your account is disabled")
        return fn(*a, **kw)
    return wrapper


def require_admin(fn):
    @wraps(fn)
    @require_user
    def wrapper(*a, **kw):
        if g.user.role != "admin":
            abort(403, "admin only")
        return fn(*a, **kw)
    return wrapper
