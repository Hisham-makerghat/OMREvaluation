// Stands in for the frame around every screen (AppShell) while the app asks the server who is signed in,
// before it knows the person or which tabs they get. The logo is the real one, so it is in place from the
// first moment; the page name, the tabs and the round letter are shapes. The sizes are AppShell's, so
// nothing moves when the real frame takes over. The page itself goes in as children.
import classNames from 'classnames';
import { ReactNode } from 'react';
import { Logo, Skeleton } from '../ui';

/** The three tabs every teacher has (Check, Keys, Results), as wide as the real ones measure: in the top
 *  bar, where each is an icon and a word (wider padding from 1024px), and their words in the phone's
 *  bottom bar. */
const TAB_WIDTHS = [
  { top: 'w-[109px] lg:w-[117px]', bottom: 'w-9' },
  { top: 'w-[98px] lg:w-[106px]', bottom: 'w-7' },
  { top: 'w-[115px] lg:w-[123px]', bottom: 'w-10' },
];

export default function ShellSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Only the logo, the app name and shapes up here: screen readers hear the loading label instead. */}
      <header aria-hidden="true" className="border-b border-line bg-white">
        <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6 md:gap-6">
          <div className="mr-1 flex shrink-0 items-center gap-6 sm:mr-2 md:mr-0">
            <Logo alt="" className="h-9 w-auto min-[340px]:h-10 sm:h-11" />
            <span className="hidden h-8 w-px bg-line lg:block forced-colors:bg-[CanvasText]" />
            <span className="hidden font-display text-lg font-semibold text-heading lg:inline">OMR Tool</span>
          </div>
          {/* Phone: the page name, on its 28px line. */}
          <div className="flex h-7 min-w-0 flex-1 items-center md:hidden">
            <Skeleton className="h-[18px] w-[120px] max-w-full rounded-full" />
          </div>
          <div className="order-1 hidden flex-1 flex-wrap justify-center gap-2 md:flex">
            {TAB_WIDTHS.map(({ top }, i) => <Skeleton key={i} className={classNames('h-12 rounded-full', top)} />)}
          </div>
          {/* The account button's padding around its 36px round letter, so the circle sits where the letter
              will. From 1280px the button also shows the person's name and an arrow: a bar, and room for
              the arrow. */}
          <div className="order-2 flex min-h-[48px] shrink-0 items-center gap-2 py-1 pl-1 pr-2 xl:pr-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="hidden h-3.5 w-24 rounded-full xl:block" />
            <span className="hidden w-[18px] xl:block" />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <div aria-hidden="true"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden"
        style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        <div className="flex pt-1.5">
          {/* The margins make up the icon's pill (4px above and below the icon) and the word's 20px line. */}
          {TAB_WIDTHS.map(({ bottom }, i) => (
            <div key={i} className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5">
              <Skeleton className="my-1 h-6 w-6 rounded-lg" />
              <Skeleton className={classNames('my-1 h-3 rounded-full', bottom)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
