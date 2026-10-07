import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image"; // 源 D = r(9380)
// M = r(1866)（211.js 色板工具）：TR → getDisplayColorKey，lW → getColorKeyByHex
import {
  getDisplayColorKey,
  getColorKeyByHex,
  type ColorSystem,
  type PaletteColor,
} from "@/utils/color-system";
// h = r(8878)，bk → triggerDownload（尝试自动下载导出工件）
import { triggerDownload } from "@/utils/export-errors";
// g = 区域 02 的导出工件状态卡片（ExportArtifactCard）。契约 02 → utils/share.ts（该文件含 JSX，落地为 utils/share.tsx）
import { ExportArtifactCard } from "@/utils/share";
// 像素网格规范类型（稀疏网格）与通用弹窗外壳
import type { PixelGrid } from "@/utils/watermark";
import { ModalShell } from "./modal-shell";

// ---- useExportArtifact----

export type ExportPhase = "idle" | "generating" | "ready" | "error";

export interface ExportArtifact {
  filename: string;
  blob: Blob;
}

export interface ExportMessages {
  generating: string;
  ready: string;
  manual: string;
  error: string;
}

export interface ExportState {
  phase: ExportPhase;
  artifact: ExportArtifact | null;
  message: string;
}

// 初始状态（源中外部常量 E）
const INITIAL_EXPORT_STATE: ExportState = { phase: "idle", artifact: null, message: "" };

export function useExportArtifact() {
  const [state, setState] = useState<ExportState>(INITIAL_EXPORT_STATE);
  const runIdRef = useRef(0);

  useEffect(
    () => () => {
      runIdRef.current += 1;
    },
    []
  );

  const clear = useCallback(() => {
    runIdRef.current += 1;
    setState(INITIAL_EXPORT_STATE);
  }, []);

  const generate = useCallback(async (
    // 源允许同步产生工件（下载设置弹窗的 CSV 导出为同步函数），await 兼容两者
    produce: () => ExportArtifact | Promise<ExportArtifact>,
    messages: ExportMessages
  ): Promise<ExportArtifact | null> => {
    const runId = ++runIdRef.current;
    setState({ phase: "generating", artifact: null, message: messages.generating });
    try {
      const artifact = await produce();
      if (!artifact.filename || artifact.blob.size === 0) {
        throw Error("生成的文件为空，请重试");
      }
      if (runId !== runIdRef.current) return null;
      let readyMessage = messages.ready;
      try {
        triggerDownload(artifact);
      } catch {
        readyMessage = messages.manual;
      }
      setState({ phase: "ready", artifact, message: readyMessage });
      return artifact;
    } catch (error) {
      if (runId !== runIdRef.current) return null;
      setState({
        phase: "error",
        artifact: null,
        message: error instanceof Error ? error.message : messages.error,
      });
      return null;
    }
  }, []);

  return {
    ...state,
    generate,
    clear,
  };
}

// ---- 色号 → 系列分组（源中组件内 IIFE） ----

function groupColorsBySeries(
  colors: PaletteColor[],
  system: ColorSystem
): Record<string, PaletteColor[]> {
  const groups: Record<string, PaletteColor[]> = {};
  colors.forEach((color) => {
    const code = getDisplayColorKey(color.hex, system);
    let series: string;
    if (system === "盼盼" || system === "咪小窝") {
      if (/^\d+$/.test(code)) {
        const num = parseInt(code, 10);
        series =
          num <= 20
            ? "1-20"
            : num <= 50
              ? "21-50"
              : num <= 100
                ? "51-100"
                : num <= 200
                  ? "101-200"
                  : "200+";
      } else series = "其他";
    } else {
      series = code.match(/^[A-Z]+/)?.[0] || "其他";
    }
    (groups[series] ??= []).push(color);
  });
  Object.values(groups).forEach((list) =>
    list.sort((a, b) => {
      const codeA = getDisplayColorKey(a.hex, system);
      const codeB = getDisplayColorKey(b.hex, system);
      return (
        (parseInt(codeA.replace(/^[A-Z]+/, ""), 10) || 0) -
        (parseInt(codeB.replace(/^[A-Z]+/, ""), 10) || 0)
      );
    })
  );
  return groups;
}

// ---- ColorPalettePanel ----

interface ColorSystemOption {
  key: string;
  name: string;
}

export interface ColorPalettePanelProps {
  allColors: PaletteColor[];
  currentSelections: Record<string, boolean>;
  onSelectionChange: (hex: string, selected: boolean) => void;
  onSaveCustomPalette: () => void;
  onClose: () => void;
  onExportXlsx: () => Promise<ExportArtifact>;
  onImportXlsx: () => void;
  colorSystemOptions: ColorSystemOption[];
  onColorSystemChange: (key: string) => void;
  selectedColorSystem: ColorSystem;
  inventory: Record<string, number> | null;
  onUpdateInventory: ((hex: string, count: number) => void) | null;
}

export function ColorPalettePanel({
  allColors,
  currentSelections,
  onSelectionChange,
  onSaveCustomPalette,
  onClose,
  onExportXlsx,
  onImportXlsx,
  colorSystemOptions,
  onColorSystemChange,
  selectedColorSystem,
  inventory,
  onUpdateInventory,
}: ColorPalettePanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const {
    phase,
    artifact,
    message,
    generate: generateArtifact,
    clear: clearArtifact,
  } = useExportArtifact();

  useEffect(() => {
    setSelectedCount(Object.values(currentSelections).filter(Boolean).length);
  }, [currentSelections]);

  useEffect(() => {
    clearArtifact();
  }, [clearArtifact, currentSelections, inventory, selectedColorSystem]);

  const filteredColors = useMemo(() => {
    if (!searchQuery) return allColors;
    const query = searchQuery.toLowerCase();
    return allColors.filter((color) => {
      const code = getDisplayColorKey(color.hex, selectedColorSystem).toLowerCase();
      return color.key.toLowerCase().includes(query) || code.includes(query);
    });
  }, [allColors, searchQuery, selectedColorSystem]);

  const seriesGroups = useMemo(
    () => groupColorsBySeries(filteredColors, selectedColorSystem),
    [filteredColors, selectedColorSystem]
  );
  const seriesNames = useMemo(() => Object.keys(seriesGroups).sort(), [seriesGroups]);

  useEffect(() => {
    if (activeSeries && !seriesGroups[activeSeries]) {
      setActiveSeries(seriesNames[0] || null);
    }
  }, [seriesNames, activeSeries, seriesGroups]);

  const handleSelectAllColors = (selected: boolean) =>
    allColors.forEach((color) => onSelectionChange(color.hex.toUpperCase(), selected));

  const handleSeriesSelectAll = (series: string, selected: boolean) => {
    seriesGroups[series]?.forEach((color) =>
      onSelectionChange(color.hex.toUpperCase(), selected)
    );
  };

  const visibleColors = activeSeries && seriesGroups[activeSeries] ? seriesGroups[activeSeries] : filteredColors;

  // 色块上的色号文字颜色
  const swatchLabelClass = (hex: string) => {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16);
    return (299 * r + 587 * parseInt(clean.substring(2, 4), 16) + 114 * parseInt(clean.substring(4, 6), 16)) / 1000 > 140
      ? "text-gray-900/60"
      : "text-white/70";
  };

  // 移动端系列筛选 chip
  const renderSeriesChip = (
    label: React.ReactNode,
    active: boolean,
    onClick: () => void,
    key: string
  ) => (
    <button
      onClick={onClick}
      key={key}
      className={`min-h-[44px] flex-shrink-0 px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
        active
          ? "bg-gray-900 text-gray-50 dark:bg-gray-200 dark:text-gray-900"
          : "text-gray-600 dark:text-gray-400 active:bg-gray-200 dark:active:bg-gray-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full max-h-[calc(90vh-40px)]">
      <div className="flex flex-col gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">色板设置</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
              已选 {selectedCount} / {allColors.length}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="w-11 h-11 rounded-lg flex items-center justify-center text-gray-400 active:bg-gray-200 dark:active:bg-gray-700 transition-colors flex-shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex h-11 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden flex-shrink-0">
            {colorSystemOptions.map((option) => (
              <button
                onClick={() => onColorSystemChange(option.key)}
                key={option.key}
                className={`px-3 text-[11px] font-medium transition-colors ${
                  selectedColorSystem === option.key
                    ? "bg-gray-900 text-gray-50 dark:bg-gray-200 dark:text-gray-900"
                    : "text-gray-600 dark:text-gray-300 active:bg-gray-200 dark:active:bg-gray-700"
                }`}
              >
                {option.name}
              </button>
            ))}
          </div>
          <div className="flex h-11 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden flex-shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-2.5 text-[11px] font-medium transition-colors ${
                viewMode === "grid"
                  ? "bg-gray-900 text-gray-50 dark:bg-gray-200 dark:text-gray-900"
                  : "text-gray-600 dark:text-gray-300 active:bg-gray-200 dark:active:bg-gray-700"
              }`}
              title="色板"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-2.5 text-[11px] font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-gray-900 text-gray-50 dark:bg-gray-200 dark:text-gray-900"
                  : "text-gray-600 dark:text-gray-300 active:bg-gray-200 dark:active:bg-gray-700"
              }`}
              title="豆库"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
          <div className="relative flex-1 min-w-[120px]">
            <input
              type="text"
              placeholder="搜索色号"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-8 pr-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>
      </div>
      <div className="sm:hidden flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] py-2 flex-shrink-0">
        {renderSeriesChip(
          <>
            全部{" "}
            <span className="text-gray-600 dark:text-gray-300 tabular-nums">
              {filteredColors.length}
            </span>
          </>,
          !activeSeries,
          () => setActiveSeries(null),
          "__all__"
        )}
        {seriesNames.map((series) => {
          const total = seriesGroups[series].length;
          const picked = seriesGroups[series].filter(
            (color) => currentSelections[color.hex.toUpperCase()]
          ).length;
          return renderSeriesChip(
            <>
              {series}{" "}
              <span
                className={`tabular-nums ${
                  activeSeries === series
                    ? "text-gray-300 dark:text-gray-500"
                    : "text-gray-600 dark:text-gray-300"
                }`}
              >
                {picked}/{total}
              </span>
            </>,
            activeSeries === series,
            () => setActiveSeries(series),
            series
          );
        })}
      </div>
      <div className="flex-1 flex min-h-0 mt-0 sm:mt-3 gap-3">
        <div className="hidden sm:flex w-28 flex-shrink-0 flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
          <button
            onClick={() => setActiveSeries(null)}
            className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${
              activeSeries
                ? "bg-white/45 dark:bg-white/10 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/15"
                : "bg-gray-900 text-gray-50 dark:bg-gray-200 dark:text-gray-900"
            }`}
          >
            全部{" "}
            <span
              className={`tabular-nums ${
                activeSeries
                  ? "text-gray-600 dark:text-gray-300"
                  : "text-gray-300 dark:text-gray-500"
              }`}
            >
              {filteredColors.length}
            </span>
          </button>
          {seriesNames.map((series) => {
            const total = seriesGroups[series].length;
            const picked = seriesGroups[series].filter(
              (color) => currentSelections[color.hex.toUpperCase()]
            ).length;
            return (
              <button
                onClick={() => setActiveSeries(series)}
                key={series}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${
                  activeSeries === series
                    ? "bg-gray-900 text-gray-50 dark:bg-gray-200 dark:text-gray-900"
                    : "bg-white/45 dark:bg-white/10 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/15"
                }`}
              >
                {series}{" "}
                <span
                  className={`tabular-nums ${
                    activeSeries === series
                      ? "text-gray-300 dark:text-gray-500"
                      : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {picked}/{total}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-1">
          {activeSeries && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {activeSeries} 系列
              </span>
              <button
                onClick={() => handleSeriesSelectAll(activeSeries, true)}
                className="min-h-[44px] px-1 text-[11px] text-gray-600 dark:text-gray-400 active:text-brand-500 transition-colors"
              >
                全选
              </button>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <button
                onClick={() => handleSeriesSelectAll(activeSeries, false)}
                className="min-h-[44px] px-1 text-[11px] text-gray-600 dark:text-gray-400 active:text-brand-500 transition-colors"
              >
                全不选
              </button>
            </div>
          )}
          {viewMode === "grid" ? (
            <div className="flex flex-wrap gap-1.5 content-start">
              {visibleColors.map((color) => {
                const hexKey = color.hex.toUpperCase();
                const isSelected = !!currentSelections[hexKey];
                const code = getDisplayColorKey(color.hex, selectedColorSystem);
                const stock = inventory?.[hexKey] ?? 0;
                return (
                  <button
                    onClick={() => onSelectionChange(hexKey, !isSelected)}
                    key={color.hex}
                    className={`relative w-11 h-11 rounded-lg transition-all duration-100 flex items-center justify-center flex-shrink-0 border-2 ${
                      isSelected
                        ? "border-brand-500"
                        : "border-transparent opacity-35 active:opacity-70"
                    }`}
                    style={{ backgroundColor: color.hex }}
                  >
                    <span
                      className={`text-[9px] font-bold leading-none select-none ${swatchLabelClass(color.hex)}`}
                    >
                      {code}
                    </span>
                    {isSelected && (
                      <div className="absolute top-0 right-0 w-3 h-3 bg-brand-500 rounded-bl-md rounded-tr-[5px] flex items-center justify-center">
                        <svg
                          className="w-2 h-2 text-white"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      </div>
                    )}
                    {stock > 0 && (
                      <span className="absolute bottom-0 left-0 right-0 text-[8px] leading-none text-center bg-black/40 text-white rounded-b-md py-px tabular-nums">
                        {stock}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-0.5">
              {visibleColors.map((color) => {
                const hexKey = color.hex.toUpperCase();
                const isSelected = !!currentSelections[hexKey];
                const code = getDisplayColorKey(color.hex, selectedColorSystem);
                const stock = inventory?.[hexKey] ?? 0;
                return (
                  <div
                    key={color.hex}
                    className="flex flex-wrap items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-gray-100 active:bg-gray-100 dark:hover:bg-gray-800/60 dark:active:bg-gray-800/60 transition-colors sm:flex-nowrap"
                  >
                    <button
                      onClick={() => onSelectionChange(hexKey, !isSelected)}
                      aria-label={isSelected ? `取消选择 ${code}` : `选择 ${code}`}
                      className={`w-11 h-11 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-brand-500 border-brand-500"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      {isSelected && (
                        <svg
                          className="w-3 h-3 text-white"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </button>
                    <div
                      className="w-7 h-7 rounded-md border border-gray-200 dark:border-gray-600 flex-shrink-0"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-300 w-14 flex-shrink-0">
                      {code}
                    </span>
                    {onUpdateInventory && (
                      <div className="flex w-full items-center justify-end gap-1 sm:ml-auto sm:w-auto">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 mr-1">
                          库存
                        </span>
                        <button
                          onClick={() => onUpdateInventory(hexKey, Math.max(0, stock - 10))}
                          className="w-11 h-11 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
                        >
                          −10
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={stock || ""}
                          placeholder="0"
                          onChange={(e) => {
                            const value = e.target.value;
                            onUpdateInventory(
                              hexKey,
                              "" === value ? 0 : Math.max(0, parseInt(value, 10) || 0)
                            );
                          }}
                          className="h-11 w-14 text-center text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => onUpdateInventory(hexKey, stock + 10)}
                          className="w-11 h-11 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
                        >
                          +10
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ExportArtifactCard
        phase={phase}
        artifact={artifact}
        message={message}
        openKind="file"
        onDismiss={clearArtifact}
        className="mt-3 flex-shrink-0"
      />
      <div className="flex items-center justify-between flex-wrap gap-2 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleSelectAllColors(true)}
            className="min-h-[44px] px-3 py-1.5 text-xs rounded-lg bg-white/45 dark:bg-white/10 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/15 transition-colors"
          >
            全选
          </button>
          <button
            onClick={() => handleSelectAllColors(false)}
            className="min-h-[44px] px-3 py-1.5 text-xs rounded-lg bg-white/45 dark:bg-white/10 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/15 transition-colors"
          >
            清空
          </button>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          <button
            onClick={onImportXlsx}
            className="min-h-[44px] px-3 py-1.5 text-xs rounded-lg bg-white/45 dark:bg-white/10 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/15 transition-colors"
          >
            导入
          </button>
          <button
            onClick={() => {
              generateArtifact(onExportXlsx, {
                generating: "正在生成色板配置…",
                ready: "色板配置已生成，并已尝试自动下载。",
                manual: "色板配置已生成，请点击「保存到设备」。",
                error: "色板配置导出失败，请稍后重试",
              });
            }}
            disabled={phase === "generating"}
            className="min-h-[44px] px-3 py-1.5 text-xs rounded-lg bg-white/45 dark:bg-white/10 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/15 transition-colors disabled:cursor-wait disabled:opacity-50"
          >
            {phase === "generating" ? "生成中…" : artifact ? "重新导出" : "导出"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-xs rounded-lg bg-white/45 dark:bg-white/10 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/15 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onSaveCustomPalette}
            className="min-h-[44px] px-4 py-2 text-xs rounded-lg bg-gray-900 text-gray-50 active:bg-gray-800 transition-colors"
          >
            保存并应用
          </button>
        </div>
      </div>
    </div>
  );
}

export default ColorPalettePanel;

// ============================================================
// MagnifierPanel
// 放大镜浮动面板：按选区 20px/格重绘 + 点击上色 + 头部拖拽移动
// ============================================================

/** 放大镜选区（源内部键名为 startRow/startCol/endRow/endCol，与 page 的 SelectionRect 是不同形状） */
export interface MagnifierSelectionArea {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

/** 放大镜上色用的选中色（与 page 的 SelectedColor 同形，本地声明避免循环依赖） */
interface SelectedColorLike {
  key: string;
  color: string;
  isExternal?: boolean;
}

export interface MagnifierPanelProps {
  isActive: boolean;
  onToggle: () => void;
  mappedPixelData?: PixelGrid | null;
  gridDimensions?: { N: number; M: number } | null;
  /** 调用方传入但源组件未消费（about-modal 传小地图格径），保留契约 */
  cellSize?: number;
  selectedColor?: SelectedColorLike | null;
  selectedColorSystem?: string;
  onPixelEdit: (row: number, col: number, color: SelectedColorLike) => void;
  selectionArea?: MagnifierSelectionArea | null;
  onClearSelection: () => void;
  isFloatingActive?: boolean;
  onActivateFloating: () => void;
  highlightColorKey?: string | null;
}

export function MagnifierPanel({
  isActive,
  onToggle,
  mappedPixelData,
  selectedColor,
  selectedColorSystem,
  onPixelEdit,
  selectionArea,
  onClearSelection,
  isFloatingActive,
  onActivateFloating,
  highlightColorKey,
}: MagnifierPanelProps) {
  // 面板默认位置（视口居中；仅客户端运行，与源一致直接读 window）
  const getDefaultPosition = () => ({
    x: Math.max(50, (window.innerWidth - 400) / 2),
    y: Math.max(50, (window.innerHeight - 400) / 2),
  });
  const [position, setPosition] = useState(getDefaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (isActive) setPosition(getDefaultPosition());
    // 源 deps [isActive]；getDefaultPosition 为纯 window 读取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const getSelectionSize = useCallback(
    () =>
      selectionArea
        ? {
            width: Math.abs(selectionArea.endCol - selectionArea.startCol) + 1,
            height: Math.abs(selectionArea.endRow - selectionArea.startRow) + 1,
          }
        : { width: 0, height: 0 },
    [selectionArea]
  );

  // 放大镜重绘：选区内 20px/格 + 非高亮色压暗 + 浅色描边
  const drawMagnifier = useCallback(() => {
    if (!selectionArea || !mappedPixelData || !magnifierCanvasRef.current) return;
    const canvas = magnifierCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = getSelectionSize();
    canvas.width = 20 * width;
    canvas.height = 20 * height;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rowStart = Math.min(selectionArea.startRow, selectionArea.endRow);
    const rowEnd = Math.max(selectionArea.startRow, selectionArea.endRow);
    const colStart = Math.min(selectionArea.startCol, selectionArea.endCol);
    const colEnd = Math.max(selectionArea.startCol, selectionArea.endCol);
    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        if (row >= 0 && row < mappedPixelData.length && col >= 0 && col < mappedPixelData[0].length) {
          const cell = mappedPixelData[row][col]!;
          const x = 20 * (col - colStart);
          const y = 20 * (row - rowStart);
          ctx.fillStyle = cell.color;
          ctx.fillRect(x, y, 20, 20);
          if (highlightColorKey && cell.color.toUpperCase() !== highlightColorKey.toUpperCase()) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.fillRect(x, y, 20, 20);
          }
          ctx.strokeStyle = "#e0e0e0";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, 20, 20);
        }
      }
    }
  }, [selectionArea, mappedPixelData, getSelectionSize, highlightColorKey]);

  // 点击放大镜格子 → 以当前色上色（换算回原网格坐标）
  const handleMagnifierClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!selectionArea || !mappedPixelData || !selectedColor || !magnifierCanvasRef.current) return;
      const canvas = magnifierCanvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const colInArea = Math.floor(x / 20);
      const rowInArea = Math.floor(y / 20);
      const row = Math.min(selectionArea.startRow, selectionArea.endRow) + rowInArea;
      const col = Math.min(selectionArea.startCol, selectionArea.endCol) + colInArea;
      if (row >= 0 && row < mappedPixelData.length && col >= 0 && col < mappedPixelData[0].length) {
        onPixelEdit(row, col, selectedColor);
      }
    },
    [selectionArea, mappedPixelData, selectedColor, onPixelEdit]
  );

  // 头部拖拽（鼠标）：按钮区域不触发
  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "BUTTON" || target.closest("button")) return;
      if (panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect();
        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
      onActivateFloating();
      setIsDragging(true);
      document.body.style.overflow = "hidden";
      e.preventDefault();
    },
    [onActivateFloating]
  );

  const handleHeaderTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "BUTTON" || target.closest("button")) return;
      const touch = e.touches[0];
      if (touch) {
        if (panelRef.current) {
          const rect = panelRef.current.getBoundingClientRect();
          setDragOffset({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
        }
        onActivateFloating();
        setIsDragging(true);
        document.body.style.overflow = "hidden";
        e.preventDefault();
      }
    },
    [onActivateFloating]
  );

  const handleHeaderMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    },
    [isDragging, dragOffset]
  );

  const handleHeaderTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      if (touch) setPosition({ x: touch.clientX - dragOffset.x, y: touch.clientY - dragOffset.y });
    },
    [isDragging, dragOffset]
  );

  const handleHeaderMouseUp = useCallback(() => {
    setIsDragging(false);
    document.body.style.overflow = "";
  }, []);

  const handleHeaderTouchEnd = useCallback(() => {
    setIsDragging(false);
    document.body.style.overflow = "";
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleHeaderMouseMove);
      document.addEventListener("mouseup", handleHeaderMouseUp);
      document.addEventListener("touchmove", handleHeaderTouchMove, { passive: false });
      document.addEventListener("touchend", handleHeaderTouchEnd);
      return () => {
        document.removeEventListener("mousemove", handleHeaderMouseMove);
        document.removeEventListener("mouseup", handleHeaderMouseUp);
        document.removeEventListener("touchmove", handleHeaderTouchMove);
        document.removeEventListener("touchend", handleHeaderTouchEnd);
        document.body.style.overflow = "";
      };
    }
  }, [isDragging, handleHeaderMouseMove, handleHeaderMouseUp, handleHeaderTouchMove, handleHeaderTouchEnd]);

  useEffect(() => {
    drawMagnifier();
  }, [drawMagnifier]);

  if (!isActive) return null;
  return (
    <>
      {!selectionArea && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-gray-900 text-gray-50 px-4 py-2 rounded-lg shadow-lg z-[70]">
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span>在画布上拖拽选择要放大的区域</span>
          </div>
        </div>
      )}
      {selectionArea && (
        <div
          ref={panelRef}
          className={`fixed bg-gray-50 dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200/80 dark:border-gray-600 select-none ${
            isFloatingActive ? "z-[60]" : "z-[50]"
          }`}
          style={{ left: position.x, top: position.y }}
          onClick={onActivateFloating}
        >
          <div
            className="flex items-center justify-between p-3 bg-gray-900 text-gray-50 rounded-t-xl cursor-move"
            onMouseDown={handleHeaderMouseDown}
            onTouchStart={handleHeaderTouchStart}
          >
            <div className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <span className="text-sm font-medium">
                放大镜 ({getSelectionSize().width}×{getSelectionSize().height})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClearSelection}
                className="p-1 hover:bg-white/20 active:bg-white/20 rounded transition-colors"
                title="重新选择区域"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
              <button
                onClick={onToggle}
                className="p-1 hover:bg-white/20 active:bg-white/20 rounded transition-colors"
                title="关闭放大镜"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-3">
            <div className="border border-gray-200/80 dark:border-gray-600 rounded-lg overflow-auto max-h-96">
              <canvas
                ref={magnifierCanvasRef}
                onClick={handleMagnifierClick}
                className="cursor-crosshair block"
              />
            </div>
            {selectedColor && (
              <div className="mt-2 p-2 bg-gray-100/80 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-2 text-xs">
                  <div
                    className="w-4 h-4 rounded border border-gray-200/80 dark:border-gray-500"
                    style={{ backgroundColor: selectedColor.color }}
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    当前: {getColorKeyByHex(selectedColor.color, selectedColorSystem ?? "")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// MagnifierSelection
// 放大镜选区交互层：主画布上拖拽框选，锁定页面滚动，完成后回调选区
// ============================================================

export interface MagnifierSelectionProps {
  isActive: boolean;
  canvasRef?: { current: HTMLCanvasElement | null } | null;
  gridDimensions?: { N: number; M: number } | null;
  /** 调用方传入但源组件未消费，保留契约 */
  cellSize?: number;
  onSelectionComplete: (area: MagnifierSelectionArea) => void;
}

export function MagnifierSelection({
  isActive,
  canvasRef,
  gridDimensions,
  onSelectionComplete,
}: MagnifierSelectionProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [endPoint, setEndPoint] = useState<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const isScrollLockedRef = useRef(false);
  const scrollPositionRef = useRef(0);

  const preventScroll = useCallback((e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const lockScroll = useCallback(() => {
    if (isScrollLockedRef.current) return;
    scrollPositionRef.current = window.scrollY;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("wheel", preventScroll, { passive: false });
    document.addEventListener("touchmove", preventScroll, { passive: false });
    isScrollLockedRef.current = true;
  }, [preventScroll]);

  const unlockScroll = useCallback(() => {
    if (!isScrollLockedRef.current) return;
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    document.removeEventListener("wheel", preventScroll);
    document.removeEventListener("touchmove", preventScroll);
    isScrollLockedRef.current = false;
  }, [preventScroll]);

  // 客户端坐标 → 画布物理坐标（按显示缩放折算并钳制在画布内）
  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef?.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;
      return {
        x: Math.max(0, Math.min(canvas.width, x)),
        y: Math.max(0, Math.min(canvas.height, y)),
      };
    },
    [canvasRef]
  );

  // 画布物理坐标 → 网格单元（钳制在网格内）
  const getCellFromPoint = useCallback(
    (x: number, y: number) => {
      const canvas = canvasRef?.current;
      if (!gridDimensions || !canvas) return null;
      const cellWidth = canvas.width / gridDimensions.N;
      const cellHeight = canvas.height / gridDimensions.M;
      const col = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);
      return {
        row: Math.max(0, Math.min(gridDimensions.M - 1, row)),
        col: Math.max(0, Math.min(gridDimensions.N - 1, col)),
      };
    },
    [gridDimensions, canvasRef]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isActive) return;
      const point = getCanvasPoint(e.clientX, e.clientY);
      if (point) {
        setIsSelecting(true);
        setStartPoint(point);
        setEndPoint(point);
        lockScroll();
        e.preventDefault();
      }
    },
    [isActive, getCanvasPoint, lockScroll]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isSelecting || !startPoint) return;
      const point = getCanvasPoint(e.clientX, e.clientY);
      if (point) setEndPoint(point);
    },
    [isSelecting, startPoint, getCanvasPoint]
  );

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || !startPoint || !endPoint) return void unlockScroll();
    const startCell = getCellFromPoint(startPoint.x, startPoint.y);
    const endCell = getCellFromPoint(endPoint.x, endPoint.y);
    if (startCell && endCell) {
      onSelectionComplete({
        startRow: Math.min(startCell.row, endCell.row),
        startCol: Math.min(startCell.col, endCell.col),
        endRow: Math.max(startCell.row, endCell.row),
        endCol: Math.max(startCell.col, endCell.col),
      });
    }
    setIsSelecting(false);
    setStartPoint(null);
    setEndPoint(null);
    unlockScroll();
  }, [isSelecting, startPoint, endPoint, getCellFromPoint, onSelectionComplete, unlockScroll]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isActive) return;
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      if (!touch) return;
      const point = getCanvasPoint(touch.clientX, touch.clientY);
      if (point) {
        setIsSelecting(true);
        setStartPoint(point);
        setEndPoint(point);
        lockScroll();
      }
    },
    [isActive, getCanvasPoint, lockScroll]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isSelecting || !startPoint) return;
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      if (!touch) return;
      const point = getCanvasPoint(touch.clientX, touch.clientY);
      if (point) setEndPoint(point);
    },
    [isSelecting, startPoint, getCanvasPoint]
  );

  const handleTouchEnd = useCallback(() => {
    handleMouseUp();
  }, [handleMouseUp]);

  useEffect(() => {
    if (isSelecting) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
        unlockScroll();
      };
    }
  }, [isSelecting, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd, unlockScroll]);

  // 卸载时兜底解锁滚动
  useEffect(() => () => {
    unlockScroll();
  }, [unlockScroll]);

  // 失活时复位
  useEffect(() => {
    if (!isActive) {
      unlockScroll();
      setIsSelecting(false);
      setStartPoint(null);
      setEndPoint(null);
    }
  }, [isActive, unlockScroll]);

  // 选区框样式（画布物理坐标 → 屏幕固定定位）
  const getSelectionStyle = useCallback((): React.CSSProperties => {
    const canvas = canvasRef?.current;
    if (!startPoint || !endPoint || !canvas) return {};
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const x1 = startPoint.x * scaleX;
    const y1 = startPoint.y * scaleY;
    const x2 = endPoint.x * scaleX;
    const y2 = endPoint.y * scaleY;
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const right = Math.max(x1, x2);
    const bottom = Math.max(y1, y2);
    return {
      left: rect.left + left,
      top: rect.top + top,
      width: right - left,
      height: bottom - top,
      position: "fixed",
      border: "2px solid #d97757",
      backgroundColor: "rgba(217, 119, 87, 0.1)",
      pointerEvents: "none",
      zIndex: 1e3,
    };
  }, [startPoint, endPoint, canvasRef]);

  if (!isActive) return null;
  return (
    <>
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50"
        style={{ cursor: "crosshair", pointerEvents: isActive ? "auto" : "none" }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      />
      {isSelecting && startPoint && endPoint && <div style={getSelectionStyle()} />}
    </>
  );
}

// ============================================================
// DonationModal
// 打赏弹窗（"Buy Me A Milk Tea" + 赞赏码 /donation-qr.jpg）
// ============================================================

export interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DonationModal({ isOpen, onClose }: DonationModalProps) {
  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="md:max-w-md">
      <div className="p-3 sm:p-6">
        <div className="flex justify-between items-center mb-3 sm:mb-5">
          <h3
            className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-100 bg-gradient-to-r from-brand-500 to-[#c4623f] bg-clip-text text-transparent font-serif italic flex items-center"
            style={{ fontFamily: "'Brush Script MT', cursive, serif" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 mr-2"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8h1a2 2 0 0 1 2 2v1c0 1.1-.9 2-2 2h-1" fill="#f9a8d4" />
              <path d="M6 8h12v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V8z" fill="#f9a8d4" />
              <path d="M6 8V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v1" fill="#f472b6" />
              <path d="M12 16v-4" stroke="#7d2a5a" />
              <path d="M9.5 14.5L9 16" stroke="#7d2a5a" />
              <path d="M14.5 14.5L15 16" stroke="#7d2a5a" />
            </svg>
            Buy Me A Milk Tea
          </h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-gray-700 active:text-gray-700 dark:hover:text-gray-200 dark:active:text-gray-200 transition-colors duration-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 sm:h-6 sm:w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="text-center">
          <p className="mb-3 text-sm sm:text-base text-gray-600 dark:text-gray-300 break-words">
            开源项目是把作者和用户紧紧联系在一起的社群，如果您希望这个项目继续发展，可以请作者喝一杯奶茶。
          </p>
          <p className="mb-4 sm:mb-6 text-sm sm:text-base text-gray-600 dark:text-gray-300 break-words">
            您的支持是作者把项目继续下去的动力。
          </p>
          <div className="flex justify-center mb-4 sm:mb-5">
            <div className="relative w-40 h-40 sm:w-48 sm:h-48 md:w-56 md:h-56 p-1 sm:p-2 bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 rounded-lg shadow-md">
              <Image src="/donation-qr.jpg" alt="赞赏码" fill className="object-contain p-1 sm:p-2" />
            </div>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 py-1.5 px-3 sm:py-2 sm:px-4 rounded-full inline-block shadow-sm">
            微信扫描上方赞赏码，请作者喝奶茶 ٩(๑•̀ω•́๑)۶
          </p>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================
// DownloadSettingsModal
// 下载图纸设置弹窗：署名/分享码、网格线、坐标/色号、统计、镜像、水印，
// 底部「生成图纸 / 导出源数据」走 useExportArtifact 状态机
// ============================================================

/** * 网格线颜色预设 */
const GRID_LINE_COLORS = [
  { name: "深灰色", value: "#555555" },
  { name: "红色", value: "#FF0000" },
  { name: "蓝色", value: "#0000FF" },
  { name: "绿色", value: "#008000" },
  { name: "紫色", value: "#800080" },
  { name: "橙色", value: "#FFA500" },
];

export interface WatermarkSettings {
  enabled: boolean;
  type: "tile" | "emboss";
  text: string;
}

export interface DownloadSettingsOptions {
  showGrid: boolean;
  gridInterval: number;
  showCoordinates: boolean;
  showCellNumbers: boolean;
  gridLineColor: string;
  includeStats: boolean;
  mirrorX: boolean;
  authorName: string;
  shareCode: string;
  watermark: WatermarkSettings;
}

export interface DownloadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: DownloadSettingsOptions;
  onOptionsChange: (options: DownloadSettingsOptions) => void;
  onDownload: (options: DownloadSettingsOptions) => ExportArtifact | Promise<ExportArtifact>;
  onExportCsv: () => ExportArtifact | Promise<ExportArtifact>;
}

export function DownloadSettingsModal({
  isOpen,
  onClose,
  options,
  onOptionsChange,
  onDownload,
  onExportCsv,
}: DownloadSettingsModalProps) {
  // 本地草稿（打开时从 options 重置，确认/生成时才回写）
  const [draft, setDraft] = useState<DownloadSettingsOptions>({ ...options });
  const [openKind, setOpenKind] = useState<"image" | "file">("image");
  const {
    phase,
    artifact,
    message,
    generate,
    clear,
  } = useExportArtifact();
  const wasOpenRef = useRef(false);

  // 仅在「关闭 → 打开」切换时重置草稿与状态
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setDraft({
        ...options,
        watermark: {
          ...options.watermark,
        },
      });
      setOpenKind("image");
      clear();
    }
    wasOpenRef.current = isOpen;
  }, [clear, isOpen, options]);

  const clearArtifact = useCallback(() => {
    clear();
  }, [clear]);

  const updateOption = (key: keyof DownloadSettingsOptions, value: string | number | boolean) => {
    clearArtifact();
    setDraft((prev) => ({ ...prev, [key]: value }) as DownloadSettingsOptions);
  };

  const updateWatermark = (patch: Partial<WatermarkSettings>) => {
    clearArtifact();
    setDraft((prev) => ({
      ...prev,
      watermark: {
        ...prev.watermark,
        ...patch,
      },
    }));
  };

  const requestClose = () => {
    if (phase !== "generating") {
      clearArtifact();
      onClose();
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={requestClose}
      closeOnBackdrop={phase !== "generating"}
      maxWidth="max-w-md"
      panelClassName="h-[min(90dvh,48rem)]"
      contentClassName="flex-1 min-h-0 overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/40 px-5 py-3 dark:border-white/10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">下载图纸设置</h3>
          <button
            type="button"
            onClick={requestClose}
            disabled={phase === "generating"}
            aria-label="关闭下载设置"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 active:bg-white/50 active:text-gray-700 dark:active:bg-white/10 dark:active:text-gray-200 disabled:text-gray-400 dark:disabled:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <fieldset
            disabled={phase === "generating"}
            className={`space-y-4 ${phase === "generating" ? "opacity-60" : ""}`}
          >
            <div className="flex flex-col space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">作者署名</label>
              <input
                type="text"
                value={draft.authorName || ""}
                onChange={(e) => updateOption("authorName", e.target.value)}
                placeholder="@你的社交账号（留空则不显示）"
                maxLength={30}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
              />
            </div>
            <div className="flex flex-col space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">画廊分享码</label>
              <input
                type="text"
                value={draft.shareCode || ""}
                onChange={(e) => updateOption("shareCode", e.target.value)}
                placeholder="发布到画廊后获得的分享码（留空则不显示）"
                maxLength={10}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 font-mono tracking-widest"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                显示网格线
              </label>
              <label className="relative inline-flex min-h-[44px] min-w-[44px] items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={draft.showGrid}
                  onChange={(e) => updateOption("showGrid", e.target.checked)}
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
              </label>
            </div>
            {draft.showGrid && (
              <div className="space-y-4 pl-2 border-l-2 border-gray-200 dark:border-gray-700 ml-1 pt-2 pb-1">
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    网格线间隔 (每 N 格画一条线)
                  </label>
                  <div className="flex items-center justify-between space-x-3">
                    <input
                      type="range"
                      min="5"
                      max="20"
                      step="1"
                      value={draft.gridInterval}
                      onChange={(e) => updateOption("gridInterval", parseInt(e.target.value))}
                      className="h-11 w-full cursor-pointer rounded-lg bg-transparent accent-brand-500"
                    />
                    <span className="flex items-center justify-center min-w-[40px] text-sm font-medium text-gray-900 dark:text-gray-100">
                      {draft.gridInterval}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">网格线颜色</label>
                  <div className="flex flex-wrap gap-2">
                    {GRID_LINE_COLORS.map((preset) => (
                      <button
                        type="button"
                        key={preset.value}
                        onClick={() => updateOption("gridLineColor", preset.value)}
                        className={`w-11 h-11 rounded-full border-2 transition-all duration-150 flex items-center justify-center
                                    ${
                                      draft.gridLineColor === preset.value
                                        ? "border-brand-500 ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-gray-800"
                                        : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                                    }`}
                        title={preset.name}
                      >
                        <span className="block w-6 h-6 rounded-full" style={{ backgroundColor: preset.value }} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                显示坐标数字
              </label>
              <label className="relative inline-flex min-h-[44px] min-w-[44px] items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={draft.showCoordinates}
                  onChange={(e) => updateOption("showCoordinates", e.target.checked)}
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                隐藏格内色号
              </label>
              <label className="relative inline-flex min-h-[44px] min-w-[44px] items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={!draft.showCellNumbers}
                  onChange={(e) => updateOption("showCellNumbers", !e.target.checked)}
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                包含色号统计
              </label>
              <label className="relative inline-flex min-h-[44px] min-w-[44px] items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={draft.includeStats}
                  onChange={(e) => updateOption("includeStats", e.target.checked)}
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                水平镜像
              </label>
              <label className="relative inline-flex min-h-[44px] min-w-[44px] items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={!!draft.mirrorX}
                  onChange={(e) => updateOption("mirrorX", e.target.checked)}
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                添加水印
              </label>
              <label className="relative inline-flex min-h-[44px] min-w-[44px] items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={!!draft.watermark?.enabled}
                  onChange={(e) => updateWatermark({ enabled: e.target.checked })}
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
              </label>
            </div>
            {draft.watermark?.enabled && (
              <div className="space-y-3 pl-2 border-l-2 border-gray-200 dark:border-gray-700 ml-1 pt-2 pb-1">
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">水印样式</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: "tile", label: "平铺", hint: "斜向重复铺满" },
                        { value: "emboss", label: "浮雕", hint: "居中雕刻感" },
                      ] as { value: WatermarkSettings["type"]; label: string; hint: string }[]
                    ).map((preset) => {
                      const isActive = draft.watermark.type === preset.value;
                      return (
                        <button
                          type="button"
                          key={preset.value}
                          onClick={() => updateWatermark({ type: preset.value })}
                          className={`px-3 py-2 rounded-lg border text-sm transition-colors text-left
                            ${
                              isActive
                                ? "border-brand-500 bg-brand-500/10 text-brand-500"
                                : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-gray-700"
                            }`}
                        >
                          <div className="font-semibold">{preset.label}</div>
                          <div className="text-xs opacity-70">{preset.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">水印文字</label>
                  <input
                    type="text"
                    value={draft.watermark.text}
                    onChange={(e) => updateWatermark({ text: e.target.value })}
                    placeholder="自定义水印内容，如 @你的昵称"
                    maxLength={40}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                  />
                </div>
              </div>
            )}
          </fieldset>
        </div>
        <div
          className="flex-shrink-0 border-t border-white/40 bg-white/55 px-5 pt-3 backdrop-blur-xl dark:border-white/10 dark:bg-gray-900/55"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <ExportArtifactCard
            phase={phase}
            artifact={artifact}
            message={message}
            openKind={openKind}
            className="mb-3"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setOpenKind("image");
                generate(
                  () => {
                    onOptionsChange(draft);
                    return onDownload(draft);
                  },
                  {
                    generating: "正在生成图纸…",
                    ready: "图纸已生成，并已尝试自动下载。",
                    manual: "图纸已生成，请点击「保存到设备」。",
                    error: "图纸生成失败，请稍后重试",
                  }
                );
              }}
              disabled={phase === "generating"}
              className="min-h-[44px] flex-1 px-3 py-2.5 bg-brand-500 active:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:cursor-wait disabled:bg-brand-500/45 disabled:text-white/75"
            >
              {phase === "generating" && openKind === "image"
                ? "生成中…"
                : artifact && openKind === "image"
                  ? "重新生成"
                  : "生成图纸"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenKind("file");
                generate(onExportCsv, {
                  generating: "正在生成 CSV…",
                  ready: "CSV 已生成，并已尝试自动下载。",
                  manual: "CSV 已生成，请点击「保存到设备」。",
                  error: "CSV 导出失败，请稍后重试",
                });
              }}
              disabled={phase === "generating"}
              className="min-h-[44px] flex-1 px-3 py-2.5 bg-white/55 active:bg-white/80 dark:bg-white/10 dark:active:bg-white/15 text-gray-800 dark:text-gray-200 rounded-xl text-sm font-medium transition-colors disabled:text-gray-400 dark:disabled:text-gray-600"
            >
              {phase === "generating" && openKind === "file" ? "导出中…" : "导出源数据"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
