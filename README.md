<div align="center">

# 豆你玩拼豆底稿生成器 2.0

### 任意图片 → 拼豆底稿，一键生成

</div>

---

## ⚠️ 衍生作品声明（必读）

本项目是 **[Zippland/perler-beads](https://github.com/Zippland/perler-beads)**（AGPL-3.0）线上 2.0 版本的衍生作品，依据 AGPL-3.0 以**相同协议**开源。

- 上游项目：https://github.com/Zippland/perler-beads （© Zippland 及贡献者，AGPL-3.0）
- 本项目对其代码进行了修改与重建，主要修改见下方清单
- 本项目同样采用 [AGPL-3.0](./LICENSE) 协议：衍生作品必须保持本协议开源，且需保留上游版权声明

### 相对上游版本的修改

- 品牌更名为「豆你玩」（原「七卡瓦」），更新页面标题 / 欢迎屏 / 页脚 / 导出图纸品牌栏 / PWA 清单
- 移除「社区与支持」卡片及隐私声明中的部分段落
- 修复还原过程中的若干缺陷（流式 PNG 编码器 zlib 包装、画廊接口桩、深色模式玻璃样式等）
- 画廊后端接口为**本地行为桩**（`/api/gallery/*`，进程内存存储），线上原版为服务端实现

## 功能

- **智能像素化** — 主色提取 / 均值双模式，格子对齐切割
- **多色板适配** — MARD / COCO / 漫漫 / 盼盼 / 咪小窝 五品牌色号，291 色
- **完整编辑器** — 图层系统、画笔/形状/选区、撤销重做、放大镜、专注拼豆模式
- **导出** — 带色号标注图纸 PNG（超大图流式编码）、CSV、色板 ExcelJS 配置
- **社区画廊** — 作品分享码（AES-GCM 加密私密分享）、画廊列表、一键导入

## 快速开始

```bash
npm install
npm run dev        # 开发：http://localhost:3000
npm run build && npm start   # 生产
```

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 15 (App Router) + React 19 + TypeScript |
| 样式 | Tailwind CSS v4 |
| 状态 | zustand（persist / IndexedDB） |
| 图像 | Canvas API（浏览器端本地处理，无上传） |
| 导出依赖 | exceljs / fflate / qrcode |

## 目录结构

```
src/
  app/            # 路由：主页工作台 / gallery / pwa-debug / API 桩
  components/
    workbench/    # 工作台组件（30+）
    providers.tsx # Toast / Confirm / SW 注册
  utils/          # 算法层：像素化 / 色板系统 / 分享码加密 / 导出
  stores/         # zustand store
```

## 许可证

[AGPL-3.0](./LICENSE) © 原作者 Zippland 及贡献者；本仓库修改部分同样适用 AGPL-3.0。
