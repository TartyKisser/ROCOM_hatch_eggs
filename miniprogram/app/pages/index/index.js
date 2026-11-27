const { typeOptions, filterCards, getCard, getCatalogue } = require('../../lib/catalog')
const { syncHandbook } = require('../../lib/sync')
const { uiImages } = require('../../lib/site')

const PAGE_SIZE = 24
const BACK_TO_TOP_OFFSET = 320
const emptyFilters = { query: '', attribute: '', eggGroup: '', rare: '' }
const filterLabels = { attribute: '系别', eggGroup: '蛋组', rare: '异色' }
const allChoice = { label: '全部', value: '' }
const typeChoices = [allChoice, ...typeOptions.map(type => ({ ...type, value: type.label }))]
const rareChoices = [allChoice, { label: '有异色', value: 'yes' }, { label: '无异色', value: 'no' }]

Page({
  data: {
    filters: emptyFilters,
    wallpaper: uiImages.wallpaper,
    logo: uiImages.logo,
    rareIcon: uiImages.rare,
    filterControls: [],
    filterChoices: {},
    openFilter: '',
    cards: [],
    count: 0,
    matching: 0,
    showBackToTop: false,
    isFiltered: false,
    syncNote: '',
  },

  onLoad() {
    this.catalogue = getCatalogue()
    this.failedThumbnails = new Set()
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
    if (catalogue !== this.catalogue || (reachable && (force || this.data.syncNote))) {
      this.catalogue = catalogue
      this.failedThumbnails.clear()
      this.updateFilters(this.data.filters, Math.max(PAGE_SIZE, this.data.cards.length))
    }
    this.setData({ syncNote: reachable ? '' : catalogue.online ? '正在显示最近同步的资料' : '正在显示随版本提供的资料' })
  },

  withThumbnail(card) {
    return this.failedThumbnails.has(card.id) ? { ...card, thumb: '' } : card
  },

  updateFilters(filters, limit = PAGE_SIZE) {
    const { eggGroups, index } = this.catalogue
    if (filters.eggGroup && !eggGroups.includes(filters.eggGroup)) filters = { ...filters, eggGroup: '' }
    this.matchingCards = filterCards(filters, this.catalogue)
    const cards = this.matchingCards.slice(0, limit).map(card => this.withThumbnail(card))
    const filterChoices = {
      attribute: typeChoices,
      eggGroup: [allChoice, ...eggGroups.map(label => ({ label, value: label }))],
      rare: rareChoices,
    }
    this.setData({
      filters,
      cards,
      count: index.length,
      filterChoices,
      filterControls: Object.entries(filterLabels).map(([key, label]) => ({
        key,
        label,
        selected: filterChoices[key].find(option => option.value === filters[key]) || allChoice,
      })),
      matching: this.matchingCards.length,
      isFiltered: Object.values(filters).some(Boolean),
    })
  },

  onSearch(event) {
    this.updateFilters({ ...this.data.filters, query: event.detail.value })
  },

  toggleFilter(event) {
    const { filter } = event.currentTarget.dataset
    this.setData({ openFilter: this.data.openFilter === filter ? '' : filter })
  },

  selectFilter(event) {
    const { filter, value } = event.currentTarget.dataset
    if (filter !== this.data.openFilter) return
    this.setData({ openFilter: '' })
    this.updateFilters({ ...this.data.filters, [filter]: value || '' })
  },

  clearFilters() {
    this.setData({ openFilter: '' })
    this.updateFilters(emptyFilters)
  },

  onPageScroll({ scrollTop }) {
    const showBackToTop = scrollTop >= BACK_TO_TOP_OFFSET
    if (showBackToTop !== this.data.showBackToTop) this.setData({ showBackToTop })
  },

  backToTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 240 })
  },

  onReachBottom() {
    const start = this.data.cards.length
    if (start >= this.matchingCards.length) return
    const next = this.matchingCards.slice(start, start + PAGE_SIZE)
    const patch = {}
    next.forEach((card, index) => { patch[`cards[${start + index}]`] = this.withThumbnail(card) })
    this.setData(patch)
  },

  onThumbError(event) {
    const { index, id, src } = event.currentTarget.dataset
    const card = this.data.cards[index]
    if (!card || card.id !== id || card.thumb !== src) return
    this.failedThumbnails.add(id)
    this.setData({ [`cards[${index}].thumb`]: '' })
  },

  openRecord(event) {
    const card = getCard(event.currentTarget.dataset.id, this.catalogue)
    if (card) wx.navigateTo({
      url: card.route,
      fail: () => wx.showToast({ title: '详情加载失败，请重试', icon: 'none' }),
    })
  },
})
