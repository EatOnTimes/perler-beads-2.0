
/** 留言板静态文案 */
const MESSAGE_ITEMS = [
  "hello 大家，好久没更新了！",
  "欢迎体验新版拼豆工作台！",
  "以后会在这个基础上持续更新新功能。",
  "有什么想要的功能可以直接小红书找我提～",
  "玩得开心！",
];

export function MessageBoard() {
  return (
    <div className="flex items-start gap-3">
      <div className="h-10 w-10 rounded-full bg-gray-50/80 dark:bg-gray-800/80 border border-gray-200/60 dark:border-gray-800/50 flex items-center justify-center shadow-sm shadow-gray-200/50 flex-shrink-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-brand-500"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M9.049 2.927a1 1 0 011.902 0l1.08 3.318a1 1 0 00.95.69h3.487a1 1 0 01.592 1.806l-2.822 2.05a1 1 0 00-.364 1.118l1.08 3.318a1 1 0 01-1.538 1.118l-2.822-2.05a1 1 0 00-1.175 0l-2.822 2.05a1 1 0 01-1.538-1.118l1.08-3.318a1 1 0 00-.364-1.118L2.94 8.74a1 1 0 01.592-1.806h3.487a1 1 0 00.95-.69l1.08-3.318z" />
        </svg>
      </div>
      <div className="space-y-1">
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">留言板</div>
        {MESSAGE_ITEMS.map((text) => (
          <p key={text} className="text-xs text-gray-500 dark:text-gray-400">
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}
