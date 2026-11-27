const { typeOptions, filterCards, getCard, getCatalogue } = require('../../lib/catalog')
const { syncHandbook } = require('../../lib/sync')

const PAGE_SIZE = 24
const emptyFilters = { query: '', attribute: '', eggGroup: '', rare: '' }

Page({
  data: {
    filters: emptyFilters,
    typeOptions: [{ label: '全部', value: 'all' }, ...typeOptions.map(type => ({ ...type, value: type.label }))],
    rareOptions: [{ label: '全部', value: 'all' }, { label: '有异色', value: 'yes' }, { label: '无异色', value: 'no' }],
    eggOptions: ['全部蛋组'],
    eggIndex: 0,
    cards: [],
    count: 0,
    matching: 0,
    hasMore: false,
    isFiltered: false,
    syncNote: '',
  },

  onLoad() {
    this.catalogue = getCatalogue()
    this.thumbFallbacks = new Map()
    this.updateFilters(emptyFilters)
  },

  onShow() {
    this.refreshCatalogue()
  },

  onUnload() {
    this.unloaded = true
  },

  onPullDownRefresh() {
    this.refreshCatalogue(true).finally(() => wx.stopPullDownRefresh())
  },

  async refreshCatalogue(force = false) {
    const reachable = await syncHandbook(force)
    if (this.unloaded) return
    const catalogue = getCatalogue()
    if (catalogue !== this.catalogue) {
      this.catalogue = catalogue
      this.thumbFallbacks.clear()
      this.updateFilters(this.data.filters, Math.max(PAGE_SIZE, this.data.cards.length))
    }
    this.setData({ syncNote: reachable ? '' : catalogue.online ? '正在显示最近同步的资料' : '正在显示随版本提供的资料' })
  },

  withThumbFallback(card) {
    return this.thumbFallbacks.has(card.id) ? { ...card, thumb: this.thumbFallbacks.get(card.id) } : card
  },

  updateFilters(filters, limit = PAGE_SIZE) {
    const { eggGroups, index } = this.catalogue
    if (filters.eggGroup && !eggGroups.includes(filters.eggGroup)) filters = { ...filters, eggGroup: '' }
    this.matchingCards = filterCards(filters, this.catalogue)
    const cards = this.matchingCards.slice(0, limit).map(card => this.withThumbFallback(card))
    this.setData({
      filters,
      cards,
      count: index.length,
      eggOptions: ['全部蛋组', ...eggGroups],
      eggIndex: eggGroups.indexOf(filters.eggGroup) + 1,
      matching: this.matchingCards.length,
      hasMore: this.matchingCards.length > cards.length,
      isFiltered: Object.values(filters).some(Boolean),
    })
  },

  onSearch(event) {
    this.updateFilters({ ...this.data.filters, query: event.detail.value })
  },

  onEggGroupChange(event) {
    this.updateFilters({ ...this.data.filters, eggGroup: this.catalogue.eggGroups[Number(event.detail.value) - 1] || '' })
  },

  onTypeChange(event) {
    const value = event.currentTarget.dataset.value
    this.updateFilters({ ...this.data.filters, attribute: value === 'all' ? '' : value })
  },

  onRareChange(event) {
    const value = event.currentTarget.dataset.value
    this.updateFilters({ ...this.data.filters, rare: value === 'all' ? '' : value })
  },

  clearFilters() {
    this.updateFilters(emptyFilters)
  },

  onReachBottom() {
    if (!this.data.hasMore) return
    const start = this.data.cards.length
    const next = this.matchingCards.slice(start, start + PAGE_SIZE)
    const patch = { hasMore: start + next.length < this.matchingCards.length }
    next.forEach((card, index) => { patch[`cards[${start + index}]`] = this.withThumbFallback(card) })
    this.setData(patch)
  },

  onThumbError(event) {
    const { index, id, src } = event.currentTarget.dataset
    const card = this.data.cards[index]
    if (!card || card.id !== id || card.thumb !== src) return
    const fallback = src === card.fallbackThumb ? '' : card.fallbackThumb
    this.thumbFallbacks.set(id, fallback)
    this.setData({ [`cards[${index}].thumb`]: fallback })
  },

  openRecord(event) {
    const card = getCard(event.currentTarget.dataset.id, this.catalogue)
    if (card) wx.navigateTo({
      url: card.route,
      fail: () => wx.showToast({ title: '详情加载失败，请重试', icon: 'none' }),
    })
  },
})
