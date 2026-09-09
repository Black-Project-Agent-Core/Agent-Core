import argparse
import json
from pathlib import Path


def build_graph(extraction_path: str, output_path: str, root: str) -> None:
    from graphify.build import build_from_json
    from graphify.export import to_json

    extraction = json.loads(Path(extraction_path).read_text(encoding="utf-8"))
    graph = build_from_json(extraction, directed=True, root=root)
    communities = {0: sorted(str(node) for node in graph.nodes)} if graph.number_of_nodes() else {}
    ok = to_json(graph, communities, output_path, force=True)
    if not ok:
        raise RuntimeError("GRAPHIFY_EXPORT_REFUSED")


def query_text(graph_path: str, question: str, budget: int) -> None:
    import networkx as nx
    from networkx.readwrite import json_graph
    from graphify.serve import _query_graph_text

    data = json.loads(Path(graph_path).read_text(encoding="utf-8"))
    try:
        graph = json_graph.node_link_graph(data, edges="links")
    except TypeError:
        graph = json_graph.node_link_graph(data)
    print(_query_graph_text(graph, question, depth=3, token_budget=budget, graph_path=graph_path))


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("extraction")
    build.add_argument("output")
    build.add_argument("root")
    query = sub.add_parser("query")
    query.add_argument("graph")
    query.add_argument("question")
    query.add_argument("budget", type=int)
    args = parser.parse_args()
    if args.command == "build":
        build_graph(args.extraction, args.output, args.root)
    else:
        query_text(args.graph, args.question, args.budget)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
