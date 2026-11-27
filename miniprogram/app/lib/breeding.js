const { normalize, smallPortrait } = require('./tool-data')
const { siteImage } = require('./site')

function breeders(records) {
  return records.flatMap(record => {
    const eggGroups = (record.eggGroups || []).filter(group => group && String(group).toLowerCase() !== 'null')
    if (!eggGroups.length) return []
    const normal = {
      id: record.id, baseId: record.id, number: record.number, title: record.title, eggGroups,
      eggLabel: eggGroups.join(' / '), image: smallPortrait(record.portrait), fallback: siteImage(record.portrait), rare: false,
      search: normalize(`${record.number}${record.title}${record.id}${eggGroups.join('')}`),
    }
    if (!record.rare || !record.rarePath) return [normal]
    return [normal, { ...normal, id: `${record.id}-rare`, title: `${record.title}异色`, rare: true,
      image: smallPortrait(record.rarePath), fallback: siteImage(record.rarePath), search: `${normal.search}异色` }]
  })
}

function sharesGroup(first, second) {
  return first.eggGroups.some(group => second.eggGroups.includes(group))
}

module.exports = { breeders, sharesGroup }
