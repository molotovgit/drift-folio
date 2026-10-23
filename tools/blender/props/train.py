"""Japanese freight train on 1.067 m (cape) gauge, front facing -Y. Exports train_loco and train_wagon.

train_loco  ~14 m centre-cab diesel (DD51-like): two long hoods, raised cab, 3 bogies / 6 axles.
train_wagon ~16 m container flat car (Koki-like) carrying four 12 ft containers.
Wheel bottoms sit at z = 0 (rail top); wheels are centred on the 1.067 m gauge.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import box, clear, cyl, finish, join, mat, rod  # noqa: E402

GAUGE = 1.067
WX = GAUGE / 2 + 0.035  # wheel tread centre sits on the rail head


def bogie(p, yc, axles=(-0.8, 0.8), r=0.43):
    dark, ink = mat("metal_dark"), mat("ink")
    for ay in axles:
        for s in (-1, 1):
            p.append(cyl(r, 0.12, (s * WX - 0.06, yc + ay, r), ink, verts=10, rot=(0, 90, 0)))
        p.append(rod((-WX, yc + ay, r), (WX, yc + ay, r), 0.07, 0.07, dark, verts=5, caps=False))
    span = axles[-1] - axles[0] + 2 * r + 0.3
    for s in (-1, 1):
        p.append(box((0.14, span, 0.36), (s * (WX + 0.13), yc, r + 0.12), dark))
        p.append(box((0.2, 0.5, 0.3), (s * (WX + 0.15), yc, r + 0.42), ink))         # spring pack
    p.append(box((2.0, 0.5, 0.25), (0, yc, r + 0.5), dark))                           # bolster


def loco():
    red, white, ink, dark = mat("loco_red"), mat("white"), mat("ink"), mat("metal_dark")
    glass, metal, head, tail = mat("glass"), mat("metal"), mat("headlight"), mat("taillight")
    p = []
    for yc in (-4.4, 4.4):
        bogie(p, yc)
    bogie(p, 0.0, axles=(-0.7, 0.7))
    UZ0, UZ1 = 0.98, 1.38  # underframe
    p.append(box((2.8, 13.7, UZ1 - UZ0), (0, 0, (UZ0 + UZ1) / 2), ink))
    p.append(box((2.84, 13.7, 0.1), (0, 0, UZ1 - 0.03), white))                       # running-board edge stripe
    p.append(box((2.1, 2.6, 0.65), (0, 0, 0.72), dark))                               # fuel tank
    # long hoods
    for s in (-1, 1):
        yc = s * 4.3
        p.append(box((2.3, 4.6, 1.75), (0, yc, UZ1 + 0.875), red, bevel=0.07))
        p.append(box((2.32, 4.62, 0.12), (0, yc, UZ1 + 0.25), white))                 # hood band
        for k in range(3):
            p.append(box((0.04, 0.9, 0.7), (1.16, yc - 1.2 + k * 1.2, UZ1 + 1.0), ink))   # louvres
            p.append(box((0.04, 0.9, 0.7), (-1.16, yc - 1.2 + k * 1.2, UZ1 + 1.0), ink))
        p.append(cyl(0.5, 0.08, (0, yc + s * 0.9, UZ1 + 1.75), ink, verts=10))         # radiator fan
        p.append(box((1.2, 0.8, 0.12), (0, yc - s * 0.9, UZ1 + 1.8), dark))           # roof hatch
        ny = s * 6.6  # nose details
        for x in (-0.55, 0.55):
            p.append(box((0.3, 0.06, 0.22), (x, ny + s * 0.02, UZ1 + 1.45), head if s < 0 else tail))
        p.append(box((0.9, 0.06, 0.35), (0, ny + s * 0.02, UZ1 + 1.0), ink))           # number plate
        # end platform: buffer beam, coupler, steps, handrail
        p.append(box((2.8, 0.25, 0.5), (0, s * 6.85, UZ0 + 0.05), red))
        p.append(box((0.35, 0.4, 0.3), (0, s * 7.0, UZ0 - 0.05), ink))                # coupler
        for x in (-1.1, 1.1):
            p.append(box((0.4, 0.2, 0.06), (x, s * 6.85, 0.6), ink))                   # step
            p.append(rod((x, s * 6.9, UZ1), (x, s * 6.9, UZ1 + 1.0), 0.025, 0.025, white, verts=4, caps=False))
        p.append(rod((-1.1, s * 6.9, UZ1 + 1.0), (1.1, s * 6.9, UZ1 + 1.0), 0.025, 0.025, white, verts=4, caps=False))
        for x in (-1.32, 1.32):  # side handrails along the hoods
            p.append(rod((x, s * 2.0, UZ1 + 0.9), (x, s * 6.6, UZ1 + 0.9), 0.025, 0.025, white, verts=4, caps=False))
    # centre cab
    CZ1 = UZ1 + 2.55
    p.append(box((2.8, 2.6, CZ1 - UZ1), (0, 0, (UZ1 + CZ1) / 2), red, bevel=0.06))
    p.append(box((2.95, 2.75, 0.14), (0, 0, CZ1 + 0.05), metal, bevel=0.03))
    p.append(box((2.82, 2.62, 0.12), (0, 0, UZ1 + 0.25), white))
    for s in (-1, 1):
        for x in (-0.65, 0.65):
            p.append(box((0.95, 0.06, 0.75), (x, s * 1.3, CZ1 - 0.6), glass))           # front/rear windows
        p.append(box((0.06, 1.6, 0.7), (s * 1.4, 0.2, CZ1 - 0.62), glass))              # side windows
        p.append(box((0.06, 0.7, 1.7), (s * 1.4, -0.85, UZ1 + 1.15), dark))             # cab doors
    p.append(box((0.5, 0.2, 0.25), (0, 0, CZ1 + 0.25), dark))                         # horn / beacon box
    return p


def wagon():
    dark, ink, white = mat("metal_dark"), mat("ink"), mat("white")
    p = []
    for yc in (-6.0, 6.0):
        bogie(p, yc, axles=(-0.95, 0.95))
    p.append(box((2.6, 15.8, 0.24), (0, 0, 1.02), dark))                              # deck
    p.append(box((0.7, 15.4, 0.4), (0, 0, 0.76), ink))                                # centre sill
    for s in (-1, 1):
        p.append(box((0.14, 15.8, 0.42), (s * 1.24, 0, 0.88), dark))                  # side sills
        p.append(box((2.6, 0.3, 0.45), (0, s * 7.85, 0.9), ink))                       # end beams
        p.append(box((0.3, 0.35, 0.28), (0, s * 8.05, 0.85), ink))                     # couplers
        p.append(cyl(0.22, 0.04, (0.9, s * 7.95, 1.25), white, verts=8, rot=(90, 0, 0)))  # handbrake wheel
    cols = ["container_rust", "container_teal", "container_teal", "container_rust"]
    CL, CW, CH, Z0 = 3.66, 2.45, 2.5, 1.14
    for i, cname in enumerate(cols):
        yc = -5.6 + i * 3.73
        c = mat(cname)
        p.append(box((CW, CL, CH), (0, yc, Z0 + CH / 2), c, bevel=0.03))
        for s in (-1, 1):
            for k in range(4):  # side ribs (corrugation read)
                p.append(box((0.05, 0.12, CH - 0.2), (s * (CW / 2 + 0.01), yc - 1.2 + k * 0.8, Z0 + CH / 2), c))
            p.append(box((0.04, 1.1, 0.35), (s * (CW / 2 + 0.02), yc + 0.9, Z0 + CH - 0.45), white))  # blank placard plate
        p.append(box((CW + 0.04, 0.08, 0.1), (0, yc - CL / 2, Z0 + CH - 0.08), ink))
        p.append(box((CW + 0.04, 0.08, 0.1), (0, yc + CL / 2, Z0 + CH - 0.08), ink))
    return p


for name, builder, budget, size in (
        ("train_loco", loco, 3000, ((2.7, 13.5, 3.8), (3.1, 14.6, 4.3))),
        ("train_wagon", wagon, 1500, ((2.5, 15.5, 3.5), (2.9, 16.6, 3.8)))):
    clear()
    o = join(builder(), name)
    o.name = name
    finish(name, budget, size_range=size)
