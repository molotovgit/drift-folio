"""Japanese railway crossing (fumikiri) post: striped pole, crossbuck, two red warning lights
(emissive `taillight`, front and back), gate mechanism and a striped boom.

`boom` is a separate mesh whose origin is the hinge (-0.42, 0, 1.15). It is modelled lowered,
pointing along -X (6 m). Raise it by rotating about Blender +Y (= glTF -Z) by up to 90 deg.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, cyl, finish, join, lathe, mat, set_origin  # noqa: E402

clear()
yellow, ink, light, dark = mat("hazard_yellow"), mat("ink"), mat("taillight"), mat("metal_dark")
p = []

# striped pole
H = 3.3
bands = 7
prof = [(0.075, H * i / bands) for i in range(bands + 1)]
p.append(lathe(prof, segs=6, m=[ink, yellow], seg_mat=[i % 2 for i in range(bands)]))
p.append(cyl(0.2, 0.15, (0, 0, 0), mat("concrete"), verts=8))
p.append(cyl(0.09, 0.06, (0, 0, H), ink, verts=8))

# crossbuck: two yellow boards crossed, each with a black centre stripe
for a in (32, -32):
    p.append(box((1.25, 0.04, 0.22), (0, -0.1, H - 0.2), yellow, rot=(0, a, 0)))
    p.append(box((1.1, 0.05, 0.07), (0, -0.11, H - 0.2), ink, rot=(0, a, 0)))

# warning lights on a cross bar, lenses both sides
LZ = 2.45
p.append(box((1.2, 0.08, 0.1), (0, 0, LZ), ink))
for x in (-0.48, 0.48):
    p.append(cyl(0.2, 0.06, (x, -0.04, LZ), ink, verts=8, rot=(90, 0, 0)))       # back plate (front side)
    p.append(cyl(0.13, 0.05, (x, -0.06, LZ), light, verts=8, rot=(90, 0, 0)))    # lens
    p.append(box((0.3, 0.2, 0.04), (x, -0.16, LZ + 0.15), ink, rot=(-15, 0, 0)))  # hood
    p.append(cyl(0.13, 0.05, (x, 0.11, LZ), light, verts=8, rot=(90, 0, 0)))     # rear lens
# direction indicator box + gate mechanism housing
p.append(box((0.42, 0.08, 0.2), (0, -0.08, LZ - 0.32), ink))
p.append(box((0.36, 0.36, 0.75), (-0.2, 0, 0.75), yellow, bevel=0.02))
p.append(box((0.38, 0.38, 0.06), (-0.2, 0, 1.15), ink))
join(p, "crossing_barrier")

# boom: separate mesh, origin at the hinge
HX, HZ = -0.42, 1.15
segs = []
for i in range(8):
    x0 = HX - 0.1 - i * 0.75
    segs.append(box((0.75, 0.09, 0.11), (x0 - 0.375, 0, HZ), yellow if i % 2 == 0 else ink))
segs.append(box((0.35, 0.16, 0.22), (HX + 0.05, 0, HZ), dark))           # hinge hub / counterweight
segs.append(box((0.05, 0.06, 0.3), (HX - 6.05, 0, HZ - 0.12), ink))       # tip drop
boom = join(segs, "boom")
boom.data.name = "boom"
set_origin(boom, (HX, 0, HZ))

finish("crossing_barrier", 600, size_range=((6.5, 0.2, 3.2), (7.2, 0.6, 3.6)),
       require_nodes=("boom",), require_materials=("taillight", "hazard_yellow"))
