import osmnx as ox
import json

def load_map(place="Kathmandu, Nepal", network_type="drive"):
    """
    Load map data from OpenStreetMap using osmnx.
    Returns a simplified graph as nodes and edges.
    """
    print(f"Loading map for: {place}")
    G = ox.graph_from_place(place, network_type=network_type)

    # Project to get accurate distances in meters
    G = ox.project_graph(G)
    G = ox.graph_from_place(place, network_type=network_type)

    nodes = {}
    edges = {}

    # Extract nodes (intersections)
    for node_id, data in G.nodes(data=True):
        nodes[str(node_id)] = {
            "id": str(node_id),
            "lat": data["y"],
            "lon": data["x"]
        }

    # Extract edges (roads) with travel length as weight
    for u, v, data in G.edges(data=True):
        u_str = str(u)
        v_str = str(v)
        length = data.get("length", 1)

        if u_str not in edges:
            edges[u_str] = {}
        if v_str not in edges:
            edges[v_str] = {}

        # Store bidirectional edges with length as weight
        if v_str not in edges[u_str] or edges[u_str][v_str] > length:
            edges[u_str][v_str] = length
        if u_str not in edges[v_str] or edges[v_str][u_str] > length:
            edges[v_str][u_str] = length

    print(f"Loaded {len(nodes)} nodes and {sum(len(v) for v in edges.values())} edges")
    return nodes, edges, G
