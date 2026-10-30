# 高中必背 3600 词 · 背单词

一个纯前端、零后端的高中英语单词背诵应用，提供三种形态：

| 形态 | 入口 | 说明 |
| --- | --- | --- |
| 🌐 在线版 | <https://xeycmd.github.io/word/> | GitHub Pages 自动部署，手机/电脑浏览器直接用 |
| 📱 PWA 安装版 | 同上，浏览器菜单「安装应用 / 添加到主屏幕」 | 装成独立 App，断网可用 |
| 💾 离线单文件 | [`背单词.html`](./背单词.html)（约 800 KB） | 双击即用，无需服务器、无需联网 |
| 🖥 桌面安装包 | Actions → Build Desktop App | Windows `.msi/.exe`、macOS `.dmg`、Linux `.deb/.AppImage` |

> 词库共 **3855 词**（高考 3500 词表 + 人教版教材单元标注），核心高频 1933 / 拓展 1922。

---

## ✨ 功能

| 模块 | 说明 |
| --- | --- |
| 🃏 背单词 | 卡片式学习，释义默认遮挡，点击/空格显示；按「忘记 / 模糊 / 记得 / 太简单」四档评分 |
| ✍️ 测试 | 看英选中、看中选英、看中拼写三种模式；即时判对错，答错自动进错词本 |
| 🔁 间隔复习 | 艾宾浩斯曲线（1/2/4/7/15/30/60 天），到期词自动进入复习队列 |
| 🔊 发音 | 浏览器 Web Speech API，离线可用，支持美式/英式口音与语速调节 |
| 📚 词库 | 3855 词全量检索，按字母 / 教材单元 / 核心拓展 / 错词 / 收藏筛选 |
| ⭐ 错词本 · 收藏 | 答错自动收录，可单独刷；收藏词随时复习 |
| 📊 统计 | 已学/已掌握进度、近 14 天学习量、26 周打卡热力图、连续打卡天数 |
| 🌗 明暗主题 | 亮色 / 暗色 / 跟随系统 |

**分组方式**：全部词库、乱序模式、核心高频、拓展词汇、按字母 A-Z、按教材单元（必修一~选必四）、今日复习、错词本、我的收藏。

**快捷键**：空格显示释义 · `1`~`4` 评分 · 测试中 `1`~`4` 选答案 · 回车下一题。

---

## 🚀 使用

### 在线版 / 安装成 App

访问 <https://xeycmd.github.io/word/>。
Chrome / Edge 地址栏右侧点「安装」，或在手机浏览器菜单里选「添加到主屏幕」，之后可像原生 App 一样全屏使用，**断网也能打开**（Service Worker 已缓存全部资源）。

### 离线单文件（推荐给没网的环境）

下载 [`背单词.html`](./背单词.html)，**双击即可打开**，无需服务器、无需联网。
词库、样式、脚本全部内嵌在这一个文件里，进度保存在浏览器 localStorage。

> 手机端：把 HTML 文件传到手机，用浏览器打开即可。

### 桌面安装包

仓库自带 GitHub Actions 工作流 `.github/workflows/build-app.yml`（基于 Tauri 2）：
在 Actions 页面手动触发 **Build Desktop App**，或在本地装好 Rust 后执行 `npm run build:app`。
产物在 `src-tauri/target/release/bundle/`（Windows 为 `.msi` / `-setup.exe`）。

> 说明：本机没有安装 Rust 工具链，所以安装包由 CI 构建，不需要你本地准备环境。

### 本地开发

```bash
npm install           # 安装依赖（已配置 npmmirror 镜像）
npm run dev           # 开发服务器 http://127.0.0.1:5178/word/
npm run build         # 构建在线版 -> dist/
npm run build:offline # 构建离线单文件 -> dist-offline/背单词.html
npm run build:app     # 构建桌面安装包（需要 Rust）
```

---

## 📖 词库

词库构建脚本：`data/build_words.py`

```bash
python data/build_words.py   # 生成 data/words.json
python data/emit_ts.py       # 转成前端模块 src/data/words.ts
```

**字段**：

```ts
{
  id: string        // 稳定 id（小写归一）
  word: string      // 展示词形
  phonetic: string  // 美式音标
  ukphone: string   // 英式音标
  pos: string       // 词性，如 "n. vt."
  trans: string     // 中文释义
  forms: string     // 词形变化（arose arisen）
  tag: string       // phrase | variant | ''
  rank: number      // 词频序号，越小越常用
  level: string     // core | extended
  unit?: string     // 人教版教材单元
}
```

**数据来源**：高考 3500 词表（含英美音标与释义）+ 人教版教材单元标注 + google-10000 英文词频表。
构建脚本会做去重合并、释义清洗（剥离残留词性标记）、词性规范化、变体识别（`arise arose arisen` → `arise`）等处理。

想换成自己的词表：替换 `data/raw/gk3500_words.json`（格式 `{name, usphone, ukphone, pos, meaning}`）后重新运行两个脚本即可。

---

## 🗂 项目结构

```
├── data/
│   ├── build_words.py      # 词库构建（清洗/合并/分级）
│   ├── emit_ts.py          # JSON -> TS 模块
│   ├── words.json          # 构建产物
│   └── raw/                # 原始词表
├── public/                 # 图标、manifest、Service Worker
├── src/
│   ├── pages/              # 首页 / 背单词 / 测试 / 词库 / 统计 / 设置
│   ├── lib/
│   │   ├── bank.ts         # 词库索引、字母/单元分组
│   │   ├── srs.ts          # 艾宾浩斯间隔算法
│   │   ├── storage.ts      # localStorage 持久化
│   │   ├── speech.ts       # TTS 发音
│   │   ├── groups.ts       # 分组、干扰项生成
│   │   ├── worth.ts        # 过滤功能词（a/the/of 等不进学习队列）
│   │   └── store.tsx       # 全局状态
│   └── data/words.ts       # 内嵌词库（自动生成）
├── src-tauri/              # 桌面版（Tauri 2）
├── scripts/
│   ├── make-offline.mjs    # 离线单文件打包
│   ├── make_icons.py       # 站点图标生成
│   ├── make_tauri_icons.py # 桌面图标生成
│   ├── e2e.mjs             # 端到端测试（CDP）
│   └── pwa-check.mjs       # PWA 离线能力检查
└── .github/workflows/      # Pages 部署 + 桌面安装包构建
```

---

## 🧪 自测

项目带两套基于 Chrome DevTools Protocol 的自动化测试：

**端到端功能测试**（17 项断言：渲染、答题、评分、持久化、搜索、主题切换）

```bash
npm run dev
# 另开终端：用无头浏览器打开并开启调试端口
msedge --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/e2e "http://127.0.0.1:5178/word/"
node scripts/e2e.mjs
```

离线版同样可测：`CDP=http://127.0.0.1:9223 node scripts/e2e.mjs "file:///.../背单词.html"`

**PWA 检查**（5 项：manifest、SW 注册与激活、断网后仍可打开）

```bash
npm run build && npx vite preview --port 4179
msedge --headless=new --remote-debugging-port=9226 --user-data-dir=/tmp/pwa "http://127.0.0.1:4179/word/"
CDP=http://127.0.0.1:9226 node scripts/pwa-check.mjs http://127.0.0.1:4179/word/
```

当前状态：**在线版 17/17、离线版 17/17、PWA 5/5 全部通过**。

---

## 📄 许可

代码 MIT。词库数据来源于公开的高考词汇整理，仅供个人学习使用。
