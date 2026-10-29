// The Users screen (admins only) while the list of people loads: the "Waiting for approval" heading with
// one sign-up card, then the "Everyone" heading with five people. The page title and the sentence under it
// are already on screen. Each box has the size of the real one at every width, so nothing moves when the
// list arrives.
import classNames from 'classnames';
import { Skeleton, SkeletonScreen } from '../ui';

/** Name and email widths for the five people, fixed so the skeleton looks the same every time. */
const PEOPLE = [
  { name: 'w-36', email: 'w-52' },
  { name: 'w-28', email: 'w-44' },
  { name: 'w-40', email: 'w-56' },
  { name: 'w-32', email: 'w-48' },
  { name: 'w-24', email: 'w-40' },
];

export default function UsersSkeleton() {
  return (
    <SkeletonScreen label="Loading people…" className="flex flex-col gap-4">
      {/* Section label: 14px capitals on a 20px line, with the same mt-2 as the real heading. */}
      <div className="mt-2 flex h-5 items-center">
        <Skeleton className="h-3 w-48 rounded-full" />
      </div>

      {/* One person waiting. The real card's yellow border means someone is waiting, which is not known
          yet, so this one has the plain line colour, in the same 2px width. */}
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-white px-[18px] py-4">
        <div className="flex flex-col">
          {/* Name in the heading font on a 28px line, then email and sign-up time on a 22px line. */}
          <div className="flex h-7 items-center">
            <Skeleton className="h-[18px] w-40 rounded-full" />
          </div>
          <div className="flex h-[22px] items-center">
            <Skeleton className="h-3.5 w-5/6 rounded-full min-[480px]:w-80" />
          </div>
          {/* On phones the email and "signed up today 4:40 pm" usually run onto a second line. From 480px
              wide the card has room for about 400px of text, so most fit on one. */}
          <div className="flex h-[22px] items-center min-[480px]:hidden">
            <Skeleton className="h-3.5 w-1/3 rounded-full" />
          </div>
        </div>
        {/* Approve and Not now. On phones Approve stretches to fill the row, like the real button. It never
            gets narrower than the real button either, so on a very narrow or zoomed-in screen Not now drops
            to a second line here too, as it does for real. */}
        <div className="flex flex-wrap gap-2.5">
          <Skeleton className="h-[52px] w-[118px] min-w-[118px] flex-1 rounded-full sm:flex-none" />
          <Skeleton className="h-[52px] w-[116px] rounded-full" />
        </div>
      </div>

      <div className="mt-2 flex h-5 items-center">
        <Skeleton className="h-3 w-24 rounded-full" />
      </div>

      <div className="flex flex-col gap-4">
        {PEOPLE.map(({ name, email }, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-[18px] py-3.5">
            {/* Name on a 26px line (17px text), email on a 22px line. */}
            <div className="flex min-w-0 flex-[1_1_220px] flex-col">
              <div className="flex h-[26px] items-center">
                <Skeleton className={classNames('h-4 rounded-full', name)} />
              </div>
              <div className="flex h-[22px] items-center">
                <Skeleton className={classNames('h-3.5 rounded-full', email)} />
              </div>
            </div>
            {/* Role select and Turn off button at their real sizes, so on phones this group wraps under
                the name at the same width as the real one. */}
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-11 w-[140px] rounded-[10px]" />
              <Skeleton className="h-11 w-[88px] rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}
