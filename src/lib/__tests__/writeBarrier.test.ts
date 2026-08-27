import { serializeDeviceKeyWrites } from '../storage/write-barrier';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('device-key rotation read barrier', () => {
  it('waits for an active sync-style read and blocks later reads until rotation commits', async () => {
    const firstReadStarted = deferred();
    const releaseFirstRead = deferred();
    const rotationStarted = deferred();
    const releaseRotation = deferred();
    const getJournal = jest.fn(async (..._args: unknown[]) => {
      firstReadStarted.resolve();
      await releaseFirstRead.promise;
      return null;
    });
    const getPage = jest.fn(async (..._args: unknown[]) => null);
    const reencryptAll = jest.fn(async (..._args: unknown[]) => {
      rotationStarted.resolve();
      await releaseRotation.promise;
    });
    const store = { getJournal, getPage, reencryptAll };
    const guarded = serializeDeviceKeyWrites(store);

    const activeRead = guarded.getJournal('journal-1');
    await firstReadStarted.promise;
    const rotation = guarded.reencryptAll(
      async () => '',
      async () => '',
      async () => '',
    );

    // The rotation cannot scan/replace ciphertext while the sync read is live.
    await Promise.resolve();
    expect(reencryptAll).toHaveBeenCalledTimes(0);

    releaseFirstRead.resolve();
    await activeRead;
    await rotationStarted.promise;

    // Reads started after the rotation begins wait for the committed view,
    // preventing native or IndexedDB sync from observing a mixed key state.
    const lateRead = guarded.getPage('journal-1', 'page-1');
    await Promise.resolve();
    expect(getPage).not.toHaveBeenCalled();

    releaseRotation.resolve();
    await rotation;
    await lateRead;
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  it('treats a newly added unclassified method as a writer by default', async () => {
    const rotationStarted = deferred();
    const releaseRotation = deferred();
    const reencryptAll = jest.fn(async (..._args: unknown[]) => {
      rotationStarted.resolve();
      await releaseRotation.promise;
    });
    const futureMutator = jest.fn(async (..._args: unknown[]) => undefined);
    const guarded = serializeDeviceKeyWrites({ reencryptAll, futureMutator });

    const rotation = guarded.reencryptAll(
      async () => '',
      async () => '',
      async () => '',
    );
    await rotationStarted.promise;
    const write = guarded.futureMutator('new data');
    await Promise.resolve();
    expect(futureMutator).not.toHaveBeenCalled();

    releaseRotation.resolve();
    await rotation;
    await write;
    expect(futureMutator).toHaveBeenCalledWith('new data');
  });

  it('waits for an active writer and releases queued operations when rotation fails', async () => {
    const writeStarted = deferred();
    const releaseWrite = deferred();
    const rotationStarted = deferred();
    const write = jest.fn(async () => {
      writeStarted.resolve();
      await releaseWrite.promise;
    });
    const reencryptAll = jest.fn(async (..._args: unknown[]) => {
      rotationStarted.resolve();
      throw new Error('rotation failed');
    });
    const laterWrite = jest.fn(async () => 'written');
    const guarded = serializeDeviceKeyWrites({ write, laterWrite, reencryptAll });

    const activeWrite = guarded.write();
    await writeStarted.promise;
    const rotation = guarded.reencryptAll(
      async () => '',
      async () => '',
      async () => '',
    );
    await Promise.resolve();
    expect(reencryptAll).not.toHaveBeenCalled();

    releaseWrite.resolve();
    await activeWrite;
    await rotationStarted.promise;
    const queuedWrite = guarded.laterWrite();
    await expect(rotation).rejects.toThrow('rotation failed');

    await expect(queuedWrite).resolves.toBe('written');
    expect(laterWrite).toHaveBeenCalledTimes(1);
  });

  it('leaves non-function properties untouched and supports stores without rotation', async () => {
    const getAttachment = jest.fn(async (..._args: unknown[]) => 'attachment');
    const store = { getAttachment, version: 1 };

    const guarded = serializeDeviceKeyWrites(store);

    expect(guarded).toBe(store);
    expect(guarded.version).toBe(1);
    await expect(guarded.getAttachment('j', 'p', 'a')).resolves.toBe('attachment');
  });
});
