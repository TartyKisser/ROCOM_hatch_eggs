import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Button, ButtonNormal, Divider, Layout, LayoutContent, LayoutFooter, Panel, RocoTheme, RuneText,
} from 'rocokingdom-ui'
import 'rocokingdom-ui/style.css'
import '../../fonts/roco-fonts.css'
import '../../fonts/roco-fonts-handbook.css'
import '../home.css'
import './handbook.css'
import { SiteHeader, SiteWallpaper, siteColors } from '../site.jsx'
import { eggGroups, readHash, searchEntry } from './data.js'
import { PageLink } from './common.jsx'
import { Detail } from './detail.jsx'
import { Gallery, emptyFilters } from './gallery.jsx'

function Intro() {
  return (
    <div className="dex-intro">
      <RuneText as="h1">精灵图鉴</RuneText>
      <p>查精灵、技能、分布与繁育资料。</p>
    </div>
  )
}

function Catalogue({ records }) {
  const byId = useMemo(() => new Map(records.map(record => [record.id, record])), [records])
  const index = useMemo(() => records.map(searchEntry), [records])
  const groups = useMemo(() => [...new Set(records.flatMap(eggGroups))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [records])
  const [id, setId] = useState(readHash)
  const currentId = useRef(id)
  const galleryScroll = useRef(0)
  const [filters, setFilters] = useState(emptyFilters)
  const selected = byId.get(id)

  useEffect(() => {
    const restoration = history.scrollRestoration
    history.scrollRestoration = 'manual'

    function syncLocation() {
      const next = readHash()
      if (next === currentId.current) return
      if (byId.has(next) && !byId.has(currentId.current)) galleryScroll.current = window.scrollY
      currentId.current = next
      setId(next)
    }

    window.addEventListener('hashchange', syncLocation)
    window.addEventListener('popstate', syncLocation)
    syncLocation()
    return () => {
      window.removeEventListener('hashchange', syncLocation)
      window.removeEventListener('popstate', syncLocation)
      history.scrollRestoration = restoration
    }
  }, [byId])

  useLayoutEffect(() => {
    window.scrollTo(0, selected ? 0 : galleryScroll.current)
  }, [selected])

  function returnToGallery() {
    history.pushState(null, '', location.pathname + location.search)
    currentId.current = ''
    setId('')
  }

  return selected ? (
    <Detail key={selected.id} record={selected} byId={byId} onBack={returnToGallery} />
  ) : (
    <>
      <Intro />
      <Gallery index={index} groups={groups} filters={filters} setFilters={setFilters} />
    </>
  )
}

function BackToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    function syncVisibility() { setVisible(window.scrollY > 320) }
    window.addEventListener('scroll', syncVisibility, { passive: true })
    syncVisibility()
    return () => window.removeEventListener('scroll', syncVisibility)
  }, [])
  return visible && (
    <ButtonNormal className="dex-back-top" aria-label="回到顶部" material="stone" size="large"
      onClick={() => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>
      ↑
    </ButtonNormal>
  )
}

function App() {
  const [data, setData] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const request = new AbortController()
    async function load() {
      try {
        const response = await fetch('./handbook_data.json', { signal: request.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json()
        if (!Array.isArray(payload.records)) throw new Error('Missing records array')
        if (!request.signal.aborted) setData({ status: 'ready', records: payload.records })
      } catch {
        if (!request.signal.aborted) setData({ status: 'error' })
      }
    }
    load()
    return () => request.abort()
  }, [attempt])

  function retry() {
    setData({ status: 'loading' })
    setAttempt(attempt + 1)
  }

  return (
    <RocoTheme colors={siteColors}>
      <Layout as="div" className="site-layout handbook-layout" material="paper">
        <SiteWallpaper />
        <SiteHeader><PageLink href="./">返回首页</PageLink></SiteHeader>
        <LayoutContent className="site-width handbook-main" padded={false}>
          {data.status === 'ready' ? <Catalogue records={data.records} /> : (
            <>
              <Intro />
              <Panel material="paperSoft" curve="none" className="dex-empty" contentClassName="dex-load-status">
                <p role="status">{data.status === 'error' ? '图鉴数据加载失败。' : '正在加载图鉴数据…'}</p>
                {data.status === 'error' && <Button onClick={retry}>重新加载</Button>}
              </Panel>
            </>
          )}
        </LayoutContent>
        <Divider className="footer-divider" />
        <LayoutFooter material="paperMuted" className="site-footer">
          <div className="site-width footer-inner dex-footer">
            <a href="./">洛克王国世界工具站</a>
            <a href="https://beian.mps.gov.cn/#/query/webSearch?code=32058102002843" target="_blank" rel="noreferrer">苏公网安备32058102002843号</a>
          </div>
        </LayoutFooter>
        <BackToTop />
      </Layout>
    </RocoTheme>
  )
}

createRoot(document.getElementById('app')).render(<App />)
