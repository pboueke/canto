import type { Attachment } from 'canto-data';
import type {
  PreparedChunkUploads,
  RemoteStore,
  RemoteJournalMeta,
  RegistryInfo,
  SyncIndex,
  SyncIndexPublication,
} from '../types';
import { safeJsonParse } from '@/lib/utils/json';
import { generateUUID } from '@/lib/encryption/utils';
import * as api from './api';

/** Escape a string for use in a Google Drive API query (ODATA-style). */
function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const REGISTRY_FILE = 'canto-journals.json';
const ROOT_FOLDER = 'Canto';

/** Drive permits duplicate names; its list order is not a revision order. */
function newestDriveFile<T extends { modifiedTime: string }>(files: readonly T[]): T {
  return files.reduce((newest, candidate) =>
    candidate.modifiedTime > newest.modifiedTime ? candidate : newest,
  );
}

function isDriveNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: unknown }).status === 404
  );
}

interface RegistryEntry {
  id: string;
  title: string;
  encrypted: boolean;
  salt?: string;
  kdfIterations?: number;
}

const SYNC_INDEX_WRITE_ATTEMPTS = 3;
const SYNC_INDEX_SNAPSHOT_PREFIX = 'index-v2-';
const SYNC_INDEX_SNAPSHOT_NAME = /^index-v2-[0-9a-f-]{36}\.json$/;
const SYNC_INDEX_COMPACT_PREFIX = 'index-v3-';
const SYNC_INDEX_COMPACT_NAME = /^index-v3-[0-9a-f-]{36}\.json$/;
const SYNC_INDEX_COMPACTION_THRESHOLD = 128;
/**
 * Sync journals remain visible in Drive so users can inspect and recover their
 * content. Index deltas are implementation metadata, however, so keep new
 * ones in Drive's hidden app-data space rather than cluttering each journal.
 */
const HIDDEN_INDEX_FILE_PREFIX = 'canto-sync-index-v1-';

interface CompactSyncIndex {
  version: 3;
  entries: SyncIndex;
  coveredFileIds: string[];
}

function shouldReplaceIndexEntry(
  current: SyncIndex[string] | undefined,
  candidate: SyncIndex[string],
): boolean {
  return (
    !current ||
    candidate.modified > current.modified ||
    (candidate.modified === current.modified &&
      candidate.deleted === true &&
      current.deleted !== true)
  );
}

/** Merge by page revision so a concurrent checkpoint cannot erase a newer row. */
function mergeSyncIndexes(base: SyncIndex, incoming: SyncIndex): SyncIndex {
  const merged: SyncIndex = { ...base };
  for (const [pageId, entry] of Object.entries(incoming)) {
    if (shouldReplaceIndexEntry(merged[pageId], entry)) merged[pageId] = entry;
  }
  return merged;
}

function hiddenIndexName(journalId: string, prefix: string): string {
  return `${HIDDEN_INDEX_FILE_PREFIX}${journalId}-${prefix}${generateUUID()}.json`;
}

function isHiddenIndexName(journalId: string, name: string, pattern: RegExp): boolean {
  const prefix = `${HIDDEN_INDEX_FILE_PREFIX}${journalId}-`;
  return name.startsWith(prefix) && pattern.test(name.slice(prefix.length));
}

export class GDriveRemoteStore implements RemoteStore {
  readonly provider = 'gdrive' as const;

  private accessToken: string | null = null;

  /** In-memory cache: file name path → Drive file ID */
  private fileIdCache = new Map<string, string>();
  /** In-flight folder creation promises to prevent duplicate creation. */
  private folderInflight = new Map<string, Promise<string>>();
  /** Exact chunk names resolved before this sync's bounded uploads begin. */
  private prewarmedChunkKeys = new Set<string>();
  /** Last merged index snapshot, used to write compact immutable deltas. */
  private syncIndexSnapshots = new Map<string, SyncIndex>();

  isRemotePath(path: string): boolean {
    return path.startsWith('gdrive://');
  }

  buildRemotePath(journalId: string, filename: string): string {
    return `gdrive://${journalId}/attachments/${filename}`;
  }

  async connect(credentials: { accessToken: string }): Promise<void> {
    if (!credentials.accessToken) {
      throw new Error('[GDrive] Access token is required');
    }
    const isFirstConnect = this.accessToken === null;
    this.accessToken = credentials.accessToken;
    // Clear cache on first connection (stale entries from previous session)
    if (isFirstConnect) {
      this.fileIdCache.clear();
    }
  }

  async disconnect(): Promise<void> {
    this.accessToken = null;
    this.fileIdCache.clear();
    this.folderInflight.clear();
    this.prewarmedChunkKeys.clear();
    this.syncIndexSnapshots.clear();
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

    const files = await api.listFiles(
      this.token(),
      `name = '${escapeQuery(REGISTRY_FILE)}'`,
      'appDataFolder',
    );
    if (files.length > 0) {
      const newest = newestDriveFile(files);
      this.fileIdCache.set(REGISTRY_FILE, newest.id);
      return newest.id;
    }
    return null;
  }

  private async readRegistry(): Promise<RegistryEntry[]> {
    const fileId = await this.getRegistryFileId();
    if (!fileId) return [];
    const content = await api.getFileContent(this.token(), fileId);
    return safeJsonParse<RegistryEntry[]>(content, 'registry');
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
    const cacheKey = `folder:${parentId ?? 'root'}/${name}`;
    const cached = this.fileIdCache.get(cacheKey);
    if (cached) return cached;

    // Deduplicate concurrent calls for the same folder
    const inflight = this.folderInflight.get(cacheKey);
    if (inflight) return inflight;

    const promise = this.resolveOrCreateFolder(name, cacheKey, parentId);
    this.folderInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.folderInflight.delete(cacheKey);
    }
  }

  private async resolveOrCreateFolder(
    name: string,
    cacheKey: string,
    parentId?: string,
  ): Promise<string> {
    const parentQuery = parentId ? ` and '${escapeQuery(parentId)}' in parents` : '';
    const files = await api.listFiles(
      this.token(),
      `name = '${escapeQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentQuery}`,
    );
    if (files.length > 0) {
      const newest = newestDriveFile(files);
      this.fileIdCache.set(cacheKey, newest.id);
      return newest.id;
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

  private fileCacheKey(name: string, parentId: string): string {
    return `file:${parentId}/${name}`;
  }

  private async findFile(name: string, parentId: string): Promise<string | null> {
    const cacheKey = this.fileCacheKey(name, parentId);
    const cached = this.fileIdCache.get(cacheKey);
    if (cached) return cached;

    const files = await api.listFiles(
      this.token(),
      `name = '${escapeQuery(name)}' and '${escapeQuery(parentId)}' in parents and trashed = false`,
    );
    if (files.length > 0) {
      const newest = newestDriveFile(files);
      this.fileIdCache.set(cacheKey, newest.id);
      return newest.id;
    }
    return null;
  }

  private async upsertFile(
    name: string,
    parentId: string,
    content: string,
    mimeType = 'application/json',
    signal?: AbortSignal,
  ): Promise<void> {
    const existingId = await this.findFile(name, parentId);
    if (existingId) {
      if (signal)
        await api.updateFile(this.token(), existingId, { name, mimeType }, content, signal);
      else await api.updateFile(this.token(), existingId, { name, mimeType }, content);
    } else {
      const created = signal
        ? await api.createFile(
            this.token(),
            { name, mimeType, parents: [parentId] },
            content,
            'drive',
            signal,
          )
        : await api.createFile(this.token(), { name, mimeType, parents: [parentId] }, content);
      this.fileIdCache.set(this.fileCacheKey(name, parentId), created.id);
    }
  }

  /**
   * A prewarm has made this exact immutable chunk name known-present or
   * known-absent. Skip the per-chunk lookup, but fall back to a verified lookup
   * if its cached remote ID was concurrently deleted.
   */
  private async upsertPrewarmedChunk(
    name: string,
    parentId: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const cacheKey = this.fileCacheKey(name, parentId);
    const existingId = this.fileIdCache.get(cacheKey);
    if (existingId) {
      try {
        await api.updateFile(
          this.token(),
          existingId,
          { name, mimeType: 'application/octet-stream' },
          content,
          signal,
        );
        return;
      } catch (error) {
        if (!isDriveNotFound(error)) throw error;
        this.fileIdCache.delete(cacheKey);
        this.prewarmedChunkKeys.delete(cacheKey);
        await this.upsertFile(name, parentId, content, 'application/octet-stream', signal);
        return;
      }
    }

    const created = await api.createFile(
      this.token(),
      { name, mimeType: 'application/octet-stream', parents: [parentId] },
      content,
      'drive',
      signal,
    );
    this.fileIdCache.set(cacheKey, created.id);
  }

  // ---------- RemoteStore implementation ----------

  async listRemoteJournals(): Promise<RemoteJournalMeta[]> {
    const registry = await this.readRegistry();
    return registry.map((entry) => ({
      id: entry.id,
      title: entry.title,
      lastModified: 0,
      salt: entry.salt,
      kdfIterations: entry.kdfIterations,
      encrypted: entry.encrypted,
    }));
  }

  async uploadJournalMeta(
    journalId: string,
    encryptedMeta: string,
    registry: RegistryInfo,
  ): Promise<void> {
    const journalFolderId = await this.getJournalFolderId(journalId);

    // Write encrypted meta.json
    await this.upsertFile('meta.json', journalFolderId, encryptedMeta);

    // Update registry with plain metadata
    const entries = await this.readRegistry();
    const existing = entries.findIndex((e) => e.id === journalId);
    const entry: RegistryEntry = {
      id: journalId,
      title: registry.title,
      encrypted: registry.encrypted,
      salt: registry.salt,
      kdfIterations: registry.kdfIterations,
    };
    if (existing >= 0) {
      entries[existing] = entry;
    } else {
      entries.push(entry);
    }
    await this.writeRegistry(entries);
  }

  async downloadJournalMeta(journalId: string): Promise<string | null> {
    return (await this.downloadJournalMetaCandidates(journalId))[0] ?? null;
  }

  async downloadJournalMetaCandidates(journalId: string): Promise<string[]> {
    const journalFolderId = await this.getJournalFolderId(journalId);
    const files = await api.listFiles(
      this.token(),
      `name = 'meta.json' and '${escapeQuery(journalFolderId)}' in parents and trashed = false`,
    );
    const newestFirst = [...files].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
    return Promise.all(newestFirst.map((file) => api.getFileContent(this.token(), file.id)));
  }

  async uploadPage(journalId: string, pageId: string, encryptedContent: string): Promise<void> {
    const pagesFolderId = await this.getPagesFolderId(journalId);
    await this.upsertFile(`${pageId}.json`, pagesFolderId, encryptedContent);
  }

  async downloadPage(journalId: string, pageId: string): Promise<string | null> {
    const pagesFolderId = await this.getPagesFolderId(journalId);
    const fileId = await this.findFile(`${pageId}.json`, pagesFolderId);
    if (!fileId) return null;
    return api.getFileContent(this.token(), fileId);
  }

  async deletePage(journalId: string, pageId: string): Promise<void> {
    const pagesFolderId = await this.getPagesFolderId(journalId);
    const fileId = await this.findFile(`${pageId}.json`, pagesFolderId);
    if (fileId) {
      await api.deleteFile(this.token(), fileId);
      this.fileIdCache.delete(`file:${pagesFolderId}/${pageId}.json`);
    }
  }

  private syncIndexDelta(journalId: string, index: SyncIndex): SyncIndex {
    const previous = this.syncIndexSnapshots.get(journalId) ?? {};
    const delta: SyncIndex = {};
    for (const [pageId, entry] of Object.entries(index)) {
      const prior = previous[pageId];
      if (!prior || prior.modified !== entry.modified || prior.deleted !== entry.deleted) {
        delta[pageId] = entry;
      }
    }
    return delta;
  }

  private async updateCompatibilitySyncIndex(
    journalFolderId: string,
    index: SyncIndex,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const name = 'index.json';
    const fileId = await this.findFile(name, journalFolderId);
    if (!fileId) {
      const created = await api.createFile(
        this.token(),
        { name, mimeType: 'application/json', parents: [journalFolderId] },
        JSON.stringify(index),
        'drive',
        signal,
      );
      this.fileIdCache.set(this.fileCacheKey(name, journalFolderId), created.id);
      return true;
    }

    for (let attempt = 0; attempt < SYNC_INDEX_WRITE_ATTEMPTS; attempt++) {
      const current = await api.getFileContentWithEtag(this.token(), fileId, signal);
      if (!current.etag) break;
      const merged = mergeSyncIndexes(
        safeJsonParse<SyncIndex>(current.content, 'sync-index'),
        index,
      );
      try {
        await api.updateFile(
          this.token(),
          fileId,
          { name, mimeType: 'application/json' },
          JSON.stringify(merged),
          signal,
          current.etag,
        );
        return true;
      } catch (error) {
        if (!(error instanceof api.GDriveApiError) || error.status !== 412) throw error;
      }
    }
    // Immutable deltas remain authoritative if the compatibility projection
    // races or a proxy omitted ETags.
    return false;
  }

  /**
   * Fold hidden immutable index metadata into one new snapshot. The snapshot is
   * published before any deletion, so a failed cleanup can only leave extra
   * metadata behind; it can never make a published page disappear.
   */
  private async compactSyncIndex(
    journalId: string,
    journalFolderId: string,
    forceAfterSuccessfulSync: boolean,
    canDeleteLegacyArtifacts: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    const legacyFiles =
      (await api.listFiles(
        this.token(),
        `name contains 'index-v' and '${escapeQuery(journalFolderId)}' in parents and trashed = false`,
        'drive',
        signal,
      )) ?? [];
    const hiddenFiles =
      (await api.listFiles(
        this.token(),
        `name contains '${escapeQuery(`${HIDDEN_INDEX_FILE_PREFIX}${journalId}-`)}'`,
        'appDataFolder',
        signal,
      )) ?? [];
    const legacyV2Files = legacyFiles.filter((file) => SYNC_INDEX_SNAPSHOT_NAME.test(file.name));
    const hiddenV2Files = hiddenFiles.filter((file) =>
      isHiddenIndexName(journalId, file.name, SYNC_INDEX_SNAPSHOT_NAME),
    );
    const legacyCompactFiles = legacyFiles.filter((file) =>
      SYNC_INDEX_COMPACT_NAME.test(file.name),
    );
    const hiddenCompactFiles = hiddenFiles.filter((file) =>
      isHiddenIndexName(journalId, file.name, SYNC_INDEX_COMPACT_NAME),
    );
    const v2Files = [...legacyV2Files, ...hiddenV2Files];
    const compactFiles = [...legacyCompactFiles, ...hiddenCompactFiles];
    const shouldCompact = forceAfterSuccessfulSync
      ? v2Files.length > 0 || compactFiles.length > 1
      : v2Files.length >= SYNC_INDEX_COMPACTION_THRESHOLD;
    if (!shouldCompact) return;

    let merged: SyncIndex = {};
    for (const file of compactFiles) {
      const compact = safeJsonParse<CompactSyncIndex>(
        await api.getFileContent(this.token(), file.id, signal),
        'sync-index-compact',
      );
      if (
        compact.version !== 3 ||
        !compact.entries ||
        !Array.isArray(compact.coveredFileIds) ||
        !compact.coveredFileIds.every((id) => typeof id === 'string')
      ) {
        throw new Error('Invalid compact sync index');
      }
      merged = mergeSyncIndexes(merged, compact.entries);
    }
    for (const file of v2Files) {
      merged = mergeSyncIndexes(
        merged,
        safeJsonParse<SyncIndex>(
          await api.getFileContent(this.token(), file.id, signal),
          'sync-index-delta',
        ),
      );
    }
    await api.createFile(
      this.token(),
      {
        name: hiddenIndexName(journalId, SYNC_INDEX_COMPACT_PREFIX),
        mimeType: 'application/json',
        parents: ['appDataFolder'],
      },
      JSON.stringify({
        version: 3,
        entries: merged,
        coveredFileIds: v2Files.map((file) => file.id),
      } satisfies CompactSyncIndex),
      'appDataFolder',
      signal,
    );

    // Every listed source is represented in the just-created snapshot. Delete
    // only after that durable publication; a concurrent writer can add new
    // files, but it cannot make us delete a file we did not list.
    const sources = [
      ...hiddenV2Files,
      ...hiddenCompactFiles,
      ...(canDeleteLegacyArtifacts ? [...legacyV2Files, ...legacyCompactFiles] : []),
    ];
    const workers = Math.min(4, sources.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (next < sources.length) {
          const source = sources[next++];
          try {
            await api.deleteFile(this.token(), source.id);
          } catch (error) {
            // The new snapshot is already authoritative. A failed permanent
            // deletion is harmless and will be retried by a later compaction.
            console.warn('[GDrive] Deferred compacted sync-index cleanup:', error);
          }
        }
      }),
    );
  }

  async openSyncIndexPublication(
    journalId: string,
    signal?: AbortSignal,
  ): Promise<SyncIndexPublication> {
    const initial = (await this.downloadSyncIndex(journalId)) ?? {};
    const journalFolderId = await this.getJournalFolderId(journalId);
    let merged: SyncIndex = { ...initial };
    let finalized = false;

    return {
      initial,
      publishPage: async (pageId, entry, publishSignal) => {
        if (finalized) throw new Error('Sync index publication is already finalized');
        const prior = merged[pageId];
        if (!shouldReplaceIndexEntry(prior, entry)) return;
        await api.createFile(
          this.token(),
          {
            name: hiddenIndexName(journalId, SYNC_INDEX_SNAPSHOT_PREFIX),
            mimeType: 'application/json',
            parents: ['appDataFolder'],
          },
          JSON.stringify({ [pageId]: entry }),
          'appDataFolder',
          publishSignal ?? signal,
        );
        merged = mergeSyncIndexes(merged, { [pageId]: entry });
        this.syncIndexSnapshots.set(journalId, merged);
      },
      finalize: async (options = {}) => {
        if (finalized) return;
        finalized = true;
        const finalizeSignal = options.signal ?? signal;
        const compatibilityUpdated = await this.updateCompatibilitySyncIndex(
          journalFolderId,
          merged,
          finalizeSignal,
        );
        try {
          await this.compactSyncIndex(
            journalId,
            journalFolderId,
            options.successful === true,
            compatibilityUpdated,
            finalizeSignal,
          );
        } catch (error) {
          // The completed immutable deltas and compatibility projection remain
          // readable. Compaction is an optimization, never a reason to turn a
          // durable page publication into a failed sync.
          console.warn('[GDrive] Sync-index compaction deferred:', error);
        }
      },
    };
  }

  async uploadSyncIndex(journalId: string, index: SyncIndex): Promise<void> {
    const journalFolderId = await this.getJournalFolderId(journalId);
    const delta = this.syncIndexDelta(journalId, index);

    // A unique immutable delta is the authoritative publication record. Unlike
    // index.json, it has no first-writer race: concurrent devices produce
    // different files and readers merge every delta by page revision.
    if (Object.keys(delta).length > 0) {
      await api.createFile(
        this.token(),
        {
          name: hiddenIndexName(journalId, SYNC_INDEX_SNAPSHOT_PREFIX),
          mimeType: 'application/json',
          parents: ['appDataFolder'],
        },
        JSON.stringify(delta),
        'appDataFolder',
      );
      this.syncIndexSnapshots.set(
        journalId,
        mergeSyncIndexes(this.syncIndexSnapshots.get(journalId) ?? {}, delta),
      );
    }

    await this.updateCompatibilitySyncIndex(journalFolderId, index);
  }

  async downloadSyncIndex(journalId: string): Promise<SyncIndex | null> {
    const journalFolderId = await this.getJournalFolderId(journalId);
    let merged: SyncIndex = {};
    let found = false;
    const fileId = await this.findFile('index.json', journalFolderId);
    if (fileId) {
      merged = safeJsonParse<SyncIndex>(
        await api.getFileContent(this.token(), fileId),
        'sync-index',
      );
      found = true;
    }
    // Root-level deltas came from pre-19.2.4 builds. New immutable metadata
    // belongs in appDataFolder, which is hidden from Drive's normal UI.
    const legacySnapshots =
      (await api.listFiles(
        this.token(),
        `name contains 'index-v' and '${escapeQuery(journalFolderId)}' in parents and trashed = false`,
      )) ?? [];
    const hiddenSnapshots =
      (await api.listFiles(
        this.token(),
        `name contains '${escapeQuery(`${HIDDEN_INDEX_FILE_PREFIX}${journalId}-`)}'`,
        'appDataFolder',
      )) ?? [];
    const snapshots = [...legacySnapshots, ...hiddenSnapshots];
    const covered = new Set<string>();
    for (const snapshot of snapshots) {
      if (
        !SYNC_INDEX_COMPACT_NAME.test(snapshot.name) &&
        !isHiddenIndexName(journalId, snapshot.name, SYNC_INDEX_COMPACT_NAME)
      ) {
        continue;
      }
      const compact = safeJsonParse<CompactSyncIndex>(
        await api.getFileContent(this.token(), snapshot.id),
        'sync-index-compact',
      );
      if (
        compact.version !== 3 ||
        !compact.entries ||
        !Array.isArray(compact.coveredFileIds) ||
        !compact.coveredFileIds.every((id) => typeof id === 'string')
      ) {
        throw new Error('Invalid compact sync index');
      }
      merged = mergeSyncIndexes(merged, compact.entries);
      compact.coveredFileIds.forEach((id) => covered.add(id));
      found = true;
    }
    for (const snapshot of snapshots) {
      const isLegacySnapshot = SYNC_INDEX_SNAPSHOT_NAME.test(snapshot.name);
      const isHiddenSnapshot = isHiddenIndexName(
        journalId,
        snapshot.name,
        SYNC_INDEX_SNAPSHOT_NAME,
      );
      if ((!isLegacySnapshot && !isHiddenSnapshot) || covered.has(snapshot.id)) continue;
      merged = mergeSyncIndexes(
        merged,
        safeJsonParse<SyncIndex>(
          await api.getFileContent(this.token(), snapshot.id),
          'sync-index-delta',
        ),
      );
      found = true;
    }
    if (found) this.syncIndexSnapshots.set(journalId, merged);
    return found ? merged : null;
  }

  async uploadAttachment(journalId: string, localPath: string, data: string): Promise<string> {
    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);
    const name = localPath.split('/').pop() ?? localPath;
    await this.upsertFile(name, attachmentsFolderId, data, 'application/octet-stream');
    return `gdrive://${journalId}/attachments/${name}`;
  }

  private chunkName(attachmentId: string, generation: string | undefined, index: number): string {
    // Generation-less descriptors were published by 1.1.0 and retain their
    // original addresses. New descriptors use immutable generation addresses
    // so a failed replacement cannot corrupt the page currently published.
    return generation
      ? `chunk-v1-${attachmentId}-${generation}-${index}`
      : `chunk-v1-${attachmentId}-${index}`;
  }

  async prepareAttachmentChunkUploads(
    journalId: string,
    attachments: Attachment[],
    signal?: AbortSignal,
  ): Promise<void> {
    const targetNames = new Set<string>();
    for (const attachment of attachments) {
      const content = attachment.content;
      if (content?.format !== 'canto-chunked-v1' || !content.generation) continue;
      for (let index = 0; index < content.chunkCount; index++) {
        targetNames.add(this.chunkName(attachment.id, content.generation, index));
      }
    }
    if (targetNames.size === 0) return;

    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);

    // Drive returns only metadata here. Filter immediately so old generations
    // do not become extra cache entries or retain attachment payload data.
    const files = await api.listFiles(
      this.token(),
      `name contains 'chunk-v1-' and '${escapeQuery(attachmentsFolderId)}' in parents and trashed = false`,
      'drive',
      signal,
    );
    for (const file of files) {
      if (targetNames.has(file.name)) {
        this.fileIdCache.set(this.fileCacheKey(file.name, attachmentsFolderId), file.id);
      }
    }
    for (const name of targetNames) {
      this.prewarmedChunkKeys.add(this.fileCacheKey(name, attachmentsFolderId));
    }
  }

  async prepareChunkUploads(
    journalId: string,
    attachments: readonly Attachment[],
    signal?: AbortSignal,
  ): Promise<PreparedChunkUploads> {
    const targets = new Map<string, { attachmentKey: string; index: number }>();
    const missingByAttachment = new Map<string, Set<number>>();
    const keyFor = (attachment: Attachment): string => {
      const content = attachment.content;
      if (content?.format !== 'canto-chunked-v1' || !content.generation) {
        throw new Error(`Immutable chunk generation required for attachment: ${attachment.name}`);
      }
      return `${attachment.id}:${content.generation}`;
    };

    for (const attachment of attachments) {
      const attachmentKey = keyFor(attachment);
      const content = attachment.content!;
      const missing = new Set<number>();
      missingByAttachment.set(attachmentKey, missing);
      for (let index = 0; index < content.chunkCount; index++) {
        const name = this.chunkName(attachment.id, content.generation, index);
        targets.set(name, { attachmentKey, index });
        missing.add(index);
      }
    }

    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);
    if (targets.size > 0) {
      const files = await api.listFiles(
        this.token(),
        `name contains 'chunk-v1-' and '${escapeQuery(attachmentsFolderId)}' in parents and trashed = false`,
        'drive',
        signal,
      );
      for (const file of files) {
        const target = targets.get(file.name);
        if (!target) continue;
        missingByAttachment.get(target.attachmentKey)?.delete(target.index);
        this.fileIdCache.set(this.fileCacheKey(file.name, attachmentsFolderId), file.id);
      }
    }

    return {
      missingIndexes: (attachment) => {
        const missing = missingByAttachment.get(keyFor(attachment));
        if (!missing) throw new Error(`Attachment was not prepared: ${attachment.name}`);
        return [...missing].sort((a, b) => a - b);
      },
      uploadMissingChunk: async (attachment, index, encryptedData, uploadSignal) => {
        const attachmentKey = keyFor(attachment);
        const missing = missingByAttachment.get(attachmentKey);
        if (!missing?.has(index)) {
          throw new Error(`Chunk was not prepared as missing: ${attachment.name} #${index}`);
        }
        const name = this.chunkName(attachment.id, attachment.content!.generation, index);
        const created = await api.createFile(
          this.token(),
          {
            name,
            mimeType: 'application/octet-stream',
            parents: [attachmentsFolderId],
          },
          encryptedData,
          'drive',
          uploadSignal ?? signal,
        );
        this.fileIdCache.set(this.fileCacheKey(name, attachmentsFolderId), created.id);
        missing.delete(index);
      },
    };
  }

  async listAttachmentChunkIndexes(
    journalId: string,
    attachmentId: string,
    generation: string,
    chunkCount: number,
    signal?: AbortSignal,
  ): Promise<ReadonlySet<number>> {
    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);
    const prefix = `chunk-v1-${attachmentId}-${generation}-`;
    const files = await api.listFiles(
      this.token(),
      `name contains '${escapeQuery(prefix)}' and '${escapeQuery(attachmentsFolderId)}' in parents and trashed = false`,
      'drive',
      signal,
    );
    const indexes = new Set<number>();
    for (const file of files) {
      if (!file.name.startsWith(prefix)) continue;
      const suffix = file.name.slice(prefix.length);
      // Drive's `contains` filter can return a bare prefix or decimal-like
      // names (for example `1.0`). Only canonical in-range chunk addresses
      // prove that a descriptor's chunk was persisted.
      if (!/^(?:0|[1-9]\d*)$/.test(suffix)) continue;
      const index = Number(suffix);
      if (!Number.isSafeInteger(index) || index >= chunkCount) continue;
      indexes.add(index);
      const cacheKey = this.fileCacheKey(file.name, attachmentsFolderId);
      this.fileIdCache.set(cacheKey, file.id);
      this.prewarmedChunkKeys.add(cacheKey);
    }
    return indexes;
  }

  async uploadAttachmentChunk(
    journalId: string,
    attachmentId: string,
    generation: string | undefined,
    index: number,
    data: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);
    const name = this.chunkName(attachmentId, generation, index);
    if (this.prewarmedChunkKeys.has(this.fileCacheKey(name, attachmentsFolderId))) {
      await this.upsertPrewarmedChunk(name, attachmentsFolderId, data, signal);
    } else {
      await this.upsertFile(name, attachmentsFolderId, data, 'application/octet-stream', signal);
    }
  }

  async downloadAttachmentChunk(
    journalId: string,
    attachmentId: string,
    generation: string | undefined,
    index: number,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);
    const name = this.chunkName(attachmentId, generation, index);
    const fileId = await this.findFile(name, attachmentsFolderId);
    if (!fileId) return null;
    return api.getFileContent(this.token(), fileId, signal);
  }

  async deleteAttachmentChunk(
    journalId: string,
    attachmentId: string,
    generation: string | undefined,
    index: number,
  ): Promise<void> {
    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);
    const name = this.chunkName(attachmentId, generation, index);
    const fileId = await this.findFile(name, attachmentsFolderId);
    if (!fileId) return;
    await api.deleteFile(this.token(), fileId);
    this.fileIdCache.delete(`file:${attachmentsFolderId}/${name}`);
  }

  async deleteAttachmentGenerationsExcept(
    journalId: string,
    attachmentId: string,
    generation: string,
  ): Promise<void> {
    const attachmentsFolderId = await this.getAttachmentsFolderId(journalId);
    const prefix = `chunk-v1-${attachmentId}-`;
    const retainedPrefix = `${prefix}${generation}-`;
    const files = await api.listFiles(
      this.token(),
      `name contains '${escapeQuery(prefix)}' and '${escapeQuery(attachmentsFolderId)}' in parents and trashed = false`,
    );
    await Promise.all(
      files
        .filter((file) => !file.name.startsWith(retainedPrefix))
        .map(async (file) => {
          await api.deleteFile(this.token(), file.id);
          this.fileIdCache.delete(this.fileCacheKey(file.name, attachmentsFolderId));
          return undefined;
        }),
    );
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

  async deleteJournal(journalId: string): Promise<void> {
    // Delete the journal folder (recursively deletes pages, attachments, meta)
    const rootId = await this.getRootFolderId();
    const cacheKey = `folder:${rootId}/${journalId}`;
    const folderId = this.fileIdCache.get(cacheKey);
    if (folderId) {
      await api.deleteFile(this.token(), folderId);
      // Clear all cached entries for this journal (exact folder match)
      const folderId2 = folderId; // capture for closure
      for (const [key, value] of this.fileIdCache.entries()) {
        if (value === folderId2 || key.includes(`${folderId2}/`)) {
          this.fileIdCache.delete(key);
        }
      }
      this.fileIdCache.delete(cacheKey);
    } else {
      // Not cached — look it up
      const files = await api.listFiles(
        this.token(),
        `name = '${escapeQuery(journalId)}' and mimeType = 'application/vnd.google-apps.folder' and '${escapeQuery(rootId)}' in parents and trashed = false`,
      );
      if (files.length > 0) {
        await api.deleteFile(this.token(), files[0].id);
      }
    }

    // Remove from registry
    const registry = await this.readRegistry();
    const updated = registry.filter((e) => e.id !== journalId);
    if (updated.length !== registry.length) {
      await this.writeRegistry(updated);
    }
  }
}
