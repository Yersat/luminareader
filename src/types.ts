/**
 * Firebase Types
 * 
 * Type definitions for Firebase data structures
 */

import { Timestamp } from 'firebase/firestore';

export type ReaderEngine = 'native' | 'ios-deterministic';

export interface LastReadSnapshot {
  engine: ReaderEngine;
  sectionIndex: number | null;
  sectionHref: string | null;
  sectionPage: number;
  sectionTotalPages: number;
  timestamp: number;
}

/**
 * Book stored in Firestore
 */
export interface Book {
  id: string;
  userId: string;
  title: string;
  author: string;
  coverColor: string;
  fileUrl: string;
  /**
   * Flag used for migrated books that have metadata only and need the
   * user to re-upload the actual EPUB file.
   */
  needsReupload?: boolean;
  uploadedAt: Timestamp;
  lastOpened: Timestamp;
  /** Last reading position (CFI string) - used to restore reading position */
  lastReadCfi?: string;
  /** Reading progress as a percentage (0-100) */
  readingProgress?: number;
  /** iOS deterministic fallback restore snapshot */
  lastReadSnapshot?: LastReadSnapshot;
}

/**
 * Bookmark stored in Firestore
 */
export interface Bookmark {
  id: string;
  userId: string;
  bookId: string;
  cfi: string;
  label: string;
  createdAt: Timestamp;
}

/**
 * User profile stored in Firestore
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  isPro: boolean;
  joinDate: Timestamp;
  language: string;
  theme: string;
  fontSize: number;
}
