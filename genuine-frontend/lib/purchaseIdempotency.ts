type StoredRequest = { signature: string; key: string };

function storageKey(scope: string) {
  return `genuine:purchase-retry:${scope}`;
}

function randomKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Keep the same key for an unchanged mutation until the server confirms success. */
export function purchaseRetryKey(scope: string, payload: unknown) {
  const signature = JSON.stringify(payload);
  const storage = storageKey(scope);
  try {
    const saved = sessionStorage.getItem(storage);
    if (saved) {
      const parsed = JSON.parse(saved) as StoredRequest;
      if (parsed.signature === signature && parsed.key) return parsed.key;
    }
    const key = randomKey();
    sessionStorage.setItem(storage, JSON.stringify({ signature, key } satisfies StoredRequest));
    return key;
  } catch {
    return randomKey();
  }
}

export function clearPurchaseRetryKey(scope: string) {
  try {
    sessionStorage.removeItem(storageKey(scope));
  } catch {
    // The backend still enforces idempotency for a key retained in memory.
  }
}
