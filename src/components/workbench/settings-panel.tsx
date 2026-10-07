import { useEffect, useRef } from "react";
import type { ChangeEvent } from "react";
import { LabeledNumberInput, SegmentedSelect } from "@/components/workbench/bits";
import { PixelationMode } from "@/utils/canvas-ops";

interface SettingsPanelProps {
  /** 横轴切割数量（输入值） */
  granularityInput: number;
  handleGranularityInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** 颜色合并程度（输入值） */
  similarityThresholdInput: number;
  handleSimilarityThresholdInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** 参数变化后防抖确认（重新生成） */
  handleConfirmParameters: () => void;
  /** 是否已有格子对齐参考（有则隐藏切割数量） */
  hasGridAlignment: boolean;
  pixelationMode: PixelationMode;
  handlePixelationModeChange: (e: { target: { value: PixelationMode } }) => void;
  handleAutoRemoveBackground: () => void;
  hasData: boolean;
}

/** * 处理模式下拉选项 */
export const PIXELATION_MODE_OPTIONS = [
  { value: PixelationMode.Dominant, label: "卡通" },
  { value: PixelationMode.Average, label: "真实" },
];

export function SettingsPanel({
  granularityInput,
  handleGranularityInputChange,
  similarityThresholdInput,
  handleSimilarityThresholdInputChange,
  handleConfirmParameters,
  hasGridAlignment,
  pixelationMode,
  handlePixelationModeChange,
  handleAutoRemoveBackground,
  hasData,
}: SettingsPanelProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInputsRef = useRef({ g: granularityInput, s: similarityThresholdInput });

  useEffect(() => {
    if (lastInputsRef.current.g !== granularityInput || lastInputsRef.current.s !== similarityThresholdInput) {
      lastInputsRef.current = { g: granularityInput, s: similarityThresholdInput };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => handleConfirmParameters(), 800);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
  }, [granularityInput, similarityThresholdInput, handleConfirmParameters]);

  return (
    <div className="space-y-2">
      {!hasGridAlignment && (
        <LabeledNumberInput
          label="横轴切割数量"
          help="控制横向分成多少格。数值越大画布越大，拼豆数量也越多。建议 30~100。"
          value={granularityInput}
          onChange={handleGranularityInputChange}
          min={10}
          max={300}
        />
      )}
      <LabeledNumberInput
        label="颜色合并程度"
        help="自动合并相近颜色。数值越大合并越多、颜色越少。设为 0 不合并。"
        value={similarityThresholdInput}
        onChange={handleSimilarityThresholdInputChange}
        min={0}
        max={100}
      />
      <div className="flex items-center justify-between gap-3 min-h-[44px]">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">处理模式</span>
        <SegmentedSelect
          className="flex-1 max-w-[180px]"
          value={pixelationMode}
          onChange={(value) => handlePixelationModeChange({ target: { value: value as PixelationMode } })}
          options={PIXELATION_MODE_OPTIONS}
        />
      </div>
      <button
        onClick={handleAutoRemoveBackground}
        disabled={!hasData}
        className="w-full mt-1 py-2.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800 transition-colors disabled:opacity-30"
      >
        一键去除背景
      </button>
    </div>
  );
}
