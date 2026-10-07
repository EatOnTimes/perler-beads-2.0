import { MANUAL_TOOLS, TOOL_LABELS, TOOL_ICONS } from "./paint-toolbar";
import { TOOL_TITLES, HintText, BrushControls, ToggleRow } from "./bits";

export interface RecolorGuideProps {
  manualTool: string;
  onToolSelect: (tool: string) => void;
  showToolGrid: boolean;
  colorReplaceState: { isActive: boolean; step: string };
  isEraseMode: boolean;
  handleEraseToggle: () => void;
  handleColorReplaceToggle: () => void;
  manualBrushSize: number;
  setManualBrushSize: (size: number) => void;
  manualShapeFill: boolean;
  setManualShapeFill: (value: boolean) => void;
  manualMirrorX: boolean;
  setManualMirrorX: (value: boolean) => void;
  manualMirrorY: boolean;
  setManualMirrorY: (value: boolean) => void;
  manualSelectionInfo: { width: number; height: number } | null;
}

/** 手动工具设置面板（换色教学："第一步选源颜色 / 第二步选目标颜色"，擦除同色连通提示）
  */
export function RecolorGuide({
  manualTool,
  onToolSelect,
  showToolGrid,
  colorReplaceState,
  isEraseMode,
  handleEraseToggle,
  handleColorReplaceToggle,
  manualBrushSize,
  setManualBrushSize,
  manualShapeFill,
  setManualShapeFill,
  manualMirrorX,
  setManualMirrorX,
  manualMirrorY,
  setManualMirrorY,
  manualSelectionInfo,
}: RecolorGuideProps) {
  const toolGrid = showToolGrid ? (
    <div className="grid grid-cols-4 gap-1.5">
      {MANUAL_TOOLS.map((tool) => {
        const isActive = manualTool === tool && !isEraseMode && !colorReplaceState.isActive;
        return (
          <button
            key={tool}
            type="button"
            onClick={() => onToolSelect(tool)}
            aria-label={TOOL_LABELS[tool]}
            aria-pressed={isActive}
            className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl border transition-colors ${
              isActive
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800"
            }`}
          >
            <span className="w-5 h-5 flex items-center justify-center">{TOOL_ICONS[tool]}</span>
            <span className="text-[10px] leading-none font-medium">{TOOL_LABELS[tool]}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {(colorReplaceState.isActive || isEraseMode) && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            colorReplaceState.isActive
              ? "border-brand-500/30 bg-brand-500/5 text-brand-500 dark:text-brand-300"
              : "border-red-300/50 bg-red-50/50 text-red-600 dark:text-red-300 dark:bg-red-900/20"
          }`}
        >
          {colorReplaceState.isActive
            ? colorReplaceState.step === "select-source"
              ? "第一步，在画布上点击选择源颜色"
              : "第二步，在色板中选择目标颜色"
            : "点击画布擦除同色连通区域"}
        </div>
      )}
      {toolGrid}
      <div className={showToolGrid ? "pt-2 border-t border-gray-200/60 dark:border-gray-800/60" : ""}>
        <div className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
          {TOOL_TITLES[manualTool] ?? manualTool}
        </div>
        {(() => {
          switch (manualTool) {
            case "brush":
            case "line":
              return (
                <BrushControls
                  size={manualBrushSize}
                  setSize={setManualBrushSize}
                  mirrorX={manualMirrorX}
                  setMirrorX={setManualMirrorX}
                  mirrorY={manualMirrorY}
                  setMirrorY={setManualMirrorY}
                />
              );
            case "eraser":
              return (
                <div className="space-y-2">
                  <BrushControls size={manualBrushSize} setSize={setManualBrushSize} />
                  <ToggleRow
                    label="区域擦除（同色连通）"
                    checked={isEraseMode}
                    onChange={() => handleEraseToggle()}
                  />
                </div>
              );
            case "picker":
              return <HintText text="在画布上点击拾取颜色" />;
            case "fill":
              return (
                <ToggleRow
                  label="批量替换颜色"
                  checked={colorReplaceState.isActive}
                  onChange={() => handleColorReplaceToggle()}
                />
              );
            case "rect":
              return (
                <div className="space-y-2">
                  <BrushControls
                    size={manualBrushSize}
                    setSize={setManualBrushSize}
                    mirrorX={manualMirrorX}
                    setMirrorX={setManualMirrorX}
                    mirrorY={manualMirrorY}
                    setMirrorY={setManualMirrorY}
                  />
                  <ToggleRow
                    label="实心填充（关=仅描边）"
                    checked={manualShapeFill}
                    onChange={setManualShapeFill}
                  />
                </div>
              );
            case "select":
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-medium">选区尺寸</span>
                    <span className="tabular-nums">
                      {manualSelectionInfo
                        ? `${manualSelectionInfo.width}×${manualSelectionInfo.height}`
                        : "—"}
                    </span>
                  </div>
                  <HintText text="框选后在选区内拖动即移动内容；复制 / 剪切会进入连续粘贴态，删除 / 取消见画布上方操作条。" />
                </div>
              );
            case "paste":
              return <HintText text="在画布上点击放置粘贴内容（取消见画布上方操作条）。" />;
            case "drag":
              return <HintText text="拖拽画布进行平移" />;
            default:
              return null;
          }
        })()}
      </div>
    </div>
  );
}

/** 缩放算法选项
   */
export const SCALE_ALGORITHM_OPTIONS = [
  { value: "nearest", label: "最近优先" },
  { value: "largest", label: "大块优先" },
  { value: "edge-first", label: "边缘优先" },
];

/** 分区线预设颜色
   */
export const SECTION_LINE_COLORS = [
  { color: "#007acc", name: "蓝色" },
  { color: "#28a745", name: "绿色" },
  { color: "#dc3545", name: "红色" },
  { color: "#6f42c1", name: "紫色" },
  { color: "#fd7e14", name: "橙色" },
  { color: "#6c757d", name: "灰色" },
];

/** 拼豆材质选项
   */
export const BEAD_MATERIAL_OPTIONS = [
  { value: "matte", label: "哑光" },
  { value: "glitter", label: "亮片" },
  { value: "towel", label: "绒面" },
  { value: "scrub", label: "磨砂" },
];

/** 导出背景预设颜色
   */
export const EXPORT_BACKDROP_COLORS = [
  { color: "#f5f0eb", name: "暖白" },
  { color: "#ffffff", name: "纯白" },
  { color: "#e8e6dc", name: "米色" },
  { color: "#2d2d2d", name: "深色" },
  { color: "#1a1a1a", name: "黑色" },
  { color: "#f0e6d3", name: "木纹" },
];
