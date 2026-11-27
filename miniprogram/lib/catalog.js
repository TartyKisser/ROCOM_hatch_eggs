const { types, records } = require('../generated/catalog')
const { siteImage } = require('./site')

const colors = {
  普通: '#6596ad', 草: '#4da665', 火: '#df7149', 水: '#619fdb', 光: '#59b6e5',
  地: '#b79855', 冰: '#71b7d8', 龙: '#d95b77', 电: '#d8ab38', 毒: '#a873c7',
  虫: '#95b746', 武: '#db8948', 翼: '#56b5b8', 萌: '#d884a7', 幽: '#9270c2',
  恶: '#b55d81', 机械: '#4eafa0', 幻: '#9095d1',
}

const typeOptions = types.map((label, index) => ({ label, icon: `/generated/ui/type-${index}.png` }))
const typesByName = new Map(typeOptions.map(type => [type.label, type]))

function blend(base, tint, amount) {
  const rgb = [1, 3, 5].map(offset => Math.round(
    parseInt(base.slice(offset, offset + 2), 16) * (1 - amount)
    + parseInt(tint.slice(offset, offset + 2), 16) * amount,
  ))
  return `rgb(${rgb.join(',')})`
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase()
}

function toEntry(record, online, version, fallbackThumb) {
  const attributes = Array.isArray(record.attributes) ? record.attributes.filter(Boolean) : []
  const [primary, secondary] = attributes
  const accent = colors[primary] || '#b09369'
  const background = `linear-gradient(145deg, ${blend('#fff8ed', accent, .33)}, ${blend('#fffaf1', colors[secondary] || accent, .12)})`
  const eggGroups = Array.isArray(record.eggGroups) ? record.eggGroups.filter(Boolean) : []
  const portrait = typeof record.portrait === 'string' ? record.portrait : ''
  const thumb = online
    ? siteImage(portrait.replace('/portrait/', '/portrait-small/'), version)
    : record.thumb && `/generated/thumbs/${record.thumb}`
  const card = {
    id: record.id,
    title: record.title,
    number: record.number,
    rare: Boolean(record.rare),
    eggGroups,
    types: attributes.map(label => typesByName.get(label) || { label }),
    thumb: thumb || fallbackThumb,
    fallbackThumb,
    accent,
    background,
    route: online
      ? `/pages/detail/index?id=${encodeURIComponent(record.id)}`
      : `/generated/dex-${String(record.package).padStart(2, '0')}/index?id=${encodeURIComponent(record.id)}`,
  }
  return {
    card,
    attributes: attributes.length ? attributes : ['普通'],
    search: normalize([record.searchText || record.search, record.number, record.title, record.distribution, ...attributes, ...eggGroups].join('')),
  }
}

function createCatalogue(source, online, version) {
  const index = source.map(record => toEntry(record, online, version, online ? bundled.byId.get(record.id)?.thumb || '' : ''))
  return {
    online,
    version,
    index,
    byId: new Map(index.map(({ card }) => [card.id, card])),
    details: online ? new Map(source.map(record => [record.id, record])) : null,
    eggGroups: [...new Set(index.flatMap(({ card }) => card.eggGroups))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  }
}

const bundled = createCatalogue(records, false, '')
let online = null

function setOnlineCatalogue(source, version) {
  const catalogue = createCatalogue(source, true, version)
  online = catalogue
  return catalogue
}

function getCatalogue(preferOnline = true) {
  return (preferOnline && online) || bundled
}

function filterCards({ query, attribute, eggGroup, rare }, catalogue = getCatalogue()) {
  const term = normalize(query)
  return catalogue.index.filter(entry =>
    (!term || entry.search.includes(term))
    && (!attribute || entry.attributes.includes(attribute))
    && (!eggGroup || entry.card.eggGroups.includes(eggGroup))
    && (!rare || entry.card.rare === (rare === 'yes')),
  ).map(entry => entry.card)
}

function getCard(id, catalogue = getCatalogue()) {
  return catalogue.byId.get(id)
}

function decodeId(id) {
  try {
    return decodeURIComponent(id || '')
  } catch {
    return ''
  }
}

module.exports = { typeOptions, filterCards, getCard, getCatalogue, setOnlineCatalogue, decodeId }
