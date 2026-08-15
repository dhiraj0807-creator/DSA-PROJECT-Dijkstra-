from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from map_loader import load_map
from dijkstra import dijkstra
import math

app = FastAPI(title="Dijkstra Maps API")

# Allow React frontend to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load map once on startup
print("Loading map data, please wait...")
nodes, edges, G = load_map("Kathmandu, Nepal")
print("Map loaded successfully!")


class PathRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float


def find_nearest_node(lat, lon):
    """Find the nearest graph node to given lat/lon coordinates."""
    min_dist = float('inf')
    nearest = None

    for node_id, data in nodes.items():
        # Euclidean distance approximation (good enough for nearby points)
        dlat = data["lat"] - lat
        dlon = data["lon"] - lon
        dist = math.sqrt(dlat**2 + dlon**2)

        if dist < min_dist:
            min_dist = dist
            nearest = node_id

    return nearest


@app.get("/map")
def get_map():
    """Return all nodes and edges for the frontend to render the map."""
    return {
        "nodes": nodes,
        "edges": {
            u: list(vs.keys())
            for u, vs in edges.items()
        }
    }


@app.post("/find-path")
def find_path(req: PathRequest):
    """
    Run Dijkstra from start to end coordinates.
    Returns explored nodes (for animation) and the final shortest path.
    """
    # Find nearest graph nodes to clicked coordinates
    source = find_nearest_node(req.start_lat, req.start_lon)
    target = find_nearest_node(req.end_lat, req.end_lon)

    if not source or not target:
        raise HTTPException(status_code=400, detail="Could not find nearby nodes")

    if source == target:
        raise HTTPException(status_code=400, detail="Start and end are the same point")

    # Run Dijkstra from scratch
    explored, path, distance = dijkstra(edges, nodes, source, target)

    if not path:
        raise HTTPException(status_code=404, detail="No path found between these points")

    # Convert node ids to lat/lon for frontend
    def node_to_coords(node_id):
        n = nodes.get(node_id, {})
        return {"lat": n.get("lat"), "lon": n.get("lon"), "id": node_id}

    return {
        "source": node_to_coords(source),
        "target": node_to_coords(target),
        "explored": [node_to_coords(n) for n in explored],
        "path": [node_to_coords(n) for n in path],
        "distance_meters": round(distance, 2),
        "distance_km": round(distance / 1000, 3),
        "nodes_explored": len(explored),
    }


@app.get("/health")
def health():
    return {"status": "ok", "nodes": len(nodes), "edges": len(edges)}
