// firebase.js

// Firebase core
import { initializeApp } from "firebase/app";

// Auth
import { getAuth } from "firebase/auth";

// Firestore
import { getFirestore } from "firebase/firestore";

// Firebase config — replace with your own from Firebase Console
const firebaseConfig = {
 apiKey: "AIzaSyCa4IVNZWaW41Lt-zm4TzKvURv2q4qM6io",
  authDomain: "storeshop-1b056.firebaseapp.com",
  projectId: "storeshop-1b056",
  storageBucket: "storeshop-1b056.firebasestorage.app",
  messagingSenderId: "621075712142",
  appId: "1:621075712142:web:62347e94419db8e36ca1df",
  measurementId: "G-ZPRGDHWYVS"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
