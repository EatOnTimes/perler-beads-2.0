import { ModalShell } from "./modal-shell";

export interface PasteOverlayProps {
  visible: boolean;
  selectionInfo: { width: number; height: number } | null;
  pasteActive: boolean;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onClear: () => void;
}

/** 画布上方选区/粘贴操作条
  */
export function PasteOverlay({
  visible,
  selectionInfo,
  pasteActive,
  onCopy,
  onCut,
  onDelete,
  onClear,
}: PasteOverlayProps) {
  if (!visible) return null;
  const actionBtnClass =
    "px-3 min-h-[44px] text-xs font-medium rounded-xl transition-colors flex items-center";
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 animate-mode-fade">
      <div className="flex items-center gap-1 p-1 rounded-2xl glass-dark">
        {pasteActive ? (
          <>
            <span className="px-3 text-xs text-gray-300">点击画布放置粘贴内容</span>
            <button
              onClick={onClear}
              className={`${actionBtnClass} text-gray-200 active:bg-gray-700/60`}
            >
              取消
            </button>
          </>
        ) : (
          <>
            {selectionInfo && (
              <span className="px-2 text-[11px] tabular-nums text-gray-400">
                {selectionInfo.width}×{selectionInfo.height}
              </span>
            )}
            <button
              onClick={onCopy}
              className={`${actionBtnClass} text-gray-200 active:bg-gray-700/60`}
            >
              复制
            </button>
            <button
              onClick={onCut}
              className={`${actionBtnClass} text-gray-200 active:bg-gray-700/60`}
            >
              剪切
            </button>
            <button
              onClick={onDelete}
              className={`${actionBtnClass} text-red-300 active:bg-red-500/20`}
            >
              删除
            </button>
            <span className="w-px h-5 bg-gray-600/40 mx-0.5" />
            <button
              onClick={onClear}
              className={`${actionBtnClass} text-gray-400 active:bg-gray-700/60`}
            >
              取消
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** 撤销/重做浮动按钮组
  */
export function UndoRedoButtons({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  return canUndo || canRedo ? (
    <div className="absolute right-3 top-3 z-30 glass-dark rounded-lg p-1 flex items-center gap-0.5 animate-toolbar-slide-up">
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="撤销"
        aria-label="撤销"
        className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-100 active:bg-white/15 disabled:opacity-25 disabled:active:bg-transparent transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h11a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5H8" />
        </svg>
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="重做"
        aria-label="重做"
        className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-100 active:bg-white/15 disabled:opacity-25 disabled:active:bg-transparent transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9a5 5 0 0 0-5 5v1a5 5 0 0 0 5 5h7" />
        </svg>
      </button>
    </div>
  ) : null;
}

export interface StockCheckItemData {
  hex: string;
  displayKey: string;
  required: number;
  stock: number;
  deficit: number;
}

/** 库存明细行（需/存/缺）
  */
export function StockCheckItem({
  item,
  isDeficit,
}: {
  item: StockCheckItemData;
  isDeficit: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-sm ${
        isDeficit ? "bg-red-50 dark:bg-red-950/30" : ""
      }`}
    >
      <div
        className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0"
        style={{ backgroundColor: item.hex }}
      />
      <span className="font-mono text-gray-700 dark:text-gray-300 w-14 text-xs">
        {item.displayKey}
      </span>
      <span className="text-xs text-gray-600 dark:text-gray-300 ml-auto tabular-nums">
        需 {item.required}
      </span>
      <span className="text-xs tabular-nums w-14 text-right" style={{ color: undefined }}>
        <span
          className={
            isDeficit
              ? "text-red-500 dark:text-red-400 font-medium"
              : "text-gray-600 dark:text-gray-300"
          }
        >
          存 {item.stock}
        </span>
      </span>
      {isDeficit && (
        <span className="text-xs text-red-500 dark:text-red-400 font-medium tabular-nums w-14 text-right">
          缺 {item.deficit}
        </span>
      )}
    </div>
  );
}

export interface StockCheckResult {
  sufficient: boolean;
  items: StockCheckItemData[];
  totalRequired: number;
  totalDeficit: number;
}

/** 库存预检弹窗
  */
export function StockCheckModal({
  isOpen,
  checkResult,
  onConfirm,
  onSkip,
  onCancel,
}: {
  isOpen: boolean;
  checkResult: StockCheckResult | null;
  onConfirm: () => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  if (!checkResult) return null;
  const { sufficient, items, totalRequired, totalDeficit } = checkResult;
  const deficitItems = items.filter((item) => item.deficit > 0);
  const hasAnyStock = items.some((item) => item.stock > 0);
  return (
    <ModalShell isOpen={isOpen} onClose={onCancel} maxWidth="max-w-md" closeOnBackdrop={false}>
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
          {sufficient ? "库存充足" : "库存预检"}
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
          本作品共需{" "}
          <strong className="text-gray-700 dark:text-gray-300">{totalRequired.toLocaleString()}</strong>{" "}
          颗豆豆， 涉及{" "}
          <strong className="text-gray-700 dark:text-gray-300">{items.length}</strong> 种颜色
          {!sufficient && (
            <span className="text-red-500 dark:text-red-400">
              ，其中 {deficitItems.length} 种不足（共缺 {totalDeficit.toLocaleString()} 颗）
            </span>
          )}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!sufficient && deficitItems.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-red-500 dark:text-red-400 mb-2">
              库存不足的颜色
            </p>
            <div className="space-y-1">
              {deficitItems.map((item) => (
                <StockCheckItem key={item.hex} item={item} isDeficit />
              ))}
            </div>
          </div>
        )}
        <details className={sufficient ? "" : "mt-2"}>
          <summary className="text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none mb-2">
            全部 {items.length} 种颜色明细
          </summary>
          <div className="space-y-1">
            {items.map((item) => (
              <StockCheckItem key={item.hex} item={item} isDeficit={item.deficit > 0} />
            ))}
          </div>
        </details>
      </div>
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2 flex-shrink-0">
        {hasAnyStock && (
          <button
            onClick={onConfirm}
            className={`min-h-[44px] w-full py-2.5 text-sm font-medium rounded-lg transition-colors ${
              sufficient
                ? "bg-emerald-600 text-white active:bg-emerald-700"
                : "bg-amber-500 text-white active:bg-amber-600"
            }`}
          >
            {sufficient ? "确认扣减库存并开始" : "仍然扣减并开始"}
          </button>
        )}
        <button
          onClick={onSkip}
          className="min-h-[44px] w-full py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
        >
          不扣减，直接开始
        </button>
        <button
          onClick={onCancel}
          className="min-h-[44px] w-full py-2 text-xs text-gray-500 dark:text-gray-400 active:text-gray-600 transition-colors"
        >
          取消
        </button>
      </div>
    </ModalShell>
  );
}

// —— 集成兼容别名
export { UndoRedoButtons as UndoRedoBar };
export { StockCheckModal as InventoryCheckModal };
