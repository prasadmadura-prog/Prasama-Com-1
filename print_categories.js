import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDgTA61l64jv4fR0SusbRYKx4GfhxoIZ90",
    authDomain: "prasama-72c8d.firebaseapp.com",
    projectId: "prasama-72c8d",
    storageBucket: "prasama-72c8d.firebasestorage.app",
    messagingSenderId: "294615686061",
    appId: "1:294615686061:web:8c8906fc36f8f93edf9f24"
};

async function run() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("Fetching categories collection (p_v16_categories)...");
  const catsSnap = await getDocs(collection(db, "p_v16_categories"));
  const categories = [];
  catsSnap.forEach(doc => {
    categories.push({ id: doc.id, ...doc.data() });
  });

  console.log("Categories in collection:");
  console.log(JSON.stringify(categories, null, 2));

  console.log("Fetching expense transactions categories...");
  const txSnap = await getDocs(collection(db, "p_v16_transactions"));
  const expenseCategories = new Set();
  txSnap.forEach(doc => {
    const data = doc.data();
    if (data.type === 'EXPENSE' && data.category) {
      expenseCategories.add(data.category);
    }
  });

  console.log("Expense Categories from transactions:");
  console.log(Array.from(expenseCategories));
}

run().catch(console.error);
