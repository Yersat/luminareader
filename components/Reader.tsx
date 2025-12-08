import React, { useEffect, useRef, useState, useCallback } from 'react';
import ePub, { Book, Rendition } from 'epubjs';
import { Icons } from './ui/Icons';
import { SelectionData } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

// Debug logging helper for page indicator updates
const logPageIndicator = (stage: string, data?: any) => {
  const timestamp = new Date().toISOString().split('T')[1];
  console.log(`[PageIndicator ${timestamp}] ${stage}`, data !== undefined ? data : '');
};

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

  // Progress tracking state (page-based)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLocationsReady, setIsLocationsReady] = useState(false);

  // Chapter progress tracking (like iBooks)
  const [pagesLeftInChapter, setPagesLeftInChapter] = useState<number | null>(null);
  const [currentChapterName, setCurrentChapterName] = useState<string>('');

  // Page indicator visibility state (auto-hide after 2 seconds)
  const [showPageIndicator, setShowPageIndicator] = useState(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Ref for pending page update (to debounce and make non-blocking)
  const pendingPageRef = useRef<number | null>(null);
  const pageUpdateScheduledRef = useRef<boolean>(false);

  // Non-blocking page update using requestAnimationFrame
  const updatePageNonBlocking = useCallback((newPage: number) => {
    pendingPageRef.current = newPage;

    if (!pageUpdateScheduledRef.current) {
      pageUpdateScheduledRef.current = true;
      requestAnimationFrame(() => {
        if (pendingPageRef.current !== null) {
          setCurrentPage(pendingPageRef.current);
          pendingPageRef.current = null;
        }
        pageUpdateScheduledRef.current = false;
      });
    }
  }, []);

  // Ref to track isChatOpen state inside event handlers
  const isChatOpenRef = useRef(isChatOpen);
  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  // Ref to call showIndicatorTemporarily from event handlers
  const showIndicatorRef = useRef<(() => void) | null>(null);

  // Ref to prevent rapid navigation - tracks last navigation time
  const lastNavigationTimeRef = useRef<number>(0);

  // Ref to track current location index for location-based navigation
  const currentLocationIndexRef = useRef<number>(0);
  // Ref to track if navigation is in progress (to prevent overlapping navigations)
  const isNavigatingRef = useRef<boolean>(false);
	  
	  // Debug: track the last location index we explicitly requested via tap
	  const lastRequestedLocationIndexRef = useRef<number | null>(null);

  // Refs to track the current viewport's start and end location indices
  // These come directly from the `loc.start.location` / `loc.end.location`
  // values emitted by epub.js in the `relocated` event. We use them to
  // ensure that NEXT/PREV taps move to the *next/previous viewport*, not
  // just to another location that is still inside the same viewport.
  const currentStartLocationRef = useRef<number | null>(null);
  const currentEndLocationRef = useRef<number | null>(null);

	  // Debug: track the last relocated viewport range so we can detect
	  // when we request a new location but epub.js reports the *same*
	  // start/end indices again ("stuck" behavior).
	  const lastRelocatedStartRef = useRef<number | null>(null);
	  const lastRelocatedEndRef = useRef<number | null>(null);

	  // Debug: track epub.js's own idea of the current page within the
	  // chapter (displayed.page / displayed.total). This lets the tap
	  // handler log what page we were on before a navigation attempt.
	  const currentDisplayedPageRef = useRef<number | null>(null);
	  const currentDisplayedTotalRef = useRef<number | null>(null);

  // Ref to store chapter location indices for efficient lookup
  // Each entry contains: { href, label, startLocationIndex, endLocationIndex }
  const chapterLocationsRef = useRef<Array<{
    href: string;
    label: string;
    startLocationIndex: number;
    endLocationIndex: number;
  }>>([]);

  // ========== CSS TRANSFORM-BASED PAGINATION ==========
  // Since epub.js's scroll-based pagination doesn't work in WKWebView,
  // we implement our own pagination using CSS transforms.
  // This tracks the current "visual page" within the current section.
  const sectionPageRef = useRef<number>(1);       // Current page within section (1-based)
  const sectionTotalPagesRef = useRef<number>(1); // Total pages in current section
  const containerWidthRef = useRef<number>(0);    // Width of one page/column
  const sectionStartGlobalPageRef = useRef<number>(1); // Global page number at start of this section

  // Apply CSS transform to show the correct page within a section
  const applyPageTransform = useCallback((pageNum: number) => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    const manager = (rendition as any).manager;
    if (!manager) return;

    // Get the iframe's document
    const views = manager.views;
    if (!views || !views._views || views._views.length === 0) return;

    const view = views._views[0];
    if (!view || !view.contents || !view.contents.document) return;

    const doc = view.contents.document;
    const body = doc.body;
    if (!body) return;

    // Calculate the offset - each page is containerWidth wide
    const containerWidth = containerWidthRef.current || manager.container?.clientWidth || 440;
    const offset = (pageNum - 1) * containerWidth;

    console.log(`[TRANSFORM] Applying transform for page ${pageNum}, offset=${offset}px, containerWidth=${containerWidth}`);

    // Apply the transform to the documentElement (html element) for better cross-browser support
    const htmlEl = doc.documentElement;
    if (htmlEl) {
      htmlEl.style.transform = `translateX(-${offset}px)`;
      htmlEl.style.transition = 'transform 0.2s ease-out';
      console.log(`[TRANSFORM] Applied translateX(-${offset}px) to documentElement`);
    }

    // Update the ref
    sectionPageRef.current = pageNum;
  }, []);

  // Navigate to next page within section, or next section if at end
  const goToNextPage = useCallback(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    const currentPage = sectionPageRef.current;
    const totalPages = sectionTotalPagesRef.current;
    const timestamp = new Date().toISOString();

    console.log(`[TRANSFORM_NAV ${timestamp}] ========== NEXT PAGE ==========`);
    console.log(`[TRANSFORM_NAV ${timestamp}] Current: section page ${currentPage} of ${totalPages}, sectionStart=${sectionStartGlobalPageRef.current}`);

    if (currentPage < totalPages) {
      // Can go to next page within this section
      const newPage = currentPage + 1;
      console.log(`[TRANSFORM_NAV ${timestamp}] Moving to page ${newPage} within section`);
      applyPageTransform(newPage);

      // Calculate global page using our stored section start + offset
      // sectionStartGlobalPageRef is the global page when section starts (page 1 of section)
      // So page 2 of section = sectionStart + 1, page 3 = sectionStart + 2, etc.
      const newGlobalPage = sectionStartGlobalPageRef.current + (newPage - 1);
      updatePageNonBlocking(newGlobalPage);
      console.log(`[TRANSFORM_NAV ${timestamp}] Updated global page to ${newGlobalPage} (sectionStart=${sectionStartGlobalPageRef.current} + offset=${newPage - 1})`);
    } else {
      // At end of section, go to next section/chapter
      console.log(`[TRANSFORM_NAV ${timestamp}] At end of section, calling rendition.next()`);
      rendition.next().then(() => {
        // Reset to page 1 of new section
        // Note: sectionStartGlobalPageRef will be updated by the relocated event
        sectionPageRef.current = 1;
        applyPageTransform(1);
        console.log(`[TRANSFORM_NAV ${timestamp}] Moved to next section, reset to page 1`);
      });
    }
  }, [applyPageTransform, updatePageNonBlocking]);

  // Navigate to previous page within section, or previous section if at start
  const goToPrevPage = useCallback(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    const currentPage = sectionPageRef.current;
    const timestamp = new Date().toISOString();

    console.log(`[TRANSFORM_NAV ${timestamp}] ========== PREV PAGE ==========`);
    console.log(`[TRANSFORM_NAV ${timestamp}] Current: section page ${currentPage} of ${sectionTotalPagesRef.current}, sectionStart=${sectionStartGlobalPageRef.current}`);

    if (currentPage > 1) {
      // Can go to previous page within this section
      const newPage = currentPage - 1;
      console.log(`[TRANSFORM_NAV ${timestamp}] Moving to page ${newPage} within section`);
      applyPageTransform(newPage);

      // Calculate global page using our stored section start + offset
      const newGlobalPage = sectionStartGlobalPageRef.current + (newPage - 1);
      updatePageNonBlocking(newGlobalPage);
      console.log(`[TRANSFORM_NAV ${timestamp}] Updated global page to ${newGlobalPage} (sectionStart=${sectionStartGlobalPageRef.current} + offset=${newPage - 1})`);
    } else {
      // At start of section, go to previous section/chapter
      console.log(`[TRANSFORM_NAV ${timestamp}] At start of section, calling rendition.prev()`);
      rendition.prev().then(() => {
        // Go to last page of previous section
        // Note: sectionStartGlobalPageRef will be updated by the relocated event
        // Then we need to apply transform to the last page of that section
        const loc = rendition.currentLocation();
        const total = loc?.start?.displayed?.total || 1;
        sectionTotalPagesRef.current = total;
        sectionPageRef.current = total;
        applyPageTransform(total);

        // Update global page to last page of previous section
        // Wait a bit for relocated event to update sectionStartGlobalPageRef
        setTimeout(() => {
          const lastPageGlobal = sectionStartGlobalPageRef.current + (total - 1);
          updatePageNonBlocking(lastPageGlobal);
          console.log(`[TRANSFORM_NAV ${timestamp}] Moved to prev section last page, global=${lastPageGlobal}`);
        }, 50);
      });
    }
  }, [applyPageTransform, updatePageNonBlocking]);

  useEffect(() => {
    const initTimestamp = new Date().toISOString();
    console.log(`[INIT ${initTimestamp}] ========== READER INITIALIZATION START ==========`);
    console.log(`[INIT ${initTimestamp}] viewerRef.current exists: ${!!viewerRef.current}`);
    console.log(`[INIT ${initTimestamp}] file exists: ${!!file}`);
    console.log(`[INIT ${initTimestamp}] file type: ${typeof file}`);

    if (!viewerRef.current || !file) {
      console.log(`[INIT ${initTimestamp}] ABORT: Missing viewerRef or file`);
      return;
    }

    // Global error handler for epub.js errors (Safari URL parsing issues)
    const handleGlobalError = (event: ErrorEvent) => {
      const errorTimestamp = new Date().toISOString();
      console.log(`[GLOBAL_ERROR ${errorTimestamp}] Error caught: ${event.message}`);
      console.log(`[GLOBAL_ERROR ${errorTimestamp}] Filename: ${event.filename}`);
      console.log(`[GLOBAL_ERROR ${errorTimestamp}] Line: ${event.lineno}, Col: ${event.colno}`);

      if (event.message && event.message.includes('did not match')) {
        console.log(`[GLOBAL_ERROR ${errorTimestamp}] Ignoring 'did not match' error (epub.js Safari issue)`);
        event.preventDefault();
        return true;
      }
    };
    window.addEventListener('error', handleGlobalError);

    // Initialize book
    console.log(`[INIT ${initTimestamp}] Creating ePub instance...`);
    const book = ePub(file);
    bookRef.current = book;
    console.log(`[INIT ${initTimestamp}] ePub instance created`);

    // Get container dimensions for proper sizing
    const container = viewerRef.current;
    const containerWidth = container.clientWidth || window.innerWidth;
    // IMPORTANT: Subtract space for the navigation bar at the bottom
    // The nav bar takes about 60px + safe area inset
    // We need to tell epub.js that the available height is LESS than the container
    // so it calculates pagination correctly
    const navBarHeight = 80; // Navigation controls height + some padding
    const rawContainerHeight = container.clientHeight || window.innerHeight;
    const containerHeight = rawContainerHeight - navBarHeight;

    console.log(`[INIT ${initTimestamp}] Container dimensions: width=${containerWidth}, rawHeight=${rawContainerHeight}, adjustedHeight=${containerHeight} (navBarHeight=${navBarHeight})`);

    // Use 'paginated' flow with 'default' manager
    // We'll implement manual page-by-page scrolling within sections
    console.log(`[INIT ${initTimestamp}] Creating rendition with paginated flow and default manager...`);
    const rendition = book.renderTo(viewerRef.current, {
      width: containerWidth,
      height: containerHeight,
      flow: 'paginated',
      manager: 'default',
      spread: 'none',
      snap: true,  // Enable snap scrolling between pages
      allowScriptedContent: true,
      allowPopups: true,
    });
    renditionRef.current = rendition;
    console.log(`[INIT ${initTimestamp}] Rendition created successfully`);

    // Handle window resize for responsive behavior
    const handleResize = () => {
      const resizeTimestamp = new Date().toISOString();
      if (renditionRef.current && viewerRef.current) {
        try {
          const newWidth = viewerRef.current.clientWidth || window.innerWidth;
          const rawNewHeight = viewerRef.current.clientHeight || window.innerHeight;
          // Same adjustment as in init - subtract nav bar height
          const newHeight = rawNewHeight - navBarHeight;
          console.log(`[RESIZE ${resizeTimestamp}] Resizing to ${newWidth}x${newHeight} (raw=${rawNewHeight})`);
          renditionRef.current.resize(newWidth, newHeight);
        } catch (err) {
          console.log(`[RESIZE ${resizeTimestamp}] ERROR: ${err}`);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      console.log(`[ORIENTATION] Change detected, scheduling resize in 100ms`);
      setTimeout(handleResize, 100);
    });

    // Display
    console.log(`[INIT ${initTimestamp}] Calling rendition.display() with location: ${location || 'undefined'}`);
    rendition.display(location || undefined);

    // Use hooks to inject CSS into each content document as it loads
    // This is more reliable than themes.default() for complex CSS
    rendition.hooks.content.register((contents: any) => {
      // Inject CSS for responsive layout
      // IMPORTANT: Don't set height constraints on html/body as it breaks epub.js pagination
      // epub.js needs content to flow naturally so it can calculate page breaks
      const css = `
        html {
          margin: 0 !important;
          padding: 0 !important;
        }
        body {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 20px 5% 50px 5% !important;
          box-sizing: border-box !important;
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
    rendition.on('rendered', (section: any) => {
      const renderedTimestamp = new Date().toISOString();
      console.log(`[RENDERED ${renderedTimestamp}] ========== CONTENT RENDERED ==========`);

      // Debug: Log the actual rendered dimensions
      try {
        const manager = (rendition as any).manager;
        if (manager) {
          console.log(`[RENDERED ${renderedTimestamp}] Manager exists`);
          console.log(`[RENDERED ${renderedTimestamp}] Manager width: ${manager.width}`);
          console.log(`[RENDERED ${renderedTimestamp}] Manager height: ${manager.height}`);

          // Check the container element
          const container = manager.container;
          if (container) {
            console.log(`[RENDERED ${renderedTimestamp}] Container clientWidth: ${container.clientWidth}`);
            console.log(`[RENDERED ${renderedTimestamp}] Container clientHeight: ${container.clientHeight}`);
            console.log(`[RENDERED ${renderedTimestamp}] Container offsetWidth: ${container.offsetWidth}`);
            console.log(`[RENDERED ${renderedTimestamp}] Container offsetHeight: ${container.offsetHeight}`);
          }

          // Check the stage element (where iframes are)
          const stage = manager.stage;
          if (stage) {
            console.log(`[RENDERED ${renderedTimestamp}] Stage width: ${stage.width}`);
            console.log(`[RENDERED ${renderedTimestamp}] Stage height: ${stage.height}`);
          }

          // Check current view
          const views = manager.views;
          if (views && views._views && views._views.length > 0) {
            const view = views._views[0];
            console.log(`[RENDERED ${renderedTimestamp}] View element width: ${view.element?.clientWidth}`);
            console.log(`[RENDERED ${renderedTimestamp}] View element height: ${view.element?.clientHeight}`);

            // Check iframe inside view
            const iframe = view.iframe;
            if (iframe) {
              console.log(`[RENDERED ${renderedTimestamp}] Iframe width: ${iframe.clientWidth}`);
              console.log(`[RENDERED ${renderedTimestamp}] Iframe height: ${iframe.clientHeight}`);
              console.log(`[RENDERED ${renderedTimestamp}] Iframe style.height: ${iframe.style.height}`);
            }
          }
        }

        // Also check section info
        if (section) {
          console.log(`[RENDERED ${renderedTimestamp}] Section href: ${section.href}`);
          console.log(`[RENDERED ${renderedTimestamp}] Section index: ${section.index}`);
        }
      } catch (e) {
        console.log(`[RENDERED ${renderedTimestamp}] Debug error: ${e}`);
      }
      console.log(`[RENDERED ${renderedTimestamp}] Setting isReady = true`);
      setIsReady(true);

      // Register Themes
      console.log(`[RENDERED ${renderedTimestamp}] Registering themes...`);
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
      console.log(`[RENDERED ${renderedTimestamp}] Applying fontSize=${fontSize}%, theme=${theme}`);
      rendition.themes.fontSize(`${fontSize}%`);
      rendition.themes.select(theme);
      console.log(`[RENDERED ${renderedTimestamp}] Render complete`);
    });

	    rendition.on('relocated', (loc: any) => {
      const relocatedTimestamp = new Date().toISOString();
      console.log(`[RELOCATED ${relocatedTimestamp}] ==========================================`);
      console.log(`[RELOCATED ${relocatedTimestamp}] ========== RELOCATED EVENT START ==========`);
      console.log(`[RELOCATED ${relocatedTimestamp}] ==========================================`);

      // Log previous state for comparison
      console.log(`[RELOCATED ${relocatedTimestamp}] === PREVIOUS REF STATE ===`);
      console.log(`[RELOCATED ${relocatedTimestamp}]   currentStartLocationRef: ${currentStartLocationRef.current}`);
      console.log(`[RELOCATED ${relocatedTimestamp}]   currentEndLocationRef: ${currentEndLocationRef.current}`);
      console.log(`[RELOCATED ${relocatedTimestamp}]   displayedPageRef: ${currentDisplayedPageRef.current} of ${currentDisplayedTotalRef.current}`);

      console.log(`[RELOCATED ${relocatedTimestamp}] === NEW LOCATION DATA ===`);
      console.log(`[RELOCATED ${relocatedTimestamp}] Section: ${loc?.start?.href}`);
      console.log(`[RELOCATED ${relocatedTimestamp}] Start location index: ${loc?.start?.location}`);
      console.log(`[RELOCATED ${relocatedTimestamp}] End location index: ${loc?.end?.location}`);
      console.log(`[RELOCATED ${relocatedTimestamp}] Displayed page: ${loc?.start?.displayed?.page} of ${loc?.start?.displayed?.total}`);
      console.log(`[RELOCATED ${relocatedTimestamp}] Start CFI: ${loc?.start?.cfi}`);
      console.log(`[RELOCATED ${relocatedTimestamp}] End CFI: ${loc?.end?.cfi}`);
      console.log(`[RELOCATED ${relocatedTimestamp}] atStart: ${loc?.atStart}, atEnd: ${loc?.atEnd}`);
      console.log(`[RELOCATED ${relocatedTimestamp}] Raw location object:`, JSON.stringify(loc, null, 2));

      try {
        const cfi = loc.start.cfi;
        console.log(`[RELOCATED ${relocatedTimestamp}] CFI: ${cfi}`);

        logPageIndicator('RELOCATED_BEFORE_SET_CURRENT_LOCATION');
        setCurrentLocation(cfi);
        logPageIndicator('RELOCATED_AFTER_SET_CURRENT_LOCATION');

        if (onLocationChange) {
          logPageIndicator('RELOCATED_BEFORE_ON_LOCATION_CHANGE');
          onLocationChange(cfi);
          logPageIndicator('RELOCATED_AFTER_ON_LOCATION_CHANGE');
        }

	        		// Update page number using epub.js locations
	        // Prefer the location indices provided by the relocated event itself
	        // (loc.start.location / loc.end.location). Fall back to
	        // book.locations.locationFromCfi(cfi) only if needed.
	        		if (book.locations && book.locations.length() > 0) {
	          const total = book.locations.length();

	        		  const startCfi = loc?.start?.cfi as string | undefined;
	        		  const endCfi = loc?.end?.cfi as string | undefined;
	        		  const startDisplayed = loc?.start?.displayed;
	        		  const endDisplayed = loc?.end?.displayed;

	          let startLocationIndex: number | null = null;
	          let endLocationIndex: number | null = null;
	          let derivedStartFromCfi: number | null = null;
	          let derivedEndFromCfi: number | null = null;

	          // Try to derive indices from CFI for debugging (even if loc.location is present)
	          if (startCfi) {
	            const n = book.locations.locationFromCfi(startCfi);
	            if (typeof n === 'number' && !Number.isNaN(n)) {
	              derivedStartFromCfi = n;
	            }
	          }
	          if (endCfi) {
	            const n = book.locations.locationFromCfi(endCfi);
	            if (typeof n === 'number' && !Number.isNaN(n)) {
	              derivedEndFromCfi = n;
	            }
	          }

	          // Primary source: indices provided by relocated event
	          if (loc && loc.start && typeof loc.start.location === 'number') {
	            startLocationIndex = loc.start.location;
	          }
	          if (loc && loc.end && typeof loc.end.location === 'number') {
	            endLocationIndex = loc.end.location;
	          }

	          // Fallback: derive from CFI if needed
	          if (startLocationIndex === null && derivedStartFromCfi !== null) {
	            startLocationIndex = derivedStartFromCfi;
	          }
	          if (endLocationIndex === null && derivedEndFromCfi !== null) {
	            endLocationIndex = derivedEndFromCfi;
	          }

	          // If end is still null, treat it as the same as start
	          if (endLocationIndex === null) {
	            endLocationIndex = startLocationIndex;
	          }

	        		  logPageIndicator('RELOCATED_PAGE_INFO', {
	        		    startLocationIndex,
	        		    endLocationIndex,
	        		    total,
	        		    cfi,
	        		    startCfi,
	        		    endCfi,
	        		    startDisplayed,
	        		    endDisplayed,
	        		    derivedStartFromCfi,
	        		    derivedEndFromCfi,
	        		    lastRequestedLocationIndex: lastRequestedLocationIndexRef.current,
	        		  });

	        		  // Debug: detect "stuck" behavior where we requested a
	        		  // location beyond the current viewport's end, but epub.js
	        		  // reports the *same* start/end indices again.
	        		  const prevStart = lastRelocatedStartRef.current;
	        		  const prevEnd = lastRelocatedEndRef.current;
	        		  if (
	        		    startLocationIndex !== null &&
	        		    endLocationIndex !== null &&
	        		    prevStart !== null &&
	        		    prevEnd !== null &&
	        		    prevStart === startLocationIndex &&
	        		    prevEnd === endLocationIndex &&
	        		    lastRequestedLocationIndexRef.current !== null &&
	        		    lastRequestedLocationIndexRef.current > endLocationIndex
	        		  ) {
	        		    logPageIndicator('RELOCATED_STUCK_DETECTED', {
	        		      startLocationIndex,
	        		      endLocationIndex,
	        		      prevStart,
	        		      prevEnd,
	        		      lastRequestedLocationIndex: lastRequestedLocationIndexRef.current,
	        		    });
	        		  }

	        		  // Remember this viewport range for the next relocated event
	        		  lastRelocatedStartRef.current = startLocationIndex;
	        		  lastRelocatedEndRef.current = endLocationIndex;

	        		  // Track epub.js's own idea of the page within the chapter
	        		  if (
	        		    startDisplayed &&
	        		    typeof startDisplayed.page === 'number' &&
	        		    typeof startDisplayed.total === 'number'
	        		  ) {
	        		    currentDisplayedPageRef.current = startDisplayed.page;
	        		    currentDisplayedTotalRef.current = startDisplayed.total;

              // ========== SYNC TRANSFORM-BASED PAGINATION ==========
              // When epub.js navigates to a new section (via rendition.next/prev),
              // we need to sync our transform-based pagination state.
              // Reset to page 1 and store the total pages for this section.
              sectionTotalPagesRef.current = startDisplayed.total;
              // Reset visual page to 1 and clear any transform
              sectionPageRef.current = 1;

              // IMPORTANT: Store the global page number for the START of this section
              // This is used for calculating global page when navigating within section
              // startLocationIndex is 0-based, so +1 gives us 1-based page number
              if (startLocationIndex !== null && startLocationIndex >= 0) {
                sectionStartGlobalPageRef.current = startLocationIndex + 1;
                console.log(`[RELOCATED] Set sectionStartGlobalPage to ${sectionStartGlobalPageRef.current} (from location ${startLocationIndex})`);
              }

              // Store container width for transform calculations
              const manager = (rendition as any).manager;
              if (manager?.container) {
                containerWidthRef.current = manager.container.clientWidth;
              }
              // Reset the transform (in case we navigated via rendition.next/prev)
              try {
                const views = manager?.views;
                if (views?._views?.length > 0) {
                  const view = views._views[0];
                  const doc = view?.contents?.document;
                  if (doc?.documentElement) {
                    doc.documentElement.style.transform = 'translateX(0)';
                    console.log(`[RELOCATED] Reset transform to translateX(0), section has ${startDisplayed.total} pages`);
                  }
                }
              } catch (e) {
                console.log(`[RELOCATED] Could not reset transform:`, e);
              }
	        		  }

	          // Sync the current viewport refs (for tap navigation)
	          const oldRefStart = currentStartLocationRef.current;
	          const oldRefEnd = currentEndLocationRef.current;

	          if (startLocationIndex !== null && startLocationIndex >= 0) {
	            currentStartLocationRef.current = startLocationIndex;
	            currentLocationIndexRef.current = startLocationIndex;
	          }
	          if (endLocationIndex !== null && endLocationIndex >= 0) {
	            currentEndLocationRef.current = endLocationIndex;
	          }

	          // Log the ref changes for debugging
	          console.log(`[RELOCATED] === REF UPDATES ===`);
	          console.log(`[RELOCATED]   startLocationRef: ${oldRefStart} -> ${currentStartLocationRef.current} (change: ${(currentStartLocationRef.current ?? 0) - (oldRefStart ?? 0)})`);
	          console.log(`[RELOCATED]   endLocationRef: ${oldRefEnd} -> ${currentEndLocationRef.current} (change: ${(currentEndLocationRef.current ?? 0) - (oldRefEnd ?? 0)})`);

	          // Check if this looks like a chapter jump
	          const locationChange = (currentStartLocationRef.current ?? 0) - (oldRefStart ?? 0);
	          if (Math.abs(locationChange) > 5) {
	            console.log(`[RELOCATED] ⚠️ LARGE JUMP DETECTED: ${locationChange} locations (possible chapter jump)`);
	          }

	          // Use the start location index as the basis for the displayed page
	          if (startLocationIndex !== null && startLocationIndex >= 0) {
	            // Location index is 0-based, display as 1-based page number
	            const pageNum = Math.max(1, startLocationIndex + 1);
	            logPageIndicator('RELOCATED_BEFORE_SET_PAGE', { pageNum, total });
	            updatePageNonBlocking(pageNum);
	            logPageIndicator('RELOCATED_AFTER_SET_PAGE');
	          }

	          // Calculate pages left in chapter using the current start index
	          const effectiveLocationIndex = startLocationIndex;
	          const chapters = chapterLocationsRef.current;
	          if (chapters.length > 0 && effectiveLocationIndex !== null) {
	            // Find which chapter we're in
	            let currentChapter = null as null | (typeof chapters)[number];
	            for (const chapter of chapters) {
	              if (effectiveLocationIndex >= chapter.startLocationIndex && effectiveLocationIndex <= chapter.endLocationIndex) {
	                currentChapter = chapter;
	                break;
	              }
	            }

	            if (currentChapter) {
	              const pagesLeft = currentChapter.endLocationIndex - effectiveLocationIndex;
	              setPagesLeftInChapter(Math.max(0, pagesLeft));
	              setCurrentChapterName(currentChapter.label);
	              logPageIndicator('CHAPTER_PROGRESS', {
	                chapter: currentChapter.label,
	                pagesLeft,
	                currentLoc: effectiveLocationIndex,
	                chapterEnd: currentChapter.endLocationIndex
	              });
	            } else {
	              // Not in a tracked chapter (might be front matter, etc.)
	              setPagesLeftInChapter(null);
	              setCurrentChapterName('');
	            }
	          }
	        }

        logPageIndicator('RELOCATED_EVENT_COMPLETE');
      } catch (error) {
        logPageIndicator('RELOCATED_EVENT_ERROR', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        // Don't re-throw - just log the error and continue
        console.error('Relocated event error:', error);
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
    // Using epub.js's native next()/prev() for reliable page-by-page navigation
    const clickHandler = (e: MouseEvent) => {
      const timestamp = new Date().toISOString();
      console.log(`[NAV ${timestamp}] ========== TAP EVENT START ==========`);
      const targetElement = e.target as HTMLElement;
      console.log(`[NAV ${timestamp}] Event type: ${e.type}, target: ${targetElement?.tagName}`);

      // Check if user clicked on a link (anchor tag) - let epub.js handle internal links
      // This is important for TOC pages which have many clickable chapter links
      const clickedLink = targetElement?.closest('a');
      if (clickedLink) {
        const href = clickedLink.getAttribute('href');
        console.log(`[NAV ${timestamp}] LINK_CLICKED: User clicked on a link`);
        console.log(`[NAV ${timestamp}] LINK_HREF: ${href}`);
        console.log(`[NAV ${timestamp}] ALLOWING: epub.js will handle internal link navigation`);
        console.log(`[NAV ${timestamp}] ========== TAP EVENT END (LINK CLICK) ==========`);
        // Don't prevent default - let epub.js handle the link click
        return;
      }

      // Log current state
      console.log(`[NAV ${timestamp}] STATE: {`);
      console.log(`  isChatOpen: ${isChatOpenRef.current}`);
      console.log(`  isNavigating: ${isNavigatingRef.current}`);
      console.log(`  lastNavigationTime: ${lastNavigationTimeRef.current}`);
      console.log(`  currentPage: ${currentStartLocationRef.current}`);
      console.log(`  rendition exists: ${!!rendition}`);
      console.log(`  book exists: ${!!book}`);
      console.log(`}`);

      // Don't navigate if chat is open
      if (isChatOpenRef.current) {
        console.log(`[NAV ${timestamp}] BLOCKED: Chat is open`);
        return;
      }

      // Don't navigate if there's a text selection active
      const iframeDoc = targetElement?.ownerDocument;
      const selection = iframeDoc?.getSelection();
      const selectionText = selection?.toString().trim() || '';
      if (selectionText.length > 0) {
        console.log(`[NAV ${timestamp}] BLOCKED: Text selection active: "${selectionText.substring(0, 50)}..."`);
        return;
      }

      // Time-based debounce
      const now = Date.now();
      const timeSinceLastNav = now - lastNavigationTimeRef.current;
      if (timeSinceLastNav < 200) {
        console.log(`[NAV ${timestamp}] BLOCKED: Debounce - only ${timeSinceLastNav}ms since last navigation`);
        return;
      }

      // Prevent overlapping navigations
      if (isNavigatingRef.current) {
        console.log(`[NAV ${timestamp}] BLOCKED: Navigation already in progress`);
        return;
      }

      // Get tap position
      const viewportWidth = window.innerWidth;
      const tapX = e.clientX;
      const tapPercent = tapX / viewportWidth;
      console.log(`[NAV ${timestamp}] TAP_POSITION: x=${tapX}, viewportWidth=${viewportWidth}, percent=${(tapPercent * 100).toFixed(1)}%`);

      // Only handle left/right taps (center is no action)
      if (tapPercent >= 0.35 && tapPercent <= 0.65) {
        console.log(`[NAV ${timestamp}] BLOCKED: Center tap (35-65%) - no navigation`);
        return;
      }

      lastNavigationTimeRef.current = now;
      const direction = tapPercent < 0.35 ? 'PREV' : 'NEXT';

      console.log(`[NAV ${timestamp}] DIRECTION: ${direction}`);
      console.log(`[NAV ${timestamp}] Setting isNavigating = true`);

      // Set navigation flag
      isNavigatingRef.current = true;

      // Log rendition state before navigation
      console.log(`[NAV ${timestamp}] RENDITION_STATE_BEFORE: {`);
      try {
        const currentLoc = rendition.location;
        console.log(`  location.start.cfi: ${currentLoc?.start?.cfi || 'N/A'}`);
        console.log(`  location.start.location: ${currentLoc?.start?.location ?? 'N/A'}`);
        console.log(`  location.end.location: ${currentLoc?.end?.location ?? 'N/A'}`);
        console.log(`  location.start.displayed: ${JSON.stringify(currentLoc?.start?.displayed) || 'N/A'}`);
      } catch (err) {
        console.log(`  ERROR getting location: ${err}`);
      }
      console.log(`}`);

      // Use epub.js's native next()/prev()
      console.log(`[NAV ${timestamp}] CALLING: rendition.${direction === 'NEXT' ? 'next' : 'prev'}()`);
      const navStartTime = Date.now();

      const navigationPromise = direction === 'NEXT' ? rendition.next() : rendition.prev();

      navigationPromise.then(() => {
        const navDuration = Date.now() - navStartTime;
        const completeTimestamp = new Date().toISOString();
        console.log(`[NAV ${completeTimestamp}] SUCCESS: Navigation ${direction} completed in ${navDuration}ms`);

        // Log rendition state after navigation
        console.log(`[NAV ${completeTimestamp}] RENDITION_STATE_AFTER: {`);
        try {
          const newLoc = rendition.location;
          console.log(`  location.start.cfi: ${newLoc?.start?.cfi || 'N/A'}`);
          console.log(`  location.start.location: ${newLoc?.start?.location ?? 'N/A'}`);
          console.log(`  location.end.location: ${newLoc?.end?.location ?? 'N/A'}`);
          console.log(`  location.start.displayed: ${JSON.stringify(newLoc?.start?.displayed) || 'N/A'}`);
        } catch (err) {
          console.log(`  ERROR getting location: ${err}`);
        }
        console.log(`}`);

        console.log(`[NAV ${completeTimestamp}] Setting isNavigating = false`);
        isNavigatingRef.current = false;
        console.log(`[NAV ${completeTimestamp}] ========== TAP EVENT END (SUCCESS) ==========`);
      }).catch((err: Error) => {
        const navDuration = Date.now() - navStartTime;
        const errorTimestamp = new Date().toISOString();
        console.log(`[NAV ${errorTimestamp}] ERROR: Navigation ${direction} failed after ${navDuration}ms`);
        console.log(`[NAV ${errorTimestamp}] ERROR_DETAILS: {`);
        console.log(`  message: ${err.message}`);
        console.log(`  name: ${err.name}`);
        console.log(`  stack: ${err.stack}`);
        console.log(`}`);
        console.log(`[NAV ${errorTimestamp}] Setting isNavigating = false`);
        isNavigatingRef.current = false;
        console.log(`[NAV ${errorTimestamp}] ========== TAP EVENT END (ERROR) ==========`);
      });

      showIndicatorRef.current?.();
    };

    console.log('[NAV INIT] Registering click handler on rendition');
    rendition.on('click', clickHandler);

    // Load TOC
    console.log(`[INIT] Loading TOC...`);
    book.loaded.navigation.then((nav) => {
      console.log(`[TOC] TOC loaded with ${nav.toc.length} items`);
      setToc(nav.toc);
    }).catch((err) => {
      console.log(`[TOC] ERROR loading TOC:`, err);
    });

    // Generate locations for page numbers
    console.log(`[LOCATIONS] Starting book.ready...`);
    book.ready.then(() => {
      console.log(`[LOCATIONS] Book ready, generating locations (1000 chars per page)...`);
      return book.locations.generate(1000);
    }).then(async () => {
       const total = book.locations.length();
       console.log(`[LOCATIONS] ========== LOCATIONS GENERATED ==========`);
       console.log(`[LOCATIONS] Total locations: ${total}`);
       setTotalPages(total);
       setIsLocationsReady(true);

       // Build chapter location index for "pages left in chapter" feature
       console.log(`[CHAPTERS] Building chapter location index...`);
       try {
         const nav = await book.loaded.navigation;
         const spine = await book.loaded.spine;
         console.log(`[CHAPTERS] Navigation and spine loaded`);

         // Flatten TOC (handle nested chapters)
         const flattenToc = (items: any[]): any[] => {
           let result: any[] = [];
           for (const item of items) {
             result.push(item);
             if (item.subitems && item.subitems.length > 0) {
               result = result.concat(flattenToc(item.subitems));
             }
           }
           return result;
         };

         const flatToc = flattenToc(nav.toc);
         console.log(`[CHAPTERS] Flat TOC has ${flatToc.length} items`);
         const chapterLocs: typeof chapterLocationsRef.current = [];

         for (let i = 0; i < flatToc.length; i++) {
           const tocItem = flatToc[i];
           const nextTocItem = flatToc[i + 1];

           // Get CFI for this chapter's start
           const spineItem = (spine as any).get(tocItem.href);
           if (spineItem) {
             const startCfi = spineItem.cfiBase;
             const startLoc = book.locations.locationFromCfi(startCfi) || 0;

             // Get end location (start of next chapter or end of book)
             let endLoc = total - 1;
             if (nextTocItem) {
               const nextSpineItem = (spine as any).get(nextTocItem.href);
               if (nextSpineItem) {
                 const nextCfi = nextSpineItem.cfiBase;
                 const nextLoc = book.locations.locationFromCfi(nextCfi);
                 if (nextLoc !== null && nextLoc > startLoc) {
                   endLoc = nextLoc - 1;
                 }
               }
             }

             chapterLocs.push({
               href: tocItem.href,
               label: tocItem.label,
               startLocationIndex: startLoc,
               endLocationIndex: endLoc
             });
           }
         }

         chapterLocationsRef.current = chapterLocs;
         console.log(`[CHAPTERS] Built ${chapterLocs.length} chapter location mappings`);
         logPageIndicator('CHAPTER_LOCATIONS_BUILT', { count: chapterLocs.length });
       } catch (err) {
         console.log(`[CHAPTERS] ERROR building chapter locations:`);
         console.log(`[CHAPTERS] Error type: ${(err as Error)?.name || 'unknown'}`);
         console.log(`[CHAPTERS] Error message: ${(err as Error)?.message || String(err)}`);
         console.log(`[CHAPTERS] Error stack: ${(err as Error)?.stack || 'N/A'}`);
       }

       // If we are already displayed, update current page
       if (rendition.location) {
           const cfi = rendition.location.start?.cfi;
           console.log(`[LOCATIONS] Current location CFI: ${cfi || 'N/A'}`);
           if (cfi) {
             const locationIndex = book.locations.locationFromCfi(cfi);
             console.log(`[LOCATIONS] Location index from CFI: ${locationIndex}`);
             setCurrentPage(Math.max(1, locationIndex + 1));
           }
       }
       console.log(`[LOCATIONS] ========== LOCATIONS SETUP COMPLETE ==========`);
    }).catch(err => {
        console.log(`[LOCATIONS] FATAL ERROR generating locations:`);
        console.log(`[LOCATIONS] Error type: ${(err as Error)?.name || 'unknown'}`);
        console.log(`[LOCATIONS] Error message: ${(err as Error)?.message || String(err)}`);
        console.log(`[LOCATIONS] Error stack: ${(err as Error)?.stack || 'N/A'}`);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.removeEventListener('error', handleGlobalError);
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
            try {
              renditionRef.current.resize(width, height);

              // Redisplay at current location to recalculate page breaks
              if (currentLocation) {
                renditionRef.current.display(currentLocation);
              }
            } catch (err) {
              // Ignore resize errors during navigation transitions
              console.log('Font size resize skipped during navigation');
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
  const showIndicatorTemporarily = useCallback(() => {
    logPageIndicator('SHOW_INDICATOR_TEMPORARILY_CALLED');

    // Use requestAnimationFrame to make this non-blocking
    requestAnimationFrame(() => {
      logPageIndicator('SHOW_INDICATOR_BEFORE_SET_TRUE');
      setShowPageIndicator(true);
      logPageIndicator('SHOW_INDICATOR_AFTER_SET_TRUE');

      if (hideTimerRef.current) {
        logPageIndicator('SHOW_INDICATOR_CLEARING_PREVIOUS_TIMER');
        clearTimeout(hideTimerRef.current);
      }

      logPageIndicator('SHOW_INDICATOR_SETTING_HIDE_TIMER');
      hideTimerRef.current = setTimeout(() => {
        logPageIndicator('SHOW_INDICATOR_HIDE_TIMER_FIRED');
        // Also make the hide non-blocking
        requestAnimationFrame(() => {
          setShowPageIndicator(false);
          logPageIndicator('SHOW_INDICATOR_HIDE_COMPLETE');
        });
      }, 2000); // Hide after 2 seconds
      logPageIndicator('SHOW_INDICATOR_TEMPORARILY_COMPLETE');
    });
  }, []);

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

  // Log when currentPage state changes (React commit phase)
  useEffect(() => {
    logPageIndicator('CURRENT_PAGE_STATE_CHANGED', {
      currentPage,
      totalPages
    });
  }, [currentPage, totalPages]);

  // Log when showPageIndicator state changes
  useEffect(() => {
    logPageIndicator('SHOW_PAGE_INDICATOR_STATE_CHANGED', {
      showPageIndicator
    });
  }, [showPageIndicator]);

  // Log when isLocationsReady state changes
  useEffect(() => {
    logPageIndicator('IS_LOCATIONS_READY_STATE_CHANGED', {
      isLocationsReady
    });
  }, [isLocationsReady]);

  // Log before render
  logPageIndicator('RENDER_START', {
    currentPage,
    totalPages,
    showPageIndicator,
    isLocationsReady,
    isChatOpen,
    theme
  });

  // Compute the display value with logging (page numbers format: "1 / 100")
  const computeDisplayValue = () => {
    logPageIndicator('COMPUTE_DISPLAY_VALUE_START', {
      isLocationsReady,
      currentPage,
      totalPages
    });

    if (isLocationsReady) {
      const displayValue = `${currentPage} / ${totalPages}`;
      logPageIndicator('COMPUTE_DISPLAY_VALUE_PAGES', { displayValue });
      return displayValue;
    } else {
      const displayValue = t('calculating');
      logPageIndicator('COMPUTE_DISPLAY_VALUE_CALCULATING', { displayValue });
      return displayValue;
    }
  };

  // Pre-compute the display value to catch any errors
  let indicatorDisplayValue: string;
  try {
    indicatorDisplayValue = computeDisplayValue();
    logPageIndicator('DISPLAY_VALUE_COMPUTED_SUCCESS', { indicatorDisplayValue });
  } catch (error) {
    logPageIndicator('DISPLAY_VALUE_COMPUTE_ERROR', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    indicatorDisplayValue = '...';
  }

  logPageIndicator('RENDER_RETURN_START');

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

      {/* Chapter Progress Indicator - Top (like iBooks iPhone) */}
      {/* Shows "X pages left in chapter" */}
      {!isChatOpen && isLocationsReady && pagesLeftInChapter !== null && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 pointer-events-none z-30 transition-all duration-300 ${
            showPageIndicator ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
          }`}
          style={{
            top: 'calc(12px + env(safe-area-inset-top, 20px))',
          }}
        >
          <div className={`px-3 py-1.5 backdrop-blur-sm rounded-full text-xs font-medium select-none ${
              theme === 'dark'
              ? 'bg-gray-800/70 text-gray-400'
              : 'bg-white/70 text-stone-400'
          }`}>
            {t('pages_left_in_chapter').replace('{count}', String(pagesLeftInChapter))}
          </div>
        </div>
      )}

      {/* Navigation Controls with Arrows - Bottom */}
      {/* Hidden when chat is open to avoid blocking the chat input */}
      {!isChatOpen && (
        <div
          className="fixed left-0 right-0 flex items-center justify-center gap-4 z-30"
          style={{
            bottom: 'calc(16px + env(safe-area-inset-bottom, 20px))',
          }}
        >
           {/* Previous Page Button */}
           <button
              onClick={() => {
                const timestamp = new Date().toISOString();
                console.log(`[NAV_PREV ${timestamp}] ========== PREV WITH CSS TRANSFORM ==========`);
                console.log(`[NAV_PREV ${timestamp}] Current section page: ${sectionPageRef.current} of ${sectionTotalPagesRef.current}`);

                // Use our CSS transform-based navigation
                goToPrevPage();
                showIndicatorTemporarily();
              }}
              className={`p-3 backdrop-blur shadow-lg rounded-full transition-all transform hover:scale-110 active:scale-95 border ${
                  theme === 'dark'
                  ? 'bg-gray-800/90 text-gray-200 border-gray-700 hover:bg-indigo-600 hover:text-white'
                  : 'bg-white/90 text-stone-700 border-stone-200 hover:bg-indigo-600 hover:text-white'
              }`}
              aria-label="Previous Page"
           >
              <Icons.Prev size={24} />
           </button>

           {/* Page Indicator */}
           <div className={`px-5 py-3 backdrop-blur shadow-lg rounded-full text-sm font-semibold border min-w-[120px] text-center select-none flex flex-col items-center leading-tight ${
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

           {/* Next Page Button */}
           <button
              onClick={() => {
                const timestamp = new Date().toISOString();
                console.log(`[NAV_NEXT ${timestamp}] ========== NEXT WITH CSS TRANSFORM ==========`);
                console.log(`[NAV_NEXT ${timestamp}] Current section page: ${sectionPageRef.current} of ${sectionTotalPagesRef.current}`);

                // Use our CSS transform-based navigation
                goToNextPage();
                showIndicatorTemporarily();
              }}
              className={`p-3 backdrop-blur shadow-lg rounded-full transition-all transform hover:scale-110 active:scale-95 border ${
                  theme === 'dark'
                  ? 'bg-gray-800/90 text-gray-200 border-gray-700 hover:bg-indigo-600 hover:text-white'
                  : 'bg-white/90 text-stone-700 border-stone-200 hover:bg-indigo-600 hover:text-white'
              }`}
              aria-label="Next Page"
           >
              <Icons.Next size={24} />
           </button>
        </div>
      )}
    </div>
  );
};