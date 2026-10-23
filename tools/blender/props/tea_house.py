"""Roadside rest-stop tea house (chaya), 8 x 6 x 4.5 m, front facing -Y.

Stone plinth, plaster walls in a timber frame with board wainscot, open entrance with an indigo
noren curtain, shoji window, tiled curved gable roof (sawtooth tile rows) plus a front pent
roof (hisashi), red benches with a nodate-gasa umbrella, hanging lanterns and a sign board.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import (box, chochin, clear, cyl, finish, gable_profile, join, lathe, mat,  # noqa: E402
                     rod, sweep)

clear()
stone, wood, light, wall = mat("stone"), mat("wood"), mat("wood_light"), mat("wall")
roof, ink, white, noren, red = mat("roof"), mat("ink"), mat("white"), mat("noren"), mat("torii")
p = []

# footprint of the walls: x -3.4..3.4, y -2.0..2.4 (the front strip y<-2 is the bench terrace)
X0, X1, Y0, Y1 = -3.4, 3.4, -2.0, 2.4
WZ = 2.8  # wall top
p.append(box((8.0, 6.0, 0.25), (0, 0.0, 0.125), stone, bevel=0.03))
p.append(box((X1 - X0, Y1 - Y0, 0.1), (0, (Y0 + Y1) / 2, 0.3), wood))
zc = (0.35 + WZ) / 2
hz = WZ - 0.35
# back and side walls (plaster) with board wainscot
p.append(box((X1 - X0, 0.15, hz), (0, Y1, zc), wall))
p.append(box((X1 - X0 + 0.02, 0.17, 0.8), (0, Y1, 0.75), light))
for x in (X0, X1):
    p.append(box((0.15, Y1 - Y0, hz), (x, (Y0 + Y1) / 2, zc), wall))
    p.append(box((0.17, Y1 - Y0, 0.8), (x, (Y0 + Y1) / 2, 0.75), light))
# front wall: left shoji window bay, centre entrance (3 m), right board panel
p.append(box((1.9, 0.15, hz), (-2.45, Y0, zc), wall))
p.append(box((1.3, 0.05, 0.9), (-2.45, Y0 - 0.08, 1.75), white))                   # shoji
for x in (-2.95, -2.62, -2.28, -1.95):
    p.append(box((0.04, 0.06, 0.9), (x, Y0 - 0.1, 1.75), wood))
for z in (1.45, 1.75, 2.05):
    p.append(box((1.3, 0.06, 0.04), (-2.45, Y0 - 0.1, z), wood))
p.append(box((1.9, 0.17, 0.8), (-2.45, Y0, 0.75), light))
p.append(box((1.9, 0.15, hz), (2.45, Y0, zc), light))                              # board panel
for x in (1.8, 2.25, 2.7, 3.15):
    p.append(box((0.05, 0.19, hz), (x, Y0, zc), wood))
p.append(box((3.0, 0.15, 0.55), (0, Y0, WZ - 0.275), wall))                        # lintel wall
p.append(box((3.0, 0.3, 0.06), (0, Y0 - 0.05, 0.33), ink))                         # threshold (dark interior hint)
p.append(box((2.9, 0.05, 2.1), (0, Y0 + 1.2, 1.4), ink))                           # dark interior backdrop
# timber frame posts and beams
for x in (X0, -1.5, 1.5, X1):
    for y in (Y0, Y1):
        p.append(box((0.2, 0.2, WZ - 0.25), (x, y, (WZ + 0.25) / 2), wood))
for y in (Y0, Y1):
    p.append(box((X1 - X0 + 0.3, 0.22, 0.2), (0, y, WZ), wood))
# noren: rod + four indigo strips over the entrance, plus a white crest band
p.append(rod((-1.55, Y0 - 0.2, 2.2), (1.55, Y0 - 0.2, 2.2), 0.03, 0.03, light, verts=5))
for i in range(4):
    x = -1.11 + i * 0.74
    p.append(box((0.68, 0.03, 0.85), (x, Y0 - 0.22, 1.76), noren))
    p.append(box((0.3, 0.035, 0.12), (x, Y0 - 0.23, 1.9), white))
# sign board (kanban) above the entrance
p.append(box((1.8, 0.08, 0.42), (0, Y0 - 0.12, 2.52), light))
p.append(box((1.6, 0.09, 0.28), (0, Y0 - 0.13, 2.52), ink))

# main roof: curved tiled gable, ridge along X
RZ = 4.38
prof = gable_profile(half=2.9, ridge=RZ, drop=1.75, thick=0.16, sag=0.75, flick=0.12, rows=6, lip=0.07, n=6)
p.append(sweep(prof, 7.6, loc=(0, (Y0 + Y1) / 2, 0), m=roof, axis="X"))
# gable infill walls under the roof ends (follow the curved underside)
YC = (Y0 + Y1) / 2
gable = [(Y0 - YC, WZ - 0.1)]
for i in range(11):
    y = (Y0 - YC) + (Y1 - Y0) * i / 10
    gable.append((y, max(WZ, RZ - 1.75 * (abs(y) / 2.9) ** 0.75 - 0.17)))
gable.append((Y1 - YC, WZ - 0.1))
for x in (X0, X1):
    p.append(sweep(gable, 0.12, loc=(x, YC, 0), m=wall, axis="X"))
    p.append(box((0.16, 0.16, RZ - WZ - 0.2), (x, YC, (RZ + WZ) / 2 - 0.1), wood))  # king post
p.append(box((7.7, 0.3, 0.2), (0, (Y0 + Y1) / 2, RZ + 0.05), ink))                # ridge
for s in (-1, 1):
    p.append(box((0.3, 0.42, 0.42), (s * 3.85, (Y0 + Y1) / 2, RZ + 0.1), ink))    # onigawara end tiles
# hisashi: front pent roof over the terrace
hprof = [(-1.05, 2.15), (-1.05, 2.25), (0.35, 2.68), (0.35, 2.52)]
p.append(sweep(hprof, 7.8, loc=(0, Y0, 0), m=roof, axis="X"))
for x in (-3.6, 3.6):
    p.append(cyl(0.08, 2.1, (x, Y0 - 0.95, 0.25), wood, verts=6))

# terrace: red benches (with legs) and a nodate-gasa umbrella
for x in (-2.4, 2.4):
    p.append(box((1.7, 0.6, 0.08), (x, Y0 - 0.65, 0.68), red))
    for dx in (-0.7, 0.7):
        p.append(box((0.07, 0.5, 0.42), (x + dx, Y0 - 0.65, 0.45), light))
p.append(rod((-1.5, Y0 - 0.75, 0.25), (-1.5, Y0 - 0.75, 2.05), 0.03, 0.03, light, verts=5))
p.append(lathe([(0.0, 2.12), (0.95, 1.74), (0.88, 1.72)], segs=12, loc=(-1.5, Y0 - 0.75, 0), m=red))

# hanging lanterns at both sides of the entrance
for x in (-1.75, 1.75):
    p += chochin((x, Y0 - 0.45, 2.4), h=0.5)

join(p, "tea_house")
finish("tea_house", 2500, size_range=((7.6, 5.6, 4.2), (8.4, 7.0, 4.8)),
       require_materials=("noren", "roof", "paper_lantern"))
