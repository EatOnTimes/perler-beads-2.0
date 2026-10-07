
/** 拼豆格子数据（与色板系统一致） */
export interface PixelCell {
  key: string;
  color: string;
  isExternal?: boolean;
}

export type PixelGrid = (PixelCell | undefined)[][];

/** 导出 / 预览配置（烫豆预览、完成图共用） */
export interface ExportConfig {
  texture: "matte" | "glitter" | "towel" | "scrub";
  showShadow: boolean;
  shadowAngle: number;
  shadowDistance: number;
  roundedEdge: boolean;
  edgeRadius: number;
  backgroundColor: string;
  brandText: string;
  brandOpacity?: number;
}

interface CellBounds {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

interface ExportLayout {
  bounds: CellBounds;
  padX: number;
  padTop: number;
  padBottom: number;
  effectSafeCells: number;
  frameCols: number;
  frameRows: number;
  logicalCellSize: number;
}

/** 逻辑格 → 画布像素的映射器（对齐物理像素，避免半像素缝） */
interface GridMapper {
  x: (col: number) => number;
  y: (row: number) => number;
  width: (col: number) => number;
  height: (row: number) => number;
  backingScaleX: number;
  backingScaleY: number;
}

/** * 默认导出配置 */
export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  texture: "matte",
  showShadow: true,
  shadowAngle: 135,
  shadowDistance: 8,
  roundedEdge: true,
  edgeRadius: 0.3,
  backgroundColor: "#f0e6d3",
  brandText: "可更改此文字",
  brandOpacity: 0.35,
};

/** 判断 (row, col) 是否为有效拼豆格（原模块内 a / c，两处实现相同） */
function isBeadCell(grid: PixelGrid, row: number, col: number, limitA: number, limitB: number): boolean {
  const cell = grid[row]?.[col];
  return !!cell && !cell.isExternal && "ERASE" !== cell.key;
}

/** 绒面纹理：横向细线（原模块内 l） */
function drawTowelLines(
  ctx: CanvasRenderingContext2D,
  clip: Path2D,
  bounds: CellBounds,
  mapper: GridMapper,
  gap: number,
  lineWidth: number
): void {
  const left = mapper.x(bounds.minCol);
  const right = mapper.x(bounds.maxCol + 1);
  const top = mapper.y(bounds.minRow);
  const bottom = mapper.y(bounds.maxRow + 1);
  ctx.save();
  ctx.clip(clip);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let y = top + gap / 2; y < bottom; y += gap) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** 磨砂纹理：斜向细线（原模块内 n） */
function drawScrubLines(
  ctx: CanvasRenderingContext2D,
  clip: Path2D,
  bounds: CellBounds,
  mapper: GridMapper,
  gap: number,
  lineWidth: number
): void {
  const left = mapper.x(bounds.minCol);
  const right = mapper.x(bounds.maxCol + 1);
  const top = mapper.y(bounds.minRow);
  const bottom = mapper.y(bounds.maxRow + 1);
  const side = bottom - top;
  ctx.save();
  ctx.clip(clip);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let x = left - side; x < right; x += gap) {
    ctx.moveTo(x, top);
    ctx.lineTo(x + side, bottom);
  }
  ctx.stroke();
  ctx.restore();
}

/** 计算内容边界 + 留白 + 逻辑格尺寸（原模块内 s） */
function computeExportLayout(grid: PixelGrid, cols: number, rows: number): ExportLayout {
  const raw: CellBounds | null = (() => {
    let minRow = rows,
      maxRow = -1,
      minCol = cols,
      maxCol = -1;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = grid[row]?.[col];
        if (cell && !cell.isExternal && "ERASE" !== cell.key) {
          minRow = Math.min(minRow, row);
          maxRow = Math.max(maxRow, row);
          minCol = Math.min(minCol, col);
          maxCol = Math.max(maxCol, col);
        }
      }
    }
    return maxRow < 0 ? null : { minRow, maxRow, minCol, maxCol };
  })();
  const bounds = raw ?? {
    minRow: 0,
    maxRow: Math.max(0, rows - 1),
    minCol: 0,
    maxCol: Math.max(0, cols - 1),
  };
  const contentCols = bounds.maxCol - bounds.minCol + 1;
  const contentRows = bounds.maxRow - bounds.minRow + 1;
  const minPadX = Math.max(1, Math.ceil(0.12 * contentCols));
  const minPadTop = Math.max(1, Math.ceil(0.12 * contentRows));
  const minPadBottom = Math.max(2, Math.ceil(0.28 * contentRows));
  const logicalCellSize = Math.max(16, Math.ceil(64 / Math.min(minPadX, minPadTop, minPadBottom)));
  const effectSafeCells = Math.ceil(64 / logicalCellSize);
  const padX = Math.max(minPadX, effectSafeCells);
  const padTop = Math.max(minPadTop, effectSafeCells);
  const padBottom = minPadBottom + effectSafeCells;
  return {
    bounds,
    padX,
    padTop,
    padBottom,
    effectSafeCells,
    frameCols: contentCols + 2 * padX,
    frameRows: contentRows + padTop + padBottom,
    logicalCellSize,
  };
}

/** * 计算导出画布尺寸 */
export function getExportCanvasSize(grid: PixelGrid, cols: number, rows: number): { width: number; height: number } {
  const layout = computeExportLayout(grid, cols, rows);
  return {
    width: layout.frameCols * layout.logicalCellSize,
    height: layout.frameRows * layout.logicalCellSize,
  };
}

/** 亮片纹理：随机高光小圆点（原模块内 glitter 匿名函数） */
function drawGlitterSpeckles(
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  cols: number,
  rows: number,
  bounds: CellBounds,
  mapper: GridMapper,
  beadPath: Path2D,
  beadCount: number
): void {
  if (beadCount === 0) return;
  const speckles = new Path2D();
  const minScale = Math.min(mapper.backingScaleX, mapper.backingScaleY);
  const stride = Math.max(1, Math.ceil(beadCount / 512));
  const radius = 0.9 / minScale;
  let visited = 0;
  let drawn = 0;
  outer: for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      // 原代码此处实参顺序为 (grid, row, col, rows, cols)，与 isBeadCell 形参 (…, limitA, limitB) 互换，逐字保留
      if (!isBeadCell(grid, row, col, rows, cols) || visited++ % stride !== 0) continue;
      const cellX = mapper.x(col);
      const cellY = mapper.y(row);
      const cellW = mapper.width(col);
      const cellH = mapper.height(row);
      const seed = ((0x466f45d * row) ^ (0x127409f * col)) >>> 0;
      const cx = cellX + cellW * (0.3 + (255 & seed) / 640);
      const cy = cellY + cellH * (0.3 + (seed >>> 8 & 255) / 640);
      speckles.moveTo(cx + radius, cy);
      speckles.arc(cx, cy, radius, 0, 2 * Math.PI);
      if (++drawn >= 512) break outer;
    }
  }
  ctx.save();
  ctx.clip(beadPath);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fill(speckles);
  ctx.restore();
}

/** * 表面纹理渲染 */
function drawSurfaceTexture(
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  cols: number,
  rows: number,
  bounds: CellBounds,
  mapper: GridMapper,
  beadPath: Path2D,
  beadCount: number,
  texture: ExportConfig["texture"]
): void {
  const minScale = Math.min(mapper.backingScaleX, mapper.backingScaleY);
  // 单元格太小时走简化纹理
  if (5 > Math.min(mapper.width(bounds.minCol) * mapper.backingScaleX, mapper.height(bounds.minRow) * mapper.backingScaleY) || beadCount > 4096) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    switch (texture) {
      case "matte":
        ctx.fillStyle = "rgba(255,255,255,0.025)";
        ctx.fill(beadPath);
        break;
      case "glitter":
        drawGlitterSpeckles(ctx, grid, cols, rows, bounds, mapper, beadPath, beadCount);
        break;
      case "towel":
        drawTowelLines(ctx, beadPath, bounds, mapper, 4 / mapper.backingScaleY, 0.75 / minScale);
        break;
      case "scrub":
        drawScrubLines(ctx, beadPath, bounds, mapper, 4 / mapper.backingScaleX, 0.75 / minScale);
    }
    ctx.restore();
    return;
  }

  const highlight = new Path2D(); // 豆顶高光
  const bottomShade = new Path2D(); // 豆底阴影弧
  const glitterDots = new Path2D();
  let hasHighlight = false;
  let hasGlitter = false;
  let strokeWidth = 0.35;
  for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      // 原代码此处实参顺序为 (grid, row, col, rows, cols)，逐字保留
      if (!isBeadCell(grid, row, col, rows, cols)) continue;
      const cellX = mapper.x(col);
      const cellY = mapper.y(row);
      const cellW = mapper.width(col);
      const cellH = mapper.height(row);
      const minSide = Math.min(cellW, cellH);
      const hx = cellX + 0.34 * cellW;
      const hy = cellY + 0.3 * cellH;
      const hr = 0.2 * cellW;
      highlight.moveTo(hx + 0.9393727128473789 * hr, hy + -0.34289780745545134 * hr);
      highlight.ellipse(hx, hy, hr, 0.13 * cellH, -0.35, 0, 2 * Math.PI);
      bottomShade.moveTo(cellX + 0.2 * cellW, cellY + 0.86 * cellH);
      bottomShade.quadraticCurveTo(cellX + 0.55 * cellW, cellY + 0.94 * cellH, cellX + 0.84 * cellW, cellY + 0.72 * cellH);
      strokeWidth = Math.max(strokeWidth, 0.75 / minScale, 0.025 * minSide);
      hasHighlight = true;
      if ("glitter" === texture) {
        const dotRadius = Math.max(0.35 / minScale, 0.065 * minSide);
        for (let i = 0; i < 3; i++) {
          const dx = cellX + cellW * (0.2 + ((Math.sin(7 * cellX + 2.1 * i) + 1) / 2) * 0.6);
          const dy = cellY + cellH * (0.2 + ((Math.cos(11 * cellY + 1.7 * i) + 1) / 2) * 0.6);
          glitterDots.moveTo(dx + dotRadius, dy);
          glitterDots.arc(dx, dy, dotRadius, 0, 2 * Math.PI);
        }
        hasGlitter = true;
      }
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  if (hasHighlight) {
    ctx.fillStyle = "matte" === texture ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.08)";
    ctx.fill(highlight);
    ctx.strokeStyle = "rgba(0,0,0,0.055)";
    ctx.lineWidth = strokeWidth;
    ctx.stroke(bottomShade);
  }
  switch (texture) {
    case "matte":
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fill(beadPath);
      break;
    case "glitter":
      if (hasGlitter) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fill(glitterDots);
      }
      break;
    case "towel":
      drawTowelLines(ctx, beadPath, bounds, mapper, 2, Math.max(0.5, 0.75 / minScale));
      break;
    case "scrub":
      drawScrubLines(ctx, beadPath, bounds, mapper, 3, Math.max(0.5, 0.75 / minScale));
  }
  ctx.restore();
}

/** * 圆角边缘：给边界格子补弧形过渡 */
function drawRoundedEdges(
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  cols: number,
  rows: number,
  bounds: CellBounds,
  mapper: GridMapper,
  config: ExportConfig
): void {
  const cellWidth = mapper.width(bounds.minCol);
  const radius = Math.min(cellWidth, mapper.height(bounds.minRow)) * config.edgeRadius * 0.35;
  const verticalOk = radius * mapper.backingScaleY >= 1.5;
  const horizontalOk = radius * mapper.backingScaleX >= 1.5;
  if (!verticalOk && !horizontalOk) return;
  const colorPaths = new Map<string, Path2D>();
  const outline = new Path2D();
  let hasOutline = false;
  const getPathForColor = (color: string): Path2D => {
    let path = colorPaths.get(color);
    if (path) return path;
    path = new Path2D();
    colorPaths.set(color, path);
    return path;
  };
  for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      if (!isBeadCell(grid, row, col, cols, rows)) continue;
      const cellX = mapper.x(col);
      const cellY = mapper.y(row);
      const cellW = mapper.width(col);
      const cellH = mapper.height(row);
      const noTop = !isBeadCell(grid, row - 1, col, cols, rows);
      const noBottom = !isBeadCell(grid, row + 1, col, cols, rows);
      const noLeft = !isBeadCell(grid, row, col - 1, cols, rows);
      const noRight = !isBeadCell(grid, row, col + 1, cols, rows);
      const needsHorizontal = horizontalOk && (noLeft || noRight);
      if (!(verticalOk && (noTop || noBottom)) && !needsHorizontal) continue;
      const path = getPathForColor(grid[row][col]!.color);
      if (noTop && verticalOk) {
        path.moveTo(cellX, cellY);
        path.quadraticCurveTo(cellX + cellW / 2, cellY - radius, cellX + cellW, cellY);
        path.closePath();
        outline.moveTo(cellX, cellY);
        outline.quadraticCurveTo(cellX + cellW / 2, cellY - radius, cellX + cellW, cellY);
        hasOutline = true;
      }
      if (noBottom && verticalOk) {
        path.moveTo(cellX, cellY + cellH);
        path.quadraticCurveTo(cellX + cellW / 2, cellY + cellH + radius, cellX + cellW, cellY + cellH);
        path.closePath();
        outline.moveTo(cellX, cellY + cellH);
        outline.quadraticCurveTo(cellX + cellW / 2, cellY + cellH + radius, cellX + cellW, cellY + cellH);
        hasOutline = true;
      }
      if (noLeft && horizontalOk) {
        path.moveTo(cellX, cellY);
        path.quadraticCurveTo(cellX - radius, cellY + cellH / 2, cellX, cellY + cellH);
        path.closePath();
        outline.moveTo(cellX, cellY);
        outline.quadraticCurveTo(cellX - radius, cellY + cellH / 2, cellX, cellY + cellH);
        hasOutline = true;
      }
      if (noRight && horizontalOk) {
        path.moveTo(cellX + cellW, cellY);
        path.quadraticCurveTo(cellX + cellW + radius, cellY + cellH / 2, cellX + cellW, cellY + cellH);
        path.closePath();
        outline.moveTo(cellX + cellW, cellY);
        outline.quadraticCurveTo(cellX + cellW + radius, cellY + cellH / 2, cellX + cellW, cellY + cellH);
        hasOutline = true;
      }
    }
  }
  ctx.save();
  for (const [color, path] of colorPaths) {
    ctx.fillStyle = color;
    ctx.fill(path);
  }
  if (hasOutline) {
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = Math.max(0.65 / Math.min(mapper.backingScaleX, mapper.backingScaleY), 0.03 * cellWidth);
    ctx.stroke(outline);
  }
  ctx.restore();
}

/** * 主渲染入口 */
export function renderArtwork(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  grid: PixelGrid,
  cols: number,
  rows: number,
  config: ExportConfig
): void {
  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  const { bounds, padX, padTop, effectSafeCells, frameCols, frameRows, logicalCellSize } = computeExportLayout(grid, cols, rows);
  const cellSize = Math.min(logicalCellSize, canvasWidth / frameCols, canvasHeight / frameRows);
  const artWidth = frameCols * cellSize;
  const artHeight = frameRows * cellSize;
  const artOffsetX = (canvasWidth - artWidth) / 2;
  const artOffsetY = (canvasHeight - artHeight) / 2;
  const transform = ctx.getTransform();
  const backingScaleX = Math.max(Math.hypot(transform.a, transform.b), Number.EPSILON);
  const backingScaleY = Math.max(Math.hypot(transform.c, transform.d), Number.EPSILON);
  const snapX = (v: number) => Math.round(v * backingScaleX) / backingScaleX;
  const snapY = (v: number) => Math.round(v * backingScaleY) / backingScaleY;
  const xOf = (col: number) => snapX(artOffsetX + (padX + col - bounds.minCol) * cellSize);
  const yOf = (row: number) => snapY(artOffsetY + (padTop + row - bounds.minRow) * cellSize);
  const widthOf = (col: number) => xOf(col + 1) - xOf(col);
  const heightOf = (row: number) => yOf(row + 1) - yOf(row);
  const mapper: GridMapper = {
    x: xOf,
    y: yOf,
    width: widthOf,
    height: heightOf,
    backingScaleX,
    backingScaleY,
  };
  const beadPath = new Path2D();
  const colorPaths = new Map<string, Path2D>();
  let colorsAggregated = true;
  let beadCount = 0;
  for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      // 原代码此处实参顺序为 (grid, row, col, rows, cols)，逐字保留
      if (!isBeadCell(grid, row, col, rows, cols)) continue;
      beadCount++;
      const x = xOf(col);
      const y = yOf(row);
      const w = widthOf(col);
      const h = heightOf(row);
      beadPath.rect(x, y, w, h);
      if (!colorsAggregated) continue;
      const color = grid[row][col]!.color;
      let colorPath = colorPaths.get(color);
      if (!colorPath) {
        if (colorPaths.size >= 512) {
          colorsAggregated = false;
          colorPaths.clear();
          continue;
        }
        colorPath = new Path2D();
        colorPaths.set(color, colorPath);
      }
      colorPath.rect(x, y, w, h);
    }
  }
  if (config.showShadow) {
    const angleRad = (config.shadowAngle * Math.PI) / 180;
    const distance = config.shadowDistance;
    const minScale = Math.min(backingScaleX, backingScaleY);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 1.5 * distance * minScale;
    ctx.shadowOffsetX = Math.cos(angleRad) * distance * backingScaleX;
    ctx.shadowOffsetY = Math.sin(angleRad) * distance * backingScaleY;
    ctx.fillStyle = "#888";
    ctx.fill(beadPath);
    ctx.restore();
  }
  if (colorsAggregated) {
    for (const [color, path] of colorPaths) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
  } else {
    for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
      for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
        if (isBeadCell(grid, row, col, rows, cols)) {
          ctx.fillStyle = grid[row][col]!.color;
          ctx.fillRect(xOf(col), yOf(row), widthOf(col), heightOf(row));
        }
      }
    }
  }
  drawSurfaceTexture(ctx, grid, cols, rows, bounds, mapper, beadPath, beadCount, config.texture);
  if (config.roundedEdge) {
    drawRoundedEdges(ctx, grid, cols, rows, bounds, mapper, config);
  }
  // 品牌水印 + 站点签名
  {
    const bottomContentY = yOf(bounds.maxRow + 1 + effectSafeCells);
    const bottomMargin = Math.max(0, artOffsetY + artHeight - bottomContentY);
    const watermarkCenterY = bottomContentY + bottomMargin / 2;
    const centerX = artOffsetX + artWidth / 2;
    const bgIsDark = ((hex: string) => {
      const normalized = hex.replace("#", "");
      const r = parseInt(normalized.substring(0, 2), 16);
      return (299 * r + 587 * parseInt(normalized.substring(2, 4), 16) + 114 * parseInt(normalized.substring(4, 6), 16)) / 1000 < 128;
    })(config.backgroundColor);
    const brandOpacity = config.brandOpacity ?? 0.35;
    const fontSize = Math.min(0.22 * bottomMargin, 0.03 * artWidth, 24);
    if (fontSize >= 6) {
      ctx.save();
      ctx.textAlign = "center";
      const brandBaseline = watermarkCenterY - 0.8 * fontSize;
      if (config.brandText) {
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillStyle = bgIsDark ? `rgba(255,255,255,${brandOpacity})` : `rgba(0,0,0,${brandOpacity})`;
        ctx.fillText(config.brandText, centerX, brandBaseline, 0.82 * artWidth);
      }
      const siteBaseline = config.brandText ? brandBaseline + 1.6 * fontSize : watermarkCenterY;
      const siteFontSize = config.brandText ? 0.7 * fontSize : fontSize;
      ctx.font = `italic 300 ${siteFontSize}px "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = bgIsDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.3)";
      // TS lib 较旧版本无 letterSpacing 字段
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${0.15 * siteFontSize}px`;
      ctx.fillText("perlerbeads.zippland.com", centerX, siteBaseline, 0.82 * artWidth);
      ctx.restore();
    }
  }
}

/* —— 集成兼容别名（调用方命名 ↔ 本文件导出名）—— */
export { DEFAULT_EXPORT_CONFIG as DEFAULT_RENDER_CONFIG }; // page.tsx 调用名（原 i$）
