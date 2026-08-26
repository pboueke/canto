import { recordDriveRequestTrace } from '../debug-trace';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export class GDriveApiError extends Error {
  constructor(
    readonly status: number,
    detail?: string,
  ) {
    super(`Drive API error (${status})${detail ? `: ${detail}` : ''}`);
    this.name = 'GDriveApiError';
  }
}

export class GDriveAuthenticationError extends Error {
  constructor(message = 'Drive authentication could not be refreshed') {
    super(message);
    this.name = 'GDriveAuthenticationError';
  }
}

type AccessTokenRefresher = () => Promise<string | null>;

/**
 * A store registers its credential source for the lifetime of a connected
 * token. The request layer owns the one allowed replay after a 401, so every
 * Drive operation gets the same behavior rather than each call site deciding
 * whether authentication errors are retryable.
 */
const tokenRefreshers = new Map<string, AccessTokenRefresher>();
const tokenRefreshesInFlight = new Map<string, Promise<string | null>>();

export function registerAccessTokenRefresher(
  accessToken: string,
  refresher: AccessTokenRefresher,
): void {
  tokenRefreshers.set(accessToken, refresher);
}

export function unregisterAccessTokenRefresher(accessToken: string): void {
  tokenRefreshers.delete(accessToken);
  tokenRefreshesInFlight.delete(accessToken);
}

function refreshAccessToken(
  accessToken: string,
  refresher: AccessTokenRefresher,
): Promise<string | null> {
  let inFlight = tokenRefreshesInFlight.get(accessToken);
  if (!inFlight) {
    inFlight = refresher().finally(() => tokenRefreshesInFlight.delete(accessToken));
    tokenRefreshesInFlight.set(accessToken, inFlight);
  }
  return inFlight;
}

function generateBoundary(): string {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `---canto-${random}---`;
}

interface FileMetadata {
  name: string;
  mimeType?: string;
  parents?: string[];
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Build multipart bytes without first joining an attachment payload into another
 * full-size JavaScript string. Chrome can stream Blob parts to fetch directly.
 * Native keeps its established string body because its fetch implementation is
 * not the browser path under investigation.
 */
function multipartBody(
  boundary: string,
  metadata: Partial<FileMetadata>,
  content: string,
): string | Blob {
  const parts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType ?? 'application/json'}\r\n\r\n`,
    content,
    `\r\n--${boundary}--`,
  ];

  if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
    return new Blob(parts, { type: `multipart/related; boundary=${boundary}` });
  }
  return parts.join('');
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        globalThis.clearTimeout(timeout);
        reject(new DOMException('Sync cancelled', 'AbortError'));
      },
      { once: true },
    );
  });
}

function assertGoogleDriveUrl(input: string): void {
  try {
    if (new URL(input).origin !== 'https://www.googleapis.com') {
      throw new Error('Refusing a non-Google Drive request');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Refusing a non-Google Drive request') {
      throw error;
    }
    throw new Error('Refusing an invalid Google Drive request');
  }
}

/** Retry a fetch once on transient errors while retaining cancellation. */
async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
  assertGoogleDriveUrl(input);
  const signal = init?.signal ?? undefined;
  const attempt = async (requestInit = init): Promise<Response> => {
    const startedAt = performance.now();
    try {
      const response = await fetch(input, requestInit);
      recordDriveRequestTrace(input, requestInit, startedAt, response);
      return response;
    } catch (error) {
      recordDriveRequestTrace(input, requestInit, startedAt);
      throw error;
    }
  };

  const retryUnauthorizedOnce = async (response: Response): Promise<Response> => {
    if (response.status !== 401) return response;

    const headers = new Headers(init?.headers);
    const auth = headers.get('Authorization');
    const token = auth?.match(/^Bearer (.+)$/)?.[1];
    const refresh = token ? tokenRefreshers.get(token) : undefined;
    if (!token || !refresh) return response;

    const nextToken = await refreshAccessToken(token, refresh);
    if (!nextToken || nextToken === token) {
      throw new GDriveAuthenticationError();
    }
    headers.set('Authorization', `Bearer ${nextToken}`);
    return attempt({ ...init, headers });
  };

  let response: Response;
  try {
    response = await attempt();
  } catch (error) {
    if (signal?.aborted) throw error;
    await abortableDelay(1000, signal);
    return attempt();
  }

  const authenticated = response.status === 401 ? await retryUnauthorizedOnce(response) : response;
  if (authenticated.status >= 500 || authenticated.status === 408 || authenticated.status === 429) {
    const retryAfter = Number(authenticated.headers?.get?.('Retry-After'));
    await abortableDelay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000, signal);
    return attempt();
  }
  return authenticated;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new GDriveApiError(response.status);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Drive API: invalid JSON response (${response.status})`);
  }
}

export async function listFiles(
  accessToken: string,
  query: string,
  spaces = 'drive',
  signal?: AbortSignal,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: query,
      spaces,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetchWithRetry(`${DRIVE_API}/files?${params}`, {
      headers: authHeaders(accessToken),
      signal,
    });
    const data = await handleResponse<{ files?: DriveFile[]; nextPageToken?: string }>(res);
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

export async function getFile(accessToken: string, fileId: string): Promise<DriveFile> {
  const params = new URLSearchParams({ fields: 'id,name,mimeType,modifiedTime' });
  const res = await fetchWithRetry(`${DRIVE_API}/files/${fileId}?${params}`, {
    headers: authHeaders(accessToken),
  });
  return handleResponse<DriveFile>(res);
}

export interface FileContentWithEtag {
  content: string;
  /** Required for a conditional update; absent only on a malformed proxy response. */
  etag: string | null;
}

export async function getFileContentWithEtag(
  accessToken: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<FileContentWithEtag> {
  const res = await fetchWithRetry(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: authHeaders(accessToken),
    signal,
  });
  if (!res.ok) {
    throw new GDriveApiError(res.status);
  }
  return {
    content: await res.text(),
    etag: res.headers?.get('etag') ?? null,
  };
}

export async function getFileContent(
  accessToken: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<string> {
  return (await getFileContentWithEtag(accessToken, fileId, signal)).content;
}

export async function createFile(
  accessToken: string,
  metadata: FileMetadata,
  content: string,
  spaces = 'drive',
  signal?: AbortSignal,
): Promise<DriveFile> {
  const boundary = generateBoundary();
  const body = multipartBody(
    boundary,
    {
      ...metadata,
      parents: metadata.parents ?? (spaces === 'appDataFolder' ? ['appDataFolder'] : undefined),
    },
    content,
  );

  const res = await fetchWithRetry(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
    signal,
  });
  return handleResponse<DriveFile>(res);
}

export async function updateFile(
  accessToken: string,
  fileId: string,
  metadata: Partial<FileMetadata>,
  content: string,
  signal?: AbortSignal,
  ifMatch?: string,
): Promise<DriveFile> {
  const boundary = generateBoundary();
  const body = multipartBody(boundary, metadata, content);

  const res = await fetchWithRetry(`${UPLOAD_API}/files/${fileId}?uploadType=multipart`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': `multipart/related; boundary=${boundary}`,
      ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    },
    body,
    signal,
  });
  return handleResponse<DriveFile>(res);
}

export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetchWithRetry(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!res.ok && res.status !== 404) {
    // Drive's raw error body can include implementation details or user data.
    // Keep the UI diagnostic stable and safe while still distinguishing an
    // opaque provider failure from a successful/absent delete.
    throw new GDriveApiError(res.status, 'Google Drive returned no usable error details');
  }
}
