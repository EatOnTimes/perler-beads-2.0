
import { useState } from "react";
import { ModalShell } from "./modal-shell";
// TODO(集成): 以下导出名对应模块 4240 的 bk/SA/UT/L1/m2，集成时以 utils/image-ops.ts 实际导出名为准
import {
    generateUnlockPassword, // 4240.bk：生成 6 位解锁密码
    buildPublicSharePayload, // 4240.SA：公开分享数据体
    buildPrivateSharePayload, // 4240.UT：私密分享数据体（含密码与联系方式）
    serializeGalleryBody, // 4240.L1：序列化为画廊提交正文（markdown + json 代码块）
    buildShareCode, // 4240.m2：完整分享码（密码 + base36(id)）
} from "@/utils/image-ops";

interface GridDimensions {
    N: number;
    M: number; // 高（格数）
}

interface ShareSuccessResult {
    id: string;
    code: string;
    password: string | null;
}

interface GallerySubmitModalProps {
    pixelData: any; // TODO(类型): 映射后的像素数据（源 eD.t）
    gridDimensions: GridDimensions;
    onClose: () => void;
    onShareSuccess?: (shareCode: string) => void;
}

type ShareMode = "public" | "private";

export function GallerySubmitModal({ pixelData, gridDimensions, onClose, onShareSuccess }: GallerySubmitModalProps) {
    const [title, setTitle] = useState("");
    const [mode, setMode] = useState<ShareMode>("public");
    const [contact, setContact] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<ShareSuccessResult | null>(null);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    const handleSubmit = async () => {
        const trimmedTitle = title.trim();
        if (!trimmedTitle) return;
        if (trimmedTitle.length > 30) {
            setError("作品名称不能超过 30 个字符");
            return;
        }
        if (mode === "private" && contact.trim().length > 100) {
            setError("联系方式不能超过 100 个字符");
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            let password: string | null = null;
            const payload =
                mode === "private"
                    ? await (async () => {
                          password = generateUnlockPassword();
                          return buildPrivateSharePayload(pixelData, trimmedTitle, password, contact.trim() || undefined);
                      })()
                    : buildPublicSharePayload(pixelData, trimmedTitle);
            const body = serializeGalleryBody(payload);
            const submitTitle = `${trimmedTitle} - ${gridDimensions.N}x${gridDimensions.M}`;
            const res = await fetch("/api/gallery/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: submitTitle, body }),
            });
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error((errJson as { error?: string }).error || "提交失败");
            }
            const data = await res.json();
            const code = buildShareCode(data.id, password);
            setResult({ id: data.id, code, password });
            onShareSuccess?.(code);
        } catch (err) {
            setError(err instanceof Error ? err.message : "提交失败，请稍后重试");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalShell isOpen onClose={onClose} maxWidth="max-w-sm">
            <div className="p-5 space-y-4">
                <div>
                    <div className="text-base font-semibold text-gray-800 dark:text-gray-100">分享到画廊</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        {gridDimensions.N}x{gridDimensions.M} · 将你的作品分享给社区
                    </div>
                </div>

                {result ? (
                    <div className="text-center py-4 space-y-3">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">分享成功！</div>
                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                            <div className="text-[10px] text-gray-600 dark:text-gray-300 mb-1">分享码</div>
                            <div className="text-2xl font-bold tracking-[0.2em] text-brand-500 font-mono break-all">
                                {result.code}
                            </div>
                            {result.password ? (
                                <div className="mt-2 pl-2 border-l-2 border-brand-500 text-[10px] text-gray-950/70 dark:text-gray-300 text-left leading-relaxed">
                                    此为私密作品。完整分享码包含解锁密码，
                                    <b>一旦丢失无法找回</b>，请立即保存。
                                </div>
                            ) : (
                                <div className="text-[10px] text-gray-600 dark:text-gray-300 mt-1">
                                    告诉朋友这个分享码，即可导入你的作品
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 justify-center">
                            <button
                                onClick={() => {
                                    if (!result) return;
                                    navigator.clipboard
                                        ?.writeText(result.code)
                                        .then(() => {
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        });
                                }}
                                className="min-h-[44px] px-4 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 active:bg-gray-100 transition-colors"
                            >
                                {copied ? "已复制" : "复制分享码"}
                            </button>
                            <a
                                href="/gallery"
                                className="flex min-h-[44px] items-center px-4 py-2 text-xs rounded-lg bg-brand-500 text-white active:bg-brand-600 transition-colors"
                            >
                                去画廊看看
                            </a>
                        </div>
                    </div>
                ) : (
                    <>
                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">作品名称</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="如：皮卡丘、樱花树、我的第一个作品"
                                maxLength={30}
                                className="min-h-[44px] w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-brand-500 transition-colors"
                                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">分享模式</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMode("public")}
                                    className={`min-h-[44px] px-3 py-2.5 text-xs rounded-lg border transition-colors ${
                                        mode === "public"
                                            ? "border-brand-500 bg-brand-500/10 text-brand-500"
                                            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 active:bg-gray-50 dark:active:bg-gray-800"
                                    }`}
                                >
                                    公开分享
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode("private")}
                                    className={`min-h-[44px] px-3 py-2.5 text-xs rounded-lg border transition-colors ${
                                        mode === "private"
                                            ? "border-brand-500 bg-brand-500/10 text-brand-500"
                                            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 active:bg-gray-50 dark:active:bg-gray-800"
                                    }`}
                                >
                                    私密分享
                                </button>
                            </div>
                            <div className="text-[10px] text-gray-600 dark:text-gray-300 mt-1.5 leading-relaxed">
                                {mode === "public"
                                    ? "任何人都能从画廊一键导入到画布"
                                    : "作品可在画廊展示，但导入需要你提供的密码"}
                            </div>
                        </div>
                        {mode === "private" && (
                            <div>
                                <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                                    联系方式 <span className="text-gray-500 dark:text-gray-400">（可选）</span>
                                </label>
                                <input
                                    type="text"
                                    value={contact}
                                    onChange={(e) => setContact(e.target.value)}
                                    placeholder="如：微信号、小红书 ID、闲鱼链接"
                                    maxLength={100}
                                    className="min-h-[44px] w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-brand-500 transition-colors"
                                />
                                <div className="text-[10px] text-gray-600 dark:text-gray-300 mt-1">
                                    画廊详情页会展示，方便买家联系你
                                </div>
                            </div>
                        )}
                        {error && (
                            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                                {error}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                className="min-h-[44px] flex-1 px-4 py-2.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 active:bg-gray-100 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!title.trim() || submitting}
                                className="min-h-[44px] flex-1 px-4 py-2.5 text-xs rounded-lg bg-brand-500 text-white active:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? (mode === "private" ? "加密中..." : "提交中...") : "分享"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </ModalShell>
    );
}
