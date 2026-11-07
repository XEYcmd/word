# 高中必背 3600 词 · 背单词

一个纯前端、零后端的高中英语单词背诵应用，提供五种形态：

| 形态 | 入口 | 说明 |
| --- | --- | --- |
| 🌐 在线版 | <https://xeycmd.github.io/word/> | GitHub Pages 自动部署，手机/电脑浏览器直接用 |
| 📱 PWA 安装版 | 同上，浏览器菜单「安装应用 / 添加到主屏幕」 | 装成独立 App，断网可用 |
| 🤖 **安卓 App** | [`背单词.apk`](./背单词.apk)（4.1 MB） | 原生安装包，离线可用，无需浏览器 |
| 💾 离线单文件 | [`背单词.html`](./背单词.html)（约 800 KB） | 双击即用，无需服务器、无需联网 |
| 🖥 桌面安装包 | Actions → Build Desktop App | Windows `.msi/.exe`、macOS `.dmg`、Linux `.deb/.AppImage` |

> 词库共 **3855 词**（高考 3500 词表 + 人教版教材单元标注），核心高频 1933 / 拓展 1922。

---

## 📱 手机端

界面针对手机做了专门适配，不是把桌面版缩小：

- **底部标签栏**：首页 / 开始学习 / 词库 / 统计 / 设置，单手可达，48px 触控高度
- **安全区适配**：刘海屏、状态栏、底部手势条都留出 `safe-area-inset`，内容不会被遮挡
- **触控友好**：所有按钮 ≥ 42px，选项 ≥ 56px，星标/喇叭单独放大
- **词库列表重排**：手机上改成两行布局（单词+音标 / 完整释义），释义不再被挤成 `art. — (...`
- **统计页防溢出**：14 天柱状图改为容器内横向滚动，页面不再被撑宽
- **超小屏 & 横屏**：iPhone SE（≤380px）进一步压缩，横屏减少纵向占用
- 已实测 390×844 / 430×932 视口，**横向溢出 0px**

### 安卓 App

直接下载 [`背单词.apk`](./背单词.apk) 安装即可（Android 7.0+）。

App 由 Capacitor 封装，网页资源全部内置，**完全离线**；带有原生启动屏、自适应图标、透明状态栏。
进度同样存在本地，卸载前注意在「设置 → 导出进度」备份。

自己打包：

```bash
npm run build:webapp      # 构建 App 用的网页资源 -> dist-app/
npx cap sync android      # 同步到 Android 工程
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

> 也可在 GitHub Actions 手动触发 **Build Android APK** 自动构建。

---

## ✨ 核心：一条完整的学习流程

背单词、选择题、拼写**不是三个分开的功能**，而是同一批词的三关，按顺序串起来：

```
① 背单词  ──→  ② 选择题  ──→  ③ 拼写  ──→  🎉 今日完成
 卡片过一遍      四选一检验        看中文写英文        查看正确率
```

- **三关共用同一批词**：这一批词背完，立刻用它们出选择题，再立刻拼写，形成「认识 → 认出 → 写出」的闭环。选择题 / 拼写默认每组 20 题，可在设置里调整，从本批词中抽取。
- **进度可断点续做**：关掉页面再回来，会回到上次所在的**具体题目**（不只是关卡）；已答反馈、正确率统计都会保留，跨天自动开新一批。
- **答错自动进错词本**，错词本、收藏、到期复习都可以单独开一批刷。
- 步骤条可自由跳转（想直接测也可以点第 2 步）。

---

## ✨ 功能一览

| 模块 | 说明 |
| --- | --- |
| 🃏 第一关 · 背单词 | 卡片式学习，释义默认遮挡，点击/空格显示；按「忘记 / 模糊 / 记得 / 太简单」四档评分 |
| ✍️ 第二关 · 选择题 | 四选一，可在**英→中**（看单词选释义）与**中→英**（看释义选单词）间切换；题干与选项都标注词性，即时判对错 |
| ⌨️ 第三关 · 拼写 | 看中文写英文，答错显示你写的和正确答案 |
| 🔁 间隔复习 | 艾宾浩斯曲线（1/2/4/7/15/30/60 天），到期词自动进入下一批 |
| 🔊 发音 | 浏览器 Web Speech API，离线可用，支持美式/英式口音与语速调节 |
| 📚 词库 | 3855 词全量检索，按字母 / 教材单元 / 核心拓展 / 错词 / 收藏筛选 |
| ⭐ 错词本 · 收藏 | 答错自动收录，可单独刷；收藏词随时复习；到期词也能单独复习 |
| 📊 统计 | 已学/已掌握进度、近 14 天学习量、26 周打卡热力图、连续打卡天数、学习时长 |
| 🌗 明暗主题 | 亮色 / 暗色 / 跟随系统 |

### 选项为什么不会「两个都对」

选择题的干扰项经过三层过滤（`src/lib/groups.ts` + `src/lib/synonyms.ts`）：

1. **释义重合**：干扰项的中文释义不能与正确答案有相同义项、包含关系，或共享 ≥2 个汉字（如「信息」vs「新闻，消息」）。
2. **近义词**：内置 59 组高中常见近义词（news/information、buy/purchase、home/house…），同组词不会同时出现在选项中。
3. **数量兜底**：本批词不够时从全词库补足，保证每道题**始终 4 个选项**；小批量（5 词）也不会退化成 2 个选项。

已用全词库 3855 词离线校验：**选项不足 0 例、释义重合 0 例、近义冲突 0 例**。

**学习范围**：全部词库、核心高频、拓展词汇、按字母 A-Z、按教材单元（必修一~选必四）、到期复习、错词本、收藏。

**快捷键**：空格显示释义 · `1`~`4` 评分 · 选择题 `1`~`4` 选答案 · 拼写/选择题回车进入下一题。

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
│   ├── pages/              # 首页 / 学习流程 / 词库 / 统计 / 设置
│   ├── lib/
│   │   ├── session.ts      # 三关流程状态（背→选→拼，可断点续做）
│   │   ├── bank.ts         # 词库索引、字母/单元分组
│   │   ├── srs.ts          # 艾宾浩斯间隔算法
│   │   ├── storage.ts      # localStorage 持久化
│   │   ├── speech.ts       # TTS 发音
│   │   ├── groups.ts       # 干扰项生成、可复现打乱
│   │   ├── worth.ts        # 过滤功能词（a/the/of 等不进学习队列）
│   │   └── store.tsx       # 全局状态
│   └── data/words.ts       # 内嵌词库（自动生成）
├── src-tauri/              # 桌面版（Tauri 2）
├── scripts/
│   ├── make-offline.mjs    # 离线单文件打包
│   ├── make_icons.py       # 站点图标生成
│   ├── make_tauri_icons.py # 桌面图标生成
│   ├── e2e.mjs             # 端到端测试（CDP）
│   ├── resume-check.mjs    # 断点续做检查（CDP）
│   ├── study-scope-check.mjs # 错词本 / 收藏 / 到期复习检查（CDP）
│   └── pwa-check.mjs       # PWA 离线能力检查
└── .github/workflows/      # Pages 部署 + 桌面安装包构建
```

---

## 🧪 自测

项目带多套基于 Chrome DevTools Protocol 的自动化测试：

**端到端功能测试**（25 项断言：三关流程、评分、判题、持久化、断点续做、搜索、主题）

```bash
npm run dev
# 另开终端：用无头浏览器打开并开启调试端口
msedge --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/e2e "http://127.0.0.1:5178/word/"
node scripts/e2e.mjs
```

离线版同样可测：`CDP=http://127.0.0.1:9223 node scripts/e2e.mjs "file:///.../背单词.html"`

**断点续做检查**（9 项：选择题 / 拼写答到一半刷新，停在原题、保留反馈、统计不重复）

```bash
CDP=http://127.0.0.1:9222 node scripts/resume-check.mjs
```

**学习范围检查**（11 项：错词本 / 收藏 / 到期复习单独开批、词单正确、测试题量上限）

```bash
CDP=http://127.0.0.1:9222 node scripts/study-scope-check.mjs
```

**PWA 检查**（5 项：manifest、SW 注册与激活、断网后仍可打开）

```bash
npm run build && npx vite preview --port 4179
msedge --headless=new --remote-debugging-port=9226 --user-data-dir=/tmp/pwa "http://127.0.0.1:4179/word/"
CDP=http://127.0.0.1:9226 node scripts/pwa-check.mjs http://127.0.0.1:4179/word/
```

**移动端布局检查**（390px 真实视口模拟，检测横向溢出）

```bash
CDP=http://127.0.0.1:9228 node scripts/layout-check.mjs "https://xeycmd.github.io/word/#/home"
```

**选择题专项校验**

```bash
# 选项数：每道题都必须恰好 4 个选项（含小批量边界）
CDP=http://127.0.0.1:9222 node scripts/quiz-options-check.mjs

# 中→英：选项唯一、题干带词性
CDP=http://127.0.0.1:9222 node scripts/cn2en-check.mjs

# 全词库离线校验：选项不足 / 释义重合 / 近义词冲突
node scripts/check-gloss-overlap.mjs
node scripts/check-cn2en-semantics.mjs
```

当前状态：**在线版 25/25、离线版 25/25、断点续做 9/9、学习范围 11/11、PWA 5/5、选项数 45/45 全为 4 个、中→英 20/20、全词库选项不足 / 释义重合 0 例、移动端 0px 溢出，全部通过**。

---

## 📄 许可

代码 MIT。词库数据来源于公开的高考词汇整理，仅供个人学习使用。
