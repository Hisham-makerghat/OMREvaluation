// One checked sheet, big: who it is, the score, what to check, the picture and every answer.
// The same viewer sits beside the list on wide screens (mode "panel") and covers the whole screen
// on phones and tablets (mode "screen": a dialog closed by its back button, Escape or Back).
import classNames from 'classnames';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sheet, sheetImageUrl, Test } from '../lib/api';
import { fmtScore } from '../lib/format';
import {
  FIELD, gender, mobileNumber, Problem, problemsOf, rollNumber, sheetKind, sheetTitle, sourceLabel, studentName,
} from '../lib/sheets';
import { IconChevronLeft, IconChevronRight } from './Icons';
import AnswerGrid, { AnswerCell, answerCells } from './sheet/AnswerGrid';
import SheetNotice, { hasNotice } from './sheet/SheetNotice';
import SheetPicture, { PictureKind } from './sheet/SheetPicture';
import { LayoutResult, SheetLayouts } from './sheet/useSheetLayouts';

export type ViewerMode = 'panel' | 'screen';

export interface SheetViewerProps {
  /** panel: beside the list on wide screens. screen: full screen over everything (phones, tablets). */
  mode: ViewerMode;
  sheet: Sheet;
  /** The batch's test: answer key, number of questions and marks. */
  test: Test;
  /** The most one sheet can score (0 when the answer key is empty). */
  maxScore: number;
  /** Where this sheet is in the list the teacher moves through (from 1), and how long that list is. */
  position: number;
  total: number;
  prev: Sheet | null;
  next: Sheet | null;
  /** Where questions sit on each marked picture. The page keeps them, so each sheet is asked for
   *  once however often a phone opens and closes the viewer. */
  layouts: SheetLayouts;
  onPrev: () => void;
  onNext: () => void;
  /** Screen mode: back to the list. */
  onClose?: () => void;
}

const KNOWN_FIELDS: string[] = [FIELD.name, FIELD.roll, FIELD.mobile, FIELD.gender];

/** "Sheet 3 of 5 · roll 2302 · 9876500012 · Male", plus any other field the sheet template has.
 *  A sheet with no name says where it came from ("class7.pdf, page 12"): its title is that file
 *  name, which is cut short on a phone, and the page number is what the teacher needs to scan it again. */
function detailsLine(sheet: Sheet, position: number, total: number): string {
  const fields = sheet.fields || {};
  const others = Object.keys(fields)
    .filter(k => KNOWN_FIELDS.indexOf(k) < 0 && (fields[k] || '').trim())
    .map(k => `${k}: ${fields[k].trim()}`);
  const roll = rollNumber(sheet);
  const from = studentName(sheet) ? '' : sourceLabel(sheet);
  return [`Sheet ${position} of ${total}`, from, roll && `roll ${roll}`, mobileNumber(sheet), gender(sheet), ...others]
    .filter(Boolean)
    .join(' · ');
}

function pictureAlt(sheet: Sheet, view: PictureKind): string {
  const name = studentName(sheet);
  const whose = name ? `${name}'s sheet` : `The sheet from ${sourceLabel(sheet)}`;
  return view === 'checked' ? `${whose}, with every filled bubble boxed and labelled` : `${whose}, as it was scanned`;
}

/** The notice, picture and answers. It is keyed by the sheet, so the picture choice, zoom, scroll
 *  position and picked answer start fresh on every sheet. In the panel all of it scrolls; full
 *  screen, the notice stays put between the name and the part that scrolls (as on the phone design),
 *  so "Check question 15" stays in view while the teacher looks at the sheet. On a short screen (a
 *  phone turned sideways, a zoomed-in laptop) a pinned notice would leave almost no room for the
 *  sheet, so there it scrolls with the sheet, as in the panel. Only one of the two copies is shown;
 *  the hidden one (display: none) is not read out either. */
function SheetBody({ sheet, problems, cells, layout, screen }: {
  sheet: Sheet;
  problems: Problem[];
  cells: AnswerCell[];
  layout: LayoutResult;
  screen: boolean;
}) {
  const [view, setView] = useState<PictureKind>(sheet.has_checked_image ? 'checked' : 'input');
  const [selected, setSelected] = useState<string | null>(null);
  // Yellow boxes the picture really shows: none until the marked picture has loaded, none if it fails.
  const [yellowShown, setYellowShown] = useState(0);
  const boxes = layout ? layout.boxes : null;
  const problemLabels = useMemo(
    () => Array.from(new Set(problems.reduce<string[]>((all, p) => all.concat(p.boxes), []))),
    [problems],
  );
  const canFindAnswers = !!boxes && cells.some(c => boxes[c.label]);

  const select = (label: string | null) => {
    setSelected(label);
    // The answer can only be boxed on the marked picture, so show it when the teacher looks for one.
    if (label && boxes && boxes[label] && sheet.has_checked_image) setView('checked');
  };

  const notice = <SheetNotice sheet={sheet} problems={problems} boxCount={yellowShown} centred={screen} />;
  const fullScreenNotice = screen && hasNotice(sheet, problems);

  return (
    <>
      {fullScreenNotice && (
        <div className="max-h-[30vh] shrink-0 overflow-y-auto overscroll-contain [@media(max-height:500px)]:hidden">
          {notice}
        </div>
      )}
      <div data-scroll-area className={classNames('min-h-0 flex-1 overflow-y-auto', screen && 'overscroll-contain')}>
        <div className={classNames(screen && 'mx-auto w-full max-w-[760px]', cells.length === 0 && 'pb-5')}>
          {screen ? fullScreenNotice && <div className="hidden [@media(max-height:500px)]:block">{notice}</div> : notice}
          <SheetPicture sheet={sheet} view={view} onViewChange={setView} layout={layout} problemLabels={problemLabels}
            selected={selected} showTapHint={canFindAnswers} alt={pictureAlt(sheet, view)} panel={!screen}
            onYellowBoxes={setYellowShown} />
          {studentName(sheet) && (
            <p className="m-0 break-words px-5 pt-2 text-[15px] leading-[22px] text-muted">From {sourceLabel(sheet)}</p>
          )}
          {cells.length > 0 && <AnswerGrid cells={cells} selected={selected} onSelect={select} compact={screen} />}
        </div>
      </div>
    </>
  );
}

export default function SheetViewer({
  mode, sheet, test, maxScore, position, total, prev, next, layouts, onPrev, onNext, onClose,
}: SheetViewerProps) {
  const screen = mode === 'screen';
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { load, layoutOf } = layouts;

  const problems = useMemo(() => problemsOf(sheet, test.question_count), [sheet, test.question_count]);
  const cells = useMemo(() => (sheet.status === 'ok' ? answerCells(sheet, test) : []), [sheet, test]);

  useEffect(() => {
    load(sheet);
    load(next);
  }, [load, sheet, next]);

  // Warm the browser cache with the next picture, so Next feels instant.
  useEffect(() => {
    if (!next) return;
    const img = new Image();
    img.src = sheetImageUrl(next.id, next.has_checked_image ? 'checked' : 'input');
  }, [next]);

  // Full screen: freeze the page behind, take it away from keyboards and screen readers, start at the name.
  useLayoutEffect(() => {
    if (!screen) return undefined;
    const root = document.getElementById('root');
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', '');
    headingRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      root?.removeAttribute('inert');
    };
  }, [screen]);

  // Another sheet rebuilds the middle part. When the keyboard focus was in it (an arrow key pressed on
  // a zoom button, say) or on a button that is now switched off (Next on the last sheet), it has
  // fallen back to the page itself: put it on the new student's name, so Tab and screen readers
  // carry on from there instead of from the top of the page.
  const shownId = useRef(sheet.id);
  useLayoutEffect(() => {
    if (shownId.current === sheet.id) return;
    shownId.current = sheet.id;
    const active = document.activeElement;
    if (!active || active === document.body) headingRef.current?.focus({ preventScroll: true });
  }, [sheet.id]);

  // Left and right arrows move between sheets; Escape closes the full screen view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key === 'Escape') {
        if (screen && onClose) {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      // Arrows still move the cursor in a text box, scroll a zoomed-in picture and move between the
      // answer squares (data-own-arrows).
      const target = e.target instanceof Element ? e.target : null;
      const ownArrows = 'input, textarea, select, [contenteditable="true"], [data-zoomed="true"], [data-own-arrows]';
      if (target?.closest(ownArrows)) return;
      if (e.key === 'ArrowLeft' && prev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && next) {
        e.preventDefault();
        onNext();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [screen, onClose, prev, next, onPrev, onNext]);

  const kind = sheetKind(sheet);
  const title = sheetTitle(sheet);
  // Full screen on a tablet: keep the content at a readable width.
  const inner = (className: string) => classNames(className, screen && 'mx-auto w-full max-w-[760px]');

  // Full screen on a short screen (a phone turned sideways, a zoomed-in laptop): the bars at the top
  // and bottom get slimmer, so the sheet keeps most of the height.
  const header = (
    <div className={classNames('shrink-0 border-b border-line bg-white',
      screen ? 'px-3 py-2.5 [@media(max-height:500px)]:py-1.5' : 'px-5 py-3.5')}>
      <div className={inner(classNames('flex items-center', screen ? 'gap-2.5' : 'gap-3'))}>
        {screen && (
          <button type="button" onClick={onClose} aria-label="Back to the list"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ivory text-brand hover:bg-coral-wash">
            <IconChevronLeft size={22} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {/* A long name takes two lines (one on a short screen). A file name stays on one line: the
              line below gives it in full. */}
          <h2 id={headingId} ref={headingRef} tabIndex={-1}
            className={classNames('m-0 font-display text-xl font-semibold leading-7 text-heading',
              studentName(sheet) ? 'line-clamp-2 break-words [@media(max-height:500px)]:line-clamp-1' : 'truncate')}>
            {title}
          </h2>
          <p className="m-0 break-words text-[14px] leading-5 text-muted">{detailsLine(sheet, position, total)}</p>
        </div>
        {kind === 'error' ? (
          <span className="pill tone-error shrink-0">Could not read</span>
        ) : (
          <p className="m-0 shrink-0 whitespace-nowrap font-display font-bold leading-none text-heading">
            <span aria-hidden="true">
              <span className={screen ? 'text-[28px]' : 'text-[32px]'}>{fmtScore(sheet.score)}</span>
              {maxScore > 0 && <span className="text-[15px] font-medium text-muted"> / {fmtScore(maxScore)}</span>}
            </span>
            <span className="sr-only">
              Score {fmtScore(sheet.score)}{maxScore > 0 ? ` out of ${fmtScore(maxScore)}` : ''}
            </span>
          </p>
        )}
      </div>
    </div>
  );

  const nextLabel = next ? (
    <>
      <span className="truncate">Next: {sheetTitle(next)}</span>
      <IconChevronRight size={20} className="shrink-0" />
    </>
  ) : 'Last sheet';

  // The bottom padding keeps the buttons above the home bar of phones that have one. It is set with
  // classes, not a style, so a short screen can make it smaller.
  const footer = screen ? (
    <div className="shrink-0 border-t border-line bg-white px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-2.5 [@media(max-height:500px)]:pb-[max(6px,env(safe-area-inset-bottom))] [@media(max-height:500px)]:pt-1.5">
      <div className={inner('flex gap-2')}>
        <button type="button" aria-label="Previous sheet" disabled={!prev} onClick={onPrev}
          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-line bg-white text-brand hover:border-brand disabled:cursor-not-allowed disabled:text-muted disabled:opacity-60 disabled:hover:border-line [@media(max-height:500px)]:h-12 [@media(max-height:500px)]:w-12">
          <IconChevronLeft />
        </button>
        <button type="button" disabled={!next} onClick={onNext}
          className="btn btn-primary min-h-[56px] min-w-0 flex-1 px-5 [@media(max-height:500px)]:min-h-[48px]">
          {nextLabel}
        </button>
      </div>
    </div>
  ) : (
    <div className="flex shrink-0 gap-2.5 border-t border-line px-5 pb-5 pt-4">
      <button type="button" disabled={!prev} onClick={onPrev} className="btn btn-secondary min-w-0 flex-1 px-4">
        <IconChevronLeft size={20} className="shrink-0" />
        Previous
      </button>
      <button type="button" disabled={!next} onClick={onNext} className="btn btn-primary min-w-0 flex-1 px-4">
        {nextLabel}
      </button>
    </div>
  );

  const content = (
    <>
      {header}
      <SheetBody key={sheet.id} sheet={sheet} problems={problems} cells={cells} layout={layoutOf(sheet)} screen={screen} />
      {footer}
      {/* Tells screen reader users which sheet is open after Previous, Next or an arrow key. */}
      <p aria-live="polite" className="sr-only">{`Sheet ${position} of ${total}: ${title}`}</p>
    </>
  );

  if (!screen) {
    // Never taller than the window, so the name, the score and Next stay in view while the middle scrolls.
    return (
      <section aria-labelledby={headingId}
        className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_4px_6px_-2px_rgba(0,0,0,0.1)]">
        {content}
      </section>
    );
  }
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={headingId} className="fixed inset-0 z-40 flex flex-col bg-ivory pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {content}
    </div>,
    document.body,
  );
}
