import { useCallback, useEffect, useRef } from "react";

// 颜色按钮外圈进度环
function ProgressRing({
  progress,
  size,
  strokeWidth,
}: {
  progress: number;
  size: number;
  strokeWidth: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90 pointer-events-none"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth={strokeWidth}
      />
      {progress > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progress >= 100 ? "#22c55e" : "rgba(255,255,255,0.85)"}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (progress / 100) * circumference}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

// 专注拼豆状态（TODO(类型): 与 HomePage 侧 focusState 对齐）
interface FocusState {
  currentColor: string;
  totalElapsedTime: number;
  isPaused: boolean;
  recommendedRegion: unknown[] | null | undefined;
}

interface FocusColorItem {
  color: string;
  completed: number;
  total: number;
}

interface CurrentColorInfo {
  name: string;
  completed: number;
  total: number;
}

export interface ColorReadoutProps {
  focusState: FocusState;
  focusColors: FocusColorItem[];
  currentColorInfo: CurrentColorInfo | null | undefined;
  progressPercentage: number;
  onLocateRecommended: () => void;
  onMarkRecommended: () => void;
  onPauseToggle: () => void;
  onColorSelect: (color: string) => void;
  formatTime: (ms: number) => string;
}

export function ColorReadout({
  focusState,
  focusColors,
  currentColorInfo,
  progressPercentage,
  onLocateRecommended,
  onMarkRecommended,
  onPauseToggle,
  onColorSelect,
  formatTime,
}: ColorReadoutProps) {
  const colorListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!colorListRef.current) return;
    const current = colorListRef.current.querySelector('[data-current="true"]');
    current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [focusState.currentColor]);

  const stopTouchPropagation = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <div
        className="pointer-events-auto absolute top-3 left-3 right-3 max-w-[calc(100dvw-1.5rem)] flex items-center gap-2 h-12 px-3.5 rounded-2xl bg-gray-900/65 dark:bg-gray-950/70 backdrop-blur-xl backdrop-saturate-[1.8] border border-white/12 shadow-lg"
        onTouchStart={stopTouchPropagation}
        onTouchMove={stopTouchPropagation}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div
            className="w-7 h-7 rounded-full border-2 border-white/60 flex-shrink-0 shadow-sm"
            style={{ backgroundColor: focusState.currentColor || "#888" }}
          />
          <div className="min-w-0 leading-tight">
            <span className="text-[13px] font-semibold text-white truncate block">
              {currentColorInfo?.name || "未选择颜色"}
            </span>
            {currentColorInfo && (
              <span className="text-[11px] text-white/60">
                {currentColorInfo.completed}/{currentColorInfo.total}
                <span className="ml-1 text-white/80 font-medium">
                  {progressPercentage}%
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <span className="text-[11px] font-mono text-white/70 tabular-nums mr-1">
            {formatTime(focusState.totalElapsedTime)}
          </span>
          <button
            onClick={onPauseToggle}
            className="w-11 h-11 rounded-xl flex items-center justify-center active:bg-white/10 transition-colors"
          >
            {focusState.isPaused ? (
              <svg className="w-4.5 h-4.5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg className="w-4.5 h-4.5 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <div
        className="pointer-events-auto absolute right-3 bottom-[76px] flex flex-col gap-2"
        onTouchStart={stopTouchPropagation}
        onTouchMove={stopTouchPropagation}
      >
        <button
          onClick={onLocateRecommended}
          className="w-11 h-11 rounded-[14px] bg-gray-900/65 dark:bg-gray-950/70 backdrop-blur-xl backdrop-saturate-[1.8] border border-white/12 shadow-lg flex items-center justify-center active:scale-90 transition-transform"
        >
          <svg
            className="w-5 h-5 text-white/80"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          </svg>
        </button>
        <button
          onClick={onMarkRecommended}
          disabled={!focusState.recommendedRegion || focusState.recommendedRegion.length === 0}
          className="w-11 h-11 rounded-[14px] bg-accent-green shadow-lg flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
        >
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
      <div
        className="pointer-events-auto absolute bottom-3 left-3 right-14 max-w-[calc(100dvw-4.25rem)]"
        onTouchStart={stopTouchPropagation}
        onTouchMove={stopTouchPropagation}
      >
        <div
          ref={colorListRef}
          className="flex items-center gap-2 px-2.5 h-[56px] rounded-2xl bg-gray-900/65 dark:bg-gray-950/70 backdrop-blur-xl backdrop-saturate-[1.8] border border-white/12 shadow-lg overflow-x-auto"
          style={{
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {focusColors.map((item) => {
            const isCurrent = item.color === focusState.currentColor;
            const isDone = item.completed >= item.total && item.total > 0;
            const percent = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
            return (
              <button
                key={item.color}
                data-current={isCurrent || undefined}
                onClick={() => onColorSelect(item.color)}
                className={`relative flex-shrink-0 w-11 h-11 rounded-full transition-all duration-200 ${
                  isCurrent ? "scale-[1.15] z-10" : "active:scale-95"
                } ${isDone && !isCurrent ? "opacity-40" : ""}`}
              >
                <div
                  className={`w-full h-full rounded-full shadow-sm ${
                    isCurrent
                      ? "ring-[2.5px] ring-white ring-offset-1 ring-offset-black/50"
                      : "border border-white/20"
                  }`}
                  style={{ backgroundColor: item.color }}
                />
                <ProgressRing progress={percent} size={44} strokeWidth={2.5} />
                {isDone && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ColorReadout;

// ============================================================
// FocusSidePanel（about-modal 调用名）：与上方 ColorReadout 同源同实现
// x，L31-193 —— 集成时确认两者为同一组件的两个导出名，
// 按既有导出名别名接通，见 docs/research/integration-report.md 3.2 节同类先例。）
// ============================================================

export { ColorReadout as FocusSidePanel };
export type { ColorReadoutProps as FocusSidePanelProps };
