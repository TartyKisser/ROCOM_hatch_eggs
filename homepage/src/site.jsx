import React from 'react'
import { LayoutHeader } from 'rocokingdom-ui'
import kingdomLogo from '../assets/roco-kingdom-logo.png'
import wallpaper from '../assets/season-wallpaper.webp'
import wallpaperMobile from '../assets/season-wallpaper-mobile.webp'

export const siteColors = {
  primary: '#ffca63', primarySoft: '#ffdf98', primaryMuted: '#f6bb57', primaryStrong: '#d99327',
  onPrimary: '#272421', onPrimarySoft: '#272421', onPrimaryMuted: '#272421', onPrimaryStrong: '#272421',
  paper: '#f5f0e6', paperSoft: '#fffaf1', paperMuted: '#ede4d5', paperStrong: '#d3bda0',
  onPaper: '#282522', onPaperSoft: '#282522', onPaperMuted: '#282522', onPaperStrong: '#282522',
  stone: '#272624', stoneSoft: '#41403a', stoneMuted: '#555145', stoneStrong: '#201f1d',
  onStone: '#fff6e6', onStoneSoft: '#fff6e6', onStoneMuted: '#fff6e6', onStoneStrong: '#fff6e6',
}

export function KingdomWordmark() {
  return (
    <span className="kingdom-wordmark" aria-hidden="true">
      <img src={kingdomLogo} width="851" height="295" alt="" />
    </span>
  )
}

export function SiteHeader({ children }) {
  return (
    <LayoutHeader material="stone" className="site-header">
      <div className="site-width header-inner">
        <a className="brand" href="./" aria-label="洛克王国世界工具站首页">
          <KingdomWordmark />
          <span>世界工具站</span>
        </a>
        {children}
      </div>
    </LayoutHeader>
  )
}

export function SiteWallpaper() {
  return (
    <picture className="site-wallpaper" aria-hidden="true">
      <source media="(max-width: 560px)" srcSet={wallpaperMobile} width="1080" height="2101" />
      <img src={wallpaper} width="2560" height="1440" alt="" fetchPriority="high" />
    </picture>
  )
}
