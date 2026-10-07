
/** 导出产物（图片 / 文件） */
export interface ExportArtifact {
  blob: Blob;
  filename: string;
}

/** 系统分享结果 */
export type ShareOutcome = "shared" | "download-attempted" | "cancelled";

/** * 触发浏览器下载 */
export function downloadArtifact(artifact: ExportArtifact): void {
  const url = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } catch (err) {
    anchor.remove();
    URL.revokeObjectURL(url);
    throw err;
  }
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1e3);
}

/** * 系统分享，失败时回退下载 */
export async function shareArtifact(artifact: ExportArtifact): Promise<ShareOutcome> {
  let shareData: (File & { title?: string }) | undefined;
  let canShare = false;
  try {
    if ("undefined" != typeof File) {
      shareData = Object.assign(
        new File([artifact.blob], artifact.filename, { type: artifact.blob.type || "application/octet-stream" }),
        { title: artifact.filename }
      );
    }
    canShare = !!shareData && "function" == typeof navigator.share && "function" == typeof navigator.canShare && navigator.canShare({ files: [shareData] });
  } catch {
    canShare = false;
  }
  if (canShare && shareData) {
    try {
      await navigator.share({ files: [shareData], title: artifact.filename });
      return "shared";
    } catch (err) {
      if ("object" == typeof err && null !== err && "name" in err && "AbortError" === err.name) return "cancelled";
    }
  }
  downloadArtifact(artifact);
  return "download-attempted";
}

/** * 新标签页打开 Blob */
export function openArtifact(artifact: ExportArtifact): void {
  const url = URL.createObjectURL(artifact.blob);
  let win: Window | null;
  try {
    win = window.open(url, "_blank");
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  if (!win) {
    URL.revokeObjectURL(url);
    throw Error("浏览器阻止了新页面，请允许弹窗后重试");
  }
  try {
    win.opener = null;
  } catch {}
  const timer = window.setInterval(() => {
    try {
      if (!win!.closed) return;
    } catch {}
    window.clearInterval(timer);
    URL.revokeObjectURL(url);
  }, 1e3);
}

/** * canvas.toBlob 的 Promise 封装，60 秒超时 */
export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(Error("图片生成超时，请关闭色号统计或缩小图纸后重试"));
    }, 6e4);
    try {
      canvas.toBlob(
        (blob) => {
          window.clearTimeout(timeoutId);
          if (blob) resolve(blob);
          else reject(Error("图片生成失败：浏览器无法编码当前画布，请关闭色号统计或缩小图纸后重试"));
        },
        type,
        quality
      );
    } catch (err) {
      window.clearTimeout(timeoutId);
      reject(err instanceof Error ? err : Error("图片生成失败"));
    }
  });
}

/** * data:URL → Blob */
export function dataURLtoBlob(dataURL: string): Blob {
  const commaIndex = dataURL.indexOf(",");
  if (commaIndex < 0) throw Error("图片数据无效，请重新生成后再试");
  const meta = dataURL.slice(0, commaIndex);
  const base64 = dataURL.slice(commaIndex + 1);
  const mime = meta.match(/:(.*?);/)?.[1] ?? "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* —— 集成兼容别名（调用方命名 ↔ 本文件导出名）—— */
export {
  downloadArtifact as triggerDownload, // color-palette-panel 调用名（原 bk）
  downloadArtifact as downloadBlobFile, // page.tsx 调用名（原 bk）
  dataURLtoBlob as dataUrlToBlob, // completion-card 调用名（原 aU）
};
