import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/providers";
import { DropdownMenuItem } from "./bits";
import { confirmSwitchToOpenSource } from "./welcome-screen";

interface BackToHomeButtonProps {
  onGoHome: () => void;
  isStudioMode: boolean;
  isManualMode: boolean;
  isFocusMode: boolean;
  isRenderMode: boolean;
  canEnterEditModes: boolean;
  onEnterStudio: () => void;
  onEnterManual: () => void;
  onEnterFocus: () => void;
  onEnterRender: () => void;
  isMobileLayout: boolean;
  isWelcomeState: boolean;
  isMounted: boolean;
  hasData: boolean;
  selectedColorSystemLabel: string;
  selectedPaletteCount: number;
  onUpload: () => void;
  onOpenDownload: () => void;
  onOpenShare: () => void;
  onOpenCustomPalette: () => void;
}

export function BackToHomeButton({
  onGoHome,
  isStudioMode,
  isManualMode,
  isFocusMode,
  isRenderMode,
  canEnterEditModes,
  onEnterStudio,
  onEnterManual,
  onEnterFocus,
  onEnterRender,
  isMobileLayout,
  isWelcomeState,
  isMounted,
  hasData,
  selectedColorSystemLabel,
  selectedPaletteCount,
  onUpload,
  onOpenDownload,
  onOpenShare,
  onOpenCustomPalette,
}: BackToHomeButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 移动端菜单打开时，点击菜单外区域关闭
  useEffect(() => {
    if (!menuOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [menuOpen]);

  const confirm = useConfirm();
  const handleSwitchToOpenSource = () => {
    confirmSwitchToOpenSource(confirm);
  };
  const closeMenu = () => setMenuOpen(false);
  // 包一层：先关菜单再执行动作
  const withMenuClose = (action: () => void) => () => {
    closeMenu();
    action();
  };

  return (
    <header
      className="sticky top-0 z-40 w-full pb-1"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "calc(env(safe-area-inset-left, 0px) + clamp(0.25rem, 2vw, 1rem))",
        paddingRight: "calc(env(safe-area-inset-right, 0px) + clamp(0.25rem, 2vw, 1rem))",
      }}
    >
      <div className="glass-light rounded-2xl mx-auto w-full max-w-screen-2xl h-11 px-1 sm:px-2 flex items-center gap-1 sm:gap-3">
        <button
          onClick={onGoHome}
          aria-label="回到首页"
          className="flex items-center flex-shrink-0 active:opacity-70 min-h-[44px] min-w-[44px] justify-center rounded-lg"
          title="回到首页"
        >
          <div className="grid grid-cols-2 gap-0.5 p-1.5 rounded-lg bg-white/50 dark:bg-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </div>
        </button>
        <div className="flex-1 min-w-0 flex justify-center">
          {!isWelcomeState && (
            <div className="flex items-center gap-1">
              {[
                {
                  key: "studio",
                  label: "优化",
                  active: isStudioMode,
                  disabled: false,
                  onClick: onEnterStudio,
                },
                {
                  key: "manual",
                  label: "编辑",
                  active: isManualMode,
                  disabled: !canEnterEditModes,
                  onClick: onEnterManual,
                },
                {
                  key: "render",
                  label: "预览",
                  active: isRenderMode,
                  disabled: !canEnterEditModes,
                  onClick: onEnterRender,
                },
                {
                  key: "focus",
                  label: "拼豆",
                  active: isFocusMode,
                  disabled: !canEnterEditModes,
                  onClick: onEnterFocus,
                },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={tab.active ? undefined : tab.onClick}
                  disabled={tab.disabled}
                  aria-pressed={tab.active}
                  className={
                    "px-2.5 sm:px-4 h-11 text-[13px] rounded-xl font-medium transition-colors min-w-[44px] flex items-center justify-center whitespace-nowrap " +
                    (tab.active
                      ? "bg-brand-500 text-white"
                      : tab.disabled
                        ? "text-gray-400 dark:text-gray-600"
                        : "text-gray-700 dark:text-gray-200 active:bg-white/50 dark:active:bg-white/10")
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {isMobileLayout ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                aria-label="更多操作"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-700 dark:text-gray-200 active:bg-white/50 dark:active:bg-white/10 rounded-lg transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                >
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
              {menuOpen && (
                <div className="glass-light absolute right-0 top-full mt-1 w-48 rounded-2xl py-1 z-50 shadow-2xl">
                  <DropdownMenuItem onClick={withMenuClose(onOpenCustomPalette)}>
                    色板设置{" "}
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {selectedColorSystemLabel} · {selectedPaletteCount}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={isMounted ? withMenuClose(onUpload) : undefined}
                    disabled={!isMounted}
                  >
                    导入图片 / 底稿
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={hasData ? withMenuClose(onOpenDownload) : undefined}
                    disabled={!hasData}
                  >
                    下载图纸
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={hasData ? withMenuClose(onOpenShare) : undefined}
                    disabled={!hasData}
                    accent
                  >
                    分享到画廊
                  </DropdownMenuItem>
                  <div className="my-1 border-t border-white/40 dark:border-white/10" />
                  <Link
                    href="/gallery"
                    onClick={closeMenu}
                    className="block px-3 py-2.5 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 active:bg-white/50 dark:active:bg-white/10"
                  >
                    社区画廊
                  </Link>
                  <div className="my-1 border-t border-white/40 dark:border-white/10" />
                  <DropdownMenuItem onClick={withMenuClose(handleSwitchToOpenSource)}>
                    <span className="text-gray-600 dark:text-gray-300">开源版</span>
                  </DropdownMenuItem>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenCustomPalette}
                className="min-h-[44px] flex flex-col items-start leading-tight px-2.5 py-1 rounded-xl bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/10 transition-colors"
                title={`色板设置 · ${selectedColorSystemLabel} · ${selectedPaletteCount} 色`}
              >
                <span className="text-[10px] text-gray-600 dark:text-gray-300">
                  {selectedColorSystemLabel}
                </span>
                <span className="text-[11px] font-semibold">{selectedPaletteCount}</span>
              </button>
              <button
                onClick={isMounted ? onUpload : undefined}
                disabled={!isMounted}
                className="min-h-[44px] px-4 text-xs rounded-xl font-medium bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/10 disabled:opacity-40 disabled:cursor-wait transition-colors"
              >
                导入
              </button>
              <button
                onClick={onOpenDownload}
                disabled={!hasData}
                className="min-h-[44px] px-4 text-xs rounded-xl font-medium bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/10 disabled:opacity-40 transition-colors"
              >
                下载
              </button>
              <button
                onClick={onOpenShare}
                disabled={!hasData}
                className="min-h-[44px] px-4 text-xs rounded-xl font-semibold bg-brand-500 text-white active:bg-brand-600 disabled:bg-brand-500/40 disabled:text-white/70 transition-colors"
              >
                分享
              </button>
              <Link
                href="/gallery"
                className="min-h-[44px] flex items-center px-4 text-xs rounded-xl font-medium bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-200 active:bg-white/70 dark:active:bg-white/10 transition-colors"
              >
                画廊
              </Link>
              <button
                onClick={handleSwitchToOpenSource}
                title="切换到开源版"
                className="min-h-[44px] flex items-center px-2 text-[11px] text-gray-500 dark:text-gray-400 active:text-gray-600 transition-colors"
              >
                开源版
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default BackToHomeButton;
