// Line icons in one style (24 x 24, round strokes). They are decoration only: every icon sits next
// to a word or inside a button with an aria-label, so they are hidden from screen readers.
import { ReactNode } from 'react';

interface IconProps { className?: string; size?: number; strokeWidth?: number; }

const Svg = ({ className, size = 24, strokeWidth = 2, children }: IconProps & { children: ReactNode }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
);

export const IconUpload = (p: IconProps) => <Svg {...p}><path d="M12 16V4" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></Svg>;
export const IconKey = (p: IconProps) => <Svg {...p}><circle cx="8" cy="15" r="4" /><path d="m10.9 12.1 9.1-9.1" /><path d="m17 6 3 3" /></Svg>;
export const IconChart = (p: IconProps) => <Svg {...p}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-8" /><path d="M22 20H2" /></Svg>;
export const IconUsers = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="4" /><path d="M2 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /><path d="M17 11a3 3 0 1 0 0-6" /><path d="M22 20c0-2.8-1.6-5.2-4-6.3" /></Svg>
);
export const IconChevronRight = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="m9 6 6 6-6 6" /></Svg>;
export const IconChevronLeft = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="m15 6-6 6 6 6" /></Svg>;
export const IconChevronDown = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const IconClose = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IconFile = (p: IconProps) => <Svg {...p}><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /></Svg>;
export const IconFolder = (p: IconProps) => <Svg {...p}><path d="M3 7h5l2 2h11v10H3z" /></Svg>;
export const IconCamera = (p: IconProps) => <Svg {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>;
export const IconWarning = (p: IconProps) => <Svg {...p}><path d="M12 3 2 20h20z" /><path d="M12 9v5" /><path d="M12 17h.01" /></Svg>;
export const IconClock = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const IconCheck = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="m5 12 5 5L20 7" /></Svg>;
export const IconPlus = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconMinus = (p: IconProps) => <Svg strokeWidth={2.5} {...p}><path d="M5 12h14" /></Svg>;
export const IconDownload = (p: IconProps) => <Svg {...p}><path d="M12 4v12" /><path d="m6 10 6 6 6-6" /><path d="M4 20h16" /></Svg>;
export const IconSearch = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
export const IconTrash = (p: IconProps) => <Svg {...p}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></Svg>;
export const IconSignOut = (p: IconProps) => <Svg {...p}><path d="M10 4H5v16h5" /><path d="m15 8 4 4-4 4" /><path d="M19 12H9" /></Svg>;
export const IconExpand = (p: IconProps) => <Svg {...p}><path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" /></Svg>;
export const IconExternal = (p: IconProps) => <Svg {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v6H4V6h6" /></Svg>;
export const IconInfo = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.5h.01" /></Svg>;
export const IconPencil = (p: IconProps) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13 7 4 4" /></Svg>;
export const IconArchive = (p: IconProps) => <Svg {...p}><path d="M3 4h18v4H3z" /><path d="M5 8v12h14V8" /><path d="M10 12h4" /></Svg>;
export const IconRefresh = (p: IconProps) => <Svg {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Svg>;
