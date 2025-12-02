// Firebase Configuration and Initialization
import { initializeApp } from 'firebase/app';
import { getAuth, indexedDBLocalPersistence, initializeAuth, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';

// Firebase configuration from environment variables
// These values are loaded from .env file (not committed to git for security)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Debug: Log Firebase config (without sensitive data) and environment
console.log('🔧 Firebase Config:', {
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  apiKeyPresent: !!firebaseConfig.apiKey,
  appIdPresent: !!firebaseConfig.appId
});
console.log('🔧 Running in:', typeof window !== 'undefined' ? window.location.href : 'unknown');
console.log('🔧 User Agent:', typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown');
console.log('🔧 Capacitor platform:', Capacitor.getPlatform());
console.log('🔧 Is native platform:', Capacitor.isNativePlatform());

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

