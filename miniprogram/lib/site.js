const origin = 'https://wentao-home.cn'

function siteImage(file, version) {
  if (typeof file !== 'string') return ''
  const parts = file.replace(/^\.\//, '').replace(/^\//, '').split('/')
  if (!['sprite_imgs', 'skills', 'web_images'].includes(parts[0]) || parts.some(part => !part || part === '.' || part === '..')) return ''
  const url = `${origin}/${parts.map(encodeURIComponent).join('/')}`
  return version ? `${url}?v=${encodeURIComponent(version)}` : url
}

module.exports = { handbookUrl: `${origin}/handbook_data.json`, siteImage }
