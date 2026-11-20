export const merchantShopConfig = {
  sourceUrl: './merchant_proxy.php',
  remoteSourceUrl: 'https://www.onebiji.com/hykb_tools/comm/lkwgmerchant/preview.php?id=1&immgj=0',
  itemImageDir: './web_images/shop/',
  itemImageExtension: 'png',
  itemImageMap: {},
  corsProxyUrls: [
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ],
}

export const merchantPeriodLabels = {
  1: '08:00-12:00',
  2: '12:00-16:00',
  3: '16:00-20:00',
  4: '20:00-24:00',
}

export function currentMerchantPeriod(date = new Date()) {
  const hour = date.getHours()
  if (hour < 8) return 0
  return Math.floor((hour - 8) / 4) + 1
}

export function localMerchantImagePath(item) {
  return item.localImage || merchantShopConfig.itemImageMap[item.name] ||
    `${merchantShopConfig.itemImageDir}${encodeURIComponent(item.name)}.${merchantShopConfig.itemImageExtension}`
}

function parseMerchantOnclick(onclick) {
  const args = Array.from(String(onclick || '').matchAll(/'((?:\\'|[^'])*)'/g), match => match[1].replace(/\\'/g, "'"))
  return { type: args[2] || '', description: args[3] || '' }
}

export function parseMerchantHtml(html) {
  const template = document.createElement('template')
  template.innerHTML = html
  const doc = template.content
  const periodMatch = html.match(/var\s+index\s*=\s*(\d+)/)
  if (!periodMatch && !doc.querySelector('.shop-list')) throw new Error('商人数据格式有误')

  const period = periodMatch ? Number(periodMatch[1]) : currentMerchantPeriod()
  const items = Array.from(doc.querySelectorAll('.shop-list li'), item => ({
    name: item.querySelector('.shop_name')?.textContent.trim() || '',
    price: (item.querySelector('.shop_price')?.textContent || '').replace(/^\s*价格[:：]\s*/, '').replace(/\s+/g, ''),
    limit: item.querySelector('.gitem em')?.textContent.trim() || '',
    ...parseMerchantOnclick(item.getAttribute('onclick')),
    period: period && item.classList.contains(`show_${period}`),
    visible: !/display\s*:\s*none/i.test(item.getAttribute('style') || ''),
  })).filter(item => item.name)

  const periodItems = items.filter(item => item.period)
  return { items: periodItems.length ? periodItems : items.filter(item => item.visible), period }
}

export async function fetchMerchantShop(signal) {
  const urls = [
    merchantShopConfig.sourceUrl,
    ...merchantShopConfig.corsProxyUrls.map(build => build(merchantShopConfig.remoteSourceUrl)),
  ]
  const supportsTimeout = typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function'
  let error
  for (const url of urls) {
    if (signal.aborted) throw signal.reason
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: supportsTimeout ? AbortSignal.any([signal, AbortSignal.timeout(9000)]) : signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return parseMerchantHtml(await response.text())
    } catch (failure) {
      error = failure
    }
  }
  throw error
}
