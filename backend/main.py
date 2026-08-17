import math
import time

import osmnx as ox
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dijkstra import dijkstra
from map_loader import NETWORK_TYPE, VALLEY_AREAS, load_kathmandu_valley_map

app = FastAPI(title="Dijkstra Maps API")

PLACE_NAME = "Kathmandu Valley, Nepal"
BOUND_PADDING_DEGREES = 0.01

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading map data, please wait...")
nodes, graph, G = load_kathmandu_valley_map()
print("Map loaded successfully!")

GRAPH_BOUNDS = {
    "min_lat": min(n["lat"] for n in nodes.values()),
    "max_lat": max(n["lat"] for n in nodes.values()),
    "min_lon": min(n["lon"] for n in nodes.values()),
    "max_lon": max(n["lon"] for n in nodes.values()),
}


class PathRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float


def node_to_coords(node_id):
    n = nodes[node_id]
    return {"id": node_id, "lat": n["lat"], "lon": n["lon"]}


def find_nearest_node(lat, lon):
    node_id = ox.distance.nearest_nodes(G, X=lon, Y=lat)
    return str(node_id)


def edge_lookup(u, v):
    return graph.get(u, {}).get(v)


def haversine_distance_meters(lat1, lon1, lat2, lon2):
    radius_m = 6_371_000
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    d_lat = lat2 - lat1
    d_lon = lon2 - lon1
    a = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * radius_m * math.asin(math.sqrt(a))


def validate_coordinates(lat, lon, label):
    if not math.isfinite(lat) or not math.isfinite(lon):
        raise HTTPException(status_code=400, detail=f"{label} coordinates must be finite numbers")

    if not (
        GRAPH_BOUNDS["min_lat"] - BOUND_PADDING_DEGREES <= lat <= GRAPH_BOUNDS["max_lat"] + BOUND_PADDING_DEGREES
        and GRAPH_BOUNDS["min_lon"] - BOUND_PADDING_DEGREES <= lon <= GRAPH_BOUNDS["max_lon"] + BOUND_PADDING_DEGREES
    ):
        raise HTTPException(status_code=400, detail=f"{label} must be within the Kathmandu Valley road network")


@app.get("/map")
def get_map():
    edge_count = sum(len(v) for v in graph.values())
    return {
        "place": PLACE_NAME,
        "areas": VALLEY_AREAS,
        "network_type": NETWORK_TYPE,
        "node_count": len(nodes),
        "edge_count": edge_count,
        "bounds": GRAPH_BOUNDS,
    }


@app.post("/find-path")
def find_path(req: PathRequest):
    validate_coordinates(req.start_lat, req.start_lon, "Start")
    validate_coordinates(req.end_lat, req.end_lon, "Destination")

    try:
        source = find_nearest_node(req.start_lat, req.start_lon)
        target = find_nearest_node(req.end_lat, req.end_lon)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not find nearby road nodes")

    if source == target:
        raise HTTPException(
            status_code=400,
            detail="Start and destination snapped to the same road point. Try points farther apart.",
        )

    algorithm_start_time = time.perf_counter()
    explored_nodes, explored_edges, path, distance = dijkstra(graph, source, target)
    algorithm_time_ms = round((time.perf_counter() - algorithm_start_time) * 1000, 2)

    if not path:
        raise HTTPException(status_code=404, detail="No path found between these points")

    explored_edges_out = [
        {
            "from": e["from"],
            "to": e["to"],
            "geometry": edge_lookup(e["from"], e["to"])["geometry"],
        }
        for e in explored_edges
    ]

    path_edges = [
        {
            "from": u,
            "to": v,
            "geometry": edge_lookup(u, v)["geometry"],
        }
        for u, v in zip(path, path[1:])
    ]

    source_coords = node_to_coords(source)
    target_coords = node_to_coords(target)
    response = {
        "source": source_coords,
        "target": target_coords,
        "explored_edges": explored_edges_out,
        "path": [node_to_coords(n) for n in path],
        "path_edges": path_edges,
        "distance_meters": round(distance, 2),
        "distance_km": round(distance / 1000, 3),
        "nodes_explored": len(explored_nodes),
        "explored_edges_count": len(explored_edges),
        "exploration_percentage": round(len(explored_nodes) / len(nodes) * 100, 2),
        "path_segments": max(0, len(path) - 1),
        "snap_distances_m": {
            "start": round(haversine_distance_meters(req.start_lat, req.start_lon, source_coords["lat"], source_coords["lon"]), 1),
            "destination": round(haversine_distance_meters(req.end_lat, req.end_lon, target_coords["lat"], target_coords["lon"]), 1),
        },
        "algorithm_time_ms": algorithm_time_ms,
    }
    return response


@app.get("/health")
def health():
    edge_count = sum(len(v) for v in graph.values())
    return {"status": "ok", "nodes": len(nodes), "edges": edge_count}
