const { uiImages, siteImage } = require('../../lib/site')
const { requestSite } = require('../../lib/tool-data')
const { parseMerchant } = require('./merchant')

const tools = [
  { id: 'dex', group: 'dex', title: '精灵图鉴', note: '属性、种族值、蛋组与进化', route: '/pages/index/index' },
  { id: 'skill', group: 'dex', title: '技能图鉴', note: '技能效果、来源与适用精灵' },
  { id: 'egg', group: 'home', title: '孵蛋预测', note: '按蛋的身高和体重预测家族' },
  { id: 'pair', group: 'home', title: '精灵配对', note: '查看共同蛋组与可配对精灵' },
  { id: 'hatch', group: 'home', title: '家园小窝排布', note: '生成小窝位置和配对路径' },
  { id: 'garden', group: 'home', title: '家园查询', note: '按 UID 查询精灵、守卫和作物' },
  { id: 'adventure', group: 'explore', title: '异色抓取推荐', note: '按系别和星光值规划单刷混刷' },
  { id: 'map', group: 'explore', title: '世界地图', note: '查看图层、探索与采集点位' },
].map(tool => ({
  ...tool,
  url: tool.route || `/tools/${tool.id}/index`,
  image: siteImage(`homepage/assets/tool-mark-${tool.group}.png`),
}))

Page({
  data: {
    wallpaper: uiImages.wallpaper, logo: uiImages.logo, coin: siteImage('web_images/coin.png'),
    merchantCover: siteImage('homepage/assets/roco-map-bg.webp'),
    groups: [{ key: '', label: '全部' }, { key: 'dex', label: '图鉴' }, { key: 'home', label: '家园与繁育' }, { key: 'explore', label: '探索' }],
    group: '', tools,
    shop: [], hours: '', merchantNote: '正在获取当前商品…', loading: false,
  },

  onLoad() { this.refreshMerchant() },
  onUnload() { this.unloaded = true },
  onPullDownRefresh() { this.refreshMerchant().finally(() => wx.stopPullDownRefresh()) },

  async refreshMerchant() {
    if (this.data.loading) return
    this.setData({ loading: true, merchantNote: '正在获取当前商品…' })
    try {
      const { items, hours } = parseMerchant(await requestSite('merchant_proxy.php', { dataType: 'text' }))
      if (this.unloaded) return
      this.setData({ shop: items, hours, merchantNote: items.length ? '' : hours ? '这个时段暂无在售商品。' : '每日 00:00–08:00 通常无远行商人。' })
    } catch (_) {
      if (!this.unloaded) this.setData({ merchantNote: '暂时无法获取商品，可点击刷新。' })
    } finally {
      if (!this.unloaded) this.setData({ loading: false })
    }
  },

  onShopImageError({ currentTarget: { dataset: { index, id } } }) {
    if (this.data.shop[index]?.id === id) this.setData({ [`shop[${index}].icon`]: '' })
  },

  showProduct({ currentTarget: { dataset: { index } } }) {
    const item = this.data.shop[index]
    if (item?.description) wx.showModal({ title: item.name, content: item.description, showCancel: false })
  },

  selectGroup({ currentTarget: { dataset: { group } } }) {
    this.setData({ group, tools: group ? tools.filter(tool => tool.group === group) : tools })
  },

  openTool({ currentTarget: { dataset: { url } } }) {
    wx.navigateTo({ url, fail: () => wx.showToast({ title: '工具加载失败，请重试', icon: 'none' }) })
  },
})
