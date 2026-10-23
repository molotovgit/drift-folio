"""Road junction signpost: steel pole with three arrow boards sign_0, sign_1, sign_2.

Each board is a separate mesh (material sign_green) with UVs 0..1 projected on its -Y face
(u = +X, v = +Z, so text reads correctly from the front). Boards are modelled directly in their
pointing direction rather than rotated, so the front never mirrors. Origins sit on the pole axis
at board height.
  sign_0: points -X (left)   sign_1: points +X (right)   sign_2: points back-left (-X, turned 35 deg)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, cyl, finish, join, mat, planar_uv, poly_prism, set_origin  # noqa: E402

clear()
metal, dark, green = mat("metal"), mat("metal_dark"), mat("sign_green")
p = [cyl(0.055, 3.35, (0, 0, 0), metal, verts=8), cyl(0.07, 0.06, (0, 0, 3.35), dark, verts=8),
     cyl(0.16, 0.1, (0, 0, 0), mat("concrete"), verts=8)]

L, HH, TIP = 1.35, 0.17, 0.26  # length, half height, arrow-tip length
SIGNS = [("sign_0", -1, 3.05, 0), ("sign_1", 1, 2.66, 0), ("sign_2", -1, 2.27, -35)]
boards = []
for name, d, z, yaw in SIGNS:
    x0 = 0.07 * d
    pts = [(x0, z - HH), (x0 + d * (L - TIP), z - HH), (x0 + d * L, z), (x0 + d * (L - TIP), z + HH), (x0, z + HH)]
    if d < 0:
        pts.reverse()
    b = poly_prism(pts, 0.04, loc=(0, -0.08, 0), m=green, name=name)
    planar_uv(b, "Y")
    if yaw:
        import math
        from mathutils import Matrix
        b.data.transform(Matrix.Rotation(math.radians(yaw), 4, "Z"))
    b.name = b.data.name = name
    set_origin(b, (0, 0, z))
    boards.append(b)
    p.append(box((0.16, 0.12, 0.06), (0, -0.04, z + HH - 0.06), dark))   # clamp brackets
    p.append(box((0.16, 0.12, 0.06), (0, -0.04, z - HH + 0.06), dark))
join(p, "signpost")
finish("signpost", 400, size_range=((2.2, 0.3, 3.3), (3.2, 1.4, 3.6)),
       require_nodes=tuple(s[0] for s in SIGNS), require_materials=("sign_green",))
