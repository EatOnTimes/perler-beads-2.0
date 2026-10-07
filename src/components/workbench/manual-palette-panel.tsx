"use client";
// 可拖拽浮动「调色盘」面板：色块/色盘双视图、色相/色号排序、自定义取色→最近似拼豆色、换色目标选择
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { hexToRgb, findClosestPaletteColor, rgbDistance } from "@/utils/canvas-ops";
import { compareColorKeys } from "@/utils/bundle-misc";
import { getDisplayColorKey, sortColorsByHue } from "@/utils/color-system";
import { ERASE_KEY } from "@/utils/bundle-misc";
import { ColorPicker } from "./custom-palette-modal";

export interface PaletteSwatch {
  key: string;
  color: string;
}

export interface ColorReplaceState {
  isActive: boolean;
  step: string;
  /** * 源色对象 */
  sourceColor?: { key: string; color: string; isExternal?: boolean } | null;
}

export interface ManualPalettePanelProps {
  colors: PaletteSwatch[];
  selectedColor?: PaletteSwatch | null;
  onColorSelect: (color: PaletteSwatch) => void;
  selectedColorSystem: string;
  fullPaletteColors: PaletteSwatch[];
  showFullPalette: boolean;
  onToggleFullPalette: () => void;
  colorReplaceState: ColorReplaceState;
  onColorReplace: (sourceColor: { key: string; color: string; isExternal?: boolean }, target: PaletteSwatch) => void;
  onHighlightColor: (color: string) => void;
  isActive: boolean;
  onActivate: () => void;
  variant?: "floating" | "docked";
  className?: string;
}

interface RgbLike {
  r: number;
  g: number;
  b: number;
}

export function ManualPalettePanel({
  colors,
  selectedColor,
  onColorSelect,
  selectedColorSystem,
  fullPaletteColors,
  showFullPalette,
  onToggleFullPalette,
  colorReplaceState,
  onColorReplace,
  onHighlightColor,
  isActive,
  onActivate,
  variant = "floating",
  className,
}: ManualPalettePanelProps) {
  const isDocked = "docked" === variant;
  const defaultPosition = () => ({
    x: Math.max(0, Math.min(20, window.innerWidth - 280)),
    y: Math.max(0, Math.min(100, window.innerHeight - 400)),
  });
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);

  const preventDefault = useCallback((e: Event) => {
    if ((e as Event & { cancelable?: boolean }).cancelable) e.preventDefault();
  }, []);

  const handleDragStart = useCallback(
    (clientX: number, clientY: number) => {
      if (isDocked || !rootRef.current) return;
      onActivate();
      const rect = rootRef.current.getBoundingClientRect();
      setDragging(true);
      setDragOffset({ x: clientX - rect.left, y: clientY - rect.top });
    },
    [onActivate, isDocked],
  );

  const onMouseDownHeader = useCallback(
    (e: React.MouseEvent) => {
      handleDragStart(e.clientX, e.clientY);
      e.preventDefault();
    },
    [handleDragStart],
  );

  const onTouchStartHeader = useCallback(
    (e: React.TouchEvent) => {
      if (isDocked || !rootRef.current) return;
      onActivate();
      const rect = rootRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      setDragging(true);
      setDragOffset({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
      preventDefault(e as unknown as Event);
    },
    [onActivate, isDocked, preventDefault],
  );

  useEffect(() => {
    if (isDocked) return;
    const move = (x: number, y: number) => {
      if (dragging) setPosition({ x: x - dragOffset.x, y: y - dragOffset.y });
    };
    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      move(e.clientX, e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      preventDefault(e);
      e.stopPropagation();
      if (e.touches.length > 0) move(e.touches[0].clientX, e.touches[0].clientY);
    };
    const stop = () => {
      setDragging(false);
      document.body.style.overflow = "";
    };
    if (!dragging) return;
    document.body.style.overflow = "hidden";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stop);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", stop);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", stop);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", stop);
      document.body.style.overflow = "";
    };
  }, [isDocked, dragging, dragOffset, preventDefault]);

  useEffect(() => {
    if (!isDocked) setPosition(defaultPosition());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDocked]);

  const handleSwatchClick = useCallback(
    (swatch: PaletteSwatch) => {
      if (colorReplaceState.isActive && "select-target" === colorReplaceState.step && colorReplaceState.sourceColor) {
        onColorReplace(colorReplaceState.sourceColor, swatch);
      } else {
        onHighlightColor(swatch.color);
        onColorSelect(swatch);
      }
    },
    [colorReplaceState, onColorReplace, onHighlightColor, onColorSelect],
  );

  const [sortMode, setSortMode] = useState<"hue" | "key">("hue");
  const [viewMode, setViewMode] = useState<"grid" | "wheel">("grid");
  const [customColor, setCustomColor] = useState("#ff0000");
  const [nearestMatch, setNearestMatch] = useState<{ key: string; hex: string; distance: number } | null>(null);

  const rgbSwatches = useMemo(
    () =>
      (showFullPalette ? fullPaletteColors : colors).map((entry) => {
        const rgb = hexToRgb(entry.color);
        return { key: entry.key, hex: entry.color, rgb: null != rgb ? rgb : { r: 0, g: 0, b: 0 } };
      }),
    [showFullPalette, fullPaletteColors, colors],
  );

  const handleCustomColor = useCallback(
    (hex: string) => {
      setCustomColor(hex);
      const rgb = hexToRgb(hex);
      if (!rgb || 0 === rgbSwatches.length) return;
      const nearest = findClosestPaletteColor(rgb as RgbLike, rgbSwatches);
      const distance = rgbDistance(rgb as RgbLike, nearest.rgb);
      setNearestMatch({ key: nearest.key, hex: nearest.hex, distance: Math.round(distance) });
    },
    [rgbSwatches],
  );

  const applyNearest = useCallback(() => {
    if (nearestMatch) handleSwatchClick({ key: nearestMatch.key, color: nearestMatch.hex });
  }, [nearestMatch, handleSwatchClick]);

  const sortedColors = useMemo(() => {
    const list = showFullPalette ? fullPaletteColors : colors;
    return "key" === sortMode ? [...list].sort((a, b) => compareColorKeys(a.key, b.key)) : sortColorsByHue(list);
  }, [showFullPalette, fullPaletteColors, colors, sortMode]);

  const containerClass = isDocked
    ? `w-full select-none ${className || ""}`
    : `fixed bg-gray-50/95 dark:bg-gray-900/80 rounded-xl shadow-2xl shadow-gray-200/50 border border-gray-200 dark:border-gray-600 select-none ${isActive ? "z-[60]" : "z-[50]"} ${className || ""}`;
  const bodyClass = isDocked ? "p-3" : "p-3 max-h-80 overflow-y-auto";
  const floatingStyle: CSSProperties | undefined = isDocked
    ? undefined
    : { left: position.x, top: position.y, width: "280px", maxHeight: "400px" };

  return (
    <div ref={rootRef} className={containerClass} style={floatingStyle} onClick={onActivate}>
      {!isDocked && (
        <div
          className="flex items-center justify-between p-3 bg-gray-900 text-gray-50 rounded-t-xl cursor-move"
          onMouseDown={onMouseDownHeader}
          onTouchStart={onTouchStartHeader}
        >
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">调色盘</span>
          </div>
        </div>
      )}
      <div className={bodyClass}>
        <div className="flex gap-1.5 mb-3">
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`min-h-[44px] text-xs py-1 px-2.5 rounded-md transition-colors ${"grid" === viewMode ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 active:text-gray-700"}`}
            >
              色块
            </button>
            <button
              onClick={() => setViewMode("wheel")}
              className={`min-h-[44px] text-xs py-1 px-2.5 rounded-md transition-colors ${"wheel" === viewMode ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 active:text-gray-700"}`}
            >
              色盘
            </button>
          </div>
          {"grid" === viewMode && (
            <>
              <button
                onClick={onToggleFullPalette}
                className="min-h-[44px] flex-1 text-xs py-1.5 px-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg active:bg-gray-200 dark:active:bg-gray-600 transition-colors"
              >
                {showFullPalette ? `全部 (${fullPaletteColors.length})` : `当前 (${colors.length})`}
              </button>
              <button
                onClick={() => setSortMode("hue" === sortMode ? "key" : "hue")}
                className="min-h-[44px] text-xs py-1.5 px-2.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg active:bg-gray-200 dark:active:bg-gray-600 transition-colors whitespace-nowrap"
              >
                {"hue" === sortMode ? "色相排序" : "色号排序"}
              </button>
            </>
          )}
        </div>
        {"grid" === viewMode ? (
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6">
            {sortedColors.map((entry) => {
              const isSelected = (selectedColor?.key === entry.key && selectedColor?.color === entry.color);
              const displayKey = getDisplayColorKey(entry.color, selectedColorSystem);
              const hexNoHash = entry.color.replace("#", "");
              const r = parseInt(hexNoHash.substring(0, 2), 16);
              const g = parseInt(hexNoHash.substring(2, 4), 16);
              const textColor =
                (299 * r + 587 * g + 114 * parseInt(hexNoHash.substring(4, 6), 16)) / 1e3 > 140
                  ? "text-gray-900/70"
                  : "text-white/80";
              return (
                <button
                  key={`${entry.key}-${entry.color}`}
                  onClick={() => handleSwatchClick(entry)}
                  className={`relative min-h-[44px] min-w-[44px] rounded-lg border-2 transition-all duration-150 active:scale-95 flex items-center justify-center ${isSelected ? "border-brand-500 ring-2 ring-brand-500/30 scale-105" : "border-gray-200 dark:border-gray-600 active:border-gray-400"}`}
                  style={{ backgroundColor: entry.color, aspectRatio: "1" }}
                  title={`${displayKey} (${entry.color})`}
                >
                  <span className={`text-[9px] font-bold leading-none ${textColor} select-none`}>{displayKey}</span>
                  {isSelected && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-white shadow" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <ColorPicker color={customColor} onChange={handleCustomColor} />
            {nearestMatch && (
              <div className="mt-3 p-2.5 bg-gray-100 dark:bg-gray-700 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border border-gray-300 dark:border-gray-500 flex-shrink-0"
                    style={{ backgroundColor: customColor }}
                  />
                  <svg
                    className="w-3 h-3 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div
                    className="w-6 h-6 rounded border border-gray-300 dark:border-gray-500 flex-shrink-0"
                    style={{ backgroundColor: nearestMatch.hex }}
                  />
                  <div className="text-xs text-gray-600 dark:text-gray-300 min-w-0">
                    <span className="font-semibold">{getDisplayColorKey(nearestMatch.hex, selectedColorSystem)}</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-1">{nearestMatch.hex}</span>
                  </div>
                </div>
                <button
                  onClick={applyNearest}
                  className="min-h-[44px] w-full text-xs py-1.5 rounded-lg bg-brand-500 text-white active:bg-brand-600 transition-colors"
                >
                  使用此颜色
                </button>
              </div>
            )}
          </div>
        )}
        {!isDocked && "grid" === viewMode && selectedColor && selectedColor.key !== ERASE_KEY && (
          <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center gap-2 text-xs">
              <div
                className="w-4 h-4 rounded border border-gray-300 dark:border-gray-500"
                style={{ backgroundColor: selectedColor.color }}
              />
              <span className="text-gray-700 dark:text-gray-300">
                {"当前: "}
                {getDisplayColorKey(selectedColor.color, selectedColorSystem)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ManualPalettePanel;
