"use client";
// 极小共享函数/常量/小组件合集（各代理按需追加，一律具名导出）
// ── 代理 E 追加：区域24/25/22/21/17/51 的小函数与小组件 ──
// ── 代理 J 追加：区域06/07/12(J)/13/15/18/19/20/32/34~45/56~78 的工具函数/小组件/常量
// 跨模块引用（集成时对齐实际导出名）：
// e0 = r(7258) → hexToRgb @ utils/canvas-ops.ts
// M  = r(1866) → getMardColorHexMap @ utils/color-system.ts
// tx→ 主编辑器 persist store，定义于区域47
import { Fragment, useEffect, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PrivacyNoticeModal } from "./privacy-notice";
// 定制：CommunitySupportModal 已按需求移除挂载（community-support.tsx 保留共享控件导出）
// TODO(集成): 以下三个 import 目标文件由其他代理产出，名称如有出入请机械替换
import { ERASE_KEY, ERASE_CELL } from "@/utils/bundle-misc";
import { hexToRgb } from "@/utils/canvas-ops";
import { getMardColorHexMap } from "@/utils/color-system";
// 主编辑器 store位于 ./stats-panel；为避免 bits ↔ stats-panel 循环引用，
// 水合监听采用注册模式：stats-panel 加载后调用 registerStoreHydration 注入。
import type {
  BootAction,
  BootStatus,
  CellBounds,
  CellChange,
  CellMap,
  CellPos,
  ClipboardBuffer,
  EditorLayer,
  FocusGridDimensions,
  FocusSessionState,
  GridSize,
  PaintTool,
  PanelCategory,
  PaletteColor,
  PixelCell,
  PixelGrid,
} from "@/types";

/** 格式化累计耗时（秒 → "Xh Ym" / "Xm Ys"）
  */
export function formatElapsedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${totalSeconds % 60}s`;
}

/** 今日日期字符串（"YYYY.MM.DD"）
  */
export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/** 打卡图样式键列表
   */
export const CARD_STYLE_KEYS = ["magazine", "cute", "film"] as const;
export type CardStyle = (typeof CARD_STYLE_KEYS)[number];

/** 打卡图样式显示名
   */
export const CARD_STYLE_LABELS: Record<CardStyle, string> = {
  magazine: "简白",
  cute: "手账",
  film: "胶片",
};

/** 移动端"更多操作"下拉菜单项按钮
  */
export function DropdownMenuItem({
  children,
  onClick,
  disabled,
  accent,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "w-full px-3 py-2.5 min-h-[44px] text-sm text-left flex items-center transition-colors " +
        (disabled
          ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
          : accent
            ? "text-brand-500 active:bg-brand-50 dark:active:bg-brand-900/20"
            : "text-gray-700 dark:text-gray-200 active:bg-white/50 dark:active:bg-white/10")
      }
    >
      {children}
    </button>
  );
}

/** 数值夹取（min~max）
  */
export function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 由拖拽起止两格归一化为矩形选区（含端点）
  */
export function normalizeSelectionRect(
  a: { row: number; col: number },
  b: { row: number; col: number },
): { rowStart: number; rowEnd: number; colStart: number; colEnd: number } {
  return {
    rowStart: Math.min(a.row, b.row),
    rowEnd: Math.max(a.row, b.row),
    colStart: Math.min(a.col, b.col),
    colEnd: Math.max(a.col, b.col),
  };
}

/** 扩画布时按锚点计算新增量偏移（start=0 / center=一半 / end=全部）
  */
export function anchorToOffset(delta: number, anchor: "start" | "center" | "end"): number {
  return anchor === "start" ? 0 : anchor === "end" ? delta : Math.floor(delta / 2);
}

/** 画布尺寸输入夹取（当前值~300，四舍五入）
  */
export function clampGridSize(value: number, current: number): number {
  return Math.max(current, Math.min(300, Math.round(value)));
}

/** 画布内容锚点：水平方向候选
  */
export const ANCHOR_COLUMNS = ["left", "center", "right"] as const;

/** 画布内容锚点：垂直方向候选
  */
export const ANCHOR_ROWS = ["top", "middle", "bottom"] as const;

/** 分段选择器（扩大/缩小、处理模式等单选按钮组；columns 时为网格布局）
  */
export function SegmentedControl({
  value,
  onChange,
  options,
  columns,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  columns?: number;
  className?: string;
}) {
  const isGrid = typeof columns === "number";
  return (
    <div
      className={`gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl ${isGrid ? "grid" : "flex"} ${className}`}
      style={isGrid ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`${isGrid ? "" : "flex-1"} min-h-[44px] py-2 px-1 text-[13px] rounded-[10px] transition-all ${
              active
                ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100 font-medium"
                : "text-gray-500 dark:text-gray-400 active:bg-gray-200/50 dark:active:bg-gray-700/50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 开关轨道（纯视觉，无交互）
  */
export function ToggleTrack({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      className={`relative inline-block w-11 h-[26px] rounded-full transition-colors flex-shrink-0 ${
        checked ? "bg-accent-green" : "bg-gray-300 dark:bg-gray-600"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <span
        className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-[3px]"
        }`}
      />
    </span>
  );
}

/** 开关行（有 label 为整行按钮，无 label 为居中按钮）
  */
export function ToggleRow({
  checked,
  onChange,
  label,
  disabled,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return label ? (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`w-full flex items-center justify-between gap-3 min-h-[44px] text-left ${className}`}
    >
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      <ToggleTrack checked={checked} disabled={disabled} />
    </button>
  ) : (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`flex items-center justify-center min-h-[44px] ${className}`}
    >
      <ToggleTrack checked={checked} disabled={disabled} />
    </button>
  );
}

/** 滑杆行（label + range + 数值展示）
  */
export function SliderRow({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  format,
  accent = "brand",
  className = "",
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  format?: (value: number) => string;
  accent?: "brand" | "green";
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 min-h-[44px] ${className}`}>
      {label && (
        <span className="text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">{label}</span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`h-11 flex-1 cursor-pointer rounded-full bg-transparent ${
          accent === "green" ? "accent-accent-green" : "accent-brand-500"
        }`}
      />
      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums text-right min-w-[2.5rem]">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

/** 数字输入行（label/help + number input，隐藏步进按钮）
  */
export function NumberField({
  label,
  help,
  value,
  onChange,
  min,
  max,
  className = "",
}: {
  label?: string;
  help?: string;
  value: string | number; // 集成放宽：settings-panel 等直接传数字状态
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 min-h-[44px] ${className}`}>
      {label && (
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</div>
          {help && <div className="text-[11px] text-gray-500 dark:text-gray-400">{help}</div>}
        </div>
      )}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        className="min-h-[44px] w-20 flex-shrink-0 text-sm text-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-2 text-gray-700 dark:text-gray-200 outline-none focus:border-brand-500 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  );
}

/** 手动工具标题（工具面板分区标题用）
  */
export const TOOL_TITLES: Record<string, string> = {
  brush: "画笔",
  eraser: "橡皮",
  picker: "取色",
  fill: "填充",
  line: "直线",
  rect: "矩形",
  select: "选区",
  drag: "拖拽",
  paste: "粘贴",
};

/** 工具说明小字段落
  */
export function HintText({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 dark:text-gray-500 py-1">{text}</p>;
}

/** 笔刷大小/镜像控制（画笔/直线/矩形/橡皮共用）
  */
export function BrushControls({
  size,
  setSize,
  mirrorX,
  setMirrorX,
  mirrorY,
  setMirrorY,
}: {
  size: number;
  setSize: (size: number) => void;
  mirrorX?: boolean;
  setMirrorX?: (value: boolean) => void;
  mirrorY?: boolean;
  setMirrorY?: (value: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <SliderRow label="笔刷大小" min={1} max={7} step={1} value={size} onChange={setSize} />
      {setMirrorX && setMirrorY && (
        <>
          <ToggleRow label="水平镜像" checked={!!mirrorX} onChange={setMirrorX} />
          <ToggleRow label="垂直镜像" checked={!!mirrorY} onChange={setMirrorY} />
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ── 代理 J 部分：未列入映射表大表的小区域（03~78）──
// ════════════════════════════════════════════════════════════

// ============================================================
// 一、通用工具 / 颜色工具
// ============================================================

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// RGB 三元组转 "#rrggbb"）
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// "#rrggbb" 转 [r,g,b]，不匹配返回 null）
export function hexToRgbArray(hex: string): [number, number, number] | null {
  const m = hex
    .replace(/^#/, "")
    .match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : null;
}

// HSL(h, s%, l%) 转 [r,g,b]，HSL 取色器用）
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  const lightness = l / 100;
  const sat = (s / 100) * lightness;
  const c = sat * (1 - Math.abs((h / 60) % 2 - 1));
  const m = lightness - sat;
  if (h < 60) [r, g, b] = [sat, c, 0];
  else if (h < 120) [r, g, b] = [c, sat, 0];
  else if (h < 180) [r, g, b] = [0, sat, c];
  else if (h < 240) [r, g, b] = [0, c, sat];
  else if (h < 300) [r, g, b] = [c, 0, sat];
  else [r, g, b] = [sat, 0, c];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// 在画布上绘制四角 L 形定位标记与四边中点刻度，带黑色描边；图片对齐/预览网格角标用）
export function drawGridCornerMarks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  cornerSize: number,
  lineWidth: number
): void {
  ctx.lineCap = "round";
  const corners: Array<[number, number, number, number, number, number]> = [
    // [角点x, 角点y, 沿边1x, 沿边1y, 沿边2x, 沿边2y]
    [x, y, x + cornerSize, y, x, y + cornerSize],
    [x + width, y, x + width - cornerSize, y, x + width, y + cornerSize],
    [x, y + height, x + cornerSize, y + height, x, y + height - cornerSize],
    [x + width, y + height, x + width - cornerSize, y + height, x + width, y + height - cornerSize],
  ];
  const halfTick = Math.min(0.6 * cornerSize, 16);
  const midTicks: Array<[number, number, number, number]> = [
    [x + width / 2 - halfTick, y, x + width / 2 + halfTick, y],
    [x + width / 2 - halfTick, y + height, x + width / 2 + halfTick, y + height],
    [x, y + height / 2 - halfTick, x, y + height / 2 + halfTick],
    [x + width, y + height / 2 - halfTick, x + width, y + height / 2 + halfTick],
  ];
  // 黑色描边层
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = lineWidth + 3;
  for (const [ax, ay, bx, by, cx, cy] of corners) {
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ax, ay);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }
  ctx.lineWidth = 0.75 * lineWidth + 2;
  for (const [ax, ay, bx, by] of midTicks) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  // 彩色主体层
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  for (const [ax, ay, bx, by, cx, cy] of corners) {
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ax, ay);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }
  ctx.lineWidth = 0.75 * lineWidth;
  for (const [ax, ay, bx, by] of midTicks) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
}

// 的同实现已由代理 E 导出为 anchorToOffset（见文件上方），此处不重复

// ============================================================
// 二、面板 UI 小组件（折叠卡片 / 面板堆栈 / 弹窗组合 / 探针）
// ============================================================

interface PanelCardProps {
  title?: string;
  /** 标题下方的小字说明 */
  help?: string;
  /** 标题行右侧的附加控件 */
  trailing?: ReactNode;
  /** 是否可折叠 */
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children?: ReactNode;
}

// 右侧栏圆角卡片容器：可折叠标题行/说明文字/尾部控件，供 PanelStack 与各面板使用）
export const PanelCard = ({
  title,
  help,
  trailing,
  collapsible = false,
  defaultOpen = true,
  className = "",
  children,
}: PanelCardProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = !collapsible || open;
  const showHeader = !!title || !!trailing;
  const headerInner = (
    <>
      {collapsible && (
        <svg
          className={
            "w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-transform " +
            (open ? "" : "-rotate-90")
          }
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      )}
      {title && (
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
          {title}
        </h3>
      )}
    </>
  );
  return (
    <div
      className={
        "rounded-xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-white/5 " +
        className
      }
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex items-center gap-2 min-w-0 flex-1 text-left"
            >
              {headerInner}
            </button>
          ) : (
            <div className="flex items-center gap-2 min-w-0 flex-1">{headerInner}</div>
          )}
          {trailing && <div className="flex-shrink-0">{trailing}</div>}
        </div>
      )}
      {expanded && (
        <div className={showHeader ? "px-4 pb-4" : "p-4"}>
          {help && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">{help}</p>
          )}
          {children}
        </div>
      )}
    </div>
  );
};

interface PanelStackProps {
  categories: PanelCategory[];
  footer?: ReactNode;
  width?: number;
  /** 切换 key，变化时触发 animate-mode-fade 重放动画 */
  fadeKey?: string | number;
}

// 右侧浮动面板堆栈容器：按 categories 渲染折叠卡片/裸内容，模式切换时淡入）
export function PanelStack({ categories, footer, width = 320, fadeKey }: PanelStackProps) {
  return (
    <div
      style={{ width }}
      className="absolute top-2 bottom-2 right-3 z-30 flex flex-col rounded-2xl overflow-hidden bg-white/55 dark:bg-gray-900/50 backdrop-blur-2xl backdrop-saturate-[1.8] border border-white/50 dark:border-white/10 shadow-2xl"
    >
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        <div className="animate-mode-fade flex flex-col gap-3">
          {categories.map((category) =>
            category.bare ? (
              <Fragment key={category.id}>{category.content}</Fragment>
            ) : (
              <PanelCard
                key={category.id}
                title={category.label}
                collapsible
                defaultOpen
                trailing={category.quickControls}
              >
                {category.content}
              </PanelCard>
            )
          )}
        </div>
        {footer}
      </div>
    </div>
  );
}

// 隐私声明 + 社区支持弹窗组合，供「关于」等入口一次挂载）
// 定制：社区与支持卡片（CommunitySupportModal）已按需求移除
export function PrivacyAndSupportModals({
  onOpenDonation: _onOpenDonation,
}: {
  onOpenDonation?: () => void;
}) {
  return (
    <>
      <PrivacyNoticeModal />
    </>
  );
}

// 隐形探针组件：读取 ?gallery= 查询参数并回调，用于画廊分享进入流程）
export function GalleryParamProbe({
  onParam,
}: {
  onParam: (value: string | null) => void;
}) {
  const galleryParam = useSearchParams().get("gallery");
  useEffect(() => {
    onParam(galleryParam);
  }, [galleryParam, onParam]);
  return null;
}

// ============================================================
// 三、格子键 / 图层数据结构工具
// ============================================================

// 格子坐标 → Map 键 "row,col"）
export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

// Map 键 "row,col" → 格子坐标）
export function parseCellKey(key: string): CellPos {
  const comma = key.indexOf(",");
  return { row: +key.slice(0, comma), col: +key.slice(comma + 1) };
}

// 从图层数据 Map 中删除指定格）
export function deleteCellAt(map: CellMap, row: number, col: number): void {
  map.delete(cellKey(row, col));
}

// 创建空图层数据 Map）
export function createCellMap(): CellMap {
  return new Map();
}

// 像素网格 → 图层数据 Map：跳过空格/外部参考格/ERASE，仅保留有效绘制内容）
export function gridToCellMap(grid: PixelGrid): CellMap {
  const map: CellMap = new Map();
  for (let row = 0; row < grid.length; row++) {
    const rowCells = grid[row];
    for (let col = 0; col < rowCells.length; col++) {
      const cell = rowCells[col];
      if (cell && !cell.isExternal && cell.key !== ERASE_KEY) {
        map.set(cellKey(row, col), { key: cell.key, color: cell.color });
      }
    }
  }
  return map;
}

// "#rrggbb" → [r,g,b]，不校验格式）
export function parseHexColor(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ];
}

// 两个 hex 颜色按比例混合，图层透明度合成用）
export function mixHexColors(fromHex: string, toHex: string, ratio: number): string {
  const [r1, g1, b1] = parseHexColor(fromHex);
  const [r2, g2, b2] = parseHexColor(toHex);
  return (
    "#" +
    [
      r1 * (1 - ratio) + r2 * ratio,
      g1 * (1 - ratio) + g2 * ratio,
      b1 * (1 - ratio) + b2 * ratio,
    ]
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

/** * 将可见像素图层按透明度自下而上合成 */
function composeVisibleLayers(layers: EditorLayer[]): CellMap {
  const flat: CellMap = new Map();
  for (const layer of layers) {
    if (!layer.visible || layer.type === "image") continue;
    const data = layer.data;
    if (!data) continue;
    // 集成空值防护：图层 opacity 运行时恒有值，缺省按不透明处理
    const opacity = layer.opacity ?? 1;
    if (opacity <= 0) continue;
    if (opacity >= 1) {
      data.forEach((value, key) => {
        flat.set(key, value);
      });
    } else {
      data.forEach((value, key) => {
        const below = flat.get(key);
        if (below) {
          flat.set(key, {
            key: below.key,
            color: mixHexColors(below.color, value.color, opacity),
          });
        } else {
          flat.set(key, { ...value, color: mixHexColors("#ffffff", value.color, opacity) });
        }
      });
    }
  }
  return flat;
}

// 文档图层合成 → 像素网格：按透明度混合后铺到 ERASE 底格上）
export function flattenLayersToGrid(layers: EditorLayer[], size: GridSize): PixelGrid {
  const flat = composeVisibleLayers(layers);
  const { width, height } = size;
  const grid: PixelGrid = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      key: ERASE_KEY,
      color: "#FFFFFF",
      isExternal: true,
    }))
  );
  flat.forEach((cell, key) => {
    const { row, col } = parseCellKey(key);
    if (row >= 0 && row < height && col >= 0 && col < width) {
      grid[row][col] = { key: cell.key, color: cell.color, isExternal: false };
    }
  });
  return grid;
}

/** * 操作 id 计数器 */
let opIdCounter = 0;

export function nextOpId(): number {
  return (opIdCounter += 1);
}

// 将变更批次应用到图层数据 Map：after 非空则写入，否则删除）
export function applyCellChanges(map: CellMap, batch: { changes: CellChange[] }): void {
  for (const change of batch.changes) {
    if (change.after) {
      map.set(cellKey(change.row, change.col), change.after);
    } else {
      deleteCellAt(map, change.row, change.col);
    }
  }
}

// 撤销/重做历史栈：push 清空 redo，容量上限默认 100）
export class HistoryStack<T = CellChange[]> {
  undoStack: T[] = [];
  redoStack: T[] = [];
  limit: number;

  constructor(limit = 100) {
    this.limit = limit;
  }

  push(entry: T): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  popUndo(): T | undefined {
    const entry = this.undoStack.pop();
    if (entry) this.redoStack.push(entry);
    return entry;
  }

  popRedo(): T | undefined {
    const entry = this.redoStack.pop();
    if (entry) this.undoStack.push(entry);
    return entry;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  inspect(): { undoCount: number; redoCount: number; limit: number } {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      limit: this.limit,
    };
  }
}

/** * 唯一 id 递增计数器 */
let uidCounter = 0;

// 格子 → 可绘制快照 {key,color}；空格/外部格/ERASE 返回 null，用于变更前后快照）
export function snapshotCell(cell: { key: string; color: string; isExternal?: boolean } | undefined): {
  key: string;
  color: string;
} | null {
  return !cell || cell.isExternal || cell.key === ERASE_KEY
    ? null
    : { key: cell.key, color: cell.color };
}

// 生成 `前缀_自增_时间36进制` 唯一 id，图层/文档 id 用）
export function createUniqueId(prefix: string): string {
  return `${prefix}_${++uidCounter}_${Date.now().toString(36)}`;
}

// JSON.stringify replacer：Map → {__t:"Map", d:[...entries]}，store 持久化序列化用）
export function mapReplacer(_key: string, value: unknown): unknown {
  return value instanceof Map ? { __t: "Map", d: Array.from(value.entries()) } : value;
}

// ============================================================
// 四、编辑器绘制几何工具（直线/笔刷/镜像/矩形/剪贴板/泛洪）
// ============================================================

export function normalizeCellRange(a: CellPos, b: CellPos): CellBounds {
  return {
    rowStart: Math.min(a.row, b.row),
    rowEnd: Math.max(a.row, b.row),
    colStart: Math.min(a.col, b.col),
    colEnd: Math.max(a.col, b.col),
  };
}

// Bresenham 直线算法：两坐标间的整点格子序列）
export function bresenhamLine(from: CellPos, to: CellPos): CellPos[] {
  const cells: CellPos[] = [];
  let col = from.col;
  let row = from.row;
  const endCol = to.col;
  const endRow = to.row;
  const dx = Math.abs(endCol - col);
  const dy = Math.abs(endRow - row);
  const stepCol = col < endCol ? 1 : -1;
  const stepRow = row < endRow ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    cells.push({ row, col });
    if (col === endCol && row === endRow) break;
    const nextErr = 2 * err;
    if (nextErr > -dy) {
      err -= dy;
      col += stepCol;
    }
    if (nextErr < dx) {
      err += dx;
      row += stepRow;
    }
  }
  return cells;
}

// 笔刷覆盖足迹：以中心格为方阵中心、半径 floor(size/2)，越界裁剪）
export function brushFootprint(
  center: CellPos,
  brushSize: number,
  dims: FocusGridDimensions
): CellPos[] {
  const radius = Math.max(0, Math.floor(brushSize / 2));
  const cells: CellPos[] = [];
  for (let row = center.row - radius; row <= center.row + radius; row += 1) {
    if (row < 0 || row >= dims.M) continue;
    for (let col = center.col - radius; col <= center.col + radius; col += 1) {
      if (col < 0 || col >= dims.N) continue;
      cells.push({ row, col });
    }
  }
  return cells;
}

// 对称扩展格子集合：按水平/垂直镜像（及中心对称）补全并去重）
export function mirrorCells(
  cells: CellPos[],
  dims: FocusGridDimensions,
  mirrorX: boolean,
  mirrorY: boolean
): CellPos[] {
  if (!mirrorX && !mirrorY) return cells;
  const seen = new Map<string, CellPos>();
  const add = (row: number, col: number) => {
    if (row < 0 || row >= dims.M || col < 0 || col >= dims.N) return;
    seen.set(`${row},${col}`, { row, col });
  };
  cells.forEach((cell) => {
    add(cell.row, cell.col);
    if (mirrorX) add(cell.row, dims.N - 1 - cell.col);
    if (mirrorY) add(dims.M - 1 - cell.row, cell.col);
    if (mirrorX && mirrorY) add(dims.M - 1 - cell.row, dims.N - 1 - cell.col);
  });
  return Array.from(seen.values());
}

// 把一组格子写入像素网格：仅拷贝受影响行，ERASE 色自动标记 isExternal）
export function paintCellsOnGrid(
  grid: PixelGrid,
  cells: CellPos[],
  cell: { key: string; color: string; isExternal?: boolean }
): PixelGrid {
  const affectedRows = new Set<number>();
  cells.forEach((c) => affectedRows.add(c.row));
  const next = grid.map((row, rowIndex) =>
    affectedRows.has(rowIndex) ? row.map((c) => ({ ...c } as PixelCell)) : row
  );
  cells.forEach((c) => {
    const { row, col } = c;
    if (next[row]?.[col]) {
      next[row][col] = {
        key: cell.key,
        color: cell.color,
        isExternal: cell.isExternal ?? cell.key === ERASE_KEY,
      };
    }
  });
  return next;
}

// 把选择框范围内格子全部置为空格 ERASE，移动/删除选择内容前清场用）
export function eraseRectOnGrid(grid: PixelGrid, bounds: CellBounds): PixelGrid {
  const affectedRows = new Set<number>();
  for (let row = bounds.rowStart; row <= bounds.rowEnd; row += 1) affectedRows.add(row);
  const next = grid.map((row, rowIndex) =>
    affectedRows.has(rowIndex) ? row.map((c) => ({ ...c } as PixelCell)) : row
  );
  for (let row = bounds.rowStart; row <= bounds.rowEnd; row += 1) {
    for (let col = bounds.colStart; col <= bounds.colEnd; col += 1) {
      if (next[row]?.[col]) {
        next[row][col] = { ...ERASE_CELL };
      }
    }
  }
  return next;
}

// 从网格中提取选择框内容 → 剪贴板图块 {pixels,width,height}，缺失格补 ERASE）
export function extractRectFromGrid(grid: PixelGrid, bounds: CellBounds): ClipboardBuffer {
  const rows = bounds.rowEnd - bounds.rowStart + 1;
  const cols = bounds.colEnd - bounds.colStart + 1;
  return {
    pixels: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const cell = grid[bounds.rowStart + r]?.[bounds.colStart + c];
        return cell ? { ...cell } : { ...ERASE_CELL };
      })
    ),
    width: cols,
    height: rows,
  };
}

// 把剪贴板图块盖章到网格指定锚点，越界裁剪，浅拷贝受影响行）
export function stampBufferOnGrid(
  grid: PixelGrid,
  buffer: ClipboardBuffer,
  anchor: CellPos,
  dims: FocusGridDimensions
): PixelGrid {
  const affectedRows = new Set<number>();
  for (let i = 0; i < buffer.height; i += 1) {
    const row = anchor.row + i;
    if (row >= 0 && row < dims.M) affectedRows.add(row);
  }
  const next = grid.map((row, rowIndex) =>
    affectedRows.has(rowIndex) ? row.map((c) => ({ ...c } as PixelCell)) : row
  );
  for (let i = 0; i < buffer.height; i += 1) {
    for (let j = 0; j < buffer.width; j += 1) {
      const row = anchor.row + i;
      const col = anchor.col + j;
      if (row < 0 || row >= dims.M || col < 0 || col >= dims.N) continue;
      const cell = buffer.pixels[i]?.[j];
      if (cell) {
        next[row][col] = {
          key: cell.key,
          color: cell.color,
          isExternal: !!cell.isExternal,
        };
      }
    }
  }
  return next;
}

// 同色连通区域橡皮擦：从起点泛洪清除同 key 格子为 ERASE）
export function floodEraseCells(
  grid: PixelGrid,
  row: number,
  col: number,
  key: string,
  dims: FocusGridDimensions
): PixelGrid {
  const next = grid.map((r) => r.map((c) => ({ ...c } as PixelCell)));
  const visited = Array(dims.M)
    .fill(null)
    .map(() => Array(dims.N).fill(false));
  const stack: CellPos[] = [{ row, col }];
  while (stack.length > 0) {
    const { row: r, col: c } = stack.pop()!;
    if (r < 0 || r >= dims.M || c < 0 || c >= dims.N || visited[r][c]) continue;
    const cell = next[r][c];
    if (cell && !cell.isExternal && cell.key === key) {
      visited[r][c] = true;
      next[r][c] = { ...ERASE_CELL };
      stack.push(
        { row: r - 1, col: c },
        { row: r + 1, col: c },
        { row: r, col: c - 1 },
        { row: r, col: c + 1 }
      );
    }
  }
  return next;
}

/** * 矩形工具覆盖格 */
function rectStrokeCells(from: CellPos, to: CellPos, filled: boolean): CellPos[] {
  const bounds = normalizeCellRange(from, to);
  const cells: CellPos[] = [];
  for (let row = bounds.rowStart; row <= bounds.rowEnd; row += 1) {
    for (let col = bounds.colStart; col <= bounds.colEnd; col += 1) {
      if (
        filled ||
        row === bounds.rowStart ||
        row === bounds.rowEnd ||
        col === bounds.colStart ||
        col === bounds.colEnd
      ) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

// 直线/矩形工具笔画格集合：形状 → 笔刷足迹展开 → 对称镜像）
export function shapeStrokeCells(
  tool: "line" | "rect",
  from: CellPos,
  to: CellPos,
  brushSize: number,
  filled: boolean,
  dims: FocusGridDimensions,
  mirrorX: boolean,
  mirrorY: boolean
): CellPos[] {
  const shape =
    tool === "line" ? bresenhamLine(from, to) : rectStrokeCells(from, to, filled);
  return mirrorCells(
    shape.flatMap((cell) => brushFootprint(cell, brushSize, dims)),
    dims,
    mirrorX,
    mirrorY
  );
}

// 画笔/橡皮拖动笔画格集合：单点或直线 → 笔刷足迹 → 对称镜像）
export function brushStrokeCells(
  from: CellPos | null,
  to: CellPos,
  brushSize: number,
  dims: FocusGridDimensions,
  mirrorX: boolean,
  mirrorY: boolean
): CellPos[] {
  const line =
    from && from.row === to.row && from.col === to.col
      ? [to]
      : bresenhamLine(from ?? to, to);
  return mirrorCells(
    line.flatMap((cell) => brushFootprint(cell, brushSize, dims)),
    dims,
    mirrorX,
    mirrorY
  );
}

// 区域内（键盘按键 → 编辑器工具映射，b画笔/e橡皮/i取色/f填充/l直线/r矩形/s框选/h拖移）
export const TOOL_KEYS_EDITOR: Record<string, PaintTool> = {
  b: "brush",
  e: "eraser",
  i: "picker",
  f: "fill",
  l: "line",
  r: "rect",
  s: "select",
  h: "drag",
};

// 剪贴板图块的落点边界框，粘贴预览高亮用）
export function clipboardToBounds(
  anchor: CellPos,
  clipboard: { width: number; height: number }
): CellBounds {
  return {
    rowStart: anchor.row,
    rowEnd: anchor.row + clipboard.height - 1,
    colStart: anchor.col,
    colEnd: anchor.col + clipboard.width - 1,
  };
}

// 同色连通区域收集：从起点泛洪收集同 color 的非外部格坐标，批量换色/擦除用）
export function collectSameColorRegion(
  grid: PixelGrid,
  row: number,
  col: number,
  color: string
): CellPos[] {
  if (!grid || !grid[row] || !grid[row][col]) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = Array(rows)
    .fill(null)
    .map(() => Array(cols).fill(false));
  const region: CellPos[] = [];
  const stack: CellPos[] = [{ row, col }];
  while (stack.length > 0) {
    const { row: r, col: c } = stack.pop()!;
    if (r < 0 || r >= rows || c < 0 || c >= cols || visited[r][c]) continue;
    const cell = grid[r][c];
    if (cell && !cell.isExternal && cell.color === color) {
      visited[r][c] = true;
      region.push({ row: r, col: c });
      stack.push(
        { row: r - 1, col: c },
        { row: r + 1, col: c },
        { row: r, col: c - 1 },
        { row: r, col: c + 1 }
      );
    }
  }
  return region;
}

// 判断一组格子是否全部存在于 cellKey 集合中，专注模式推荐区域完成校验用）
export function everyCellInSet(cells: CellPos[], keySet: Set<string>): boolean {
  return cells.every(({ row, col }) => keySet.has(`${row},${col}`));
}

// 格子集合质心（行列均值取整），专注模式「就近推荐」目标格计算用）
export function cellsCentroid(cells: CellPos[]): CellPos {
  if (cells.length === 0) return { row: 0, col: 0 };
  const rowSum = cells.reduce((acc, c) => acc + c.row, 0);
  const colSum = cells.reduce((acc, c) => acc + c.col, 0);
  return { row: Math.floor(rowSum / cells.length), col: Math.floor(colSum / cells.length) };
}

// 两格子坐标是否相同）
export function isSameCell(a: CellPos | null, b: CellPos | null): boolean {
  return !a && !b ? true : !!a && !!b ? a.row === b.row && a.col === b.col : false;
}

// 两个格子坐标数组是否逐项相同，推荐区域是否变化判断用）
export function areSameCells(a: CellPos[] | null, b: CellPos[] | null): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].row !== b[i].row || a[i].col !== b[i].col) return false;
  }
  return true;
}

// ============================================================
// 五、专注拼豆模式 / 导入导出 / 启动与存储
// ============================================================

// 专注拼豆模式会话初始状态工厂（useState 惰性初始化用））
export function createFocusSessionState(): FocusSessionState {
  return {
    currentColor: "",
    selectedCell: null,
    canvasScale: 1,
    canvasOffset: { x: 0, y: 0 },
    completedCells: new Set(),
    colorProgress: {},
    recommendedRegion: null,
    recommendedCell: null,
    guidanceMode: "nearest",
    showColorPanel: false,
    isPaused: false,
    startTime: Date.now(),
    totalElapsedTime: 0,
    lastResumeTime: Date.now(),
    gridSectionInterval: 10,
    showSectionLines: true,
    sectionLineColor: "#007acc",
    enableCelebration: true,
    showCelebration: false,
    showCompletionCard: false,
    completionCardDismissed: false,
  };
}

// 按格子数计算导出画布边长：≤100 格用下限，否则随规模放大并受屏宽约束）
export function computeExportCanvasSize(cellCount: number, minSize = 500): number {
  if (cellCount <= 100) return minSize;
  const byDensity = Math.min(
    Math.min(1200, 0.9 * window.innerWidth),
    Math.max(minSize, 6 * cellCount)
  );
  return Math.max(byDensity, 4 * cellCount);
}

// 允许的图片 MIME 类型集合，文件导入校验用）
export const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

// 允许的图片扩展名集合）
export const IMAGE_FILE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

// 允许的 CSV MIME 类型集合，色板 CSV 导入用）
export const CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);

// 按扩展名 + MIME 判断上传文件类型：csv / image / null）
export function detectFileType(file: {
  name: string;
  type: string;
}): "csv" | "image" | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type.toLowerCase();
  if (ext === "csv" || CSV_MIME_TYPES.has(mime)) return "csv";
  if (IMAGE_FILE_EXTENSIONS.has(ext) || IMAGE_MIME_TYPES.has(mime)) return "image";
  return null;
}

// localStorage 键：自定义色板选择）
export const CUSTOM_PALETTE_STORAGE_KEY = "customPerlerPaletteSelections";

// 构建色号库存拥有状态表：全色 key → 是否拥有）
export function buildOwnershipMap(
  allKeys: string[],
  ownedKeys: string[]
): Record<string, boolean> {
  const ownedSet = new Set(ownedKeys.map((k) => k.toUpperCase()));
  const result: Record<string, boolean> = {};
  allKeys.forEach((key) => {
    const upper = key.toUpperCase();
    result[upper] = ownedSet.has(upper);
  });
  return result;
}

// 全量色板颜色清单：MARD 色号表 → {key=hex, hex, rgb}，库存面板基数数据）
export const ALL_PALETTE_COLORS: PaletteColor[] = Object.entries(getMardColorHexMap())
  .map(([, hex]) => {
    const rgb = hexToRgb(hex);
    return rgb ? { key: hex, hex, rgb } : null;
  })
  .filter((c): c is PaletteColor => c !== null);

// localStorage 键：拼豆库存）
export const BEAD_INVENTORY_STORAGE_KEY = "bead-inventory";

// 保存拼豆库存到 localStorage；库存值为数量 number）
export function saveBeadInventory(inventory: Record<string, number>): void {
  localStorage.setItem(BEAD_INVENTORY_STORAGE_KEY, JSON.stringify(inventory));
}

// localStorage 键：工作台 UI 设置）
export const UI_SETTINGS_STORAGE_KEY = "perler-ui-settings";

// 读取工作台 UI 设置（localStorage），解析失败返回空对象）
export function loadUiSettings(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

// 主页启动状态 reducer：本地启动/画廊加载/就绪/失败的状态迁移）
export function bootStatusReducer(state: BootStatus, action: BootAction): BootStatus {
  switch (action.type) {
    case "start-gallery":
      return { kind: "loading-gallery", id: action.id, password: action.password };
    case "start-local":
      return { kind: "waiting-hydration" };
    case "settle":
      return { kind: "ready", source: action.source };
    case "fail-gallery":
      return { kind: "error", reason: action.reason };
    default:
      return state;
  }
}

// 等主编辑器 persist store 完成水合后再执行回调；已水合则立即执行。返回取消订阅函数）
type StoreHydrationListener = (callback: () => void) => () => void;
let registeredHydrationListener: StoreHydrationListener | null = null;

/** 由 stats-panel 在 store 创建后注入水合监听（避免循环引用） */
export function registerStoreHydration(listener: StoreHydrationListener): void {
  registeredHydrationListener = listener;
}

export function onStoreHydrated(callback: () => void): () => void {
  if (!registeredHydrationListener) {
    callback();
    return () => {};
  }
  return registeredHydrationListener(callback);
}

// 区域内（键盘按键 → 专注拼豆模式工具映射，填充键为 g，其余同编辑器）
export const TOOL_KEYS_FOCUS: Record<string, PaintTool> = {
  b: "brush",
  e: "eraser",
  i: "picker",
  g: "fill",
  l: "line",
  r: "rect",
  s: "select",
  h: "drag",
};

/* ============================================================
  * 集成兼容层：跨代理引用名对账
 * ============================================================ */

// —— 图标
export {
  PenIcon as FallbackToolIcon, // ez
  SlidersIcon as AdjustParamsIcon, // eB
  PaletteIcon as ColorsPanelIcon, // eO
  GridIcon as PaletteGridIcon, // eW
  DialIcon as GuidanceIcon, // eU
  TableIcon as DisplayIcon, // eY
  StarIcon as MaterialIcon, // eH
  SunIcon as ShadowIcon, // eV
  TagIcon as DecorIcon, // eK
} from "./preview-engine";

// —— 来自其他组件文件的规范名归口 ——
export { useExportArtifact as useArtifactGeneration } from "./color-palette-panel";
export { ColorSwatches as ColorSwatchPicker } from "./custom-palette-modal";
export { ManualPalettePanel } from "./manual-palette-panel";
export { TOOL_ICONS as MANUAL_TOOL_ICONS } from "./paint-toolbar";

// —— 工具函数别名（调用方命名 ↔ bits 实际导出名）——
export {
  nextOpId as nextManualOperationId, // 区域43 末计数器 tl 封装
  snapshotCell as serializeCellChange,
  normalizeSelectionRect as selectionFromTwoCells,
  extractRectFromGrid as extractSelectionBuffer,
  eraseRectOnGrid as clearGridRegion, // 区域26
  stampBufferOnGrid as stampBufferOntoData, // 区域63
  floodEraseCells as floodFillErase, // 区域77
  shapeStrokeCells as computeShapePreviewCells, // 区域47 相关
  brushStrokeCells as computeBrushStrokeCells, // 区域68
  paintCellsOnGrid as paintCellsOnData, // 区域68
  clipboardToBounds as getPastePreviewRect,
  collectSameColorRegion as findConnectedRegion, // 区域75
  everyCellInSet as isRegionCompleted, // 区域76
  cellsCentroid as getRegionCenterCell, // 区域76
  areSameCells as isSameCellList, // 区域76
  createFocusSessionState as createInitialFocusState, // 区域35
  computeExportCanvasSize as computeTargetCanvasWidth,
  buildOwnershipMap as buildPaletteSelections,
  loadUiSettings as readUiSettings, // 区域41
  bootStatusReducer as galleryBootReducer, // 区域38
  onStoreHydrated as runWhenStoreHydrated, // 区域20
  createUniqueId as generateId, // stats-panel 调用名
  deleteCellAt as deleteCell, // stats-panel 调用名
  applyCellChanges as applyLayerOperation, // stats-panel 调用名
  flattenLayersToGrid as composeLayers, // stats-panel 调用名
  createCellMap as createEmptyLayerData, // stats-panel 调用名
  gridToCellMap as pixelDataToLayerData, // stats-panel 调用名
  GalleryParamProbe as GalleryParamListener,
  PanelCard as PanelSection,
  drawGridCornerMarks as drawCornerHandles, // 区域08 调用名
  NumberField as LabeledNumberInput,
  SegmentedControl as SegmentedSelect,
  SegmentedControl as SegmentedOptions,
  ToggleRow as SettingsToggle,
  SliderRow as SliderSetting,
  ALL_PALETTE_COLORS as FULL_PALETTE_COLORS, // page.tsx 调用名
  TOOL_KEYS_EDITOR as MANUAL_TOOL_HOTKEYS, // 区域28
  TOOL_KEYS_FOCUS as MANUAL_TOOL_HOTKEYS_ALT, // 区域28
};

// —— hsvToRgb
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const value = v / 100;
  const sat = (s / 100) * value;
  const x = sat * (1 - Math.abs(((h / 60) % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [sat, x, 0];
  else if (h < 120) [r, g, b] = [x, sat, 0];
  else if (h < 180) [r, g, b] = [0, sat, x];
  else if (h < 240) [r, g, b] = [0, x, sat];
  else if (h < 300) [r, g, b] = [x, 0, sat];
  else [r, g, b] = [sat, 0, x];
  const m = value - sat;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// —— hexToRgb 再导出（7258 E2，custom-palette-modal 等经 ./bits 引用）——
export { hexToRgb } from "@/utils/canvas-ops";

// —— 桌面右侧抽屉
interface DrawerCategory {
  id: string;
  label?: string;
  bare?: boolean;
  content?: ReactNode;
  quickControls?: ReactNode;
}

export function DesktopDrawer({
  categories,
  footer,
  width = 320,
  fadeKey,
}: {
  categories: DrawerCategory[];
  footer?: ReactNode;
  width?: number;
  fadeKey?: string | number;
}) {
  return (
    <div
      style={{ width }}
      className="absolute top-2 bottom-2 right-3 z-30 flex flex-col rounded-2xl overflow-hidden bg-white/55 dark:bg-gray-900/50 backdrop-blur-2xl backdrop-saturate-[1.8] border border-white/50 dark:border-white/10 shadow-2xl"
    >
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        <div className="animate-mode-fade flex flex-col gap-3" key={fadeKey}>
          {categories.map((cat) =>
            cat.bare ? (
              <Fragment key={cat.id}>{cat.content}</Fragment>
            ) : (
              <PanelCard key={cat.id} title={cat.label} collapsible defaultOpen trailing={cat.quickControls}>
                {cat.content}
              </PanelCard>
            ),
          )}
        </div>
        {footer}
      </div>
    </div>
  );
}

// —— 模块级常量
// 内模块级 I
export const GRID_LINE_COLORS = [
  { name: "深灰色", value: "#555555" },
  { name: "红色", value: "#FF0000" },
  { name: "蓝色", value: "#0000FF" },
  { name: "绿色", value: "#008000" },
  { name: "紫色", value: "#800080" },
  { name: "橙色", value: "#FFA500" },
];

// 内模块级 tI
export const FOCUS_GUIDANCE_OPTIONS = [
  { value: "nearest", label: "最近优先" },
  { value: "largest", label: "大块优先" },
  { value: "edge-first", label: "边缘优先" },
];

// 内模块级 tB
export const SECTION_LINE_SWATCHES = [
  { color: "#007acc", name: "蓝色" },
  { color: "#28a745", name: "绿色" },
  { color: "#dc3545", name: "红色" },
  { color: "#6f42c1", name: "紫色" },
  { color: "#fd7e14", name: "橙色" },
  { color: "#6c757d", name: "灰色" },
];

// 内模块级 tO
export const RENDER_TEXTURE_OPTIONS = [
  { value: "matte", label: "哑光" },
  { value: "glitter", label: "亮片" },
  { value: "towel", label: "绒面" },
  { value: "scrub", label: "磨砂" },
];
