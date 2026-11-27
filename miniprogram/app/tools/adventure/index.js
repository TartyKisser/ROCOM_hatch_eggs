const { requestSite, handbookRecords, smallPortrait, normalize, openRecord } = require('../../lib/tool-data')
const { uiImages } = require('../../lib/site')
const { buildModel, fruitPaths, recommend, formatScore, candidateMatchesTerm } = require('./engine')

const batchSize = 16
const sortNames = { score: '星光值', rare: '少歪异色' }

function familyCard(family) {
  return { id: family.representative.id, title: family.title, image: smallPortrait(family.portrait), number: family.number,
    attribute: family.firstAttribute, score: formatScore(family.baseStarlightValue) }
}

function strategyCard(strategy) {
  const { target, first, second, rules, score, otherTargets } = strategy
  return { key: `${target.key}/${first.key}/${second?.key || ''}`, target: familyCard(target),
    pets: [first, second].filter(Boolean).map(familyCard), rules, score: formatScore(score),
    others: otherTargets.map(other => ({ ...familyCard(other.target), rules: other.rules.join(' / ') })) }
}

Page({
  data: { loading: true, error: '', mode: 'mixed', firstQuery: '', secondQuery: '', suggestions: [], suggestField: '',
    targetOptions: [{ key: '', label: '全部异色目标' }], targetIndex: 0, sort: [{ key: 'rare', label: sortNames.rare }, { key: 'score', label: sortNames.score }],
    rows: [], count: 0, page: 1, pages: 1, starlight: uiImages.starlight, showRules: false, rules: '', rulesError: '', rulesLoading: false },

  onLoad() { this.load() },
  onUnload() { this.unloaded = true },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const [records, csv, page] = await Promise.all([
        handbookRecords({ force: Boolean(this.retried) }),
        requestSite('rare.csv', { dataType: 'text', header: { 'Cache-Control': 'no-cache' } }),
        requestSite('adventure.html', { dataType: 'text', header: { 'Cache-Control': 'no-cache' } }),
      ])
      if (this.unloaded) return
      this.model = buildModel(records, csv, fruitPaths(page))
      this.setData({ targetIndex: 0, targetOptions: [{ key: '', label: '全部异色目标' },
        ...this.model.targets.map(target => ({ key: target.key, label: `No. ${target.number} ${target.title}` }))] })
      this.search()
    } catch (error) {
      if (!this.unloaded) this.setData({ error: error.message })
    } finally {
      this.retried = true
      if (!this.unloaded) this.setData({ loading: false })
    }
  },

  search() {
    if (!this.model) return
    const { mode, firstQuery, secondQuery, sort, targetOptions, targetIndex } = this.data
    this.results = recommend(this.model, { mode, firstQuery, secondQuery: mode === 'single' ? '' : secondQuery,
      target: targetOptions[targetIndex]?.key || '', order: sort.map(item => item.key) })
    this.setData({ count: this.results.length, suggestions: [], suggestField: '' })
    this.showPage(1)
  },

  showPage(page) {
    const pages = Math.max(1, Math.ceil(this.results.length / batchSize))
    if (page < 1 || page > pages) return
    const start = (page - 1) * batchSize
    const rows = this.results.slice(start, start + batchSize).map(strategyCard)
    this.setData({ page, pages, rows })
  },
  turnPage({ currentTarget: { dataset: { direction } } }) {
    this.showPage(this.data.page + Number(direction))
    wx.pageScrollTo({ selector: '#strategy-results', duration: 160 })
  },

  selectMode({ currentTarget: { dataset: { mode } } }) {
    this.setData({ mode, secondQuery: mode === 'single' ? '' : this.data.secondQuery })
    this.search()
  },
  changeTarget({ detail: { value } }) { this.setData({ targetIndex: Number(value) }); this.search() },
  changeSort() { this.setData({ sort: [...this.data.sort].reverse() }); this.search() },
  clear() { this.setData({ firstQuery: '', secondQuery: '', targetIndex: 0, mode: 'mixed' }); this.search() },

  inputCandidate({ currentTarget: { dataset: { field } }, detail: { value } }) {
    const term = normalize(value)
    const suggestions = term && this.model ? this.model.candidates.filter(candidate => candidateMatchesTerm(candidate, term)).slice(0, 6).map(familyCard) : []
    this.setData({ [field]: value, suggestField: field, suggestions })
  },
  pickCandidate({ currentTarget: { dataset: { title } } }) {
    if (this.data.suggestField) this.setData({ [this.data.suggestField]: title, suggestField: '', suggestions: [] })
    this.search()
  },
  openPet({ currentTarget: { dataset: { id } } }) { openRecord(id) },

  toggleRules() {
    const showRules = !this.data.showRules
    this.setData({ showRules })
    if (showRules && !this.data.rules) this.loadRules()
  },
  async loadRules() {
    if (this.data.rulesLoading) return
    this.setData({ rulesLoading: true, rulesError: '' })
    try {
      const rules = await requestSite('adventure_rules.txt', { dataType: 'text', header: { 'Cache-Control': 'no-cache' } })
      if (!this.unloaded) this.setData({ rules: String(rules).trim() })
    } catch (error) {
      if (!this.unloaded) this.setData({ rulesError: error.message })
    } finally {
      if (!this.unloaded) this.setData({ rulesLoading: false })
    }
  },
})
