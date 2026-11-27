const { normalize } = require('../../lib/tool-data')
const { typeOptions } = require('../../lib/catalog')

const typeNames = [...typeOptions.map(item => item.label), '无系别']

function mostCommon(values) {
  const counts = new Map()
  values.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) || 0) + 1))
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-CN'))[0]?.[0] || ''
}

function buildSkills(records) {
  const skills = new Map()
  for (const record of records) {
    for (const skill of (record.skills || [])) {
      if (!skill?.name) continue
      if (!skills.has(skill.name)) skills.set(skill.name, { name: skill.name, variants: [], users: new Map() })
      const entry = skills.get(skill.name)
      entry.variants.push({ record, skill })
      if (!entry.users.has(record.id)) entry.users.set(record.id, { record, skill })
    }
  }
  const research = records.flatMap(record => (record.research?.tasks || []).filter(task => task?.name)
    .map(task => ({ record, name: task.name, search: normalize(task.name) })))
  for (const entry of skills.values()) {
    const variants = entry.variants.map(item => item.skill)
    entry.type = mostCommon(variants.map(skill => skill.type)) || '无系别'
    entry.category = mostCommon(variants.map(skill => skill.category))
    entry.cost = mostCommon(variants.map(skill => skill.cost))
    entry.power = mostCommon(variants.map(skill => skill.power))
    entry.description = variants.map(skill => skill.description || '').sort((a, b) => b.length - a.length)[0]
    entry.icon = variants.find(skill => skill.iconExists && skill.icon)?.icon || variants.find(skill => skill.icon)?.icon
    entry.users = [...entry.users.values()].sort((a, b) => a.record.number.localeCompare(b.record.number, 'zh-CN', { numeric: true })
      || a.record.title.localeCompare(b.record.title, 'zh-CN'))
    const name = normalize(entry.name)
    entry.research = research.filter(task => task.search.includes(name))
  }
  return skills
}

function compareSkills(a, b) {
  const order = type => typeNames.includes(type) ? typeNames.indexOf(type) : typeNames.length
  return order(a.type) - order(b.type) || a.name.localeCompare(b.name, 'zh-CN')
}

function acquisition(entry) {
  const groups = new Map()
  for (const { record, skill } of entry.variants) {
    const source = skill.source || '其他'
    const unlock = skill.unlock || skill.level || '暂无条件'
    const key = `${source}|${unlock}`
    if (!groups.has(key)) groups.set(key, { key, source, unlock, pets: new Map() })
    groups.get(key).pets.set(record.id, record)
  }
  return [...groups.values()].sort((a, b) => a.source.localeCompare(b.source, 'zh-CN')
    || String(a.unlock).localeCompare(String(b.unlock), 'zh-CN', { numeric: true }))
}

module.exports = { typeNames, buildSkills, compareSkills, acquisition }
