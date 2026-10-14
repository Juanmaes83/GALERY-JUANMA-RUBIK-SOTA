#!/bin/sh
cd /home/claude/museo-objetivo
OUT=${OUT_DIR:-/tmp}/ab-$1
mkdir -p $OUT; P=$2
R=space.gallery-a,space.gallery-b,space.itinerant-wet-paint
for i in 1 2 3; do for v in base cand; do P=$((P+1))
  ROOT=$([ $v = base ] && echo /home/claude/museo-baseline || echo /home/claude/museo-objetivo)
  [ -f $OUT/high-$v-$i.json ] || node tools/perf-probe.mjs --root $ROOT --out $OUT/high-$v-$i.json --tier HIGH --port $P --rooms $R > /tmp/ab-run.log 2>&1
done; done
echo DONE > $OUT/done
