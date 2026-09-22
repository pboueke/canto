import { useEffect, useState } from 'react';
import { useJournalKeys, type KeyLease } from '@/contexts/JournalKeyContext';

/**
 * Testable state seam that lets a mounted editor observe its own write
 * capability. An auto-lock (clearKey/clearAll) revokes the lease before key
 * material is zeroed, so the editor can return to its locked state instead of
 * writing with a zeroed key.
 *
 * `locked` is true whenever no lease is bound to the journal's current key
 * epoch — including before the journal has ever been unlocked.
 */
export function useKeyLease(journalId?: string | null): {
  locked: boolean;
  lease: KeyLease | null;
} {
  const { createLease, getKey, isLeaseValid, onJournalLocked } = useJournalKeys();
  const [epoch, setEpoch] = useState<number | null>(null);

  useEffect(() => {
    if (!journalId || !getKey(journalId)) {
      setEpoch(null);
      return;
    }
    const lease = createLease(journalId);
    setEpoch(lease.epoch);
    return onJournalLocked(journalId, () => {
      setEpoch(null);
    });
  }, [journalId, createLease, getKey, onJournalLocked]);

  const lease: KeyLease | null = epoch === null || !journalId ? null : { journalId, epoch };
  const locked = !lease || !isLeaseValid(lease);
  return { locked, lease };
}
