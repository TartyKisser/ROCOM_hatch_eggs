const { handbookRecords, smallPortrait, openRecord } = require('../../lib/tool-data')
const { buildFamilies, rankFamilies } = require('./engine')

const percent = value => `${(value * 100).toFixed(1)}%`

Page({
  data: { height: '', weight: '', loading: true, error: '', count: 0, summary: '', results: [] },

  onLoad() { this.load() },
  onUnload() { this.unloaded = true },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      this.engine = buildFamilies(await handbookRecords({ force: Boolean(this.retried) }))
      if (!this.unloaded) this.setData({ count: this.engine.families.length })
    } catch (err) {
      if (!this.unloaded) this.setData({ error: err.message })
    } finally {
      this.retried = true
      if (!this.unloaded) this.setData({ loading: false })
    }
  },

  setMeasurement({ detail: { value }, currentTarget: { dataset: { field } } }) {
    this.setData({ [field]: value })
  },

  predict() {
    if (!this.engine) return
    const height = Number(this.data.height)
    const weight = Number(this.data.weight)
    if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(weight) || weight <= 0) {
      this.setData({ summary: '身高和体重都需要填写大于 0 的数字。', results: [] })
      return
    }
    const results = rankFamilies(this.engine, height, weight).map(item => ({
      id: item.base.id, title: item.name, image: smallPortrait(item.base.portrait),
      number: item.base.number, attribute: item.attribute, members: item.members.length,
      height: `${item.heightMin} – ${item.heightMax} m`, weight: `${item.weightMin} – ${item.weightMax} kg`,
      probability: percent(item.probability), width: Math.max(2, item.probability * 100),
      center: percent(item.centerScore), diagonal: percent(item.diagonalScore), precision: `${item.compactnessScore.toFixed(2)}×`,
    }))
    this.setData({ results, summary: results.length ? `命中 ${results.length} 个家族` : '当前尺寸没有落入任何已知精灵蛋区间。' })
  },

  clear() { this.setData({ height: '', weight: '', summary: '', results: [] }) },
  openPet({ currentTarget: { dataset: { id } } }) { openRecord(id) },
})
