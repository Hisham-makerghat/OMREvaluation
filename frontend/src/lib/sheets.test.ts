import { Sheet } from './api';
import { answerKind, checkSummary, countKinds, errorText, lettersText, problemsOf, sheetKind, sheetTitle, sourceLabel, studentName } from './sheets';

const sheet = (over: Partial<Sheet> = {}): Sheet => ({
  id: 's1', batch_id: 'b1', source_name: 'class7.pdf', page_no: 2, status: 'ok', error_reason: '',
  fields: { Name: 'RAHUL  DESAI', 'Roll Number': '2302', 'Mobile Number': '9876500012', gender: 'Male' },
  answers: { q1: 'A', q15: 'CD', q20: '' }, score: 38, needs_review: false, review_reason: '',
  has_checked_image: true, created_at: '2026-10-28T10:00:00Z', ...over,
});

describe('sheet kinds and names', () => {
  test('kind follows status and review flag', () => {
    expect(sheetKind(sheet())).toBe('fine');
    expect(sheetKind(sheet({ needs_review: true }))).toBe('check');
    expect(sheetKind(sheet({ status: 'error' }))).toBe('error');
  });

  test('names are shown in normal capitals, else the file and page', () => {
    expect(studentName(sheet())).toBe('Rahul Desai');
    expect(sheetTitle(sheet({ fields: { Name: '' } }))).toBe('class7.pdf, page 2');
    expect(sourceLabel(sheet({ source_name: 'IMG_1.jpg', page_no: 1 }))).toBe('IMG_1.jpg');
  });

  test('counts', () => {
    expect(countKinds([sheet(), sheet({ needs_review: true }), sheet({ status: 'error' }), sheet()]))
      .toEqual({ fine: 2, check: 1, error: 1, total: 4 });
  });
});

describe('answers', () => {
  test('answer kinds', () => {
    expect(answerKind('A', 'A')).toBe('right');
    expect(answerKind('B', 'A')).toBe('wrong');
    expect(answerKind('', 'A')).toBe('blank');
    expect(answerKind('CD', 'D')).toBe('multi');
  });

  test('letters in words', () => {
    expect(lettersText('CD')).toBe('C and D');
    expect(lettersText('ACD')).toBe('A, C and D');
    expect(lettersText('B')).toBe('B');
  });
});

describe('problems a teacher should look at', () => {
  test('a double-filled question is named and boxed', () => {
    const p = problemsOf(sheet({ needs_review: true, review_reason: 'two bubbles filled for q15' }), 50);
    expect(p).toHaveLength(1);
    expect(p[0].text).toBe('Question 15: C and D are both filled, so it counts as wrong.');
    expect(p[0].boxes).toEqual(['q15']);
    expect(checkSummary(p)).toBe('Check q15');
  });

  test('a double outside a shorter test says so', () => {
    const p = problemsOf(sheet({ needs_review: true, review_reason: 'two bubbles filled for q15' }), 10);
    expect(p[0].text).toContain('not part of this test');
  });

  test('field problems in plain words', () => {
    const p = problemsOf(sheet({
      answers: { q1: 'A' }, needs_review: true,
      review_reason: 'two bubbles filled in a name or number field; roll number is blank',
    }), 25);
    expect(p.map(x => x.short)).toEqual(['name or number', 'roll no.']);
    expect(p[1].boxes).toEqual(['Roll Number']);
    expect(checkSummary(p)).toBe('Check name or number, roll no.');
  });

  test('many problems are summarised', () => {
    const p = problemsOf(sheet({
      answers: { q3: 'AB', q4: 'BC', q9: 'DE' }, needs_review: true,
      review_reason: 'two bubbles filled for q3, q4, q9; roll number is blank',
    }), 50);
    expect(checkSummary(p)).toBe('Check q3, q4 and 2 more');
  });

  test('a flagged sheet always says something', () => {
    expect(problemsOf(sheet({ answers: {}, needs_review: true, review_reason: '' }), 50)).toHaveLength(1);
    expect(problemsOf(sheet({ status: 'error' }), 50)).toEqual([]);
  });
});

test('why a sheet could not be read', () => {
  expect(errorText('corner targets not found: check that all four corners are in the scan')).toMatch(/four corner circles/);
  expect(errorText('could not read bubbles: boom')).toMatch(/could not be read/);
  expect(errorText('')).toBe('The sheet could not be read.');
});
