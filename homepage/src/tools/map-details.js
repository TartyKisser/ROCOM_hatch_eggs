const sectionNames = {
  habitat: '精灵栖息地', rewardSections: '奖励与对战', owlSanctuary: '眠枭庇护所',
  shops: '商店货单', dungeon: '副本资料', fruitTree: '智慧树苗', quiz: '问答与线索',
  forceTester: '力气测试仪', music: '可收录曲目', lottery: '抽屉奖励',
  magicSource: '魔力之源', opponentMagic: '对手魔力',
}

const fieldNames = {
  name: '名称', title: '名称', description: '说明', subtitle: '副标题', group: '分组', type: '类型',
  item: '物品', count: '数量', quantity: '每份数量', limit: '限购', amount: '金额',
  price: '价格', value: '数值', form: '形态', types: '系别', rewards: '奖励', pets: '精灵',
  belongCampName: '所属区域', commonTypes: '常见系别', tracks: '曲目', question: '问题', answer: '答案',
  unlock: '解锁', upgrade: '升级', specialFruits: '特殊果实', colorName: '颜色', specialEggs: '特殊精灵蛋',
  note: '备注', location: '地点', petName: '精灵', fixedNatures: '固定性格', fixedStats: '固定属性',
  fixedTalent: '固定资质', stock: '货单', level: '等级', effects: '效果', nextUpgrade: '下一级',
  weightMin: '最低体重（千克）', weightMax: '最高体重（千克）', unlockRequirement: '解锁条件',
  drawers: '抽屉', completionRewards: '完成奖励', materials: '材料', picnicItems: '招待道具',
  maxLevel: '最高等级', levels: '等级效果', durationMultiplier: '时长倍率', requirement: '要求',
  periods: '时段', opponentMagic: '对手魔力',
}

export function node(tag, className, text) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

export function markerImage(src, className) {
  const image = node('img', className)
  image.alt = ''
  image.loading = 'lazy'
  image.decoding = 'async'
  image.referrerPolicy = 'no-referrer'
  image.src = src
  image.addEventListener('error', () => { image.hidden = true })
  return image
}

function present(value) {
  return value !== null && value !== undefined && value !== '' &&
    (!Array.isArray(value) || value.length > 0)
}

function appendList(parent, value) {
  const list = node('ul', 'map-detail-list')
  for (const record of value) {
    const item = node('li')
    appendValue(item, record)
    list.append(item)
  }
  parent.append(list)
}

function appendValue(parent, value) {
  if (!present(value)) return
  if (Array.isArray(value)) {
    if (value.every(item => typeof item !== 'object')) {
      parent.append(document.createTextNode(value.join('、')))
    } else {
      appendList(parent, value)
    }
    return
  }
  if (typeof value !== 'object') {
    parent.append(document.createTextNode(String(value)))
    return
  }

  const main = value.item || value
  const title = main.name || main.title
  if (title) {
    const row = node('div', 'map-detail-item')
    if (main.icon) row.append(markerImage(main.icon))
    const copy = node('div')
    const suffix = present(value.count) ? ` × ${value.count}` : ''
    const name = main.form ? `${title}（${main.form}）` : title
    copy.append(node('strong', '', name + suffix))
    if (main.description) copy.append(node('small', 'map-detail-copy', main.description))
    if (value.possible) copy.append(node('small', '', '可能掉落'))
    row.append(copy)
    parent.append(row)
  }

  const fields = node('dl', 'map-detail-fields')
  for (const [key, raw] of Object.entries(value)) {
    if (!present(raw) || ['icon', 'form', 'possible'].includes(key) ||
        (title && ['name', 'title', 'description', 'count'].includes(key))) continue
    if (key === 'item' && title) {
      for (const name of ['colorName', 'type']) {
        if (main[name]) fields.append(node('dt', '', fieldNames[name]), node('dd', '', main[name]))
      }
      continue
    }
    if (key === 'type' && typeof raw === 'number') continue
    const label = fieldNames[key] || sectionNames[key] || key
    const nested = typeof raw === 'object' && (!Array.isArray(raw) || raw.some(item => typeof item === 'object'))
    const cell = node('dd', nested ? 'map-detail-nested' : '')
    appendValue(cell, raw)
    if (cell.childNodes.length) fields.append(node('dt', nested ? 'map-detail-nested' : '', label), cell)
  }
  if (fields.childNodes.length) parent.append(fields)
}

export function renderMapDetails(parent, details) {
  const content = document.createDocumentFragment()
  if (details.description) content.append(node('p', 'map-detail-copy', details.description))
  for (const [key, name] of Object.entries(sectionNames)) {
    if (!present(details[key])) continue
    const section = node('section', 'map-detail-group')
    section.append(node('h3', '', name))
    appendValue(section, details[key])
    content.append(section)
  }
  parent.replaceChildren(content)
}
