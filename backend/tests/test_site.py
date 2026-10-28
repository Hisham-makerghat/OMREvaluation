"""The built page: gzipped for browsers that take it, kept a year when its name has its content's hash,
and ETags made from the content, so a deploy only sends again what changed."""
import gzip
import os
import time

import pytest

from .conftest import make_app

SCRIPT = b"document.title = 'Check sheets';\n" * 500      # compresses well, like the real bundle
PAGE = b"<!doctype html><title>OMR</title><div id=root></div><script src=/static/js/main.abc123.js></script>"
GZIP = {"Accept-Encoding": "gzip, deflate, br"}
JAVASCRIPT = ("text/javascript", "application/javascript")


def gzip_n(data):
    """What CI's gzip -9 -n makes: no file name and no time in it, so the same file gives the same bytes."""
    return gzip.compress(data, compresslevel=9, mtime=0)


@pytest.fixture()
def site(tmp_path):
    """The page as CI deploys it: index.html, a script with its content's hash in its name under
    static/, and a gzipped copy next to each."""
    root = tmp_path / "static_site"
    (root / "static" / "js").mkdir(parents=True)
    for name, data in (("index.html", PAGE), ("static/js/main.abc123.js", SCRIPT)):
        (root / name).write_bytes(data)
        (root / f"{name}.gz").write_bytes(gzip_n(data))
    return root


@pytest.fixture()
def web(tmp_path, site):
    return make_app(tmp_path, STATIC_DIR=site).test_client()


def fetch(web, url, headers=None):
    return web.get(url, headers=headers or {}, buffered=True)


def test_a_browser_that_takes_gzip_gets_the_gzipped_script(web):
    r = fetch(web, "/static/js/main.abc123.js", GZIP)
    assert r.status_code == 200
    assert r.headers["Content-Encoding"] == "gzip" and r.mimetype in JAVASCRIPT
    assert r.headers["Vary"] == "Accept-Encoding"
    assert gzip.decompress(r.data) == SCRIPT and len(r.data) < len(SCRIPT) / 3
    assert r.headers["Content-Disposition"] == "inline; filename=main.abc123.js"


def test_a_browser_without_gzip_gets_the_plain_script(web):
    # No Accept-Encoding at all, or one that turns gzip down.
    for headers in (None, {"Accept-Encoding": "gzip;q=0, br"}, {"Accept-Encoding": "identity"}):
        r = fetch(web, "/static/js/main.abc123.js", headers)
        assert r.status_code == 200
        assert "Content-Encoding" not in r.headers and r.mimetype in JAVASCRIPT
        assert r.data == SCRIPT
        # Tells caches on the way that the answer depends on Accept-Encoding, so this browser never gets gzip.
        assert r.headers["Vary"] == "Accept-Encoding"


def test_files_under_static_are_kept_a_year(web):
    for headers in (GZIP, None):
        cache = fetch(web, "/static/js/main.abc123.js", headers).cache_control
        assert cache.max_age == 31536000 and cache.public and cache.immutable
        assert not cache.no_cache


def test_the_page_is_checked_on_every_visit(web):
    """index.html, which also answers every address of the app opened directly, is asked about again
    on each visit, so a deploy shows at once."""
    for url in ("/", "/index.html", "/batches/x"):
        r = fetch(web, url, GZIP)
        assert r.status_code == 200 and r.mimetype == "text/html"
        assert r.cache_control.no_cache and r.cache_control.max_age is None
        assert r.headers["Content-Encoding"] == "gzip" and gzip.decompress(r.data) == PAGE


def test_etag_comes_from_the_content_not_the_file_time(tmp_path, site, web):
    """Every deploy writes every file again. Only a file whose content changed gets a new ETag, so
    browsers do not download the others (pdf.worker.min.js, 1.1 MB) again."""
    sent = fetch(web, "/index.html", GZIP)
    first = sent.headers["ETag"]
    assert fetch(web, "/index.html").headers["ETag"] != first     # the plain copy is another file
    # What a browser sends when it asks about the page again: the ETag and the time it was given.
    asked_again = {**GZIP, "If-None-Match": first, "If-Modified-Since": sent.headers["Last-Modified"]}

    later = time.time() + 3600
    for f in site.rglob("*"):
        if f.is_file():
            os.utime(f, (later, later))
    assert fetch(web, "/index.html", GZIP).headers["ETag"] == first
    r = fetch(web, "/index.html", asked_again)
    assert r.status_code == 304 and r.data == b""
    assert r.headers["Vary"] == "Accept-Encoding" and r.cache_control.no_cache
    # The app starts again after a deploy: the same files still give the same ETags.
    restarted = make_app(tmp_path, STATIC_DIR=site).test_client()
    assert fetch(restarted, "/index.html", GZIP).headers["ETag"] == first
    assert fetch(restarted, "/index.html", asked_again).status_code == 304

    # A page that did change gets a new ETag, so the browser downloads it.
    changed = PAGE.replace(b"<title>OMR</title>", b"<title>OMR tool</title>")
    (site / "index.html").write_bytes(changed)
    (site / "index.html.gz").write_bytes(gzip_n(changed))
    r = fetch(web, "/index.html", asked_again)
    assert r.status_code == 200 and r.headers["ETag"] != first
    assert gzip.decompress(r.data) == changed


def test_names_that_leave_the_folder_get_the_page(tmp_path, web):
    """A file outside the built page is never sent (or read): such an address gets the page, like any
    other address the app does not know."""
    (tmp_path / "secret.txt").write_text("not for the web")
    for url in ("/../secret.txt", "/%2e%2e/secret.txt", "/static/../../secret.txt",
                "/static/js/..%2f..%2f../secret.txt"):
        r = fetch(web, url)
        assert r.status_code == 200 and r.data == PAGE


def test_without_a_built_page_the_server_says_so(client):
    r = client.get("/")
    assert r.status_code == 503 and b"npm run build" in r.data
