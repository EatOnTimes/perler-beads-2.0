import type { ReactNode } from "react";

/** 手动绘制工具键列表（工具条顺序）
  */
export const MANUAL_TOOLS = [
  "drag",
  "brush",
  "eraser",
  "picker",
  "fill",
  "line",
  "rect",
  "select",
] as const;

export type ManualTool = (typeof MANUAL_TOOLS)[number] | "paste";

/** 工具中文名（aria-label / 标题 / 选中标签）
  */
export const TOOL_LABELS: Record<string, string> = {
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

/** 工具图标（内嵌 SVG，逐字保留路径数据）
  */
export const TOOL_ICONS: Record<string, ReactNode> = {
  brush: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  ),
  eraser: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M7 21h10" />
      <path d="M5.5 11.5l8-8a2.83 2.83 0 114 4l-8 8a2 2 0 01-1.41.59H5a2 2 0 01-2-2v-3.17c0-.53.21-1.04.59-1.42z" />
    </svg>
  ),
  picker: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M2 22l1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="M14.5 5.5l4-4a1.41 1.41 0 012 2l-4 4" />
      <path d="M12 8l4 4" />
    </svg>
  ),
  fill: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M19 11V4a2 2 0 00-2-2H4a2 2 0 00-2 2v13a2 2 0 002 2h7" />
      <path d="M16 22l4.5-4.5a2.12 2.12 0 000-3L18 12l-7 7 2.5 2.5a2.12 2.12 0 003 0z" />
    </svg>
  ),
  line: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="w-5 h-5"
    >
      <line x1="5" y1="19" x2="19" y2="5" />
    </svg>
  ),
  rect: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  ),
  select: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M5 3h4M15 3h4M3 5v4M3 15v4M21 5v4M21 15v4M5 21h4M15 21h4" />
    </svg>
  ),
  drag: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M18 11V6a2 2 0 00-4 0v3" />
      <path d="M14 10V4a2 2 0 00-4 0v6" />
      <path d="M10 10.5V5a2 2 0 00-4 0v9" />
      <path d="M22 10.5V14a8 8 0 01-8 8h-1C8.58 22 6 18 6 14" />
    </svg>
  ),
};

export interface PaintToolbarProps {
  manualTool: string;
  onToolSelect: (tool: string) => void;
  manualPasteActive: boolean;
  selectedColor: { color: string; key: string } | null;
  isEraseMode: boolean;
  colorReplaceActive: boolean;
  onColorIndicatorClick: () => void;
  showMiniMap: boolean;
  onToggleMiniMap: () => void;
}

/** 画布左侧工具条
  */
export function PaintToolbar({
  manualTool,
  onToolSelect,
  manualPasteActive,
  selectedColor,
  isEraseMode,
  colorReplaceActive,
  onColorIndicatorClick,
  showMiniMap,
  onToggleMiniMap,
}: PaintToolbarProps) {
  const activeTool = manualPasteActive ? "paste" : manualTool;
  return (
    <div className="absolute left-3 top-1/2 -translate-y-1/2 z-30 max-h-[calc(100%-1.5rem)] overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] flex flex-col items-center gap-1 p-1.5 rounded-2xl glass-dark animate-toolbar-slide-up">
      <button
        onClick={onColorIndicatorClick}
        aria-label="切换色板"
        className="flex flex-col items-center gap-0.5 cursor-pointer flex-shrink-0 mb-1"
      >
        <span
          className="w-9 h-9 rounded-lg border-2 border-gray-500/50"
          style={{ backgroundColor: selectedColor?.color ?? "#ffffff" }}
        />
        <span className="text-[9px] font-mono text-gray-400 leading-none truncate max-w-[40px]">
          {selectedColor?.key ?? ""}
        </span>
      </button>
      <div className="h-px w-7 bg-gray-600/40 flex-shrink-0" />
      {MANUAL_TOOLS.map((tool) => {
        const isActive = activeTool === tool && !isEraseMode && !colorReplaceActive;
        return (
          <button
            key={tool}
            onClick={() => onToolSelect(tool)}
            aria-label={TOOL_LABELS[tool]}
            title={TOOL_LABELS[tool]}
            className={`w-10 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 flex-shrink-0 ${
              isActive
                ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30 py-1.5"
                : "h-10 text-gray-400 active:text-gray-50 active:bg-gray-700/60"
            }`}
          >
            {TOOL_ICONS[tool]}
            {isActive && (
              <span className="text-[9px] leading-none font-medium">{TOOL_LABELS[tool]}</span>
            )}
          </button>
        );
      })}
      {isEraseMode && (
        <span className="px-1.5 py-1 rounded-lg bg-red-500/20 text-red-300 text-[10px] font-medium flex-shrink-0">
          擦
        </span>
      )}
      {colorReplaceActive && (
        <span className="px-1.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-[10px] font-medium flex-shrink-0">
          替
        </span>
      )}
      <div className="h-px w-7 bg-gray-600/40 flex-shrink-0" />
      <button
        onClick={onToggleMiniMap}
        aria-label={showMiniMap ? "隐藏小地图" : "显示小地图"}
        title={showMiniMap ? "隐藏小地图" : "显示小地图"}
        className={`w-10 h-10 rounded-xl transition-all flex items-center justify-center flex-shrink-0 ${
          showMiniMap
            ? "bg-gray-600/60 text-gray-200"
            : "text-gray-500 active:text-gray-50 active:bg-gray-700/60"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <path d="M3 7l6-4 6 4 6-4v14l-6 4-6-4-6 4V7z" />
          <line x1="9" y1="3" x2="9" y2="17" />
          <line x1="15" y1="7" x2="15" y2="21" />
        </svg>
      </button>
    </div>
  );
}

/** 工作台骨架布局（顶栏 + 主区 + 抽屉 + 底栏，安全区/内边距按线上逻辑）
  */
export function WorkbenchLayout({
  topBar,
  footer,
  main,
  drawer,
  mainPaddingLeft,
  mainPaddingTop,
  mainPaddingRight = 0,
  mainPaddingBottom = 0,
}: {
  topBar?: ReactNode;
  footer?: ReactNode;
  main?: ReactNode;
  drawer?: ReactNode;
  mainPaddingLeft?: number;
  mainPaddingTop?: number;
  mainPaddingRight?: number;
  mainPaddingBottom?: number;
}) {
  return (
    <div
      className="h-screen flex flex-col workspace-ambient font-[family-name:var(--font-poppins)] overflow-hidden"
      style={{ height: "100dvh" }}
    >
      {topBar}
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-screen-2xl flex-1 box-border">
          <div
            className="flex min-h-0 min-w-0 w-full flex-1 py-3 transition-[padding] duration-200 ease-out"
            style={{
              paddingTop: mainPaddingTop === undefined ? undefined : mainPaddingTop,
              paddingLeft:
                mainPaddingLeft === undefined
                  ? "calc(env(safe-area-inset-left, 0px) + clamp(0.5rem, 2vw, 1rem))"
                  : `calc(${mainPaddingLeft}px + env(safe-area-inset-left, 0))`,
              paddingRight: `calc(${mainPaddingRight}px + env(safe-area-inset-right, 0px) + clamp(0.5rem, 2vw, 1rem))`,
              paddingBottom:
                mainPaddingBottom > 0
                  ? `calc(${mainPaddingBottom}px + env(safe-area-inset-bottom, 0))`
                  : undefined,
            }}
          >
            {main}
          </div>
        </div>
        {drawer}
      </div>
      {footer}
    </div>
  );
}
