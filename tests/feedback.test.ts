import { expect, it } from 'vitest';
import { feedbackTemplate, feedbackUrl, FEEDBACK_URL } from '../src/shared/feedback';

it('does not put query strings or roster credentials into a bug report', () => {
  const report = feedbackTemplate('/raid.html?private=value#roster=event&t=secret', 'abc123');
  expect(report).toContain('Page: /raid.html\n');
  expect(report).toContain('Simulator version: abc123');
  expect(report).not.toMatch(/private|value|secret|event/);
});

it('opens the public issue form with the edited report intact', () => {
  const report = 'Steps:\n1. Select Fire & Frost\nWhat happened: + damage?';
  const url = new URL(feedbackUrl(report));
  expect(url.origin + url.pathname).toBe(FEEDBACK_URL);
  expect(url.searchParams.get('body')).toBe(report);
});

it('leaves long reports for the clipboard instead of truncating them', () => {
  expect(new URL(feedbackUrl('x'.repeat(8000))).searchParams.has('body')).toBe(false);
});
