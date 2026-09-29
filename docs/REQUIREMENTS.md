# 需求

## 目标

在 DrEmu 模拟的 Android 设备上，驱动 iCondo App 完成公寓设施（球场）的预定：按面板里设置的场地和时段优先级，去抢/订第一个可用的时段。

## 已实现（初始化）

- 插件包：manifest（`me.kael.icondo-reservation`，设备竖屏 720 × 1280，`orientation: 0`）、控制脚本、Vite + Vue 面板。
- iCondo 的 Android 包名是 `com.icondo`（`plugin/core/icondo.js`）；前台不是 iCondo 时，开始被拒绝为 `icondo_not_in_front`。
- 面板：开始 / 停止、运行状态、设置（场地名、按优先级排序的时段 `HH:MM`，最多 12 个，自动保存到 `dremu.storage`）、日志（保留最近 500 行）。
- 运行：目前只记录设置并以 `flow_undefined` 结束——预定流程尚未定义，不假装预定。

## 待定（需要 Kael 确认）

1. 预定流程：从首页到提交的每一步界面、场地/日期/时段如何选择、成功与失败的标志。
2. 放号规则：提前几天、几点开放；是否需要在开放瞬间抢订。
3. 面板还需要哪些设置（日期、多个场地、重试次数等）。

每确认一项，就把它改写进上面的「目标 / 已实现」，并从这里删除。
