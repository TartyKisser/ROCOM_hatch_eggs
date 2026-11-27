# 洛克王国世界工具站小程序

在微信开发者工具中导入本仓库的 `miniprogram/` 目录，使用项目已有的小程序 AppID。点击「编译」进入工具站首页，随后可扫码预览。公开发布时从开发者工具上传版本，在微信公众平台提交审核并发布。

`app/` 是开发者工具配置的打包目录。项目设置和生成脚本放在项目层。

## 接入线上工具站

在微信公众平台「开发管理 → 开发设置 → 服务器域名」中，将 `https://wentao-home.cn` 同时加入 `request` 合法域名和 `downloadFile` 合法域名。图鉴同步共用 `handbook_data.json` 与本机缓存。远行商人和家园查询沿用 `merchant_proxy.php` 与 `home_proxy.php`。异色抓取推荐读取网页的果实清单、`rare.csv` 和 `adventure_rules.txt`。地图读取 `map_data/` 下的场景、图标索引、底图分片和点位详情。

打开时先显示随版本提供的图鉴文字，并在后台检查网站版本。版本一致时复用本机的数据缓存。图鉴列表支持下拉更新。网络异常时仍可查看随包提供的文字资料，图片加载失败时显示占位内容。

主包包含首页与图鉴入口，其他七个工具共用一个工具分包，首次打开其中一个工具时加载。图片随网页部署，打包目录里保留代码、文字和字体。生成脚本会检查各包的源文件大小。编译后可在开发者工具里运行「代码质量检查」。

首页沿用网站的远行商人背景，工具导航图标由网站上的同一组图标导出。发布时将 `homepage/assets/roco-map-bg.webp` 和 `homepage/assets/tool-mark-*.png` 同步到阿里云。地图收集进度和家园查询的最近 UID 保存在当前设备。

## 更新图鉴资料

照常部署网页版的 `handbook_data.json`、`sprite_imgs/` 和 `skills/`，小程序会在下次检查时读取更新。需要刷新随版本提供的文字资料或字体时，在 A100 运行生成脚本。

```bash
cd /mnt/data1/lwt/ROCOM_hatch_eggs
python3 miniprogram/scripts/build_dex.py
```

脚本使用支持 WOFF2 的 FontTools。需要安装时使用 `python3 -m pip install 'fonttools[woff]'`。将生成的 `miniprogram/app/generated/` 和 `miniprogram/app/app.json` 一起提交。小程序界面源码或内置图鉴变动后，在开发者工具中上传新版本。

壁纸、字标、字体和精灵图片沿用当前网页版素材。

## 更新地图素材

部署新地图时，地图镜像脚本会为 `map_data/manifest.json` 当前引用的图标生成可从工具站直接读取的缩略图。脚本使用 Pillow，遇到 SVG 时使用 CairoSVG。

```bash
python3 -m pip install Pillow CairoSVG
python3 miniprogram/scripts/mirror_map_icons.py
```

发布时一并同步 `map_data/mini-icons.json` 和 `map_data/mini-icons/` 到阿里云。小程序通过它们在画布上绘制点位，地图图片通过 HTTPS 加载。
