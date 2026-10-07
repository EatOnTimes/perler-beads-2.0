"use client";
// 区域: pwa-debug.js(chunk803)/m729 L12-423（PWA 诊断页）、内联 m4004 L425-439（清理 SW 与 Cache Storage）、内联 m5473 L441-452（markPageHydrated）
// 模块引用翻译: 5703=jsx运行时(删)  9839=react  4004.C=clearSiteCaches(内联，契约未指定归属)  5473.M=markPageHydrated(内联)
// 页面为纯内联 style（无 Tailwind 类），与线上 /pwa-debug 一致，样式对象逐字保留。

import { useCallback, useEffect, useMemo, useState } from "react";

// ---- m5473: 标记页面已水合并隐藏预水合资源超时横幅（多个 chunk 均内联此副本，集成时可抽为共享工具） ----
function markPageHydrated() {
  document.documentElement.setAttribute("data-page-hydrated", "true");
  const banner = document.getElementById("prehydrate-resource-error");
  if (banner instanceof HTMLElement && banner.dataset.reason === "timeout") {
    banner.hidden = true;
    delete banner.dataset.reason;
  }
}

// ---- 内联样式令牌 ----
const cardStyle = {
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(120,113,108,0.2)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 8px 30px rgba(41,37,36,0.08)",
};
const buttonStyle = {
  minHeight: 44,
  border: 0,
  borderRadius: 12,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
} as const;

// ---- 诊断数据结构 ----
interface WorkerInfo {
  scriptURL: string;
  state: string; // ServiceWorkerState
}

interface RegistrationInfo {
  scope: string;
  updateViaCache: string;
  installing: WorkerInfo | null;
  waiting: WorkerInfo | null;
  active: WorkerInfo | null;
}

interface ResourceInfo {
  type: "css" | "script";
  url: string;
  sameOrigin: boolean;
  domPresent: boolean;
  loadState: "applied" | "fetched-not-applied" | "not-observed" | "fetched";
  responseStatus: number | null;
  durationMs: number | null;
  transferSize: number | null;
  decodedBodySize: number | null;
  likelyFromCache: boolean | null;
}

interface DiagnosisReport {
  collectedAt: string;
  page: { url: string; secureContext: boolean; online: boolean; readyState: string };
  browser: {
    userAgent: string;
    platform: string;
    vendor: string;
    language: string;
    languages: string[];
    userAgentData: any; // TODO(类型): UA-CH 为实验接口，结构 { brands, mobile, platform, highEntropy? }
  };
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
    screenWidth: number;
    screenHeight: number;
    visualViewport: { width: number; height: number; scale: number; offsetLeft: number; offsetTop: number } | null;
  };
  theme: { system: "dark" | "light"; htmlHasDarkClass: boolean; computedColorScheme: string };
  cssSupport: { height100dvh: boolean; translate: boolean; oklch: boolean };
  serviceWorker: { supported: boolean; controller: WorkerInfo | null; registrations: RegistrationInfo[]; error: string | null };
  cacheStorage: { supported: boolean; names: string[]; error: string | null };
  resources: ResourceInfo[];
}

/** * 提取 ServiceWorker 的可序列化摘要 */
function serializeWorker(worker: ServiceWorker | null): WorkerInfo | null {
  return worker ? { scriptURL: worker.scriptURL, state: worker.state } : null;
}

/** * 相对地址解析为绝对 URL，失败时原样返回 */
function resolveUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

/** * 采集浏览器 / Service Worker / 缓存 / 资源加载诊断信息 */
async function collectDiagnostics(): Promise<DiagnosisReport> {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

  const nav = navigator as any; // TODO(类型): userAgentData 不在 lib.dom 中
  let userAgentData: any = null;
  if (nav.userAgentData) {
    userAgentData = {
      brands: nav.userAgentData.brands ?? null,
      mobile: nav.userAgentData.mobile ?? null,
      platform: nav.userAgentData.platform ?? null,
    };
    if (nav.userAgentData.getHighEntropyValues) {
      try {
        userAgentData.highEntropy = await nav.userAgentData.getHighEntropyValues([
          "architecture",
          "bitness",
          "model",
          "platformVersion",
          "uaFullVersion",
          "fullVersionList",
        ]);
      } catch {
        userAgentData.highEntropy = null;
      }
    }
  }

  const swSupported = "serviceWorker" in navigator;
  let controller: WorkerInfo | null = null;
  let registrations: RegistrationInfo[] = [];
  let swError: string | null = null;
  if (swSupported) {
    controller = serializeWorker(navigator.serviceWorker.controller);
    try {
      registrations = (await navigator.serviceWorker.getRegistrations()).map((reg) => ({
        scope: reg.scope,
        updateViaCache: String(reg.updateViaCache),
        installing: serializeWorker(reg.installing),
        waiting: serializeWorker(reg.waiting),
        active: serializeWorker(reg.active),
      }));
    } catch (err) {
      swError = err instanceof Error ? err.message : String(err);
    }
  }

  const cacheSupported = "caches" in window;
  let cacheNames: string[] = [];
  let cacheError: string | null = null;
  if (cacheSupported) {
    try {
      cacheNames = await caches.keys();
    } catch (err) {
      cacheError = err instanceof Error ? err.message : String(err);
    }
  }

  const cssApiAvailable = typeof CSS !== "undefined" && typeof CSS.supports === "function";
  const visualViewport = window.visualViewport;

  return {
    collectedAt: new Date().toISOString(),
    page: {
      url: window.location.href,
      secureContext: window.isSecureContext,
      online: navigator.onLine,
      readyState: document.readyState,
    },
    browser: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      language: navigator.language,
      languages: Array.from(navigator.languages ?? [navigator.language]), // readonly → mutable
      userAgentData,
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      visualViewport: visualViewport
        ? {
            width: Number(visualViewport.width.toFixed(1)),
            height: Number(visualViewport.height.toFixed(1)),
            scale: visualViewport.scale,
            offsetLeft: visualViewport.offsetLeft,
            offsetTop: visualViewport.offsetTop,
          }
        : null,
    },
    theme: {
      system: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      htmlHasDarkClass: document.documentElement.classList.contains("dark"),
      computedColorScheme: getComputedStyle(document.documentElement).colorScheme,
    },
    cssSupport: {
      height100dvh: cssApiAvailable && CSS.supports("height", "100dvh"),
      translate: cssApiAvailable && CSS.supports("translate", "1px"),
      oklch: cssApiAvailable && CSS.supports("color", "oklch(50% 0.1 30)"),
    },
    serviceWorker: { supported: swSupported, controller, registrations, error: swError },
    cacheStorage: { supported: cacheSupported, names: cacheNames, error: cacheError },
    resources: (() => {
      const perfEntries = performance.getEntriesByType("resource");
      const perfByUrl = new Map<string, any>(); // TODO(类型): PerformanceResourceTiming & { responseStatus? }
      for (const entry of perfEntries) perfByUrl.set(resolveUrl(entry.name), entry);

      const domResources = new Map<
        string,
        { type: "css" | "script"; domPresent: boolean; applied: boolean }
      >();
      document.querySelectorAll('link[rel~="stylesheet"][href]').forEach((el) => {
        const link = el as HTMLLinkElement;
        domResources.set(resolveUrl(link.href), { type: "css", domPresent: true, applied: link.sheet !== null });
      });
      document.querySelectorAll("script[src]").forEach((el) => {
        const script = el as HTMLScriptElement;
        domResources.set(resolveUrl(script.src), { type: "script", domPresent: true, applied: false });
      });
      for (const entry of perfEntries) {
        const pathname = (() => {
          try {
            return new URL(entry.name).pathname;
          } catch {
            return entry.name;
          }
        })();
        const type = pathname.endsWith(".css") ? "css" : pathname.endsWith(".js") ? "script" : null;
        if (type && !domResources.has(resolveUrl(entry.name))) {
          domResources.set(resolveUrl(entry.name), { type, domPresent: false, applied: false });
        }
      }

      return [...domResources.entries()]
        .map(([url, info]) => {
          const perf = perfByUrl.get(url);
          const observed = perf !== undefined;
          const loadState =
            info.type === "css"
              ? info.applied
                ? "applied"
                : observed
                  ? "fetched-not-applied"
                  : "not-observed"
              : observed
                ? "fetched"
                : "not-observed";
          return {
            type: info.type,
            url,
            sameOrigin: new URL(url, window.location.href).origin === window.location.origin,
            domPresent: info.domPresent,
            loadState,
            responseStatus: typeof perf?.responseStatus === "number" ? perf.responseStatus : null,
            durationMs: perf ? Number(perf.duration.toFixed(1)) : null,
            transferSize: perf?.transferSize ?? null,
            decodedBodySize: perf?.decodedBodySize ?? null,
            likelyFromCache: perf ? perf.transferSize === 0 && perf.decodedBodySize > 0 : null,
          } satisfies ResourceInfo;
        })
        .sort((a, b) => a.type.localeCompare(b.type) || a.url.localeCompare(b.url));
    })(),
  };
}

/** * 复制文本：优先 Clipboard API，降级 execCommand */
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw Error("浏览器拒绝复制");
}

/** m4004.C: 注销本域 Service Worker 并删除本域全部 Cache Storage 缓存（契约未指定归属，先内联于本页） */
async function clearSiteCaches(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((reg) => new URL(reg.scope, window.location.href).origin === window.location.origin)
        .map((reg) => reg.unregister())
    );
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

/** * PWA / 浏览器兼容诊断页 */
export default function PwaDebugPage() {
  const [report, setReport] = useState<DiagnosisReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    markPageHydrated();
  }, []);

  const runDiagnostics = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      setReport(await collectDiagnostics());
    } catch (err) {
      setMessage(`诊断失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  const jsonText = useMemo(() => (report ? JSON.stringify(report, null, 2) : ""), [report]);

  const handleCopy = async () => {
    try {
      await copyToClipboard(jsonText);
      setMessage("诊断 JSON 已复制。");
    } catch (err) {
      setMessage(`复制失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handlePurge = async () => {
    setBusy(true);
    setMessage("正在清理旧缓存并注销 Service Worker…");
    try {
      await clearSiteCaches();
      window.setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      setMessage(`清理失败：${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
      setShowConfirm(false);
    }
  };

  const cssAllSupported = !!report && Object.values(report.cssSupport).every((v) => v === true);
  const controlledBySw = !!report && report.serviceWorker.controller !== null;

  return (
    <main
      style={{
        minHeight: "100vh",
        overflow: "auto",
        background: "#f5f3ee",
        color: "#292524",
        padding: "24px 16px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2 }}>浏览器兼容与缓存诊断</h1>
          <p style={{ margin: "8px 0 0", color: "#57534e", lineHeight: 1.6 }}>
            此页只读取当前浏览器状态。复制结果发给开发者，可定位旧浏览器、样式资源与 Service Worker 问题。
          </p>
        </header>
        <section style={cardStyle}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>快速结论</h2>
          <div style={{ display: "grid", gap: 8, lineHeight: 1.5 }}>
            <div>
              关键 CSS 能力：
              <strong>{report ? (cssAllSupported ? "全部支持" : "存在不支持项") : "检查中"}</strong>
            </div>
            <div>
              Service Worker 支持：
              <strong>{report ? (report.serviceWorker.supported ? "是" : "否") : "检查中"}</strong>
            </div>
            <div>
              当前页面受 SW 控制：
              <strong>{report ? (controlledBySw ? "是" : "否") : "检查中"}</strong>
            </div>
            <div>
              缓存数量：
              <strong>{report ? report.cacheStorage.names.length : "检查中"}</strong>
            </div>
            <div>
              CSS / JS 资源数量：
              <strong>{report ? report.resources.length : "检查中"}</strong>
            </div>
          </div>
        </section>
        <section style={cardStyle}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>操作</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              type="button"
              onClick={() => void runDiagnostics()}
              disabled={busy}
              style={{ ...buttonStyle, background: "#292524", color: "#fff" }}
            >
              {busy ? "处理中…" : "刷新诊断"}
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={!jsonText || busy}
              style={{ ...buttonStyle, background: "#d97757", color: "#fff" }}
            >
              一键复制诊断 JSON
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={busy}
              style={{ ...buttonStyle, background: "#fff", color: "#b91c1c", border: "1px solid #fecaca" }}
            >
              清除站点旧缓存并刷新
            </button>
          </div>
          {showConfirm && (
            <div
              style={{
                marginTop: 14,
                borderRadius: 12,
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                padding: 14,
                lineHeight: 1.6,
              }}
            >
              <strong>只会删除本域 Cache Storage 缓存并注销本域 Service Worker。</strong>
              <div>不会删除作品数据、localStorage、IndexedDB 或已下载文件。</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => void handlePurge()}
                  disabled={busy}
                  style={{ ...buttonStyle, background: "#b91c1c", color: "#fff" }}
                >
                  确认清理并刷新
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={busy}
                  style={{ ...buttonStyle, background: "#fff", color: "#57534e", border: "1px solid #d6d3d1" }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
          {message && (
            <p role="status" style={{ margin: "12px 0 0", color: "#57534e" }}>
              {message}
            </p>
          )}
        </section>
        <section style={cardStyle}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>诊断 JSON</h2>
          <pre
            className="selectable"
            style={{
              margin: 0,
              maxHeight: "65vh",
              overflow: "auto",
              borderRadius: 12,
              background: "#1c1917",
              color: "#f5f5f4",
              padding: 16,
              fontSize: 12,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              userSelect: "text",
            }}
          >
            {jsonText || "正在收集…"}
          </pre>
        </section>
      </div>
    </main>
  );
}
