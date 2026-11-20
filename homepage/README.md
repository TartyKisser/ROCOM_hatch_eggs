# 首页构建

仓库根目录的 `index.html` 是首页入口。`homepage/` 存放 React 源码、字体和图片素材，`home-ui/assets/` 存放构建生成的静态文件和依赖许可。Nginx 直接提供这些文件，远行商人沿用 `merchant_proxy.php`。

## 在 A100 上构建

使用 Node.js 22.12 或更新版本，在 A100 上执行以下命令。

```bash
cd /mnt/data1/lwt/ROCOM_hatch_eggs/homepage
npm ci
npm run build
```

构建脚本先写入资源，再原子替换根目录的 `index.html`。通过 GitHub 发布时，把 `index.html` 和 `home-ui/` 放在同一次提交中。保存 `homepage/` 源码与锁文件即可在 A100 上重建。

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
