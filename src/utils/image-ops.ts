
import type { PixelGrid, PixelCell } from "./watermark";

/** 分享密码字符集（原模块内 a） */
const SHARE_PASSWORD_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** 分享数据（v2 格式，公开 / 私有两种） */
export interface ShareData {
  v: 2;
  access: "public" | "private";
  title: string;
  width: number;
  height: number;
  palette: string[];
  grid: string;
  keys?: string[];
  encryptedKeys?: EncryptedPayload;
  contact?: string;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
  algo: string;
}

/** * 随机 6 位分享密码 */
export function generateSharePassword(): string {
  const chars: string[] = [];
  const random = new Uint32Array(6);
  crypto.getRandomValues(random);
  for (let i = 0; i < 6; i++) chars.push(SHARE_PASSWORD_ALPHABET[random[i] % SHARE_PASSWORD_ALPHABET.length]);
  return chars.join("");
}

/** * 数字 → 大写 36 进制 */
export function toBase36(value: number): string {
  return value.toString(36).toUpperCase();
}

/** 36 进制串 → 数字，非法返回 null（原模块内 o） */
function fromBase36(text: string): number | null {
  const value = parseInt(text.trim(), 36);
  return isNaN(value) || value <= 0 ? null : value;
}

/** * id [+ 前缀] → 分享码 */
export function formatShareCode(id: number, prefix?: string | null): string {
  const encoded = toBase36(id);
  return prefix ? `${prefix}${encoded}` : encoded;
}

/** * 解析分享码：短码=纯 id；长码=前 6 位密码 + id */
export function parseShareCode(code: string): { id: number; password: string | null } | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.length < 7) {
    const id = fromBase36(normalized);
    return null !== id ? { id, password: null } : null;
  }
  const prefix = normalized.slice(0, 6);
  const idPart = normalized.slice(6);
  for (const ch of prefix) {
    if (!SHARE_PASSWORD_ALPHABET.includes(ch)) return null;
  }
  const id = fromBase36(idPart);
  return null === id ? null : { id, password: prefix };
}

/** Uint8Array → base64（原模块内 c） */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** base64 → Uint8Array（原模块内 d） */
function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** PBKDF2 派生 AES-GCM 密钥（原模块内 u） */
async function deriveAesKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** JSON 明文 → AES-GCM 密文（原模块内 x） */
async function encryptText(plaintext: string, password: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, 1e5);
  return {
    ciphertext: bytesToBase64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(plaintext)))),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    iterations: 1e5,
    algo: "PBKDF2-SHA256/AES-GCM-128",
  };
}

/** AES-GCM 密文 → 明文（原模块内 h） */
async function decryptText(payload: EncryptedPayload, password: string): Promise<string> {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const key = await deriveAesKey(password, salt, payload.iterations);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, ciphertext as unknown as BufferSource);
  return new TextDecoder().decode(plaintext);
}

/** 色号数组加密（原模块内 g） */
async function encryptKeys(keys: string[], password: string): Promise<EncryptedPayload> {
  return encryptText(JSON.stringify(keys), password);
}

/** 色号数组解密（原模块内 m） */
async function decryptKeys(payload: EncryptedPayload, password: string): Promise<string[]> {
  const parsed = JSON.parse(await decryptText(payload, password));
  if (!Array.isArray(parsed)) throw Error("invalid-keys-payload");
  return parsed;
}

/** 像素网格 → 调色板 + 索引网格（原模块内 y） */
function encodePixelGrid(grid: PixelGrid): { width: number; height: number; palette: string[]; keys: string[]; grid: string } {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const colorKeyIndex = new Map<string, number>();
  const palette: string[] = [];
  const keys: string[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = grid[row][col];
      if (!cell || cell.isExternal || "ERASE" === cell.key) continue;
      const compositeKey = `${cell.color}|${cell.key}`;
      if (!colorKeyIndex.has(compositeKey)) {
        colorKeyIndex.set(compositeKey, palette.length);
        palette.push(cell.color);
        keys.push(cell.key);
      }
    }
  }
  const encoded: string[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = grid[row][col];
      if (!cell || cell.isExternal || "ERASE" === cell.key) {
        encoded.push("ff");
      } else {
        const index = colorKeyIndex.get(`${cell.color}|${cell.key}`) ?? 255;
        encoded.push(index.toString(16).padStart(2, "0"));
      }
    }
  }
  return { width, height, palette, keys, grid: encoded.join("") };
}

/** * 构建公开分享数据 */
export function buildPublicShareData(grid: PixelGrid, title: string): ShareData {
  const { width, height, palette, keys, grid: encodedGrid } = encodePixelGrid(grid);
  return {
    v: 2,
    access: "public",
    title,
    width,
    height,
    palette,
    keys,
    grid: encodedGrid,
  };
}

/** * * 构建加密（私有）分享数据 */
export async function buildPrivateShareData(grid: PixelGrid, title: string, password: string, contact?: string): Promise<ShareData> {
  const { width, height, palette, keys, grid: encodedGrid } = encodePixelGrid(grid);
  return {
    v: 2,
    access: "private",
    title,
    width,
    height,
    palette,
    grid: encodedGrid,
    encryptedKeys: await encryptKeys(keys, password),
    ...(contact ? { contact } : {}),
  };
}

/** * 解码分享数据 → 像素网格 */
export async function decodeShareData(data: ShareData, password?: string | null): Promise<{ pixelData: PixelCell[][]; width: number; height: number }> {
  let keys: string[];
  if ("public" === data.access) {
    if (!data.keys) throw Error("missing-keys");
    keys = data.keys;
  } else {
    if (!data.encryptedKeys) throw Error("missing-keys");
    if (!password) throw Error("password-required");
    try {
      keys = await decryptKeys(data.encryptedKeys, password);
    } catch {
      throw Error("wrong-password");
    }
  }
  const blankCell: PixelCell = { key: "ERASE", color: "#FFFFFF", isExternal: true };
  const pixelData: PixelCell[][] = [];
  for (let row = 0; row < data.height; row++) {
    const rowCells: PixelCell[] = [];
    for (let col = 0; col < data.width; col++) {
      const offset = (row * data.width + col) * 2;
      const index = parseInt(data.grid.slice(offset, offset + 2), 16);
      if (255 === index || index >= data.palette.length) {
        rowCells.push({ ...blankCell });
      } else {
        rowCells.push({ key: keys[index], color: data.palette[index] });
      }
    }
    pixelData.push(rowCells);
  }
  return { pixelData, width: data.width, height: data.height };
}

/** * 生成画廊 markdown */
export function buildGalleryMarkdown(data: ShareData): string {
  const accessSuffix = "private" === data.access ? " | private" : "";
  const colorCount = data.keys?.length ?? data.palette.length;
  const serialized = JSON.stringify(data);
  return [`**${data.title}** | ${data.width}x${data.height} | ${colorCount} colors${accessSuffix}`, "", "```json:perler-gallery-data", serialized, "```"].join("\n");
}

/* —— 集成兼容别名（调用方命名 ↔ 本文件导出名）—— */
export {
  toBase36 as idToShareCode, // gallery/page.tsx 调用名（原 IW）
  formatShareCode as buildShareCode, // gallery-submit-modal 调用名（原 m2）
  parseShareCode as parseGalleryShareCode, // gallery/page.tsx 调用名（原 YO）
  decodeShareData as decryptGalleryWork, // gallery/page.tsx 调用名（原 sc）
  generateSharePassword as generateUnlockPassword, // gallery-submit-modal 调用名（原 bk）
  buildPublicShareData as buildPublicSharePayload, // gallery-submit-modal 调用名（原 SA）
  buildPrivateShareData as buildPrivateSharePayload, // gallery-submit-modal 调用名（原 UT）
  buildGalleryMarkdown as serializeGalleryBody, // gallery-submit-modal 调用名（原 L1）
};
