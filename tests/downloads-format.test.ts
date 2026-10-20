import { describe, expect, it } from 'vitest';
import type { Access, Package } from '../src/downloads/api';
import {
  accessMessage,
  describeEvent,
  fileProblem,
  formatBytes,
  leadRelease,
  otherReleases,
  shortHash,
} from '../src/downloads/format';

/**
 * The words on the downloads page, which are what a pending or refused person
 * actually reads. The permission checks themselves live on the bot and are
 * tested there; this is about saying the right thing once the bot has answered.
 */

const access = (over: Partial<Access>): Access => ({
  userId: '1',
  username: 'Alice',
  avatarUrl: null,
  status: 'pending',
  requestedAt: null,
  decidedAt: null,
  since: 1_790_000_000,
  ...over,
});

describe('what somebody who cannot download is told', () => {
  it('offers the button once, and only to somebody pending who has not asked', () => {
    expect(accessMessage(access({})).canRequest).toBe(true);
    expect(accessMessage(access({ requestedAt: 1_790_000_100 })).canRequest).toBe(false);
    expect(accessMessage(access({ status: 'rejected' })).canRequest).toBe(false);
    expect(accessMessage(access({ status: 'revoked' })).canRequest).toBe(false);
  });

  it('tells somebody who has asked that there is nothing more to do', () => {
    const text = accessMessage(access({ requestedAt: 1_790_000_100 }));
    expect(text.body).toContain('nothing more to do');
  });

  it('says that a revoked person’s copied links stop working too', () => {
    expect(accessMessage(access({ status: 'revoked' })).body).toContain('stop working');
  });

  it('never claims a rejection is pending', () => {
    expect(accessMessage(access({ status: 'rejected' })).title).toBe('Not approved');
  });
});

describe('sizes and hashes', () => {
  it('rounds to what a person says', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(860_000)).toBe('840 KB');
    expect(formatBytes(1_300_000)).toBe('1.2 MB');
    expect(formatBytes(52_428_800)).toBe('50 MB');
    expect(formatBytes(-1)).toBe('');
  });

  it('shows enough of a checksum to compare by eye', () => {
    expect(shortHash('abcdef0123456789abcdef')).toBe('abcdef012345');
  });
});

describe('which release a card leads with', () => {
  const pkg: Package = {
    id: 1,
    title: 'ForeverXP',
    description: '',
    installInstructions: '',
    updatedAt: 0,
    releases: [
      { id: 3, version: '2.0', gameCompat: '', coverage: '', changelog: '', published: true, latest: false, file: null },
      { id: 2, version: '1.2', gameCompat: '', coverage: '', changelog: '', published: true, latest: true, file: { name: 'a.zip', sizeBytes: 1, sha256: 'x', uploadedAt: 1 } },
      { id: 1, version: '1.0', gameCompat: '', coverage: '', changelog: '', published: true, latest: false, file: { name: 'b.zip', sizeBytes: 1, sha256: 'y', uploadedAt: 0 } },
    ],
  };

  it('leads with the one the bot marked latest', () => {
    expect(leadRelease(pkg)?.version).toBe('1.2');
    expect(otherReleases(pkg, leadRelease(pkg)).map((r) => r.version)).toEqual(['2.0', '1.0']);
  });

  it('falls back to the newest with a file when nothing is marked', () => {
    const none = { ...pkg, releases: pkg.releases.map((r) => ({ ...r, latest: false })) };
    expect(leadRelease(none)?.version).toBe('1.2');
  });
});

describe('refusing a file before it is sent', () => {
  it('matches what the server refuses', () => {
    expect(fileProblem({ name: 'a.exe', size: 10 }, 100)).toContain('.zip and .rar');
    expect(fileProblem({ name: 'a.zip', size: 0 }, 100)).toContain('empty');
    expect(fileProblem({ name: 'a.zip', size: 101 * 1_048_576 }, 100)).toContain('over the 100 MB limit');
    expect(fileProblem({ name: 'A.RAR', size: 10 }, 100)).toBeNull();
  });
});

describe('the log, in words', () => {
  const names = (id: string) => ({ '1': 'Owner', '2': 'Alice' })[id] ?? id;
  it('names who did what to whom', () => {
    expect(describeEvent({ action: 'approve', actorId: '1', subjectUserId: '2', releaseId: null, detail: {} }, names)).toBe('Owner approved Alice');
    expect(describeEvent({ action: 'download', actorId: '2', subjectUserId: null, releaseId: 4, detail: { version: '1.2', name: 'ForeverXP-1.2.zip' }, }, names)).toBe('Alice downloaded 1.2 (ForeverXP-1.2.zip)');
    expect(describeEvent({ action: 'revoke', actorId: '1', subjectUserId: '2', releaseId: null, detail: {} }, names)).toContain('removed Alice');
  });
});
