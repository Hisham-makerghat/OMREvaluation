"""Command line use without the web app: evaluate a folder of scans with an answer key.

    python main.py --input scans/ --key ABCDBACED... --out results.csv

The key is one letter per question in order. Images (JPG, PNG) and PDFs (every page) are read.
"""
import argparse
import csv
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from omr import Engine, load_pages  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", "-i", required=True, help="folder of PDF/JPG/PNG scans")
    ap.add_argument("--key", "-k", required=True, help="answer key, one letter per question, e.g. ABCDA...")
    ap.add_argument("--out", "-o", default="results.csv")
    ap.add_argument("--checked-dir", help="also save the checked pictures here")
    args = ap.parse_args()

    engine = Engine(BACKEND_DIR / "template.json")
    key = {f"q{i + 1}": ch for i, ch in enumerate(args.key.strip().upper())}
    qlabels = list(key)
    files = sorted(p for p in Path(args.input).iterdir() if p.suffix.lower() in (".pdf", ".jpg", ".jpeg", ".png"))
    if args.checked_dir:
        Path(args.checked_dir).mkdir(parents=True, exist_ok=True)

    with open(args.out, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["file", "page", "status", "needs_review", "reason", "score"] + engine.field_labels + qlabels)
        for f in files:
            for i, page in enumerate(load_pages(f.read_bytes(), f.name), start=1):
                r = engine.evaluate(page, key, name=f"{f.stem}-{i}")
                w.writerow([f.name, i, "ok" if r.ok else "error", "yes" if r.needs_review else "",
                            r.error_reason or r.review_reason, "" if r.score is None else r.score]
                           + [r.fields.get(k, "") for k in engine.field_labels] + [r.answers.get(k, "") for k in qlabels])
                print(f"{f.name} p{i}: {'score ' + str(r.score) if r.ok else r.error_reason}")
                if args.checked_dir and r.checked_image_jpeg:
                    (Path(args.checked_dir) / f"{f.stem}-p{i}.jpg").write_bytes(r.checked_image_jpeg)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
