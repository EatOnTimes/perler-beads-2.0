import type { CSSProperties, ReactNode } from "react";
import { hexToRgb } from "@/utils/canvas-ops";
import type { PaletteColor } from "@/utils/canvas-ops";
import { getMardHexMap } from "@/utils/color-system";
import { logger } from "@/lib/logger";

// 的转换归口（gallery/page.tsx 等经此引用）
export { ModalShell, MobilePanelDock } from "@/components/workbench/modal-shell";

// ============================================================
// — Button（原压缩导出名 A）
// ============================================================

const BUTTON_VARIANTS = {
  primary:
    "bg-brand-500 text-white active:bg-brand-600 disabled:bg-brand-500/40 disabled:text-white/70",
  secondary:
    "bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/10 disabled:opacity-40",
  ghost:
    "text-gray-700 dark:text-gray-200 active:bg-white/50 dark:active:bg-white/10 disabled:opacity-30",
  icon: "text-gray-700 dark:text-gray-200 active:bg-white/50 dark:active:bg-white/10 disabled:opacity-25",
} as const;

type ButtonVariant = keyof typeof BUTTON_VARIANTS;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** icon 变体下的正方形边长（默认 44） */
  square?: number;
  className?: string;
  children?: ReactNode;
}

/** 通用按钮（primary / secondary / ghost / icon 四种变体） */
export function Button({
  variant = "primary",
  square,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const isIcon = "icon" === variant;
  const style: CSSProperties | undefined = isIcon
    ? { width: square ?? 44, height: square ?? 44, ...rest.style }
    : rest.style;
  return (
    <button
      type="button"
      {...rest}
      style={style}
      className={`transition-colors ${
        isIcon
          ? "rounded-lg flex items-center justify-center flex-shrink-0"
          : "rounded-xl px-4 min-h-[44px] text-sm font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
      } ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// ============================================================
// — formatTimestamp（原压缩导出名 r）
// ============================================================

/** 生成 YYYYMMDD-HHMMSS 格式时间戳（用于导出文件名） */
export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// ============================================================
// — 主页 chunk 异步入口（无压缩导出名）
// ============================================================

/**
 * 原代码: `Promise.resolve().then(r.bind(r, 7973))`
  * 这是 webpack 为 app/page 生成的懒加载 chunk 入口。
 * Next.js App Router 构建时会自动生成等价物，业务侧无需调用；保留占位以对照。
 */
export function ensureHomePageChunkLoaded(): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return Promise.resolve().then(() => import("@/app/page"));
}

// ============================================================
// — 色号比较 & 全色调色板（原压缩导出名 a / V）
// ============================================================

/** 比较 "A10" 形式的色号：字母按 localeCompare、数字按数值（原压缩导出名 a） */
export function compareColorKeys(a: string, b: string): number {
  const pattern = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(pattern);
  const matchB = b.match(pattern);
  if (matchA && matchB) {
    const lettersA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const lettersB = matchB[1];
    const numB = parseInt(matchB[2], 10);
    return lettersA !== lettersB ? lettersA.localeCompare(lettersB) : numA - numB;
  }
  return a.localeCompare(b);
}

/**
 * 全量 MARD 调色板（原压缩导出名 V）：
 * 由色板系统 hex 映射构建 [{key: hex, hex, rgb}]，无效 hex 跳过并告警。
 */
export const fullMardPalette: PaletteColor[] = Object.entries(
  getMardHexMap() as Record<string, string>,
)
  .map(([mardKey, hex]) => {
    const rgb = hexToRgb(hex);
    return rgb
      ? { key: hex, hex, rgb }
      : (logger.warn("Invalid hex code, skipping", { hex, mardKey }), null);
  })
  .filter((entry): entry is PaletteColor => null !== entry);

/** 别名：其他模块按 allPaletteColors / ALL_COLORS / FULL_BEAD_PALETTE 引用同一份全量色板 */
export const allPaletteColors = fullMardPalette;
export const ALL_COLORS = fullMardPalette;
export const FULL_BEAD_PALETTE = fullMardPalette;

/** 别名：page.tsx 按 formatFileTimestamp 引用 */
export { formatTimestamp as formatFileTimestamp };

// ============================================================
// — ERASE 常量（原压缩导出名 tO / K）
// ============================================================

/** 擦除单元格的 key（原压缩导出名 tO） */
export const ERASE_KEY = "ERASE";

/** 擦除单元格（透明格）默认值（原压缩导出名 K） */
export const ERASE_CELL = {
  key: ERASE_KEY,
  color: "#FFFFFF",
  isExternal: true,
} as const;
