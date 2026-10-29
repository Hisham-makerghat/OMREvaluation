// Stands in for the "Check sheets" screen (pages/EvaluatePage.tsx) while the answer keys load: the card
// with the test and the batch name, the Scans card before any file is chosen (evaluate/ScansCard.tsx)
// and the big button. The page title is real and already on screen. Each box has the height of the real
// one, also where its text runs onto more lines on a narrow screen, so nothing moves when the keys arrive.
import { Skeleton, SkeletonScreen } from '../ui';

export default function EvaluateSkeleton() {
  return (
    <SkeletonScreen label="Loading answer keys…" className="flex flex-col gap-5">
      {/* "Which test?" and "Batch name": a label above a 56px select or text box, side by side from md.
          Each bar's margins make up its line's height: 24px for a label, 28px for a title, 22px for a hint. */}
      <div className="card grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Skeleton className="my-1 h-4 w-20 rounded-full" />
          <Skeleton className="h-14 w-full rounded-[14px]" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* "Batch name (optional, e.g. school and class)" runs onto a second line below 383px. */}
          <div className="flex flex-col">
            <Skeleton className="my-1 h-4 w-72 max-w-full rounded-full" />
            <Skeleton className="my-1 h-4 w-10 rounded-full min-[383px]:hidden" />
          </div>
          <Skeleton className="h-14 w-full rounded-[14px]" />
        </div>
      </div>

      <div className="card flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Skeleton className="my-1 h-5 w-16 rounded-full" />
          {/* The hint under "Scans" takes 5 lines below 298px (a folded Galaxy Fold is 280px), 4 on a 360px
              phone, 3 from 373px, 2 from 516px and 1 from 976px (where the real text wraps). The lines go at
              those widths; the last one left is short. */}
          <div className="flex flex-col">
            <Skeleton className="my-1 h-3.5 w-full rounded-full lg:w-4/5" />
            <Skeleton className="my-1 h-3.5 w-11/12 rounded-full min-[516px]:w-2/5 min-[976px]:hidden" />
            <Skeleton className="my-1 h-3.5 w-3/4 rounded-full min-[516px]:hidden" />
            <Skeleton className="my-1 h-3.5 w-5/6 rounded-full min-[298px]:hidden" />
            <Skeleton className="my-1 h-3.5 w-1/3 rounded-full min-[373px]:hidden" />
          </div>
        </div>
        {/* The dashed buttons: "Take photos" and "Choose PDF or photos" on phones (side by side from sm),
            "Choose PDF or photos" and "Choose a folder" from md. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-[72px] w-full rounded-2xl md:hidden" />
          <Skeleton className="h-[72px] w-full rounded-2xl" />
          <Skeleton className="hidden h-[72px] w-full rounded-2xl md:block" />
        </div>
        {/* "or drag files here", from md. */}
        <Skeleton className="my-1 hidden h-3.5 w-28 self-center rounded-full md:block" />
        {/* The tip about photos, below md: on 3 lines below 308px, 2 below 535px. */}
        <div className="flex flex-col md:hidden">
          <Skeleton className="my-1 h-3.5 w-11/12 rounded-full" />
          <Skeleton className="my-1 h-3.5 w-3/4 rounded-full min-[308px]:hidden" />
          <Skeleton className="my-1 h-3.5 w-1/2 rounded-full min-[535px]:hidden" />
        </div>
      </div>

      {/* The big "Check sheets" button. */}
      <Skeleton className="h-16 w-full rounded-full" />
    </SkeletonScreen>
  );
}
