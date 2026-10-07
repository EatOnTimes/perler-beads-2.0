
export function PrivacyNoticeModal() {
    return (
        <div className="rounded-xl border border-emerald-200/60 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 shadow-sm flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
                <svg
                    className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                </svg>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    素材隐私声明
                </h3>
            </div>
            <div className="space-y-2 text-xs leading-[1.8] text-gray-600 dark:text-gray-300">
                <p>
                    你的所有素材
                    <strong className="text-emerald-700 dark:text-emerald-400">
                        只在你的设备上处理
                    </strong>
                    ，不会上传云端。
                </p>
                <p>“让像素创意属于每一个人”</p>
            </div>
        </div>
    );
}
