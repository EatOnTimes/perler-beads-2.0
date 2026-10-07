
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type TouchEvent as ReactTouchEvent,
} from "react";
import { clamp, drawCornerHandles } from "./bits";

// ---------------------------------------------------------------------------
// 底部工具按钮（源 C）
// ---------------------------------------------------------------------------

interface EditToolButtonProps {
    label: string;
    onClick: () => void;
    active: boolean;
    iconPath: string;
    rotate?: boolean;
}

function EditToolButton({ label, onClick, active, iconPath, rotate }: EditToolButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-1 min-w-[56px] min-h-[56px] justify-center ${
                active ? "text-brand-500" : "text-white/70 active:text-white"
            }`}
        >
            <svg
                className={`w-6 h-6 ${rotate ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
            </svg>
            <span className="text-[11px]">{label}</span>
        </button>
    );
}

// ---------------------------------------------------------------------------
// 编辑控制器（源 N 内联的匿名 hook，IIFE 调用 → useImageEditController）
// ---------------------------------------------------------------------------

type EditorMode = "crop" | "grid";

interface NormBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface DragState {
    target: string; // "tl"|"tr"|"bl"|"br"|"t"|"b"|"l"|"r"|"move"|"pan"
    startNorm: { x: number; y: number };
    startBox: NormBox;
    startXY: { x: number; y: number };
    startOffset: { x: number; y: number };
}

interface PinchState {
    dist: number;
    cx: number;
    cy: number;
}

function useImageEditController(baseSize: { w: number; h: number }) {
    const [mode, setMode] = useState<EditorMode>("crop");
    const [rotation, setRotation] = useState(0);
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [cropBox, setCropBox] = useState<NormBox>({ x: 0, y: 0, w: 1, h: 1 });
    const [gridBox, setGridBox] = useState<NormBox>({ x: 0.35, y: 0.35, w: 0.3, h: 0.3 });
    const [viewScale, setViewScale] = useState(1);
    const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
    const stateRef = useRef({ mode, cropBox, gridBox, viewScale, viewOffset, baseSize });
    stateRef.current = { mode, cropBox, gridBox, viewScale, viewOffset, baseSize };

    const dragRef = useRef<DragState | null>(null);
    const pinchRef = useRef<PinchState | null>(null);

    // 画布像素坐标 → 归一化坐标（grid 模式考虑缩放与平移）
    const clientToNorm = (x: number, y: number) => {
        const { mode: curMode, viewScale: curScale, viewOffset: curOffset, baseSize: curBase } = stateRef.current;
        return curMode === "grid"
            ? {
                  x: (x - curOffset.x - (curBase.w * (1 - curScale)) / 2) / curScale / curBase.w,
                  y: (y - curOffset.y - (curBase.h * (1 - curScale)) / 2) / curScale / curBase.h,
              }
            : { x: x / curBase.w, y: y / curBase.h };
    };

    // 命中测试：四角 → 四边中点 → 内部(move) → grid 模式空白(pan)
    const hitTest = (p: { x: number; y: number }) => {
        const { mode: curMode, cropBox: curCrop, gridBox: curGrid, viewScale: curScale, baseSize: curBase } =
            stateRef.current;
        const box = curMode === "crop" ? curCrop : curGrid;
        const grabRadius = curMode === "crop" ? 0.09 : Math.max(0.03, 35 / curScale / curBase.w);
        for (const [handle, hx, hy] of [
            ["tl", box.x, box.y],
            ["tr", box.x + box.w, box.y],
            ["bl", box.x, box.y + box.h],
            ["br", box.x + box.w, box.y + box.h],
        ] as const) {
            if (Math.abs(p.x - hx) < grabRadius && Math.abs(p.y - hy) < grabRadius) return handle;
        }
        const edgeRadius = 0.8 * grabRadius;
        for (const [handle, hx, hy] of [
            ["t", box.x + box.w / 2, box.y],
            ["b", box.x + box.w / 2, box.y + box.h],
            ["l", box.x, box.y + box.h / 2],
            ["r", box.x + box.w, box.y + box.h / 2],
        ] as const) {
            if (Math.abs(p.x - hx) < edgeRadius && Math.abs(p.y - hy) < edgeRadius) return handle;
        }
        return p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h
            ? "move"
            : curMode === "grid"
              ? "pan"
              : null;
    };

    const pointerDown = useCallback((x: number, y: number) => {
        const cur = stateRef.current;
        const norm = clientToNorm(x, y);
        const target = hitTest(norm);
        if (target) {
            dragRef.current = {
                target,
                startNorm: norm,
                startBox: { ...(cur.mode === "crop" ? cur.cropBox : cur.gridBox) },
                startXY: { x, y },
                startOffset: { ...cur.viewOffset },
            };
        }
    }, []);

    const pointerMove = useCallback((x: number, y: number) => {
        const drag = dragRef.current;
        if (!drag) return;
        const cur = stateRef.current;
        if (drag.target === "pan") {
            setViewOffset({
                x: drag.startOffset.x + (x - drag.startXY.x),
                y: drag.startOffset.y + (y - drag.startXY.y),
            });
            return;
        }
        const norm = clientToNorm(x, y);
        const dx = norm.x - drag.startNorm.x;
        const dy = norm.y - drag.startNorm.y;
        const start = drag.startBox;
        const next: NormBox = { ...start };
        const minSize = cur.mode === "crop" ? 0.1 : 0.005;
        if (drag.target === "move") {
            next.x = clamp(start.x + dx, 0, 1 - start.w);
            next.y = clamp(start.y + dy, 0, 1 - start.h);
        } else {
            if (drag.target.includes("l")) {
                const nx = clamp(start.x + dx, 0, start.x + start.w - minSize);
                next.w = start.w - (nx - start.x);
                next.x = nx;
            }
            if (drag.target.includes("r")) next.w = clamp(start.w + dx, minSize, 1 - start.x);
            if (drag.target.includes("t")) {
                const ny = clamp(start.y + dy, 0, start.y + start.h - minSize);
                next.h = start.h - (ny - start.y);
                next.y = ny;
            }
            if (drag.target.includes("b")) next.h = clamp(start.h + dy, minSize, 1 - start.y);
        }
        (cur.mode === "crop" ? setCropBox : setGridBox)(next);
    }, []);

    const pointerUp = useCallback(() => {
        dragRef.current = null;
    }, []);

    const pinchStart = useCallback((dist: number, cx: number, cy: number) => {
        pinchRef.current = { dist, cx, cy };
        dragRef.current = null;
    }, []);

    const pinchMove = useCallback((dist: number, cx: number, cy: number) => {
        const pinch = pinchRef.current;
        if (!pinch) return;
        const ratio = dist / pinch.dist;
        setViewScale((s) => clamp(s * ratio, 1, 20));
        setViewOffset((off) => ({ x: off.x + (cx - pinch.cx), y: off.y + (cy - pinch.cy) }));
        pinchRef.current = { dist, cx, cy };
    }, []);

    const pinchEnd = useCallback(() => {
        pinchRef.current = null;
    }, []);

    // 滚轮缩放（仅 grid 模式），以指针位置为缩放中心
    const wheelZoom = useCallback((deltaY: number, cx: number, cy: number) => {
        if (stateRef.current.mode !== "grid") return;
        const base = stateRef.current.baseSize;
        setViewScale((s) => {
            const next = clamp(s * (deltaY > 0 ? 0.9 : 1.1), 1, 20);
            const ox = cx - base.w / 2;
            const oy = cy - base.h / 2;
            setViewOffset((off) => ({
                x: -ox * (next / s - 1) + off.x,
                y: -oy * (next / s - 1) + off.y,
            }));
            return next;
        });
    }, []);

    // 双击放大到 2.5 倍（上限 20），已放大则复位
    const doubleTap = useCallback((x: number, y: number) => {
        const { viewScale: curScale, baseSize: base } = stateRef.current;
        if (curScale < 5) {
            const target = Math.min(20, 2.5 * curScale);
            const ox = x - base.w / 2;
            const oy = y - base.h / 2;
            setViewOffset((off) => ({
                x: -ox * (target / curScale - 1) + off.x,
                y: -oy * (target / curScale - 1) + off.y,
            }));
            setViewScale(target);
        } else {
            setViewScale(1);
            setViewOffset({ x: 0, y: 0 });
        }
    }, []);

    const rotate = useCallback(() => {
        setRotation((r) => (r + 90) % 360);
        setCropBox({ x: 0, y: 0, w: 1, h: 1 });
    }, []);

    const toggleFlipH = useCallback(() => setFlipH((v) => !v), []);
    const toggleFlipV = useCallback(() => setFlipV((v) => !v), []);

    const resetAll = useCallback(() => {
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        setCropBox({ x: 0, y: 0, w: 1, h: 1 });
    }, []);

    const resetView = useCallback(() => {
        setViewScale(1);
        setViewOffset({ x: 0, y: 0 });
    }, []);

    const switchMode = useCallback((nextMode: EditorMode) => {
        setMode(nextMode);
        setViewScale(1);
        setViewOffset({ x: 0, y: 0 });
    }, []);

    const zoomIn = useCallback(() => setViewScale((s) => clamp(1.5 * s, 1, 20)), []);
    const zoomOut = useCallback(() => setViewScale((s) => clamp(s / 1.5, 1, 20)), []);

    const gridCount = baseSize.w > 0 ? Math.round((1 / gridBox.w) * 3) : 0;

    return {
        mode,
        rotation,
        flipH,
        flipV,
        cropBox,
        gridBox,
        viewScale,
        viewOffset,
        gridCount,
        pointerDown,
        pointerMove,
        pointerUp,
        pinchStart,
        pinchMove,
        pinchEnd,
        wheelZoom,
        doubleTap,
        rotate,
        toggleFlipH,
        toggleFlipV,
        resetAll,
        resetView,
        switchMode,
        zoomIn,
        zoomOut,
    };
}

// ---------------------------------------------------------------------------
// 主组件（源 N）
// ---------------------------------------------------------------------------

export interface GridAlignment {
    refX: number;
    refY: number;
    cellWidth: number;
    cellHeight: number;
}

export interface ImageEditResult {
    imageSrc: string;
    gridCount?: number;
    gridAlignment?: GridAlignment | null;
}

interface ImageAlignModalProps {
    imageSrc: string;
    onConfirm: (result: ImageEditResult) => void;
    onCancel: () => void;
    enableGridAlign?: boolean;
}

export function ImageAlignModal({ imageSrc, onConfirm, onCancel, enableGridAlign = false }: ImageAlignModalProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [baseSize, setBaseSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const lastTapRef = useRef(0);

    const editor = useImageEditController(baseSize);
    const { mode, rotation, flipH, flipV, cropBox, gridBox, viewScale, viewOffset, gridCount } = editor;

    useEffect(() => {
        const img = new Image();
        img.onload = () => setImage(img);
        img.src = imageSrc;
    }, [imageSrc]);

    // 旋转 90/270 度后宽高互换
    const getRotatedSize = useCallback(() => {
        if (!image) return { w: 0, h: 0 };
        const swapped = rotation === 90 || rotation === 270;
        return {
            w: swapped ? image.naturalHeight : image.naturalWidth,
            h: swapped ? image.naturalWidth : image.naturalHeight,
        };
    }, [image, rotation]);

    // 渲染画布：绘制图片 + 裁剪遮罩（白框）/ 格子对齐红框
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !image || !container) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const { w: fullW, h: fullH } = getRotatedSize();
        const rect = container.getBoundingClientRect();
        const fitScale = Math.min((rect.width - 32) / fullW, (rect.height - 32) / fullH, 1);
        const cw = fullW * fitScale;
        const ch = fullH * fitScale;
        canvas.width = cw;
        canvas.height = ch;
        setBaseSize((prev) => (prev.w === cw && prev.h === ch ? prev : { w: cw, h: ch }));
        ctx.clearRect(0, 0, cw, ch);

        const drawTransformed = (c: CanvasRenderingContext2D, w: number, h: number) => {
            c.save();
            c.translate(w / 2, h / 2);
            c.rotate((rotation * Math.PI) / 180);
            c.scale(flipH ? -1 : 1, flipV ? -1 : 1);
            const dw = rotation === 90 || rotation === 270 ? h : w;
            const dh = rotation === 90 || rotation === 270 ? w : h;
            c.drawImage(image, -dw / 2, -dh / 2, dw, dh);
            c.restore();
        };

        if (mode === "crop") {
            drawTransformed(ctx, cw, ch);
            const bx = cropBox.x * cw;
            const by = cropBox.y * ch;
            const bw = cropBox.w * cw;
            const bh = cropBox.h * ch;
            // 半透明遮罩（四块矩形挖出选区）
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(0, 0, cw, by);
            ctx.fillRect(0, by + bh, cw, ch - by - bh);
            ctx.fillRect(0, by, bx, bh);
            ctx.fillRect(bx + bw, by, cw - bx - bw, bh);
            // 白色选框 + 三分线
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.strokeStyle = "rgba(255,255,255,0.25)";
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            for (let i = 1; i < 3; i++) {
                ctx.moveTo(bx + (bw * i) / 3, by);
                ctx.lineTo(bx + (bw * i) / 3, by + bh);
                ctx.moveTo(bx, by + (bh * i) / 3);
                ctx.lineTo(bx + bw, by + (bh * i) / 3);
            }
            ctx.stroke();
            drawCornerHandles(ctx, bx, by, bw, bh, "#fff", 28, 4.5);
        } else {
            // grid 模式：先按缩放/平移绘制图片，再叠加红框与挖空遮罩
            ctx.save();
            ctx.translate(viewOffset.x + cw / 2, viewOffset.y + ch / 2);
            ctx.scale(viewScale, viewScale);
            ctx.translate(-cw / 2, -ch / 2);
            drawTransformed(ctx, cw, ch);
            ctx.restore();

            const gx = gridBox.x * cw * viewScale + viewOffset.x + (cw * (1 - viewScale)) / 2;
            const gy = gridBox.y * ch * viewScale + viewOffset.y + (ch * (1 - viewScale)) / 2;
            const gw = gridBox.w * cw * viewScale;
            const gh = gridBox.h * ch * viewScale;

            ctx.save();
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.beginPath();
            ctx.rect(0, 0, cw, ch);
            ctx.rect(gx, gy, gw, gh);
            ctx.clip("evenodd");
            ctx.fillRect(0, 0, cw, ch);
            ctx.restore();

            ctx.strokeStyle = "#ff4444";
            ctx.lineWidth = 2.5;
            ctx.strokeRect(gx, gy, gw, gh);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 1; i < 3; i++) {
                ctx.moveTo(gx + (gw * i) / 3, gy);
                ctx.lineTo(gx + (gw * i) / 3, gy + gh);
                ctx.moveTo(gx, gy + (gh * i) / 3);
                ctx.lineTo(gx + gw, gy + (gh * i) / 3);
            }
            ctx.stroke();
            drawCornerHandles(ctx, gx, gy, gw, gh, "#ff4444", 18, 3.5);
        }
    }, [image, rotation, flipH, flipV, mode, cropBox, gridBox, viewScale, viewOffset, getRotatedSize]);

    // 事件坐标 → 画布本地坐标
    const getPointerPos = (e: { clientX: number; clientY: number }) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
    };

    const handlePointerDown = useCallback(
        (e: ReactPointerEvent<HTMLCanvasElement>) => {
            if (mode === "grid") {
                const now = Date.now();
                if (now - lastTapRef.current < 300) {
                    const pos = getPointerPos(e);
                    editor.doubleTap(pos.x, pos.y);
                    lastTapRef.current = 0;
                    return;
                }
                lastTapRef.current = now;
            }
            const pos = getPointerPos(e);
            editor.pointerDown(pos.x, pos.y);
            (e.target as Element).setPointerCapture(e.pointerId);
        },
        [mode, editor],
    );

    const handlePointerMove = useCallback(
        (e: ReactPointerEvent<HTMLCanvasElement>) => {
            const pos = getPointerPos(e);
            editor.pointerMove(pos.x, pos.y);
        },
        [editor],
    );

    const handlePointerUp = useCallback(() => editor.pointerUp(), [editor]);

    // 双指捏合（仅 grid 模式）
    const handleTouchStart = useCallback(
        (e: ReactTouchEvent<HTMLCanvasElement>) => {
            if (e.touches.length >= 2 && mode === "grid") {
                e.preventDefault();
                editor.pointerUp();
                const [t0, t1] = Array.from(e.touches); // TouchList 不可直接解构迭代
                const dx = t0.clientX - t1.clientX;
                const dy = t0.clientY - t1.clientY;
                editor.pinchStart(
                    Math.sqrt(dx * dx + dy * dy),
                    (t0.clientX + t1.clientX) / 2,
                    (t0.clientY + t1.clientY) / 2,
                );
            }
        },
        [mode, editor],
    );

    const handleTouchMove = useCallback(
        (e: ReactTouchEvent<HTMLCanvasElement>) => {
            if (e.touches.length >= 2 && mode === "grid") {
                e.preventDefault();
                const [t0, t1] = Array.from(e.touches); // TouchList 不可直接解构迭代
                const dx = t0.clientX - t1.clientX;
                const dy = t0.clientY - t1.clientY;
                editor.pinchMove(
                    Math.sqrt(dx * dx + dy * dy),
                    (t0.clientX + t1.clientX) / 2,
                    (t0.clientY + t1.clientY) / 2,
                );
            }
        },
        [mode, editor],
    );

    const handleTouchEnd = useCallback(() => editor.pinchEnd(), [editor]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            editor.wheelZoom(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
        };
        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => canvas.removeEventListener("wheel", onWheel);
    }, [editor]);

    // 完成编辑：应用旋转/翻转 → 裁剪 → 输出 PNG；grid 模式附带格数与对齐信息
    const handleConfirm = useCallback(() => {
        if (!image) return;
        const { w: fullW, h: fullH } = getRotatedSize();
        const cropW = Math.round(fullW * cropBox.w);
        const cropH = Math.round(fullH * cropBox.h);

        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = fullW;
        fullCanvas.height = fullH;
        const fullCtx = fullCanvas.getContext("2d")!;
        fullCtx.translate(fullW / 2, fullH / 2);
        fullCtx.rotate((rotation * Math.PI) / 180);
        fullCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        const dw = rotation === 90 || rotation === 270 ? fullH : fullW;
        const dh = rotation === 90 || rotation === 270 ? fullW : fullH;
        fullCtx.drawImage(image, -dw / 2, -dh / 2, dw, dh);

        const cropped = document.createElement("canvas");
        cropped.width = cropW;
        cropped.height = cropH;
        cropped
            .getContext("2d")!
            .drawImage(
                fullCanvas,
                Math.round(fullW * cropBox.x),
                Math.round(fullH * cropBox.y),
                cropW,
                cropH,
                0,
                0,
                cropW,
                cropH,
            );

        let gridCountOut: number | undefined;
        let gridAlignment: GridAlignment | null | undefined;
        if (enableGridAlign && mode === "grid") {
            const cellWidth = (gridBox.w * fullW) / 3;
            const cellHeight = (gridBox.h * fullH) / 3;
            gridCountOut = Math.round(cropW / cellWidth);
            gridAlignment = {
                refX: gridBox.x * fullW - cropBox.x * fullW,
                refY: gridBox.y * fullH - cropBox.y * fullH,
                cellWidth,
                cellHeight,
            };
        }

        onConfirm({
            imageSrc: cropped.toDataURL("image/png"),
            gridCount: gridCountOut,
            gridAlignment,
        });
    }, [image, getRotatedSize, cropBox, gridBox, rotation, flipH, flipV, mode, enableGridAlign, onConfirm]);

    return (
        <div className="fixed inset-0 bg-gray-950/95 z-[60] flex flex-col" style={{ touchAction: "none" }}>
            <div
                className="flex items-center justify-between px-5 pb-3 pt-3 bg-gray-900/80"
                style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
            >
                <button
                    onClick={onCancel}
                    className="min-h-[44px] min-w-[60px] px-3 text-white/70 active:text-white text-sm"
                >
                    取消
                </button>
                <span className="text-white/50 text-sm">{mode === "crop" ? "编辑图片" : "格子对齐"}</span>
                <button
                    onClick={handleConfirm}
                    className="min-h-[44px] min-w-[60px] px-3 text-brand-500 active:text-brand-400 text-sm font-semibold"
                >
                    完成
                </button>
            </div>

            {enableGridAlign && (
                <div className="flex justify-center gap-3 py-2.5 bg-gray-900/60">
                    {(["crop", "grid"] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => editor.switchMode(m)}
                            className={`min-h-[44px] px-6 rounded-full text-sm transition-colors ${
                                mode === m
                                    ? m === "crop"
                                        ? "bg-gray-50 text-gray-900"
                                        : "bg-brand-500 text-white"
                                    : "bg-white/10 text-white/70 active:bg-white/20"
                            }`}
                        >
                            {m === "crop" ? "裁剪" : "格子对齐"}
                        </button>
                    ))}
                </div>
            )}

            {mode === "grid" && (
                <div className="text-center py-2 bg-gray-900/60">
                    <span className="text-brand-500 font-bold text-lg">横向约 {gridCount} 格</span>
                    {viewScale !== 1 && <span className="text-white/50 text-sm ml-3">{viewScale.toFixed(1)}x</span>}
                </div>
            )}

            <div ref={containerRef} className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
                <canvas
                    ref={canvasRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    className="cursor-move"
                    style={{ touchAction: "none" }}
                />
                {mode === "crop" && cropBox.w > 0.99 && cropBox.h > 0.99 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white/80 text-xs px-4 py-2 rounded-full pointer-events-none animate-pulse">
                        拖动四角或边缘裁剪图片
                    </div>
                )}
            </div>

            <div
                className="px-4 py-4 bg-gray-900/80"
                style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
            >
                {mode === "crop" ? (
                    <div className="grid w-full grid-cols-4 gap-2">
                        <EditToolButton
                            label="旋转"
                            onClick={editor.rotate}
                            active={false}
                            iconPath="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                        <EditToolButton
                            label="水平翻转"
                            onClick={editor.toggleFlipH}
                            active={flipH}
                            iconPath="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                        />
                        <EditToolButton
                            label="垂直翻转"
                            onClick={editor.toggleFlipV}
                            active={flipV}
                            rotate
                            iconPath="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                        />
                        <EditToolButton
                            label="重置"
                            onClick={editor.resetAll}
                            active={false}
                            iconPath="M4 4v5h.582m0 0a8.001 8.001 0 0115.356 2M4.582 9H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center justify-center gap-5">
                            <button
                                onClick={editor.zoomOut}
                                disabled={viewScale <= 1}
                                className="min-h-[48px] min-w-[48px] rounded-full bg-white/10 text-white/70 active:bg-white/20 flex items-center justify-center text-xl font-bold disabled:opacity-30"
                            >
                                −
                            </button>
                            <span className="text-white/60 text-sm w-14 text-center tabular-nums">
                                {viewScale.toFixed(1)}x
                            </span>
                            <button
                                onClick={editor.zoomIn}
                                disabled={viewScale >= 20}
                                className="min-h-[48px] min-w-[48px] rounded-full bg-white/10 text-white/70 active:bg-white/20 flex items-center justify-center text-xl font-bold disabled:opacity-30"
                            >
                                +
                            </button>
                            {viewScale !== 1 && (
                                <button
                                    onClick={editor.resetView}
                                    className="min-h-[44px] px-4 rounded-full bg-white/10 text-white/70 active:bg-white/20 text-sm"
                                >
                                    重置
                                </button>
                            )}
                        </div>
                        <p className="text-white/40 text-xs">拖动空白平移 · 拖动红框调整 · 双指/滚轮缩放</p>
                    </div>
                )}
            </div>
        </div>
    );
}
