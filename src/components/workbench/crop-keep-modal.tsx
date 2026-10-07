import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject, PointerEvent as ReactPointerEvent } from "react";
import { clampInt, normalizeSelectionRect } from "./bits";

export interface SelectionRect {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export interface CropKeepModalProps {
  isActive: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** M=行数，N=列数（与线上字段一致） */
  gridDimensions: { M: number; N: number } | null;
  onConfirm: (rect: SelectionRect) => void;
  onCancel: () => void;
}

export function CropKeepModal({
  isActive,
  canvasRef,
  gridDimensions,
  onConfirm,
  onCancel,
}: CropKeepModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ row: number; col: number } | null>(null);
  const [canvasRect, setCanvasRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [previewRect, setPreviewRect] = useState<SelectionRect | null>(null);

  const measureCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const containerBox = container.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    setCanvasRect({
      left: canvasBox.left - containerBox.left,
      top: canvasBox.top - containerBox.top,
      width: canvasBox.width,
      height: canvasBox.height,
    });
  }, [canvasRef]);

  useEffect(() => {
    if (!isActive) return;
    setSelection(null);
    setPreviewRect(null);
    dragStartRef.current = null;
    measureCanvas();
    window.addEventListener("resize", measureCanvas);
    window.addEventListener("scroll", measureCanvas, true);
    return () => {
      window.removeEventListener("resize", measureCanvas);
      window.removeEventListener("scroll", measureCanvas, true);
    };
  }, [isActive, measureCanvas]);

  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && selection) onConfirm(selection);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, onCancel, onConfirm, selection]);

  const pointToCell = useCallback(
    (clientX: number, clientY: number, allowOutside: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas || !gridDimensions) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const relX = (clientX - rect.left) / rect.width;
      const relY = (clientY - rect.top) / rect.height;
      if (!allowOutside && (relX < 0 || relX > 1 || relY < 0 || relY > 1)) return null;
      return {
        row: clampInt(Math.floor(relY * gridDimensions.M), 0, gridDimensions.M - 1),
        col: clampInt(Math.floor(relX * gridDimensions.N), 0, gridDimensions.N - 1),
      };
    },
    [canvasRef, gridDimensions],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isActive) return;
      const cell = pointToCell(e.clientX, e.clientY, false);
      if (cell) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStartRef.current = cell;
        setSelection(null);
        setPreviewRect(normalizeSelectionRect(cell, cell));
      }
    },
    [pointToCell, isActive],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = dragStartRef.current;
      if (!start) return;
      const cell = pointToCell(e.clientX, e.clientY, true);
      if (cell) {
        e.preventDefault();
        setPreviewRect(normalizeSelectionRect(start, cell));
      }
    },
    [pointToCell],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = dragStartRef.current;
      if (!start) return;
      const end = pointToCell(e.clientX, e.clientY, true) ?? start;
      const rect = normalizeSelectionRect(start, end);
      dragStartRef.current = null;
      setPreviewRect(null);
      setSelection(rect);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [pointToCell],
  );

  if (!isActive || !gridDimensions) return null;

  const activeRect = previewRect ?? selection;
  const size = activeRect
    ? {
        width: activeRect.colEnd - activeRect.colStart + 1,
        height: activeRect.rowEnd - activeRect.rowStart + 1,
      }
    : null;
  const overlayStyle =
    activeRect && canvasRect
      ? {
          left: canvasRect.left + (activeRect.colStart / gridDimensions.N) * canvasRect.width,
          top: canvasRect.top + (activeRect.rowStart / gridDimensions.M) * canvasRect.height,
          width:
            ((activeRect.colEnd - activeRect.colStart + 1) / gridDimensions.N) * canvasRect.width,
          height:
            ((activeRect.rowEnd - activeRect.rowStart + 1) / gridDimensions.M) * canvasRect.height,
        }
      : null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-30 cursor-crosshair touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="absolute inset-0 bg-gray-950/10 dark:bg-gray-950/25" />
      {overlayStyle && (
        <div
          className="absolute rounded-[2px] border-2 border-amber-400 bg-amber-300/15 shadow-[0_0_0_9999px_rgba(15,23,42,0.22)]"
          style={overlayStyle}
        />
      )}
      <div
        className="absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-gray-200/80 bg-white/95 px-3 py-2 text-sm text-gray-700 shadow-xl backdrop-blur dark:border-gray-700/80 dark:bg-gray-900/95 dark:text-gray-200"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="font-medium">
          {size ? `保留 ${size.width}×${size.height} 格` : "框选保留区域"}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">框外将丢弃，且不可撤销</span>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 active:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:active:bg-gray-800"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => selection && onConfirm(selection)}
          disabled={!selection}
          className="min-h-[44px] rounded-lg bg-red-600 px-3 text-xs font-medium text-white active:bg-red-700 disabled:opacity-40"
        >
          确认裁剪
        </button>
      </div>
    </div>
  );
}
