// The "Scans" card: buttons to add PDFs and photos (the camera on phones, a whole folder on laptops),
// a drop zone on laptops, and the list of chosen files with their page counts.
import classNames from 'classnames';
import { ChangeEvent, DragEvent as ReactDragEvent, InputHTMLAttributes, useEffect, useRef, useState } from 'react';
import { plural } from '../../lib/format';
import { IconCamera, IconClose, IconFile, IconFolder, IconUpload } from '../Icons';
import { useToast } from '../Toast';
import { Notice } from '../ui';
import { filesFromDrop } from './dropFiles';
import { addFiles, removeAllFiles, removeFile, ScanFile, sheetTotals } from './session';

const FILE_TYPES = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
// Lets a file input pick a whole folder (with its sub-folders). The attribute is not in React's types.
const FOLDER_PICKER = { webkitdirectory: 'true' } as unknown as InputHTMLAttributes<HTMLInputElement>;
const MAX_NAMES = 5;

const dragHasFiles = (e: ReactDragEvent) => Array.from(e.dataTransfer.types).indexOf('Files') !== -1;

/** "20 pages", "1 photo" or "counting…". A file that could not be opened shows a warning instead. */
function countText(f: ScanFile): string {
  if (f.kind === 'photo') return '1 photo';
  return f.pages === null ? 'counting…' : plural(f.pages, 'page');
}

/** "3 files · 38 sheets", "3 files · counting pages…", "2 files · 20 sheets · 1 file could not be opened". */
function listSummary(files: ScanFile[]): string {
  const { counting, sheets, unreadable } = sheetTotals(files);
  const parts = [plural(files.length, 'file'), counting ? 'counting pages…' : plural(sheets, 'sheet')];
  if (unreadable > 0) parts.push(`${plural(unreadable, 'file')} could not be opened`);
  return parts.join(' · ');
}

function skippedText(names: string[]): string {
  const more = names.length > MAX_NAMES ? ` and ${names.length - MAX_NAMES} more` : '';
  const list = names.slice(0, MAX_NAMES).join(', ') + more;
  return names.length === 1
    ? `Skipped 1 file that is not PDF, JPG or PNG: ${list}`
    : `Skipped ${names.length} files that are not PDF, JPG or PNG: ${list}`;
}

function addedText(added: ScanFile[], duplicates: number): string {
  const what = added.every(f => f.kind === 'photo') ? 'photo' : 'file';
  const again = duplicates === 0 ? '' : `. ${plural(duplicates, 'file')} ${duplicates === 1 ? 'was' : 'were'} already in the list`;
  return `Added ${plural(added.length, what)}${again}`;
}

/** locked: the list belongs to a checking run (running or finished); finished: that run is over. */
export default function ScansCard({ files, locked, finished }: { files: ScanFile[]; locked: boolean; finished: boolean }) {
  const toast = useToast();
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('');

  // Once checking starts, a note about the last files picked is out of date.
  useEffect(() => {
    if (locked) {
      setNotice('');
      setDragging(false);
      dragDepth.current = 0;
    }
  }, [locked]);

  const take = (picked: File[]) => {
    if (picked.length === 0) return; // the picker was closed without choosing
    const { added, duplicates, skipped } = addFiles(picked);
    if (skipped.length > 0) setNotice(skippedText(skipped));
    else if (added.length === 0 && duplicates === 0) setNotice('There are no PDF, JPG or PNG files in what you chose.');
    else setNotice('');
    if (added.length > 0) toast(addedText(added, duplicates));
    else if (duplicates > 0) toast(duplicates === 1 ? 'That file is already in the list' : 'Those files are already in the list');
  };

  const onPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // so the same file can be picked again later
    take(picked);
  };

  // dragenter and dragleave also fire when moving over the card's own buttons and rows,
  // so count them to know when the drag has really left the card.
  const onDragEnter = (e: ReactDragEvent<HTMLElement>) => {
    if (locked || !dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: ReactDragEvent<HTMLElement>) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = locked ? 'none' : 'copy';
  };
  const onDragLeave = (e: ReactDragEvent<HTMLElement>) => {
    if (locked || !dragHasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: ReactDragEvent<HTMLElement>) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (locked) return;
    filesFromDrop(e.dataTransfer).then(take, () => setNotice('Those files could not be read. Use “Choose PDF or photos” instead.'));
  };

  const remove = (index: number, f: ScanFile) => {
    removeFile(f.key);
    // Keep keyboard focus in the list: the next file's button, else the one before, else "Choose".
    window.setTimeout(() => {
      const buttons = list.current ? list.current.querySelectorAll<HTMLButtonElement>('button') : null;
      const next = buttons ? buttons[index] || buttons[index - 1] : null;
      (next || chooseButton.current)?.focus();
    }, 0);
  };

  const removeAll = () => {
    if (files.length > 1 && !window.confirm(`Remove all ${files.length} files from the list?`)) return;
    removeAllFiles();
    setNotice('');
    chooseButton.current?.focus();
  };

  const highlighted = dragging && !locked;

  return (
    <section aria-labelledby="scans-title"
      className={classNames('card flex flex-col gap-4', highlighted && 'border-coral-dark ring-2 ring-coral-dark')}
      onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className="flex flex-col gap-1">
        <h2 id="scans-title" className="section-title">Scans</h2>
        {finished ? (
          // Says why the buttons below are greyed out after a check.
          <p className="hint">These sheets are checked. To check other sheets, press “Check more sheets” above.</p>
        ) : (
          <p className="hint">
            PDF, JPG or PNG. Every page of a PDF is one sheet. Files are made smaller on this device before they are sent,
            so slow internet is fine.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button type="button" className="btn-drop md:hidden" disabled={locked} onClick={() => cameraInput.current?.click()}>
          <IconCamera size={26} strokeWidth={2.2} className="shrink-0" />
          Take photos of sheets
        </button>
        <button ref={chooseButton} type="button" className="btn-drop" disabled={locked} onClick={() => fileInput.current?.click()}>
          <IconUpload size={26} strokeWidth={2.2} className="shrink-0" />
          Choose PDF or photos
        </button>
        <button type="button" className="btn-drop hidden md:inline-flex" disabled={locked} onClick={() => folderInput.current?.click()}>
          <IconFolder size={26} strokeWidth={2.2} className="shrink-0" />
          Choose a folder
        </button>
      </div>
      {!locked && (
        <p className={classNames('hint hidden text-center md:block', highlighted && 'font-semibold text-brand')}>
          {highlighted ? 'Let go to add the files to the list' : 'or drag files here'}
        </p>
      )}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPicked} />
      <input ref={fileInput} type="file" accept={FILE_TYPES} multiple className="hidden" onChange={onPicked} />
      <input ref={folderInput} type="file" className="hidden" onChange={onPicked} {...FOLDER_PICKER} />

      {/* No close button: the note goes by itself with the next pick, "Remove all" or "Check". */}
      {notice && <Notice tone="warn" className="[overflow-wrap:anywhere]">{notice}</Notice>}

      {files.length > 0 && (
        <>
          <ul ref={list} aria-label="Chosen files" className="flex flex-col gap-2">
            {files.map((f, index) => (
              <li key={f.key} className="flex min-w-0 items-center gap-3 rounded-xl bg-ivory px-3.5 py-3">
                <IconFile size={22} className="shrink-0 text-muted" />
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  {/* The whole name, on more lines if needed: names that differ only at the end ("part1.pdf",
                      "part2.pdf") must still look different on a phone, which shows no tooltips. */}
                  <span className="max-w-full font-semibold [overflow-wrap:anywhere]">{f.file.name}</span>
                  {/* Under the name so the name keeps its room on a phone; on white, as red on ivory is too faint. */}
                  {f.unreadable && <span className="pill tone-error">could not open</span>}
                </span>
                {!f.unreadable && <span className="shrink-0 text-[15px] text-muted">{countText(f)}</span>}
                {!locked && (
                  <button type="button" className="btn btn-icon bg-white text-brand hover:bg-coral-wash"
                    aria-label={`Remove ${f.file.name}`} onClick={() => remove(index, f)}>
                    <IconClose size={18} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="hint">{listSummary(files)}</p>
            {!locked && (
              <button type="button" className="btn btn-quiet btn-small -mr-2" onClick={removeAll}>Remove all</button>
            )}
          </div>
        </>
      )}

      <p className="hint md:hidden">Tip: lay each sheet flat, with all four corner circles in the photo.</p>
    </section>
  );
}
