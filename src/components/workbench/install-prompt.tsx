import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
// 像素网格规范类型（稀疏网格，见 docs/research/integration-report.md 决策 1）
import type { PixelGrid } from "@/utils/watermark";

/** 浏览器 PWA beforeinstallprompt 事件（非标准 API） */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** PWA 安装引导浮动按钮（"安装应用"） */
export function InstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setCanInstall(true);
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    // 已以独立窗口（PWA）方式运行时不再提示安装
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsStandalone(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setInstallEvent(null);
      setCanInstall(false);
    }
  };

  return isStandalone || !canInstall ? null : (
    <button
      className="fixed bottom-6 right-6 bg-gray-900 text-gray-50 px-6 py-3 rounded-full shadow-lg hover:shadow-xl hover:bg-gray-800 active:bg-gray-800 transform hover:scale-105 active:scale-105 transition-all duration-200 flex items-center gap-2 z-50"
      onClick={handleInstallClick}
      aria-label="安装应用"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 4v16m0 0l-4-4m4 4l4-4M5 12h14"
        />
      </svg>
      安装应用
    </button>
  );
}

export default InstallPrompt;

// ============================================================
// ZoomableCanvas
// 可缩放主画布：studio（手绘/拾色交互）与 focus（专心拼豆）双模式绘制 + 滚轮/双指缩放 + 拖拽平移手势
// ============================================================

/** 选区矩形（与 page.tsx 的 SelectionRect 同形；本地声明避免与 page 循环依赖） */
interface SelectionRectLike {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export interface ZoomableCanvasProps {
  mode: string; // "studio" | "focus"
  canvasRef?: { current: HTMLCanvasElement | null } | null;
  canvasSize?: { width: number; height: number } | null;
  mappedPixelData?: PixelGrid | null;
  gridDimensions?: { N: number; M: number } | null;
  className?: string;
  isManualColoringMode?: boolean;
  highlightColorKey?: string | null;
  onHighlightComplete?: () => void;
  /** studio 模式画布交互（源 8 参透传：第 3/4 参按源位置传递，page 侧以第 5/6 参为 clientX/clientY） */
  onInteraction?: (
    row: number,
    col: number,
    arg3: number,
    arg4: number,
    clientX: number,
    clientY: number,
    isDirect: boolean,
    forceHide?: boolean
  ) => void;
  /** 手绘模式指针事件（phase + 命中信息） */
  onManualPointer?: (
    phase: "down" | "move" | "up" | "leave",
    hit: {
      row: number;
      col: number;
      clientX: number;
      clientY: number;
      pageX: number;
      pageY: number;
      hasCell: boolean;
    }
  ) => void;
  manualCursorClass?: string;
  isPanModifierActive?: boolean;
  referenceImageSrc?: string | null;
  referenceOpacity?: number;
  selectionRect?: SelectionRectLike | null;
  selectionPreviewRect?: SelectionRectLike | null;
  previewCells?: { row: number; col: number }[] | null;
  currentColor?: string;
  completedCells?: Set<string>;
  recommendedRegion?: { row: number; col: number }[] | null;
  gridSectionInterval?: number;
  showSectionLines?: boolean;
  sectionLineColor?: string;
  onCellClick?: (row: number, col: number) => void;
  viewScale?: number;
  viewOffset?: { x: number; y: number };
  onViewChange?: (scale: number, offset: { x: number; y: number }) => void;
  minScale?: number;
  maxScale?: number;
}

/** hex → 灰度 rgb() 字符串（专注模式下非当前色去饱和，源 i 内部函数） */
function toGrayRgbString(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const gray = Math.round(
    0.299 * r + 0.587 * parseInt(clean.slice(2, 4), 16) + 0.114 * parseInt(clean.slice(4, 6), 16)
  );
  return `rgb(${gray}, ${gray}, ${gray})`;
}

/** 棋盘格透明纹理（外部色/透明格底纹，源 i 内部函数） */
function createCheckerPattern(
  ctx: CanvasRenderingContext2D,
  cellSize: number,
  lightColor: string,
  darkColor: string
): CanvasPattern | null {
  const square = Math.max(2, Math.round(cellSize / 4));
  const tile = document.createElement("canvas");
  tile.width = 2 * square;
  tile.height = 2 * square;
  const tileCtx = tile.getContext("2d")!;
  tileCtx.fillStyle = lightColor;
  tileCtx.fillRect(0, 0, square, square);
  tileCtx.fillRect(square, square, square, square);
  tileCtx.fillStyle = darkColor;
  tileCtx.fillRect(square, 0, square, square);
  tileCtx.fillRect(0, square, square, square);
  return ctx.createPattern(tile, "repeat");
}

/** 双触点间距（捏合缩放用，源 i 内部函数 eb） */
function getTouchDistance(touches: React.TouchList): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 主画布像素绘制（源 i 内联绘制函数，提出为纯函数） */
function drawPixelCanvas(options: {
  canvas: HTMLCanvasElement;
  canvasSize: { width: number; height: number } | null;
  mappedPixelData: PixelGrid;
  gridDimensions: { N: number; M: number };
  isDarkMode: boolean;
  mode: string;
  isHighlighting: boolean;
  highlightColorKey?: string | null;
  currentColor?: string;
  completedCells?: Set<string>;
  recommendedSet: Set<string> | null;
  showSectionLines: boolean;
  sectionLineColor?: string;
  gridSectionInterval: number;
  referenceImage: HTMLImageElement | null;
  referenceOpacity: number;
  previewCells?: { row: number; col: number }[] | null;
  selectionRect?: SelectionRectLike | null;
  selectionPreviewRect?: SelectionRectLike | null;
}) {
  const {
    canvas,
    canvasSize,
    mappedPixelData,
    gridDimensions,
    isDarkMode,
    mode,
    isHighlighting,
    highlightColorKey,
    currentColor,
    completedCells,
    recommendedSet,
    showSectionLines,
    sectionLineColor = "#007acc",
    gridSectionInterval = 10,
    referenceImage,
    referenceOpacity = 0.25,
    previewCells,
    selectionRect,
    selectionPreviewRect,
  } = options;
  // 仅在传入 canvasSize 时同步画布物理尺寸
  if (canvasSize) {
    if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
    if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { N: cols, M: rows } = gridDimensions;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const cellW = canvasWidth / cols;
  const cellH = canvasHeight / rows;
  const minCell = Math.min(cellW, cellH);
  const colToX = (col: number) => Math.floor(col * cellW);
  const rowToY = (row: number) => Math.floor(row * cellH);
  const colWidth = (col: number) => Math.floor((col + 1) * cellW) - Math.floor(col * cellW);
  const rowHeight = (row: number) => Math.floor((row + 1) * cellH) - Math.floor(row * cellH);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  const checkerPattern = createCheckerPattern(
    ctx,
    minCell,
    isDarkMode ? "#2d3748" : "#f0f0f0",
    isDarkMode ? "#374151" : "#dcdcdc"
  );
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = mappedPixelData[row]?.[col];
      if (!cell) continue;
      const x = colToX(col);
      const y = rowToY(row);
      const w = colWidth(col);
      const h = rowHeight(row);
      if (cell.isExternal) {
        ctx.fillStyle = checkerPattern!;
        ctx.fillRect(x, y, w, h);
      } else {
        let color = cell.color;
        if (mode === "focus" && currentColor && cell.color !== currentColor) {
          color = toGrayRgbString(cell.color);
        }
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
      }
      // studio 高亮：非目标色（含外部色）压暗
      if (
        mode === "studio" &&
        isHighlighting &&
        highlightColorKey &&
        (cell.isExternal || cell.color.toUpperCase() !== highlightColorKey.toUpperCase())
      ) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(x, y, w, h);
      }
      // focus：已完成格加绿色罩
      if (
        mode === "focus" &&
        completedCells &&
        currentColor &&
        !cell.isExternal &&
        completedCells.has(`${row},${col}`) &&
        cell.color === currentColor
      ) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.45)";
        ctx.fillRect(x, y, w, h);
      }
      // focus：推荐区域加橙色罩
      if (mode === "focus" && recommendedSet?.has(`${row},${col}`)) {
        ctx.fillStyle = "rgba(251, 146, 60, 0.35)";
        ctx.fillRect(x, y, w, h);
      }
    }
  }
  if (referenceImage && referenceOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(Math.max(referenceOpacity, 0), 1);
    ctx.drawImage(referenceImage, 0, 0, canvasWidth, canvasHeight);
    ctx.restore();
  }
  // focus：推荐区域外描边（相邻格同属推荐区则不画那条边）
  if (mode === "focus" && recommendedSet && recommendedSet.size > 0) {
    ctx.strokeStyle = "rgba(251, 146, 60, 0.9)";
    ctx.lineWidth = Math.max(1.5, 0.15 * minCell);
    recommendedSet.forEach((key) => {
      const [row, col] = key.split(",").map(Number);
      const x = colToX(col);
      const y = rowToY(row);
      const w = colWidth(col);
      const h = rowHeight(row);
      if (!recommendedSet.has(`${row - 1},${col}`)) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.stroke();
      }
      if (!recommendedSet.has(`${row + 1},${col}`)) {
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();
      }
      if (!recommendedSet.has(`${row},${col - 1}`)) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h);
        ctx.stroke();
      }
      if (!recommendedSet.has(`${row},${col + 1}`)) {
        ctx.beginPath();
        ctx.moveTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();
      }
    });
  }
  // focus：分段网格线
  if (mode === "focus" && showSectionLines) {
    ctx.strokeStyle = sectionLineColor;
    ctx.lineWidth = Math.max(1, 0.2 * minCell);
    for (let col = gridSectionInterval; col < cols; col += gridSectionInterval) {
      ctx.beginPath();
      ctx.moveTo(colToX(col), 0);
      ctx.lineTo(colToX(col), canvasHeight);
      ctx.stroke();
    }
    for (let row = gridSectionInterval; row < rows; row += gridSectionInterval) {
      ctx.beginPath();
      ctx.moveTo(0, rowToY(row));
      ctx.lineTo(canvasWidth, rowToY(row));
      ctx.stroke();
    }
  }
  // 手绘粘贴/移动预览格
  if (previewCells?.length) {
    ctx.save();
    ctx.fillStyle = "rgba(59, 130, 246, 0.35)";
    previewCells.forEach(({ row, col }) =>
      ctx.fillRect(colToX(col), rowToY(row), colWidth(col), rowHeight(row))
    );
    ctx.restore();
  }
  // 虚线选区框
  const strokeSelection = (rect: SelectionRectLike, strokeColor: string) => {
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(1, 0.2 * minCell);
    ctx.setLineDash([Math.max(4, 0.6 * minCell), Math.max(3, 0.4 * minCell)]);
    ctx.strokeRect(
      colToX(rect.colStart),
      rowToY(rect.rowStart),
      colToX(rect.colEnd + 1) - colToX(rect.colStart),
      rowToY(rect.rowEnd + 1) - rowToY(rect.rowStart)
    );
    ctx.restore();
  };
  if (selectionRect) strokeSelection(selectionRect, "rgba(245, 158, 11, 0.95)");
  if (selectionPreviewRect) strokeSelection(selectionPreviewRect, "rgba(14, 165, 233, 0.9)");
}

export function ZoomableCanvas({
  mode,
  mappedPixelData,
  gridDimensions,
  canvasRef,
  canvasSize,
  className,
  isManualColoringMode = false,
  highlightColorKey,
  onHighlightComplete,
  onInteraction,
  onManualPointer,
  manualCursorClass,
  isPanModifierActive = false,
  referenceImageSrc,
  referenceOpacity = 0.25,
  selectionRect,
  selectionPreviewRect,
  previewCells,
  currentColor,
  completedCells,
  recommendedRegion,
  gridSectionInterval = 10,
  showSectionLines = false,
  sectionLineColor = "#007acc",
  onCellClick,
  viewScale,
  viewOffset,
  onViewChange,
  minScale = 0.3,
  maxScale = 3,
}: ZoomableCanvasProps) {
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resolvedCanvasRef = canvasRef ?? fallbackCanvasRef;
  const gridOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const referenceImageRef = useRef<HTMLImageElement | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean | null>(null);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [internalScale, setInternalScale] = useState(1);
  const [internalOffset, setInternalOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  // 受控/非受控双模式视图状态
  const scale = viewScale ?? internalScale;
  const offset = viewOffset ?? internalOffset;
  const viewStateRef = useRef({ scale, offset });
  const panStartRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null);
  const isPanGestureRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const lastTouchEndTimeRef = useRef(0);

  // 推荐区域 → "row,col" 集合
  const recommendedSet = useMemo(() => {
    if (!recommendedRegion) return null;
    const set = new Set<string>();
    recommendedRegion.forEach((cell) => set.add(`${cell.row},${cell.col}`));
    return set;
  }, [recommendedRegion]);

  // 视图变更：受控回调优先，否则内部状态
  const applyView = useCallback(
    (nextScale: number, nextOffset: { x: number; y: number }) => {
      viewStateRef.current = { scale: nextScale, offset: nextOffset };
      if (onViewChange) onViewChange(nextScale, nextOffset);
      else {
        setInternalScale(nextScale);
        setInternalOffset(nextOffset);
      }
    },
    [onViewChange]
  );

  useEffect(() => {
    viewStateRef.current = { scale, offset };
  }, [scale, offset]);

  // 无受控视图时，数据变化重置缩放/偏移
  useEffect(() => {
    if (!onViewChange) {
      setInternalScale(1);
      setInternalOffset({ x: 0, y: 0 });
    }
  }, [mappedPixelData, gridDimensions, onViewChange]);

  // 跟随系统深色模式（兼容旧 API）
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setIsDarkMode(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  // 高亮闪现 300ms 后回调完成
  useEffect(() => {
    if (highlightColorKey && mappedPixelData && gridDimensions) {
      setIsHighlighting(true);
      const timer = setTimeout(() => {
        setIsHighlighting(false);
        onHighlightComplete?.();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [highlightColorKey, mappedPixelData, gridDimensions, onHighlightComplete]);

  const redraw = useCallback(() => {
    const canvas = resolvedCanvasRef.current;
    if (canvas && mappedPixelData && gridDimensions) {
      drawPixelCanvas({
        canvas,
        canvasSize: canvasSize ?? null,
        mappedPixelData,
        gridDimensions,
        isDarkMode: !!isDarkMode,
        mode,
        isHighlighting,
        highlightColorKey,
        currentColor,
        completedCells,
        recommendedSet,
        showSectionLines,
        sectionLineColor,
        gridSectionInterval,
        referenceImage: referenceImageRef.current,
        referenceOpacity,
        previewCells,
        selectionRect,
        selectionPreviewRect,
      });
    }
  }, [
    resolvedCanvasRef,
    mappedPixelData,
    gridDimensions,
    canvasSize,
    isDarkMode,
    mode,
    currentColor,
    completedCells,
    recommendedSet,
    isHighlighting,
    highlightColorKey,
    showSectionLines,
    sectionLineColor,
    gridSectionInterval,
    previewCells,
    referenceOpacity,
    selectionRect,
    selectionPreviewRect,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // 参考底图加载
  useEffect(() => {
    if (!referenceImageSrc) {
      referenceImageRef.current = null;
      return;
    }
    const image = new Image();
    image.onload = () => {
      referenceImageRef.current = image;
      redraw();
    };
    image.src = referenceImageSrc;
  }, [redraw, referenceImageSrc]);

  // 屏幕空间网格覆盖层（独立画布，随视图变化重绘）
  useEffect(() => {
    const overlay = gridOverlayRef.current;
    const container = containerRef.current;
    const canvas = resolvedCanvasRef.current;
    if (overlay && container && canvas && gridDimensions && canvasSize) {
      const { N: cols, M: rows } = gridDimensions;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      overlay.width = containerWidth * dpr;
      overlay.height = containerHeight * dpr;
      overlay.style.width = `${containerWidth}px`;
      overlay.style.height = `${containerHeight}px`;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, containerWidth, containerHeight);
      const cellWidth = canvasSize.width / cols;
      const cellHeight = canvasSize.height / rows;
      const containerRect = container.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const left = canvasRect.left - containerRect.left;
      const top = canvasRect.top - containerRect.top;
      const width = canvasRect.width;
      const height = canvasRect.height;
      const scaleX = width / canvasSize.width;
      const scaleY = height / canvasSize.height;
      ctx.strokeStyle = isDarkMode ? "#4B5563" : "#BBBBBB";
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();
      for (let i = 1; i < cols; i++) {
        const x = Math.round(left + i * cellWidth * scaleX) + 0.5 / dpr;
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + height);
      }
      for (let i = 1; i < rows; i++) {
        const y = Math.round(top + i * cellHeight * scaleY) + 0.5 / dpr;
        ctx.moveTo(left, y);
        ctx.lineTo(left + width, y);
      }
      ctx.stroke();
    }
  }, [gridDimensions, canvasSize, scale, offset, resolvedCanvasRef, isDarkMode]);

  // 客户端坐标 → 网格单元
  const getCellFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = resolvedCanvasRef.current;
      if (!canvas || !gridDimensions) return null;
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (canvas.width / rect.width);
      const y = (clientY - rect.top) * (canvas.height / rect.height);
      const col = Math.floor(x / (canvas.width / gridDimensions.N));
      const row = Math.floor(y / (canvas.height / gridDimensions.M));
      return row >= 0 && row < gridDimensions.M && col >= 0 && col < gridDimensions.N
        ? { row, col }
        : null;
    },
    [resolvedCanvasRef, gridDimensions]
  );

  const emitInteraction = useCallback(
    (
      row: number,
      col: number,
      arg3: number,
      arg4: number,
      clientX: number,
      clientY: number,
      isDirect: boolean,
      forceHide?: boolean
    ) => {
      if (onInteraction && mode === "studio") {
        onInteraction(row, col, arg3, arg4, clientX, clientY, isDirect, forceHide);
      }
    },
    [onInteraction, mode]
  );

  const emitManualPointer = useCallback(
    (phase: "down" | "move" | "up" | "leave", clientX: number, clientY: number, pageX: number, pageY: number) => {
      if (!onManualPointer || mode !== "studio") return;
      const cell = getCellFromPoint(clientX, clientY);
      onManualPointer(phase, {
        row: cell?.row ?? -1,
        col: cell?.col ?? -1,
        clientX,
        clientY,
        pageX,
        pageY,
        hasCell: !!cell,
      });
    },
    [getCellFromPoint, mode, onManualPointer]
  );

  // 以指针为锚点缩放
  const setZoom = useCallback(
    (nextScale: number, clientX: number, clientY: number) => {
      const canvas = resolvedCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return void applyView(nextScale, viewStateRef.current.offset);
      const containerRect = container.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const x = (clientX - canvasRect.left) * (canvas.width / canvasRect.width);
      const y = (clientY - canvasRect.top) * (canvas.height / canvasRect.height);
      applyView(nextScale, {
        x: clientX - (containerRect.left + containerRect.width / 2) - (x - canvas.width / 2) * nextScale,
        y: clientY - (containerRect.top + containerRect.height / 2) - (y - canvas.height / 2) * nextScale,
      });
    },
    [applyView, resolvedCanvasRef]
  );

  // 滚轮缩放经 ref 转接，避免监听器随渲染频繁重挂
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelHandlerRef.current = (e: WheelEvent) => {
    if (!gridDimensions || !mappedPixelData) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(Math.max(minScale, Math.min(maxScale, viewStateRef.current.scale * factor)), e.clientX, e.clientY);
  };
  useEffect(() => {
    const canvas = resolvedCanvasRef.current;
    if (!canvas) return;
    const listener = (e: WheelEvent) => wheelHandlerRef.current(e);
    canvas.addEventListener("wheel", listener, { passive: false });
    return () => canvas.removeEventListener("wheel", listener);
  }, []);

  const beginPan = useCallback((x: number, y: number, pageX: number, pageY: number) => {
    panStartRef.current = { x, y, pageX, pageY };
    lastPanPointRef.current = { x, y };
    isPanGestureRef.current = false;
    setIsPanning(false);
  }, []);

  const endPan = useCallback(() => {
    panStartRef.current = null;
    lastPanPointRef.current = null;
    isPanGestureRef.current = false;
    setIsPanning(false);
  }, []);

  const panMove = useCallback(
    (x: number, y: number) => {
      if (!lastPanPointRef.current || !panStartRef.current) return;
      const totalDx = x - panStartRef.current.x;
      const totalDy = y - panStartRef.current.y;
      if (!isPanGestureRef.current && (Math.abs(totalDx) > 6 || Math.abs(totalDy) > 6)) {
        isPanGestureRef.current = true;
        setIsPanning(true);
        emitInteraction(0, 0, 0, 0, 0, 0, false, true);
      }
      if (isPanGestureRef.current) {
        const dx = x - lastPanPointRef.current.x;
        const dy = y - lastPanPointRef.current.y;
        applyView(viewStateRef.current.scale, {
          x: viewStateRef.current.offset.x + dx,
          y: viewStateRef.current.offset.y + dy,
        });
        lastPanPointRef.current = { x, y };
      }
    },
    [applyView, emitInteraction]
  );

  // 单击落格：focus 模式回调 onCellClick，studio 模式转发交互
  const activateCell = useCallback(
    (clientX: number, clientY: number, pageX: number, pageY: number) => {
      const cell = getCellFromPoint(clientX, clientY);
      if (!cell) return void emitInteraction(0, 0, clientX, clientY, pageX, pageY, false, true);
      if (mode === "focus") onCellClick?.(cell.row, cell.col);
      else emitInteraction(cell.row, cell.col, clientX, clientY, pageX, pageY, true);
    },
    [emitInteraction, getCellFromPoint, mode, onCellClick]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // 触屏刚结束的 500ms 内忽略鼠标事件（合成事件去抖）
      if (Date.now() - lastTouchEndTimeRef.current < 500) return;
      const wantsPan = !(isManualColoringMode && onManualPointer) || isPanModifierActive || e.button === 1 || e.button === 2;
      if (e.button === 2) e.preventDefault();
      if (wantsPan) {
        e.preventDefault();
        beginPan(e.clientX, e.clientY, e.pageX, e.pageY);
        return;
      }
      e.preventDefault();
      emitManualPointer("down", e.clientX, e.clientY, e.pageX, e.pageY);
    },
    [beginPan, emitManualPointer, isManualColoringMode, isPanModifierActive, onManualPointer]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (panStartRef.current) return void panMove(e.clientX, e.clientY);
      if (isManualColoringMode && onManualPointer) {
        return void emitManualPointer("move", e.clientX, e.clientY, e.pageX, e.pageY);
      }
      if (mode !== "studio" || isManualColoringMode || !onInteraction) return;
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (!cell) return void emitInteraction(0, 0, e.clientX, e.clientY, e.pageX, e.pageY, false, true);
      emitInteraction(cell.row, cell.col, e.clientX, e.clientY, e.pageX, e.pageY, false);
    },
    [emitInteraction, emitManualPointer, getCellFromPoint, isManualColoringMode, mode, onInteraction, onManualPointer, panMove]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (panStartRef.current) {
        const start = panStartRef.current;
        const wasGesture = isPanGestureRef.current;
        endPan();
        // 未发生拖拽手势才视为点击
        if (!wasGesture) activateCell(start.x, start.y, start.pageX, start.pageY);
        return;
      }
      if (isManualColoringMode && onManualPointer) {
        emitManualPointer("up", e.clientX, e.clientY, e.pageX, e.pageY);
      }
    },
    [activateCell, emitManualPointer, endPan, isManualColoringMode, onManualPointer]
  );

  const handleMouseLeave = useCallback(() => {
    if (panStartRef.current) endPan();
    if (isManualColoringMode && onManualPointer) {
      return void emitManualPointer("leave", 0, 0, 0, 0);
    }
    emitInteraction(0, 0, 0, 0, 0, 0, false, true);
  }, [emitInteraction, emitManualPointer, endPan, isManualColoringMode, onManualPointer]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (!touch) return;
        const wantsPan = !(isManualColoringMode && onManualPointer) || isPanModifierActive;
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          pageX: touch.pageX,
          pageY: touch.pageY,
        };
        if (wantsPan) beginPan(touch.clientX, touch.clientY, touch.pageX, touch.pageY);
        else emitManualPointer("down", touch.clientX, touch.clientY, touch.pageX, touch.pageY);
        pinchDistanceRef.current = null;
        if (mode === "studio" && !isManualColoringMode) {
          const cell = getCellFromPoint(touch.clientX, touch.clientY);
          if (cell) emitInteraction(cell.row, cell.col, touch.clientX, touch.clientY, touch.pageX, touch.pageY, false);
        }
      } else if (e.touches.length === 2) {
        // 进入捏合缩放
        pinchDistanceRef.current = getTouchDistance(e.touches);
        touchStartRef.current = null;
        endPan();
      }
    },
    [beginPan, emitInteraction, emitManualPointer, endPan, getCellFromPoint, isManualColoringMode, isPanModifierActive, mode, onManualPointer]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length === 2 && pinchDistanceRef.current !== null) {
        const distance = getTouchDistance(e.touches);
        setZoom(
          Math.max(minScale, Math.min(maxScale, viewStateRef.current.scale * (distance / pinchDistanceRef.current))),
          e.touches[0].clientX,
          e.touches[0].clientY
        );
        pinchDistanceRef.current = distance;
        return;
      }
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (!touch) return;
        if (panStartRef.current) return void panMove(touch.clientX, touch.clientY);
        if (isManualColoringMode && onManualPointer && !isPanModifierActive) {
          emitManualPointer("move", touch.clientX, touch.clientY, touch.pageX, touch.pageY);
        }
      }
    },
    [emitManualPointer, isManualColoringMode, isPanModifierActive, maxScale, minScale, onManualPointer, panMove, setZoom]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length !== 0) return;
      lastTouchEndTimeRef.current = Date.now();
      const wasGesture = isPanGestureRef.current;
      const touchStart = touchStartRef.current;
      const changed = e.changedTouches[0];
      const point = changed
        ? { x: changed.clientX, y: changed.clientY, pageX: changed.pageX, pageY: changed.pageY }
        : touchStart;
      const isManual = isManualColoringMode && onManualPointer;
      const wantsPan = !isManual || isPanModifierActive;
      endPan();
      pinchDistanceRef.current = null;
      if (isManual && !wantsPan && point) {
        emitManualPointer("up", point.x, point.y, point.pageX, point.pageY);
        touchStartRef.current = null;
        return;
      }
      if (!wasGesture && touchStart) activateCell(touchStart.x, touchStart.y, touchStart.pageX, touchStart.pageY);
      touchStartRef.current = null;
    },
    [activateCell, emitManualPointer, endPan, isManualColoringMode, isPanModifierActive, onManualPointer]
  );

  const cursorClass =
    mode === "focus"
      ? "cursor-crosshair"
      : isManualColoringMode
        ? manualCursorClass ?? "cursor-crosshair"
        : "cursor-grab";

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex items-center justify-center overflow-hidden ${className ?? ""}`}
      style={{ touchAction: "none" }}
    >
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        <canvas
          ref={resolvedCanvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className={`block ${isPanning ? "cursor-grabbing" : cursorClass}`}
          style={{ imageRendering: "pixelated", touchAction: "none" }}
        />
      </div>
      <canvas ref={gridOverlayRef} className="absolute inset-0 pointer-events-none" />
    </div>
  );
}

// ============================================================
// ColorCelebration
// 单色完成庆祝动画：彩屑下落 + 对勾卡片 + 进度条，2.8s 后回调 onComplete
// ============================================================

// 庆祝语料
const CELEBRATION_PHRASES = ["太棒了！", "完美！", "漂亮！", "厉害！", "真不错！", "干得好！", "Nice！", "绝了！"];

export interface ColorCelebrationProps {
  isVisible: boolean;
  onComplete: () => void;
  colorHex?: string;
  colorName?: string;
  colorsCompleted?: number;
  colorsTotal?: number;
}

/** hex → HSL（s/l 为 0-1 小数；源 d 内 IIFE，提出为纯函数） */
function hexToHslFraction(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const diff = max - min;
  return {
    h: 360 *
      (max === r
        ? ((g - b) / diff + 6 * Number(g < b)) / 6
        : max === g
          ? ((b - r) / diff + 2) / 6
          : ((r - g) / diff + 4) / 6),
    s: l > 0.5 ? diff / (2 - max - min) : diff / (max + min),
    l,
  };
}

/** 由主色派生 7色彩屑配色（源 d 内映射） */
function buildCelebrationPalette(hex: string): string[] {
  const { h, s, l } = hexToHslFraction(hex);
  return [
    `hsl(${h}, ${Math.round(100 * s)}%, ${Math.round(Math.min(100 * l + 15, 85))}%)`,
    `hsl(${h}, ${Math.round(100 * s)}%, ${Math.round(100 * l)}%)`,
    `hsl(${h}, ${Math.round(Math.max(100 * s - 20, 30))}%, ${Math.round(Math.min(100 * l + 25, 90))}%)`,
    `hsl(${(h + 15) % 360}, ${Math.round(100 * s)}%, ${Math.round(100 * l)}%)`,
    `hsl(${(h - 15 + 360) % 360}, ${Math.round(100 * s)}%, ${Math.round(Math.min(100 * l + 10, 80))}%)`,
    "hsl(43, 96%, 56%)",
    "hsl(43, 96%, 72%)",
  ];
}

export function ColorCelebration({
  isVisible,
  onComplete,
  colorHex = "#788c5d",
  colorName,
  colorsCompleted = 0,
  colorsTotal = 0,
}: ColorCelebrationProps) {
  const [isShowing, setIsShowing] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  // 每次显示随机抽一句庆祝语
  const phrase = useMemo(
    () => CELEBRATION_PHRASES[Math.floor(Math.random() * CELEBRATION_PHRASES.length)],
    [isVisible]
  );
  const confettiPieces = useMemo(() => {
    if (!isVisible) return [] as {
      left: number;
      delay: number;
      duration: number;
      color: string;
      size: number;
      rotateEnd: number;
      drift: number;
      shape: "rect" | "circle";
    }[];
    const palette = buildCelebrationPalette(colorHex);
    return Array.from({ length: 50 }, () => ({
      left: 100 * Math.random(),
      delay: 0.6 * Math.random(),
      duration: 1.6 + 1.2 * Math.random(),
      color: palette[Math.floor(Math.random() * palette.length)],
      size: 4 + 6 * Math.random(),
      rotateEnd: 360 + 720 * Math.random(),
      drift: (Math.random() - 0.5) * 60,
      shape: Math.random() > 0.4 ? ("rect" as const) : ("circle" as const),
    }));
  }, [isVisible, colorHex]);

  useEffect(() => {
    if (!isVisible) {
      setIsShowing(false);
      setIsFadingOut(false);
      return;
    }
    setIsShowing(true);
    setIsFadingOut(false);
    const fadeTimer = setTimeout(() => setIsFadingOut(true), 2300);
    const completeTimer = setTimeout(() => {
      setIsShowing(false);
      onComplete();
    }, 2800);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [isVisible, onComplete]);

  return isShowing ? (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {confettiPieces.map((piece, index) => (
        <div
          key={index}
          className="absolute -top-3"
          style={
            {
              left: `${piece.left}%`,
              width: piece.shape === "rect" ? `${piece.size}px` : `${piece.size + 1}px`,
              height: piece.shape === "rect" ? `${1.6 * piece.size}px` : `${piece.size + 1}px`,
              backgroundColor: piece.color,
              borderRadius: piece.shape === "circle" ? "50%" : "1.5px",
              animation: `celebration-fall ${piece.duration}s ${piece.delay}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
              "--drift": `${piece.drift}px`,
              "--rotate-end": `${piece.rotateEnd}deg`,
            } as CSSProperties
          }
        />
      ))}
      <div
        className={`absolute top-1/2 left-1/2 flex flex-col items-center transition-all duration-500 ${
          isFadingOut ? "opacity-0 scale-90" : "opacity-100 scale-100"
        }`}
        style={{
          transform: "translate(-50%, -50%)",
          animation: isFadingOut ? undefined : "celebration-card-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        }}
      >
        <div
          className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
          style={{
            backgroundColor: colorHex,
            boxShadow: `0 8px 32px ${colorHex}66, 0 0 0 4px rgba(255,255,255,0.3)`,
          }}
        >
          <svg className="w-10 h-10 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
              style={{
                strokeDasharray: 24,
                strokeDashoffset: 24,
                animation: "celebration-check 0.4s 0.3s ease-out forwards",
              }}
            />
          </svg>
        </div>
        <div
          className="mt-4 text-2xl font-bold text-white drop-shadow-lg"
          style={{ textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
        >
          {phrase}
        </div>
        {colorName && (
          <div className="mt-1.5 px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm">
            <span className="text-sm text-white/90 font-medium">
              {colorName} 已完成
            </span>
          </div>
        )}
        {colorsTotal > 0 && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <div className="w-32 h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-white/80 transition-all"
                style={{
                  width: `${Math.round((colorsCompleted / colorsTotal) * 100)}%`,
                  animation: "celebration-progress 0.8s 0.4s ease-out forwards",
                  transformOrigin: "left",
                }}
              />
            </div>
            <span className="text-xs text-white/70 font-medium tabular-nums">
              {colorsCompleted} / {colorsTotal}
            </span>
          </div>
        )}
      </div>
      <style>{`
        @keyframes celebration-fall {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 1;
          }
          75% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(100vh) translateX(var(--drift)) rotate(var(--rotate-end));
            opacity: 0;
          }
        }
        @keyframes celebration-card-in {
          0% {
            transform: translate(-50%, -50%) scale(0.3);
            opacity: 0;
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
        }
        @keyframes celebration-check {
          to { stroke-dashoffset: 0; }
        }
        @keyframes celebration-progress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  ) : null;
}
