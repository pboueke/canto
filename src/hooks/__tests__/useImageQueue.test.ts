import { renderHook, act } from '@testing-library/react-native';
import { InteractionManager } from 'react-native';
import { useImageQueue, enqueueThumbnail } from '../useImageQueue';
import type { Attachment } from '@/models';

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
    const { result } = renderHook(() => useImageQueue(loadImage));
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

    expect(loadImage).toHaveBeenCalledWith('attachments/img1.jpg');
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
    });

    // img2 was still in queue when cancelled, so it should never load
    expect(result.current.loadedImages).not.toHaveProperty('img2');
  });
});

describe('enqueueThumbnail', () => {
  it('calls load and resolves via onLoaded', async () => {
    const data = 'data:thumb';
    const load = jest.fn().mockResolvedValue(data);
    const onLoaded = jest.fn();

    enqueueThumbnail('t1', load, onLoaded);
    await Promise.resolve();
    await Promise.resolve();

    expect(load).toHaveBeenCalled();
    expect(onLoaded).toHaveBeenCalledWith(data);
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
  });

  it('handles load failure by resolving null', async () => {
    const load = jest.fn().mockRejectedValue(new Error('oops'));
    const onLoaded = jest.fn();

    enqueueThumbnail('t3', load, onLoaded);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onLoaded).toHaveBeenCalledWith(null);
  });
});
