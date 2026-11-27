const grid = 128
const markerSize = 29
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

function markerIndex(points, size) {
  const columns = Math.ceil(size / grid)
  const index = new Map()
  const row = value => clamp(Math.floor(value / grid), 0, columns - 1)
  for (const point of points) {
    const key = row(point.mx) + row(point.my) * columns
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(point)
  }
  return (left, top, right, bottom, visit) => {
    for (let y = row(top); y <= row(bottom); y++) {
      for (let x = row(left); x <= row(right); x++) index.get(x + y * columns)?.forEach(visit)
    }
  }
}

class ImageCache {
  constructor(node, paint) {
    this.node = node
    this.paint = paint
    this.entries = new Map()
    this.jobs = []
    this.active = 0
    this.requests = new Set()
    this.tick = 0
  }

  get(url, terrain = false) {
    if (!url || this.closed) return null
    let entry = this.entries.get(url)
    if (!entry) {
      entry = { url, terrain }
      this.entries.set(url, entry)
      if (terrain) this.jobs.unshift(entry)
      else this.jobs.push(entry)
      this.start()
    }
    entry.lastUse = ++this.tick
    return entry
  }

  evict(terrain) {
    const limit = terrain ? 18 : 256
    const loaded = [...this.entries.values()].filter(entry => entry.terrain === terrain && entry.image)
    if (loaded.length > limit) {
      loaded.sort((a, b) => a.lastUse - b.lastUse)
      loaded.slice(0, loaded.length - limit).forEach(entry => this.entries.delete(entry.url))
    }
  }

  start() {
    while (!this.closed && this.active < 5 && this.jobs.length) {
      const entry = this.jobs.shift()
      this.active++
      let task
      let completed = false
      const finish = (image, failed) => {
        if (completed) return
        completed = true
        if (task) this.requests.delete(task)
        entry.image = image
        entry.failed = failed
        this.active--
        if (!this.closed) {
          this.evict(entry.terrain)
          this.paint()
          this.start()
        }
      }
      task = wx.downloadFile({ url: entry.url, timeout: 10000,
        success: ({ statusCode, tempFilePath }) => {
          if (statusCode !== 200 || !tempFilePath || this.closed) { finish(null, true); return }
          const img = this.node.createImage()
          img.onload = () => finish(img, false)
          img.onerror = () => finish(null, true)
          img.src = tempFilePath
        },
        fail: () => finish(null, true),
      })
      if (task) this.requests.add(task)
    }
  }

  close() {
    this.closed = true
    this.jobs.length = 0
    this.requests.forEach(task => task.abort?.())
    this.entries.clear()
  }
}

class WorldCanvas {
  constructor(node, width, height, pixelRatio, report) {
    this.report = report
    this.resize(node, width, height, pixelRatio)
  }

  resize(node, width, height, pixelRatio) {
    const ratio = Math.min(2, pixelRatio || 1)
    this.width = width
    this.height = height
    this.node = node
    node.width = Math.round(width * ratio)
    node.height = Math.round(height * ratio)
    this.ctx = node.getContext('2d')
    this.ctx.scale(ratio, ratio)
    if (this.map) this.reset()
  }

  setMap(map) {
    this.assets?.close()
    this.assets = new ImageCache(this.node, () => this.schedule())
    this.map = map
    this.points = null
    this.index = markerIndex([], map.size)
    this.reset()
  }

  filter(floor, points, selection) {
    this.floor = floor
    this.selection = selection && points.includes(selection) ? selection : null
    if (points !== this.points) {
      this.points = points
      this.index = markerIndex(points, this.map.size)
    }
    this.schedule()
  }

  reset() {
    if (!this.map) return
    this.fitScale = Math.min(this.width, this.height) / this.map.size
    this.scale = this.fitScale
    this.center(this.map.size / 2, this.map.size / 2, 1)
  }

  center(mx, my, zoom = Math.max(5, this.scale / this.fitScale)) {
    this.scale = this.fitScale * clamp(zoom, 1, 20)
    this.x = this.width / 2 - mx * this.scale
    this.y = this.height / 2 - my * this.scale
    this.adjust()
  }

  move(dx, dy) { this.x += dx; this.y += dy; this.adjust() }

  zoom(factor, x = this.width / 2, y = this.height / 2) {
    if (!this.map) return
    const next = clamp(this.scale * factor, this.fitScale, this.fitScale * 20)
    this.x = x - (x - this.x) * next / this.scale
    this.y = y - (y - this.y) * next / this.scale
    this.scale = next
    this.adjust()
  }

  adjust() {
    const size = this.map.size * this.scale
    this.x = size > this.width ? clamp(this.x, this.width - size, 0) : (this.width - size) / 2
    this.y = size > this.height ? clamp(this.y, this.height - size, 0) : (this.height - size) / 2
    this.schedule()
  }

  schedule() {
    if (this.pending || this.closed) return
    this.pending = true
    const callback = () => {
      this.pending = false
      if (!this.closed && this.map) this.draw()
    }
    if (this.node.requestAnimationFrame) this.node.requestAnimationFrame(callback)
    else setTimeout(callback, 16)
  }

  paintImage(url, x, y, width, height, terrain = false) {
    const entry = this.assets.get(url, terrain)
    if (!entry?.image) return false
    this.ctx.drawImage(entry.image, x, y, width, height)
    return true
  }

  draw() {
    const { map, ctx, width, height, x, y, scale, floor } = this
    const left = -x / scale
    const top = -y / scale
    const right = (width - x) / scale
    const bottom = (height - y) / scale
    ctx.fillStyle = '#d7c8ae'
    ctx.fillRect(0, 0, width, height)
    const layer = floor !== 'surface' && map.underground ? map.underground : map.surface
    const size = map.size * scale
    const overview = this.paintImage(layer.overview, x, y, size, size, true)
    if (size >= 1250 && layer.tiles.length) {
      const { tileSize: tile, columns, rows } = map
      for (let row = clamp(Math.floor(top / tile), 0, rows - 1); row <= clamp(Math.floor(bottom / tile), 0, rows - 1); row++) {
        for (let col = clamp(Math.floor(left / tile), 0, columns - 1); col <= clamp(Math.floor(right / tile), 0, columns - 1); col++) {
          this.paintImage(layer.tiles[row * columns + col], x + col * tile * scale, y + row * tile * scale, tile * scale, tile * scale, true)
        }
      }
    }
    for (const patch of map.patches) {
      if (patch.floors.includes(floor) && patch.x <= right && patch.y <= bottom && patch.x + patch.width >= left && patch.y + patch.height >= top) {
        this.paintImage(patch.image, x + patch.x * scale, y + patch.y * scale, patch.width * scale, patch.height * scale, true)
      }
    }
    let count = 0
    const margin = markerSize / scale
    this.index(left - margin, top - margin, right + margin, bottom + margin, point => {
      const px = x + point.mx * scale
      const py = y + point.my * scale
      if (px < -markerSize || py < -markerSize || px > width + markerSize || py > height + markerSize) return
      count++
      if (point !== this.selection) this.drawMarker(point, px, py, markerSize)
    })
    if (this.selection) this.drawMarker(this.selection, x + this.selection.mx * scale, y + this.selection.my * scale, 37, true)
    this.report({ count, zoom: Math.round(scale / this.fitScale * 100), mx: (width / 2 - x) / scale, my: (height / 2 - y) / scale,
      terrainFailed: !overview && Boolean(this.assets.get(layer.overview, true)?.failed) })
  }

  drawMarker(point, x, y, size, selected = false) {
    const asset = this.assets.get(point.icon)
    if (asset?.image) {
      const icon = asset.image
      const ratio = Math.min(size / icon.width, size / icon.height)
      const width = icon.width * ratio
      const height = icon.height * ratio
      this.ctx.drawImage(icon, x - width / 2, y - height / 2, width, height)
    } else if (!point.icon || asset?.failed) {
      this.ctx.fillStyle = '#624a2b'
      this.ctx.fillRect(x - 3, y - 3, 6, 6)
    }
    if (selected) {
      this.ctx.strokeStyle = '#d89b3b'
      this.ctx.lineWidth = 2
      this.ctx.strokeRect(x - size / 2, y - size / 2, size, size)
    }
  }

  pick(x, y) {
    const mx = (x - this.x) / this.scale
    const my = (y - this.y) / this.scale
    const radius = 17 / this.scale
    const hits = []
    this.index(mx - radius, my - radius, mx + radius, my + radius, point => {
      const distance = Math.hypot(mx - point.mx, my - point.my)
      if (distance <= radius) hits.push({ point, distance })
    })
    return hits.sort((a, b) => a.distance - b.distance).map(hit => hit.point)
  }

  close() { this.closed = true; this.assets?.close() }
}

module.exports = { WorldCanvas }
