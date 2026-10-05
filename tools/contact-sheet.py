#!/usr/bin/env python3
"""Hoja de contacto antes/después a partir de dos carpetas de capturas.

    python3 tools/contact-sheet.py <antes> <después> <salida.png> [--suffix --movil] [--cols 2]

Empareja los PNG por nombre (los genera tools/visual-capture.mjs con las mismas
poses en ambas versiones), los reduce y los coloca en filas: sala | antes | después.
Además escribe una tabla de diferencias de luminancia por imagen (media y
desviación), para que la comparación no dependa solo del ojo.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageStat

ORDER = ['lobby', 'shop', 'gallery-a', 'archive', 'gallery-b', 'itinerant-wet-paint', 'breeze']
NAMES = {
    'lobby': 'Vestíbulo', 'shop': 'Tienda', 'gallery-a': 'Galería A', 'archive': 'Archivo',
    'gallery-b': 'Galería B', 'itinerant-wet-paint': 'Wet Paint', 'breeze': 'Sala Breeze'
}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    suffix = ''
    if '--suffix' in sys.argv:
        suffix = sys.argv[sys.argv.index('--suffix') + 1]
        args = [a for a in args if a != suffix]
    before, after, out = args[:3]
    files = sorted(f for f in os.listdir(after) if f.endswith(f'{suffix}.png'))
    if suffix == '':
        files = [f for f in files if '--movil' not in f]
    files.sort(key=lambda f: (ORDER.index(f.split('--')[0]) if f.split('--')[0] in ORDER else 99, 0 if '--general' in f else 1, f))

    thumb_w = 560 if suffix == '' else 260
    label_w = 170
    pad = 10
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
    rows = []
    stats = []
    for f in files:
        a_path, b_path = os.path.join(before, f), os.path.join(after, f)
        if not os.path.exists(a_path):
            continue
        a, b = Image.open(a_path).convert('RGB'), Image.open(b_path).convert('RGB')
        th = round(a.height * thumb_w / a.width)
        rows.append((f, a.resize((thumb_w, th), Image.LANCZOS), b.resize((thumb_w, th), Image.LANCZOS)))
        la, lb = ImageStat.Stat(a.convert('L')), ImageStat.Stat(b.convert('L'))
        stats.append({
            'file': f,
            'luma_mean_before': round(la.mean[0], 1), 'luma_mean_after': round(lb.mean[0], 1),
            'luma_std_before': round(la.stddev[0], 1), 'luma_std_after': round(lb.stddev[0], 1),
            'mean_abs_diff': round(sum(ImageStat.Stat(_absdiff(a, b)).mean) / 3, 1)
        })

    header = 34
    width = label_w + 2 * thumb_w + 4 * pad
    height = header + sum(r[1].height + pad for r in rows) + pad
    sheet = Image.new('RGB', (width, height), (18, 17, 16))
    draw = ImageDraw.Draw(sheet)
    draw.text((label_w + pad * 2, 8), 'ANTES · 4f0c01c', fill=(230, 222, 205), font=font)
    draw.text((label_w + thumb_w + pad * 3, 8), 'DESPUÉS · mision-visual-presentacion', fill=(230, 222, 205), font=font)
    y = header
    for f, a, b in rows:
        room, view = f.replace('.png', '').split('--')[:2]
        draw.text((pad, y + 8), NAMES.get(room, room), fill=(240, 234, 220), font=font)
        draw.text((pad, y + 34), view, fill=(170, 162, 150), font=small)
        sheet.paste(a, (label_w + pad * 2, y))
        sheet.paste(b, (label_w + thumb_w + pad * 3, y))
        y += a.height + pad
    sheet.save(out, optimize=True)
    with open(os.path.splitext(out)[0] + '.json', 'w') as fh:
        json.dump(stats, fh, indent=2, ensure_ascii=False)
    print(f'{out}: {len(rows)} pares')
    for s in stats:
        print(f"  {s['file']:<42} media {s['luma_mean_before']:>5} → {s['luma_mean_after']:>5}   contraste {s['luma_std_before']:>5} → {s['luma_std_after']:>5}   |Δ| medio {s['mean_abs_diff']}")


def _absdiff(a, b):
    from PIL import ImageChops
    return ImageChops.difference(a, b)


if __name__ == '__main__':
    main()
