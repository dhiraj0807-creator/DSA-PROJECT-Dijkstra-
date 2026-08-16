from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from map_loader import load_map
from dijkstra import dijkstra
import math


app = FastAPI(title="Dijkstra Maps API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading map data, please wait...")
nodes, edges, G = load_map("Kathmandu, Nepal")
print("Map loaded successfully!")


class PathRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float


def find_nearest_node(lat, lon):
    nearest = None
    minimum_distance = float("inf")

    for node_id, node in nodes.items():
        dlat = node["lat"] - lat
        dlon = node["lon"] - lon
        distance = dlat * dlat + dlon * dlon

        if distance < minimum_distance:
            minimum_distance = distance
            nearest = node_id

    return nearest


def node_to_coords(node_id):
    node = nodes[node_id]

    return {
        "id": node_id,
        "lat": node["lat"],
        "lon": node["lon"]
    }


@app.get("/map")
def get_map():
    return {
        "nodes": nodes,
        "edges": edges
    }


@app.post("/find-path")
def find_path(request: PathRequest):
    source = find_nearest_node(
        request.start_lat,
        request.start_lon
    )

    target = find_nearest_node(
        request.end_lat,
        request.end_lon
    )

    if source is None or target is None:
        raise HTTPException(
            status_code=400,
            detail="Could not find nearby nodes"
        )

    if source == target:
        raise HTTPException(
            status_code=400,
            detail="Start and end are too close"
        )

    explored, path, distance = dijkstra(
        edges,
        source,
        target
    )

    if not path:
        raise HTTPException(
            status_code=404,
            detail="No route found"
        )

    return {
        "source": node_to_coords(source),
        "target": node_to_coords(target),
        "explored": [
            node_to_coords(node)
            for node in explored
        ],
        "path": [
            node_to_coords(node)
            for node in path
        ],
        "distance_meters": round(distance, 2),
        "distance_km": round(distance / 1000, 3),
        "nodes_explored": len(explored)
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "nodes": len(nodes),
        "edges": sum(
            len(neighbors)
            for neighbors in edges.values()
        )
    }
