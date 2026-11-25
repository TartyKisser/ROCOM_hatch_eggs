"""Build the static map from the public BWIKI map data. Run on A100."""

import argparse
import base64
import gzip
import hashlib
import json
import os
import re
import subprocess
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory, gettempdir
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen


WIKI = "https://wiki.biligame.com/nrc"
MAP_URL = f"{WIKI}/%E5%9C%B0%E5%9B%BE"
SOURCE = f"{WIKI}/MediaWiki:WorldMap.js?action=raw&ctype=text/javascript"
DETAIL_PAGE_SIZE = 64
FLOORS = {"surface": "大地图", "floor-1": "地底一层", "floor-2": "地底二层", "floor-3": "地底三层"}
ROOT = Path(__file__).resolve().parents[1]


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fetch(urls, accept, limit):
    error = None
    for attempt, url in enumerate(tuple(urls) * 2):
        try:
            request = Request(url, headers={"User-Agent": "ROCOM-map-sync/1.0", "Referer": MAP_URL})
            with urlopen(request, timeout=25) as response:
                data = response.read(limit + 1)
            if len(data) > limit or not accept(data):
                raise ValueError("响应格式或大小不符合地图资料的预期")
            return data
        except (OSError, ValueError) as failure:
            error = failure
            time.sleep(min(attempt + 1, 4))
    raise RuntimeError(f"读取 Wiki 失败：{urls[0]} ({error})") from error


def load_config(cache, offline):
    path = cache / "world-map.js"
    if not offline:
        path.write_bytes(fetch([SOURCE], lambda data: b"const config = " in data, 2_000_000))
    text = path.read_text(encoding="utf-8")
    expression = re.search(r"\bconst config\s*=\s*", text)
    if expression is None:
        raise ValueError("Wiki 地图的发布清单格式已变化")
    # The Wiki publishes a JSON object inside its loader. Read it as data.
    return json.JSONDecoder().raw_decode(text[expression.end():])[0]


def load_shard(title, version, cache, offline):
    if not re.fullmatch(r"MediaWiki:WorldMap/data/[a-z0-9-]+\.js", title):
        raise ValueError(f"未知地图分片：{title}")
    path = cache / title.rsplit("/", 1)[1]
    if not offline:
        query = urlencode({"action": "raw", "ctype": "text/javascript", "v": version})
        page = f"{WIKI}/{quote(title, safe=':/')}"
        urls = [f"{WIKI}/index.php?{urlencode({'title': title})}&{query}",
                f"{page}?{query}", f"{page}?action=raw"]
        path.write_bytes(fetch(urls, lambda data: b'"gz1:' in data, 3_000_000))
    wrapper = re.fullmatch(
        r'\s*window\.NrcWorldMap\.receive\("([^"]+)","gz1:([A-Za-z0-9+/=]+)"\);\s*',
        path.read_text(encoding="utf-8"),
    )
    if wrapper is None or wrapper[1] != title:
        raise ValueError(f"地图分片格式错误：{title}")
    return json.loads(gzip.decompress(base64.b64decode(wrapper[2], validate=True)))


def load_map(map_id, config, shards):
    paths = config["data"]
    core, *detail_pages = (shards[title] for title in paths[f"/map-data/{map_id}/map-core.json"])
    points = [point for title in paths[f"/map-data/{map_id}/map-points.json"] for point in shards[title]]
    details = {point: detail for page in detail_pages for point, detail in page.items()}
    ids = {point["id"] for point in points}
    counts = Counter(f"{point['classId']}:{point['genre']}" for point in points)
    if not ids or len(ids) != len(points) or ids != details.keys():
        raise ValueError(f"{map_id} 的点位与详情未能一一对应")
    if counts != {category["id"]: category["count"] for category in core["categories"]}:
        raise ValueError(f"{map_id} 的分类数量与 Wiki 发布清单不一致")
    x0, y0, x1, y1 = core["meta"]["bounds"]
    if any(not (x0 <= point["x"] <= x1 and y0 <= point["y"] <= y1) for point in points):
        raise ValueError(f"{map_id} 含地图范围之外的点位")
    return core, points, details


def asset_url(path, config):
    if not path:
        return ""
    url = config["assetUrls"][path]
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != "patchwiki.biligame.com":
        raise ValueError(f"未知地图素材地址：{url}")
    return url


def tile_urls(layout, config):
    return [asset_url(layout["path"].replace("{index}", f"{index + 1:02d}"), config)
            for index in range(layout["columns"] * layout["rows"])]


def map_images(core, config):
    meta = core["meta"]
    patches = [layer for layer in core["spatialLayers"] if layer["kind"] == "underground"]
    tile_sets = {key: tile_urls(meta[key], config) for key in ("openTileLayout", "unexploredTileLayout")}
    if patches:
        tile_sets["undergroundTileLayout"] = tile_urls(meta["undergroundTileLayout"], config)
    return tile_sets, patches


def cache_image(url, cache, offline):
    folder = cache / "media"
    svg = urlsplit(url).path.endswith(".svg")
    path = folder / (digest(url.encode()) + (".svg" if svg else ".png"))
    if not path.is_file():
        if offline:
            raise FileNotFoundError(f"离线素材缺失：{url}")
        def image_type(data):
            return b"<svg" in data[:2048] if svg else data.startswith(b"\x89PNG\r\n\x1a\n")
        path.write_bytes(fetch([url], image_type, 10_000_000))
    return path


def marker_source(path, config, pins):
    url = asset_url(path, config)
    return pins.get(url, url)


def webp(inputs, filter_graph, target, quality):
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-filter_complex_threads", "1"]
    for path in inputs:
        command.extend(["-threads", "1", "-i", str(path)])
    if filter_graph:
        command.extend(["-filter_complex", filter_graph])
    command.extend(["-frames:v", "1", "-threads:v", "1", "-c:v", "libwebp",
                    "-quality", str(quality), "-compression_level", "5", str(target)])
    subprocess.run(command, check=True)
    return target.read_bytes()


def save_asset(stage, stem, suffix, content):
    name = f"{stem}-{digest(content)[:12]}.{suffix}"
    path = stage / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return name


def overlay_tiles(inputs, target):
    # Compose the same layer order as the source map before serving the tiles.
    filters = []
    for index in range(1, len(inputs)):
        base = "[0:v]" if index == 1 else f"[base{index - 1}]"
        output = f"[base{index}]" if index < len(inputs) - 1 else ""
        filters.append(f"{base}[{index}:v]overlay=format=auto{output}")
    return webp(inputs, ";".join(filters), target, 82)


def tile_pyramid(stacks, columns, rows, label, stage, scratch, workers):
    paths = [scratch / f"{label}-{index}.webp" for index in range(len(stacks))]
    tiles = list(workers.map(overlay_tiles, stacks, paths))
    side = 256
    scales = [f"[{index}:v]scale={side}:{side}:flags=lanczos,format=yuva420p[s{index}]"
              for index in range(len(paths))]
    inputs = "".join(f"[s{index}]" for index in range(len(paths)))
    placement = "|".join(f"{col * side}_{row * side}" for row in range(rows) for col in range(columns))
    merged = ";".join([*scales, f"{inputs}xstack=inputs={len(paths)}:layout={placement}"])
    overview = webp(paths, merged, scratch / f"{label}-overview.webp", 77)
    return {"overview": save_asset(stage, "media/overview", "webp", overview),
            "tiles": [save_asset(stage, "media/tile", "webp", data) for data in tiles]}


def patch_floors(name):
    for position, numeral in enumerate("一二三", 1):
        if f"{numeral}层" in name:
            return [f"floor-{position}"]
    return ["floor-1", "floor-2"]


def replace_media(value, config):
    if isinstance(value, str) and value.startswith("/map-media/"):
        return asset_url(value, config)
    if isinstance(value, dict):
        return {key: replace_media(item, config) for key, item in value.items()}
    if isinstance(value, list):
        return [replace_media(item, config) for item in value]
    return value


def build_map(map_id, upstream, config, assets, pins, stage, scratch, workers):
    core, points, details = upstream
    meta = core["meta"]
    tile_sets, layers = map_images(core, config)
    columns, rows, tile_size = (meta["tileLayout"][key] for key in ("columns", "rows", "tileSize"))
    if columns != rows or any(len(urls) != columns * rows for urls in tile_sets.values()):
        raise ValueError(f"{map_id} 的底图切片布局不匹配")
    surface_inputs = list(zip(tile_sets["openTileLayout"], tile_sets["unexploredTileLayout"], strict=True))
    resolve = lambda stacks: [[assets[url] for url in stack] for stack in stacks]
    surface = tile_pyramid(resolve(surface_inputs), columns, rows, map_id, stage, scratch, workers)
    underground = None
    if layers:
        stacks = [(*stack, url) for stack, url in zip(surface_inputs, tile_sets["undergroundTileLayout"], strict=True)]
        underground = tile_pyramid(resolve(stacks), columns, rows, f"{map_id}-below", stage, scratch, workers)
    patches = []
    for layer in layers:
        image = assets[asset_url(layer["image"], config)]
        patch = webp([image], None, scratch / f"{layer['id']}.webp", 82)
        patches.append({"id": layer["id"], "name": layer["name"], "group": layer["groupName"],
                        "bounds": layer["bounds"], "floors": patch_floors(layer["name"]),
                        "image": save_asset(stage, "media/patch", "webp", patch)})

    strings = {}
    categories = core["categories"]
    category_ids = {item["id"]: index for index, item in enumerate(categories)}
    layer_ids = {"surface": 0, **{layer["id"]: index for index, layer in enumerate(patches, 1)}}
    detail_indices = {}
    detail_values = []
    rows_data = []
    for point in points:
        detail = replace_media(details[point["id"]], config)
        signature = json_bytes(detail)
        if signature not in detail_indices:
            detail_indices[signature] = len(detail_values)
            detail_values.append(detail)
        icon = marker_source(point["icon"], config, pins)
        values = [point["name"], point["region"], point["largeRegion"], icon,
                  point.get("searchTerms", ""), point.get("petSummary", "")]
        codes = [strings.setdefault(value or "", len(strings)) for value in values]
        point_layers = [layer_ids[layer] for layer in point.get("mapLayerIds") or [point["mapLayerId"]]]
        rows_data.append([point["id"], point["x"], point["y"],
                          category_ids[f"{point['classId']}:{point['genre']}"], *codes,
                          point_layers, detail_indices[signature], point["commentPageId"],
                          int(point["estimatedRegion"])])
    detail_files = [save_asset(stage, f"{map_id}-details", "json", json_bytes(detail_values[start:start + DETAIL_PAGE_SIZE]))
                    for start in range(0, len(detail_values), DETAIL_PAGE_SIZE)]
    floor_ids = {"surface", *(floor for patch in patches for floor in patch["floors"])}
    data = {
        "name": meta["sceneName"], "season": meta.get("seasonLabel", ""), "bounds": meta["bounds"],
        "size": columns * tile_size, "columns": columns, "rows": rows, "tileSize": tile_size,
        "surface": surface, "underground": underground, "patches": patches,
        "floors": {key: label for key, label in FLOORS.items() if key in floor_ids},
        "regions": core["regions"],
        "categories": [{**category, "icon": marker_source(category["icon"], config, pins)}
                       for category in categories],
        "strings": list(strings), "points": rows_data, "detailPageSize": DETAIL_PAGE_SIZE, "details": detail_files,
    }
    path = save_asset(stage, map_id, "json", json_bytes(data))
    print(f"{meta['sceneName']}：{len(points)} 个点位，{len(categories)} 类，{len(layers)} 个地下图层", flush=True)
    return {"name": data["name"], "file": path, "points": len(points), "categories": len(categories)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path(gettempdir()) / "rocom-wiki-map-upstream")
    parser.add_argument("--offline", action="store_true", help="从已下载的原始分片和图片重建")
    parser.add_argument("--output", type=Path, default=ROOT / "map_data")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    (args.cache / "media").mkdir(exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    config = load_config(args.cache, args.offline)
    shard_specs = {name: config["dataVersions"][name] for names in config["data"].values() for name in names}
    map_ids = [match[1] for path in config["data"]
               if (match := re.fullmatch(r"/map-data/([a-z0-9-]+)/map-core\.json", path))]
    if "mainland" not in map_ids:
        raise ValueError("Wiki 地图清单缺少大陆地图")
    with ThreadPoolExecutor(max_workers=3) as workers:
        shards = dict(zip(shard_specs, workers.map(lambda item: load_shard(*item, args.cache, args.offline),
                                                   shard_specs.items()), strict=True))
        maps = {map_id: load_map(map_id, config, shards) for map_id in map_ids}
        urls = set()
        pin_urls = set()
        for core, points, _ in maps.values():
            layers, patches = map_images(core, config)
            urls.update(url for tiles in layers.values() for url in tiles)
            urls.update(asset_url(patch["image"], config) for patch in patches)
            # The initial exploration preset is served using local icons.
            pin_urls.update(asset_url(row["icon"], config) for row in [*core["categories"], *points]
                            if row["classId"] == 2 and row["icon"])
        ordered = sorted(urls | pin_urls)
        assets = dict(zip(ordered, workers.map(lambda url: cache_image(url, args.cache, args.offline), ordered),
                          strict=True))
        with TemporaryDirectory(prefix="map-build-", dir=args.output.parent) as directory:
            work = Path(directory)
            stage, scratch = work / "output", work / "images"
            stage.mkdir()
            scratch.mkdir()
            def compress_pin(url):
                filter_graph = "[0:v]scale=64:64:force_original_aspect_ratio=decrease"
                return webp([assets[url]], filter_graph, scratch / f"icon-{digest(url.encode())}.webp", 83)

            sorted_pins = sorted(pin_urls)
            pins = {url: save_asset(stage, "media/icon", "webp", data)
                    for url, data in zip(sorted_pins, workers.map(compress_pin, sorted_pins), strict=True)}
            summaries = {map_id: build_map(map_id, maps[map_id], config, assets, pins, stage, scratch, workers)
                         for map_id in map_ids}
            manifest = {"schema": 1, "source": MAP_URL, "revision": digest(json_bytes(shard_specs))[:12],
                        "maps": summaries}
            for source in sorted(stage.rglob("*")):
                if source.is_file():
                    target = args.output / source.relative_to(stage)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if target.exists() and target.read_bytes() != source.read_bytes():
                        raise ValueError(f"构建资源命名冲突：{target.name}")
                    os.replace(source, target)
            manifest_path = work / "manifest.json"
            manifest_path.write_bytes(json_bytes(manifest))
            os.replace(manifest_path, args.output / "manifest.json")
            print(f"地图产物已保存到 {args.output}", flush=True)


if __name__ == "__main__":
    main()
