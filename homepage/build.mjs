import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const source = dirname(fileURLToPath(import.meta.url))
const site = resolve(source, '..')
const indexPath = join(site, 'index.html')
const noticesPath = 'home-ui/assets/third-party-licenses.md'
const before = await readFile(indexPath)

const result = await build({
  root: source,
  base: './',
  configFile: false,
  publicDir: false,
  build: { assetsDir: 'home-ui/assets', license: { fileName: noticesPath }, write: false },
})

const files = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output)
const entry = files.find(file => file.fileName === 'index.html')
if (!entry || entry.type !== 'asset') throw new Error('首页构建没有生成 index.html')

const html = String(entry.source)
if (!html.includes('type="module"') || !html.includes('="./home-ui/assets/')) {
  throw new Error('首页 HTML 缺少构建后的资源链接')
}

for (const file of files) {
  if (file === entry) continue
  if (!/^home-ui\/assets\/[\w.-]+$/.test(file.fileName)) {
    throw new Error(`无法发布构建文件 ${file.fileName}`)
  }
  const contents = file.type === 'chunk' ? file.code : file.source
  const fileName = file.fileName === noticesPath
    ? noticesPath.replace('.md', `-${createHash('sha256').update(contents).digest('hex').slice(0, 12)}.md`)
    : file.fileName
  const destination = join(site, fileName)
  await mkdir(dirname(destination), { recursive: true })
  try {
    await writeFile(destination, contents, { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    if (!(await readFile(destination)).equals(Buffer.from(contents))) throw error
  }
}

const pending = join(site, `.homepage-${process.pid}.html`)
await writeFile(pending, html, { flag: 'wx' })
try {
  if (!(await readFile(indexPath)).equals(before)) {
    throw new Error('构建期间 index.html 有其他修改，已保留当前页面')
  }
  await rename(pending, indexPath)
} finally {
  await unlink(pending).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })
}
console.log('Built static homepage at index.html.')
