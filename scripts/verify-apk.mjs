/**
 * 校验 APK 内嵌的网页资源是否完整（不需要真机）。
 * 用法：node scripts/verify-apk.mjs [apk路径]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const APK = process.argv[2] || '背单词.apk'

if (!fs.existsSync(APK)) {
  console.error('✗ 找不到 APK:', APK)
  process.exit(1)
}

const sizeMB = (fs.statSync(APK).size / 1024 / 1024).toFixed(2)
console.log(`APK: ${APK}  ${sizeMB} MB`)

// 用 PowerShell 读取 zip 条目（Windows 无需额外依赖）
const listRaw = execSync(
  `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
    `$z=[System.IO.Compression.ZipFile]::OpenRead('${path.resolve(APK)}'); ` +
    `$z.Entries | ForEach-Object { $_.FullName }; $z.Dispose()"`,
  { encoding: 'utf8' },
)

const entries = listRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
console.log(`条目总数: ${entries.length}`)

const checks = [
  ['网页入口', entries.includes('assets/public/index.html')],
  ['词库脚本', entries.some((e) => /assets\/public\/assets\/words-.*\.js$/.test(e))],
  ['主脚本', entries.some((e) => /assets\/public\/assets\/index-.*\.js$/.test(e))],
  ['样式', entries.some((e) => /assets\/public\/assets\/index-.*\.css$/.test(e))],
  ['PWA manifest', entries.includes('assets/public/manifest.webmanifest')],
  // 注意：Android 资源编译后目录会带 -v4 后缀
  ['启动图标', entries.some((e) => /res\/mipmap-xxxhdpi.*\/ic_launcher\.png$/.test(e))],
  ['圆形图标', entries.some((e) => /res\/mipmap-.*\/ic_launcher_round\.png$/.test(e))],
  ['自适应图标', entries.some((e) => /res\/mipmap-anydpi-v26\/ic_launcher\.xml$/.test(e))],
  ['启动屏', entries.some((e) => /res\/drawable-port-.*\/splash\.png$/.test(e))],
  ['Capacitor 配置', entries.includes('assets/capacitor.config.json')],
  ['主 DEX', entries.includes('classes.dex')],
]

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) failed++
}

// 校验 index.html 里引用的是相对路径（App 内才能加载）
const idxRaw = execSync(
  `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
    `$z=[System.IO.Compression.ZipFile]::OpenRead('${path.resolve(APK)}'); ` +
    `$e=$z.GetEntry('assets/public/index.html'); $r=New-Object System.IO.StreamReader($e.Open()); ` +
    `$r.ReadToEnd(); $r.Dispose(); $z.Dispose()"`,
  { encoding: 'utf8' },
)

const absRefs = [...idxRaw.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1])
const relRefs = [...idxRaw.matchAll(/(?:src|href)="(\.\/[^"]*)"/g)].map((m) => m[1])
console.log(`${absRefs.length === 0 ? '✓' : '✗'} 资源路径均为相对路径（绝对路径 ${absRefs.length} 个）`)
if (absRefs.length) {
  console.log('   绝对路径:', absRefs.join(', '))
  failed++
}
console.log(`  相对路径引用 ${relRefs.length} 个`)

// 中文资源校验：strings.xml 里的 app 名
const stringsRaw = execSync(
  `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
    `$z=[System.IO.Compression.ZipFile]::OpenRead('${path.resolve(APK)}'); ` +
    `($z.Entries | Where-Object { $_.FullName -like '*resources.arsc' }).Count; $z.Dispose()"`,
  { encoding: 'utf8' },
).trim()
console.log(`✓ 资源表 resources.arsc 存在（${stringsRaw} 项）`)

console.log(failed === 0 ? '\nAPK 校验全部通过' : `\n发现 ${failed} 处问题`)
process.exit(failed === 0 ? 0 : 1)
