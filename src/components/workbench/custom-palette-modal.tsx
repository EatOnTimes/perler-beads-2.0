import { useCallback, useEffect, useRef, useState } from "react";
// 小函数来自 ./bits：en → rgbToHex，eo → hexToRgb，es → hsvToRgb
import { rgbToHex, hexToRgbArray as hexToRgb, hsvToRgb } from "./bits"; // eo=区域19 返回 [r,g,b] 元组

// RGB(0-255) → HSV（h: 0-360, s: 0-100, v: 0-100）
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255,
    gg = g / 255,
    bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const diff = max - Math.min(rr, gg, bb);
  return [
    0 === diff
      ? 0
      : max === rr
        ? ((gg - bb) / diff + 6 * Number(gg < bb)) * 60
        : max === gg
          ? ((bb - rr) / diff + 2) * 60
          : ((rr - gg) / diff + 4) * 60,
    0 === max ? 0 : (diff / max) * 100,
    100 * max,
  ];
}

// RGB(0-255) → HSL（h: 0-360, s: 0-100, l: 0-100）（源中 ColorPicker 内的 IIFE）
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255,
    gg = g / 255,
    bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, 100 * l];
  const diff = max - min;
  return [
    360 *
      (max === rr
        ? ((gg - bb) / diff + 6 * Number(gg < bb)) / 6
        : max === gg
          ? ((bb - rr) / diff + 2) / 6
          : ((rr - gg) / diff + 4) / 6),
    100 * (l > 0.5 ? diff / (2 - max - min) : diff / (max + min)),
    100 * l,
  ];
}

// HSL（h: 0-360, s: 0-100, l: 0-100）→ RGB(0-255)（源中 ColorPicker HSL 输入的内联实现）
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = l / 100;
  const chroma = (s / 100) * Math.min(a, 1 - a);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return a - chroma * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

// HSV 颜色选择器（饱和度/明度面板 + 色相条 + HEX/RGB/HSL 输入）
export function ColorPicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (hex: string) => void;
}) {
  const [hsv, setHsv] = useState<[number, number, number]>(() => {
    const rgb = hexToRgb(color);
    return rgb ? rgbToHsv(...rgb) : [0, 100, 100];
  });
  const [hexText, setHexText] = useState(color.toLowerCase());
  const svAreaRef = useRef<HTMLDivElement | null>(null);
  const hueBarRef = useRef<HTMLDivElement | null>(null);
  const isDraggingSV = useRef(false);
  const isDraggingHue = useRef(false);
  const [hue, sat, val] = hsv;
  const rgb = hsvToRgb(hue, sat, val);
  const hex = rgbToHex(...rgb);
  const hsl = rgbToHsl(...rgb);

  useEffect(() => {
    if (color.toLowerCase() !== hex.toLowerCase()) {
      const nextRgb = hexToRgb(color);
      if (nextRgb) {
        setHsv(rgbToHsv(...nextRgb));
        setHexText(color.toLowerCase());
      }
    }
  }, [color]);

  // 由 HSV 更新全部状态并回调
  const updateFromHsv = useCallback(
    (h: number, s: number, v: number) => {
      setHsv([h, s, v]);
      const nextHex = rgbToHex(...hsvToRgb(h, s, v));
      setHexText(nextHex);
      onChange(nextHex);
    },
    [onChange]
  );

  // 指针坐标 → 饱和度/明度百分比
  const getSVFromPointer = useCallback((clientX: number, clientY: number): [number, number] => {
    const rect = svAreaRef.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      Math.max(0, Math.min(100, (1 - (clientY - rect.top) / rect.height) * 100)),
    ];
  }, []);

  const handleSvPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const [s, v] = getSVFromPointer(e.clientX, e.clientY);
      updateFromHsv(hue, s, v);
      isDraggingSV.current = true;
      svAreaRef.current?.setPointerCapture(e.pointerId);
    },
    [hue, getSVFromPointer, updateFromHsv]
  );

  const handleSvPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingSV.current) return;
      const [s, v] = getSVFromPointer(e.clientX, e.clientY);
      updateFromHsv(hue, s, v);
    },
    [hue, getSVFromPointer, updateFromHsv]
  );

  const handleSvPointerUp = useCallback(() => {
    isDraggingSV.current = false;
  }, []);

  // 指针坐标 → 色相
  const getHueFromPointer = useCallback((clientX: number) => {
    const rect = hueBarRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
  }, []);

  const handleHuePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      updateFromHsv(getHueFromPointer(e.clientX), sat, val);
      isDraggingHue.current = true;
      hueBarRef.current?.setPointerCapture(e.pointerId);
    },
    [sat, val, getHueFromPointer, updateFromHsv]
  );

  const handleHuePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDraggingHue.current) updateFromHsv(getHueFromPointer(e.clientX), sat, val);
    },
    [sat, val, getHueFromPointer, updateFromHsv]
  );

  const handleHuePointerUp = useCallback(() => {
    isDraggingHue.current = false;
  }, []);

  // HEX 输入
  const handleHexChange = (value: string) => {
    setHexText(value);
    const nextRgb = hexToRgb(value);
    if (nextRgb) updateFromHsv(...rgbToHsv(...nextRgb));
  };

  // RGB 通道输入
  const handleRgbChannelChange = (index: number, value: number) => {
    const clamped = Math.max(0, Math.min(255, isNaN(value) ? 0 : value));
    const next: [number, number, number] = [...rgb];
    next[index] = clamped;
    updateFromHsv(...rgbToHsv(...next));
  };

  // HSL 通道输入
  const handleHslChannelChange = (index: number, value: number) => {
    const max = 0 === index ? 360 : 100;
    const clamped = Math.max(0, Math.min(max, isNaN(value) ? 0 : value));
    const next: [number, number, number] = [hsl[0], hsl[1], hsl[2]];
    next[index] = clamped;
    updateFromHsv(...rgbToHsv(...hslToRgb(...next)));
  };

  const numberInputClass =
    "w-full px-1 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-center outline-none focus:border-brand-500 text-[11px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <div className="space-y-3">
      <div
        ref={svAreaRef}
        className="relative rounded-lg cursor-crosshair touch-none select-none overflow-hidden"
        style={{ width: 224, height: 144 }}
        onPointerDown={handleSvPointerDown}
        onPointerMove={handleSvPointerMove}
        onPointerUp={handleSvPointerUp}
      >
        <div
          className="absolute inset-0"
          style={{ backgroundColor: `hsl(${Math.round(hue)},100%,50%)` }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to right, #fff, transparent)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent, #000)" }}
        />
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{
            left: `${sat}%`,
            top: `${100 - val}%`,
            transform: "translate(-50%, -50%)",
            backgroundColor: hex,
          }}
        />
      </div>
      <div
        ref={hueBarRef}
        className="relative rounded-full cursor-crosshair touch-none select-none"
        style={{
          width: 224,
          height: 14,
          background:
            "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
        }}
        onPointerDown={handleHuePointerDown}
        onPointerMove={handleHuePointerMove}
        onPointerUp={handleHuePointerUp}
      >
        <div
          className="absolute top-1/2 w-3 h-3 rounded-full border-2 border-white shadow pointer-events-none"
          style={{
            left: `${(hue / 360) * 100}%`,
            transform: "translate(-50%, -50%)",
            backgroundColor: `hsl(${Math.round(hue)},100%,50%)`,
          }}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 w-7 flex-shrink-0">
            HEX
          </span>
          <input
            value={hexText}
            onChange={(e) => handleHexChange(e.target.value)}
            className={numberInputClass + " flex-1"}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 w-7 flex-shrink-0">
            RGB
          </span>
          {["R", "G", "B"].map((label, index) => (
            <input
              key={label}
              type="number"
              min={0}
              max={255}
              value={rgb[index]}
              onChange={(e) => handleRgbChannelChange(index, +e.target.value)}
              placeholder={label}
              className={numberInputClass + " flex-1"}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 w-7 flex-shrink-0">
            HSL
          </span>
          {(
            [
              ["H", Math.round(hsl[0]), 360],
              ["S", Math.round(hsl[1]), 100],
              ["L", Math.round(hsl[2]), 100],
            ] as [string, number, number][]
          ).map(([label, value, max]) => (
            <input
              key={label}
              type="number"
              min={0}
              max={max}
              value={value}
              onChange={(e) =>
                handleHslChannelChange(
                  label === "H" ? 0 : label === "S" ? 1 : 2,
                  +e.target.value
                )
              }
              placeholder={label}
              className={numberInputClass + " flex-1"}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// 十六进制颜色忽略大小写比较
export const hexEquals = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export interface ColorSwatch {
  color: string;
  name?: string;
}

// 色板色块选择器（circle/square 两种形态，allowCustom 时附展开式自定义取色器）
export function ColorSwatches({
  swatches,
  selected,
  onSelect,
  shape = "square",
  allowCustom = false,
  onCustomChange,
  className = "",
}: {
  swatches: ColorSwatch[];
  selected: string;
  onSelect: (color: string) => void;
  shape?: "square" | "circle";
  allowCustom?: boolean;
  onCustomChange?: (hex: string) => void;
  className?: string;
}) {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const isCustomValue = allowCustom && !swatches.some((s) => hexEquals(s.color, selected));

  return "circle" === shape ? (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {swatches.map((swatch) => (
        <button
          key={swatch.color}
          type="button"
          title={swatch.name}
          aria-label={swatch.name ?? swatch.color}
          onClick={() => onSelect(swatch.color)}
          className="flex h-11 w-11 items-center justify-center rounded-lg"
        >
          <span
            className={`h-7 w-7 rounded-full transition-all ${
              hexEquals(swatch.color, selected)
                ? "ring-2 ring-gray-800 dark:ring-gray-200 ring-offset-2 ring-offset-gray-50 dark:ring-offset-gray-900 scale-110"
                : "border border-gray-200 dark:border-gray-600"
            }`}
            style={{ backgroundColor: swatch.color }}
          />
        </button>
      ))}
    </div>
  ) : (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {swatches.map((swatch) => (
          <button
            key={swatch.color}
            type="button"
            onClick={() => onSelect(swatch.color)}
            className="flex min-h-[44px] min-w-[44px] flex-col items-center gap-1"
          >
            <span
              className={`w-9 h-9 rounded-lg border-2 transition-all ${
                hexEquals(swatch.color, selected)
                  ? "border-brand-500 scale-110"
                  : "border-gray-200 dark:border-gray-600"
              }`}
              style={{ backgroundColor: swatch.color }}
            />
            {swatch.name && (
              <span className="text-[10px] text-gray-600 dark:text-gray-400">{swatch.name}</span>
            )}
          </button>
        ))}
        {allowCustom && (
          <button
            type="button"
            onClick={() => setShowCustomPicker((prev) => !prev)}
            className="flex min-h-[44px] min-w-[44px] flex-col items-center gap-1"
          >
            <span
              className={`w-9 h-9 rounded-lg border-2 transition-all overflow-hidden ${
                isCustomValue || showCustomPicker
                  ? "border-brand-500 scale-110"
                  : "border-gray-200 dark:border-gray-600"
              }`}
              style={{
                background: isCustomValue
                  ? selected
                  : "conic-gradient(hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%))",
              }}
            />
            <span className="text-[10px] text-gray-600 dark:text-gray-400">自定义</span>
          </button>
        )}
      </div>
      {allowCustom && showCustomPicker && (
        <div className="mt-3">
          <ColorPicker color={selected} onChange={(hex) => onCustomChange?.(hex)} />
        </div>
      )}
    </div>
  );
}

// 数字调节行（label/help + 数字输入框）
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
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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

// 水印/导出对齐选项与尺寸钳制
export const watermarkAlignXOptions = ["left", "center", "right"];
export const watermarkAlignYOptions = ["top", "middle", "bottom"];
export const clampWatermarkSize = (value: number, min: number) =>
  Math.max(min, Math.min(300, Math.round(value)));

// ============================================================
// 已在 ./color-palette-panel.tsx 中以 ColorPalettePanel 落位（本文件为取色器组件集，
// 弹窗实体在另一文件——两组文件各为一半，按既有导出名别名接通，不重复转换）。
// AboutModal 以 ModalShell + 隐藏 xlsx input 包裹本组件（见 about-modal.tsx 对应 JSX）。
// ============================================================

export { ColorPalettePanel as CustomPaletteModal } from "./color-palette-panel";
export type { ColorPalettePanelProps as CustomPaletteModalProps } from "./color-palette-panel";
