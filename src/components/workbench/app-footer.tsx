
// TODO(类型): GridDimensions 与其他组件共享，集成阶段统一到 src/types/
interface GridDimensions {
  N: number;
  M: number;
}

interface AppFooterProps {
  gridDimensions?: GridDimensions | null;
  hidden?: boolean;
}

/** 页脚：品牌版权 + 当前网格尺寸 */
export function AppFooter({ gridDimensions, hidden = false }: AppFooterProps) {
  return hidden ? null : (
    <footer className="w-full">
      <div className="mx-auto w-full max-w-screen-2xl px-5 py-2 flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
        <span>豆你玩 拼豆底稿生成器 2.0 © {new Date().getFullYear()}</span>
        {gridDimensions && (
          <span className="hidden sm:inline">
            网格 {gridDimensions.N}x{gridDimensions.M}
          </span>
        )}
      </div>
    </footer>
  );
}

export default AppFooter;
