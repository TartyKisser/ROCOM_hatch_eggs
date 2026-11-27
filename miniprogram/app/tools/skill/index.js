const { handbookRecords, normalize, smallPortrait, openRecord, appendRows } = require('../../lib/tool-data')
const { typeOptions } = require('../../lib/catalog')
const { siteImage } = require('../../lib/site')
const { buildSkills, compareSkills, acquisition } = require('./engine')

const batchSize = 24

function skillCard(skill) {
  return {
    name: skill.name, type: skill.type, icon: siteImage(skill.icon), description: skill.description,
    meta: [skill.category, skill.cost && `耗能 ${skill.cost}`, Number(skill.power) > 0 && `威力 ${skill.power}`].filter(Boolean).join(' · '),
    users: skill.users.length,
  }
}

function petRow(record, note = '') {
  return { id: record.id, title: record.title, number: record.number, image: smallPortrait(record.portrait), note }
}

Page({
  data: {
    query: '', petQuery: '', petId: '', petTitle: '', suggestions: [],
    typeFilter: {
      key: 'typeFilter', label: '系别', index: 0,
      options: [{ label: '全部' }, ...typeOptions, { label: '无系别' }],
    },
    categoryFilter: {
      key: 'categoryFilter', label: '类别', index: 0,
      options: ['全部', '物攻', '魔攻', '防御', '状态'].map(label => ({ label })),
    },
    loading: true, error: '', total: 0, count: 0, rows: [], more: false,
    detail: null, groups: [], openGroup: '', groupPets: [], research: [], researchTotal: 0, users: [], userTotal: 0,
  },

  onLoad() { this.load() },
  onUnload() { this.unloaded = true },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const records = await handbookRecords({ force: Boolean(this.retried) })
      if (this.unloaded) return
      this.records = new Map(records.map(record => [record.id, record]))
      this.skills = buildSkills(records)
      this.sorted = [...this.skills.values()].sort(compareSkills)
      this.setData({ total: this.sorted.length })
      this.filter()
    } catch (error) {
      if (!this.unloaded) this.setData({ error: error.message })
    } finally {
      this.retried = true
      if (!this.unloaded) this.setData({ loading: false })
    }
  },

  filter() {
    if (!this.sorted) return
    const { query, typeFilter, categoryFilter, petId } = this.data
    const keyword = normalize(query)
    const type = typeFilter.index ? typeFilter.options[typeFilter.index].label : ''
    const category = categoryFilter.index ? categoryFilter.options[categoryFilter.index].label : ''
    const record = this.records.get(petId)
    const pool = record ? [...new Set((record.skills || []).map(skill => skill?.name))].map(name => this.skills.get(name)).filter(Boolean) : this.sorted
    this.results = pool.filter(skill => normalize(skill.name).includes(keyword) && (!type || type === skill.type)
      && (!category || category === skill.category))
    const rows = this.results.slice(0, batchSize).map(skillCard)
    this.setData({ rows, count: this.results.length, more: rows.length < this.results.length })
  },

  onSearch({ detail: { value } }) { this.setData({ query: value }); this.filter() },
  onFilter({ detail: { key, index } }) {
    this.setData({ [`${key}.index`]: index })
    this.filter()
  },

  searchPet({ detail: { value } }) {
    const term = normalize(value)
    const suggestions = term && this.records ? [...this.records.values()].filter(record => normalize(`${record.number}${record.title}${record.id}`).includes(term))
      .slice(0, 8).map(record => petRow(record)) : []
    this.setData({ petQuery: value, suggestions, petId: '', petTitle: '' })
    this.filter()
  },

  selectPet({ currentTarget: { dataset: { id } } }) {
    const record = this.records.get(id)
    if (!record) return
    this.setData({ petId: id, petTitle: record.title, petQuery: record.title, suggestions: [] })
    this.filter()
  },

  clear() {
    this.selectComponent('#skill-filters')?.close()
    this.setData({ query: '', petQuery: '', petId: '', petTitle: '', suggestions: [], 'typeFilter.index': 0, 'categoryFilter.index': 0 })
    this.filter()
  },

  openSkill({ currentTarget: { dataset: { name } } }) {
    this.current = this.skills.get(name)
    if (!this.current) return
    this.groups = acquisition(this.current)
    this.setData({ detail: skillCard(this.current), openGroup: '', groupPets: [],
      groups: this.groups.map(group => ({ key: group.key, label: `${group.source}：${group.unlock}`, count: group.pets.size })),
      research: this.researchRows(batchSize), researchTotal: this.current.research.length,
      users: this.userRows(batchSize), userTotal: this.current.users.length })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  researchRows(limit) { return this.current.research.slice(0, limit).map((task, key) => ({ ...petRow(task.record, task.name), key })) },
  userRows(limit) { return this.current.users.slice(0, limit).map(({ record, skill }) => petRow(record, [skill.source, skill.unlock || skill.level].filter(Boolean).join(' / '))) },

  toggleGroup({ currentTarget: { dataset: { key } } }) {
    const group = key !== this.data.openGroup && this.groups.find(item => item.key === key)
    this.setData({ openGroup: group ? key : '', groupPets: group ? [...group.pets.values()].slice(0, batchSize).map(record => petRow(record)) : [] })
  },

  expandGroup() {
    const group = this.groups.find(item => item.key === this.data.openGroup)
    if (group) this.setData({ groupPets: [...group.pets.values()].slice(0, this.data.groupPets.length + batchSize).map(record => petRow(record)) })
  },

  closeSkill() { this.setData({ detail: null, groups: [], groupPets: [], research: [], users: [] }); wx.pageScrollTo({ scrollTop: 0, duration: 0 }) },
  openPet({ currentTarget: { dataset: { id } } }) { openRecord(id) },
  moreResearch() { this.setData({ research: this.researchRows(this.data.research.length + batchSize) }) },
  moreUsers() { this.setData({ users: this.userRows(this.data.users.length + batchSize) }) },
  onReachBottom() {
    if (this.data.detail || !this.data.more) return
    const start = this.data.rows.length
    const rows = this.results.slice(start, start + batchSize).map(skillCard)
    appendRows(this, 'rows', rows, { more: start + rows.length < this.results.length })
  },
})
