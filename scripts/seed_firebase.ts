
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { db } from '../services/firebase'; // Assumes this runs with an environment that supports this import or we will mock/adjust
import { doc, writeBatch } from 'firebase/firestore';
import { collections } from '../services/database';

// Path to the backup file
const BACKUP_FILE_PATH = 'c:/Users/prasa/Downloads/PRASAMA_BACKUP_GLOBAL_2026-01-30.json';

const mapCollectionName = (key: string): string | undefined => {
    // Map JSON keys to Firestore collection names from services/database.ts
    switch (key) {
        case 'products': return collections.products;
        case 'transactions': return collections.transactions;
        case 'customers': return collections.customers;
        case 'vendors': return collections.vendors;
        case 'accounts': return collections.accounts;
        case 'categories': return collections.categories;
        case 'daySessions': return collections.daySessions;
        case 'recurringExpenses': return collections.recurringExpenses;
        case 'purchaseOrders': return collections.purchaseOrders;
        case 'quotations': return collections.quotations;
        case 'userProfile': return collections.profile; // Special case, might be an object, not array
        default: return undefined;
    }
};

const seedDatabase = async () => {
    try {
        console.log(`Reading backup file from ${BACKUP_FILE_PATH}...`);
        const fileContent = readFileSync(BACKUP_FILE_PATH, 'utf-8');
        const data = JSON.parse(fileContent);

        let totalBatches = 0;
        let totalItems = 0;

        for (const [key, value] of Object.entries(data)) {
            const collectionName = mapCollectionName(key);
            if (!collectionName) {
                console.log(`Skipping unknown key: ${key}`);
                continue;
            }

            console.log(`Processing ${key} -> ${collectionName}...`);

            let items: any[] = [];
            if (Array.isArray(value)) {
                items = value;
            } else if (typeof value === 'object' && value !== null) {
                // Handle single object (like userProfile) -> treat as single doc with id 'main' or similar
                // Based on App.tsx: upsertDocument(dbCols.profile, 'main', data.userProfile);
                if (key === 'userProfile') {
                    items = [{ ...value, id: 'main' }];
                } else {
                    // Unknown object structure, skip
                    continue;
                }
            }

            if (items.length === 0) continue;

            // Batch in chunks of 400
            const chunkSize = 400;
            for (let i = 0; i < items.length; i += chunkSize) {
                const batch = writeBatch(db);
                const chunk = items.slice(i, i + chunkSize);

                chunk.forEach((item: any) => {
                    // Ensure ID exists
                    const docId = String(item.id || item.sku || `gen-${Math.random()}`);
                    const docRef = doc(db, collectionName, docId);
                    batch.set(docRef, item, { merge: true });
                });

                await batch.commit();
                totalBatches++;
                totalItems += chunk.length;
                console.log(`  Uploaded batch of ${chunk.length} items to ${collectionName}`);
            }
        }

        console.log(`\nSeeding Complete! Processed ${totalItems} items in ${totalBatches} batches.`);
        process.exit(0);

    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
};

seedDatabase();
