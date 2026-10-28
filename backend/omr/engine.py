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
from src.utils.image import ImageUtils
from src.utils.parsing import get_concatenated_response

QUESTION_RE = re.compile(r"^q(\d+)$")
# Longest side of a page image handed to the engine. The engine itself works on a
# 666 x 820 copy, so anything above ~1000 px only costs upload time.
PAGE_RENDER_DPI = 100
# The corner-marker warp crops the page exactly at the marker centres, which puts the first
# name column on the image edge. Pad the warped page by this fraction on every side so a
# bubble that prints a little outside the markers is still fully in the picture.
MARGIN_RATIO = 0.03
# Blocks with at least this many columns and rows get their bubble grid re-fitted to the
# printed circles of each scan (see fit_grid_axis). Smaller blocks keep the template layout.
MIN_FITTED_GRID = 5


def fit_grid_axis(ink_profile: np.ndarray, start: float, pitch: float, count: int,
                  circle_radius: float, pitch_tolerance: float = 0.06) -> Tuple[float, float]:
    """Find where a row of `count` printed circles really is along one axis.

    `ink_profile` is the darkness summed across the other axis (one value per pixel).
    Each printed circle (outline plus the letter or digit inside it) shows up as a band of
    ink `circle_radius` either side of its centre, with a paler gap before the next one.
    The profile is scored with "ink inside the circle minus ink in the gap around it",
    which peaks sharply at every circle centre. Starting from the template's `start`
    centre and `pitch`, nearby offsets and pitches are tried and the placement whose
    circle centres score highest wins. Different print runs of the sheet shift and
    stretch the grids by a few pixels, enough to lose a bubble on the edge of a block.
    """
    inner = max(int(round(circle_radius)), 1)
    outer = max(int(round(pitch / 2)), inner + 1)
    kernel = np.full(2 * outer + 1, -1.0, np.float32)
    kernel[outer - inner:outer + inner + 1] = 1.0
    kernel[kernel < 0] *= (2 * inner + 1) / float(np.sum(kernel < 0))   # zero-mean: flat ink scores 0
    matched = np.convolve(ink_profile.astype(np.float32), kernel, mode="same")
    xs = np.arange(len(matched))
    idx = np.arange(count)
    best = (-1.0, start, pitch)
    for p in np.arange(pitch * (1 - pitch_tolerance), pitch * (1 + pitch_tolerance), 0.1):
        for s in np.arange(start - pitch / 2, start + pitch / 2, 0.5):
            score = float(np.interp(s + idx * p, xs, matched, left=0, right=0).sum())
            if score > best[0]:
                best = (score, s, p)
    return best[1], best[2]


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
        # The template's bubble positions, kept so every read starts from the same layout.
        self._template_points = [
            (pt, pt.x, pt.y)
            for block in self.template.field_blocks
            for field in block.traverse_bubbles
            for pt in field
        ]

    def _place_bubbles(self, img: np.ndarray, margin_x: float, margin_y: float, scale_x: float, scale_y: float):
        """Move every bubble window to where it is on this particular page image.

        First the template layout is shifted for the padding added around the warped page,
        then each large grid (name, roll, mobile, answers) is fitted to the circles actually
        printed on the sheet.
        """
        for pt, x, y in self._template_points:
            pt.x = round((x + margin_x) * scale_x)
            pt.y = round((y + margin_y) * scale_y)
        page_h, page_w = img.shape[:2]
        ink = 255 - img.astype(np.float32)
        for block in self.template.field_blocks:
            box_w, box_h = block.bubble_dimensions
            points = [pt for field in block.traverse_bubbles for pt in field]
            cols = sorted({pt.x for pt in points})
            rows = sorted({pt.y for pt in points})
            if len(cols) < MIN_FITTED_GRID or len(rows) < MIN_FITTED_GRID:
                continue
            pitch_x = (cols[-1] - cols[0]) / (len(cols) - 1)
            pitch_y = (rows[-1] - rows[0]) / (len(rows) - 1)
            # Ink inside the block's area only, half a pitch beyond the outer circles.
            x0 = max(int(cols[0] - pitch_x / 2), 0)
            x1 = min(int(cols[-1] + box_w + pitch_x / 2), page_w)
            y0 = max(int(rows[0] - pitch_y / 2), 0)
            y1 = min(int(rows[-1] + box_h + pitch_y / 2), page_h)
            area = ink[y0:y1, x0:x1]
            col_profile = np.zeros(page_w, np.float32)
            col_profile[x0:x1] = area.sum(axis=0)
            row_profile = np.zeros(page_h, np.float32)
            row_profile[y0:y1] = area.sum(axis=1)
            # The printed circles are about as big as the smaller side of the bubble window.
            radius = 0.5 * min(box_w, box_h)
            start_x, fit_pitch_x = fit_grid_axis(col_profile, cols[0] + box_w / 2, pitch_x, len(cols), radius)
            start_y, fit_pitch_y = fit_grid_axis(row_profile, rows[0] + box_h / 2, pitch_y, len(rows), radius)
            col_index = {x: i for i, x in enumerate(cols)}
            row_index = {y: i for i, y in enumerate(rows)}
            for pt in points:
                cx = start_x + col_index[pt.x] * fit_pitch_x
                cy = start_y + row_index[pt.y] * fit_pitch_y
                pt.x = int(min(max(round(cx - box_w / 2), 0), page_w - box_w))
                pt.y = int(min(max(round(cy - box_h / 2), 0), page_h - box_h))

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
        # Pad the marker-cropped page, bring it to the template's size and put the bubble
        # windows where this scan's grids really are (see _place_bubbles).
        h, w = warped.shape[:2]
        pad_x, pad_y = int(round(w * MARGIN_RATIO)), int(round(h * MARGIN_RATIO))
        warped = cv2.copyMakeBorder(warped, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_REPLICATE)
        page_w, page_h = self.template.page_dimensions
        img = ImageUtils.resize_util(warped, page_w, page_h)
        self._place_bubbles(img, pad_x * page_w / w, pad_y * page_h / h,
                            w / (w + 2 * pad_x), h / (h + 2 * pad_y))
        try:
            raw, final_marked, multi_marked, _ = ops.read_omr_response(
                self.template, image=img, name=name, save_dir=None)
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
        elif not (raw.get("name1") or "").strip():
            # Names are written from the first column; a blank first column usually means
            # the scan lost a letter at the edge of the sheet.
            reasons.append("name does not start in the first column")
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
