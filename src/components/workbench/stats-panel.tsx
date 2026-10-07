// → 规范名：
// td → mapReviver
//   tx → useDocumentStore（文档 zustand store，persist 至 IndexedDB）
//   ty → useComposite（合成像素网格的 memo 化 selector）
//   tb → useGridDimensions（{N, M} 网格尺寸 memo 化 selector）
// 说明①：契约将本区域标为“StatsPanel 用量统计”，实际内容为文档图层 store
// （“主体 / 底稿 / 副本”为图层默认名），按契约路径 stats-panel.tsx 落盘。
// 说明②：模块 3731（idb-keyval）内联于本文件（目标项目未安装该依赖）。
// 说明③：依赖的纯函数 cellKey/parseCellKey/deleteCell/createEmptyLayerData/
// pixelDataToLayerData/applyLayerOperation/generateId/mapReplacer/composeLayers/
// HistoryStack按约定从 ./bits 导入；

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  cellKey, // 原 e3
  parseCellKey, // 原 e6
  deleteCell, // 原 e7
  createEmptyLayerData, // 原 e8
  pixelDataToLayerData, // 原 e9
  applyLayerOperation, // 原 ta
  generateId, // 原 ti
  mapReplacer, // 原 tc
  composeLayers, // 原 tr
  HistoryStack, // 原 tn
  registerStoreHydration, // 集成期注入（见文件尾）
} from "./bits";
import { ERASE_KEY } from "@/utils/bundle-misc";
import type { PixelGrid } from "@/utils/watermark";

// ---------------------------------------------------------------------------
// idb-keyval）内联实现：IndexedDB key-value 存取
// ---------------------------------------------------------------------------

/** * IndexedDB 请求 Promise 化 */
function idbRequest<T>(target: any): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    target.oncomplete = target.onsuccess = () => resolve(target.result);
    target.onabort = target.onerror = () => reject(target.error);
  });
}

let idbPromise: Promise<any> | null = null;

/** * 打开 / 复用 keyval-store 数据库 */
function openKeyvalStore(): Promise<any> {
  if (!idbPromise) {
    const request = indexedDB.open("keyval-store");
    request.onupgradeneeded = () => request.result.createObjectStore("keyval");
    const ready = idbRequest<any>(request);
    ready.then(
      (db) => {
        db.onclose = () => {
          idbPromise = null; // 原 void 0，类型上对齐 null
        };
      },
      () => {}
    );
    idbPromise = ready;
  }
  return idbPromise;
}

/** * 在事务中操作 object store */
async function withKeyvalStore<T>(mode: IDBTransactionMode, cb: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openKeyvalStore();
  return cb(db.transaction("keyval", mode).objectStore("keyval"));
}

/** * idb-keyval get */
function idbGet(key: string): Promise<string | undefined> {
  return withKeyvalStore("readonly", (store) => idbRequest<string | undefined>(store.get(key)));
}

/** * idb-keyval set */
function idbSet(key: string, value: string): Promise<unknown> {
  return withKeyvalStore("readwrite", (store) => {
    store.put(value, key);
    return idbRequest<unknown>(store.transaction);
  });
}

/** * idb-keyval del */
function idbDel(key: string): Promise<unknown> {
  return withKeyvalStore("readwrite", (store) => {
    store.delete(key);
    return idbRequest<unknown>(store.transaction);
  });
}

// ---------------------------------------------------------------------------
// 文档 store 类型
// ---------------------------------------------------------------------------

/** 图层格子数据条目 */
export interface LayerCell {
  key: string;
  color: string;
}

export interface BaseLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export interface PixelLayer extends BaseLayer {
  type: "pixel";
  data: Map<string, LayerCell>;
}

export interface StickerLayer extends BaseLayer {
  type: "sticker";
  data: Map<string, LayerCell>;
  template: any;
}

export interface ImageLayer extends BaseLayer {
  type: "image";
  data: any; // TODO(类型)：参照图层数据
}

export type Layer = PixelLayer | StickerLayer | ImageLayer;

export interface GridSize {
  width: number;
  height: number;
}

export interface DesignDocument {
  id: string;
  name: string;
  grid: GridSize;
  layers: Layer[];
  activeLayerId: string;
}

export interface LayerOperationChange {
  row: number;
  col: number;
  before?: LayerCell | null;
  after?: LayerCell | null;
}

export interface LayerOperation {
  layerId: string;
  changes: LayerOperationChange[];
}

export interface DocumentStore {
  document: DesignDocument | null;
  undoCount: number;
  redoCount: number;
  createDocument: (name: string, grid: GridSize, pixelData?: PixelGrid | null) => void;
  clearDocument: () => void;
  rebuildDocument: (grid: GridSize, pixelData: PixelGrid) => void;
  resizeGrid: (width: number, height: number, colShift: number, rowShift: number) => void;
  addPixelLayer: (name: string, data?: Map<string, LayerCell>) => string;
  addStickerLayer: (name: string, template: any, data: Map<string, LayerCell>) => string;
  updateStickerLayer: (id: string, template: any, data: Map<string, LayerCell>) => void;
  removeLayer: (id: string) => void;
  setActiveLayer: (id: string | null) => void; // 集成放宽：layers-panel 以 null 取消选择
  updateLayer: (id: string, patch: Partial<BaseLayer>) => void;
  moveLayer: (id: string, direction: "up" | "down") => void;
  duplicateLayer: (id: string) => string;
  syncFromPixelData: (pixelData: PixelGrid) => void;
  dispatchOperation: (operation: LayerOperation) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  replaceMainGrid: (pixelData: PixelGrid, grid: GridSize) => void;
  getComposite: () => PixelGrid | null;
  getActiveLayer: () => Layer | null;
}

// ---------------------------------------------------------------------------
// 持久化序列化
// ---------------------------------------------------------------------------

/** * * JSON reviver：还原 Map */
export function mapReviver(_key: string, value: any): any {
  return value && "object" == typeof value && "Map" === value.__t ? new Map(value.d) : value;
}

/** * 写入防抖句柄 */
let persistTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// 文档 store
// ---------------------------------------------------------------------------

export const useDocumentStore = create<DocumentStore>()(
  persist(
    (set, get) => {
      // 集成决策：历史栈条目 = LayerOperation，对齐 bits 的泛型 HistoryStack
      const history = new HistoryStack<LayerOperation>(100);
      const syncHistoryCounts = () => {
        const counts = history.inspect();
        set({ undoCount: counts.undoCount, redoCount: counts.redoCount });
      };
      /** 定位目标像素图层：优先 layerId，否则当前激活像素层（原内部 l） */
      const findTargetPixelLayer = (state: DocumentStore, layerId?: string): PixelLayer | null => {
        const doc = state.document;
        if (!doc) return null;
        const byId = doc.layers.find((layer): layer is PixelLayer => layer.id === layerId && "pixel" === layer.type);
        if (byId) return byId;
        const active = doc.layers.find((layer): layer is PixelLayer => layer.id === doc.activeLayerId && "pixel" === layer.type);
        return active ?? null;
      };
      /** 在目标像素图层上应用变更（原内部 n） */
      const mutatePixelLayer = (layerId: string, mutate: (data: Map<string, LayerCell>) => void): boolean => {
        const state = get();
        if (!state.document) return false;
        const index = state.document.layers.findIndex((layer) => layer.id === layerId && "pixel" === layer.type);
        if (index < 0) return false;
        const nextData = new Map((state.document.layers[index] as PixelLayer).data);
        mutate(nextData);
        set({
          document: {
            ...state.document,
            layers: state.document.layers.map((layer, i) => (i === index ? { ...layer, data: nextData } : layer)),
          },
        });
        return true;
      };
      return {
        document: null,
        undoCount: 0,
        redoCount: 0,
        createDocument: (name, grid, pixelData) => {
          const layerId = generateId("layer");
          const mainLayer: PixelLayer = {
            id: layerId,
            name: "主体",
            type: "pixel",
            visible: true,
            locked: false,
            opacity: 1,
            data: pixelData ? pixelDataToLayerData(pixelData) : createEmptyLayerData(),
          };
          history.clear();
          set({
            document: {
              id: generateId("doc"),
              name,
              grid,
              layers: [mainLayer],
              activeLayerId: layerId,
            },
            undoCount: 0,
            redoCount: 0,
          });
        },
        clearDocument: () => {
          history.clear();
          set({ document: null, undoCount: 0, redoCount: 0 });
        },
        rebuildDocument: (grid, pixelData) => {
          const state = get();
          if (!state.document) return void get().createDocument("底稿", grid, pixelData);
          const layers = state.document.layers.map((layer) =>
            layer.id === state.document!.activeLayerId && "pixel" === layer.type
              ? { ...layer, data: pixelDataToLayerData(pixelData) }
              : "pixel" === layer.type
                ? { ...layer, data: createEmptyLayerData() }
                : layer
          );
          history.clear();
          set({
            document: { ...state.document, grid, layers },
            undoCount: 0,
            redoCount: 0,
          });
        },
        resizeGrid: (width, height, colShift, rowShift) => {
          const state = get();
          if (!state.document) return;
          const layers = state.document.layers.map((layer) =>
            "pixel" === layer.type || "sticker" === layer.type
              ? {
                  ...layer,
                  data: ((data: Map<string, LayerCell>) => {
                    const next = new Map<string, LayerCell>();
                    data.forEach((entry, key) => {
                      const { row, col } = parseCellKey(key);
                      const nextRow = row + rowShift;
                      const nextCol = col + colShift;
                      if (nextRow >= 0 && nextRow < height && nextCol >= 0 && nextCol < width) {
                        next.set(cellKey(nextRow, nextCol), entry);
                      }
                    });
                    return next;
                  })(layer.data),
                }
              : layer
          );
          history.clear();
          set({
            document: { ...state.document, grid: { width, height }, layers },
            undoCount: 0,
            redoCount: 0,
          });
        },
        addPixelLayer: (name, data) => {
          const state = get();
          if (!state.document) return "";
          const layerId = generateId("layer");
          const layer: PixelLayer = {
            id: layerId,
            name,
            type: "pixel",
            visible: true,
            locked: false,
            opacity: 1,
            data: data ?? createEmptyLayerData(),
          };
          set({
            document: { ...state.document, layers: [...state.document.layers, layer], activeLayerId: layerId },
          });
          return layerId;
        },
        addStickerLayer: (name, template, data) => {
          const state = get();
          if (!state.document) return "";
          const layerId = generateId("layer");
          set({
            document: {
              ...state.document,
              layers: [
                ...state.document.layers,
                {
                  id: layerId,
                  name,
                  type: "sticker",
                  visible: true,
                  locked: false,
                  opacity: 1,
                  data,
                  template,
                } satisfies StickerLayer,
              ],
              activeLayerId: layerId,
            },
          });
          return layerId;
        },
        updateStickerLayer: (id, template, data) => {
          const state = get();
          if (!state.document) return;
          set({
            document: {
              ...state.document,
              layers: state.document.layers.map((layer) =>
                layer.id === id && "sticker" === layer.type ? { ...layer, template, data } : layer
              ),
            },
          });
        },
        removeLayer: (id) => {
          const state = get();
          if (!state.document) return;
          const layers = state.document.layers.filter((layer) => layer.id !== id);
          if (0 === layers.length) return;
          const activeLayerId = state.document.activeLayerId === id ? layers[layers.length - 1].id : state.document.activeLayerId;
          set({ document: { ...state.document, layers, activeLayerId } });
        },
        setActiveLayer: (id) => {
          const state = get();
          const doc = state.document;
          if (doc && doc.activeLayerId !== id) {
            // 集成断言：layers-panel 取消选择时会传 null（源运行时同样会存入 null）
            set({ document: { ...doc, activeLayerId: id as string } });
          }
        },
        updateLayer: (id, patch) => {
          const state = get();
          if (!state.document) return;
          set({
            document: {
              ...state.document,
              layers: state.document.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
            },
          });
        },
        moveLayer: (id, direction) => {
          const state = get();
          if (!state.document) return;
          const layers = [...state.document.layers];
          const index = layers.findIndex((layer) => layer.id === id);
          if (index < 0) return;
          const swapIndex = "up" === direction ? index + 1 : index - 1;
          if (swapIndex < 0 || swapIndex >= layers.length) return;
          [layers[index], layers[swapIndex]] = [layers[swapIndex], layers[index]];
          set({ document: { ...state.document, layers } });
        },
        duplicateLayer: (id) => {
          const state = get();
          if (!state.document) return "";
          const source = state.document.layers.find((layer) => layer.id === id);
          if (!source || "image" === source.type) return "";
          const layerId = generateId("layer");
          const copy = {
            ...source,
            id: layerId,
            name: `${source.name} 副本`,
            data: new Map(source.data as Map<string, LayerCell>),
          };
          const index = state.document.layers.findIndex((layer) => layer.id === id);
          const layers = [...state.document.layers];
          layers.splice(index + 1, 0, copy);
          set({ document: { ...state.document, layers, activeLayerId: layerId } });
          return layerId;
        },
        syncFromPixelData: (pixelData) => {
          const state = get();
          const doc = state.document;
          if (!doc) return;
          const activeLayer = doc.layers.find(
            (layer): layer is PixelLayer => layer.id === doc.activeLayerId && "pixel" === layer.type
          );
          if (!activeLayer) return;
          if (doc.layers.filter((layer) => "pixel" === layer.type || "sticker" === layer.type).length <= 1) {
            return void set({
              document: {
                ...doc,
                layers: doc.layers.map((layer) => (layer.id === activeLayer.id ? { ...layer, data: pixelDataToLayerData(pixelData) } : layer)),
              },
            });
          }
          const composite = composeLayers(doc.layers, doc.grid);
          const nextData = new Map<string, LayerCell>(activeLayer.data);
          const { width, height } = doc.grid;
          for (let row = 0; row < Math.min(pixelData.length, height); row++) {
            for (let col = 0; col < Math.min(pixelData[row]?.length ?? 0, width); col++) {
              const incoming = pixelData[row][col];
              const current = composite[row]?.[col];
              if (current && incoming!.key === current.key && incoming!.color === current.color && !!incoming!.isExternal == !!current.isExternal) continue;
              const key = cellKey(row, col);
              if (incoming!.isExternal || incoming!.key === ERASE_KEY) nextData.delete(key);
              else nextData.set(key, { key: incoming!.key, color: incoming!.color });
            }
          }
          set({
            document: {
              ...doc,
              layers: doc.layers.map((layer) => (layer.id === activeLayer.id ? { ...layer, data: nextData } : layer)),
            },
          });
        },
        dispatchOperation: (operation) => {
          const state = get();
          if (!state.document) return;
          const target = findTargetPixelLayer(state, operation.layerId);
          if (target && mutatePixelLayer(target.id, (data) => applyLayerOperation(data, operation))) {
            history.push(operation);
            syncHistoryCounts();
          }
        },
        undo: () => {
          const operation = history.popUndo();
          if (!operation) return void syncHistoryCounts();
          const state = get();
          const target = state.document ? findTargetPixelLayer(state, operation.layerId) : null;
          if (target) {
            mutatePixelLayer(target.id, (data) => {
              for (const change of operation.changes) {
                if (change.before) {
                  data.set(cellKey(change.row, change.col), change.before);
                } else {
                  deleteCell(data, change.row, change.col);
                }
              }
            });
          }
          syncHistoryCounts();
        },
        redo: () => {
          const operation = history.popRedo();
          if (!operation) return void syncHistoryCounts();
          const state = get();
          const target = state.document ? findTargetPixelLayer(state, operation.layerId) : null;
          if (target && mutatePixelLayer(target.id, (data) => applyLayerOperation(data, operation))) {
            // 与原代码一致：仅应用并同步计数
          }
          syncHistoryCounts();
        },
        clearHistory: () => {
          history.clear();
          syncHistoryCounts();
        },
        replaceMainGrid: (pixelData, grid) => {
          const state = get();
          if (!state.document) return void get().createDocument("底稿", grid, pixelData);
          if (state.document.grid.width !== grid.width || state.document.grid.height !== grid.height) {
            return void get().rebuildDocument(grid, pixelData);
          }
          get().syncFromPixelData(pixelData);
          history.clear();
          syncHistoryCounts();
        },
        getComposite: () => {
          const state = get();
          return state.document ? composeLayers(state.document.layers, state.document.grid) : null;
        },
        getActiveLayer: () => {
          const state = get();
          return state.document?.layers.find((layer) => layer.id === state.document!.activeLayerId) ?? null;
        },
      };
    },
    {
      name: "perler-document",
      storage: {
        getItem: async (name: string) => {
          const raw = await idbGet(name);
          return raw ? (JSON.parse(raw, mapReviver) as any) : null;
        },
        setItem: (name: string, value: any) => {
          if (persistTimer) clearTimeout(persistTimer);
          persistTimer = setTimeout(() => {
            idbSet(name, JSON.stringify(value, mapReplacer));
            persistTimer = null;
          }, 1e3);
        },
        removeItem: async (name: string) => {
          if (persistTimer) {
            clearTimeout(persistTimer);
            persistTimer = null;
          }
          await idbDel(name);
        },
      } as any, // TODO(类型)：zustand PersistStorage（Map 结构非 JSON 原生）
      partialize: (state) => ({ document: state.document }) as any, // TODO(类型)：仅持久化 document
    }
  )
);

// 向 bits 的 onStoreHydrated 注入本 store 的水合监听（避免 bits ↔ stats-panel 循环引用）
registerStoreHydration((callback) => {
  const persistApi = (useDocumentStore as unknown as {
    persist?: {
      hasHydrated?: () => boolean;
      onFinishHydration?: (cb: () => void) => () => void;
    };
  }).persist;
  if (!persistApi || persistApi.hasHydrated?.()) {
    callback();
    return () => {};
  }
  const unsubscribe = persistApi.onFinishHydration?.(() => callback());
  return () => unsubscribe?.();
});

// ---------------------------------------------------------------------------
// memo 化 selector
// ---------------------------------------------------------------------------

let compositeCacheLayers: Layer[] | null = null;
let compositeCacheGrid: GridSize | null = null;
let compositeCache: PixelGrid | null = null;
let gridCacheSource: GridSize | null = null;
let gridCache: { N: number; M: number } | null = null;

/** * 合成像素网格 */
export const useComposite = (): PixelGrid | null =>
  useDocumentStore((state) =>
    state.document
      ? ((layers: Layer[], grid: GridSize): PixelGrid => {
          if (layers === compositeCacheLayers && grid === compositeCacheGrid && compositeCache) return compositeCache;
          compositeCacheLayers = layers;
          compositeCacheGrid = grid;
          compositeCache = composeLayers(layers, grid);
          return compositeCache;
        })(state.document.layers, state.document.grid)
      : null
  );

/** * 网格尺寸 {N=列, M=行} */
export const useGridDimensions = (): { N: number; M: number } | null =>
  useDocumentStore((state) =>
    state.document
      ? ((grid: GridSize): { N: number; M: number } => {
          if (grid === gridCacheSource && gridCache) return gridCache;
          gridCacheSource = grid;
          gridCache = { N: grid.width, M: grid.height };
          return gridCache;
        })(state.document.grid)
      : null
  );
