const { handbookUrl } = require('./site')
const { getCatalogue, setOnlineCatalogue } = require('./catalog')

const storageKey = 'rocom-handbook-cache'
const checkInterval = 5 * 60 * 1000
let inFlight
let lastCheck = 0
let reachable = false

function call(api, method, options) {
  return new Promise((success, fail) => api[method]({ ...options, success, fail }))
}

function getVersion(headers) {
  const fields = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value]))
  const etag = fields.etag
  const modified = fields['last-modified']
  return typeof etag === 'string' && etag ? etag.replace(/^W\//i, '') : typeof modified === 'string' ? modified : ''
}

function savedCache() {
  try {
    const cached = wx.getStorageSync(storageKey)
    return cached && (cached.slot === 'a' || cached.slot === 'b') && typeof cached.version === 'string' ? cached : null
  } catch (_) {
    return null
  }
}

function cachePath(slot) {
  return `${wx.env.USER_DATA_PATH}/rocom-handbook-${slot}.json`
}

async function readCatalogue(fs, filename) {
  const { data } = await call(fs, 'readFile', { filePath: filename, encoding: 'utf8' })
  const { records } = JSON.parse(data)
  if (!Array.isArray(records) || !records.length || records.some(record => !record
    || typeof record.id !== 'string' || !record.id || typeof record.number !== 'string' || typeof record.title !== 'string')) {
    throw new Error('图鉴格式无效')
  }
  if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('图鉴编号重复')
  return records
}

function download() {
  let version = ''
  return new Promise((resolve, fail) => {
    const task = wx.downloadFile({
      url: handbookUrl,
      timeout: 25000,
      header: { 'Cache-Control': 'no-cache' },
      success(result) {
        if (result.statusCode !== 200 || !result.tempFilePath) {
          fail(new Error(`图鉴下载 HTTP ${result.statusCode}`))
          return
        }
        resolve({ file: result.tempFilePath, version: version || getVersion(result.header) })
      },
      fail,
    })
    task?.onHeadersReceived?.(({ header }) => { version = getVersion(header) })
  })
}

async function saveCatalogue(fs, file, version, previous) {
  if (!version) return
  const slot = previous?.slot === 'a' ? 'b' : 'a'
  await call(fs, 'copyFile', { srcPath: file, destPath: cachePath(slot) })
  wx.setStorageSync(storageKey, { slot, version })
  if (previous) await call(fs, 'unlink', { filePath: cachePath(previous.slot) }).catch(() => {})
}

async function checkHandbook() {
  const head = await call(wx, 'request', {
    url: handbookUrl, method: 'HEAD', timeout: 8000, header: { 'Cache-Control': 'no-cache' },
  })
  if (head.statusCode !== 200) throw new Error(`图鉴版本检查 HTTP ${head.statusCode}`)
  const version = getVersion(head.header)
  const current = getCatalogue()
  if (version && current.online && current.version === version) return

  const fs = wx.getFileSystemManager()
  const cached = savedCache()
  if (version && cached?.version === version) {
    try {
      setOnlineCatalogue(await readCatalogue(fs, cachePath(cached.slot)), version)
      return
    } catch (_) {
      // Recover from an incomplete or deleted cache with a fresh download.
    }
  }

  const incoming = await download()
  try {
    const records = await readCatalogue(fs, incoming.file)
    const receivedVersion = incoming.version || version
    setOnlineCatalogue(records, receivedVersion)
    await saveCatalogue(fs, incoming.file, receivedVersion, cached).catch(() => {})
  } finally {
    await call(fs, 'unlink', { filePath: incoming.file }).catch(() => {})
  }
}

function syncHandbook(force = false) {
  if (inFlight) return inFlight
  if (!force && lastCheck && Date.now() - lastCheck < checkInterval) return Promise.resolve(reachable)
  inFlight = checkHandbook().then(() => true, () => false).then(success => {
    reachable = success
    lastCheck = Date.now()
    inFlight = null
    return success
  })
  return inFlight
}

module.exports = { syncHandbook }
