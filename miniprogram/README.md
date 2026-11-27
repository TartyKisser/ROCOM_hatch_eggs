# 微信小程序精灵图鉴

在微信开发者工具中导入本仓库的 `miniprogram/` 目录，使用项目已有的小程序 AppID。点击「编译」即可打开图鉴，随后可扫码预览。公开发布时从开发者工具上传版本，在微信公众平台提交审核并发布。

## 接入线上图鉴

在微信公众平台「开发管理 → 开发设置 → 服务器域名」中，将 `https://wentao-home.cn` 同时加入 `request` 合法域名和 `downloadFile` 合法域名。前者检查图鉴版本，后者下载已有的 `handbook_data.json`。缩略图、立绘、蛋、果实和技能图片读取同一网站的 HTTPS 地址。

打开时先显示随版本提供的图鉴，并在后台检查网站版本。版本一致时复用本机缓存。图鉴列表支持下拉更新。网络异常时继续显示当前资料，首次打开时可用内置的图鉴详情和图片分包。

## 更新图鉴资料

照常部署网页版的 `handbook_data.json`、`sprite_imgs/` 和 `skills/`，小程序会在下次检查时读取更新。需要刷新随版本提供的备用图鉴或界面素材时，在 A100 运行生成脚本。

```bash
cd /mnt/data1/lwt/ROCOM_hatch_eggs
python3 miniprogram/scripts/build_dex.py
```

脚本使用 Pillow 和支持 WOFF2 的 FontTools。需要安装时使用 `python3 -m pip install Pillow 'fonttools[woff]'`。将生成的 `miniprogram/generated/` 和 `miniprogram/app.json` 一起提交。小程序界面源码或内置图鉴变动后，在开发者工具中上传新版本。

图鉴详情提供原 WIKI 页面的链接。壁纸、字标、字体和精灵图片沿用当前网页版素材。
