"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { logger } from "@/lib/logger";

/* ======================= Toast（m966） ======================= */

type ToastVariant = "info" | "success" | "warn" | "error";

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
  duration: number;
}

export interface ToastApi {
  info: (message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  warn: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw Error("useToast must be used within <ToastProvider>");
  return api;
}

const DEFAULT_TOAST_DURATION: Record<ToastVariant, number> = {
  info: 3500,
  success: 3000,
  warn: 4500,
  error: 5500,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, duration?: number) => {
      nextIdRef.current += 1;
      const id = nextIdRef.current;
      const resolvedDuration = duration ?? DEFAULT_TOAST_DURATION[variant];
      // 最多同时保留 4 条（slice(-3) + 新增 1 条）
      setToasts((current) => [
        ...current.slice(-3),
        { id, variant, message, duration: resolvedDuration },
      ]);
      const timer = setTimeout(() => dismiss(id), resolvedDuration);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      info: (message, duration) => push("info", message, duration),
      success: (message, duration) => push("success", message, duration),
      warn: (message, duration) => push("warn", message, duration),
      error: (message, duration) => push("error", message, duration),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="通知"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-auto sm:right-4 sm:top-4 sm:left-auto sm:items-end"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

const TOAST_VARIANT_CLASS: Record<ToastVariant, string> = {
  info: "bg-gray-900 dark:bg-gray-100 text-gray-50 dark:text-gray-900",
  success: "bg-emerald-600 text-emerald-50",
  warn: "bg-amber-500 text-amber-50",
  error: "bg-red-600 text-red-50",
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      onClick={onDismiss}
      className={`pointer-events-auto min-h-[44px] max-w-sm w-full sm:w-auto px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium leading-relaxed cursor-pointer active:scale-[0.98] transition-transform ${TOAST_VARIANT_CLASS[toast.variant]}`}
    >
      {toast.message}
    </div>
  );
}

/* ======================= 确认弹窗（m2747） ======================= */

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw Error("useConfirm must be used within <ConfirmProvider>");
  return confirm;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      if (typeof document !== "undefined") {
        previousFocusRef.current = document.activeElement;
      }
      setPending({ options, resolve });
    });
  }, []);

  const settle = useCallback(
    (confirmed: boolean) => {
      if (!pending) return;
      pending.resolve(confirmed);
      setPending(null);
      const previous = previousFocusRef.current;
      if (
        previous &&
        typeof (previous as HTMLElement).focus === "function"
      ) {
        (previous as HTMLElement).focus();
      }
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(false);
      else if (event.key === "Enter") settle(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pending, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          options={pending.options}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const {
    title,
    message,
    confirmLabel = "确认",
    cancelLabel = "取消",
    danger = false,
  } = options;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl glass-light shadow-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        {title && (
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-2">
            {title}
          </h3>
        )}
        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-line">
          {message}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus={true}
            onClick={onConfirm}
            className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors ${
              danger
                ? "bg-red-600 active:bg-red-700"
                : "bg-brand-500 active:bg-brand-600"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Service Worker 注册（m2666） ======================= */

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      } catch (error) {
        logger.warn("Service Worker 注册失败", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };
    const timer = window.setTimeout(register, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}

/* ======================= Providers（m2666 default） ======================= */

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        {children}
        <ServiceWorkerRegister />
      </ConfirmProvider>
    </ToastProvider>
  );
}
