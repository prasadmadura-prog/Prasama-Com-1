import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDgTA61l64jv4fR0SusbRYKx4GfhxoIZ90",
  authDomain: "prasama-72c8d.firebaseapp.com",
  projectId: "prasama-72c8d",
  storageBucket: "prasama-72c8d.firebasestorage.app",
  messagingSenderId: "294615686061",
  appId: "1:294615686061:web:8c8906fc36f8f93edf9f24"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testQuota() {
  const testRef = doc(db, 'p_v16_transactions', 'TX-1790585225608-14U7J');
  const snap = await getDoc(testRef);
  if (!snap.exists()) {
    console.log("Draft not found");
    process.exit(0);
  }
  console.log("Found draft, attempting write to verify quota...");
  try {
    await setDoc(testRef, {
      ...snap.data(),
      status: 'COMPLETED',
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log("SUCCESS! Write quota is ACTIVE! The draft was successfully posted as COMPLETED!");
  } catch (err) {
    console.error("WRITE FAILED:", err.message);
  }
  process.exit(0);
}

testQuota().catch(e => { console.error(e); process.exit(1); });
