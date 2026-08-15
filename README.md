# Dijkstra Maps — Real-time Pathfinding Visualizer

Visualize Dijkstra's algorithm running on a real map of Kathmandu in your browser.

## Tech Stack

| Part | Tech |
|---|---|
| Map data | osmnx (OpenStreetMap) |
| Algorithm | Python — Dijkstra from scratch |
| Backend | FastAPI |
| Frontend | React + react-leaflet |

## Project Structure

```
dijkstra-maps/
  ├── backend/
  │     ├── main.py          ← FastAPI server (2 endpoints)
  │     ├── dijkstra.py      ← Dijkstra algorithm from scratch
  │     ├── map_loader.py    ← osmnx map loading
  │     └── requirements.txt
  │
  └── frontend/
        ├── public/
        │     └── index.html
        └── src/
              ├── index.js
              └── App.jsx    ← React + Leaflet + animation
```

## Setup & Run

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Wait for "Map loaded successfully!" before starting the frontend.
First run takes ~30 seconds to download Kathmandu map data.

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

Opens at http://localhost:3000

## How to Use

1. Click anywhere on the map to set **START** point (green)
2. Click again to set **END** point (red)
3. Click **▶ Find Path**
4. Watch Dijkstra explore nodes in real-time (blue dots)
5. See the final shortest path drawn in yellow/amber
6. Use the speed slider to control animation speed

## API Endpoints

```
GET  /map         → returns all nodes and edges
POST /find-path   → runs Dijkstra, returns explored + path
GET  /health      → check server status
```

## Changing the City

In `backend/main.py`, change this line:
```python
nodes, edges, G = load_map("Kathmandu, Nepal")
```
To any city:
```python
nodes, edges, G = load_map("Pokhara, Nepal")
nodes, edges, G = load_map("New York, USA")
```
