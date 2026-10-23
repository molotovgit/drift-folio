"""Hanging chochin paper lantern, 0.6 m tall. Origin is the top hook (everything hangs below z=0).
Body is emissive `paper_lantern`; black lacquered caps, hook and tassel stub use `ink`."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from proplib import chochin, clear, finish, join, mat  # noqa: E402

clear()
o = join(chochin((0, 0, 0), h=0.6, segs=12), "paper_lantern")
finish("paper_lantern", 300, ground=False, size_range=((0.3, 0.3, 0.55), (0.42, 0.42, 0.65)),
       require_materials=("paper_lantern",))
