"""Extract boon icons from a local Hades GUI.pkg.

Reads icon-paths.json (boon id -> texture path, written by tools/importer),
extracts only the atlases that contain those textures and writes one small
PNG per boon. Output stays local: icons are Supergiant's and are not committed.

    python -I tools/icons/extract_icons.py \
        game-files/Packages/GUI.pkg game-files/generated/icon-paths.json game-files/generated/icons
"""

import json
import os
import sys
import tempfile

from deppth import deppth
from PIL import Image

SIZE = 160  # px; sharp at 72px on 2x screens, still small on disk


def atlas_index(package):
    """Map texture path -> atlas short name, from deppth's listing."""
    lines = []
    deppth.list_contents(package, logger=lines.append)
    index, atlas = {}, None
    for line in "\n".join(lines).splitlines():
        if not line.strip():
            continue
        if not line.startswith(" "):
            atlas = line.strip().split("\\")[-1]
        elif atlas:
            index[line.strip()] = atlas
    return index


def main(package, paths_file, out_dir):
    with open(paths_file, encoding="utf-8") as f:
        wanted = json.load(f)

    index = atlas_index(package)
    missing = sorted(b for b, p in wanted.items() if p not in index)
    atlases = sorted({index[p] for p in wanted.values() if p in index})
    print(f"{len(wanted)} icons in {len(atlases)} atlases; {len(missing)} not in package")

    os.makedirs(out_dir, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        deppth.extract(package, tmp, *atlases, subtextures=True)
        textures = os.path.join(tmp, "textures")
        written = 0
        for boon, path in sorted(wanted.items()):
            # deppth keeps the Windows path as the file name on macOS/Linux.
            candidates = [os.path.join(textures, path + ".png"), os.path.join(textures, *path.split("\\")) + ".png"]
            src = next((c for c in candidates if os.path.exists(c)), None)
            if src is None:
                continue
            with Image.open(src) as img:
                img.thumbnail((SIZE, SIZE))
                img.save(os.path.join(out_dir, boon + ".png"), optimize=True)
            written += 1
    print(f"wrote {written} icons to {out_dir}")
    for b in missing:
        print("  missing:", b, wanted[b])


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
