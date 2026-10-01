# 素材

`screenshots/` 里的截图和区域，以及它们在代码里怎么用。`screenshots/` 被 git 忽略，只在 Kael 的机器上（`/Users/kael/Codes/game/DrEmu-plugin-iCondo-reservation/screenshots/`）；换一台机器要按 §重新采集 补齐，否则 `npm run build` 会失败，依赖截图的测试（`tests/screens.test.js`、`tests/flow.test.js`）会跳过。

坐标都在 DrEmu 的工作坐标系里：竖屏 720 × 1280，左上角为原点，单位是设备像素（manifest `orientation: 0`）。

## 区域（`screenshots/<名字>/`）

每个目录里有 DrEmu 截图插件写的 `capture.json`（`region_screenshot`，矩形取自 `region`）和模板 PNG。用不用、怎么用由 `plugin/asset-list.json` 决定：`match` 编译成灰度模板做 SSIM；`rect` 只要矩形（只点不看）；`colour: true` 再记模板平均颜色，匹配时颜色差也要 ≤ 12。

| 区域 | 位置 (x,y) 尺寸 | 模板 | 在哪个画面 | 用途 |
| --- | --- | --- | --- | --- |
| `home` | 47,71 55×57 | capture | 首页左上角 logo | 认首页（和 `facility` 一起） |
| `facility` | 57,187 62×63 | capture | 首页的 facility 图标 | 认首页；点它进设施页 |
| `book-tab` | 58,192 64×90 | on, off | 设施页 book 标签 | 认设施页（on 或 off 都算）；off 时点它 |
| `active-tab` | 232,192 75×89 | on, off | 设施页 active 标签 | 取消时切到 active；等它 on |
| `facility-keep-alive` | 148,84 247×58 | —（rect） | 设施页标题 | 等待期间每 30 秒点一下，防设备休眠 |
| `tennis-court` | 102,1031 80×79 | capture | 设施页列表底部的网球拍图标 | 沿 x=102 这一列纵向扫描找卡片；点整张卡片（x 40–680） |
| `back` | 32,91 47×46 | capture | 设施页、确认页、成功页的返回箭头 | 导航返回；预订页和条款页的箭头往左偏 6 px，代码在 dx 0 和 −6 两处找 |
| `system-back` | 126,1204 61×55 | —（rect） | 系统导航栏的返回三角 | 只在已知内层页找不到 `back` 时用；首页 / 未知画面绝不点（会关掉 App） |
| `next` | 260,1106 207×63 | enabled, disabled | 预订页底部 next | 只有像 enabled（且颜色对）才算亮起；灰度上没亮的也有 0.87 的 SSIM，必须看颜色（亮 `#ddf4f5`，灭 `#f2f2f2`） |
| `agree` | 10,1111 698×51 | capture | 条款页底部 | 认条款页；点它 |
| `confirm` | 86,1108 544×58 | capture | 确认页底部 | 认确认页；点它 |
| `calendar` | 146,1091 54×58 | capture | 成功页 add to calendar 图标 | 看到它才算预订成功 |
| `cancel-yes` | 464,1059 132×59 | capture | 取消 sheet 底部的 yes | 在 sheet 里纵向扫描，找不到就上滑 |

易混：首页的 `facility` 图标和设施页选中的 `book` 标签是同一个青色烧烤架、位置几乎相同，所以首页必须 `home` 和 `facility` 同时匹配。

## 裁剪（`plugin/asset-list.json` 的 `crops`）

没有单独截取的元素，从整屏截图按矩形裁出模板：

| 名字 | 来源 | 矩形 | 用途 |
| --- | --- | --- | --- |
| `tennis-page` | `tennis-court.png` | 630,188 80×82 | 预订页右上角日历图标：认预订页 |
| `cancel` | `active.png` | 560,458 100×100 | active 页卡片右侧的 cancel 按钮：纵向扫描 |

## 整屏截图

| 文件 | 画面 | 用在 |
| --- | --- | --- |
| `facility-top.png` / `facility-bottom.png` | 设施页 book 标签，列表顶部 / 滑到底 | 页面识别、扫描、流程测试 |
| `tennis-court.png` | 预订页，2026-10-01 周四选中，14:00、15:00 可订 | 量日期格 / 时段格；`tennis-page` 裁剪 |
| `tennis-court-next.png` | 预订页，10-02 周五选中、14:00 已选，next 亮 | 量选中态 |
| `agree.png`、`confirm.png`、`book-success.png` | 条款页、确认页、成功页 | 页面识别、流程测试 |
| `active.png` | active 标签，两张卡片，只有第一张（10-02 14:00–15:00）有 cancel | `cancel` 裁剪；取消流程测试 |
| `cancel-confirm-top.png` / `cancel-confirm-bottom.png` | 取消确认 sheet，顶部 / 滑到底露出 no、yes | 取消流程测试 |

没有首页的整屏截图：测试里用 `home`、`facility` 两个区域贴在白底上合成（`tests/support/fake-icondo.js`）。

## 预订页的固定布局（`plugin/core/court.js`）

在 `tennis-court.png`、`tennis-court-next.png` 上量的，不靠文字识别：

- 日期格：7 列 x = 13, 118, 223, 329, 434, 540, 645，宽 61；2 行 y = 318, 413，高 80。第一行本周、第二行下周，周一到周日。状态取格子上沿（y+5 起 6 px 高、左右各缩 15 px）的平均色，与 `#f2f2f2`（不可订）、`#e0e0e0`（可选）、`#84cfd4`（选中）比，距离 < 24 才算。
- 时段格：4 列 x = 10, 190, 370, 550，宽 160；4 行 y = 620, 708, 796, 884，高 78；从 08:00 起按行排，21:00 是第 4 行第 2 个。左边框内（x+6, y+30, 4×18）是 `#5bc6cc` → 选中；否则格内最暗像素亮度 < 120（黑字）→ 可选，否则（浅灰字，亮度约 224）→ 不可用。
- active 页卡片：cancel 按钮顶边 y 往下 0–36 px 是日期行（x 55–315），34–72 px 是时间行（x 55–375），用 `recognizeDigits` 读几号和 12 小时制的起止钟点。

## 重新采集

用 DrEmu 自带的截图插件在设备上截区域，存成 `screenshots/<名字>/capture.json` + 模板 PNG（文件名就是 `asset-list.json` 里的模板名）；整屏截图存成 `screenshots/<名字>.png`。iCondo 改版后：先重截受影响的区域，`npm run build`（缺什么会一次列全），再跑 `npm test`——`tests/screens.test.js` 会指出哪张截图上哪个判断不再成立；布局变了就改 `plugin/core/court.js` 的坐标和颜色。
