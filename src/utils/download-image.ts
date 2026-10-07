// chunk: lazy-764.js 模块 764 L1-303（downloadImage：拼豆图纸 PNG 导出）
// 渲染内容：页眉（色号系统 + 色号 / 作者）、坐标带、像素格（色号标注 / 外部格棋盘纹）、
// 网格线、用料清单（色卡 + 数量）、底部品牌栏（七卡瓦 / 拼豆底稿生成器 2.0 / 画廊分享码 + 二维码）、
// 水印（tile 平铺 / emboss 浮雕）。小图走 canvas.toBlob，超大图走流式 PNG 编码器。
//
// 依赖映射：
// r(956)      → npm 包 qrcode（chunk 956 模块 307/1062/2302/2493 等，node-qrcode 浏览器版 vendor，
// r(1866)     → @/utils/color-system（TR→getDisplayColorKey、lW→getColorKeyByHex）
// r(8878).PG  → @/utils/export-errors（canvasToBlob）
// r(5947).v   → @/lib/logger（logger）
// r.e(214)+r.e(823) → @/utils/png-encoder

import { toDataURL as qrToDataURL } from "qrcode";
import type { ExportArtifact } from "@/utils/export-errors";
import { canvasToBlob } from "@/utils/export-errors";
import { getDisplayColorKey, getColorKeyByHex } from "@/utils/color-system";
import { compareColorKeys, formatTimestamp } from "@/utils/bundle-misc";
import { logger } from "@/lib/logger";
import type { PixelGrid } from "@/utils/watermark";

/** 导出图纸品牌配色（源模块内 f） */
const BRAND_COLORS = {
  DARK: "#141413",
  LIGHT: "#faf9f5",
  MID_GRAY: "#b0aea5",
  LIGHT_GRAY: "#e8e6dc",
  ORANGE: "#d97757",
  BLUE: "#6a9bcc",
  GREEN: "#788c5d",
} as const;

// TODO(类型): 与 app/page.tsx 的 DownloadOptions / WatermarkConfig 在集成阶段对齐
interface WatermarkExportOptions {
  enabled: boolean;
  type: "tile" | "emboss";
  text: string;
}

interface DownloadImageOptions {
  showGrid: boolean;
  gridInterval: number;
  showCoordinates: boolean;
  gridLineColor: string;
  includeStats: boolean;
  showCellNumbers?: boolean;
  mirrorX: boolean;
  authorName?: string;
  shareCode?: string;
  watermark?: WatermarkExportOptions;
}

interface DownloadImageArgs {
  mappedPixelData: PixelGrid | null;
  gridDimensions: { N: number; M: number } | null;
  colorCounts: Record<string, { color: string; count: number }> | null;
  totalBeadCount: number;
  options: DownloadImageOptions;
  activeBeadPalette: unknown[];
  selectedColorSystem: string;
}

/** 绘制回调：ctx 已按 2x 物理像素设好 transform，rect 为本次需要覆盖的逻辑坐标区域 */
type PatternPainter = (
  ctx: CanvasRenderingContext2D,
  visibleRect: { x: number; y: number; width: number; height: number }
) => void;

/** 解析 #rgb/#rrggbb 为 RGB，按相对亮度返回可读的前景色（源模块内 c） */
function pickContrastTextColor(hex: string): string {
  const normalized = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (_, r: string, g: string, b: string) => r + r + g + g + b + b);
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
  if (!match) return "#000000";
  const rgb = { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255 > 0.5 ? "#000000" : "#FFFFFF";
}

/** canvas → PNG 产物（源模块内 d） */
async function exportCanvasToArtifact(canvas: HTMLCanvasElement, filename: string): Promise<ExportArtifact> {
  return { blob: await canvasToBlob(canvas, "image/png"), filename };
}

/**
 * 将逻辑尺寸 width×height 的图纸按 2x 渲染并编码为 PNG。
 * 小图：单画布 toBlob；超大图：分块光栅化 + 流式 PNG 编码（源模块内 h）。
 */
async function renderPatternToArtifact(
  width: number,
  height: number,
  filename: string,
  paint: PatternPainter
): Promise<ExportArtifact> {
  const pixelWidth = 2 * width;
  const pixelHeight = 2 * height;
  if (!Number.isSafeInteger(pixelWidth) || !Number.isSafeInteger(pixelHeight) || pixelWidth <= 0 || pixelHeight <= 0)
    throw Error("图纸尺寸无效，无法生成图片");
  if (pixelWidth > 32768 || pixelHeight > 32768 || pixelWidth * pixelHeight > 4e8)
    throw Error("图纸过大，无法完整生成清晰图片，请关闭用料清单或缩小图纸后重试");
  const scratch = document.createElement("canvas");
  try {
    if (pixelWidth <= 4096 && pixelHeight <= 4096 && pixelWidth * pixelHeight <= 16e6) {
      scratch.width = pixelWidth;
      scratch.height = pixelHeight;
      const ctx = scratch.getContext("2d");
      if (!ctx) throw Error("浏览器无法创建图片画布");
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      paint(ctx, { x: 0, y: 0, width, height });
      return await exportCanvasToArtifact(scratch, filename);
    }
    // 超大图纸：源为 r.e(214)+r.e(823) 懒加载模块 5823 的 createPngEncoder
    const { createPngEncoder } = await import("@/utils/png-encoder");
    const encoder = createPngEncoder(pixelWidth, pixelHeight);
    // 每批物理行数：约 2M 像素一批
    const batchRows = Math.min(256, Math.floor(2097152 / pixelWidth));
    for (let top = 0; top < pixelHeight; top += batchRows) {
      const rows = Math.min(batchRows, pixelHeight - top);
      const buffer = new Uint8Array(pixelWidth * rows * 4);
      for (let left = 0; left < pixelWidth; left += 2048) {
        const cols = Math.min(2048, pixelWidth - left);
        scratch.width = cols;
        scratch.height = rows;
        const ctx = scratch.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw Error("浏览器无法创建图片画布");
        ctx.setTransform(2, 0, 0, 2, -left, -top);
        paint(ctx, { x: left / 2, y: top / 2, width: cols / 2, height: rows / 2 });
        const data = ctx.getImageData(0, 0, cols, rows).data;
        for (let row = 0; row < rows; row++)
          buffer.set(data.subarray(row * cols * 4, (row + 1) * cols * 4), (row * pixelWidth + left) * 4);
      }
      encoder.writeRows(buffer, rows);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    return { blob: encoder.finish(), filename };
  } finally {
    scratch.width = 0;
    scratch.height = 0;
  }
}

/** 加载图片（data:URL Promise），3 秒超时或出错返回 undefined（源模块内 x） */
async function tryLoadImage(srcPromise: Promise<string>): Promise<HTMLImageElement | undefined> {
  try {
    const src = await srcPromise;
    return await new Promise<HTMLImageElement | undefined>((resolve) => {
      const img = new Image();
      const timer = window.setTimeout(() => resolve(undefined), 3e3);
      img.onload = () => {
        window.clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        resolve(undefined);
      };
      img.src = src;
    });
  } catch {
    return undefined;
  }
}

/** 平铺斜纹水印（tile；覆盖整张图后若有二维码需在其上重绘底衬） */
function drawTileWatermark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  text: string,
  scaleFactor: number
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate(-Math.PI / 15);
  const fontSize = Math.max(16, Math.round(24 * scaleFactor));
  ctx.font = `300 ${fontSize}px Poppins, "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(110, 105, 95, 0.32)";
  const tileWidth = ctx.measureText(trimmed).width + Math.round(70 * scaleFactor);
  const tileHeight = Math.round(60 * scaleFactor);
  const reach = Math.ceil(Math.ceil(Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight)) / 2) + Math.max(tileWidth, tileHeight);
  const cols = Math.ceil((2 * reach) / tileWidth) + 2;
  const rowsToDraw = Math.ceil((2 * reach) / tileHeight) + 2;
  const originX = -Math.floor(cols / 2) * tileWidth;
  const originY = -Math.floor(rowsToDraw / 2) * tileHeight;
  for (let row = 0; row < rowsToDraw; row++)
    for (let col = 0; col < cols; col++)
      if ((row + col) % 2 === 0) ctx.fillText(trimmed, originX + col * tileWidth, originY + row * tileHeight);
  ctx.restore();
}

/** 浮雕水印（emboss；覆盖网格区域中央，白/黑双向 drop-shadow） */
function drawEmbossWatermark(
  ctx: CanvasRenderingContext2D,
  gridLeft: number,
  gridTop: number,
  gridWidth: number,
  gridHeight: number,
  text: string
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  let fontSize = Math.max(48, Math.round(0.25 * Math.min(gridWidth, gridHeight)));
  const maxWidth = 0.75 * gridWidth;
  const setFont = (size: number) => {
    ctx.font = `800 ${size}px Poppins, "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
  };
  for (setFont(fontSize); ctx.measureText(trimmed).width > maxWidth && fontSize > 26; ) setFont((fontSize -= 2));
  const offsetLight = Math.max(2.5, Math.round(0.05 * fontSize));
  const blur = Math.max(3, Math.round(0.07 * fontSize));
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.filter =
    `drop-shadow(${-offsetLight}px ${-offsetLight}px ${blur}px rgba(255,255,255,0.95)) ` +
    `drop-shadow(${offsetLight}px ${offsetLight}px ${blur}px rgba(0,0,0,0.55))`;
  ctx.fillStyle = "rgba(80, 75, 65, 0.35)";
  ctx.fillText(trimmed, gridLeft + gridWidth / 2, gridTop + gridHeight / 2);
  ctx.filter = "none";
  ctx.restore();
}

/** 下载图纸主入口（源压缩导出名 M / downloadImage） */
export async function downloadImage(args: DownloadImageArgs): Promise<ExportArtifact> {
  const {
    mappedPixelData,
    gridDimensions,
    colorCounts,
    totalBeadCount,
    options,
    activeBeadPalette,
    selectedColorSystem,
  } = args;
  if (!mappedPixelData || !gridDimensions || gridDimensions.N === 0 || gridDimensions.M === 0 || activeBeadPalette.length === 0) {
    logger.error("下载失败: 映射数据或尺寸无效");
    throw Error("无法下载图纸 — 数据未生成或无效");
  }
  // 色号统计兜底：colorCounts 缺失时从在手的作品数据即时重算（统计是数据的纯下游，
  // 任何路径导致的丢失都可安全重建；正常路径 counts 恒有值，不会走到这里）。
  // 原版此处直接报错「无法下载图纸 — 色号统计数据未生成或无效」，属可恢复场景，改为兜底。
  let effectiveColorCounts = colorCounts;
  let effectiveTotalBeadCount = totalBeadCount;
  if (!effectiveColorCounts) {
    logger.warn("下载失败: 色号统计数据无效", { action: "从作品数据即时重算" });
    const counts: Record<string, { count: number; color: string }> = {};
    let total = 0;
    for (const row of mappedPixelData)
      for (const cell of row) {
        if (!cell || cell.isExternal || "ERASE" === cell.key) continue;
        if ("string" != typeof cell.color) continue;
        const upper = cell.color.toUpperCase();
        if (!counts[upper]) counts[upper] = { count: 0, color: cell.color };
        counts[upper].count++;
        total++;
      }
    effectiveColorCounts = counts;
    effectiveTotalBeadCount = total > 0 ? total : totalBeadCount;
  }

  const renderWithQr = async (qrImage: HTMLImageElement | undefined): Promise<ExportArtifact> => {
    const { N: cols, M: rows } = gridDimensions;
    const data = options.mirrorX ? mappedPixelData.map((row) => [...row].reverse()) : mappedPixelData;
    const {
      showGrid,
      gridInterval,
      showCoordinates,
      gridLineColor,
      includeStats,
      showCellNumbers = true,
      authorName = "",
      shareCode = "",
    } = options;

    // 版面度量
    const cellSize = Math.max(18, Math.min(40, Math.floor(1340 / cols)));
    const gridWidth = cols * cellSize;
    const gridHeight = rows * cellSize;
    const coordBand = 28 * (showCoordinates ? 1 : 0);
    const canvasWidth = 20 + coordBand + gridWidth + coordBand + 20;
    const scaleFactor = Math.max(0.5, Math.min(1.5, canvasWidth / 1440));
    const footerHeight = Math.round(90 * scaleFactor);
    const statsMarginX = Math.round(28 * scaleFactor);
    const statsSectionGap = Math.round(24 * scaleFactor);
    const statsHeaderHeight = Math.round(44 * scaleFactor);
    const statsFooterGap = Math.round(40 * scaleFactor);
    const statsTitleSize = Math.round(22 * scaleFactor);
    const swatchColorHeight = Math.round(70 * scaleFactor);
    const swatchCountHeight = Math.round(44 * scaleFactor);
    const swatchHeight = swatchColorHeight + swatchCountHeight;
    const swatchRadius = Math.round(6 * scaleFactor);
    const swatchCodeSize = Math.max(6, Math.round(20 * scaleFactor));
    const swatchCountSize = Math.round(18 * scaleFactor);
    const swatchRowHeight = swatchHeight + Math.round(16 * scaleFactor);
    const swatchColGap = Math.round(10 * scaleFactor);
    let statsSectionHeight = 0;
    let statsRowCount = 0;
    if (includeStats && effectiveColorCounts) {
      statsRowCount = Math.ceil(Object.keys(effectiveColorCounts).length / 8);
      statsSectionHeight = statsSectionGap + statsHeaderHeight + statsRowCount * swatchRowHeight + statsFooterGap + statsSectionGap;
    }
    const authorTrim = authorName.trim();
    const hasHeader = !!(authorTrim || selectedColorSystem);
    const headerHeight = hasHeader ? Math.round(90 * scaleFactor) : 0;
    const titleFontSize = Math.round(60 * scaleFactor);
    const subtitleFontSize = Math.round(36 * scaleFactor);
    const headerMarginX = Math.round(28 * scaleFactor);
    const canvasHeight = headerHeight + 16 + coordBand + gridHeight + coordBand + 16 + footerHeight + statsSectionHeight;
    const mirrorSuffix = options.mirrorX ? "-mirror" : "";
    const timestamp = formatTimestamp();
    const filename = showCellNumbers
      ? `bead-grid-${cols}x${rows}-keys-palette_${selectedColorSystem}${mirrorSuffix}_${timestamp}.png`
      : `bead-grid-${cols}x${rows}-pixel-palette_${selectedColorSystem}${mirrorSuffix}_${timestamp}.png`;

    return renderPatternToArtifact(canvasWidth, canvasHeight, filename, (ctx, visibleRect) => {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = BRAND_COLORS.LIGHT;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // 页眉：色号系统名 + “色号”说明（左）、作者名 + “作者 ”说明（右）、分隔线
      if (hasHeader) {
        const baselineTop = Math.round(0.22 * headerHeight);
        const labelGap = Math.round(6 * scaleFactor);
        ctx.textBaseline = "top";
        {
          ctx.textAlign = "left";
          ctx.fillStyle = BRAND_COLORS.GREEN;
          ctx.font = `700 ${titleFontSize}px Poppins, Arial, sans-serif`;
          ctx.fillText(selectedColorSystem, headerMarginX, baselineTop);
          const systemWidth = ctx.measureText(selectedColorSystem).width;
          ctx.fillStyle = BRAND_COLORS.MID_GRAY;
          ctx.font = `400 ${subtitleFontSize}px Lora, Georgia, serif`;
          ctx.fillText("色号", headerMarginX + systemWidth + labelGap, baselineTop + (titleFontSize - subtitleFontSize) * 0.15);
        }
        if (authorTrim) {
          ctx.textAlign = "right";
          ctx.fillStyle = BRAND_COLORS.ORANGE;
          ctx.font = `700 ${titleFontSize}px Poppins, Arial, sans-serif`;
          ctx.fillText(authorTrim, canvasWidth - headerMarginX, baselineTop);
          const authorWidth = ctx.measureText(authorTrim).width;
          ctx.fillStyle = BRAND_COLORS.MID_GRAY;
          ctx.font = `400 ${subtitleFontSize}px Lora, Georgia, serif`;
          ctx.textAlign = "right";
          ctx.fillText("作者 ", canvasWidth - headerMarginX - authorWidth - labelGap, baselineTop + (titleFontSize - subtitleFontSize) * 0.15);
        }
        ctx.strokeStyle = BRAND_COLORS.LIGHT_GRAY;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(headerMarginX, headerHeight - 0.5);
        ctx.lineTo(canvasWidth - headerMarginX, headerHeight - 0.5);
        ctx.stroke();
      }

      const gridLeft = 20 + coordBand;
      const gridTop = headerHeight + 16 + coordBand;

      // 坐标带：上下左右四条，每 gridInterval（含首末）标注序号
      if (showCoordinates) {
        ctx.fillStyle = BRAND_COLORS.LIGHT_GRAY;
        ctx.fillRect(gridLeft, headerHeight + 16, gridWidth, coordBand);
        ctx.fillRect(gridLeft, gridTop + gridHeight, gridWidth, coordBand);
        ctx.fillRect(20, gridTop, coordBand, gridHeight);
        ctx.fillRect(gridLeft + gridWidth, gridTop, coordBand, gridHeight);
        const tickFontSize = Math.max(9, Math.min(11, cellSize - 4));
        ctx.fillStyle = BRAND_COLORS.MID_GRAY;
        ctx.font = `400 ${tickFontSize}px Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let col = 0; col < cols; col++)
          if ((col + 1) % gridInterval === 0 || col === 0 || col === cols - 1) {
            const x = gridLeft + col * cellSize + cellSize / 2;
            ctx.fillText((col + 1).toString(), x, headerHeight + 16 + coordBand / 2);
            ctx.fillText((col + 1).toString(), x, gridTop + gridHeight + coordBand / 2);
          }
        for (let row = 0; row < rows; row++)
          if ((row + 1) % gridInterval === 0 || row === 0 || row === rows - 1) {
            const y = gridTop + row * cellSize + cellSize / 2;
            ctx.fillText((row + 1).toString(), 20 + coordBand / 2, y);
            ctx.fillText((row + 1).toString(), gridLeft + gridWidth + coordBand / 2, y);
          }
      }

      // 像素格（仅绘制可见范围 ±1 格）
      const cellNumberFontSize = Math.max(6, Math.floor(0.38 * cellSize));
      ctx.font = `600 ${cellNumberFontSize}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const visibleRowStart = Math.max(0, Math.floor((visibleRect.y - gridTop) / cellSize) - 1);
      const visibleRowEnd = Math.min(rows, Math.ceil((visibleRect.y + visibleRect.height - gridTop) / cellSize) + 1);
      const visibleColStart = Math.max(0, Math.floor((visibleRect.x - gridLeft) / cellSize) - 1);
      const visibleColEnd = Math.min(cols, Math.ceil((visibleRect.x + visibleRect.width - gridLeft) / cellSize) + 1);
      for (let row = visibleRowStart; row < visibleRowEnd; row++)
        for (let col = visibleColStart; col < visibleColEnd; col++) {
          const cell = data[row][col];
          const x = gridLeft + col * cellSize;
          const y = gridTop + row * cellSize;
          if (cell && !cell.isExternal) {
            ctx.fillStyle = cell.color;
            ctx.fillRect(x, y, cellSize, cellSize);
            // 上/左高光、下/右阴影，营造拼豆立体感
            const bevel = Math.max(1, Math.round(0.06 * cellSize));
            ctx.fillStyle = "rgba(255,255,255,0.18)";
            ctx.fillRect(x, y, cellSize, bevel);
            ctx.fillRect(x, y, bevel, cellSize);
            ctx.fillStyle = "rgba(0,0,0,0.10)";
            ctx.fillRect(x, y + cellSize - bevel, cellSize, bevel);
            ctx.fillRect(x + cellSize - bevel, y, bevel, cellSize);
            if (showCellNumbers) {
              ctx.fillStyle = pickContrastTextColor(cell.color);
              ctx.fillText(getDisplayColorKey(cell.color, selectedColorSystem), x + cellSize / 2, y + cellSize / 2);
            }
          } else {
            // 外部/透明格：4×4 棋盘纹
            const subSize = cellSize / 4;
            for (let sy = 0; sy < 4; sy++)
              for (let sx = 0; sx < 4; sx++) {
                ctx.fillStyle = (sy + sx) % 2 === 0 ? "#f0f0f0" : "#dcdcdc";
                ctx.fillRect(x + sx * subSize, y + sy * subSize, Math.ceil(subSize), Math.ceil(subSize));
              }
          }
          ctx.strokeStyle = BRAND_COLORS.LIGHT_GRAY;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
        }

      // 网格辅助线（每 gridInterval 一条）
      if (showGrid) {
        ctx.strokeStyle = gridLineColor;
        ctx.lineWidth = 1.5;
        for (let col = gridInterval; col < cols; col += gridInterval) {
          const x = gridLeft + col * cellSize;
          ctx.beginPath();
          ctx.moveTo(x, gridTop);
          ctx.lineTo(x, gridTop + gridHeight);
          ctx.stroke();
        }
        for (let row = gridInterval; row < rows; row += gridInterval) {
          const y = gridTop + row * cellSize;
          ctx.beginPath();
          ctx.moveTo(gridLeft, y);
          ctx.lineTo(gridLeft + gridWidth, y);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = BRAND_COLORS.DARK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(gridLeft + 0.5, gridTop + 0.5, gridWidth - 1, gridHeight - 1);

      // 底部品牌栏：品牌名 / 副标题（右对齐于二维码左侧）、画廊分享码（左）
      const footerTop = headerHeight + 16 + coordBand + gridHeight + coordBand + 16;
      {
        const leftMargin = Math.round(28 * scaleFactor);
        const brandNameSize = Math.round(27 * scaleFactor);
        const subtitleSize = Math.round(16 * scaleFactor);
        const qrSize = Math.round(57 * scaleFactor);
        ctx.fillStyle = BRAND_COLORS.LIGHT;
        ctx.fillRect(0, footerTop, canvasWidth, footerHeight);
        const qrX = canvasWidth - leftMargin - qrSize;
        const qrY = footerTop + (footerHeight - qrSize) / 2;
        if (qrImage) {
          ctx.globalCompositeOperation = "multiply";
          ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.textBaseline = "middle";
        const textRight = qrX - leftMargin;
        ctx.textAlign = "right";
        ctx.fillStyle = BRAND_COLORS.DARK;
        ctx.font = `700 ${brandNameSize}px Poppins, Arial, sans-serif`;
        ctx.fillText("豆你玩", textRight, footerTop + 0.36 * footerHeight);
        ctx.fillStyle = BRAND_COLORS.MID_GRAY;
        ctx.font = `400 ${subtitleSize}px Lora, Georgia, serif`;
        ctx.fillText("拼豆底稿生成器 2.0", textRight, footerTop + 0.7 * footerHeight);
        {
          const shareCodeTrim = shareCode.trim();
          if (shareCodeTrim) {
            const labelGap = Math.round(6 * scaleFactor);
            ctx.textBaseline = "top";
            ctx.textAlign = "left";
            const shareTop = footerTop + Math.round(0.22 * footerHeight);
            ctx.fillStyle = BRAND_COLORS.BLUE;
            ctx.font = `700 ${titleFontSize}px Poppins, Arial, sans-serif`;
            ctx.fillText(shareCodeTrim, leftMargin, shareTop);
            const shareWidth = ctx.measureText(shareCodeTrim).width;
            ctx.fillStyle = BRAND_COLORS.MID_GRAY;
            ctx.font = `400 ${subtitleFontSize}px Lora, Georgia, serif`;
            ctx.fillText("画廊分享码", leftMargin + shareWidth + labelGap, shareTop + (titleFontSize - subtitleFontSize) * 0.15);
          }
        }
      }

      // 用料清单：分隔线 + 标题（“用料清单” / “共 N 颗”）+ 每行 8 张色卡 + 网址页脚
      if (includeStats && effectiveColorCounts) {
        const sortedKeys = Object.keys(effectiveColorCounts).sort(compareColorKeys);
        const statsTop = headerHeight + 16 + coordBand + gridHeight + coordBand + 16 + footerHeight;
        ctx.strokeStyle = BRAND_COLORS.LIGHT_GRAY;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(statsMarginX, statsTop + statsSectionGap / 2);
        ctx.lineTo(canvasWidth - statsMarginX, statsTop + statsSectionGap / 2);
        ctx.stroke();
        const titleBaseline = statsTop + statsSectionGap + statsHeaderHeight / 2;
        ctx.fillStyle = BRAND_COLORS.DARK;
        ctx.font = `700 ${statsTitleSize}px Poppins, Arial, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("用料清单", statsMarginX, titleBaseline);
        ctx.font = `700 ${statsTitleSize}px Arial, sans-serif`;
        ctx.textAlign = "right";
        ctx.fillText(`共 ${(effectiveTotalBeadCount ?? totalBeadCount).toLocaleString()} 颗`, canvasWidth - statsMarginX, titleBaseline);
        const columnWidth = Math.floor((canvasWidth - 2 * statsMarginX) / 8);
        const swatchWidth = columnWidth - swatchColGap;
        const cardsTop = statsTop + statsSectionGap + statsHeaderHeight;
        sortedKeys.forEach((hex, index) => {
          const rowIndex = Math.floor(index / 8);
          const cardX = statsMarginX + (index % 8) * columnWidth;
          const cardY = cardsTop + rowIndex * swatchRowHeight;
          const { color, count } = effectiveColorCounts[hex];
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, swatchWidth, swatchHeight, swatchRadius);
          ctx.fill();
          ctx.strokeStyle = BRAND_COLORS.LIGHT_GRAY;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(cardX + 0.5, cardY + 0.5, swatchWidth - 1, swatchHeight - 1, swatchRadius);
          ctx.stroke();
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, swatchWidth, swatchHeight, swatchRadius);
          ctx.clip();
          ctx.fillStyle = color;
          ctx.fillRect(cardX, cardY, swatchWidth, swatchColorHeight);
          ctx.restore();
          ctx.fillStyle = pickContrastTextColor(color);
          ctx.font = `600 ${swatchCodeSize}px Arial, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(getColorKeyByHex(hex, selectedColorSystem), cardX + swatchWidth / 2, cardY + swatchColorHeight / 2);
          ctx.fillStyle = BRAND_COLORS.DARK;
          ctx.font = `600 ${swatchCountSize}px Arial, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${count}`, cardX + swatchWidth / 2, cardY + swatchColorHeight + swatchCountHeight / 2);
        });
        const siteBaseline = cardsTop + statsRowCount * swatchRowHeight + statsFooterGap / 2;
        ctx.font = `400 ${Math.round(16 * scaleFactor)}px Arial, sans-serif`;
        ctx.fillStyle = BRAND_COLORS.MID_GRAY;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("perlerbeads.zippland.com", statsMarginX, siteBaseline);
      }

      // 水印
      const watermark = options.watermark;
      if (watermark && watermark.enabled && watermark.text.trim()) {
        if (watermark.type === "tile") {
          drawTileWatermark(ctx, canvasWidth, canvasHeight, watermark.text, scaleFactor);
          // 平铺水印会盖住右下角二维码：在其位置补浅色底衬后用 multiply 重绘，保证可扫描
          if (qrImage) {
            const rightMargin = Math.round(28 * scaleFactor);
            const logoSize = Math.round(57 * scaleFactor);
            const logoX = canvasWidth - rightMargin - logoSize;
            const logoY = footerTop + (footerHeight - logoSize) / 2;
            const pad = Math.round(8 * scaleFactor);
            ctx.fillStyle = BRAND_COLORS.LIGHT;
            ctx.fillRect(logoX - pad, logoY - pad, logoSize + 2 * pad, logoSize + 2 * pad);
            ctx.globalCompositeOperation = "multiply";
            ctx.drawImage(qrImage, logoX, logoY, logoSize, logoSize);
            ctx.globalCompositeOperation = "source-over";
          }
        } else if (watermark.type === "emboss") {
          drawEmbossWatermark(ctx, gridLeft, gridTop, gridWidth, gridHeight, watermark.text);
        }
      }
    });
  };

  // 画廊二维码（node-qrcode；失败/超时返回 undefined，底部品牌栏相应留空）
  return renderWithQr(await tryLoadImage(qrToDataURL("https://perlerbeads.zippland.com/", { margin: 1, width: 128 })));
}
