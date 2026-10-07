// 区域: 211.js 模块 1866 L103-201（291 色装载与色板工具函数）
// 函数命名对照 1.x 版 src/utils/colorSystemUtils.ts：
//   v1 → colorSystemOptions   _S → convertColorKeyToHex   q2 → convertPaletteToColorSystem
//   lW → getColorKeyByHex     TR → getDisplayColorKey     H0 → getMardToHexMapping
//   mF → sortColorsByHue
// 291 色数据不内联，统一从 @/app/colorSystemMapping.json 导入（与线上逐字节一致）。
import colorSystemMapping from "@/app/colorSystemMapping.json";

// 定义色号系统类型并导出（1.x 同名）
export type ColorSystem = "MARD" | "COCO" | "漫漫" | "盼盼" | "咪小窝";

// 色板颜色（1.x PaletteColor 的宽松版：转换时通过展开保留其余字段）
export interface PaletteColor {
  key: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
  [extra: string]: any;
}

// 集成决策：各转换函数的 colorSystem 参数放宽为 string（调用方传入的是 state 中的
// string 值），有效值仍为 ColorSystem 联合的五个键，映射表查不到时走各函数的 fallback。
type ColorMapping = Record<string, Record<string, string>>;
const typedColorSystemMapping = colorSystemMapping as ColorMapping;

// 色号系统选项（压缩导出 v1）
export const colorSystemOptions: { key: ColorSystem; name: string }[] = [
  { key: "MARD", name: "MARD" },
  { key: "COCO", name: "COCO" },
  { key: "漫漫", name: "漫漫" },
  { key: "盼盼", name: "盼盼" },
  { key: "咪小窝", name: "咪小窝" },
];

// 获取所有 MARD 色号到 hex 值的映射（用于向后兼容）（压缩导出 H0）
export function getMardToHexMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  Object.entries(typedColorSystemMapping).forEach(([hex, colorData]) => {
    const mardKey = colorData.MARD;
    if (mardKey) {
      mapping[mardKey] = hex;
    }
  });
  return mapping;
}

// 将色板转换到指定色号系统（压缩导出 q2）
export function convertPaletteToColorSystem(
  palette: PaletteColor[],
  colorSystem: string
): PaletteColor[] {
  return palette.map((color) => {
    const colorMapping = typedColorSystemMapping[color.hex];
    if (colorMapping && colorMapping[colorSystem]) {
      return {
        ...color,
        key: colorMapping[colorSystem],
      };
    }
    return color; // 如果找不到映射，保持原样
  });
}

// 获取指定色号系统的显示键 - 基于hex值的简化版本（压缩导出 TR）
export function getDisplayColorKey(hexValue: string, colorSystem: string): string {
  // 对于特殊键（如透明键），直接返回原键
  if (hexValue === "ERASE" || hexValue.length === 0 || hexValue === "?") {
    return hexValue;
  }

  // 标准化hex值（确保大写）
  const normalizedHex = hexValue.toUpperCase();

  // 通过hex值从colorSystemMapping获取目标色号系统的值
  const colorMapping = typedColorSystemMapping[normalizedHex];
  if (colorMapping && colorMapping[colorSystem]) {
    return colorMapping[colorSystem];
  }

  return "?"; // 如果找不到映射，返回 '?'
}

// 将色号键转换到hex值（支持任意色号系统）（压缩导出 _S）
export function convertColorKeyToHex(displayKey: string, colorSystem: string): string {
  // 如果已经是hex值，直接返回
  if (displayKey.startsWith("#") && displayKey.length === 7) {
    return displayKey.toUpperCase();
  }

  // 在colorSystemMapping中查找对应的hex值
  for (const [hex, mapping] of Object.entries(typedColorSystemMapping)) {
    if (mapping[colorSystem] === displayKey) {
      return hex;
    }
  }

  return displayKey; // 如果找不到映射，返回原键
}

// 通过hex值获取指定色号系统的色号（压缩导出 lW）
export function getColorKeyByHex(hexValue: string, colorSystem: string): string {
  // 标准化hex值（确保大写）
  const normalizedHex = hexValue.toUpperCase();

  // 查找映射
  const mapping = typedColorSystemMapping[normalizedHex];
  if (mapping && mapping[colorSystem]) {
    return mapping[colorSystem];
  }

  // 如果找不到映射，返回 '?'
  return "?";
}

// 将hex颜色转换为HSL（仅本模块内部使用）
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  // 移除 # 符号
  const cleanHex = hex.replace("#", "");

  // 转换为RGB
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / diff + 2) / 6;
        break;
      case b:
        h = ((r - g) / diff + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

// 按色相排序颜色（压缩导出 mF）
export function sortColorsByHue<T extends { color: string }>(colors: T[]): T[] {
  return colors.slice().sort((a, b) => {
    const hslA = hexToHsl(a.color);
    const hslB = hexToHsl(b.color);

    // 首先按色相排序
    if (Math.abs(hslA.h - hslB.h) > 5) {
      // 增加色相容差，让更相近的色相归为一组
      return hslA.h - hslB.h;
    }

    // 色相相近时，按明度排序（从浅到深）
    if (Math.abs(hslA.l - hslB.l) > 3) {
      return hslB.l - hslA.l; // 浅色（高明度）在前，深色（低明度）在后
    }

    // 明度也相近时，按饱和度排序（高饱和度在前，让鲜艳的颜色更突出）
    return hslB.s - hslA.s;
  });
}

/* —— 集成兼容别名（调用方命名 ↔ 本文件导出名）—— */
export {
  colorSystemOptions as COLOR_SYSTEMS, // about-modal 调用名（原 v1）
  getDisplayColorKey as getColorCode, // about-modal 调用名
  getDisplayColorKey as getColorDisplayKey, // page.tsx 调用名（原 TR）
  getMardToHexMapping as getMardHexMap,
  getMardToHexMapping as getMardColorHexMap, // bits 调用名（原 H0）
  convertPaletteToColorSystem as mapPaletteToColorSystem, // page.tsx 调用名（原 q2）
  sortColorsByHue as sortColorsBySystem, // page.tsx 调用名（原 mF）
};
