"""Build every Drift Folio prop: runs each tools/blender/props/*.py through headless Blender.

Usage (from repo root):
  python tools/blender/build_all.py                  # all props
  python tools/blender/build_all.py torii lamp       # only these
  python tools/blender/build_all.py --jobs 4 --no-preview
  python tools/blender/build_all.py garage --angles 0,330 --elevation 8   # extra preview views

Blender is found via $BLENDER, else the portable install under %LOCALAPPDATA%\\Programs,
else `blender` on PATH. Exits non-zero if any asset check fails.
"""
import glob
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROPS = os.path.join(ROOT, "tools", "blender", "props")


def find_blender():
    if os.environ.get("BLENDER"):
        return os.environ["BLENDER"]
    local = os.environ.get("LOCALAPPDATA", "")
    for p in sorted(glob.glob(os.path.join(local, "Programs", "blender-*", "blender.exe")), reverse=True):
        return p
    found = shutil.which("blender")
    if found:
        return found
    sys.exit("Blender not found: set BLENDER=/path/to/blender")


def run(blender, script, preview, extra=()):
    cmd = [blender, "-b", "--factory-startup", "-P", script, "--",
           "--out", os.path.join(ROOT, "public", "models"),
           "--preview", os.path.join(ROOT, "tools", "blender", "out")]
    if not preview:
        cmd += ["--no-preview", "1"]
    cmd += list(extra)
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, errors="replace")
    lines = [ln for ln in p.stdout.splitlines() if ln.startswith(("[check]", "[export]"))]
    ok = p.returncode == 0 and "asset check failed" not in p.stdout + p.stderr and "Traceback" not in p.stdout + p.stderr
    tail = "" if ok else "\n".join((p.stdout + p.stderr).splitlines()[-25:])
    return os.path.basename(script), ok, lines, tail


def main():
    argv = sys.argv[1:]
    jobs, preview, names, extra = 4, True, [], []
    i = 0
    while i < len(argv):
        if argv[i] == "--jobs":
            jobs = int(argv[i + 1])
            i += 2
            continue
        if argv[i] in ("--angles", "--elevation"):  # preview camera overrides, passed through
            extra += argv[i:i + 2]
            i += 2
            continue
        if argv[i] == "--no-preview":
            preview = False
        else:
            names.append(argv[i])
        i += 1
    scripts = sorted(glob.glob(os.path.join(PROPS, "*.py")))
    if names:
        scripts = [s for s in scripts if os.path.splitext(os.path.basename(s))[0] in names]
    blender = find_blender()
    failed = []
    with ThreadPoolExecutor(max_workers=jobs) as ex:
        for name, ok, lines, tail in ex.map(lambda s: run(blender, s, preview, extra), scripts):
            print(("OK   " if ok else "FAIL ") + name)
            for ln in lines:
                print("     " + ln)
            if not ok:
                print(tail)
                failed.append(name)
    print(f"{len(scripts) - len(failed)}/{len(scripts)} props built")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
