import { useEffect, useState } from "react";
import { ModalShell } from "./modal-shell";
import {
  SegmentedControl,
  NumberField,
  ANCHOR_COLUMNS,
  ANCHOR_ROWS,
  clampGridSize,
  anchorToOffset,
} from "./bits";

export interface CanvasSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWidth: number;
  currentHeight: number;
  onApply: (
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
  ) => void;
  onStartCropSelection: () => void;
}

export function CanvasSizeModal({
  isOpen,
  onClose,
  currentWidth,
  currentHeight,
  onApply,
  onStartCropSelection,
}: CanvasSizeModalProps) {
  const [mode, setMode] = useState<"expand" | "crop">("expand");
  const [widthInput, setWidthInput] = useState(String(currentWidth));
  const [heightInput, setHeightInput] = useState(String(currentHeight));
  const [anchorX, setAnchorX] = useState<"left" | "center" | "right">("center");
  const [anchorY, setAnchorY] = useState<"top" | "middle" | "bottom">("middle");

  useEffect(() => {
    if (isOpen) {
      setWidthInput(String(currentWidth));
      setHeightInput(String(currentHeight));
      setAnchorX("center");
      setAnchorY("middle");
      setMode("expand");
    }
  }, [isOpen, currentWidth, currentHeight]);

  const newWidth = clampGridSize(parseInt(widthInput, 10) || currentWidth, currentWidth);
  const newHeight = clampGridSize(parseInt(heightInput, 10) || currentHeight, currentHeight);
  const canApply = newWidth > currentWidth || newHeight > currentHeight;
  const canCrop = currentWidth > 1 || currentHeight > 1;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="画布尺寸" maxWidth="max-w-sm">
      <div className="p-4 sm:p-6 space-y-4">
        <p className="text-xs text-gray-600 dark:text-gray-300">
          当前{" "}
          <span className="tabular-nums font-medium text-gray-700 dark:text-gray-300">
            {currentWidth}×{currentHeight}
          </span>{" "}
          格。调整会保留已绘内容，
          <strong>不可撤销</strong>。
        </p>
        <SegmentedControl
          value={mode}
          onChange={(value) => setMode(value as "crop" | "expand")}
          options={[
            { value: "expand", label: "扩大" },
            { value: "crop", label: "缩小" },
          ]}
        />
        {mode === "expand" ? (
          <>
            <NumberField
              label="宽度（列）"
              value={widthInput}
              onChange={(e) => setWidthInput(e.target.value)}
              min={currentWidth}
              max={300}
            />
            <NumberField
              label="高度（行）"
              value={heightInput}
              onChange={(e) => setHeightInput(e.target.value)}
              min={currentHeight}
              max={300}
            />
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                内容锚点
              </div>
              <p className="text-[11px] text-gray-600 dark:text-gray-300 mb-2">
                原内容停靠位置；新增空间补在另一侧。
              </p>
              <div className="inline-grid grid-cols-3 gap-1.5 p-1.5 rounded-xl bg-gray-100 dark:bg-gray-800">
                {ANCHOR_ROWS.map((row) =>
                  ANCHOR_COLUMNS.map((col) => {
                    const selected = row === anchorY && col === anchorX;
                    return (
                      <button
                        key={`${row}-${col}`}
                        type="button"
                        aria-label={`${row}-${col}`}
                        onClick={() => {
                          setAnchorY(row);
                          setAnchorX(col);
                        }}
                        className={`w-11 h-11 rounded-lg flex items-center justify-center transition-colors ${
                          selected
                            ? "bg-brand-500 text-white shadow-sm"
                            : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 active:bg-gray-200 dark:active:bg-gray-600"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-current" />
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!canApply) return void onClose();
                  const offsetX = anchorToOffset(
                    newWidth - currentWidth,
                    anchorX === "left" ? "start" : anchorX === "right" ? "end" : "center",
                  );
                  const offsetY = anchorToOffset(
                    newHeight - currentHeight,
                    anchorY === "top" ? "start" : anchorY === "bottom" ? "end" : "center",
                  );
                  onApply(newWidth, newHeight, offsetX, offsetY);
                  onClose();
                }}
                disabled={!canApply}
                className="flex-1 min-h-[44px] rounded-xl bg-brand-500 text-white text-sm font-medium active:bg-brand-600 transition-colors disabled:opacity-40"
              >
                应用 {canApply ? `→ ${newWidth}×${newHeight}` : ""}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              缩小会回到画布上框选要保留的矩形区域。确认后，框外内容会被丢弃。
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onStartCropSelection();
                  onClose();
                }}
                disabled={!canCrop}
                className="flex-1 min-h-[44px] rounded-xl bg-brand-500 text-white text-sm font-medium active:bg-brand-600 transition-colors disabled:opacity-40"
              >
                开始框选
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
