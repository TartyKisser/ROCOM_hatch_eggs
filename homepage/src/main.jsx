import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Check } from '@rocokingdom-ui/icons'
import {
  Button, ButtonNormal, Divider, Input, Layout, LayoutContent, LayoutFooter,
  Material, Modal, Panel, RadioGroup, RadioItem, RocoShape, RocoTheme, Space, Stack,
  Tab, TabList, TabPanel, Tabs, Textarea,
} from 'rocokingdom-ui'
import 'rocokingdom-ui/style.css'
import '../fonts/roco-fonts.css'
import './home.css'
import { currentMerchantPeriod, fetchMerchantShop, localMerchantImagePath, merchantPeriodLabels, merchantShopConfig } from './merchant.js'
import { KingdomWordmark, SiteHeader, SiteWallpaper, siteColors } from './site.jsx'

const tools = [
  { href: 'handbook.html', group: 'dex', title: '精灵图鉴', description: '查属性、种族值、蛋组与进化链。' },
  { href: 'skill.html', group: 'dex', title: '技能图鉴', description: '查技能效果、学习方式与适用精灵。' },
  { href: 'eggPred.html', group: 'home', title: '孵蛋预测', description: '根据蛋的身高与体重推测精灵家族。' },
  { href: 'pair.html', group: 'home', title: '精灵配对', description: '选择精灵，查看可行的配对关系。' },
  { href: 'hatch.html', group: 'home', title: '家园小窝排布', description: '安排小窝与精灵位置，规划繁育路线。' },
  { href: 'home.html', group: 'home', title: '家园查询', description: '按 UID 查询居住精灵、守卫和作物。' },
  { href: 'adventure.html', group: 'explore', title: '异色抓取推荐', description: '按系别与星光值规划异色抓取。' },
  { href: 'map.html', group: 'explore', title: '世界地图', description: '浏览点位资料，筛选采集目标。', badge: '测试版' },
]

const toolGroups = [
  { id: 'all', label: '全部' },
  { id: 'dex', label: '图鉴' },
  { id: 'home', label: '家园与繁育' },
  { id: 'explore', label: '探索' },
]

const rewardImageConfig = {
  left: './web_images/reward-left.jpg',
  right: './web_images/reward-right.jpg',
  leftLabel: '微信',
  rightLabel: '支付宝',
}

const feedbackTypes = ['改进建议', '问题反馈', '想要功能']
const feedbackEmail = 'tartykisser1022@gmail.com'

function ActionLink({ children, href, material = 'primary' }) {
  return (
    <Material asChild material={material}>
      <RocoShape as="a" href={href} className="hero-action" contentClassName="hero-action-content">
        {children}
      </RocoShape>
    </Material>
  )
}

function Feedback() {
  const [type, setType] = useState(feedbackTypes[0])
  const [status, setStatus] = useState('')

  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const message = String(data.get('message') || '').trim()
    const contact = String(data.get('contact') || '').trim()
    if (message.length < 5) {
      setStatus('请至少填写 5 个字。')
      event.currentTarget.elements.message.focus()
      return
    }
    const subject = `洛克王国世界工具站反馈 - ${type}`
    const body = [`反馈类型：${type}`, '', message, '', `联系方式：${contact || '未填写'}`, `页面：${location.href}`].join('\n')
    window.location.href = `mailto:${feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setStatus('请在邮箱应用中发送邮件。')
  }

  return (
    <Modal title="反馈建议" description="通过邮箱发送反馈，也可以联系 QQ 2038241768。"
      width={500} panelClassName="home-dialog" onOpenChange={() => setStatus('')}
      trigger={<ButtonNormal className="header-feedback" variant="text" material="paperSoft">反馈建议</ButtonNormal>}>
      <form onSubmit={submit} className="feedback-form">
        <RadioGroup aria-label="反馈类型" value={type} onValueChange={setType} size="small"
          activeMaterial="primary" inactiveMaterial="paperMuted" className="feedback-types">
          {feedbackTypes.map(label => <RadioItem key={label} value={label}>{label}</RadioItem>)}
        </RadioGroup>
        <div className="feedback-field">
          <label htmlFor="feedback-message">反馈内容</label>
          <Textarea id="feedback-message" material="paperMuted" rows={4} name="message" required
            maxLength={1600} placeholder="描述问题或你想看到的功能" />
        </div>
        <div className="feedback-field">
          <label htmlFor="feedback-contact">联系方式（可选）</label>
          <Input id="feedback-contact" material="paperMuted" size="large" name="contact" maxLength={120}
            placeholder="QQ、邮箱或 B 站昵称" />
        </div>
        <div className="feedback-actions">
          <p role="status">{status}</p>
          <Button type="submit" material="primary">写邮件反馈</Button>
        </div>
      </form>
    </Modal>
  )
}

function Support() {
  const [images, setImages] = useState(rewardImageConfig)
  useEffect(() => {
    window.rewardImageConfig = rewardImageConfig
    window.setRewardImages = (config = {}) => {
      Object.assign(rewardImageConfig, config)
      setImages({ ...rewardImageConfig })
    }
  }, [])

  return (
    <Modal title="支持工具站" description="可以用微信或支付宝扫码打赏。" width={510} panelClassName="home-dialog"
      trigger={<ButtonNormal size="middle" variant="outline" material="stoneSoft">打赏</ButtonNormal>}>
      <div className="support-grid">
        {[['left', '微信'], ['right', '支付宝']].map(([side, defaultLabel]) => {
          const label = images[`${side}Label`] || defaultLabel
          return <figure key={side}>
            {images[side] ? <img src={images[side]} alt={`${label}打赏二维码`} width="184" height="184" /> : <p>暂未设置二维码</p>}
            <figcaption>{label}</figcaption>
          </figure>
        })}
      </div>
    </Modal>
  )
}

function Hero() {
  return (
    <section className="hero" aria-labelledby="home-title">
      <div className="hero-copy">
        <h1 id="home-title" aria-label="洛克王国世界工具站">
          <KingdomWordmark />
          <span className="hero-title-label">世界工具站</span>
        </h1>
        <p>查精灵、配对孵蛋、规划家园。<br />远行商人今天的货单，也在这里。</p>
        <Space wrap className="hero-actions">
          <ActionLink href="handbook.html">查看精灵图鉴 <span aria-hidden="true">→</span></ActionLink>
          <ActionLink href="#tools" material="paperSoft">浏览全部工具 <span aria-hidden="true">↓</span></ActionLink>
        </Space>
      </div>
    </section>
  )
}

function ToolCard({ tool }) {
  return (
    <Panel as="a" material="paperSoft" href={tool.href} className="tool-card" data-group={tool.group}
      contentClassName="tool-card-inner">
      <RocoShape shape="square" background="var(--tool-mark-bg)" color="var(--tool-mark-color)"
        className="tool-mark" aria-hidden="true"><span className="tool-symbol" /></RocoShape>
      <div className="tool-copy">
        <h3>{tool.title}{tool.badge && <span className="tool-note">{tool.badge}</span>}</h3>
        <p>{tool.description}</p>
      </div>
      <span className="link-arrow tool-arrow" aria-hidden="true" />
    </Panel>
  )
}

function ToolDirectory() {
  return (
    <section id="tools" aria-labelledby="tools-title" className="tool-directory">
      <h2 id="tools-title" className="section-heading">工具导航</h2>
      <Tabs className="tool-tabs" defaultValue="all" size="small" listMaterial="stone" selectedMaterial="primary">
        <TabList aria-label="按用途筛选工具" className="tool-tab-list">
          {toolGroups.map(group => <Tab key={group.id} value={group.id}>{group.label}</Tab>)}
        </TabList>
        {toolGroups.map(group => (
          <TabPanel key={group.id} value={group.id} className="tool-tab-panel">
            <div className="tool-grid">
              {tools.filter(tool => group.id === 'all' || tool.group === group.id)
                .map(tool => <ToolCard key={tool.href} tool={tool} />)}
            </div>
          </TabPanel>
        ))}
      </Tabs>
    </section>
  )
}

function ShopItem({ item }) {
  const [missing, setMissing] = useState(false)
  return (
    <li className="shop-item" title={item.description || item.name}>
      <span className="shop-icon" aria-hidden="true">
        {missing ? item.name.slice(0, 1) : <img src={localMerchantImagePath(item)} loading="lazy" alt=""
          width="36" height="36" onError={() => setMissing(true)} />}
      </span>
      <div className="shop-item-name">
        <strong>{item.name}</strong>
        <span>{[item.type, item.limit].filter(Boolean).join(' · ') || '远行商人商品'}</span>
      </div>
      <span className="shop-price" aria-label={`价格 ${item.price || '未知'} 洛克贝`}>
        <img src="./web_images/coin.png" width="15" height="15" alt="" />
        {item.price || '—'}
      </span>
    </li>
  )
}

function Merchant() {
  const [shop, setShop] = useState({ state: 'loading', items: [], period: 0 })
  const request = useRef(null)

  async function refresh() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setShop({ state: 'loading', items: [], period: 0 })
    try {
      const data = await fetchMerchantShop(controller.signal)
      if (!controller.signal.aborted) setShop({ state: 'ready', ...data })
    } catch {
      if (!controller.signal.aborted) setShop({ state: 'error', items: [], period: 0 })
    }
  }

  useEffect(() => {
    window.merchantShopConfig = merchantShopConfig
    window.setMerchantItems = (items, options = {}) => {
      request.current?.abort()
      setShop({ state: 'ready', items: Array.isArray(items) ? items : [], period: options.period ?? currentMerchantPeriod() })
    }
    refresh()
    return () => request.current?.abort()
  }, [])

  const label = merchantPeriodLabels[shop.period]
  const synced = shop.state === 'ready' && shop.items.length > 0

  return (
    <aside id="merchant" className="merchant" aria-labelledby="merchant-title">
      <div className="merchant-heading">
        <h2 id="merchant-title" className="section-heading">远行商人</h2>
        <ButtonNormal size="small" variant="outline" material="stoneSoft" className="shop-refresh"
          onClick={refresh} disabled={shop.state === 'loading'}>刷新</ButtonNormal>
      </div>
      <Panel material="paperSoft" className="merchant-panel" contentClassName="merchant-panel-inner">
        <div className="merchant-banner">
          {label && <div className="merchant-hours">
            <span>当前售卖时段</span>
            <strong>{label}</strong>
          </div>}
        </div>
        <div className="merchant-body" aria-live="polite" aria-busy={shop.state === 'loading'}>
          <div className="merchant-list-header">
            <h3>在售商品</h3>
            <span className="shop-status" data-status={shop.state}>
              {synced && <Check aria-hidden="true" />}
              {synced ? '已同步' : shop.state === 'loading' ? '同步中' : shop.state === 'error' ? '同步失败' : '暂无在售'}
            </span>
          </div>
          {synced ? (
            <ul className="shop-list">
              {shop.items.map((item, i) => <ShopItem item={item} key={`${item.name}-${item.localImage || ''}-${i}`} />)}
            </ul>
          ) : (
            <p className="shop-message">
              {shop.state === 'loading' ? '正在获取当前商品…' : shop.state === 'error'
                ? '暂时无法获取商品信息，可点击刷新重试。'
                : label ? '这个时段暂无在售商品。' : '每日 00:00-08:00 通常无远行商人。'}
            </p>
          )}
        </div>
      </Panel>
    </aside>
  )
}

function SiteFooter() {
  return (
    <LayoutFooter material="paperMuted" className="site-footer">
      <div className="site-width footer-inner">
        <Stack size="small" className="footer-info">
          <strong>洛克王国世界工具站</strong>
          <a href="https://beian.mps.gov.cn/#/query/webSearch?code=32058102002843" target="_blank" rel="noreferrer">苏公网安备32058102002843号</a>
        </Stack>
        <Space wrap className="footer-links" aria-label="来源与支持">
          <a href="https://wiki.biligame.com/rocom" target="_blank" rel="noreferrer">数据来源 Wiki <span className="link-arrow" aria-hidden="true" /></a>
          <a href="https://github.com/TartyKisser/ROCOM_hatch_eggs" target="_blank" rel="noreferrer">GitHub 项目 <span className="link-arrow" aria-hidden="true" /></a>
          <Support />
        </Space>
      </div>
    </LayoutFooter>
  )
}

function App() {
  return (
    <RocoTheme colors={siteColors}>
      <Layout as="div" className="site-layout" material="paper">
        <SiteWallpaper />
        <SiteHeader><Feedback /></SiteHeader>
        <LayoutContent className="site-width home-main" padded={false}>
          <Hero />
          <div className="home-content">
            <ToolDirectory />
            <Merchant />
          </div>
        </LayoutContent>
        <Divider className="footer-divider" />
        <SiteFooter />
      </Layout>
    </RocoTheme>
  )
}

createRoot(document.getElementById('app')).render(<App />)
