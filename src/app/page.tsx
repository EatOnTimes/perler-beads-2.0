"use client";

import { useCallback, useEffect, useReducer, useRef, useState, useMemo } from "react";
import type React from "react"; // 类型命名空间（MutableRefObject/Dispatch/ReactNode 等）
import { useRouter } from "next/navigation";

// —— 跨模块工具（按 CONTEXT 契约路径导入；导出名为本代理拟定，集成阶段统一对齐，详见 agent-A-report.md）——
import { logger } from "@/lib/logger";
import {
  PixelationMode,
  pixelateImageToGrid,
  colorDistanceRgb,
  hexToRgb,
  findNearestPaletteColor,
} from "@/utils/canvas-ops";
import { parseGalleryShareCode, decryptGalleryWork } from "@/utils/image-ops";
import { downloadBlobFile } from "@/utils/export-errors";
import {
  FULL_BEAD_PALETTE,
  ERASE_KEY,
  ERASE_CELL,
  formatFileTimestamp,
} from "@/utils/bundle-misc";
import { DEFAULT_RENDER_CONFIG } from "@/utils/watermark";
import {
  mapPaletteToColorSystem,
  sortColorsBySystem,
  getColorDisplayKey,
} from "@/utils/color-system";
import { markPageHydrated } from "@/components/diagnostic-banner";
import { useToast, useConfirm } from "@/components/providers";
import { useWorkbenchStore, useStoredPixelData, useStoredGridDimensions } from "@/stores/workbench";

// —— 契约映射组件（CONTEXT.md 区域→规范名映射表）——
import { AboutModal } from "@/components/workbench/about-modal";
import { LayersPanel } from "@/components/workbench/layers-panel";
import { ExcludedColorsPanel } from "@/components/workbench/excluded-colors";
import { SettingsPanel } from "@/components/workbench/settings-panel";
import { MessageBoard } from "@/components/workbench/message-board";
import { RecolorGuide } from "@/components/workbench/recolor-guide";
import { IronPreviewModal } from "@/components/workbench/iron-preview-modal";
import { ExportBackgroundSettings } from "@/components/workbench/export-bg-settings";

// —— 未入契约映射表的小函数/小组件/常量 → components/workbench/bits（集成阶段按源注释对齐）——
import {
  nextManualOperationId,
  serializeCellChange,
  selectionFromTwoCells,
  extractSelectionBuffer,
  clearGridRegion,
  stampBufferOntoData,
  floodFillErase,
  computeShapePreviewCells,
  computeBrushStrokeCells,
  paintCellsOnData,
  getPastePreviewRect,
  findConnectedRegion,
  isRegionCompleted,
  getRegionCenterCell,
  isSameCell,
  isSameCellList,
  createInitialFocusState,
  computeTargetCanvasWidth,
  detectFileType,
  buildPaletteSelections,
  saveBeadInventory,
  readUiSettings,
  galleryBootReducer,
  runWhenStoreHydrated,
  MANUAL_TOOL_HOTKEYS,
  MANUAL_TOOL_HOTKEYS_ALT,
  BEAD_INVENTORY_STORAGE_KEY,
  CUSTOM_PALETTE_STORAGE_KEY,
  UI_SETTINGS_STORAGE_KEY,
  FULL_PALETTE_COLORS,
  GRID_LINE_COLORS,
  FOCUS_GUIDANCE_OPTIONS,
  SECTION_LINE_SWATCHES,
  RENDER_TEXTURE_OPTIONS,
  MANUAL_TOOL_ICONS,
  FallbackToolIcon,
  PaletteGridIcon,
  AdjustParamsIcon,
  ColorsPanelIcon,
  GuidanceIcon,
  DisplayIcon,
  MaterialIcon,
  ShadowIcon,
  DecorIcon,
  SegmentedOptions,
  SettingsToggle,
  SliderSetting,
  ColorSwatchPicker,
  ManualPalettePanel,
} from "@/components/workbench/bits";

// 集成决策：PixelCell/PixelGrid 以 @/utils/watermark 为规范定义（此处 re-export）；
// RenderConfig 即 watermark 的 ExportConfig。
export type { PixelCell, PixelGrid } from "@/utils/watermark";
import type { PixelCell, PixelGrid } from "@/utils/watermark";
import type { ExportConfig } from "@/utils/watermark";
import type { ExportArtifact } from "@/utils/export-errors"; // 区域09 R hook 的导出产物类型
export type PixelData = PixelGrid | null;
export interface GridDimensions {
  N: number; // 列数
  M: number; // 行数
}
export interface CanvasSize {
  width: number;
  height: number;
}
export interface CellPos {
  row: number;
  col: number;
}
export interface SelectionRect {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}
export interface SelectionBuffer {
  pixels: PixelCell[][];
  width: number;
  height: number;
}
export interface ColorCountEntry {
  count: number;
  color: string;
}
export type ColorCounts = Record<string, ColorCountEntry> | null;
export interface SelectedColor {
  key: string;
  color: string;
  isExternal?: boolean;
}
export interface TooltipData {
  x: number;
  y: number;
  key: string;
  color: string;
  row: number;
  col: number;
}
export interface GridAlignment {
  refX: number;
  refY: number;
  cellWidth: number;
  cellHeight: number;
}
export interface WatermarkConfig {
  enabled: boolean;
  type: "tile" | "emboss";
  text: string;
}
export interface DownloadOptions {
  showGrid: boolean;
  gridInterval: number;
  showCoordinates: boolean;
  showCellNumbers: boolean;
  gridLineColor: string;
  includeStats: boolean;
  mirrorX: boolean;
  authorName: string;
  shareCode: string;
  watermark: WatermarkConfig;
}
export type ColorReplaceStep = "select-source" | "select-target";
export interface ColorReplaceState {
  isActive: boolean;
  step: ColorReplaceStep;
  sourceColor?: SelectedColor;
}
export interface RenderConfig extends ExportConfig {}
export interface PaletteColor {
  key: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
}
export interface BeadInventoryItem {
  hex: string;
  displayKey: string;
  required: number;
  stock: number;
  deficit: number;
}
export interface InventoryCheckResult {
  sufficient: boolean;
  items: BeadInventoryItem[];
  totalRequired: number;
  totalDeficit: number;
}
export type ManualToolId = "drag" | "brush" | "eraser" | "picker" | "fill" | "line" | "rect" | "select" | "paste";
export type DeviceLayout = "phone" | "tablet-portrait" | "tablet-landscape" | "desktop";

// 专心拼豆（focus）模式状态
export interface FocusState {
  currentColor: string;
  selectedCell: CellPos | null;
  canvasScale: number;
  canvasOffset: { x: number; y: number };
  completedCells: Set<string>;
  colorProgress: Record<string, { completed: number; total: number }>;
  recommendedRegion: CellPos[] | null;
  recommendedCell: CellPos | null;
  guidanceMode: "nearest" | "largest" | "edge-first";
  showColorPanel: boolean;
  isPaused: boolean;
  startTime: number;
  totalElapsedTime: number;
  lastResumeTime: number;
  gridSectionInterval: number;
  showSectionLines: boolean;
  sectionLineColor: string;
  enableCelebration: boolean;
  showCelebration: boolean;
  showCompletionCard: boolean;
  completionCardDismissed: boolean;
}
export interface FocusColorRow {
  color: string;
  name: string;
  total: number;
  completed: number;
}
export interface ManualView {
  scale: number;
  offset: { x: number; y: number };
}
export interface CellChange {
  row: number;
  col: number;
  before: { key: string; color: string } | null;
  after: { key: string; color: string } | null;
}
export interface PanelCategory {
  id: string;
  label: string;
  icon?: React.ReactNode;
  quickControls?: React.ReactNode;
  content: React.ReactNode;
}
export interface LayersPanelProps {
  hasStoreDoc: boolean;
  onLayerChange: () => void;
  hasReferenceImage: boolean;
  referenceVisible: boolean;
  onReferenceVisibleChange: (v: boolean) => void;
  referenceOpacity: number;
  onReferenceOpacityChange: (v: number) => void;
  onOpenCanvasSize: () => void;
}
interface ManualPointerCell {
  hasCell: boolean;
  row: number;
  col: number;
}
// applyPointerResult 的入参形状
interface ManualPointerResult {
  initPointer?: { tool: ManualToolId; start: CellPos; last: CellPos };
  resetDidModify?: boolean;
  setStrokeBase?: PixelGrid;
  nextData?: PixelGrid;
  commit?: { nextData: PixelGrid; previousData: PixelGrid };
  selectionPreview?: SelectionRect | null;
  selection?: SelectionRect | null;
  movePreview?: SelectionRect | null;
  previewCells?: CellPos[] | null;
  pastePreview?: SelectionRect | null;
  pickedColor?: SelectedColor;
  canvasColorSelect?: SelectedColor;
  setEraseMode?: boolean;
  setPasteActive?: boolean;
  setTool?: ManualToolId;
  didModify?: boolean;
  pointerDown?: boolean;
  pointerLast?: CellPos;
  setPasteAnchor?: CellPos;
  setMoveRef?: { selection: SelectionRect | null; start: CellPos | null; offset: { row: number; col: number }; buffer: SelectionBuffer | null };
}
interface PointerContext {
  data: PixelGrid;
  grid: GridDimensions;
  cell: CellPos;
  activeTool: ManualToolId;
  selectedColor: SelectedColor | null;
  brushSize: number;
  shapeFill: boolean;
  mirrorX: boolean;
  mirrorY: boolean;
  pointerStart: CellPos | null;
  pointerLast: CellPos | null;
  isPointerDown: boolean;
  colorReplaceActive: boolean;
  colorReplaceStep: ColorReplaceStep;
  isEraseMode: boolean;
  pasteActive: boolean;
  clipboard: SelectionBuffer | null;
  pasteAnchor: CellPos | null;
  selection: SelectionRect | null;
  selectionPreview: SelectionRect | null;
  moveSelection: SelectionRect | null;
  moveStart: CellPos | null;
  moveOffset: { row: number; col: number };
  moveBuffer: SelectionBuffer | null;
}

// 设备布局探测
function useDeviceLayout(): DeviceLayout | null {
  const [layout, setLayout] = useState<DeviceLayout | null>(null);
  useEffect(() => {
    const update = () =>
      setLayout(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
        if (width >= 1024) return coarse && width > height ? "tablet-landscape" : coarse ? "tablet-portrait" : "desktop";
        return width >= 768 && coarse ? "tablet-portrait" : "phone";
      });
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return layout;
}

// rp 顶部内联的大状态 hook
function useWorkbenchPageState() {
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [rawImageForEdit, setRawImageForEdit] = useState<string | null>(null);
  const [isImageEditVisible, setIsImageEditVisible] = useState(false);
  const [granularity, setGranularity] = useState(50);
  const [granularityInput, setGranularityInput] = useState("50");
  const [similarityThreshold, setSimilarityThreshold] = useState(30);
  const [similarityThresholdInput, setSimilarityThresholdInput] = useState("30");
  const [pixelationMode, setPixelationMode] = useState<PixelationMode>(PixelationMode.Dominant);
  const [selectedColorSystem, setSelectedColorSystem] = useState("MARD");
  const [excludedColorKeys, setExcludedColorKeys] = useState<Set<string>>(new Set());
  const [showExcludedColors, setShowExcludedColors] = useState(false);
  const [initialGridColorKeys, setInitialGridColorKeys] = useState<Set<string>>(new Set());
  const mappedPixelData = useStoredPixelData();
  const gridDimensions = useStoredGridDimensions();
  const replaceMainGrid = useWorkbenchStore((s) => s.replaceMainGrid);
  const syncFromPixelData = useWorkbenchStore((s) => s.syncFromPixelData);
  const clearDocumentInStore = useWorkbenchStore((s) => s.clearDocument);
  const setMappedPixelData = useCallback(
    (data: PixelData) => {
      if (data === null) {
        clearDocumentInStore();
        return;
      }
      const rows = data.length;
      const cols = data[0]?.length ?? 0;
      if (cols === 0 || rows === 0) return;
      const doc = useWorkbenchStore.getState().document;
      const grid = doc?.grid;
      if (grid && grid.width === cols && grid.height === rows) syncFromPixelData(data);
      else replaceMainGrid(data, { width: cols, height: rows });
    },
    [replaceMainGrid, syncFromPixelData, clearDocumentInStore]
  );
  const setGridDimensions = useCallback(
    (dims: GridDimensions | null) => {
      if (dims === null) clearDocumentInStore();
    },
    [clearDocumentInStore]
  );
  const [gridAlignment, setGridAlignment] = useState<GridAlignment | null>(null);
  const [colorCounts, setColorCounts] = useState<ColorCounts>(null);
  const [totalBeadCount, setTotalBeadCount] = useState(0);
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);
  const [remapTrigger, setRemapTrigger] = useState(0);
  const [workspaceMode, setWorkspaceMode] = useState("studio");
  const [renderConfig, setRenderConfig] = useState<RenderConfig>(DEFAULT_RENDER_CONFIG);
  const [selectedColor, setSelectedColor] = useState<SelectedColor | null>(null);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [customPaletteSelections, setCustomPaletteSelections] = useState<Record<string, boolean>>({});
  const [isCustomPaletteEditorOpen, setIsCustomPaletteEditorOpen] = useState(false);
  const [, setIsCustomPalette] = useState(false);
  const [isDownloadSettingsOpen, setIsDownloadSettingsOpen] = useState(false);
  const [isCanvasSizeModalOpen, setIsCanvasSizeModalOpen] = useState(false);
  const [isCanvasCropActive, setIsCanvasCropActive] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions>({
    showGrid: true,
    gridInterval: 10,
    showCoordinates: true,
    showCellNumbers: true,
    gridLineColor: GRID_LINE_COLORS[0].value,
    includeStats: true,
    mirrorX: false,
    authorName: "",
    shareCode: "",
    watermark: {
      enabled: false,
      type: "tile",
      text: "",
    },
  });
  const [highlightColorKey, setHighlightColorKey] = useState<string | null>(null);
  const [showFullPalette, setShowFullPalette] = useState(false);
  const [colorReplaceState, setColorReplaceState] = useState<ColorReplaceState>({
    isActive: false,
    step: "select-source",
  });
  const [isMounted, setIsMounted] = useState(false);

  const deviceLayout = useDeviceLayout();
  const isDeviceLayoutReady = deviceLayout !== null;
  const isMobileLayout = deviceLayout === "phone" || deviceLayout === "tablet-portrait";
  const isCompactTopBar = !isDeviceLayoutReady || isMobileLayout;
  const isWelcomeState = !originalImageSrc && !mappedPixelData;
  const drawerSide: "bottom" | "right" | null = isDeviceLayoutReady ? (isMobileLayout ? "bottom" : "right") : null;
  const hideMobileSheet = drawerSide === "bottom" && isWelcomeState;
  const [mobileActiveCategoryId, setMobileActiveCategoryId] = useState<string | null>(null);
  useEffect(() => {
    setMobileActiveCategoryId(null);
  }, [isMobileLayout, workspaceMode]);
  const [isMagnifierActive, setIsMagnifierActive] = useState(false);
  const [miniMapVisibilityOverride, setMiniMapVisibilityOverride] = useState<boolean | null>(null);
  const showMiniMap = miniMapVisibilityOverride != null ? miniMapVisibilityOverride : isDeviceLayoutReady && !isMobileLayout;
  const renderCanvasRef = useRef<any>(null);
  const [magnifierSelectionArea, setMagnifierSelectionArea] = useState<SelectionRect | null>(null);
  const [activeFloatingTool, setActiveFloatingTool] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isInventoryCheckOpen, setIsInventoryCheckOpen] = useState(false);
  const [inventoryCheckResult, setInventoryCheckResult] = useState<InventoryCheckResult | null>(null);
  const isManualColoringMode = workspaceMode === "manual";
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelatedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mappedPixelDataRef = useRef<PixelData>(null);
  const resetAllEditingStateRef = useRef<() => void>(() => {});
  useEffect(() => {
    mappedPixelDataRef.current = mappedPixelData;
  }, [mappedPixelData]);
  return {
    originalImageSrc,
    setOriginalImageSrc,
    rawImageForEdit,
    setRawImageForEdit,
    isImageEditVisible,
    setIsImageEditVisible,
    granularity,
    setGranularity,
    granularityInput,
    setGranularityInput,
    similarityThreshold,
    setSimilarityThreshold,
    similarityThresholdInput,
    setSimilarityThresholdInput,
    pixelationMode,
    setPixelationMode,
    selectedColorSystem,
    setSelectedColorSystem,
    excludedColorKeys,
    setExcludedColorKeys,
    showExcludedColors,
    setShowExcludedColors,
    initialGridColorKeys,
    setInitialGridColorKeys,
    mappedPixelData,
    gridDimensions,
    setMappedPixelData,
    setGridDimensions,
    gridAlignment,
    setGridAlignment,
    colorCounts,
    setColorCounts,
    totalBeadCount,
    setTotalBeadCount,
    tooltipData,
    setTooltipData,
    remapTrigger,
    setRemapTrigger,
    workspaceMode,
    setWorkspaceMode,
    renderConfig,
    setRenderConfig,
    selectedColor,
    setSelectedColor,
    isEraseMode,
    setIsEraseMode,
    isDonationModalOpen,
    setIsDonationModalOpen,
    customPaletteSelections,
    setCustomPaletteSelections,
    isCustomPaletteEditorOpen,
    setIsCustomPaletteEditorOpen,
    setIsCustomPalette,
    isDownloadSettingsOpen,
    setIsDownloadSettingsOpen,
    isCanvasSizeModalOpen,
    setIsCanvasSizeModalOpen,
    isCanvasCropActive,
    setIsCanvasCropActive,
    downloadOptions,
    setDownloadOptions,
    highlightColorKey,
    setHighlightColorKey,
    showFullPalette,
    setShowFullPalette,
    colorReplaceState,
    setColorReplaceState,
    isMounted,
    setIsMounted,
    isDeviceLayoutReady,
    isMobileLayout,
    isCompactTopBar,
    isWelcomeState,
    drawerSide,
    hideMobileSheet,
    mobileActiveCategoryId,
    setMobileActiveCategoryId,
    mainPaddingRight: 344 * (drawerSide === "right" ? 1 : 0),
    mainPaddingBottom: drawerSide !== "bottom" || hideMobileSheet ? 0 : 64,
    isMagnifierActive,
    setIsMagnifierActive,
    miniMapVisibilityOverride,
    setMiniMapVisibilityOverride,
    showMiniMap,
    renderCanvasRef,
    magnifierSelectionArea,
    setMagnifierSelectionArea,
    activeFloatingTool,
    setActiveFloatingTool,
    isShareModalOpen,
    setIsShareModalOpen,
    isInventoryCheckOpen,
    setIsInventoryCheckOpen,
    inventoryCheckResult,
    setInventoryCheckResult,
    isManualColoringMode,
    originalCanvasRef,
    pixelatedCanvasRef,
    fileInputRef,
    importPaletteInputRef,
    mainRef,
    stageRef,
    mappedPixelDataRef,
    resetAllEditingStateRef,
  };
}
// 初始视图缩放
function computeInitialManualViewScale(size: CanvasSize, grid: GridDimensions) {
  const cell = Math.min(size.width / grid.N, size.height / grid.M);
  return !Number.isFinite(cell) || cell <= 0 ? 1 : Math.max(0.6, Math.min(10, 18 / cell));
}

interface ManualEditorProps {
  setMappedPixelData: (data: PixelData) => void;
  mappedPixelDataRef: React.MutableRefObject<PixelData>;
  gridDimensions: GridDimensions | null;
  pixelatedCanvasSize: CanvasSize | null;
  isManualColoringMode: boolean;
  selectedColor: SelectedColor | null;
  setSelectedColor: (c: SelectedColor | null) => void;
  isEraseMode: boolean;
  setIsEraseMode: (v: boolean) => void;
  colorReplaceState: ColorReplaceState;
  handleCanvasColorSelect: (c: SelectedColor) => void;
  updateCountsFromPixelData: (data: PixelGrid) => void;
  currentGridColors: { key: string; color: string }[];
  stageRef: React.MutableRefObject<HTMLDivElement | null>;
}

// 手动拼豆编辑器子系统
function useManualEditor(props: ManualEditorProps) {
  const {
    setMappedPixelData,
    mappedPixelDataRef,
    gridDimensions,
    pixelatedCanvasSize,
    isManualColoringMode,
    selectedColor,
    setSelectedColor,
    isEraseMode,
    setIsEraseMode,
    colorReplaceState,
    handleCanvasColorSelect,
    updateCountsFromPixelData,
    currentGridColors,
    stageRef,
  } = props;
  const [manualTool, setManualTool] = useState<ManualToolId>("drag");
  const [manualBrushSize, setManualBrushSize] = useState(1);
  const [manualShapeFill, setManualShapeFill] = useState(true);
  const [manualMirrorX, setManualMirrorX] = useState(false);
  const [manualMirrorY, setManualMirrorY] = useState(false);
  const [manualShowReference, setManualShowReference] = useState(false);
  const [manualReferenceOpacity, setManualReferenceOpacity] = useState(0.5);
  const [manualSelection, setManualSelection] = useState<SelectionRect | null>(null);
  const [manualSelectionPreview, setManualSelectionPreview] = useState<SelectionRect | null>(null);
  const [manualPreviewCells, setManualPreviewCells] = useState<CellPos[] | null>(null);
  const [manualMovePreview, setManualMovePreview] = useState<SelectionRect | null>(null);
  const [manualPastePreview, setManualPastePreview] = useState<SelectionRect | null>(null);
  const [manualClipboard, setManualClipboard] = useState<SelectionBuffer | null>(null);
  const [manualPasteActive, setManualPasteActive] = useState(false);
  const dispatchOperation = useWorkbenchStore((s) => s.dispatchOperation);
  const undoInStore = useWorkbenchStore((s) => s.undo);
  const redoInStore = useWorkbenchStore((s) => s.redo);
  const getComposite = useWorkbenchStore((s) => s.getComposite);
  const canUndo = useWorkbenchStore((s) => s.undoCount > 0);
  const canRedo = useWorkbenchStore((s) => s.redoCount > 0);
  const [manualView, setManualView] = useState<ManualView>({ scale: 1, offset: { x: 0, y: 0 } });
  const [isPanModifierActive, setIsPanModifierActive] = useState(false);
  const [manualStageSize, setManualStageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const pointerStateRef = useRef<{ isDown: boolean; tool: ManualToolId | "brush"; start: CellPos | null; last: CellPos | null }>({
    isDown: false,
    tool: "brush",
    start: null,
    last: null,
  });
  const strokeBaseRef = useRef<PixelGrid | null>(null);
  const didModifyRef = useRef(false);
  const moveRef = useRef<{ selection: SelectionRect | null; start: CellPos | null; offset: { row: number; col: number }; buffer: SelectionBuffer | null }>({
    selection: null,
    start: null,
    offset: { row: 0, col: 0 },
    buffer: null,
  });
  const pasteAnchorRef = useRef<{ anchor: CellPos | null }>({ anchor: null });
  const viewInitializedRef = useRef(false);

  const resetManualState = useCallback(() => {
    setManualSelection(null);
    setManualSelectionPreview(null);
    setManualPreviewCells(null);
    setManualMovePreview(null);
    setManualPastePreview(null);
    setManualPasteActive(false);
    setManualClipboard(null);
    setIsPanModifierActive(false);
    setManualView({ scale: 1, offset: { x: 0, y: 0 } });
    pointerStateRef.current = { isDown: false, tool: "drag", start: null, last: null };
    setManualTool("drag");
    strokeBaseRef.current = null;
    didModifyRef.current = false;
    moveRef.current = { selection: null, start: null, offset: { row: 0, col: 0 }, buffer: null };
    pasteAnchorRef.current = { anchor: null };
  }, []);

  // 撤销/重做后从 store 拉取合成数据
  const syncCompositeFromStore = useCallback(() => {
    const composite = getComposite();
    if (composite) {
      mappedPixelDataRef.current = composite;
      setMappedPixelData(composite);
      updateCountsFromPixelData(composite);
    }
  }, [getComposite, mappedPixelDataRef, setMappedPixelData, updateCountsFromPixelData]);

  const applyManualCommit = useCallback(
    (nextData: PixelGrid, previousData?: PixelGrid) => {
      mappedPixelDataRef.current = nextData;
      setMappedPixelData(nextData);
      updateCountsFromPixelData(nextData);
      if (!previousData) return;
      const changes = (function (before: PixelGrid, after: PixelGrid): CellChange[] {
        const list: CellChange[] = [];
        const rowCount = Math.min(before.length, after.length);
        for (let row = 0; row < rowCount; row++) {
          const beforeRow = before[row];
          const afterRow = after[row];
          if (!beforeRow || !afterRow) continue;
          const colCount = Math.min(beforeRow.length, afterRow.length);
          for (let col = 0; col < colCount; col++) {
            const beforeCell = beforeRow[col];
            const afterCell = afterRow[col];
            if (
              (beforeCell?.key ?? "") !== (afterCell?.key ?? "") ||
              (beforeCell?.color ?? "") !== (afterCell?.color ?? "") ||
              !!beforeCell?.isExternal !== !!afterCell?.isExternal
            ) {
              list.push({
                row,
                col,
                before: serializeCellChange(beforeCell),
                after: serializeCellChange(afterCell),
              });
            }
          }
        }
        return list;
      })(previousData, nextData);
      if (changes.length === 0) return;
      const doc = useWorkbenchStore.getState().document;
      const activeLayerId = doc?.activeLayerId;
      if (activeLayerId) {
        dispatchOperation({
          id: nextManualOperationId(),
          type: "paint",
          layerId: activeLayerId,
          timestamp: Date.now(),
          changes,
        } as any); // TODO(类型): store 操作类型由 stores/workbench 定义
      }
    },
    [mappedPixelDataRef, setMappedPixelData, updateCountsFromPixelData, dispatchOperation]
  );

  const applyManualUndo = useCallback(() => {
    undoInStore();
    syncCompositeFromStore();
  }, [undoInStore, syncCompositeFromStore]);

  const applyManualRedo = useCallback(() => {
    redoInStore();
    syncCompositeFromStore();
  }, [redoInStore, syncCompositeFromStore]);

  // 进入粘贴模式（复制/剪切/按下 v 后调用）
  const enterPasteMode = useCallback(() => {
    setManualSelection(null);
    setManualSelectionPreview(null);
    setManualMovePreview(null);
    setManualPreviewCells(null);
    setManualPastePreview(null);
    pasteAnchorRef.current = { anchor: null };
    setManualPasteActive(true);
    setManualTool("paste");
  }, []);

  // 指针交互结果应用器
  const applyPointerResult = useCallback(
    (result: ManualPointerResult) => {
      if (result.initPointer) {
        pointerStateRef.current = {
          isDown: true,
          tool: result.initPointer.tool,
          start: result.initPointer.start,
          last: result.initPointer.last,
        };
      }
      if (result.resetDidModify) didModifyRef.current = false;
      if (result.setStrokeBase) strokeBaseRef.current = result.setStrokeBase;
      if (result.nextData) {
        mappedPixelDataRef.current = result.nextData;
        setMappedPixelData(result.nextData);
      }
      if (result.commit) applyManualCommit(result.commit.nextData, result.commit.previousData);
      if (result.selectionPreview !== undefined) setManualSelectionPreview(result.selectionPreview);
      if (result.selection !== undefined) setManualSelection(result.selection);
      if (result.movePreview !== undefined) setManualMovePreview(result.movePreview);
      if (result.previewCells !== undefined) setManualPreviewCells(result.previewCells);
      if (result.pastePreview !== undefined) setManualPastePreview(result.pastePreview);
      if (result.pickedColor) setSelectedColor(result.pickedColor);
      if (result.canvasColorSelect) handleCanvasColorSelect(result.canvasColorSelect);
      if (result.setEraseMode !== undefined) setIsEraseMode(result.setEraseMode);
      if (result.setPasteActive !== undefined) setManualPasteActive(result.setPasteActive);
      if (result.setTool) setManualTool(result.setTool);
      if (result.didModify) didModifyRef.current = true;
      if (result.pointerDown !== undefined) pointerStateRef.current.isDown = result.pointerDown;
      if (result.pointerLast) pointerStateRef.current.last = result.pointerLast;
      if (result.setPasteAnchor) pasteAnchorRef.current.anchor = result.setPasteAnchor;
      if (result.setMoveRef) moveRef.current = result.setMoveRef;
    },
    [applyManualCommit, handleCanvasColorSelect, mappedPixelDataRef, setIsEraseMode, setMappedPixelData, setSelectedColor]
  );

  // 构造指针上下文
  const buildPointerContext = useCallback(
    (data: PixelGrid, cell: CellPos): PointerContext => ({
      data,
      grid: gridDimensions!,
      cell,
      activeTool: manualPasteActive ? "paste" : manualTool,
      selectedColor,
      brushSize: manualBrushSize,
      shapeFill: manualShapeFill,
      mirrorX: manualMirrorX,
      mirrorY: manualMirrorY,
      pointerStart: pointerStateRef.current.start,
      pointerLast: pointerStateRef.current.last,
      isPointerDown: pointerStateRef.current.isDown,
      colorReplaceActive: colorReplaceState.isActive,
      colorReplaceStep: colorReplaceState.step,
      isEraseMode,
      pasteActive: manualPasteActive,
      clipboard: manualClipboard,
      pasteAnchor: pasteAnchorRef.current.anchor,
      selection: manualSelection,
      selectionPreview: manualSelectionPreview,
      moveSelection: moveRef.current.selection,
      moveStart: moveRef.current.start,
      moveOffset: moveRef.current.offset,
      moveBuffer: moveRef.current.buffer,
    }),
    [gridDimensions, manualPasteActive, manualTool, selectedColor, manualBrushSize, manualShapeFill, manualMirrorX, manualMirrorY, colorReplaceState.isActive, colorReplaceState.step, isEraseMode, manualClipboard, manualSelection, manualSelectionPreview]
  );

  // 手动模式画布指针事件
  const handleManualPointer = useCallback(
    (phase: "down" | "move" | "up" | "leave", hit: ManualPointerCell) => {
      let result: ManualPointerResult | undefined;
      if (phase === "leave") {
        if (pointerStateRef.current.isDown) {
          const tool = pointerStateRef.current.tool;
          if ((tool === "brush" || tool === "eraser") && didModifyRef.current && strokeBaseRef.current) {
            applyManualCommit(mappedPixelDataRef.current!, strokeBaseRef.current);
          }
        }
        didModifyRef.current = false;
        pointerStateRef.current.isDown = false;
        setManualSelectionPreview(null);
        setManualMovePreview(null);
        setManualPreviewCells(null);
        return;
      }
      if (!gridDimensions || !mappedPixelDataRef.current || !hit.hasCell) return;
      const ctx = buildPointerContext(mappedPixelDataRef.current, { row: hit.row, col: hit.col });
      const tool = ctx.activeTool;
      if (tool === "drag") {
        if (phase === "up") pointerStateRef.current.isDown = false;
        return;
      }
      if (phase === "down") {
        // —— 按下策略
        result = (function (e: PointerContext): ManualPointerResult {
          const { data, grid, cell, activeTool, selectedColor: selColor, brushSize, shapeFill, mirrorX, mirrorY } = e;
          // 颜色替换第一步：点画布选源颜色
          if (e.colorReplaceActive && e.colorReplaceStep === "select-source") {
            const cellData = data[cell.row]?.[cell.col];
            return cellData && !cellData.isExternal && cellData.key && cellData.key !== ERASE_KEY
              ? { canvasColorSelect: { key: cellData.key, color: cellData.color } }
              : {};
          }
          // 橡皮擦模式：点击同色连通区域整体擦除
          if (e.isEraseMode) {
            const cellData = data[cell.row]?.[cell.col];
            return cellData && !cellData.isExternal && cellData.key && cellData.key !== ERASE_KEY
              ? {
                  commit: { nextData: floodFillErase(data, cell.row, cell.col, cellData.key, grid), previousData: data },
                  setEraseMode: false,
                }
              : {};
          }
          const result: ManualPointerResult = {
            initPointer: { tool: activeTool, start: cell, last: cell },
            resetDidModify: true,
            setStrokeBase: data,
          };
          if (activeTool === "picker") {
            const cellData = data[cell.row]?.[cell.col];
            if (cellData && !cellData.isExternal && cellData.key !== ERASE_KEY) {
              result.pickedColor = { key: cellData.key, color: cellData.color };
            }
            result.pointerDown = false;
            return result;
          }
          if (activeTool === "fill") {
            if (!selColor) return result;
            const filled = (function (src: PixelGrid, gridDims: GridDimensions, start: CellPos, fillWith: SelectedColor): PixelGrid {
              const startCell = src[start.row]?.[start.col];
              if (!startCell || startCell.isExternal || startCell.color.toUpperCase() === fillWith.color.toUpperCase()) return src;
              const out = src.map((row) => row.map((c) => ({ ...c } as PixelCell)));
              const target = startCell.color.toUpperCase();
              const queue: CellPos[] = [start];
              const visited = Array.from({ length: gridDims.M }, () => Array(gridDims.N).fill(false));
              while (queue.length > 0) {
                const { row, col } = queue.pop()!;
                if (row < 0 || row >= gridDims.M || col < 0 || col >= gridDims.N || visited[row][col]) continue;
                const cell = out[row][col];
                if (cell && !cell.isExternal && cell.color.toUpperCase() === target) {
                  visited[row][col] = true;
                  out[row][col] = { key: fillWith.key, color: fillWith.color, isExternal: false };
                  queue.push({ row: row - 1, col }, { row: row + 1, col }, { row, col: col - 1 }, { row, col: col + 1 });
                }
              }
              return out;
            })(data, grid, cell, selColor);
            if (filled !== data) {
              result.nextData = filled;
              result.commit = { nextData: filled, previousData: data };
            }
            result.pointerDown = false;
            return result;
          }
          if (activeTool === "select") {
            const insideSelection =
              e.selection !== null &&
              e.selection !== undefined &&
              (() => {
                const sel = e.selection!;
                return cell.row >= sel.rowStart && cell.row <= sel.rowEnd && cell.col >= sel.colStart && cell.col <= sel.colEnd;
              })();
            if (e.selection && insideSelection) {
              result.setMoveRef = {
                selection: e.selection,
                start: cell,
                offset: { row: 0, col: 0 },
                buffer: extractSelectionBuffer(data, e.selection),
              };
              result.movePreview = e.selection;
            } else {
              result.selection = null;
              result.selectionPreview = selectionFromTwoCells(cell, cell);
              result.setMoveRef = { selection: null, start: null, offset: { row: 0, col: 0 }, buffer: null };
            }
            return result;
          }
          if (activeTool === "paste") {
            if (e.clipboard) {
              result.setPasteAnchor = cell;
              result.pastePreview = getPastePreviewRect(cell, e.clipboard);
            }
            return result;
          }
          if (activeTool === "line" || activeTool === "rect") {
            result.previewCells = computeShapePreviewCells(activeTool, cell, cell, brushSize, shapeFill, grid, mirrorX, mirrorY);
            return result;
          }
          if (activeTool === "brush" || activeTool === "eraser") {
            if (activeTool !== "eraser" && !selColor) return result;
            const painted = paintCellsOnData(
              data,
              computeBrushStrokeCells(cell, cell, brushSize, grid, mirrorX, mirrorY),
              activeTool === "eraser" ? ERASE_CELL : selColor!
            );
            if (painted !== data) {
              result.nextData = painted;
              result.didModify = true;
            }
          }
          return result;
        })(ctx);
      } else if (phase === "move") {
        // —— 移动策略
        result = (function (e: PointerContext): ManualPointerResult {
          const { data, grid, cell, activeTool, selectedColor: selColor, brushSize, shapeFill, mirrorX, mirrorY } = e;
          if (e.pasteActive && e.clipboard) {
            return { pastePreview: getPastePreviewRect(cell, e.clipboard), setPasteAnchor: cell };
          }
          if (!e.isPointerDown) return {};
          if (activeTool === "select") {
            if (e.moveSelection && e.moveStart) {
              const offset = { row: cell.row - e.moveStart.row, col: cell.col - e.moveStart.col };
              return {
                setMoveRef: { selection: e.moveSelection, start: e.moveStart, offset, buffer: e.moveBuffer },
                movePreview: (() => {
                  const sel = e.moveSelection!;
                  return {
                    rowStart: sel.rowStart + offset.row,
                    rowEnd: sel.rowEnd + offset.row,
                    colStart: sel.colStart + offset.col,
                    colEnd: sel.colEnd + offset.col,
                  };
                })(),
              };
            }
            return e.pointerStart ? { selectionPreview: selectionFromTwoCells(e.pointerStart, cell) } : {};
          }
          if (activeTool === "line" || activeTool === "rect") {
            return e.pointerStart ? { previewCells: computeShapePreviewCells(activeTool, e.pointerStart, cell, brushSize, shapeFill, grid, mirrorX, mirrorY) } : {};
          }
          if (activeTool === "brush" || activeTool === "eraser") {
            return activeTool === "eraser" || selColor
              ? {
                  nextData: paintCellsOnData(
                    data,
                    computeBrushStrokeCells(e.pointerLast ?? cell, cell, brushSize, grid, mirrorX, mirrorY),
                    activeTool === "eraser" ? ERASE_CELL : selColor!
                  ),
                  didModify: true,
                  pointerLast: cell,
                }
              : {};
          }
          return {};
        })(ctx);
      } else {
        // —— 抬起策略
        if ((tool === "brush" || tool === "eraser") && !ctx.pasteActive) {
          if (pointerStateRef.current.isDown && didModifyRef.current && strokeBaseRef.current) {
            applyManualCommit(mappedPixelDataRef.current!, strokeBaseRef.current);
          }
          didModifyRef.current = false;
          pointerStateRef.current.isDown = false;
          return;
        }
        result = (function (e: PointerContext): ManualPointerResult {
          const { data, grid, cell, activeTool, selectedColor: selColor, brushSize, shapeFill, mirrorX, mirrorY } = e;
          if (e.pasteActive && e.clipboard) {
            const anchor = e.pasteAnchor ?? cell;
            return {
              commit: { nextData: stampBufferOntoData(data, e.clipboard, anchor, grid), previousData: data },
              pastePreview: getPastePreviewRect(anchor, e.clipboard),
              setPasteAnchor: anchor,
              pointerDown: false,
            };
          }
          if (!e.isPointerDown) return {};
          if (activeTool === "select") {
            if (e.moveSelection && e.moveBuffer) {
              const result: ManualPointerResult = {
                movePreview: null,
                setMoveRef: { selection: null, start: null, offset: { row: 0, col: 0 }, buffer: null },
                pointerDown: false,
              };
              if (e.moveOffset.row !== 0 || e.moveOffset.col !== 0) {
                const target = { row: e.moveSelection.rowStart + e.moveOffset.row, col: e.moveSelection.colStart + e.moveOffset.col };
                result.commit = {
                  nextData: stampBufferOntoData(clearGridRegion(data, e.moveSelection), e.moveBuffer, target, grid),
                  previousData: data,
                };
                const buffer = e.moveBuffer;
                result.selection = {
                  rowStart: Math.max(0, target.row),
                  rowEnd: Math.min(grid.M - 1, target.row + buffer.height - 1),
                  colStart: Math.max(0, target.col),
                  colEnd: Math.min(grid.N - 1, target.col + buffer.width - 1),
                };
              } else {
                result.selection = e.moveSelection;
              }
              return result;
            }
            return { selection: e.selectionPreview ?? undefined, selectionPreview: null, pointerDown: false };
          }
          return activeTool === "line" || activeTool === "rect"
            ? selColor && e.pointerStart
              ? {
                  commit: {
                    nextData: paintCellsOnData(data, computeShapePreviewCells(activeTool, e.pointerStart, cell, brushSize, shapeFill, grid, mirrorX, mirrorY), selColor),
                    previousData: data,
                  },
                  previewCells: null,
                  pointerDown: false,
                }
              : {}
            : activeTool === "brush" || activeTool === "eraser"
            ? { resetDidModify: true, pointerDown: false }
            : {};
        })(ctx);
      }
      applyPointerResult(result);
    },
    [applyManualCommit, applyPointerResult, buildPointerContext, gridDimensions, mappedPixelDataRef]
  );

  // 舞台尺寸观测
  useEffect(() => {
    if (!stageRef.current) return;
    const stage = stageRef.current;
    const measure = () => setManualStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef]);

  // 网格/画布尺寸变化时重置“已初始化视图”标记
  useEffect(() => {
    viewInitializedRef.current = false;
  }, [gridDimensions, pixelatedCanvasSize]);

  // 进入手动模式后计算初始缩放
  useEffect(() => {
    if (isManualColoringMode && !viewInitializedRef.current && pixelatedCanvasSize && gridDimensions) {
      setManualView({
        scale: computeInitialManualViewScale(pixelatedCanvasSize, gridDimensions),
        offset: { x: 0, y: 0 },
      });
      viewInitializedRef.current = true;
    }
  }, [gridDimensions, isManualColoringMode, pixelatedCanvasSize]);

  // 自动选中第一个颜色
  useEffect(() => {
    if (isManualColoringMode && !selectedColor && currentGridColors.length > 0) {
      setSelectedColor({ key: currentGridColors[0].key, color: currentGridColors[0].color });
    }
  }, [isManualColoringMode, selectedColor, currentGridColors, setSelectedColor]);

  // 离开粘贴工具时清粘贴态
  useEffect(() => {
    if (!isManualColoringMode) return;
    setManualMovePreview(null);
    if ("paste" !== manualTool && manualPasteActive) {
      setManualPasteActive(false);
      setManualPastePreview(null);
    }
  }, [isManualColoringMode, manualPasteActive, manualTool]);

  // 键盘快捷键（手动模式：空格拖拽、Ctrl+Z/Y 撤销重做、Ctrl+C/X/V、Esc、Delete、工具键）
  useEffect(() => {
    if (!isManualColoringMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ("INPUT" === target.tagName || "TEXTAREA" === target.tagName || target.isContentEditable)) return;
      if ("Space" === event.code) {
        event.preventDefault();
        setIsPanModifierActive(true);
        return;
      }
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if ("z" === key) {
          event.preventDefault();
          event.shiftKey ? applyManualRedo() : applyManualUndo();
          return;
        }
        if ("y" === key) {
          event.preventDefault();
          applyManualRedo();
          return;
        }
        if ("c" === key && manualSelection && mappedPixelDataRef.current) {
          event.preventDefault();
          setManualClipboard(extractSelectionBuffer(mappedPixelDataRef.current, manualSelection));
          enterPasteMode();
          return;
        }
        if ("x" === key && manualSelection && mappedPixelDataRef.current) {
          event.preventDefault();
          const buffer = extractSelectionBuffer(mappedPixelDataRef.current, manualSelection);
          applyManualCommit(clearGridRegion(mappedPixelDataRef.current, manualSelection), mappedPixelDataRef.current);
          setManualClipboard(buffer);
          enterPasteMode();
          return;
        }
        if ("v" === key && manualClipboard) {
          event.preventDefault();
          enterPasteMode();
          return;
        }
      }
      if ("escape" === key) {
        if (manualPasteActive) {
          setManualPasteActive(false);
          setManualPastePreview(null);
          setManualTool("drag");
          return;
        }
        setManualSelection(null);
        setManualSelectionPreview(null);
        setManualMovePreview(null);
        setManualPreviewCells(null);
        return;
      }
      if ("delete" === key || "backspace" === key) {
        if (!manualSelection || !mappedPixelDataRef.current) return;
        event.preventDefault();
        applyManualCommit(clearGridRegion(mappedPixelDataRef.current, manualSelection), mappedPixelDataRef.current);
        return;
      }
      if (MANUAL_TOOL_HOTKEYS[key]) setManualTool(MANUAL_TOOL_HOTKEYS[key]);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      "Space" === event.code && setIsPanModifierActive(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isManualColoringMode, manualSelection, manualClipboard, manualPasteActive, applyManualCommit, applyManualRedo, applyManualUndo, enterPasteMode, mappedPixelDataRef]);

  const handleManualCopy = useCallback(() => {
    if (manualSelection && mappedPixelDataRef.current) {
      setManualClipboard(extractSelectionBuffer(mappedPixelDataRef.current, manualSelection));
      enterPasteMode();
    }
  }, [enterPasteMode, manualSelection, mappedPixelDataRef]);

  const handleManualCut = useCallback(() => {
    if (manualSelection && mappedPixelDataRef.current) {
      const buffer = extractSelectionBuffer(mappedPixelDataRef.current, manualSelection);
      applyManualCommit(clearGridRegion(mappedPixelDataRef.current, manualSelection), mappedPixelDataRef.current);
      setManualClipboard(buffer);
      enterPasteMode();
    }
  }, [enterPasteMode, manualSelection, mappedPixelDataRef, applyManualCommit]);

  const handleManualDeleteSelection = useCallback(() => {
    if (manualSelection && mappedPixelDataRef.current) {
      applyManualCommit(clearGridRegion(mappedPixelDataRef.current, manualSelection), mappedPixelDataRef.current);
    }
  }, [manualSelection, mappedPixelDataRef, applyManualCommit]);

  const handleManualClearSelection = useCallback(() => {
    setManualSelection(null);
    setManualSelectionPreview(null);
    setManualMovePreview(null);
    setManualPreviewCells(null);
    if (manualPasteActive) {
      setManualPasteActive(false);
      setManualPastePreview(null);
      setManualTool("brush");
    }
  }, [manualPasteActive]);

  const handleManualViewChange = useCallback((scale: number, offset: { x: number; y: number }) => {
    setManualView({ scale, offset });
  }, []);

  const handleManualToolSelect = useCallback(
    (tool: ManualToolId) => {
      setManualTool(tool);
      if ("select" !== tool && "paste" !== tool) {
        setManualSelection(null);
        setManualSelectionPreview(null);
        setManualMovePreview(null);
      }
      if ("paste" !== tool && manualPasteActive) {
        setManualPasteActive(false);
        setManualPastePreview(null);
      }
    },
    [manualPasteActive]
  );

  return {
    manualTool,
    setManualTool,
    manualBrushSize,
    setManualBrushSize,
    manualShapeFill,
    setManualShapeFill,
    manualMirrorX,
    setManualMirrorX,
    manualMirrorY,
    setManualMirrorY,
    manualShowReference,
    setManualShowReference,
    manualReferenceOpacity,
    setManualReferenceOpacity,
    manualSelection,
    manualSelectionPreview,
    manualPreviewCells,
    manualMovePreview,
    manualPastePreview,
    manualClipboard,
    manualPasteActive,
    canUndo,
    canRedo,
    manualView,
    isPanModifierActive,
    manualStageSize,
    resetManualState,
    handleManualPointer,
    applyManualCommit,
    applyManualUndo,
    applyManualRedo,
    handleManualToolSelect,
    handleManualCopy,
    handleManualCut,
    handleManualDeleteSelection,
    handleManualClearSelection,
    handleManualViewChange,
    computeFloodFillErase: useCallback(
      (data: PixelGrid, row: number, col: number, key: string) => (gridDimensions ? floodFillErase(data, row, col, key, gridDimensions) : data),
      [gridDimensions]
    ),
  };
}
interface FocusModeProps {
  workspaceMode: string;
  colorCounts: ColorCounts;
  selectedColorSystem: string;
  pixelatedCanvasSize: CanvasSize | null;
  pixelatedCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  resetManualState: () => void;
  setWorkspaceMode: (mode: string) => void;
}

// 专心拼豆模式子系统
function useFocusMode(props: FocusModeProps) {
  const { workspaceMode, colorCounts, selectedColorSystem, pixelatedCanvasSize, pixelatedCanvasRef, resetManualState, setWorkspaceMode } = props;
  const mappedPixelData = useStoredPixelData();
  const gridDimensions = useStoredGridDimensions();
  const [focusState, setFocusState] = useState<FocusState>(createInitialFocusState());
  const [focusColors, setFocusColors] = useState<FocusColorRow[]>([]);

  const handleEnterFocusMode = useCallback(() => {
    if (mappedPixelData && gridDimensions) {
      localStorage.setItem("focusMode_pixelData", JSON.stringify(mappedPixelData));
      localStorage.setItem("focusMode_gridDimensions", JSON.stringify(gridDimensions));
      localStorage.setItem("focusMode_colorCounts", JSON.stringify(colorCounts));
      localStorage.setItem("focusMode_selectedColorSystem", selectedColorSystem);
      resetManualState();
      setWorkspaceMode("focus");
    }
  }, [mappedPixelData, gridDimensions, colorCounts, selectedColorSystem, resetManualState, setWorkspaceMode]);

  useEffect(() => {
    if ("focus" === workspaceMode) resetManualState();
  }, [workspaceMode, resetManualState]);

  // 进入 focus 模式：初始化颜色清单与进度
  useEffect(() => {
    if ("focus" !== workspaceMode || !mappedPixelData || !gridDimensions || !colorCounts) return;
    const initialScale = (() => {
      if (!pixelatedCanvasSize) return 1;
      const cell = Math.min(pixelatedCanvasSize.width / gridDimensions.N, pixelatedCanvasSize.height / gridDimensions.M);
      return !Number.isFinite(cell) || cell <= 0 ? 1 : Math.max(1, Math.min(8, 24 / cell));
    })();
    const colors: FocusColorRow[] = Object.entries(colorCounts).map(([, entry]) => {
      const name = getColorDisplayKey(entry.color, selectedColorSystem);
      return { color: entry.color, name, total: entry.count, completed: 0 };
    });
    setFocusColors(colors);
    setFocusState((prev) => ({
      ...createInitialFocusState(),
      canvasScale: 1 === prev.canvasScale ? initialScale : prev.canvasScale,
      canvasOffset: prev.canvasOffset,
      guidanceMode: prev.guidanceMode,
      showSectionLines: prev.showSectionLines,
      sectionLineColor: prev.sectionLineColor,
      gridSectionInterval: prev.gridSectionInterval,
      enableCelebration: prev.enableCelebration,
      currentColor: colors[0]?.color || "",
      colorProgress: colors.reduce((acc, c) => ({ ...acc, [c.color]: { completed: 0, total: c.total } }), {}),
    }));
  }, [workspaceMode, mappedPixelData, gridDimensions, colorCounts, selectedColorSystem, pixelatedCanvasSize]);

  // focus 模式下若画布尺寸后到，补算初始缩放
  useEffect(() => {
    if ("focus" === workspaceMode && gridDimensions && pixelatedCanvasSize) {
      setFocusState((prev) => {
        if (1 !== prev.canvasScale) return prev;
        const cell = Math.min(pixelatedCanvasSize.width / gridDimensions.N, pixelatedCanvasSize.height / gridDimensions.M);
        if (!Number.isFinite(cell) || cell <= 0) return prev;
        const scale = Math.max(1, Math.min(8, 24 / cell));
        return { ...prev, canvasScale: scale };
      });
    }
  }, [workspaceMode, gridDimensions, pixelatedCanvasSize]);

  // 计时器（未暂停时每秒累计）
  useEffect(() => {
    if ("focus" !== workspaceMode) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    if (!focusState.isPaused) {
      timer = setInterval(() => {
        setFocusState((prev) => {
          const now = Date.now();
          const elapsed = Math.floor((now - prev.lastResumeTime) / 1e3);
          return { ...prev, totalElapsedTime: prev.totalElapsedTime + elapsed, lastResumeTime: now };
        });
      }, 1e3);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [workspaceMode, focusState.isPaused]);

  // 推荐区域计算
  const computeRecommendedRegion = useCallback(() => {
    let region: CellPos[] | undefined;
    if ("focus" !== workspaceMode || !mappedPixelData || !focusState.currentColor) return { region: null, cell: null };
    const regions = (function (data: PixelGrid, color: string): CellPos[][] {
      if (!data || 0 === data.length) return [];
      const rowCount = data.length;
      const colCount = data[0].length;
      const visited = Array(rowCount)
        .fill(null)
        .map(() => Array(colCount).fill(false));
      const found: CellPos[][] = [];
      for (let row = 0; row < rowCount; row++)
        for (let col = 0; col < colCount; col++)
          if (!visited[row][col]) {
            const cell = data[row][col];
            if (cell && !cell.isExternal && cell.color === color) {
              const connected = findConnectedRegion(data, row, col, color);
              if (connected.length > 0) {
                found.push(connected);
                connected.forEach(({ row: r, col: c }) => {
                  visited[r][c] = true;
                });
              }
            }
          }
      return found;
    })(mappedPixelData, focusState.currentColor).filter((r) => !isRegionCompleted(r, focusState.completedCells));
    if (0 === regions.length) return { region: null, cell: null };
    switch (focusState.guidanceMode) {
      case "nearest": {
        const ref = focusState.selectedCell ?? { row: Math.floor(mappedPixelData.length / 2), col: Math.floor(mappedPixelData[0].length / 2) };
        region = regions
          .sort((a, b) => {
            const centerA = getRegionCenterCell(a);
            const centerB = getRegionCenterCell(b);
            return Math.abs(centerA.row - ref.row) + Math.abs(centerA.col - ref.col) - (Math.abs(centerB.row - ref.row) + Math.abs(centerB.col - ref.col));
          })[0];
        break;
      }
      case "largest":
        region = regions.sort((a, b) => b.length - a.length)[0];
        break;
      case "edge-first": {
        const rowCount = mappedPixelData.length;
        const colCount = mappedPixelData[0].length;
        const edgeRegions = regions.filter((r) => r.some((c) => 0 === c.row || c.row === rowCount - 1 || 0 === c.col || c.col === colCount - 1));
        region = edgeRegions.length > 0 ? edgeRegions[0] : regions[0];
        break;
      }
      default:
        region = regions[0];
    }
    const cell = getRegionCenterCell(region);
    return { region, cell };
  }, [workspaceMode, mappedPixelData, focusState.currentColor, focusState.completedCells, focusState.selectedCell, focusState.guidanceMode]);

  // 推荐区域有变化时写入状态
  useEffect(() => {
    if ("focus" !== workspaceMode) return;
    const { region, cell } = computeRecommendedRegion();
    setFocusState((prev) =>
      isSameCellList(prev.recommendedRegion ?? [], region ?? []) && isSameCell(prev.recommendedCell ?? null, cell ?? null)
        ? prev
        : { ...prev, recommendedRegion: region, recommendedCell: cell }
    );
  }, [workspaceMode, computeRecommendedRegion]);

  // 标记/取消标记一个连通区域为已完成
  const toggleRegionComplete = useCallback(
    (cells: CellPos[]) => {
      if (!mappedPixelData || 0 === cells.length) return;
      const nextCompleted = new Set(focusState.completedCells);
      if (isRegionCompleted(cells, focusState.completedCells)) {
        cells.forEach(({ row, col }) => nextCompleted.delete(`${row},${col}`));
      } else {
        cells.forEach(({ row, col }) => nextCompleted.add(`${row},${col}`));
      }
      const nextProgress = { ...focusState.colorProgress };
      let celebrate = false;
      if (nextProgress[focusState.currentColor]) {
        const prevCompleted = nextProgress[focusState.currentColor].completed;
        const completedNow = Array.from(nextCompleted).filter((key) => {
          const [row, col] = key.split(",").map(Number);
          return mappedPixelData[row]?.[col]?.color === focusState.currentColor;
        }).length;
        nextProgress[focusState.currentColor].completed = completedNow;
        const total = nextProgress[focusState.currentColor].total;
        if (prevCompleted < total && completedNow === total && focusState.enableCelebration) celebrate = true;
      }
      const allDone = Object.values(nextProgress).every((p) => p.completed >= p.total);
      setFocusState((prev) => {
        const now = Date.now();
        let next: FocusState = { ...prev, completedCells: nextCompleted, colorProgress: nextProgress, showCelebration: celebrate };
        if (allDone && !prev.isPaused) {
          const elapsed = Math.floor((now - prev.lastResumeTime) / 1e3);
          next = { ...next, isPaused: true, totalElapsedTime: prev.totalElapsedTime + elapsed };
        }
        return next;
      });
      setFocusColors((prev) =>
        prev.map((row) => {
          if (row.color === focusState.currentColor) {
            return { ...row, completed: nextProgress[focusState.currentColor]?.completed || 0 };
          }
          return row;
        })
      );
    },
    [mappedPixelData, focusState.currentColor, focusState.completedCells, focusState.colorProgress, focusState.enableCelebration]
  );

  const handleFocusCellClick = useCallback(
    (row: number, col: number) => {
      if (mappedPixelData && mappedPixelData[row][col]!.color === focusState.currentColor) {
        toggleRegionComplete(findConnectedRegion(mappedPixelData, row, col, focusState.currentColor));
      }
    },
    [mappedPixelData, focusState.currentColor, toggleRegionComplete]
  );

  const handleFocusMarkRecommended = useCallback(() => {
    if (focusState.recommendedRegion && 0 !== focusState.recommendedRegion.length) {
      toggleRegionComplete(focusState.recommendedRegion);
    }
  }, [focusState.recommendedRegion, toggleRegionComplete]);

  const handleFocusColorChange = useCallback((color: string) => {
    setFocusState((prev) => ({ ...prev, currentColor: color, showColorPanel: false }));
  }, []);

  const handleFocusLocateRecommended = useCallback(() => {
    if (!focusState.recommendedCell || !gridDimensions || !pixelatedCanvasRef.current) return;
    const { row, col } = focusState.recommendedCell;
    const canvas = pixelatedCanvasRef.current;
    const cellW = canvas.width / gridDimensions.N;
    const cellH = canvas.height / gridDimensions.M;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const offsetX = (centerX - (col + 0.5) * cellW) * focusState.canvasScale;
    const offsetY = (centerY - (row + 0.5) * cellH) * focusState.canvasScale;
    setFocusState((prev) => ({ ...prev, canvasOffset: { x: offsetX, y: offsetY } }));
  }, [focusState.recommendedCell, gridDimensions, focusState.canvasScale, pixelatedCanvasRef]);

  const formatFocusTime = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}` : `${minutes}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const handleFocusPauseToggle = useCallback(() => {
    setFocusState((prev) => {
      const now = Date.now();
      if (prev.isPaused) return { ...prev, isPaused: false, lastResumeTime: now };
      const elapsed = Math.floor((now - prev.lastResumeTime) / 1e3);
      return { ...prev, isPaused: true, totalElapsedTime: prev.totalElapsedTime + elapsed };
    });
  }, []);

  const handleFocusCelebrationComplete = useCallback(() => {
    setFocusState((prev) => ({ ...prev, showCelebration: false }));
    if (focusColors.every((c) => c.completed >= c.total)) {
      if (!focusState.completionCardDismissed) {
        setFocusState((prev) => ({ ...prev, showCompletionCard: true }));
      }
    } else {
      const currentIndex = focusColors.findIndex((c) => c.color === focusState.currentColor);
      if (-1 !== currentIndex) {
        for (let step = 1; step < focusColors.length; step++) {
          const nextIndex = (currentIndex + step) % focusColors.length;
          const candidate = focusColors[nextIndex];
          if (candidate.completed < candidate.total) {
            setFocusState((prev) => ({ ...prev, currentColor: candidate.color }));
            break;
          }
        }
      }
    }
  }, [focusColors, focusState.currentColor, focusState.completionCardDismissed]);

  const handleFocusCompletionCardClose = useCallback(() => {
    setFocusState((prev) => ({ ...prev, showCompletionCard: false, completionCardDismissed: true }));
  }, []);

  // 当前颜色全部完成后自动切换到下一个未完成颜色 / 全部完成弹完成卡
  useEffect(() => {
    if ("focus" !== workspaceMode || 0 === focusColors.length) return;
    const current = focusColors.find((c) => c.color === focusState.currentColor);
    if (focusState.showCelebration || (current && current.completed < current.total)) return;
    if (focusColors.every((c) => c.completed >= c.total)) {
      if (!focusState.showCompletionCard && !focusState.completionCardDismissed) {
        setFocusState((prev) => ({ ...prev, showCompletionCard: true }));
      }
      return;
    }
    const currentIndex = focusColors.findIndex((c) => c.color === focusState.currentColor);
    if (-1 !== currentIndex) {
      for (let step = 1; step < focusColors.length; step++) {
        const idx = (currentIndex + step) % focusColors.length;
        const candidate = focusColors[idx];
        if (candidate.completed < candidate.total) {
          if (candidate.color !== focusState.currentColor) {
            setFocusState((prev) => ({ ...prev, currentColor: candidate.color }));
          }
          break;
        }
      }
    }
  }, [workspaceMode, focusColors, focusState.currentColor, focusState.showCelebration, focusState.showCompletionCard, focusState.completionCardDismissed]);

  return {
    focusState,
    setFocusState,
    focusColors,
    handleEnterFocusMode,
    handleFocusCellClick,
    handleFocusMarkRecommended,
    handleFocusColorChange,
    handleFocusLocateRecommended,
    formatFocusTime,
    handleFocusPauseToggle,
    handleFocusCelebrationComplete,
    handleFocusCompletionCardClose,
  };
}

// 拼豆库存管理
function useBeadInventory() {
  const [inventory, setInventory] = useState<Record<string, number>>({});
  useEffect(() => {
    setInventory(
      (() => {
        try {
          const raw = localStorage.getItem(BEAD_INVENTORY_STORAGE_KEY);
          return raw ? JSON.parse(raw) : {};
        } catch (e) {
          return {};
        }
      })()
    );
  }, []);
  const updateColor = useCallback((hex: string, count: number) => {
    setInventory((prev) => {
      const next = { ...prev, [hex.toUpperCase()]: Math.max(0, count) };
      saveBeadInventory(next);
      return next;
    });
  }, []);
  const batchUpdate = useCallback((entries: Record<string, number>) => {
    setInventory((prev) => {
      const next = { ...prev };
      for (const [hex, count] of Object.entries(entries)) next[hex.toUpperCase()] = Math.max(0, count);
      saveBeadInventory(next);
      return next;
    });
  }, []);
  const checkInventory = useCallback(
    (colorCounts: NonNullable<ColorCounts>, system: string): InventoryCheckResult => {
      let totalRequired = 0;
      let totalDeficit = 0;
      const items = Object.entries(colorCounts).map(([hex, { count }]) => {
        const upper = hex.toUpperCase();
        const stock = inventory[upper] ?? 0;
        const deficit = Math.max(0, count - stock);
        totalRequired += count;
        totalDeficit += deficit;
        return {
          hex: upper,
          displayKey: getColorDisplayKey(upper, system),
          required: count,
          stock,
          deficit,
        };
      });
      items.sort((a, b) => b.deficit - a.deficit);
      return { sufficient: 0 === totalDeficit, items, totalRequired, totalDeficit };
    },
    [inventory]
  );
  return {
    inventory,
    updateColor,
    batchUpdate,
    checkInventory,
    deductInventory: useCallback((colorCounts: NonNullable<ColorCounts>) => {
      setInventory((prev) => {
        const next = { ...prev };
        for (const [hex, { count }] of Object.entries(colorCounts)) {
          const upper = hex.toUpperCase();
          next[upper] = Math.max(0, (prev[upper] ?? 0) - count);
        }
        saveBeadInventory(next);
        return next;
      });
    }, []),
  };
}

interface PixelationProps {
  originalImageSrc: string | null;
  granularity: number;
  similarityThreshold: number;
  customPaletteSelections: Record<string, boolean>;
  pixelationMode: PixelationMode;
  remapTrigger: number;
  activeBeadPalette: PaletteColor[];
  gridAlignment: GridAlignment | null;
  gridDimensions: GridDimensions | null;
  originalCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  pixelatedCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  mainRef: React.MutableRefObject<HTMLElement | null>;
  setWorkspaceMode: (mode: string) => void;
  resetManualState: () => void;
  setMappedPixelData: (data: PixelData) => void;
  setGridDimensions: (dims: GridDimensions | null) => void;
  setColorCounts: (counts: ColorCounts) => void;
  setTotalBeadCount: (count: number) => void;
  setInitialGridColorKeys: (keys: Set<string>) => void;
  setOriginalImageSrc: (src: string | null) => void;
}

// 自动优化/像素化子系统
function usePixelationEngine(props: PixelationProps) {
  const toast = useToast();
  const replaceMainGrid = useWorkbenchStore((s) => s.replaceMainGrid);
  const {
    originalImageSrc,
    granularity,
    similarityThreshold,
    customPaletteSelections,
    pixelationMode,
    remapTrigger,
    activeBeadPalette,
    gridAlignment,
    gridDimensions,
    originalCanvasRef,
    pixelatedCanvasRef,
    mainRef,
    setWorkspaceMode,
    resetManualState,
    setMappedPixelData,
    setGridDimensions,
    setColorCounts,
    setTotalBeadCount,
    setInitialGridColorKeys,
    setOriginalImageSrc,
  } = props;
  const [placeholderPixelData, setPlaceholderPixelData] = useState<PixelGrid | null>(null);
  const [placeholderGridDimensions, setPlaceholderGridDimensions] = useState<GridDimensions | null>(null);
  const [placeholderCanvasSize, setPlaceholderCanvasSize] = useState<CanvasSize | null>(null);
  const [pixelatedCanvasSize, setPixelatedCanvasSize] = useState<CanvasSize | null>(null);

  // 核心像素化流程
  const runPixelation = useCallback(
    (imageSrc: string, granularityArg: number, similarity: number, palette: PaletteColor[], mode: PixelationMode) => {
      const originalCanvas = originalCanvasRef.current;
      const pixelatedCanvas = pixelatedCanvasRef.current;
      if (!originalCanvas || !pixelatedCanvas) return;
      const originalCtx = originalCanvas.getContext("2d", { willReadFrequently: true });
      const pixelatedCtx = pixelatedCanvas.getContext("2d");
      if (!originalCtx || !pixelatedCtx) return;
      if (0 === palette.length) {
        toast.error("当前可用颜色板为空（颜色全部被排除）— 请恢复部分颜色");
        pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
        setMappedPixelData(null);
        setGridDimensions(null);
        return;
      }
      const transparentFallback = palette.find((e) => "T1" === e.key) || palette.find((e) => "#FFFFFF" === e.hex.toUpperCase()) || palette[0];
      const img = new window.Image();
      img.onerror = () => {
        toast.error("无法加载图片");
        setOriginalImageSrc(null);
        setMappedPixelData(null);
        setGridDimensions(null);
        setColorCounts(null);
        setInitialGridColorKeys(new Set());
      };
      img.onload = () => {
        let alignment: GridAlignment | undefined;
        const aspect = img.height / img.width;
        if (gridAlignment) {
          alignment = { refX: gridAlignment.refX, refY: gridAlignment.refY, cellWidth: gridAlignment.cellWidth, cellHeight: gridAlignment.cellHeight };
        }
        let cols = granularityArg;
        let rows = Math.max(1, Math.round(cols * aspect));
        if (cols <= 0 || rows <= 0) return;
        const scaleFactor = Math.max(4, 4 * Math.floor(computeTargetCanvasWidth(cols, 500) / cols / 4));
        const scaledWidth = scaleFactor * cols;
        const scaledHeight = scaleFactor * rows;
        setPixelatedCanvasSize({ width: scaledWidth, height: scaledHeight });
        originalCanvas.width = img.width;
        originalCanvas.height = img.height;
        pixelatedCanvas.width = scaledWidth;
        pixelatedCanvas.height = scaledHeight;
        originalCtx.drawImage(img, 0, 0, img.width, img.height);
        const grid = pixelateImageToGrid(originalCtx, img.width, img.height, cols, rows, palette, mode, transparentFallback, alignment);
        if (alignment && grid.length > 0) {
          rows = grid.length;
          cols = grid[0].length;
          const scaleFactor2 = Math.max(4, 4 * Math.floor(computeTargetCanvasWidth(cols, 500) / cols / 4));
          const width2 = scaleFactor2 * cols;
          const height2 = scaleFactor2 * rows;
          pixelatedCanvas.width = width2;
          pixelatedCanvas.height = height2;
          setPixelatedCanvasSize({ width: width2, height: height2 });
        }
        const keyToRgb = new Map<string, { r: number; g: number; b: number }>();
        const keyToColor = new Map<string, PaletteColor>();
        palette.forEach((c) => {
          keyToRgb.set(c.key, c.rgb);
          keyToColor.set(c.key, c);
        });
        // 统计各色号出现次数（按次数降序），随后做相似色合并
        const keyCounts: Record<string, number> = {};
        grid.flat().forEach((cell) => {
          if (cell && cell.key && !cell.isExternal && cell.key !== ERASE_KEY) {
            keyCounts[cell.key] = (keyCounts[cell.key] || 0) + 1;
          }
        });
        const orderedKeys = Object.entries(keyCounts)
          .sort((a, b) => b[1] - a[1])
          .map((e) => e[0]);
        const resultData = grid.map((row) => row.map((cell) => ({ ...cell, isExternal: cell.isExternal ?? false })));
        const merged = new Set<string>();
        for (let i = 0; i < orderedKeys.length; i++) {
          const keepKey = orderedKeys[i];
          if (merged.has(keepKey)) continue;
          const keepRgb = keyToRgb.get(keepKey);
          if (keepRgb) {
            for (let j = i + 1; j < orderedKeys.length; j++) {
              const mergeKey = orderedKeys[j];
              if (merged.has(mergeKey)) continue;
              const mergeRgb = keyToRgb.get(mergeKey);
              if (mergeRgb && colorDistanceRgb(keepRgb, mergeRgb) < similarity) {
                merged.add(mergeKey);
                for (let row = 0; row < rows; row++)
                  for (let col = 0; col < cols; col++)
                    if (resultData[row][col].key === mergeKey) {
                      const target = keyToColor.get(keepKey);
                      if (target) {
                        resultData[row][col] = { key: keepKey, color: target.hex, isExternal: false };
                      }
                    }
              }
            }
          }
        }
        if (pixelatedCanvasRef.current) {
          setMappedPixelData(resultData);
          setGridDimensions({ N: cols, M: rows });
          replaceMainGrid(resultData, { width: cols, height: rows });
          const counts: Record<string, ColorCountEntry> = {};
          let total = 0;
          resultData.flat().forEach((cell) => {
            if (cell && cell.key && !cell.isExternal) {
              const hex = cell.color;
              if (!counts[hex]) counts[hex] = { count: 0, color: cell.color };
              counts[hex].count++;
              total++;
            }
          });
          setColorCounts(counts);
          setTotalBeadCount(total);
          setInitialGridColorKeys(new Set(Object.keys(counts)));
        }
      };
      img.src = imageSrc;
      setWorkspaceMode("studio");
      resetManualState();
    },
    [gridAlignment, originalCanvasRef, pixelatedCanvasRef, setMappedPixelData, setGridDimensions, setColorCounts, setTotalBeadCount, setInitialGridColorKeys, setOriginalImageSrc, setWorkspaceMode, resetManualState, toast, replaceMainGrid]
  );

  // 有图且有可用色板时（延迟 50ms）执行像素化；色板为空时画提示文案
  useEffect(() => {
    if (originalImageSrc && activeBeadPalette.length > 0) {
      const timer = setTimeout(() => {
        if (originalImageSrc && originalCanvasRef.current && pixelatedCanvasRef.current && activeBeadPalette.length > 0) {
          runPixelation(originalImageSrc, granularity, similarityThreshold, activeBeadPalette, pixelationMode);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    if (originalImageSrc && 0 === activeBeadPalette.length) {
      const canvas = pixelatedCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#6b7280";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("无可用颜色，请恢复部分排除的颜色", canvas.width / 2, canvas.height / 2);
      }
      setMappedPixelData(null);
      setGridDimensions(null);
    }
    // 源依赖数组即为如此（activeBeadPalette 未列入），保持逐字一致
  }, [originalImageSrc, granularity, similarityThreshold, customPaletteSelections, pixelationMode, remapTrigger]);

  // 无图时程序化绘制欢迎占位画
  useEffect(() => {
    if (placeholderPixelData || placeholderGridDimensions) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 880;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    let rngState = 0x1789b8d;
    const random = () => ((rngState = (16807 * rngState) % 0x7fffffff) - 1) / 0x7ffffffe;
    const roundedRectPath = (x: number, y: number, w: number, h: number, r: number) => {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };
    const glow = (x: number, y: number, radius: number, rgb: string, alpha: number) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      gradient.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
    };
    const confetti = (x: number, y: number, size: number, color: string, rotate: number, shape: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotate);
      ctx.fillStyle = color;
      if (0 === shape) {
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
        ctx.fill();
      } else if (1 === shape) {
        ctx.fillRect(-size / 2, -size / 2, size, size);
      } else {
        if (2 === shape) {
          ctx.beginPath();
          ctx.moveTo(0, -size / 2);
          ctx.lineTo(size / 2, 0);
          ctx.lineTo(0, size / 2);
          ctx.lineTo(-size / 2, 0);
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -size / 2);
          ctx.lineTo(size / 2, size / 2);
          ctx.lineTo(-size / 2, size / 2);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    // 背景渐变 + 光晕
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#F8FAFF");
    background.addColorStop(0.35, "#F5F3FF");
    background.addColorStop(0.7, "#ECFEFF");
    background.addColorStop(1, "#FFF7ED");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    glow(0.18 * width, 0.18 * height, 0.35 * width, "255, 120, 196", 0.25);
    glow(0.82 * width, 0.22 * height, 0.32 * width, "99, 102, 241", 0.22);
    glow(0.58 * width, 0.78 * height, 0.45 * width, "14, 165, 233", 0.2);
    // 中心画板光芒
    const boardSize = 0.38 * Math.min(width, height);
    const boardX = centerX - boardSize / 2;
    const boardY = (height - boardSize) / 2;
    const boardCenterX = boardX + boardSize / 2;
    const boardCenterY = boardY + boardSize / 2;
    const rayColors = ["255, 99, 132", "59, 130, 246", "34, 197, 94", "236, 72, 153", "168, 85, 247", "14, 165, 233"];
    for (let i = 0; i < 30; i += 1) {
      const angle = (2 * Math.PI * i) / 30;
      const innerR = boardSize * (0.65 + 0.1 * random());
      const outerR = boardSize * (1.05 + 0.2 * random());
      ctx.strokeStyle = `rgba(${rayColors[i % rayColors.length]}, ${0.18 + 0.18 * random()})`;
      ctx.lineWidth = 8 * (1 + 1.6 * random());
      ctx.beginPath();
      ctx.moveTo(boardCenterX + Math.cos(angle) * innerR, boardCenterY + Math.sin(angle) * innerR);
      ctx.lineTo(boardCenterX + Math.cos(angle) * outerR, boardCenterY + Math.sin(angle) * outerR);
      ctx.stroke();
    }
    // 画板底板（圆角 + 描边 + 高光）
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.25)";
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 16;
    const boardGradient = ctx.createLinearGradient(boardX, boardY, boardX + boardSize, boardY + boardSize);
    boardGradient.addColorStop(0, "#FFFFFF");
    boardGradient.addColorStop(1, "#F3F4FF");
    ctx.fillStyle = boardGradient;
    roundedRectPath(boardX, boardY, boardSize, boardSize, 0.18 * boardSize);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 10.4;
    roundedRectPath(boardX, boardY, boardSize, boardSize, 0.18 * boardSize);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 4.8;
    roundedRectPath(boardX + 7.2, boardY + 7.2, boardSize - 14.4, boardSize - 14.4, 0.14 * boardSize);
    ctx.stroke();
    // 4×4 拼豆网格
    const gap = 0.06 * boardSize;
    const beadSize = (boardSize - 5 * gap) / 4;
    const beadColors = [
      "#F43F5E", "#60A5FA", "#FBBF24", "#22C55E", "#A855F7", "#EC4899", "#F97316", "#06B6D4",
      "#818CF8", "#38BDF8", "#84CC16", "#F59E0B", "#FB7185", "#0EA5E9", "#14B8A6", "#C084FC",
    ];
    let colorIndex = 0;
    for (let row = 0; row < 4; row += 1)
      for (let col = 0; col < 4; col += 1) {
        const cx = boardX + gap + beadSize / 2 + col * (beadSize + gap);
        const cy = boardY + gap + beadSize / 2 + row * (beadSize + gap);
        ctx.fillStyle = beadColors[colorIndex++ % beadColors.length];
        ctx.beginPath();
        ctx.arc(cx, cy, beadSize / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.beginPath();
        ctx.arc(cx - 0.18 * beadSize, cy - 0.18 * beadSize, 0.12 * beadSize, 0, 2 * Math.PI);
        ctx.fill();
      }
    // 撒落彩纸（避开中心画板区域）
    const confettiColors = ["#F97316", "#F43F5E", "#A855F7", "#3B82F6", "#14B8A6", "#10B981", "#EAB308", "#FB7185", "#22C55E", "#0EA5E9"];
    for (let i = 0; i < 110; i += 1) {
      const size = 8 * (1.6 + 4.2 * random());
      const x = random() * width;
      const y = random() * height;
      if (Math.hypot(x - boardCenterX, y - boardCenterY) < 0.7 * boardSize) {
        i -= 1;
        continue;
      }
      ctx.globalAlpha = 0.7 + 0.3 * random();
      confetti(x, y, size, confettiColors[Math.floor(random() * confettiColors.length)], random() * Math.PI, Math.floor(4 * random()));
      ctx.globalAlpha = 1;
    }
    // 生成占位像素数据（160×110）
    const fallback: PaletteColor = FULL_BEAD_PALETTE[0] ?? { key: "#FFFFFF", hex: "#FFFFFF", rgb: { r: 255, g: 255, b: 255 } };
    setPlaceholderPixelData(pixelateImageToGrid(ctx, canvas.width, canvas.height, 160, 110, FULL_BEAD_PALETTE, PixelationMode.Average, fallback));
    setPlaceholderGridDimensions({ N: 160, M: 110 });
  }, [placeholderGridDimensions, placeholderPixelData]);

  // 占位画布尺寸自适应
  useEffect(() => {
    if (!placeholderGridDimensions) return;
    const measure = () => {
      const { N, M } = placeholderGridDimensions;
      const isNarrow = window.innerWidth < 1024;
      const targetWidth = Math.max(240, Math.round(Math.min(1100, isNarrow ? 0.92 * window.innerWidth : window.innerWidth - 420)));
      let cellSize = Math.max(4, 4 * Math.floor(targetWidth / N / 4));
      const maxHeight = isNarrow ? Math.round((4 / 3) * targetWidth) : Infinity;
      if (cellSize * M > maxHeight) cellSize = Math.max(4, 4 * Math.floor(maxHeight / M / 4));
      const width = cellSize * N;
      const height = cellSize * M;
      setPlaceholderCanvasSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [placeholderGridDimensions]);

  // 像素化画布尺寸自适应
  useEffect(() => {
    if (!gridDimensions) return;
    const measure = () => {
      const { N, M } = gridDimensions;
      const isNarrow = window.innerWidth < 1024;
      let targetWidth = 500;
      if (isNarrow) {
        targetWidth = Math.max(240, Math.round(mainRef.current?.clientWidth ?? 0.92 * window.innerWidth));
      } else {
        targetWidth = computeTargetCanvasWidth(N, targetWidth);
      }
      let cellSize = Math.max(4, 4 * Math.floor(targetWidth / N / 4));
      const maxHeight = isNarrow ? Math.round((4 / 3) * targetWidth) : Infinity;
      if (cellSize * M > maxHeight) cellSize = Math.max(4, 4 * Math.floor(maxHeight / M / 4));
      const width = cellSize * N;
      const height = cellSize * M;
      setPixelatedCanvasSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [gridDimensions, mainRef]);

  return {
    placeholderPixelData,
    placeholderGridDimensions,
    placeholderCanvasSize,
    pixelatedCanvasSize,
    setPixelatedCanvasSize,
  };
}
interface ColorManagementProps {
  mappedPixelData: PixelData;
  setMappedPixelData: (data: PixelData) => void;
  gridDimensions: GridDimensions | null;
  colorCounts: ColorCounts;
  setColorCounts: (counts: ColorCounts) => void;
  totalBeadCount: number;
  setTotalBeadCount: (count: number) => void;
  initialGridColorKeys: Set<string>;
  setInitialGridColorKeys: (keys: Set<string>) => void;
  excludedColorKeys: Set<string>;
  setExcludedColorKeys: (keys: Set<string>) => void;
  selectedColor: SelectedColor | null;
  setSelectedColor: (c: SelectedColor | null) => void;
  isEraseMode: boolean;
  setIsEraseMode: (v: boolean) => void;
  colorReplaceState: ColorReplaceState;
  setColorReplaceState: React.Dispatch<React.SetStateAction<ColorReplaceState>>;
  highlightColorKey: string | null; // 源传了该值但 rj 内部未使用，保留以对齐调用
  setHighlightColorKey: (key: string | null) => void;
  showFullPalette: boolean;
  setShowFullPalette: (v: boolean) => void;
  tooltipData: TooltipData | null;
  setTooltipData: (t: TooltipData | null) => void;
  isManualColoringMode: boolean;
  pixelatedCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  mainRef: React.MutableRefObject<HTMLElement | null>;
  setRemapTrigger: React.Dispatch<React.SetStateAction<number>>;
  setWorkspaceMode: (mode: string) => void;
  resetManualState: () => void;
  updateCountsFromPixelData: (data: PixelGrid) => void;
  computeFloodFillEraseForStudio: (data: PixelGrid, row: number, col: number, key: string) => PixelGrid;
  applyManualCommit: (next: PixelGrid, prev?: PixelGrid) => void;
  handleCanvasColorSelect: (c: SelectedColor) => void;
}

// 颜色管理子系统：排除色/去背景/画布交互/颜色替换
function useColorManagement(props: ColorManagementProps) {
  const toast = useToast();
  const replaceMainGrid = useWorkbenchStore((s) => s.replaceMainGrid);
  const {
    mappedPixelData,
    setMappedPixelData,
    gridDimensions,
    colorCounts,
    setColorCounts,
    totalBeadCount,
    setTotalBeadCount,
    initialGridColorKeys,
    setInitialGridColorKeys,
    excludedColorKeys,
    setExcludedColorKeys,
    selectedColor,
    setSelectedColor,
    isEraseMode,
    setIsEraseMode,
    colorReplaceState,
    setColorReplaceState,
    setHighlightColorKey,
    showFullPalette,
    setShowFullPalette,
    tooltipData,
    setTooltipData,
    isManualColoringMode,
    pixelatedCanvasRef,
    mainRef,
    setRemapTrigger,
    setWorkspaceMode,
    resetManualState,
    updateCountsFromPixelData,
    computeFloodFillEraseForStudio,
    applyManualCommit,
    handleCanvasColorSelect,
  } = props;

  // 排除/恢复某个颜色
  const handleToggleExcludeColor = useCallback(
    (hex: string) => {
      if (excludedColorKeys.has(hex)) {
        const next = new Set(excludedColorKeys);
        next.delete(hex);
        setExcludedColorKeys(next);
        setRemapTrigger((n) => n + 1);
      } else {
        if (0 === initialGridColorKeys.size) {
          toast.warn("无法排除颜色 — 初始颜色数据尚未准备好，请稍候");
          return;
        }
        const nextExcluded = new Set(excludedColorKeys);
        nextExcluded.add(hex);
        const remainingKeys = new Set(initialGridColorKeys);
        remainingKeys.delete(hex);
        excludedColorKeys.forEach((k) => remainingKeys.delete(k));
        const remainingPalette = FULL_BEAD_PALETTE.filter((c) => remainingKeys.has(c.hex.toUpperCase()));
        if (0 === remainingPalette.length) {
          toast.warn(`无法排除 ${hex} — 其他可用颜色都已被排除，请先恢复一些`);
          return;
        }
        const removedColor = FULL_BEAD_PALETTE.find((c) => c.hex.toUpperCase() === hex);
        if (!removedColor || !mappedPixelData || !gridDimensions) {
          toast.warn("无法排除颜色 — 缺少必要数据");
          return;
        }
        const nextData = mappedPixelData.map((row) => row.map((c) => ({ ...c } as PixelCell)));
        const { N: cols, M: rows } = gridDimensions;
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < cols; col++) {
            const cell = nextData[row]?.[col];
            if (cell && !cell.isExternal && cell.color.toUpperCase() === hex) {
              const nearest = findNearestPaletteColor(removedColor.rgb, remainingPalette);
              nextData[row][col] = { ...cell, key: nearest.key, color: nearest.hex };
            }
          }
        setExcludedColorKeys(nextExcluded);
        setMappedPixelData(nextData);
        replaceMainGrid(nextData, { width: cols, height: rows });
        const counts: Record<string, ColorCountEntry> = {};
        let total = 0;
        nextData.flat().forEach((cell) => {
          if (cell && cell.color && !cell.isExternal) {
            const upper = cell.color.toUpperCase();
            if (!counts[upper]) counts[upper] = { count: 0, color: upper };
            counts[upper].count++;
            total++;
          }
        });
        setColorCounts(counts);
        setTotalBeadCount(total);
        if (pixelatedCanvasRef.current && gridDimensions) setMappedPixelData(nextData);
      }
      setWorkspaceMode("studio");
      resetManualState();
    },
    [excludedColorKeys, initialGridColorKeys, mappedPixelData, gridDimensions, setExcludedColorKeys, setMappedPixelData, setColorCounts, setTotalBeadCount, pixelatedCanvasRef, setRemapTrigger, setWorkspaceMode, resetManualState, toast, replaceMainGrid]
  );

  // 一键去背景（边缘最多色连通区域填充擦除）
  const handleAutoRemoveBackground = useCallback(() => {
    if (!mappedPixelData || !gridDimensions) {
      toast.warn("请先生成图纸后再使用一键去背景");
      return;
    }
    const result = (function (data: PixelGrid, dims: GridDimensions): { ok: boolean; reason?: string; data?: PixelGrid; targetKey?: string; cellsRemoved?: number } {
      const { N: cols, M: rows } = dims;
      const edgeKeyCounts = new Map<string, number>();
      const tally = (row: number, col: number) => {
        const cell = data[row]?.[col];
        if (cell && !cell.isExternal && cell.key !== ERASE_KEY) edgeKeyCounts.set(cell.key, (edgeKeyCounts.get(cell.key) || 0) + 1);
      };
      for (let col = 0; col < cols; col++) {
        tally(0, col);
        if (rows > 1) tally(rows - 1, col);
      }
      for (let row = 1; row < rows - 1; row++) {
        tally(row, 0);
        if (cols > 1) tally(row, cols - 1);
      }
      if (0 === edgeKeyCounts.size) return { ok: false, reason: "no-edge-color" };
      let targetKey = "";
      let maxCount = -1;
      edgeKeyCounts.forEach((count, key) => {
        if (count > maxCount) {
          maxCount = count;
          targetKey = key;
        }
      });
      const out = data.map((row) => row.map((c) => ({ ...c } as PixelCell)));
      const visited = Array(rows)
        .fill(null)
        .map(() => Array(cols).fill(false));
      const queue: CellPos[] = [];
      const visit = (row: number, col: number) => {
        if (row < 0 || row >= rows || col < 0 || col >= cols || visited[row][col]) return;
        const cell = out[row][col];
        if (cell && !cell.isExternal && cell.key === targetKey) {
          visited[row][col] = true;
          queue.push({ row, col });
        }
      };
      for (let col = 0; col < cols; col++) {
        visit(0, col);
        if (rows > 1) visit(rows - 1, col);
      }
      for (let row = 1; row < rows - 1; row++) {
        visit(row, 0);
        if (cols > 1) visit(row, cols - 1);
      }
      if (0 === queue.length) return { ok: false, reason: "no-fill-region" };
      let cellsRemoved = 0;
      while (queue.length > 0) {
        const { row, col } = queue.pop()!;
        out[row][col] = { ...ERASE_CELL };
        cellsRemoved++;
        visit(row - 1, col);
        visit(row + 1, col);
        visit(row, col - 1);
        visit(row, col + 1);
      }
      return { ok: true, data: out, targetKey, cellsRemoved };
    })(mappedPixelData, gridDimensions);
    if (!result.ok) {
      toast.warn("no-edge-color" === result.reason ? "边缘没有可识别的背景颜色" : "未找到可去除的背景区域");
      return;
    }
    const nextData = result.data!;
    setMappedPixelData(nextData);
    replaceMainGrid(nextData, { width: gridDimensions.N, height: gridDimensions.M });
    const counts: Record<string, ColorCountEntry> = {};
    let total = 0;
    nextData.flat().forEach((cell) => {
      if (cell && !cell.isExternal && cell.key !== ERASE_KEY) {
        const upper = cell.color.toUpperCase();
        if (!counts[upper]) counts[upper] = { count: 0, color: upper };
        counts[upper].count++;
        total++;
      }
    });
    setColorCounts(counts);
    setTotalBeadCount(total);
    setInitialGridColorKeys(new Set(Object.keys(counts)));
  }, [mappedPixelData, gridDimensions, setMappedPixelData, setColorCounts, setTotalBeadCount, setInitialGridColorKeys, toast, replaceMainGrid]);

  // studio 模式下的同色连通擦除
  const floodFillEraseAt = useCallback(
    (row: number, col: number, key: string) => {
      if (!mappedPixelData || !gridDimensions) return;
      const nextData = computeFloodFillEraseForStudio(mappedPixelData, row, col, key);
      setMappedPixelData(nextData);
      updateCountsFromPixelData(nextData);
    },
    [mappedPixelData, gridDimensions, computeFloodFillEraseForStudio, setMappedPixelData, updateCountsFromPixelData]
  );

  // 画布交互（悬停 tooltip / 点击取源色 / 区域擦除 / 手动上色）
  // 注：源中第 3/4 个参数被内部遮蔽未使用，保留占位以维持调用签名
  const handleCanvasInteraction = useCallback(
    function (
      row: number,
      col: number,
      _cell: any, // TODO(类型): 源中遮蔽未用
      _unused: any, // TODO(类型): 源中遮蔽未用
      clientX: number,
      clientY: number,
      isDirect = false,
      forceHide = false
    ) {
      if (forceHide || !mappedPixelData || !gridDimensions) {
        setTooltipData(null);
        return;
      }
      if (row >= 0 && row < gridDimensions.M && col >= 0 && col < gridDimensions.N) {
        const cell = mappedPixelData[row][col];
        if (isDirect && colorReplaceState.isActive && "select-source" === colorReplaceState.step) {
          if (cell && !cell.isExternal && cell.key && cell.key !== ERASE_KEY) {
            handleCanvasColorSelect({ key: cell.key, color: cell.color });
            setTooltipData(null);
          }
          return;
        }
        if (isDirect && isEraseMode) {
          if (cell && !cell.isExternal && cell.key && cell.key !== ERASE_KEY) {
            floodFillEraseAt(row, col, cell.key);
            setIsEraseMode(false);
            setTooltipData(null);
          }
          return;
        }
        if (isDirect && isManualColoringMode && selectedColor) {
          const nextData = mappedPixelData.map((r) => r.map((c) => ({ ...c } as PixelCell)));
          const target = nextData[row]?.[col];
          if (!target) return;
          const prevKey = target.key;
          const prevIsExternal = target.isExternal;
          const nextCell: PixelCell = selectedColor.key === ERASE_KEY ? { ...ERASE_CELL } : { ...selectedColor, isExternal: false };
          if ((nextCell.key !== prevKey || nextCell.isExternal !== prevIsExternal) && ((nextData[row][col] = nextCell), colorCounts)) {
            const nextCounts: Record<string, ColorCountEntry> = { ...colorCounts };
            let nextTotal = totalBeadCount;
            if (!prevIsExternal && prevKey !== ERASE_KEY) {
              const prevCell = mappedPixelData[row][col];
              const prevColorUpper = prevCell?.color?.toUpperCase();
              if (prevColorUpper && nextCounts[prevColorUpper]) {
                nextCounts[prevColorUpper].count--;
                if (nextCounts[prevColorUpper].count <= 0) delete nextCounts[prevColorUpper];
                nextTotal--;
              }
            }
            if (!nextCell.isExternal && nextCell.key !== ERASE_KEY) {
              const upper = nextCell.color.toUpperCase();
              if (!nextCounts[upper]) nextCounts[upper] = { count: 0, color: upper };
              nextCounts[upper].count++;
              nextTotal++;
            }
            setColorCounts(nextCounts);
            setTotalBeadCount(nextTotal);
          }
          setTooltipData(null);
        } else if (!isManualColoringMode) {
          if (cell && !cell.isExternal && cell.key) {
            if (isDirect && tooltipData && tooltipData.row === row && tooltipData.col === col) {
              setTooltipData(null);
              return;
            }
            const mainEl = mainRef.current;
            if (mainEl) {
              const rect = mainEl.getBoundingClientRect();
              setTooltipData({
                x: clientX - rect.left - window.scrollX,
                y: clientY - rect.top - window.scrollY,
                key: cell.key,
                color: cell.color,
                row,
                col,
              });
            } else {
              setTooltipData({ x: clientX, y: clientY, key: cell.key, color: cell.color, row, col });
            }
          } else setTooltipData(null);
        }
      } else setTooltipData(null);
    },
    [mappedPixelData, gridDimensions, colorReplaceState, isEraseMode, isManualColoringMode, selectedColor, colorCounts, totalBeadCount, tooltipData, mainRef, floodFillEraseAt, setTooltipData, setMappedPixelData, setColorCounts, setTotalBeadCount, setIsEraseMode, handleCanvasColorSelect]
  );

  const handleHighlightColor = useCallback(
    (key: string) => {
      setHighlightColorKey(key);
    },
    [setHighlightColorKey]
  );

  const handleHighlightComplete = useCallback(() => {
    setHighlightColorKey(null);
  }, [setHighlightColorKey]);

  const handleToggleFullPalette = useCallback(() => {
    setShowFullPalette(!showFullPalette);
  }, [showFullPalette, setShowFullPalette]);

  // 色板选色（含替换模式收尾与橡皮复位）
  const handleColorSelect = useCallback(
    (color: SelectedColor) => {
      if (color.key === ERASE_KEY && colorReplaceState.isActive) {
        setColorReplaceState({ isActive: false, step: "select-source" });
        setHighlightColorKey(null);
      }
      if (isEraseMode) setIsEraseMode(false);
      setSelectedColor(color);
    },
    [colorReplaceState.isActive, isEraseMode, setColorReplaceState, setHighlightColorKey, setIsEraseMode, setSelectedColor]
  );

  return {
    handleToggleExcludeColor,
    handleAutoRemoveBackground,
    handleCanvasInteraction,
    handleColorSelect,
    handleColorReplaceToggle: useCallback(() => {
      setColorReplaceState((prev) =>
        prev.isActive
          ? { isActive: false, step: "select-source" }
          : (setIsEraseMode(false), setSelectedColor(null), { isActive: true, step: "select-source" })
      );
    }, [setColorReplaceState, setIsEraseMode, setSelectedColor]),
    handleColorReplace: useCallback(
      (sourceColor: SelectedColor, targetColor: SelectedColor) => {
        if (!mappedPixelData || !gridDimensions) return;
        const { N: cols, M: rows } = gridDimensions;
        const nextData = mappedPixelData.map((row) => row.map((c) => ({ ...c } as PixelCell)));
        let replaced = 0;
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < cols; col++) {
            const cell = nextData[row][col];
            if (cell && !cell.isExternal && cell.color.toUpperCase() === sourceColor.color.toUpperCase()) {
              nextData[row][col] = { key: targetColor.key, color: targetColor.color, isExternal: false };
              replaced++;
            }
          }
        if (replaced > 0) {
          if (isManualColoringMode) applyManualCommit(nextData, mappedPixelData);
          else {
            setMappedPixelData(nextData);
            replaceMainGrid(nextData, { width: gridDimensions.N, height: gridDimensions.M });
            if (colorCounts) {
              const counts: Record<string, ColorCountEntry> = {};
              let total = 0;
              nextData.flat().forEach((cell) => {
                if (cell && !cell.isExternal && cell.key !== ERASE_KEY) {
                  const upper = cell.color.toUpperCase();
                  if (!counts[upper]) counts[upper] = { count: 0, color: upper };
                  counts[upper].count++;
                  total++;
                }
              });
              setColorCounts(counts);
              setTotalBeadCount(total);
            }
          }
          logger.info(`颜色替换完成：将 ${replaced} 个 ${sourceColor.key} 替换为 ${targetColor.key}`);
        }
        setColorReplaceState({ isActive: false, step: "select-source" });
        setHighlightColorKey(null);
      },
      [mappedPixelData, gridDimensions, isManualColoringMode, colorCounts, applyManualCommit, setMappedPixelData, setColorCounts, setTotalBeadCount, setColorReplaceState, setHighlightColorKey, replaceMainGrid]
    ),
    handleHighlightColor,
    handleHighlightComplete,
    handleToggleFullPalette,
  };
}

interface FileHandlingProps {
  isMounted: boolean;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  originalImageSrc: string | null;
  setOriginalImageSrc: (src: string | null) => void;
  setRawImageForEdit: (src: string | null) => void;
  setIsImageEditVisible: (v: boolean) => void;
  granularity: number;
  setGranularity: (v: number) => void;
  granularityInput: string;
  setGranularityInput: (v: string) => void;
  similarityThreshold: number;
  setSimilarityThreshold: (v: number) => void;
  similarityThresholdInput: string;
  setSimilarityThresholdInput: (v: string) => void;
  setPixelationMode: (m: PixelationMode) => void;
  setGridAlignment: (a: GridAlignment | null) => void;
  setMappedPixelData: (data: PixelData) => void;
  setGridDimensions: (dims: GridDimensions | null) => void;
  setColorCounts: (counts: ColorCounts) => void;
  setTotalBeadCount: (count: number) => void;
  setInitialGridColorKeys: (keys: Set<string>) => void;
  setRemapTrigger: React.Dispatch<React.SetStateAction<number>>;
  setWorkspaceMode: (mode: string) => void;
  resetManualState: () => void;
  setExcludedColorKeys: (keys: Set<string>) => void;
  isManualColoringMode: boolean;
  colorReplaceState: ColorReplaceState;
  setColorReplaceState: React.Dispatch<React.SetStateAction<ColorReplaceState>>;
  setHighlightColorKey: (key: string | null) => void;
  isEraseMode: boolean;
  setIsEraseMode: (v: boolean) => void;
  setSelectedColor: (c: SelectedColor | null) => void;
}

// 文件处理子系统：选择/拖拽/CSV 导入/图片编辑确认
function useFileHandling(props: FileHandlingProps) {
  const toast = useToast();
  const fileOpsGenerationRef = useRef(0);
  const pendingFileReaderRef = useRef<FileReader | null>(null);
  const pendingImageRef = useRef<HTMLImageElement | null>(null);
  const replaceMainGrid = useWorkbenchStore((s) => s.replaceMainGrid);
  const {
    isMounted,
    fileInputRef,
    originalImageSrc,
    setOriginalImageSrc,
    setRawImageForEdit,
    setIsImageEditVisible,
    granularity,
    setGranularity,
    granularityInput,
    setGranularityInput,
    similarityThreshold,
    setSimilarityThreshold,
    similarityThresholdInput,
    setSimilarityThresholdInput,
    setPixelationMode,
    setGridAlignment,
    setMappedPixelData,
    setGridDimensions,
    setColorCounts,
    setTotalBeadCount,
    setInitialGridColorKeys,
    setRemapTrigger,
    setWorkspaceMode,
    resetManualState,
    setExcludedColorKeys,
    isManualColoringMode,
    colorReplaceState,
    setColorReplaceState,
    setHighlightColorKey,
    isEraseMode,
    setIsEraseMode,
    setSelectedColor,
  } = props;

  // 取消所有进行中的文件读取（代际计数防串台）
  const cancelPendingFileOps = useCallback(() => {
    fileOpsGenerationRef.current += 1;
    const reader = pendingFileReaderRef.current;
    if (reader) {
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      if (reader.readyState === FileReader.LOADING) reader.abort();
      pendingFileReaderRef.current = null;
    }
    const img = pendingImageRef.current;
    if (img) {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      pendingImageRef.current = null;
    }
    return fileOpsGenerationRef.current;
  }, []);

  useEffect(
    () => () => {
      cancelPendingFileOps();
    },
    [cancelPendingFileOps]
  );

  const triggerFileInput = useCallback(() => {
    const input = fileInputRef.current;
    if (!isMounted || !input) {
      logger.warn("文件选择器尚未就绪");
      toast.error("文件选择器尚未就绪，请刷新页面后重试");
      return;
    }
    try {
      cancelPendingFileOps();
      input.value = "";
      input.click();
    } catch (e) {
      logger.error("触发文件选择失败", e);
      toast.error("无法打开文件选择器，请刷新页面后重试");
    }
  }, [isMounted, fileInputRef, cancelPendingFileOps, toast]);

  // 处理文件（CSV 直接导入为图纸；图片进入编辑弹窗）
  const processFile = useCallback(
    (file: File, kind: "csv" | "image") => {
      const generation = cancelPendingFileOps();
      const isCurrent = () => generation === fileOpsGenerationRef.current;
      if ("csv" === kind) {
        logger.info("正在导入CSV文件...");
        toast.info("正在读取 CSV…", 1500);
        new Promise<{ mappedPixelData: PixelGrid; gridDimensions: GridDimensions }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const text = (event.target?.result as string) ?? null;
              if (!text) return void reject(Error("无法读取文件内容"));
              const lines = text.trim().split("\n");
              const rowCount = lines.length;
              if (0 === rowCount) return void reject(Error("CSV文件为空"));
              const colCount = lines[0].split(",").length;
              if (0 === colCount) return void reject(Error("CSV文件格式无效"));
              const grid: PixelCell[][] = [];
              const hexPattern = /^#[0-9A-Fa-f]{6}$/;
              for (let row = 0; row < rowCount; row++) {
                const cells = lines[row].split(",");
                const rowCells: PixelCell[] = [];
                if (cells.length !== colCount) {
                  return void reject(Error(`第${row + 1}行的列数不匹配，期望${colCount}列，实际${cells.length}列`));
                }
                for (let col = 0; col < colCount; col++) {
                  const value = cells[col].trim();
                  if ("TRANSPARENT" === value || "" === value) {
                    rowCells.push({ key: "TRANSPARENT", color: "#FFFFFF", isExternal: true });
                  } else {
                    if (!hexPattern.test(value)) {
                      return void reject(Error(`第${row + 1}行第${col + 1}列的颜色值无效：${value}`));
                    }
                    rowCells.push({ key: value.toUpperCase(), color: value.toUpperCase(), isExternal: false });
                  }
                }
                grid.push(rowCells);
              }
              resolve({
                mappedPixelData: grid,
                gridDimensions: { N: colCount, M: rowCount },
              });
            } catch (e) {
              reject(Error(`解析CSV文件失败：${e}`));
            }
          };
          reader.onerror = () => {
            reject(Error("读取文件失败"));
          };
          reader.readAsText(file, "utf-8");
        })
          .then(({ mappedPixelData: csvData, gridDimensions: csvDims }) => {
            if (!isCurrent()) return;
            logger.info(`成功导入CSV文件: ${csvDims.N}x${csvDims.M}`);
            setWorkspaceMode("studio");
            setExcludedColorKeys(new Set());
            setMappedPixelData(csvData);
            setGridDimensions(csvDims);
            replaceMainGrid(csvData, { width: csvDims.N, height: csvDims.M });
            setOriginalImageSrc(null);
            const counts: Record<string, ColorCountEntry> = {};
            let total = 0;
            csvData.forEach((row) => {
              row.forEach((cell) => {
                if (cell && !cell.isExternal) {
                  const upper = cell.color.toUpperCase();
                  if (counts[upper]) counts[upper].count++;
                  else counts[upper] = { count: 1, color: cell.color };
                  total++;
                }
              });
            });
            setColorCounts(counts);
            setTotalBeadCount(total);
            setInitialGridColorKeys(new Set(Object.keys(counts)));
            setOriginalImageSrc(
              (function (data: PixelGrid, dims: GridDimensions): string {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                  logger.error("无法创建canvas上下文");
                  return "";
                }
                canvas.width = 8 * dims.N;
                canvas.height = 8 * dims.M;
                data.forEach((row, rowIndex) => {
                  row.forEach((cell, colIndex) => {
                    if (cell && !cell.isExternal) {
                      ctx.fillStyle = cell.color;
                      ctx.fillRect(8 * colIndex, 8 * rowIndex, 8, 8);
                    }
                  });
                });
                return canvas.toDataURL("image/png");
              })(csvData, csvDims)
            );
            resetManualState();
            setGranularity(csvDims.N);
            setGranularityInput(csvDims.N.toString());
            toast.success(`成功导入 CSV — 图纸 ${csvDims.N}×${csvDims.M}，共 ${Object.keys(counts).length} 色`);
          })
          .catch((e: Error) => {
            if (isCurrent()) {
              logger.error("CSV 导入失败", e);
              toast.error(`CSV 导入失败: ${e.message}`);
            }
          });
      } else {
        toast.info("正在读取图片…", 1500);
        const reader = new FileReader();
        pendingFileReaderRef.current = reader;
        reader.onload = (event) => {
          if (!isCurrent()) return;
          pendingFileReaderRef.current = null;
          const dataUrl = typeof event.target?.result === "string" ? event.target.result : "";
          if (!dataUrl) {
            toast.error("无法读取文件");
            return;
          }
          const img = new Image();
          pendingImageRef.current = img;
          img.onload = () => {
            if (isCurrent()) {
              pendingImageRef.current = null;
              setRawImageForEdit(dataUrl);
              setIsImageEditVisible(true);
            }
          };
          img.onerror = () => {
            if (isCurrent()) {
              pendingImageRef.current = null;
              logger.error("图片解码失败", { type: file.type, name: file.name });
              toast.error("无法打开这张图片，请改用 JPG 或 PNG 后重试");
            }
          };
          img.src = dataUrl;
        };
        reader.onerror = () => {
          if (isCurrent()) {
            pendingFileReaderRef.current = null;
            logger.error("文件读取失败");
            toast.error("无法读取文件");
          }
        };
        reader.readAsDataURL(file);
      }
    },
    [setWorkspaceMode, setMappedPixelData, setGridDimensions, setOriginalImageSrc, setColorCounts, setTotalBeadCount, setInitialGridColorKeys, resetManualState, setGranularity, setGranularityInput, setRawImageForEdit, setIsImageEditVisible, toast, replaceMainGrid, setExcludedColorKeys, cancelPendingFileOps]
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        const kind = detectFileType(file);
        if (kind) processFile(file, kind);
        else {
          cancelPendingFileOps();
          toast.error(`不支持的文件类型 (${file.type || "未知"}) — 请选 JPG / PNG 或 CSV`);
          logger.warn("Unsupported file type", { type: file.type, name: file.name });
        }
      }
      if (event.target) event.target.value = "";
    },
    [processFile, cancelPendingFileOps, toast]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        if (event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          const kind = detectFileType(file);
          if (kind) processFile(file, kind);
          else {
            cancelPendingFileOps();
            toast.error(`不支持的文件类型 (${file.type || "未知"}) — 请拖放 JPG / PNG 或 CSV`);
            logger.warn("Unsupported drop file", { type: file.type, name: file.name });
          }
        }
      } catch (e) {
        logger.error("处理拖拽文件时发生错误", e);
        toast.error("处理文件时发生错误，请重试");
      }
    },
    [processFile, cancelPendingFileOps, toast]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  // 图片编辑完成确认
  const handleImageEditConfirm = useCallback(
    (result: { imageSrc: string; gridAlignment?: GridAlignment | null; gridCount?: number }) => {
      cancelPendingFileOps();
      setWorkspaceMode("studio");
      setExcludedColorKeys(new Set());
      resetManualState();
      setOriginalImageSrc(result.imageSrc);
      setMappedPixelData(null);
      setGridDimensions(null);
      setColorCounts(null);
      setTotalBeadCount(0);
      setInitialGridColorKeys(new Set());
      setGridAlignment(result.gridAlignment ?? null);
      const granularity = result.gridCount ?? 100;
      setGranularity(granularity);
      setGranularityInput(granularity.toString());
      setRemapTrigger((n) => n + 1);
      setIsImageEditVisible(false);
      setRawImageForEdit(null);
    },
    [setOriginalImageSrc, setMappedPixelData, setGridDimensions, setColorCounts, setTotalBeadCount, setInitialGridColorKeys, setGridAlignment, setGranularity, setGranularityInput, setRemapTrigger, setIsImageEditVisible, setRawImageForEdit, setWorkspaceMode, setExcludedColorKeys, resetManualState, cancelPendingFileOps]
  );

  const handleImageEditCancel = useCallback(() => {
    cancelPendingFileOps();
    setIsImageEditVisible(false);
    setRawImageForEdit(null);
  }, [cancelPendingFileOps, setIsImageEditVisible, setRawImageForEdit]);

  // 橡皮擦开关（手动模式下为「区域擦除」开关）
  const handleEraseToggle = useCallback(() => {
    if (!isManualColoringMode) return;
    if (colorReplaceState.isActive) {
      setColorReplaceState({ isActive: false, step: "select-source" });
      setHighlightColorKey(null);
    }
    setIsEraseMode(!isEraseMode);
    if (!isEraseMode) setSelectedColor(null);
  }, [isManualColoringMode, colorReplaceState, setColorReplaceState, setHighlightColorKey, isEraseMode, setIsEraseMode, setSelectedColor]);

  const handleGranularityInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setGranularityInput(event.target.value);
    },
    [setGranularityInput]
  );

  const handleSimilarityThresholdInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setSimilarityThresholdInput(event.target.value);
    },
    [setSimilarityThresholdInput]
  );

  return {
    triggerFileInput,
    handleFileChange,
    handleDrop,
    handleDragOver,
    processFile,
    handleImageEditConfirm,
    handleImageEditCancel,
    handleEraseToggle,
    handleGranularityInputChange,
    handleSimilarityThresholdInputChange,
    handleConfirmParameters: useCallback(() => {
      let nextGranularity = parseInt(granularityInput, 10);
      if (isNaN(nextGranularity) || nextGranularity < 10) nextGranularity = 10;
      else if (nextGranularity > 300) nextGranularity = 300;
      let nextSimilarity = parseInt(similarityThresholdInput, 10);
      if (isNaN(nextSimilarity) || nextSimilarity < 0) nextSimilarity = 0;
      else if (nextSimilarity > 100) nextSimilarity = 100;
      const granularityChanged = nextGranularity !== granularity;
      const similarityChanged = nextSimilarity !== similarityThreshold;
      if (granularityChanged) {
        logger.info(`Confirming new granularity: ${nextGranularity}`);
        setGranularity(nextGranularity);
      }
      if (similarityChanged) {
        logger.info(`Confirming new similarity threshold: ${nextSimilarity}`);
        setSimilarityThreshold(nextSimilarity);
      }
      if (granularityChanged || similarityChanged) {
        setRemapTrigger((n) => n + 1);
        setWorkspaceMode("studio");
        resetManualState();
      }
      setGranularityInput(nextGranularity.toString());
      setSimilarityThresholdInput(nextSimilarity.toString());
    }, [granularityInput, similarityThresholdInput, granularity, similarityThreshold, setGranularity, setSimilarityThreshold, setRemapTrigger, setWorkspaceMode, resetManualState, setGranularityInput, setSimilarityThresholdInput]),
    handlePixelationModeChange: useCallback(
      (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = event.target.value;
        if (Object.values(PixelationMode).includes(value as PixelationMode)) {
          setPixelationMode(value as PixelationMode);
          setRemapTrigger((n) => n + 1);
          setWorkspaceMode("studio");
          resetManualState();
        } else {
          logger.warn(`无效的像素化模式: ${value}`);
        }
      },
      [setPixelationMode, setRemapTrigger, setWorkspaceMode, resetManualState]
    ),
  };
}

interface PaletteManagementProps {
  customPaletteSelections: Record<string, boolean>;
  setCustomPaletteSelections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setIsCustomPalette: (v: boolean) => void;
  setIsCustomPaletteEditorOpen: (v: boolean) => void;
  importPaletteInputRef: React.MutableRefObject<HTMLInputElement | null>;
  setRemapTrigger: React.Dispatch<React.SetStateAction<number>>;
  setWorkspaceMode: (mode: string) => void;
  resetManualState: () => void;
}

// 自定义色板管理子系统
function usePaletteManagement(props: PaletteManagementProps) {
  const toast = useToast();
  const {
    customPaletteSelections,
    setCustomPaletteSelections,
    setIsCustomPalette,
    setIsCustomPaletteEditorOpen,
    importPaletteInputRef,
    setRemapTrigger,
    setWorkspaceMode,
    resetManualState,
  } = props;

  // 启动时从 localStorage 恢复自定义色板选择
  useEffect(() => {
    const stored = (function () {
      try {
        const raw = localStorage.getItem(CUSTOM_PALETTE_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {
        logger.error("无法从本地存储加载色板选择", e);
        localStorage.removeItem(CUSTOM_PALETTE_STORAGE_KEY);
      }
      return null;
    })();
    if (stored && Object.keys(stored).length > 0) {
      logger.info("从 localStorage 加载色板数据", { count: Object.keys(stored).length });
      const validHexes = FULL_PALETTE_COLORS.map((c: PaletteColor) => c.hex.toUpperCase());
      const validated: Record<string, boolean> = {};
      let anyValid = false;
      let validCount = 0;
      let invalidCount = 0;
      Object.entries(stored as Record<string, boolean>).forEach(([hex, selected]: [string, boolean]) => {
        if (/^#[0-9A-F]{6}$/i.test(hex) && validHexes.includes(hex.toUpperCase())) {
          validated[hex.toUpperCase()] = selected;
          anyValid = true;
          validCount++;
        } else {
          invalidCount++;
        }
      });
      logger.info(`验证结果: 有效键 ${validCount} 个, 无效键 ${invalidCount} 个`);
      if (anyValid) {
        setCustomPaletteSelections(validated);
        setIsCustomPalette(true);
      } else {
        logger.info("所有数据都无效，清除localStorage并重新初始化");
        localStorage.removeItem("customPerlerPaletteSelections");
        const allHexes = FULL_PALETTE_COLORS.map((c: PaletteColor) => c.hex.toUpperCase());
        setCustomPaletteSelections(buildPaletteSelections(allHexes, allHexes));
        setIsCustomPalette(false);
      }
    } else {
      logger.info("没有localStorage数据，默认选择所有颜色");
      const allHexes = FULL_PALETTE_COLORS.map((c: PaletteColor) => c.hex.toUpperCase());
      setCustomPaletteSelections(buildPaletteSelections(allHexes, allHexes));
      setIsCustomPalette(false);
    }
  }, []);

  const handleSelectionChange = useCallback(
    (hex: string, selected: boolean) => {
      const upper = hex.toUpperCase();
      setCustomPaletteSelections((prev) => ({ ...prev, [upper]: selected }));
      setIsCustomPalette(true);
    },
    [setCustomPaletteSelections, setIsCustomPalette]
  );

  const handleSaveCustomPalette = useCallback(() => {
    try {
      localStorage.setItem(CUSTOM_PALETTE_STORAGE_KEY, JSON.stringify(customPaletteSelections));
    } catch (e) {
      logger.error("无法保存色板选择到本地存储", e);
    }
    setIsCustomPalette(true);
    setIsCustomPaletteEditorOpen(false);
    setRemapTrigger((n) => n + 1);
    setWorkspaceMode("studio");
    resetManualState();
  }, [customPaletteSelections, setIsCustomPalette, setIsCustomPaletteEditorOpen, setRemapTrigger, setWorkspaceMode, resetManualState]);

  const handleExportCustomPalette = useCallback(() => {
    try {
      const selectedHexes = Object.entries(customPaletteSelections)
        .filter(([, selected]) => selected)
        .map(([hex]) => hex);
      if (0 === selectedHexes.length) {
        toast.warn("当前没有选中的颜色，无法导出");
        return;
      }
      const payload = {
        version: "3.0",
        selectedHexValues: selectedHexes,
        exportDate: new Date().toISOString(),
        totalColors: selectedHexes.length,
      };
      downloadBlobFile({
        blob: new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        filename: `custom-perler-palette_${formatFileTimestamp()}.json`,
      });
      toast.info("色板 JSON 已生成，并已尝试开始下载");
    } catch (e) {
      logger.error("导出色板 JSON 失败", e);
      toast.error(e instanceof Error ? e.message : "导出色板 JSON 失败");
    }
  }, [customPaletteSelections, toast]);

  return {
    handleSelectionChange,
    handleSaveCustomPalette,
    handleExportCustomPalette,
    handleImportPaletteFile: useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (readEvent) => {
          try {
            const text = (readEvent.target?.result as string) ?? null;
            const parsed = JSON.parse(text!);
            if (!Array.isArray(parsed.selectedHexValues)) throw Error("无效的文件格式：文件必须包含 'selectedHexValues' 数组。");
            logger.info("检测到基于hex值的色板文件");
            const hexValues = parsed.selectedHexValues as string[];
            const valid: string[] = [];
            const invalid: string[] = [];
            hexValues.forEach((hex) => {
              const upper = hex.toUpperCase();
              if (FULL_PALETTE_COLORS.find((c: PaletteColor) => c.hex.toUpperCase() === upper)) valid.push(upper);
              else invalid.push(hex);
            });
            if (invalid.length > 0) {
              logger.warn("导入时发现无效的 hex 值", { invalidHexValues: invalid });
              toast.warn(`导入完成，但 ${invalid.length} 个无效颜色已被忽略`);
            }
            if (0 === valid.length) {
              toast.error("导入的文件中不包含任何有效的颜色");
              return;
            }
            logger.info(`成功验证 ${valid.length} 个有效的hex值`);
            const allHexes = FULL_PALETTE_COLORS.map((c: PaletteColor) => c.hex.toUpperCase());
            const selections = buildPaletteSelections(allHexes, valid);
            setCustomPaletteSelections(selections);
            setIsCustomPalette(true);
            toast.success(`成功导入 ${valid.length} 个颜色`);
          } catch (e) {
            logger.error("导入色板配置失败:", e);
            toast.error(`导入失败: ${e instanceof Error ? e.message : "未知错误"}`);
          } finally {
            if (event.target) event.target.value = "";
          }
        };
        reader.onerror = () => {
          toast.error("读取文件失败");
          if (event.target) event.target.value = "";
        };
        reader.readAsText(file);
      },
      [setCustomPaletteSelections, setIsCustomPalette, toast]
    ),
    triggerImportPalette: useCallback(() => {
      importPaletteInputRef.current?.click();
    }, [importPaletteInputRef]),
  };
}

interface FileExportsProps {
  mappedPixelData: PixelData;
  gridDimensions: GridDimensions | null;
  colorCounts: ColorCounts;
  totalBeadCount: number;
  downloadOptions: DownloadOptions;
  setDownloadOptions: React.Dispatch<React.SetStateAction<DownloadOptions>>;
  activeBeadPalette: PaletteColor[];
  selectedColorSystem: string;
  customPaletteSelections: Record<string, boolean>;
  setCustomPaletteSelections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setIsCustomPalette: (v: boolean) => void;
  beadInventory: ReturnType<typeof useBeadInventory>;
  toast: ReturnType<typeof useToast>;
  renderCanvasRef: React.MutableRefObject<any>;
}

// 导出子系统：图纸下载 / CSV / 色板 XLSX / 烫豆预览图
function useFileExports(props: FileExportsProps) {
  const {
    mappedPixelData,
    gridDimensions,
    colorCounts,
    totalBeadCount,
    downloadOptions,
    setDownloadOptions,
    activeBeadPalette,
    selectedColorSystem,
    customPaletteSelections,
    setCustomPaletteSelections,
    setIsCustomPalette,
    beadInventory,
    toast,
    renderCanvasRef,
  } = props;
  const paletteXlsxInputRef = useRef<HTMLInputElement | null>(null);

  const handleDownloadRequest = useCallback(
    async (options?: DownloadOptions) => {
      try {
        // 源为异步 chunk r.e(956)+r.e(764)：956 = qrcode npm 包（vendor），764 = @/utils/download-image（代理 K 已补转）
        const { downloadImage } = await import("@/utils/download-image");
        return await downloadImage({
          mappedPixelData,
          gridDimensions,
          colorCounts,
          totalBeadCount,
          options: options || downloadOptions,
          activeBeadPalette,
          selectedColorSystem,
        });
      } catch (e) {
        logger.error("下载图纸失败", e);
        throw e;
      }
    },
    [mappedPixelData, gridDimensions, colorCounts, totalBeadCount, downloadOptions, activeBeadPalette, selectedColorSystem]
  );

  const handleExportCsv = useCallback(() => {
    try {
      return (function (args: { mappedPixelData: PixelData; gridDimensions: GridDimensions | null; selectedColorSystem: string }): { blob: Blob; filename: string } {
        const { mappedPixelData: data, gridDimensions: dims, selectedColorSystem: system } = args;
        if (!data || !dims) {
          logger.error("导出失败: 映射数据或尺寸无效");
          throw Error("无法导出 CSV — 数据未生成或无效");
        }
        const { N: cols, M: rows } = dims;
        const lines: string[] = [];
        for (let row = 0; row < rows; row++) {
          const cells: string[] = [];
          for (let col = 0; col < cols; col++) {
            const cell = data[row][col];
            if (cell && !cell.isExternal) cells.push(cell.color);
            else cells.push("TRANSPARENT");
          }
          lines.push(cells.join(","));
        }
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        logger.info("CSV 数据导出完成", { N: cols, M: rows });
        return {
          blob,
          filename: `bead-pattern-${cols}x${rows}-${system}_${formatFileTimestamp()}.csv`,
        };
      })({ mappedPixelData, gridDimensions, selectedColorSystem });
    } catch (e) {
      logger.error("导出 CSV 失败", e);
      throw e;
    }
  }, [mappedPixelData, gridDimensions, selectedColorSystem]);

  const handleExportPaletteXlsx = useCallback(async () => {
    try {
      // 源为异步 chunk r.e(325)+r.e(384)：325 = exceljs npm 包（vendor，1.7MB），6384 = @/utils/palette-xlsx（代理 K 已补转）
      const { exportPaletteXlsx } = await import("@/utils/palette-xlsx");
      return await exportPaletteXlsx(customPaletteSelections, beadInventory.inventory, selectedColorSystem);
    } catch (e) {
      logger.error("导出色板配置失败", e);
      throw e;
    }
  }, [customPaletteSelections, beadInventory.inventory, selectedColorSystem]);

  const handleRenderDownload = useCallback(async () => {
    try {
      if (!mappedPixelData || !gridDimensions) throw Error("预览尚未生成，请稍后再试");
      const result = await renderCanvasRef.current?.download();
      if (!result) throw Error("预览尚未生成，请稍后再试");
      return result;
    } catch (e) {
      logger.error("下载烫豆预览图失败", e);
      throw e;
    }
  }, [gridDimensions, mappedPixelData, renderCanvasRef]);

  const handleImportPaletteXlsx = useCallback(() => {
    paletteXlsxInputRef.current?.click();
  }, []);

  return {
    paletteXlsxInputRef,
    handleDownloadRequest,
    handleExportCsv,
    handleExportPaletteXlsx,
    handleRenderDownload,
    handleImportPaletteXlsx,
    handlePaletteXlsxFileChange: useCallback(
      async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
          try {
            // 源为异步 chunk r.e(325)+r.e(384) → 模块 6384（importPaletteXlsx，@/utils/palette-xlsx）
            const { importPaletteXlsx } = await import("@/utils/palette-xlsx");
            const result = await importPaletteXlsx(file, selectedColorSystem);
            setCustomPaletteSelections(result.selections);
            setIsCustomPalette(true);
            if (result.inventory) beadInventory.batchUpdate(result.inventory);
            const enabledCount = Object.values(result.selections).filter(Boolean).length;
            toast.success(`成功导入 ${enabledCount} 种启用颜色${result.inventory ? ` + ${Object.keys(result.inventory).length} 种库存` : ""}`);
          } catch (e) {
            toast.error(`导入失败: ${e instanceof Error ? e.message : "未知错误"}`);
          } finally {
            event.target.value = "";
          }
        }
      },
      [beadInventory, selectedColorSystem, setCustomPaletteSelections, setIsCustomPalette, toast]
    ),
    handleDownloadOptionsChange: useCallback(
      (options: DownloadOptions) => {
        setDownloadOptions(options);
        try {
          localStorage.setItem("perler-author-name", options.authorName || "");
          localStorage.setItem("perler-watermark-config", JSON.stringify(options.watermark));
        } catch (e) {}
      },
      [setDownloadOptions]
    ),
  };
}

interface GalleryBootProps {
  isMounted: boolean;
  galleryParam: string | null;
  applyCanvasExternal: (payload: { pixelData: PixelGrid; width: number; height: number }) => void;
  applyCanvasFromStore: (payload: { pixelData: PixelGrid; width?: number; height?: number }) => void;
  applySettings: (settings: any) => void;
  onGalleryLoaded: () => void;
}

// 启动引导：本地恢复 or 画廊分享码导入
function useGalleryBoot(props: GalleryBootProps) {
  const [boot, dispatch] = useReducer(galleryBootReducer, { kind: "idle" } as any);
  const startedRef = useRef(false);
  const lastGalleryParamRef = useRef<string | null>(null);

  useEffect(() => {
    if (!props.isMounted) return;
    const galleryParam = props.galleryParam;
    if (galleryParam) {
      if (lastGalleryParamRef.current === galleryParam) return;
      lastGalleryParamRef.current = galleryParam;
      startedRef.current = true;
      const parsed = parseGalleryShareCode(galleryParam);
      if (parsed) {
        dispatch({ type: "start-gallery", id: (parsed as any).id, password: (parsed as any).password });
      } else {
        dispatch({ type: "fail-gallery", reason: "gallery-invalid-code" });
      }
      return;
    }
    lastGalleryParamRef.current = null;
    if (!startedRef.current) {
      startedRef.current = true;
      dispatch({ type: "start-local" });
    }
  }, [props.isMounted, props.galleryParam]);

  // 等待 store 水合后恢复本地文档
  useEffect(() => {
    if ("waiting-hydration" !== (boot as any).kind) return;
    let disposed = false;
    const unsubscribe = runWhenStoreHydrated(() => {
      if (disposed) return;
      const doc = useWorkbenchStore.getState().document;
      if (!doc) {
        dispatch({ type: "settle", source: "blank" });
        return;
      }
      const composite = useWorkbenchStore.getState().getComposite();
      if (!composite || 0 === composite.length) {
        dispatch({ type: "settle", source: "blank" });
        return;
      }
      props.applyCanvasFromStore({ pixelData: composite, width: doc.grid.width, height: doc.grid.height });
      props.applySettings(readUiSettings());
      dispatch({ type: "settle", source: "local" });
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [(boot as any).kind]);

  // 画廊分享码加载
  useEffect(() => {
    if ("loading-gallery" !== (boot as any).kind) return;
    const { id, password } = boot as any;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/gallery/list?id=${id}`);
        if (!response.ok) {
          if (!cancelled) dispatch({ type: "fail-gallery", reason: "gallery-fetch-failed" });
          return;
        }
        const json = await response.json();
        if (cancelled) return;
        const work = await decryptGalleryWork(json.work, password);
        if (cancelled) return;
        props.applyCanvasExternal(work);
        props.onGalleryLoaded();
        dispatch({ type: "settle", source: "gallery" });
      } catch (e: any) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "";
        if ("wrong-password" === message) dispatch({ type: "fail-gallery", reason: "gallery-wrong-password" });
        else if ("password-required" === message) dispatch({ type: "fail-gallery", reason: "gallery-password-required" });
        else dispatch({ type: "fail-gallery", reason: "gallery-fetch-failed" });
      }
    };
    const unsubscribe = runWhenStoreHydrated(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [(boot as any).kind]);

  return boot;
}
// —— 面板分类构建

// focus 模式面板
function buildFocusPanelCategories(props: { focusState: FocusState; setFocusState: React.Dispatch<React.SetStateAction<FocusState>> }): PanelCategory[] {
  const { focusState, setFocusState } = props;
  return [
    {
      id: "guidance",
      label: "引导",
      icon: <GuidanceIcon />,
      content: (
        <SegmentedOptions
          value={focusState.guidanceMode}
          onChange={(value) => setFocusState((prev) => ({ ...prev, guidanceMode: value as FocusState["guidanceMode"] }))}
          options={FOCUS_GUIDANCE_OPTIONS}
        />
      ),
    },
    {
      id: "display",
      label: "显示",
      icon: <DisplayIcon />,
      content: (
        <div className="space-y-3">
          <SettingsToggle
            label="网格分割线"
            checked={focusState.showSectionLines}
            onChange={(value) => setFocusState((prev) => ({ ...prev, showSectionLines: value }))}
          />
          {focusState.showSectionLines && (
            <div className="space-y-3 pl-1">
              <SliderSetting
                label="间隔"
                min={5}
                max={20}
                value={focusState.gridSectionInterval}
                onChange={(value) => setFocusState((prev) => ({ ...prev, gridSectionInterval: value }))}
                format={(value) => `${value}格`}
                accent="green"
              />
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">颜色</span>
                <ColorSwatchPicker
                  shape="circle"
                  swatches={SECTION_LINE_SWATCHES}
                  selected={focusState.sectionLineColor}
                  onSelect={(color) => setFocusState((prev) => ({ ...prev, sectionLineColor: color }))}
                />
              </div>
            </div>
          )}
          <div className="border-t border-gray-200/60 dark:border-gray-800/40 pt-1">
            <SettingsToggle
              label="完成撒花"
              checked={focusState.enableCelebration}
              onChange={(value) => setFocusState((prev) => ({ ...prev, enableCelebration: value }))}
            />
          </div>
        </div>
      ),
    },
  ];
}

// render 模式面板
function buildRenderPanelCategories(props: {
  config: RenderConfig;
  onConfigChange: React.Dispatch<React.SetStateAction<RenderConfig>>;
  onDownload?: () => Promise<ExportArtifact>;
}): PanelCategory[] {
  const { config, onConfigChange, onDownload } = props;
  const update = (partial: Partial<RenderConfig>) => onConfigChange((prev) => ({ ...prev, ...partial }));
  return [
    {
      id: "material",
      label: "材质",
      icon: <MaterialIcon />,
      content: (
        <div className="space-y-3">
          {onDownload && <IronPreviewModal config={config} onDownload={onDownload} />}
          <SegmentedOptions
            columns={4}
            value={config.texture}
            onChange={(value) => update({ texture: value as RenderConfig["texture"] })}
            options={RENDER_TEXTURE_OPTIONS}
          />
          <SettingsToggle label="熨烫圆边" checked={config.roundedEdge} onChange={(value) => update({ roundedEdge: value })} />
          {config.roundedEdge && (
            <SliderSetting
              label="弧度"
              min={10}
              max={80}
              step={5}
              value={Math.round(100 * config.edgeRadius)}
              onChange={(value) => update({ edgeRadius: value / 100 })}
              format={(value) => `${value}%`}
            />
          )}
        </div>
      ),
    },
    {
      id: "shadow",
      label: "阴影",
      icon: <ShadowIcon />,
      content: (
        <div className="space-y-3">
          <SettingsToggle label="显示投影" checked={config.showShadow} onChange={(value) => update({ showShadow: value })} />
          {config.showShadow && (
            <>
              <SliderSetting
                label="角度"
                min={0}
                max={360}
                step={15}
                value={config.shadowAngle}
                onChange={(value) => update({ shadowAngle: value })}
                format={(value) => `${value}°`}
              />
              <SliderSetting label="距离" min={2} max={20} value={config.shadowDistance} onChange={(value) => update({ shadowDistance: value })} />
            </>
          )}
        </div>
      ),
    },
    {
      id: "decor",
      label: "画面",
      icon: <DecorIcon />,
      content: <ExportBackgroundSettings config={config} update={update} />,
    },
  ];
}

// manual 模式面板
function buildManualPanelCategories(
  props: ManualToolPanelProps & {
    manualTool: ManualToolId;
    onToolSelect: (tool: ManualToolId) => void;
    showToolGrid: boolean;
    colorReplaceState: ColorReplaceState;
    isEraseMode: boolean;
    handleEraseToggle: () => void;
    handleColorReplaceToggle: () => void;
    manualBrushSize: number;
    setManualBrushSize: (v: number) => void;
    manualShapeFill: boolean;
    setManualShapeFill: (v: boolean) => void;
    manualMirrorX: boolean;
    setManualMirrorX: (v: boolean) => void;
    manualMirrorY: boolean;
    setManualMirrorY: (v: boolean) => void;
    manualSelectionInfo: { width: number; height: number } | null;
    selectedColor: SelectedColor | null;
    currentGridColors: { key: string; color: string }[];
    handleColorSelect: (c: SelectedColor) => void;
    selectedColorSystem: string;
    fullPaletteColors: { key: string; color: string }[];
    showFullPalette: boolean;
    handleToggleFullPalette: () => void;
    handleColorReplace: (source: SelectedColor, target: SelectedColor) => void;
    handleHighlightColor: (key: string) => void;
    activeFloatingTool: string | null;
    handleActivatePalette: () => void;
    layers: LayersPanelProps;
  }
): PanelCategory[] {
  const toolIcon = MANUAL_TOOL_ICONS[props.manualTool] ?? <FallbackToolIcon />;
  const paletteIcon = props.selectedColor ? (
    <span
      className="w-5 h-5 rounded-md border border-gray-300 dark:border-gray-600"
      style={{ backgroundColor: props.selectedColor.color }}
    />
  ) : (
    <PaletteGridIcon />
  );
  const entries: PanelCategory[] = [
    {
      id: "tool",
      label: "工具",
      icon: toolIcon,
      content: <RecolorGuide {...(props as any)} />,
    },
    {
      id: "palette",
      label: "色板",
      icon: paletteIcon,
      content: (
        <ManualPalettePanel
          colors={props.currentGridColors}
          selectedColor={props.selectedColor}
          onColorSelect={props.handleColorSelect}
          selectedColorSystem={props.selectedColorSystem}
          fullPaletteColors={props.fullPaletteColors}
          showFullPalette={props.showFullPalette}
          onToggleFullPalette={props.handleToggleFullPalette}
          colorReplaceState={props.colorReplaceState}
          onColorReplace={props.handleColorReplace}
          onHighlightColor={props.handleHighlightColor}
          isActive={props.activeFloatingTool === "palette"}
          onActivate={props.handleActivatePalette}
          variant="docked"
        />
      ),
    },
  ];
  const layersEntry = LayersPanel(props.layers);
  if (layersEntry) entries.push(layersEntry);
  return entries;
}

// studio 模式面板
function buildStudioPanelCategories(
  props: {
    showPlaceholder: boolean;
    originalImageSrc: string | null;
    granularityInput: string;
    handleGranularityInputChange: (e: any) => void;
    similarityThresholdInput: string;
    handleSimilarityThresholdInputChange: (e: any) => void;
    handleConfirmParameters: () => void;
    hasGridAlignment: boolean;
    pixelationMode: PixelationMode;
    handlePixelationModeChange: (e: any) => void;
    handleAutoRemoveBackground: () => void;
    hasData: boolean;
    colorCounts: ColorCounts;
    totalBeadCount: number;
    selectedColorSystem: string;
    excludedColorKeys: Set<string>;
    setExcludedColorKeys: (keys: Set<string>) => void;
    showExcludedColors: boolean;
    setShowExcludedColors: React.Dispatch<React.SetStateAction<boolean>>;
    handleToggleExcludeColor: (hex: string) => void;
    setRemapTrigger: React.Dispatch<React.SetStateAction<number>>;
    setWorkspaceMode: (mode: string) => void;
    resetManualState: () => void;
    activeBeadPalette: PaletteColor[];
    layers: LayersPanelProps;
    [key: string]: any;
  }
): PanelCategory[] {
  const entries: PanelCategory[] = [];
  if (props.showPlaceholder && !props.originalImageSrc) {
    entries.push({ id: "board", label: "留言", content: <MessageBoard /> });
  }
  if (props.originalImageSrc) {
    entries.push({
      id: "params",
      label: "调整",
      icon: <AdjustParamsIcon />,
      content: <SettingsPanel {...(props as any)} />,
    });
  }
  if (props.colorCounts && Object.keys(props.colorCounts).length > 0) {
    entries.push({
      id: "colors",
      label: "色彩",
      icon: <ColorsPanelIcon />,
      quickControls: (
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {props.totalBeadCount} 颗
        </span>
      ),
      content: (
        <ExcludedColorsPanel
          colorCounts={props.colorCounts}
          selectedColorSystem={props.selectedColorSystem}
          excludedColorKeys={props.excludedColorKeys}
          setExcludedColorKeys={props.setExcludedColorKeys}
          showExcludedColors={props.showExcludedColors}
          setShowExcludedColors={props.setShowExcludedColors}
          handleToggleExcludeColor={props.handleToggleExcludeColor}
          setRemapTrigger={props.setRemapTrigger}
          setWorkspaceMode={props.setWorkspaceMode}
          resetManualState={props.resetManualState}
          activeBeadPalette={props.activeBeadPalette}
        />
      ),
    });
  }
  const layersEntry = LayersPanel(props.layers);
  if (layersEntry) entries.push(layersEntry);
  return entries;
}

// RecolorGuide接收的透传 props 形状（宽松类型，集成阶段由该组件侧收紧）
type ManualToolPanelProps = Record<string, any>;

// 主页组件
export default function HomePage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  // —— 全局状态
  const pageState = useWorkbenchPageState();
  const {
    originalImageSrc,
    setOriginalImageSrc,
    setRawImageForEdit,
    setIsImageEditVisible,
    granularity,
    setGranularity,
    granularityInput,
    setGranularityInput,
    similarityThreshold,
    setSimilarityThreshold,
    similarityThresholdInput,
    setSimilarityThresholdInput,
    pixelationMode,
    setPixelationMode,
    selectedColorSystem,
    setSelectedColorSystem,
    excludedColorKeys,
    setExcludedColorKeys,
    showExcludedColors,
    setShowExcludedColors,
    initialGridColorKeys,
    setInitialGridColorKeys,
    mappedPixelData,
    gridDimensions,
    setMappedPixelData,
    setGridDimensions,
    gridAlignment,
    setGridAlignment,
    colorCounts,
    setColorCounts,
    totalBeadCount,
    setTotalBeadCount,
    tooltipData,
    setTooltipData,
    remapTrigger,
    setRemapTrigger,
    workspaceMode,
    setWorkspaceMode,
    renderConfig,
    setRenderConfig,
    selectedColor,
    setSelectedColor,
    isEraseMode,
    setIsEraseMode,
    customPaletteSelections,
    setCustomPaletteSelections,
    setIsCustomPalette,
    setIsCustomPaletteEditorOpen,
    setIsCanvasSizeModalOpen,
    setIsCanvasCropActive,
    downloadOptions,
    setDownloadOptions,
    highlightColorKey,
    setHighlightColorKey,
    showFullPalette,
    setShowFullPalette,
    colorReplaceState,
    setColorReplaceState,
    isMounted,
    setIsMounted,
    isMobileLayout,
    setMobileActiveCategoryId,
    setIsMagnifierActive,
    renderCanvasRef,
    setMagnifierSelectionArea,
    activeFloatingTool,
    setActiveFloatingTool,
    setIsInventoryCheckOpen,
    setInventoryCheckResult,
    isManualColoringMode,
    originalCanvasRef,
    pixelatedCanvasRef,
    fileInputRef,
    importPaletteInputRef,
    mainRef,
    stageRef,
    mappedPixelDataRef,
    resetAllEditingStateRef,
  } = pageState;

  // 当前生效的拼豆色板（自定义选色 - 排除色，再按色号系统映射）
  const activeBeadPalette = useMemo(() => {
    const palette = FULL_BEAD_PALETTE.filter((c) => {
      const upper = c.hex.toUpperCase();
      return customPaletteSelections[upper] && !excludedColorKeys.has(upper);
    });
    return mapPaletteToColorSystem(palette, selectedColorSystem);
  }, [customPaletteSelections, excludedColorKeys, remapTrigger, selectedColorSystem]);

  // 数值状态与输入框文案同步
  useEffect(() => {
    setGranularityInput(granularity.toString());
    setSimilarityThresholdInput(similarityThreshold.toString());
  }, [granularity, similarityThreshold, setGranularityInput, setSimilarityThresholdInput]);

  // 当前图纸去重后的颜色列表
  const currentGridColors = useMemo(() => {
    if (!mappedPixelData) return [];
    const unique = new Map<string, PixelCell>();
    mappedPixelData.flat().forEach((cell) => {
      if (cell?.color && !cell.isExternal) {
        const upper = cell.color.toUpperCase();
        if (!unique.has(upper)) unique.set(upper, cell);
      }
    });
    return sortColorsBySystem(
      Array.from(unique.values()).map((cell) => ({
        key: getColorDisplayKey(cell.color.toUpperCase(), selectedColorSystem),
        color: cell.color,
      }))
    );
  }, [mappedPixelData, selectedColorSystem]);

  // 从像素数据重算颜色统计
  const updateCountsFromPixelData = useCallback(
    (data: PixelGrid) => {
      const counts: Record<string, ColorCountEntry> = {};
      let total = 0;
      const colorKeys = new Set<string>();
      data.flat().forEach((cell) => {
        if (!cell || cell.isExternal || cell.key === ERASE_KEY) return;
        const upper = cell.color.toUpperCase();
        if (!counts[upper]) counts[upper] = { count: 0, color: cell.color };
        counts[upper].count++;
        total++;
        colorKeys.add(upper);
      });
      setColorCounts(counts);
      setTotalBeadCount(total);
      setInitialGridColorKeys(colorKeys);
    },
    [setColorCounts, setInitialGridColorKeys, setTotalBeadCount]
  );

  // 颜色替换第一步：画布上选中源颜色
  const handleCanvasColorSelect = useCallback(
    (color: { key: string; color: string }) => {
      if (colorReplaceState.isActive && "select-source" === colorReplaceState.step) {
        setHighlightColorKey(color.color);
        setColorReplaceState({ isActive: true, step: "select-target", sourceColor: color as SelectedColor });
      }
    },
    [colorReplaceState.isActive, colorReplaceState.step, setColorReplaceState, setHighlightColorKey]
  );

  // —— 手动编辑器子系统
  const manualEditor = useManualEditor({
    setMappedPixelData,
    mappedPixelDataRef,
    gridDimensions,
    pixelatedCanvasSize: null,
    isManualColoringMode,
    selectedColor,
    setSelectedColor,
    isEraseMode,
    setIsEraseMode,
    colorReplaceState,
    handleCanvasColorSelect,
    updateCountsFromPixelData,
    currentGridColors,
    stageRef,
  });
  const {
    manualTool,
    manualBrushSize,
    setManualBrushSize,
    manualShapeFill,
    setManualShapeFill,
    manualMirrorX,
    setManualMirrorX,
    manualMirrorY,
    setManualMirrorY,
    manualShowReference,
    setManualShowReference,
    manualReferenceOpacity,
    setManualReferenceOpacity,
    manualSelection,
    canUndo,
    canRedo,
    resetManualState: resetManualStateFromEditor,
    applyManualCommit,
    applyManualUndo,
    applyManualRedo,
    handleManualToolSelect,
    computeFloodFillErase,
  } = manualEditor;

  // —— 专心拼豆子系统
  const focusMode = useFocusMode({
    workspaceMode,
    colorCounts,
    selectedColorSystem,
    pixelatedCanvasSize: null,
    pixelatedCanvasRef,
    resetManualState: manualEditor.resetManualState,
    setWorkspaceMode,
  });
  const { focusState, setFocusState, handleEnterFocusMode } = focusMode;

  // 手动模式全局工具快捷键（Ctrl+Z/Y + 单字母切工具，g→填充）
  useEffect(() => {
    const enabled = isManualColoringMode;
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if ("INPUT" === tag || "TEXTAREA" === tag || target.isContentEditable) return;
      if ((event.metaKey || event.ctrlKey) && "z" === event.key.toLowerCase()) {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) applyManualRedo();
        } else {
          if (canUndo) applyManualUndo();
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tool = MANUAL_TOOL_HOTKEYS_ALT[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        handleManualToolSelect(tool);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isManualColoringMode, handleManualToolSelect, applyManualUndo, applyManualRedo, canUndo, canRedo]);

  // —— 库存子系统
  const beadInventory = useBeadInventory();
  const hasAnyInventory = useMemo(() => Object.values(beadInventory.inventory).some((count) => count > 0), [beadInventory.inventory]);

  // 进入专心拼豆前如填写过库存则先做库存盘点
  const handleEnterFocusModeWithCheck = useCallback(() => {
    if (!colorCounts || !hasAnyInventory) {
      handleEnterFocusMode();
      return;
    }
    setInventoryCheckResult(beadInventory.checkInventory(colorCounts, selectedColorSystem));
    setIsInventoryCheckOpen(true);
  }, [colorCounts, selectedColorSystem, beadInventory, handleEnterFocusMode, hasAnyInventory, setInventoryCheckResult, setIsInventoryCheckOpen]);

  const handleInventoryCheckConfirm = useCallback(() => {
    if (colorCounts) beadInventory.deductInventory(colorCounts);
    setIsInventoryCheckOpen(false);
    handleEnterFocusMode();
  }, [colorCounts, beadInventory, handleEnterFocusMode, setIsInventoryCheckOpen]);

  const handleInventoryCheckSkip = useCallback(() => {
    setIsInventoryCheckOpen(false);
    handleEnterFocusMode();
  }, [handleEnterFocusMode, setIsInventoryCheckOpen]);

  // 「全部重置编辑状态」引导函数
  useEffect(() => {
    resetAllEditingStateRef.current = () => {
      setSelectedColor(null);
      setTooltipData(null);
      setIsEraseMode(false);
      setColorReplaceState({ isActive: false, step: "select-source" });
      setHighlightColorKey(null);
      setIsMagnifierActive(false);
      setMobileActiveCategoryId(null);
      setActiveFloatingTool(null);
      setIsCanvasCropActive(false);
      resetManualStateFromEditor();
    };
  }, [resetAllEditingStateRef, resetManualStateFromEditor, setActiveFloatingTool, setColorReplaceState, setHighlightColorKey, setIsCanvasCropActive, setIsEraseMode, setIsMagnifierActive, setMobileActiveCategoryId, setSelectedColor, setTooltipData]);

  const resetAllEditingState = useCallback(() => {
    resetAllEditingStateRef.current();
  }, [resetAllEditingStateRef]);

  const handleEnterManualMode = useCallback(() => {
    setWorkspaceMode("manual");
    resetAllEditingStateRef.current();
  }, [resetAllEditingStateRef, setWorkspaceMode]);

  const handleEnterStudioMode = useCallback(() => {
    setWorkspaceMode("studio");
    resetAllEditingStateRef.current();
  }, [resetAllEditingStateRef, setWorkspaceMode]);

  const handleEnterRenderMode = useCallback(() => {
    setWorkspaceMode("render");
    resetAllEditingStateRef.current();
  }, [resetAllEditingStateRef, setWorkspaceMode]);

  // 画布尺寸调整（走 store 的 resizeGrid）
  const applyCanvasResize = useCallback(
    (width: number, height: number, offsetX: number, offsetY: number) => {
      const store = useWorkbenchStore.getState();
      store.resizeGrid(width, height, offsetX, offsetY);
      const composite = store.getComposite();
      if (composite) {
        mappedPixelDataRef.current = composite;
        updateCountsFromPixelData(composite);
      }
      resetAllEditingState();
    },
    [mappedPixelDataRef, resetAllEditingState, updateCountsFromPixelData]
  );

  const handleStartCanvasCropSelection = useCallback(() => {
    setIsCanvasCropActive(true);
  }, [setIsCanvasCropActive]);

  const handleConfirmCanvasCrop = useCallback(
    (selection: SelectionRect) => {
      if (!gridDimensions) return;
      const width = selection.colEnd - selection.colStart + 1;
      const height = selection.rowEnd - selection.rowStart + 1;
      setIsCanvasCropActive(false);
      if (width === gridDimensions.N && height === gridDimensions.M && 0 === selection.colStart && 0 === selection.rowStart) {
        toast.info("画布尺寸未变化");
        return;
      }
      applyCanvasResize(width, height, -selection.colStart, -selection.rowStart);
      toast.success(`画布已裁剪为 ${width}×${height}`);
    },
    [applyCanvasResize, gridDimensions, setIsCanvasCropActive, toast]
  );

  const clearDocumentFromStore = useWorkbenchStore((s) => s.clearDocument);

  // 回到首页（确认后清空作品）
  const handleGoHome = useCallback(async () => {
    if (
      (originalImageSrc || mappedPixelData) &&
      (await confirm({
        title: "回到首页",
        message: "当前作品将被清除，未导出的修改将丢失。",
        confirmLabel: "回到首页",
        danger: true,
      }))
    ) {
      setOriginalImageSrc(null);
      setMappedPixelData(null);
      setGridDimensions(null);
      setColorCounts(null);
      setTotalBeadCount(0);
      setInitialGridColorKeys(new Set());
      setGridAlignment(null);
      setWorkspaceMode("studio");
      resetAllEditingStateRef.current();
      clearDocumentFromStore();
    }
  }, [originalImageSrc, mappedPixelData, confirm, resetAllEditingStateRef, setOriginalImageSrc, setMappedPixelData, setGridDimensions, setColorCounts, setTotalBeadCount, setInitialGridColorKeys, setGridAlignment, setWorkspaceMode, clearDocumentFromStore]);

  // 创建空白画布
  const createBlankCanvas = useCallback(
    (width: number, height: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx!.fillStyle = "#FFFFFF";
      ctx!.fillRect(0, 0, width, height);
      setOriginalImageSrc(canvas.toDataURL("image/png"));
      setMappedPixelData(null);
      setGridDimensions(null);
      setColorCounts(null);
      setTotalBeadCount(0);
      setInitialGridColorKeys(new Set());
      setGridAlignment(null);
      setGranularity(width);
      setGranularityInput(width.toString());
      setRemapTrigger((n) => n + 1);
    },
    [setOriginalImageSrc, setMappedPixelData, setGridDimensions, setColorCounts, setTotalBeadCount, setInitialGridColorKeys, setGridAlignment, setGranularity, setGranularityInput, setRemapTrigger]
  );

  // —— 像素化子系统
  const pixelation = usePixelationEngine({
    originalImageSrc,
    granularity,
    similarityThreshold,
    customPaletteSelections,
    pixelationMode,
    remapTrigger,
    activeBeadPalette,
    gridAlignment,
    gridDimensions,
    originalCanvasRef,
    pixelatedCanvasRef,
    mainRef,
    setWorkspaceMode,
    resetManualState: resetAllEditingState, // 源传 tV（resetAllEditingState）
    setMappedPixelData,
    setGridDimensions,
    setColorCounts,
    setTotalBeadCount,
    setInitialGridColorKeys,
    setOriginalImageSrc,
  });

  // —— 颜色管理子系统
  const colorMgmt = useColorManagement({
    mappedPixelData,
    setMappedPixelData,
    gridDimensions,
    colorCounts,
    setColorCounts,
    totalBeadCount,
    setTotalBeadCount,
    initialGridColorKeys,
    setInitialGridColorKeys,
    excludedColorKeys,
    setExcludedColorKeys,
    selectedColor,
    setSelectedColor,
    isEraseMode,
    setIsEraseMode,
    colorReplaceState,
    setColorReplaceState,
    highlightColorKey,
    setHighlightColorKey,
    showFullPalette,
    setShowFullPalette,
    tooltipData,
    setTooltipData,
    isManualColoringMode,
    pixelatedCanvasRef,
    mainRef,
    setRemapTrigger,
    setWorkspaceMode,
    resetManualState: resetAllEditingState, // 源传 tV
    updateCountsFromPixelData,
    computeFloodFillEraseForStudio: computeFloodFillErase, // 源传 tj
    applyManualCommit,
    handleCanvasColorSelect,
  });

  // —— 文件处理子系统
  const fileHandling = useFileHandling({
    isMounted,
    fileInputRef,
    originalImageSrc,
    setOriginalImageSrc,
    setRawImageForEdit,
    setIsImageEditVisible,
    granularity,
    setGranularity,
    granularityInput,
    setGranularityInput,
    similarityThreshold,
    setSimilarityThreshold,
    similarityThresholdInput,
    setSimilarityThresholdInput,
    setPixelationMode,
    setGridAlignment,
    setMappedPixelData,
    setGridDimensions,
    setColorCounts,
    setTotalBeadCount,
    setInitialGridColorKeys,
    setRemapTrigger,
    setWorkspaceMode,
    resetManualState: resetAllEditingState, // 源传 tV
    setExcludedColorKeys,
    isManualColoringMode,
    colorReplaceState,
    setColorReplaceState,
    setHighlightColorKey,
    isEraseMode,
    setIsEraseMode,
    setSelectedColor,
  });

  // —— 自定义色板子系统
  const paletteMgmt = usePaletteManagement({
    customPaletteSelections,
    setCustomPaletteSelections,
    setIsCustomPalette,
    setIsCustomPaletteEditorOpen,
    importPaletteInputRef,
    setRemapTrigger,
    setWorkspaceMode,
    resetManualState: resetAllEditingState, // 源传 tV
  });

  const onLayerChange = useCallback(() => {}, []);
  const hasStoreDoc = useWorkbenchStore((s) => !!s.document);

  const handleToggleMagnifier = useCallback(() => {
    setIsMagnifierActive((prev) => ((prev && setMobileActiveCategoryId(null)), !prev));
  }, [setIsMagnifierActive, setMobileActiveCategoryId]);

  const handleActivatePalette = useCallback(() => setActiveFloatingTool("palette"), [setActiveFloatingTool]);

  const handleColorIndicatorClick = useCallback(() => {
    setActiveFloatingTool("palette");
    setMobileActiveCategoryId("palette");
  }, [setActiveFloatingTool, setMobileActiveCategoryId]);

  const handleToolbarToolSelect = useCallback(
    (tool: ManualToolId) => {
      handleManualToolSelect(tool);
      setMobileActiveCategoryId("tool");
    },
    [handleManualToolSelect, setMobileActiveCategoryId]
  );

  const handleActivateMagnifier = useCallback(() => setActiveFloatingTool("magnifier"), [setActiveFloatingTool]);

  // 放大镜内单格改色
  const handleMagnifierPixelEdit = useCallback(
    (row: number, col: number, color: SelectedColor) => {
      if (!mappedPixelData) return;
      const nextData = mappedPixelData.map((dataRow, rowIndex) =>
        dataRow.map((cell, colIndex) =>
          rowIndex === row && colIndex === col
            ? color.key === ERASE_KEY
              ? { ...ERASE_CELL }
              : { key: color.key, color: color.color, isExternal: false }
            : cell
        )
      );
      if (isManualColoringMode) {
        applyManualCommit(nextData, mappedPixelData);
        return;
      }
      setMappedPixelData(nextData);
      updateCountsFromPixelData(nextData);
    },
    [mappedPixelData, isManualColoringMode, applyManualCommit, updateCountsFromPixelData, setMappedPixelData]
  );

  // —— 导出子系统
  const fileExports = useFileExports({
    mappedPixelData,
    gridDimensions,
    colorCounts,
    totalBeadCount,
    downloadOptions,
    setDownloadOptions,
    activeBeadPalette,
    selectedColorSystem,
    customPaletteSelections,
    setCustomPaletteSelections,
    setIsCustomPalette,
    beadInventory,
    toast,
    renderCanvasRef,
  });
  const { handleRenderDownload } = fileExports;

  const handleHighlightComplete = useCallback(() => setHighlightColorKey(null), [setHighlightColorKey]);

  // 挂载：标记水合完成 + isMounted
  useEffect(() => {
    markPageHydrated();
    setIsMounted(true);
  }, [setIsMounted]);

  // 恢复作者名与水印配置
  useEffect(() => {
    const authorName = localStorage.getItem("perler-author-name");
    if (authorName) {
      setDownloadOptions((prev) => ({ ...prev, authorName }));
    }
    try {
      const raw = localStorage.getItem("perler-watermark-config");
      if (raw) {
        const watermark = JSON.parse(raw);
        if (watermark && "object" == typeof watermark && "boolean" == typeof watermark.enabled && ("tile" === watermark.type || "emboss" === watermark.type) && "string" == typeof watermark.text) {
          setDownloadOptions((prev) => ({ ...prev, watermark }));
        }
      }
    } catch (e) {}
  }, [setDownloadOptions]);

  // 非本地环境强制跳转线上域名
  useEffect(() => {
    const hostname = window.location.hostname;
    const isLocal = "localhost" === hostname || "127.0.0.1" === hostname || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.endsWith(".local");
    const canonical = "https://perlerbeads.zippland.com/";
    if (!window.location.href.startsWith(canonical) && !isLocal) {
      window.location.replace(canonical + ("/" !== window.location.pathname ? window.location.pathname.replace(/^\//, "") : "") + window.location.search + window.location.hash);
    }
  }, []);

  // 画廊分享码参数
  const [galleryParam, setGalleryParam] = useState<string | null>(null);
  const applyCanvasFromStore = useCallback(
    (payload: { pixelData: PixelGrid; width?: number; height?: number }) => {
      setMappedPixelData(payload.pixelData);
      updateCountsFromPixelData(payload.pixelData);
      setWorkspaceMode("manual");
    },
    [updateCountsFromPixelData, setMappedPixelData, setWorkspaceMode]
  );
  const clearHistory = useWorkbenchStore((s) => s.clearHistory);
  const applyCanvasExternal = useCallback(
    (payload: { pixelData: PixelGrid; width: number; height: number }) => {
      setGridDimensions({ N: payload.width, M: payload.height });
      setMappedPixelData(payload.pixelData);
      clearHistory();
      updateCountsFromPixelData(payload.pixelData);
      setWorkspaceMode("manual");
    },
    [updateCountsFromPixelData, clearHistory, setMappedPixelData, setGridDimensions, setWorkspaceMode]
  );

  // —— 启动引导（本地恢复 / 画廊导入）
  const galleryBoot = useGalleryBoot({
    isMounted,
    galleryParam,
    applyCanvasExternal,
    applyCanvasFromStore,
    applySettings: useCallback(
      (settings: any) => {
        if (settings.granularity) {
          setGranularity(settings.granularity);
          setGranularityInput(String(settings.granularity));
        }
        if (settings.similarityThreshold) {
          setSimilarityThreshold(settings.similarityThreshold);
          setSimilarityThresholdInput(String(settings.similarityThreshold));
        }
        if (settings.pixelationMode) setPixelationMode(settings.pixelationMode);
        if (settings.selectedColorSystem) setSelectedColorSystem(settings.selectedColorSystem);
        if (settings.excludedColorKeys?.length) setExcludedColorKeys(new Set(settings.excludedColorKeys));
      },
      [setExcludedColorKeys, setGranularity, setGranularityInput, setPixelationMode, setSelectedColorSystem, setSimilarityThreshold, setSimilarityThresholdInput]
    ),
    onGalleryLoaded: useCallback(() => {
      router.replace("/", { scroll: false });
    }, [router]),
  });

  // 画廊导入失败提示（只弹一次）
  const galleryErrorShownRef = useRef(false);
  useEffect(() => {
    if ("error" !== (galleryBoot as any).kind) {
      galleryErrorShownRef.current = false;
      return;
    }
    if (!galleryErrorShownRef.current) {
      galleryErrorShownRef.current = true;
      toast.error(
        ({
          "gallery-invalid-code": "分享码格式不正确",
          "gallery-fetch-failed": "加载作品失败，请检查分享码",
          "gallery-wrong-password": "密码错误，请向作者确认",
          "gallery-password-required": "此作品为私密作品，需要密码才能导入",
        } as Record<string, string>)[(galleryBoot as any).reason] ?? "导入失败"
      );
      router.replace("/", { scroll: false });
    }
  }, [galleryBoot, router, toast]);

  // UI 设置持久化（跳过首次）
  const settingsSavedOnceRef = useRef(true);
  useEffect(() => {
    if (settingsSavedOnceRef.current) {
      settingsSavedOnceRef.current = false;
      return;
    }
    const settings = {
      granularity,
      similarityThreshold,
      pixelationMode,
      selectedColorSystem,
      excludedColorKeys: Array.from(excludedColorKeys),
    };
    try {
      const stored = readUiSettings();
      localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ ...stored, ...settings }));
    } catch (e) {}
  }, [granularity, similarityThreshold, pixelationMode, selectedColorSystem, excludedColorKeys]);

  const isFocusMode = "focus" === workspaceMode;
  const isRenderMode = "render" === workspaceMode;
  const showPlaceholder = !originalImageSrc && !mappedPixelData;

  // 全色板（当前自定义选中的颜色，按色号系统排序）
  const fullPaletteColors = useMemo(() => {
    const colors: { key: string; color: string }[] = [];
    Object.entries(customPaletteSelections).forEach(([hex, selected]) => {
      if (selected) colors.push({ key: getColorDisplayKey(hex, selectedColorSystem), color: hex });
    });
    return sortColorsBySystem(colors);
  }, [customPaletteSelections, selectedColorSystem]);

  // 手动模式选区信息
  const manualSelectionInfo = manualSelection
    ? { width: manualSelection.colEnd - manualSelection.colStart + 1, height: manualSelection.rowEnd - manualSelection.rowStart + 1 }
    : null;

  // 图层面板入参
  const layersProps: LayersPanelProps = {
    hasStoreDoc,
    onLayerChange,
    hasReferenceImage: !!originalImageSrc,
    referenceVisible: manualShowReference,
    onReferenceVisibleChange: setManualShowReference,
    referenceOpacity: manualReferenceOpacity,
    onReferenceOpacityChange: setManualReferenceOpacity,
    onOpenCanvasSize: () => setIsCanvasSizeModalOpen(true),
  };

  // 面板分类
  const panelCategories: PanelCategory[] = isFocusMode
    ? buildFocusPanelCategories({ focusState, setFocusState })
    : isRenderMode
    ? buildRenderPanelCategories({ config: renderConfig, onConfigChange: setRenderConfig, onDownload: handleRenderDownload as () => Promise<ExportArtifact> })
    : isManualColoringMode
    ? buildManualPanelCategories({
        manualTool,
        onToolSelect: handleManualToolSelect,
        showToolGrid: isMobileLayout,
        colorReplaceState,
        isEraseMode,
        handleEraseToggle: fileHandling.handleEraseToggle,
        handleColorReplaceToggle: colorMgmt.handleColorReplaceToggle,
        manualBrushSize,
        setManualBrushSize,
        manualShapeFill,
        setManualShapeFill,
        manualMirrorX,
        setManualMirrorX,
        manualMirrorY,
        setManualMirrorY,
        manualSelectionInfo,
        selectedColor,
        currentGridColors,
        handleColorSelect: colorMgmt.handleColorSelect,
        selectedColorSystem,
        fullPaletteColors,
        showFullPalette,
        handleToggleFullPalette: colorMgmt.handleToggleFullPalette,
        handleColorReplace: colorMgmt.handleColorReplace,
        handleHighlightColor: colorMgmt.handleHighlightColor,
        activeFloatingTool,
        handleActivatePalette,
        layers: layersProps,
      })
    : buildStudioPanelCategories({
        showPlaceholder,
        originalImageSrc,
        granularityInput,
        handleGranularityInputChange: fileHandling.handleGranularityInputChange,
        similarityThresholdInput,
        handleSimilarityThresholdInputChange: fileHandling.handleSimilarityThresholdInputChange,
        handleConfirmParameters: fileHandling.handleConfirmParameters,
        hasGridAlignment: !!gridAlignment,
        pixelationMode,
        handlePixelationModeChange: fileHandling.handlePixelationModeChange,
        handleAutoRemoveBackground: colorMgmt.handleAutoRemoveBackground,
        hasData: !!mappedPixelData && !!gridDimensions,
        colorCounts,
        totalBeadCount,
        selectedColorSystem,
        excludedColorKeys,
        setExcludedColorKeys,
        showExcludedColors,
        setShowExcludedColors,
        handleToggleExcludeColor: colorMgmt.handleToggleExcludeColor,
        setRemapTrigger,
        setWorkspaceMode,
        resetManualState: resetAllEditingState,
        activeBeadPalette,
        layers: layersProps,
      });

  // 渲染工作台外壳
  return (
    <AboutModal
      state={pageState}
      panelCategories={panelCategories}
      manualEditor={manualEditor}
      focusMode={focusMode}
      pixelation={pixelation}
      colorMgmt={colorMgmt}
      fileHandling={fileHandling}
      paletteMgmt={paletteMgmt}
      beadInventory={beadInventory}
      fileExports={fileExports}
      actions={{
        setGalleryParam,
        handleGoHome,
        handleEnterStudioMode,
        handleEnterManualMode,
        handleEnterRenderMode,
        handleEnterFocusModeWithCheck,
        createBlankCanvas,
        handleToolbarToolSelect,
        handleColorIndicatorClick,
        handleHighlightComplete,
        applyCanvasResize,
        handleStartCanvasCropSelection,
        handleConfirmCanvasCrop,
        handleInventoryCheckConfirm,
        handleInventoryCheckSkip,
        handleToggleMagnifier,
        handleActivateMagnifier,
        handleMagnifierPixelEdit,
      }}
    />
  );
}

