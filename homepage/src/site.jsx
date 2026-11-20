import React from 'react'
import { LayoutHeader } from 'rocokingdom-ui'
import kingdomLogo from '../assets/roco-kingdom-logo.png'
import wallpaper from '../assets/season-wallpaper.webp'
import wallpaperMobile from '../assets/season-wallpaper-mobile.webp'

export { siteColors } from './site-colors.js'

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
