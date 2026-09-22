import { apiIdentity } from './api-contract';
import { BUILD_ID } from './build';
import { copyText } from './toast';

declare const __SIM_REVISION__: string | undefined;

export const FEEDBACK_URL = 'https://github.com/Goldpip3/wow-forever-tools/issues/new';

/** Long reports use the clipboard instead of risking a truncated URL. */
export function feedbackUrl(report: string): string {
  const url = new URL(FEEDBACK_URL);
  url.searchParams.set('title', 'Bug report');
  url.searchParams.set('body', report);
  if (url.href.length > 7000) url.searchParams.delete('body');
  return url.href;
}

/**
 * Only the page path is included: fragments and queries can carry private roster
 * access.
 *
 * The site build and, once a page has asked, the bot's are in here too. The two
 * deploy separately, and a report from a stale build reads as a bug in code that
 * has already been fixed.
 */
export function feedbackTemplate(path: string, version: string, build = BUILD_ID): string {
  const api = apiIdentity();
  const bot = api ? api.build + ' (API ' + api.api + ')' : 'not asked';
  return `Page: ${path.split(/[?#]/)[0]}\nSite build: ${build}\nBot build: ${bot}\nSimulator version: ${version}\nDevice and browser:\n\nSteps to reproduce:\n1. \n\nExpected:\n\nWhat happened:\n`;
}

export function renderFeedback(): HTMLElement {
  const details = document.createElement('details');
  details.className = 'site-feedback';
  const summary = document.createElement('summary');
  summary.textContent = 'Report a bug';
  const hint = document.createElement('p');
  const configured = import.meta.env.VITE_FEEDBACK_URL as string | undefined;
  const custom = configured && /^(https:\/\/|mailto:)/i.test(configured) ? configured : null;
  hint.textContent = custom
    ? 'Describe what you did and what went wrong. Copy your report, then open the feedback channel. Remove private names and roster access links before sending.'
    : 'Describe what you did and what went wrong. The next step opens GitHub with your report filled in. You need a GitHub account to post it, and posted reports are public. Remove private names and roster access links first.';
  const draft = document.createElement('textarea');
  draft.setAttribute('aria-label', 'Bug report');
  draft.rows = 10;
  draft.value = feedbackTemplate(location.pathname, typeof __SIM_REVISION__ === 'string' ? __SIM_REVISION__ : 'unknown');
  const copy = document.createElement('button');
  copy.className = 'btn';
  copy.textContent = 'Copy bug report';
  copy.addEventListener('click', () => void copyText(draft.value, 'Report copied'));
  details.append(summary, hint, draft, copy);
  const link = document.createElement('a');
  const updateLink = (): void => { link.href = custom ?? feedbackUrl(draft.value); };
  updateLink();
  draft.addEventListener('input', updateLink);
  link.addEventListener('click', () => {
    updateLink();
    if (!custom && !new URL(link.href).searchParams.has('body')) {
      void copyText(draft.value, 'Long report copied. Paste it into the GitHub issue.');
    }
  });
  link.className = 'btn';
  link.textContent = custom ? 'Open feedback channel' : 'Continue to GitHub';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  details.appendChild(link);
  return details;
}

