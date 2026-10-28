// Small building blocks shared by the screens.
import classNames from 'classnames';
import { ReactNode, useEffect, useState } from 'react';
import { IconCheck, IconClose, IconInfo, IconWarning } from './Icons';

type Tone = 'info' | 'success' | 'warn' | 'error';

const toneClass: Record<Tone, string> = {
  info: 'bg-white border-line text-ink',
  success: 'bg-leaf-wash border-leaf-wash text-leaf-ink',
  warn: 'bg-sun-wash border-sun-wash text-sun-ink',
  error: 'bg-white border-danger text-danger',
};

const toneIcon: Record<Tone, ReactNode> = {
  info: <IconInfo className="mt-0.5 shrink-0" />,
  success: <IconCheck className="mt-0.5 shrink-0" />,
  warn: <IconWarning className="mt-0.5 shrink-0" />,
  error: <IconWarning className="mt-0.5 shrink-0" />,
};

/** A message box with an icon. Errors are announced to screen readers straight away, unless live is
 *  false: for a box that keeps growing while the person waits, which would otherwise be read out again
 *  in full at every change (the page then says once, in its own words, that something went wrong). */
export function Notice({ tone = 'info', title, children, onClose, className, live = true }: {
  tone?: Tone; title?: ReactNode; children?: ReactNode; onClose?: () => void; className?: string; live?: boolean;
}) {
  return (
    <div role={!live ? undefined : tone === 'error' ? 'alert' : 'status'}
      className={classNames('flex items-start gap-3 rounded-2xl border-2 px-4 py-3 text-[16px] leading-6', toneClass[tone], className)}>
      {toneIcon[tone]}
      <div className="min-w-0 flex-1">
        {title && <p className="m-0 font-semibold">{title}</p>}
        {children && <div className={classNames(title && 'mt-0.5')}>{children}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close this message"
          className="-mr-1.5 -mt-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5">
          <IconClose size={18} />
        </button>
      )}
    </div>
  );
}

/** Turning circle with a word, for anything that takes a moment. */
export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={classNames('flex items-center gap-3 py-10 text-muted', className)}>
      {/* Turns only for people whose device does not ask for less motion; otherwise it stays still. */}
      <span aria-hidden="true" className="h-6 w-6 rounded-full border-[3px] border-line border-t-brand motion-safe:animate-spin" />
      <span>{label}</span>
    </div>
  );
}

/** What to show when a list is empty: a sentence and usually one button. */
export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3">
      <p className="m-0 font-display text-xl font-semibold text-heading">{title}</p>
      {children && <div className="hint">{children}</div>}
      {action}
    </div>
  );
}

/** A filter chip. Pressed means chosen. */
export function Chip({ pressed, onClick, children, className }: {
  pressed: boolean; onClick: () => void; children: ReactNode; className?: string;
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={classNames('chip', className)}>
      {children}
    </button>
  );
}

/** Tells screen-reader users how many results are shown, a moment after they stop typing or change a
 *  filter. Starts with the text already in place, so nothing is read out when the list first appears. */
export function LiveCount({ text }: { text: string }) {
  const [said, setSaid] = useState(text);
  useEffect(() => {
    const timer = window.setTimeout(() => setSaid(text), 800);
    return () => window.clearTimeout(timer);
  }, [text]);
  return <p role="status" className="sr-only">{said}</p>;
}

/** Round letter avatar for a person. */
export function Avatar({ letter, className }: { letter: string; className?: string }) {
  return (
    <span aria-hidden="true"
      className={classNames('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-coral-wash font-bold text-brand', className)}>
      {letter}
    </span>
  );
}
