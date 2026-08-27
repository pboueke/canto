import { renderHook, act } from '@testing-library/react-native';
import { InteractionManager } from 'react-native';
import { useImageQueue, enqueueThumbnail } from '../useImageQueue';
import type { Attachment } from 'canto-data';

// InteractionManager.runAfterInteractions should invoke callback immediately in tests
jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
  if (cb && typeof cb === 'function') cb();
  return { cancel: jest.fn(), then: jest.fn() } as never;
});

function makeAttachment(id: string, path = `attachments/${id}.jpg`): Attachment {
  return { id, path, name: `${id}.jpg`, type: 'image', encrypted: false, deleted: false };
}

describe('useImageQueue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty state initially', () => {
    const loadImage = jest.fn();
    const { result, unmount } = renderHook(() => useImageQueue(loadImage));
    expect(result.current.loadedImages).toEqual({});
    expect(result.current.loadingImages).toEqual({});
  });

  it('loads enqueued images', async () => {
    const loadImage = jest.fn().mockResolvedValue('data:image/png;base64,abc');
    const { result } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([makeAttachment('img1')]);
      // Flush the promise chain
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadImage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'img1', path: 'attachments/img1.jpg' }),
      expect.any(AbortSignal),
    );
    expect(result.current.loadedImages).toHaveProperty('img1', 'data:image/png;base64,abc');
  });

  it('does not re-enqueue already loaded images', async () => {
    const loadImage = jest.fn().mockResolvedValue('data:abc');
    const { result } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([makeAttachment('img1')]);
      await Promise.resolve();
      await Promise.resolve();
    });

    loadImage.mockClear();

    await act(async () => {
      result.current.enqueue([makeAttachment('img1')]);
      await Promise.resolve();
    });

    expect(loadImage).not.toHaveBeenCalled();
  });

  it('handles load failure gracefully', async () => {
    const loadImage = jest.fn().mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([makeAttachment('img1')]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loadedImages).toEqual({});
    expect(result.current.failedImages).toEqual({ img1: true });
  });

  it('retries only after a real load failure', async () => {
    const attachment = makeAttachment('img1');
    const loadImage = jest
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce('data:recovered');
    const { result } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([attachment]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.failedImages).toEqual({ img1: true });

    await act(async () => {
      result.current.enqueue([attachment]);
      await Promise.resolve();
    });
    expect(loadImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.retry(attachment);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadImage).toHaveBeenCalledTimes(2);
    expect(result.current.loadedImages).toEqual({ img1: 'data:recovered' });
    expect(result.current.failedImages).toEqual({});
  });

  it('skips already-loading attachments when enqueuing', async () => {
    // Use a load that never resolves so the image stays in "loading" state
    const loadImage = jest.fn().mockImplementation(() => new Promise<string | null>(() => {}));
    const { result, unmount } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([makeAttachment('dup1')]);
      await Promise.resolve();
    });

    // img is now loading — enqueue the same attachment again
    loadImage.mockClear();
    await act(async () => {
      result.current.enqueue([makeAttachment('dup1')]);
      await Promise.resolve();
    });

    // Should not have been called again since it's already loading
    expect(loadImage).not.toHaveBeenCalled();
    unmount();
  });

  it('skips duplicate entries already queued but not yet started', async () => {
    // Use a load that never resolves so processNext stays blocked on the first item
    const loadImage = jest.fn().mockImplementation(() => new Promise<string | null>(() => {}));
    const { result, unmount } = renderHook(() => useImageQueue(loadImage));

    // Enqueue two different images — first starts loading, second sits in queue
    await act(async () => {
      result.current.enqueue([makeAttachment('q1'), makeAttachment('q2')]);
      await Promise.resolve();
    });

    // Enqueue q2 again — should be skipped because it's already in the queue
    await act(async () => {
      result.current.enqueue([makeAttachment('q2')]);
      await Promise.resolve();
    });

    // loadImage should only have been called once (for q1)
    expect(loadImage).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('serializes materialization across separate carousel queues', async () => {
    let releaseFirst: (value: string) => void;
    const firstLoad = jest
      .fn()
      .mockImplementation(() => new Promise<string>((resolve) => (releaseFirst = resolve)));
    const secondLoad = jest.fn().mockResolvedValue('data:second');
    const first = renderHook(() => useImageQueue(firstLoad));
    const second = renderHook(() => useImageQueue(secondLoad));

    await act(async () => {
      first.result.current.enqueue([makeAttachment('plain')]);
      second.result.current.enqueue([makeAttachment('encrypted')]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(firstLoad).toHaveBeenCalledTimes(1);
    expect(secondLoad).not.toHaveBeenCalled();

    await act(async () => {
      releaseFirst!('data:first');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(secondLoad).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
  });

  it('does not update state after unmount during enqueue callback', async () => {
    const loadImage = jest.fn().mockResolvedValue('data:abc');
    const { result, unmount } = renderHook(() => useImageQueue(loadImage));

    unmount();

    // Enqueue after unmount — InteractionManager callback fires but mountedRef is false
    await act(async () => {
      result.current.enqueue([makeAttachment('unmounted1')]);
      await Promise.resolve();
    });

    // loadImage should NOT have been called because enqueue bails when unmounted
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('does not update state when component unmounts before load resolves', async () => {
    let resolveLoad: (v: string | null) => void;
    const loadImage = jest
      .fn()
      .mockImplementation(() => new Promise<string | null>((resolve) => (resolveLoad = resolve)));
    const { result, unmount } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([makeAttachment('unmount1')]);
      await Promise.resolve();
    });

    // Unmount before the load resolves
    unmount();

    // Now resolve the load — should not update loadedImages since unmounted
    await act(async () => {
      resolveLoad!('data:unmounted');
      await Promise.resolve();
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(result.current.loadedImages).not.toHaveProperty('unmount1');
  });

  it('cancelAll marks pending entries as cancelled', async () => {
    // Use a load that never resolves until we say so
    const resolvers: Array<(v: string | null) => void> = [];
    const loadImage = jest
      .fn()
      .mockImplementation(() => new Promise<string | null>((resolve) => resolvers.push(resolve)));
    const { result } = renderHook(() => useImageQueue(loadImage));

    // Enqueue two images — only the first starts loading (MAX_CONCURRENT=1)
    await act(async () => {
      result.current.enqueue([makeAttachment('img1'), makeAttachment('img2')]);
      await Promise.resolve();
    });

    // Cancel all before the first load resolves
    act(() => {
      result.current.cancelAll();
    });

    // Resolve the in-flight load — should not update state since cancelled
    await act(async () => {
      resolvers[0]('data:abc');
      await Promise.resolve();
      await Promise.resolve();
      // processNext fires via setTimeout — it should encounter the cancelled img2 entry
      jest.runAllTimers();
      await Promise.resolve();
    });

    // img2 was still in queue when cancelled, so it should never load
    expect(result.current.loadedImages).not.toHaveProperty('img2');
  });

  it('releases materialized display leases when sources are replaced', async () => {
    const release = jest.fn();
    const lease = { uri: 'file:///cache/image', release };
    const loadImage = jest.fn().mockResolvedValue(lease);
    const { result } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([makeAttachment('img1')]);
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => result.current.cancelAll());
    expect(release).toHaveBeenCalledTimes(1);
    expect(result.current.loadedImages).toEqual({});
  });

  it('does not mark a null materialization as loaded or failed', async () => {
    const loadImage = jest.fn().mockResolvedValue(null);
    const { result } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([makeAttachment('empty')]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loadedImages).toEqual({});
    expect(result.current.failedImages).toEqual({});
    expect(result.current.loadingImages).toEqual({ empty: false });
  });

  it('releases a late materialized lease after cancellation and ignores retries for loaded work', async () => {
    let resolveLoad!: (value: { uri: string; release(): void }) => void;
    const release = jest.fn();
    const attachment = makeAttachment('late-lease');
    const loadImage = jest.fn(
      () => new Promise<{ uri: string; release(): void }>((resolve) => (resolveLoad = resolve)),
    );
    const { result } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([attachment]);
      await Promise.resolve();
    });
    act(() => result.current.cancelAll());
    await act(async () => {
      resolveLoad({ uri: 'file:///late', release });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(release).toHaveBeenCalledTimes(1);

    const loaded = renderHook(() => useImageQueue(jest.fn().mockResolvedValue('data:loaded')));
    await act(async () => {
      loaded.result.current.enqueue([attachment]);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      loaded.result.current.retry(attachment);
      await Promise.resolve();
    });
    expect(loaded.result.current.loadedImages).toHaveProperty('late-lease');
  });

  it('prioritizes a queued attachment without duplicating active work', async () => {
    let resolveFirst!: (value: string) => void;
    const loadImage = jest
      .fn()
      .mockImplementationOnce(() => new Promise<string>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce('data:third')
      .mockResolvedValueOnce('data:second');
    const first = makeAttachment('first');
    const second = makeAttachment('second');
    const third = makeAttachment('third');
    const { result } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([first, second, third]);
      await Promise.resolve();
    });
    result.current.prioritize(third);
    result.current.retry(first); // active entries must not be queued a second time

    await act(async () => {
      resolveFirst('data:first');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await jest.runOnlyPendingTimersAsync();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadImage.mock.calls.map(([attachment]) => attachment.id)).toEqual(['first', 'third']);
  });

  it('ignores a rejection that arrives after its active materialization was cancelled', async () => {
    let rejectLoad!: (error: Error) => void;
    const attachment = makeAttachment('cancelled-rejection');
    const loadImage = jest.fn(
      () => new Promise<string>((_resolve, reject) => (rejectLoad = reject)),
    );
    const { result } = renderHook(() => useImageQueue(loadImage));

    await act(async () => {
      result.current.enqueue([attachment]);
      await Promise.resolve();
    });
    act(() => result.current.cancelAll());
    await act(async () => {
      rejectLoad(new Error('cancelled source'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.failedImages).toEqual({});
  });
});

describe('enqueueThumbnail', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls load and resolves via onLoaded', async () => {
    const data = 'data:thumb';
    const load = jest.fn().mockResolvedValue(data);
    const onLoaded = jest.fn();

    enqueueThumbnail('t1', load, onLoaded);
    await Promise.resolve();
    await Promise.resolve();

    expect(load).toHaveBeenCalled();
    expect(onLoaded).toHaveBeenCalledWith(data);

    // Drain the finally setTimeout
    await Promise.resolve();
    jest.runAllTimers();
    await Promise.resolve();
  });

  it('cancel prevents onLoaded from being called', async () => {
    let resolveLoad: (v: string | null) => void;
    const load = jest
      .fn()
      .mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)));
    const onLoaded = jest.fn();

    const cancel = enqueueThumbnail('t2', load, onLoaded);
    cancel();

    // Even after resolving, onLoaded should not be called
    await act(async () => {
      resolveLoad!('data');
      await Promise.resolve();
    });

    expect(onLoaded).not.toHaveBeenCalled();

    // Drain the finally setTimeout
    await Promise.resolve();
    jest.runAllTimers();
    await Promise.resolve();
  });

  it('serialises concurrent thumbnail loads (thumbnailActive guard)', async () => {
    // First thumbnail — block it so thumbnailActive stays true
    let resolveFirst: (v: string | null) => void;
    const load1 = jest
      .fn()
      .mockImplementation(() => new Promise<string | null>((resolve) => (resolveFirst = resolve)));
    const onLoaded1 = jest.fn();

    enqueueThumbnail('s1', load1, onLoaded1);
    // Flush microtasks for InteractionManager + processThumbnailQueue
    await Promise.resolve();
    await Promise.resolve();

    // Second thumbnail — should be queued, not started because first is active
    const load2 = jest.fn().mockResolvedValue('thumb2');
    const onLoaded2 = jest.fn();
    enqueueThumbnail('s2', load2, onLoaded2);
    await Promise.resolve();
    await Promise.resolve();

    expect(load1).toHaveBeenCalled();
    expect(load2).not.toHaveBeenCalled();

    // Resolve first thumbnail
    resolveFirst!('thumb1');
    // Flush the .then/.finally chain
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // Now the setTimeout(processThumbnailQueue, 0) fires
    jest.runAllTimers();
    // Flush the second load's promise chain
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onLoaded1).toHaveBeenCalledWith('thumb1');
    expect(load2).toHaveBeenCalled();
    expect(onLoaded2).toHaveBeenCalledWith('thumb2');

    // Drain: let the second task's finally run
    await Promise.resolve();
    await Promise.resolve();
    jest.runAllTimers();
    await Promise.resolve();
  });

  it('handles load failure by resolving null', async () => {
    const load = jest.fn().mockRejectedValue(new Error('oops'));
    const onLoaded = jest.fn();

    enqueueThumbnail('t3', load, onLoaded);
    // Flush InteractionManager + processThumbnailQueue + catch chain
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onLoaded).toHaveBeenCalledWith(null);

    // Drain the finally setTimeout
    jest.runAllTimers();
    await Promise.resolve();
  });

  it('does not begin a thumbnail task cancelled before interaction work runs', async () => {
    const runAfterInteractions = jest.spyOn(InteractionManager, 'runAfterInteractions');
    let start!: () => void;
    runAfterInteractions.mockImplementationOnce((callback) => {
      start = callback as () => void;
      return { cancel: jest.fn(), then: jest.fn() } as never;
    });
    const load = jest.fn().mockResolvedValue('data:thumbnail');
    const onLoaded = jest.fn();

    const cancel = enqueueThumbnail('cancel-before-start', load, onLoaded);
    cancel();
    start();
    await Promise.resolve();

    expect(load).not.toHaveBeenCalled();
    expect(onLoaded).not.toHaveBeenCalled();
  });
});
