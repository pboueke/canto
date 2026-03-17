import type { JournalContent, Page } from '@/models';
import type { RemoteStore, RemoteJournalMeta } from '../types';
import * as api from './api';

const REGISTRY_FILE = 'canto-journals.json';
const ROOT_FOLDER = 'Canto';

interface RegistryEntry {
  id: string;
  title: string;
  encrypted: boolean;
  salt?: string;
}

export class GDriveRemoteStore implements RemoteStore {
  private accessToken: string | null = null;

  /** In-memory cache: file name path → Drive file ID */
  private fileIdCache = new Map<string, string>();

  async connect(credentials: { accessToken: string }): Promise<void> {
    this.accessToken = credentials.accessToken;
    this.fileIdCache.clear();
  }

  async disconnect(): Promise<void> {
    this.accessToken = null;
    this.fileIdCache.clear();
  }

  isConnected(): boolean {
    return this.accessToken !== null;
  }

  private token(): string {
    if (!this.accessToken) throw new Error('Not connected to Google Drive');
    return this.accessToken;
  }

  // ---------- registry (appDataFolder) ----------

  private async getRegistryFileId(): Promise<string | null> {
    const cached = this.fileIdCache.get(REGISTRY_FILE);
    if (cached) return cached;

    const files = await api.listFiles(this.token(), `name = '${REGISTRY_FILE}'`, 'appDataFolder');
    if (files.length > 0) {
      this.fileIdCache.set(REGISTRY_FILE, files[0].id);
      return files[0].id;
    }
    return null;
  }

  private async readRegistry(): Promise<RegistryEntry[]> {
    const fileId = await this.getRegistryFileId();
    if (!fileId) return [];
    const content = await api.getFileContent(this.token(), fileId);
    return JSON.parse(content) as RegistryEntry[];
  }

  private async writeRegistry(entries: RegistryEntry[]): Promise<void> {
    const content = JSON.stringify(entries);
    const fileId = await this.getRegistryFileId();
    if (fileId) {
      await api.updateFile(this.token(), fileId, { name: REGISTRY_FILE }, content);
    } else {
      const created = await api.createFile(
        this.token(),
        { name: REGISTRY_FILE, mimeType: 'application/json' },
        content,
        'appDataFolder',
      );
      this.fileIdCache.set(REGISTRY_FILE, created.id);
    }
  }

  // ---------- folder resolution ----------

  private async getOrCreateFolder(name: string, parentId?: string): Promise<string> {
    const cacheKey = parentId ? `folder:${parentId}/${name}` : `folder:${name}`;
    const cached = this.fileIdCache.get(cacheKey);
    if (cached) return cached;

    const parentQuery = parentId ? ` and '${parentId}' in parents` : '';
    const files = await api.listFiles(
      this.token(),
      `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentQuery}`,
    );
    if (files.length > 0) {
      this.fileIdCache.set(cacheKey, files[0].id);
      return files[0].id;
    }

    const created = await api.createFile(
      this.token(),
      {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      },
      '',
    );
    this.fileIdCache.set(cacheKey, created.id);
    return created.id;
  }

  private async getRootFolderId(): Promise<string> {
    return this.getOrCreateFolder(ROOT_FOLDER);
  }

  private async getJournalFolderId(journalId: string): Promise<string> {
    const rootId = await this.getRootFolderId();
    return this.getOrCreateFolder(journalId, rootId);
  }

  private async getPagesFolderId(journalId: string): Promise<string> {
    const journalFolderId = await this.getJournalFolderId(journalId);
    return this.getOrCreateFolder('pages', journalFolderId);
  }

  private async getAttachmentsFolderId(journalId: string): Promise<string> {
    const journalFolderId = await this.getJournalFolderId(journalId);
    return this.getOrCreateFolder('attachments', journalFolderId);
  }

  // ---------- file helpers ----------

  private async findFile(name: string, parentId: string): Promise<string | null> {
    const cacheKey = `file:${parentId}/${name}`;
    const cached = this.fileIdCache.get(cacheKey);
    if (cached) return cached;

    const files = await api.listFiles(
      this.token(),
      `name = '${name}' and '${parentId}' in parents and trashed = false`,
    );
    if (files.length > 0) {
      this.fileIdCache.set(cacheKey, files[0].id);
      return files[0].id;
    }
    return null;
  }

  private async upsertFile(
    name: string,
    parentId: string,
    content: string,
    mimeType = 'application/json',
  ): Promise<void> {
    const existingId = await this.findFile(name, parentId);
    if (existingId) {
      await api.updateFile(this.token(), existingId, { name, mimeType }, content);
    } else {
      const created = await api.createFile(
        this.token(),
        { name, mimeType, parents: [parentId] },
        content,
      );
      this.fileIdCache.set(`file:${parentId}/${name}`, created.id);
    }
  }

  // ---------- RemoteStore implementation ----------

  async listRemoteJournals(): Promise<RemoteJournalMeta[]> {
    const registry = await this.readRegistry();
    return registry.map((entry) => ({
      id: entry.id,
      title: entry.title,
      lastModified: 0,
      salt: entry.salt,
    }));
  }

  async uploadJournalMeta(journal: JournalContent): Promise<void> {
    const journalFolderId = await this.getJournalFolderId(journal.id);

    // Write meta.json (journal content minus pages)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pages: _pages, ...metaWithoutPages } = journal;
    await this.upsertFile('meta.json', journalFolderId, JSON.stringify(metaWithoutPages));

    // Update registry
    const registry = await this.readRegistry();
    const existing = registry.findIndex((e) => e.id === journal.id);
    const entry: RegistryEntry = {
      id: journal.id,
      title: journal.title,
      encrypted: journal.secure,
      salt: journal.salt,
    };
    if (existing >= 0) {
      registry[existing] = entry;
    } else {
      registry.push(entry);
    }
    await this.writeRegistry(registry);
  }

  async downloadJournalMeta(journalId: string): Promise<JournalContent | null> {
    const journalFolderId = await this.getJournalFolderId(journalId);
    const metaFileId = await this.findFile('meta.json', journalFolderId);
    if (!metaFileId) return null;

    const content = await api.getFileContent(this.token(), metaFileId);
    const meta = JSON.parse(content) as Omit<JournalContent, 'pages'>;

    // List pages from pages folder
    const pagesFolderId = await this.getPagesFolderId(journalId);
    const pageFiles = await api.listFiles(
      this.token(),
      `'${pagesFolderId}' in parents and trashed = false`,
    );

    const pages: Page[] = [];
    for (const pf of pageFiles) {
      const pageContent = await api.getFileContent(this.token(), pf.id);
      pages.push(JSON.parse(pageContent) as Page);
    }

    return { ...meta, pages } as JournalContent;
  }

  async uploadPage(journalId: string, page: Page): Promise<void> {
    const pagesFolderId = await this.getPagesFolderId(journalId);
    await this.upsertFile(`${page.id}.json`, pagesFolderId, JSON.stringify(page));
  }

  async downloadPage(journalId: string, pageId: string): Promise<Page | null> {
    const pagesFolderId = await this.getPagesFolderId(journalId);
    const fileId = await this.findFile(`${pageId}.json`, pagesFolderId);
    if (!fileId) return null;
    const content = await api.getFileContent(this.token(), fileId);
    return JSON.parse(content) as Page;
  }

  async deletePage(journalId: string, pageId: string): Promise<void> {
    const pagesFolderId = await this.getPagesFolderId(journalId);
    const fileId = await this.findFile(`${pageId}.json`, pagesFolderId);
    if (fileId) {
      await api.deleteFile(this.token(), fileId);
      this.fileIdCache.delete(`file:${pagesFolderId}/${pageId}.json`);
    }
  }

  async uploadAttachment(journalId: string, localPath: string, data: string): Promise<string> {
    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);
    const name = localPath.split('/').pop() ?? localPath;
    await this.upsertFile(name, attachmentsFolderId, data, 'application/octet-stream');
    return `gdrive://${journalId}/attachments/${name}`;
  }

  async downloadAttachment(remotePath: string): Promise<string | null> {
    // remotePath format: gdrive://<journalId>/attachments/<name>
    const match = remotePath.match(/^gdrive:\/\/([^/]+)\/attachments\/(.+)$/);
    if (!match) return null;
    const [, journalId, name] = match;
    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);
    const fileId = await this.findFile(name, attachmentsFolderId);
    if (!fileId) return null;
    return api.getFileContent(this.token(), fileId);
  }

  async deleteAttachment(remotePath: string): Promise<void> {
    const match = remotePath.match(/^gdrive:\/\/([^/]+)\/attachments\/(.+)$/);
    if (!match) return;
    const [, journalId, name] = match;
    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);
    const fileId = await this.findFile(name, attachmentsFolderId);
    if (fileId) {
      await api.deleteFile(this.token(), fileId);
      this.fileIdCache.delete(`file:${attachmentsFolderId}/${name}`);
    }
  }
}
