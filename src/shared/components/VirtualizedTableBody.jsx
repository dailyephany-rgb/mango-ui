/**
 * Virtualized <tbody> for large register tables.
 * Same row content / keys — only limits mounted DOM nodes.
 * Scroll parent should be an ancestor with overflow auto (table-wrapper).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_ROW_HEIGHT = 52;
const DEFAULT_OVERSCAN = 8;
/** Below this, render all rows (cheaper than virtualizing). */
const VIRTUALIZE_MIN_ROWS = 20;

/**
 * @param {{
 *   items: any[],
 *   renderRow: (item: any, index: number) => React.ReactNode,
 *   estimateRowHeight?: number,
 *   overscan?: number,
 *   scrollParentSelector?: string,
 *   columnCount?: number,
 * }} props
 */
export default function VirtualizedTableBody({
  items,
  renderRow,
  estimateRowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  scrollParentSelector = ".table-wrapper, .haem-table-wrapper, .table-card, .dept-table-wrapper, .validator-table-scroll, .table-scroll-container, .table-container",
  columnCount = 16,
}) {
  const [range, setRange] = useState({ start: 0, end: VIRTUALIZE_MIN_ROWS });

  const findScrollParent = useCallback(
    (el) => {
      if (!el) return null;
      const selectors = scrollParentSelector.split(",").map((s) => s.trim());
      let node = el.parentElement;
      while (node && node !== document.body) {
        for (const sel of selectors) {
          try {
            if (node.matches?.(sel)) return node;
          } catch {
            /* ignore */
          }
        }
        const style = window.getComputedStyle(node);
        const oy = style.overflowY;
        if (oy === "auto" || oy === "scroll" || oy === "overlay") return node;
        node = node.parentElement;
      }
      return null;
    },
    [scrollParentSelector]
  );

  const [tbodyEl, setTbodyEl] = useState(null);
  const setRef = useCallback((node) => {
    setTbodyEl(node);
  }, []);

  const itemCount = items?.length || 0;

  useEffect(() => {
    if (!tbodyEl || !itemCount) return undefined;
    if (itemCount < VIRTUALIZE_MIN_ROWS) {
      setRange({ start: 0, end: itemCount });
      return undefined;
    }

    const scrollParent = findScrollParent(tbodyEl) || window;
    const isWindow = scrollParent === window;

    const update = () => {
      const rowH = estimateRowHeight;
      let viewTop = 0;
      let viewH = window.innerHeight;
      if (isWindow) {
        const rect = tbodyEl.getBoundingClientRect();
        viewTop = Math.max(0, -rect.top);
        viewH = window.innerHeight;
      } else {
        const parent = /** @type {HTMLElement} */ (scrollParent);
        // Sticky thead: window by parent scrollTop / clientHeight
        viewTop = parent.scrollTop;
        viewH = parent.clientHeight;
      }
      const start = Math.max(0, Math.floor(viewTop / rowH) - overscan);
      const end = Math.min(
        itemCount,
        Math.ceil((viewTop + viewH) / rowH) + overscan
      );
      setRange((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end }
      );
    };

    update();
    const target = isWindow ? window : scrollParent;
    target.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      target.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [tbodyEl, itemCount, estimateRowHeight, overscan, findScrollParent]);

  const useVirtual = (items?.length || 0) >= VIRTUALIZE_MIN_ROWS;

  const slice = useMemo(() => {
    if (!useVirtual) return items || [];
    return (items || []).slice(range.start, range.end);
  }, [items, range.start, range.end, useVirtual]);

  if (!useVirtual) {
    return (
      <tbody ref={setRef}>
        {(items || []).map((item, i) => renderRow(item, i))}
      </tbody>
    );
  }

  const topPad = range.start * estimateRowHeight;
  const bottomPad = Math.max(0, (items.length - range.end) * estimateRowHeight);

  return (
    <tbody ref={setRef}>
      {topPad > 0 && (
        <tr aria-hidden="true" style={{ height: topPad }}>
          <td
            colSpan={columnCount}
            style={{ padding: 0, border: 0, height: topPad, lineHeight: 0 }}
          />
        </tr>
      )}
      {slice.map((item, i) => renderRow(item, range.start + i))}
      {bottomPad > 0 && (
        <tr aria-hidden="true" style={{ height: bottomPad }}>
          <td
            colSpan={columnCount}
            style={{ padding: 0, border: 0, height: bottomPad, lineHeight: 0 }}
          />
        </tr>
      )}
    </tbody>
  );
}
