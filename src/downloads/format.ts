/**
 * Words and numbers for the downloads page. No DOM, so it can be tested.
 */
import type { Access, AccessStatus, Package, Release } from './api';

/** A size a person reads: 840 KB, 1.2 MB. Bytes under a kilobyte stay bytes. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** 20 Oct 2026, in the reader's own timezone. */
export function formatDate(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return '';
  return new Date(unixSeconds * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Date and time, for the log. */
export function formatWhen(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Enough of a checksum to compare by eye; the whole thing is one click away. */
export function shortHash(sha256: string): string {
  return sha256.slice(0, 12);
}

export const STATUS_WORD: Record<AccessStatus, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Not approved',
  revoked: 'Access removed',
};

/**
 * What to tell somebody who cannot download yet, and whether there is a button.
 *
 * The second person, present tense, and the next step when there is one. A
 * person who has asked is told so and told to wait, not shown the button again.
 */
export function accessMessage(access: Access): { title: string; body: string; canRequest: boolean } {
  switch (access.status) {
    case 'pending':
      return access.requestedAt
        ? {
            title: 'Pending approval',
            body: `You asked for access on ${formatDate(access.requestedAt)}. The owner has not decided yet, and there is nothing more to do here. Check back later.`,
            canRequest: false,
          }
        : {
            title: 'Pending approval',
            body: 'You are signed in, and the owner has not approved you yet. Ask once and the owner decides. Until then nothing here can be downloaded.',
            canRequest: true,
          };
    case 'rejected':
      return {
        title: 'Not approved',
        body: `Your request was not approved${access.decidedAt ? ` on ${formatDate(access.decidedAt)}` : ''}. Nothing here can be downloaded. If you think that is a mistake, ask the owner in Discord.`,
        canRequest: false,
      };
    case 'revoked':
      return {
        title: 'Access removed',
        body: `Your access was removed${access.decidedAt ? ` on ${formatDate(access.decidedAt)}` : ''}. Links you copied before stop working too. If you think that is a mistake, ask the owner in Discord.`,
        canRequest: false,
      };
    case 'approved':
      return { title: 'Approved', body: 'You can download everything published here.', canRequest: false };
  }
}

/** The release a card leads with: the latest, or failing that the newest with a file. */
export function leadRelease(pkg: Package): Release | undefined {
  return pkg.releases.find((r) => r.latest) ?? pkg.releases.find((r) => r.file) ?? pkg.releases[0];
}

/** The rest, for the "older versions" fold. */
export function otherReleases(pkg: Package, lead: Release | undefined): Release[] {
  return pkg.releases.filter((r) => r.id !== lead?.id);
}

/** What one log line says, in words. */
export function describeEvent(e: {
  action: string;
  actorId: string;
  subjectUserId: string | null;
  releaseId: number | null;
  detail: Record<string, unknown>;
}, nameOf: (userId: string) => string): string {
  const actor = nameOf(e.actorId);
  const subject = e.subjectUserId ? nameOf(e.subjectUserId) : '';
  const version = typeof e.detail.version === 'string' ? ` ${e.detail.version}` : '';
  const name = typeof e.detail.name === 'string' ? ` (${e.detail.name})` : '';
  switch (e.action) {
    case 'signin':
      return `${actor} opened the downloads for the first time`;
    case 'request':
      return `${actor} asked for access`;
    case 'approve':
      return `${actor} approved ${subject}`;
    case 'reject':
      return `${actor} did not approve ${subject}`;
    case 'revoke':
      return `${actor} removed ${subject}’s access`;
    case 'upload':
      return `${actor} uploaded release${version}${name}`;
    case 'publish':
      return `${actor} published release${version}`;
    case 'unpublish':
      return `${actor} unpublished release${version}`;
    case 'download':
      return `${actor} downloaded${version}${name}`;
    default:
      return `${actor}: ${e.action}`;
  }
}

/** The file input accepts these and the server refuses everything else. */
export const ACCEPTED_EXTENSIONS = ['.zip', '.rar'] as const;

/** Why a chosen file will be refused before it is sent, or null when it looks fine. */
export function fileProblem(file: { name: string; size: number }, maxUploadMb: number): string | null {
  if (!/\.(zip|rar)$/i.test(file.name)) return 'Only .zip and .rar archives are accepted.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > maxUploadMb * 1_048_576) {
    return `That file is ${formatBytes(file.size)}, over the ${maxUploadMb} MB limit.`;
  }
  return null;
}
