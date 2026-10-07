import { ERASE_CELL } from "@/utils/bundle-misc";
import { logger } from "@/lib/logger";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface PaletteColor {
  key: string;
  hex: string;
  rgb: Rgb;
}

export interface GridCell {
  key: string;
  color: string;
  isExternal?: boolean;
}

/** 格子对齐参考（编辑图片中标记的参考网格） */
export interface RefGrid {
  refX: number;
  refY: number;
  cellWidth: number;
  cellHeight: number;
}

/** * 像素化处理模式 */
export const PixelationMode = {
  Dominant: "dominant",
  Average: "average",
} as const;
export type PixelationMode = (typeof PixelationMode)[keyof typeof PixelationMode];

/** #rrggbb → {r,g,b}（原压缩导出名 E2） */
export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match
    ? {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16),
      }
    : null;
}

/** 两个 RGB 颜色的欧氏距离（原压缩导出名 $2） */
export function rgbDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** 在调色板中查找与目标 RGB 最近的颜色（原压缩导出名 V$） */
export function findClosestPaletteColor(target: Rgb, palette: PaletteColor[]): PaletteColor {
  if (!palette || 0 === palette.length) {
    logger.error("findClosestPaletteColor: Palette is empty or invalid");
    return {
      key: "ERR",
      hex: "#000000",
      rgb: { r: 0, g: 0, b: 0 },
    };
  }
  let bestDistance = Infinity;
  let best = palette[0];
  for (const candidate of palette) {
    const distance = rgbDistance(target, candidate.rgb);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
    if (0 === distance) break;
  }
  return best;
}

/** 计算单个单元格的代表色：average 模式取均值，否则取出现次数最多的主色 */
function computeCellColor(
  imageData: ImageData,
  startX: number,
  startY: number,
  width: number,
  height: number,
  mode: PixelationMode,
): Rgb | null {
  const data = imageData.data;
  const imgWidth = imageData.width;
  let rSum = 0,
    gSum = 0,
    bSum = 0;
  let count = 0;
  const counts: Record<string, number> = {};
  let dominant: Rgb | null = null;
  let dominantCount = 0;
  const endX = startX + width;
  const endY = startY + height;
  for (let y = startY; y < endY; y++)
    for (let x = startX; x < endX; x++) {
      const idx = (y * imgWidth + x) * 4;
      if (data[idx + 3] < 128) continue;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      count++;
      if ("average" === mode) {
        rSum += r;
        gSum += g;
        bSum += b;
      } else {
        const key = `${r},${g},${b}`;
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] > dominantCount) {
          dominantCount = counts[key];
          dominant = { r, g, b };
        }
      }
    }
  return 0 === count
    ? null
    : "average" === mode
      ? {
          r: Math.round(rSum / count),
          g: Math.round(gSum / count),
          b: Math.round(bSum / count),
        }
      : dominant;
}

/** 由参考网格推算对齐切割的列数/行数与每格起始像素坐标 */
function computeAlignedGrid(
  imageWidth: number,
  imageHeight: number,
  ref: RefGrid,
): { cols: number; rows: number; cellStarts: { x: number[]; y: number[] } } {
  const { refX, refY, cellWidth, cellHeight } = ref;
  const baseCol = Math.floor(refX / cellWidth);
  const fracX = refX - baseCol * cellWidth;
  const roundUpX = fracX >= cellWidth / 2;
  const remainX = imageWidth - (refX + 3 * cellWidth);
  const fullCellsX = Math.floor(remainX / cellWidth);
  const totalCols =
    +!!roundUpX + baseCol + 3 + fullCellsX + +(remainX - fullCellsX * cellWidth >= cellWidth / 2);
  const startsX: number[] = [];
  let sx = roundUpX ? 0 : fracX;
  for (let i = 0; i < totalCols; i++) {
    startsX.push(sx);
    sx += cellWidth;
  }
  const baseRow = Math.floor(refY / cellHeight);
  const fracY = refY - baseRow * cellHeight;
  const roundUpY = fracY >= cellHeight / 2;
  const remainY = imageHeight - (refY + 3 * cellHeight);
  const fullCellsY = Math.floor(remainY / cellHeight);
  const totalRows =
    +!!roundUpY + baseRow + 3 + fullCellsY + +(remainY - fullCellsY * cellHeight >= cellHeight / 2);
  const startsY: number[] = [];
  let sy = roundUpY ? 0 : fracY;
  for (let i = 0; i < totalRows; i++) {
    startsY.push(sy);
    sy += cellHeight;
  }
  return {
    cols: totalCols,
    rows: totalRows,
    cellStarts: { x: startsX, y: startsY },
  };
}

/**
 * 图像 → 拼豆网格（原压缩导出名 TH）
 * @param ctx 源画布上下文
 * @param width 源图宽度（像素）
 * @param height 源图高度（像素）
 * @param cols 横向格数（非对齐模式）
 * @param rows 纵向格数（非对齐模式）
 * @param palette 可用调色板
 * @param mode 像素化模式（dominant=卡通 / average=真实）
  * @param eraseCell 空白格填充
 * @param refGrid 格子对齐参考；传入时切换为对齐切割模式，cols/rows 被忽略（可省略）
 */
export function imageToGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cols: number,
  rows: number,
  palette: PaletteColor[],
  mode: PixelationMode,
  eraseCell: { key: string; hex: string },
  refGrid?: RefGrid | null,
): GridCell[][] {
  let imageData: ImageData | null = null;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch (err) {
    logger.error("Failed to get full image data", err);
    return [];
  }
  if (refGrid) {
    const grid = computeAlignedGrid(width, height, refGrid);
    const gridCols = grid.cols;
    const gridRows = grid.rows;
    const { cellWidth, cellHeight } = refGrid;
    const result: GridCell[][] = Array(gridRows)
      .fill(null)
      .map(() => Array(gridCols).fill({ key: eraseCell.key, color: eraseCell.hex }));
    for (let row = 0; row < gridRows; row++)
      for (let col = 0; col < gridCols; col++) {
        let cell: GridCell;
        const startX = Math.floor(grid.cellStarts.x[col]);
        const startY = Math.floor(grid.cellStarts.y[row]);
        const cellW = Math.max(1, Math.min(width, Math.floor(startX + cellWidth)) - Math.max(0, startX));
        const cellH = Math.max(
          1,
          Math.min(height, Math.floor(startY + cellHeight)) - Math.max(0, startY),
        );
        const rgb = computeCellColor(imageData, Math.max(0, startX), Math.max(0, startY), cellW, cellH, mode);
        if (rgb) {
          const closest = findClosestPaletteColor(rgb, palette);
          cell = { key: closest.key, color: closest.hex };
        } else cell = { ...ERASE_CELL };
        result[row][col] = cell;
      }
    return result;
  }
  const result: GridCell[][] = Array(rows)
    .fill(null)
    .map(() => Array(cols).fill({ key: eraseCell.key, color: eraseCell.hex }));
  const cellWidthF = width / cols;
  const cellHeightF = height / rows;
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      let cell: GridCell;
      const x0 = Math.floor(col * cellWidthF);
      const y0 = Math.floor(row * cellHeightF);
      const cellW = Math.max(1, Math.min(width, Math.ceil((col + 1) * cellWidthF)) - x0);
      const cellH = Math.max(1, Math.min(height, Math.ceil((row + 1) * cellHeightF)) - y0);
      const rgb = computeCellColor(imageData, x0, y0, cellW, cellH, mode);
      if (rgb) {
        const closest = findClosestPaletteColor(rgb, palette);
        cell = { key: closest.key, color: closest.hex };
      } else cell = { ...ERASE_CELL };
      result[row][col] = cell;
    }
  return result;
}

/* —— 集成兼容别名（调用方命名 ↔ 本文件导出名）—— */
export {
  rgbDistance as colorDistanceRgb, // page.tsx 调用名（原 $2）
  findClosestPaletteColor as findNearestPaletteColor, // page.tsx 调用名（原 V$）
  imageToGrid as pixelateImageToGrid, // page.tsx 调用名（原 TH）
  PixelationMode as Jx, // excluded-colors 调用名（原 Jx）
};
