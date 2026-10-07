"use client";
// 区域: gallery.js(chunk235)/m3622 L17-390（画廊页 + 作品详情弹窗）、m4234 L400-434（作品缩略图画布）、内联 m5473 L751-762（markPageHydrated）
// 模块引用翻译:
//   5703=jsx运行式(删)  9839=react  9729=next/navigation(useRouter)  4524=next/link
// 4240.IW=idToShareCode、4240.YO=parseShareCode → @/utils/image-ops

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ModalShell } from "@/utils/bundle-misc";
import { idToShareCode, parseShareCode } from "@/utils/image-ops";
import type { GalleryWork, GalleryListResponse } from "@/types/gallery";

/** * m5473: 标记页面已水合并隐藏预水合资源超时横幅 */
function markPageHydrated() {
  document.documentElement.setAttribute("data-page-hydrated", "true");
  const banner = document.getElementById("prehydrate-resource-error");
  if (banner instanceof HTMLElement && banner.dataset.reason === "timeout") {
    banner.hidden = true;
    delete banner.dataset.reason;
  }
}

/** 作品缩略图：将 grid/palette 绘制为居中的方形像素画（m4234） */
function WorkThumbCanvas({ work, size }: { work: GalleryWork; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height, palette, grid } = work;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);
    const cell = Math.min(size / width, size / height);
    const offsetX = (size - width * cell) / 2;
    const offsetY = (size - height * cell) / 2;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const index = parseInt(grid.slice((row * width + col) * 2, (row * width + col) * 2 + 2), 16);
        if (index === 255 || index >= palette.length) continue;
        ctx.fillStyle = palette[index];
        ctx.fillRect(offsetX + col * cell, offsetY + row * cell, cell + 0.5, cell + 0.5);
      }
    }
  }, [work, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="max-w-full max-h-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

/** * 相对时间格式化：刚刚 / N分钟前 / N小时前 / N天前 / zh-CN 日期 */
function formatRelativeTime(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}天前` : new Date(iso).toLocaleDateString("zh-CN");
}

interface WorkDetailModalProps {
  work: GalleryWork;
  onClose: () => void;
}

/** 作品详情弹窗（m3622 内的 g）：预览大图、色彩统计、私密作品分享码解锁 */
function WorkDetailModal({ work, onClose }: WorkDetailModalProps) {
  const router = useRouter();
  const [shareInput, setShareInput] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const drawPreview = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { width, height, grid, palette } = work;
      const scale = Math.min(500 / width, 500 / height);
      const canvasWidth = Math.ceil(width * scale);
      const canvasHeight = Math.ceil(height * scale);
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const cellWidth = canvasWidth / width;
      const cellHeight = canvasHeight / height;
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const index = parseInt(grid.slice((row * width + col) * 2, (row * width + col) * 2 + 2), 16);
          if (index === 255 || index >= palette.length) continue;
          ctx.fillStyle = palette[index];
          ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth + 0.5, cellHeight + 0.5);
        }
      }
    },
    [work]
  );

  const handleUnlock = () => {
    const code = shareInput.trim().toUpperCase();
    if (!code) return;
    const parsed = parseShareCode(code);
    if (parsed && parsed.password !== null) {
      if (parsed.id !== work.id) {
        setUnlockError("此分享码不属于当前作品");
      } else {
        setUnlockError("");
        router.push(`/?gallery=${code}`);
      }
    } else {
      setUnlockError("分享码格式不正确，请粘贴作者给你的完整分享码");
    }
  };

  // 渲染期统计各色号数量并按出现次数降序
  const colorStats = (() => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < work.grid.length; i += 2) {
      const index = parseInt(work.grid.slice(i, i + 2), 16);
      if (index !== 255 && index < work.palette.length) {
        counts[index] = (counts[index] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([indexStr, count]) => ({
        index: parseInt(indexStr),
        color: work.palette[parseInt(indexStr)],
        key: work.keys?.[parseInt(indexStr)] ?? null,
        count,
      }));
  })();
  const totalBeads = colorStats.reduce((sum, stat) => sum + stat.count, 0);
  const isPrivate = work.access === "private";

  return (
    <ModalShell isOpen={true} onClose={onClose} maxWidth="max-w-2xl">
      <div className="bg-gray-50 dark:bg-gray-800 p-6 flex items-center justify-center rounded-t-2xl">
        <canvas
          ref={drawPreview}
          className="max-w-full max-h-[50vh]"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <span className="truncate">{work.title}</span>
              {isPrivate && (
                <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] tracking-[0.1em] uppercase text-brand-500 border border-brand-500/50 rounded">
                  私密
                </span>
              )}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
              分享码 <span className="font-mono font-semibold text-brand-500">{idToShareCode(work.id)}</span> · {work.width}×{work.height} · {formatRelativeTime(work.createdAt)}
            </div>
          </div>
          {isPrivate ? (
            <button
              onClick={() => {
                setShowUnlock((v) => !v);
                setUnlockError("");
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white active:bg-brand-600 transition-colors flex-shrink-0"
            >
              {showUnlock ? "收起" : "输入分享码导入"}
            </button>
          ) : (
            <button
              onClick={() => {
                router.push(`/?gallery=${idToShareCode(work.id)}`);
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white active:bg-brand-600 transition-colors flex-shrink-0"
            >
              导入到画布
            </button>
          )}
        </div>
        {isPrivate && showUnlock && (
          <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/40 space-y-2">
            <div className="text-[11px] text-orange-700 dark:text-orange-300 leading-relaxed">
              这是一个私密作品。请向作者获取分享码，粘贴后即可解锁导入。
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareInput}
                onChange={(e) => {
                  setShareInput(e.target.value.toUpperCase());
                  if (unlockError) setUnlockError("");
                }}
                placeholder="粘贴完整分享码"
                maxLength={16}
                autoFocus={true}
                className="flex-1 px-3 py-2 text-sm font-mono tracking-wider text-center rounded-lg border border-orange-200 dark:border-orange-900/60 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-brand-500 transition-colors uppercase"
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              />
              <button
                onClick={handleUnlock}
                disabled={!shareInput.trim()}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-brand-500 text-white active:bg-brand-600 transition-colors disabled:opacity-50"
              >
                解锁
              </button>
            </div>
            {unlockError && (
              <div className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed">{unlockError}</div>
            )}
          </div>
        )}
        {isPrivate && work.contact && (
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
            <div className="text-[10px] text-gray-600 dark:text-gray-300 mb-1">购买方式 / 联系方式</div>
            <div className="text-xs text-gray-700 dark:text-gray-200 break-all whitespace-pre-wrap">{work.contact}</div>
          </div>
        )}
        <div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            {colorStats.length} 色{totalBeads > 0 ? ` · ${totalBeads} 颗` : ""}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {colorStats.slice(0, 30).map((stat) => (
              <div
                key={stat.index}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
              >
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: stat.color }} />
                {stat.key && <span className="text-[10px] text-gray-600 dark:text-gray-400">{stat.key}</span>}
                {stat.count > 0 && (
                  <span className="text-[10px] text-gray-500 dark:text-gray-500">×{stat.count}</span>
                )}
              </div>
            ))}
            {colorStats.length > 30 && (
              <div className="text-[10px] text-gray-600 dark:text-gray-300 self-center">+{colorStats.length - 30}</div>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-xs text-gray-500 rounded-lg active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
        >
          关闭
        </button>
      </div>
    </ModalShell>
  );
}

type GalleryFilter = "all" | "public";

/** 社区画廊页（m3622 的 default export u） */
export default function GalleryPage() {
  const [works, setWorks] = useState<GalleryWork[]>([]);
  const [nextPage, setNextPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedWork, setSelectedWork] = useState<GalleryWork | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<GalleryFilter>("all");

  useEffect(() => {
    markPageHydrated();
  }, []);

  // 拉取列表：单次最多连续翻 5 页，直至无更多或累计 >= 20 条
  const loadWorks = useCallback(async (startPage: number, filter: GalleryFilter, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setLoadError(false);
    }
    try {
      const collected: GalleryWork[] = [];
      let page = startPage;
      let more = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await fetch(`/api/gallery/list?page=${page}&per_page=20`);
        if (!res.ok) throw Error("fetch_failed");
        const data: GalleryListResponse = await res.json();
        const filtered = data.works.filter((w) => filter === "all" || w.access === "public");
        collected.push(...filtered);
        more = data.hasMore;
        page++;
        if (!data.hasMore || collected.length >= 20) break;
      }
      setWorks((prev) => (append ? [...prev, ...collected] : collected));
      setHasMore(more);
      setNextPage(page);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadWorks(1, filter, false);
  }, [loadWorks, filter]);

  const loadMore = () => loadWorks(nextPage, filter, true);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 font-[family-name:var(--font-poppins)]">
      <header className="sticky top-0 z-40 w-full border-b border-gray-200/70 dark:border-gray-800/70 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur">
        <div className="mx-auto w-full max-w-screen-xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 active:opacity-70 transition-opacity">
              <div className="grid grid-cols-2 gap-1 p-2 rounded-lg bg-gray-50/90 dark:bg-gray-800/90 border border-gray-200/60 dark:border-gray-800/50 shadow-sm shadow-gray-200/50">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="w-2 h-2 rounded-full bg-pink-400" />
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="leading-tight text-left">
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">豆你玩</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">社区画廊</div>
              </div>
            </Link>
          </div>
          <Link
            href="/"
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 active:bg-gray-200 transition-colors"
          >
            返回编辑器
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-screen-xl px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm text-gray-400">加载中...</div>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 px-4">
            <svg
              className="w-12 h-12 text-gray-300 dark:text-gray-700"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center">画廊暂时无法加载，请稍后再试</div>
            <button
              onClick={() => loadWorks(1, filter, false)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
            >
              重试
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-end mb-4">
              <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5">
                {(
                  [
                    ["all", "全部"],
                    ["public", "仅公开"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      filter === value
                        ? "bg-brand-500 text-white"
                        : "text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {works.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="grid grid-cols-2 gap-1 p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                  <span className="w-3 h-3 rounded-sm bg-brand-500/60" />
                  <span className="w-3 h-3 rounded-sm bg-accent-blue/60" />
                  <span className="w-3 h-3 rounded-sm bg-accent-green/60" />
                  <span className="w-3 h-3 rounded-sm bg-gray-400/60" />
                </div>
                <div className="text-sm text-gray-400">
                  {filter === "public" ? "当前没有公开作品" : "还没有作品，成为第一个分享的人吧"}
                </div>
                {hasMore ? (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 active:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? "加载中..." : "加载更多"}
                  </button>
                ) : filter === "all" ? (
                  <Link
                    href="/"
                    className="px-4 py-2 text-sm rounded-lg bg-brand-500 text-white active:bg-brand-600 transition-colors"
                  >
                    去创作
                  </Link>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {works.map((work) => (
                    <button
                      key={work.id}
                      onClick={() => setSelectedWork(work)}
                      className="group rounded-xl border border-gray-200/60 dark:border-gray-800/50 bg-white dark:bg-gray-900 overflow-hidden shadow-sm active:shadow-none transition-all text-left"
                    >
                      <div className="relative aspect-square bg-gray-50 dark:bg-gray-800 p-3 flex items-center justify-center">
                        <WorkThumbCanvas work={work} size={200} />
                        {work.access === "private" && (
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] tracking-[0.1em] uppercase text-gray-50 bg-brand-500 rounded shadow-sm">
                            私密
                          </div>
                        )}
                      </div>
                      <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-800">
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{work.title}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          #{work.id} · {work.width}×{work.height} · {work.palette.length}色
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="px-6 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 active:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? "加载中..." : "加载更多"}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {selectedWork && <WorkDetailModal work={selectedWork} onClose={() => setSelectedWork(null)} />}
      </div>
    </div>
  );
}
