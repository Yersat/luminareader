/**
 * Authentication Service
 * 
 * Handles all Firebase Authentication operations including:
 * - User signup
 * - User login
 * - User logout
 * - Password reset
 * - Auth state monitoring
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  User,
  onAuthStateChanged,
  AuthError
} from 'firebase/auth';
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

/**
 * User profile data structure
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  isPro: boolean;
  joinDate: Date;
  language: string;
  theme: string;
  fontSize: number;
}

/**
 * Sign up a new user with email and password
 */
export async function signUp(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  try {
    // Create user account
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update display name
    await updateProfile(user, { displayName });

    // Create user profile in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: displayName,
      isPro: false,
      joinDate: Timestamp.now(),
      language: 'en',
      theme: 'dark',
      fontSize: 16,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    return user;
  } catch (error) {
    throw handleAuthError(error as AuthError);
  }
}

/**
 * Sign in an existing user
 */
export async function signIn(email: string, password: string): Promise<User> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    throw handleAuthError(error as AuthError);
  }
}

/**
 * Sign out the current user
 */
export async function logOut(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    throw handleAuthError(error as AuthError);
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    throw handleAuthError(error as AuthError);
  }
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        uid: data.uid,
        email: data.email,
        displayName: data.displayName,
        isPro: data.isPro || false,
        joinDate: data.joinDate?.toDate() || new Date(),
        language: data.language || 'en',
        theme: data.theme || 'dark',
        fontSize: data.fontSize || 16
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current user
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}

/**
 * Handle Firebase Auth errors and return user-friendly messages
 */
function handleAuthError(error: AuthError): Error {
  console.error('Auth error:', error);
  console.error('Auth error code:', error.code);
  console.error('Auth error message:', error.message);

  switch (error.code) {
    case 'auth/email-already-in-use':
      return new Error('This email is already registered. Please log in instead.');
    case 'auth/invalid-email':
      return new Error('Invalid email address. Please check and try again.');
    case 'auth/operation-not-allowed':
      return new Error('Email/password authentication is not enabled. Please contact support.');
    case 'auth/weak-password':
      return new Error('Password is too weak. Please use at least 6 characters.');
    case 'auth/user-disabled':
      return new Error('This account has been disabled. Please contact support.');
    case 'auth/user-not-found':
      return new Error('No account found with this email. Please sign up first.');
    case 'auth/wrong-password':
      return new Error('Incorrect password. Please try again.');
    case 'auth/invalid-credential':
      return new Error('Invalid email or password. Please try again.');
    case 'auth/too-many-requests':
      return new Error('Too many failed attempts. Please try again later.');
    case 'auth/network-request-failed':
      return new Error('Network error. Please check your internet connection.');
    case 'auth/unauthorized-domain':
      return new Error('This domain is not authorized. Please contact support. (unauthorized-domain)');
    case 'auth/invalid-api-key':
      return new Error('Invalid API key configuration. Please contact support. (invalid-api-key)');
    case 'auth/api-key-not-valid':
      return new Error('API key not valid for this operation. Please contact support. (api-key-not-valid)');
    default:
      // Include the actual error code for debugging
      return new Error(`Authentication failed (${error.code || 'unknown'}): ${error.message || 'Please try again.'}`);
  }
}

