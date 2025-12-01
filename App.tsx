import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ePub from 'epubjs';
import { Reader } from './components/Reader';
import { ChatWidget } from './components/ChatWidget';
import { Onboarding } from './components/Onboarding';
import { Auth } from './components/Auth';
import { Profile } from './components/Profile';
import { Icons } from './components/ui/Icons';
import { SelectionData, BookData, UserProfile, Bookmark } from './types';
import { useLanguage } from './contexts/LanguageContext';
import { useAuth } from './src/contexts/AuthContext';
import { bookService, bookmarkService, storageService, userService } from './src/services/firebaseService';
import { migrateUserData, isMigrationCompleted } from './src/utils/dataMigration';

type ViewState = 'onboarding' | 'auth' | 'library' | 'reader' | 'profile';
type Theme = 'light' | 'sepia' | 'dark';

function App() {
  const [view, setView] = useState<ViewState>('onboarding');
  const [library, setLibrary] = useState<BookData[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const { t } = useLanguage();
  const { user: authUser, logOut: authLogOut } = useAuth();
  
  // Reader Settings
  const [fontSize, setFontSize] = useState(100);
  const [theme, setTheme] = useState<Theme>('light');
  
  // Reader State
  const [bookmarks, setBookmarks] = useState<Record<string, Bookmark[]>>({});
  const [currentCfi, setCurrentCfi] = useState<string>('');
  const [targetLocation, setTargetLocation] = useState<string | null>(null);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Load user data from Firebase when authenticated
  useEffect(() => {
    if (authUser && view === 'library') {
      loadUserData();
    }
  }, [authUser, view]);

  // Migrate data from localStorage on first login
  useEffect(() => {
    if (authUser && !isMigrationCompleted()) {
      migrateUserData(authUser.uid).catch(err => {
        console.error('Migration failed:', err);
      });
    }
  }, [authUser]);

  // Load books and bookmarks from Firebase
  const loadUserData = async () => {
    if (!authUser) return;

    setIsLoadingData(true);
    try {
      // Load books from Firestore
      const books = await bookService.getBooks(authUser.uid);

      // Convert Firestore books to BookData format.
      // We keep only metadata here and lazy-load the actual EPUB file from
      // Cloud Storage (via fileUrl) when the user opens the book.
      const bookData: BookData[] = books.map(book => ({
        id: book.id,
        title: book.title,
        author: book.author,
        file: null, // Will be populated with a File or ArrayBuffer when opened
        fileUrl: book.fileUrl,
        coverColor: book.coverColor || getRandomColor(),
        addedAt: book.uploadedAt?.toMillis() || Date.now()
      }));

      setLibrary(bookData);

      // Load bookmarks for all books
      const allBookmarks: Record<string, Bookmark[]> = {};
      for (const book of books) {
        const bookBookmarks = await bookmarkService.getBookmarks(authUser.uid, book.id);
        allBookmarks[book.id] = bookBookmarks.map(bm => ({
          id: bm.id,
          cfi: bm.cfi,
          label: bm.label,
          timestamp: bm.createdAt?.toMillis() || Date.now()
        }));
      }
      setBookmarks(allBookmarks);
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  // Generate a random pastel color for book covers
  const getRandomColor = () => {
    const colors = [
      'bg-red-100 text-red-700',
      'bg-orange-100 text-orange-700',
      'bg-amber-100 text-amber-700',
      'bg-green-100 text-green-700',
      'bg-emerald-100 text-emerald-700',
      'bg-teal-100 text-teal-700',
      'bg-cyan-100 text-cyan-700',
      'bg-blue-100 text-blue-700',
      'bg-indigo-100 text-indigo-700',
      'bg-violet-100 text-violet-700',
      'bg-purple-100 text-purple-700',
      'bg-fuchsia-100 text-fuchsia-700',
      'bg-pink-100 text-pink-700',
      'bg-rose-100 text-rose-700'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!authUser) {
      alert('Please log in to upload books');
      return;
    }

    if (uploadedFile) {
      // Accept any EPUB file regardless of MIME type
      const fileName = uploadedFile.name.toLowerCase();
      if (!fileName.endsWith('.epub')) {
        alert('Please select an EPUB file (.epub)');
        return;
      }

      setIsProcessing(true);
      try {
        console.log('Starting upload for:', uploadedFile.name);
        console.log('File type:', uploadedFile.type);
        console.log('File size:', uploadedFile.size);
        console.log('Auth user:', authUser);
        console.log('Auth user ID:', authUser?.uid);

        // Quick extraction of metadata using epubjs
        const book = ePub(uploadedFile);
        const metadata = await book.loaded.metadata;
        console.log('Metadata loaded:', metadata);

        const title = metadata.title || uploadedFile.name.replace('.epub', '');
        const author = metadata.creator || 'Unknown Author';
        const coverColor = getRandomColor();

        console.log('Uploading to Firebase Storage...');
        // Upload file to Firebase Storage
        const fileUrl = await storageService.uploadEpub(authUser.uid, uploadedFile);
        console.log('Upload successful! File URL:', fileUrl);

        console.log('Saving metadata to Firestore...');
        // Save book metadata to Firestore. We do NOT pass an id here so Firestore can
        // create a new document with the correct userId for security rules.
        const savedBookId = await bookService.saveBook(authUser.uid, {
          title,
          author,
          coverColor,
          fileUrl
        });
        console.log('Metadata saved successfully! Saved book ID:', savedBookId);

        // Add to local state (we keep both the in-memory File and the
        // Cloud Storage URL so we can reopen this book in future sessions)
        const newBook: BookData = {
          id: savedBookId,
          title,
          author,
          file: uploadedFile,
          fileUrl,
          coverColor,
          addedAt: Date.now()
        };

        setLibrary(prev => [newBook, ...prev]);
        console.log('Book added to library!');

        // Optional: auto-open the book
        // setActiveBookId(newBook.id);
        // setView('reader');
      } catch (e: any) {
        console.error("Error uploading book:", e);
        console.error("Error details:", e.message, e.code);

        // Show more specific error message
        let errorMessage = 'Failed to upload book. ';
        if (e.code === 'storage/unauthorized') {
          errorMessage += 'Permission denied. Please try logging out and back in.';
        } else if (e.message) {
          errorMessage += e.message;
        } else {
          errorMessage += 'Please check the console for details.';
        }
        alert(errorMessage);
      } finally {
        setIsProcessing(false);
      }
    } else if (uploadedFile) {
      alert('Please upload a valid .epub file');
    }
  };

  const handleBookSelect = async (bookId: string) => {
    const book = library.find(b => b.id === bookId);
    if (!book) return;

    // If we already have the file in memory (fresh upload in this session),
    // we can open the reader immediately.
    if (book.file) {
      setActiveBookId(bookId);
      setSelection(null);
      setTargetLocation(null); // Reset target location logic
      setShowSettings(false);
      setView('reader');
      return;
    }

    // For books loaded from Firestore, we need to fetch the EPUB from
    // Cloud Storage using the stored download URL.
    if (!book.fileUrl) {
      alert('This book was imported from an older version and needs to be re-uploaded.');
      return;
    }

    try {
      console.log('Fetching EPUB file from Storage for book:', bookId);
      const response = await fetch(book.fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download book file (status ${response.status})`);
      }
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Store the loaded file in state so we don't need to re-download it
      // again in this session.
      setLibrary(prev => prev.map(b => b.id === bookId ? { ...b, file: arrayBuffer } : b));

      setActiveBookId(bookId);
      setSelection(null);
      setTargetLocation(null); // Reset target location logic
      setShowSettings(false);
      setView('reader');
    } catch (error) {
      console.error('Error loading book file from Storage:', error);
      alert('Failed to load this book. Please check your internet connection or try re-uploading the file.');
    }
  };

  const handleBackToLibrary = () => {
    setView('library');
    setActiveBookId(null);
    setSelection(null);
    setShowBookmarks(false);
    setShowSettings(false);
  };

  const handleTextSelected = useCallback((data: SelectionData | null) => {
    setSelection(data);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const handleAuthComplete = (userProfile: UserProfile) => {
    setUser(userProfile);
    setView('library');
  };

  const handleSignOut = async () => {
    try {
      await authLogOut();
      setUser(null);
      setLibrary([]);
      setBookmarks({});
      setView('auth');
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Failed to sign out');
    }
  };

  const handleUpgrade = async () => {
    if (user && authUser) {
      try {
        // Update local state immediately for UI responsiveness
        setUser({ ...user, isPro: true });

        // Persist to Firestore
        await userService.saveProfile(authUser.uid, { isPro: true });
        console.log('Pro status saved to Firestore');
      } catch (error) {
        console.error('Error saving Pro status:', error);
        // Revert local state on error
        setUser({ ...user, isPro: false });
        alert('Failed to upgrade. Please try again.');
      }
    }
  };

  const navigateToProfile = () => {
      setView('profile');
  };

  const handleLocationChange = (cfi: string) => {
      setCurrentCfi(cfi);
      setTargetLocation(null); // Clear target once reached to avoid loops
  };

  // Font size handlers
  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 10, 200));
  const decreaseFontSize = () => setFontSize(prev => Math.max(prev - 10, 60));

  // Bookmark handlers
  const toggleBookmark = async () => {
      if (!activeBookId || !currentCfi || !authUser) return;

      const bookBookmarks = bookmarks[activeBookId] || [];
      const existingIndex = bookBookmarks.findIndex(b => b.cfi === currentCfi);

      if (existingIndex >= 0) {
          // Remove bookmark
          const bookmarkToRemove = bookBookmarks[existingIndex];
          try {
            await bookmarkService.deleteBookmark(bookmarkToRemove.id);
            const newBookmarks = [...bookBookmarks];
            newBookmarks.splice(existingIndex, 1);
            setBookmarks(prev => ({ ...prev, [activeBookId]: newBookmarks }));
          } catch (error) {
            console.error('Error removing bookmark:', error);
            alert('Failed to remove bookmark');
          }
      } else {
          // Add bookmark
          const newBookmark: Bookmark = {
              id: Date.now().toString(),
              cfi: currentCfi,
              label: `Bookmark at ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
              timestamp: Date.now()
          };

          try {
            const bookmarkId = await bookmarkService.saveBookmark(authUser.uid, {
              bookId: activeBookId,
              cfi: currentCfi,
              label: newBookmark.label
            });

            newBookmark.id = bookmarkId;
            setBookmarks(prev => ({
                ...prev,
                [activeBookId]: [newBookmark, ...bookBookmarks]
            }));
          } catch (error) {
            console.error('Error saving bookmark:', error);
            alert('Failed to save bookmark');
          }
      }
  };

  const removeBookmark = async (bookmarkId: string) => {
      if (!activeBookId || !authUser) return;

      try {
        await bookmarkService.deleteBookmark(bookmarkId);
        const bookBookmarks = bookmarks[activeBookId] || [];
        const newBookmarks = bookBookmarks.filter(b => b.id !== bookmarkId);
        setBookmarks(prev => ({ ...prev, [activeBookId]: newBookmarks }));
      } catch (error) {
        console.error('Error removing bookmark:', error);
        alert('Failed to remove bookmark');
      }
  };

  const goToBookmark = (cfi: string) => {
      setTargetLocation(cfi);
      setShowBookmarks(false);
  };

  const activeBook = library.find(b => b.id === activeBookId);
  const currentBookBookmarks = activeBookId ? (bookmarks[activeBookId] || []) : [];
  const isCurrentPageBookmarked = currentBookBookmarks.some(b => b.cfi === currentCfi);

  // --- VIEWS ---

  if (view === 'onboarding') {
    return <Onboarding onComplete={() => setView('auth')} />;
  }

  if (view === 'auth') {
    return <Auth onComplete={handleAuthComplete} />;
  }

  if (view === 'profile' && user) {
      return (
          <Profile 
            user={user} 
            onBack={() => setView('library')} 
            onUpgrade={handleUpgrade}
            onSignOut={handleSignOut}
          />
      );
  }

  if (view === 'library') {
    return (
      <div className="min-h-screen bg-stone-50 text-gray-800 font-sans">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-stone-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-200 shadow-md">
                <Icons.Book className="text-white" size={20} />
            </div>
            <h1 className="text-2xl font-bold font-serif text-gray-900">{t('my_library')}</h1>
          </div>
          <div className="flex items-center gap-4">
             {user && (
                 <div className="hidden md:block text-right cursor-pointer" onClick={navigateToProfile}>
                     <p className="text-sm font-bold text-gray-800">{user.name}</p>
                     <p className={`text-xs ${user.isPro ? 'text-indigo-600 font-bold' : 'text-gray-500'}`}>
                         {user.isPro ? t('pro_member') : t('free_plan')}
                     </p>
                 </div>
             )}
             <div 
                onClick={navigateToProfile}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-md relative group cursor-pointer transition-transform hover:scale-105 ${
                    user?.isPro 
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500 ring-2 ring-white ring-offset-2 ring-offset-indigo-100' 
                    : 'bg-gradient-to-br from-indigo-500 to-purple-600'
                }`}
             >
                {user ? user.name.charAt(0).toUpperCase() : "U"}
                {user?.isPro && (
                    <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                        <Icons.Star size={12} className="text-amber-500" fill="currentColor" />
                    </div>
                )}
             </div>
          </div>
        </header>

        <main className="p-6 max-w-7xl mx-auto">
          {/* Library Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            
            {/* Add Book Card */}
            <label className="group relative aspect-[2/3] flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50/50 hover:bg-indigo-50 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:shadow-md transition-all">
                {isProcessing ? (
                   <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                   <Icons.Plus className="text-indigo-600" size={32} />
                )}
              </div>
              <p className="font-medium text-indigo-900">{t('add_book')}</p>
              <p className="text-xs text-indigo-400 mt-1">{t('epub_format')}</p>
              <input 
                type="file" 
                className="hidden" 
                accept=".epub" 
                onChange={handleFileUpload} 
                disabled={isProcessing}
              />
            </label>

            {/* Book Cards */}
            {library.map((book) => (
              <div 
                key={book.id}
                onClick={() => handleBookSelect(book.id)}
                className="group relative flex flex-col gap-3 cursor-pointer"
              >
                <div className={`aspect-[2/3] rounded-r-xl rounded-l-md shadow-md group-hover:shadow-xl transition-all duration-300 transform group-hover:-translate-y-1 relative overflow-hidden ${book.coverColor}`}>
                   {/* Simulated Book Spine Effect */}
                   <div className="absolute left-0 top-0 bottom-0 w-3 bg-black/10 z-10" />
                   <div className="absolute inset-0 flex flex-col p-4 justify-between">
                      <div className="text-right opacity-50">
                        <Icons.Book size={24} className="ml-auto" />
                      </div>
                      <div>
                        <h3 className="font-serif font-bold text-lg leading-tight line-clamp-3 mb-1 break-words">
                          {book.title}
                        </h3>
                        <p className="text-xs font-medium opacity-75 line-clamp-1 uppercase tracking-wider">
                          {book.author}
                        </p>
                      </div>
                   </div>
                </div>
                <div className="px-1">
                   <h3 className="font-semibold text-gray-800 text-sm truncate">{book.title}</h3>
                   <p className="text-xs text-gray-500 truncate">{book.author}</p>
                </div>
              </div>
            ))}
          </div>

          {library.length === 0 && !isProcessing && (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
              <Icons.Library size={48} className="text-stone-300 mb-4" />
              <p className="text-lg text-stone-500 font-medium">{t('empty_library')}</p>
              <p className="text-sm text-stone-400">{t('empty_desc')}</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  // Reader View
  if (view === 'reader' && activeBook) {
    return (
      <div className={`h-screen w-full flex flex-col overflow-hidden relative ${theme === 'dark' ? 'bg-[#202020]' : 'bg-stone-50'}`}>
        {/* App Header */}
        <header className={`flex-none h-16 px-4 sm:px-6 border-b z-20 shadow-sm flex items-center justify-between transition-colors ${
            theme === 'dark' 
            ? 'bg-[#1a1a1a] border-gray-800 text-gray-200' 
            : 'bg-white border-stone-200 text-gray-800'
        }`}>
          <div className="flex items-center gap-3 overflow-hidden">
              <button 
                onClick={handleBackToLibrary}
                className={`p-2 -ml-2 rounded-full transition-colors ${
                    theme === 'dark' ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-stone-100 text-stone-500'
                }`}
                title={t('back')}
              >
                <Icons.Prev size={24} />
              </button>
              <div className={`h-6 w-px mx-1 ${theme === 'dark' ? 'bg-gray-700' : 'bg-stone-300'}`}></div>
              <div className="flex flex-col min-w-0">
                  <span className={`font-serif font-bold truncate leading-tight ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
                    {activeBook.title}
                  </span>
                  <span className={`text-xs truncate ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                    {activeBook.author}
                  </span>
              </div>
          </div>
          
          <div className="flex items-center gap-3">
             {/* Bookmarks Toggle */}
             <button
                onClick={toggleBookmark}
                className={`p-2 rounded-full transition-colors ${
                  isCurrentPageBookmarked 
                    ? 'bg-indigo-50 text-indigo-600' 
                    : theme === 'dark' ? 'text-gray-400 hover:bg-gray-800' : 'text-stone-500 hover:bg-stone-100'
                }`}
                title={isCurrentPageBookmarked ? "Remove bookmark" : "Bookmark this page"}
             >
                 <Icons.Bookmark size={20} fill={isCurrentPageBookmarked ? "currentColor" : "none"} />
             </button>

             {/* Menu / Bookmarks List */}
             <button
                onClick={() => setShowBookmarks(!showBookmarks)}
                className={`p-2 rounded-full transition-colors ${
                  showBookmarks 
                    ? theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-stone-200 text-gray-800' 
                    : theme === 'dark' ? 'text-gray-400 hover:bg-gray-800' : 'text-stone-500 hover:bg-stone-100'
                }`}
                title="Table of Contents & Bookmarks"
             >
                 <Icons.List size={20} />
             </button>

             {/* Display Settings Toggle */}
             <div className="relative">
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-2 rounded-full transition-colors ${
                    showSettings
                    ? theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-stone-200 text-gray-800' 
                    : theme === 'dark' ? 'text-gray-400 hover:bg-gray-800' : 'text-stone-500 hover:bg-stone-100'
                  }`}
                  title="Display Settings"
                >
                    <Icons.Palette size={20} />
                </button>

                {/* Settings Popover */}
                {showSettings && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-50">
                        <div className="space-y-4">
                            {/* Font Size */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('font_size')}</p>
                                <div className="flex items-center justify-between bg-stone-100 rounded-lg p-1">
                                    <button 
                                        onClick={decreaseFontSize}
                                        className="p-2 hover:bg-white hover:shadow-sm rounded-md text-gray-600 transition-all disabled:opacity-50"
                                        disabled={fontSize <= 60}
                                    >
                                        <Icons.Minus size={16} />
                                    </button>
                                    <span className="text-sm font-semibold text-gray-700 w-12 text-center">
                                        {fontSize}%
                                    </span>
                                    <button 
                                        onClick={increaseFontSize}
                                        className="p-2 hover:bg-white hover:shadow-sm rounded-md text-gray-600 transition-all disabled:opacity-50"
                                        disabled={fontSize >= 200}
                                    >
                                        <Icons.Plus size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Theme */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('theme')}</p>
                                <div className="grid grid-cols-3 gap-2">
                                    <button 
                                        onClick={() => setTheme('light')}
                                        className={`h-10 rounded-lg border flex items-center justify-center transition-all ${
                                            theme === 'light' ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                        title={t('light')}
                                    >
                                        <div className="w-6 h-6 rounded-full bg-white border border-gray-200" />
                                    </button>
                                    <button 
                                        onClick={() => setTheme('sepia')}
                                        className={`h-10 rounded-lg border flex items-center justify-center transition-all ${
                                            theme === 'sepia' ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-orange-100 hover:border-orange-200'
                                        } bg-[#f6ead5]`}
                                        title={t('sepia')}
                                    >
                                        <div className="w-6 h-6 rounded-full bg-[#5f4b32]" />
                                    </button>
                                    <button 
                                        onClick={() => setTheme('dark')}
                                        className={`h-10 rounded-lg border flex items-center justify-center transition-all ${
                                            theme === 'dark' ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-gray-700 hover:border-gray-600'
                                        } bg-[#202020]`}
                                        title={t('dark')}
                                    >
                                        <div className="w-6 h-6 rounded-full bg-gray-600" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
             </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 relative overflow-hidden">
          {/* We use a key here to force re-render when book changes to ensure clean epubjs state */}
          <Reader 
            key={activeBook.id} 
            file={activeBook.file} 
            onTextSelected={handleTextSelected} 
            fontSize={fontSize}
            theme={theme}
            location={targetLocation}
            onLocationChange={handleLocationChange}
          />

          {/* Bookmarks & Menu Sidebar/Drawer */}
          {showBookmarks && (
            <div className={`absolute inset-y-0 right-0 w-80 shadow-2xl z-30 transform transition-transform border-l flex flex-col ${
                theme === 'dark' ? 'bg-[#1a1a1a] border-gray-800 text-gray-200' : 'bg-white border-stone-200 text-gray-800'
            }`}>
                <div className={`p-4 border-b flex items-center justify-between ${
                    theme === 'dark' ? 'bg-[#202020] border-gray-800' : 'bg-stone-50 border-stone-100'
                }`}>
                    <h3 className="font-semibold flex items-center gap-2">
                        <Icons.Bookmark size={18} /> {t('bookmarks')}
                    </h3>
                    <button onClick={() => setShowBookmarks(false)} className={`${theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-stone-400 hover:text-stone-600'}`}>
                        <Icons.Close size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {currentBookBookmarks.length === 0 ? (
                        <div className={`text-center py-10 ${theme === 'dark' ? 'text-gray-600' : 'text-stone-400'}`}>
                            <Icons.Bookmark size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">{t('no_bookmarks')}</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {currentBookBookmarks.map(b => (
                                <div key={b.id} className={`group flex items-start p-3 rounded-lg transition-colors border border-transparent ${
                                    theme === 'dark' ? 'hover:bg-gray-800 hover:border-gray-700' : 'hover:bg-stone-50 hover:border-stone-100'
                                }`}>
                                    <button 
                                        onClick={() => goToBookmark(b.cfi)}
                                        className="flex-1 text-left"
                                    >
                                        <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>{b.label}</p>
                                        <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>{new Date(b.timestamp).toLocaleDateString()}</p>
                                    </button>
                                    <button 
                                        onClick={() => removeBookmark(b.id)}
                                        className="p-1.5 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                                        title="Delete bookmark"
                                    >
                                        <Icons.Clear size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
          )}
        </main>

        {/* AI Chat Overlay */}
        <ChatWidget 
            selection={selection} 
            onClearSelection={clearSelection} 
            isPro={user?.isPro || false}
            onUpgrade={navigateToProfile}
        />
      </div>
    );
  }

  return null;
}

export default App;