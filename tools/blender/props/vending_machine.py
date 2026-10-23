"""Japanese drink vending machine, 1.0 x 0.8 x 1.85 m, front facing -Y.
Exports vending_machine_blue and vending_machine_red (body material vending_blue / vending_red);
the drink window is the emissive `screen` material.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, finish, join, mat  # noqa: E402

FY = -0.4  # front plane


def build(body_name):
    body, ink, white, metal, screen = mat(body_name), mat("ink"), mat("white"), mat("metal"), mat("screen")
    other = "vending_red" if body_name == "vending_blue" else "vending_blue"
    can_mats = [mat("white"), mat("cone"), mat("sign_green"), mat(other), mat("foliage_amber"), mat("ink")]
    p = []
    p.append(box((0.96, 0.76, 0.06), (0, 0.01, 0.03), ink))                    # plinth
    p.append(box((1.0, 0.8, 1.79), (0, 0, 0.06 + 1.79 / 2), body, bevel=0.02))  # cabinet
    p.append(box((0.9, 0.03, 0.17), (0, FY - 0.005, 1.73), white))             # header sign strip
    p.append(box((0.88, 0.04, 0.74), (0, FY - 0.005, 1.25), ink))              # window frame
    p.append(box((0.82, 0.04, 0.68), (0, FY - 0.012, 1.25), screen))           # glowing window
    for row, z in enumerate((1.41, 1.12)):
        for i in range(6):
            x = -0.33 + i * 0.132
            p.append(box((0.08, 0.04, 0.17), (x, FY - 0.03, z), can_mats[(i + row * 2) % len(can_mats)]))
            p.append(box((0.07, 0.03, 0.03), (x, FY - 0.03, z - 0.13), ink))  # selection buttons
    p.append(box((0.88, 0.03, 0.5), (0, FY - 0.005, 0.62), white))             # lower panel
    p.append(box((0.22, 0.04, 0.3), (0.28, FY - 0.02, 0.66), metal))           # coin/bill unit
    p.append(box((0.08, 0.05, 0.1), (0.28, FY - 0.03, 0.72), ink))
    p.append(box((0.1, 0.05, 0.04), (0.28, FY - 0.03, 0.56), ink))
    p.append(box((0.58, 0.05, 0.2), (-0.1, FY - 0.02, 0.24), ink))             # dispense bay
    p.append(box((0.52, 0.05, 0.12), (-0.1, FY - 0.035, 0.26), metal))         # flap
    return join(p, "vending_machine")


for colour in ("blue", "red"):
    clear()
    o = build(f"vending_{colour}")
    name = f"vending_machine_{colour}"
    o.name = name
    finish(name, 500, size_range=((0.95, 0.8, 1.8), (1.05, 0.9, 1.9)),
           require_materials=(f"vending_{colour}", "screen"))
