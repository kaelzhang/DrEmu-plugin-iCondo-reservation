# DrEmu plugin: iCondo Reservation

一个 DrEmu 插件，在 iCondo App 里自动预订网球场：立即订，或在日期开放的 00:00 抢订。本文件是仓库的唯一入口：任何人（或 agent）在这里动手之前先读它，再按下表选读。

## Loading Map

| 你要做的事 | 读 | 除非任务扩展，否则跳过 |
| --- | --- | --- |
| 接手、继续上次的工作，或想知道做到哪了、真机验证到哪一步 | `docs/STATUS.md` | 其余 |
| 改任何东西之前，弄清「这个插件要做什么」、规则和 Kael 的裁定 | `docs/REQUIREMENTS.md` | `docs/ARCHITECTURE.md` |
| 改导航、预订、取消、抢订时间安排，或某一步的成功判断 / 失败原因 | `docs/FLOW.md` + `docs/REQUIREMENTS.md` §画面与导航 | `docs/ARCHITECTURE.md` |
| 改代码结构、面板协议、面板渲染方式、素材管线、构建与测试 | `docs/ARCHITECTURE.md` | 其余 |
| 读真机日志、排查设备上的失败、搭开发环境、碰到 devkit 报错 | `docs/ARCHITECTURE.md` §运行与排查 | 其余 |
| 新增 / 重截 `screenshots/` 素材，想知道某个区域是什么、在哪，或预订页的格子坐标和颜色 | `docs/ASSETS.md` | `docs/FLOW.md` |
| 对照 Kael 写的需求原文 | `prompts/requirement.md`（git 忽略，只在 Kael 本地；内容已全部写进 `docs/REQUIREMENTS.md`） | 其余 |
| 了解 DrEmu 插件系统本身（manifest、capability、坐标系、`dremu` API、devkit） | `/Users/kael/Codes/game/DrEmu/docs/PLUGIN_DEVELOPER_GUIDE.md`（仓库外，绝对路径） | 本仓库 docs |
| 做看屏幕 / 点屏幕 / 识别数字 / 恢复流程 / 部署之前，先看同类插件踩过的坑 | `/Users/kael/Codes/game/DrEmu-plugin-letsgo-fishing-island/docs/PLUGIN_LESSONS.md`（仓库外，绝对路径） | 本仓库 docs |
| 查看用户原话形式的需求台账 | `.omnipowers/requirements.md` | 其余 |

没有信号命中 → 只读 `docs/STATUS.md`，然后问。

## 约定

- **需求文档记录最终状态**，不是变更历史。需求变了就改正文，不追加 changelog。
- 源码在 `plugin/`，构建产物在 `dist/`（git 忽略）。`dist/` 就是 DrEmu 加载的包。
- 每轮结束改写 `docs/STATUS.md`，让下一个接手的人知道做到哪、真机验证到哪、下一步是什么。
- 和 Kael 用中文沟通。
- `screenshots/` 是 git 忽略的本地素材；`plugin/asset-list.json` 决定读哪些，`npm run build` 把它们编译成 `dist/assets.js`。
- 所有面板 UI 用 Vite + Vue 3（`<script setup>`、Composition API），按 `docs/ARCHITECTURE.md` §面板渲染 的规则写：按切片订阅、局部更新，禁止整页刷新。
- 控制脚本运行在无 DOM、无网络、无 npm 的沙箱里，`plugin/control.js`、`plugin/core/*.js`、`plugin/shared/*.js` 不得 import Node 模块或 npm 包。
- 坐标永不自行取整（DrEmu 只在设备边界取整一次）。
- **写或改任何「看屏幕再决定」的代码前，先读 `docs/FLOW.md` §读屏幕的原则，逐条自查**：否定结论是不是等到超时才下；是不是在等目标状态而不是「两次一致 / 固定延时」；动手前内容是否已就绪；这个点击的期望结果是什么、没出现怎么办；`tests/flow.test.js` 的「every response is late」用例是否仍绿。动过轮询间隔、超时、重试的改动，同样要过这一遍。
- 沙箱里的 `toLocaleTimeString` 不认 24 小时制选项，时间一律用 `core/logger.js` 的 `clock()` 自己拼。
- 版本号形如 `<manifest 版本>+<提交>`（未提交改动时带 `-dirty`），面板标题旁显示，用来确认设备跑的是哪一版。
- 不要卸载再重装插件：卸载会清空插件存储（含设置）。
- 提交信息不带任何工具署名 trailer。

## 命令

```bash
npm run build     # 原子构建：在 .dist-staging/ 里 Vite 构建 panel、拷贝控制脚本与模块、写 version.js、生成 assets.js，全部成功才替换 dist/
npm test          # 先 build，再 dremu-plugin-devkit test（devkit 以 file: 依赖 ../DrEmu/instruments/plugin-devkit）
```

开发环境、装到 DrEmu、读真机日志：`docs/ARCHITECTURE.md` §运行与排查。

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
