import { useCallback, useEffect, useState } from "react";
import { syncAudits } from "../api/audits";

const DB_NAME = "infecsure-offline";
const STORE = "audits";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "offline_record_id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll() {
  const db = await openDb();
  return new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearAll() {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function useOfflineSync() {
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    const records = await readAll();
    setOfflineCount(records.length);
  }, []);

  const saveOffline = useCallback(async (record: unknown) => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await refreshCount();
  }, [refreshCount]);

  const syncNow = useCallback(async () => {
    const records = await readAll();
    if (!records.length) return null;
    setSyncing(true);
    try {
      const result = await syncAudits(records);
      await clearAll();
      await refreshCount();
      return result;
    } finally {
      setSyncing(false);
    }
  }, [refreshCount]);

  useEffect(() => {
    refreshCount().catch(() => setOfflineCount(0));
    const onOnline = () => syncNow().catch(() => undefined);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refreshCount, syncNow]);

  return { offlineCount, syncing, saveOffline, syncNow };
}
