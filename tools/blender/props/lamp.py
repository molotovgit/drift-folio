"""Mountain-road street lamp: 7 m tapered steel pole, swan-neck arm reaching over the road
toward -X, cobra head with an emissive lamp_glow lens. Empty `light_anchor` sits at the bulb.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, cyl, empty, finish, join, mat, rod  # noqa: E402

clear()
steel, dark, glow, conc = mat("metal"), mat("metal_dark"), mat("lamp_glow"), mat("concrete")
parts = []

parts.append(cyl(0.3, 0.25, (0, 0, 0), conc, verts=8))          # concrete footing
parts.append(cyl(0.17, 0.35, (0, 0, 0.25), dark, verts=8))      # base collar
parts.append(rod((0, 0, 0.25), (0, 0, 6.2), 0.12, 0.075, steel, verts=8))

# swan neck: quarter arc of radius 0.75 from vertical to horizontal, then a long arm
R, cx, cz = 0.75, -0.75, 6.2
pts = []
for i in range(7):
    a = math.radians(90 * i / 6)
    pts.append((cx + R * math.cos(a), 0, cz + R * math.sin(a)))
for p0, p1 in zip(pts, pts[1:]):
    parts.append(rod(p0, p1, 0.075, 0.07, steel, verts=8, caps=False))
end = (-2.9, 0, 7.0)
parts.append(rod(pts[-1], end, 0.07, 0.06, steel, verts=8))
parts.append(rod((0, 0, 5.4), (-0.95, 0, 6.88), 0.035, 0.035, steel, verts=5))  # brace

# cobra head: tapered housing hanging off the arm end, lens underneath
parts.append(box((1.15, 0.46, 0.2), (-3.25, 0, 6.95), dark, rot=(0, -4, 0), bevel=0.04))
parts.append(box((0.85, 0.36, 0.14), (-3.3, 0, 7.08), steel, rot=(0, -4, 0), bevel=0.03))
parts.append(box((0.9, 0.36, 0.06), (-3.28, 0, 6.83), glow, rot=(0, -4, 0)))
# pole number plate + reflector band, typical of mountain-road lamps
parts.append(box((0.04, 0.2, 0.32), (0.12, 0, 2.3), mat("white")))
parts.append(cyl(0.128, 0.12, (0, 0, 1.2), mat("hazard_yellow"), verts=8))

lamp = join(parts, "lamp")
empty("light_anchor", (-3.28, 0, 6.76))
finish("lamp", 600, size_range=((3.0, 0.3, 6.9), (4.2, 0.8, 7.3)),
       require_nodes=("light_anchor",), require_materials=("lamp_glow",))
