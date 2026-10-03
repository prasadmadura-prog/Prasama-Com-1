import { initializeApp, getApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDgTA61l64jv4fR0SusbRYKx4GfhxoIZ90",
  authDomain: "prasama-72c8d.firebaseapp.com",
  projectId: "prasama-72c8d",
  storageBucket: "prasama-72c8d.firebasestorage.app",
  messagingSenderId: "294615686061",
  appId: "1:294615686061:web:8c8906fc36f8f93edf9f24"
};

// Singleton pattern to ensure Firebase is only initialized once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch {
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
