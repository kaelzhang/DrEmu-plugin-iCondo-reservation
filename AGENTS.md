# DrEmu plugin: iCondo Reservation

一个 DrEmu 插件，在 iCondo App 里自动完成球场（设施）预定。本文件是仓库的唯一入口：任何人（或 agent）在这里动手之前先读它，再按下表选读。

## Loading Map

| 你要做的事 | 读 | 除非任务扩展，否则跳过 |
| --- | --- | --- |
| 改任何东西之前，弄清「这个插件要做什么」、还有哪些待定 | `docs/REQUIREMENTS.md` | `docs/ARCHITECTURE.md` |
| 改代码结构、面板协议、面板渲染方式、构建与测试 | `docs/ARCHITECTURE.md` | 其余 |
| 了解 DrEmu 插件系统本身（manifest、capability、坐标系、`dremu` API、devkit） | `/Users/kael/Codes/game/DrEmu/docs/PLUGIN_DEVELOPER_GUIDE.md`（仓库外，绝对路径） | 本仓库 docs |
| 查看用户原话形式的需求台账 | `.omnipowers/requirements.md` | 其余 |

没有信号命中 → 只读 `docs/REQUIREMENTS.md`，然后问。

## 约定

- **需求文档记录最终状态**，不是变更历史。需求变了就改正文，不追加 changelog。
- 源码在 `plugin/`，构建产物在 `dist/`（git 忽略）。`dist/` 就是 DrEmu 加载的包。
- 所有面板 UI 用 Vite + Vue 3（`<script setup>`、Composition API），按 `docs/ARCHITECTURE.md` §面板渲染 的规则写：按切片订阅、局部更新，禁止整页刷新。
- 控制脚本运行在无 DOM、无网络、无 npm 的沙箱里，`plugin/control.js`、`plugin/core/*.js`、`plugin/shared/*.js` 不得 import Node 模块或 npm 包。
- 坐标永不自行取整（DrEmu 只在设备边界取整一次）。
- 提交信息不带任何工具署名 trailer。

## 命令

```bash
npm run build     # 清空 dist/ → Vite 构建 panel → 拷贝控制脚本与模块 → 写 version.js
npm test          # 先 build，再 dremu-plugin-devkit test（devkit 以 file: 依赖 ../DrEmu/instruments/plugin-devkit）
```

devkit 需要它自己目录下已 `npm install` 且 `wasm/` 已构建（见其 README）。

真机验证：`ln -s "$PWD/dist" "$HOME/Library/Application Support/DrEmu/plugins/icondo-reservation"` → DrEmu 设备窗口 → Plugins → 启用 → Panel；改代码后 `npm run build` 再按 Refresh。

## Omnipowers

| role | location |
| --- | --- |
| design-docs | `docs/` |
| work-state | `.omnipowers/` |
| records | `docs/` |
| scratch | 会话 scratchpad |
| standards | 本文件 |
| write-authority | 全仓库 |
| vcs | 每轮结束提交并推送 `main` |
