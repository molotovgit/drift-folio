"""Wooden utility pole, 10 m, with a crossarm, braces, three porcelain insulators and a small
transformer can. Wires run along +-Y; empties wire_l / wire_c / wire_r mark the attachment points.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, cyl, empty, finish, join, lathe, mat, rod  # noqa: E402

clear()
wood, white, dark = mat("wood"), mat("white"), mat("metal_dark")
parts = [rod((0, 0, 0), (0, 0, 9.75), 0.16, 0.12, wood, verts=8)]
parts.append(cyl(0.125, 0.25, (0, 0, 9.75), wood, verts=8, r2=0.04))       # weathered cap

ARM_Z = 9.25
parts.append(box((2.5, 0.13, 0.13), (0, 0.15, ARM_Z), wood))                   # crossarm (front of pole)
for s in (-1, 1):
    parts.append(rod((0, 0.13, ARM_Z - 0.8), (s * 0.75, 0.15, ARM_Z - 0.07), 0.025, 0.025, dark, verts=4))

INS = {"wire_l": -1.1, "wire_c": 0.0, "wire_r": 1.1}
ins_prof = [(0.05, 0.0), (0.075, 0.05), (0.05, 0.08), (0.07, 0.13), (0.035, 0.2), (0.0, 0.22)]
for name, x in INS.items():
    z = ARM_Z + 0.065
    parts.append(lathe(ins_prof, segs=6, loc=(x, 0.15, z), m=white))
    empty(name, (x, 0.15, z + 0.2))

# pole-mounted transformer can + step bolts
parts.append(cyl(0.24, 0.65, (0, -0.42, 7.4), dark, verts=8))
parts.append(box((0.1, 0.22, 0.08), (0, -0.2, 7.95), dark))
for i in range(5):
    z = 2.6 + i * 0.45
    parts.append(box((0.6, 0.03, 0.03), (0, 0, z), dark, rot=(0, 0, 90 * (i % 2))))

join(parts, "power_pole")
finish("power_pole", 400, size_range=((2.3, 0.4, 9.8), (2.8, 1.2, 10.2)),
       require_nodes=tuple(INS), require_materials=("wood",))
