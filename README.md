# Ultra Notes of Medical Imaging

医学影像学底层逻辑笔记静态网站。

## 本地预览

在仓库目录启动任意静态文件服务器，例如：

```powershell
conda run -n py312 python -m http.server 8000
```

访问 `http://localhost:8000`。

## 文件结构

```text
index.html
assets/
  theme.css    # 颜色、字号、圆角等主题变量
  styles.css   # 页面布局与组件样式
  app.js       # 导航、搜索、主题切换和本地笔记
content/
  manifest.json
  02_中枢神经系统/
  03_头颈部/
```

## 修改主题

优先修改 `assets/theme.css` 中的 CSS 变量。布局和组件样式位于 `assets/styles.css`。

## 个人笔记

每个疾病页面拥有独立笔记，内容自动保存在当前浏览器的 `localStorage` 中，不会上传或与其他用户共享。网页支持导出当前笔记为 Markdown，以及将全部笔记备份为 JSON。

更换浏览器、设备或清除网站数据前，应先使用“备份全部”导出笔记。

## 全文搜索

顶部搜索框同时支持疾病名称、章节标题、小节标题和正文内容。首次搜索时，浏览器会读取现有 Markdown 文件并在当前页面内建立全文索引；索引不会上传，也不需要额外的后端服务。

搜索结果会显示命中内容的摘要。点击结果后将打开对应页面，并尽量定位到命中的小节。

## 部署

仓库使用 GitHub Pages，从 `main` 分支根目录发布。
