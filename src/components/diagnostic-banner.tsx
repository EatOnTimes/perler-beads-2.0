// 区域: layout.js m3412 L237-360（default 导出）
// 资源加载诊断横幅：检测内嵌 webview / 过旧浏览器 / 样式与静态资源加载失败，
// 与 head 中的内联脚本 #pre-hydration-resource-guard（#prehydrate-resource-error 元素）联动。
"use client";

import { useEffect, useRef, useState } from "react";

type DiagReason = "webview" | "browser" | "styles" | "resource";

function hasPrehydrateResourceError() {
  const notice = document.getElementById("prehydrate-resource-error");
  return notice instanceof HTMLElement && !notice.hidden;
}

function isVersionLess(a: [number, number], b: [number, number]) {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

function matchUaVersion(ua: string, pattern: RegExp): [number, number] | null {
  const match = ua.match(pattern);
  return match?.[1] ? [Number(match[1]), Number(match[2] ?? 0)] : null;
}

function isEmbeddedWebview(ua: string) {
  const isIosAppWebview =
    /(?:iPhone|iPad|iPod).*AppleWebKit/i.test(ua) && !/Safari/i.test(ua);
  return (
    /MicroMessenger|XiaoHongShu|BytedanceWebview|Toutiao|Aweme|Weibo|Instagram|FBAN|FBAV/i.test(
      ua,
    ) || isIosAppWebview
  );
}

// 现代浏览器能力 + 最低版本门槛检测：
// 100dvh / translate / oklch / backdrop-filter 四项 CSS 能力，
// 且 iOS≥16.4 / Edge≥111 / Chrome≥111 / Firefox≥128 / Safari≥16.4
function supportsModernCss(): boolean {
  if (
    typeof window.matchMedia !== "function" ||
    typeof CSS === "undefined" ||
    typeof CSS.supports !== "function" ||
    !(
      CSS.supports("height", "100dvh") &&
      CSS.supports("translate", "1px") &&
      CSS.supports("color", "oklch(50% 0.1 30)") &&
      (CSS.supports("backdrop-filter", "blur(1px)") ||
        CSS.supports("-webkit-backdrop-filter", "blur(1px)"))
    )
  ) {
    return false;
  }
  const ua = navigator.userAgent;
  const ios = matchUaVersion(ua, /OS (\d+)[_.](\d+)/);
  if (/(?:iPhone|iPad|iPod)/.test(ua) && ios) return !isVersionLess(ios, [16, 4]);
  const edge = matchUaVersion(ua, /Edg(?:A)?\/(\d+)(?:\.(\d+))?/);
  if (edge) return !isVersionLess(edge, [111, 0]);
  const chrome = matchUaVersion(ua, /(?:Chrome|CriOS)\/(\d+)(?:\.(\d+))?/);
  if (chrome) return !isVersionLess(chrome, [111, 0]);
  const firefox = matchUaVersion(ua, /(?:Firefox|FxiOS)\/(\d+)(?:\.(\d+))?/);
  if (firefox) return !isVersionLess(firefox, [128, 0]);
  const safari = matchUaVersion(ua, /Version\/(\d+)(?:\.(\d+))?.*Safari/);
  return !safari || !isVersionLess(safari, [16, 4]);
}

// 区域: 211.js/模块 5473
// 标记页面水合完成：设 data-page-hydrated，并隐藏因超时显示的预水合错误横幅。
export function markPageHydrated() {
  document.documentElement.setAttribute("data-page-hydrated", "true");
  const notice = document.getElementById("prehydrate-resource-error");
  if (notice instanceof HTMLElement && notice.dataset.reason === "timeout") {
    notice.hidden = true;
    delete notice.dataset.reason;
  }
}

export default function DiagnosticBanner() {
  const [reason, setReason] = useState<DiagReason | null>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-app-hydrated", "true");

    const evaluate = () => {
      if (dismissedRef.current) return;
      if (hasPrehydrateResourceError()) {
        setReason(null);
      } else if (isEmbeddedWebview(navigator.userAgent)) {
        setReason("webview");
      } else if (!supportsModernCss()) {
        setReason("browser");
      } else {
        setReason(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--background")
            .trim()
            ? null
            : "styles",
        );
      }
    };

    const handleResourceError = (event: ErrorEvent) => {
      const target = event.target;
      const resourceUrl =
        target instanceof HTMLScriptElement
          ? target.src
          : target instanceof HTMLLinkElement && target.relList.contains("stylesheet")
            ? target.href
            : "";
      if (!resourceUrl) return;
      try {
        const url = new URL(resourceUrl, window.location.href);
        if (
          !dismissedRef.current &&
          url.origin === window.location.origin &&
          url.pathname.startsWith("/_next/static/")
        ) {
          if (hasPrehydrateResourceError()) {
            setReason(null);
            return;
          }
          setReason("resource");
        }
      } catch {
        // 无法解析的资源地址，忽略
      }
    };

    evaluate();
    window.addEventListener("load", evaluate);
    window.addEventListener("error", handleResourceError, true);
    const recheckTimer = window.setTimeout(evaluate, 2000);
    return () => {
      window.removeEventListener("load", evaluate);
      window.removeEventListener("error", handleResourceError, true);
      window.clearTimeout(recheckTimer);
    };
  }, []);

  if (!reason) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: "fixed",
        zIndex: 0x7fffffff,
        top: 12,
        left: 12,
        right: 12,
        boxSizing: "border-box",
        colorScheme: "light",
        maxWidth: 680,
        margin: "0 auto",
        padding: "14px 56px 14px 16px",
        border: "1px solid #fdba74",
        borderRadius: 12,
        background: "#fff7ed",
        color: "#7c2d12",
        boxShadow: "0 8px 28px rgba(0, 0, 0, 0.18)",
        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ display: "block", marginBottom: 3, fontSize: 15 }}>
        {reason === "webview"
          ? "建议用系统浏览器打开"
          : reason === "browser"
            ? "当前浏览器可能无法正确显示页面"
            : "页面资源没有完整加载"}
      </strong>
      {reason === "webview"
        ? "应用内浏览器可能限制页面样式、文件下载或图片打开。请点右上角菜单，改用 Safari 或 Chrome。"
        : reason === "browser"
          ? "请复制当前链接，改用最新版系统 Safari、Chrome 或 Firefox 打开。"
          : "请先刷新页面；若仍然异常，可打开诊断页清除旧网页缓存。"}
      {"作品处理仍全部在你的设备内完成。"}{" "}
      <a href="/pwa-debug" style={{ color: "#9a3412", fontWeight: 700 }}>
        打开诊断页
      </a>
      <button
        type="button"
        aria-label="关闭兼容性提示"
        onClick={() => {
          dismissedRef.current = true;
          setReason(null);
        }}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          width: 44,
          height: 44,
          padding: 0,
          border: 0,
          borderRadius: 8,
          background: "transparent",
          color: "#7c2d12",
          font: "inherit",
          fontSize: 22,
          lineHeight: "44px",
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
