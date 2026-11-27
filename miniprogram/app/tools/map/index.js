const { loadMapFile, normalizeMap, location, regionAt, presets, defaultCategory, collectible } = require('./data')
const { WorldCanvas } = require('./canvas')
const { detailRows } = require('./details')

const storageKey = 'rocom-world-map:'
const batchSize = 40

function readSet(key) {
  try {
    const result = wx.getStorageSync(storageKey + key)
    return Array.isArray(result) ? new Set(result) : null
  } catch (_) { return null }
}

function storeSet(key, values) {
  try { wx.setStorageSync(storageKey + key, [...values]) } catch (_) { /* The current session still works. */ }
}

function describe(point) {
  return { id: point.id, title: point.name, icon: point.icon, location: location(point), genre: point.category.genre }
}

function touch(event, point) {
  if (!point) return null
  return { x: point.x ?? point.pageX - event.currentTarget.offsetLeft, y: point.y ?? point.pageY - event.currentTarget.offsetTop }
}

function gesture(event) {
  const first = touch(event, event.touches?.[0])
  if (!first) return null
  const second = touch(event, event.touches[1])
  return second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, distance: Math.hypot(first.x - second.x, first.y - second.y) }
    : { ...first, distance: 0 }
}

Page({
  data: {
    loading: true, error: '', terrainFailed: false, season: '',
    mapFilter: { key: 'map', label: '地图', index: 0, options: [], columns: 2 },
    floorFilter: { key: 'floor', label: '图层', index: 0, options: [], columns: 3 },
    filterOpen: false, presets: presets.map(preset => preset.label), presetIndex: 0, groups: [], group: '',
    hideCollected: false, count: 0, query: '', found: [], foundCount: 0,
    region: '', visible: 0, zoom: 100, nearby: [], nearbyCount: 0, detail: null,
    details: [], moreDetails: false, detailLoading: false, detailError: '',
  },

  onLoad(options = {}) {
    this.options = options
    this.sceneToken = 0
    this.detailToken = 0
    this.collected = readSet('collected') || new Set()
    this.load()
  },
  onReady() { this.connectCanvas() },
  onResize() { this.connectCanvas() },
  onUnload() {
    this.unloaded = true
    this.sceneToken++
    this.detailToken++
    clearTimeout(this.searchTimer)
    this.frame?.close()
  },

  connectCanvas() {
    wx.createSelectorQuery().select('#world-canvas').fields({ node: true, size: true }).exec(([view]) => {
      if (this.unloaded) return
      if (!view?.node || !view.width || !view.height) {
        this.setData({ error: '无法初始化地图画布，请更新微信后重试。' })
        return
      }
      const ratio = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio
      if (this.frame) this.frame.resize(view.node, view.width, view.height, ratio)
      else {
        this.frame = new WorldCanvas(view.node, view.width, view.height, ratio, state => this.report(state))
        if (this.map) this.attachScene()
      }
    })
  },

  report({ count, zoom, mx, my, terrainFailed }) {
    const center = `${Math.round(mx)},${Math.round(my)},${this.floor}`
    if (center !== this.lastCenter) {
      this.lastCenter = center
      this.centerRegion = regionAt(this.map, this.floor, mx, my)
    }
    const region = this.selected ? location(this.selected) || this.selected.name : this.centerRegion
    if (this.data.visible !== count || this.data.zoom !== zoom || this.data.region !== region || this.data.terrainFailed !== terrainFailed) {
      this.setData({ visible: count, zoom, region, terrainFailed })
    }
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const [manifest, mirror] = await Promise.all([loadMapFile('manifest.json', true), loadMapFile('mini-icons.json', true)])
      if (this.unloaded) return
      if (manifest.schema !== 1 || !manifest.maps?.mainland) throw new Error('地图数据版本不兼容')
      this.mirror = mirror
      this.maps = Object.entries(manifest.maps).map(([key, entry]) => ({ key, label: entry.name, file: entry.file }))
      const mapIndex = Math.max(0, this.maps.findIndex(map => map.key === this.options.map))
      this.setData({ 'mapFilter.options': this.maps })
      await this.loadScene(mapIndex, this.options.layer)
    } catch (err) {
      if (!this.unloaded) this.setData({ loading: false, error: err.message || '地图资料加载失败。' })
    }
  },

  async loadScene(mapIndex, floor = 'surface') {
    const sceneToken = ++this.sceneToken
    const entry = this.maps?.[mapIndex]
    if (!entry) return
    this.closeDetails()
    this.clearSearch(false)
    this.setData({ 'mapFilter.index': mapIndex, loading: true, error: '' })
    try {
      const raw = await loadMapFile(entry.file)
      if (this.sceneToken !== sceneToken) return
      this.map = normalizeMap(raw, this.mirror)
      const patch = this.map.patches.find(item => item.id === floor)
      this.patch = patch || null
      this.floor = this.map.floors[floor] ? floor : patch?.floors[0] || 'surface'
      this.floors = Object.entries(this.map.floors).map(([key, label]) => ({ key, label }))
      this.categoryKey = `filters:${entry.key}`
      const saved = readSet(this.categoryKey)
      this.enabled = new Set(this.map.categories.filter(category => saved ? saved.has(category.id) : defaultCategory(category)).map(category => category.id))
      this.lastCenter = null
      this.setData({ 'floorFilter.options': this.floors, 'floorFilter.index': this.floors.findIndex(entry => entry.key === this.floor),
        season: this.map.season, loading: false, region: entry.label, group: '', terrainFailed: false })
      this.applyFilters()
      this.attachScene()
    } catch (_) {
      if (this.sceneToken === sceneToken) this.setData({ loading: false, error: `${entry.label}加载失败。` })
    }
  },

  attachScene() {
    if (!this.frame) return
    this.frame.setMap(this.map)
    this.frame.filter(this.floor, this.points, this.selected)
    if (this.patch) this.frame.center(this.patch.x + this.patch.width / 2, this.patch.y + this.patch.height / 2)
  },

  retry() {
    if (!this.frame) this.connectCanvas()
    if (this.maps) return this.loadScene(this.data.mapFilter.index, this.floor)
    return this.load()
  },
  selectLocation({ detail: { key, index } }) {
    if (this.data.loading) return
    if (key === 'map') return this.loadScene(index)
    const floor = this.floors?.[index]
    if (!floor) return
    this.closeDetails()
    this.setFloor(floor.key)
  },
  setFloor(key) {
    this.floor = key
    this.setData({ 'floorFilter.index': this.floors.findIndex(floor => floor.key === key), group: '' })
    this.applyFilters()
  },

  onFloor(point) { return this.floor === 'surface' || point.floors.has(this.floor) },

  applyFilters(updateFrame = true) {
    if (!this.map) return
    const local = this.map.points.filter(point => this.onFloor(point))
    this.points = local.filter(point => (!this.data.hideCollected || !this.collected.has(point.id))
      && (this.matches ? this.matches.has(point.id) : this.enabled.has(point.category.id)))
    const counts = new Map()
    local.forEach(point => counts.set(point.category.id, (counts.get(point.category.id) || 0) + 1))
    const groups = new Map()
    this.map.categories.forEach(category => {
      if (!counts.has(category.id)) return
      if (!groups.has(category.className)) groups.set(category.className, [])
      groups.get(category.className).push({ id: category.id, name: category.genre, icon: category.icon, count: counts.get(category.id), enabled: this.enabled.has(category.id) })
    })
    const presetIndex = this.matches ? -1 : presets.findIndex(preset => {
      const selected = this.map.categories.filter(preset.test)
      return selected.length > 0 && selected.length === this.enabled.size && selected.every(category => this.enabled.has(category.id))
    })
    this.setData({ groups: [...groups.entries()].map(([name, categories]) => ({ name, categories })), count: this.points.length, presetIndex })
    if (updateFrame && this.frame?.map === this.map) this.frame.filter(this.floor, this.points, this.selected)
  },

  changeCategories(test) {
    if (!this.map) return
    this.clearSearch(false)
    this.enabled = new Set(this.map.categories.filter(test).map(category => category.id))
    storeSet(this.categoryKey, this.enabled)
    this.applyFilters()
  },
  selectPreset({ currentTarget: { dataset: { index } } }) { this.changeCategories(presets[index].test) },
  showAll() { this.changeCategories(() => true) },
  hideAll() { this.changeCategories(() => false) },
  resetFilters() { this.setData({ hideCollected: false }); this.changeCategories(defaultCategory) },
  toggleCategory({ currentTarget: { dataset: { id } } }) {
    this.clearSearch(false)
    if (!this.enabled.delete(id)) this.enabled.add(id)
    storeSet(this.categoryKey, this.enabled)
    this.applyFilters()
  },
  toggleGroup({ currentTarget: { dataset: { group } } }) { this.setData({ group: this.data.group === group ? '' : group }) },
  toggleFilters() { this.setData({ filterOpen: !this.data.filterOpen }) },
  changeCollected({ detail: { value } }) { this.setData({ hideCollected: value }); this.applyFilters() },

  onSearch({ detail: { value } }) {
    this.setData({ query: value })
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.search(), 110)
  },
  clearSearch(apply = true) {
    clearTimeout(this.searchTimer)
    this.matches = null
    this.setData({ query: '', found: [], foundCount: 0 })
    if (apply !== false) this.applyFilters()
  },
  search() {
    if (!this.map) return
    const query = this.data.query.trim().toLowerCase()
    if (!query) { this.clearSearch(); return }
    const words = query.split(/\s+/)
    const matches = this.map.points.filter(point => words.every(word => point.search.includes(word)))
    const exact = matches.find(point => point.name === query)
    const sample = exact ? [exact, ...matches.filter(point => point !== exact).slice(0, 7)] : matches.slice(0, 8)
    this.matches = new Set(matches.map(point => point.id))
    this.setData({ found: sample.map(describe), foundCount: matches.length })
    this.applyFilters()
  },

  navigatePoint(point) {
    if (!this.onFloor(point) || (this.floor === 'surface' && point.layers.length)) this.setFloor(point.layers[0]?.floors[0] || 'surface')
    if (!this.matches) this.enabled.add(point.category.id)
    this.setData({ filterOpen: false })
    this.frame?.center(point.mx, point.my)
    this.openDetails(point)
  },
  pickSearch({ currentTarget: { dataset: { id } } }) {
    const point = this.map?.byId.get(id)
    if (point) this.navigatePoint(point)
  },
  goUnderground() { if (this.selected) this.navigatePoint(this.selected) },

  touchStart(event) {
    this.gesture = gesture(event)
    this.changed = Boolean(this.gesture?.distance)
  },
  touchMove(event) {
    const next = gesture(event)
    const last = this.gesture
    this.gesture = next
    if (!next || !last || !this.frame?.map) return
    const dx = next.x - last.x
    const dy = next.y - last.y
    if (next.distance && last.distance) this.frame.zoom(next.distance / last.distance, last.x, last.y)
    this.frame.move(dx, dy)
    if (Math.abs(dx) + Math.abs(dy) > 2 || next.distance) this.changed = true
  },
  touchEnd(event) {
    if (event.touches?.length) { this.gesture = gesture(event); this.changed = true; return }
    const point = touch(event, event.changedTouches?.[0])
    if (!this.changed && point && this.frame?.map) this.pick(this.frame.pick(point.x, point.y))
    this.gesture = null
  },
  touchCancel() { this.gesture = null; this.changed = true },
  zoomIn() { this.frame?.zoom(1.5) },
  zoomOut() { this.frame?.zoom(1 / 1.5) },
  fit() { this.frame?.reset() },

  pick(points) {
    if (points.length === 1) { this.openDetails(points[0]); return }
    this.closeDetails()
    this.nearby = points
    if (points.length) this.setData({ nearby: points.slice(0, 32).map(describe), nearbyCount: points.length }, () => wx.pageScrollTo({ selector: '#map-popup', duration: 160 }))
  },
  expandNearby() { this.setData({ nearby: this.nearby.slice(0, this.data.nearby.length + 32).map(describe) }) },
  zoomNearby() {
    const count = this.nearby.length
    const center = this.nearby.reduce((sum, point) => [sum[0] + point.mx / count, sum[1] + point.my / count], [0, 0])
    this.frame.center(center[0], center[1], this.frame.scale / this.frame.fitScale * 1.8)
    this.closeDetails()
  },
  pickNearby({ currentTarget: { dataset: { id } } }) {
    const point = this.map.byId.get(id)
    if (point) this.openDetails(point)
  },

  closeDetails() {
    this.detailToken++
    this.selected = null
    this.setData({ detail: null, nearby: [], nearbyCount: 0 })
    if (this.frame?.map && this.points) this.frame.filter(this.floor, this.points, null)
  },

  async openDetails(point) {
    const token = ++this.detailToken
    this.selected = point
    const detail = { ...describe(point), meta: `${point.category.genre} · ${location(point)} · X ${point.x} · Y ${point.y}`,
      collect: collectible.has(point.category.genre), collected: this.collected.has(point.id),
      hasLayers: point.layers.length > 0 && this.floor === 'surface',
      estimated: point.estimated || point.category.classId === 7 }
    this.setData({ detail, nearby: [], nearbyCount: 0, detailLoading: true, details: [], moreDetails: false, detailError: '' },
      () => wx.pageScrollTo({ selector: '#map-popup', duration: 160 }))
    this.applyFilters()
    try {
      const page = await loadMapFile(this.map.details[Math.floor(point.detailIndex / this.map.detailPageSize)])
      if (this.detailToken !== token) return
      const data = page[point.detailIndex % this.map.detailPageSize]
      if (!data) throw new Error('暂无详细资料')
      this.detailRows = detailRows(data, this.mirror)
      this.setData({ 'detail.title': data.title || detail.title, details: this.detailRows.slice(0, batchSize),
        moreDetails: this.detailRows.length > batchSize, detailLoading: false })
    } catch (_) {
      if (this.detailToken === token) this.setData({ detailError: '点位详情暂无法加载。', detailLoading: false })
    }
  },
  retryDetails() { if (this.selected) this.openDetails(this.selected) },
  loadMoreDetails() {
    const details = this.detailRows.slice(0, this.data.details.length + batchSize)
    this.setData({ details, moreDetails: details.length < this.detailRows.length })
  },
  collect() {
    const point = this.selected
    if (!point) return
    if (!this.collected.delete(point.id)) this.collected.add(point.id)
    storeSet('collected', this.collected)
    this.setData({ 'detail.collected': this.collected.has(point.id) })
    this.applyFilters()
  },
})
