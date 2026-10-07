
import { Suspense } from "react";
import type { ReactNode } from "react";

import { InstallPrompt } from "./install-prompt";
// TODO(集成): ZoomableCanvas(i)/ColorCelebration(d) 物理位于 00-s.js 尾部，随 InstallPrompt 一同转换
import { ZoomableCanvas, ColorCelebration } from "./install-prompt";
// TODO(集成): FocusSidePanel(x) 物理位于 01-u.js 尾部（ColorReadout 之后）
import { FocusSidePanel } from "./color-readout";
import { CompletionCard } from "./completion-card"; // 源 05-b.js (w)
import { ImageAlignModal } from "./image-align-modal"; // 源 08-C.js (N)
// TODO(集成): CustomPaletteModal 组件实体 L 物理位于 09-R.js，契约目标文件为 custom-palette-modal.tsx
import { CustomPaletteModal } from "./custom-palette-modal";
// TODO(集成): MagnifierPanel(P)/MagnifierSelection(T)/DownloadSettingsModal(B)/DonationModal(F)
// 物理均位于 09-R.js（color-palette-panel.tsx），集成时以实际导出名为准
import { MagnifierPanel, MagnifierSelection, DownloadSettingsModal, DonationModal } from "./color-palette-panel";
import { WelcomeScreen } from "./welcome-screen"; // 源 10-Y.js
import { BackToHomeButton } from "./back-to-home"; // 源 11-G.js
import { ModalShell, MobilePanelDock } from "./modal-shell"; // 源 模块5048 / 14-$.js
// TODO(集成): WorkbenchLayout(ej)/PaintToolbar(eS) 物理位于 28-ej.js
import { WorkbenchLayout, PaintToolbar } from "./paint-toolbar";
// TODO(集成): UndoRedoBar(eR)/InventoryCheckModal(eP) 物理位于 29-eE.js 尾部
import { PasteOverlay, UndoRedoBar, InventoryCheckModal } from "./paste-overlay";
import { CropKeepModal } from "./crop-keep-modal"; // 源 26-ew.js
import { AppFooter } from "./app-footer"; // 源 27-ek.js
import { CanvasSizeModal } from "./canvas-size-modal"; // 源 23-ey.js
// TODO(集成): MiniMap(eF)/LazyPreviewEngine(e_，next/dynamic 懒加载预览引擎) 物理位于 31-eA.js
import { MiniMap, LazyPreviewEngine } from "./preview-engine";
import { GallerySubmitModal } from "./gallery-submit-modal"; // 源 30-eD.js
import { DesktopDrawer, GalleryParamListener } from "./bits"; // 源 13-_.js / 32-e$.js
import { PrivacyNoticeModal } from "./privacy-notice"; // 源 16-Q.js
// 定制：社区与支持卡片（CommunitySupportModal）已按需求移除，不再挂载
// TODO(集成): COLOR_SYSTEMS/getColorCode 对应 211.js 模块 1866 的 v1/TR
import { COLOR_SYSTEMS, getColorCode } from "@/utils/color-system";
import { ALL_COLORS } from "@/utils/bundle-misc";

// ---------------------------------------------------------------------------
// 本地小组件（孤儿切片，见文件头注释）
// ---------------------------------------------------------------------------

/** "关于"面板内容：隐私声明（定制：社区与支持卡片已移除） */
function AboutPanelContent({ onOpenDonation: _onOpenDonation }: { onOpenDonation: () => void }) {
    return (
        <>
            <PrivacyNoticeModal />
        </>
    );
}

interface TooltipData {
    x: number;
    y: number;
    color: string;
}

/** 画布取色提示浮层（源 08-C.js 尾部 S） */
function ColorTooltip({ tooltipData, selectedColorSystem = "MARD" }: { tooltipData: TooltipData; selectedColorSystem?: string }) {
    return tooltipData ? (
        <div
            className="absolute bg-gray-900 text-gray-50 text-xs px-2 py-1 rounded shadow-lg pointer-events-none flex items-center space-x-1.5 z-50"
            style={{
                left: `${tooltipData.x}px`,
                top: `${tooltipData.y - 25}px`,
                transform: "translate(-50%, -100%)",
                whiteSpace: "nowrap",
            }}
        >
            <span
                className="inline-block w-3 h-3 rounded-sm border border-gray-400 dark:border-gray-500 flex-shrink-0"
                style={{ backgroundColor: tooltipData.color }}
            />
            <span className="font-mono font-semibold">{getColorCode(tooltipData.color, selectedColorSystem)}</span>
        </div>
    ) : null;
}

// 源 31-eA.js 尾部图标组的共享 svg 属性（eI）
const ICON_SVG_PROPS = {
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "w-full h-full",
};

/** "关于"标签图标（源 eG） */
function InfoIcon() {
    return (
        <svg {...ICON_SVG_PROPS}>
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="11" x2="12" y2="16" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    );
}

/** "下载"主按钮图标（源 eq） */
function DownloadIcon() {
    return (
        <svg {...ICON_SVG_PROPS}>
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
        </svg>
    );
}

// ---------------------------------------------------------------------------
// 主组件（源 eZ）
// ---------------------------------------------------------------------------

export interface PanelCategory {
    id: string;
    label: string;
    icon?: ReactNode;
    content?: ReactNode;
    quickControls?: ReactNode;
    bare?: boolean;
}

export interface AboutModalProps {
    state: any; // TODO(类型): 工作台聚合状态（源 o），字段见下方解构，共 60+
    panelCategories: PanelCategory[];
    manualEditor: any; // TODO(类型): 手绘编辑器聚合（源 u）
    focusMode: any; // TODO(类型): 专心拼豆聚合（源 h）
    pixelation: any; // TODO(类型): 像素化聚合（源 g）
    colorMgmt: any; // TODO(类型): 颜色管理聚合（源 m）
    fileHandling: any; // TODO(类型): 文件处理聚合（源 f）
    paletteMgmt: any; // TODO(类型): 色板管理聚合（源 p）
    beadInventory: any; // TODO(类型): 拼豆库存聚合（源 y）
    fileExports: any; // TODO(类型): 导出聚合（源 b）
    actions: any; // TODO(类型): 动作聚合（源 v）
}

export function AboutModal({
    state,
    panelCategories,
    manualEditor,
    focusMode,
    pixelation,
    colorMgmt,
    fileHandling,
    paletteMgmt,
    beadInventory,
    fileExports,
    actions,
}: AboutModalProps) {
    const {
        originalImageSrc,
        rawImageForEdit,
        isImageEditVisible,
        selectedColorSystem,
        mappedPixelData,
        gridDimensions,
        tooltipData,
        workspaceMode,
        renderConfig,
        selectedColor,
        isEraseMode,
        colorReplaceState,
        highlightColorKey,
        isMounted,
        isDeviceLayoutReady,
        isMobileLayout,
        isCompactTopBar,
        isWelcomeState,
        drawerSide,
        hideMobileSheet,
        mobileActiveCategoryId,
        setMobileActiveCategoryId,
        mainPaddingRight,
        mainPaddingBottom,
        isMagnifierActive,
        showMiniMap,
        setMiniMapVisibilityOverride,
        renderCanvasRef,
        magnifierSelectionArea,
        setMagnifierSelectionArea,
        activeFloatingTool,
        setIsCustomPaletteEditorOpen,
        isCustomPaletteEditorOpen,
        customPaletteSelections,
        setSelectedColorSystem,
        isCanvasSizeModalOpen,
        setIsCanvasSizeModalOpen,
        isCanvasCropActive,
        setIsCanvasCropActive,
        isDonationModalOpen,
        setIsDonationModalOpen,
        isInventoryCheckOpen,
        setIsInventoryCheckOpen,
        inventoryCheckResult,
        isDownloadSettingsOpen,
        setIsDownloadSettingsOpen,
        downloadOptions,
        isShareModalOpen,
        setIsShareModalOpen,
        setDownloadOptions,
        originalCanvasRef,
        pixelatedCanvasRef,
        fileInputRef,
        mainRef,
        stageRef,
        isManualColoringMode,
    } = state;

    const {
        manualTool,
        manualPasteActive,
        manualSelection,
        manualSelectionPreview,
        manualPreviewCells,
        manualMovePreview,
        manualPastePreview,
        manualView,
        isPanModifierActive,
        manualStageSize,
        manualShowReference,
        manualReferenceOpacity,
        canUndo,
        canRedo,
        handleManualPointer,
        applyManualUndo,
        applyManualRedo,
        handleManualCopy,
        handleManualCut,
        handleManualDeleteSelection,
        handleManualClearSelection,
        handleManualViewChange,
    } = manualEditor;

    const {
        focusState,
        setFocusState,
        focusColors,
        handleFocusCellClick,
        handleFocusMarkRecommended,
        handleFocusColorChange,
        handleFocusLocateRecommended,
        formatFocusTime,
        handleFocusPauseToggle,
        handleFocusCelebrationComplete,
        handleFocusCompletionCardClose,
    } = focusMode;

    const { placeholderPixelData, placeholderGridDimensions, placeholderCanvasSize, pixelatedCanvasSize } = pixelation;

    const {
        paletteXlsxInputRef,
        handleDownloadRequest,
        handleExportCsv,
        handleExportPaletteXlsx,
        handleImportPaletteXlsx,
        handlePaletteXlsxFileChange,
        handleDownloadOptionsChange,
    } = fileExports;

    const isFocusMode = workspaceMode === "focus";
    const isRenderMode = workspaceMode === "render";
    // 无原图且无像素数据 → 显示占位/欢迎态
    const isPlaceholderState = !originalImageSrc && !mappedPixelData;
    const displayPixelData = isPlaceholderState ? placeholderPixelData : mappedPixelData;
    const displayGridDimensions = isPlaceholderState ? placeholderGridDimensions : gridDimensions;
    const displayCanvasSize = isPlaceholderState ? placeholderCanvasSize : pixelatedCanvasSize;
    const hasPixelData = !!(mappedPixelData && gridDimensions);
    const currentColorInfo = focusColors.find((c: any) => c.color === focusState.currentColor);
    const progressPercentage = currentColorInfo
        ? Math.round((currentColorInfo.completed / currentColorInfo.total) * 100)
        : 0;
    const selectedPaletteCount = Object.values(customPaletteSelections).filter(Boolean).length;
    const selectedColorSystemLabel =
        COLOR_SYSTEMS.find((cs: any) => cs.key === selectedColorSystem)?.name ?? selectedColorSystem;
    const isPanActive =
        isPanModifierActive || (manualTool === "drag" && !isEraseMode && !colorReplaceState.isActive);
    const manualCursorClass = isPanActive
        ? "cursor-grab"
        : manualTool === "picker" || manualTool === "paste"
          ? "cursor-copy"
          : manualTool === "select"
            ? manualSelection
                ? "cursor-move"
                : "cursor-cell"
            : "cursor-crosshair";
    const activePreviewRect = manualPastePreview ?? manualMovePreview ?? manualSelectionPreview;
    const selectionInfo = manualSelection
        ? {
              width: manualSelection.colEnd - manualSelection.colStart + 1,
              height: manualSelection.rowEnd - manualSelection.rowStart + 1,
          }
        : null;
    const stageClassName = "relative min-h-0 workspace-stage overflow-hidden flex-1";
    const aboutPanelContent = <AboutPanelContent onOpenDonation={() => setIsDonationModalOpen(true)} />;
    const panelCategoriesWithAbout = [
        ...panelCategories,
        { id: "about", label: "关于", icon: <InfoIcon />, bare: true, content: aboutPanelContent },
    ];
    // 小地图/放大镜格径：随网格尺寸自适应，限制在 4~6
    const miniMapCellSize = gridDimensions
        ? Math.min(6, Math.max(4, 500 / Math.max(gridDimensions.N, gridDimensions.M)))
        : 6;

    return (
        <>
            <Suspense fallback={null}>
                <GalleryParamListener onParam={actions.setGalleryParam} />
            </Suspense>
            <style
                dangerouslySetInnerHTML={{
                    __html: `
  @keyframes float {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-5px); }
    100% { transform: translateY(0px); }
  }
  .animate-float { animation: float 3s ease-in-out infinite; }
`,
                }}
            />
            <InstallPrompt />
            <WorkbenchLayout
                topBar={
                    <BackToHomeButton
                        onGoHome={actions.handleGoHome}
                        onEnterStudio={actions.handleEnterStudioMode}
                        onEnterManual={actions.handleEnterManualMode}
                        onEnterRender={actions.handleEnterRenderMode}
                        onEnterFocus={actions.handleEnterFocusModeWithCheck}
                        isStudioMode={workspaceMode === "studio"}
                        isManualMode={isManualColoringMode}
                        isRenderMode={isRenderMode}
                        isFocusMode={isFocusMode}
                        canEnterEditModes={hasPixelData}
                        isMobileLayout={isCompactTopBar}
                        isWelcomeState={isWelcomeState}
                        isMounted={isMounted}
                        hasData={!!mappedPixelData && !!gridDimensions}
                        selectedColorSystemLabel={selectedColorSystemLabel}
                        selectedPaletteCount={selectedPaletteCount}
                        onOpenCustomPalette={() => setIsCustomPaletteEditorOpen(true)}
                        onUpload={fileHandling.triggerFileInput}
                        onOpenDownload={() => setIsDownloadSettingsOpen(true)}
                        onOpenShare={() => setIsShareModalOpen(true)}
                    />
                }
                footer={<AppFooter gridDimensions={gridDimensions} hidden={isCompactTopBar} />}
                mainPaddingLeft={isDeviceLayoutReady ? undefined : 0}
                mainPaddingTop={isCompactTopBar ? 0 : undefined}
                mainPaddingRight={mainPaddingRight}
                mainPaddingBottom={mainPaddingBottom}
                drawer={
                    !isDeviceLayoutReady || hideMobileSheet ? null : drawerSide === "right" ? (
                        <DesktopDrawer categories={panelCategories} fadeKey={workspaceMode} footer={aboutPanelContent} />
                    ) : (
                        <MobilePanelDock
                            categories={panelCategoriesWithAbout}
                            activeId={mobileActiveCategoryId}
                            onActiveIdChange={setMobileActiveCategoryId}
                            primaryAction={
                                mappedPixelData && gridDimensions
                                    ? {
                                          label: "下载",
                                          icon: <DownloadIcon />,
                                          onClick: () => {
                                              setMobileActiveCategoryId(null);
                                              setIsDownloadSettingsOpen(true);
                                          },
                                      }
                                    : undefined
                            }
                        />
                    )
                }
                main={
                    <main ref={mainRef} className="relative flex flex-col flex-1 min-h-0 min-w-0">
                        <input
                            type="file"
                            accept="image/jpeg,image/png,.csv,text/csv,application/csv"
                            onChange={fileHandling.handleFileChange}
                            ref={fileInputRef}
                            className="hidden"
                        />
                        {!isFocusMode && !isRenderMode && (
                            <div
                                className={stageClassName}
                                ref={stageRef}
                                onDrop={fileHandling.handleDrop}
                                onDragOver={fileHandling.handleDragOver}
                                onDragEnter={fileHandling.handleDragOver}
                            >
                                <canvas ref={originalCanvasRef} className="hidden" />
                                {isPlaceholderState ? (
                                    <WelcomeScreen
                                        isMounted={isMounted}
                                        onUpload={fileHandling.triggerFileInput}
                                        onCreateBlankCanvas={actions.createBlankCanvas}
                                        onOpenCustomPalette={() => setIsCustomPaletteEditorOpen(true)}
                                        selectedColorSystemLabel={selectedColorSystemLabel}
                                        selectedPaletteCount={selectedPaletteCount}
                                    />
                                ) : (
                                    <>
                                        <ZoomableCanvas
                                            mode="studio"
                                            canvasRef={pixelatedCanvasRef}
                                            canvasSize={displayCanvasSize}
                                            mappedPixelData={displayPixelData}
                                            gridDimensions={displayGridDimensions}
                                            isManualColoringMode={isManualColoringMode}
                                            onInteraction={isManualColoringMode ? undefined : colorMgmt.handleCanvasInteraction}
                                            onManualPointer={isManualColoringMode ? handleManualPointer : undefined}
                                            manualCursorClass={manualCursorClass}
                                            isPanModifierActive={isPanActive}
                                            referenceImageSrc={manualShowReference ? originalImageSrc : null}
                                            referenceOpacity={manualReferenceOpacity}
                                            selectionRect={isManualColoringMode ? manualSelection : null}
                                            selectionPreviewRect={isManualColoringMode ? activePreviewRect : null}
                                            previewCells={isManualColoringMode ? manualPreviewCells : null}
                                            viewScale={isManualColoringMode ? manualView.scale : undefined}
                                            viewOffset={isManualColoringMode ? manualView.offset : undefined}
                                            onViewChange={isManualColoringMode ? handleManualViewChange : undefined}
                                            minScale={0.3}
                                            maxScale={10}
                                            highlightColorKey={highlightColorKey}
                                            onHighlightComplete={actions.handleHighlightComplete}
                                        />
                                        {originalImageSrc && mappedPixelData && gridDimensions && gridDimensions.N > 100 && (
                                            <div className="absolute top-4 right-4 rounded-full bg-gray-900/70 text-gray-100 text-xs px-3 py-1.5 shadow-lg backdrop-blur">
                                                {gridDimensions.N}×{gridDimensions.M}
                                            </div>
                                        )}
                                    </>
                                )}
                                {isManualColoringMode && mappedPixelData && isDeviceLayoutReady && !isMobileLayout && (
                                    <PaintToolbar
                                        manualTool={manualTool}
                                        onToolSelect={actions.handleToolbarToolSelect}
                                        manualPasteActive={manualPasteActive}
                                        selectedColor={selectedColor}
                                        isEraseMode={isEraseMode}
                                        colorReplaceActive={colorReplaceState.isActive}
                                        onColorIndicatorClick={actions.handleColorIndicatorClick}
                                        showMiniMap={showMiniMap}
                                        onToggleMiniMap={() => setMiniMapVisibilityOverride(!showMiniMap)}
                                    />
                                )}
                                {isManualColoringMode && mappedPixelData && (
                                    <PasteOverlay
                                        visible={!!manualSelection || manualPasteActive}
                                        selectionInfo={selectionInfo}
                                        pasteActive={manualPasteActive}
                                        onCopy={handleManualCopy}
                                        onCut={handleManualCut}
                                        onDelete={handleManualDeleteSelection}
                                        onClear={handleManualClearSelection}
                                    />
                                )}
                                {isManualColoringMode && mappedPixelData && (
                                    <UndoRedoBar
                                        onUndo={applyManualUndo}
                                        onRedo={applyManualRedo}
                                        canUndo={canUndo}
                                        canRedo={canRedo}
                                    />
                                )}
                                {isManualColoringMode && showMiniMap && mappedPixelData && gridDimensions && pixelatedCanvasSize && (
                                    <MiniMap
                                        mappedPixelData={mappedPixelData}
                                        gridDimensions={gridDimensions}
                                        canvasSize={pixelatedCanvasSize}
                                        viewScale={manualView.scale}
                                        viewOffset={manualView.offset}
                                        stageSize={manualStageSize}
                                        onClose={() => setMiniMapVisibilityOverride(false)}
                                    />
                                )}
                                {isManualColoringMode && mappedPixelData && isDeviceLayoutReady && isMobileLayout && !showMiniMap && (
                                    <button
                                        type="button"
                                        onClick={() => setMiniMapVisibilityOverride(true)}
                                        aria-label="显示小地图"
                                        className="absolute left-3 top-3 z-10 w-11 h-11 flex items-center justify-center rounded-xl bg-gray-900/70 text-gray-100 shadow-lg backdrop-blur active:bg-gray-900/85"
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
                                            <path d="M3 7l6-4 6 4 6-4v14l-6 4-6-4-6 4V7z" />
                                            <line x1="9" y1="3" x2="9" y2="17" />
                                            <line x1="15" y1="7" x2="15" y2="21" />
                                        </svg>
                                    </button>
                                )}
                                {mappedPixelData && gridDimensions && (
                                    <CropKeepModal
                                        isActive={isCanvasCropActive}
                                        canvasRef={pixelatedCanvasRef}
                                        gridDimensions={gridDimensions}
                                        onConfirm={actions.handleConfirmCanvasCrop}
                                        onCancel={() => setIsCanvasCropActive(false)}
                                    />
                                )}
                            </div>
                        )}
                        {isRenderMode && (
                            <div className={stageClassName}>
                                <LazyPreviewEngine
                                    ref={renderCanvasRef}
                                    mappedPixelData={mappedPixelData}
                                    gridDimensions={gridDimensions}
                                    config={renderConfig}
                                />
                            </div>
                        )}
                        {isFocusMode && (
                            <div className={stageClassName}>
                                {mappedPixelData && gridDimensions ? (
                                    <>
                                        <ZoomableCanvas
                                            mode="focus"
                                            canvasRef={pixelatedCanvasRef}
                                            canvasSize={pixelatedCanvasSize}
                                            mappedPixelData={mappedPixelData}
                                            gridDimensions={gridDimensions}
                                            currentColor={focusState.currentColor}
                                            completedCells={focusState.completedCells}
                                            recommendedRegion={focusState.recommendedRegion}
                                            gridSectionInterval={focusState.gridSectionInterval}
                                            showSectionLines={focusState.showSectionLines}
                                            sectionLineColor={focusState.sectionLineColor}
                                            viewScale={focusState.canvasScale}
                                            viewOffset={focusState.canvasOffset}
                                            maxScale={8}
                                            onViewChange={(scale: number, offset: any) =>
                                                setFocusState((prev: any) => ({
                                                    ...prev,
                                                    canvasScale: scale,
                                                    canvasOffset: offset,
                                                }))
                                            }
                                            onCellClick={handleFocusCellClick}
                                            referenceImageSrc={manualShowReference ? originalImageSrc : null}
                                            referenceOpacity={manualReferenceOpacity}
                                        />
                                        <FocusSidePanel
                                            focusState={focusState}
                                            focusColors={focusColors}
                                            currentColorInfo={currentColorInfo}
                                            progressPercentage={progressPercentage}
                                            onLocateRecommended={handleFocusLocateRecommended}
                                            onMarkRecommended={handleFocusMarkRecommended}
                                            onPauseToggle={handleFocusPauseToggle}
                                            onColorSelect={handleFocusColorChange}
                                            formatTime={formatFocusTime}
                                        />
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="rounded-2xl bg-white/85 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/70 px-5 py-4 text-sm text-slate-600 dark:text-slate-200 shadow-xl">
                                            请先在自动优化生成底稿，然后进入专心拼豆模式。
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {!isFocusMode && !isRenderMode && tooltipData && (
                            <ColorTooltip tooltipData={tooltipData} selectedColorSystem={selectedColorSystem} />
                        )}
                    </main>
                }
            />
            <ModalShell
                isOpen={isCustomPaletteEditorOpen}
                onClose={() => setIsCustomPaletteEditorOpen(false)}
                maxWidth="max-w-4xl"
            >
                <input
                    type="file"
                    accept=".xlsx,.xls"
                    ref={paletteXlsxInputRef}
                    onChange={handlePaletteXlsxFileChange}
                    className="hidden"
                />
                <div className="p-4 sm:p-6">
                    <CustomPaletteModal
                        allColors={ALL_COLORS}
                        currentSelections={customPaletteSelections}
                        onSelectionChange={paletteMgmt.handleSelectionChange}
                        onSaveCustomPalette={paletteMgmt.handleSaveCustomPalette}
                        onClose={() => setIsCustomPaletteEditorOpen(false)}
                        onExportXlsx={handleExportPaletteXlsx}
                        onImportXlsx={handleImportPaletteXlsx}
                        colorSystemOptions={COLOR_SYSTEMS}
                        onColorSystemChange={setSelectedColorSystem}
                        selectedColorSystem={selectedColorSystem}
                        inventory={beadInventory.inventory}
                        onUpdateInventory={beadInventory.updateColor}
                    />
                </div>
            </ModalShell>
            {gridDimensions && (
                <CanvasSizeModal
                    isOpen={isCanvasSizeModalOpen}
                    onClose={() => setIsCanvasSizeModalOpen(false)}
                    currentWidth={gridDimensions.N}
                    currentHeight={gridDimensions.M}
                    onApply={actions.applyCanvasResize}
                    onStartCropSelection={actions.handleStartCanvasCropSelection}
                />
            )}
            <DonationModal isOpen={isDonationModalOpen} onClose={() => setIsDonationModalOpen(false)} />
            <InventoryCheckModal
                isOpen={isInventoryCheckOpen}
                checkResult={inventoryCheckResult}
                onConfirm={actions.handleInventoryCheckConfirm}
                onSkip={actions.handleInventoryCheckSkip}
                onCancel={() => setIsInventoryCheckOpen(false)}
            />
            <DownloadSettingsModal
                isOpen={isDownloadSettingsOpen}
                onClose={() => setIsDownloadSettingsOpen(false)}
                options={downloadOptions}
                onOptionsChange={handleDownloadOptionsChange}
                onDownload={handleDownloadRequest}
                onExportCsv={handleExportCsv}
            />
            {isShareModalOpen && mappedPixelData && gridDimensions && (
                <GallerySubmitModal
                    pixelData={mappedPixelData}
                    gridDimensions={gridDimensions}
                    onClose={() => setIsShareModalOpen(false)}
                    onShareSuccess={(code: string) => setDownloadOptions((prev: any) => ({ ...prev, shareCode: code }))}
                />
            )}
            {isFocusMode && (
                <>
                    <ColorCelebration
                        isVisible={focusState.showCelebration}
                        onComplete={handleFocusCelebrationComplete}
                        colorHex={focusState.currentColor}
                        colorName={currentColorInfo?.name}
                        colorsCompleted={focusColors.filter((c: any) => c.completed >= c.total && c.total > 0).length}
                        colorsTotal={focusColors.length}
                    />
                    {mappedPixelData && gridDimensions && (
                        <CompletionCard
                            isVisible={focusState.showCompletionCard}
                            mappedPixelData={mappedPixelData}
                            gridDimensions={gridDimensions}
                            totalElapsedTime={focusState.totalElapsedTime}
                            onClose={handleFocusCompletionCardClose}
                        />
                    )}
                </>
            )}
            {isManualColoringMode && (
                <>
                    <MagnifierPanel
                        isActive={isMagnifierActive}
                        onToggle={actions.handleToggleMagnifier}
                        mappedPixelData={mappedPixelData}
                        gridDimensions={gridDimensions}
                        selectedColor={selectedColor}
                        selectedColorSystem={selectedColorSystem}
                        onPixelEdit={actions.handleMagnifierPixelEdit}
                        cellSize={miniMapCellSize}
                        selectionArea={magnifierSelectionArea}
                        onClearSelection={() => setMagnifierSelectionArea(null)}
                        isFloatingActive={activeFloatingTool === "magnifier"}
                        onActivateFloating={actions.handleActivateMagnifier}
                        highlightColorKey={highlightColorKey}
                    />
                    <MagnifierSelection
                        isActive={isMagnifierActive && !magnifierSelectionArea}
                        canvasRef={pixelatedCanvasRef}
                        gridDimensions={gridDimensions}
                        cellSize={miniMapCellSize}
                        onSelectionComplete={setMagnifierSelectionArea}
                    />
                </>
            )}
            {isImageEditVisible && rawImageForEdit && (
                <ImageAlignModal
                    imageSrc={rawImageForEdit}
                    onConfirm={fileHandling.handleImageEditConfirm}
                    onCancel={fileHandling.handleImageEditCancel}
                    enableGridAlign
                />
            )}
        </>
    );
}
