/**
 * Data Migration Utility
 * 
 * Migrates data from localStorage to Firebase Firestore.
 * This runs once when a user first logs in after Phase 3 implementation.
 */

import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const MIGRATION_KEY = 'lumina_migration_completed';

/**
 * Check if migration has already been completed
 */
export function isMigrationCompleted(): boolean {
  return localStorage.getItem(MIGRATION_KEY) === 'true';
}

/**
 * Mark migration as completed
 */
function markMigrationCompleted(): void {
  localStorage.setItem(MIGRATION_KEY, 'true');
}

/**
 * Migrate user data from localStorage to Firestore
 */
export async function migrateUserData(userId: string): Promise<void> {
  // Check if migration already completed
  if (isMigrationCompleted()) {
    console.log('Migration already completed, skipping...');
    return;
  }

  console.log('Starting data migration to Firebase...');

  try {
    // Migrate books
    await migrateBooks(userId);
    
    // Migrate bookmarks
    await migrateBookmarks(userId);
    
    // Mark migration as completed
    markMigrationCompleted();
    
    console.log('Data migration completed successfully!');
  } catch (error) {
    console.error('Error during data migration:', error);
    throw error;
  }
}

/**
 * Migrate books from localStorage to Firestore
 */
async function migrateBooks(userId: string): Promise<void> {
  try {
    // Try to get books from localStorage
    const booksJson = localStorage.getItem('lumina_books');
    if (!booksJson) {
      console.log('No books found in localStorage');
      return;
    }

    const books = JSON.parse(booksJson);
    if (!Array.isArray(books) || books.length === 0) {
      console.log('No books to migrate');
      return;
    }

    console.log(`Migrating ${books.length} books...`);

    // Migrate each book
    for (const book of books) {
      const bookId = book.id || Date.now().toString();
      
      // Note: We can't migrate the actual EPUB file from localStorage
      // Users will need to re-upload their books
      // We'll just migrate the metadata
      await setDoc(doc(db, 'books', bookId), {
        userId,
        title: book.title || 'Untitled',
        author: book.author || 'Unknown Author',
        coverColor: book.coverColor || 'bg-indigo-100 text-indigo-700',
        uploadedAt: Timestamp.fromMillis(book.addedAt || Date.now()),
        lastOpened: Timestamp.fromMillis(book.addedAt || Date.now()),
        // Note: fileUrl will be empty - user needs to re-upload
        fileUrl: '',
        needsReupload: true
      });
    }

    console.log(`Successfully migrated ${books.length} books`);
  } catch (error) {
    console.error('Error migrating books:', error);
  }
}

/**
 * Migrate bookmarks from localStorage to Firestore
 */
async function migrateBookmarks(userId: string): Promise<void> {
  try {
    // Try to get bookmarks from localStorage
    const bookmarksJson = localStorage.getItem('lumina_bookmarks');
    if (!bookmarksJson) {
      console.log('No bookmarks found in localStorage');
      return;
    }

    const bookmarksData = JSON.parse(bookmarksJson);
    if (!bookmarksData || typeof bookmarksData !== 'object') {
      console.log('No bookmarks to migrate');
      return;
    }

    let totalBookmarks = 0;

    // Bookmarks are stored as { bookId: [bookmark1, bookmark2, ...] }
    for (const [bookId, bookmarks] of Object.entries(bookmarksData)) {
      if (!Array.isArray(bookmarks)) continue;

      for (const bookmark of bookmarks) {
        const bookmarkId = bookmark.id || `${bookId}_${Date.now()}`;
        
        await setDoc(doc(db, 'bookmarks', bookmarkId), {
          userId,
          bookId,
          cfi: bookmark.cfi || '',
          label: bookmark.label || 'Bookmark',
          createdAt: Timestamp.fromMillis(bookmark.timestamp || Date.now())
        });
        
        totalBookmarks++;
      }
    }

    console.log(`Successfully migrated ${totalBookmarks} bookmarks`);
  } catch (error) {
    console.error('Error migrating bookmarks:', error);
  }
}

/**
 * Clear localStorage data after successful migration
 * (Optional - only call this if you want to clean up)
 */
export function clearLocalStorageData(): void {
  localStorage.removeItem('lumina_books');
  localStorage.removeItem('lumina_bookmarks');
  console.log('Cleared localStorage data');
}

