import type { Metadata, Viewport } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Providers from "@/components/providers";
import DiagnosticBanner from "@/components/diagnostic-banner";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "豆你玩拼豆底稿生成器 2.0 | Perler Beads Generator",
  description: "上传图片，调整精细度，一键生成像素画图纸，简单实用的像素画生成工具",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "拼豆生成器",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-180x180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  userScalable: false,
};

// head 内联守卫脚本（资源加载失败/样式令牌缺失/8s 水合超时 → 显示预水合横幅）
const PRE_HYDRATION_GUARD = `
(function () {
  var failureReason = '';
  var noticeId = 'prehydrate-resource-error';

  function revealNotice(reason) {
    if (reason !== 'timeout' || !failureReason) failureReason = reason;
    var notice = document.getElementById(noticeId);
    if (notice) {
      notice.setAttribute('data-reason', failureReason);
      notice.hidden = false;
    }
  }

  function isAppStaticResource(target) {
    if (!target || !target.tagName) return false;
    var tagName = String(target.tagName).toLowerCase();
    var resourceUrl = '';
    if (tagName === 'script') resourceUrl = target.src || '';
    if (tagName === 'link' && target.rel === 'stylesheet') resourceUrl = target.href || '';
    if (!resourceUrl) return false;
    var parsed = document.createElement('a');
    parsed.href = resourceUrl;
    return parsed.origin === window.location.origin
      && parsed.pathname.indexOf('/_next/static/') === 0;
  }

  function verifyStyles() {
    try {
      var token = window.getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .replace(/\\s/g, '');
      if (!token) revealNotice('styles');
    } catch (_) {
      revealNotice('styles');
    }
    if (failureReason) revealNotice(failureReason);
  }

  window.addEventListener('error', function (event) {
    if (isAppStaticResource(event.target)) revealNotice('resource');
  }, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', verifyStyles);
  } else {
    window.setTimeout(verifyStyles, 0);
  }
  window.setTimeout(function () {
    var path = window.location.pathname;
    var needsPageMarker = path === '/'
      || path.indexOf('/gallery') === 0
      || path.indexOf('/admin') === 0
      || path.indexOf('/pwa-debug') === 0;
    var marker = needsPageMarker ? 'data-page-hydrated' : 'data-app-hydrated';
    if (document.documentElement.getAttribute(marker) !== 'true') {
      revealNotice('timeout');
    }
  }, 8000);
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="">
      <head>
        <script
          id="pre-hydration-resource-guard"
          dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_GUARD }}
        />
      </head>
      <body
        className={`${poppins.variable} ${geistMono.variable} antialiased overflow-x-hidden bg-gray-50 dark:bg-gray-950 text-gray-950 dark:text-gray-100`}
      >
        {/* SSR 预水合错误横幅（默认 hidden，守卫脚本按 reason 显示） */}
        <div
          id="prehydrate-resource-error"
          role="alert"
          hidden
          style={{
            position: "fixed",
            zIndex: 2147483647,
            top: 12,
            left: 12,
            right: 12,
            boxSizing: "border-box",
            maxWidth: 680,
            margin: "0 auto",
            padding: "14px 16px",
            border: "1px solid #fdba74",
            borderRadius: 12,
            background: "#fff7ed",
            color: "#7c2d12",
            boxShadow: "0 8px 28px rgba(0, 0, 0, 0.18)",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ display: "block", marginBottom: 3, fontSize: 15 }}>
            页面资源没有完整加载
          </strong>
          请刷新页面；若仍然异常，请打开诊断页清除旧网页缓存。作品数据不会被删除。{" "}
          <a href="/pwa-debug" style={{ color: "#9a3412", fontWeight: 700 }}>
            打开诊断页
          </a>
        </div>
        <noscript>
          <div
            role="alert"
            style={{
              position: "fixed",
              zIndex: 2147483647,
              top: 12,
              left: 12,
              right: 12,
              boxSizing: "border-box",
              maxWidth: 680,
              margin: "0 auto",
              padding: "14px 16px",
              border: "1px solid #fdba74",
              borderRadius: 12,
              background: "#fff7ed",
              color: "#7c2d12",
              boxShadow: "0 8px 28px rgba(0, 0, 0, 0.18)",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            此页面需要 JavaScript 才能生成和编辑拼豆图纸。请开启 JavaScript，或复制链接后改用系统
            Safari / Chrome 打开。
          </div>
        </noscript>
        <Providers>
          <DiagnosticBanner />
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
