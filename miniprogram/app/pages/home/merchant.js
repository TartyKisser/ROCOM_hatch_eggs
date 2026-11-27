const { siteImage } = require('../../lib/site')

const hours = ['', '08:00–12:00', '12:00–16:00', '16:00–20:00', '20:00–24:00']
const entities = { amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>' }

function plain(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, name) => {
    if (!name.startsWith('#')) return entities[name] || entity
    const hex = name[1].toLowerCase() === 'x'
    const point = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10)
    return point <= 0x10ffff ? String.fromCodePoint(point) : entity
  }).trim()
}

// Read the existing merchant endpoint without executing its scripts or inserting its HTML.
function parseMerchant(html) {
  if (typeof html !== 'string') throw new Error('商人数据格式有误')
  const list = html.match(/class=["'][^"']*\bshop-list\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)
  const periodText = html.match(/\bvar\s+index\s*=\s*(\d+)/)
  if (!list && !periodText) throw new Error('商人数据格式有误')
  const hour = new Date().getHours()
  const period = Number(periodText?.[1] ?? (hour < 8 ? 0 : Math.floor((hour - 8) / 4) + 1))
  const entries = Array.from((list?.[1] || '').matchAll(/<li\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/li>/gi), ([, attrs, body], id) => {
    const name = plain(body.match(/class=["']shop_name["'][^>]*>([\s\S]*?)<\/em>/i)?.[1] || '')
    const price = plain(body.match(/class=["']shop_price["'][^>]*>([\s\S]*?)<\/em>/i)?.[1] || '').replace(/^价格[:：]\s*/, '').replace(/\s+/g, '')
    const limit = plain(body.match(/class=["']gitem["'][\s\S]*?<em[^>]*>([\s\S]*?)<\/em>/i)?.[1] || '')
    const onclick = attrs.match(/onclick="([^"]*)"/i)?.[1] || ''
    const args = Array.from(onclick.matchAll(/'((?:\\'|[^'])*)'/g), match => plain(match[1].replace(/\\'/g, "'")))
    const classes = (attrs.match(/class=["']([^"']*)["']/i)?.[1] || '').split(/\s+/)
    return {
      id, name, price: price || '—', summary: [args[2], limit].filter(Boolean).join(' · '), description: args[3] || '',
      icon: siteImage(`web_images/shop/${name}.png`), matches: period > 0 && classes.includes(`show_${period}`),
      visible: !/display\s*:\s*none/i.test(attrs),
    }
  }).filter(item => item.name)
  const current = entries.filter(item => item.matches)
  return { period, hours: hours[period] || '', items: current.length ? current : entries.filter(item => item.visible) }
}

module.exports = { parseMerchant }
