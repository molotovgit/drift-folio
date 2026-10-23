"""Torii gate at the summit (myojin style). Spans an 8 m road: pillars 9 m apart, ~6.6 m tall.

The kasagi (top beam) is loop-cut along its length before bending it into an arc, so it really
curves; ends sweep up ~0.45 m. Pillars lean inward slightly (uchikorobi).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import Vector, box, bmesh, bpy, cyl, finish, join, mat, rod, set_origin  # noqa: E402

bpy.ops.wm.read_factory_settings(use_empty=True)
red, ink = mat("torii"), mat("ink")
parts = []

LEAN = 0.14  # inward offset of pillar tops
for s in (-1, 1):
    x = 4.5 * s
    parts.append(rod((x, 0, 0), (x - s * LEAN, 0, 5.95), 0.33, 0.29, red, verts=12))
    parts.append(cyl(0.43, 0.55, (x, 0, 0), ink, verts=12))           # kamaki base sleeve
    parts.append(cyl(0.36, 0.08, (x - s * LEAN * 0.78, 0, 4.62), ink, verts=12))  # metal band

# nuki: lower tie beam passing through both pillars, ends protrude
parts.append(box((10.6, 0.36, 0.42), (0, 0, 4.72), red))
for s in (-1, 1):  # kusabi wedges where the nuki pierces the pillars
    parts.append(box((0.16, 0.42, 0.3), (s * (4.5 - LEAN * 0.8 + 0.4), 0, 4.72), ink))

# gakuzuka strut with the name plaque
parts.append(box((0.28, 0.26, 0.82), (0, 0, 5.3), red))
parts.append(box((0.95, 0.08, 1.05), (0, -0.2, 5.28), ink))

# shimaki: lower top beam
parts.append(box((10.9, 0.56, 0.36), (0, 0, 5.92), red))

# kasagi: upper top beam, black, curved. Loop cuts along its length first, then bend it as a
# true arc (centre of curvature above the beam) so the ends sweep up ~0.45 m (sori).
KZ, RISE, HALF = 6.36, 0.45, 5.75
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(2 * HALF, 0.9, 0.5), verts=bm.verts)
long_edges = [e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > 1.0]
bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=14, use_grid_fill=True)
R = HALF * HALF / (2 * RISE)
for v in bm.verts:
    x, z = v.co.x, v.co.z
    th = x / R
    v.co.x = math.sin(th) * (R - z)
    v.co.z = R - (R - z) * math.cos(th) + KZ
    if abs(x) > HALF - 0.01:  # angled end cuts, wider at the top
        v.co.x += math.copysign(0.18, x) * (z / 0.25)
me = bpy.data.meshes.new("kasagi")
bm.to_mesh(me)
bm.free()
kasagi = bpy.data.objects.new("kasagi", me)
bpy.context.scene.collection.objects.link(kasagi)
kasagi.data.materials.append(ink)
parts.append(kasagi)

torii = join(parts, "torii")
for p in torii.data.polygons:
    p.use_smooth = False
set_origin(torii, (0, 0, 0))
finish("torii", 1500, size_range=((9, 0.5, 6), (14, 1.5, 7.5)), require_materials=("torii", "ink"))
