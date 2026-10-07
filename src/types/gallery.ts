// 区域: gallery.js(chunk235)/m4240 L436-678（作品数据结构与分享码封装）、m3622 L201-220（列表接口载荷）
// 画廊作品类型定义。字段与线上 v2 载荷一一对应：
//  - 公开作品: { v:2, access:"public", title, width, height, palette, keys, grid }
//  - 私密作品: { v:2, access:"private", title, width, height, palette, grid, encryptedKeys, contact? }
//  - 列表/详情接口额外携带 id 与 createdAt

/** 私密作品的加密色号键（PBKDF2-SHA256 / AES-GCM-128；加解密实现见 m4240，归 utils/image-ops.ts） */
export interface EncryptedKeysPayload {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
  algo: string;
}

/** 画廊作品（列表项与详情共用；公开作品含 keys，私密作品含 encryptedKeys / contact） */
export interface GalleryWork {
  v?: number; // TODO(类型): 载荷版本号，线上恒为 2
  id: number;
  title: string;
  access: "public" | "private";
  width: number;
  height: number;
  palette: string[];
  grid: string; // 每格 2 位十六进制色号字符串，255 = 空格
  keys?: string[] | null;
  encryptedKeys?: EncryptedKeysPayload | null;
  contact?: string;
  createdAt: string;
}

/** GET /api/gallery/list 响应（m3622 的分页加载逻辑读取 works / hasMore 字段） */
export interface GalleryListResponse {
  works: GalleryWork[];
  hasMore: boolean;
}

/** 分享码解析结果（m4240.YO parseShareCode 的返回；password 非空表示私密作品的解锁码） */
export interface ParsedShareCode {
  id: number;
  password: string | null;
}
