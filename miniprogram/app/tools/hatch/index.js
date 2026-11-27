const { handbookRecords, normalize } = require('../../lib/tool-data')
const { breeders } = require('../../lib/breeding')
const { canBreed, manhattanDistance, findOptimalLayout } = require('./solver')

const counts = [2, 3, 4, 5, 6, 7, 8, 9, 10]
const emptySlot = slot => ({ slot, id: '', title: '', image: '', gender: 'male' })

function resultFor(sprites, positions) {
  const xs = positions.map(pos => pos.x)
  const ys = positions.map(pos => pos.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const columns = Math.max(...xs) - minX + 2
  const rows = Math.max(...ys) - minY + 2
  const size = Math.min(78, Math.floor(652 / columns))
  const nests = sprites.map((sprite, index) => ({ ...sprite, index,
    style: `left:${(positions[index].x - minX) * size}rpx;top:${(positions[index].y - minY) * size}rpx;width:${size * 2}rpx;height:${size * 2}rpx;` }))
  const pairs = []
  sprites.forEach((first, i) => sprites.slice(i + 1).forEach((second, offset) => {
    const j = i + offset + 1
    if (!canBreed(first, second)) return
    const distance = manhattanDistance(positions[i], positions[j])
    if (distance > 5) return
    pairs.push({ id: `${i}-${j}`, first: `${i + 1}. ${first.title} ${first.gender === 'male' ? '♂' : '♀'}`,
      second: `${j + 1}. ${second.title} ${second.gender === 'male' ? '♂' : '♀'}`, distance })
  }))
  return { width: columns * size, height: rows * size, size, nests, pairs }
}

Page({
  data: { counts, countIndex: 0, slots: [], loading: true, ready: false, error: '', openSlot: -1, search: '', suggestions: [],
    calculating: false, progress: 0, result: null },

  onLoad(options = {}) {
    try { this.imported = decodeURIComponent(options.pair || '').split(',').filter(Boolean).slice(0, 10) }
    catch (_) { this.imported = [] }
    this.setData({ slots: [emptySlot(0), emptySlot(1)] })
    this.load()
  },
  onUnload() { this.unloaded = true },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      this.sprites = breeders(await handbookRecords({ allowBundled: true, force: Boolean(this.retried) }))
      if (this.unloaded) return
      const imported = (this.imported || []).map(id => this.sprites.find(sprite => sprite.id === id)).filter(Boolean)
      const count = Math.max(2, imported.length)
      this.setData({ ready: true, countIndex: count - 2, slots: Array.from({ length: count }, (_, i) => ({ ...emptySlot(i), ...imported[i] })) })
    } catch (error) {
      if (!this.unloaded) this.setData({ error: error.message })
    } finally {
      this.retried = true
      if (!this.unloaded) this.setData({ loading: false })
    }
  },

  changeCount({ detail: { value } }) {
    if (this.data.calculating) return
    const countIndex = Number(value)
    this.setData({ countIndex, slots: Array.from({ length: counts[countIndex] }, (_, i) => this.data.slots[i] || emptySlot(i)),
      openSlot: -1, result: null, error: '' })
  },

  editSlot({ currentTarget: { dataset: { index } } }) {
    if (!this.sprites || this.data.calculating) return
    const slot = Number(index)
    const openSlot = this.data.openSlot === slot ? -1 : slot
    this.setData({ openSlot, search: '', suggestions: openSlot < 0 ? [] : this.sprites.slice(0, 8) })
  },

  searchPet({ detail: { value } }) {
    const term = normalize(value)
    this.setData({ search: value, suggestions: this.sprites.filter(sprite => sprite.search.includes(term)).slice(0, 12) })
  },

  pickPet({ currentTarget: { dataset: { id } } }) {
    const index = this.data.openSlot
    const sprite = this.sprites.find(item => item.id === id)
    if (index < 0 || !sprite) return
    this.setData({ [`slots[${index}]`]: { ...sprite, slot: index, gender: this.data.slots[index].gender }, openSlot: -1, result: null, error: '' })
  },

  setGender({ currentTarget: { dataset: { index, gender } } }) {
    if (this.data.calculating) return
    this.setData({ [`slots[${index}].gender`]: gender, result: null })
  },

  async generate() {
    if (this.data.calculating) return
    const slots = this.data.slots.map(slot => ({ ...slot }))
    if (slots.some(slot => !slot.id)) {
      this.setData({ error: '请为每个小窝选择一只精灵。' })
      return
    }
    this.setData({ calculating: true, openSlot: -1, progress: 0, error: '', result: null })
    const solver = findOptimalLayout(slots)
    try {
      let step
      do {
        await new Promise(resolve => setTimeout(resolve, 0))
        if (this.unloaded) return
        step = solver.next()
        if (!step.done) this.setData({ progress: Math.round(step.value * 100) })
      } while (!step.done)
      this.setData({ result: resultFor(slots, step.value) }, () => wx.pageScrollTo({ selector: '#nest-result', duration: 200 }))
    } catch (_) {
      this.setData({ error: '暂时无法完成排布，请重试。' })
    } finally {
      if (!this.unloaded) this.setData({ calculating: false })
    }
  },
})
