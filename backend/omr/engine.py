"""A thin, stateless wrapper around the OMRChecker core.

The original project reads sheets from a folder and appends to CSV files on disk.
This module turns that into one function call per sheet so the web app can
process uploads directly and keep results in a database.
"""
from __future__ import annotations

import io
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.defaults import CONFIG_DEFAULTS
from src.template import Template
from src.utils.parsing import get_concatenated_response

QUESTION_RE = re.compile(r"^q(\d+)$")
# Longest side of a page image handed to the engine. The engine itself works on a
# 666 x 820 copy, so anything above ~1000 px only costs upload time.
PAGE_RENDER_DPI = 100


@dataclass
class SheetResult:
    ok: bool
    fields: Dict[str, str] = field(default_factory=dict)      # Name, Roll Number, ...
    answers: Dict[str, str] = field(default_factory=dict)     # q1 -> "A", "" when blank, "CD" when double
    score: Optional[float] = None
    needs_review: bool = False
    review_reason: str = ""
    error_reason: str = ""
    checked_image_jpeg: Optional[bytes] = None


def load_pages(data: bytes, filename: str) -> List[np.ndarray]:
    """Turn an uploaded file into grayscale page images. PDFs yield one image per page."""
    name = (filename or "").lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        import pymupdf  # imported lazily: only needed when a PDF arrives

        pages = []
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            for page in doc:
                pix = page.get_pixmap(dpi=PAGE_RENDER_DPI, colorspace=pymupdf.csGRAY)
                img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
                pages.append(img.copy())
        return pages
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError("file is not a PDF, JPEG or PNG")
    return [img]


def score_answers(answers: Dict[str, str], answer_key: Dict[str, str],
                  marks_correct: float = 1, marks_incorrect: float = 0,
                  marks_unmarked: float = 0) -> float:
    """Marks for each question in the key. A double-marked question counts as incorrect."""
    total = 0.0
    for q, correct in answer_key.items():
        marked = (answers.get(q) or "").strip()
        if marked == "":
            total += marks_unmarked
        elif marked == correct:
            total += marks_correct
        else:
            total += marks_incorrect
    return total


class Engine:
    """Holds the loaded sheet template. One instance per process; calls are serialised
    because the underlying OMRChecker code keeps per-call state on the template object."""

    def __init__(self, template_path: Path):
        self.template_path = Path(template_path)
        self.template = Template(self.template_path, CONFIG_DEFAULTS)
        self._lock = threading.Lock()
        self.question_labels = sorted(
            (lbl for lbl in self.template.output_columns if QUESTION_RE.match(lbl)),
            key=lambda s: int(QUESTION_RE.match(s).group(1)),
        )
        self.field_labels = [lbl for lbl in self.template.output_columns if not QUESTION_RE.match(lbl)]

    def read(self, page: np.ndarray, name: str = "sheet") -> SheetResult:
        """Read one page image. Never raises for a bad sheet; returns ok=False instead."""
        with self._lock:
            return self._read(page, name)

    def _read(self, page: np.ndarray, name: str) -> SheetResult:
        ops = self.template.image_instance_ops
        ops.reset_all_save_img()
        try:
            warped = ops.apply_preprocessors(name, page.copy(), self.template)
        except Exception as exc:  # the core raises on very odd inputs
            return SheetResult(ok=False, error_reason=f"could not process image: {exc}")
        if warped is None:
            return SheetResult(ok=False, error_reason="corner targets not found: check that all four corners are in the scan")
        try:
            raw, final_marked, multi_marked, _ = ops.read_omr_response(
                self.template, image=warped, name=name, save_dir=None)
        except Exception as exc:
            return SheetResult(ok=False, error_reason=f"could not read bubbles: {exc}")
        conc = get_concatenated_response(raw, self.template)
        fields = {k: (conc.get(k) or "").strip() for k in self.field_labels}
        answers = {k: (conc.get(k) or "").strip() for k in self.question_labels}

        reasons = []
        if multi_marked:
            doubles = [q for q, v in answers.items() if len(v) > 1]
            if doubles:
                reasons.append("two bubbles filled for " + ", ".join(doubles[:5]) + (" ..." if len(doubles) > 5 else ""))
            else:
                reasons.append("two bubbles filled in a name or number field")
        if not fields.get("Name"):
            reasons.append("name is blank")
        if "Roll Number" in fields and not fields["Roll Number"]:
            reasons.append("roll number is blank")

        ok, jpeg = cv2.imencode(".jpg", final_marked, [cv2.IMWRITE_JPEG_QUALITY, 70])
        return SheetResult(
            ok=True, fields=fields, answers=answers,
            needs_review=bool(reasons), review_reason="; ".join(reasons),
            checked_image_jpeg=jpeg.tobytes() if ok else None,
        )

    def evaluate(self, page: np.ndarray, answer_key: Dict[str, str], name: str = "sheet",
                 marks_correct: float = 1, marks_incorrect: float = 0, marks_unmarked: float = 0) -> SheetResult:
        result = self.read(page, name)
        if result.ok:
            result.score = score_answers(result.answers, answer_key, marks_correct, marks_incorrect, marks_unmarked)
        return result
