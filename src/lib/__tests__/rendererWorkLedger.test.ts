import { RendererWorkLedger } from '../sync/renderer-work-ledger';

describe('RendererWorkLedger', () => {
  it('accounts cumulative work for the lifetime of one renderer', () => {
    const ledger = new RendererWorkLedger({
      plaintextLimitBytes: 10,
      nativeAllocationLimitBytes: 60,
      nativeAllocationMultiplier: 6,
    });
    expect(ledger.reserve(6)).toBe(true);
    expect(ledger.reserve(4)).toBe(true);
    expect(ledger.requiresFreshRenderer).toBe(true);
  });

  it('blocks later work after a chunk cannot fit instead of issuing a fresh per-run budget', () => {
    const ledger = new RendererWorkLedger({
      plaintextLimitBytes: 10,
      nativeAllocationLimitBytes: 60,
      nativeAllocationMultiplier: 6,
    });
    expect(ledger.reserve(7)).toBe(true);
    expect(ledger.reserve(4)).toBe(false);
    expect(ledger.requiresFreshRenderer).toBe(true);
    expect(ledger.reserve(1)).toBe(false);
  });

  it('starts a fresh allowance in a new browser renderer', () => {
    const first = new RendererWorkLedger({
      plaintextLimitBytes: 10,
      nativeAllocationLimitBytes: 60,
    });
    expect(first.reserve(10)).toBe(true);
    expect(first.requiresFreshRenderer).toBe(true);

    const afterReload = new RendererWorkLedger({
      plaintextLimitBytes: 10,
      nativeAllocationLimitBytes: 60,
    });
    expect(afterReload.reserve(1)).toBe(true);
  });

  it('uses the native-allocation limit when it is reached before the plaintext limit', () => {
    const ledger = new RendererWorkLedger({
      plaintextLimitBytes: 100,
      nativeAllocationLimitBytes: 10,
      nativeAllocationMultiplier: 3,
    });

    expect(ledger.reserve(3)).toBe(true);
    expect(ledger.snapshot).toEqual({
      version: 1,
      plaintextBytes: 3,
      nativeAllocationBytes: 9,
      requiresFreshRenderer: false,
    });
    expect(ledger.reserve(1)).toBe(false);
    expect(ledger.snapshot.requiresFreshRenderer).toBe(true);
  });

  it('marks an exact native boundary as needing a fresh renderer', () => {
    const ledger = new RendererWorkLedger({
      plaintextLimitBytes: 100,
      nativeAllocationLimitBytes: 10,
      nativeAllocationMultiplier: 2.5,
    });

    expect(ledger.reserve(4)).toBe(true);
    expect(ledger.requiresFreshRenderer).toBe(true);
  });

  it('marks a ledger explicitly and does not mutate an already marked snapshot', () => {
    const ledger = new RendererWorkLedger({
      plaintextLimitBytes: 10,
      nativeAllocationLimitBytes: 60,
    });

    ledger.requireFreshRenderer();
    const marked = ledger.snapshot;
    ledger.requireFreshRenderer();

    expect(ledger.snapshot).toBe(marked);
    expect(ledger.reserve(1)).toBe(false);
  });

  it.each([
    [{ plaintextLimitBytes: 0 }],
    [{ plaintextLimitBytes: Number.NaN }],
    [{ nativeAllocationLimitBytes: 0 }],
    [{ nativeAllocationMultiplier: 0 }],
    [{ nativeAllocationMultiplier: Number.POSITIVE_INFINITY }],
  ])('rejects invalid limits: %o', (options) => {
    expect(() => new RendererWorkLedger(options)).toThrow(
      'Renderer work ledger limits must be positive',
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid reservation: %p',
    (bytes) => {
      const ledger = new RendererWorkLedger({
        plaintextLimitBytes: 10,
        nativeAllocationLimitBytes: 60,
      });

      expect(() => ledger.reserve(bytes)).toThrow(
        'Renderer work reservation must be a positive safe integer',
      );
    },
  );
});
