# OMR Evaluation Tool

Reads scanned MakerGhat OMR answer sheets, compares them with an answer key, and gives
teachers a results table and a CSV file. A teacher opens the website, signs in, picks an
answer key, uploads the scans and downloads the results. Nothing is installed on their
computer.

The reading engine is [OMRChecker](https://github.com/Udayraj123/OMRChecker) by Udayraj
Deshmukh (`backend/src`), wrapped in a small Flask API (`backend/omr`, `backend/server`) with
a React page (`frontend`).

## What it does

1. **Answer keys**: create a named test with its correct options and marks per question.
2. **Evaluate**: choose the test, choose PDF, JPG or PNG scans (a multi-page PDF is many sheets).
   The browser shrinks every page before uploading, so slow internet is fine. Sheets are
   uploaded one at a time with real progress.
3. **Results**: one row per sheet with score, name, roll number, mobile number, gender and every
   answer. Sheets that need a human look (two bubbles filled, blank name, unreadable scan) are
   listed first, with the checked picture one click away. Download CSV. Past batches are kept.
4. **Users** (admins): people sign up themselves with email and password; an admin approves them.

## Run it on a laptop

Needs Python 3.11 and Node 20.

```bash
cd frontend && npm ci && npm run build && cd ..
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
DEV_USER_EMAIL=you@example.org ADMIN_EMAILS=you@example.org flask --app app run --port 8000
```

Open http://127.0.0.1:8000. Data goes to `backend/data` (a SQLite database and the sheet
images). `DEV_USER_EMAIL` stands in for the sign-in that Azure provides in production.
Sample scans to try, with their answer key, are in [`samples/`](samples/README.md).

For frontend development with live reload: `cd frontend && npm start` (it proxies `/api` to
port 8000).

## Run it on Azure

See [docs/AZURE_SETUP.md](docs/AZURE_SETUP.md): App Service, Entra External ID for
email-and-password sign-in, Azure SQL, Blob Storage, and the GitHub Actions deployment.

## Command line

```bash
cd backend && python main.py --input scans/ --key ABCDBACED... --out results.csv --checked-dir checked/
```

## Tests

```bash
cd backend && pip install -r requirements.dev.txt && python -m pytest
```

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | SQLite in `backend/data` | SQLAlchemy URL. Azure SQL example in the setup guide |
| `AZURE_STORAGE_ACCOUNT_URL`, `AZURE_STORAGE_CONTAINER` | unset (local folder) | Blob Storage for sheet images, via managed identity |
| `OMR_DATA_DIR` | `backend/data` | Local database and images |
| `ADMIN_EMAILS` | empty | Comma-separated emails that are admins as soon as they sign in |
| `DEV_USER_EMAIL` | unset | Laptop only: act as this user without signing in |
| `OMR_MAX_UPLOAD_MB` | 25 | Largest single upload |
| `OMR_TEMPLATE` | `backend/template.json` | Sheet layout. Must match the printed sheet |

## The sheet layout

`backend/template.json` and `backend/omr_marker.jpg` describe the **Baseline/Endline
Assessment** sheet (`MakerGhat OMR Sheet.pdf`): four corner targets, a 30-letter name grid,
10-digit roll and mobile numbers, Male/Female bubbles and 50 questions with options A to E.
The newer "Endline Assessment" sheet in `backend/MakerGhat OMR Sheet- updated.pdf` has a
different layout and is **not** read correctly with this template; its roll numbers come out
wrong. Print the sheet the template matches, or update the template first.
