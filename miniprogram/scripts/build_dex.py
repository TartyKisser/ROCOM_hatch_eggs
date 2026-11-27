#!/usr/bin/env python3
"""Build the offline handbook text and font from the website's source data."""

from base64 import b64encode
from io import BytesIO
import json
from pathlib import Path
import re
import shutil
from tempfile import TemporaryDirectory

from fontTools import subset


PROJECT = Path(__file__).resolve().parents[1]
APP = PROJECT / 'app'
SITE = PROJECT.parent
PACKAGE_LIMIT = 1_500_000
# Keep the existing twelve detail entry points for the current catalogue.
RECORDS_PER_PACKAGE = 56
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


def existing_image(relative):
    return relative if relative and (SITE / relative).is_file() else ''


def export_records(records):
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
            'thumb': existing_image(thumb),
        }
        detail = {field: record.get(field) for field in DETAIL_FIELDS}
        detail['images'] = {
            'portrait': existing_image(record['portrait']),
            'shiny': existing_image(record.get('rarePath')) if record['rare'] else '',
            'egg': existing_image(record.get('icon-egg')),
            'fruit': existing_image(record.get('icon-fruit')),
            'shinyEgg': existing_image(record.get('icon-egg-rare')),
        }
        detail['skills'] = []
        for skill in record.get('skills', ()):
            if not skill or not skill.get('name'):
                continue
            definition = {field: skill.get(field) for field in SKILL_FIELDS}
            definition['icon'] = existing_image(skill.get('icon'))
            key = tuple(definition.values())
            if key not in definition_indexes:
                definition_indexes[key] = len(definitions)
                definitions.append(definition)
            detail['skills'].append([definition_indexes[key], skill.get('level'), skill.get('source'), skill.get('unlock')])
        cards.append(card)
        details.append((record['id'], detail))
    return cards, details, definitions


def write_detail_package(directory, name, records, definitions):
    used = sorted({skill[0] for record in records.values() for skill in record['skills']})
    indexes = {index: local for local, index in enumerate(used)}
    package_records = {
        record_id: {**record, 'skills': [[indexes[index], *fields] for index, *fields in record['skills']]}
        for record_id, record in records.items()
    }
    directory.mkdir()
    write_module(directory / 'records.js', {
        'root': f'/generated/{name}/',
        'records': package_records,
        'definitions': [definitions[index] for index in used],
    })
    (directory / 'index.js').write_text(
        "const { createDetailPage } = require('../../lib/detail')\n"
        "Page(createDetailPage(require('./records')))\n", encoding='utf-8',
    )
    (directory / 'index.json').write_text('{"navigationBarTitleText":"精灵详情"}\n', encoding='utf-8')
    (directory / 'index.wxml').write_text('<include src="../../ui/detail.wxml" />\n', encoding='utf-8')
    (directory / 'index.wxss').write_text('@import "../../ui/detail.wxss";\n', encoding='utf-8')


def write_font(output, cards):
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
    cards, details, definitions = export_records(records)
    routes = {}
    subpackages = [item for item in app_config.get('subPackages', []) if not item['root'].startswith('generated/dex-')]
    sizes = []
    for index, offset in enumerate(range(0, len(details), RECORDS_PER_PACKAGE), 1):
        data = dict(details[offset:offset + RECORDS_PER_PACKAGE])
        name = f'dex-{index:02d}'
        write_detail_package(output / name, name, data, definitions)
        routes.update((record_id, index) for record_id in data)
        subpackages.append({'root': f'generated/{name}', 'pages': ['index']})
        sizes.append(file_size(output / name))
    app_config['subPackages'] = subpackages
    for card in cards:
        card['package'] = routes[card['id']]
    write_module(output / 'catalog.js', {'types': TYPES, 'records': cards})
    write_font(output, cards)
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
