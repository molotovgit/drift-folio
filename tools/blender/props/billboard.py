"""Roadside billboard on two posts, 4.5 m tall. Front faces -Y.

The 4 x 2.4 m face is a separate mesh `panel` (material white, UVs filling 0..1 with u = +X,
v = +Z on the -Y face) so the game can put a texture / canvas on it.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, cyl, finish, join, mat, planar_uv, rod  # noqa: E402

clear()
dark, metal, glow = mat("metal_dark"), mat("metal"), mat("lamp_glow")
PZ0, PZ1 = 1.98, 4.38  # panel bottom/top
p = []
for x in (-1.3, 1.3):
    p.append(cyl(0.11, PZ1 + 0.06, (x, 0.12, 0), dark, verts=8))
    p.append(cyl(0.22, 0.12, (x, 0.12, 0), mat("concrete"), verts=8))
p.append(box((4.24, 0.1, 2.64), (0, 0.04, (PZ0 + PZ1) / 2), dark))                # backing frame
p.append(box((4.3, 0.12, 0.08), (0, 0.0, PZ1 + 0.08), dark))                      # top cap (4.5 m)
p.append(box((4.2, 0.5, 0.05), (0, -0.25, PZ0 - 0.1), metal))                      # catwalk
for x in (-1.4, 1.4):  # two flood lamps on arms
    p.append(rod((x, 0.0, PZ0 - 0.06), (x, -0.62, PZ0 - 0.25), 0.025, 0.025, dark, verts=4))
    p.append(box((0.26, 0.16, 0.1), (x, -0.68, PZ0 - 0.28), dark, rot=(-25, 0, 0)))
    p.append(box((0.22, 0.03, 0.08), (x, -0.72, PZ0 - 0.24), glow, rot=(-25 + 90, 0, 0)))
join(p, "billboard")

panel = box((4.0, 0.04, 2.4), (0, -0.03, (PZ0 + PZ1) / 2), mat("white"), name="panel")
panel.name = panel.data.name = "panel"
planar_uv(panel, "Y")

finish("billboard", 400, size_range=((4.0, 0.4, 4.4), (4.6, 1.2, 4.6)),
       require_nodes=("panel",), require_materials=("white",))
