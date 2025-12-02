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

    // Get container dimensions for proper sizing
    const container = viewerRef.current;
    const containerWidth = container.clientWidth || window.innerWidth;
    const containerHeight = container.clientHeight || window.innerHeight;

    // Render book - use spread: 'none' to get single page view that fills the screen
    // This works better for iPad/tablet responsive design
    const rendition = book.renderTo(viewerRef.current, {
      width: containerWidth,
      height: containerHeight,
      flow: 'paginated',
      manager: 'default',
      spread: 'none', // Force single page view for consistent full-width rendering
    });
    renditionRef.current = rendition;

    // Handle window resize for responsive behavior
    const handleResize = () => {
      if (renditionRef.current && viewerRef.current) {
        const newWidth = viewerRef.current.clientWidth || window.innerWidth;
        const newHeight = viewerRef.current.clientHeight || window.innerHeight;
        renditionRef.current.resize(newWidth, newHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    // Also handle orientation changes on mobile devices
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 100); // Delay to allow DOM to update
    });

    // Display
    rendition.display(location || undefined);

    // Use hooks to inject CSS into each content document as it loads
    // This is more reliable than themes.default() for complex CSS
    rendition.hooks.content.register((contents: any) => {
      // Inject CSS for responsive layout
      // Bottom padding is 80px to avoid text being hidden behind navigation controls
      const css = `
        html, body {
          width: 100% !important;
          max-width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
        }
        body {
          padding: 20px 5% 80px 5% !important;
        }
        /* Force images to scale properly */
        img {
          max-width: 100% !important;
          width: auto !important;
          height: auto !important;
          display: block !important;
          margin: 0 auto !important;
        }
        /* Cover images specifically */
        img[src*="cover"], img.cover, .cover img {
          max-height: 80vh !important;
          width: auto !important;
          margin: 0 auto !important;
        }
        svg {
          max-width: 100% !important;
          height: auto !important;
        }
        /* Ensure container elements fill width */
        div, section, article {
          max-width: 100% !important;
        }
        /* Text selection */
        ::selection { background: #3b82f6; color: #fff; }
        ::-moz-selection { background: #3b82f6; color: #fff; }
      `;
      contents.addStylesheetRules(css);
    });

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
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (bookRef.current) {
        bookRef.current.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Handle Font Size Changes - must resize and redisplay to recalculate page layout
  useEffect(() => {
    if (renditionRef.current && viewerRef.current) {
        const rendition = renditionRef.current;

        // Apply the new font size
        rendition.themes.fontSize(`${fontSize}%`);

        // Force layout recalculation by resizing
        // This is critical - without this, the content gets cut off when font size increases
        const container = viewerRef.current;
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;

        // Small timeout to let the font size CSS apply first, then resize
        setTimeout(() => {
          if (renditionRef.current) {
            renditionRef.current.resize(width, height);

            // Redisplay at current location to recalculate page breaks
            if (currentLocation) {
              renditionRef.current.display(currentLocation);
            }
          }
        }, 50);
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

      {/* Navigation Controls Overlay - positioned above safe area with proper spacing */}
      {/* bottom = 16px base + safe-area-inset-bottom (34px on iPhone with home indicator) */}
      <div
        className="absolute left-4 right-4 md:left-8 md:right-8 flex items-center justify-center gap-4 md:gap-6 pointer-events-none z-10"
        style={{
          bottom: 'calc(16px + env(safe-area-inset-bottom, 20px))',
        }}
      >
         <button
            onClick={prevPage}
            className={`pointer-events-auto p-3 md:p-4 backdrop-blur shadow-lg rounded-full transition-all transform hover:scale-110 active:scale-95 border min-w-[48px] min-h-[48px] md:min-w-[56px] md:min-h-[56px] flex items-center justify-center ${
                theme === 'dark'
                ? 'bg-gray-800/95 text-gray-200 border-gray-700 hover:bg-indigo-600 hover:text-white'
                : 'bg-white/95 text-stone-700 border-stone-200 hover:bg-indigo-600 hover:text-white'
            }`}
            aria-label="Previous Page"
         >
            <Icons.Prev size={24} />
         </button>

         {/* Page Indicator */}
         <div className={`pointer-events-auto px-5 py-2.5 md:px-6 md:py-3 backdrop-blur shadow-lg rounded-full text-sm md:text-base font-semibold border min-w-[110px] md:min-w-[140px] text-center select-none flex flex-col items-center leading-tight ${
             theme === 'dark'
             ? 'bg-gray-800/95 text-gray-200 border-gray-700'
             : 'bg-white/95 text-stone-600 border-stone-200'
         }`}>
            {isLocationsReady ? (
                <>
                    <span className={theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}>{t('page')} {currentPage}</span>
                    <span className="text-[10px] md:text-xs opacity-60 uppercase tracking-wider">{t('of')} {totalPages}</span>
                </>
            ) : (
                <span className="animate-pulse text-xs md:text-sm">{t('calculating')}</span>
            )}
         </div>

         <button
            onClick={nextPage}
            className={`pointer-events-auto p-3 md:p-4 backdrop-blur shadow-lg rounded-full transition-all transform hover:scale-110 active:scale-95 border min-w-[48px] min-h-[48px] md:min-w-[56px] md:min-h-[56px] flex items-center justify-center ${
                theme === 'dark'
                ? 'bg-gray-800/95 text-gray-200 border-gray-700 hover:bg-indigo-600 hover:text-white'
                : 'bg-white/95 text-stone-700 border-stone-200 hover:bg-indigo-600 hover:text-white'
            }`}
            aria-label="Next Page"
         >
            <Icons.Next size={24} />
         </button>
      </div>
    </div>
  );
};