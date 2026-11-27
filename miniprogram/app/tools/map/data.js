const { requestSite } = require('../../lib/tool-data')
const { siteImage } = require('../../lib/site')

const files = new Map()
const excludedChallenges = new Set(['火盆', '天气石像', '力气测试仪', '女神祭坛', '扭蛋机', '赛季玩法'])
const defaultCategory = category => category.classId === 2
const presets = [
  { label: '探索', test: defaultCategory },
  { label: '精灵', test: category => category.classId === 7 },
  { label: '宝箱', test: category => /宝箱|闪光点$/.test(category.genre) },
  { label: '采集', test: category => category.classId === 8 },
  { label: '挑战', test: category => [3, 9].includes(category.classId) || (category.classId === 4 && !excludedChallenges.has(category.genre)) },
  { label: '眠枭之星', test: category => category.genre.includes('眠枭之星') },
]
const collectible = new Set([
  '音乐收集', '蓝色眠枭之星', '金色眠枭之星', '紫色眠枭之星', '初级宝箱', '高级宝箱', '系别宝箱', '精灵问答宝箱',
  '初级闪光点', '中级闪光点', '高级闪光点', '力气测试仪', '小游戏', '蓝色智慧树苗', '金色智慧树苗', '紫色智慧树苗', '不咕钟零件', '扭蛋机',
])

function loadMapFile(file, refresh = false) {
  if (!/^[\w-]+\.json$/.test(file || '')) return Promise.reject(new Error('地图文件名称有误'))
  if (refresh) files.delete(file)
  if (!files.has(file)) {
    const result = requestSite(`map_data/${file}`, { header: refresh ? { 'Cache-Control': 'no-cache' } : {} }).catch(error => {
      if (files.get(file) === result) files.delete(file)
      throw error
    })
    files.set(file, result)
  }
  return files.get(file)
}

function imageUrl(path, mirror) {
  if (typeof path !== 'string') return ''
  const file = mirror[path] || (path.startsWith('media/') ? path : '')
  return file ? siteImage(`map_data/${file}`) : ''
}

function project(map, x, y) {
  const [left, top, right, bottom] = map.bounds
  return [(x - left) / (right - left) * map.size, (y - top) / (bottom - top) * map.size]
}

function normalizeMap(map, mirror) {
  const imagery = layer => layer && ({ overview: imageUrl(layer.overview, mirror), tiles: layer.tiles.map(tile => imageUrl(tile, mirror)) })
  const categories = map.categories.map(category => ({ ...category, icon: imageUrl(category.icon, mirror) }))
  const patches = map.patches.map(patch => {
    const [x, y] = project(map, patch.bounds[0], patch.bounds[1])
    const [right, bottom] = project(map, patch.bounds[2], patch.bounds[3])
    return { ...patch, x, y, width: right - x, height: bottom - y, image: imageUrl(patch.image, mirror) }
  })
  const points = map.points.map(row => {
    const [id, x, y, kind, title, area, provinceIndex, iconIndex, terms, petIndex, layers, detailIndex, commentId, estimated] = row
    const category = categories[kind]
    const [name, region, province, icon, keywords, pets] = [title, area, provinceIndex, iconIndex, terms, petIndex].map(i => map.strings[i] || '')
    const [mx, my] = project(map, x, y)
    const pointLayers = layers.map(index => patches[index - 1]).filter(Boolean)
    const floors = new Set(pointLayers.flatMap(layer => layer.floors))
    const search = [id, name, category.genre, region, province, keywords, pets].join(' ').toLowerCase()
    return { id, x, y, mx, my, name, region, province, search, category, detailIndex, commentId, estimated, floors, layers: pointLayers,
      icon: imageUrl(icon, mirror) || category.icon }
  })
  return { ...map, categories, points, patches, byId: new Map(points.map(point => [point.id, point])),
    surface: imagery(map.surface), underground: imagery(map.underground),
    regions: [...map.regions].sort((a, b) => b.priority - a.priority || b.nameScale - a.nameScale || a.polygonArea - b.polygonArea) }
}

function location(point) {
  return [...new Set([point.province, point.region, point.layers[0]?.name].filter(Boolean))].join(' · ')
}

function contains(x, y, box) {
  return box && x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]
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

function regionAt(map, floor, mx, my) {
  const [left, top, right, bottom] = map.bounds
  const x = left + mx / map.size * (right - left)
  const y = top + my / map.size * (bottom - top)
  const patch = map.patches.find(item => item.floors.includes(floor) && contains(x, y, item.bounds))
  return (patch || map.regions.find(region => contains(x, y, region.bbox) && inPolygon(x, y, region.polygon)))?.name || map.name
}

module.exports = { loadMapFile, normalizeMap, imageUrl, location, regionAt, presets, defaultCategory, collectible }
