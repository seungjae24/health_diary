import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DB_NAME = 'health-diary-db';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

function openWebDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

async function getWebItem(key: string): Promise<string | null> {
  const db = await openWebDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to read from IndexedDB.'));
  });
}

async function setWebItem(key: string, value: string): Promise<void> {
  const db = await openWebDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to write to IndexedDB.'));
  });
}

async function removeWebItem(key: string): Promise<void> {
  const db = await openWebDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete from IndexedDB.'));
  });
}

async function getLegacyWebItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function removeLegacyWebItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Ignore legacy cleanup failures.
  }
}

export async function getPersistentItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web' && typeof indexedDB !== 'undefined') {
    const indexedDbValue = await getWebItem(key);
    if (indexedDbValue !== null) {
      return indexedDbValue;
    }

    const legacyValue = await getLegacyWebItem(key);
    if (legacyValue !== null) {
      await setWebItem(key, legacyValue);
      await removeLegacyWebItem(key);
    }

    return legacyValue;
  }

  return AsyncStorage.getItem(key);
}

export async function setPersistentItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web' && typeof indexedDB !== 'undefined') {
    return setWebItem(key, value);
  }

  return AsyncStorage.setItem(key, value);
}

export async function removePersistentItem(key: string): Promise<void> {
  if (Platform.OS === 'web' && typeof indexedDB !== 'undefined') {
    return removeWebItem(key);
  }

  return AsyncStorage.removeItem(key);
}
