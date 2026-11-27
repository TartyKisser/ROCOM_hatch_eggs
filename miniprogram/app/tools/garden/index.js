const { requestSite, bundledRecords, handbookRecords, smallPortrait, normalize, openRecord } = require('../../lib/tool-data')
const { siteImage, uiImages } = require('../../lib/site')

const uidKey = 'rocom_home_last_uid'
const upstream = 'https://roco-eggs.tsuki-world.com'
const rows = value => Array.isArray(value) ? value : []
const baseName = value => String(value || '').replace(/（[^）]*）|\([^)]*\)/g, '').trim()
const uidValue = value => String(value || '').replace(/\D/g, '').slice(0, 10)

function upstreamImage(path) {
  if (!path || typeof path !== 'string') return ''
  if (/^https?:\/\//i.test(path)) return path.replace(/^http:/i, 'https:')
  if (path.startsWith('//')) return `https:${path}`
  return `${upstream}/${path.replace(/^\//, '')}`
}

function timeLeft(seconds) {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0))
  if (!value) return '可收获'
  const hours = Math.floor(value / 3600)
  const minutes = Math.ceil((value % 3600) / 60)
  return hours ? `${hours}时${minutes}分` : `${Math.max(1, minutes)}分`
}

function matchIndex(records) {
  const exact = new Map()
  const bases = new Map()
  records.forEach(record => {
    exact.set(normalize(record.title), record)
    const base = normalize(baseName(record.title))
    if (!bases.has(base)) bases.set(base, record)
  })
  return pet => {
    const names = [pet.name, pet.defaultName, pet.speciesName].map(normalize).filter(Boolean)
    for (const name of names) if (exact.has(name)) return exact.get(name)
    for (const name of names) if (bases.has(name)) return bases.get(name)
    return records.find(record => names.some(name => normalize(record.title).startsWith(name) || normalize(baseName(record.title)).includes(name)))
  }
}

function petCard(pet, findRecord, compact, index) {
  const record = findRecord(pet)
  const mutation = String(pet.mutation || '')
  const rare = mutation.includes('异色')
  const local = record && (rare && record.rarePath ? record.rarePath : record.portrait)
  const image = compact ? siteImage(local) : smallPortrait(local)
  const fallback = upstreamImage(pet.image)
  const name = pet.name || pet.defaultName || '-'
  const title = pet.nickname && pet.nickname !== pet.defaultName ? `${pet.defaultName || name}（${pet.nickname}）` : name
  const gender = String(pet.gender || '').toLowerCase()
  return { key: index, id: record?.id, title, image: image || fallback, fallback: image ? fallback : '',
    badge: mutation === '异色炫彩' ? siteImage('web_images/rareshine.png') : rare ? uiImages.rare : '',
    level: pet.level ? `Lv.${pet.level}` : '', gender: /雌|female/.test(gender) ? '♀' : /雄|male/.test(gender) ? '♂' : '',
    types: rows(pet.attrs).map(attr => typeof attr === 'string' ? attr : attr?.name).filter(Boolean)
      .map(label => ({ label, icon: siteImage(`web_images/types/${label}.png`) })),
    tags: [...rows(pet.eggGroups).filter(Boolean), pet.feedStatus === '可收集' ? '可收集灵感' : !compact && pet.feedStatus, pet.hasEgg && '可收取蛋'].filter(Boolean),
  }
}

function plantCards(plants, now) {
  if (!plants.length) return []
  const plots = new Map(plants.map(plant => [Number(plant.plot), plant]))
  return Array.from({ length: 15 }, (_, index) => {
    const plot = index + 1
    const plant = plots.get(plot)
    if (!plant?.seedId) return { plot, name: '空地', status: `地块 ${plot}` }
    const remaining = plant.ripeAt ? Number(plant.ripeAt) - now / 1000 : plant.remainingSeconds
    return { plot, name: plant.name || '作物', status: timeLeft(remaining), ripe: Number(remaining) <= 0,
      image: siteImage(`web_images/farm/${plant.name}.png`), fallback: upstreamImage(plant.image) }
  })
}

function homeRequest(action, data) {
  return requestSite(`home_proxy.php?action=${action}`, { method: 'POST', data, header: { 'Content-Type': 'application/json' } })
}

Page({
  data: { uid: '', loading: false, error: '', home: null, residents: [], guards: [], plants: [] },

  onLoad(options = {}) {
    this.sequence = 0
    this.findRecord = matchIndex(bundledRecords())
    let saved = ''
    try { saved = wx.getStorageSync(uidKey) } catch (_) { /* Storage is optional. */ }
    const uid = uidValue(options.uid || saved)
    this.setData({ uid })
    if (options.uid) this.query()
    handbookRecords({ allowBundled: true }).then(records => {
      if (this.unloaded) return
      this.findRecord = matchIndex(records)
      if (this.snapshot) this.renderHome()
    }).catch(() => {})
  },
  onUnload() { this.unloaded = true; this.sequence += 1 },

  editUid({ detail: { value } }) { this.setData({ uid: uidValue(value) }) },
  query() { return this.fetchHome(false) },
  refresh() { return this.fetchHome(true) },

  clear() {
    this.sequence += 1
    this.snapshot = null
    this.setData({ uid: '', loading: false, error: '', home: null, residents: [], guards: [], plants: [] })
  },

  async fetchHome(refresh) {
    const uid = this.data.uid
    if (!/^\d{5,10}$/.test(uid)) {
      this.setData({ error: '请输入正确的玩家 UID。' })
      return
    }
    const sequence = ++this.sequence
    this.setData({ loading: true, error: '' })
    try {
      const [payload, online] = await Promise.all([
        homeRequest('query', { uid: Number(uid), refresh }),
        homeRequest('online-status', { uid: Number(uid) }).catch(() => null),
      ])
      if (sequence !== this.sequence) return
      if (!payload || typeof payload !== 'object' || payload.detail) throw new Error(payload?.detail || '家园数据格式有误')
      this.snapshot = { ...payload, uid: payload.uid || uid, status: online?.status }
      this.renderHome()
      try { wx.setStorageSync(uidKey, uid) } catch (_) { /* The result is still displayed. */ }
    } catch (err) {
      if (sequence !== this.sequence) return
      this.snapshot = null
      this.setData({ home: null, residents: [], guards: [], plants: [], error: err.message || '家园查询失败。' })
    } finally {
      if (sequence === this.sequence) this.setData({ loading: false })
    }
  },

  renderHome() {
    const data = this.snapshot
    const pets = [...rows(data.residents), ...rows(data.guards)]
    const now = Date.now()
    const stats = [
      { label: '家园等级', value: data.home?.level ?? '-' },
      { label: '舒适度', value: data.home?.comfort == null ? '-' : Number(data.home.comfort).toLocaleString('zh-CN') },
      { label: '居住精灵', value: rows(data.residents).length },
      { label: '可收取蛋', value: pets.filter(pet => pet.hasEgg).length },
      { label: '可收集灵感', value: pets.filter(pet => pet.feedStatus === '可收集').length },
      { label: '可收获植物', value: rows(data.plants).filter(plant => plant.ripeAt && Number(plant.ripeAt) * 1000 <= now).length },
    ]
    this.setData({ home: { uid: data.uid, title: data.home?.name || '-', cached: Boolean(data.cached), stats,
      online: data.status === 'online' ? '在线' : data.status === 'offline' ? '离线' : '未知' },
    residents: rows(data.residents).map((pet, i) => petCard(pet, this.findRecord, false, i)),
    guards: rows(data.guards).map((pet, i) => petCard(pet, this.findRecord, true, i)), plants: plantCards(rows(data.plants), now) })
  },

  imageError({ currentTarget: { dataset: { list, index, src } } }) {
    const item = this.data[list]?.[index]
    if (item?.image === src) this.setData({ [`${list}[${index}].image`]: item.fallback || '', [`${list}[${index}].fallback`]: '' })
  },
  openPet({ currentTarget: { dataset: { id } } }) { if (id) openRecord(id) },
})
