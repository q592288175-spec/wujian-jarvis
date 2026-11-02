"""Create a relocatable share archive without following external symlinks."""
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

source, destination = map(lambda p: Path(p).resolve(), sys.argv[1:3])
if destination.exists():
    raise SystemExit("Destination already exists")
with ZipFile(destination, "x", compression=ZIP_DEFLATED, compresslevel=1) as archive:
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise SystemExit("Symlink not allowed: " + str(path))
        if path.is_file():
            archive.write(path, path.relative_to(source.parent))
with ZipFile(destination) as archive:
    broken = archive.testzip()
    if broken:
        raise SystemExit("ZIP verification failed: " + broken)
print("ZIP CRC verified")
