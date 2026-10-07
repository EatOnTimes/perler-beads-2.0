"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ExportArtifact } from "@/utils/export-errors";
import { canvasToBlob } from "@/utils/export-errors";
import { getExportCanvasSize, renderArtwork } from "@/utils/watermark";
import type { ExportConfig, PixelGrid } from "@/utils/watermark";
import { Button, formatTimestamp } from "@/utils/bundle-misc";

export interface PreviewEngineImplProps {
  mappedPixelData: PixelGrid | null;
  gridDimensions: { N: number; M: number } | null;
  /** 渲染配置（纹理/阴影/圆角/背景/品牌文字）。TODO(类型): 与 app/page.tsx 的 RenderConfig 在集成阶段对齐 */
  config: ExportConfig;
}

/** 经 ref 暴露的句柄（源 useImperativeHandle 仅暴露 download） */
export interface PreviewEngineHandle {
  download: () => Promise<ExportArtifact>;
}

interface ViewTransform {
  zoom: number;
  offset: { x: number; y: number };
}

/** 缩放钳制在 0.5x–8x（源模块内 c） */
function clampZoom(value: number): number {
  return Math.max(0.5, Math.min(8, value));
}

/** 缩小图标（源模块内 u） */
function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-white" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}

/** 放大图标（源模块内 f） */
function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-white" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** 根据容器尺寸计算初始适配视图（scale ≤ 1.5，向上留 34px 顶部偏移） */
function computeFitView(
  container: { width: number; height: number },
  artwork: { width: number; height: number }
): { scale: number; offset: { x: number; y: number } } {
  if (container.width <= 0 || container.height <= 0 || artwork.width <= 0 || artwork.height <= 0)
    return { scale: 1, offset: { x: 0, y: 0 } };
  const availableWidth = Math.max(1, container.width - 32);
  const availableHeight = Math.max(1, container.height - 16 - 84);
  return {
    scale: Math.min(1.5, availableWidth / artwork.width, availableHeight / artwork.height),
    offset: { x: 0, y: -34 },
  };
}

/** * 预览引擎实现 */
const RenderCanvas = forwardRef<PreviewEngineHandle, PreviewEngineImplProps>(function RenderCanvas(
  { mappedPixelData, gridDimensions, config },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasRenderedRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ startDistance: number; startMidpoint: { x: number; y: number }; startZoom: number; startOffset: { x: number; y: number } } | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startOx: number; startOy: number } | null>(null);
  const viewRef = useRef<ViewTransform>({ zoom: 1, offset: { x: 0, y: 0 } });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoomState] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isRendering, setIsRendering] = useState(true);
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);

  const artworkSize = useMemo(
    () => (mappedPixelData && gridDimensions ? getExportCanvasSize(mappedPixelData, gridDimensions.N, gridDimensions.M) : null),
    [gridDimensions, mappedPixelData]
  );
  const hasArtwork = !!(mappedPixelData && gridDimensions && artworkSize);
  const fitView = useMemo(
    () =>
      artworkSize
        ? computeFitView(containerSize, artworkSize)
        : { scale: 1, offset: { x: 0, y: 0 } },
    [containerSize, artworkSize]
  );
  const displayScale = fitView.scale * zoom;

  // 保持 ref 与 state 同步（源 effect 1）
  useEffect(() => {
    viewRef.current = { zoom, offset };
  }, [zoom, offset]);

  // 容器尺寸跟踪（ResizeObserver，源 effect 2）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const rect = container.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setContainerSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 设备像素比跟踪（resize + matchMedia resolution，源 effect 3）
  useEffect(() => {
    let mediaQuery: MediaQueryList | null = null;
    const update = () => {
      const ratio = window.devicePixelRatio || 1;
      setDevicePixelRatio((prev) => (prev === ratio ? prev : ratio));
      mediaQuery?.removeEventListener("change", update);
      mediaQuery = window.matchMedia(`(resolution: ${ratio}dppx)`);
      mediaQuery.addEventListener("change", update);
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      mediaQuery?.removeEventListener("change", update);
    };
  }, []);

  // 数据变化时复位视图（源 effect 4）
  useEffect(() => {
    const initial: ViewTransform = { zoom: 1, offset: { x: 0, y: 0 } };
    viewRef.current = initial;
    setZoomState(initial.zoom);
    setOffset(initial.offset);
    hasRenderedRef.current = false;
    setIsRendering(!!(mappedPixelData && gridDimensions));
  }, [mappedPixelData, gridDimensions]);

  /** 以指定缩放倍率把画作绘制到目标 canvas（源 P） */
  const drawToCanvas = useCallback(
    (canvas: HTMLCanvasElement, scale: number): boolean => {
      if (!artworkSize || !mappedPixelData || !gridDimensions) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      canvas.width = Math.max(1, Math.floor(artworkSize.width * scale));
      canvas.height = Math.max(1, Math.floor(artworkSize.height * scale));
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = true;
      renderArtwork(ctx, artworkSize.width, artworkSize.height, mappedPixelData, gridDimensions.N, gridDimensions.M, config);
      return true;
    },
    [config, gridDimensions, mappedPixelData, artworkSize]
  );

  /** 实际光栅化倍率：显示倍率 × DPR，同时限制单边 ≤4096、总像素 ≤16M（源 X） */
  const renderScale = useMemo(
    () =>
      artworkSize
        ? (() => {
            const target = Math.max(1, devicePixelRatio) * Math.max(Number.EPSILON, displayScale);
            const maxDim = Math.max(artworkSize.width, artworkSize.height, 1);
            return Math.min(target, 4096 / maxDim, Math.sqrt(16e6 / Math.max(artworkSize.width * artworkSize.height, 1)));
          })()
        : 1,
    [devicePixelRatio, displayScale, artworkSize]
  );

  // 首帧/变更重绘：小图或首帧直接 rAF，大图先展示“渲染中…”遮罩延迟 80ms 再画（源 effect 5）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = canvasRef.current;
    if (!canvas || !artworkSize || !mappedPixelData || !gridDimensions) return;
    const cellCount = gridDimensions.N * gridDimensions.M;
    let rafId = 0;
    const render = () => {
      rafId = requestAnimationFrame(() => {
        if (drawToCanvas(canvas, renderScale)) {
          hasRenderedRef.current = true;
          setIsRendering(false);
        }
      });
    };
    if (cellCount <= 2500 || !hasRenderedRef.current) render();
    else timer = setTimeout(render, 80);
    return () => {
      if (timer) clearTimeout(timer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [renderScale, drawToCanvas, gridDimensions, mappedPixelData, artworkSize]);

  /** 导出当前预览为 PNG（长边 ≤2400、倍率 ≤4；源 S） */
  const download = useCallback(async () => {
    if (!artworkSize || !mappedPixelData || !gridDimensions) throw Error("预览尚未生成，请稍后再试");
    const exportCanvas = document.createElement("canvas");
    const exportScale = Math.min(4, 2400 / Math.max(artworkSize.width, artworkSize.height, 1));
    if (!drawToCanvas(exportCanvas, exportScale)) throw Error("浏览器无法创建预览图画布");
    return {
      blob: await canvasToBlob(exportCanvas, "image/png"),
      filename: `ironing-preview_${formatTimestamp()}.png`,
    };
  }, [drawToCanvas, gridDimensions, mappedPixelData, artworkSize]);

  useImperativeHandle(ref, () => ({ download }), [download]);

  /** 围绕中心点（相对容器中心）设置缩放（源 B） */
  const setZoom = useCallback(
    (nextZoomRaw: number, center: { x: number; y: number } = { x: 0, y: 0 }) => {
      const current = viewRef.current;
      const nextZoom = clampZoom(nextZoomRaw);
      if (nextZoom === current.zoom) return;
      const ratio = nextZoom / current.zoom;
      const anchor = { x: current.offset.x + fitView.offset.x, y: current.offset.y + fitView.offset.y };
      const nextOffset = {
        x: center.x - ratio * (center.x - anchor.x) - fitView.offset.x,
        y: center.y - ratio * (center.y - anchor.y) - fitView.offset.y,
      };
      viewRef.current = { zoom: nextZoom, offset: nextOffset };
      setZoomState(nextZoom);
      setOffset(nextOffset);
    },
    [fitView.offset.x, fitView.offset.y]
  );

  /** 复位为适应视口（源 _） */
  const resetView = useCallback(() => {
    const initial: ViewTransform = { zoom: 1, offset: { x: 0, y: 0 } };
    viewRef.current = initial;
    setZoomState(initial.zoom);
    setOffset(initial.offset);
  }, []);

  // 滚轮缩放（以指针为锚点；控制条区域除外）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-preview-controls]")) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const center = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      };
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      setZoom(viewRef.current.zoom * factor, center);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  /** 当前双指状态（距离 + 中点，相对容器中心；源 q） */
  const getPinchState = useCallback(() => {
    const points = Array.from(pointersRef.current.values());
    const rect = containerRef.current?.getBoundingClientRect();
    if (points.length < 2 || !rect) return null;
    const [first, second] = points;
    return {
      distance: Math.hypot(first.x - second.x, first.y - second.y),
      midpoint: {
        x: (first.x + second.x) / 2 - rect.left - rect.width / 2,
        y: (first.y + second.y) / 2 - rect.top - rect.height / 2,
      },
    };
  }, []);

  /** 开始双指缩放（源 D） */
  const startPinch = useCallback(() => {
    const state = getPinchState();
    if (state) {
      pinchRef.current = {
        startDistance: Math.max(state.distance, 1),
        startMidpoint: state.midpoint,
        startZoom: viewRef.current.zoom,
        startOffset: viewRef.current.offset,
      };
      dragRef.current = null;
    }
  }, [getPinchState]);

  /** 单指按下：登记指针；单指→拖拽锚点，双指→捏合（源 T） */
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!hasArtwork || (event.target as Element).closest("[data-preview-controls]")) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture(event.pointerId);
      if (pointersRef.current.size === 1) {
        const currentOffset = viewRef.current.offset;
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startOx: currentOffset.x,
          startOy: currentOffset.y,
        };
      } else if (pointersRef.current.size === 2) {
        startPinch();
      }
    },
    [startPinch, hasArtwork]
  );

  /** 指针移动：双指捏合缩放 / 单指平移（源 Z） */
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size >= 2) {
        if (!pinchRef.current) startPinch();
        const start = pinchRef.current;
        const state = getPinchState();
        if (!start || !state) return;
        const nextZoom = clampZoom(start.startZoom * (state.distance / start.startDistance));
        const ratio = nextZoom / start.startZoom;
        const anchor = { x: start.startOffset.x + fitView.offset.x, y: start.startOffset.y + fitView.offset.y };
        const nextOffset = {
          x: state.midpoint.x - ratio * (start.startMidpoint.x - anchor.x) - fitView.offset.x,
          y: state.midpoint.y - ratio * (start.startMidpoint.y - anchor.y) - fitView.offset.y,
        };
        viewRef.current = { zoom: nextZoom, offset: nextOffset };
        setZoomState(nextZoom);
        setOffset(nextOffset);
        return;
      }
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const nextOffset = {
        x: drag.startOx + event.clientX - drag.startX,
        y: drag.startOy + event.clientY - drag.startY,
      };
      viewRef.current = { ...viewRef.current, offset: nextOffset };
      setOffset(nextOffset);
    },
    [startPinch, fitView.offset.x, fitView.offset.y, getPinchState]
  );

  /** 指针抬起/取消：摘除指针，剩余单指重新锚定拖拽（源 F） */
  const onPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.delete(event.pointerId);
      pinchRef.current = null;
      const remaining = Array.from(pointersRef.current.entries());
      if (remaining.length === 1) {
        const [pointerId, point] = remaining[0];
        const currentOffset = viewRef.current.offset;
        dragRef.current = {
          pointerId,
          startX: point.x,
          startY: point.y,
          startOx: currentOffset.x,
          startOy: currentOffset.y,
        };
      } else {
        dragRef.current = null;
        if (remaining.length >= 2) startPinch();
      }
    },
    [startPinch]
  );

  const zoomLabel = Math.abs(zoom - 1) < 0.01 ? "适应" : `${Math.round(100 * zoom)}%`;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 min-w-0 min-h-0 flex items-center justify-center overflow-hidden"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {!hasArtwork && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">请先在自动优化中生成底稿</div>
        </div>
      )}
      {hasArtwork && isRendering && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="glass-light rounded-xl px-3 py-2 text-sm text-gray-600 dark:text-gray-300">渲染中…</div>
        </div>
      )}
      {artworkSize && (
        <div
          style={{
            transform: `translate(${offset.x + fitView.offset.x}px, ${offset.y + fitView.offset.y}px) scale(${displayScale})`,
            transformOrigin: "center center",
            willChange: "transform",
          }}
        >
          <canvas
            ref={canvasRef}
            aria-label="烫豆效果预览"
            className="block cursor-grab active:cursor-grabbing"
            style={{ width: artworkSize.width, height: artworkSize.height }}
          />
        </div>
      )}
      {hasArtwork && (
        <div
          data-preview-controls={true}
          className="absolute left-1/2 bottom-4 -translate-x-1/2 z-20 glass-dark rounded-2xl p-1 flex items-center gap-1"
        >
          <Button
            variant="icon"
            square={44}
            aria-label="缩小预览"
            className="text-gray-100 active:bg-white/15"
            onClick={() => setZoom(viewRef.current.zoom / 1.25)}
          >
            <ZoomOutIcon />
          </Button>
          <Button
            variant="ghost"
            onClick={resetView}
            aria-label="恢复适应视口"
            className="min-w-[64px] px-3 text-xs tabular-nums active:bg-white/15"
          >
            <span className="text-white">{zoomLabel}</span>
          </Button>
          <Button
            variant="icon"
            square={44}
            aria-label="放大预览"
            className="text-gray-100 active:bg-white/15"
            onClick={() => setZoom(1.25 * viewRef.current.zoom)}
          >
            <ZoomInIcon />
          </Button>
        </div>
      )}
    </div>
  );
});

RenderCanvas.displayName = "RenderCanvas";

export default RenderCanvas;
