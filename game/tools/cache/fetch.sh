#!/bin/sh
# Downloads raw map sources into tools/cache (not committed).
set -e
NE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
for f in ne_10m_admin_0_countries ne_10m_admin_1_states_provinces ne_10m_populated_places ne_10m_lakes ne_10m_rivers_lake_centerlines; do
  [ -s $f.geojson ] || curl -sS --retry 4 -o $f.geojson $NE/$f.geojson
done
[ -s NE1_50M_SR_W.zip ] || curl -sS --retry 4 -o NE1_50M_SR_W.zip https://naciscdn.org/naturalearth/50m/raster/NE1_50M_SR_W.zip
mkdir -p terrarium
for x in $(seq 0 15); do for y in $(seq 0 15); do
  [ -s terrarium/4_${x}_${y}.png ] || curl -sS --retry 4 -o terrarium/4_${x}_${y}.png https://s3.amazonaws.com/elevation-tiles-prod/terrarium/4/$x/$y.png &
done; wait; done
echo done
