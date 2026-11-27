const { getCard, getCatalogue, decodeId } = require('./catalog')
const { siteImage } = require('./site')
const { syncHandbook } = require('./sync')

const statNames = ['生命', '物攻', '魔攻', '物防', '魔防', '速度']
const tabs = [{ value: 'overview', label: '资料' }, { value: 'skills', label: '技能' }, { value: 'research', label: '图鉴课题' }]

function valueOr(value, fallback = '暂无') {
  return value === null || value === undefined || value === '' ? fallback : value
}

function range(min, max, unit) {
  const values = [min, max].filter(value => valueOr(value, '') !== '')
  return values.length ? `${values.join(' - ')} ${unit}` : '暂无'
}

function items(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function getSkillCards(records, bundle, version) {
  const definitions = bundle ? require('../generated/skills') : null
  return items(records).filter(entry => bundle || entry.name).map((entry, index) => {
    const skill = definitions ? { ...definitions[entry[0]], level: entry[1], source: entry[2], unlock: entry[3] } : entry
    const { source, level, unlock } = skill
    const icon = bundle
      ? (skill.icon ? bundle.assetPath + skill.icon : '')
      : siteImage(skill.icon || (skill.name && `skills/${skill.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.png`), version)
    return {
      key: index,
      name: skill.name,
      icon,
      source,
      level,
      unlock,
      description: valueOr(skill.description, '暂无描述。'),
      tags: [source, skill.cost && `耗能 ${skill.cost}`, skill.category,
        skill.type && `${skill.type}系`, Number(skill.power) > 0 && `威力 ${skill.power}`].filter(Boolean),
    }
  })
}

function createDetailPage(bundle) {
  return {
    data: {
      record: null,
      loading: false,
      tabs,
      tab: 'overview',
      itemKind: 'egg',
      itemImage: '',
      itemLabel: '精灵蛋',
      shiny: false,
      shinyEgg: false,
      portrait: '',
      skillSource: 'all',
      skillChoices: [],
      skills: [],
    },

    onLoad(options) {
      const id = decodeId(options.id)
      if (bundle) {
        const catalogue = getCatalogue(false)
        if (!this.showRecord(id, bundle.records[id], catalogue)) {
          const route = getCard(id, catalogue)?.route
          if (route && !route.startsWith(bundle.assetPath.replace(/art\/$/, ''))) wx.redirectTo({ url: route })
        }
      } else {
        this.openOnlineRecord(id)
      }
    },

    onUnload() {
      this.unloaded = true
    },

    async openOnlineRecord(id) {
      if (!getCatalogue().online) {
        this.setData({ loading: true })
        await syncHandbook()
        if (this.unloaded) return
      }
      const catalogue = getCatalogue()
      if (this.showRecord(id, catalogue.details?.get(id), catalogue)) return
      const local = !catalogue.online && getCard(id, getCatalogue(false))
      if (local) {
        wx.redirectTo({ url: local.route, fail: () => this.setData({ loading: false }) })
        return
      }
      this.setData({ loading: false })
    },

    showRecord(id, detail, catalogue) {
      const card = getCard(id, catalogue)
      if (!card || !detail) return false
      this.catalogue = catalogue
      this.detail = detail
      const { stats, eggSize, research } = detail
      const images = bundle ? detail.images : {
        portrait: detail.portrait,
        shiny: detail.rare ? detail.rarePath : '',
        egg: detail['icon-egg'],
        fruit: detail['icon-fruit'],
        shinyEgg: detail['icon-egg-rare'],
      }
      const imagePaths = Object.fromEntries(Object.entries(images).map(([key, file]) => [key, bundle
        ? (file ? bundle.assetPath + file : '')
        : siteImage(file, catalogue.version)]))
      const record = {
        ...card,
        images: imagePaths,
        groups: card.eggGroups.join(' / ') || '不可繁殖',
        gender: valueOr(detail.genderRatio),
        description: valueOr(detail.description, '暂无简介。'),
        stats: statNames.map(name => ({
          name,
          value: valueOr(stats && stats[name]),
          width: Math.min(100, Math.max(0, Number(stats && stats[name]) || 0) / 180 * 100),
        })),
        measurements: [
          { label: '种族值', value: valueOr(stats && stats.种族值) },
          { label: '身高', value: valueOr(detail.height) },
          { label: '体重', value: valueOr(detail.weight) },
        ],
        starlight: valueOr(detail.baseStarlightValue),
        rockCoin: valueOr(detail.baseReviewRockCoin),
        distribution: valueOr(detail.distribution, '暂无分布资料。'),
        eggMeasures: eggSize ? [
          { label: '蛋身高', value: range(eggSize.heightMin, eggSize.heightMax, 'm') },
          { label: '蛋体重', value: range(eggSize.weightMin, eggSize.weightMax, 'kg') },
        ] : [],
        evolution: items(detail.evolution).map(stage => getCard(stage, catalogue)).filter(Boolean),
        abilities: items(detail.abilities).map((ability, key) => ({
          key, name: valueOr(ability.name), description: valueOr(ability.description, '暂无描述。'),
        })),
        progress: research && research.progress ? research.progress : '',
        tasks: items(research?.tasks).map((task, key) => ({ key, name: valueOr(task.name, '-') })),
        url: detail.url || '',
      }
      this.setData({ record, loading: false, portrait: imagePaths.portrait || card.thumb, itemImage: imagePaths.egg })
      wx.setNavigationBarTitle({ title: card.title })
      return true
    },

    backToCatalogue() {
      wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) })
    },

    openEvolution(event) {
      const stage = getCard(event.currentTarget.dataset.id, this.catalogue)
      if (!stage || stage.id === this.data.record.id) return
      wx.redirectTo({
        url: stage.route,
        fail: () => wx.showToast({ title: '详情加载失败，请重试', icon: 'none' }),
      })
    },

    toggleShiny() {
      const { images, thumb } = this.data.record
      if (!images.shiny) return
      const shiny = !this.data.shiny
      this.setData({ shiny, portrait: shiny ? images.shiny : images.portrait || thumb })
    },

    onPortraitError(event) {
      const { src } = event.currentTarget.dataset
      if (src !== this.data.portrait) return
      const fallback = this.data.shiny ? '' : this.data.record.fallbackThumb || this.data.record.thumb
      this.setData({ portrait: src === fallback ? '' : fallback })
    },

    selectItem(event) {
      this.updateItem(event.currentTarget.dataset.kind, this.data.shinyEgg)
    },

    selectEgg(event) {
      this.updateItem('egg', event.currentTarget.dataset.shiny === 'yes')
    },

    updateItem(kind, shinyEgg) {
      const { images } = this.data.record
      const isFruit = kind === 'fruit'
      const appearance = shinyEgg && Boolean(images.shinyEgg)
      this.setData({
        itemKind: kind,
        shinyEgg: appearance,
        itemImage: isFruit ? images.fruit : appearance ? images.shinyEgg : images.egg,
        itemLabel: isFruit ? '精灵果实' : appearance ? '异色蛋' : '精灵蛋',
      })
    },

    onItemImageError(event) {
      if (event.currentTarget.dataset.src === this.data.itemImage) this.setData({ itemImage: '' })
    },

    selectTab(event) {
      const tab = event.currentTarget.dataset.tab
      if (tab !== 'skills' || this.skillCards) {
        this.setData({ tab })
        return
      }
      this.skillCards = getSkillCards(this.detail.skills, bundle, this.catalogue.version)
      const sources = [...new Set(this.skillCards.map(skill => skill.source).filter(Boolean))]
      const skillChoices = [{ value: 'all', label: '全部' }, ...sources.map(source => ({ value: source, label: source }))]
      this.setData({ tab, skillChoices, skills: this.skillCards })
    },

    selectSkillSource(event) {
      const skillSource = event.currentTarget.dataset.source
      const skills = skillSource === 'all' ? this.skillCards : this.skillCards.filter(skill => skill.source === skillSource)
      this.setData({ skillSource, skills })
    },

    onSkillImageError(event) {
      const { key } = event.currentTarget.dataset
      const skill = this.skillCards[key]
      if (skill) skill.icon = ''
      const index = this.data.skills.findIndex(item => item.key === Number(key))
      if (index >= 0) this.setData({ [`skills[${index}].icon`]: '' })
    },

    copySource() {
      wx.setClipboardData({ data: this.data.record.url })
    },
  }
}

module.exports = { createDetailPage }
