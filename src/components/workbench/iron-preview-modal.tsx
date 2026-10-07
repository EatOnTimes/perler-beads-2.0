
"use client";

import { useEffect } from "react";
import { useArtifactGeneration } from "./bits"; // 原 R()
import { Button } from "@/utils/bundle-misc";
import { ShareArtifactPanel } from "@/utils/share"; // 原 g
import type { ExportConfig } from "@/utils/watermark";
import type { ExportArtifact } from "@/utils/export-errors";

export interface IronPreviewModalProps {
  config: ExportConfig;
  onDownload: () => Promise<ExportArtifact>;
}

/** * 烫豆预览图生成 / 下载 */
export function IronPreviewModal({ config, onDownload }: IronPreviewModalProps) {
  const { phase, artifact, message, generate, clear } = useArtifactGeneration();
  useEffect(() => {
    clear();
  }, [clear, config, onDownload]);
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        onClick={() => {
          generate(onDownload, {
            generating: "正在生成烫豆预览图…",
            ready: "预览图已生成，并已尝试自动下载。",
            manual: "预览图已生成，请点击「保存到设备」。",
            error: "烫豆预览图生成失败，请稍后重试",
          });
        }}
        disabled={"generating" === phase}
        title="生成并下载预览图"
        className="w-full text-xs text-brand-600 dark:text-brand-300"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {"generating" === phase ? "生成中…" : artifact ? "重新生成预览图" : "生成并下载预览图"}
      </Button>
      <ShareArtifactPanel phase={phase} artifact={artifact} message={message} openKind="image" onDismiss={clear} />
    </div>
  );
}

export default IronPreviewModal;
