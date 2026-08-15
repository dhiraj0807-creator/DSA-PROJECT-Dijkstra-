import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API = "http://localhost:8000";

// Colors for different states
const COLORS = {
  start: "#00ff00",
  end: "#ff0000",
  explored: "#3b82f6",   // blue - nodes being explored
  visited: "#94a3b8",    // gray - already visited
  path: "#f59e0b",       // yellow/amber - final path
};

// Component to handle map click events
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

export default function App() {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [clickStep, setClickStep] = useState("start"); // "start" or "end"
  const [status, setStatus] = useState("Click on the map to set START point");
  const [isRunning, setIsRunning] = useState(false);
  const [exploredNodes, setExploredNodes] = useState([]);
  const [pathNodes, setPathNodes] = useState([]);
  const [visitedNodes, setVisitedNodes] = useState([]);
  const [stats, setStats] = useState(null);
  const [animationSpeed, setAnimationSpeed] = useState(10); // ms per step
  const animRef = useRef(null);

  const handleMapClick = (latlng) => {
    if (isRunning) return;

    if (clickStep === "start") {
      setStartPoint(latlng);
      setClickStep("end");
      setStatus("Now click to set END point");
      // Reset previous results
      setExploredNodes([]);
      setPathNodes([]);
      setVisitedNodes([]);
      setStats(null);
    } else {
      setEndPoint(latlng);
      setClickStep("start");
      setStatus("Points set! Click 'Find Path' to run Dijkstra");
    }
  };

  const runDijkstra = async () => {
    if (!startPoint || !endPoint) {
      setStatus("Please set both start and end points first!");
      return;
    }

    setIsRunning(true);
    setExploredNodes([]);
    setPathNodes([]);
    setVisitedNodes([]);
    setStats(null);
    setStatus("Running Dijkstra... fetching from backend");

    try {
      const res = await fetch(`${API}/find-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_lat: startPoint.lat,
          start_lon: startPoint.lng,
          end_lat: endPoint.lat,
          end_lon: endPoint.lng,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setStatus(`Error: ${err.detail}`);
        setIsRunning(false);
        return;
      }

      const data = await res.json();
      setStatus(`Animating exploration of ${data.nodes_explored} nodes...`);

      // Animate explored nodes one by one
      let i = 0;
      const visited = [];

      const animate = () => {
        if (i < data.explored.length) {
          const node = data.explored[i];
          visited.push([node.lat, node.lon]);
          setExploredNodes([...visited]);
          i++;
          animRef.current = setTimeout(animate, animationSpeed);
        } else {
          // Animation done — draw final path
          const pathCoords = data.path.map((n) => [n.lat, n.lon]);
          setPathNodes(pathCoords);
          setVisitedNodes([...visited]);
          setStats({
            distance_km: data.distance_km,
            nodes_explored: data.nodes_explored,
            path_length: data.path.length,
          });
          setStatus(
            `Done! Shortest path: ${data.distance_km} km | Explored ${data.nodes_explored} nodes`
          );
          setIsRunning(false);
        }
      };

      animate();
    } catch (err) {
      setStatus("Cannot connect to backend. Is FastAPI running on port 8000?");
      setIsRunning(false);
    }
  };

  const reset = () => {
    if (animRef.current) clearTimeout(animRef.current);
    setStartPoint(null);
    setEndPoint(null);
    setClickStep("start");
    setExploredNodes([]);
    setPathNodes([]);
    setVisitedNodes([]);
    setStats(null);
    setIsRunning(false);
    setStatus("Click on the map to set START point");
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0f172a" }}>
      {/* Header */}
      <div style={{
        padding: "12px 20px",
        background: "#1e293b",
        color: "white",
        display: "flex",
        alignItems: "center",
        gap: "20px",
        flexWrap: "wrap",
        borderBottom: "1px solid #334155"
      }}>
        <h1 style={{ margin: 0, fontSize: "1.2rem", color: "#f1f5f9" }}>
          🗺️ Dijkstra Pathfinder
        </h1>

        {/* Status */}
        <span style={{
          flex: 1,
          color: "#94a3b8",
          fontSize: "0.9rem",
          minWidth: "200px"
        }}>
          {status}
        </span>

        {/* Speed control */}
        <label style={{ color: "#94a3b8", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px" }}>
          Speed:
          <input
            type="range" min="1" max="100" value={101 - animationSpeed}
            onChange={(e) => setAnimationSpeed(101 - parseInt(e.target.value))}
            style={{ width: "80px" }}
            disabled={isRunning}
          />
        </label>

        {/* Buttons */}
        <button
          onClick={runDijkstra}
          disabled={isRunning || !startPoint || !endPoint}
          style={{
            padding: "8px 16px",
            background: isRunning ? "#334155" : "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: isRunning ? "not-allowed" : "pointer",
            fontWeight: "bold",
            fontSize: "0.9rem"
          }}
        >
          {isRunning ? "Running..." : "▶ Find Path"}
        </button>

        <button
          onClick={reset}
          style={{
            padding: "8px 16px",
            background: "#475569",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.9rem"
          }}
        >
          ↺ Reset
        </button>
      </div>

      {/* Legend */}
      <div style={{
        padding: "8px 20px",
        background: "#1e293b",
        display: "flex",
        gap: "20px",
        fontSize: "0.8rem",
        borderBottom: "1px solid #334155"
      }}>
        {[
          { color: COLORS.start, label: "Start" },
          { color: COLORS.end, label: "End" },
          { color: COLORS.explored, label: "Exploring" },
          { color: COLORS.visited, label: "Visited" },
          { color: COLORS.path, label: "Shortest Path" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px", color: "#cbd5e1" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: color }} />
            {label}
          </div>
        ))}
      </div>

      {/* Map */}
      <div style={{ flex: 1 }}>
        <MapContainer
          center={[27.7172, 85.3240]}
          zoom={14}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          />

          <MapClickHandler onMapClick={handleMapClick} />

          {/* Visited nodes (gray, small) */}
          {exploredNodes.map((pos, i) => (
            <CircleMarker
              key={`v-${i}`}
              center={pos}
              radius={3}
              pathOptions={{ color: COLORS.explored, fillColor: COLORS.explored, fillOpacity: 0.6, weight: 0 }}
            />
          ))}

          {/* Final path line */}
          {pathNodes.length > 1 && (
            <Polyline
              positions={pathNodes}
              pathOptions={{ color: COLORS.path, weight: 5, opacity: 0.9 }}
            />
          )}

          {/* Start marker */}
          {startPoint && (
            <CircleMarker
              center={[startPoint.lat, startPoint.lng]}
              radius={10}
              pathOptions={{ color: COLORS.start, fillColor: COLORS.start, fillOpacity: 1, weight: 2 }}
            />
          )}

          {/* End marker */}
          {endPoint && (
            <CircleMarker
              center={[endPoint.lat, endPoint.lng]}
              radius={10}
              pathOptions={{ color: COLORS.end, fillColor: COLORS.end, fillOpacity: 1, weight: 2 }}
            />
          )}
        </MapContainer>
      </div>

      {/* Stats panel */}
      {stats && (
        <div style={{
          padding: "10px 20px",
          background: "#1e293b",
          color: "#f1f5f9",
          display: "flex",
          gap: "30px",
          fontSize: "0.9rem",
          borderTop: "1px solid #334155"
        }}>
          <span>📏 Distance: <strong>{stats.distance_km} km</strong></span>
          <span>🔍 Nodes explored: <strong>{stats.nodes_explored}</strong></span>
          <span>🛣️ Path nodes: <strong>{stats.path_length}</strong></span>
        </div>
      )}
    </div>
  );
}
