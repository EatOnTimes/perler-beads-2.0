import { getColorKeyByHex } from "@/utils/color-system";
// eJ = r(8063)：a → compareColorKeys（按色号字母前缀+数字排序），V → allPaletteColors（291 色完整列表）
import { compareColorKeys, allPaletteColors } from "@/utils/bundle-misc";
// e0 = r(7258)（utils/canvas-ops.ts），Jx = 预设处理模式枚举
import { Jx as CanvasPresetMode } from "@/utils/canvas-ops";

interface ColorCountEntry {
  count: number;
  color: string;
}

export interface ExcludedColorsPanelProps {
  colorCounts: Record<string, ColorCountEntry> | null;
  selectedColorSystem: string; // 集成放宽：调用方传 state 中的 string（getColorKeyByHex 已接受 string）
  excludedColorKeys: Set<string>;
  setExcludedColorKeys: (keys: Set<string>) => void;
  showExcludedColors: boolean;
  setShowExcludedColors: (value: boolean | ((prev: boolean) => boolean)) => void;
  handleToggleExcludeColor: (hex: string) => void;
  setRemapTrigger: (updater: (prev: number) => number) => void;
  setWorkspaceMode: (mode: string) => void;
  resetManualState: () => void;
  activeBeadPalette: unknown[]; // TODO(类型): 拼豆色板数组，与 HomePage 侧类型对齐
}

export function ExcludedColorsPanel({
  colorCounts,
  selectedColorSystem,
  excludedColorKeys,
  setExcludedColorKeys,
  showExcludedColors,
  setShowExcludedColors,
  handleToggleExcludeColor,
  setRemapTrigger,
  setWorkspaceMode,
  resetManualState,
  activeBeadPalette,
}: ExcludedColorsPanelProps) {
  // 恢复颜色后触发重新映射并回到专心拼豆
  const triggerRemapAndReset = () => {
    setRemapTrigger((n) => n + 1);
    setWorkspaceMode("studio");
    resetManualState();
  };

  return (
    <div className="space-y-3">
      <div className="color-stats-panel">
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
          点击某个颜色将其排除，该色拼豆会自动替换为最接近的其他颜色，适合减少需要购买的颜色种类。
        </p>
        <ul className="space-y-0.5 max-h-52 overflow-y-auto overscroll-contain text-sm">
          {colorCounts &&
            Object.keys(colorCounts)
              .sort(compareColorKeys)
              .map((hex) => {
                const code = getColorKeyByHex(hex, selectedColorSystem);
                const isExcluded = excludedColorKeys.has(hex);
                const count = colorCounts[hex].count;
                const color = colorCounts[hex].color;
                return (
                  <li
                    key={hex}
                    onClick={() => handleToggleExcludeColor(hex)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors min-h-[36px] ${
                      isExcluded
                        ? "bg-red-50 dark:bg-red-900/30 opacity-50"
                        : "active:bg-gray-100 dark:active:bg-gray-700"
                    }`}
                  >
                    <div className={`flex items-center gap-2 ${isExcluded ? "line-through" : ""}`}>
                      <span
                        className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0"
                        style={{ backgroundColor: isExcluded ? "#999" : color }}
                      />
                      <span
                        className={`font-mono text-xs font-medium ${
                          isExcluded
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {code}
                      </span>
                    </div>
                    <span
                      className={`text-xs tabular-nums ${
                        isExcluded
                          ? "text-red-500 line-through"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {count}
                    </span>
                  </li>
                );
              })}
        </ul>
        {excludedColorKeys.size > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowExcludedColors((prev) => !prev)}
              className="w-full text-xs py-1.5 px-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 active:bg-gray-300 dark:hover:bg-gray-500 dark:active:bg-gray-500 transition-colors flex items-center justify-between"
            >
              <span>
                已排除的颜色 ({excludedColorKeys.size})
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 text-gray-500 dark:text-gray-400 transform transition-transform ${
                  showExcludedColors ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {showExcludedColors && (
              <div className="mt-2 border border-gray-200/60 dark:border-gray-800/50 rounded-md p-2 bg-gray-100 dark:bg-gray-900/80">
                <div className="max-h-40 overflow-y-auto">
                  {Array.from(excludedColorKeys).length > 0 ? (
                    <ul className="space-y-1">
                      {Array.from(excludedColorKeys)
                        .sort(compareColorKeys)
                        .map((hex) => {
                          const paletteEntry = allPaletteColors.find(
                            (entry: { hex: string }) =>
                              entry.hex.toUpperCase() === hex.toUpperCase()
                          );
                          return (
                            <li
                              key={hex}
                              className="flex justify-between items-center p-1 hover:bg-gray-200 active:bg-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-700 rounded"
                            >
                              <div className="flex items-center space-x-2">
                                <span
                                  className="inline-block w-4 h-4 rounded border border-gray-400 dark:border-gray-500 flex-shrink-0"
                                  style={{ backgroundColor: paletteEntry?.hex || hex }}
                                />
                                <span className="font-mono text-xs text-gray-800 dark:text-gray-200">
                                  {getColorKeyByHex(hex, selectedColorSystem)}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  const next = new Set(excludedColorKeys);
                                  next.delete(hex);
                                  setExcludedColorKeys(next);
                                  triggerRemapAndReset();
                                }}
                                className="text-xs py-0.5 px-2 bg-brand-500/10 text-brand-500 dark:bg-brand-500/20 dark:text-brand-500 rounded hover:bg-brand-500/20 active:bg-brand-500/20 dark:hover:bg-brand-500/30 dark:active:bg-brand-500/30"
                              >
                                恢复
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  ) : (
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">
                      没有排除的颜色
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setExcludedColorKeys(new Set());
                    triggerRemapAndReset();
                  }}
                  className="mt-2 w-full text-xs py-1 px-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-600 text-white rounded transition-colors"
                >
                  一键恢复所有颜色
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {activeBeadPalette.length === 0 && excludedColorKeys.size > 0 && (
        <div className="rounded-xl border border-yellow-200 dark:border-yellow-800/60 bg-yellow-100 dark:bg-yellow-900/50 p-4 text-center text-sm text-yellow-800 dark:text-yellow-300 shadow-sm shadow-gray-200/50">
          当前可用颜色过少或为空。请在上方统计列表中恢复部分颜色，或更换色板。
          <button
            onClick={() => {
              setShowExcludedColors(true);
              setTimeout(() => {
                const panel = document.querySelector(".color-stats-panel");
                if (panel) {
                  panel.scrollIntoView({
                    behavior: "smooth",
                  });
                }
              }, 100);
            }}
            className="mt-2 ml-2 text-xs py-1 px-2 bg-yellow-200 dark:bg-yellow-700/60 text-yellow-900 dark:text-yellow-200 rounded hover:bg-yellow-300 active:bg-yellow-300 dark:hover:bg-yellow-600/70 dark:active:bg-yellow-600/70 transition-colors"
          >
            查看已排除颜色 ({excludedColorKeys.size})
          </button>
        </div>
      )}
    </div>
  );
}

// 预设处理模式选项
export const presetModeOptions: { value: any; label: string }[] = [
  // TODO(类型): value 为 utils/canvas-ops 的 Jx 枚举（Dominant/Average）
  { value: CanvasPresetMode.Dominant, label: "卡通" },
  { value: CanvasPresetMode.Average, label: "真实" },
];

export default ExcludedColorsPanel;
