import { useState, useCallback, useRef, useEffect } from 'react';
import { InteractionManager } from 'react-native';
import type { Attachment } from 'canto-data';

const MAX_CONCURRENT = 1;

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

export function useImageQueue(loadImage: (path: string) => Promise<string | null>) {
  const [loadedImages, setLoadedImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>({});
  const queueRef = useRef<QueueEntry[]>([]);
  const activeCountRef = useRef(0);
  const mountedRef = useRef(true);
  const loadedRef = useRef<Set<string>>(new Set());
  const loadingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
    if (mountedRef.current) {
      setLoadingImages((prev) => ({ ...prev, [entry.attachment.id]: true }));
    }

    loadImage(entry.attachment.path)
      .then((data) => {
        if (!mountedRef.current || entry.cancelled) return;
        if (data) {
          loadedRef.current.add(entry.attachment.id);
          // Batch both updates together so React commits one render, not two
          setLoadedImages((prev) => ({ ...prev, [entry.attachment.id]: data }));
          setLoadingImages((prev) => ({ ...prev, [entry.attachment.id]: false }));
        }
      })
      .catch(() => {})
      .finally(() => {
        activeCountRef.current--;
        loadingRef.current.delete(entry.attachment.id);
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
          if (queueRef.current.some((e) => !e.cancelled && e.attachment.id === attachment.id)) {
            continue;
          }
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
  }, []);

  return { loadedImages, loadingImages, enqueue, cancelAll };
}
