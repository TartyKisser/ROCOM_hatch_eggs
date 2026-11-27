const origin = 'https://wentao-home.cn'

function siteImage(file, version) {
  if (typeof file !== 'string') return ''
  const parts = file.replace(/^\.\//, '').replace(/^\//, '').split('/')
  const hosted = ['sprite_imgs', 'skills', 'web_images', 'map_data'].includes(parts[0])
    || (parts[0] === 'homepage' && parts[1] === 'assets')
  if (!hosted || parts.length < 2 || parts.some(part => !part || part === '.' || part === '..')) return ''
  const url = `${origin}/${parts.map(encodeURIComponent).join('/')}`
  return version ? `${url}?v=${encodeURIComponent(version)}` : url
}

const uiImages = {
  wallpaper: siteImage('homepage/assets/season-wallpaper-mobile.webp'),
  logo: siteImage('homepage/assets/roco-kingdom-logo.png'),
  rare: siteImage('web_images/rare.png'),
  noRare: siteImage('web_images/no-rare.png'),
  starlight: siteImage('web_images/values/base-starlight-value.png'),
  rockCoin: siteImage('web_images/values/base-review-rock-coin.png'),
}

module.exports = { origin, handbookUrl: `${origin}/handbook_data.json`, siteImage, uiImages }
