import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

// Simple Firestore importer for PRASAMA backup JSON
// Usage (Windows PowerShell):
//   setx GOOGLE_APPLICATION_CREDENTIALS "C:\\Users\\prasa\\Downloads\\prasama-1984c-firebase-adminsdk-fbsvc-78f2eaaa3a.json"
//   node scripts/import-backup.mjs --file "C:\\Users\\prasa\\Downloads\\PRASAMA_BACKUP_GLOBAL_2026-01-21.json"

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const fileFlagIndex = args.findIndex(a => a === '--file');
if (fileFlagIndex === -1 || !args[fileFlagIndex + 1]) {
  console.error('❌ Please provide --file <backup.json>');
  process.exit(1);
}
const backupPath = path.resolve(args[fileFlagIndex + 1]);

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !fs.existsSync(credPath)) {
  console.error('❌ Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON path.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(credPath)
});

const db = admin.firestore();

const collectionsMap = {
  products: 'p_live_products',
  transactions: 'p_live_transactions',
  customers: 'p_live_customers',
  vendors: 'p_live_vendors',
  accounts: 'p_live_accounts',
  categories: 'p_live_categories',
  daySessions: 'p_live_daySessions',
  recurringExpenses: 'p_live_recurringExpenses',
  purchaseOrders: 'p_live_purchaseOrders',
  quotations: 'p_live_quotations'
};

const chunk = (arr, size = 400) => {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
};

const importArray = async (key, docs) => {
  if (!Array.isArray(docs) || docs.length === 0) return;
  const col = collectionsMap[key];
  if (!col) {
    console.warn(`Skipping unknown key: ${key}`);
    return;
  }
  console.log(`⏳ Importing ${docs.length} docs into ${col} ...`);
  const chunks = chunk(docs, 400);
  for (const [idx, portion] of chunks.entries()) {
    const batch = db.batch();
    portion.forEach(item => {
      const docId = item.id || db.collection(col).doc().id;
      const ref = db.collection(col).doc(docId);
      batch.set(ref, { ...item, id: docId }, { merge: true });
    });
    await batch.commit();
    console.log(`  ✅ chunk ${idx + 1}/${chunks.length}`);
  }
};

const run = async () => {
  const raw = fs.readFileSync(backupPath, 'utf-8');
  const data = JSON.parse(raw);

  for (const key of Object.keys(collectionsMap)) {
    await importArray(key, data[key]);
  }

  if (data.profile) {
    console.log('⏳ Writing profile doc ...');
    await db.collection('p_live_profile').doc('main').set(data.profile, { merge: true });
  }

  console.log('🎉 Import complete');
  process.exit(0);
};

run().catch(err => {
  console.error('❌ Import failed', err);
  process.exit(1);
});
