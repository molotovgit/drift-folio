"""Traffic cone, 0.7 m: square base plate + 12-sided body with two white reflective bands."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, finish, join, lathe, mat  # noqa: E402

clear()
orange, white = mat("cone"), mat("white")
base = box((0.4, 0.4, 0.04), (0, 0, 0.02), orange, bevel=0.012)
H, R0, R1 = 0.7, 0.15, 0.035


def r_at(z):
    return R0 + (R1 - R0) * (z - 0.04) / (H - 0.04)


zs = [0.04, 0.24, 0.33, 0.43, 0.5, H - 0.02, H]
prof = [(r_at(z), z) for z in zs[:-1]] + [(0.0, H)]
body = lathe(prof, segs=12, m=[orange, white], seg_mat=[0, 1, 0, 1, 0, 0])
join([base, body], "cone")
finish("cone", 200, size_range=((0.38, 0.38, 0.68), (0.42, 0.42, 0.72)), require_materials=("cone", "white"))
