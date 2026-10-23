"""Small Japanese mountain-village houses, ~7 x 6 x 5 m, front facing -Y. Exports house_0, house_1.

house_0: single storey + loft, curved tiled gable roof, engawa veranda with glass sliding doors.
house_1: two storeys, hipped roof, pent roof over the ground floor, balcony rail, lean-to shed.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import (box, clear, cyl, finish, gable_profile, hull, join, mat, rod,  # noqa: E402
                     sweep)


def window(p, x, y, z, w, h, face=-1, side=False):
    """Framed window on a wall plane; face=-1 front (-Y) / +1 back; side=True for X walls."""
    glass, wood = mat("glass"), mat("wood")
    if side:
        p.append(box((0.05, w, h), (x + face * 0.02, y, z), glass))
        p.append(box((0.08, w + 0.14, 0.08), (x + face * 0.03, y, z - h / 2 - 0.04), wood))
        p.append(box((0.08, 0.05, h), (x + face * 0.04, y, z), wood))
    else:
        p.append(box((w, 0.05, h), (x, y + face * 0.02, z), glass))
        p.append(box((w + 0.14, 0.08, 0.08), (x, y + face * 0.03, z - h / 2 - 0.04), wood))
        p.append(box((0.05, 0.08, h), (x, y + face * 0.04, z), wood))


def house_0():
    warm, wood, light, roof = mat("wall_warm"), mat("wood"), mat("wood_light"), mat("roof")
    conc, glass, metal, stone = mat("concrete"), mat("glass"), mat("metal"), mat("stone")
    p = []
    X, Y0, Y1, WZ = 3.0, -2.1, 2.1, 3.1
    zc, hz = (0.4 + WZ) / 2, WZ - 0.4
    p.append(box((2 * X + 0.1, Y1 - Y0 + 0.1, 0.4), (0, 0, 0.2), conc))
    for y in (Y0, Y1):
        p.append(box((2 * X, 0.15, hz), (0, y, zc), warm))
        p.append(box((2 * X + 0.02, 0.17, 1.0), (0, y, 0.9), wood))
    for x in (-X, X):
        p.append(box((0.15, Y1 - Y0, hz), (x, 0, zc), warm))
        p.append(box((0.17, Y1 - Y0, 1.0), (x, 0, 0.9), wood))
    for x in (-X, -0.9, 0.9, X):  # frame posts
        for y in (Y0, Y1):
            p.append(box((0.18, 0.18, WZ - 0.4), (x, y, zc), wood))
    for y in (Y0, Y1):
        p.append(box((2 * X + 0.25, 0.2, 0.18), (0, y, WZ), wood))
    # front: glass sliding doors behind an engawa veranda
    p.append(box((3.4, 0.06, 2.0), (-0.6, Y0 - 0.06, 1.45), glass))
    for x in (-2.3, -1.45, -0.6, 0.25, 1.1):
        p.append(box((0.06, 0.1, 2.0), (x, Y0 - 0.1, 1.45), light))
    p.append(box((3.4, 0.1, 0.08), (-0.6, Y0 - 0.1, 2.45), light))
    p.append(box((4.6, 0.95, 0.08), (-0.4, Y0 - 0.55, 0.5), light))                 # engawa deck
    for x in (-2.6, -0.4, 1.8):
        p.append(box((0.08, 0.08, 0.46), (x, Y0 - 0.95, 0.23), wood))
    p.append(box((0.9, 0.45, 0.22), (-0.6, Y0 - 1.3, 0.11), stone))                  # step stone
    window(p, 2.1, Y0 - 0.08, 1.75, 1.0, 0.9)
    window(p, -X - 0.08, 0.6, 1.75, 1.2, 0.9, side=True)
    window(p, X + 0.08, -0.5, 1.75, 1.0, 0.9, face=1, side=True)
    window(p, -1.2, Y1 + 0.08, 1.75, 1.6, 0.9, face=1)
    # roof: curved tiled gable, ridge along X, gable infill with a small loft vent
    RZ, HALF, DROP = 5.0, 2.95, 1.95
    p.append(sweep(gable_profile(HALF, RZ, DROP, 0.16, sag=0.78, flick=0.1, rows=6), 2 * X + 0.95,
                   m=roof, axis="X"))
    p.append(box((2 * X + 1.05, 0.3, 0.2), (0, 0, RZ + 0.05), mat("ink")))
    gable = [(Y0, WZ - 0.1)]
    for i in range(11):
        y = Y0 + (Y1 - Y0) * i / 10
        gable.append((y, max(WZ, RZ - DROP * (abs(y) / HALF) ** 0.78 - 0.17)))
    gable.append((Y1, WZ - 0.1))
    for x in (-X, X):
        p.append(sweep(gable, 0.12, loc=(x, 0, 0), m=warm, axis="X"))
        p.append(box((0.14, 0.5, 0.5), (x * 1.03, 0, WZ + 0.75), mat("ink")))      # loft vent
    # life: AC unit, propane bottles, drainpipe
    p.append(box((0.8, 0.3, 0.55), (X + 0.25, 1.2, 0.68), metal, rot=(0, 0, 90)))
    for y in (-1.5, -1.05):
        p.append(cyl(0.18, 1.1, (X + 0.3, y, 0.0), metal, verts=8))
        p.append(cyl(0.1, 0.12, (X + 0.3, y, 1.1), mat("metal_dark"), verts=6))
    p.append(rod((-X - 0.1, Y0 - 0.2, 0.0), (-X - 0.1, Y0 - 0.2, WZ - 0.1), 0.05, 0.05, mat("metal_dark"), verts=5))
    return p


def house_1():
    warm, wall, wood, light, roof = mat("wall_warm"), mat("wall"), mat("wood"), mat("wood_light"), mat("roof")
    conc, glass, metal, dark = mat("concrete"), mat("glass"), mat("metal"), mat("metal_dark")
    p = []
    X, Y0, Y1 = 2.6, -2.0, 2.0
    G, U = 2.4, 4.0  # ground floor top, upper wall top
    p.append(box((2 * X + 0.1, Y1 - Y0 + 0.1, 0.35), (0, 0, 0.175), conc))
    p.append(box((2 * X, Y1 - Y0, G - 0.35), (0, 0, (G + 0.35) / 2), wood))          # board-clad ground floor
    p.append(box((2 * X - 0.1, Y1 - Y0 - 0.1, U - G), (0, 0, (G + U) / 2), wall))   # plaster upper floor
    for x in (-X, X):
        for y in (Y0, Y1):
            p.append(box((0.16, 0.16, U - 0.35), (x, y, (U + 0.35) / 2), mat("ink")))
    for y in (Y0, Y1):
        p.append(box((2 * X + 0.2, 0.18, 0.16), (0, y, G), mat("ink")))
    # pent roof (hisashi) wrapping the front at the floor line
    p.append(sweep([(-0.85, G - 0.05), (-0.85, G + 0.05), (0.05, G + 0.42), (0.05, G + 0.3)], 2 * X + 0.6,
                   loc=(0, Y0, 0), m=roof, axis="X"))
    # entrance: sliding door with glass panes, lamp above
    p.append(box((1.3, 0.08, 2.0), (-1.2, Y0 - 0.04, 1.35), light))
    for x in (-1.5, -0.9):
        p.append(box((0.42, 0.09, 1.2), (x, Y0 - 0.05, 1.55), glass))
    p.append(box((1.6, 0.4, 0.06), (-1.2, Y0 - 0.25, 0.38), mat("stone")))
    p.append(box((0.16, 0.16, 0.2), (-0.35, Y0 - 0.1, 2.0), mat("lamp_glow")))
    window(p, 1.2, Y0 - 0.05, 1.5, 1.5, 0.9)
    window(p, -1.1, Y0 - 0.0, 3.2, 1.4, 0.8)
    window(p, 1.3, Y0 - 0.0, 3.2, 1.0, 0.8)
    window(p, X + 0.05, 0.4, 3.2, 1.2, 0.8, face=1, side=True)
    window(p, -X - 0.05, -0.6, 1.5, 1.0, 0.8, side=True)
    # balcony rail on the upper floor
    p.append(box((2.4, 0.06, 0.06), (-0.2, Y0 - 0.55, G + 1.25), metal))
    for x in (-1.3, -0.2, 0.9):
        p.append(box((0.05, 0.05, 0.85), (x, Y0 - 0.55, G + 0.85), metal))
    p.append(box((2.4, 0.6, 0.08), (-0.2, Y0 - 0.3, G + 0.44), metal))
    # hipped roof (convex hull of eave rectangle + ridge)
    EX, EY, RZ = X + 0.75, 2.75, 5.0
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            pts += [(sx * EX, sy * EY, U - 0.05), (sx * EX, sy * EY, U + 0.12)]
        pts.append((sx * 1.3, 0, RZ))
    p.append(hull(pts, roof))
    p.append(rod((-1.4, 0, RZ), (1.4, 0, RZ), 0.12, 0.12, mat("ink"), verts=6))
    # lean-to shed on the +X side with a sloping metal roof
    p.append(box((0.9, 2.6, 2.0), (X + 0.45, 0.4, 1.0), light))
    p.append(box((1.15, 3.0, 0.06), (X + 0.55, 0.4, 2.1), dark, rot=(0, 12, 0)))
    p.append(box((0.04, 0.8, 1.6), (X + 0.92, -0.2, 0.85), wood))
    # bicycle-ish clutter: drum + crate
    p.append(cyl(0.25, 0.7, (-X - 0.45, 1.0, 0), mat("vending_blue"), verts=8))
    p.append(box((0.5, 0.4, 0.35), (-X - 0.45, 0.2, 0.175), light))
    return p


for idx, builder in enumerate((house_0, house_1)):
    clear()
    o = join(builder(), "house")
    name = f"house_{idx}"
    o.name = name
    finish(name, 1500, size_range=((6, 5, 4.6), (8, 7, 5.4)), require_materials=("roof",))
