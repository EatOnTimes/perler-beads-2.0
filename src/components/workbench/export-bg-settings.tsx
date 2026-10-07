"use client";
// 导出设置：背景色板（含自定义）+ 品牌文字设置
import { ColorSwatches } from "./custom-palette-modal";
import { BrandWatermarkSettings } from "./brand-watermark";
import { EXPORT_BACKDROP_COLORS } from "./recolor-guide";
import type { ExportConfig } from "@/utils/watermark"; // config 即渲染配置（区域992）

export interface ExportBackgroundSettingsProps {
  config: ExportConfig;
  update: (patch: Partial<ExportConfig>) => void;
}

export function ExportBackgroundSettings({ config, update }: ExportBackgroundSettingsProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">背景</div>
        <ColorSwatches
          swatches={EXPORT_BACKDROP_COLORS}
          selected={config.backgroundColor}
          onSelect={(color: string) => update({ backgroundColor: color })}
          allowCustom={true}
          onCustomChange={(color: string) => update({ backgroundColor: color })}
        />
      </div>
      <div>
        <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">品牌文字</div>
        <BrandWatermarkSettings
          config={config as unknown as Parameters<typeof BrandWatermarkSettings>[0]["config"]}
          update={update as unknown as Parameters<typeof BrandWatermarkSettings>[0]["update"]}
        />
      </div>
    </div>
  );
}

export default ExportBackgroundSettings;
