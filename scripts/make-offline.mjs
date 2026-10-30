/**
 * 把 vite-plugin-singlefile 产出的 dist-offline/index.html 加工成「双击即用」的离线版：
 *   1. dist-offline/背单词.html      —— 构建产物
 *   2. 仓库根目录/背单词.html        —— 方便从 GitHub 直接下载
 *   3. 校验：不含外链资源、词库已内嵌
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'dist-offline', 'index.html')
const OUT = path.join(ROOT, 'dist-offline', '背单词.html')
const REPO_COPY = path.join(ROOT, '背单词.html')

if (!fs.existsSync(SRC)) {
  console.error('✗ 找不到 dist-offline/index.html，请先执行 vite build --mode offline')
  process.exit(1)
}

let html = fs.readFileSync(SRC, 'utf8')

// 校验外部依赖
const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((m) => m[0])
if (external.length) {
  console.error('✗ 存在外部资源引用：', external.slice(0, 5))
  process.exit(1)
}

// 校验词库内嵌：检查若干已知词条/字段是否出现在产物里
const hasBank = html.includes('abandon') && html.includes('phonetic') && html.length > 400_000
if (!hasBank) {
  console.error('✗ 词库似乎没有打包进单文件（产物过小或缺关键字段）')
  process.exit(1)
}

// 标题加上「离线版」标识
html = html.replace('<title>', '<title>【离线版】')

fs.writeFileSync(OUT, html, 'utf8')
fs.writeFileSync(REPO_COPY, html, 'utf8')

const kb = (fs.statSync(OUT).size / 1024).toFixed(0)
console.log(`✓ 离线版已生成：dist-offline/背单词.html (${kb} KB)`)
console.log(`✓ 已同步到仓库根目录：背单词.html（便于直接下载）`)
console.log('  双击该文件即可离线使用（进度存在浏览器 localStorage）')
