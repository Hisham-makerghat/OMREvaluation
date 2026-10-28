// Where each question and field sits on a sheet's marked picture, so the viewer can draw boxes
// around them. Asked for once per sheet: the results page keeps the answers while it is open, so a
// phone that opens and closes students does not ask again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, Sheet, SheetLayout } from '../../lib/api';

/** undefined: not known yet. null: no positions for this sheet (checked before they were
 *  recorded, could not be read, or the request did not get through). */
export type LayoutResult = SheetLayout | null | undefined;

/** Only a read sheet with a marked picture can have positions. */
const canHaveLayout = (s: Sheet) => s.status === 'ok' && s.has_checked_image;

export function useSheetLayouts() {
  const [layouts, setLayouts] = useState<Record<string, SheetLayout | null>>({});
  const asked = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback((s: Sheet | null) => {
    if (!s || !canHaveLayout(s) || asked.current.has(s.id)) return;
    asked.current.add(s.id);
    api.get<SheetLayout>(`/api/sheets/${s.id}/layout`)
      .then(
        l => (l && l.boxes ? l : null),
        (e: unknown) => {
          // 404 means this sheet has no positions; anything else is asked again next time.
          if (!(e instanceof ApiError && e.status === 404)) asked.current.delete(s.id);
          return null;
        },
      )
      .then(l => {
        if (mounted.current) setLayouts(prev => ({ ...prev, [s.id]: l }));
      });
  }, []);

  const layoutOf = useCallback((s: Sheet): LayoutResult => (canHaveLayout(s) ? layouts[s.id] : null), [layouts]);

  return { load, layoutOf };
}

/** What useSheetLayouts gives: load(sheet) asks the server once, layoutOf(sheet) says what is known. */
export type SheetLayouts = ReturnType<typeof useSheetLayouts>;
