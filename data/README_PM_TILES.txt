CityMap 6.0 – PMTiles helyi kivágat (Oroszlány + ~10 km)

Ez a 6.0-ás kísérleti verzió MapLibre + PMTiles (Protomaps) hátteret használ.
Alapból a Protomaps ingyenes napi (planet) PMTiles fájlját tölti be online:
  https://build.protomaps.com/20260228.pmtiles

Ha teljesen "helyi" (offline) háttér kell:
1) töltsd le a pmtiles CLI-t (Windows x64) a Protomaps/go-pmtiles GitHub Releases-ből
2) futtasd ezt (bbox: Oroszlány + ~10 km):

pmtiles extract https://build.protomaps.com/20260228.pmtiles oroszlany_10km.pmtiles \
  --bbox=18.17915,47.39690,18.44535,47.57650 --maxzoom=16

3) másold ide ebbe a mappába:
  /data/oroszlany_10km.pmtiles

A program indításkor először ezt a lokális fájlt próbálja (HEAD), és ha megtalálja,
akkor azt használja. Ha nincs itt, automatikusan visszaesik a remote buildre.

Megjegyzés: ha a fájl túl nagy, csökkentsd a maxzoom-ot (pl. 15 vagy 14).
