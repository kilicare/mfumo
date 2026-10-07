import type { CreatePurchaseOrderInput } from '@/lib/api/purchases';

const DB_NAME = 'genuine-offline-work';
const DB_VERSION = 1;
const STORE = 'purchase-drafts';

export interface OfflinePurchaseDraft {
  id: string;
  userId: string;
  businessId: string;
  createdAt: number;
  input: CreatePurchaseOrderInput & { idempotencyKey: string };
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Offline storage is not available in this browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('owner', ['userId', 'businessId'], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
    request.onblocked = () => reject(new Error('Offline storage is busy in another tab. Close the other tab and retry.'));
  });
}

export async function saveOfflinePurchaseDraft(draft: OfflinePurchaseDraft) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not save this draft offline.'));
      tx.onabort = () => reject(tx.error || new Error('Offline draft save was cancelled.'));
    });
  } finally { db.close(); }
}

export async function listOfflinePurchaseDrafts(userId: string, businessId: string) {
  const db = await openDb();
  try {
    return await new Promise<OfflinePurchaseDraft[]>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).index('owner').getAll([userId, businessId]);
      request.onsuccess = () => resolve((request.result as OfflinePurchaseDraft[]).sort((a, b) => a.createdAt - b.createdAt));
      request.onerror = () => reject(request.error || new Error('Could not read offline drafts.'));
    });
  } finally { db.close(); }
}

export async function removeOfflinePurchaseDraft(id: string) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not remove the synced draft.'));
      tx.onabort = () => reject(tx.error || new Error('Could not remove the synced draft.'));
    });
  } finally { db.close(); }
}
