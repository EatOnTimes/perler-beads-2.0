
import { useEffect, useState } from "react";
import { shareArtifact, openArtifact } from "./export-errors";
import type { ExportArtifact } from "./export-errors";

/** 分享 / 生成阶段 */
export type SharePhase = "idle" | "generating" | "ready" | "error";

export interface ShareArtifactPanelProps {
  phase: SharePhase;
  artifact: ExportArtifact | null;
  message: string;
  openKind?: "image" | "file";
  onDismiss?: () => void;
  className?: string;
}

/** * 契约规范名 shareArtwork：系统分享 + 下载兜底 */
export { shareArtifact as shareArtwork } from "./export-errors";

/** * 导出样式 → 中文名 */
export const EXPORT_STYLE_LABELS: Record<string, string> = {
  magazine: "简白",
  cute: "手账",
  film: "胶片",
};

/** * 导出样式列表 */
export const EXPORT_STYLES: string[] = ["magazine", "cute", "film"];

/** * 分享 / 保存状态面板 */
export function ShareArtifactPanel({
  phase,
  artifact,
  message,
  openKind = "file",
  onDismiss,
  className = "",
}: ShareArtifactPanelProps) {
  const [localMessage, setLocalMessage] = useState("");
  const [isError, setIsError] = useState(false);
  useEffect(() => {
    setLocalMessage("");
    setIsError(false);
  }, [artifact, message]);
  if ("idle" === phase) return null;
  const shownMessage = localMessage || message;
  const handleSave = async () => {
    if (!artifact) return;
    try {
      const outcome = await shareArtifact(artifact);
      setIsError(false);
      setLocalMessage(
        "shared" === outcome
          ? "系统分享已完成，文件仍保留在此处。"
          : "download-attempted" === outcome
            ? `已尝试开始下载；若没有反应，请点击「${"image" === openKind ? "打开图片" : "打开文件"}」。`
            : "已取消保存，文件仍保留在此处。"
      );
    } catch (err) {
      setIsError(true);
      setLocalMessage(err instanceof Error ? err.message : "保存失败，请使用打开文件入口");
    }
  };
  return (
    <div
      aria-live="polite"
      className={`rounded-xl border px-3 py-2.5 text-sm ${
        "error" === phase || isError
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
          : "border-brand-200 bg-brand-50/70 text-gray-700 dark:border-brand-900/60 dark:bg-brand-900/20 dark:text-gray-200"
      } ${className}`}
    >
      <div className="flex items-start gap-2">
        {"generating" === phase && (
          <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        )}
        <span className="min-w-0 flex-1">{shownMessage}</span>
        {onDismiss && "generating" !== phase && (
          <button
            type="button"
            onClick={onDismiss}
            className="-my-2 -mr-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-xs opacity-70 active:opacity-100"
          >
            关闭
          </button>
        )}
      </div>
      {artifact && "ready" === phase && (
        <>
          <div className="mt-1 truncate text-xs opacity-70">
            {artifact.filename} ·{" "}
            {artifact.blob.size < 1024
              ? `${artifact.blob.size} B`
              : artifact.blob.size < 1048576
                ? `${(artifact.blob.size / 1024).toFixed(1)} KB`
                : `${(artifact.blob.size / 1024 / 1024).toFixed(1)} MB`}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[44px] rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white active:bg-brand-700"
            >
              保存到设备
            </button>
            <button
              type="button"
              onClick={() => {
                if (!artifact) return;
                try {
                  openArtifact(artifact);
                  setIsError(false);
                  setLocalMessage(
                    "image" === openKind
                      ? "已打开图片；手机上可长按图片保存。"
                      : "已在新页面打开文件；若浏览器无法预览，请使用「保存到设备」。"
                  );
                } catch (err) {
                  setIsError(true);
                  setLocalMessage(err instanceof Error ? err.message : "文件打开失败");
                }
              }}
              className="min-h-[44px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:active:bg-gray-700"
            >
              {"image" === openKind ? "打开图片" : "打开文件"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* —— 集成兼容别名 —— */
export { ShareArtifactPanel as ExportArtifactCard }; // color-palette-panel 调用名（原区域02 g）
