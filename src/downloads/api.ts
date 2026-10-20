/**
 * The only file on the downloads page that talks to the network.
 *
 * Everything is authorised by the session cookie, and every answer about who may
 * do what comes from the bot. The page draws what it is told and hides what it is
 * told it cannot do; the refusal lives on the server (PORTAL-SPEC).
 */
import { API_BASE } from '../shared/session';

export type AccessStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface Access {
  userId: string;
  username: string;
  avatarUrl: string | null;
  status: AccessStatus;
  requestedAt: number | null;
  decidedAt: number | null;
  since: number;
}

export interface PortalMe {
  user: { id: string; username: string; avatarUrl: string | null };
  access: Access;
  isOwner: boolean;
  canDownload: boolean;
  /** Owner only. */
  maxUploadMb?: number;
}

export interface ReleaseFile {
  name: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: number;
}

export interface Release {
  id: number;
  version: string;
  gameCompat: string;
  coverage: string;
  changelog: string;
  published: boolean;
  latest: boolean;
  file: ReleaseFile | null;
  originalName?: string | null;
}

export interface Package {
  id: number;
  title: string;
  description: string;
  installInstructions: string;
  updatedAt: number;
  releases: Release[];
}

export interface PortalUser extends Access {
  note: string;
  decidedBy: string | null;
}

export interface PortalEvent {
  id: number;
  at: number;
  actorId: string;
  action: string;
  subjectUserId: string | null;
  releaseId: number | null;
  detail: Record<string, unknown>;
}

export class PortalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly access?: Access,
  ) {
    super(message);
  }
}

const PORTAL = API_BASE + '/api/v4/portal';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(PORTAL + path, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new PortalApiError('Could not reach the download service. Try again in a minute.', 0);
  }
  if (res.ok) return (await res.json()) as T;

  let message = res.status === 401 ? 'Sign in with Discord to use the downloads.' : `The server answered ${res.status}.`;
  let access: Access | undefined;
  try {
    const body = (await res.json()) as { error?: string; access?: Access };
    if (typeof body.error === 'string') message = body.error;
    access = body.access;
  } catch {
    /* no body worth reading */
  }
  throw new PortalApiError(message, res.status, access);
}

export const fetchPortalMe = () => request<PortalMe>('/me');
export const requestAccess = () => request<{ ok: true; access: Access }>('/request', { method: 'POST' });
export const fetchPackages = () => request<{ packages: Package[] }>('/packages');

/** Where the archive is. A link, because the browser follows it with the cookie attached. */
export function downloadHref(releaseId: number): string {
  return `${PORTAL}/releases/${releaseId}/download`;
}

/* ------------------------------------------------------------------ owner */

export const fetchUsers = () => request<{ users: PortalUser[] }>('/admin/users');

export const decideUser = (userId: string, status: 'approved' | 'rejected' | 'revoked', note?: string) =>
  request<{ user: PortalUser }>(`/admin/users/${encodeURIComponent(userId)}/decision`, {
    method: 'POST',
    body: JSON.stringify(note === undefined ? { status } : { status, note }),
  });

export const fetchAdminPackages = () => request<{ packages: Package[] }>('/admin/packages');

export interface PackageInput {
  title: string;
  description: string;
  installInstructions: string;
}

export const createPackage = (input: PackageInput) =>
  request<{ package: { id: number } }>('/admin/packages', { method: 'POST', body: JSON.stringify(input) });

export const updatePackage = (id: number, input: Partial<PackageInput>) =>
  request<{ package: { id: number } }>(`/admin/packages/${id}`, { method: 'PATCH', body: JSON.stringify(input) });

export interface ReleaseInput {
  version: string;
  gameCompat: string;
  coverage: string;
  changelog: string;
}

export const createRelease = (packageId: number, input: ReleaseInput) =>
  request<{ release: { id: number } }>(`/admin/packages/${packageId}/releases`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateRelease = (id: number, input: Partial<ReleaseInput> & { published?: boolean }) =>
  request<{ release: { id: number } }>(`/admin/releases/${id}`, { method: 'PATCH', body: JSON.stringify(input) });

export const fetchEvents = (limit = 200) => request<{ events: PortalEvent[] }>(`/admin/events?limit=${limit}`);

/**
 * Send an archive, reporting progress as it goes.
 *
 * XMLHttpRequest rather than fetch, because fetch cannot say how much of a
 * 90 MB upload has gone. The name travels in a header, the bytes are the body,
 * and the server decides from both whether this is an archive it will keep.
 */
export function uploadReleaseFile(
  releaseId: number,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${PORTAL}/admin/releases/${releaseId}/file`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Upload-Filename', encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new PortalApiError('The upload did not reach the server. Try again.', 0));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `The server answered ${xhr.status}.`;
      try {
        const body = JSON.parse(xhr.responseText) as { error?: string };
        if (typeof body.error === 'string') message = body.error;
      } catch {
        /* keep the status line */
      }
      reject(new PortalApiError(message, xhr.status));
    };
    xhr.send(file);
  });
}
