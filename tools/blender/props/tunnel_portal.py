"""Concrete tunnel portal for a 9 m wide, 6 m tall arched bore; 12 m wide face, front at y = 0
facing -Y, tunnel running into +Y. The dark inner lining is a separate mesh `tunnel_inner`
(material tunnel_dark, 20 m long). The face is built as two mirrored concave prisms around the
arch so no boolean is needed.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, finish, join, mat, poly_prism  # noqa: E402

clear()
conc, stone, ink, dark = mat("concrete"), mat("stone"), mat("ink"), mat("tunnel_dark")
HW, WALL, FW, FH, T = 4.5, 1.5, 6.0, 8.0, 1.0  # arch half width, wall height, face half width/height, depth
N = 9  # arc segments per quarter


def arc(r, quarter_from, quarter_to):
    pts = []
    for k in range(N + 1):
        a = math.radians(quarter_from + (quarter_to - quarter_from) * k / N)
        pts.append((r * math.cos(a), WALL + r * math.sin(a)))
    return pts


p = []
left = [(-FW, 0.0), (-FW, FH), (0.0, FH)] + arc(HW, 90, 180) + [(-HW, 0.0)]
right = [(x * -1, z) for (x, z) in left]
p.append(poly_prism(left, T, loc=(0, T / 2, 0), m=conc))
p.append(poly_prism(right, T, loc=(0, T / 2, 0), m=conc))
# raised arch ring (voussoir band) on the face
ring = arc(HW + 0.55, 0, 180) + list(reversed(arc(HW, 0, 180)))
p.append(poly_prism(ring, 0.2, loc=(0, -0.1, 0), m=stone))
for s in (-1, 1):  # ring feet and side pilasters
    p.append(box((0.55, 0.2, WALL), (s * (HW + 0.275), -0.1, WALL / 2), stone))
    p.append(box((0.7, 0.4, FH), (s * (FW - 0.35), -0.2, FH / 2), conc))
p.append(box((12.4, 1.6, 0.4), (0, 0.4, FH + 0.2), stone))           # coping
p.append(box((2.6, 0.1, 0.75), (0, -0.05, FH - 0.75), ink))         # name plaque (blank)
p.append(box((12.0, 0.1, 0.12), (0, -0.05, FH - 0.2), ink))         # drip line
join(p, "tunnel_portal")

# inner lining: arch band 0.3 thick, 20 m deep, separate mesh
band = [(-HW, 0.0)] + arc(HW, 180, 0) + [(HW, 0.0), (HW + 0.3, 0.0)] + arc(HW + 0.3, 0, 180) + [(-HW - 0.3, 0.0)]
inner = poly_prism(band, 20.0, loc=(0, 0.3 + 10.0, 0), m=dark, name="tunnel_inner")
inner.name = inner.data.name = "tunnel_inner"

finish("tunnel_portal", 1500, size_range=((12, 20, 8), (12.6, 21, 8.6)),
       require_nodes=("tunnel_inner",), require_materials=("tunnel_dark", "concrete"))
