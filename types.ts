
export enum Sender {
  User = 'user',
  Model = 'model',
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: number;
  isError?: boolean;
}

export interface SelectionData {
  text: string;
  cfiRange: string;
}

export interface ChatContext {
  selection: SelectionData | null;
}

export interface BookData {
  id: string;
  title: string;
  author: string;
  /**
   * The EPUB file content.
   * - When a book is first uploaded in this session, this is a File.
   * - When a book is loaded from Firestore, this starts as null and is
   *   populated with an ArrayBuffer after downloading from Cloud Storage.
   */
  file: File | ArrayBuffer | null;
  /** Download URL stored in Firestore; used to lazy‑load the file when reopening a book */
  fileUrl?: string;
  coverColor: string;
  addedAt: number;
}

export interface UserProfile {
  name: string;
  email: string;
  isPro: boolean;
  joinDate: number;
}

export interface Bookmark {
  id: string;
  cfi: string;
  label: string;
  timestamp: number;
}

export type Language = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'ru';
