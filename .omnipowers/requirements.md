# Requirements

## Standing
- R1 — 「当前项目是帮助我们在 iCondo 中来做球场的预定」 (stated 2026-09-29)
- R2 — 「所有的 panel 的 UI 界面，你需要使用 vite+vue 的技术栈，需要使用最佳实践，需要实现最高性能的 UI 渲染，避免全局刷新」 (stated 2026-09-29)
  - evidence: 按切片 shallowRef + 分 topic 发布 + 日志追加/v-memo，见 docs/ARCHITECTURE.md §面板渲染；tests/panel-render.test.js 守住
- R3 — 「请你参考 /Users/kael/Codes/game/DrEmu/docs/PLUGIN_DEVELOPER_GUIDE.md、/Users/kael/Codes/game/DrEmu-plugin-letsgo-fishing-island」 (stated 2026-09-29)

## This work
- [x] R4 — 「先初始化当前项目」 (stated 2026-09-29; verify by: `npm run build` 产出只含 manifest 所列文件的 dist/，`npm test` 通过)
  - evidence: `npm run build` → dist/ 仅含 manifest、control.js、core/、shared/protocol.js、version.js、panel/；`npm test` → pass 7 fail 0 (2026-09-29)
