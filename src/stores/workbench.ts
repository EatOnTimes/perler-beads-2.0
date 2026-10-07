// 工作台状态 store 归口
// 实际实现由代理 F 落于 @/components/workbench/stats-panel（useDocumentStore，persist 名 perler-document），
// 此处提供集成契约中约定的规范名。
export {
  useDocumentStore as useWorkbenchStore,
  useComposite as useStoredPixelData,
  useGridDimensions as useStoredGridDimensions,
} from "@/components/workbench/stats-panel";
export type { DocumentStore, DesignDocument, GridSize } from "@/components/workbench/stats-panel";
