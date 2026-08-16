import osmnx as ox


def load_map(place="Kathmandu, Nepal", network_type="drive"):
    print(f"Loading map for: {place}")

    graph = ox.graph_from_place(place, network_type=network_type)

    nodes = {}
    edges = {}

    for node_id, data in graph.nodes(data=True):
        node_id = str(node_id)

        nodes[node_id] = {
            "id": node_id,
            "lat": data["y"],
            "lon": data["x"]
        }

    for u, v, data in graph.edges(data=True):
        u = str(u)
        v = str(v)

        length = data.get("length", 1)

        if u not in edges:
            edges[u] = {}

        if v not in edges[u] or length < edges[u][v]:
            edges[u][v] = length

    edge_count = sum(len(neighbors) for neighbors in edges.values())

    print(f"Loaded {len(nodes)} nodes and {edge_count} edges")

    return nodes, edges, graph
