
import { Zlib } from "fflate";

/** PNG CRC-32 查找表（多项式 0xEDB88320） */
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n >>> 1 ^ (1 & n ? 0xedb88320 : 0);
  return n >>> 0;
});

/** 构造 PNG 数据块：[数据长度(4B)][类型(4B)][数据][CRC32(4B)] */
function buildChunk(type: string, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) chunk[i + 4] = type.charCodeAt(i);
  chunk.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < chunk.length - 4; i++) crc = CRC_TABLE[(crc ^ chunk[i]) & 255] ^ crc >>> 8;
  view.setUint32(chunk.length - 4, (0xffffffff ^ crc) >>> 0);
  return chunk;
}

export interface PngEncoder {
  /** 写入一批物理像素行（紧密 RGBA，行长 = 宽度×4） */
  writeRows(rgbaRows: Uint8Array, rowCount: number): void;
  /** 结束编码并返回 PNG Blob（行数不足将抛错） */
  finish(): Blob;
}

/**
 * 创建流式 PNG 编码器（8bit / RGBA / Up 滤镜 / flate level 6）。
  * 源压缩导出名：createPngEncoder。
 */
export function createPngEncoder(width: number, height: number): PngEncoder {
  // IHDR：宽、高、位深 8、颜色类型 6（RGBA）
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks: Uint8Array[] = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    buildChunk("IHDR", ihdr),
  ];
  const deflate = new Zlib({ level: 6 }, (data) => {
    if (data.length) chunks.push(buildChunk("IDAT", data));
  });
  const bytesPerRow = 4 * width;
  const prevRow = new Uint8Array(bytesPerRow);
  let writtenRows = 0;
  return {
    writeRows(rgbaRows: Uint8Array, rowCount: number): void {
      if (rgbaRows.length !== bytesPerRow * rowCount || writtenRows + rowCount > height)
        throw Error("图片数据不完整，请重新生成");
      // 每行前置滤镜类型 2（Up）：当前行减上一行
      const filtered = new Uint8Array((bytesPerRow + 1) * rowCount);
      for (let i = 0; i < rowCount; i++) {
        const src = i * bytesPerRow;
        const dst = i * (bytesPerRow + 1);
        filtered[dst] = 2;
        for (let j = 0; j < bytesPerRow; j++) {
          const value = rgbaRows[src + j];
          filtered[dst + 1 + j] = value - prevRow[j];
          prevRow[j] = value;
        }
      }
      deflate.push(filtered);
      writtenRows += rowCount;
    },
    finish(): Blob {
      if (writtenRows !== height) throw Error("图片数据不完整，请重新生成");
      deflate.push(new Uint8Array(0), true);
      chunks.push(buildChunk("IEND"));
      return new Blob(chunks as unknown as BlobPart[], { type: "image/png" }); // TODO(类型): TS5.7 Uint8Array 泛型与 BlobPart 兼容
    },
  };
}
