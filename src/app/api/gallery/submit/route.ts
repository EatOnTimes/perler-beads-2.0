// 区域: 线上 /api/gallery/submit
// 线上为服务端实现（解析提交正文中的作品数据块、写入画廊存储并返回作品 id），此处为本地桩。
// 行为对齐说明：
//  1. 客户端提交后会读响应中的 `id` 生成分享码（buildShareCode(data.id, password)
//     → toBase36(id).toString(36)），桩若不返回 id 会导致 undefined.toString 崩溃，故必须带 id。
//  2. 提交正文为 markdown（标题行 + ```json:perler-gallery-data 代码块，见 utils/image-ops.ts
//     buildGalleryMarkdown）。桩从中解析出 GalleryWork v2 载荷存入进程内存，使本地画廊页形成
//     「提交 → 列表可见 → 一键导入」闭环；线上此数据在服务端数据库中。

import { NextResponse } from "next/server";
import type { GalleryWork } from "@/types/gallery";

interface GalleryStore {
  works: GalleryWork[];
  seq: number;
}

// 进程级内存存储（dev 热重载后仍保留；与 list 路由共享）
const g = globalThis as unknown as { __perlerGalleryStore?: GalleryStore };
const store: GalleryStore = (g.__perlerGalleryStore ??= { works: [], seq: 1 });

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { title?: string; body?: string } | null;
  let work: Partial<GalleryWork> = {};
  if (body?.body) {
    // 提取 ```json:perler-gallery-data 代码块中的 v2 载荷
    const match = body.body.match(/```json:perler-gallery-data\n([\s\S]*?)\n```/);
    if (match) {
      try {
        work = JSON.parse(match[1]) as Partial<GalleryWork>;
      } catch {
        // 解析失败时按空作品入库，保持接口行为
      }
    }
  }
  const id = store.seq++;
  store.works.unshift({
    v: 2,
    id,
    title: body?.title ?? work.title ?? "未命名作品",
    access: work.access === "private" ? "private" : "public",
    width: work.width ?? 0,
    height: work.height ?? 0,
    palette: work.palette ?? [],
    grid: work.grid ?? "",
    keys: work.keys ?? null,
    encryptedKeys: work.encryptedKeys ?? null,
    contact: work.contact,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, id });
}
