// Firebase Configuration and Initialization
import { initializeApp } from 'firebase/app';
import { getAuth, indexedDBLocalPersistence, initializeAuth, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBcOn-i8b0wAP8CKwpsYz5pk2s745SrAiU",
  authDomain: "lumina-reader-a5d10.firebaseapp.com",
  projectId: "lumina-reader-a5d10",
  storageBucket: "lumina-reader-a5d10.firebasestorage.app",
  messagingSenderId: "764556944016",
  appId: "1:764556944016:web:f6e305239676e8acd9ee15"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with proper persistence for native platforms
// This fixes the hanging issue in Capacitor/native apps
let auth;
if (Capacitor.isNativePlatform()) {
  // Use indexedDB persistence for native platforms (iOS/Android)
  // This avoids issues with Firebase Auth's default behavior in WebViews
  auth = initializeAuth(app, {
    persistence: indexedDBLocalPersistence
  });
  console.log('🔧 Firebase Auth initialized for native platform with indexedDB persistence');
} else {
  // Use default auth for web
  auth = getAuth(app);
  console.log('🔧 Firebase Auth initialized for web platform');
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Export the app instance
export default app;

