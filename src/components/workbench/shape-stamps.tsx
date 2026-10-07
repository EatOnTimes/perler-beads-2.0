import { useEffect, useMemo, useRef, useState } from "react";
// useDocumentStore定义于区域46 → ./stats-panel
import { useDocumentStore } from "./stats-panel";

export interface StickerTemplate {
  shape: string;
  style: string;
  color: string;
  size: number;
}

export interface StickerCell {
  key: string;
  color: string;
}

/** 格子坐标键 "row,col"
  * tv 使用，内联同源实现见 bits.tsx cellKey） */
function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** 亮色条纹变体（各通道 +255*0.3，封顶 255）
  * tv 内嵌匿名函数 */
function lightenStripeColor(hex: string, t: number): string {
  const raw = hex.replace("#", "");
  const r = Math.min(255, Math.round(parseInt(raw.substring(0, 2), 16) + 76.5));
  const g = Math.min(255, Math.round(parseInt(raw.substring(2, 4), 16) + 255 * t));
  const b = Math.min(255, Math.round(parseInt(raw.substring(4, 6), 16) + 255 * t));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** 生成印章像素映射（居中放置，越界部分丢弃；镂空=棋盘跳格，条纹=3 格斜向交替）
  */
export function buildStickerMask({
  gridWidth,
  gridHeight,
  template,
}: {
  gridWidth: number;
  gridHeight: number;
  template: StickerTemplate;
}): Map<string, StickerCell> {
  const { shape, style, color, size } = template;
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  switch (shape) {
    case "heart": {
      // 隐式方程 (x²+y²-1)³ - x²y³ ≤ 0，x=列、y=-行（心形尖朝下）
      const cx = (size - 1) / 2;
      const cy = (size - 1) / 2;
      const half = size / 2;
      for (let row = 0; row < size; row++)
        for (let col = 0; col < size; col++) {
          const x = (col - cx) / (0.5 * half);
          const y = -(row - cy) / (0.5 * half);
          if (Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y <= 0) mask[row][col] = true;
        }
      break;
    }
    case "star": {
      // 10 顶点五角星 + 射线法偶奇填充
      const cx = (size - 1) / 2;
      const cy = (size - 1) / 2;
      const outer = (size - 1) / 2;
      const inner = 0.38 * outer;
      const points: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? outer : inner;
        points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
      }
      for (let row = 0; row < size; row++)
        for (let col = 0; col < size; col++) {
          let inside = false;
          const count = points.length;
          for (let i = 0, j = count - 1; i < count; j = i++) {
            const [xi, yi] = points[i];
            const [xj, yj] = points[j];
            if (yi > row !== yj > row && col < ((xj - xi) * (row - yi)) / (yj - yi) + xi) {
              inside = !inside;
            }
          }
          if (inside) mask[row][col] = true;
        }
      break;
    }
    case "circle": {
      const cx = (size - 1) / 2;
      const cy = (size - 1) / 2;
      const radius = (size - 1) / 2;
      for (let row = 0; row < size; row++)
        for (let col = 0; col < size; col++) {
          const dx = col - cx;
          const dy = row - cy;
          if (dx * dx + dy * dy <= radius * radius) mask[row][col] = true;
        }
      break;
    }
    case "diamond": {
      const cx = (size - 1) / 2;
      const cy = (size - 1) / 2;
      const radius = (size - 1) / 2;
      for (let row = 0; row < size; row++)
        for (let col = 0; col < size; col++) {
          if (Math.abs(col - cx) + Math.abs(row - cy) <= radius) mask[row][col] = true;
        }
      break;
    }
  }
  const rowOffset = Math.floor((gridHeight - size) / 2);
  const colOffset = Math.floor((gridWidth - size) / 2);
  const result = new Map<string, StickerCell>();
  const baseCell: StickerCell = { key: "STK", color };
  const lightCell: StickerCell = {
    key: "STK",
    color: lightenStripeColor(color, 0.3),
  };
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      if (!mask[row][col] || (style === "lace" && (row + col) % 2 !== 0)) continue;
      const absRow = row + rowOffset;
      const absCol = col + colOffset;
      if (absRow < 0 || absRow >= gridHeight || absCol < 0 || absCol >= gridWidth) continue;
      if (style === "ribbon") {
        const stripe = Math.floor((row + col) / 3) % 2;
        result.set(cellKey(absRow, absCol), stripe === 0 ? baseCell : lightCell);
      } else result.set(cellKey(absRow, absCol), baseCell);
    }
  return result;
}

/** 印章形状选项
  */
export const STAMP_SHAPES = [
  { key: "heart", name: "爱心", icon: "♡" },
  { key: "star", name: "星星", icon: "★" },
  { key: "circle", name: "圆形", icon: "●" },
  { key: "diamond", name: "菱形", icon: "◆" },
] as const;

/** 印章风格选项
  */
export const STAMP_STYLES = [
  { key: "plain", name: "纯色" },
  { key: "lace", name: "镂空" },
  { key: "ribbon", name: "条纹" },
] as const;

/** 印章预设颜色
  */
export const STAMP_COLORS = [
  "#d97757",
  "#e8a48c",
  "#f5c6b3",
  "#FFB6C1",
  "#FF69B4",
  "#9370DB",
  "#6495ED",
  "#4ECDC4",
  "#45B7D1",
  "#2ECC71",
  "#F39C12",
  "#E74C3C",
  "#1a1a1a",
  "#666666",
  "#cccccc",
];

export interface ShapeStampsPanelProps {
  onClose: () => void;
  onApply: () => void;
  /** 编辑已有贴纸图层时传入其 id */
  editLayerId?: string | null;
}

/** 图形印章编辑面板（新增贴纸 / 编辑已选贴纸图层）
  */
export function ShapeStampsPanel({ onClose, onApply, editLayerId }: ShapeStampsPanelProps) {
  const document = useDocumentStore((s) => s.document);
  const addStickerLayer = useDocumentStore((s) => s.addStickerLayer);
  const updateStickerLayer = useDocumentStore((s) => s.updateStickerLayer);
  const initialTemplateRef = useRef<StickerTemplate | null>(null);

  if (editLayerId && !initialTemplateRef.current && document) {
    const layer = document.layers.find((l: any) => l.id === editLayerId);
    if (layer?.type === "sticker") initialTemplateRef.current = layer.template;
  }

  const isEdit = !!editLayerId;
  const initialTemplate = initialTemplateRef.current;
  const [shape, setShape] = useState<string>(initialTemplate?.shape ?? "heart");
  const [style, setStyle] = useState<string>(initialTemplate?.style ?? "plain");
  const [color, setColor] = useState<string>(initialTemplate?.color ?? "#d97757");
  const [size, setSize] = useState<number>(initialTemplate?.size ?? 15);
  const latestRef = useRef<any>({ editLayerId, updateStickerLayer, onApply, doc: document });
  latestRef.current = { editLayerId, updateStickerLayer, onApply, doc: document };

  useEffect(() => {
    const { editLayerId, updateStickerLayer, onApply, doc } = latestRef.current;
    if (!editLayerId || !doc) return;
    const template = { shape, style, color, size };
    const data = buildStickerMask({
      gridWidth: doc.grid.width,
      gridHeight: doc.grid.height,
      template,
    });
    updateStickerLayer(editLayerId, template, data);
    onApply();
  }, [shape, style, color, size]);

  const previewMask = useMemo(
    () =>
      isEdit
        ? new Map<string, StickerCell>()
        : buildStickerMask({
            gridWidth: 40,
            gridHeight: 40,
            template: { shape, style, color, size: Math.min(size, 38) },
          }),
    [isEdit, shape, style, color, size],
  );
  const previewCells = useMemo(() => {
    const cells: { row: number; col: number; color: string }[] = [];
    previewMask.forEach((cell, key) => {
      const commaIndex = key.indexOf(",");
      cells.push({
        row: +key.slice(0, commaIndex),
        col: +key.slice(commaIndex + 1),
        color: cell.color,
      });
    });
    return cells;
  }, [previewMask]);

  return (
    <div className="flex flex-col gap-3">
      {!isEdit && (
        <div className="flex justify-center">
          <div
            className="relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
            style={{ width: 160, height: 160 }}
          >
            {previewCells.map((cell, index) => (
              <div
                key={index}
                className="absolute"
                style={{
                  left: 4 * cell.col,
                  top: 4 * cell.row,
                  width: 4,
                  height: 4,
                  backgroundColor: cell.color,
                }}
              />
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">形状</div>
        <div className="grid grid-cols-4 gap-1.5">
          {STAMP_SHAPES.map((option) => (
            <button
              key={option.key}
              onClick={() => setShape(option.key)}
              className={`py-2 text-center rounded-lg border text-sm transition-colors ${
                shape === option.key
                  ? "bg-gray-900 text-gray-50 border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 active:bg-gray-200 dark:active:bg-gray-700"
              }`}
            >
              <span className="text-lg leading-none">{option.icon}</span>
              <div className="text-[10px] mt-0.5">{option.name}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">风格</div>
        <div className="grid grid-cols-3 gap-1.5">
          {STAMP_STYLES.map((option) => (
            <button
              key={option.key}
              onClick={() => setStyle(option.key)}
              className={`py-2 px-3 text-xs rounded-lg border transition-colors ${
                style === option.key
                  ? "bg-gray-900 text-gray-50 border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 active:bg-gray-200 dark:active:bg-gray-700"
              }`}
            >
              {option.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">颜色</div>
        <div className="flex flex-wrap gap-1.5">
          {STAMP_COLORS.map((preset) => (
            <button
              key={preset}
              onClick={() => setColor(preset)}
              className={`w-7 h-7 rounded-lg border-2 transition-all ${
                color === preset
                  ? "border-gray-900 dark:border-gray-100 scale-110"
                  : "border-transparent"
              }`}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 mb-1">
          <span>大小</span>
          <span className="tabular-nums">{size}</span>
        </div>
        <input
          type="range"
          min={5}
          max={Math.min(60, document ? Math.min(document.grid.width, document.grid.height) : 60)}
          step={1}
          value={size}
          onChange={(e) => setSize(+e.target.value)}
          className="w-full accent-brand-500"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onClose}
          className="flex-1 py-2 text-xs rounded-lg bg-white/45 dark:bg-white/10 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/15 transition-colors"
        >
          {isEdit ? "收起" : "取消"}
        </button>
        <button
          onClick={() => {
            if (!document) return;
            if (isEdit) return void onClose();
            const template = { shape, style, color, size };
            const data = buildStickerMask({
              gridWidth: document.grid.width,
              gridHeight: document.grid.height,
              template,
            });
            const shapeName = STAMP_SHAPES.find((option) => option.key === shape)?.name ?? "贴纸";
            addStickerLayer(`贴纸·${shapeName}`, template, data);
            onApply();
            onClose();
          }}
          disabled={!document}
          className="flex-1 py-2 text-xs rounded-lg bg-gray-900 text-gray-50 active:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {isEdit ? "完成" : "添加贴纸"}
        </button>
      </div>
    </div>
  );
}
