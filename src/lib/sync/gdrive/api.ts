const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

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

/** Retry a fetch once on transient (5xx / network) errors. */
async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(input, init);
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000));
      return fetch(input, init);
    }
    return res;
  } catch {
    // Network error — retry once
    await new Promise((r) => setTimeout(r, 1000));
    return fetch(input, init);
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Drive API error (${response.status})`);
  }
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

export async function getFileContent(accessToken: string, fileId: string): Promise<string> {
  const res = await fetchWithRetry(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: authHeaders(accessToken),
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
): Promise<DriveFile> {
  const boundary = '---canto-boundary---';
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
  });
  return handleResponse<DriveFile>(res);
}

export async function updateFile(
  accessToken: string,
  fileId: string,
  metadata: Partial<FileMetadata>,
  content: string,
): Promise<DriveFile> {
  const boundary = '---canto-boundary---';
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
