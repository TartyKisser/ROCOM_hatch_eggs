const { getCard, getCatalogue } = require('./catalog')
const { syncHandbook } = require('./sync')
const { origin, siteImage } = require('./site')

function requestSite(path, options = {}) {
  return new Promise((resolve, reject) => wx.request({
    ...options,
    url: `${origin}/${path}`,
    timeout: options.timeout || 12000,
    success({ statusCode, data }) {
      if (statusCode >= 200 && statusCode < 300) resolve(data)
      else reject(new Error(data?.detail || data?.message || `服务返回 HTTP ${statusCode}`))
    },
    fail() { reject(new Error('暂时无法连接工具站，请重试')) },
  }))
}

function bundledRecords() {
  return getCatalogue(false).index.map(({ card, attributes }) => ({
    id: card.id,
    number: card.number,
    title: card.title,
    eggGroups: card.eggGroups,
    attributes,
    portrait: `sprite_imgs/portrait/${card.id}-portrait.png`,
    rare: card.rare,
    rarePath: card.rare ? `sprite_imgs/portrait/${card.id}异色-portrait.png` : '',
  }))
}

async function handbookRecords({ force = false, allowBundled = false } = {}) {
  if (force || !getCatalogue().online) await syncHandbook(force)
  const catalogue = getCatalogue()
  if (catalogue.online) return [...catalogue.details.values()]
  if (allowBundled) return bundledRecords()
  throw new Error('请联网加载图鉴资料')
}

function smallPortrait(path) {
  return siteImage(typeof path === 'string' ? path.replace('/portrait/', '/portrait-small/') : '')
}

function openRecord(id) {
  const card = getCard(id)
  if (card) wx.navigateTo({ url: card.route })
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase()
}

function appendRows(page, field, rows, state = {}) {
  const offset = page.data[field].length
  const patch = { ...state }
  rows.forEach((row, index) => { patch[`${field}[${offset + index}]`] = row })
  page.setData(patch)
}

module.exports = { requestSite, bundledRecords, handbookRecords, smallPortrait, openRecord, normalize, appendRows }
