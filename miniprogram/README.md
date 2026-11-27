# 微信小程序精灵图鉴

在微信开发者工具中导入本仓库的 `miniprogram/` 目录，使用项目已有的小程序 AppID。点击「编译」即可打开图鉴，随后可扫码预览。公开发布时从开发者工具上传版本，在微信公众平台提交审核并发布。

`app/` 是开发者工具配置的打包目录。项目设置和生成脚本放在项目层。

## 接入线上图鉴

在微信公众平台「开发管理 → 开发设置 → 服务器域名」中，将 `https://wentao-home.cn` 同时加入 `request` 合法域名和 `downloadFile` 合法域名。前者检查图鉴版本，后者下载已有的 `handbook_data.json`。缩略图、立绘、蛋、果实、技能图标、壁纸和字标都从同一网站的 HTTPS 地址加载。

打开时先显示随版本提供的图鉴文字，并在后台检查网站版本。版本一致时复用本机的数据缓存。图鉴列表支持下拉更新。网络异常时仍可查看随包提供的文字资料，图片加载失败时显示占位内容。

主包和详情分包内仅有代码、文字资料和字体。生成脚本会核对每个包小于 1.5 MB。

## 更新图鉴资料

照常部署网页版的 `handbook_data.json`、`sprite_imgs/` 和 `skills/`，小程序会在下次检查时读取更新。需要刷新随版本提供的文字资料或字体时，在 A100 运行生成脚本。

```bash
cd /mnt/data1/lwt/ROCOM_hatch_eggs
python3 miniprogram/scripts/build_dex.py
```

脚本使用支持 WOFF2 的 FontTools。需要安装时使用 `python3 -m pip install 'fonttools[woff]'`。将生成的 `miniprogram/app/generated/` 和 `miniprogram/app/app.json` 一起提交。小程序界面源码或内置图鉴变动后，在开发者工具中上传新版本。

图鉴详情提供原 WIKI 页面的链接。壁纸、字标、字体和精灵图片沿用当前网页版素材。
