
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBaqtDnkyQVqOItmUTDOBvhOVtBDYRsOyQ",
  authDomain: "prasama-1984c.firebaseapp.com",
  projectId: "prasama-1984c",
  storageBucket: "prasama-1984c.firebasestorage.app",
  messagingSenderId: "703953550630",
  appId: "1:703953550630:web:ad3fc37647050a488515e7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;
