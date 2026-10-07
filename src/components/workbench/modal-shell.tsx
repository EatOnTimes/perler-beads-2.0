
import { useEffect, useState, type ReactNode } from "react";

interface ViewportRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface ModalShellProps {
    isOpen: boolean;
    onClose: () => void;
    /** * * 原模块 5048 不消费该属性，此处同样收下不渲染 */
    title?: string;
    maxWidth?: string;
    closeOnBackdrop?: boolean;
    panelClassName?: string;
    contentClassName?: string;
    children?: ReactNode;
}

/** 通用弹窗外壳：遮罩 + 玻璃卡片 + Escape 关闭 + visualViewport 适配 */
export function ModalShell({
    isOpen,
    onClose,
    maxWidth = "max-w-md",
    closeOnBackdrop = true,
    panelClassName = "",
    contentClassName = "flex-1 min-h-0 overflow-y-auto",
    children,
}: ModalShellProps) {
    const [viewportRect, setViewportRect] = useState<ViewportRect | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const vp = window.visualViewport;
        if (!vp) return;
        const update = () => {
            setViewportRect({ top: vp.offsetTop, left: vp.offsetLeft, width: vp.width, height: vp.height });
        };
        update();
        vp.addEventListener("resize", update);
        vp.addEventListener("scroll", update);
        return () => {
            vp.removeEventListener("resize", update);
            vp.removeEventListener("scroll", update);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-modal-backdrop"
            style={{
                ...(viewportRect
                    ? {
                          top: viewportRect.top,
                          left: viewportRect.left,
                          right: "auto",
                          bottom: "auto",
                          width: viewportRect.width,
                          height: viewportRect.height,
                      }
                    : {}),
                paddingTop: "max(1rem, env(safe-area-inset-top, 0px))",
                paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
            }}
        >
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={closeOnBackdrop ? onClose : undefined}
            />
            <div
                className={`relative glass-light rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] overflow-hidden flex flex-col animate-modal-card ${panelClassName}`}
                style={{ maxHeight: viewportRect ? "min(90dvh, 100%)" : "90dvh" }}
            >
                <div className={contentClassName}>{children}</div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// 移动端底部面板坞（源 14-$.js，契约表中该区域记作 ModalShell，语义实为底部面板坞）
// ---------------------------------------------------------------------------

export interface PanelDockCategory {
    id: string;
    label: string;
    icon?: ReactNode;
    content?: ReactNode;
    quickControls?: ReactNode;
    bare?: boolean;
}

interface PanelDockPrimaryAction {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
}

interface MobilePanelDockProps {
    categories: PanelDockCategory[];
    activeId: string | null;
    onActiveIdChange: (id: string | null) => void;
    primaryAction?: PanelDockPrimaryAction;
}

/** 移动端底部：面板标签坞 + 当前激活类别的上拉面板（含"关闭"按钮） */
export function MobilePanelDock({ categories, activeId, onActiveIdChange, primaryAction }: MobilePanelDockProps) {
    const activeCategory = categories.find((c) => c.id === activeId) ?? null;
    return (
        <div
            className="absolute left-2 right-2 z-30 flex flex-col gap-2"
            style={{
                left: "max(0.5rem, env(safe-area-inset-left, 0px))",
                right: "max(0.5rem, env(safe-area-inset-right, 0px))",
                bottom: "env(safe-area-inset-bottom, 0px)",
            }}
        >
            {activeCategory && (
                <div
                    className="flex max-h-[55vh] flex-col bg-white/60 dark:bg-gray-900/55 backdrop-blur-2xl backdrop-saturate-[1.8] border border-white/50 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                    style={{ maxHeight: "55dvh" }}
                >
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/40 dark:border-white/10 flex-shrink-0">
                        <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                            {activeCategory.label}
                        </span>
                        <button
                            type="button"
                            onClick={() => onActiveIdChange(null)}
                            aria-label="关闭"
                            className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 active:bg-white/50 dark:active:bg-white/10 transition-colors"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    {activeCategory.quickControls && (
                        <div className="px-4 pt-2 flex items-center gap-2 flex-shrink-0">{activeCategory.quickControls}</div>
                    )}
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-4">
                        <div key={activeCategory.id} className="animate-mode-fade">
                            {activeCategory.content}
                        </div>
                    </div>
                </div>
            )}
            <div
                style={{ height: 64 }}
                className="flex items-stretch rounded-2xl overflow-hidden bg-white/60 dark:bg-gray-950/60 backdrop-blur-2xl backdrop-saturate-[1.8] border border-white/50 dark:border-white/10 shadow-2xl"
            >
                {categories.map((category) => {
                    const isActive = category.id === activeId;
                    return (
                        <button
                            key={category.id}
                            type="button"
                            onClick={() => onActiveIdChange(isActive ? null : category.id)}
                            aria-pressed={isActive}
                            className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors ${
                                isActive
                                    ? "text-brand-500"
                                    : "text-gray-500 dark:text-gray-400 active:bg-white/50 dark:active:bg-white/10"
                            }`}
                        >
                            {category.icon && (
                                <span className="w-5 h-5 flex items-center justify-center">{category.icon}</span>
                            )}
                            <span className="text-[11px] font-medium leading-none">{category.label}</span>
                        </button>
                    );
                })}
                {primaryAction && (
                    <button
                        type="button"
                        onClick={primaryAction.onClick}
                        aria-label={primaryAction.label}
                        className="m-1.5 ml-0 min-h-[44px] min-w-[68px] flex-shrink-0 rounded-xl bg-brand-500 px-3 text-white active:bg-brand-600 transition-colors flex flex-col items-center justify-center gap-0.5"
                    >
                        {primaryAction.icon && (
                            <span className="w-5 h-5 flex items-center justify-center">{primaryAction.icon}</span>
                        )}
                        <span className="text-[11px] font-semibold leading-none">{primaryAction.label}</span>
                    </button>
                )}
            </div>
        </div>
    );
}
