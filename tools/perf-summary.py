#!/usr/bin/env python3
"""Agrega las pasadas de tools/perf-probe.mjs: base frente a candidata.

    python3 tools/perf-summary.py docs/visual-validation/rendimiento/serie [high|movil]

Por métrica: mediana entre pasadas (cada pasada aporta su propia mediana por
sala), rango y diferencia porcentual de medianas. Escribe resumen-<perfil>.json.
"""
import glob, json, os, statistics as st, sys

NAMES = {'space.lobby': 'Vestíbulo', 'space.shop': 'Tienda', 'space.gallery-a': 'Galería A',
         'space.archive': 'Archivo', 'space.gallery-b': 'Galería B', 'space.itinerant-wet-paint': 'Wet Paint'}

def load(d, prof, v):
    return [json.load(open(f)) for f in sorted(glob.glob(os.path.join(d, f'{prof}-{v}-*.json')))]

def agg(vals):
    vals = [x for x in vals if x is not None]
    if not vals: return None
    return {'median': round(st.median(vals), 1), 'min': round(min(vals), 1), 'max': round(max(vals), 1), 'n': len(vals)}

def pct(a, b):
    return None if not a or not b or not a['median'] else round((b['median'] / a['median'] - 1) * 100, 1)

def main():
    d, prof = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'high')
    runs = {v: load(d, prof, v) for v in ('base', 'cand')}
    out = {'profile': prof, 'passes': {v: len(r) for v, r in runs.items()},
           'renderer': sorted({r.get('renderer') or '?' for v in runs for r in runs[v]}),
           'tier': sorted({r['policy']['tier'] for v in runs for r in runs[v]})}
    g = {}
    for key in ('readyMs', 'floorsPreviewMs', 'floorsReadyMs', 'bytesAtReadyMB'):
        g[key] = {v: agg([r.get(key) for r in runs[v]]) for v in runs}
    g['readyOrFloorsMs'] = {v: agg([(r.get('floorsReadyMs') or r['readyMs']) for r in runs[v]]) for v in runs}
    g['pageErrors'] = {v: sum(len(r['pageErrors']) for r in runs[v]) for v in runs}
    g['failedRequests'] = {v: sum(len(r['failedRequests']) for r in runs[v]) for v in runs}
    out['global'] = g
    rooms = {}
    for sid in NAMES:
        row = {}
        for metric in ('still', 'walking'):
            row[metric] = {v: agg([r['rooms'][sid][metric]['median'] for r in runs[v] if sid in r['rooms']]) for v in runs}
            row[metric]['pct'] = pct(row[metric]['base'], row[metric]['cand'])
        for metric in ('calls', 'triangles', 'textures', 'heapMB'):
            row[metric] = {v: agg([r['rooms'][sid].get(metric) for r in runs[v] if sid in r['rooms']]) for v in runs}
        row['crossMs'] = {v: agg([x for r in runs[v] if sid in r['rooms'] for x in r['rooms'][sid].get('crossMs', [])]) for v in runs}
        row['crossMs']['pct'] = pct(row['crossMs']['base'], row['crossMs']['cand'])
        rooms[sid] = row
    out['rooms'] = rooms
    json.dump(out, open(os.path.join(d, f'resumen-{prof}.json'), 'w'), indent=2, ensure_ascii=False)
    m = lambda x: '—' if not x else f"{x['median']:.0f}"
    print(f"perfil {prof} · pasadas {out['passes']} · tier {out['tier']} · renderer {out['renderer']}")
    for key in ('readyMs', 'floorsPreviewMs', 'floorsReadyMs', 'readyOrFloorsMs'):
        b, c = g[key]['base'], g[key]['cand']
        print(f"  {key:16} base {m(b)} [{b['min'] if b else ''}–{b['max'] if b else ''}]  cand {m(c)} [{c['min'] if c else ''}–{c['max'] if c else ''}]  Δ {pct(b, c)} %")
    print(f"  errores de página base {g['pageErrors']['base']} cand {g['pageErrors']['cand']} · fallidas base {g['failedRequests']['base']} cand {g['failedRequests']['cand']}")
    print(f"  {'sala':10} {'parado b→c':>16} {'Δ%':>6} {'caminando b→c':>16} {'Δ%':>6} {'cruce b→c':>12} {'Δ%':>6} {'llamadas':>10} {'texturas':>9}")
    for sid, row in rooms.items():
        s, w, x = row['still'], row['walking'], row['crossMs']
        print(f"  {NAMES[sid]:10} {m(s['base']):>7}→{m(s['cand']):<7} {str(s['pct']):>6} {m(w['base']):>7}→{m(w['cand']):<7} {str(w['pct']):>6} {m(x['base']):>5}→{m(x['cand']):<5} {str(x['pct']):>6} {m(row['calls']['base']):>4}→{m(row['calls']['cand']):<4} {m(row['textures']['base']):>3}→{m(row['textures']['cand'])}")

if __name__ == '__main__':
    main()
