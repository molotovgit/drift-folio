"""S1 jump ramp (kicker): 6 m long x 4 m wide, curved concrete surface rising to 1.4 m.

Cars drive along -Y (the game's +Z forward): the thin entry edge is at y = +3, the lip at y = -3.
Hazard stripes run across the lip and down the vertical back face.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, finish, join, mat, sweep  # noqa: E402

clear()
conc, yellow, ink = mat("concrete"), mat("hazard_yellow"), mat("ink")
L, W, H = 6.0, 4.0, 1.4
N = 8
curve = []
for i in range(N + 1):
    t = i / N
    curve.append((L / 2 - L * t, H * t ** 1.6))
prof = curve + [(-L / 2, 0.0)]
p = [sweep(prof, W, m=conc, axis="X")]
# side kerbs so the silhouette reads as a built structure
for s in (-1, 1):
    p.append(box((0.12, 0.5, H), (s * (W / 2 - 0.06), -L / 2 + 0.25, H / 2), conc))

slope = 20.5  # degrees at the lip (atan(H * 1.6 / L))
for i in range(8):
    x = -W / 2 + 0.25 + i * 0.5
    m = yellow if i % 2 == 0 else ink
    p.append(box((0.5, 0.42, 0.03), (x, -L / 2 + 0.2, H - 0.07), m, rot=(-slope, 0, 0)))   # lip band
    p.append(box((0.5, 0.03, H - 0.1), (x, -L / 2 - 0.015, (H - 0.1) / 2), m))             # back face
join(p, "ramp")
finish("ramp", 300, size_range=((3.9, 5.9, 1.35), (4.2, 6.2, 1.5)), require_materials=("concrete", "hazard_yellow"))
