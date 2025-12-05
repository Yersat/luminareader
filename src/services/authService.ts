/**
 * Authentication Service
 *
 * Handles all Firebase Authentication operations including:
 * - User signup
 * - User login
 * - User logout
 * - Password reset
 * - Account deletion
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
  AuthError,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithCredential
} from 'firebase/auth';
import { doc, setDoc, getDoc, Timestamp, collection, query, where, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { SignInWithApple, SignInWithAppleOptions, SignInWithAppleResponse } from '@capacitor-community/apple-sign-in';
import { GoogleAuth } from '@southdevs/capacitor-google-auth';
import { auth, db, storage, functions } from '../config/firebase';

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
 * Create or update user profile in Firestore after OAuth sign-in
 */
async function createOrUpdateOAuthUserProfile(user: User): Promise<void> {
  const userDocRef = doc(db, 'users', user.uid);
  const userDocSnap = await getDoc(userDocRef);

  if (!userDocSnap.exists()) {
    // Create new user profile for OAuth users
    await setDoc(userDocRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      isPro: false,
      joinDate: Timestamp.now(),
      language: 'en',
      theme: 'dark',
      fontSize: 16,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      authProvider: user.providerData[0]?.providerId || 'unknown'
    });
    console.log('Created new user profile for OAuth user:', user.uid);
  } else {
    // Update last login timestamp
    await setDoc(userDocRef, {
      updatedAt: Timestamp.now()
    }, { merge: true });
    console.log('Updated existing OAuth user profile:', user.uid);
  }
}

/**
 * Sign in with Google
 * Works on both web (popup) and native (Capacitor plugin)
 */
export async function signInWithGoogle(): Promise<User> {
  try {
    if (Capacitor.isNativePlatform()) {
      // Native iOS/Android: use Capacitor Google Auth plugin
      // Initialize the plugin first (required for iOS)
      // serverClientId is required for Firebase token exchange
      const webClientId = '764556944016-l2784l520uscs1b7td0ph70spvfnh7mf.apps.googleusercontent.com';

      await GoogleAuth.initialize({
        clientId: webClientId,
        serverClientId: webClientId,
        scopes: ['profile', 'email'],
        grantOfflineAccess: true
      });

      // signIn() requires scopes to be passed explicitly
      const googleUser = await GoogleAuth.signIn({
        scopes: ['profile', 'email'],
        serverClientId: webClientId
      });

      // Create Firebase credential from the Google ID token
      const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);

      // Sign in to Firebase with the Google credential
      const result = await signInWithCredential(auth, credential);
      const user = result.user;

      // Create or update user profile in Firestore
      await createOrUpdateOAuthUserProfile(user);

      console.log('Native Google sign-in successful:', user.email);
      return user;
    } else {
      // Web platform: use Firebase popup
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Create or update user profile in Firestore
      await createOrUpdateOAuthUserProfile(user);

      console.log('Google sign-in successful:', user.email);
      return user;
    }
  } catch (error) {
    console.error('Google sign-in error:', error);
    throw handleAuthError(error as AuthError);
  }
}

/**
 * Sign in with Apple
 * Works on both web (popup) and native (Capacitor plugin)
 */
export async function signInWithApple(): Promise<User> {
  try {
    if (Capacitor.isNativePlatform()) {
      // Native iOS: use Capacitor Apple Sign-In plugin
      const options: SignInWithAppleOptions = {
        clientId: 'com.yersat.LuminaReader',
        redirectURI: '',
        scopes: 'email name',
        state: '',
        nonce: ''
      };

      const result: SignInWithAppleResponse = await SignInWithApple.authorize(options);

      // Create Firebase credential from Apple's identity token
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({
        idToken: result.response.identityToken,
        rawNonce: '' // Apple handles nonce internally on iOS
      });

      // Sign in to Firebase with the Apple credential
      const firebaseResult = await signInWithCredential(auth, credential);
      const user = firebaseResult.user;

      // Create or update user profile in Firestore
      await createOrUpdateOAuthUserProfile(user);

      console.log('Apple sign-in successful (native):', user.email);
      return user;
    } else {
      // Web platform: use Firebase popup with Apple provider
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Create or update user profile in Firestore
      await createOrUpdateOAuthUserProfile(user);

      console.log('Apple sign-in successful:', user.email);
      return user;
    }
  } catch (error: any) {
    console.error('Apple sign-in error:', error);
    // Handle user cancellation gracefully
    if (error?.message?.includes('cancelled') || error?.code === 'ERR_CANCELED') {
      throw new Error('Sign-in was cancelled. Please try again.');
    }
    throw handleAuthError(error as AuthError);
  }
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
    // OAuth-specific errors
    case 'auth/popup-closed-by-user':
      return new Error('Sign-in was cancelled. Please try again.');
    case 'auth/popup-blocked':
      return new Error('Sign-in popup was blocked. Please allow popups for this site.');
    case 'auth/cancelled-popup-request':
      return new Error('Sign-in was cancelled. Please try again.');
    case 'auth/account-exists-with-different-credential':
      return new Error('An account already exists with this email using a different sign-in method.');
    case 'auth/credential-already-in-use':
      return new Error('This credential is already associated with another account.');
    case 'auth/auth-domain-config-required':
      return new Error('OAuth is not configured properly. Please contact support.');
    default:
      // Include the actual error code for debugging
      return new Error(`Authentication failed (${error.code || 'unknown'}): ${error.message || 'Please try again.'}`);
  }
}

/**
 * Delete user account and all associated data
 *
 * This function:
 * 1. Calls a Cloud Function to delete user data (books, bookmarks, subscriptions, Storage files)
 * 2. Deletes the user profile from Firestore
 * 3. Deletes the Firebase Auth account
 *
 * Note: For security, most deletion happens server-side via Cloud Function
 */
export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('No user is currently logged in');
  }

  try {
    console.log('Starting account deletion for user:', user.uid);

    // Call the Cloud Function to delete all user data
    // This handles Storage files and Firestore documents securely server-side
    const deleteUserData = httpsCallable(functions, 'deleteUserAccount');
    await deleteUserData();

    console.log('Cloud Function completed, deleting auth account...');

    // Finally, delete the Firebase Auth account
    await deleteUser(user);

    console.log('Account deletion complete');
  } catch (error: any) {
    console.error('Error deleting account:', error);

    // Handle specific errors
    if (error.code === 'auth/requires-recent-login') {
      throw new Error('For security, please log out and log back in before deleting your account.');
    }

    if (error.code === 'functions/not-found') {
      // Fallback: Cloud Function doesn't exist yet, try client-side deletion
      console.log('Cloud Function not found, attempting client-side deletion...');
      await deleteAccountClientSide(user);
      return;
    }

    throw new Error(error.message || 'Failed to delete account. Please try again.');
  }
}

/**
 * Fallback client-side account deletion
 * Used when Cloud Function is not available
 */
async function deleteAccountClientSide(user: User): Promise<void> {
  const uid = user.uid;

  try {
    // Delete user's books from Firestore
    const booksQuery = query(collection(db, 'books'), where('userId', '==', uid));
    const booksSnapshot = await getDocs(booksQuery);

    // Delete each book and its Storage file
    for (const bookDoc of booksSnapshot.docs) {
      const bookData = bookDoc.data();

      // Try to delete the Storage file if it exists
      if (bookData.fileUrl) {
        try {
          // Extract path from download URL
          const urlPath = new URL(bookData.fileUrl).pathname;
          const storagePath = decodeURIComponent(urlPath.split('/o/')[1]?.split('?')[0] || '');
          if (storagePath) {
            const fileRef = ref(storage, storagePath);
            await deleteObject(fileRef);
          }
        } catch (storageError) {
          console.warn('Could not delete storage file:', storageError);
          // Continue even if storage deletion fails
        }
      }

      // Delete the book document
      await deleteDoc(bookDoc.ref);
    }

    // Delete user's bookmarks from Firestore
    const bookmarksQuery = query(collection(db, 'bookmarks'), where('userId', '==', uid));
    const bookmarksSnapshot = await getDocs(bookmarksQuery);

    const batch = writeBatch(db);
    bookmarksSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Delete user profile
    const userDocRef = doc(db, 'users', uid);
    await deleteDoc(userDocRef);

    // Delete the Firebase Auth account
    await deleteUser(user);

    console.log('Client-side account deletion complete');
  } catch (error: any) {
    console.error('Error in client-side deletion:', error);

    if (error.code === 'auth/requires-recent-login') {
      throw new Error('For security, please log out and log back in before deleting your account.');
    }

    throw new Error(error.message || 'Failed to delete account. Please try again.');
  }
}

