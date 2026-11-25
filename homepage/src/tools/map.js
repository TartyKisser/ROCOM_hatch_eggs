import { markerImage, node, renderMapDetails } from './map-details.js'
import { MapView, project } from './map-view.js'

const dataRoot = new URL('./map_data/', document.baseURI)
const dataUrl = file => new URL(file, dataRoot).href
const wiki = 'https://wiki.biligame.com/nrc/'
const storageKey = 'rocom-world-map'
const narrowScreen = window.matchMedia('(max-width: 760px)')
const number = new Intl.NumberFormat('zh-CN')
const excludedChallenges = new Set(['火盆', '天气石像', '力气测试仪', '女神祭坛', '扭蛋机', '赛季玩法'])
const isDefaultCategory = category => category.classId === 2
const collectibleGenres = new Set([
  '音乐收集', '蓝色眠枭之星', '金色眠枭之星', '紫色眠枭之星',
  '初级宝箱', '高级宝箱', '系别宝箱', '精灵问答宝箱', '初级闪光点', '中级闪光点', '高级闪光点',
  '力气测试仪', '小游戏', '蓝色智慧树苗', '金色智慧树苗', '紫色智慧树苗', '不咕钟零件', '扭蛋机',
])
const presets = [
  ['探索', isDefaultCategory],
  ['精灵', category => category.classId === 7],
  ['宝箱', category => /宝箱|闪光点$/.test(category.genre)],
  ['采集', category => category.classId === 8],
  ['挑战', category => [3, 9].includes(category.classId) ||
    (category.classId === 4 && !excludedChallenges.has(category.genre))],
  ['眠枭之星', category => category.genre.includes('眠枭之星')],
]

const ids = [
  'mapFilters', 'mapSummary', 'foldFilterButton', 'restoreFilterButton', 'mapSelect', 'floorSelect',
  'mapSearch', 'mapSearchResults', 'mapPresets', 'showAllButton', 'hideAllButton', 'resetFiltersButton', 'hideCollected',
  'groupList', 'mapViewport', 'mapCanvas', 'zoomInButton', 'zoomOutButton', 'fitMapButton',
  'mapRegion', 'visibleCount', 'mapZoom', 'mapLoading', 'mapLoadingText', 'mapRetry',
  'mapDetails', 'closeMapDetails', 'mapDetailContent',
]
const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]))
const shell = ui.mapViewport.closest('.map-shell')
const files = new Map()
const categoryButtons = new Map()
const presetButtons = []
const state = {
  manifest: null, map: null, mapId: null, sequence: 0, floor: 'surface', enabled: new Set(),
  collected: new Set(readStorage('collected') || []), query: '', matches: null, selected: null,
  detailSequence: 0, retry: null,
}

function readStorage(name) {
  try {
    const value = JSON.parse(localStorage.getItem(`${storageKey}:${name}`))
    return Array.isArray(value) ? value : null
  } catch { return null }
}

function writeStorage(name, value) {
  try { localStorage.setItem(`${storageKey}:${name}`, JSON.stringify([...value])) } catch { /* Private mode. */ }
}

function requestData(file) {
  return fetch(dataUrl(file), { cache: file === 'manifest.json' ? 'no-cache' : 'force-cache' }).then(response => {
    if (!response.ok) throw new Error(`地图文件加载失败（${response.status}）`)
    return response.json()
  })
}

function getData(file) {
  if (!files.has(file)) files.set(file, requestData(file).catch(error => {
    files.delete(file)
    throw error
  }))
  return files.get(file)
}

function mediaUrl(path) {
  return path.startsWith('media/') ? dataUrl(path) : path
}

function normalizeMap(data) {
  const imagery = map => map && ({ overview: dataUrl(map.overview), tiles: map.tiles.map(dataUrl) })
  const patches = data.patches.map(patch => ({ ...patch, image: dataUrl(patch.image) }))
  const layers = [null, ...patches]
  const categories = data.categories.map(category => ({ ...category, icon: mediaUrl(category.icon) }))
  const points = data.points.map(row => {
    const [id, x, y, categoryIndex, title, regionName, provinceName, iconIndex, terms, pets,
      layerIds, detailIndex, commentId, estimated] = row
    const [mx, my] = project(data, x, y)
    const [name, region, province, icon, searchTerms, petSummary] =
      [title, regionName, provinceName, iconIndex, terms, pets].map(index => data.strings[index])
    const category = categories[categoryIndex]
    const pointLayers = layerIds.map(index => layers[index]).filter(Boolean)
    const floors = new Set(pointLayers.flatMap(layer => layer.floors))
    const searchText = [id, name, category.genre, region, province, searchTerms, petSummary].join(' ').toLowerCase()
    return { id, x, y, mx, my, category, name, region, province, searchText, petSummary,
      icon: mediaUrl(icon), layers: pointLayers, floors, detailIndex, commentId, estimated,
      collected: state.collected.has(id) }
  })
  const regions = [...data.regions].sort((a, b) => b.priority - a.priority ||
    b.nameScale - a.nameScale || a.polygonArea - b.polygonArea)
  return { ...data, patches, categories, points, regions, surface: imagery(data.surface),
    underground: imagery(data.underground) }
}

function displayStatus(text, retry) {
  ui.mapLoading.hidden = !text
  if (text) ui.mapLoadingText.textContent = text
  state.retry = retry ?? null
  ui.mapRetry.hidden = !state.retry
}

function terrainStatus({ count, zoom, zoomIn, zoomOut, terrainFailed }) {
  const text = `视野内 ${number.format(count)} 个点位`
  if (ui.visibleCount.textContent !== text) ui.visibleCount.textContent = text
  const scale = `${zoom}%`
  if (ui.mapZoom.textContent !== scale) ui.mapZoom.textContent = scale
  ui.zoomInButton.disabled = !zoomIn
  ui.zoomOutButton.disabled = !zoomOut
  if (terrainFailed && ui.mapLoading.hidden) displayStatus('底图加载失败。', () => location.reload())
  if (!terrainFailed && ui.mapLoadingText.textContent === '底图加载失败。') displayStatus('')
}

function inBounds(x, y, [left, top, right, bottom]) {
  return x >= left && x <= right && y >= top && y <= bottom
}

function inPolygon(x, y, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = polygon[i]
    const [c, d] = polygon[j]
    if ((b > y) !== (d > y) && x < a + (c - a) * (y - b) / (d - b)) inside = !inside
  }
  return inside
}

function updateRegion(mx, my) {
  const map = state.map
  if (!map || state.selected) return
  const [left, top, right, bottom] = map.bounds
  const x = left + mx / map.size * (right - left)
  const y = top + my / map.size * (bottom - top)
  const patch = map.patches.find(item => item.floors.includes(state.floor) && inBounds(x, y, item.bounds))
  const region = patch || map.regions.find(item => inBounds(x, y, item.bbox) && inPolygon(x, y, item.polygon))
  const text = region && region.name !== map.name ? `${map.name} · ${region.name}` : map.name
  if (ui.mapRegion.textContent !== text) ui.mapRegion.textContent = text
}

const view = new MapView(ui.mapCanvas, { onDraw: terrainStatus, onPick: pickPoints, onHover: updateRegion })

function fillOptions(select, entries) {
  select.replaceChildren(...entries.map(([value, label]) => new Option(label, value)))
}

function defaultCategories(map) {
  return new Set(map.categories.filter(isDefaultCategory).map(category => category.id))
}

function updateUrl() {
  const url = new URL(location.href)
  if (state.mapId === 'mainland') url.searchParams.delete('map')
  else url.searchParams.set('map', state.mapId)
  if (state.floor === 'surface') url.searchParams.delete('layer')
  else url.searchParams.set('layer', state.floor)
  history.replaceState(null, '', url)
}

async function loadMap(id, floor = 'surface') {
  const entry = state.manifest.maps[id]
  const sequence = ++state.sequence
  try {
    displayStatus(`正在加载${entry.name}…`)
    const data = await getData(entry.file)
    if (state.sequence !== sequence) return
    const map = normalizeMap(data)
    closeDetails(false)
    clearSearch()
    state.map = map
    state.mapId = id
    const patch = map.patches.find(item => item.id === floor)
    state.floor = Object.hasOwn(map.floors, floor) ? floor : patch?.floors[0] || 'surface'
    const saved = readStorage(`filters:${id}`)
    const knownCategories = new Set(map.categories.map(category => category.id))
    state.enabled = saved ? new Set(saved.filter(category => knownCategories.has(category))) :
      defaultCategories(map)
    fillOptions(ui.floorSelect, Object.entries(map.floors))
    ui.floorSelect.disabled = Object.keys(map.floors).length === 1
    ui.mapSelect.value = id
    ui.floorSelect.value = state.floor
    ui.mapRegion.textContent = map.name
    view.setMap(map)
    if (patch) focusPatch(patch)
    renderGroups()
    updateFilters()
    updateUrl()
    displayStatus('')
  } catch {
    if (state.sequence === sequence) displayStatus(`${entry.name}加载失败。`, () => loadMap(id, floor))
  }
}

function onFloor(point) {
  return state.floor === 'surface' || point.floors.has(state.floor)
}

function showPoint(point) {
  return onFloor(point) && (!ui.hideCollected.checked || !point.collected) &&
    (state.matches ? state.matches.has(point) : state.enabled.has(point.category.id))
}

function renderGroups() {
  const open = new Set([...ui.groupList.querySelectorAll('details[open]')].map(details => details.dataset.group))
  const counts = new Map()
  for (const point of state.map.points) {
    if (onFloor(point)) counts.set(point.category.id, (counts.get(point.category.id) || 0) + 1)
  }
  const groups = new Map()
  categoryButtons.clear()
  for (const category of state.map.categories) {
    const count = counts.get(category.id)
    if (!count) continue
    if (!groups.has(category.className)) groups.set(category.className, [])
    groups.get(category.className).push({ category, count })
  }
  const result = document.createDocumentFragment()
  for (const [group, categories] of groups) {
    const details = node('details', 'map-group')
    details.dataset.group = group
    details.open = open.has(group) || categories.some(({ category }) => state.enabled.has(category.id))
    const label = node('summary', '', group)
    label.append(node('small', '', `${categories.length} 类`))
    const buttons = node('div', 'map-categories')
    for (const { category, count } of categories) {
      const button = node('button', 'category-chip')
      button.type = 'button'
      button.dataset.category = category.id
      if (category.icon) button.append(markerImage(category.icon, 'map-icon'))
      button.append(node('span', '', `${category.genre} ${number.format(count)}`))
      button.addEventListener('click', () => changeCategories(() => {
        if (!state.enabled.delete(category.id)) state.enabled.add(category.id)
      }))
      categoryButtons.set(category.id, button)
      buttons.append(button)
    }
    details.append(label, buttons)
    result.append(details)
  }
  ui.groupList.replaceChildren(result)
  if (!groups.size) ui.groupList.append(node('p', '', '该图层暂无点位。'))
}

function changeCategories(change) {
  if (!state.map) return
  clearSearch()
  change()
  writeStorage(`filters:${state.mapId}`, state.enabled)
  updateFilters()
}

function updateFilters() {
  for (const [id, button] of categoryButtons) button.setAttribute('aria-pressed', String(state.enabled.has(id)))
  presetButtons.forEach(({ button, match }) => {
    const categories = state.map.categories.filter(match)
    const active = !state.matches && categories.length > 0 && categories.length === state.enabled.size &&
      categories.every(category => state.enabled.has(category.id))
    button.setAttribute('aria-pressed', String(active))
  })
  const count = state.map.points.reduce((total, point) => total + Number(showPoint(point)), 0)
  ui.mapSummary.textContent = `${state.map.season} · 当前 ${number.format(count)} 个点位`
  view.setFilters(state.floor, showPoint, state.selected)
}

function focusPatch(patch) {
  const { bounds } = patch
  const [x, y] = project(state.map, (bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
  view.centerOn(x, y)
}

function changeFloor(floor) {
  if (!state.map || !Object.hasOwn(state.map.floors, floor)) return
  state.floor = floor
  ui.floorSelect.value = floor
  renderGroups()
  updateFilters()
  updateUrl()
}

function clearSearch() {
  state.query = ''
  state.matches = null
  ui.mapSearch.value = ''
  ui.mapSearchResults.replaceChildren()
  ui.mapSearchResults.hidden = true
}

function locationNames(point) {
  return [...new Set([point.province, point.region, point.layers[0]?.name].filter(Boolean))]
}

function pointButton(point, action) {
  const button = node('button', 'map-result')
  button.type = 'button'
  button.append(node('strong', '', point.name))
  const location = locationNames(point).join(' · ')
  if (location) button.append(node('small', '', location))
  button.addEventListener('click', () => action(point))
  return button
}

function searchPoints() {
  if (!state.map) return
  state.query = ui.mapSearch.value.trim().toLowerCase()
  if (!state.query) {
    clearSearch()
    updateFilters()
    return
  }
  const terms = state.query.split(/\s+/)
  const matches = state.map.points.filter(point => terms.every(term => point.searchText.includes(term)))
  state.matches = new Set(matches)
  const exact = matches.find(point => point.name.toLowerCase() === state.query)
  const samples = exact ? [exact, ...matches.filter(point => point !== exact).slice(0, 7)] : matches.slice(0, 8)
  const summary = matches.length > samples.length
    ? `匹配 ${number.format(matches.length)} 个点位，显示前 ${samples.length} 个。`
    : `匹配 ${number.format(matches.length)} 个点位。`
  ui.mapSearchResults.replaceChildren(node('p', 'map-search-summary', summary),
    ...samples.map(point => pointButton(point, navigateToPoint)))
  ui.mapSearchResults.hidden = false
  updateFilters()
}

function setFilterHidden(hidden, focus = false) {
  ui.mapFilters.hidden = hidden
  ui.restoreFilterButton.hidden = !hidden
  ui.foldFilterButton.setAttribute('aria-expanded', String(!hidden))
  shell.classList.toggle('is-filter-hidden', hidden)
  if (focus) (hidden ? ui.restoreFilterButton : ui.foldFilterButton).focus()
}

function navigateToPoint(point) {
  if (!onFloor(point) || (state.floor === 'surface' && point.layers.length)) changeFloor(point.layers[0]?.floors[0] || 'surface')
  if (!state.matches) state.enabled.add(point.category.id)
  if (narrowScreen.matches) setFilterHidden(true)
  view.centerOn(point.mx, point.my)
  openDetails(point)
}

function pickPoints(points) {
  if (points.length === 0) closeDetails(false)
  else if (points.length === 1) openDetails(points[0])
  else {
    closeDetails(false)
    const list = node('div', 'map-point-list')
    list.append(node('strong', '', `附近 ${number.format(points.length)} 个点位`))
    const zoom = node('button', 'map-result', '放大到这组点位')
    zoom.type = 'button'
    zoom.addEventListener('click', () => {
      const center = points.reduce(([x, y], point) => [x + point.mx, y + point.my], [0, 0])
      view.centerOn(center[0] / points.length, center[1] / points.length,
        Math.min(20, view.scale / view.fitScale * 1.8))
      closeDetails(false)
    })
    list.append(zoom, ...points.slice(0, 32).map(point => pointButton(point, openDetails)))
    ui.mapDetailContent.replaceChildren(list)
    ui.mapDetails.hidden = false
  }
}

function closeDetails(focus = true) {
  state.selected = null
  state.detailSequence++
  ui.mapDetails.hidden = true
  ui.mapDetailContent.replaceChildren()
  if (state.map) {
    ui.mapRegion.textContent = state.map.name
    view.setFilters(state.floor, showPoint, null)
  }
  if (focus) ui.mapViewport.focus()
}

async function openDetails(point) {
  const token = ++state.detailSequence
  state.selected = point
  const heading = node('div', 'map-detail-heading')
  const icon = point.icon || point.category.icon
  if (icon) heading.append(markerImage(icon))
  const title = node('h2', '', point.name)
  heading.append(title)
  const location = [point.category.genre, ...locationNames(point), `X ${point.x} · Y ${point.y}`].join(' · ')
  const meta = node('p', 'map-detail-meta', location)
  const actions = node('div', 'map-detail-actions')
  if (collectibleGenres.has(point.category.genre)) {
    const mark = node('button')
    mark.type = 'button'
    mark.title = '收集进度保存在此浏览器'
    const label = () => {
      mark.textContent = point.collected ? '取消已收集' : '标记已收集'
      mark.setAttribute('aria-pressed', String(point.collected))
    }
    label()
    mark.addEventListener('click', () => {
      point.collected = !point.collected
      if (point.collected) state.collected.add(point.id)
      else state.collected.delete(point.id)
      writeStorage('collected', state.collected)
      label()
      updateFilters()
    })
    actions.append(mark)
  }
  if (point.layers.length && state.floor === 'surface') {
    const go = node('button', '', '查看地下图层')
    go.type = 'button'
    go.addEventListener('click', () => navigateToPoint(point))
    actions.append(go)
  }
  if (point.commentId) {
    const link = node('a', 'map-detail-wiki', 'Wiki 点位记录')
    link.href = `${wiki}index.php?curid=${encodeURIComponent(point.commentId)}`
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    actions.append(link)
  }
  const body = node('div')
  body.append(node('p', 'map-detail-copy', '正在加载点位详情…'))
  ui.mapDetailContent.replaceChildren(heading, meta)
  if (point.estimated || point.category.classId === 7) {
    ui.mapDetailContent.append(node('p', 'map-detail-meta', '区域代表点，非精确刷新位置。'))
  }
  ui.mapDetailContent.append(actions, body)
  ui.mapDetails.hidden = false
  ui.mapDetails.scrollTop = 0
  ui.mapRegion.textContent = locationNames(point).join(' · ')
  updateFilters()
  try {
    const { details, detailPageSize } = state.map
    const file = details[Math.floor(point.detailIndex / detailPageSize)]
    const page = await getData(file)
    if (token !== state.detailSequence) return
    const detail = page[point.detailIndex % detailPageSize]
    if (detail.title) title.textContent = detail.title
    renderMapDetails(body, detail)
  } catch {
    if (token !== state.detailSequence) return
    const retry = node('button', 'map-result', '点位详情加载失败，点击重试')
    retry.type = 'button'
    retry.addEventListener('click', () => openDetails(point))
    body.replaceChildren(retry)
  }
}

async function init() {
  try {
    state.manifest = await getData('manifest.json')
    if (state.manifest.schema !== 1) throw new Error('地图数据版本不兼容')
    const params = new URLSearchParams(location.search)
    const id = params.get('map')
    fillOptions(ui.mapSelect, Object.entries(state.manifest.maps).map(([key, value]) => [key, value.name]))
    await loadMap(Object.hasOwn(state.manifest.maps, id) ? id : 'mainland', params.get('layer') || 'surface')
  } catch {
    displayStatus('地图资料加载失败。', init)
  }
}

for (const [label, match] of presets) {
  const button = node('button', 'category-chip', label)
  button.type = 'button'
  button.addEventListener('click', () => changeCategories(() => {
    state.enabled = new Set(state.map.categories.filter(match).map(category => category.id))
  }))
  ui.mapPresets.append(button)
  presetButtons.push({ button, match })
}
ui.mapSelect.addEventListener('change', () => loadMap(ui.mapSelect.value))
ui.floorSelect.addEventListener('change', () => {
  closeDetails(false)
  changeFloor(ui.floorSelect.value)
})
let searchTimer
ui.mapSearch.addEventListener('input', () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(searchPoints, 110)
})
ui.mapSearch.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    window.clearTimeout(searchTimer)
    searchPoints()
    ui.mapSearchResults.querySelector('button')?.click()
  }
})
ui.showAllButton.addEventListener('click', () => changeCategories(() => {
  state.enabled = new Set(state.map.categories.map(category => category.id))
}))
ui.hideAllButton.addEventListener('click', () => changeCategories(() => state.enabled.clear()))
ui.resetFiltersButton.addEventListener('click', () => changeCategories(() => {
  state.enabled = defaultCategories(state.map)
  ui.hideCollected.checked = false
}))
ui.hideCollected.addEventListener('change', () => { if (state.map) updateFilters() })
ui.foldFilterButton.addEventListener('click', () => setFilterHidden(true, true))
ui.restoreFilterButton.addEventListener('click', () => setFilterHidden(false, true))
ui.zoomInButton.addEventListener('click', () => view.zoomIn())
ui.zoomOutButton.addEventListener('click', () => view.zoomOut())
ui.fitMapButton.addEventListener('click', () => view.reset())
ui.mapRetry.addEventListener('click', () => state.retry?.())
ui.closeMapDetails.addEventListener('click', () => closeDetails())
ui.mapViewport.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !ui.mapDetails.hidden) closeDetails()
  if (event.target !== ui.mapViewport) return
  const actions = {
    ArrowLeft: () => view.move(75, 0), ArrowRight: () => view.move(-75, 0),
    ArrowUp: () => view.move(0, 75), ArrowDown: () => view.move(0, -75),
    '+': () => view.zoomIn(), '=': () => view.zoomIn(), '-': () => view.zoomOut(), '0': () => view.reset(),
  }
  if (Object.hasOwn(actions, event.key)) {
    event.preventDefault()
    actions[event.key]()
  }
})

init()
