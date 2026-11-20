export const ALL = 'all'
export const ATTRIBUTES = ['普通', '草', '火', '水', '光', '地', '冰', '龙', '电', '毒', '虫', '武', '翼', '萌', '幽', '恶', '机械', '幻']
export const STAT_LABELS = ['生命', '物攻', '魔攻', '物防', '魔防', '速度']
export const RARE_BADGE = './web_images/rare.png'

const attributeColors = {
  普通: '#6596ad', 草: '#4da665', 火: '#df7149', 水: '#619fdb', 光: '#59b6e5',
  地: '#b79855', 冰: '#71b7d8', 龙: '#d95b77', 电: '#d8ab38', 毒: '#a873c7',
  虫: '#95b746', 武: '#db8948', 翼: '#56b5b8', 萌: '#d884a7', 幽: '#9270c2',
  恶: '#b55d81', 机械: '#4eafa0', 幻: '#9095d1',
}

export function attributes(record) {
  return Array.isArray(record.attributes) ? record.attributes.filter(Boolean) : []
}

export function eggGroups(record) {
  return Array.isArray(record.eggGroups) ? record.eggGroups.filter(Boolean) : []
}

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase()
}

export function searchEntry(record) {
  const types = attributes(record)
  const groups = eggGroups(record)
  return {
    record,
    types: types.length ? types : ['普通'],
    groups,
    text: normalize([record.searchText, record.number, record.title, record.distribution, ...types, ...groups].join('')),
  }
}

export function filterRecords(index, filters) {
  const keyword = normalize(filters.query)
  return index.filter(({ record, types, groups, text }) =>
    (!keyword || text.includes(keyword)) &&
    (filters.attribute === ALL || types.includes(filters.attribute)) &&
    (filters.eggGroup === ALL || groups.includes(filters.eggGroup)) &&
    (filters.rare === ALL || Boolean(record.rare) === (filters.rare === 'yes')),
  ).map(({ record }) => record)
}

export function affinityStyle(record) {
  const [primary, secondary] = attributes(record)
  const color = attributeColors[primary] || '#b09369'
  return { '--species-accent': color, '--species-secondary': attributeColors[secondary] || color }
}

export function smallPortrait(record) {
  return String(record.portrait || '').replace('/portrait/', '/portrait-small/')
}

export function skillIcon(skill) {
  return skill.icon || `skills/${String(skill.name).replace(/[<>:"\\/|?*\x00-\x1f]/g, '_')}.png`
}

export function recordHref(id) {
  return `#${encodeURIComponent(id)}`
}

export function readHash() {
  const hash = location.hash.slice(1)
  try {
    return decodeURIComponent(hash)
  } catch {
    return hash
  }
}

export function valueOr(value, fallback = '暂无') {
  return value === null || value === undefined || value === '' ? fallback : value
}

export function rangeText(min, max, unit) {
  const values = [min, max].filter(value => valueOr(value, '') !== '')
  return values.length ? `${values.join(' - ')} ${unit}` : '暂无'
}
