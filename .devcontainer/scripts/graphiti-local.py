#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import signal
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from redislite.async_falkordb_client import AsyncFalkorDB
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.nodes import EpisodeType, EpisodicNode

STATE_ROOT = Path(os.environ.get("GRAPHITI_LOCAL_STATE", "/workspaces/.assistant-tools/state/graphiti")).resolve()
DB_PATH = STATE_ROOT / "graphiti.db"
GRAPH_NAME = "tools_gateway"
DEFAULT_GROUP = "tools-gateway"


async def open_driver() -> tuple[AsyncFalkorDB, FalkorDriver]:
    STATE_ROOT.mkdir(parents=True, exist_ok=True)
    db = AsyncFalkorDB(dbfilename=str(DB_PATH))
    driver = FalkorDriver(falkor_db=db, database=GRAPH_NAME)
    return db, driver


async def close_driver(db: AsyncFalkorDB, driver: FalkorDriver) -> None:
    # redislite/falkordblite 0.10.0 has a cleanup bug on Python 3.14 where
    # its sync destructor calls an async shutdown method. Avoid that upstream
    # path: force an RDB save, close the asyncio connection, terminate only the
    # embedded DB child, and mark the sync wrapper async-managed so __del__ is a no-op.
    client = db.client
    sync_client = getattr(client, "_sync_client", None)
    redis_dir_value = getattr(sync_client, "redis_dir", None) if sync_client else None
    redis_dir = Path(redis_dir_value) if redis_dir_value else None
    pid = int(getattr(sync_client, "pid", 0) or 0) if sync_client else 0
    try:
        try:
            await client.save()
        except Exception:
            pass
        async_client = getattr(client, "_client", None)
        if async_client is not None:
            try:
                await async_client.aclose()
            except Exception:
                pass
        if sync_client is not None:
            sync_client._async_managed = True
    finally:
        if pid > 1:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            deadline = time.monotonic() + 2.0
            while time.monotonic() < deadline:
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    break
                await asyncio.sleep(0.05)
            else:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        if redis_dir and redis_dir.is_dir() and redis_dir.parent == Path("/tmp"):
            shutil.rmtree(redis_dir, ignore_errors=True)


async def health() -> dict[str, Any]:
    db, driver = await open_driver()
    try:
        rows, _, _ = await driver.execute_query(
            "MATCH (e:Episodic) RETURN count(e) AS count",
            routing_="r",
        )
        count = int(rows[0]["count"]) if rows else 0
        return {
            "ok": True,
            "backend": "graphiti-core+falkordblite",
            "graph": GRAPH_NAME,
            "database": str(DB_PATH),
            "episodicCount": count,
            "llmExtraction": False,
            "rawCypherExposed": False,
        }
    finally:
        await close_driver(db, driver)


async def add_memory(text: str, name: str | None, group: str, source_description: str) -> dict[str, Any]:
    db, driver = await open_driver()
    try:
        now = datetime.now(timezone.utc)
        node = EpisodicNode(
            name=name or f"memory-{now.isoformat()}",
            group_id=group,
            source=EpisodeType.text,
            source_description=source_description,
            content=text,
            valid_at=now,
            created_at=now,
        )
        await node.save(driver)
        return {
            "ok": True,
            "uuid": node.uuid,
            "name": node.name,
            "groupId": node.group_id,
            "validAt": node.valid_at.isoformat(),
        }
    finally:
        await close_driver(db, driver)


async def search(query: str, limit: int, group: str | None) -> dict[str, Any]:
    db, driver = await open_driver()
    try:
        where = "toLower(e.content) CONTAINS toLower($query) OR toLower(e.name) CONTAINS toLower($query) OR toLower(e.source_description) CONTAINS toLower($query)"
        params: dict[str, Any] = {"query": query, "limit": limit}
        if group:
            where = f"({where}) AND e.group_id = $group"
            params["group"] = group
        rows, _, _ = await driver.execute_query(
            f"""
            MATCH (e:Episodic)
            WHERE {where}
            RETURN e.uuid AS uuid,
                   e.name AS name,
                   e.group_id AS group_id,
                   e.source_description AS source_description,
                   e.content AS content,
                   e.created_at AS created_at,
                   e.valid_at AS valid_at
            ORDER BY e.valid_at DESC
            LIMIT $limit
            """,
            routing_="r",
            **params,
        )
        results = []
        for row in rows:
            item = dict(row)
            for key in ("created_at", "valid_at"):
                value = item.get(key)
                if value is not None and not isinstance(value, (str, int, float, bool)):
                    item[key] = str(value)
            results.append(item)
        return {"ok": True, "query": query, "count": len(results), "results": results}
    finally:
        await close_driver(db, driver)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Local Graphiti episodic-memory adapter using embedded FalkorDB Lite.")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("health")

    add = sub.add_parser("add")
    add.add_argument("--text", required=True)
    add.add_argument("--name")
    add.add_argument("--group", default=DEFAULT_GROUP)
    add.add_argument("--source-description", default="GPT Tools Gateway")

    find = sub.add_parser("search")
    find.add_argument("--query", required=True)
    find.add_argument("--limit", type=int, default=10)
    find.add_argument("--group")
    return p


async def async_main() -> int:
    args = parser().parse_args()
    if args.command == "health":
        result = await health()
    elif args.command == "add":
        if not 1 <= len(args.text) <= 30000:
            raise SystemExit("text must be 1..30000 characters")
        if not 1 <= len(args.group) <= 256:
            raise SystemExit("group must be 1..256 characters")
        result = await add_memory(args.text, args.name, args.group, args.source_description)
    else:
        if not 1 <= len(args.query) <= 4000:
            raise SystemExit("query must be 1..4000 characters")
        limit = max(1, min(args.limit, 50))
        result = await search(args.query, limit, args.group)
    print(json.dumps(result, ensure_ascii=False))
    return 0


def main() -> int:
    return asyncio.run(async_main())


if __name__ == "__main__":
    raise SystemExit(main())
