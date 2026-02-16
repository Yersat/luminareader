import React, { useCallback, useEffect, useRef, useState } from 'react';
import ePub, { Book, Rendition } from 'epubjs';
import { Capacitor } from '@capacitor/core';
import { Icons } from './ui/Icons';
import { SelectionData } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import {
  buildVisualPageMap,
  type VisualPageMap,
  type SectionPageMeta,
  VisualPageMapBuildCancelledError,
} from './reader/visualPageMap';
import {
  applySectionPage,
  captureVisibleCfi,
  measureSectionGeometry,
  type EpubContentsLike,
} from './reader/iosDeterministicPaging';

const READER_CONTENT_CSS = `
html {
  margin: 0 !important;
  padding: 0 !important;
}
body {
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
  padding: 20px 5% !important;
  box-sizing: border-box !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
  user-select: text !important;
  -webkit-touch-callout: default !important;
}
img {
  max-width: 100% !important;
  width: auto !important;
  height: auto !important;
  display: block !important;
  margin: 0 auto !important;
}
img[src*="cover"], img.cover, .cover img {
  max-height: 80vh !important;
  width: auto !important;
  margin: 0 auto !important;
}
svg {
  max-width: 100% !important;
  height: auto !important;
}
div, section, article {
  max-width: 100% !important;
}
p, span, div, h1, h2, h3, h4, h5, h6, a, li, td, th, blockquote {
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
  user-select: text !important;
}
::selection { background: #3b82f6; color: #fff; }
::-moz-selection { background: #3b82f6; color: #fff; }
`;

const NAVIGATION_RECOVERY_TIMEOUT_MS = 3500;

interface ReaderProps {
  file: File | ArrayBuffer | null;
  onTextSelected: (selection: SelectionData | null) => void;
  fontSize: number;
  theme: 'light' | 'sepia' | 'dark';
  location?: string | null;
  onLocationChange?: (cfi: string, progress: number) => void;
  isChatOpen?: boolean;
  selection?: SelectionData | null;
}

interface RelocationSnapshot {
  cfi: string;
  sectionIndex: number | null;
  sectionHref: string | null;
  displayedPage: number | null;
  displayedTotal: number | null;
  percentage: number | null;
}

type ReaderEngineMode = 'native' | 'ios-deterministic';
type NavigationDirection = 'next' | 'prev';

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

const getReaderEngineMode = (): ReaderEngineMode => {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
      return 'ios-deterministic';
    }
  } catch {
    // Ignore platform detection issues and fall back to native mode.
  }

  return 'native';
};

const describeFileSource = (file: File | ArrayBuffer | null): string => {
  if (!file) {
    return 'none';
  }
  if (typeof File !== 'undefined' && file instanceof File) {
    return `file:${file.name}`;
  }
  return `buffer:${file.byteLength}`;
};

const extractRelocationSnapshot = (loc: any): RelocationSnapshot | null => {
  const cfi = loc?.start?.cfi;
  if (typeof cfi !== 'string' || cfi.length === 0) {
    return null;
  }

  const displayedPage = normalizeNumber(loc?.start?.displayed?.page);
  const displayedTotal = normalizeNumber(loc?.start?.displayed?.total);

  return {
    cfi,
    sectionIndex: normalizeNumber(loc?.start?.index),
    sectionHref: typeof loc?.start?.href === 'string' ? loc.start.href : null,
    displayedPage,
    displayedTotal,
    percentage: normalizeNumber(loc?.start?.percentage),
  };
};

const getSectionMeta = (
  map: VisualPageMap,
  snapshot: RelocationSnapshot,
): SectionPageMeta | null => {
  if (snapshot.sectionIndex !== null && map.sectionByIndex[snapshot.sectionIndex]) {
    return map.sectionByIndex[snapshot.sectionIndex];
  }

  if (snapshot.sectionHref && map.sectionByHref[snapshot.sectionHref]) {
    return map.sectionByHref[snapshot.sectionHref];
  }

  return null;
};

const registerRenditionThemes = (rendition: Rendition) => {
  rendition.themes.register('light', {
    body: { color: '#111', background: '#fff' },
  });
  rendition.themes.register('sepia', {
    body: { color: '#5f4b32', background: '#f6ead5' },
  });
  rendition.themes.register('dark', {
    body: { color: '#ffffff', background: '#202020' },
    'p, span, div, h1, h2, h3, h4, h5, h6, li, a, em, strong, blockquote': {
      color: '#ffffff !important',
    },
  });
};

const getActiveContents = (rendition: Rendition): EpubContentsLike | null => {
  const manager = (rendition as any)?.manager;
  const views = manager?.views?._views;

  if (!Array.isArray(views) || views.length === 0) {
    return null;
  }

  const firstView = views[0];
  const contents = firstView?.contents;
  if (!contents?.document) {
    return null;
  }

  return contents as EpubContentsLike;
};

export const Reader: React.FC<ReaderProps> = ({
  file,
  onTextSelected,
  fontSize,
  theme,
  location,
  onLocationChange,
  isChatOpen = false,
  selection,
}) => {
  const engineModeRef = useRef<ReaderEngineMode>(getReaderEngineMode());
  const isIosDeterministic = engineModeRef.current === 'ios-deterministic';

  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const { t } = useLanguage();

  const [isReady, setIsReady] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isPageMapReady, setIsPageMapReady] = useState<boolean>(false);
  const [pagesLeftInChapter, setPagesLeftInChapter] = useState<number | null>(null);
  const [showPageIndicator, setShowPageIndicator] = useState(true);

  const highlightCfiRef = useRef<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNavigationTimeRef = useRef<number>(0);
  const isNavigatingRef = useRef<boolean>(false);

  const isChatOpenRef = useRef(isChatOpen);
  const currentLocationRef = useRef(currentLocation);
  const fontSizeRef = useRef(fontSize);
  const themeRef = useRef(theme);
  const onLocationChangeRef = useRef(onLocationChange);

  const lastRelocationRef = useRef<RelocationSnapshot | null>(null);
  const visualPageMapRef = useRef<VisualPageMap | null>(null);
  const pageMapBuildGenerationRef = useRef<number>(0);
  const pageMapRebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sectionPageRef = useRef<number>(1);
  const sectionTotalPagesRef = useRef<number>(1);
  const currentSectionIndexRef = useRef<number | null>(null);
  const currentSectionHrefRef = useRef<string | null>(null);
  const pendingBoundaryDirectionRef = useRef<NavigationDirection | null>(null);
  const pendingReflowRelocationRef = useRef<boolean>(false);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  const showIndicatorTemporarily = useCallback(() => {
    setShowPageIndicator(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setShowPageIndicator(false);
    }, 2000);
  }, []);

  const unlockNavigation = useCallback(() => {
    isNavigatingRef.current = false;
    if (navigationUnlockTimerRef.current) {
      clearTimeout(navigationUnlockTimerRef.current);
      navigationUnlockTimerRef.current = null;
    }
  }, []);

  const lockNavigation = useCallback(() => {
    isNavigatingRef.current = true;

    if (navigationUnlockTimerRef.current) {
      clearTimeout(navigationUnlockTimerRef.current);
    }

    navigationUnlockTimerRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
      navigationUnlockTimerRef.current = null;
      pendingBoundaryDirectionRef.current = null;
      pendingReflowRelocationRef.current = false;
    }, NAVIGATION_RECOVERY_TIMEOUT_MS);
  }, []);

  const clearHighlight = useCallback(() => {
    if (highlightCfiRef.current && renditionRef.current) {
      try {
        renditionRef.current.annotations.remove(highlightCfiRef.current, 'highlight');
      } catch {
        // Ignore annotation cleanup failures.
      }
      highlightCfiRef.current = null;
    }

    onTextSelected(null);
  }, [onTextSelected]);

  const applySnapshotToUi = useCallback((snapshot: RelocationSnapshot, map: VisualPageMap | null): number => {
    const resolvedDisplayedPage = isIosDeterministic
      ? sectionPageRef.current
      : snapshot.displayedPage;

    const resolvedDisplayedTotal = isIosDeterministic
      ? sectionTotalPagesRef.current
      : snapshot.displayedTotal;

    if (resolvedDisplayedPage !== null && resolvedDisplayedTotal !== null) {
      setPagesLeftInChapter(Math.max(0, resolvedDisplayedTotal - resolvedDisplayedPage));
    } else {
      setPagesLeftInChapter(null);
    }

    if (map) {
      const sectionMeta = getSectionMeta(map, snapshot);
      if (sectionMeta) {
        const maxPagesForSection = Math.max(sectionMeta.totalPagesInSection, resolvedDisplayedTotal || 1);
        const normalizedPage = Math.max(1, Math.min(maxPagesForSection, resolvedDisplayedPage || 1));
        const rawPage = sectionMeta.startPage + normalizedPage - 1;
        const globalPage = Math.max(1, Math.min(map.bookTotalPages, rawPage));

        setCurrentPage(globalPage);
        setTotalPages(map.bookTotalPages);
        setIsPageMapReady(true);

        return clampPercent((globalPage / Math.max(1, map.bookTotalPages)) * 100);
      }
    }

    setIsPageMapReady(false);

    if (snapshot.percentage !== null) {
      return clampPercent(snapshot.percentage * 100);
    }

    return 0;
  }, [isIosDeterministic]);

  const commitSnapshot = useCallback((snapshot: RelocationSnapshot) => {
    setCurrentLocation(snapshot.cfi);
    currentLocationRef.current = snapshot.cfi;
    lastRelocationRef.current = snapshot;

    const progress = applySnapshotToUi(snapshot, visualPageMapRef.current);
    onLocationChangeRef.current?.(snapshot.cfi, progress);
  }, [applySnapshotToUi]);

  const buildIosSnapshotForPage = useCallback((
    baseSnapshot: RelocationSnapshot,
    requestedPage: number,
  ): RelocationSnapshot | null => {
    if (!isIosDeterministic) {
      return null;
    }

    const rendition = renditionRef.current;
    const viewer = viewerRef.current;
    if (!rendition || !viewer) {
      return null;
    }

    const pageWidth = viewer.clientWidth || window.innerWidth;
    if (pageWidth <= 0) {
      return null;
    }

    const contents = getActiveContents(rendition);
    if (!contents) {
      return null;
    }

    const geometry = measureSectionGeometry(contents, pageWidth);
    const totalPages = Math.max(1, geometry.totalPages);
    const boundedPage = Math.max(1, Math.min(totalPages, Math.floor(requestedPage)));

    sectionTotalPagesRef.current = totalPages;
    sectionPageRef.current = boundedPage;

    applySectionPage(contents, boundedPage, pageWidth);

    const visibleCfi = captureVisibleCfi(contents, boundedPage, pageWidth);

    return {
      ...baseSnapshot,
      cfi: visibleCfi || baseSnapshot.cfi,
      displayedPage: boundedPage,
      displayedTotal: totalPages,
    };
  }, [isIosDeterministic]);

  const rebuildVisualPageMap = useCallback(async () => {
    if (!file || !viewerRef.current) {
      return;
    }

    const width = viewerRef.current.clientWidth || window.innerWidth;
    const height = viewerRef.current.clientHeight || window.innerHeight;

    if (width <= 0 || height <= 0) {
      return;
    }

    const buildGeneration = pageMapBuildGenerationRef.current + 1;
    pageMapBuildGenerationRef.current = buildGeneration;

    visualPageMapRef.current = null;
    setIsPageMapReady(false);

    try {
      const result = await buildVisualPageMap({
        file,
        width,
        height,
        fontSize: fontSizeRef.current,
        theme: themeRef.current,
        contentCss: READER_CONTENT_CSS,
        isCancelled: () => pageMapBuildGenerationRef.current !== buildGeneration,
      });

      if (pageMapBuildGenerationRef.current !== buildGeneration) {
        return;
      }

      visualPageMapRef.current = result.map;
      setTotalPages(result.map.bookTotalPages);
      setIsPageMapReady(true);

      const snapshot = lastRelocationRef.current;
      if (snapshot) {
        const progress = applySnapshotToUi(snapshot, result.map);
        onLocationChangeRef.current?.(snapshot.cfi, progress);
      } else {
        setCurrentPage(1);
      }
    } catch (error) {
      if (error instanceof VisualPageMapBuildCancelledError) {
        return;
      }

      console.error('Failed to build visual page map:', error);
      visualPageMapRef.current = null;
      setIsPageMapReady(false);
    }
  }, [applySnapshotToUi, file]);

  const rebuildVisualPageMapRef = useRef(rebuildVisualPageMap);
  useEffect(() => {
    rebuildVisualPageMapRef.current = rebuildVisualPageMap;
  }, [rebuildVisualPageMap]);

  const scheduleVisualPageMapRebuild = useCallback((delayMs = 0) => {
    if (pageMapRebuildTimerRef.current) {
      clearTimeout(pageMapRebuildTimerRef.current);
    }

    pageMapRebuildTimerRef.current = setTimeout(() => {
      void rebuildVisualPageMapRef.current();
    }, delayMs);
  }, []);

  const applyViewportResize = useCallback((cause: 'resize' | 'orientation' | 'font') => {
    const rendition = renditionRef.current;
    const viewer = viewerRef.current;

    if (!rendition || !viewer) {
      return;
    }

    const width = viewer.clientWidth || window.innerWidth;
    const height = viewer.clientHeight || window.innerHeight;

    if (width <= 0 || height <= 0) {
      return;
    }

    try {
      rendition.resize(width, height);

      if (currentLocationRef.current) {
        pendingReflowRelocationRef.current = true;
        void rendition.display(currentLocationRef.current);
      }
    } catch (error) {
      console.error(`Viewport update failed (${cause}):`, error);
    }

    setIsPageMapReady(false);
    scheduleVisualPageMapRebuild(cause === 'font' ? 120 : 180);
  }, [scheduleVisualPageMapRebuild]);

  useEffect(() => {
    if (selection === null && highlightCfiRef.current && renditionRef.current) {
      try {
        renditionRef.current.annotations.remove(highlightCfiRef.current, 'highlight');
      } catch {
        // Ignore annotation cleanup failures.
      }
      highlightCfiRef.current = null;
    }
  }, [selection]);

  useEffect(() => {
    if (!viewerRef.current || !file) {
      return;
    }

    const buildId = import.meta.env.VITE_BUILD_ID || 'unknown';
    const buildSha = import.meta.env.VITE_BUILD_SHA || 'unknown';
    const buildTimestamp = import.meta.env.VITE_BUILD_TIMESTAMP || 'unknown';

    console.log(
      `[BUILD] Reader init buildId=${buildId} sha=${buildSha} timestamp=${buildTimestamp} source=${describeFileSource(file)} engine=${engineModeRef.current}`,
    );

    setIsReady(false);
    setCurrentLocation('');
    currentLocationRef.current = '';
    setCurrentPage(1);
    setTotalPages(1);
    setPagesLeftInChapter(null);
    setShowPageIndicator(true);
    setIsPageMapReady(false);

    lastRelocationRef.current = null;
    visualPageMapRef.current = null;
    pageMapBuildGenerationRef.current += 1;

    sectionPageRef.current = 1;
    sectionTotalPagesRef.current = 1;
    currentSectionIndexRef.current = null;
    currentSectionHrefRef.current = null;
    pendingBoundaryDirectionRef.current = null;
    pendingReflowRelocationRef.current = false;

    if (pageMapRebuildTimerRef.current) {
      clearTimeout(pageMapRebuildTimerRef.current);
      pageMapRebuildTimerRef.current = null;
    }

    unlockNavigation();

    const book = ePub(file);
    bookRef.current = book;

    const viewer = viewerRef.current;
    const width = viewer.clientWidth || window.innerWidth;
    const height = viewer.clientHeight || window.innerHeight;

    const rendition = book.renderTo(viewer, {
      width,
      height,
      flow: 'paginated',
      manager: 'default',
      spread: 'none',
      snap: true,
      allowScriptedContent: true,
      allowPopups: true,
    });

    renditionRef.current = rendition;

    registerRenditionThemes(rendition);

    rendition.hooks.content.register((contents: any) => {
      contents.addStylesheetCss(READER_CONTENT_CSS, 'lumina-reader-content-css');
    });

    rendition.themes.fontSize(`${fontSizeRef.current}%`);
    rendition.themes.select(themeRef.current);

    const handleRendered = () => {
      setIsReady(true);
      rendition.themes.fontSize(`${fontSizeRef.current}%`);
      rendition.themes.select(themeRef.current);

      if (isIosDeterministic && lastRelocationRef.current) {
        const refreshed = buildIosSnapshotForPage(lastRelocationRef.current, sectionPageRef.current);
        if (refreshed) {
          commitSnapshot(refreshed);
        }
      }
    };

    const handleRelocated = (loc: any) => {
      const snapshot = extractRelocationSnapshot(loc);
      if (!snapshot) {
        unlockNavigation();
        return;
      }

      let effectiveSnapshot = snapshot;

      if (isIosDeterministic) {
        const sectionChanged = snapshot.sectionIndex !== null
          ? snapshot.sectionIndex !== currentSectionIndexRef.current
          : snapshot.sectionHref !== currentSectionHrefRef.current;

        let targetPage = sectionPageRef.current;

        if (sectionChanged) {
          if (pendingBoundaryDirectionRef.current === 'prev') {
            targetPage = Number.MAX_SAFE_INTEGER;
          } else if (pendingBoundaryDirectionRef.current === 'next') {
            targetPage = 1;
          } else {
            targetPage = snapshot.displayedPage ?? 1;
          }
        } else if (pendingReflowRelocationRef.current) {
          targetPage = snapshot.displayedPage ?? sectionPageRef.current;
        } else if (!isNavigatingRef.current && snapshot.displayedPage !== null) {
          targetPage = snapshot.displayedPage;
        }

        const rebuiltSnapshot = buildIosSnapshotForPage(snapshot, targetPage);
        if (rebuiltSnapshot) {
          effectiveSnapshot = rebuiltSnapshot;
        } else {
          sectionPageRef.current = Math.max(1, snapshot.displayedPage || sectionPageRef.current);
          sectionTotalPagesRef.current = Math.max(1, snapshot.displayedTotal || sectionTotalPagesRef.current);
          effectiveSnapshot = {
            ...snapshot,
            displayedPage: sectionPageRef.current,
            displayedTotal: sectionTotalPagesRef.current,
          };
        }

        currentSectionIndexRef.current = snapshot.sectionIndex;
        currentSectionHrefRef.current = snapshot.sectionHref;
      } else {
        sectionPageRef.current = Math.max(1, snapshot.displayedPage || 1);
        sectionTotalPagesRef.current = Math.max(1, snapshot.displayedTotal || 1);
        currentSectionIndexRef.current = snapshot.sectionIndex;
        currentSectionHrefRef.current = snapshot.sectionHref;
      }

      pendingBoundaryDirectionRef.current = null;
      pendingReflowRelocationRef.current = false;

      commitSnapshot(effectiveSnapshot);
      showIndicatorTemporarily();
      unlockNavigation();
    };

    const handleSelected = (cfiRange: string) => {
      book.getRange(cfiRange).then((range) => {
        const text = range.toString();
        const cleanText = text.replace(/\s+/g, ' ').trim();

        if (cleanText.length > 0) {
          onTextSelected({
            text: cleanText,
            cfiRange,
          });
        }
      });

      if (highlightCfiRef.current) {
        try {
          rendition.annotations.remove(highlightCfiRef.current, 'highlight');
        } catch {
          // Ignore annotation cleanup failures.
        }
      }

      rendition.annotations.add('highlight', cfiRange, {}, null, 'hl');
      highlightCfiRef.current = cfiRange;
    };

    const navigateByTap = async (direction: NavigationDirection) => {
      if (!renditionRef.current) {
        return;
      }

      if (!isIosDeterministic) {
        if (direction === 'prev') {
          await renditionRef.current.prev();
        } else {
          await renditionRef.current.next();
        }
        return;
      }

      const baseSnapshot = lastRelocationRef.current;

      if (baseSnapshot) {
        const measuredSnapshot = buildIosSnapshotForPage(baseSnapshot, sectionPageRef.current) || {
          ...baseSnapshot,
          displayedPage: sectionPageRef.current,
          displayedTotal: sectionTotalPagesRef.current,
        };

        const currentPage = Math.max(1, measuredSnapshot.displayedPage || sectionPageRef.current);
        const sectionTotal = Math.max(1, measuredSnapshot.displayedTotal || sectionTotalPagesRef.current);

        if (direction === 'next' && currentPage < sectionTotal) {
          const nextSnapshot = buildIosSnapshotForPage(measuredSnapshot, currentPage + 1);
          if (nextSnapshot) {
            commitSnapshot(nextSnapshot);
            unlockNavigation();
            return;
          }
        }

        if (direction === 'prev' && currentPage > 1) {
          const prevSnapshot = buildIosSnapshotForPage(measuredSnapshot, currentPage - 1);
          if (prevSnapshot) {
            commitSnapshot(prevSnapshot);
            unlockNavigation();
            return;
          }
        }
      }

      pendingBoundaryDirectionRef.current = direction;

      if (direction === 'prev') {
        await renditionRef.current.prev();
      } else {
        await renditionRef.current.next();
      }
    };

    const clickHandler = async (event: MouseEvent) => {
      const targetElement = event.target as HTMLElement | null;
      if (!targetElement) {
        return;
      }

      const clickedLink = targetElement.closest('a');
      if (clickedLink) {
        return;
      }

      if (isChatOpenRef.current || isNavigatingRef.current) {
        return;
      }

      const iframeDoc = targetElement.ownerDocument;
      const activeSelection = iframeDoc?.getSelection()?.toString().trim() || '';
      if (activeSelection.length > 0) {
        return;
      }

      const now = Date.now();
      if (now - lastNavigationTimeRef.current < 200) {
        return;
      }
      lastNavigationTimeRef.current = now;

      const viewportWidth = viewerRef.current?.clientWidth || window.innerWidth;
      const tapX = event.clientX;
      const tapPercent = viewportWidth > 0 ? tapX / viewportWidth : 0.5;

      if (tapPercent >= 0.35 && tapPercent <= 0.65) {
        return;
      }

      event.preventDefault();

      clearHighlight();
      lockNavigation();
      showIndicatorTemporarily();

      try {
        if (tapPercent < 0.35) {
          await navigateByTap('prev');
        } else {
          await navigateByTap('next');
        }
      } catch (error) {
        console.error('Page navigation failed:', error);
        pendingBoundaryDirectionRef.current = null;
        unlockNavigation();
      }
    };

    const handleWindowResize = () => {
      applyViewportResize('resize');
    };

    const handleOrientationChange = () => {
      setTimeout(() => {
        applyViewportResize('orientation');
      }, 120);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        applyViewportResize('resize');
      });
      resizeObserver.observe(viewer);
    }

    rendition.on('rendered', handleRendered);
    rendition.on('relocated', handleRelocated);
    rendition.on('selected', handleSelected);
    rendition.on('click', clickHandler);

    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    void rendition.display(location || undefined);
    scheduleVisualPageMapRebuild(0);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('orientationchange', handleOrientationChange);

      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      try {
        (rendition as any).off?.('rendered', handleRendered);
        (rendition as any).off?.('relocated', handleRelocated);
        (rendition as any).off?.('selected', handleSelected);
        (rendition as any).off?.('click', clickHandler);
      } catch {
        // Ignore listener cleanup failures.
      }

      pageMapBuildGenerationRef.current += 1;
      if (pageMapRebuildTimerRef.current) {
        clearTimeout(pageMapRebuildTimerRef.current);
        pageMapRebuildTimerRef.current = null;
      }

      pendingBoundaryDirectionRef.current = null;
      pendingReflowRelocationRef.current = false;

      unlockNavigation();

      if (bookRef.current) {
        bookRef.current.destroy();
      }

      bookRef.current = null;
      renditionRef.current = null;
    };
  }, [
    applyViewportResize,
    buildIosSnapshotForPage,
    clearHighlight,
    commitSnapshot,
    file,
    isIosDeterministic,
    lockNavigation,
    onTextSelected,
    location,
    scheduleVisualPageMapRebuild,
    showIndicatorTemporarily,
    unlockNavigation,
  ]);

  useEffect(() => {
    if (!renditionRef.current) {
      return;
    }

    renditionRef.current.themes.select(theme);
  }, [theme]);

  useEffect(() => {
    if (!renditionRef.current || !viewerRef.current) {
      return;
    }

    renditionRef.current.themes.fontSize(`${fontSize}%`);
    applyViewportResize('font');
  }, [applyViewportResize, fontSize]);

  useEffect(() => {
    if (!renditionRef.current || !location || location === currentLocationRef.current) {
      return;
    }

    lockNavigation();
    showIndicatorTemporarily();
    setIsPageMapReady(false);

    pendingBoundaryDirectionRef.current = null;
    pendingReflowRelocationRef.current = true;

    void renditionRef.current.display(location).catch((error) => {
      console.error('Failed to navigate to target location:', error);
      unlockNavigation();
    });
  }, [location, lockNavigation, showIndicatorTemporarily, unlockNavigation]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      if (navigationUnlockTimerRef.current) {
        clearTimeout(navigationUnlockTimerRef.current);
      }
      if (pageMapRebuildTimerRef.current) {
        clearTimeout(pageMapRebuildTimerRef.current);
      }
    };
  }, []);

  const getContainerStyle = () => {
    switch (theme) {
      case 'sepia':
        return 'bg-[#f6ead5]';
      case 'dark':
        return 'bg-[#202020]';
      default:
        return 'bg-white';
    }
  };

  return (
    <div className={`flex flex-col h-full relative group transition-colors duration-300 ${getContainerStyle()}`}>
      <div className="flex-1 relative overflow-hidden">
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

      {!isChatOpen && pagesLeftInChapter !== null && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 pointer-events-none z-30 transition-all duration-300 ${
            showPageIndicator ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
          }`}
          style={{
            top: 'calc(12px + env(safe-area-inset-top, 20px))',
          }}
        >
          <div
            className={`px-3 py-1.5 backdrop-blur-sm rounded-full text-xs font-medium select-none ${
              theme === 'dark' ? 'bg-gray-800/70 text-gray-400' : 'bg-white/70 text-stone-400'
            }`}
          >
            {t('pages_left_in_chapter').replace('{count}', String(pagesLeftInChapter))}
          </div>
        </div>
      )}

      {!isChatOpen && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 pointer-events-none z-30 transition-all duration-300 ${
            showPageIndicator ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{
            bottom: 'calc(16px + env(safe-area-inset-bottom, 20px))',
          }}
        >
          <div
            className={`px-5 py-3 backdrop-blur shadow-lg rounded-full text-sm font-semibold border min-w-[120px] text-center select-none flex flex-col items-center leading-tight ${
              theme === 'dark'
                ? 'bg-gray-800/90 text-gray-200 border-gray-700'
                : 'bg-white/90 text-stone-600 border-stone-200'
            }`}
          >
            {isPageMapReady ? (
              <>
                <span className={theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}>
                  {t('page')} {currentPage}
                </span>
                <span className="text-[10px] opacity-60 uppercase tracking-wider">
                  {t('of')} {totalPages}
                </span>
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
