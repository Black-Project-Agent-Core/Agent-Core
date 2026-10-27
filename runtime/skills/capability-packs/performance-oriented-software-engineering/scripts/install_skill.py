#!/usr/bin/env python3
"""Install this skill and optionally register its hook using existing Python."""

import argparse
import copy
import json
import os
import shlex
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

NAME = "performance-oriented-software-engineering"
FILES = (
    "SKILL.md", "agents/openai.yaml", "scripts/performance_prompt_hook.py",
    "scripts/install_skill.py", "Install-Windows.cmd", "INSTALL.md",
)


def hook_command(script):
    executable = str(Path(sys.executable).resolve())
    if os.name == "nt":
        return '"{}" -I "{}"'.format(executable, script)
    return "{} -I {}".format(shlex.quote(executable), shlex.quote(str(script)))


def register_hook(config, command):
    if not isinstance(config, dict):
        raise ValueError("hooks.json must contain a JSON object; nothing was installed.")
    result = copy.deepcopy(config)
    hooks = result.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        raise ValueError("The hooks field must be an object; nothing was installed.")
    groups = hooks.setdefault("UserPromptSubmit", [])
    if not isinstance(groups, list):
        raise ValueError("UserPromptSubmit must be an array; nothing was installed.")
    handler = {"type": "command", "command": command, "timeout": 3,
               "additionalContextLimit": 256}
    found = False
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get("hooks"), list):
            raise ValueError("Invalid UserPromptSubmit group; nothing was installed.")
        updated = []
        for existing in group["hooks"]:
            if not isinstance(existing, dict):
                raise ValueError("Invalid hook handler; nothing was installed.")
            text = str(existing.get("command", "")).replace("\\", "/")
            owned = (existing.get("type") == "command" and
                     NAME + "/scripts/performance_prompt_hook.py" in text)
            if owned:
                if not found:
                    updated.append(handler)
                    found = True
            else:
                updated.append(existing)
        group["hooks"] = updated
    if not found:
        groups.append({"hooks": [handler]})
    return result


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".skill-install-",
                                         delete=False) as output:
            temporary = Path(output.name)
            output.write(data)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main():
    # Redirected Windows output may otherwise use a legacy code page for paths.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codex-home", type=Path,
                        default=Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex"))
    parser.add_argument("--skills-dir", type=Path,
                        help="Override the parent skill directory, e.g. ~/.agents/skills")
    parser.add_argument("--skill-only", action="store_true", help="Do not register a hook")
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1]
    home = args.codex_home.expanduser().resolve()
    if args.skills_dir:
        destination = args.skills_dir.expanduser().resolve() / NAME
    else:
        candidates = [home / "skills" / NAME, Path.home() / ".agents" / "skills" / NAME]
        existing = list(dict.fromkeys(p.resolve() for p in candidates if p.exists()))
        if len(existing) > 1:
            raise ValueError("Multiple copies already exist; select one with --skills-dir.")
        destination = existing[0] if existing else home / "skills" / NAME
    destination = destination.resolve()

    # Plan everything before changing files, including validation of existing hooks.
    changes = []
    for relative in FILES:
        data = (source / relative).read_bytes()
        target = destination / relative
        if not target.exists() or target.read_bytes() != data:
            changes.append((target, data, Path("skill") / relative))
    hook_path = home / "hooks.json"
    if not args.skill_only:
        previous = json.loads(hook_path.read_text(encoding="utf-8-sig")) if hook_path.exists() else {}
        updated = register_hook(previous, hook_command(destination / "scripts" / "performance_prompt_hook.py"))
        if updated != previous:
            data = (json.dumps(updated, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            changes.append((hook_path, data, Path("hooks.json")))

    backup = home / "skill-install-backups" / NAME / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backed_up = False
    for target, data, relative in changes:
        if target.exists():
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, saved)
            backed_up = True
        atomic_write(target, data)

    print("Skill: {}".format(destination))
    print("Updated {} file(s).".format(len(changes)))
    if backed_up:
        print("Backups: {}".format(backup))
    if not args.skill_only:
        print("Hook registered using existing Python: {}".format(sys.executable))
        print("On this computer, open codex, then /hooks, and review/Trust the hook.")
    print("Restart Codex Desktop if the skill or hook has not appeared.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, TypeError) as error:
        print("Installation failed: {}".format(error), file=sys.stderr)
        raise SystemExit(1)
