const { handbookRecords, normalize, appendRows } = require('../../lib/tool-data')
const { breeders, sharesGroup } = require('../breeding')
const { buildPairMap } = require('./layout')

const maxSelected = 10
const batchSize = 24

function place(point, scale, top) {
  return `left:${point.x * scale}rpx;top:${(point.y - top) * scale}rpx;width:${point.width * scale}rpx;height:${point.height * scale}rpx;`
}

Page({
  data: {
    loading: true, error: '', query: '', rarity: '', selected: [], focusText: '',
    rareChoices: [{ key: '', title: '全部' }, { key: 'no', title: '普通' }, { key: 'yes', title: '异色' }],
    regions: [], markers: [], mapHeight: 0, pairs: 0, rows: [], count: 0, more: false,
  },

  onLoad() { this.selection = []; this.focus = new Set(); this.nextSlot = 0; this.load() },
  onUnload() { this.unloaded = true },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      this.candidates = breeders(await handbookRecords({ allowBundled: true, force: Boolean(this.retried) }))
      if (!this.unloaded) this.filter()
    } catch (error) {
      if (!this.unloaded) this.setData({ error: error.message })
    } finally {
      this.retried = true
      if (!this.unloaded) this.setData({ loading: false })
    }
  },

  filter() {
    if (!this.candidates) return
    const term = normalize(this.data.query)
    const selected = this.selection.filter(sprite => this.focus.has(sprite.slotId))
    const rarity = this.data.rarity
    this.filtered = this.candidates.filter(candidate => (!term || candidate.search.includes(term))
      && (!rarity || candidate.rare === (rarity === 'yes')) && selected.every(sprite => sharesGroup(sprite, candidate)))
    const rows = this.candidateRows(0)
    this.setData({ rows, count: this.filtered.length, more: rows.length < this.filtered.length })
  },

  candidateRows(start) {
    return this.filtered.slice(start, start + batchSize).map(candidate => ({ ...candidate,
      matches: this.selection.filter(sprite => sharesGroup(sprite, candidate)).length }))
  },

  drawSelection() {
    const signature = this.selection.map(sprite => sprite.slotId).join(',')
    if (signature !== this.lastSignature) {
      this.layout = buildPairMap(this.selection)
      this.lastSignature = signature
    }
    const { width, positions, regions } = this.layout
    const scale = 650 / width
    const shapes = [...positions.values(), ...regions.flatMap(region => region.cells)]
    const top = shapes.length ? Math.min(...shapes.map(shape => shape.y)) - 12 : 0
    const bottom = shapes.length ? Math.max(...shapes.map(shape => shape.y + shape.height)) + 12 : 0
    const selected = this.selection.map((sprite, index) => ({ ...sprite, position: index + 1, focused: this.focus.has(sprite.slotId),
      matches: this.selection.filter(other => sprite.slotId !== other.slotId && sharesGroup(sprite, other)).length }))
    const focus = selected.filter(sprite => sprite.focused)
    this.setData({ selected, pairs: selected.reduce((total, sprite) => total + sprite.matches, 0) / 2,
      focusText: focus.length ? `筛选可与 ${focus.map(sprite => sprite.title).join('、')} 配对的精灵` : '',
      mapHeight: (bottom - top) * scale,
      markers: selected.map(sprite => ({ ...sprite, style: place(positions.get(sprite.slotId), scale, top) })),
      regions: regions.map(region => ({ group: region.group, fill: region.fill, border: region.border,
        focused: selected.filter(sprite => sprite.eggGroups.includes(region.group)).every(sprite => sprite.focused),
        cells: region.cells.map((cell, key) => ({ key, style: place(cell, scale, top) + `background:${region.fill};border-color:${cell.borderTop} ${cell.borderRight} ${cell.borderBottom} ${cell.borderLeft};border-radius:${cell.radius};` })) })),
    })
    this.filter()
  },

  add({ currentTarget: { dataset: { id } } }) {
    if (this.selection.length >= maxSelected) {
      wx.showToast({ title: '最多选择 10 只精灵', icon: 'none' })
      return
    }
    const candidate = this.candidates.find(item => item.id === id)
    if (!candidate) return
    const slotId = ++this.nextSlot
    this.selection.push({ ...candidate, slotId })
    this.focus = new Set([slotId])
    this.drawSelection()
  },

  remove({ currentTarget: { dataset: { slot } } }) {
    const id = Number(slot)
    this.selection = this.selection.filter(sprite => sprite.slotId !== id)
    this.focus.delete(id)
    this.drawSelection()
  },

  toggleFocus({ currentTarget: { dataset: { slot } } }) {
    const id = Number(slot)
    if (!this.focus.delete(id)) this.focus.add(id)
    this.drawSelection()
  },

  focusGroup({ currentTarget: { dataset: { group } } }) {
    const members = this.selection.filter(sprite => sprite.eggGroups.includes(group))
    const clear = members.every(sprite => this.focus.has(sprite.slotId))
    members.forEach(sprite => clear ? this.focus.delete(sprite.slotId) : this.focus.add(sprite.slotId))
    this.drawSelection()
  },

  clearSelection() { this.selection = []; this.focus.clear(); this.drawSelection() },
  clearFocus() { this.focus.clear(); this.drawSelection() },
  query({ detail: { value } }) { this.setData({ query: value }); this.filter() },
  clearSearch() { this.setData({ query: '' }); this.filter() },
  filterRare({ currentTarget: { dataset: { key } } }) { this.setData({ rarity: key }); this.filter() },
  onReachBottom() {
    if (!this.data.more) return
    const next = this.candidateRows(this.data.rows.length)
    appendRows(this, 'rows', next, { more: this.data.rows.length + next.length < this.filtered.length })
  },

  openHatch() {
    const ids = this.selection.map(sprite => sprite.id).join(',')
    wx.navigateTo({ url: `/tools/hatch/index${ids ? '?pair=' + encodeURIComponent(ids) : ''}` })
  },
})
