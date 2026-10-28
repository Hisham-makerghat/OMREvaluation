import { ApiError, Test } from '../../lib/api';
import {
  checkDraft, choicesLabel, clearedText, draftFrom, fillAnswers, firstAnswers, missingQuestions, missingText, parseCount,
  payloadOf, problemFromError, readQuickFill, sameDraft, stillOpen,
} from './answerKey';

const stored = (over: Partial<Test> = {}): Test => ({
  id: 't1', name: 'Endline Oct 2026 · Class 7', question_count: 5, options: 'ABCD', marks_correct: 1,
  marks_incorrect: -0.25, marks_unmarked: 0, answer_key: { q1: 'A', q2: 'b', q3: 'E', q4: 'D', q6: 'A' },
  created_by: 'asha@makerghat.org', created_at: '2026-10-28T10:00:00Z', archived: false, ...over,
});

describe('starting a draft', () => {
  test('a new key is empty with the usual marks', () => {
    expect(draftFrom(null, 50)).toEqual({
      name: '', count: 50, options: 'ABCDE', marksRight: '1', marksWrong: '0', marksBlank: '0', answers: {},
    });
  });

  test('a stored key keeps only answers that fit its questions and choices', () => {
    const d = draftFrom(stored(), 50);
    expect(d.answers).toEqual({ q1: 'A', q2: 'B', q4: 'D' });
    expect(d.marksWrong).toBe('-0.25');
    expect(draftFrom(stored({ question_count: 80 }), 50).count).toBe(50);
  });

  test('changes are noticed, and undoing them is not a change', () => {
    const start = draftFrom(stored(), 50);
    expect(sameDraft(start, { ...start, name: 'Other' })).toBe(false);
    expect(sameDraft(start, { ...start, answers: { ...start.answers, q3: 'C' } })).toBe(false);
    expect(sameDraft(start, { ...start, answers: { ...start.answers } })).toBe(true);
  });
});

describe('questions box', () => {
  test('only whole numbers from 1 count, and the sheet sets the top', () => {
    expect(parseCount('40', 50)).toBe(40);
    expect(parseCount('60', 50)).toBe(50);
    expect(parseCount('', 50)).toBeNull();
    expect(parseCount('0', 50)).toBeNull();
    expect(parseCount('2.5', 50)).toBeNull();
  });

  test('answers past the last question are dropped and never sent', () => {
    expect(firstAnswers({ q1: 'A', q4: 'B', q12: 'C' }, 4)).toEqual({ q1: 'A', q4: 'B' });
    const d = { ...draftFrom(null, 50), name: ' Baseline ', count: 2, answers: { q1: 'A', q2: 'B', q3: 'C' } };
    expect(payloadOf(d)).toEqual({
      name: 'Baseline', question_count: 2, options: 'ABCDE', marks_correct: 1, marks_incorrect: 0, marks_unmarked: 0,
      answer_key: { q1: 'A', q2: 'B' },
    });
  });
});

describe('checks before saving', () => {
  test('lists what is missing, top to bottom', () => {
    const d = { ...draftFrom(null, 3), marksWrong: '', answers: { q2: 'A' } };
    expect(checkDraft(d)).toEqual([
      { kind: 'name', text: 'Give the test a name.' },
      { kind: 'marksWrong', text: 'Write a number in “Marks if wrong”, for example 0 or -0.25.' },
      { kind: 'answers', text: '2 questions have no answer yet: 1, 3.' },
    ]);
    expect(missingQuestions(d)).toEqual([1, 3]);
  });

  test('long lists are cut short', () => {
    const missing = [3, 7, 12, 14, 15, 16, 20, 22, 30, 31, 40, 44];
    expect(missingText(missing, 50)).toBe('12 questions have no answer yet: 3, 7, 12, 14, 15, 16, 20, 22, 30, 31 …');
    expect(missingText([7], 50)).toBe('1 question has no answer yet: 7.');
  });

  test('empty answers only at the end suggest a shorter test', () => {
    expect(missingText([41, 42, 43, 44, 45, 46, 47, 48, 49, 50], 50))
      .toBe('10 questions have no answer yet: 41, 42, 43, 44, 45, 46, 47, 48, 49, 50. '
        + 'If the test has only 40 questions, change “Questions” to 40.');
  });

  test('a message goes away once it is fixed', () => {
    const d = draftFrom(null, 2);
    const [name, answers] = checkDraft(d);
    expect(stillOpen(name, d)).toBe(true);
    expect(stillOpen(name, { ...d, name: 'Baseline' })).toBe(false);
    expect(stillOpen(answers, { ...d, answers: { q1: 'A', q2: 'B' } })).toBe(false);
    expect(stillOpen({ kind: 'server', text: 'x' }, d)).toBe(true);
  });
});

describe('typing all the answers at once', () => {
  test('takes letters in order and skips spaces, commas, numbers and list punctuation', () => {
    expect(readQuickFill('ab cd, 5.E 6) a', 'ABCDE', 50, 50)).toEqual({ letters: ['A', 'B', 'C', 'D', 'E', 'A'] });
  });

  test('refuses letters that are not answer choices, and other marks', () => {
    expect(readQuickFill('ABEF', 'ABCD', 50, 50))
      .toEqual({ problem: '“E” and “F” are not answer choices. Use only the letters A to D.' });
    expect(readQuickFill('AB-D', 'ABCDE', 50, 50))
      .toEqual({ problem: '“-” is not an answer choice. Use only the letters A to E.' });
    expect(readQuickFill(' , 1 ', 'ABCDE', 50, 50))
      .toEqual({ problem: 'Type the answers first, one letter for each question.' });
  });

  test('fills from question 1 and keeps the answers after the typed ones', () => {
    expect(fillAnswers({ q1: 'A', q2: 'B', q4: 'D' }, ['C', 'C'])).toEqual({ q1: 'C', q2: 'C', q4: 'D' });
  });

  test('refuses more answers than questions', () => {
    expect(readQuickFill('ABCDE', 'ABCDE', 4, 50)).toEqual({
      problem: 'You typed 5 answers, but this test has 4 questions. Change “Questions” to 5 first, or remove the extra letters.',
    });
    expect(readQuickFill('A'.repeat(51), 'ABCDE', 50, 50))
      .toEqual({ problem: 'You typed 51 answers, but the sheet has only 50 questions.' });
  });
});

describe('words', () => {
  test('answer choices', () => {
    expect(choicesLabel('ABCDE')).toBe('A to E');
    expect(choicesLabel('ABD')).toBe('A, B and D');
    expect(choicesLabel('AB')).toBe('A and B');
  });

  test('answers cleared by new choices', () => {
    expect(clearedText([14], 'ABCD')).toBe('Question 14 is now blank: its answer is not in A to D.');
    expect(clearedText([3, 9], 'ABCD')).toBe('2 questions are now blank because their answer is not in A to D: 3, 9.');
  });

  test('problems from the server, in plain words', () => {
    expect(problemFromError(new ApiError(400, 'answer for q3 must be one of ABCD'), 'save the answer key'))
      .toBe('Could not save the answer key. Answer for q3 must be one of ABCD.');
    expect(problemFromError(new ApiError(500, 'unexpected error: KeyError'), 'save the answer key'))
      .toBe('Could not save the answer key. Something went wrong on the server. Try again in a minute.');
    expect(problemFromError(new TypeError('Failed to fetch'), 'load the answer keys'))
      .toBe('Could not load the answer keys. Check your internet connection and try again.');
  });

  test('a server that is starting up, or a reply with only a code, gets a plain sentence', () => {
    const startingUp = 'Could not save the answer key. The server is starting up. Try again in a minute.';
    expect(problemFromError(new ApiError(503, 'the database is starting up or unavailable, please try again in a minute'),
      'save the answer key')).toBe(startingUp);
    expect(problemFromError(new ApiError(503, 'request failed (503)'), 'save the answer key')).toBe(startingUp);
    expect(problemFromError(new ApiError(429, 'request failed (429)'), 'save the answer key'))
      .toBe('Could not save the answer key. Try again in a minute.');
  });
});
