"""Easter egg: a small aluminium desktop box in the spirit of a Mac mini, scaled x6
(0.2 x 0.2 x 0.05 m -> 1.2 x 1.2 x 0.3 m). Rounded-square body on a dark inset foot, a status
LED and two ports on the front (-Y), a row of ports on the back. No logos or branding."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, cyl, finish, join, mat, sweep  # noqa: E402

clear()
alu, ink, led = mat("aluminium"), mat("ink"), mat("headlight")
S, R, Z0, Z1 = 0.6, 0.17, 0.035, 0.3  # half size, corner radius, body bottom/top
outline = []
for cx, cy, a0 in ((S - R, S - R, 0), (-S + R, S - R, 90), (-S + R, -S + R, 180), (S - R, -S + R, 270)):
    for k in range(4):
        a = math.radians(a0 + 90 * k / 3)
        outline.append((cx + R * math.cos(a), cy + R * math.sin(a)))
p = [sweep(outline, Z1 - Z0, loc=(0, 0, (Z0 + Z1) / 2), m=alu, axis="Z")]
p.append(cyl(0.5, Z0 + 0.005, (0, 0, 0), ink, verts=12))
# front: status LED + two ports + jack
p.append(box((0.03, 0.02, 0.03), (0.42, -S, 0.13), led))
for x in (-0.42, -0.32):
    p.append(box((0.06, 0.02, 0.022), (x, -S + 0.006, 0.13), ink))
# back: power, network, ports
for x, w in ((-0.4, 0.09), (-0.2, 0.1), (0.0, 0.06), (0.12, 0.06), (0.24, 0.06)):
    p.append(box((w, 0.02, 0.05 if w > 0.08 else 0.025), (x, S - 0.006, 0.14), ink))
join(p, "mac_mini")
finish("mac_mini", 200, size_range=((1.18, 1.18, 0.29), (1.22, 1.22, 0.31)), require_materials=("aluminium",))
