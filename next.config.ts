import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* 2.0 使用 public/sw.js 自定义 Service Worker（在 layout 中手动注册），不走 next-pwa */
};

export default nextConfig;
