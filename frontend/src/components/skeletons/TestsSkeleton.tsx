// Stands in for the list on the "Answer keys" screen while the keys load: cards shaped like the real
// ones (KeyCard in pages/TestsPage.tsx), with bars where the test's name, its details and "Edit" will be.
import classNames from 'classnames';
import { Skeleton, SkeletonScreen } from '../ui';

// Bar widths, about those of real names and details. In rem, since text does not stretch on a wide
// screen; max-w-full keeps them inside the card on a phone. Different on each card so it looks like a
// list, fixed so nothing flickers.
// On a narrow screen a line too long for the card runs onto a second one, as the real text does. The text
// gets the screen's width less 141 px (page and card padding, the gap and "Edit"), so each second bar
// shows below its first bar's width plus 141 px: 384 px of details fit on one line from 525 px wide.
const CARDS = [
  { name: 'w-52', nameEnd: 'w-1/4 min-[349px]:hidden', details: 'w-96', detailsEnd: 'w-3/5 min-[525px]:hidden' },
  { name: 'w-40', nameEnd: 'w-1/4 min-[301px]:hidden', details: 'w-80', detailsEnd: 'w-1/2 min-[461px]:hidden' },
  { name: 'w-64', nameEnd: 'w-1/3 min-[397px]:hidden', details: 'w-[26rem]', detailsEnd: 'w-2/3 min-[557px]:hidden' },
  { name: 'w-36', nameEnd: 'w-1/4 min-[285px]:hidden', details: 'w-[22rem]', detailsEnd: 'w-2/5 min-[493px]:hidden' },
];

export default function TestsSkeleton() {
  return (
    <SkeletonScreen label="Loading answer keys…" className="flex flex-col gap-5">
      {CARDS.map((card, i) => (
        // Same box and padding as a key card, so the real cards take its place without a jump.
        <div key={i} className="flex min-h-[72px] items-center gap-3.5 rounded-2xl border border-line bg-white px-5 py-4">
          {/* Each bar's margins make up its line's height: 28 px for the name, 22 px for a line of details. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <Skeleton className={classNames('my-1 h-5 max-w-full rounded-full', card.name)} />
            <Skeleton className={classNames('my-1 h-5 rounded-full', card.nameEnd)} />
            <Skeleton className={classNames('my-1 h-3.5 max-w-full rounded-full', card.details)} />
            <Skeleton className={classNames('my-1 h-3.5 rounded-full', card.detailsEnd)} />
          </div>
          {/* The pencil and "Edit". */}
          <Skeleton className="h-4 w-14 shrink-0 rounded-full" />
        </div>
      ))}
    </SkeletonScreen>
  );
}
