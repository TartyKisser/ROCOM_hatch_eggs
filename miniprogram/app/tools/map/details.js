const { imageUrl } = require('./data')

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

function present(value) { return value != null && value !== '' && (!Array.isArray(value) || value.length > 0) }

function detailRows(detail, mirror) {
  const rows = []
  const row = (title, text = '', icon = '', heading = false) => rows.push({ key: rows.length, title, text, icon, heading })

  function append(value, label = '') {
    if (!present(value)) return
    if (Array.isArray(value)) {
      if (value.every(item => typeof item !== 'object')) row(label, value.join('、'))
      else {
        if (label) row(label)
        value.forEach(item => append(item))
      }
      return
    }
    if (typeof value !== 'object') { row(label, String(value)); return }
    if (label) row(label)
    const item = value.item || value
    const name = item.name || item.title
    if (name) {
      const title = `${name}${item.form ? `（${item.form}）` : ''}${present(value.count) ? ` × ${value.count}` : ''}`
      row(title, [item.description, value.possible && '可能掉落'].filter(Boolean).join('\n'), imageUrl(item.icon, mirror))
    }
    for (const [key, raw] of Object.entries(value)) {
      if (!present(raw) || ['icon', 'form', 'possible'].includes(key) || (name && ['name', 'title', 'description', 'count'].includes(key))) continue
      if (key === 'item' && name) {
        for (const field of ['colorName', 'type']) if (item[field]) append(item[field], fieldNames[field])
      } else if (key !== 'type' || typeof raw !== 'number') append(raw, fieldNames[key] || sectionNames[key] || key)
    }
  }

  if (detail.description) row('', detail.description)
  for (const [key, name] of Object.entries(sectionNames)) {
    if (!present(detail[key])) continue
    row(name, '', '', true)
    append(detail[key])
  }
  return rows
}

module.exports = { detailRows }

