import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
// — 映射表契约：utils/share.ts 具名导出 shareArtwork（实为导出结果卡片组件）
import { ShareArtifactPanel as ShareArtwork } from "@/utils/share"; // 集成修正：区域02 g 为面板组件（shareArtwork 是异步函数）
// — utils/export-errors.ts 语义命名 dataUrlToBlob
import { dataUrlToBlob } from "@/utils/export-errors";
import {
  formatElapsedTime,
  getTodayDateString,
  CARD_STYLE_KEYS,
  CARD_STYLE_LABELS,
  type CardStyle,
} from "./bits";

// TODO(类型): GridDimensions / MappedPixelData 与其他组件共享，集成阶段统一到 src/types/
interface GridDimensions {
  N: number;
  M: number;
}

interface MappedPixelCell {
  color: string;
  isExternal?: boolean;
}

type MappedPixelData = ((MappedPixelCell | undefined)[] | undefined)[] | null | undefined;

/** 导出产物（blob + 文件名） */
interface ExportArtifact {
  blob: Blob;
  filename: string;
}

/** 单个样式的打卡图生成结果 */
interface StyleImageEntry {
  dataUrl: string;
  artifact: ExportArtifact;
}

/** shareArtwork 组件 props（最小依赖声明，集成阶段与 utils/share.ts 对齐） */
interface ShareArtworkProps {
  phase: "idle" | "generating" | "ready" | "error";
  artifact: ExportArtifact | null;
  message?: string;
  openKind?: "file" | "image";
  className?: string;
}

interface CompletionCardProps {
  isVisible: boolean;
  mappedPixelData: MappedPixelData;
  gridDimensions: GridDimensions;
  totalElapsedTime: number;
  onClose: () => void;
}

/** 按比例放入限定框内
 *  返回等比缩放后的 {w, h} */
function fitWithin(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
): { w: number; h: number } {
  const ratio = naturalWidth / naturalHeight;
  return ratio > maxWidth / maxHeight
    ? { w: maxWidth, h: maxWidth / ratio }
    : { w: maxHeight * ratio, h: maxHeight };
}

/** 打卡图样式绘制器签名
 *  (ctx, 图片, 画布宽, 画布高, 像素化(用默认图纸时), 耗时文案, 拼豆数量文案) */
type CardStyleRenderer = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  pixelated: boolean,
  timeLabel: string,
  countLabel: string,
) => void;

/** * 三种打卡图样式的 Canvas 绘制器 */
const CARD_STYLE_RENDERERS: Record<CardStyle, CardStyleRenderer> = {
  // 简白 · 杂志风
  magazine: (ctx, img, canvasW, canvasH, pixelated, timeLabel, countLabel) => {
    const { w: imgW, h: imgH } = fitWithin(
      img.naturalWidth,
      img.naturalHeight,
      canvasW - 80,
      canvasH - 40 - 72,
    );
    const imgX = (canvasW - imgW) / 2;
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, canvasW, canvasH);
    // 圆角裁剪绘制图片（源内嵌匿名函数）
    const drawRoundedImage = (
      c: CanvasRenderingContext2D,
      image: HTMLImageElement,
      x: number,
      y: number,
      w: number,
      h: number,
      smoothingDisabled: boolean,
    ) => {
      c.save();
      c.beginPath();
      c.roundRect(x, y, w, h, 14);
      c.clip();
      c.imageSmoothingEnabled = !smoothingDisabled;
      c.drawImage(image, x, y, w, h);
      c.restore();
    };
    drawRoundedImage(ctx, img, imgX, 40, imgW, imgH, pixelated);
    ctx.strokeStyle = "#e8e8e8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(imgX, 40, imgW, imgH, 14);
    ctx.stroke();
    const dividerY = 40 + imgH + 18;
    ctx.strokeStyle = "#e5e5e5";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(80, dividerY);
    ctx.lineTo(canvasW - 40 - 40, dividerY);
    ctx.stroke();
    const fontFamily =
      '-apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif';
    const textY = dividerY + 22;
    ctx.textAlign = "center";
    ctx.fillStyle = "#999999";
    ctx.font = `500 13px ${fontFamily}`;
    ctx.fillText(
      `${timeLabel}   ·   ${countLabel}颗   ·   ${getTodayDateString()}`,
      canvasW / 2,
      textY,
    );
    ctx.fillStyle = "#d0d0d0";
    ctx.font = `400 10px ${fontFamily}`;
    ctx.fillText("perlerbeads.zippland.com", canvasW / 2, textY + 18);
  },
  // 手账 · 可爱风
  cute: (ctx, img, canvasW, canvasH, pixelated, timeLabel, countLabel) => {
    const { w: imgW, h: imgH } = fitWithin(
      img.naturalWidth,
      img.naturalHeight,
      canvasW - 96 - 56,
      canvasH - 48 - 28 - 100 - 36,
    );
    const cardW = imgW + 56;
    const cardH = imgH + 28 + 100;
    const cardX = (canvasW - cardW) / 2;
    ctx.fillStyle = "#faf5ed";
    ctx.fillRect(0, 0, canvasW, canvasH);
    // 圆点网格背景
    ctx.fillStyle = "#e8dfd3";
    for (let dotY = 16; dotY < canvasH; dotY += 20) {
      for (let dotX = 16; dotX < canvasW; dotX += 20) {
        ctx.beginPath();
        ctx.arc(dotX, dotY, 0.7, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    // 白色卡片：先带阴影绘制一次，再无阴影覆盖一次（与源一致）
    ctx.save();
    ctx.shadowColor = "rgba(80, 60, 40, 0.15)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(cardX, 48, cardW, cardH, 4);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(cardX, 48, cardW, cardH, 4);
    ctx.fill();
    const imgX = cardX + 28;
    ctx.save();
    ctx.imageSmoothingEnabled = !pixelated;
    ctx.drawImage(img, imgX, 76, imgW, imgH);
    ctx.restore();
    const textY = 76 + imgH + 20;
    const fontFamily = '"PingFang SC", "Hiragino Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#6b5c4c";
    ctx.font = `500 16px ${fontFamily}`;
    ctx.fillText(`${timeLabel}  ♡  ${countLabel}颗`, canvasW / 2, textY + 4);
    ctx.fillStyle = "#a89882";
    ctx.font = `400 12px ${fontFamily}`;
    ctx.fillText(getTodayDateString(), canvasW / 2, textY + 26);
    ctx.fillStyle = "#c8bca8";
    ctx.font = `400 10px ${fontFamily}`;
    ctx.fillText("perlerbeads.zippland.com", canvasW / 2, canvasH - 14);
  },
  // 胶片风
  film: (ctx, img, canvasW, canvasH, pixelated, timeLabel, countLabel) => {
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = "#151210";
    ctx.fillRect(0, 0, 38, canvasH);
    ctx.fillRect(canvasW - 38, 0, 38, canvasH);
    const rightHoleX = canvasW - 38 + 12;
    ctx.fillStyle = "#2a2420";
    for (let holeY = 12; holeY < canvasH; holeY += 24) {
      ctx.beginPath();
      ctx.roundRect(12, holeY - 5, 14, 10, 2.5);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(rightHoleX, holeY - 5, 14, 10, 2.5);
      ctx.fill();
    }
    const maxImgH = canvasH - 8 - 64;
    const { w: imgW, h: imgH } = fitWithin(
      img.naturalWidth,
      img.naturalHeight,
      canvasW - 76 - 16,
      maxImgH,
    );
    const imgX = (canvasW - imgW) / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(imgX - 1, 7, imgW + 2, imgH + 2);
    ctx.save();
    ctx.imageSmoothingEnabled = !pixelated;
    ctx.drawImage(img, imgX, 8, imgW, imgH);
    ctx.restore();
    ctx.textAlign = "right";
    ctx.fillStyle = "#f5c518";
    ctx.font = '700 11px "Courier New", "SF Mono", monospace';
    ctx.fillText("36A", imgX + imgW - 6, 24);
    const bottomY = canvasH - 22;
    const monoFamily = '"Courier New", "SF Mono", monospace';
    const now = new Date();
    ctx.textAlign = "left";
    ctx.fillStyle = "#ff6030";
    ctx.font = `700 13px ${monoFamily}`;
    ctx.fillText(
      `'${String(now.getFullYear()).slice(2)}  ${String(now.getMonth() + 1).padStart(2, "0")}  ${String(
        now.getDate(),
      ).padStart(2, "0")}`,
      46,
      bottomY,
    );
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `400 11px ${monoFamily}`;
    ctx.fillText(`${timeLabel}  ·  ${countLabel}`, canvasW / 2, bottomY);
    ctx.textAlign = "right";
    ctx.fillStyle = "#f5c518";
    ctx.font = `600 10px ${monoFamily}`;
    ctx.fillText("PERLERBEADS", canvasW - 38 - 8, bottomY);
  },
};

/** * * 作品打卡弹窗：由图纸快照（或用户照片）生成三种样式的打卡图并导出 */
export function CompletionCard({
  isVisible,
  mappedPixelData,
  gridDimensions,
  totalElapsedTime,
  onClose,
}: CompletionCardProps) {
  const [activeStyle, setActiveStyle] = useState<CardStyle>("magazine");
  const [userPhotoDataUrl, setUserPhotoDataUrl] = useState<string | null>(null);
  const [styleImages, setStyleImages] = useState<Partial<Record<CardStyle, StyleImageEntry>>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 由图纸数据生成的默认快照（600px 基准 PNG）
  const baseSnapshot = useMemo(() => {
    try {
      if (!mappedPixelData || gridDimensions.N <= 0 || gridDimensions.M <= 0) {
        throw Error("图纸数据无效，无法生成打卡图");
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("浏览器无法创建打卡图画布");
      const aspect = gridDimensions.N / gridDimensions.M;
      canvas.width = Math.max(1, aspect > 1 ? 600 : Math.round(600 * aspect));
      canvas.height = Math.max(1, aspect > 1 ? Math.round(600 / aspect) : 600);
      const cellW = canvas.width / gridDimensions.N;
      const cellH = canvas.height / gridDimensions.M;
      for (let row = 0; row < gridDimensions.M; row++) {
        for (let col = 0; col < gridDimensions.N; col++) {
          const cell = mappedPixelData[row]?.[col];
          if (!cell) throw Error("图纸数据不完整，无法生成打卡图");
          ctx.fillStyle = cell.color;
          ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
        }
      }
      return { src: canvas.toDataURL("image/png"), error: "" };
    } catch (err) {
      return {
        src: null as string | null,
        error: err instanceof Error ? err.message : "打卡图生成失败",
      };
    }
  }, [mappedPixelData, gridDimensions]);

  // 可见拼豆数量（排除外部位图格与透明格）
  const visibleBeadCount = useMemo(() => {
    if (!mappedPixelData) return 0;
    let count = 0;
    for (let row = 0; row < gridDimensions.M; row++) {
      for (let col = 0; col < gridDimensions.N; col++) {
        const cell = mappedPixelData[row]![col]!;
        if (cell.color && !cell.isExternal && cell.color !== "transparent") count++;
      }
    }
    return count;
  }, [mappedPixelData, gridDimensions]);

  const imageSource = userPhotoDataUrl || baseSnapshot.src;
  // 未更换照片时使用图纸快照，绘制时启用像素化（关闭平滑）
  const isSnapshotPixelated = !userPhotoDataUrl;

  // 为三种样式分别生成 720px 宽的 JPEG 打卡图
  const generateAllStyleImages = useCallback(async () => {
    if (!imageSource || !renderCanvasRef.current) {
      throw Error(baseSnapshot.error || "没有可用于生成的图片");
    }
    const canvas = renderCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("浏览器无法创建打卡图画布");
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const cleanup = () => {
        window.clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
      };
      const timer = window.setTimeout(() => {
        cleanup();
        image.src = "";
        reject(Error("图片读取超时，请重新选择图片"));
      }, 15000);
      image.onload = () => {
        cleanup();
        resolve(image);
      };
      image.onerror = () => {
        cleanup();
        reject(Error("图片无法读取，请换一张图片后重试"));
      };
      image.src = imageSource;
    });
    const timeLabel = formatElapsedTime(totalElapsedTime);
    const countLabel = visibleBeadCount.toLocaleString();
    const aspect = img.naturalWidth / img.naturalHeight;
    if (!Number.isFinite(aspect) || aspect <= 0) throw Error("图片尺寸无效");
    const results: Partial<Record<CardStyle, StyleImageEntry>> = {};
    for (const style of CARD_STYLE_KEYS) {
      let topPad: number, bottomPad: number, contentWidth: number;
      if (style === "magazine") {
        topPad = 40;
        bottomPad = 72;
        contentWidth = 640;
      } else if (style === "cute") {
        topPad = 76;
        bottomPad = 136;
        contentWidth = 568;
      } else {
        topPad = 8;
        bottomPad = 64;
        contentWidth = 628;
      }
      const canvasHeight = Math.round(topPad + contentWidth / aspect + bottomPad);
      if (
        !Number.isFinite(canvasHeight) ||
        canvasHeight <= 0 ||
        canvasHeight > 4096 ||
        720 * canvasHeight > 16000000
      ) {
        throw Error("图片比例过长，无法安全生成打卡图，请先裁剪后重试");
      }
      canvas.width = 720;
      canvas.height = canvasHeight;
      ctx.clearRect(0, 0, 720, canvasHeight);
      CARD_STYLE_RENDERERS[style](ctx, img, 720, canvasHeight, isSnapshotPixelated, timeLabel, countLabel);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      results[style] = {
        dataUrl,
        artifact: {
          blob: dataUrlToBlob(dataUrl),
          filename: `拼豆打卡-${getTodayDateString()}.jpg`,
        },
      };
    }
    return results;
  }, [imageSource, isSnapshotPixelated, baseSnapshot.error, totalElapsedTime, visibleBeadCount]);

  // 打开时生成全部样式；图片源变化时重新生成
  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    setStyleImages({});
    setError("");
    setIsGenerating(true);
    generateAllStyleImages()
      .then(images => {
        if (!cancelled) setStyleImages(images);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "打卡图生成失败");
      })
      .finally(() => {
        if (!cancelled) setIsGenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isVisible, imageSource, generateAllStyleImages]);

  // 关闭时重置状态
  useEffect(() => {
    if (!isVisible) {
      setUserPhotoDataUrl(null);
      setStyleImages({});
      setActiveStyle("magazine");
      setError("");
    }
  }, [isVisible]);

  const handlePhotoSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (file) {
      setError("");
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string" ? resolve(reader.result) : reject(Error("读取图片失败"));
          reader.onerror = () => reject(Error("读取图片失败，请重新选择"));
          reader.onabort = () => reject(Error("图片读取已取消"));
          reader.readAsDataURL(file);
        });
        setUserPhotoDataUrl(dataUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "读取图片失败");
      } finally {
        input.value = "";
      }
    }
  }, []);

  if (!isVisible) return null;
  const currentEntry = styleImages[activeStyle];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">作品打卡</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {formatElapsedTime(totalElapsedTime)} · {visibleBeadCount.toLocaleString()} 颗 ·{" "}
              {getTodayDateString()}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭打卡图"
            className="w-11 h-11 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
          <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
            {isGenerating ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="flex min-h-48 items-center justify-center px-6 text-center text-sm text-red-600 dark:text-red-300">
                {error}
              </div>
            ) : currentEntry ? (
              <img src={currentEntry.dataUrl} alt="预览" className="w-full block" />
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400 text-sm">
                暂无可用预览
              </div>
            )}
          </div>
          <div className="flex gap-1.5 mt-3 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
            {CARD_STYLE_KEYS.map(style => (
              <button
                key={style}
                onClick={() => setActiveStyle(style)}
                disabled={isGenerating || !styleImages[style]}
                className={
                  "flex-1 py-2 text-[13px] rounded-[10px] transition-all " +
                  (activeStyle === style
                    ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-500 dark:text-gray-400 active:bg-gray-200/50 disabled:opacity-40")
                }
              >
                {CARD_STYLE_LABELS[style]}
              </button>
            ))}
          </div>
          <ShareArtwork
            phase={isGenerating || error || !currentEntry ? "idle" : "ready"}
            artifact={currentEntry?.artifact ?? null}
            message="打卡图已生成，可保存到设备或打开图片。"
            openKind="image"
            className="mt-3"
          />
        </div>
        <div className="px-5 pb-5 pt-1">
          <button
            onClick={() => {
              fileInputRef.current?.click();
            }}
            disabled={isGenerating}
            className="min-h-[44px] w-full rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700 transition-colors active:bg-gray-200 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-300 dark:active:bg-gray-700"
          >
            {userPhotoDataUrl ? "更换照片" : "添加照片"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoSelected}
        />
        <canvas ref={renderCanvasRef} className="hidden" />
      </div>
    </div>
  );
}

export default CompletionCard;
