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
  app.js       # 章节导航、疾病选择、搜索和主题切换
content/
  manifest.json
  02_中枢神经系统/
  03_头颈部/
```

## 修改主题

优先修改 `assets/theme.css` 中的 CSS 变量。布局和组件样式位于 `assets/styles.css`。

## 部署

仓库使用 GitHub Pages，从 `main` 分支根目录发布。
