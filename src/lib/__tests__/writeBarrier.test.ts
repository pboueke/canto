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
});
