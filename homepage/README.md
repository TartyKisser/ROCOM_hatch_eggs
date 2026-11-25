# 网站前端构建

仓库根目录的 `index.html` 和 `handbook.html` 分别是首页和精灵图鉴入口。`homepage/` 存放 React 源码、字体和图片素材，`home-ui/assets/` 存放构建生成的静态文件和依赖许可。Nginx 直接提供这些文件，远行商人沿用 `merchant_proxy.php`。

## 在 A100 上构建

使用 Node.js 22.12 或更新版本，在 A100 上执行以下命令。

```bash
cd /mnt/data1/lwt/ROCOM_hatch_eggs/homepage
npm ci
npm run build
```

构建脚本先写入资源，再原子替换根目录的 `index.html`。构建精灵图鉴时，在同一目录执行 `npm run build:handbook`，产物入口为 `handbook.html`，数据来自站点根目录的 `handbook_data.json`。

技能图鉴、孵蛋预测、精灵配对、小窝排布、家园查询、异色推荐及世界地图的源文件也在本目录。执行 `npm run build:tools` 会为这七个页面生成带 RocoKingdom UI 控件的 HTML 和共用样式，发布到各自原来的路径。

通过 GitHub 发布时，把本次构建对应的 HTML 入口和 `home-ui/` 放在同一次提交中。保存 `homepage/` 源码与锁文件即可在 A100 上重建。

### 更新世界地图

在 A100 的仓库根目录使用 Python 3 和带 `libwebp` 编码器的 FFmpeg 更新资料。使用 `fonttools[woff]` 生成地图字体子集，再单独构建地图页面。

```bash
python3 homepage/sync-map.py
python3 homepage/prepare-fonts.py map
npm --prefix homepage run build:map
```

同步脚本核对 Wiki 发布的点位、类别计数和详情，再把标准底图合成为 WebP。数据文件和图片采用内容哈希命名，最后切换 `map_data/manifest.json`。一次发布应包含 `map.html`、`map_data/` 和新增的 `home-ui/assets/` 文件。阿里云由 Nginx 直接提供这些文件。访客打开某张地图时只读取这张地图和缩略底图，放大后按视野取分片，详情点开后加载。

点位与分类资料由洛克王国世界 WIKI 及贡献者整理，本站进行了格式转换与分片，派生数据采用 CC BY-SA 4.0。游戏图片权属见 Wiki 站点声明。收集记录保存在访客的浏览器内。[Wiki 地图](https://wiki.biligame.com/nrc/地图) · [Wiki 站点声明](https://wiki.biligame.com/nrc/Project:站点声明) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans)

### 预览

在 A100 的项目根目录运行静态预览。

```bash
cd /mnt/data1/lwt/ROCOM_hatch_eggs
python3 -m http.server 8080 --bind 127.0.0.1
```

在自己的电脑打开另一终端，转发 A100 的 8080 端口。

```bash
ssh -N -L 8080:127.0.0.1:8080 lwt@8a100.yangtan.top
```

随后访问 `http://127.0.0.1:8080/`。远行商人实时数据可在运行 PHP 的站点上查看。

## 图片与字体

首屏和导航都展示了 `roco-kingdom-logo.png` 的中文部分。商人卡片采用组件库示例中的地图底图，底图已缩小并转换为 WebP。[组件库标题素材](https://github.com/rookie-orange/rocokingdom-ui/blob/2c8a1f6b65b423be7799f3a9ce6b1182064622fe/apps/website/src/assets/roco-kingdom-logo.png) · [组件库地图素材](https://github.com/rookie-orange/rocokingdom-ui/blob/2c8a1f6b65b423be7799f3a9ce6b1182064622fe/apps/website/src/assets/roco-map-bg.png)

网页背景使用与上传壁纸同一画面的官网版本，按屏幕宽度加载对应的图片。[桌面壁纸](https://game.gtimg.cn/images/rocom/act/a20260706preview/web/part1/20261026/bg.webp) · [手机壁纸](https://game.gtimg.cn/images/rocom/act/a20260706preview/m/part1/20261026/bg.webp)

网页文字使用文档里的 `Roco Kingdom Sans`。字体由项目依赖的原始素材转为 WOFF2，首屏优先加载含首页文字和常见商品名的子集，其他受支持的字按需使用同款完整字体。[组件库文档](https://rocokingdom-ui.vercel.app/docs)

更新了首页文案或组件库里的字体后，可以用安装了 `fonttools[woff]` 的 Python 在 `homepage/` 下重生成字体，再重新构建。字体文件随源码保存。

```bash
python3 prepare-fonts.py
npm run build
```

图鉴的字体子集包含界面文案和精灵名称。需要刷新子集时，执行 `python3 prepare-fonts.py handbook` 再构建图鉴。

七个工具页面共用一个字体子集。界面文案或技能数据更新后，可执行 `python3 prepare-fonts.py tools` 刷新子集。
