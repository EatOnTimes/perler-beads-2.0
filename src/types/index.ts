
import type { ReactNode } from "react";

// 集成决策：PixelCell/PixelGrid 以 @/utils/watermark为规范定义，
// 此处仅 re-export；watermark 的 PixelGrid 允许稀疏格（(PixelCell | undefined)[][]），
// 密集网格（PixelCell[][]）结构上始终可赋值给它。
export type { PixelCell, PixelGrid } from "@/utils/watermark";
import type { PixelCell } from "@/utils/watermark";

/** RGB 颜色（7258 canvas-ops 的 hexToRgb / 色板 rgb 字段） */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** * 拼豆色板颜色条目 */
export interface PaletteColor {
  key: string;
  hex: string;
  rgb: RGB;
}

/** * 品牌色号体系 */
export type BrandSystem = "MARD" | "COCO" | "漫漫" | "盼盼" | "咪小窝" | "其他";

/**
 * 画布单元格（规范定义见 @/utils/watermark 的 PixelCell）。
 * key 为品牌色号，`"ERASE"`（8780 模块 tO）表示空格；
 * isExternal=true 表示外部/底稿参考格（不可编辑，仅展示）。
 */

/** 格子坐标 */
export interface CellPos {
  row: number;
  col: number;
}

/** * 格子矩形范围 */
export interface CellBounds {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

/** * 参与绘制的格子快照 */
export interface CellSnapshot {
  key: string;
  color: string;
}

/** * 图层数据：cellKey("row,col") -> 快照 */
export type CellMap = Map<string, CellSnapshot>;

/** 单格变更
  * before/after 可选：与 stats-panel 的 LayerOperationChange对齐 */
export interface CellChange {
  row: number;
  col: number;
  before?: CellSnapshot | null;
  after?: CellSnapshot | null;
}

/** * 一次绘制操作产生的变更批次 */
export interface CellChangeBatch {
  changes: CellChange[];
}

/** * 文档画布尺寸 */
export interface GridSize {
  width: number;
  height: number;
}

/** * 专注拼豆画布尺寸：M=行数(rows) N=列数(cols) */
export interface FocusGridDimensions {
  M: number;
  N: number;
}

/** 编辑器图层
  * 集成决策：type 增加 "sticker"，data/locked/template 兼容字段 */
export interface EditorLayer {
  id: string;
  name?: string;
  type: "pixel" | "image" | "sticker";
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  data?: CellMap;
  /** 贴纸模板（StickerLayer） */
  template?: unknown;
}

/** * 工作台文档 */
export interface WorkbenchDocument {
  layers: EditorLayer[];
  activeLayerId: string;
  grid: GridSize;
}

/** * 绘图工具 */
export type PaintTool =
  | "brush"
  | "eraser"
  | "picker"
  | "fill"
  | "line"
  | "rect"
  | "select"
  | "drag";

/** * 剪贴板图块 */
export interface ClipboardBuffer {
  pixels: PixelCell[][];
  width: number;
  height: number;
}

/** * 内容对齐模式 */
export type AnchorMode = "start" | "end" | "center";

/** * 主页启动状态 */
export type BootStatus =
  | { kind: "boot" } // TODO(类型): 初始值由区域79确定
  | { kind: "loading-gallery"; id: string; password?: string }
  | { kind: "waiting-hydration" }
  | { kind: "ready"; source: string }
  | { kind: "error"; reason: string };

/** * 主页启动动作 */
export type BootAction =
  | { type: "start-gallery"; id: string; password?: string }
  | { type: "start-local" }
  | { type: "settle"; source: string }
  | { type: "fail-gallery"; reason: string };

/** * 右侧面板分组条目 */
export interface PanelCategory {
  id: string;
  /** 折叠面板标题（bare=true 时省略） */
  label?: string;
  content: ReactNode;
  /** 标题行右侧的快捷控件 */
  quickControls?: ReactNode;
  /** true 时不套 PanelCard，直接渲染 content */
  bare?: boolean;
}

/** * 专注拼豆模式会话状态 */
export interface FocusSessionState {
  currentColor: string;
  selectedCell: CellPos | null;
  canvasScale: number;
  canvasOffset: { x: number; y: number };
  /** 已完成格子：cellKey("row,col") 集合 */
  completedCells: Set<string>;
  /** * * TODO(类型): 值结构以区域79/专注模式面板使用为准 */
  colorProgress: Record<string, any>;
  recommendedRegion: CellPos[] | null;
  recommendedCell: CellPos | null;
  /** * 引导模式 */
  guidanceMode: "nearest" | "largest" | "edge-first";
  showColorPanel: boolean;
  isPaused: boolean;
  startTime: number;
  totalElapsedTime: number;
  lastResumeTime: number;
  gridSectionInterval: number;
  showSectionLines: boolean;
  sectionLineColor: string;
  enableCelebration: boolean;
  showCelebration: boolean;
  showCompletionCard: boolean;
  completionCardDismissed: boolean;
}
