import NetInfo from '@react-native-community/netinfo';
import { Mutation, SyncResult, SyncStatus } from '../types';
import {
  getPendingMutations,
  markAssignmentsSynced,
  removeMutations,
} from './storage';

/**
 * Optional Supabase REST endpoint configuration.
 * Toggle ENABLED to true when pointing to a live Supabase backend.
 */
export const CLOUD_SYNC_CONFIG = {
  ENABLED: false,
  SUPABASE_URL: 'https://your-project.supabase.co/rest/v1',
  SUPABASE_ANON_KEY: 'your-anon-key',
};

type SyncListener = (status: SyncStatus) => void;

class SyncEngine {
  private currentStatus: SyncStatus = 'idle';
  private listeners: Set<SyncListener> = new Set();
  private isProcessing = false;
  private lastSyncedAt: number | null = null;
  private unsubscribeNetInfo: (() => void) | null = null;

  /**
   * Returns current sync status.
   */
  public getStatus(): SyncStatus {
    return this.currentStatus;
  }

  /**
   * Returns timestamp of the last successful sync.
   */
  public getLastSyncedAt(): number | null {
    return this.lastSyncedAt;
  }

  /**
   * Subscribes a listener to sync status transitions.
   */
  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Updates internal sync status and notifies active subscribers.
   */
  private setStatus(status: SyncStatus): void {
    this.currentStatus = status;
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    });
  }

  /**
   * Checks whether the device currently has active internet connectivity.
   */
  public async isConnectedToInternet(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return Boolean(
        state.isConnected &&
          (state.isInternetReachable === null || state.isInternetReachable)
      );
    } catch (error) {
      console.error('Error checking internet connectivity:', error);
      return false;
    }
  }

  /**
   * Sends a single mutation to the cloud backend.
   * If CLOUD_SYNC_CONFIG.ENABLED is false, performs a simulated network request.
   */
  private async sendMutationToCloud(mutation: Mutation): Promise<boolean> {
    if (CLOUD_SYNC_CONFIG.ENABLED) {
      // Production Supabase REST endpoint integration
      const table = mutation.entity === 'assignment' ? 'assignments' : 'modules';
      const endpoint = `${CLOUD_SYNC_CONFIG.SUPABASE_URL}/${table}`;

      let method = 'POST';
      let url = endpoint;
      let body: string | undefined = JSON.stringify(mutation.data);

      if (mutation.type === 'UPDATE') {
        method = 'PATCH';
        const entityId =
          typeof mutation.data === 'object' && mutation.data !== null && 'id' in mutation.data
            ? (mutation.data as { id: string }).id
            : '';
        url = `${endpoint}?id=eq.${entityId}`;
      } else if (mutation.type === 'DELETE') {
        method = 'DELETE';
        const entityId =
          typeof mutation.data === 'object' && mutation.data !== null && 'id' in mutation.data
            ? (mutation.data as { id: string }).id
            : '';
        url = `${endpoint}?id=eq.${entityId}`;
        body = undefined;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          apikey: CLOUD_SYNC_CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${CLOUD_SYNC_CONFIG.SUPABASE_ANON_KEY}`,
          Prefer: 'return=minimal',
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`Cloud sync error (${response.status}): ${await response.text()}`);
      }

      return true;
    }

    // Offline-first simulation: simulate realistic network latency (150ms)
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (!mutation.id || !mutation.type || !mutation.entity) {
      throw new Error(`Invalid mutation payload: ${mutation.id}`);
    }

    return true;
  }

  /**
   * Reads pending mutations from the outbox queue in AsyncStorage,
   * sends them to the cloud API, marks local items as isSynced = true,
   * and removes processed mutations from the outbox queue.
   */
  public async syncPendingData(): Promise<SyncResult> {
    if (this.isProcessing) {
      return {
        success: false,
        syncedCount: 0,
        errors: ['Sync already in progress'],
        timestamp: Date.now(),
      };
    }

    // 1. Check network connectivity with NetInfo
    const isOnline = await this.isConnectedToInternet();
    if (!isOnline) {
      this.setStatus('idle');
      return {
        success: false,
        syncedCount: 0,
        errors: ['Device is offline. Sync deferred.'],
        timestamp: Date.now(),
      };
    }

    this.isProcessing = true;
    this.setStatus('syncing');

    try {
      // 2. Read pending mutations from outbox queue
      const pendingMutations = await getPendingMutations();

      if (pendingMutations.length === 0) {
        this.setStatus('synced');
        this.lastSyncedAt = Date.now();
        this.isProcessing = false;
        return {
          success: true,
          syncedCount: 0,
          timestamp: Date.now(),
        };
      }

      const syncedMutationIds: string[] = [];
      const syncedAssignmentIds: string[] = [];
      const errors: string[] = [];

      // 3. Process each mutation
      for (const mutation of pendingMutations) {
        try {
          const success = await this.sendMutationToCloud(mutation);
          if (success) {
            syncedMutationIds.push(mutation.id);

            // Collect assignment IDs to mark as synced
            if (
              mutation.entity === 'assignment' &&
              mutation.data &&
              typeof mutation.data === 'object' &&
              'id' in mutation.data &&
              typeof (mutation.data as { id: unknown }).id === 'string'
            ) {
              syncedAssignmentIds.push((mutation.data as { id: string }).id);
            }
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown mutation error';
          errors.push(`Mutation ${mutation.id}: ${message}`);
        }
      }

      // 4. Mark local items as isSynced = true in local storage
      if (syncedAssignmentIds.length > 0) {
        await markAssignmentsSynced(syncedAssignmentIds);
      }

      // 5. Remove processed mutations from outbox queue
      if (syncedMutationIds.length > 0) {
        await removeMutations(syncedMutationIds);
      }

      const isAllSuccess = errors.length === 0;
      this.setStatus(isAllSuccess ? 'synced' : 'error');
      if (isAllSuccess) {
        this.lastSyncedAt = Date.now();
      }

      return {
        success: isAllSuccess,
        syncedCount: syncedMutationIds.length,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: Date.now(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      this.setStatus('error');
      return {
        success: false,
        syncedCount: 0,
        errors: [message],
        timestamp: Date.now(),
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Starts auto-syncing when connectivity is regained.
   */
  public startAutoSync(): () => void {
    if (this.unsubscribeNetInfo) {
      return this.unsubscribeNetInfo;
    }

    let wasOffline = false;

    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const isOnline = Boolean(
        state.isConnected &&
          (state.isInternetReachable === null || state.isInternetReachable)
      );

      if (isOnline) {
        if (wasOffline) {
          this.syncPendingData().catch((err) => {
            console.error('Auto sync on reconnection failed:', err);
          });
        }
        wasOffline = false;
      } else {
        wasOffline = true;
      }
    });

    return () => {
      if (this.unsubscribeNetInfo) {
        this.unsubscribeNetInfo();
        this.unsubscribeNetInfo = null;
      }
    };
  }
}

export const syncEngine = new SyncEngine();

/**
 * Convenience helper to directly trigger synchronization of pending outbox data.
 */
export async function syncPendingData(): Promise<SyncResult> {
  return syncEngine.syncPendingData();
}
