import { generateThumbnail, generateThumbnailFromChunks } from '../thumbnail.web';

class SuccessfulImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 240;
  naturalHeight = 120;
  width = 0;
  height = 0;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

class FailedImage extends SuccessfulImage {
  override set src(_value: string) {
    queueMicrotask(() => this.onerror?.());
  }
}

describe('web thumbnails', () => {
  const originalImage = globalThis.Image;
  const originalDocument = globalThis.document;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: SuccessfulImage });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: jest.fn() },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: originalImage });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });

  it('downscales browser images and returns their encoded payload', async () => {
    const drawImage = jest.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL: () => 'data:image/jpeg;base64,dGh1bWJuYWls',
    };
    jest.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);

    await expect(generateThumbnail('aW1hZ2U=')).resolves.toBe('dGh1bWJuYWls');
    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(60);
    expect(drawImage).toHaveBeenCalledWith(expect.any(SuccessfulImage), 0, 0, 120, 60);
  });

  it('uses an object URL for chunked sources and always revokes it', async () => {
    const drawImage = jest.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL: () => 'data:image/jpeg;base64,dGh1bWJuYWls',
    };
    const createObjectURL = jest.fn(() => 'blob:thumbnail');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    jest.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);

    async function* chunks() {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3]);
    }
    await expect(generateThumbnailFromChunks(chunks())).resolves.toBe('dGh1bWJuYWls');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:thumbnail');
  });

  it('rejects empty input, a missing canvas context, and oversized output', async () => {
    await expect(generateThumbnail('')).rejects.toThrow(
      'Browser thumbnail decoding is unavailable',
    );

    jest
      .spyOn(document, 'createElement')
      .mockReturnValue({ getContext: () => null } as unknown as HTMLCanvasElement);
    await expect(generateThumbnail('aW1hZ2U=')).rejects.toThrow(
      'Browser thumbnail canvas is unavailable',
    );

    jest.restoreAllMocks();
    jest.spyOn(document, 'createElement').mockReturnValue({
      getContext: () => ({ drawImage: jest.fn() }),
      toDataURL: () => `data:image/jpeg;base64,${'A'.repeat(180_000)}`,
    } as unknown as HTMLCanvasElement);
    await expect(generateThumbnail('aW1hZ2U=')).rejects.toThrow(
      'Generated thumbnail exceeds size limit',
    );
  });

  it('rejects decoder errors and unavailable browser APIs', async () => {
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: FailedImage });
    await expect(generateThumbnail('aW1hZ2U=')).rejects.toThrow('Image thumbnail decode failed');

    Object.defineProperty(globalThis, 'document', { configurable: true, value: undefined });
    await expect(generateThumbnail('aW1hZ2U=')).rejects.toThrow(
      'Browser thumbnail decoding is unavailable',
    );
    await expect(
      generateThumbnailFromChunks(
        (async function* () {
          yield new Uint8Array([1]);
        })(),
      ),
    ).rejects.toThrow('Browser thumbnail decoding is unavailable');
  });
});
