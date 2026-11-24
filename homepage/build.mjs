import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const source = dirname(fileURLToPath(import.meta.url))
const site = resolve(source, '..')
const target = process.argv[2] ?? 'index.html'
const tools = target === 'tools' ? await import('./tool-pages.mjs') : null
if (!tools && target !== 'index.html' && target !== 'handbook.html') throw new Error(`未知的页面入口 ${target}`)
const pages = tools?.pages ?? [target]
const noticesPath = 'home-ui/assets/third-party-licenses.md'
const entries = await Promise.all(pages.map(async page => {
  const destination = join(site, page)
  return { page, destination, before: await readFile(destination) }
}))

const favicon = {
  name: 'rocom-favicon',
  transformIndexHtml: {
    order: 'pre',
    handler: () => [{
      tag: 'link',
      attrs: { rel: 'icon', type: 'image/png', sizes: '162x162', href: './assets/dimo-favicon-cropped.png' },
      injectTo: 'head',
    }],
  },
}

const result = await build({
  root: source,
  base: './',
  configFile: false,
  publicDir: false,
  plugins: tools ? [tools.toolPagesPlugin(), favicon] : [favicon],
  build: {
    assetsDir: 'home-ui/assets',
    license: { fileName: noticesPath },
    rolldownOptions: { input: pages.map(page => join(source, page)) },
    write: false,
  },
})

const files = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output)
for (const entry of entries) {
  const output = files.find(file => file.fileName === entry.page)
  if (!output || output.type !== 'asset') throw new Error(`构建没有生成 ${entry.page}`)
  entry.html = String(output.source)
  if (!entry.html.includes('="./home-ui/assets/')) {
    throw new Error(`${entry.page} 缺少构建后的资源链接`)
  }
}

for (const file of files) {
  if (pages.includes(file.fileName)) continue
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

const pending = []
try {
  for (const entry of entries) {
    const temp = join(site, `.${entry.page}-${process.pid}.tmp`)
    await writeFile(temp, entry.html, { flag: 'wx' })
    pending.push({ temp, destination: entry.destination })
  }
  for (const entry of entries) {
    if (!(await readFile(entry.destination)).equals(entry.before)) {
      throw new Error(`构建期间 ${entry.page} 有其他修改，已保留当前页面`)
    }
  }
  for (const { temp, destination } of pending) await rename(temp, destination)
} finally {
  await Promise.all(pending.map(({ temp }) => unlink(temp).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })))
}
console.log(`Built static pages at ${pages.join(', ')}.`)
