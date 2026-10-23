"""Open-front pit garage, 12 m wide x 9 m deep x 5 m high, open toward -Y.

Concrete shell with a front awning, roll-up door frame (posts, guide rails, header and rolled
door drum), ceiling light strips, workbench with tools, tool cabinet, tyre stack and oil drums.
The flat inner back wall is a separate mesh `pit_wall` (UVs 0..1, faces -Y) the game paints on.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, cyl, finish, join, lathe, mat, planar_uv, rod  # noqa: E402

clear()
conc, dark, metal, wall = mat("concrete"), mat("metal_dark"), mat("metal"), mat("wall")
ink, yellow, wood, red = mat("ink"), mat("hazard_yellow"), mat("wood_light"), mat("vending_red")
tyre, light = mat("tyre"), mat("headlight")
W, D, H = 12.0, 9.0, 5.0
p = []

# shell: floor slab, walls, roof slab with front awning
p.append(box((W, D, 0.12), (0, 0, 0.06), conc))
p.append(box((W, 0.3, H - 0.35), (0, D / 2 - 0.15, (H - 0.35) / 2), conc))           # back wall
for s in (-1, 1):
    p.append(box((0.3, D, H - 0.35), (s * (W / 2 - 0.15), 0, (H - 0.35) / 2), conc))  # side walls
    p.append(box((0.32, 0.4, H - 0.35), (s * (W / 2 - 0.15), -D / 2 + 0.2, (H - 0.35) / 2), dark))  # corner piers
p.append(box((W + 0.4, D + 0.8, 0.35), (0, -0.3, H - 0.175), dark))                  # roof + awning
p.append(box((W + 0.5, 0.12, 0.5), (0, -D / 2 - 0.7, H - 0.25), yellow))              # fascia band

# roll-up door frame: posts, guide rails, header, rolled door drum, bottom slat
FY = -D / 2 + 0.35
for s in (-1, 1):
    x = s * (W / 2 - 0.55)
    p.append(box((0.35, 0.35, 4.05), (x, FY, 2.05 + 0.06), metal))
    p.append(box((0.12, 0.2, 3.9), (x - s * 0.22, FY + 0.05, 2.0), dark))
p.append(box((W - 0.8, 0.45, 0.45), (0, FY, 4.35), metal))                             # header
p.append(rod((-(W / 2 - 0.8), FY + 0.32, 4.35), ((W / 2 - 0.8), FY + 0.32, 4.35), 0.3, 0.3, dark, verts=10))
p.append(box((W - 1.3, 0.08, 0.2), (0, FY + 0.05, 4.02), metal))                      # door bottom slat
# hazard stripes on the threshold
for i in range(12):
    x = -W / 2 + 0.9 + i * 0.93
    p.append(box((0.45, 0.25, 0.02), (x, -D / 2 + 0.2, 0.125), yellow, rot=(0, 0, 35)))

# ceiling light strips
for x in (-3.5, 0, 3.5):
    p.append(box((0.25, 5.0, 0.08), (x, 0.8, H - 0.4), light))

# workbench along the left wall
BX = -W / 2 + 0.75
p.append(box((0.9, 3.4, 0.1), (BX, 1.6, 0.95), wood))
p.append(box((0.8, 3.3, 0.06), (BX, 1.6, 0.35), dark))                                 # lower shelf
for y in (0.0, 3.2):
    for x in (BX - 0.38, BX + 0.38):
        p.append(box((0.07, 0.07, 0.9), (x, y, 0.5), dark))
p.append(box((0.08, 3.0, 1.2), (-W / 2 + 0.34, 1.6, 1.75), dark))                      # pegboard
p.append(box((0.25, 0.35, 0.2), (BX + 0.2, 0.4, 1.1), metal))                          # vise
p.append(box((0.45, 0.25, 0.25), (BX, 2.4, 1.13), red))                               # toolbox
p.append(rod((BX - 0.2, 1.5, 1.0), (BX + 0.25, 1.1, 1.05), 0.02, 0.02, metal, verts=4))  # wrench-ish
# tool cabinet in the back-right corner
p.append(box((1.4, 0.7, 1.5), (W / 2 - 1.2, D / 2 - 0.75, 0.87), red, bevel=0.02))
for z in (0.45, 0.75, 1.05, 1.35):
    p.append(box((1.2, 0.05, 0.04), (W / 2 - 1.2, D / 2 - 1.12, z), metal))
# tyre stack and oil drums near the right wall
tprof = [(0.2, 0.0), (0.32, 0.0), (0.33, 0.12), (0.32, 0.23), (0.2, 0.23)]
for i in range(4):
    p.append(lathe(tprof, segs=10, loc=(W / 2 - 1.0, -0.5, 0.12 + i * 0.24), m=tyre, closed=True))
for k, (x, y) in enumerate(((W / 2 - 1.0, 1.4), (W / 2 - 1.75, 1.6))):
    p.append(cyl(0.3, 0.9, (x, y, 0.12), (mat("sign_green"), mat("vending_blue"))[k], verts=10))
    p.append(cyl(0.31, 0.05, (x, y, 0.5), dark, verts=10))
# floor jack + rolling creeper for life
p.append(box((0.35, 1.2, 0.18), (1.5, -1.0, 0.21), red))
p.append(rod((1.5, -0.4, 0.25), (1.5, 0.5, 1.0), 0.03, 0.03, dark, verts=4))

# two-post car lift in the left bay
for x in (-3.9, -0.9):
    p.append(box((0.35, 0.35, 3.6), (x, 2.2, 1.92), yellow))
    p.append(box((0.5, 0.5, 0.06), (x, 2.2, 0.15), dark))
    for dy in (-0.9, 0.9):
        p.append(box((0.12, 1.4, 0.1), (x + (0.6 if x < -2 else -0.6), 2.2 + dy * 0.45, 0.45), dark, rot=(0, 0, 25 * dy)))
p.append(box((3.35, 0.3, 0.25), (-2.4, 2.2, 3.85), yellow))                          # top crossbar

# exterior: pilasters on side and back walls, high side windows, side door, roof AC units
for s in (-1, 1):
    for y in (-1.5, 1.5):
        p.append(box((0.12, 0.35, H - 0.35), (s * (W / 2 + 0.06), y, (H - 0.35) / 2), dark))
    p.append(box((0.06, 4.5, 0.6), (s * (W / 2 + 0.02), 0.0, 3.7), mat("glass")))
for x in (-3.0, 0.0, 3.0):
    p.append(box((0.35, 0.12, H - 0.35), (x, D / 2 + 0.06, (H - 0.35) / 2), dark))
p.append(box((0.08, 1.0, 2.1), (W / 2 + 0.03, 3.0, 1.17), metal))                    # side door
p.append(box((1.0, 0.6, 0.8), (4.2, D / 2 + 0.32, 0.52), metal, bevel=0.03))          # AC unit
p.append(cyl(0.28, 0.04, (4.2, D / 2 + 0.62, 0.52), dark, verts=8, rot=(-90, 0, 0)))

shell = join(p, "garage")

# pit_wall: the game paints text on this; separate thin panel just in front of the back wall
pit = box((W - 1.4, 0.04, 3.0), (0, D / 2 - 0.32, 2.6), wall, name="pit_wall")
pit.name = pit.data.name = "pit_wall"
planar_uv(pit, "Y")

finish("garage", 2500, size_range=((11.8, 9, 4.8), (13, 10.6, 5.2)),
       require_nodes=("pit_wall",), require_materials=("wall", "concrete"))
