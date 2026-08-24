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
});
