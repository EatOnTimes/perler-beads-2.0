import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// —— 模块级常量

/** * 空白画布尺寸预设 */
const BLANK_CANVAS_PRESETS: { label: string; cols: number; rows: number }[] = [
  { label: "1:1", cols: 29, rows: 29 },
  { label: "4:3", cols: 40, rows: 30 },
  { label: "3:4", cols: 30, rows: 40 },
  { label: "16:9", cols: 48, rows: 27 },
];

/** 欢迎页吉祥物像素画：拼豆小猫（28×26 网格，0=空格） */
const MASCOT_PIXELS: number[] = [
  0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 2, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 2, 0, 0, 0, 0,
  0, 0, 0, 0, 2, 1, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 1, 2, 0, 0, 0, 0,
  0, 0, 0, 2, 1, 3, 3, 1, 2, 0, 2, 2, 2, 2, 2, 2, 2, 2, 0, 2, 1, 3, 3, 1, 2, 0, 0, 0,
  0, 0, 0, 2, 1, 3, 3, 3, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 3, 3, 3, 1, 2, 0, 0, 0,
  0, 0, 0, 2, 1, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 1, 2, 0, 0, 0,
  0, 0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0,
  0, 0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0,
  0, 0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0,
  0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0,
  0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0,
  0, 0, 2, 1, 1, 1, 6, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 6, 1, 1, 1, 2, 0, 0,
  0, 2, 1, 1, 1, 1, 5, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 5, 1, 1, 1, 1, 2, 0,
  0, 2, 1, 1, 1, 1, 5, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 5, 1, 1, 1, 1, 2, 0,
  0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0,
  0, 2, 1, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 1, 2, 0,
  0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0,
  0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0,
  0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0,
  0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0,
  0, 0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0,
  0, 0, 0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

/** 吉祥物调色板：拼豆小猫 */
const MASCOT_COLORS: Record<number, string> = {
  1: "#FFE3B8",
  2: "#C9884F",
  3: "#FF9DC6",
  4: "#FF7BAC",
  5: "#4A2C2A",
  6: "#FFFFFF",
};

// TODO(类型): 与 @/components/providers 的 useConfirm 返回类型对齐
type ConfirmFn = (options: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) => Promise<boolean>;

/** * 切换到开源版的确认弹窗文案 */
export const SWITCH_TO_OPEN_SOURCE_CONFIRM = {
  title: "切换到开源版？",
  message:
    "开源版与本版数据不互通 — 切换后本设备上的作品和设置不会跟随。建议先在本版下载图纸或导出 CSV 保存。",
  confirmLabel: "继续切换",
  cancelLabel: "取消",
};

/** * 弹确认框后打开开源版站点 */
export async function confirmSwitchToOpenSource(confirm: ConfirmFn): Promise<boolean> {
  const confirmed = await confirm(SWITCH_TO_OPEN_SOURCE_CONFIRM);
  if (confirmed) {
    window.open("https://perlerbeadsold.zippland.com", "_blank", "noopener,noreferrer");
  }
  return confirmed;
}

interface WelcomeScreenProps {
  isMounted: boolean;
  onUpload: () => void;
  onCreateBlankCanvas: (cols: number, rows: number) => void;
  onOpenCustomPalette: () => void;
  selectedColorSystemLabel: string;
  selectedPaletteCount: number;
}

/** 欢迎屏：品牌标语 + 吉祥物 + 入口（上传/空白画布/社区画廊/分享码导入） */
export function WelcomeScreen({
  isMounted,
  onUpload,
  onCreateBlankCanvas,
  onOpenCustomPalette,
  selectedColorSystemLabel,
  selectedPaletteCount,
}: WelcomeScreenProps) {
  const router = useRouter();
  // 当前展开的入口区块："blank" | "share" | null
  const [expandedEntry, setExpandedEntry] = useState<"blank" | "share" | null>(null);

  const submitShareCode = (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (code) {
      router.push(`/?gallery=${encodeURIComponent(code)}`);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-14 max-w-2xl w-full sm:w-auto">
        <div className="flex-shrink-0 w-fit animate-welcome-mascot">
          <div
            className="grid gap-[1px] sm:gap-[2px]"
            style={{ gridTemplateColumns: "repeat(28, auto)" }}
          >
            {MASCOT_PIXELS.map((pixel, index) => (
              <div
                key={index}
                className="w-[6px] h-[6px] sm:w-[9px] sm:h-[9px] rounded-full"
                style={
                  pixel
                    ? {
                        backgroundColor: MASCOT_COLORS[pixel],
                        boxShadow: "inset 0 -1px 2px rgba(0,0,0,0.15)",
                      }
                    : { backgroundColor: "rgba(209,213,219,0.15)" }
                }
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:gap-6 w-full sm:w-auto items-center sm:items-start animate-welcome-content">
          <div className="space-y-1.5 sm:space-y-2 text-center sm:text-left">
            <div className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100 tracking-wide">
              豆你玩
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              拼豆底稿生成器 <span className="text-brand-500 font-semibold">2.0</span>
            </div>
            <div className="text-sm sm:text-[15px] font-medium text-brand-600 dark:text-brand-400 tracking-widest mt-2 sm:mt-3">
              让像素创意属于每一个人
            </div>
          </div>
          <div className="flex flex-col items-center w-full max-w-72">
            <button
              onClick={isMounted ? onUpload : undefined}
              className="w-full min-h-[48px] sm:min-h-[52px] px-4 py-3 sm:py-3.5 bg-brand-500 text-gray-50 text-sm font-semibold rounded-lg active:bg-brand-600 transition-colors"
            >
              上传图片 / 导入底稿
            </button>
            <div className="flex items-center justify-center gap-2 sm:gap-3 mt-4 sm:mt-5 text-xs sm:text-[13px] flex-wrap">
              <button
                onClick={() => setExpandedEntry(e => (e === "blank" ? null : "blank"))}
                className={
                  "min-h-[44px] px-1 font-medium transition-colors " +
                  (expandedEntry === "blank"
                    ? "text-brand-500"
                    : "text-brand-600 dark:text-brand-400 active:text-brand-500")
                }
              >
                空白画布创建
              </button>
              <span className="text-gray-400 dark:text-gray-500">·</span>
              <Link
                href="/gallery"
                className="flex min-h-[44px] items-center px-1 text-brand-600 dark:text-brand-400 font-medium active:text-brand-500 transition-colors"
              >
                社区画廊
              </Link>
              <span className="text-gray-400 dark:text-gray-500">·</span>
              <button
                onClick={() => setExpandedEntry(e => (e === "share" ? null : "share"))}
                className={
                  "min-h-[44px] px-1 font-medium transition-colors " +
                  (expandedEntry === "share"
                    ? "text-brand-500"
                    : "text-brand-600 dark:text-brand-400 active:text-brand-500")
                }
              >
                分享码导入
              </button>
            </div>
            {expandedEntry === "blank" && (
              <div className="flex items-center justify-center gap-3 mt-3 text-[13px]">
                {BLANK_CANVAS_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => onCreateBlankCanvas(preset.cols, preset.rows)}
                    className="min-h-[44px] px-3 py-1.5 text-gray-950/50 dark:text-gray-400 font-medium rounded active:text-brand-500 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
            {expandedEntry === "share" && (
              <div className="flex items-center justify-center gap-1.5 mt-3">
                <input
                  id="share-code-input"
                  type="text"
                  autoFocus
                  placeholder="分享码"
                  maxLength={16}
                  className="min-h-[44px] w-40 px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-600 bg-transparent text-gray-950 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-brand-500 transition-colors font-mono text-center tracking-wider uppercase"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      submitShareCode(e.currentTarget.value);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.getElementById("share-code-input");
                    if (input) {
                      submitShareCode((input as HTMLInputElement).value);
                    }
                  }}
                  className="min-h-[44px] min-w-[44px] px-2.5 py-1.5 text-xs text-brand-500 active:text-brand-600 transition-colors"
                >
                  →
                </button>
              </div>
            )}
            <button
              onClick={onOpenCustomPalette}
              className="mt-4 min-h-[44px] px-2 text-xs text-gray-500 dark:text-gray-400 active:text-brand-500 transition-colors sm:mt-5"
            >
              色板 {selectedColorSystemLabel} · {selectedPaletteCount} 色
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WelcomeScreen;
