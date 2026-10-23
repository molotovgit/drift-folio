"""Breakable wooden roadside fence segment: 3 m long (along X), 1.1 m tall, rails on the -Y face.

Every piece is its own mesh node so the game can fling them individually when hit:
post_0..post_2 (wood, pointed tops) and rail_0..rail_2 (wood_light; rail_2 is a diagonal brace).
Each piece's origin is its own centre.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, finish, hull, mat, set_origin  # noqa: E402

clear()
wood, light = mat("wood"), mat("wood_light")
pieces = []
for i, x in enumerate((-1.44, 0.0, 1.44)):
    s, top = 0.06, 1.1
    pts = []
    for dx in (-s, s):
        for dy in (-s, s):
            pts += [(x + dx, dy, 0.0), (x + dx, dy, top - 0.1)]
    pts += [(x, -s, top), (x, s, top)]  # wedge-pointed top
    o = hull(pts, wood, name=f"post_{i}")
    pieces.append((o, f"post_{i}", (x, 0, top / 2)))
for i, z in enumerate((0.92, 0.5)):
    o = box((3.0, 0.04, 0.14), (0, -0.08, z), light, name=f"rail_{i}")
    pieces.append((o, f"rail_{i}", (0, -0.08, z)))
o = box((1.5, 0.035, 0.11), (-0.72, -0.075, 0.71), light, rot=(0, -16, 0), name="rail_2")
pieces.append((o, "rail_2", (-0.72, -0.075, 0.71)))
for o, name, c in pieces:
    o.name = o.data.name = name
    set_origin(o, c)

finish("fence_segment", 300, size_range=((2.9, 0.1, 1.05), (3.1, 0.25, 1.15)),
       require_nodes=("post_0", "rail_0"), require_materials=("wood", "wood_light"))
