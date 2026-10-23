"""Single car tyre lying flat: 0.64 m diameter, 0.23 m wide, open centre (no rim).
Closed lathe of a rounded tyre section; the tread ring is split in two with a slight groove."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import clear, finish, lathe, mat  # noqa: E402

clear()
R, W, BEAD = 0.32, 0.23, 0.205
prof = [
    (BEAD, 0.035), (0.25, 0.0), (0.3, 0.004), (R, 0.04),        # lower sidewall -> shoulder
    (R, 0.105), (R - 0.008, 0.115), (R, 0.125),                 # tread with centre groove
    (R, W - 0.04), (0.3, W - 0.004), (0.25, W), (BEAD, W - 0.035),
]
o = lathe(prof, segs=13, m=mat("tyre"), closed=True)
o.name = o.data.name = "tyre"
finish("tyre", 300, size_range=((0.62, 0.62, 0.22), (0.66, 0.66, 0.24)), require_materials=("tyre",))
