"""G1 only: run the real CGC CLI on disposable copies; never index the checkout."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "impact/corpus/g1"
EDGES_QUERY = """MATCH (a)-[r]->(b) RETURN label(a) AS fromKind, a.name AS fromName,
a.path AS fromPath, type(r) AS type, label(b) AS toKind, b.name AS toName,
b.path AS toPath, r.line_number AS line, r.full_call_name AS text,
r.confidence AS confidence, r.resolution_tier AS tier,
r.source AS source, r.resolution_method AS method"""
NODES_QUERY = """MATCH (n) RETURN label(n) AS kind, n.name AS name, n.path AS path,
n.line_number AS line"""


def manifest(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob("*")) if p.is_file() and p.name != ".cgcignore"}


def run(cgc, destination):
    original = manifest(CORPUS / "project")
    report = {"engine": "CodeGraphContext", "version": importlib.metadata.version("codegraphcontext"),
              "python": platform.python_version(), "platform": platform.platform(),
              "backend": "ladybugdb", "configuration": {"SCIP_INDEXER": "false", "ENABLE_VECTOR_RESOLVE": "false",
              "ENABLE_INHERIT_RESOLVE": "false", "ENABLE_AUTO_WATCH": "false"},
              "packages": sorted(f"{d.metadata['Name']}=={d.version}" for d in importlib.metadata.distributions()),
              "inputFiles": original, "commands": []}
    with tempfile.TemporaryDirectory(prefix="impact-g1-cgc-") as temporary:
        temp = Path(temporary).resolve()
        project = temp / "project"
        home = temp / "home"
        home.mkdir()
        shutil.copytree(CORPUS / "project", project)
        env = {key: os.environ[key] for key in ("PATH", "LANG", "TMPDIR") if key in os.environ}
        env.update(HOME=str(home), NO_COLOR="1", TERM="dumb", COLUMNS="10000", **report["configuration"])
        base = [str(cgc), "--database", "ladybugdb", "--path", str(temp / "graph.db")]

        def normalize(value):
            if isinstance(value, str):
                return value.replace(str(project), ".").replace(str(temp), "<temporary>")
            if isinstance(value, list):
                return [normalize(item) for item in value]
            if isinstance(value, dict):
                return {key: normalize(item) for key, item in value.items()}
            return value

        def command(args, query=False):
            start = time.perf_counter()
            completed = subprocess.run(base + args, cwd=temp, env=env, capture_output=True, text=True, timeout=180)
            elapsed = round((time.perf_counter() - start) * 1000, 3)
            entry = {"argv": normalize(base[1:] + args), "exitCode": completed.returncode, "wallMs": elapsed,
                     "stdout": normalize(completed.stdout), "stderr": normalize(completed.stderr)}
            report["commands"].append(entry)
            if completed.returncode:
                raise RuntimeError(f"CGC failed: {entry}")
            if not query:
                return elapsed
            # Rich prints a JSON array after its startup banner; wide COLUMNS avoids wrapped strings.
            start_json = completed.stdout.find("\n[")
            if start_json < 0:
                raise ValueError("CGC query did not produce a JSON array; no results will be invented")
            data, _ = json.JSONDecoder().raw_decode(completed.stdout[start_json + 1:])
            return sorted(normalize(data), key=lambda item: json.dumps(item, sort_keys=True))

        def snapshot():
            return {"nodes": command(["query", NODES_QUERY], True), "edges": command(["query", EDGES_QUERY], True)}

        try:
            report["indexMs"] = command(["index", str(project), "--no-progress", "--summarize"])
            report["baseline"] = snapshot()
            change = json.loads((CORPUS / "oracle.json").read_text())["evolution"]
            for path, content in {**change["add"], **change["modify"]}.items():
                (project / path).write_text(content)
            for path in change["delete"]:
                (project / path).unlink()
            (project / change["rename"]["from"]).rename(project / change["rename"]["to"])
            rewrite = change["rewrite"]
            path = project / rewrite["path"]
            path.write_text(path.read_text().replace(rewrite["before"], rewrite["after"]))
            report["evolvedFiles"] = manifest(project)
            report["updateMs"] = command(["update", str(project)])
            report["updated"] = snapshot()
            report["rebuildMs"] = command(["index", str(project), "--force", "--no-progress"])
            report["rebuilt"] = snapshot()
            report["updateEqualsRebuild"] = report["updated"] == report["rebuilt"]
            report["status"] = "executed"
        except (RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
            report["status"] = "incomplete"
            report["error"] = normalize(str(error))
    report["checkoutUnchanged"] = original == manifest(CORPUS / "project")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({key: report[key] for key in ("status", "indexMs", "updateMs", "rebuildMs", "updateEqualsRebuild", "checkoutUnchanged") if key in report}))
    return 0 if report["status"] == "executed" and report["checkoutUnchanged"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cgc", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=CORPUS / "results/cgc.json")
    args = parser.parse_args()
    raise SystemExit(run(args.cgc.resolve(), args.output.resolve()))