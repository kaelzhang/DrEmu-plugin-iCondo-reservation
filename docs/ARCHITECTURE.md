# 架构

## 目录

| 路径 | 作用 |
| --- | --- |
| `plugin/manifest.json` | DrEmu manifest；capability 只列实际调用的（当前仅 `device.storage`），加入点击/截图/识别时再加 `device.input` / `device.capture` / `device.recognize` |
| `plugin/control.js` | 控制脚本：运行生命周期、面板 intent、topic 发布 |
| `plugin/core/` | 控制脚本与面板共用的纯逻辑（`settings.js` 校验与规范化、`logger.js` 环形日志） |
| `plugin/shared/protocol.js` | intent 与 topic 名称，两端唯一来源 |
| `plugin/panel/src/` | Vue 面板：`store.js`、`bridge.js`（`dremuPanel` 请求/事件桥）、组件、`panel.css` |
| `tools/` | `clean-output.mjs` 清空 `dist/`，`build-dist.mjs` 拷贝运行时文件并写 `version.js` |
| `tests/` | devkit 用例（`plugin.test.js`）与面板渲染用例（`panel-render.test.js`） |

## 面板协议

| intent | 回复 |
| --- | --- |
| `icondo.state.read` | `{ version, status, settings, log: { lines, keep } }`——面板打开时读一次 |
| `icondo.start` / `icondo.stop` | `status`；重复开始 `refused already_running`，未运行时停止 `refused not_running` |
| `icondo.settings.set` `{ settings }` | 规范化后的 settings；不合法为 `invalid_payload bad_settings`（线上拼写为 `invalid-payload`） |
| `icondo.log.clear` | `{}`，并在 `icondo.log` 上发布 `{ lines: [], keep }` |

| topic | 负载 |
| --- | --- |
| `icondo.status` | `{ running, stoppedBecause }` |
| `icondo.log` | 新增一行 `{ append: line, keep }`，或整体替换 `{ lines, keep }`；`line = { seq, at, level, text }` |

每个 topic 只携带一个状态切片：新日志行不重发状态，状态变化不重发日志。

## 面板渲染

目标是每次变化只更新读取了该切片的组件（Kael：「需要实现最高性能的 UI 渲染，避免全局刷新」）。规则：

1. **按切片存储。** `store.js` 里每个切片是独立的 `shallowRef`（`status`、`notice`、`busy`、`version`、`log`），整体替换；不把控制脚本的负载做成深层响应式。
2. **组件只读自己的切片。** `PanelApp` 不读任何切片，只负责布局与首帧就绪；`RunControl`、`NoticeBar`、`SettingsForm`、`LogView` 各读各的。新增组件遵守同一规则。
3. **日志只追加。** 行对象冻结，`seq` 作 key；新行 push 到原数组后 `triggerRef`，超出 `keep` 从头 `splice`；`v-memo="[line.seq]"` 让已画出的行跳过虚拟 DOM 比对；`.log` 用 `contain: strict` 把布局与绘制限制在日志框内。
4. **设置归面板所有。** 表单 `v-model` 绑定本地 `reactive`，同步 watcher 去抖 300 ms 后整体保存；只在打开面板时从控制脚本载入，发布的事件不覆盖正在编辑的内容。
5. **构建。** Vue runtime 构建（模板在构建期编译）、关闭 Options API 与 devtools，产物文件名固定，无内联脚本/样式以满足 DrEmu 的 CSP。
6. **首帧就绪。** `PanelApp` 在 `onMounted` 里发出首个请求并派发 `dremu-panel-ready`（5 秒内必须派发）。

`tests/panel-render.test.js` 用组件更新计数守住第 2、3 条：新日志行只更新 `LogView` 且保留已有行的 DOM 节点，状态变化只更新 `RunControl`。
