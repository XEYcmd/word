/**
 * 通过 GitHub REST API 提交本地文件（绕过 git 协议，仅需 api.github.com 可达）。
 * 用法：node scripts/push-via-api.mjs [--dry]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const REPO = 'XEYcmd/word'
const BRANCH = 'main'
const API = 'https://api.github.com'
const DRY = process.argv.includes('--dry')

function getToken() {
  // 复用 Git Credential Manager 里已存的 GitHub token
  const out = execSync('git credential fill', {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  })
  const m = out.match(/^password=(.+)$/m)
  if (!m) throw new Error('未找到 GitHub 凭据')
  return m[1].trim()
}

const TOKEN = getToken()

async function api(method, endpoint, body) {
  const res = await fetch(API + endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dsh-push',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} -> ${res.status}: ${data.message || text.slice(0, 200)}`)
  }
  return data
}

/** 递归列出要提交的文件（遵守 .gitignore 的关键条目） */
function listFiles(dir, base = '') {
  const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-offline', '.vite', 'target', 'shots'])
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue
      out.push(...listFiles(path.join(dir, entry.name), rel))
    } else {
      if (entry.name === 'tsconfig.tsbuildinfo') continue
      if (rel.startsWith('data/raw/ecdict.csv')) continue
      out.push(rel)
    }
  }
  return out
}

async function main() {
  console.log('读取远端分支状态…')
  const ref = await api('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`)
  const headSha = ref.object.sha
  console.log('  远端 HEAD:', headSha.slice(0, 7))

  const headCommit = await api('GET', `/repos/${REPO}/git/commits/${headSha}`)
  const baseTreeSha = headCommit.tree.sha

  // 远端已有文件的 blob sha，用于跳过未修改文件
  const baseTree = await api('GET', `/repos/${REPO}/git/trees/${baseTreeSha}?recursive=1`)
  const remoteBlobs = new Map()
  for (const item of baseTree.tree) {
    if (item.type === 'blob') remoteBlobs.set(item.path, item.sha)
  }
  console.log(`  远端文件 ${remoteBlobs.size} 个`)

  const files = listFiles(process.cwd())
  console.log(`本地待比对文件 ${files.length} 个`)

  const treeEntries = []
  let uploaded = 0
  let skipped = 0

  for (const rel of files) {
    const abs = path.join(process.cwd(), rel)
    const buf = fs.readFileSync(abs)
    // 远端 blob 用 git blob hash 比对，这里简单用大小+内容本地缓存判断
    const localSha = execSync(`git hash-object "${abs.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim()

    if (remoteBlobs.get(rel) === localSha) {
      skipped += 1
      continue
    }

    if (DRY) {
      console.log('  [dry] 需上传:', rel)
      uploaded += 1
      continue
    }

    // 创建 blob
    const isText = /\.(ts|tsx|js|mjs|json|css|html|md|py|yml|yaml|txt|webmanifest|svg|rs|toml|npmrc|gitignore)$/i.test(
      rel,
    ) || rel.startsWith('.')
    const blob = await api('POST', `/repos/${REPO}/git/blobs`, {
      content: isText ? buf.toString('utf8') : buf.toString('base64'),
      encoding: isText ? 'utf-8' : 'base64',
    })
    treeEntries.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha })
    uploaded += 1
    if (uploaded % 10 === 0) console.log(`  已上传 ${uploaded} 个…`)
  }

  console.log(`需要上传 ${uploaded} 个，未变 ${skipped} 个`)

  // 处理删除：远端有但本地没有的文件
  const localSet = new Set(files)
  const deletions = []
  for (const p of remoteBlobs.keys()) {
    if (localSet.has(p)) continue
    // .github 下的历史文件保留，其余以本地为准
    if (p.startsWith('.github/')) continue
    deletions.push(p)
  }
  for (const p of deletions) {
    console.log('  待删除:', p)
    treeEntries.push({ path: p, mode: '100644', type: 'blob', sha: null })
  }

  if (DRY || (treeEntries.length === 0 && deletions.length === 0)) {
    console.log(DRY ? '（dry run，未提交）' : '没有变化，无需提交')
    return
  }

  console.log('创建 tree…')
  const tree = await api('POST', `/repos/${REPO}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeEntries,
  })

  console.log('创建 commit…')
  const message = process.env.COMMIT_MESSAGE || 'chore: 同步更新'
  const commit = await api('POST', `/repos/${REPO}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [headSha],
  })

  console.log('更新分支引用…')
  await api('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha })

  console.log(`\n✓ 已提交 ${commit.sha.slice(0, 7)}（${uploaded} 个文件）`)
}

main().catch((e) => {
  console.error('✗ 推送失败:', e.message)
  process.exit(1)
})
