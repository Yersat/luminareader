export interface EpubContentsLike {
  document: Document;
  cfiFromRange?: (range: Range) => string;
  cfiFromNode?: (node: Node) => string;
}

export type CfiCaptureQuality = 'point' | 'text' | 'node' | 'fallback';

export interface CfiCaptureResult {
  cfi: string | null;
  quality: CfiCaptureQuality;
}

const clampToPositiveInt = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
};

const getScrollWidth = (doc: Document): number => {
  const htmlEl = doc.documentElement;
  const body = doc.body;

  const htmlScrollWidth = htmlEl?.scrollWidth ?? 0;
  const bodyScrollWidth = body?.scrollWidth ?? 0;
  const htmlRectWidth = Math.ceil(htmlEl?.getBoundingClientRect().width ?? 0);
  const bodyRectWidth = Math.ceil(body?.getBoundingClientRect().width ?? 0);

  return Math.max(1, htmlScrollWidth, bodyScrollWidth, htmlRectWidth, bodyRectWidth);
};

const createRangeFromPoint = (doc: Document, x: number, y: number): Range | null => {
  const anyDoc = doc as any;

  if (typeof anyDoc.caretRangeFromPoint === 'function') {
    const range = anyDoc.caretRangeFromPoint(x, y);
    if (range) {
      return range;
    }
  }

  if (typeof anyDoc.caretPositionFromPoint === 'function') {
    const position = anyDoc.caretPositionFromPoint(x, y);
    if (position?.offsetNode) {
      const range = doc.createRange();
      range.setStart(position.offsetNode, position.offset ?? 0);
      range.collapse(true);
      return range;
    }
  }

  return null;
};

const isElementVisibleInViewport = (element: Element, viewportWidth: number, viewportHeight: number): boolean => {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const intersectsHorizontally = rect.right > 0 && rect.left < viewportWidth;
  const intersectsVertically = rect.bottom > 0 && rect.top < viewportHeight;

  return intersectsHorizontally && intersectsVertically;
};

const captureFromVisibleTextNode = (
  contents: EpubContentsLike,
  viewportWidth: number,
  viewportHeight: number,
): string | null => {
  if (typeof contents.cfiFromRange !== 'function') {
    return null;
  }

  const doc = contents.document;
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const textContent = textNode.textContent?.trim() || '';

    if (textContent.length > 0 && textNode.parentElement) {
      const parentElement = textNode.parentElement;
      if (isElementVisibleInViewport(parentElement, viewportWidth, viewportHeight)) {
        try {
          const range = doc.createRange();
          range.setStart(textNode, 0);
          range.setEnd(textNode, Math.min(1, textNode.length));
          const cfi = contents.cfiFromRange(range);

          if (typeof cfi === 'string' && cfi.length > 0) {
            return cfi;
          }
        } catch {
          // Ignore extraction failures and continue scanning text nodes.
        }
      }
    }

    node = walker.nextNode();
  }

  return null;
};

const captureFromVisibleElement = (
  contents: EpubContentsLike,
  viewportWidth: number,
  viewportHeight: number,
): string | null => {
  if (typeof contents.cfiFromNode !== 'function') {
    return null;
  }

  const doc = contents.document;
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.nextNode();

  while (node) {
    const element = node as Element;
    const tag = element.tagName?.toLowerCase();

    if (tag !== 'html' && tag !== 'body' && isElementVisibleInViewport(element, viewportWidth, viewportHeight)) {
      try {
        const cfi = contents.cfiFromNode(element);
        if (typeof cfi === 'string' && cfi.length > 0) {
          return cfi;
        }
      } catch {
        // Ignore extraction failures and continue scanning nodes.
      }
    }

    node = walker.nextNode();
  }

  return null;
};

export const measureSectionGeometry = (
  contents: EpubContentsLike,
  pageWidth: number,
): { totalPages: number; scrollWidth: number } => {
  const normalizedPageWidth = clampToPositiveInt(pageWidth);
  const scrollWidth = getScrollWidth(contents.document);
  const totalPages = Math.max(1, Math.ceil(scrollWidth / normalizedPageWidth));

  return {
    totalPages,
    scrollWidth,
  };
};

export const applySectionPage = (
  contents: EpubContentsLike,
  page: number,
  pageWidth: number,
): void => {
  const normalizedPage = clampToPositiveInt(page);
  const normalizedPageWidth = clampToPositiveInt(pageWidth);
  const offset = (normalizedPage - 1) * normalizedPageWidth;

  const htmlEl = contents.document.documentElement;
  if (!htmlEl) {
    return;
  }

  htmlEl.style.transform = `translate3d(-${offset}px, 0, 0)`;
  htmlEl.style.transition = 'transform 120ms ease-out';
  htmlEl.style.willChange = 'transform';
};

export const captureVisibleCfi = (
  contents: EpubContentsLike,
  _page: number,
  pageWidth: number,
): CfiCaptureResult => {
  const doc = contents.document;
  const htmlEl = doc.documentElement;

  const viewportWidth = htmlEl?.clientWidth || clampToPositiveInt(pageWidth);
  const viewportHeight = htmlEl?.clientHeight || doc.body?.clientHeight || 0;

  if (viewportHeight <= 0) {
    return { cfi: null, quality: 'fallback' };
  }

  if (typeof contents.cfiFromRange === 'function') {
    const x = Math.max(1, Math.min(viewportWidth - 1, Math.floor(viewportWidth * 0.5)));
    const candidateY = [0.25, 0.4, 0.55, 0.7].map((factor) => Math.max(1, Math.min(viewportHeight - 1, Math.floor(viewportHeight * factor))));

    for (const y of candidateY) {
      const range = createRangeFromPoint(doc, x, y);
      if (!range) {
        continue;
      }

      try {
        const cfi = contents.cfiFromRange(range);
        if (typeof cfi === 'string' && cfi.length > 0) {
          return { cfi, quality: 'point' };
        }
      } catch {
        // Ignore CFI extraction failures and continue trying other points.
      }
    }
  }

  const textFallbackCfi = captureFromVisibleTextNode(contents, viewportWidth, viewportHeight);
  if (textFallbackCfi) {
    return { cfi: textFallbackCfi, quality: 'text' };
  }

  const nodeFallbackCfi = captureFromVisibleElement(contents, viewportWidth, viewportHeight);
  if (nodeFallbackCfi) {
    return { cfi: nodeFallbackCfi, quality: 'node' };
  }

  return { cfi: null, quality: 'fallback' };
};
