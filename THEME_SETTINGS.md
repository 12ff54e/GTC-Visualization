# 主题设置更新

## 使用方法

目录选择页上方、绘图页左侧菜单底部，以及输入参数页上方都有 **Theme** 设置：

- **System**：跟随系统的浅色或暗色设置，系统切换时页面自动更新。
- **Light**：固定使用浅色主题。
- **Dark**：固定使用暗色主题。

选择立即生效，浏览器会保存偏好；刷新页面、进入其他页面或打开同源标签页后会继续使用该设置。浏览器禁止本地存储时，当前页面仍可以切换主题，但刷新后无法保留选择。

页面背景、表单、菜单、选中状态、提示文字和 Plotly 图表共用配色。已有图表即时更新背景、坐标轴和文字，保留数据、曲线颜色、热图色标、缩放范围及三维视角。目录完整换行显示的行为继续保留。

绘图页将绘图分类与显示设置分组：上方为 Plot categories，下方独立的 Display settings 卡片包含 Units 和 Theme。Units 使用尺子图标和紧凑的折叠行，点击展开 Time unit；支持键盘操作。窄屏下整个设置卡片显示在右下角，单位与主题仍可操作。

## 文件与流程

1. `client/theme.js` 在页面首次绘制前读取浏览器偏好，结合系统设置决定主题，并在页面加载后创建 Theme 控件。
2. `client/shared/theme-preference.js` 校验偏好值并解析 System 主题。
3. `public/stylesheets/theme.css` 定义统一的浅色、暗色变量；各页面样式引用这些变量。
4. `client/shared/plot-theme.js` 为新图表应用主题，并在切换时仅更新现有图表的外观颜色。
5. `webpack.config.js` 生成独立的 `public/javascripts/theme.js`，两个 Pug 模板和输入页共用该入口。

新增页面需要加载 `javascripts/theme.js`（普通同步脚本，放在 head 中）和 `stylesheets/theme.css`，并提供一个带 `data-theme-control` 属性的 `.theme-settings` 容器。新增绘图入口使用 `newThemedPlot` / `reactThemedPlot`，避免绕过主题设置。

## 构建与检查

```sh
npm run pack-client
npm run test:theme
```

主题检查覆盖偏好保存、系统变更、标签页同步、存储不可用，以及图表切换后坐标范围、三维相机和色标保持不变。

主题检查：前端构建成功，5 项主题检查及 17 项现有绘图检查通过。浏览器中验证了目录页、输入页和绘图页共用选择，绘图页由暗色切至浅色后保留手动设置的 X 轴范围 2–7。

设置区布局检查：前端构建和 5 项主题检查通过；在 1280px 桌面宽度和 360px 窄屏下检查了浅、暗主题，Units 的键盘展开/收起正常，切换到 tstep 后图表时间轴正常更新，当前绘图分类保持选中。
