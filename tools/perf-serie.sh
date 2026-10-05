#!/bin/sh
# Serie oficial alterna base/candidata: 5+5 escritorio HIGH y 5+5 móvil.
#   sh tools/perf-serie.sh <carpeta-salida> [puerto-inicial]
# Reanudable: las pasadas ya guardadas no se repiten. Base en ../museo-baseline (4f0c01c).
cd "$(dirname "$0")/.."
OUT=${1:?carpeta de salida}; P=${2:-4800}; BASE=${BASE_ROOT:-../museo-baseline}
mkdir -p "$OUT"
for prof in high movil; do for i in 1 2 3 4 5; do for v in base cand; do
  P=$((P+1))
  ROOT=$([ $v = base ] && echo "$BASE" || echo .)
  FLAGS=$([ $prof = high ] && echo "--tier HIGH" || echo "--mobile")
  [ -f "$OUT/$prof-$v-$i.json" ] && continue
  echo "$(date +%T) $prof $v $i" >> "$OUT/serie.log"
  node tools/perf-probe.mjs --root "$ROOT" --out "$OUT/$prof-$v-$i.json" $FLAGS --port $P > "$OUT/ultima-pasada.log" 2>&1 || echo "FALLO $prof $v $i" >> "$OUT/serie.log"
done; done; done
echo DONE >> "$OUT/serie.log"
