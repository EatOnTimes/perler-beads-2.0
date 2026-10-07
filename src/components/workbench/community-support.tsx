
import type { ReactNode } from "react";
import { useConfirm } from "@/components/providers";

// --- 源 10-Y.js 尾部：V（确认弹窗配置）与 K（confirmSwitchToOpenSource） ---

const OPEN_SOURCE_SWITCH_CONFIRM = {
    title: "切换到开源版？",
    message: "开源版与本版数据不互通 — 切换后本设备上的作品和设置不会跟随。建议先在本版下载图纸或导出 CSV 保存。",
    confirmLabel: "继续切换",
    cancelLabel: "取消",
};

async function confirmSwitchToOpenSource(confirm: (config: typeof OPEN_SOURCE_SWITCH_CONFIRM) => Promise<boolean>) {
    const ok = await confirm(OPEN_SOURCE_SWITCH_CONFIRM);
    if (ok) window.open("https://perlerbeadsold.zippland.com", "_blank", "noopener,noreferrer");
    return ok;
}

// --- 17-ee.js：社区与支持 ---

interface CommunitySupportModalProps {
    onOpenDonation?: () => void; // 集成放宽：bits 的 PrivacyAndSupportModals（区域15 Z）允许不传
}

export function CommunitySupportModal({ onOpenDonation }: CommunitySupportModalProps) {
    const confirm = useConfirm();
    return (
        <div className="rounded-xl border border-gray-200/60 dark:border-gray-800/50 bg-gray-50/95 dark:bg-gray-900/80 p-4 shadow-sm shadow-gray-200/50 flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">社区与支持</h3>
            <button
                onClick={onOpenDonation}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-lg shadow-md transition-all duration-300 hover:shadow-lg active:shadow-lg"
            >
                请作者喝一杯奶茶
            </button>
            <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                发布平台请标注来源或保留图片水印及标识。
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <a
                    href="https://www.xiaohongshu.com/user/profile/623e8b080000000010007721"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-500 hover:text-brand-600 active:text-brand-600 hover:underline font-medium"
                >
                    小红书
                </a>
                <span>·</span>
                <a
                    href="https://github.com/Zippland/perler-beads"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-500 hover:text-brand-600 active:text-brand-600 hover:underline font-medium"
                >
                    GitHub
                </a>
                <span>·</span>
                <button
                    onClick={() => {
                        confirmSwitchToOpenSource(confirm);
                    }}
                    className="text-gray-600 dark:text-gray-300 hover:text-gray-700 active:text-gray-700 dark:hover:text-gray-200 dark:active:text-gray-200 hover:underline font-medium"
                >
                    开源版
                </button>
            </div>
        </div>
    );
}

// --- 17-ee.js 尾部（et/er/ea/el）：共享设置控件 ---
// 注意：这些控件被多个设置面板共用，集成时可考虑迁移至 bits.tsx

interface ToggleSwitchProps {
    checked: boolean;
    disabled?: boolean;
}

/** 开关本体（et） */
export function ToggleSwitch({ checked, disabled }: ToggleSwitchProps) {
    return (
        <span
            className={`relative inline-block w-11 h-[26px] rounded-full transition-colors flex-shrink-0 ${
                checked ? "bg-accent-green" : "bg-gray-300 dark:bg-gray-600"
            } ${disabled ? "opacity-40" : ""}`}
        >
            <span
                className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    checked ? "translate-x-[22px]" : "translate-x-[3px]"
                }`}
            />
        </span>
    );
}

interface ToggleRowProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: ReactNode;
    disabled?: boolean;
    className?: string;
}

/** 带标签的开关行（er） */
export function ToggleRow({ checked, onChange, label, disabled, className = "" }: ToggleRowProps) {
    return label ? (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(!checked)}
            aria-pressed={checked}
            className={`w-full flex items-center justify-between gap-3 min-h-[44px] text-left ${className}`}
        >
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
            <ToggleSwitch checked={checked} disabled={disabled} />
        </button>
    ) : (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(!checked)}
            aria-pressed={checked}
            className={`flex items-center justify-center min-h-[44px] ${className}`}
        >
            <ToggleSwitch checked={checked} disabled={disabled} />
        </button>
    );
}

interface SliderRowProps {
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    label?: ReactNode;
    format?: (value: number) => ReactNode;
    accent?: "brand" | "green";
    className?: string;
}

/** 滑杆行（ea） */
export function SliderRow({
    value,
    onChange,
    min,
    max,
    step = 1,
    label,
    format,
    accent = "brand",
    className = "",
}: SliderRowProps) {
    return (
        <div className={`flex items-center gap-3 min-h-[44px] ${className}`}>
            {label && <span className="text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">{label}</span>}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className={`h-11 flex-1 cursor-pointer rounded-full bg-transparent ${
                    accent === "green" ? "accent-accent-green" : "accent-brand-500"
                }`}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums text-right min-w-[2.5rem]">
                {format ? format(value) : value}
            </span>
        </div>
    );
}

interface SegmentedOption {
    value: string;
    label: ReactNode;
}

interface SegmentedControlProps {
    value: string;
    onChange: (value: string) => void;
    options: SegmentedOption[];
    columns?: number;
    className?: string;
}

/** 分段选择器（el） */
export function SegmentedControl({ value, onChange, options, columns, className = "" }: SegmentedControlProps) {
    const isGrid = typeof columns === "number";
    return (
        <div
            className={`gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl ${isGrid ? "grid" : "flex"} ${className}`}
            style={isGrid ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
        >
            {options.map((option) => {
                const isActive = value === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={`${isGrid ? "" : "flex-1"} min-h-[44px] py-2 px-1 text-[13px] rounded-[10px] transition-all ${
                            isActive
                                ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100 font-medium"
                                : "text-gray-500 dark:text-gray-400 active:bg-gray-200/50 dark:active:bg-gray-700/50"
                        }`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
