const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

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

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new DOMException('Sync cancelled', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Retry a fetch once on transient errors while retaining cancellation. */
async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
  const signal = init?.signal ?? undefined;
  try {
    const res = await fetch(input, init);
    if (res.status >= 500 || res.status === 408 || res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      await abortableDelay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000, signal);
      return fetch(input, init);
    }
    return res;
  } catch (error) {
    if (signal?.aborted) throw error;
    await abortableDelay(1000, signal);
    return fetch(input, init);
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Drive API error (${response.status})`);
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
): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: query,
    spaces,
    fields: 'files(id,name,mimeType,modifiedTime)',
    pageSize: '1000',
  });
  const res = await fetchWithRetry(`${DRIVE_API}/files?${params}`, {
    headers: authHeaders(accessToken),
  });
  const data = await handleResponse<{ files: DriveFile[] }>(res);
  return data.files ?? [];
}

export async function getFile(accessToken: string, fileId: string): Promise<DriveFile> {
  const params = new URLSearchParams({ fields: 'id,name,mimeType,modifiedTime' });
  const res = await fetchWithRetry(`${DRIVE_API}/files/${fileId}?${params}`, {
    headers: authHeaders(accessToken),
  });
  return handleResponse<DriveFile>(res);
}

export async function getFileContent(
  accessToken: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetchWithRetry(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: authHeaders(accessToken),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Drive API error (${res.status})`);
  }
  return res.text();
}

export async function createFile(
  accessToken: string,
  metadata: FileMetadata,
  content: string,
  spaces = 'drive',
  signal?: AbortSignal,
): Promise<DriveFile> {
  const boundary = generateBoundary();
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({
      ...metadata,
      parents: metadata.parents ?? (spaces === 'appDataFolder' ? ['appDataFolder'] : undefined),
    }),
    `--${boundary}`,
    `Content-Type: ${metadata.mimeType ?? 'application/json'}`,
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');

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
): Promise<DriveFile> {
  const boundary = generateBoundary();
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${metadata.mimeType ?? 'application/json'}`,
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetchWithRetry(`${UPLOAD_API}/files/${fileId}?uploadType=multipart`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': `multipart/related; boundary=${boundary}`,
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
    throw new Error(`Drive API error (${res.status})`);
  }
}
