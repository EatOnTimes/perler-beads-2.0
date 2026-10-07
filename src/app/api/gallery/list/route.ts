
import { NextResponse } from "next/server";
import type { GalleryWork } from "@/types/gallery";

interface GalleryStore {
  works: GalleryWork[];
  seq: number;
}

const g = globalThis as unknown as { __perlerGalleryStore?: GalleryStore };
const store: GalleryStore = (g.__perlerGalleryStore ??= { works: [], seq: 1 });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const idParam = url.searchParams.get("id");

  // 详情查询（分享码导入画布）：客户端读取响应的 work 字段
  if (idParam !== null) {
    const id = Number(idParam);
    const work = store.works.find((entry) => entry.id === id);
    if (!work) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ work });
  }

  // 分页列表（画廊页）
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = Math.max(1, Number(url.searchParams.get("per_page")) || 20);
  const start = (page - 1) * perPage;
  const slice = store.works.slice(start, start + perPage);
  // 注：画廊页(m3622)按 works / hasMore 字段解析响应；
  return NextResponse.json({ works: slice, hasMore: start + slice.length < store.works.length });
}
