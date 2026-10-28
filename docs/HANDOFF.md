# Handoff: state of the OMR Evaluation Tool project

Written 28 October 2026 at the end of the cloud session that rebuilt the tool. Give this file to
any new Claude Code session (or person) so they start with the full picture. The repository's
`README.md`, `docs/AZURE_SETUP.md` and `CLAUDE.md` hold the details; this file holds the story
and the decisions.

## Who and what

- Owner: Hisham (hisham@makerghat.org), MakerGhat, a nonprofit in India.
- Repository: `Hisham-makerghat/OMREvaluation` on GitHub. Work is on branch
  `claude/admiring-babbage-d3o7av`, open as draft pull request #1 against `main`. CI is green.
- Purpose: teachers scan filled MakerGhat OMR answer sheets, the tool reads the bubbles, compares
  them with an answer key, and gives a results table and CSV.

## Where we started (the old tool on `main`)

- React page + Flask backend around the open-source OMRChecker engine (Udayraj Deshmukh), run
  with Docker Compose on each user's laptop.
- Problems found by running it: the browser upload was ignored and files were read from
  `backend/inputs` on disk (so scans had to be copied there); only page 1 of each PDF was read;
  one global answer key and one results CSV overwritten each run; a fake progress bar; no
  error messages; the install guide pointed to the wrong port; the template matched the original
  "Baseline/Endline Assessment" sheet but not the newer "Endline Assessment" sheet.
- Measured: the engine shrinks every page to 666 x 820 px before reading, so uploads can be
  shrunk to ~700 px wide (about 140 KB per sheet) with no loss. Verified on test sheets.

## Decisions made

1. Host it as one website instead of Docker on every laptop. Docker is not needed by users.
2. Azure for everything: App Service (Linux, Python 3.11, B1), Central India region.
3. Login: email and password sign-up through Microsoft Entra External ID, wired to App Service
   built-in authentication. No password code in the app. New accounts wait for admin approval
   inside the app (users table with pending/approved/disabled and teacher/admin roles).
   Emails in the `ADMIN_EMAILS` setting are admins immediately.
4. Database: Azure SQL Database. The free tier was checked and rejected for production
   (100,000 vCore-seconds a month ≈ 55 awake hours, pauses mid-month by default, ~1 minute wake-up,
   no SLA). Use the Basic tier (~$5/month). Free tier is fine for a pilot with
   "continue for additional charges".
5. Scanned sheets go to Blob Storage (private container, lifecycle delete after a chosen period,
   one year suggested), never into the database. The app reaches SQL and Blob with managed identity.
6. Uploads: the browser renders each PDF page / photo to a 700 px grey JPEG and sends one sheet
   per request with retries and real progress. Every page of a PDF is read.
7. Git rule (in `CLAUDE.md` and the owner's memory): every commit is authored and committed as
   `Hisham <hisham@makerghat.org>`; never add Claude as author/committer, no Co-Authored-By,
   no session trailers, no AI attribution footers in PR descriptions. History on the branch was
   rewritten once to apply this.

## What exists now (branch `claude/admiring-babbage-d3o7av`)

- `backend/omr/engine.py`: one stateless call per sheet (image in; fields, answers, score,
  review flag, checked picture out). Clear failure reasons. PDFs via PyMuPDF (no Poppler).
- `backend/server/`: config from environment variables; SQLAlchemy models users/tests/batches/
  sheets; local-folder or Blob storage; auth from the `x-ms-client-principal` header or
  `DEV_USER_EMAIL` on a laptop; JSON API (`/api/me`, users, tests, batches, per-sheet uploads,
  images, `results.csv`). Table creation tolerates several workers starting at once.
- `backend/app.py`: Flask app that also serves the built React page; `Procfile` for Gunicorn.
- `backend/main.py`: command-line runner for a folder of scans.
- `backend/tests/`: 11 pytest tests with real sheet fixtures.
- `frontend/`: React pages for answer keys, evaluate, results history, batch results with
  checked images, users (admin), waiting-for-approval. PDF rendering with pdfjs-dist 3.11.
- `.github/workflows/ci.yml`: tests, frontend build, deploy to App Service on push to `main`
  (needs secret `AZURE_WEBAPP_PUBLISH_PROFILE` and variable `AZURE_WEBAPP_NAME`).
- `docs/AZURE_SETUP.md`: step-by-step Azure setup. `samples/`: six sample scans with answer key
  `ABCDBACEDCABDECBADCEBDACEABCDEDCBAEDACBECADBEACDBA`. `run_local.bat` / `run_local.sh`: one-click
  local start (needs Python 3.11+ and, from a plain checkout, Node 20 to build the page first).
- Removed: Dockerfiles, docker-compose, nginx.conf, old endpoints/entry/evaluation modules.

## Verified behaviour on the samples

| Sample | Result |
|---|---|
| asha_patil.pdf | OK, score 44, all fields correct |
| rahul_desai.pdf | Review: two bubbles on q15 (read "CD"), score 38 |
| sana_khan_crooked_scan.pdf | OK despite tilt and blur, score 43 |
| vikram_and_meera_two_pages.pdf | Two rows, scores 47 and 40 |
| arjun_nair_folded_corner.pdf | Failed: corner targets not found |
| kavya_joshi_updated_sheet.pdf | Flagged; roll number wrong because the template is for the original sheet |

## Open items (need the owner)

1. Create the Azure resources per `docs/AZURE_SETUP.md` (about an hour) and add the GitHub
   secret and variable for deployment.
2. Decide which sheet design is printed. If the newer Endline sheet, update `backend/template.json`
   (Roll No block moved, mobile/gender bubbles gone) and test on ten real scans.
3. Choose the retention period for scanned sheets.
4. Review and merge pull request #1. Then pilot with two or three teachers on real scans.

## Ideas not done yet

Per-sheet corrections in the UI, exporting the checked image with the CSV, negative marking is
supported but untested with real teachers, phone-photo accuracy untested, custom domain,
Application Insights alerts, Microsoft for Nonprofits Azure credit application.
