
/**
 * PRASAMA LOCAL LEDGER ENGINE v9.0
 * Pure Local Persistence - Zero Cloud Dependencies
 */

export const collections = {
  products: 'p_v9_products',
  transactions: 'p_v9_transactions',
  customers: 'p_v9_customers',
  vendors: 'p_v9_vendors',
  accounts: 'p_v9_accounts',
  categories: 'p_v9_categories',
  daySessions: 'p_v9_daySessions',
  recurringExpenses: 'p_v9_recurringExpenses',
  purchaseOrders: 'p_v9_purchaseOrders',
  quotations: 'p_v9_quotations',
  profile: 'p_v9_profile'
};

const DB_EVENT = 'prasama_db_update';

const notifyUpdate = (collectionName: string) => {
  window.dispatchEvent(new CustomEvent(DB_EVENT, { detail: { collection: collectionName } }));
};

const safeNum = (val: any, fallback = 0): number => {
  const n = parseFloat(val);
  return isNaN(n) || !isFinite(n) ? fallback : n;
};

const sanitizeId = (id: any): string => {
  if (!id) return `ID-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  return String(id).trim().replace(/[/.\s#$\[\]]/g, '_');
};

const getRaw = (col: string): any[] => {
  try {
    const data = localStorage.getItem(col);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

const saveRaw = (col: string, data: any[]) => {
  localStorage.setItem(col, JSON.stringify(data));
  notifyUpdate(col);
};

export function subscribeToCollection(collectionName: string, callback: (data: any[]) => void) {
  // Initial Load
  callback(getRaw(collectionName));

  // Listener for updates
  const handleUpdate = (e: any) => {
    if (e.detail.collection === collectionName) {
      callback(getRaw(collectionName));
    }
  };

  window.addEventListener(DB_EVENT, handleUpdate);
  return () => window.removeEventListener(DB_EVENT, handleUpdate);
}

export function subscribeToDocument(collectionName: string, docId: string, callback: (data: any) => void) {
  const findAndCallback = () => {
    const data = getRaw(collectionName);
    const item = data.find((i: any) => i.id === docId);
    if (item) callback(item);
  };

  findAndCallback();

  const handleUpdate = (e: any) => {
    if (e.detail.collection === collectionName) {
      findAndCallback();
    }
  };

  window.addEventListener(DB_EVENT, handleUpdate);
  return () => window.removeEventListener(DB_EVENT, handleUpdate);
}

export async function upsertDocument(collectionName: string, docId: string, data: any) {
  const items = getRaw(collectionName);
  const safeId = sanitizeId(docId);
  const index = items.findIndex((i: any) => i.id === safeId);
  
  const newItem = {
    ...data,
    id: safeId,
    updatedAt: new Date().toISOString()
  };

  if (index >= 0) {
    items[index] = { ...items[index], ...newItem };
  } else {
    items.push(newItem);
  }

  saveRaw(collectionName, items);
}

export async function bulkUpsert(collectionName: string, items: any[]) {
  if (!items || !items.length) return;

  const currentItems = getRaw(collectionName);
  const itemMap = new Map(currentItems.map((i: any) => [i.id, i]));

  items.forEach(item => {
    let normalized: any = { ...item };

    // V9.0 Resilient Mapping Engine
    if (collectionName === collections.products) {
      normalized = {
        ...item,
        name: (item.name || 'UNNAMED').toString().toUpperCase(),
        sku: (item.sku || item.id || `SKU-${Math.random()}`).toString().toUpperCase(),
        price: safeNum(item.price),
        cost: safeNum(item.cost),
        stock: safeNum(item.stock !== undefined ? item.stock : item.qty),
        categoryId: item.categoryId || 'UNGROUPED'
      };
    } else if (collectionName === collections.transactions) {
      normalized = {
        ...item,
        amount: safeNum(item.amount || item.total),
        date: item.date || new Date().toISOString(),
        type: (item.type || 'SALE').toString().toUpperCase()
      };
    }

    const safeId = sanitizeId(item.id || normalized.sku || item.date);
    itemMap.set(safeId, { ...itemMap.get(safeId), ...normalized, id: safeId, updatedAt: new Date().toISOString() });
  });

  saveRaw(collectionName, Array.from(itemMap.values()));
}

export async function deleteDocument(collectionName: string, docId: string) {
  const items = getRaw(collectionName);
  const filtered = items.filter((i: any) => i.id !== docId);
  saveRaw(collectionName, filtered);
}
