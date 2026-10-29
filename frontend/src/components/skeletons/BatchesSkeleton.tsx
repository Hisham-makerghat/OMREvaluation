// Stands in for the Results list (BatchesPage) while it loads: the search box, the three chips and two
// groups of batch cards. Every shape is the size of what replaces it, so nothing moves when the list
// arrives. The page title stays real above it.
import classNames from 'classnames';
import { IconChevronRight } from '../Icons';
import { Skeleton, SkeletonScreen } from '../ui';

/** One 26px line of a batch card, with a bar a little shorter than its words. */
function Line({ bar, className }: { bar: string; className?: string }) {
  return (
    <div className={classNames('flex h-[26px] items-center', className)}>
      <Skeleton className={classNames('max-w-full rounded-full', bar)} />
    </div>
  );
}

/** A block of 15px words, one bar per line. Lines after the first show only below 420px wide, where the
 *  real words wrap onto a second line. */
function Block({ bars }: { bars: string[] }) {
  return (
    <div>
      {bars.map((bar, i) => <Line key={i} bar={classNames('h-3.5', bar)} className={classNames(i > 0 && 'min-[420px]:hidden')} />)}
    </div>
  );
}

/** Bar widths for one card: the batch name; the test, date and who checked it; the sheet counts. */
interface CardWidths { name: string; about: string[]; counts: string[]; }

// Different on every card, so the list looks like real names and numbers. Below 420px wide the counts
// take two lines. So does the middle line this week, as its dates carry a time ("yesterday 3:05 pm");
// older dates are short ("14 Oct") and fit on one. From 420px the words fit on one line, as on a laptop.
const THIS_WEEK: CardWidths[] = [
  { name: 'w-60', about: ['w-full min-[420px]:w-[320px]', 'w-1/4'], counts: ['w-11/12 min-[420px]:w-[290px]', 'w-1/5'] },
  { name: 'w-44', about: ['w-11/12 min-[420px]:w-[360px]', 'w-1/2'], counts: ['w-full min-[420px]:w-[270px]', 'w-1/6'] },
];
const EARLIER: CardWidths[] = [
  { name: 'w-56', about: ['w-[250px]'], counts: ['w-11/12 min-[420px]:w-[380px]', 'w-1/2'] },
  { name: 'w-52', about: ['w-[264px]'], counts: ['w-full min-[420px]:w-[280px]', 'w-1/6'] },
  { name: 'w-48', about: ['w-[240px]'], counts: ['w-11/12 min-[420px]:w-[310px]', 'w-1/4'] },
];

/** One batch card, laid out as BatchRow lays out the real one. */
function CardSkeleton({ widths: { name, about, counts } }: { widths: CardWidths }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-white px-[18px] py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Line bar={classNames('h-[18px]', name)} />
        <Block bars={about} />
        <Block bars={counts} />
      </div>
      {/* The arrow every card has, pale like the shapes. A contrast theme shows it in the shapes' grey. */}
      <IconChevronRight size={22} className="shrink-0 text-line forced-colors:text-[GrayText]" />
    </div>
  );
}

/** "This week" or "Earlier": the small heading (20px line), then the cards. */
function GroupSkeleton({ label, cards }: { label: string; cards: CardWidths[] }) {
  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex h-5 items-center">
        <Skeleton className={classNames('h-3 rounded-full', label)} />
      </div>
      <div className="flex flex-col gap-4">
        {cards.map((widths, i) => <CardSkeleton key={i} widths={widths} />)}
      </div>
    </div>
  );
}

export default function BatchesSkeleton() {
  return (
    <SkeletonScreen label="Loading results…" className="flex flex-col gap-4">
      {/* The search box. */}
      <Skeleton className="h-14 w-full rounded-[14px]" />
      {/* The chips "All", "Mine" and "Has sheets to check", each as wide as the real one, so they wrap
          the same way on a narrow phone. */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-[44px] w-[54px] rounded-full" />
        <Skeleton className="h-[44px] w-[69px] rounded-full" />
        <Skeleton className="h-[44px] w-[168px] rounded-full" />
      </div>
      <GroupSkeleton label="w-20" cards={THIS_WEEK} />
      <GroupSkeleton label="w-16" cards={EARLIER} />
    </SkeletonScreen>
  );
}
