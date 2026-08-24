/**
 * Chrome can retain WebCrypto and fetch allocations after their JavaScript
 * inputs are unreachable. This ledger deliberately accounts for cumulative
 * work in one JavaScript renderer lifetime; it is not a cache and never
 * refunds work. A browser reload starts a new renderer, releasing the native
 * allocations this guard is designed to bound.
 */
export const WEB_SYNC_PLAINTEXT_BUDGET_BYTES = 75 * 1024 * 1024;
export const WEB_SYNC_NATIVE_ALLOCATION_MULTIPLIER = 6;
export const WEB_SYNC_NATIVE_ALLOCATION_BUDGET_BYTES =
  WEB_SYNC_PLAINTEXT_BUDGET_BYTES * WEB_SYNC_NATIVE_ALLOCATION_MULTIPLIER;

export interface RendererWorkLedgerSnapshot {
  version: 1;
  plaintextBytes: number;
  nativeAllocationBytes: number;
  requiresFreshRenderer: boolean;
}

export interface RendererWorkLedgerOptions {
  plaintextLimitBytes?: number;
  nativeAllocationLimitBytes?: number;
  nativeAllocationMultiplier?: number;
}

function emptySnapshot(): RendererWorkLedgerSnapshot {
  return {
    version: 1,
    plaintextBytes: 0,
    nativeAllocationBytes: 0,
    requiresFreshRenderer: false,
  };
}

/**
 * Global-to-the-tab, append-only accounting for native-allocation-heavy sync
 * work. `reserve` accounts before the caller opens local content so a crash,
 * cancellation, or failure cannot make the same renderer appear unused.
 */
export class RendererWorkLedger {
  private readonly plaintextLimitBytes: number;
  private readonly nativeAllocationLimitBytes: number;
  private readonly nativeAllocationMultiplier: number;
  private snapshotValue: RendererWorkLedgerSnapshot;

  constructor(options: RendererWorkLedgerOptions = {}) {
    this.plaintextLimitBytes = options.plaintextLimitBytes ?? WEB_SYNC_PLAINTEXT_BUDGET_BYTES;
    this.nativeAllocationMultiplier =
      options.nativeAllocationMultiplier ?? WEB_SYNC_NATIVE_ALLOCATION_MULTIPLIER;
    this.nativeAllocationLimitBytes =
      options.nativeAllocationLimitBytes ?? WEB_SYNC_NATIVE_ALLOCATION_BUDGET_BYTES;
    if (
      !Number.isSafeInteger(this.plaintextLimitBytes) ||
      this.plaintextLimitBytes < 1 ||
      !Number.isFinite(this.nativeAllocationMultiplier) ||
      this.nativeAllocationMultiplier < 1 ||
      !Number.isSafeInteger(this.nativeAllocationLimitBytes) ||
      this.nativeAllocationLimitBytes < 1
    ) {
      throw new Error('Renderer work ledger limits must be positive');
    }
    this.snapshotValue = emptySnapshot();
  }

  get snapshot(): Readonly<RendererWorkLedgerSnapshot> {
    return this.snapshotValue;
  }

  get requiresFreshRenderer(): boolean {
    return this.snapshotValue.requiresFreshRenderer;
  }

  /** Reserve one exact descriptor-sized chunk before any local read or crypto work. */
  reserve(plaintextBytes: number): boolean {
    if (!Number.isSafeInteger(plaintextBytes) || plaintextBytes < 1) {
      throw new Error('Renderer work reservation must be a positive safe integer');
    }
    const nativeAllocationBytes = Math.ceil(plaintextBytes * this.nativeAllocationMultiplier);
    if (
      this.snapshotValue.requiresFreshRenderer ||
      this.snapshotValue.plaintextBytes + plaintextBytes > this.plaintextLimitBytes ||
      this.snapshotValue.nativeAllocationBytes + nativeAllocationBytes >
        this.nativeAllocationLimitBytes
    ) {
      this.persist({ ...this.snapshotValue, requiresFreshRenderer: true });
      return false;
    }
    this.persist({
      version: 1,
      plaintextBytes: this.snapshotValue.plaintextBytes + plaintextBytes,
      nativeAllocationBytes: this.snapshotValue.nativeAllocationBytes + nativeAllocationBytes,
      requiresFreshRenderer:
        this.snapshotValue.plaintextBytes + plaintextBytes === this.plaintextLimitBytes ||
        this.snapshotValue.nativeAllocationBytes + nativeAllocationBytes ===
          this.nativeAllocationLimitBytes,
    });
    return true;
  }

  /** Mark a budget boundary that could not admit its next missing chunk. */
  requireFreshRenderer(): void {
    if (!this.snapshotValue.requiresFreshRenderer) {
      this.persist({ ...this.snapshotValue, requiresFreshRenderer: true });
    }
  }

  private persist(next: RendererWorkLedgerSnapshot): void {
    this.snapshotValue = next;
  }
}
