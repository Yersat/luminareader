/**
 * Firebase Service
 * 
 * Handles all Firebase operations including:
 * - Firestore database operations
 * - Cloud Storage operations
 * - Authentication (Phase 3)
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  Timestamp,
  addDoc
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { db, storage, auth } from '../config/firebase';
import type { Book, Bookmark } from '../types';

/**
 * User Profile Operations
 */
export const userService = {
  /**
   * Get user profile
   */
  async getProfile(userId: string) {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  },

  /**
   * Create or update user profile
   */
  async saveProfile(userId: string, data: any) {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now()
    }, { merge: true });
  },

  /**
   * Update user settings
   */
  async updateSettings(userId: string, settings: any) {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, {
      ...settings,
      updatedAt: Timestamp.now()
    });
  }
};

/**
 * Book Operations
 */
export const bookService = {
  /**
   * Get all books for a user
   */
  async getBooks(userId: string): Promise<Book[]> {
    const q = query(
      collection(db, 'books'),
      where('userId', '==', userId),
      orderBy('lastOpened', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Book));
  },

  /**
   * Get a single book
   */
  async getBook(bookId: string): Promise<Book | null> {
    const docRef = doc(db, 'books', bookId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Book : null;
  },

  /**
   * Save a book
   */
  async saveBook(userId: string, book: Partial<Book>): Promise<string> {
    if (book.id) {
      // Update existing book
      const docRef = doc(db, 'books', book.id);
      await updateDoc(docRef, {
        ...book,
        updatedAt: Timestamp.now()
      });
      return book.id;
    } else {
      // Create new book
      const docRef = await addDoc(collection(db, 'books'), {
        ...book,
        userId,
        uploadedAt: Timestamp.now(),
        lastOpened: Timestamp.now()
      });
      return docRef.id;
    }
  },

  /**
   * Delete a book
   */
  async deleteBook(bookId: string) {
    const docRef = doc(db, 'books', bookId);
    await deleteDoc(docRef);
  },

  /**
   * Update last opened time
   */
  async updateLastOpened(bookId: string) {
    const docRef = doc(db, 'books', bookId);
    await updateDoc(docRef, {
      lastOpened: Timestamp.now()
    });
  }
};

/**
 * Bookmark Operations
 */
export const bookmarkService = {
  /**
   * Get all bookmarks for a book
   */
  async getBookmarks(userId: string, bookId: string): Promise<Bookmark[]> {
    const q = query(
      collection(db, 'bookmarks'),
      where('userId', '==', userId),
      where('bookId', '==', bookId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Bookmark));
  },

  /**
   * Save a bookmark
   */
  async saveBookmark(userId: string, bookmark: Partial<Bookmark>): Promise<string> {
    const docRef = await addDoc(collection(db, 'bookmarks'), {
      ...bookmark,
      userId,
      createdAt: Timestamp.now()
    });
    return docRef.id;
  },

  /**
   * Delete a bookmark
   */
  async deleteBookmark(bookmarkId: string) {
    const docRef = doc(db, 'bookmarks', bookmarkId);
    await deleteDoc(docRef);
  }
};

/**
 * Storage Operations
 */
export const storageService = {
  /**
   * Upload EPUB file
   */
  async uploadEpub(userId: string, file: File): Promise<string> {
    console.log('storageService.uploadEpub called');
    console.log('userId:', userId);
    console.log('file:', file.name, file.type, file.size);
    console.log('auth.currentUser:', auth.currentUser);
    console.log('auth.currentUser.uid:', auth.currentUser?.uid);

    const fileName = `${Date.now()}_${file.name}`;
    const storagePath = `epubs/${userId}/${fileName}`;
    console.log('Storage path:', storagePath);

    const storageRef = ref(storage, storagePath);
    console.log('Storage ref created:', storageRef.fullPath);

    try {
      console.log('Starting upload...');
      await uploadBytes(storageRef, file);
      console.log('Upload completed, getting download URL...');
      const downloadURL = await getDownloadURL(storageRef);
      console.log('Download URL obtained:', downloadURL);
      return downloadURL;
    } catch (error) {
      console.error('Upload error in storageService:', error);
      throw error;
    }
  },

  /**
   * Delete EPUB file
   */
  async deleteEpub(fileUrl: string) {
    const storageRef = ref(storage, fileUrl);
    await deleteObject(storageRef);
  }
};

