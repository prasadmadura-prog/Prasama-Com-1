
import { db } from './firebase';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  getDocs,
  enableIndexedDbPersistence,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  getDocsFromCache,
  getDocsFromServer,
  startAfter
} from 'firebase/firestore';

export const collections = {
  products: 'p_v16_products',
  transactions: 'p_v16_transactions',
  customers: 'p_v16_customers',
  vendors: 'p_v16_vendors',
  accounts: 'p_v16_accounts',
  categories: 'p_v16_categories',
  daySessions: 'p_v16_daySessions',
  recurringExpenses: 'p_v16_recurringExpenses',
  purchaseOrders: 'p_v16_purchaseOrders',
  quotations: 'p_v16_quotations',
  profile: 'p_v16_profile',
  users: 'p_v16_users',
  chequeHistory: 'p_v16_chequeHistory',
  futureCheques: 'p_v16_futureCheques',
  fixedAssets: 'p_v16_fixedAssets'
};

const safeNum = (val: any, fallback = 0): number => {
  const n = parseFloat(val);
  return isNaN(n) || !isFinite(n) ? fallback : n;
};

/**
 * Preservation-focused branch normalization.
 */
const normalizeBranch = (bId: any): string => {
  const s = String(bId || '').trim();
  if (!s || s === 'undefined' || s === 'null') {
    return 'Main Branch';
  }
  return s;
};

const sanitizeId = (id: any): string => {
  if (!id) return `ID-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  // Allow simpler IDs for Firestore but keep sanitization if needed
  return String(id).trim().replace(/[/.\s#$\[\]]/g, '_');
};

// --- LEGACY LOCAL STORAGE HELPERS (For Migration Only) ---
const getLocalRaw = (col: string): any[] => {
  try {
    const data = localStorage.getItem(col);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

/**
 * Uploads all local data collections to Firestore.
 * Each collection is uploaded to a Firestore collection with the same name.
 * Useful for initial migration.
 */
export async function uploadAllLocalDataToFirestore() {
  const collectionKeys = Object.values(collections);
  let totalUploaded = 0;

  for (const col of collectionKeys) {
    const dataArr = getLocalRaw(col);
    if (Array.isArray(dataArr) && dataArr.length > 0) {
      // Batch writes for better performance (chunks of 500)
      const chunkSize = 400;
      for (let i = 0; i < dataArr.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = dataArr.slice(i, i + chunkSize);

        chunk.forEach(item => {
          const docRef = doc(db, col, String(item.id || sanitizeId(item.sku)));
          batch.set(docRef, item, { merge: true });
        });

        await batch.commit();
        totalUploaded += chunk.length;
        console.log(`Uploaded ${chunk.length} items to ${col}`);
      }
    }
  }
  console.log(`Total items uploaded: ${totalUploaded}`);
}

// --- FIRESTORE REAL-TIME IMPLEMENTATION ---

/**
 * Helper to select only specified fields from document data (simulated client-side projection).
 */
export function selectFields(data: any, fields: string[]): any {
  if (!fields || fields.length === 0) return data;
  const projected: any = { id: data.id };
  fields.forEach(f => {
    if (f in data) {
      projected[f] = data[f];
    }
  });
  return projected;
}

export function subscribeToCollection(
  collectionName: string, 
  callback: (data: any[]) => void,
  fields?: string[]
) {
  // Listen to the entire collection
  const q = query(collection(db, collectionName));

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const data: any[] = [];
    querySnapshot.forEach((doc) => {
      const docData = { ...doc.data(), id: doc.id };
      data.push(fields ? selectFields(docData, fields) : docData);
    });
    callback(data);
  }, (error) => {
    console.error(`Error subscribing to ${collectionName}:`, error);
    callback([]);
  });

  return unsubscribe;
}

export function subscribeToCollectionWithLimit(
  collectionName: string,
  limitCount: number,
  orderByField: string,
  callback: (data: any[]) => void,
  fields?: string[]
) {
  const q = query(
    collection(db, collectionName),
    firestoreOrderBy(orderByField, 'desc'),
    firestoreLimit(limitCount)
  );

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const data: any[] = [];
    querySnapshot.forEach((doc) => {
      const docData = { ...doc.data(), id: doc.id };
      data.push(fields ? selectFields(docData, fields) : docData);
    });
    callback(data);
  }, (error) => {
    console.error(`Error subscribing to ${collectionName} with limit ${limitCount}:`, error);
    callback([]);
  });

  return unsubscribe;
}

export async function getDocsFromCacheOrServer(
  collectionName: string, 
  limitCount?: number, 
  orderByField?: string,
  fields?: string[]
) {
  let q = query(collection(db, collectionName));
  if (orderByField) {
    q = query(q, firestoreOrderBy(orderByField, 'desc'));
  }
  if (limitCount) {
    q = query(q, firestoreLimit(limitCount));
  }

  try {
    const snapshot = await getDocsFromCache(q);
    if (!snapshot.empty) {
      console.log(`Retrieved ${snapshot.size} docs from cache for ${collectionName}`);
      return snapshot.docs.map(doc => {
        const docData = { ...doc.data(), id: doc.id };
        return fields ? selectFields(docData, fields) : docData;
      });
    }
  } catch (e) {
    console.warn(`Cache query failed/empty for ${collectionName}, falling back to server:`, e);
  }

  const snapshot = await getDocsFromServer(q);
  return snapshot.docs.map(doc => {
    const docData = { ...doc.data(), id: doc.id };
    return fields ? selectFields(docData, fields) : docData;
  });
}

export function subscribeToDocument(collectionName: string, docId: string, callback: (data: any) => void) {
  const docRef = doc(db, collectionName, docId);
  const unsubscribe = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ ...docSnap.data(), id: docSnap.id });
    } else {
      // Document doesn't exist
      callback(null);
    }
  }, (error) => {
    console.error(`Error subscribing to doc ${collectionName}/${docId}:`, error);
  });
  return unsubscribe;
}

export async function upsertDocument(collectionName: string, docId: string, data: any) {
  const safeId = sanitizeId(docId);
  const docRef = doc(db, collectionName, safeId);

  const rawItem = {
    ...data,
    id: safeId,
    updatedAt: new Date().toISOString()
  };

  // FIX: Remove undefined values which cause Firestore errors
  const item = JSON.parse(JSON.stringify(rawItem));

  if (item.branchId) item.branchId = normalizeBranch(item.branchId);

  try {
    await setDoc(docRef, item, { merge: true });
  } catch (e) {
    console.error(`Error upserting document to ${collectionName}/${safeId}:`, e);
    throw e;
  }
}

export async function bulkUpsert(collectionName: string, items: any[]) {
  if (!items || !items.length) return;

  // Create a Map to deduplicate items by ID before batching
  // This logic mimics the original cleanup logic
  const itemMap = new Map();

  items.forEach(item => {
    let normalized: any = { ...item };
    if (collectionName === collections.products) {
      normalized = {
        ...item,
        name: (item.name || 'UNNAMED').toString().toUpperCase(),
        sku: (item.sku || item.id || `SKU-${Math.random()}`).toString().toUpperCase(),
        price: safeNum(item.price),
        cost: safeNum(item.cost),
        stock: safeNum(item.stock),
        categoryId: item.categoryId || 'UNGROUPED'
      };
    } else if (collectionName === collections.transactions) {
      normalized = {
        ...item,
        amount: safeNum(item.amount || item.total || 0),
        date: item.date || new Date().toISOString(),
        type: (item.type || 'SALE').toString().toUpperCase(),
        branchId: normalizeBranch(item.branchId || item.branch)
      };
    }

    const safeId = item.id ? sanitizeId(item.id) : sanitizeId(normalized.sku || normalized.date + Math.random());
    itemMap.set(safeId, { ...normalized, id: safeId, updatedAt: new Date().toISOString() });
  });

  const uniqueItems = Array.from(itemMap.values());
  const batchSize = 400; // Limit is 500, keeping safe margin

  for (let i = 0; i < uniqueItems.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = uniqueItems.slice(i, i + batchSize);

    chunk.forEach((item: any) => {
      const docRef = doc(db, collectionName, item.id);
      batch.set(docRef, item, { merge: true });
    });

    try {
      await batch.commit();
    } catch (e) {
      console.error("Error in bulk upsert batch:", e);
    }
  }
}

export async function deleteDocument(collectionName: string, docId: string) {
  try {
    await deleteDoc(doc(db, collectionName, docId));
  } catch (e) {
    console.error("Error deleting document:", e);
  }
}
