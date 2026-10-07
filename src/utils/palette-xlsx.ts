// chunk: lazy-384.js 模块 6384 L1-123（色板配置 xlsx 导入/导出）
//
// 依赖映射：
// r(2093) → npm 包 exceljs。
//     `workbook.xlsx.load(buffer)`、`addWorksheet/addRow/getRow/getCell`、
//     `cell.fill = {type:"pattern", pattern:"solid", fgColor:{argb}}`、`cell.font/alignment` ——
//     全部是 ExcelJS 独有 API（SheetJS/xlsx 为 XLSX.utils.book_* + XLSX.write，无 Workbook 构造类，
//     且社区版不支持单元格填充色/字体样式，无法还原导出样式）。故本模块使用 exceljs 而非 xlsx 包，
//     详见 docs/research/agent-K-report.md 的偏离说明。
// r(1866)   → @/utils/color-system（lW→getColorKeyByHex、_S→convertColorKeyToHex）
// r(5947).v → @/lib/logger（logger）

import { Workbook } from "exceljs";
import type { ExportArtifact } from "@/utils/export-errors";
import { allPaletteColors } from "@/utils/bundle-misc";
import { formatTimestamp } from "@/utils/bundle-misc";
import { getColorKeyByHex, convertColorKeyToHex } from "@/utils/color-system";
import { logger } from "@/lib/logger";

export interface PaletteXlsxImportResult {
  /** hex(大写) → 是否启用 */
  selections: Record<string, boolean>;
  /** hex(大写) → 库存数量（仅当文件含“库存”列时存在） */
  inventory?: Record<string, number>;
}

/**
 * 导出当前色板选择为 xlsx：色号列按当前系统色号自然排序，单元格底色 = 颜色 hex，
 * 字色按明度自动取深/浅，附“启用”“库存数量（可选）”两列。
 */
export async function exportPaletteXlsx(
  selections: Record<string, boolean>,
  inventory: Record<string, number> | undefined | null,
  colorSystem: string
): Promise<ExportArtifact> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("色板配置");
  sheet.columns = [
    { header: "色号", key: "code", width: 12 },
    { header: "启用", key: "enabled", width: 8 },
    { header: "库存数量（可选）", key: "count", width: 16 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11 };
  headerRow.alignment = { horizontal: "center" };
  const sortedColors = [...allPaletteColors].sort((a, b) =>
    getColorKeyByHex(a.hex, colorSystem).localeCompare(getColorKeyByHex(b.hex, colorSystem), undefined, { numeric: true })
  );
  for (const color of sortedColors) {
    const hex = color.hex.toUpperCase();
    const code = getColorKeyByHex(hex, colorSystem);
    const enabled = selections[hex] ? "是" : "否";
    const count = inventory?.[hex] ?? 0;
    const row = sheet.addRow({ code, enabled, count });
    const hexCompact = hex.replace("#", "");
    row.getCell("code").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF" + hexCompact },
    };
    const red = parseInt(hexCompact.substring(0, 2), 16);
    const luminance = (299 * red + 587 * parseInt(hexCompact.substring(2, 4), 16) + 114 * parseInt(hexCompact.substring(4, 6), 16)) / 1e3;
    row.getCell("code").font = {
      color: { argb: luminance > 140 ? "FF333333" : "FFFFFFFF" },
      bold: true,
    };
    row.getCell("enabled").alignment = { horizontal: "center" };
    row.getCell("count").alignment = { horizontal: "center" };
  }
  return {
    blob: new Blob([await workbook.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename: `色板配置-${colorSystem}_${formatTimestamp()}.xlsx`,
  };
}

/**
 * 解析导入的色板 xlsx：识别「色号」「启用」列（必需）与「库存」前缀列（可选）。
 * 色号经 convertColorKeyToHex 反查 hex，无法识别的行计数并告警跳过；
 * 启用值接受 是/1/yes/true（忽略大小写）。
 */
export async function importPaletteXlsx(file: File, colorSystem: string): Promise<PaletteXlsxImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(1);
  if (!sheet) throw Error("文件中没有找到工作表");
  const headerRow = sheet.getRow(1);
  let codeColumn = -1;
  let enabledColumn = -1;
  let countColumn = -1;
  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value ?? "").trim();
    if (text === "色号") codeColumn = colNumber;
    if (text === "启用") enabledColumn = colNumber;
    if (text.startsWith("库存")) countColumn = colNumber;
  });
  if (codeColumn === -1) throw Error("未找到「色号」列");
  if (enabledColumn === -1) throw Error("未找到「启用」列");
  const knownHexes = new Set(allPaletteColors.map((color) => color.hex.toUpperCase()));
  const selections: Record<string, boolean> = {};
  for (const hex of knownHexes) selections[hex] = false;
  const inventory: Record<string, number> | undefined = countColumn !== -1 ? {} : undefined;
  let skipped = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const code = String(row.getCell(codeColumn).value ?? "").trim();
    if (!code) return;
    const hex = convertColorKeyToHex(code, colorSystem);
    if (!hex || !knownHexes.has(hex)) {
      skipped++;
      return;
    }
    const enabledText = String(row.getCell(enabledColumn).value ?? "").trim();
    selections[hex] =
      enabledText === "是" ||
      enabledText === "1" ||
      enabledText.toLowerCase() === "yes" ||
      enabledText.toLowerCase() === "true";
    if (inventory && countColumn !== -1) {
      const count = Number(row.getCell(countColumn).value);
      if (!isNaN(count) && count >= 0) inventory[hex] = Math.round(count);
    }
  });
  if (skipped > 0) logger.warn("导入时跳过了无法识别的色号", { skipped });
  return { selections, inventory };
}
