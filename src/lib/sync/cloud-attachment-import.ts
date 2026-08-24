import type { Attachment, Page } from 'canto-data';
import { aesGcmDecrypt } from '@/lib/encryption/utils';
import type { LocalStore } from '@/lib/storage/types';
import type { RemoteStore } from './types';

/**
 * Legacy attachment data has to be opened as one value. Keep cloud import on
 * the same conservative boundary as legacy sync; descriptor-bearing content
 * always uses the bounded chunk path instead.
 */
export const LEGACY_CLOUD_IMPORT_LIMIT_BYTES = 512 * 1024;
const CHUNK_DOWNLOAD_CONCURRENCY = 2;

export interface CloudAttachmentImportWarning {
  name: string;
  size?: number;
  /** A stable code; UI owns localization rather than surfacing console English. */
  reason: 'legacy-attachment-too-large' | 'attachment-not-found' | 'chunk-generation-missing';
}

interface CloudAttachmentImportOptions {
  journalId: string;
  page: Page;
  syncKey: Uint8Array;
  localStore: LocalStore;
  remoteStore: RemoteStore;
}

async function boundedParallel<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  const queue = items.slice();
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) await work(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

function attachmentsForPage(page: Page): Attachment[] {
  return [...(page.images ?? []), ...(page.files ?? [])].filter((attachment) =>
    Boolean(!attachment.deleted && attachment.path),
  );
}

/**
 * Download a cloud page's content without ever reassembling a chunked
 * attachment. Pages are imported serially by the modal, so this two-worker
 * queue is journal-wide as well as per-page bounded.
 */
export async function downloadCloudPageAttachments({
  journalId,
  page,
  syncKey,
  localStore,
  remoteStore,
}: CloudAttachmentImportOptions): Promise<CloudAttachmentImportWarning[]> {
  const warnings: CloudAttachmentImportWarning[] = [];
  const attachments = attachmentsForPage(page);

  await boundedParallel(attachments, CHUNK_DOWNLOAD_CONCURRENCY, async (attachment) => {
    if (attachment.content?.format === 'canto-chunked-v1') {
      if (!attachment.content.generation) {
        warnings.push({
          name: attachment.name,
          size: attachment.size,
          reason: 'chunk-generation-missing',
        });
        return;
      }
      if (!localStore.saveAttachmentChunks || !remoteStore.downloadAttachmentChunk) {
        throw new Error(`Chunked attachment transfer is unavailable: ${attachment.name}`);
      }

      const remote = remoteStore;
      async function* chunks(): AsyncGenerator<string> {
        for (let index = 0; index < attachment.content!.chunkCount; index++) {
          const encrypted = await remote.downloadAttachmentChunk!(
            journalId,
            attachment.id,
            attachment.content!.generation,
            index,
          );
          if (!encrypted) {
            throw new Error(`Attachment chunk not found: ${attachment.name} #${index}`);
          }
          yield aesGcmDecrypt(encrypted, syncKey);
        }
      }

      attachment.path = await localStore.saveAttachmentChunks(
        journalId,
        page.id,
        attachment,
        chunks(),
      );
      return;
    }

    // A descriptor-absent remote file can only be downloaded as one string.
    // The remote API has no metadata-only size lookup, so missing size is not
    // safe to guess at and must be deferred alongside oversized values.
    if (attachment.size == null || attachment.size > LEGACY_CLOUD_IMPORT_LIMIT_BYTES) {
      warnings.push({
        name: attachment.name,
        size: attachment.size,
        reason: 'legacy-attachment-too-large',
      });
      return;
    }

    const filename = attachment.path.split('/').pop() ?? attachment.path;
    const remotePath = remoteStore.buildRemotePath(journalId, filename);
    const encrypted = await remoteStore.downloadAttachment(remotePath);
    if (!encrypted) {
      warnings.push({
        name: attachment.name,
        size: attachment.size,
        reason: 'attachment-not-found',
      });
      return;
    }
    const data = await aesGcmDecrypt(encrypted, syncKey);
    attachment.path = await localStore.saveAttachment(journalId, page.id, attachment, data);
  });

  return warnings;
}
