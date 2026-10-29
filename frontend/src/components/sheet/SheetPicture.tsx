// The scanned sheet, big: the marked picture (every filled bubble boxed by the reader) or the
// original scan, with zoom, and coloured boxes around what the teacher should look at.
import classNames from 'classnames';
import {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Sheet, SheetLayout, sheetImageUrl } from '../../lib/api';
import { IconExpand, IconExternal, IconMinus, IconPlus } from '../Icons';
import { Skeleton, SkeletonScreen } from '../ui';

export type PictureKind = 'checked' | 'input';
type Box = [number, number, number, number];

const ZOOMS = [1, 1.5, 2, 3];
/** Room around each box, in % of the picture, so its border does not cover the bubbles. */
const PAD = 0.6;
/** The marked picture is always this size; giving it to the <img> keeps the page still while it loads. */
const MARKED_SIZE = { width: 1500, height: 1700 };
/** The original scan's size is only known once it starts to arrive. Most scans are A4 pages, so until
 *  then its <img> takes that shape, and so does the loading shape over it; "auto" switches to the
 *  scan's own shape as soon as the browser knows it. */
const SCAN_SHAPE = 'aspect-[auto_210/297]';
/** Laptop panel: the zoomed box is at least this tall (px) when the panel's middle has the room. */
const MIN_BOX = 200;
/** Laptop panel: px kept free under the zoomed box, for its frame's border. */
const BOX_GAP = 6;

const boxStyle = ([left, top, right, bottom]: Box): CSSProperties => ({
  left: `${left * 100 - PAD}%`,
  top: `${top * 100 - PAD}%`,
  width: `${(right - left) * 100 + 2 * PAD}%`,
  height: `${(bottom - top) * 100 + 2 * PAD}%`,
});

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Where the frame can be seen, top and bottom in pixels from the top of the window: the window,
 *  cut down to the viewer's scrolling middle. */
function seenBand(frame: HTMLElement): [number, number] {
  let top = 0;
  let bottom = window.innerHeight;
  const area = frame.parentElement?.closest('[data-scroll-area]');
  if (area) {
    const a = area.getBoundingClientRect();
    top = Math.max(top, a.top);
    bottom = Math.min(bottom, a.bottom);
  }
  return [top, bottom];
}

/** The rows of the frame that are on screen now, in pixels from the frame's top: the window and the
 *  viewer's scrolling middle can both cut it off. bottom <= top when none of it is on screen. */
function visibleRows(frame: HTMLElement): [number, number] {
  const f = frame.getBoundingClientRect();
  const [top, bottom] = seenBand(frame);
  return [Math.max(f.top, top) - f.top, Math.min(f.bottom, bottom) - f.top];
}

/** Laptop panel, zooming in from the whole picture: how tall the zoomed box may be. It takes the part
 *  of the picture that is on screen now, so all of the box, scroll bars included, stays in view and
 *  the zoom buttons do not move. When that part is small, at least MIN_BOX (the box is then
 *  scrolled into view). */
function roomOnScreen(frame: HTMLElement): number {
  const [top, bottom] = visibleRows(frame);
  const [bandTop, bandBottom] = seenBand(frame);
  const shown = Math.floor(bottom - top) - BOX_GAP;
  const most = Math.floor(bandBottom - bandTop) - BOX_GAP;
  return Math.max(shown, Math.min(MIN_BOX, most), 100);
}

/** The middle of the visible rows, or of the whole frame when none are visible. */
const middleRow = (frame: HTMLElement, [top, bottom]: [number, number]) =>
  (bottom > top ? (top + bottom) / 2 : frame.clientHeight / 2);

/** A point of the picture (fractions of its width and height) and where it should sit inside the
 *  frame after zooming, in pixels from the frame's top left corner; null means the middle. */
interface Anchor { fx: number; fy: number; ox: number | null; oy: number | null; }

interface Props {
  sheet: Sheet;
  view: PictureKind;
  onViewChange: (view: PictureKind) => void;
  /** Positions of questions and fields on the marked picture; null or undefined when there are none. */
  layout: SheetLayout | null | undefined;
  /** Layout labels to box in yellow: what the teacher should check. */
  problemLabels: string[];
  /** The question picked in the answers below, boxed in coral. */
  selected: string | null;
  /** "Tap an answer below ...": only when tapping really finds the answer on the picture. */
  showTapHint: boolean;
  alt: string;
  /** Laptop panel (which has its own scrolling middle): a zoomed picture is sized to fit on screen. */
  panel: boolean;
  /** Told how many yellow boxes the picture shows now (none until the marked picture has loaded), so
   *  the notice only mentions boxes the teacher can see. */
  onYellowBoxes?: (count: number) => void;
}

export default function SheetPicture({
  sheet, view, onViewChange, layout, problemLabels, selected, showTapHint, alt, panel, onYellowBoxes,
}: Props) {
  // Zoom belongs to one picture: switching between Marked and Original starts fitted again.
  // room: the zoomed box's height in px in the laptop panel (see roomOnScreen); null on phones,
  // where the box is at most 70% of the screen high (40% on a short screen, such as a phone turned
  // sideways, so all of it fits between the name and the buttons at the bottom).
  const [zoomed, setZoomed] = useState<{ view: PictureKind; zoom: number; room: number | null }>(
    { view, zoom: 1, room: null },
  );
  const zoom = zoomed.view === view ? zoomed.zoom : 1;
  const fitted = zoom === 1;
  const room = fitted ? null : zoomed.room;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ src: string; ok: boolean } | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const selectedBoxRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<Anchor | null>(null);
  const lastZoom = useRef(zoom);
  const lastSelected = useRef(selected);
  // An answer picked before its box could be drawn (the marked picture still loading, or Original
  // switching to Marked): it is scrolled to once the box is there.
  const scrollPending = useRef(false);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapZoomedAt = useRef(0);

  const plainSrc = sheetImageUrl(sheet.id, view);
  const src = attempt ? `${plainSrc}${plainSrc.includes('?') ? '&' : '?'}try=${attempt}` : plainSrc;
  const status: 'loading' | 'loaded' | 'failed' = result?.src === src ? (result.ok ? 'loaded' : 'failed') : 'loading';
  const ready = status === 'loaded';

  // Boxes only fit the marked picture, and only once it is on screen.
  const boxes = view === 'checked' && ready && layout ? layout.boxes : null;
  const yellow = boxes ? problemLabels.filter(label => boxes[label]) : [];
  const selectedBox: Box | null = boxes && selected ? boxes[selected] || null : null;

  // A picture already in the browser's cache can be ready before React listens for "load".
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) setResult({ src, ok: true });
  }, [src]);

  // Before the screen is drawn, so the notice never points to boxes that are not there (yet).
  const yellowCount = yellow.length;
  useLayoutEffect(() => {
    onYellowBoxes?.(yellowCount);
  }, [yellowCount, onYellowBoxes]);

  const changeZoom = (next: number, anchor: Anchor | null) => {
    if (next === zoom) return;
    anchorRef.current = next > 1 ? anchor : null;
    // Laptop panel: the box gets its height when zooming in from the whole picture, and keeps it
    // while zooming further, so it does not jump about.
    let nextRoom: number | null = null;
    if (next > 1 && panel) nextRoom = fitted ? (frameRef.current && roomOnScreen(frameRef.current)) : room;
    setZoomed({ view, zoom: next, room: nextRoom });
  };

  /** The picture point at (x, y) on screen. keepPlace: keep it under the pointer after zooming. */
  const pointAt = (x: number, y: number, keepPlace: boolean): Anchor | null => {
    const frame = frameRef.current;
    const inner = innerRef.current;
    if (!frame || !inner) return null;
    const f = frame.getBoundingClientRect();
    const p = inner.getBoundingClientRect();
    if (!p.width || !p.height) return null;
    return {
      fx: clamp01((x - p.left) / p.width),
      fy: clamp01((y - p.top) / p.height),
      ox: keepPlace ? x - f.left : null,
      oy: keepPlace ? y - f.top : null,
    };
  };

  /** The middle of the part of the picture that is on screen right now. */
  const visibleMiddle = (): Anchor | null => {
    const frame = frameRef.current;
    if (!frame) return null;
    const f = frame.getBoundingClientRect();
    return pointAt(f.left + frame.clientWidth / 2, f.top + middleRow(frame, visibleRows(frame)), false);
  };

  const zoomStep = (direction: 1 | -1) => {
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(zoom) + direction))];
    if (fitted && selectedBox) {
      // From the whole picture, zoom in on the answer the teacher picked.
      const [left, top, right, bottom] = selectedBox;
      changeZoom(next, { fx: (left + right) / 2, fy: (top + bottom) / 2, ox: null, oy: null });
    } else {
      changeZoom(next, visibleMiddle());
    }
  };

  const toggleAt = (x: number, y: number) => changeZoom(fitted ? 2 : 1, pointAt(x, y, true));

  // After the zoom changed: scroll the picture so the chosen point is where it should be.
  useLayoutEffect(() => {
    const from = lastZoom.current;
    lastZoom.current = zoom;
    const frame = frameRef.current;
    const inner = innerRef.current;
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (!frame || !inner || zoom === 1) return;
    const topBefore = frame.getBoundingClientRect().top;
    let rows = visibleRows(frame);
    // Zooming in turns the long picture into a shorter scroll box, which can end up mostly above
    // the screen when the teacher had scrolled down: bring it back. In the laptop panel, also bring
    // in a box that only partly fits after zooming in from the whole picture, so its scroll bars can
    // be reached. Otherwise leave the page alone, so the zoom buttons stay where they were.
    if ((panel && from === 1) || rows[1] - rows[0] < frame.clientHeight / 2) {
      frame.scrollIntoView({ block: 'nearest' });
    }
    const moved = frame.getBoundingClientRect().top !== topBefore;
    if (moved) rows = visibleRows(frame);
    if (!anchor) return;
    const ox = anchor.ox === null || anchor.ox > frame.clientWidth ? frame.clientWidth / 2 : anchor.ox;
    const keepY = anchor.oy !== null && !moved && anchor.oy >= rows[0] && anchor.oy <= rows[1];
    const oy = keepY && anchor.oy !== null ? anchor.oy : middleRow(frame, rows);
    frame.scrollLeft = anchor.fx * inner.offsetWidth - ox;
    frame.scrollTop = anchor.fy * inner.offsetHeight - oy;
  }, [zoom, panel]);

  // Picking an answer brings its box into view. Zoomed in, the picture (not the page) scrolls to it.
  // Fitted, the viewer scrolls just enough to show it, since the answers sit below the picture and
  // the box can be out of sight above them. A box drawn after the pick (the picture was still
  // loading) is scrolled to when it appears; a zoom change, or the box coming back after Original,
  // does not scroll again.
  useEffect(() => {
    if (lastSelected.current !== selected) {
      lastSelected.current = selected;
      scrollPending.current = selected !== null;
    }
    const frame = frameRef.current;
    const box = selectedBoxRef.current;
    if (!scrollPending.current || !frame || !box) return;
    scrollPending.current = false;
    if (zoom === 1) {
      const [seenTop, seenBottom] = seenBand(frame);
      const r = box.getBoundingClientRect();
      if (r.top < seenTop || r.bottom > seenBottom) {
        box.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
      return;
    }
    const f = frame.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const rows = visibleRows(frame);
    if (b.left >= f.left && b.right <= f.right && b.top >= f.top + rows[0] && b.bottom <= f.top + rows[1]) return;
    frame.scrollTo({
      left: box.offsetLeft + box.offsetWidth / 2 - frame.clientWidth / 2,
      top: box.offsetTop + box.offsetHeight / 2 - middleRow(frame, rows),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [selected, zoom, selectedBox]);

  // Double tap on touch screens. touch-action: manipulation stops the browser zooming the page instead.
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || !ready) return;
    const now = Date.now();
    const prev = lastTap.current;
    if (prev && now - prev.t < 350 && Math.abs(e.clientX - prev.x) < 30 && Math.abs(e.clientY - prev.y) < 30) {
      lastTap.current = null;
      tapZoomedAt.current = now;
      toggleAt(e.clientX, e.clientY);
    } else {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    // Some phones also send a double click after a double tap that was already handled above.
    if (!ready || Date.now() - tapZoomedAt.current < 700) return;
    toggleAt(e.clientX, e.clientY);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || !ready) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomStep(1);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomStep(-1);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <div role="group" aria-label="Which picture" className="flex gap-2">
          <button type="button" aria-pressed={view === 'checked'} disabled={!sheet.has_checked_image}
            onClick={() => onViewChange('checked')}
            className="chip disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line">
            Marked
          </button>
          <button type="button" aria-pressed={view === 'input'} onClick={() => onViewChange('input')} className="chip">
            Original
          </button>
        </div>
        <div role="group" aria-label="Zoom" className="flex items-center gap-1.5">
          <button type="button" className="btn btn-icon btn-secondary" aria-label="Zoom out"
            disabled={!ready || zoom === ZOOMS[0]} onClick={() => zoomStep(-1)}>
            <IconMinus size={20} />
          </button>
          <span aria-live="polite" className="min-w-[3.25rem] text-center text-[15px] font-semibold tabular-nums text-heading">
            <span className="sr-only">Zoom </span>
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className="btn btn-icon btn-secondary" aria-label="Zoom in"
            disabled={!ready || zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => zoomStep(1)}>
            <IconPlus size={20} />
          </button>
          <button type="button" className="btn btn-icon btn-secondary" aria-label="Fit to width"
            disabled={fitted} onClick={() => changeZoom(1, null)}>
            <IconExpand size={20} />
          </button>
        </div>
        <a href={plainSrc} target="_blank" rel="noopener noreferrer"
          className="link ml-auto inline-flex min-h-[44px] items-center gap-1.5 text-[15px]">
          <IconExternal size={18} />
          Open picture
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        {showTapHint && (
          <p className="m-0 basis-full text-[14px] leading-5 text-muted">Tap an answer below to find it on the sheet.</p>
        )}
      </div>

      <div className="relative mx-5 overflow-hidden rounded-xl border border-line bg-white">
        <div ref={frameRef} role="group" tabIndex={0} aria-label="Sheet picture. Plus and minus keys zoom."
          data-zoomed={fitted ? undefined : 'true'}
          onKeyDown={onKeyDown} onDoubleClick={onDoubleClick} onPointerUp={onPointerUp}
          style={{ touchAction: 'manipulation', maxHeight: room ?? undefined }}
          className={classNames('focus-visible:outline-offset-[-3px]', !fitted && 'overflow-auto',
            !fitted && room === null && 'max-h-[70vh] [@media(max-height:500px)]:max-h-[40vh]',
            !ready && 'min-h-[240px]')}>
          {/* zoom x 100% wide: above 1 the frame scrolls around the bigger picture */}
          <div ref={innerRef} className="relative select-none" style={{ width: `${zoom * 100}%` }}>
            <img key={view} ref={imgRef} src={src} alt={alt} draggable={false} decoding="async"
              {...(view === 'checked' ? MARKED_SIZE : {})}
              onLoad={() => setResult({ src, ok: true })} onError={() => setResult({ src, ok: false })}
              className={classNames('block h-auto w-full', view === 'input' && SCAN_SHAPE, status === 'failed' && 'hidden')} />
            {boxes && yellow.map(label => (
              <div key={label} aria-hidden="true" style={boxStyle(boxes[label])}
                className="pointer-events-none absolute rounded-md border-[3px] border-sun-ink ring-4 ring-sun" />
            ))}
            {selectedBox && (
              <div ref={selectedBoxRef} aria-hidden="true" style={boxStyle(selectedBox)}
                className="pointer-events-none absolute scroll-m-6 rounded-md border-[3px] border-brand ring-4 ring-coral/[.55]" />
            )}
          </div>
        </div>
        {/* The loading shape fills the frame, which already has the picture's shape (MARKED_SIZE,
            SCAN_SHAPE), so nothing moves when the picture comes. Solid white under it, so a picture
            drawn bit by bit as it arrives does not show through. */}
        {status === 'loading' && (
          <SkeletonScreen label="Loading the picture…" className="absolute inset-0 bg-white">
            <Skeleton className="h-full w-full rounded-none" />
          </SkeletonScreen>
        )}
        {status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white p-5 text-center">
            <p className="m-0">The picture could not be loaded.</p>
            <button type="button" className="btn btn-secondary"
              onClick={() => {
                setAttempt(n => n + 1);
                // This message goes away while the picture loads again: keep the keyboard on the picture.
                frameRef.current?.focus();
              }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </>
  );
}
