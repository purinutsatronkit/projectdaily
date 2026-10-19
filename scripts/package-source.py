"""Package only source, docs, built frontend, and final slides. Never secrets or data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
output = root / "artifacts" / "taskflow-project.zip"
output.parent.mkdir(exist_ok=True)
directories = ["apps", "packages", "scripts", "tests", "docs", "n8n", "presentation/output"]
files = ["README.md", "package.json", "package-lock.json", "tsconfig.base.json", ".env.example", ".gitignore"]
selected = [root / name for name in files]
for directory in directories:
    selected.extend(p for p in (root / directory).rglob("*") if p.is_file())
selected = sorted(set(p for p in selected if p.exists()))
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for path in selected:
        relative = path.relative_to(root)
        if any(part in {"node_modules", ".build", ".git", ".codex-finalizer", "__pycache__"} for part in relative.parts):
            continue
        if path.name == ".env" or path.suffix in {".sqlite", ".log"}:
            continue
        archive.write(path, "taskflow/" + relative.as_posix())
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert not any(name.endswith("/.env") or "/node_modules/" in name or "/data/" in name for name in archive.namelist())
    print(f"Source package: {output} ({len(archive.namelist())} files)")
