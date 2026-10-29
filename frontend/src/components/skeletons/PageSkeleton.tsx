// The page at this address while the app asks the server who is signed in, inside ShellSkeleton: its
// title and the words under it, which are the same for everyone, and its own skeleton below them, laid
// out as the page lays them out while its data loads, so nothing moves when the page takes over.
// Screen readers hear only the opening screen's label: nothing here is a heading, a link or a button yet.
import { IconChevronLeft } from '../Icons';
import { Skeleton } from '../ui';
import BatchesSkeleton from './BatchesSkeleton';
import BatchSkeleton from './BatchSkeleton';
import EvaluateSkeleton from './EvaluateSkeleton';
import TestsSkeleton from './TestsSkeleton';
import UsersSkeleton from './UsersSkeleton';

export default function PageSkeleton({ path }: { path: string }) {
  if (path === '/tests') {
    return (
      <div aria-hidden="true" className="page flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="page-title">Answer keys</p>
            {/* The "New key" button. */}
            <Skeleton className="h-[52px] w-[148px] rounded-full" />
          </div>
          <p className="hint">The right answers for each test. You need one before you can check sheets.</p>
        </div>
        <TestsSkeleton />
      </div>
    );
  }
  if (path === '/batches') {
    return (
      <div aria-hidden="true" className="page flex flex-col gap-4">
        <p className="page-title">Results</p>
        <BatchesSkeleton />
      </div>
    );
  }
  if (/^\/batches\/[^/]+\/?$/.test(path)) {
    return (
      <div aria-hidden="true" className="page flex flex-col gap-3.5">
        {/* "All results", which becomes the link back to the list. */}
        <span className="link inline-flex min-h-[44px] items-center gap-1 self-start text-[15px]">
          <IconChevronLeft size={18} />
          All results
        </span>
        <BatchSkeleton />
      </div>
    );
  }
  if (path === '/users') {
    return (
      <div aria-hidden="true" className="page flex flex-col gap-4">
        <p className="page-title">Users</p>
        <p className="hint">Teachers sign up on the sign-in page with their email. Approve them here and they can start checking sheets.</p>
        <UsersSkeleton />
      </div>
    );
  }
  // The app opens "Check sheets" from "/" and from any address it does not know.
  return (
    <div aria-hidden="true" className="page flex flex-col gap-5">
      <p className="page-title">Check sheets</p>
      <EvaluateSkeleton />
    </div>
  );
}
