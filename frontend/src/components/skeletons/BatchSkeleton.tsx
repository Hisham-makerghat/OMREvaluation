// Stands in for the results of one batch (BatchPage) while they load: the batch's name and details,
// the filter chips, the search box, the list of students and the download button, and from 1024 px
// the checked sheet beside the list. The "All results" link above it is real: the page shows it
// while loading too.
import { Skeleton, SkeletonScreen } from '../ui';

/** Widths for each student's name and the line under it: a little different on every row, the same
 *  every time. Fixed widths, not parts of the row, because a name is as long on a tablet as on a phone. */
const ROWS = [
  { name: 'w-36', status: 'w-32' },
  { name: 'w-28', status: 'w-40' },
  { name: 'w-44', status: 'w-28' },
  { name: 'w-32', status: 'w-36' },
  { name: 'w-40', status: 'w-32' },
];

export default function BatchSkeleton() {
  return (
    <SkeletonScreen label="Loading the results…" className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex w-full min-w-0 flex-col gap-3.5 lg:w-[440px] lg:flex-none">
        {/* The batch's name: one line of the page title, 36 px high (38 px from 768 px). */}
        <div className="flex h-9 items-center md:h-[38px]">
          <Skeleton className="h-6 w-72 max-w-full rounded-full" />
        </div>
        {/* Test, date, sheets, average and who checked: two lines on a phone and in the 440 px column on
            a laptop, one line in between (from 640 px), where the page is wide. */}
        <div className="flex flex-col">
          <div className="flex h-[22px] items-center">
            <Skeleton className="h-3 w-11/12 max-w-[600px] rounded-full" />
          </div>
          <div className="flex h-[22px] items-center sm:hidden lg:flex">
            <Skeleton className="h-3 w-1/2 rounded-full" />
          </div>
        </div>
        {/* "All 32", "To check 2", "Could not read 1": as wide as those words, so they fit on one row or
            wrap where the real chips do (one row on a 375 px phone, two on a 360 px one). */}
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-[72px] rounded-full" />
          <Skeleton className="h-11 w-[104px] rounded-full" />
          <Skeleton className="h-11 w-[144px] rounded-full" />
        </div>
        {/* The search box and its label: the page shows them for more than 8 sheets, so for nearly every
            class. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex h-6 items-center">
            <Skeleton className="h-3.5 w-72 max-w-full rounded-full" />
          </div>
          <Skeleton className="h-14 w-full rounded-[14px]" />
        </div>
        {/* Students: the real row's white frame, with the score circle, the name and the line under it. */}
        <div className="flex flex-col gap-3">
          {ROWS.map((row, i) => (
            <div key={i} className="flex items-center gap-3.5 rounded-2xl border-2 border-line bg-white px-[18px] py-3.5">
              <Skeleton className="h-[52px] w-[52px] shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-7 items-center">
                  <Skeleton className={`h-4 max-w-full rounded-full ${row.name}`} />
                </div>
                <div className="flex h-[22px] items-center">
                  <Skeleton className={`h-3 max-w-full rounded-full ${row.status}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Download for Excel, and the line under it. */}
        <div className="flex flex-col gap-1.5 pt-1">
          <Skeleton className="h-[52px] w-full rounded-full" />
          <div className="flex h-[22px] items-center justify-center">
            <Skeleton className="h-3 w-80 max-w-full rounded-full" />
          </div>
        </div>
      </div>

      {/* The checked sheet beside the list, from 1024 px as on the loaded page. The page shows the "All
          results" link above this skeleton, while the real sheet starts level with that link: pulled up
          by the link and the gap under it (44 + 14 px), so it does not move when the results arrive. */}
      <div className="hidden min-w-0 flex-1 self-start lg:sticky lg:top-6 lg:-mt-[58px] lg:block">
        <div className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_4px_6px_-2px_rgba(0,0,0,0.1)]">
          {/* The student's name, the line under it and the score. */}
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex h-7 items-center">
                <Skeleton className="h-4 w-44 max-w-full rounded-full" />
              </div>
              <div className="flex h-5 items-center">
                <Skeleton className="h-3 w-56 max-w-full rounded-full" />
              </div>
            </div>
            <Skeleton className="h-8 w-[72px] shrink-0 rounded-full" />
          </div>
          {/* The middle part, cut off at the bottom like the real one, but hidden instead of scrolling, so
              nothing here can take the keyboard focus. The real one always has more than fits, so it has a
              scroll bar: the gutter keeps the same room for it, and the picture is as wide. */}
          <div className="min-h-0 flex-1 overflow-hidden [scrollbar-gutter:stable]">
            {/* The band that says what to check, or why the sheet could not be read. The sheet shown first
                is one of those whenever the batch has any, and most of these bands take two lines. */}
            <div className="flex items-start gap-2.5 px-5 py-3">
              <Skeleton className="mt-0.5 h-6 w-6 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex h-6 items-center">
                  <Skeleton className="h-3.5 w-full rounded-full" />
                </div>
                <div className="flex h-6 items-center">
                  <Skeleton className="h-3.5 w-2/3 rounded-full" />
                </div>
              </div>
            </div>
            {/* Marked and Original, the zoom buttons and Open picture. */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <div className="flex gap-2">
                <Skeleton className="h-11 w-[88px] rounded-full" />
                <Skeleton className="h-11 w-[90px] rounded-full" />
              </div>
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="flex w-[3.25rem] justify-center">
                  <Skeleton className="h-3 w-9 rounded-full" />
                </div>
                <Skeleton className="h-11 w-11 rounded-full" />
                <Skeleton className="h-11 w-11 rounded-full" />
              </div>
              <div className="ml-auto flex h-11 items-center">
                <Skeleton className="h-3 w-28 rounded-full" />
              </div>
            </div>
            {/* The marked picture is always 1500 x 1700 px. */}
            <Skeleton className="mx-5 aspect-[15/17] rounded-xl" />
          </div>
          {/* Previous and Next. */}
          <div className="flex shrink-0 gap-2.5 border-t border-line px-5 pb-5 pt-4">
            <Skeleton className="h-[52px] min-w-0 flex-1 rounded-full" />
            <Skeleton className="h-[52px] min-w-0 flex-1 rounded-full" />
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
