#!/usr/bin/env python3
"""Build the bundled WeChat handbook from the website's data and artwork."""

from base64 import b64encode
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
import shutil
from tempfile import TemporaryDirectory

from fontTools import subset
from PIL import Image, ImageOps


APP = Path(__file__).resolve().parents[1]
SITE = APP.parent
PACKAGE_LIMIT = 1_500_000
DETAIL_TARGET = 1_470_000
TOTAL_LIMIT = 20_000_000
TYPES = '普通 草 火 水 光 地 冰 龙 电 毒 虫 武 翼 萌 幽 恶 机械 幻'.split()
DETAIL_FIELDS = (
    'stats', 'height', 'weight', 'eggSize', 'distribution', 'description', 'abilities',
    'url', 'baseStarlightValue', 'baseReviewRockCoin', 'evolution', 'research', 'genderRatio',
)
SKILL_FIELDS = ('name', 'cost', 'category', 'type', 'power', 'description')


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def write_module(file, data):
    file.write_bytes(b'module.exports = ' + json_bytes(data) + b'\n')


class Artwork:
    def __init__(self):
        self.by_source = {}
        self.files = {}

    def png(self, relative, dimensions, colors):
        if not relative:
            return ''
        source = SITE / relative
        cache_key = (source, dimensions, colors)
        if cache_key not in self.by_source:
            if not source.is_file():
                self.by_source[cache_key] = ''
                return ''
            with Image.open(source) as original:
                image = original.convert('RGBA')
            image.thumbnail((dimensions, dimensions), Image.Resampling.LANCZOS)
            image = image.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
            output = BytesIO()
            image.save(output, 'PNG', optimize=True)
            content = output.getvalue()
            filename = sha256(content).hexdigest()[:16] + '.png'
            if self.files.setdefault(filename, content) != content:
                raise ValueError(f'图片文件名冲突 {filename}')
            self.by_source[cache_key] = filename
        return self.by_source[cache_key]

    def write(self, directory, names):
        directory.mkdir(parents=True, exist_ok=True)
        for name in sorted(names):
            (directory / name).write_bytes(self.files[name])


def export_records(records, artwork):
    cards = []
    details = []
    definitions = []
    definition_indexes = {}
    for record in records:
        thumb = record['portrait'].replace('/portrait/', '/portrait-small/')
        groups = [name for name in record.get('eggGroups', ()) if name]
        card = {
            'id': record['id'], 'number': record['number'], 'title': record['title'],
            'attributes': record['attributes'], 'eggGroups': groups, 'rare': bool(record['rare']),
            'search': record['searchText'], 'distribution': record['distribution'],
            'thumb': artwork.png(thumb, 48, 48),
        }
        detail = {field: record.get(field) for field in DETAIL_FIELDS}
        detail['images'] = {
            'portrait': artwork.png(record['portrait'], 232, 160),
            'shiny': artwork.png(record.get('rarePath'), 232, 160) if record['rare'] else '',
            'egg': artwork.png(record.get('icon-egg'), 88, 128),
            'fruit': artwork.png(record.get('icon-fruit'), 88, 128),
            'shinyEgg': artwork.png(record.get('icon-egg-rare'), 88, 128),
        }
        images = set(detail['images'].values()) - {''}
        detail['skills'] = []
        for skill in record.get('skills', ()):
            if not skill or not skill.get('name'):
                continue
            definition = {field: skill.get(field) for field in SKILL_FIELDS}
            icon = artwork.png(skill.get('icon'), 34, 88)
            definition['icon'] = icon
            key = tuple(definition.values())
            if key not in definition_indexes:
                definition_indexes[key] = len(definitions)
                definitions.append(definition)
            detail['skills'].append([definition_indexes[key], skill.get('level'), skill.get('source'), skill.get('unlock')])
            if icon:
                images.add(icon)
        cards.append(card)
        details.append((record['id'], detail, images))
    return cards, details, definitions


def split_details(details, artwork):
    packages = []
    packed = {}
    images = set()
    current_size = 0
    for record_id, record, required in details:
        data_size = len(json_bytes({record_id: record}))
        asset_size = sum(len(artwork.files[name]) for name in required - images)
        if packed and current_size + data_size + asset_size > DETAIL_TARGET:
            packages.append((packed, images))
            packed, images, current_size = {}, set(), 0
            asset_size = sum(len(artwork.files[name]) for name in required)
        packed[record_id] = record
        images.update(required)
        current_size += data_size + asset_size
    if packed:
        packages.append((packed, images))
    return packages


def write_detail_package(directory, name, records, images, artwork):
    directory.mkdir()
    write_module(directory / 'records.js', {'assetPath': f'/generated/{name}/art/', 'records': records})
    (directory / 'index.js').write_text(
        "const { createDetailPage } = require('../../lib/detail')\n"
        "Page(createDetailPage(require('./records')))\n", encoding='utf-8',
    )
    (directory / 'index.json').write_text('{"navigationBarTitleText":"精灵详情"}\n', encoding='utf-8')
    (directory / 'index.wxml').write_text('<include src="../../ui/detail.wxml" />\n', encoding='utf-8')
    (directory / 'index.wxss').write_text('@import "../../ui/detail.wxss";\n', encoding='utf-8')
    artwork.write(directory / 'art', images)


def write_design_assets(output, artwork, cards):
    assets = output / 'ui'
    assets.mkdir()
    with Image.open(SITE / 'homepage/assets/season-wallpaper-mobile.webp') as source:
        cover = ImageOps.fit(source.convert('RGB'), (704, 440), Image.Resampling.LANCZOS, centering=(0.5, 0.34))
        cover.save(assets / 'wallpaper.jpg', quality=85, optimize=True)
    ui_images = {
        'logo': ('homepage/assets/roco-kingdom-logo.png', 288),
        'rare': ('web_images/rare.png', 48),
        'no-rare': ('web_images/no-rare.png', 48),
        'starlight': ('web_images/values/base-starlight-value.png', 48),
        'rock-coin': ('web_images/values/base-review-rock-coin.png', 48),
    }
    for index, name in enumerate(TYPES):
        ui_images[f'type-{index}'] = (f'web_images/types/{name}.png', 40)
    for name, (source, size) in ui_images.items():
        filename = artwork.png(source, size, 160)
        if filename:
            (assets / f'{name}.png').write_bytes(artwork.files[filename])

    labels = ''.join(file.read_text(encoding='utf-8') for file in (APP / 'pages').rglob('*.wxml'))
    labels += (APP / 'ui/detail.wxml').read_text(encoding='utf-8')
    text = labels + ''.join(card['title'] for card in cards) + ''.join(TYPES)
    glyphs = ''.join(sorted(set(re.findall(r'[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]', text))))
    options = subset.Options()
    options.flavor = 'woff2'
    font = subset.load_font(SITE / 'homepage/fonts/roco-kingdom-sans-handbook.woff2', options)
    font.recalcTimestamp = False
    sub = subset.Subsetter(options=options)
    sub.populate(text=glyphs + '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .-/')
    sub.subset(font)
    output_font = BytesIO()
    subset.save_font(font, output_font, options)
    data = b64encode(output_font.getvalue()).decode('ascii')
    (output / 'font.wxss').write_text(
        '@font-face { font-family: "Roco Kingdom Sans"; '
        f'src: url("data:font/woff2;base64,{data}") format("woff2"); font-display: swap; }}\n', encoding='utf-8',
    )


def file_size(path):
    return sum(file.stat().st_size for file in path.rglob('*') if file.is_file())


def build(output, app_config):
    records = json.loads((SITE / 'handbook_data.json').read_bytes())['records']
    if len({record['id'] for record in records}) != len(records):
        raise ValueError('图鉴含重复的精灵 ID')
    artwork = Artwork()
    cards, details, definitions = export_records(records, artwork)
    packages = split_details(details, artwork)
    routes = {}
    subpackages = [item for item in app_config.get('subPackages', []) if not item['root'].startswith('generated/dex-')]
    sizes = []
    for index, (data, images) in enumerate(packages, 1):
        name = f'dex-{index:02d}'
        write_detail_package(output / name, name, data, images, artwork)
        routes.update((record_id, index) for record_id in data)
        subpackages.append({'root': f'generated/{name}', 'pages': ['index']})
        sizes.append(file_size(output / name))
    app_config['subPackages'] = subpackages
    for card in cards:
        card['package'] = routes[card['id']]
    write_module(output / 'catalog.js', {'types': TYPES, 'records': cards})
    write_module(output / 'skills.js', definitions)
    artwork.write(output / 'thumbs', {card['thumb'] for card in cards if card['thumb']})
    write_design_assets(output, artwork, cards)
    source_size = sum(file_size(APP / d) for d in ('pages', 'lib', 'ui'))
    source_size += sum(file.stat().st_size for file in APP.glob('*') if file.is_file())
    main_size = file_size(output) - sum(sizes) + source_size
    total_size = main_size + sum(sizes)
    if max(main_size, max(sizes, default=0)) >= PACKAGE_LIMIT or total_size > TOTAL_LIMIT:
        raise ValueError(f'图鉴超出代码包预算，主包 {main_size:,}、最大分包 {max(sizes):,}、总计 {total_size:,} 字节')
    print(f'生成 {len(cards)} 个精灵形态，主包约 {main_size:,} 字节，{len(sizes)} 个详情分包，合计约 {total_size:,} 字节')


def main():
    config_file = APP / 'app.json'
    app_config = json.loads(config_file.read_bytes())
    with TemporaryDirectory(prefix='.dex-build-', dir=APP) as temp:
        stage = Path(temp)
        generated = stage / 'generated'
        generated.mkdir()
        build(generated, app_config)
        replacement = stage / 'app.json'
        replacement.write_text(json.dumps(app_config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        target = APP / 'generated'
        previous = stage / 'previous'
        if target.exists():
            target.rename(previous)
        try:
            generated.rename(target)
            replacement.replace(config_file)
        except OSError:
            if target.exists():
                shutil.rmtree(target)
            if previous.exists():
                previous.rename(target)
            raise


if __name__ == '__main__':
    main()
