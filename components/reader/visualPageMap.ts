import ePub, { Book, Rendition } from 'epubjs';
import { measureSectionGeometry, type EpubContentsLike } from './iosDeterministicPaging';

export interface SectionPageMeta {
  sectionIndex: number;
  href: string;
  startPage: number;
  endPage: number;
  totalPagesInSection: number;
}

export interface VisualPageMap {
  sections: SectionPageMeta[];
  sectionByIndex: Record<number, SectionPageMeta>;
  sectionByHref: Record<string, SectionPageMeta>;
  bookTotalPages: number;
}

export interface VisualPageMapBuildResult {
  map: VisualPageMap;
}

export interface BuildVisualPageMapOptions {
  file: File | ArrayBuffer;
  width: number;
  height: number;
  fontSize: number;
  theme: 'light' | 'sepia' | 'dark';
  contentCss: string;
  isCancelled?: () => boolean;
}

export class VisualPageMapBuildCancelledError extends Error {
  constructor() {
    super('Visual page map build cancelled');
    this.name = 'VisualPageMapBuildCancelledError';
  }
}

const ensureNotCancelled = (isCancelled?: () => boolean) => {
  if (isCancelled?.()) {
    throw new VisualPageMapBuildCancelledError();
  }
};

const wait = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const waitForFrame = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
};

const registerMeasurementThemes = (rendition: Rendition) => {
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

const getCurrentLocation = async (rendition: Rendition): Promise<any> => {
  const maybeLocation = rendition.currentLocation();
  if (maybeLocation && typeof (maybeLocation as Promise<any>).then === 'function') {
    return maybeLocation;
  }
  return maybeLocation;
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

const normalizeSectionIndex = (value: unknown): number | null => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }
  return null;
};

const waitForStableGeometry = async (
  rendition: Rendition,
  pageWidth: number,
  isCancelled?: () => boolean,
): Promise<{ totalPages: number; scrollWidth: number }> => {
  let previousWidth = -1;
  let stableCount = 0;
  let fallback = { totalPages: 1, scrollWidth: 1 };

  for (let attempt = 0; attempt < 16; attempt += 1) {
    ensureNotCancelled(isCancelled);

    await waitForFrame();

    const contents = getActiveContents(rendition);
    if (!contents) {
      await wait(24);
      continue;
    }

    const geometry = measureSectionGeometry(contents, pageWidth);
    fallback = geometry;

    if (Math.abs(geometry.scrollWidth - previousWidth) <= 1) {
      stableCount += 1;
    } else {
      stableCount = 0;
      previousWidth = geometry.scrollWidth;
    }

    if (stableCount >= 2) {
      return geometry;
    }

    await wait(30);
  }

  return fallback;
};

export const buildVisualPageMap = async (
  options: BuildVisualPageMapOptions,
): Promise<VisualPageMapBuildResult> => {
  const {
    file,
    width,
    height,
    fontSize,
    theme,
    contentCss,
    isCancelled,
  } = options;

  ensureNotCancelled(isCancelled);

  const normalizedWidth = Math.max(1, Math.floor(width));
  const normalizedHeight = Math.max(1, Math.floor(height));

  const container = document.createElement('div');
  container.setAttribute('data-lumina-page-map', 'true');
  container.style.position = 'fixed';
  container.style.left = '-100000px';
  container.style.top = '0';
  container.style.width = `${normalizedWidth}px`;
  container.style.height = `${normalizedHeight}px`;
  container.style.overflow = 'hidden';
  container.style.visibility = 'hidden';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  let book: Book | null = null;
  let rendition: Rendition | null = null;

  try {
    book = ePub(file);
    ensureNotCancelled(isCancelled);

    rendition = book.renderTo(container, {
      width: normalizedWidth,
      height: normalizedHeight,
      flow: 'paginated',
      manager: 'default',
      spread: 'none',
      snap: true,
      allowScriptedContent: true,
      allowPopups: true,
    });

    registerMeasurementThemes(rendition);

    rendition.hooks.content.register((contents: any) => {
      contents.addStylesheetCss(contentCss, 'lumina-reader-content-css');
    });

    rendition.themes.fontSize(`${fontSize}%`);
    rendition.themes.select(theme);

    const spine: any = await book.loaded.spine;
    ensureNotCancelled(isCancelled);

    const spineItems = (spine?.spineItems || []) as any[];
    const linearSpineItems = spineItems.filter((item) => item?.linear !== false && item?.linear !== 'no');
    const itemsToMeasure = linearSpineItems.length > 0 ? linearSpineItems : spineItems;

    const sections: SectionPageMeta[] = [];
    const sectionByIndex: Record<number, SectionPageMeta> = {};
    const sectionByHref: Record<string, SectionPageMeta> = {};

    let runningPage = 0;

    for (const item of itemsToMeasure) {
      ensureNotCancelled(isCancelled);

      const target = item?.href ?? item?.index;
      if (typeof target === 'undefined' || target === null) {
        continue;
      }

      await rendition.display(target);
      ensureNotCancelled(isCancelled);

      const geometry = await waitForStableGeometry(rendition, normalizedWidth, isCancelled);
      ensureNotCancelled(isCancelled);

      const location = await getCurrentLocation(rendition);
      ensureNotCancelled(isCancelled);

      const locationSectionIndex = normalizeSectionIndex(location?.start?.index);
      const itemSectionIndex = normalizeSectionIndex(item?.index);
      const sectionIndex = itemSectionIndex ?? locationSectionIndex;

      if (sectionIndex === null) {
        continue;
      }

      const totalPagesInSection = Math.max(1, geometry.totalPages);
      const href = String(item?.href || location?.start?.href || '');
      const startPage = runningPage + 1;
      const endPage = runningPage + totalPagesInSection;
      runningPage = endPage;

      const meta: SectionPageMeta = {
        sectionIndex,
        href,
        startPage,
        endPage,
        totalPagesInSection,
      };

      sections.push(meta);
      sectionByIndex[sectionIndex] = meta;

      if (href) {
        sectionByHref[href] = meta;
      }
    }

    if (runningPage === 0) {
      runningPage = 1;
    }

    return {
      map: {
        sections,
        sectionByIndex,
        sectionByHref,
        bookTotalPages: runningPage,
      },
    };
  } finally {
    try {
      if (rendition && typeof (rendition as any).destroy === 'function') {
        (rendition as any).destroy();
      }
    } catch {
      // Ignore cleanup errors.
    }

    try {
      if (book) {
        book.destroy();
      }
    } catch {
      // Ignore cleanup errors.
    }

    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
};
