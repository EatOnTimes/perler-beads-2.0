import { useCallback, useRef } from "react";

type PossiblyFunctionRef<T> = (instance: T | null) => void | (() => void);
type MutableLikeRef<T> = { current: T | null };

/** 把节点赋给 ref（对象式或回调式），返回卸载清理函数 */
function attachRef<T>(
  ref: PossiblyFunctionRef<T> | MutableLikeRef<T>,
  node: T,
): () => void {
  if ("function" != typeof ref) {
    (ref as MutableLikeRef<T>).current = node;
    return () => {
      (ref as MutableLikeRef<T>).current = null;
    };
  } else {
    const cleanup = (ref as PossiblyFunctionRef<T>)(node);
    return "function" == typeof cleanup ? cleanup : () => (ref as (val: T | null) => void)(null);
  }
}

/**
 * 合并两个 ref（对象式或回调式）为一个回调 ref。
 * 节点挂载时同时写入/调用两个 ref；卸载（null）时依次执行各自的清理函数。
  * 原始实现来自 Next.js 客户端 chunk。
 */
export function useMergedRef<T>(
  refA?: PossiblyFunctionRef<T> | MutableLikeRef<T> | null,
  refB?: PossiblyFunctionRef<T> | MutableLikeRef<T> | null,
): (node: T | null) => void {
  const cleanupA = useRef<(() => void) | null>(null);
  const cleanupB = useRef<(() => void) | null>(null);
  return useCallback(
    (node) => {
      if (null === node) {
        const a = cleanupA.current;
        if (a) {
          cleanupA.current = null;
          a();
        }
        const b = cleanupB.current;
        if (b) {
          cleanupB.current = null;
          b();
        }
      } else {
        if (refA) cleanupA.current = attachRef(refA, node);
        if (refB) cleanupB.current = attachRef(refB, node);
      }
    },
    [refA, refB],
  );
}
