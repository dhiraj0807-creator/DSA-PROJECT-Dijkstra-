# Dijkstra Maps — Kathmandu Road Pathfinding Visualizer

This is a Computer Engineering DSA project that visualizes **Dijkstra's shortest-path algorithm** on the real driving-road network of Kathmandu, Nepal. Select two places on the map, then watch the algorithm relax road segments before the final shortest route is shown.

The project deliberately keeps the algorithm separate and readable: Dijkstra is implemented in `backend/dijkstra.py` with Python's `heapq`. It does **not** use an OSMnx or NetworkX shortest-path function.

## Technology used

| Part | Technology | Purpose |
| --- | --- | --- |
| Road data | OpenStreetMap + OSMnx | Downloads and prepares Kathmandu's driving-road graph |
| Backend | FastAPI | Receives clicks, runs Dijkstra, and returns route data |
| Frontend | React | User interface and animation state |
| Map | Leaflet via React-Leaflet | OpenStreetMap tiles, markers, and road polylines |
| Algorithm | Python `heapq` | Min-priority queue for Dijkstra's algorithm |

## How it works

### Loading the Kathmandu graph

When FastAPI starts, `map_loader.py` calls:

```python
ox.graph_from_place("Kathmandu, Nepal", network_type="drive")
```

OSMnx creates a directed `MultiDiGraph` of drivable Kathmandu roads. One-way roads keep their direction; two-way roads have edges in both directions. The loader converts that graph into a simpler adjacency dictionary for the student-written Dijkstra implementation:

```python
{
  "node_id": {
    "neighbour_id": {
      "weight": road_length_in_metres,
      "geometry": [[lat, lon], ...]
    }
  }
}
```

If OSM has several parallel edges between the same two nodes, the shortest one is retained. The road geometry is also retained, so a displayed route follows the road shape instead of being a series of straight lines.

OSMnx may download data on the first run and uses its local cache on later runs. The existing cache files are intentionally left in this repository for now.

### Selecting road locations

The user clicks a start and destination on the Leaflet map. The backend validates that both coordinates are finite and reasonably near Kathmandu's loaded road bounds. It then uses `ox.distance.nearest_nodes` to snap each click to the nearest road-network node.

The frontend replaces the click markers with these snapped road nodes once a route is returned. Therefore, the green and red markers show the exact start and destination that Dijkstra actually uses.

### Dijkstra implementation

`dijkstra(graph, source, target)` uses:

- `heapq` as a min-priority queue;
- `dist` for the best known distance to each node;
- `prev` to reconstruct the shortest path;
- `visited` for finalized nodes;
- OSM road length in metres as each edge weight; and
- early exit when the destination is popped from the heap with its final distance.

It returns finalized nodes, successful edge relaxations, the shortest path, and the route distance. A **successful relaxation** is an edge that improves a neighbour's best known distance. It is not every edge Dijkstra inspects.

### Visualization

1. Click the map once to set the start point and again to set the destination.
2. Press **Find Path**.
3. The frontend requests `POST /find-path` from FastAPI.
4. **Blue** road segments animate in the order of successful Dijkstra edge relaxations.
5. The final **amber/yellow** shortest route is drawn on top.
6. **Green** and **red** markers show the snapped start and destination road nodes.

The visualization uses batched Leaflet polylines rather than one React component per road segment. Very large searches display at most the first 7,000 real relaxation segments, in order, to keep the browser responsive; no artificial roads are created. The final route is always displayed completely.

## API endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Confirms the server is running and reports graph counts |
| `GET` | `/map` | Returns graph metadata: place name, node/edge counts, and bounds. It does **not** return all nodes and edges. |
| `POST` | `/find-path` | Validates two coordinates, snaps them to road nodes, runs custom Dijkstra, and returns visualization/path data |

Example request body for `/find-path`:

```json
{
  "start_lat": 27.7172,
  "start_lon": 85.3240,
  "end_lat": 27.7040,
  "end_lon": 85.3300
}
```

## Project structure

```text
dijkstra-maps/
├── backend/
│   ├── dijkstra.py          # Custom heap-based Dijkstra
│   ├── map_loader.py        # OSMnx loading and graph conversion
│   ├── main.py              # FastAPI endpoints and validation
│   ├── test_dijkstra.py     # Small algorithm unit tests
│   └── requirements.txt
├── frontend/
│   ├── public/index.html
│   └── src/
│       ├── index.js
│       └── App.jsx           # React, Leaflet, and animation
└── README.md
```

## Run the project

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Wait for `Map loaded successfully!` before using the frontend. On a clean cache and slow internet connection, the first OSM download can take some time.

Run the small Dijkstra tests with:

```bash
cd backend
python -m unittest test_dijkstra.py
```

### Frontend

In another terminal:

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:3000`. The frontend expects the backend at `http://localhost:8000` by default. To use a different address, set `REACT_APP_API_URL` before starting React.

## Limitations

- The graph represents OpenStreetMap data at the time it was downloaded or cached, not live traffic conditions.
- The route minimizes road length, not travel time, fuel, road quality, or traffic.
- Clicking near a road snaps to a graph node, so the exact route endpoint can differ slightly from the original click.
- Only Kathmandu's `drive` network is loaded; walking and cycling paths are not included.
- A large city graph can take time and network access to load on the first run.
- The blue animation shows successful relaxations, not every inspected edge and not a live step-by-step backend stream.

## Viva summary

The frontend chooses two coordinates. FastAPI snaps them to real Kathmandu road nodes, then passes the directed weighted graph to the custom Dijkstra function. Dijkstra repeatedly removes the smallest tentative distance from a min-heap, relaxes neighbouring roads, records predecessors, and reconstructs the minimum-distance route. React-Leaflet then draws the real explored road geometries and final route.
