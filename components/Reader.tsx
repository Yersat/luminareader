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
  isChatOpen?: boolean; // Hide navigation when chat is open
}

export const Reader: React.FC<ReaderProps> = ({ file, onTextSelected, fontSize, theme, location, onLocationChange, isChatOpen = false }) => {
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

  // Page indicator visibility state (auto-hide after 2 seconds)
  const [showPageIndicator, setShowPageIndicator] = useState(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Ref to track isChatOpen state inside event handlers
  const isChatOpenRef = useRef(isChatOpen);
  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  // Ref to call showIndicatorTemporarily from event handlers
  const showIndicatorRef = useRef<(() => void) | null>(null);

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
      allowScriptedContent: true, // Required for text selection events on iOS
      allowPopups: true, // Allow selection popups on iOS
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
      // Bottom padding reduced since we use tap navigation now (just small margin for page indicator)
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
          padding: 20px 5% 50px 5% !important;
          /* Enable text selection on iOS */
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
          -webkit-touch-callout: default !important;
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
        /* Enable text selection on all text elements */
        p, span, div, h1, h2, h3, h4, h5, h6, a, li, td, th, blockquote {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
        }
        /* Text selection styling */
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
    
    // Handle tap navigation inside the epub iframe (like iBooks)
    // This allows text selection to work naturally while still enabling tap navigation
    rendition.on('click', (e: MouseEvent) => {
      // Don't navigate if chat is open
      if (isChatOpenRef.current) return;

      // Don't navigate if there's a text selection active (inside the iframe)
      const iframeDoc = (e.target as HTMLElement)?.ownerDocument;
      const selection = iframeDoc?.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        return; // User is selecting text, don't navigate
      }

      // Get tap position relative to viewport
      const viewportWidth = window.innerWidth;
      const tapX = e.clientX;
      const tapPercent = tapX / viewportWidth;

      // Left 35% = previous page, Right 35% = next page
      if (tapPercent < 0.35) {
        rendition.prev();
        showIndicatorRef.current?.();
      } else if (tapPercent > 0.65) {
        rendition.next();
        showIndicatorRef.current?.();
      }
      // Center tap does nothing (allows normal interaction with content)
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

  // Navigation handlers with page indicator show/hide
  const showIndicatorTemporarily = () => {
    setShowPageIndicator(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setShowPageIndicator(false);
    }, 2000); // Hide after 2 seconds
  };

  // Set the ref so event handlers can call this function
  showIndicatorRef.current = showIndicatorTemporarily;

  const prevPage = () => {
    renditionRef.current?.prev();
    showIndicatorTemporarily();
  };

  const nextPage = () => {
    renditionRef.current?.next();
    showIndicatorTemporarily();
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

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
      {/* Reader Area - tap navigation is handled via epubjs click events */}
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

      {/* Page Indicator - Auto-hiding, non-intrusive */}
      {/* Hidden when chat is open to avoid blocking the chat input */}
      {!isChatOpen && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 pointer-events-none z-30 transition-all duration-300 ${
            showPageIndicator ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{
            bottom: 'calc(16px + env(safe-area-inset-bottom, 20px))',
          }}
        >
           {/* Page Indicator - compact pill design */}
           <div className={`px-4 py-2 backdrop-blur-sm shadow-md rounded-full text-sm font-medium border select-none flex items-center gap-1.5 ${
               theme === 'dark'
               ? 'bg-gray-800/80 text-gray-300 border-gray-700/50'
               : 'bg-white/80 text-stone-500 border-stone-200/50'
           }`}>
              {isLocationsReady ? (
                  <>
                      <span className={theme === 'dark' ? 'text-gray-100' : 'text-gray-700'}>{currentPage}</span>
                      <span className="opacity-50">/</span>
                      <span className="opacity-70">{totalPages}</span>
                  </>
              ) : (
                  <span className="animate-pulse text-xs">{t('calculating')}</span>
              )}
           </div>
        </div>
      )}
    </div>
  );
};