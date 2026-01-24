
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  writeBatch,
  enableIndexedDbPersistence
} from "firebase/firestore";

/**
 * PRASAMA CLOUD LEDGER CORE v12.1
 * Live Firestore Implementation with Enhanced Normalization
 */

const firebaseConfig = {
  apiKey: "AIzaSyBaqtDnkyQVqOItmUTDOBvhOVtBDYRsOyQ",
  authDomain: "prasama-1984c.firebaseapp.com",
  projectId: "prasama-1984c",
  storageBucket: "prasama-1984c.firebasestorage.app",
  messagingSenderId: "703953550630",
  appId: "1:703953550630:web:ad3fc37647050a488515e7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Persistence failed: Multiple tabs open.");
    } else if (err.code === 'unimplemented') {
      console.warn("Persistence is not supported by this browser.");
    }
  });
} catch (e) {
  console.error("Firebase persistence error", e);
}

export const collections = {
  products: 'p_live_products',
  transactions: 'p_live_transactions',
  customers: 'p_live_customers',
  vendors: 'p_live_vendors',
  accounts: 'p_live_accounts',
  categories: 'p_live_categories',
  daySessions: 'p_live_daySessions',
  recurringExpenses: 'p_live_recurringExpenses',
  purchaseOrders: 'p_live_purchaseOrders',
  quotations: 'p_live_quotations',
  profile: 'p_live_profile'
};

const safeNum = (val: any, fallback = 0): number => {
  const n = parseFloat(val);
  return isNaN(n) || !isFinite(n) ? fallback : n;
};

const normalizeBranch = (bId: any): string => {
  const s = String(bId || '').trim();
  if (!s || s === 'Shop 1' || s === 'Local Node' || s === 'undefined' || s === 'null') {
    return 'Bookshop';
  }
  return s;
};

const sanitizeId = (id: any): string => {
  if (!id) return `ID-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  return String(id).trim().replace(/[/.\s#$\[\]]/g, '_');
};

export function subscribeToCollection(collectionName: string, callback: (data: any[]) => void) {
  const q = query(collection(db, collectionName));
  
  const cached = localStorage.getItem(`cache_${collectionName}`);
  if (cached) {
    try { callback(JSON.parse(cached)); } catch(e) {}
  }

  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(doc => {
      const data = doc.data();
      // Ensure branch normalization on the way IN from Firebase
      if (data.branchId) data.branchId = normalizeBranch(data.branchId);
      if (data.branch) data.branchId = normalizeBranch(data.branch);
      return { ...data, id: doc.id };
    });
    localStorage.setItem(`cache_${collectionName}`, JSON.stringify(items));
    callback(items);
  }, (err) => {
    console.error(`Live sync error for ${collectionName}:`, err);
  });
}

export function subscribeToDocument(collectionName: string, docId: string, callback: (data: any) => void) {
  const safeId = sanitizeId(docId);
  return onSnapshot(doc(db, collectionName, safeId), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      callback({ ...data, id: snapshot.id });
    }
  });
}

export async function upsertDocument(collectionName: string, docId: string, data: any) {
  const safeId = sanitizeId(docId);
  const docRef = doc(db, collectionName, safeId);
  
  const payload = {
    ...data,
    id: safeId,
    updatedAt: new Date().toISOString()
  };

  // Branch isolation
  if (payload.branchId) payload.branchId = normalizeBranch(payload.branchId);
  else if (payload.branch) payload.branchId = normalizeBranch(payload.branch);
  
  await setDoc(docRef, payload, { merge: true });
}

export async function bulkUpsert(collectionName: string, items: any[]) {
  if (!items || !items.length) return;
  const batch = writeBatch(db);

  items.forEach(item => {
    let normalized: any = { ...item };
    
    if (collectionName === collections.products) {
      const bStocks = item.branchStocks || {};
      const newBStocks: Record<string, number> = {};
      
      if (Object.keys(bStocks).length === 0 && Number(item.stock) > 0) {
        newBStocks['Bookshop'] = safeNum(item.stock);
      } else {
        Object.entries(bStocks).forEach(([key, val]) => {
          newBStocks[normalizeBranch(key)] = safeNum(val);
        });
      }

      normalized = {
        ...item,
        name: (item.name || 'UNNAMED').toString().toUpperCase(),
        sku: (item.sku || item.id || `SKU-${Math.random()}`).toString().toUpperCase(),
        price: safeNum(item.price),
        cost: safeNum(item.cost),
        branchStocks: newBStocks,
        stock: Object.values(newBStocks).reduce((a: number, b: number) => a + b, 0),
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

    const safeId = sanitizeId(item.id || normalized.sku || Date.now() + Math.random().toString());
    const docRef = doc(db, collectionName, safeId);
    batch.set(docRef, { ...normalized, id: safeId, updatedAt: new Date().toISOString() }, { merge: true });
  });

  await batch.commit();
}

export async function deleteDocument(collectionName: string, docId: string) {
  const safeId = sanitizeId(docId);
  await deleteDoc(doc(db, collectionName, safeId));
}
