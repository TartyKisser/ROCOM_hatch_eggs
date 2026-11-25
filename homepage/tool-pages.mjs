import { readdir } from 'node:fs/promises'
import { basename } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parse, parseFragment, serialize } from 'parse5'
import {
  ButtonNormal, Divider, Input, Layout, LayoutContent, LayoutFooter, LayoutHeader,
  Material, Panel, RocoShape, RocoTheme, RuneText, Space,
} from 'rocokingdom-ui'
import { siteColors } from './src/site-colors.js'

export const pages = ['skill.html', 'eggPred.html', 'pair.html', 'hatch.html', 'home.html', 'adventure.html', 'map.html']

function findAll(node, match) {
  return (node.content?.childNodes ?? node.childNodes ?? []).flatMap(child => [
    ...(match(child) ? [child] : []),
    ...findAll(child, match),
  ])
}

function first(node, match) {
  return findAll(node, match)[0]
}

function attribute(node, name) {
  return node.attrs?.find(item => item.name === name)?.value ?? ''
}

function setAttribute(node, name, value) {
  const existing = node.attrs.find(item => item.name === name)
  if (existing) existing.value = value
  else node.attrs.push({ name, value })
}

function hasClass(node, token) {
  return attribute(node, 'class').split(/\s+/).includes(token)
}

function text(node) {
  if (node.nodeName === '#text') return node.value
  return (node.childNodes ?? []).map(text).join('')
}

function setChildren(parent, children) {
  parent.childNodes = children
  for (const child of children) child.parentNode = parent
}

function replace(before, after) {
  const parent = before.parentNode
  const index = parent.childNodes.indexOf(before)
  parent.childNodes.splice(index, 1, ...(after ? [after] : []))
  if (after) after.parentNode = parent
}

function markup(component) {
  return parseFragment(renderToStaticMarkup(component))
}

function copyAttributes(original, target) {
  // Keep the IDs, data attributes, and classes used by each page's scripts.
  for (const { name, value } of original.attrs) {
    const current = attribute(target, name)
    if (name === 'class' && current) setAttribute(target, name, `${current} ${value}`)
    else if (name === 'style' && current) setAttribute(target, name, `${current};${value}`)
    else setAttribute(target, name, value)
  }
}

function styleInput(node) {
  const container = node.parentNode
  const id = attribute(node, 'id')
  if (container.tagName === 'label') {
    container.nodeName = container.tagName = 'div'
    setAttribute(container, 'class', `${attribute(container, 'class')} tool-field`.trim())
    const heading = first(container, item => hasClass(item, 'input-label') || hasClass(item, 'filter-label'))
    if (heading) {
      heading.nodeName = heading.tagName = 'label'
      setAttribute(heading, 'for', id)
    }
  }

  const type = attribute(node, 'type') || 'text'
  const fragment = markup(h(Input, { material: 'paperMuted', size: 'large', type, className: 'tool-input' }))
  const control = first(fragment, child => child.tagName === 'input')
  copyAttributes(node, control)
  const labelled = id && first(container, child => child.tagName === 'label' && attribute(child, 'for') === id)
  if (!labelled && !attribute(node, 'aria-label') && attribute(node, 'placeholder')) {
    setAttribute(control, 'aria-label', attribute(node, 'placeholder'))
  }
  replace(node, fragment.childNodes[0])
}

function styleButton(node) {
  const primary = hasClass(node, 'btn-primary') || hasClass(node, 'primary-btn')
  const material = primary ? 'primary' : 'paperMuted'
  const fragment = markup(h(ButtonNormal, { className: 'tool-button', material }))
  const button = fragment.childNodes[0]
  copyAttributes(node, button)
  setChildren(button, node.childNodes ?? [])
  replace(node, button)
}

function styleMaterial(node) {
  const className = node.tagName === 'select' ? 'tool-select' : 'tool-link'
  const fragment = markup(h(Material, { asChild: true, material: 'paperMuted' }, h(node.tagName, { className })))
  const field = fragment.childNodes[0]
  copyAttributes(node, field)
  setChildren(field, node.childNodes ?? [])
  replace(node, field)
}

function stylePanel(node) {
  const fragment = markup(h(Panel, {
    as: node.tagName, material: 'paperSoft', curve: 'none',
    className: 'tool-panel', contentClassName: 'tool-panel-content',
  }))
  const panel = fragment.childNodes[0]
  const content = first(panel, child => hasClass(child, 'tool-panel-content'))
  copyAttributes(node, panel)
  setChildren(content, node.childNodes ?? [])
  replace(node, panel)
}

function upgradeControls(body) {
  const nodes = findAll(body, node => Boolean(node.tagName))
  for (const node of nodes) {
    if (node.tagName === 'button') styleButton(node)
    if (node.tagName === 'input' && ['text', 'search', 'number', ''].includes(attribute(node, 'type'))) styleInput(node)
    if (node.tagName === 'select' || (node.tagName === 'a' && hasClass(node, 'btn'))) styleMaterial(node)
  }
  for (const panel of findAll(body, node => hasClass(node, 'panel') || hasClass(node, 'card')).reverse()) stylePanel(panel)
}

function ToolHeader({ isMap, homeId }) {
  return h(LayoutHeader, { material: 'stone', className: 'site-header' },
    h('div', { className: 'site-width header-inner' },
      h('a', { className: 'brand', href: './', 'aria-label': '洛克王国世界工具站首页' },
        h('span', { className: 'kingdom-wordmark', 'aria-hidden': true },
          h('img', { src: './assets/roco-kingdom-logo.png', width: 851, height: 295, alt: '' })),
        h('span', null, '世界工具站')),
      isMap && h(RuneText, { as: 'h1', className: 'tool-map-title' }, '世界地图'),
      h(Space, { size: 'small' },
        h(Material, { asChild: true, material: 'paperSoft' },
          h(RocoShape, { as: 'a', className: 'tool-home-link', href: './', id: homeId }, '返回首页')))),
  )
}

function ToolLayout({ title, description, isMap, hasMain, hasFooter, hasCredits, homeId }) {
  return h(RocoTheme, { colors: siteColors },
    h(Layout, { as: 'div', material: 'paper', className: `site-layout tool-layout${isMap ? ' tool-map-layout' : ''}` },
      !isMap && h('picture', { className: 'site-wallpaper', 'aria-hidden': true },
        h('source', { srcSet: './assets/season-wallpaper-mobile.webp', media: '(max-width: 560px)' }),
        h('img', { src: './assets/season-wallpaper.webp', width: 2560, height: 1440, alt: '', fetchPriority: 'high' })),
      h(ToolHeader, { isMap, homeId }),
      h(LayoutContent, { as: hasMain ? 'div' : 'main', padded: false, className: 'tool-main' },
        !isMap && h('div', { className: 'site-width tool-intro' },
          h(RuneText, { as: 'h1' }, title),
          description && h('p', null, description)),
        h('div', { className: `${isMap ? '' : 'site-width '}tool-content`, id: 'tool-content' }),
        hasCredits && h('div', { className: 'site-width tool-credits', id: 'tool-credits' })),
      hasFooter && h(Divider, { className: 'footer-divider' }),
      hasFooter && h(LayoutFooter, { material: 'paperMuted', className: 'site-footer' },
        h('div', { className: 'site-width footer-inner tool-footer', id: 'tool-footer' },
          h('a', { href: './' }, '洛克王国世界工具站')))),
  )
}

function renderToolPage(html, page) {
  const document = parse(html)
  const head = first(document, node => node.tagName === 'head')
  const body = first(document, node => node.tagName === 'body')
  const isMap = page === 'map.html'
  setAttribute(body, 'class', `tool-page tool-page-${page.slice(0, -5).toLowerCase()}`)

  const header = first(body, node => node.tagName === 'header')
  const title = header && first(header, node => node.tagName === 'h1')
  const description = header && first(header, node => hasClass(node, 'desc-font'))
  const credits = header && first(header, node => hasClass(node, 'source-panel'))
  if (credits) replace(credits)
  if (header) replace(header)

  const homeId = first(body, node => attribute(node, 'id') === 'homeLink') ? 'homeLink' : undefined
  for (const node of findAll(body, node => node.tagName === 'a' && attribute(node, 'href') === 'index.html')) replace(node)
  const hatchToolbar = first(body, node => hasClass(node, 'app-toolbar'))
  if (page === 'hatch.html' && hatchToolbar) replace(hatchToolbar)

  const oldFooter = first(body, node => hasClass(node, 'footer-beian'))
  const footerLink = oldFooter && first(oldFooter, node => node.tagName === 'a')
  if (footerLink) {
    setChildren(footerLink, footerLink.childNodes.filter(node => node.tagName !== 'img'))
    replace(oldFooter)
  }

  upgradeControls(body)
  const original = body.childNodes
  const shell = markup(h(ToolLayout, {
    title: title ? text(title).trim() : '世界地图',
    description: description ? text(description).trim() : '',
    isMap,
    hasMain: Boolean(first(body, node => node.tagName === 'main')),
    hasFooter: Boolean(footerLink),
    hasCredits: Boolean(credits),
    homeId,
  }))
  setChildren(first(shell, node => attribute(node, 'id') === 'tool-content'), original.filter(node => node.tagName !== 'script'))
  if (credits) setChildren(first(shell, node => attribute(node, 'id') === 'tool-credits'), [credits])
  if (footerLink) {
    const footer = first(shell, node => attribute(node, 'id') === 'tool-footer')
    setChildren(footer, [...footer.childNodes, footerLink])
  }
  setChildren(body, [...shell.childNodes, ...original.filter(node => node.tagName === 'script')])

  const font = isMap ? 'map' : 'tools'
  const links = parseFragment(
    `<link rel="preload" as="font" href="./fonts/roco-kingdom-sans-${font}.woff2" type="font/woff2" crossorigin>` +
    '<link rel="stylesheet" href="./src/tools/tool-theme.css">' +
    `<link rel="stylesheet" href="./fonts/roco-fonts-${font}.css">`,
  )
  setChildren(head, [...head.childNodes, ...links.childNodes])
  for (const node of findAll(document, item => item.nodeName === '#text')) {
    const parent = node.parentNode
    if (['script', 'style', 'pre', 'textarea'].includes(parent.tagName)) continue
    node.value = node.value.replace(/[ \t]+(?=\n)/g, '')
    const next = parent.childNodes[parent.childNodes.indexOf(node) + 1]
    if (next?.nodeName === '#text' && next.value.startsWith('\n')) node.value = node.value.replace(/[ \t]+$/, '')
  }
  return serialize(document)
}

export function toolPagesPlugin() {
  return {
    name: 'rocom-tool-pages',
    transformIndexHtml: {
      order: 'pre',
      async handler(html, context) {
        const page = basename(context.filename)
        const rendered = renderToolPage(html, page)
        if (page !== 'adventure.html') return rendered

        // The handbook reserves icon paths even when a fruit is unavailable.
        const directory = 'sprite_imgs/icon-fruit'
        const entries = await readdir(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true })
        const fruitPaths = entries.filter(entry => entry.isFile()).map(entry => `${directory}/${entry.name}`).sort()
        return {
          html: rendered,
          tags: [{
            tag: 'script',
            attrs: { id: 'fruit-paths', type: 'application/json' },
            children: JSON.stringify(fruitPaths).replaceAll('<', '\\u003c'),
            injectTo: 'body-prepend',
          }],
        }
      },
    },
  }
}
