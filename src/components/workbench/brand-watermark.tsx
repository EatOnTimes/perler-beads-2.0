
"use client";

import { SliderRow as Slider } from "./bits"; // 原 ea（bits 规范名 SliderRow，此处按区域54 调用名 Slider 引用）
import type { ExportConfig } from "@/utils/watermark";

export interface BrandWatermarkSettingsProps {
  config: ExportConfig;
  update: (patch: Partial<ExportConfig>) => void;
}

/** * 品牌水印设置 */
export function BrandWatermarkSettings({ config, update }: BrandWatermarkSettingsProps) {
  return (
    <div>
      <input
        type="text"
        value={config.brandText}
        onChange={(e) => update({ brandText: e.target.value })}
        placeholder="如：@你的店铺名"
        className="w-full min-h-[44px] text-xs rounded-xl bg-white/45 dark:bg-white/10 px-3 py-2 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-brand-500/50 transition-shadow"
      />
      {config.brandText && (
        <Slider
          className="mt-1"
          label="透明度"
          min={20}
          max={100}
          step={5}
          value={Math.round((config.brandOpacity ?? 0.35) * 100)}
          onChange={(e) => update({ brandOpacity: e / 100 })}
          format={(e) => `${e}%`}
        />
      )}
      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">预览和导出都会显示在作品下方</div>
    </div>
  );
}

export default BrandWatermarkSettings;
