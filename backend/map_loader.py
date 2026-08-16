from pathlib import Path

import osmnx as ox
from shapely.ops import unary_union


VALLEY_AREAS = ("Kathmandu, Nepal", "Lalitpur, Nepal", "Bhaktapur, Nepal")
NETWORK_TYPE = "drive"
CACHE_DIR = Path(__file__).resolve().parent / "data"
GRAPH_CACHE = CACHE_DIR / "kathmandu_valley_drive.graphml"


def _configure_osmnx_cache():
    """Keep both OSM responses and the finished graph beside the backend."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(CACHE_DIR / "osmnx_http_cache")


def load_kathmandu_valley_map():
    """Load the cached Kathmandu Valley driving network, downloading it once.

    The three administrative areas are geocoded individually and their
    boundaries are merged before a single OSM street query is made. Querying
    one merged polygon, rather than three separate graphs, preserves roads
    that cross municipal boundaries and gives Dijkstra one connected network.
    """
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
    """
    Convert the real Kathmandu Valley road network from OSMnx,
    and convert it into the plain dict structures the rest of the backend
    (and our own Dijkstra implementation) work with.

    Returns:
        nodes: { node_id: {"id": ..., "lat": ..., "lon": ...} }
        graph: directed adjacency list
            { node_id: { neighbor_id: {"weight": meters, "geometry": [[lat, lon], ...]} } }
        G: the raw osmnx MultiDiGraph, kept around only so we can use
           osmnx's own nearest-node search later.
    """
    nodes = {}
    for node_id, data in G.nodes(data=True):
        nodes[str(node_id)] = {
            "id": str(node_id),
            "lat": data["y"],
            "lon": data["x"],
        }

    # osmnx builds a directed graph already: a one-way street only gets an
    # edge in one direction, a two-way street gets edges in both directions.
    # So we just read the edges as-is instead of manually mirroring u->v.
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

    # Count the flattened adjacency list, not the raw MultiDiGraph. This is
    # important because replacing one of several parallel edges must not make
    # the reported count larger than the graph Dijkstra actually uses.
    edge_count = sum(len(neighbors) for neighbors in graph.values())

    print(f"Loaded {len(nodes)} nodes and {edge_count} edges")
    return nodes, graph, G


def _edge_geometry(edge_data, u_node, v_node):
    """Return the real road shape as [[lat, lon], ...] if osmnx captured it,
    otherwise fall back to a straight line between the two endpoints."""
    geom = edge_data.get("geometry")
    if geom is not None:
        return [[lat, lon] for lon, lat in geom.coords]
    return [[u_node["lat"], u_node["lon"]], [v_node["lat"], v_node["lon"]]]
