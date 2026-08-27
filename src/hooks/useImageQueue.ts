import { useState, useCallback, useRef, useEffect } from 'react';
import { InteractionManager } from 'react-native';
import type { Attachment } from 'canto-data';
import type { AttachmentDisplayLease } from '@/lib/attachment-display';

const MAX_CONCURRENT = 1;

// Both plain and password-encrypted carousels use this one lane. Keeping this
// outside the hook prevents a page with two groups from materializing two
// large images at once on Android.
let sharedMaterializationTail: Promise<void> = Promise.resolve();

function serializeMaterialization<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
  disposeLateResult?: (value: T) => void,
): Promise<T> {
  const abortableWork = () =>
    new Promise<T>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Attachment display materialization cancelled'));
        return;
      }
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        reject(new Error('Attachment display materialization cancelled'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      work().then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          if (settled) {
            disposeLateResult?.(value);
            return;
          }
          settled = true;
          resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          if (settled) return;
          settled = true;
          reject(error);
        },
      );
    });
  const next = sharedMaterializationTail.catch(() => undefined).then(abortableWork);
  sharedMaterializationTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

interface QueueEntry {
  attachment: Attachment;
  cancelled: boolean;
}

// ---------------------------------------------------------------------------
// Shared thumbnail queue — serialises thumbnail loads across all PageListItem
// instances so they don't all fire at once and block the JS thread.
// ---------------------------------------------------------------------------

interface ThumbnailTask {
  id: string;
  load: () => Promise<string | null>;
  resolve: (uri: string | null) => void;
  cancelled: boolean;
}

const thumbnailQueue: ThumbnailTask[] = [];
let thumbnailActive = false;

function processThumbnailQueue() {
  if (thumbnailActive) return;

  let task: ThumbnailTask | undefined;
  while (thumbnailQueue.length > 0) {
    const candidate = thumbnailQueue.shift();
    if (candidate && !candidate.cancelled) {
      task = candidate;
      break;
    }
  }
  if (!task) return;

  thumbnailActive = true;
  const current = task;
  current
    .load()
    .then((data) => {
      if (!current.cancelled) current.resolve(data);
    })
    .catch(() => {
      if (!current.cancelled) current.resolve(null);
    })
    .finally(() => {
      thumbnailActive = false;
      // Yield before next load so touches / navigation can be processed
      setTimeout(processThumbnailQueue, 0);
    });
}

/**
 * Enqueue a thumbnail load that will be serialised with all other thumbnails.
 * Returns a cancel function.
 */
export function enqueueThumbnail(
  id: string,
  load: () => Promise<string | null>,
  onLoaded: (uri: string | null) => void,
): () => void {
  const task: ThumbnailTask = { id, load, resolve: onLoaded, cancelled: false };
  thumbnailQueue.push(task);

  InteractionManager.runAfterInteractions(() => {
    if (!task.cancelled) processThumbnailQueue();
  });

  return () => {
    task.cancelled = true;
  };
}

type ImageLoadResult = string | AttachmentDisplayLease | null;

export function useImageQueue(
  loadImage: (attachment: Attachment, signal: AbortSignal) => Promise<ImageLoadResult>,
) {
  const [loadedImages, setLoadedImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>({});
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const queueRef = useRef<QueueEntry[]>([]);
  const activeCountRef = useRef(0);
  const mountedRef = useRef(true);
  const loadedRef = useRef<Set<string>>(new Set());
  const loadingRef = useRef<Set<string>>(new Set());
  const failedRef = useRef<Set<string>>(new Set());
  const leasesRef = useRef<Map<string, AttachmentDisplayLease>>(new Map());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  // AbortSignal is cooperative. Keep an explicit cancellation record so a
  // native/materializer promise that resolves after abort cannot publish a
  // leased decrypted URI into a queue that has already been cleared.
  const cancelledActiveIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const controller of controllersRef.current.values()) controller.abort();
      controllersRef.current.clear();
      for (const lease of leasesRef.current.values()) lease.release();
      leasesRef.current.clear();
    };
  }, []);

  const processNext = useCallback(() => {
    if (activeCountRef.current >= MAX_CONCURRENT) return;

    // Skip cancelled/already-handled entries
    let entry: QueueEntry | undefined;
    while (queueRef.current.length > 0) {
      const candidate = queueRef.current.shift();
      if (!candidate || candidate.cancelled) continue;
      if (loadedRef.current.has(candidate.attachment.id)) continue;
      if (loadingRef.current.has(candidate.attachment.id)) continue;
      entry = candidate;
      break;
    }
    if (!entry) return;

    activeCountRef.current++;
    loadingRef.current.add(entry.attachment.id);
    const controller = new AbortController();
    controllersRef.current.set(entry.attachment.id, controller);
    if (mountedRef.current) {
      setLoadingImages((prev) => ({ ...prev, [entry.attachment.id]: true }));
    }

    serializeMaterialization(
      controller.signal,
      () => loadImage(entry.attachment, controller.signal),
      (result) => {
        if (result && typeof result !== 'string') result.release();
      },
    )
      .then((result) => {
        if (
          !mountedRef.current ||
          entry.cancelled ||
          cancelledActiveIdsRef.current.has(entry.attachment.id)
        ) {
          if (result && typeof result !== 'string') result.release();
          return;
        }
        if (result) {
          const uri = typeof result === 'string' ? result : result.uri;
          if (typeof result !== 'string') leasesRef.current.set(entry.attachment.id, result);
          loadedRef.current.add(entry.attachment.id);
          // Batch both updates together so React commits one render, not two
          setLoadedImages((prev) => ({ ...prev, [entry.attachment.id]: uri }));
          setLoadingImages((prev) => ({ ...prev, [entry.attachment.id]: false }));
        }
      })
      .catch(() => {
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          entry.cancelled ||
          cancelledActiveIdsRef.current.has(entry.attachment.id)
        ) {
          return;
        }
        failedRef.current.add(entry.attachment.id);
        setFailedImages((prev) => ({ ...prev, [entry.attachment.id]: true }));
      })
      .finally(() => {
        activeCountRef.current--;
        loadingRef.current.delete(entry.attachment.id);
        controllersRef.current.delete(entry.attachment.id);
        cancelledActiveIdsRef.current.delete(entry.attachment.id);
        if (mountedRef.current && !loadedRef.current.has(entry.attachment.id)) {
          setLoadingImages((prev) => ({ ...prev, [entry.attachment.id]: false }));
        }
        // Yield the JS thread before processing the next image so touch
        // events, navigation, and other UI updates are not blocked.
        setTimeout(processNext, 0);
      });
  }, [loadImage]);

  const enqueue = useCallback(
    (attachments: Attachment[]) => {
      InteractionManager.runAfterInteractions(() => {
        if (!mountedRef.current) return;
        for (const attachment of attachments) {
          if (loadedRef.current.has(attachment.id)) continue;
          if (loadingRef.current.has(attachment.id)) continue;
          if (failedRef.current.has(attachment.id)) continue;
          if (queueRef.current.some((e) => !e.cancelled && e.attachment.id === attachment.id)) {
            continue;
          }
          cancelledActiveIdsRef.current.delete(attachment.id);
          queueRef.current.push({ attachment, cancelled: false });
        }
        processNext();
      });
    },
    [processNext],
  );

  const cancelAll = useCallback(() => {
    for (const entry of queueRef.current) {
      entry.cancelled = true;
    }
    queueRef.current = [];
    for (const [attachmentId, controller] of controllersRef.current) {
      cancelledActiveIdsRef.current.add(attachmentId);
      controller.abort();
    }
    controllersRef.current.clear();
    for (const lease of leasesRef.current.values()) lease.release();
    leasesRef.current.clear();
    loadedRef.current.clear();
    loadingRef.current.clear();
    failedRef.current.clear();
    if (mountedRef.current) {
      setLoadedImages({});
      setLoadingImages({});
      setFailedImages({});
    }
  }, []);

  const prioritize = useCallback((attachment: Attachment) => {
    const index = queueRef.current.findIndex(
      (entry) => !entry.cancelled && entry.attachment.id === attachment.id,
    );
    if (index > 0) {
      const [entry] = queueRef.current.splice(index, 1);
      queueRef.current.unshift(entry);
    }
  }, []);

  const retry = useCallback(
    (attachment: Attachment) => {
      if (loadingRef.current.has(attachment.id) || loadedRef.current.has(attachment.id)) return;
      failedRef.current.delete(attachment.id);
      setFailedImages((prev) => {
        const remaining = { ...prev };
        delete remaining[attachment.id];
        return remaining;
      });
      queueRef.current.unshift({ attachment, cancelled: false });
      processNext();
    },
    [processNext],
  );

  return { loadedImages, loadingImages, failedImages, enqueue, cancelAll, prioritize, retry };
}
