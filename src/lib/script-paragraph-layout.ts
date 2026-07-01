import type { ScriptSegmentMarker } from "./script-studio";

export interface ParagraphLayout {
  top: number;
  bottom: number;
  height: number;
  /** Last visual line of the paragraph (for trailing controls). */
  lastLineTop: number;
  lastLineBottom: number;
  lastLineLeft: number;
  /** Distance from container left edge to end of paragraph text on the last line. */
  lastLineRight: number;
}

export interface MarkerBlockRange {
  marker: ScriptSegmentMarker;
  index: number;
  start: number;
  end: number;
}

export function markerBlockRanges(
  script: string,
  markers: ScriptSegmentMarker[],
): MarkerBlockRange[] {
  interface ScriptBlockSpan {
    start: number;
    end: number;
    trimmed: string;
  }

  const spans: ScriptBlockSpan[] = [];
  const separator = /\n\s*\n/g;
  let blockStart = 0;
  let match: RegExpExecArray | null;

  const pushSpan = (start: number, end: number) => {
    const trimmed = script.slice(start, end).trim();
    if (trimmed) spans.push({ start, end, trimmed });
  };

  while ((match = separator.exec(script)) !== null) {
    pushSpan(blockStart, match.index);
    blockStart = match.index + match[0].length;
  }
  pushSpan(blockStart, script.length);

  let spanIndex = 0;
  return markers.map((marker, index) => {
    while (spanIndex < spans.length && spans[spanIndex]!.trimmed !== marker.displayText) {
      spanIndex += 1;
    }

    const span = spans[spanIndex];
    if (span) {
      const raw = script.slice(span.start, span.end);
      const leading = raw.match(/^\s*/)?.[0].length ?? 0;
      const trailing = raw.match(/\s*$/)?.[0].length ?? 0;
      spanIndex += 1;
      return {
        marker,
        index,
        start: span.start + leading,
        end: span.end - trailing,
      };
    }

    const found = script.indexOf(marker.displayText);
    const start = found >= 0 ? found : 0;
    return {
      marker,
      index,
      start,
      end: start + marker.displayText.length,
    };
  });
}

function setRangeCharOffsets(
  range: Range,
  root: HTMLElement,
  start: number,
  end: number,
): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let counted = 0;
  let startSet = false;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const nodeEnd = counted + node.length;

    if (!startSet && start <= nodeEnd) {
      range.setStart(node, Math.max(0, Math.min(start - counted, node.length)));
      startSet = true;
    }

    if (startSet && end <= nodeEnd) {
      range.setEnd(node, Math.max(0, Math.min(end - counted, node.length)));
      return true;
    }

    counted = nodeEnd;
  }

  return startSet;
}

function rectAtChar(root: HTMLElement, charIndex: number): DOMRect | null {
  const range = document.createRange();
  if (!setRangeCharOffsets(range, root, charIndex, charIndex)) return null;
  return range.getBoundingClientRect();
}

function blockEndRect(root: HTMLElement, start: number, end: number): DOMRect | null {
  if (end <= start) return rectAtChar(root, start);

  const range = document.createRange();
  if (!setRangeCharOffsets(range, root, Math.max(start, end - 1), end)) {
    return rectAtChar(root, end);
  }

  const rects = Array.from(range.getClientRects());
  if (rects.length > 0) return rects[rects.length - 1]!;
  return range.getBoundingClientRect();
}

export function measureParagraphLayouts(
  root: HTMLElement,
  container: HTMLElement,
  script: string,
  markers: ScriptSegmentMarker[],
): ParagraphLayout[] {
  const containerRect = container.getBoundingClientRect();
  const ranges = markerBlockRanges(script, markers);

  return ranges.map(({ start, end }) => {
    const startRect = rectAtChar(root, start);
    const endRect = blockEndRect(root, start, end);
    if (!startRect || !endRect) {
      return {
        top: 0,
        bottom: 0,
        height: 0,
        lastLineTop: 0,
        lastLineBottom: 0,
        lastLineLeft: 0,
        lastLineRight: 0,
      };
    }

    const top = startRect.top - containerRect.top;
    const bottom = endRect.bottom - containerRect.top;
    const lastLineTop = endRect.top - containerRect.top;
    const lastLineBottom = endRect.bottom - containerRect.top;
    const lastLineLeft = endRect.left - containerRect.left;
    const lastLineRight = endRect.right - containerRect.left;

    return {
      top,
      bottom,
      height: Math.max(0, bottom - top),
      lastLineTop,
      lastLineBottom,
      lastLineLeft,
      lastLineRight,
    };
  });
}
