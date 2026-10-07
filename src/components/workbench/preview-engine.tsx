
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { PixelGrid } from "@/utils/watermark";

/** * 数值钳制 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface MiniMapProps {
  mappedPixelData: PixelGrid;
  /** N=列数(width)、M=行数(height)，与 useGridDimensions() 返回一致 */
  gridDimensions: { N: number; M: number };
  canvasSize: { width: number; height: number };
  viewScale: number;
  viewOffset: { x: number; y: number };
  stageSize: { width: number; height: number };
  onClose?: () => void;
}

/** * 小地图：画布右下角悬浮缩略图，可拖动、右下角可拉宽，双击复位 */
export function MiniMap({
  mappedPixelData,
  gridDimensions,
  canvasSize,
  viewScale,
  viewOffset,
  stageSize,
  onClose,
}: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: 12, y: 12 });
  const [mapWidth, setMapWidth] = useState(130);
  const [prefersDark, setPrefersDark] = useState(false);
  const [clampBounds, setClampBounds] = useState({
    left: 0,
    top: 0,
    right: stageSize.width,
    bottom: stageSize.height,
  });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; origW: number } | null>(null);

  /** * 宽度限制在可视区内 */
  const clampWidth = useCallback(
    (width: number) => {
      const available = clampBounds.right - clampBounds.left;
      const max = available > 0 ? Math.min(260, available) : 260;
      return Math.round(clamp(width, Math.min(96, max), max));
    },
    [clampBounds.left, clampBounds.right]
  );

  /** * 实际渲染尺寸：高度按网格宽高比推导 */
  const size = useMemo(() => {
    const width = clampWidth(mapWidth);
    const heightByRatio = Math.max(50, Math.round(width * (gridDimensions.N > 0 ? gridDimensions.M / gridDimensions.N : 1)));
    const availableHeight = clampBounds.bottom - clampBounds.top;
    return {
      width,
      height: Math.max(1, Math.round(availableHeight > 0 ? Math.min(heightByRatio, availableHeight) : heightByRatio)),
    };
  }, [clampWidth, gridDimensions.M, gridDimensions.N, mapWidth, clampBounds.bottom, clampBounds.top]);

  /** * 位置限制在可视区内 */
  const clampPosition = useCallback(
    (pos: { x: number; y: number }) => {
      const availableW = clampBounds.right - clampBounds.left;
      const availableH = clampBounds.bottom - clampBounds.top;
      if (availableW <= 0 || availableH <= 0) {
        return { x: Math.max(0, pos.x), y: Math.max(0, pos.y) };
      }
      return {
        x: clamp(pos.x, clampBounds.left, Math.max(clampBounds.left, clampBounds.right - size.width)),
        y: clamp(pos.y, clampBounds.top, Math.max(clampBounds.top, clampBounds.bottom - size.height)),
      };
    },
    [size.height, size.width, clampBounds]
  );

  const clampedPosition = useMemo(() => clampPosition(position), [clampPosition, position]);

  // 宽度越界时收敛
  useEffect(() => {
    setMapWidth((prev) => {
      const next = clampWidth(prev);
      return next === prev ? prev : next;
    });
  }, [clampWidth]);

  // 位置越界时收敛
  useEffect(() => {
    setPosition((prev) => {
      const next = clampPosition(prev);
      return next.x === prev.x && next.y === prev.y ? prev : next;
    });
  }, [clampPosition]);

  // 跟踪可视区域
  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const update = () => {
      const rect = parent.getBoundingClientRect();
      const viewport = window.visualViewport;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      const right = offsetLeft + (viewport?.width ?? window.innerWidth);
      const bottom = offsetTop + (viewport?.height ?? window.innerHeight);
      const next = {
        left: Math.max(0, offsetLeft - rect.left),
        top: Math.max(0, offsetTop - rect.top),
        right: Math.max(0, Math.min(rect.width, right - rect.left)),
        bottom: Math.max(0, Math.min(rect.height, bottom - rect.top)),
      };
      setClampBounds((prev) =>
        prev.left === next.left && prev.top === next.top && prev.right === next.right && prev.bottom === next.bottom ? prev : next
      );
    };
    update();
    const observer = "function" == typeof ResizeObserver ? new ResizeObserver(update) : null;
    observer?.observe(parent);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [stageSize.height, stageSize.width]);

  /** * 双击复位 */
  const resetPosition = useCallback(() => {
    setPosition({ x: 12, y: 12 });
    setMapWidth(clampWidth(130));
  }, [clampWidth]);

  // 深色模式监听
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPrefersDark(query.matches);
    update();
    if ("function" == typeof query.addEventListener) {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  /** * 开始拖动 */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('[data-resize="1"]')) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: clampedPosition.x, origY: clampedPosition.y };
    },
    [clampedPosition]
  );

  /** * 拖动 / 拉宽 */
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (resizeRef.current) {
        const deltaX = e.clientX - resizeRef.current.startX;
        setMapWidth(clampWidth(resizeRef.current.origW + deltaX));
        return;
      }
      if (!dragRef.current) return;
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      setPosition(
        clampPosition({
          x: dragRef.current.origX + deltaX,
          y: dragRef.current.origY + deltaY,
        })
      );
    },
    [clampWidth, clampPosition]
  );

  /** * 结束交互 */
  const endDrag = useCallback(() => {
    dragRef.current = null;
    resizeRef.current = null;
  }, []);

  /** * 开始拉宽 */
  const startResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, origW: size.width };
  }, [size.width]);

  // 绘制缩略图 + 视口框（原末尾 useEffect）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = size;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cellW = width / gridDimensions.N;
    const cellH = height / gridDimensions.M;
    ctx.clearRect(0, 0, width, height);
    const externalDark = prefersDark ? "#2d3748" : "#f0f0f0";
    const externalLight = prefersDark ? "#374151" : "#dcdcdc";
    for (let row = 0; row < gridDimensions.M; row += 1) {
      for (let col = 0; col < gridDimensions.N; col += 1) {
        const cell = mappedPixelData[row]?.[col];
        if (!cell) continue;
        if (cell.isExternal) {
          const halfW = cellW / 2;
          const halfH = cellH / 2;
          for (let y = 0; y < 2; y++) {
            for (let x = 0; x < 2; x++) {
              ctx.fillStyle = (y + x) % 2 == 0 ? externalDark : externalLight;
              ctx.fillRect(col * cellW + x * halfW, row * cellH + y * halfH, Math.ceil(halfW), Math.ceil(halfH));
            }
          }
        } else {
          ctx.fillStyle = cell.color;
          ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
        }
      }
    }
    if (stageSize.width > 0 && stageSize.height > 0 && canvasSize.width > 0) {
      const viewportW = stageSize.width / viewScale;
      const viewportH = stageSize.height / viewScale;
      const centerLogicalX = canvasSize.width / 2 - viewOffset.x / viewScale;
      const centerLogicalY = canvasSize.height / 2 - viewOffset.y / viewScale;
      const scaleX = width / canvasSize.width;
      const scaleY = height / canvasSize.height;
      ctx.strokeStyle = "rgba(245, 158, 11, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect((centerLogicalX - viewportW / 2) * scaleX, (centerLogicalY - viewportH / 2) * scaleY, viewportW * scaleX, viewportH * scaleY);
    }
  }, [mappedPixelData, gridDimensions, canvasSize, viewScale, viewOffset, stageSize, size, prefersDark]);

  return (
    <div
      ref={containerRef}
      className="absolute z-10 shadow-lg rounded-lg overflow-hidden border border-gray-200/50 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900 select-none"
      style={{ left: clampedPosition.x, top: clampedPosition.y, width: size.width, height: size.height, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={resetPosition}
    >
      <canvas ref={canvasRef} className="w-full h-full rounded block cursor-grab active:cursor-grabbing" style={{ imageRendering: "pixelated" }} />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="隐藏小地图"
          className="absolute left-0 top-0 w-11 h-11 flex items-center justify-center rounded-br-xl bg-gray-900/55 text-white/90 active:bg-gray-900/80"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <div data-resize="1" className="absolute bottom-0 right-0 w-11 h-11 cursor-se-resize" onPointerDown={startResize}>
        <svg className="w-3 h-3 text-gray-400 absolute bottom-1.5 right-1.5" viewBox="0 0 6 6" fill="currentColor">
          <circle cx="5" cy="5" r="1" />
          <circle cx="2" cy="5" r="1" />
          <circle cx="5" cy="2" r="1" />
        </svg>
      </div>
    </div>
  );
}

/** * 图标共享 props */
const ICON_PROPS = {
  fill: "none",
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "w-full h-full",
};

/** * 滑杆设置图标 */
export const SlidersIcon = () => (
  <svg {...ICON_PROPS}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
    <circle cx="9" cy="6" r="2" />
    <circle cx="15" cy="12" r="2" />
    <circle cx="9" cy="18" r="2" />
  </svg>
);

/** * 调色盘图标 */
export const PaletteIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 3a9 9 0 100 18 3 3 0 003-3 2 2 0 012-2h1a3 3 0 003-3 9 9 0 00-12-7z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="12" cy="7.5" r="1" />
    <circle cx="16.5" cy="11" r="1" />
  </svg>
);

/** * 画笔图标 */
export const PenIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);

/** * 网格图标 */
export const GridIcon = () => (
  <svg {...ICON_PROPS}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

/** * 图层图标 */
export const LayersIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 2l9 5-9 5-9-5 9-5z" />
    <path d="M3 12l9 5 9-5" />
    <path d="M3 17l9 5 9-5" />
  </svg>
);

/** * 罗盘图标 */
export const DialIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="9" />
    <polygon points="15.5 8.5 11 11 8.5 15.5 13 13 15.5 8.5" />
  </svg>
);

/** * 表格图标 */
export const TableIcon = () => (
  <svg {...ICON_PROPS}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
);

/** * 星形图标 */
export const StarIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 3l2.4 5.4L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.6L12 3z" />
  </svg>
);

/** * 太阳光晕图标 */
export const SunIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="5" />
    <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19" />
  </svg>
);

/** * 标签图标 */
export const TagIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

/** * 信息图标 */
export const InfoIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

/** * 下载图标 */
export const DownloadIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

/** * 懒加载的预览引擎。具名导出供 about-modal 等引用 */
export const LazyPreviewEngine = dynamic(() => import("./preview-engine-impl"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-sm text-gray-400">加载预览引擎…</div>
    </div>
  ),
});

/** * default 导出保持与契约一致 */
export default LazyPreviewEngine;
