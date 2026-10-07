import { useState } from "react";
import type { ReactNode } from "react";
import { ShapeStampsPanel } from "./shape-stamps";
// useDocumentStore定义于区域46 → ./stats-panel
import { useDocumentStore } from "./stats-panel";

/** 图层面板 tab 图标（堆叠图层）
  */
function LayersTabIcon() {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-full h-full"
    >
      <path d="M12 2l9 5-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 17l9 5 9-5" />
    </svg>
  );
}

/** 右侧面板分类描述
   */
export interface WorkbenchCategory {
  id: string;
  label: string;
  icon?: ReactNode;
  bare?: boolean;
  content: ReactNode;
}

export interface LayersListProps {
  onLayerChange: () => void;
  hasReferenceImage: boolean;
  referenceVisible: boolean;
  onReferenceVisibleChange: (visible: boolean) => void;
  referenceOpacity: number;
  onReferenceOpacityChange: (opacity: number) => void;
}

/** 图层列表（含可见性/锁定/排序/复制/重命名/删除、参考图行与设置、贴纸设置）
   */
export function LayersList({
  onLayerChange,
  hasReferenceImage,
  referenceVisible,
  onReferenceVisibleChange,
  referenceOpacity,
  onReferenceOpacityChange,
}: LayersListProps) {
  const document = useDocumentStore((s) => s.document);
  const addPixelLayer = useDocumentStore((s) => s.addPixelLayer);
  const removeLayer = useDocumentStore((s) => s.removeLayer);
  const setActiveLayer = useDocumentStore((s) => s.setActiveLayer);
  const updateLayer = useDocumentStore((s) => s.updateLayer);
  const moveLayer = useDocumentStore((s) => s.moveLayer);
  const duplicateLayer = useDocumentStore((s) => s.duplicateLayer);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [stickerSettingsOpen, setStickerSettingsOpen] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [referenceSelected, setReferenceSelected] = useState(false);

  if (!document) return null;

  const layersTopFirst = [...document.layers].reverse();
  const activeLayerId = document.activeLayerId;
  const activeLayer = document.layers.find((l: any) => l.id === activeLayerId);
  const requestDelete = (id: string) => {
    if (document.layers.length <= 1) return;
    setConfirmDeleteId(id);
  };
  const toggleVisible = (id: string, visible: boolean) => {
    updateLayer(id, { visible: !visible });
    onLayerChange();
  };
  const toggleLocked = (id: string, locked: boolean) => {
    updateLayer(id, { locked: !locked });
  };
  const move = (id: string, direction: "up" | "down") => {
    moveLayer(id, direction);
    onLayerChange();
  };
  const duplicate = (id: string) => {
    duplicateLayer(id);
    onLayerChange();
  };
  const startRename = (id: string, name: string) => {
    setRenamingId(id);
    setRenameText(name);
  };
  const commitRename = () => {
    if (renamingId && renameText.trim()) updateLayer(renamingId, { name: renameText.trim() });
    setRenamingId(null);
  };
  const typeLabel = (type: string) => {
    switch (type) {
      case "sticker":
        return "贴纸";
      case "image":
        return "参考图";
      default:
        return null;
    }
  };

  return (
    <div className="rounded-xl border border-gray-200/60 dark:border-gray-800/50 bg-gray-50/95 dark:bg-gray-900/80 shadow-sm overflow-hidden flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">图层</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAddMenu("sticker")}
            title="添加贴纸"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-200 dark:active:bg-gray-700 transition-colors text-[11px] font-bold"
          >
            ✦
          </button>
          <button
            onClick={() => {
              addPixelLayer(`图层 ${document.layers.length + 1}`);
              onLayerChange();
            }}
            title="添加空白图层"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
      <div className="px-2 pb-2 space-y-1 max-h-64 overflow-y-auto">
        {layersTopFirst.map((layer: any) => {
          const isActive = layer.id === activeLayerId;
          const isOnlyLayer = document.layers.length === 1;
          const index = document.layers.findIndex((l: any) => l.id === layer.id);
          const isBottom = index === document.layers.length - 1;
          const badge = typeLabel(layer.type);
          return (
            <div
              key={layer.id}
              onClick={() => {
                setActiveLayer(layer.id);
                setReferenceSelected(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? "bg-gray-200/80 dark:bg-gray-700/80"
                  : "active:bg-gray-100 dark:active:bg-gray-800"
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisible(layer.id, layer.visible);
                }}
                className={`w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center transition-colors ${
                  layer.visible
                    ? "text-gray-600 dark:text-gray-300"
                    : "text-gray-300 dark:text-gray-600"
                }`}
              >
                {layer.visible ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-3.5 h-3.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path
                      fillRule="evenodd"
                      d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-3.5 h-3.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                      clipRule="evenodd"
                    />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                {renamingId === layer.id ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="w-full text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-brand-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs truncate ${
                        isActive
                          ? "font-semibold text-gray-900 dark:text-gray-100"
                          : "text-gray-600 dark:text-gray-400"
                      }`}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startRename(layer.id, layer.name);
                      }}
                    >
                      {layer.name}
                    </span>
                    {badge && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-gray-300/50 dark:bg-gray-600/50 text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {badge}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {isActive ? (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLocked(layer.id, layer.locked);
                    }}
                    className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                      layer.locked
                        ? "text-brand-500"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                    title={layer.locked ? "解锁" : "锁定"}
                  >
                    {layer.locked ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-3.5 h-3.5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-3.5 h-3.5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      move(layer.id, "up");
                    }}
                    disabled={isBottom}
                    title="上移"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-300 dark:active:bg-gray-600 disabled:opacity-20 transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      move(layer.id, "down");
                    }}
                    disabled={index === 0}
                    title="下移"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-300 dark:active:bg-gray-600 disabled:opacity-20 transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicate(layer.id);
                    }}
                    title="复制"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-300 dark:active:bg-gray-600 transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                  {!isOnlyLayer && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDelete(layer.id);
                      }}
                      title="删除"
                      className="w-7 h-7 rounded-md flex items-center justify-center text-red-400 active:bg-red-100 dark:active:bg-red-900/30 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLocked(layer.id, layer.locked);
                  }}
                  className={`w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center transition-colors ${
                    layer.locked ? "text-brand-500" : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {layer.locked ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-3.5 h-3.5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-3.5 h-3.5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          );
        })}
        {hasReferenceImage && (
          <div className="rounded-lg overflow-hidden">
            <div
              onClick={() => {
                setReferenceSelected(true);
                setActiveLayer(null);
              }}
              className={`flex items-center gap-2 px-2.5 py-2.5 cursor-pointer transition-colors ${
                referenceSelected
                  ? "bg-gray-200/80 dark:bg-gray-700/80"
                  : "active:bg-gray-100 dark:active:bg-gray-800"
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReferenceVisibleChange(!referenceVisible);
                }}
                className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center transition-colors ${
                  referenceVisible
                    ? "text-gray-600 dark:text-gray-300"
                    : "text-gray-300 dark:text-gray-600"
                }`}
              >
                {referenceVisible ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path
                      fillRule="evenodd"
                      d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                      clipRule="evenodd"
                    />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                  </svg>
                )}
              </button>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span
                  className={`text-xs truncate ${
                    referenceSelected
                      ? "font-semibold text-gray-900 dark:text-gray-100"
                      : "text-gray-600 dark:text-gray-400"
                  }`}
                >
                  参考图
                </span>
                <span className="text-[9px] px-1 py-0.5 rounded bg-gray-300/50 dark:bg-gray-600/50 text-gray-500 dark:text-gray-400 flex-shrink-0">
                  参考图
                </span>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        )}
      </div>
      {referenceSelected && hasReferenceImage && !addMenu && (
        <div className="border-t border-gray-200/60 dark:border-gray-800/50 px-4 py-3">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
            参考图设置
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0">
              不透明度
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(100 * referenceOpacity)}
              onChange={(e) => onReferenceOpacityChange(parseInt(e.target.value) / 100)}
              className="flex-1 accent-brand-500 h-1"
            />
            <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums w-8 text-right">
              {Math.round(100 * referenceOpacity)}%
            </span>
          </div>
        </div>
      )}
      {activeLayer?.type === "sticker" && !addMenu && !referenceSelected && (
        <div className="border-t border-gray-200/60 dark:border-gray-800/50">
          <button
            onClick={() => setStickerSettingsOpen((open) => !open)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400"
          >
            <span>贴纸设置</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`w-3 h-3 transition-transform ${stickerSettingsOpen ? "" : "-rotate-90"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {stickerSettingsOpen && (
            <div className="px-4 pb-3">
              <ShapeStampsPanel
                key={activeLayerId}
                editLayerId={activeLayerId}
                onClose={() => setStickerSettingsOpen(false)}
                onApply={onLayerChange}
              />
            </div>
          )}
        </div>
      )}
      {addMenu === "sticker" && (
        <div className="px-3 pb-3 border-t border-gray-200/60 dark:border-gray-800/50">
          <div className="flex items-center justify-between py-2">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">添加贴纸</span>
          </div>
          <ShapeStampsPanel onClose={() => setAddMenu(null)} onApply={onLayerChange} />
        </div>
      )}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-5 mx-6 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              删除图层
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-5">
              确定要删除「
              {document.layers.find((l: any) => l.id === confirmDeleteId)?.name}
              」吗？此操作不可撤销。
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (confirmDeleteId) {
                    removeLayer(confirmDeleteId);
                    setConfirmDeleteId(null);
                    onLayerChange();
                  }
                }}
                className="flex-1 py-2.5 text-xs rounded-xl bg-red-500 text-white active:bg-red-600 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface LayersPanelProps {
  hasStoreDoc: boolean;
  onOpenCanvasSize: () => void;
  onLayerChange: () => void;
  hasReferenceImage: boolean;
  referenceVisible: boolean;
  onReferenceVisibleChange: (visible: boolean) => void;
  referenceOpacity: number;
  onReferenceOpacityChange: (opacity: number) => void;
}

/** 右侧面板"图层"分类描述（hasStoreDoc 为假时返回 null）
  */
export function LayersPanel({
  hasStoreDoc,
  onOpenCanvasSize,
  onLayerChange,
  hasReferenceImage,
  referenceVisible,
  onReferenceVisibleChange,
  referenceOpacity,
  onReferenceOpacityChange,
}: LayersPanelProps): WorkbenchCategory | null {
  return hasStoreDoc
    ? {
        id: "layers",
        label: "图层",
        icon: <LayersTabIcon />,
        bare: true,
        content: (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onOpenCanvasSize}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-gray-200/60 dark:border-gray-800/50 bg-gray-50/95 dark:bg-gray-900/80 shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
            >
              <svg
                className="w-4 h-4 text-gray-500 dark:text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path strokeLinecap="round" d="M3 9h18M9 3v18" />
              </svg>
              画布尺寸…
            </button>
            <LayersList
              onLayerChange={onLayerChange}
              hasReferenceImage={hasReferenceImage}
              referenceVisible={referenceVisible}
              onReferenceVisibleChange={onReferenceVisibleChange}
              referenceOpacity={referenceOpacity}
              onReferenceOpacityChange={onReferenceOpacityChange}
            />
          </div>
        ),
      }
    : null;
}
