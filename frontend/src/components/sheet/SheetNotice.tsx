// The band under the student's name: what to look at on a sheet marked "to check", or why a
// sheet could not be read.
import classNames from 'classnames';
import { Sheet } from '../../lib/api';
import { errorText, Problem } from '../../lib/sheets';
import { IconWarning } from '../Icons';

/** "Question 15: C and D are both filled, ..." -> ["Question 15:", "C and D are both filled, ..."],
 *  so the first clause can be bold. A sentence with no break stays whole. */
export function splitLead(text: string): [string, string] {
  const m = /^(.+?(?::|\.|,(?=\s+so\s)))\s+(\S[\s\S]*)$/.exec(text);
  return m ? [m[1], m[2]] : [text, ''];
}

function Lead({ text }: { text: string }) {
  const [lead, rest] = splitLead(text);
  return (
    <>
      <b className="font-semibold">{lead}</b>
      {rest && ` ${rest}`}
    </>
  );
}

/** True when the band has something to say: the sheet could not be read, or it needs a check. */
export const hasNotice = (sheet: Sheet, problems: Problem[]) => sheet.status === 'error' || problems.length > 0;

export default function SheetNotice({ sheet, problems, boxCount, centred = false }: {
  sheet: Sheet;
  problems: Problem[];
  /** How many yellow boxes the picture shows for these problems right now. */
  boxCount: number;
  /** Full screen on a tablet: the band spans the screen and its words line up with the sheet below. */
  centred?: boolean;
}) {
  if (!hasNotice(sheet, problems)) return null;
  const row = classNames('flex items-start gap-2.5', centred && 'mx-auto w-full max-w-[720px]');

  // break-words: a long file name or reason wraps instead of pushing the viewer sideways.
  if (sheet.status === 'error') {
    // Dark text on the red wash: red text on it is too faint to read comfortably.
    return (
      <div className="bg-danger-wash px-5 py-3 text-base leading-6 text-heading">
        <div className={row}>
          <IconWarning className="mt-0.5 shrink-0 text-danger" />
          <p className="m-0 min-w-0 break-words"><Lead text={errorText(sheet.error_reason)} /></p>
        </div>
      </div>
    );
  }

  const where = boxCount === 0 ? ''
    : boxCount === 1 ? 'The yellow box on the picture shows where.' : 'The yellow boxes on the picture show where.';
  return (
    <div className="bg-sun-wash px-5 py-3 text-base leading-6 text-sun-ink">
      <div className={row}>
        <IconWarning className="mt-0.5 shrink-0" />
        {problems.length === 1 ? (
          <p className="m-0 min-w-0 break-words">
            <Lead text={problems[0].text} />
            {where && ` ${where}`}
          </p>
        ) : (
          <div className="min-w-0 break-words">
            <p className="m-0 font-semibold">Please check:</p>
            <ul className="m-0 list-disc pl-5">
              {problems.map((p, i) => <li key={i}>{p.text}</li>)}
            </ul>
            {where && <p className="m-0 mt-1">{where}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
