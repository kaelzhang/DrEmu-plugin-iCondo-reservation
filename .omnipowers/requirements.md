# Requirements

## Standing
- R1 — 「当前项目是帮助我们在 iCondo 中来做球场的预定」 (stated 2026-09-29)
- R2 — 「所有的 panel 的 UI 界面，你需要使用 vite+vue 的技术栈，需要使用最佳实践，需要实现最高性能的 UI 渲染，避免全局刷新」 (stated 2026-09-29)
  - evidence: 按切片 shallowRef + 分 topic 发布 + 日志追加/v-memo，见 docs/ARCHITECTURE.md §面板渲染；tests/panel-render.test.js 守住
- R3 — 「请你参考 /Users/kael/Codes/game/DrEmu/docs/PLUGIN_DEVELOPER_GUIDE.md、/Users/kael/Codes/game/DrEmu-plugin-letsgo-fishing-island」 (stated 2026-09-29)

## This work
- [x] R4 — 「先初始化当前项目」 (stated 2026-09-29; verify by: `npm run build` 产出只含 manifest 所列文件的 dist/，`npm test` 通过)
  - evidence: `npm run build` → dist/ 仅含 manifest、control.js、core/、shared/protocol.js、version.js、panel/；`npm test` → pass 7 fail 0 (2026-09-29)
- [x] R5 — 「1 是的」（设备分辨率是竖屏 720 × 1280） (stated 2026-09-29; verify by: manifest `screen` 为 720 × 1280、orientation 0，docs 移出待定)
  - evidence: plugin/manifest.json screen 720×1280/0 未变；docs/REQUIREMENTS.md 待定已删该项
- [x] R6 — 「2 com.icondo」（iCondo 的 Android 包名） (stated 2026-09-29; verify by: 包名写入代码与 devkit 配置，docs 移出待定)
  - evidence: plugin/core/icondo.js、control.js 开始前校验前台、package.json dremu.device.application；测试「a run starts only while iCondo is in front」通过
- R7 — 「其他问题我后续再跟你说」 (stated 2026-09-29) — 待定 3–5 保持待定，不自行假设
- [x] R8 — 「请你查看，并且理解需求 prompts/requirement.md」 (stated 2026-10-01; verify by: 向 Kael 复述理解并澄清疑点)
  - evidence: 已读需求、8 张整屏截图、12 个区域 capture.json；2026-10-01 回复中复述理解、列出假设与待澄清问题
- R9 — prompts/requirement.md（2026-10-01 13:44 版，git 忽略，原文以该文件为准）是网球场预定的需求来源：首页/facility/book-tab/tennis-court 导航、面板（本周/下周、可选的周几、8–21 点时段一字排开、最多两个相邻时段）、固定位置判断 day 与时段三态、不可用即任务失败并在面板说明原因并记预定日志、next → agree → confirm → waitFor calendar 才算完成、active-tab 下 cancel / cancel-yes 取消流程、00:00 开放时抢订、facility-keep-alive 每 30 秒 tap、测量进入/back 耗时并提前点击 (stated 2026-10-01)
  - evidence: docs/REQUIREMENTS.md + docs/FLOW.md 记录最终理解；flow.js（导航/预订/取消）、job.js（立即订 / 等待保活 / 校准 / 00:00 抢订）、court.js（固定位置三态）、TaskForm.vue（本周下周、可选周几、14 时段相邻规则）；tests/flow.test.js、job.test.js、screens.test.js、rules.test.js 通过
- R10 — 「1 失败」（选了两个时段而开抢时只剩一个可用 → 整个任务失败） (stated 2026-10-01)
  - evidence: flow.js bookHere 任一目标时段 closed 即 slot_unavailable；tests/flow.test.js「two slots when only one is free」
- R11 — 「2 对，你在面板上放一个测试按钮，这个测试就会预订，预订成功，然后自动取消。还有一个「预订」按钮，点击以后，它会去预定，但不会自动取消。如果当前可以立即去预定，那么它会立即去预定，如果预定时间还没到，那么它就会开始规划，并且保活，并且到可以预定的某天的 00:00 立即抢。」 (stated 2026-10-01)
  - evidence: TaskForm.vue「预订」「测试」按钮；job.js test 任务预订后 cancelBooking；未开放时 grab；tests/flow.test.js test job 端到端、job.test.js
- R12 — 「3 你先不用管这个」（配额用完的界面） (stated 2026-10-01)
  - evidence: 未做配额检测；docs/REQUIREMENTS.md §不处理
- R13 — 「4 对。cancel-confirm-top.png 和 cancel-confirm-bottom.png，它是一个 sheet」（本轮只做网球场；取消确认是一个 sheet） (stated 2026-10-01)
  - evidence: 只做网球场；cancelBooking 在 sheet 中上滑扫描 cancel-yes（cancel-confirm-top/bottom 截图驱动测试）
- R14 — 「另外补充的是，大部分的界面都会包含 back 按钮，你可以通过我之前的描述，以及 back 来导航到不同的界面」 (stated 2026-10-01)
  - evidence: flow.js toFacility/goBack 优先点 back（两个偏移位置）
- R15 — 「另外，system-back 也就是系统导航返回按钮，你也可以使用」 (stated 2026-10-01)
  - evidence: flow.js goBack 在已知内层页找不到 back 时点 system-back
- R16 — 「请注意，你不要点击 system-back 导致关闭 app 了」 (stated 2026-10-01)
  - evidence: goBack 只在 INNER_PAGES 上用 system-back，首页/未知画面报 unknown_screen；tests/flow.test.js「system back is never tapped there (R16)」
