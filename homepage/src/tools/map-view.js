const GRID_SIZE = 128
const MARKER_SIZE = 34
const SELECTED_MARKER_SIZE = 42
const MAP_IMAGE_LIMIT = 32
const DETAIL_IMAGE_THRESHOLD = 1536
const ZOOM_STEP = 1.5
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function project(map, x, y) {
  const [left, top, right, bottom] = map.bounds
  return [(x - left) / (right - left) * map.size, (y - top) / (bottom - top) * map.size]
}

function indexMarkers(points, size) {
  const columns = Math.ceil(size / GRID_SIZE)
  const cells = new Map()
  const cellAt = coordinate => clamp(Math.floor(coordinate / GRID_SIZE), 0, columns - 1)
  for (const point of points) {
    const key = cellAt(point.mx) + cellAt(point.my) * columns
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(point)
  }
  return (left, top, right, bottom, visit) => {
    for (let row = cellAt(top); row <= cellAt(bottom); row++) {
      for (let col = cellAt(left); col <= cellAt(right); col++) {
        const cell = cells.get(col + row * columns)
        if (cell) cell.forEach(visit)
      }
    }
  }
}

function pointerCenter(pointers) {
  const [first, second] = pointers.values()
  if (!second) return { ...first, distance: 0 }
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.hypot(first.x - second.x, first.y - second.y),
  }
}

export class MapView {
  constructor(canvas, { onDraw, onPick, onHover }) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.labelFont = `15px ${getComputedStyle(canvas).fontFamily}`
    this.onDraw = onDraw
    this.onPick = onPick
    this.onHover = onHover
    this.mapImages = new Map()
    this.icons = new Map()
    this.pointers = new Map()
    this.hits = []
    this.width = this.height = 1
    this.frame = 0
    this.scale = this.fitScale = 1
    this.floor = 'surface'
    this.acceptPoint = () => true
    this.selected = null
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.bindPointers()
    document.fonts.ready.then(() => this.schedule())
  }

  setMap(map) {
    this.map = map
    this.mapImages.clear()
    this.visitPoints = indexMarkers(map.points, map.size)
    this.layers = map.patches.map(patch => {
      const [x, y] = project(map, patch.bounds[0], patch.bounds[1])
      const [right, bottom] = project(map, patch.bounds[2], patch.bounds[3])
      return { ...patch, x, y, width: right - x, height: bottom - y }
    })
    this.reset()
    this.resize()
  }

  setFilters(floor, acceptPoint, selected) {
    this.floor = floor
    this.acceptPoint = acceptPoint
    this.selected = selected
    this.schedule()
  }

  resize() {
    const zoom = this.scale / this.fitScale
    this.width = Math.max(1, this.canvas.clientWidth)
    this.height = Math.max(1, this.canvas.clientHeight)
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    if (this.map) {
      this.fitScale = Math.min(this.width, this.height) / this.map.size * 0.98
      this.scale = this.fitScale * zoom
      this.constrain()
    }
    this.schedule()
  }

  constrain() {
    const size = this.map.size
    const halfWidth = Math.min(size / 2, this.width / (2 * this.scale))
    const halfHeight = Math.min(size / 2, this.height / (2 * this.scale))
    this.x = clamp(this.x, halfWidth, size - halfWidth)
    this.y = clamp(this.y, halfHeight, size - halfHeight)
  }

  reset() {
    if (!this.map) return
    this.scale = this.fitScale
    this.x = this.y = this.map.size / 2
    this.schedule()
  }

  centerOn(x, y, zoom = 4) {
    if (!this.map) return
    this.scale = Math.max(this.scale, this.fitScale * zoom)
    this.x = x
    this.y = y
    this.constrain()
    this.schedule()
  }

  move(dx, dy) {
    if (!this.map) return
    this.x -= dx / this.scale
    this.y -= dy / this.scale
    this.constrain()
    this.schedule()
  }

  zoom(factor, x = this.width / 2, y = this.height / 2) {
    if (!this.map) return
    const offsetX = x - this.width / 2
    const offsetY = y - this.height / 2
    const previous = this.scale
    this.scale = clamp(previous * factor, this.fitScale * 0.75, this.fitScale * 20)
    this.x += offsetX * (1 / previous - 1 / this.scale)
    this.y += offsetY * (1 / previous - 1 / this.scale)
    this.constrain()
    this.schedule()
  }

  zoomIn() { this.zoom(ZOOM_STEP) }
  zoomOut() { this.zoom(1 / ZOOM_STEP) }

  schedule() {
    if (this.frame || !this.map) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.draw()
    })
  }

  image(url, cache, limit) {
    if (!url) return
    let entry = cache.get(url)
    if (entry) {
      if (limit) {
        cache.delete(url)
        cache.set(url, entry)
      }
      return entry
    }
    const image = new Image()
    entry = { image, ready: false, failed: false }
    image.decoding = 'async'
    image.referrerPolicy = 'no-referrer'
    image.onload = () => {
      entry.ready = true
      this.schedule()
    }
    image.onerror = () => {
      entry.failed = true
      this.schedule()
    }
    image.src = url
    cache.set(url, entry)
    if (limit && cache.size > limit) cache.delete(cache.keys().next().value)
    return entry
  }

  draw() {
    const { ctx, width, height, dpr, scale, map } = this
    const offsetX = width / 2 - this.x * scale
    const offsetY = height / 2 - this.y * scale
    const position = {
      left: -offsetX / scale, top: -offsetY / scale,
      right: (width - offsetX) / scale, bottom: (height - offsetY) / scale,
      x: offsetX, y: offsetY,
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#e5ded0'
    ctx.fillRect(0, 0, width, height)
    this.drawTerrain(position)
    const count = this.drawMarkers(position)
    this.onDraw({
      count, zoom: Math.round(scale / this.fitScale * 100),
      zoomIn: scale < this.fitScale * 20, zoomOut: scale > this.fitScale * 0.75,
      terrainFailed: this.terrainFailed, map,
    })
  }

  drawTerrain(view) {
    const { map, scale, dpr, ctx } = this
    const basemap = (this.floor === 'surface' ? map.surface : map.underground) || map.surface
    const base = this.image(basemap.overview, this.mapImages, MAP_IMAGE_LIMIT)
    const size = map.size * scale
    this.terrainFailed = base.failed
    if (base.ready) ctx.drawImage(base.image, view.x, view.y, size, size)
    if (size > DETAIL_IMAGE_THRESHOLD || base.failed) {
      const tile = map.tileSize
      const startColumn = clamp(Math.floor(view.left / tile), 0, map.columns - 1)
      const startRow = clamp(Math.floor(view.top / tile), 0, map.rows - 1)
      const endColumn = clamp(Math.floor(view.right / tile), 0, map.columns - 1)
      const endRow = clamp(Math.floor(view.bottom / tile), 0, map.rows - 1)
      const align = coordinate => Math.round(coordinate * dpr) / dpr
      let hasTile = false
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startColumn; col <= endColumn; col++) {
          const entry = this.image(basemap.tiles[col + row * map.columns], this.mapImages, MAP_IMAGE_LIMIT)
          if (!entry.ready) continue
          const x = align(view.x + col * tile * scale)
          const y = align(view.y + row * tile * scale)
          const right = align(view.x + (col + 1) * tile * scale)
          const bottom = align(view.y + (row + 1) * tile * scale)
          ctx.drawImage(entry.image, x, y, right - x, bottom - y)
          hasTile = true
        }
      }
      if (hasTile) this.terrainFailed = false
    }
    for (const patch of this.layers) {
      if (!patch.floors.includes(this.floor) || patch.x > view.right || patch.y > view.bottom ||
          patch.x + patch.width < view.left || patch.y + patch.height < view.top) continue
      const entry = this.image(patch.image, this.mapImages, MAP_IMAGE_LIMIT)
      if (entry.ready) ctx.drawImage(entry.image, view.x + patch.x * scale, view.y + patch.y * scale,
        patch.width * scale, patch.height * scale)
    }
  }

  drawMarkers(view) {
    const { scale, width, height } = this
    this.hits.length = 0
    let selected
    this.visitPoints(view.left, view.top, view.right, view.bottom, point => {
      const x = view.x + point.mx * scale
      const y = view.y + point.my * scale
      if (x < 0 || y < 0 || x > width || y > height || !this.acceptPoint(point)) return
      if (point === this.selected) {
        selected = { point, x, y }
      } else {
        this.drawMarker(point, x, y, MARKER_SIZE)
      }
    })
    if (selected) this.drawMarker(selected.point, selected.x, selected.y, SELECTED_MARKER_SIZE)
    return this.hits.length
  }

  drawMarker(point, x, y, size) {
    const { ctx } = this
    const radius = size / 2
    let icon = this.image(point.icon, this.icons)
    if ((!icon || icon.failed) && point.category.icon !== point.icon) {
      icon = this.image(point.category.icon, this.icons)
    }
    if (icon?.ready) {
      const { naturalWidth, naturalHeight } = icon.image
      const scale = size / Math.max(naturalWidth, naturalHeight)
      const width = naturalWidth * scale
      const height = naturalHeight * scale
      ctx.drawImage(icon.image, x - width / 2, y - height / 2, width, height)
    } else if (!icon || icon.failed) {
      const label = point.category.genre.slice(0, 1)
      ctx.font = this.labelFont
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3
      ctx.strokeStyle = '#fff8e9'
      ctx.strokeText(label, x, y)
      ctx.fillStyle = '#493b2a'
      ctx.fillText(label, x, y)
    }
    if (point.collected) {
      ctx.fillStyle = '#416347'
      ctx.beginPath()
      ctx.arc(x + radius - 3, y + radius - 3, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
    this.hits.push({ x, y, radius: radius + 3, point })
  }

  bindPointers() {
    const canvas = this.canvas
    const position = event => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    canvas.addEventListener('pointerdown', event => {
      if (!this.map || event.button !== 0 || this.pointers.size >= 2) return
      if (!this.pointers.size) {
        this.dragStart = position(event)
        this.dragging = false
      }
      this.pointers.set(event.pointerId, position(event))
      if (this.pointers.size === 2) this.dragging = true
      canvas.setPointerCapture(event.pointerId)
    })
    canvas.addEventListener('pointermove', event => {
      const current = position(event)
      if (!this.pointers.has(event.pointerId)) {
        if (this.map && event.pointerType === 'mouse' && event.timeStamp - (this.lastHover || 0) >= 125) {
          this.lastHover = event.timeStamp
          this.onHover(this.x + (current.x - this.width / 2) / this.scale,
            this.y + (current.y - this.height / 2) / this.scale)
        }
        return
      }
      const before = pointerCenter(this.pointers)
      this.pointers.set(event.pointerId, current)
      const after = pointerCenter(this.pointers)
      if (!this.dragging && !after.distance &&
          Math.hypot(after.x - this.dragStart.x, after.y - this.dragStart.y) < 4) return
      this.dragging = true
      canvas.classList.add('is-dragging')
      this.move(after.x - before.x, after.y - before.y)
      if (before.distance > 0 && after.distance > 0) this.zoom(after.distance / before.distance, after.x, after.y)
    })
    const release = event => {
      if (!this.pointers.delete(event.pointerId) || this.pointers.size) return
      canvas.classList.remove('is-dragging')
      if (!this.dragging && event.type === 'pointerup') {
        const { x, y } = position(event)
        const hits = this.hits.filter(hit => Math.hypot(hit.x - x, hit.y - y) <= hit.radius)
        this.onPick(hits.reverse().map(hit => hit.point))
      }
    }
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
    canvas.addEventListener('lostpointercapture', release)
    canvas.addEventListener('wheel', event => {
      event.preventDefault()
      const { x, y } = position(event)
      const delta = event.deltaY * (event.deltaMode ? 16 : 1)
      this.zoom(Math.exp(-clamp(delta, -200, 200) / 430), x, y)
    }, { passive: false })
  }
}
