#!/usr/bin/env python3
"""Mirror Wiki map icons to the website so the mini program uses one download domain."""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
import json
from os import getpid
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from PIL import Image


MAPS = Path(__file__).resolve().parents[2] / 'map_data'
MEDIA = MAPS / 'mini-icons'
INDEX = MAPS / 'mini-icons.json'


def details_icons(value):
    if isinstance(value, list):
        for item in value:
            yield from details_icons(item)
    elif isinstance(value, dict):
        if isinstance(value.get('icon'), str):
            yield value['icon']
        for item in value.values():
            yield from details_icons(item)


def sources():
    manifest = json.loads((MAPS / 'manifest.json').read_bytes())
    icons = set()
    for entry in manifest['maps'].values():
        scene = json.loads((MAPS / entry['file']).read_bytes())
        icons.update(category['icon'] for category in scene['categories'])
        icons.update(scene['strings'][point[7]] for point in scene['points'])
        for detail in scene['details']:
            icons.update(details_icons(json.loads((MAPS / detail).read_bytes())))
    return sorted(url for url in icons if urlsplit(url).scheme == 'https' and urlsplit(url).hostname == 'patchwiki.biligame.com')


def mirror(url):
    name = f'{sha256(url.encode()).hexdigest()[:20]}.webp'
    target = MEDIA / name
    if target.is_file():
        return url, f'mini-icons/{name}', ''
    error = ''
    for _ in range(2):
        try:
            request = Request(url, headers={'User-Agent': 'ROCOM Tools (map icon mirror)', 'Referer': 'https://wiki.biligame.com/'})
            with urlopen(request, timeout=8) as response:
                data = response.read(4 * 1024 * 1024 + 1)
            if len(data) > 4 * 1024 * 1024:
                return url, '', 'image exceeds 4 MB'
            if urlsplit(url).path.lower().endswith('.svg'):
                from cairosvg.surface import PNGSurface

                data = PNGSurface.convert(bytestring=data, output_width=112, output_height=112, unsafe=False,
                                          url_fetcher=lambda *_args, **_kwargs: b'')
            with Image.open(BytesIO(data)) as image:
                icon = image.convert('RGBA')
                icon.thumbnail((112, 112), Image.Resampling.LANCZOS)
                staging = target.with_suffix(f'.{getpid()}.work')
                icon.save(staging, format='WEBP', quality=85, method=4)
                staging.replace(target)
            return url, f'mini-icons/{name}', ''
        except (OSError, ValueError) as failure:
            error = str(failure)
            if isinstance(failure, HTTPError) and failure.code in (403, 404, 410):
                break
    return url, '', error


def main():
    MEDIA.mkdir(exist_ok=True)
    paths = {}
    failures = []
    urls = sources()
    with ThreadPoolExecutor(max_workers=6) as pool:
        for url, path, error in pool.map(mirror, urls):
            if path:
                paths[url] = path
            else:
                failures.append((url, error))
    staging = INDEX.with_suffix(f'.{getpid()}.work')
    staging.write_text(json.dumps(paths, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    staging.replace(INDEX)
    print(f'镜像 {len(paths)}/{len(urls)} 张地图图标，失败 {len(failures)} 张。')
    for url, error in failures:
        print(f'{url} {error}')


if __name__ == '__main__':
    main()
