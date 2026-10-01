# 架构

## 目录

| 路径 | 作用 |
| --- | --- |
| `plugin/manifest.json` | DrEmu manifest：`device.input`、`device.capture`、`device.recognize`、`device.storage`；日志通道 `booking` |
| `plugin/asset-list.json` | 用到的每个区域：`match`（模板）/ `rect`（只点）/ `colour`（还要比平均颜色）；`crops` 是从整屏截图按矩形裁出的模板 |
| `plugin/control.js` | 控制脚本：任务的创建、运行、停止、重启后续跑，面板 intent，topic 发布 |
| `plugin/core/calendar.js` | 日期：本周 / 下周、开放时刻、目标日在两周格子里的位置 |
| `plugin/core/task.js` | 任务与面板表单：时段规则（一个或两个相邻）、校验 |
| `plugin/core/court.js` | 预订页的固定布局与日期格 / 时段格的状态判断 |
| `plugin/core/screen.js` | 屏幕驱动：截图、模板匹配（SSIM，滞后阈值，可选颜色门槛）、等待、区域内 80% 随机点击、滑动、纵向扫描、数字识别 |
| `plugin/core/flow.js` | 画面识别、导航、预订、取消（docs/FLOW.md） |
| `plugin/core/job.js` | 一个任务从头到尾：立即预订或等待—保活—校准—抢订，测试时再取消 |
| `plugin/core/ssim.js` | SSIM，取自钓鱼岛插件 |
| `plugin/core/logger.js`、`timing.js`、`icondo.js` | 面板日志、可中断的 sleep 与失败类型、包名 |
| `plugin/shared/protocol.js` | intent、topic、任务阶段，两端唯一来源 |
| `plugin/panel/src/` | Vue 面板：`store.js`、`bridge.js`、组件、`panel.css` |
| `tools/` | `build.mjs` 原子构建（`.dist-staging/` 全部成功才换成 `dist/`）；`build-dist.mjs` 拷贝运行时文件、写 `version.js`；`build-assets.mjs` 把 `screenshots/` 编译成 `assets.js` |
| `tests/` | 规则（`rules`）、真实截图上的识别（`screens`）与流程（`flow`，`support/fake-icondo.js` 按截图切换画面）、抢订时间安排（`job`，虚拟时钟）、devkit 插件用例（`plugin`）、面板渲染（`panel-render`）、日志（`logger`） |

`screenshots/` 是 git 忽略的本地素材：构建和依赖截图的测试都需要它（没有时 `screens` / `flow` 用例跳过）。

## 面板协议

| intent | 回复 |
| --- | --- |
| `icondo.state.read` | `{ version, today, draft, job, log: { lines, keep } }`——面板打开时读一次 |
| `icondo.draft.set` `{ draft }` | 规范化后的表单 `{ week, weekday, slots }` |
| `icondo.book` / `icondo.test` `{ date, slots }` | 新任务（`phase: "starting"`）；已有任务 `job_running`、任务不合法 `bad_task` / `date_passed`、前台不是 iCondo `icondo_not_in_front`，都是 `refused` |
| `icondo.job.stop` | 停止后的任务；没有任务 `refused not_running` |
| `icondo.log.clear` | `{}`，并在 `icondo.log` 上发布 `{ lines: [], keep }` |

| topic | 负载 |
| --- | --- |
| `icondo.job` | 任务 `{ kind, date, slots, phase, openAt, latencyMs, reason, message, startedAt, finishedAt }`；`phase` 见 `shared/protocol.js` |
| `icondo.log` | 新增一行 `{ append: line, keep }`，或整体替换 `{ lines, keep }`；`line = { seq, at, level, text }` |

每个 topic 只携带一个状态切片：新日志行不重发任务，任务变化不重发日志。`booking` 日志通道每个任务事件记一条（start / waiting / latency / grabbed / booked / cancelled / end）。

## 面板渲染

目标是每次变化只更新读取了该切片的组件（Kael：「需要实现最高性能的 UI 渲染，避免全局刷新」）。规则：

1. **按切片存储。** `store.js` 里每个切片是独立的 `shallowRef`（`job`、`notice`、`busy`、`version`、`today`、`log`），整体替换；不把控制脚本的负载做成深层响应式。
2. **组件只读自己的切片。** `PanelApp` 不读任何切片，只负责布局与首帧就绪；`PanelHeader`、`TaskForm`、`NoticeBar`、`JobCard`、`LogView` 各读各的。倒计时是独立的 `CountDown` 组件，每秒只重渲染它自己。新增组件遵守同一规则。
3. **日志只追加。** 行对象冻结，`seq` 作 key；新行 push 到原数组后 `triggerRef`，超出 `keep` 从头 `splice`；`v-memo="[line.seq]"` 让已画出的行跳过虚拟 DOM 比对；`.log` 用 `contain: strict` 把布局与绘制限制在日志框内。
4. **表单归面板所有。** 表单 `v-model` 绑定本地 `reactive` 的 `draft`，同步 watcher 去抖 300 ms 后整体保存；只在打开面板时从控制脚本载入，发布的事件不覆盖正在编辑的内容。
5. **构建。** Vue runtime 构建（模板在构建期编译）、关闭 Options API 与 devtools，产物文件名固定，无内联脚本/样式以满足 DrEmu 的 CSP。
6. **首帧就绪。** `PanelApp` 在 `onMounted` 里发出首个请求并派发 `dremu-panel-ready`（5 秒内必须派发）。

`tests/panel-render.test.js` 用组件更新计数守住第 2、3 条：新日志行只更新 `LogView` 且保留已有行的 DOM 节点；任务变化只更新 `JobCard`（`TaskForm` 的按钮也依赖任务，但只在可用性真的变了时才重渲染）；点时段只更新 `TaskForm`。
