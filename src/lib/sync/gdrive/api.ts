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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Drive API ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
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
  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: authHeaders(accessToken),
  });
  const data = await handleResponse<{ files: DriveFile[] }>(res);
  return data.files ?? [];
}

export async function getFile(accessToken: string, fileId: string): Promise<DriveFile> {
  const params = new URLSearchParams({ fields: 'id,name,mimeType,modifiedTime' });
  const res = await fetch(`${DRIVE_API}/files/${fileId}?${params}`, {
    headers: authHeaders(accessToken),
  });
  return handleResponse<DriveFile>(res);
}

export async function getFileContent(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive API ${res.status}: ${text}`);
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

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
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

  const res = await fetch(`${UPLOAD_API}/files/${fileId}?uploadType=multipart`, {
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
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive API ${res.status}: ${text}`);
  }
}
