// Picking an answer below the picture brings its coral box into view, also when the box can only be
// drawn a moment later (the marked picture is still loading, or it has to load again after Original).
import { fireEvent, render, screen } from '@testing-library/react';
import { Sheet, SheetLayout } from '../../lib/api';
import SheetPicture, { PictureKind } from './SheetPicture';

const sheet: Sheet = {
  id: 's1', batch_id: 'b1', source_name: 'class7.pdf', page_no: 1, status: 'ok', error_reason: '',
  fields: { Name: 'RAHUL DESAI' }, answers: { q40: 'B' }, score: 30, needs_review: false, review_reason: '',
  has_checked_image: true, created_at: '',
};
const layout: SheetLayout = { boxes: { q40: [0.5, 0.8, 0.55, 0.82] } };

const rect = (top: number, bottom: number) =>
  ({ top, bottom, left: 0, right: 300, width: 300, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

let scrolled: jest.Mock;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  scrolled = jest.fn();
  Element.prototype.scrollIntoView = scrolled; // not in jsdom
  // jsdom has no layout. The boxes drawn over the picture (hidden from screen readers) sit above the
  // top of the window, out of sight; everything else is on screen.
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rectOf(this: Element) {
    return this.getAttribute('aria-hidden') === 'true' ? rect(-400, -360) : rect(0, 500);
  });
});

afterEach(() => jest.restoreAllMocks());

function Picture({ view, selected }: { view: PictureKind; selected: string | null }) {
  return (
    <SheetPicture sheet={sheet} view={view} onViewChange={() => undefined} layout={layout} problemLabels={[]}
      selected={selected} showTapHint alt="Rahul Desai's sheet" panel={false} />
  );
}

/** The browser has the picture now. */
const loadPicture = () => fireEvent.load(screen.getByAltText("Rahul Desai's sheet"));

test('an answer picked while the marked picture is loading is brought into view once its box is drawn', () => {
  const { rerender } = render(<Picture view="checked" selected={null} />);
  rerender(<Picture view="checked" selected="q40" />);
  expect(scrolled).not.toHaveBeenCalled(); // no box to show yet
  loadPicture();
  expect(scrolled).toHaveBeenCalledTimes(1);
});

test('an answer picked on the original scan is brought into view once the marked picture shows it', () => {
  const { rerender } = render(<Picture view="checked" selected={null} />);
  loadPicture();
  rerender(<Picture view="input" selected={null} />);
  loadPicture();
  // Picking question 40 switches back to the marked picture, which takes a moment to show again.
  rerender(<Picture view="checked" selected="q40" />);
  expect(scrolled).not.toHaveBeenCalled();
  loadPicture();
  expect(scrolled).toHaveBeenCalledTimes(1);
});

test('zooming, or the box coming back after Original, does not scroll to it again', () => {
  const { rerender } = render(<Picture view="checked" selected={null} />);
  loadPicture();
  rerender(<Picture view="checked" selected="q40" />);
  expect(scrolled).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  fireEvent.click(screen.getByRole('button', { name: 'Fit to width' }));
  rerender(<Picture view="input" selected="q40" />);
  loadPicture();
  rerender(<Picture view="checked" selected="q40" />);
  loadPicture();
  expect(scrolled).toHaveBeenCalledTimes(1);

  // Picking it again (after picking nothing) does.
  rerender(<Picture view="checked" selected={null} />);
  rerender(<Picture view="checked" selected="q40" />);
  expect(scrolled).toHaveBeenCalledTimes(2);
});
