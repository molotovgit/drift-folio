"""Small roadside Shinto shrine (hokora), ~2.5 x 2 x 3 m, front facing -Y.

Two-tier stone base with steps, raised wooden sanctuary with lattice doors, a curved gable
roof swept from a sagging profile (ridge along X) with katsuogi logs and crossed chigi, a
shimenawa rope with paper shide, an offering box and a small hanging paper lantern.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import (box, chochin, clear, cyl, finish, gable_profile, join, mat, rod,  # noqa: E402
                     sweep)

clear()
stone, wood, light, roof = mat("stone"), mat("wood"), mat("wood_light"), mat("roof")
white, ink, red = mat("white"), mat("ink"), mat("torii")
p = []

# stone base: two tiers + front steps
p.append(box((2.5, 2.0, 0.34), (0, 0.0, 0.17), stone, bevel=0.03))
p.append(box((1.9, 1.5, 0.3), (0, 0.08, 0.49), stone, bevel=0.03))
p.append(box((1.1, 0.34, 0.2), (0, -1.12, 0.1), stone))
p.append(box((1.1, 0.3, 0.17), (0, -0.82, 0.42), stone))

# raised floor and sanctuary body
FZ = 0.64
p.append(box((1.6, 1.3, 0.1), (0, 0.1, FZ + 0.05), wood))
p.append(box((1.7, 0.08, 0.07), (0, -0.6, FZ + 0.16), wood))  # front railing beam
BZ0, BZ1 = FZ + 0.1, 1.95
for x in (-0.65, 0.65):
    for y in (-0.42, 0.62):
        p.append(box((0.1, 0.1, BZ1 - BZ0), (x, y, (BZ0 + BZ1) / 2), wood))
p.append(box((1.24, 0.05, BZ1 - BZ0), (0, 0.62, (BZ0 + BZ1) / 2), light))  # back wall
for x in (-0.65, 0.65):
    p.append(box((0.05, 1.0, BZ1 - BZ0), (x, 0.1, (BZ0 + BZ1) / 2), light))  # side walls
# front lattice doors: paper panel + wooden grid
p.append(box((1.2, 0.04, 0.95), (0, -0.4, BZ0 + 0.55), white))
for x in (-0.6, -0.3, 0.0, 0.3, 0.6):
    p.append(box((0.045, 0.06, 0.95), (x, -0.43, BZ0 + 0.55), wood))
for z in (BZ0 + 0.1, BZ0 + 0.42, BZ0 + 0.74, BZ0 + 1.02):
    p.append(box((1.24, 0.06, 0.045), (0, -0.43, z), wood))
# head beam (kashiragi) carrying the roof
p.append(box((1.6, 1.25, 0.12), (0, 0.1, BZ1 + 0.04), wood))

# curved gable roof, ridge along X, swept profile, eaves flick up
RZ = BZ1 + 0.82
prof = gable_profile(half=1.18, ridge=RZ, drop=0.85, thick=0.1, sag=0.62, flick=0.09, n=7)
p.append(sweep(prof, 2.3, loc=(0, 0.1, 0), m=roof, axis="X"))
hafu = gable_profile(half=1.2, ridge=RZ + 0.03, drop=0.87, thick=0.2, sag=0.62, flick=0.1, n=7)
for s in (-1, 1):  # dark bargeboards (hafu) outlining the curved gable ends
    p.append(sweep(hafu, 0.06, loc=(s * 1.16, 0.1, 0), m=ink, axis="X"))
p.append(box((2.1, 0.2, 0.12), (0, 0.1, RZ + 0.03), ink))  # ridge cap
for x in (-0.55, 0.0, 0.55):  # katsuogi logs across the ridge
    p.append(rod((x, -0.12, RZ + 0.14), (x, 0.32, RZ + 0.14), 0.07, 0.07, light, verts=6))
for s in (-1, 1):  # chigi: crossed boards at the gable ends
    x = s * 1.12
    p.append(box((0.05, 0.08, 0.6), (x, 0.1 - 0.17, RZ + 0.12), ink, rot=(-40, 0, 0)))
    p.append(box((0.05, 0.08, 0.6), (x, 0.1 + 0.17, RZ + 0.12), ink, rot=(40, 0, 0)))

# shimenawa rope and shide paper streamers along the front
p.append(rod((-0.75, -0.55, BZ1 - 0.12), (0.75, -0.55, BZ1 - 0.12), 0.045, 0.045, light, verts=6))
for x in (-0.4, 0.0, 0.4):
    p.append(box((0.08, 0.015, 0.22), (x, -0.56, BZ1 - 0.28), white, rot=(0, 12, 0)))
# offering box (saisen-bako) and a little red fence of a sign
p.append(box((0.6, 0.35, 0.32), (0, -0.82, 0.67), wood, bevel=0.02))
p.append(box((0.5, 0.36, 0.05), (0, -0.82, 0.84), ink))
for x in (-0.95, 0.95):  # small red posts flanking the steps
    p.append(cyl(0.05, 0.75, (x, -0.85, 0.34), red, verts=6))

# small paper lantern hanging from the front-right eave
p += chochin((0.82, -0.75, BZ1 + 0.02), h=0.42)
p.append(box((0.03, 0.03, 0.15), (0.82, -0.75, BZ1 + 0.08), ink))

join(p, "shrine")
finish("shrine", 2500, size_range=((2.2, 1.8, 2.6), (2.8, 2.6, 3.3)),
       require_materials=("stone", "roof", "paper_lantern"))
