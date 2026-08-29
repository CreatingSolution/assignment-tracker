import { useCallback, useEffect, useState } from 'react';
import { getPendingMutations } from '../services/storage';
import { syncEngine } from '../services/syncEngine';
import { SyncResult, SyncStatus } from '../types';

export interface UseSyncReturn {
  syncStatus: SyncStatus;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: number | null;
  syncNow: () => Promise<SyncResult>;
  refreshPendingCount: () => Promise<number>;
}

export function useSync(): UseSyncReturn {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    syncEngine.getStatus()
  );
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(
    syncEngine.getLastSyncedAt()
  );

  const refreshPendingCount = useCallback(async (): Promise<number> => {
    try {
      const pending = await getPendingMutations();
      setPendingCount(pending.length);
      return pending.length;
    } catch {
      return 0;
    }
  }, []);

  useEffect(() => {
    // Initial fetch of pending mutations count
    refreshPendingCount();

    // Start auto sync on network reconnect
    const stopAutoSync = syncEngine.startAutoSync();

    // Subscribe to sync status transitions
    const unsubscribeSync = syncEngine.subscribe((status) => {
      setSyncStatus(status);
      setLastSyncedAt(syncEngine.getLastSyncedAt());
      refreshPendingCount();
    });

    return () => {
      stopAutoSync();
      unsubscribeSync();
    };
  }, [refreshPendingCount]);

  const syncNow = useCallback(async (): Promise<SyncResult> => {
    const result = await syncEngine.syncPendingData();
    await refreshPendingCount();
    return result;
  }, [refreshPendingCount]);

  return {
    syncStatus,
    isSyncing: syncStatus === 'syncing',
    pendingCount,
    lastSyncedAt,
    syncNow,
    refreshPendingCount,
  };
}
