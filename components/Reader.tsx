import React, { useEffect, useRef, useState } from 'react';
import ePub, { Book, Rendition } from 'epubjs';
import { Icons } from './ui/Icons';
import { SelectionData } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface ReaderProps {
  // The EPUB file content. For newly uploaded books this is a File;
  // for books loaded from Firestore it is an ArrayBuffer. It may be
  // null briefly while the app is still downloading the file.
  file: File | ArrayBuffer | null;
  onTextSelected: (selection: SelectionData | null) => void;
  fontSize: number;
  theme: 'light' | 'sepia' | 'dark';
  location?: string | null;
  onLocationChange?: (cfi: string) => void;
}

export const Reader: React.FC<ReaderProps> = ({ file, onTextSelected, fontSize, theme, location, onLocationChange }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const { t } = useLanguage();
  
  const [isReady, setIsReady] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [toc, setToc] = useState<any[]>([]);

  // Page tracking state
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLocationsReady, setIsLocationsReady] = useState(false);

  useEffect(() => {
    if (!viewerRef.current || !file) return;

    // Initialize book
    const book = ePub(file);
    bookRef.current = book;

    // Render book
    const rendition = book.renderTo(viewerRef.current, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      manager: 'default',
    });
    renditionRef.current = rendition;

    // Display
    rendition.display(location || undefined);

    // Event Listeners
    rendition.on('rendered', () => {
      setIsReady(true);

      // Register Themes
      rendition.themes.register('light', {
        body: { color: '#111', background: '#fff' }
      });
      rendition.themes.register('sepia', {
        body: { color: '#5f4b32', background: '#f6ead5' }
      });
      rendition.themes.register('dark', {
        body: { color: '#dbdbdb', background: '#202020' }
      });

      // Inject custom CSS for text selection highlighting
      const selectionCSS = `
        ::selection { background: #3b82f6 !important; color: #fff !important; }
        ::-moz-selection { background: #3b82f6 !important; color: #fff !important; }
        .epubjs-hl { fill: #fbbf24; fill-opacity: 0.4; mix-blend-mode: multiply; }
      `;
      rendition.themes.default({
        '::selection': { background: '#3b82f6', color: '#fff' },
        '::-moz-selection': { background: '#3b82f6', color: '#fff' }
      });

      // Apply initial settings
      rendition.themes.fontSize(`${fontSize}%`);
      rendition.themes.select(theme);
    });

    rendition.on('relocated', (loc: any) => {
      const cfi = loc.start.cfi;
      setCurrentLocation(cfi);
      if (onLocationChange) {
        onLocationChange(cfi);
      }

      // Update current page if locations are generated
      if (book.locations.length() > 0) {
        const current = book.locations.locationFromCfi(cfi);
        setCurrentPage(current + 1);
      }
    });

    // Handle Selection
    rendition.on('selected', (cfiRange: string, contents: any) => {
        book.getRange(cfiRange).then((range) => {
            const text = range.toString();
            const cleanText = text.replace(/\s+/g, ' ').trim();
            
            if (cleanText.length > 0) {
                console.log("Selected:", cleanText);
                onTextSelected({
                    text: cleanText,
                    cfiRange: cfiRange
                });
            }
        });
        rendition.annotations.add('highlight', cfiRange, {}, null, 'hl');
    });
    
    // Clear selection when clicking elsewhere
    rendition.on('click', () => {
         // This is tricky in epubjs, sometimes click clears selection, sometimes not.
         // We'll rely on the user manually clearing or selecting new text.
    });

    // Load TOC
    book.loaded.navigation.then((nav) => {
      setToc(nav.toc);
    });

    // Generate locations for page numbers
    book.ready.then(() => {
      // 1000 chars is a standard approximation for a "page" in epubjs
      return book.locations.generate(1000); 
    }).then(() => {
       setTotalPages(book.locations.total);
       setIsLocationsReady(true);

       // If we are already displayed, update current page
       if (rendition.location) {
           const current = book.locations.locationFromCfi(rendition.location.start.cfi);
           setCurrentPage(current + 1);
       }
    }).catch(err => {
        console.error("Error generating locations:", err);
    });

    return () => {
      if (bookRef.current) {
        bookRef.current.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Handle Font Size Changes
  useEffect(() => {
    if (renditionRef.current) {
        renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize]);

  // Handle Theme Changes
  useEffect(() => {
    if (renditionRef.current) {
        renditionRef.current.themes.select(theme);
    }
  }, [theme]);

  // Handle Location Changes via Props
  useEffect(() => {
    if (renditionRef.current && location && location !== currentLocation) {
      renditionRef.current.display(location);
    }
  }, [location]);

  // Navigation handlers
  const prevPage = () => renditionRef.current?.prev();
  const nextPage = () => renditionRef.current?.next();

  // Background Styles based on Theme
  const getContainerStyle = () => {
      switch(theme) {
          case 'sepia': return 'bg-[#f6ead5]';
          case 'dark': return 'bg-[#202020]';
          default: return 'bg-white';
      }
  };

  return (
    <div className={`flex flex-col h-full relative group transition-colors duration-300 ${getContainerStyle()}`}>
      {/* Reader Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* We apply the same background to the viewer container to avoid white flashes */}
        <div ref={viewerRef} className={`h-full w-full ${getContainerStyle()}`} />
        
        {!isReady && (
            <div className={`absolute inset-0 flex items-center justify-center z-10 ${getContainerStyle()}`}>
                <div className="text-center">
                    <Icons.Book className="w-12 h-12 text-gray-300 animate-pulse mx-auto mb-4" />
                    <p className="text-gray-500 font-serif">{t('opening')}</p>
                </div>
            </div>
        )}
      </div>

      {/* Navigation Controls Overlay (Desktop hover / Mobile permanent) */}
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4 pointer-events-none z-10">
         <button 
            onClick={prevPage}
            className={`pointer-events-auto p-3 backdrop-blur shadow-lg rounded-full transition-all transform hover:scale-110 active:scale-95 border ${
                theme === 'dark' 
                ? 'bg-gray-800/90 text-gray-200 border-gray-700 hover:bg-indigo-600 hover:text-white' 
                : 'bg-white/90 text-stone-700 border-stone-200 hover:bg-indigo-600 hover:text-white'
            }`}
            aria-label="Previous Page"
         >
            <Icons.Prev size={24} />
         </button>

         {/* Page Indicator */}
         <div className={`pointer-events-auto px-5 py-3 backdrop-blur shadow-lg rounded-full text-sm font-semibold border min-w-[120px] text-center select-none flex flex-col items-center leading-tight ${
             theme === 'dark'
             ? 'bg-gray-800/90 text-gray-200 border-gray-700'
             : 'bg-white/90 text-stone-600 border-stone-200'
         }`}>
            {isLocationsReady ? (
                <>
                    <span className={theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}>{t('page')} {currentPage}</span>
                    <span className="text-[10px] opacity-60 uppercase tracking-wider">{t('of')} {totalPages}</span>
                </>
            ) : (
                <span className="animate-pulse text-xs">{t('calculating')}</span>
            )}
         </div>

         <button 
            onClick={nextPage}
            className={`pointer-events-auto p-3 backdrop-blur shadow-lg rounded-full transition-all transform hover:scale-110 active:scale-95 border ${
                theme === 'dark' 
                ? 'bg-gray-800/90 text-gray-200 border-gray-700 hover:bg-indigo-600 hover:text-white' 
                : 'bg-white/90 text-stone-700 border-stone-200 hover:bg-indigo-600 hover:text-white'
            }`}
            aria-label="Next Page"
         >
            <Icons.Next size={24} />
         </button>
      </div>
    </div>
  );
};