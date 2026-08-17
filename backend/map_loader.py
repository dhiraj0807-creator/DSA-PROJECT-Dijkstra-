from pathlib import Path

import osmnx as ox
from shapely.ops import unary_union


VALLEY_AREAS = ("Kathmandu, Nepal", "Lalitpur, Nepal", "Bhaktapur, Nepal")
NETWORK_TYPE = "drive"
CACHE_DIR = Path(__file__).resolve().parent / "data"
GRAPH_CACHE = CACHE_DIR / "kathmandu_valley_drive.graphml"


def _configure_osmnx_cache():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(CACHE_DIR / "osmnx_http_cache")


def load_kathmandu_valley_map():
    _configure_osmnx_cache()
    if GRAPH_CACHE.exists():
        print(f"Loading cached Kathmandu Valley graph: {GRAPH_CACHE}")
        G = ox.load_graphml(GRAPH_CACHE)
    else:
        print("Downloading driving roads for Kathmandu, Lalitpur, and Bhaktapur from OpenStreetMap...")
        area_boundaries = ox.geocode_to_gdf(list(VALLEY_AREAS))
        valley_polygon = unary_union(area_boundaries.geometry.tolist())
        G = ox.graph_from_polygon(valley_polygon, network_type=NETWORK_TYPE)
        ox.save_graphml(G, GRAPH_CACHE)
        print(f"Saved Kathmandu Valley graph cache: {GRAPH_CACHE}")
    return _convert_graph(G)


def _convert_graph(G):
    nodes = {}
    for node_id, data in G.nodes(data=True):
        nodes[str(node_id)] = {
            "id": str(node_id),
            "lat": data["y"],
            "lon": data["x"],
        }

    graph = {}
    for u, v, data in G.edges(data=True):
        u_str, v_str = str(u), str(v)
        length = data.get("length", 1)
        geometry = _edge_geometry(data, nodes[u_str], nodes[v_str])

        graph.setdefault(u_str, {})

        # A MultiDiGraph can have more than one edge between the same pair
        # of nodes (e.g. a divided road). Keep the shortest one.
        existing = graph[u_str].get(v_str)
        if existing is None or length < existing["weight"]:
            graph[u_str][v_str] = {"weight": length, "geometry": geometry}

    edge_count = sum(len(neighbors) for neighbors in graph.values())

    print(f"Loaded {len(nodes)} nodes and {edge_count} edges")
    return nodes, graph, G


def _edge_geometry(edge_data, u_node, v_node):
    
    geom = edge_data.get("geometry")
    if geom is not None:
        return [[lat, lon] for lon, lat in geom.coords]
    return [[u_node["lat"], u_node["lon"]], [v_node["lat"], v_node["lon"]]]
