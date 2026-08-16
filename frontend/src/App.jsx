import React, { useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API = "http://localhost:8000";

const COLORS = {
  start: "#16a34a",
  end: "#dc2626",
  explored: "#2563eb",
  path: "#dc2626",
};

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng);
    },
  });

  return null;
}

function App() {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [selecting, setSelecting] = useState("start");
  const [status, setStatus] = useState(
    "Click on the map to select a starting point"
  );
  const [exploredNodes, setExploredNodes] = useState([]);
  const [pathNodes, setPathNodes] = useState([]);
  const [stats, setStats] = useState(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(20);

  const timerRef = useRef(null);

  const handleMapClick = (latlng) => {
    if (running) return;

    if (selecting === "start") {
      setStartPoint(latlng);
      setEndPoint(null);
      setExploredNodes([]);
      setPathNodes([]);
      setStats(null);
      setSelecting("end");
      setStatus("Now select the destination point");
      return;
    }

    setEndPoint(latlng);
    setSelecting("start");
    setStatus("Points selected. Press Find Path to start Dijkstra");
  };

  const animateExploration = (nodes, path, data) => {
    let index = 0;

    const animate = () => {
      if (index < nodes.length) {
        const node = nodes[index];

        setExploredNodes((previous) => [
          ...previous,
          [node.lat, node.lon],
        ]);

        index += 1;
        timerRef.current = setTimeout(animate, speed);
        return;
      }

      setPathNodes(path.map((node) => [node.lat, node.lon]));

      setStats({
        distance: data.distance_km,
        explored: data.nodes_explored,
        path: data.path.length,
      });

      setStatus(
        `Path found: ${data.distance_km} km through ${data.nodes_explored} explored nodes`
      );

      setRunning(false);
    };

    animate();
  };

  const findPath = async () => {
    if (!startPoint || !endPoint) {
      setStatus("Select both a start and destination point first");
      return;
    }

    setRunning(true);
    setExploredNodes([]);
    setPathNodes([]);
    setStats(null);
    setStatus("Finding the shortest path...");

    try {
      const response = await fetch(`${API}/find-path`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start_lat: startPoint.lat,
          start_lon: startPoint.lng,
          end_lat: endPoint.lat,
          end_lon: endPoint.lng,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.detail || "Unable to find a path");
        setRunning(false);
        return;
      }

      setStatus(`Exploring ${data.nodes_explored} nodes...`);

      animateExploration(data.explored, data.path, data);
    } catch {
      setStatus(
        "Could not connect to the backend. Make sure FastAPI is running on port 8000."
      );
      setRunning(false);
    }
  };

  const reset = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setStartPoint(null);
    setEndPoint(null);
    setSelecting("start");
    setExploredNodes([]);
    setPathNodes([]);
    setStats(null);
    setRunning(false);
    setStatus("Click on the map to select a starting point");
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#111827",
      }}
    >
      <header
        style={{
          padding: "14px 22px",
          background: "#111827",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: "20px",
          borderBottom: "1px solid #374151",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 600,
            }}
          >
            Dijkstra Pathfinder
          </h1>

          <div
            style={{
              color: "#9ca3af",
              fontSize: "13px",
              marginTop: "3px",
            }}
          >
            Kathmandu road network
          </div>
        </div>

        <div
          style={{
            flex: 1,
            color: "#d1d5db",
            fontSize: "14px",
            minWidth: "250px",
          }}
        >
          {status}
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#d1d5db",
            fontSize: "13px",
          }}
        >
          Speed
          <input
            type="range"
            min="1"
            max="50"
            value={51 - speed}
            onChange={(event) =>
              setSpeed(51 - Number(event.target.value))
            }
            disabled={running}
          />
        </label>

        <button
          onClick={findPath}
          disabled={running || !startPoint || !endPoint}
          style={{
            padding: "9px 16px",
            border: "none",
            borderRadius: "6px",
            background:
              running || !startPoint || !endPoint
                ? "#374151"
                : "#2563eb",
            color: "#fff",
            cursor:
              running || !startPoint || !endPoint
                ? "not-allowed"
                : "pointer",
            fontWeight: 600,
          }}
        >
          {running ? "Running..." : "Find Path"}
        </button>

        <button
          onClick={reset}
          style={{
            padding: "9px 16px",
            border: "1px solid #4b5563",
            borderRadius: "6px",
            background: "#1f2937",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </header>

      <div
        style={{
          position: "absolute",
          zIndex: 1000,
          top: "88px",
          left: "20px",
          padding: "10px 14px",
          background: "rgba(17, 24, 39, 0.92)",
          borderRadius: "7px",
          color: "#fff",
          fontSize: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ marginBottom: "6px" }}>
          <span
            style={{
              display: "inline-block",
              width: "9px",
              height: "9px",
              borderRadius: "50%",
              background: COLORS.start,
              marginRight: "7px",
            }}
          />
          Start
        </div>

        <div style={{ marginBottom: "6px" }}>
          <span
            style={{
              display: "inline-block",
              width: "9px",
              height: "9px",
              borderRadius: "50%",
              background: COLORS.explored,
              marginRight: "7px",
            }}
          />
          Explored
        </div>

        <div>
          <span
            style={{
              display: "inline-block",
              width: "9px",
              height: "9px",
              borderRadius: "50%",
              background: COLORS.end,
              marginRight: "7px",
            }}
          />
          Shortest path / End
        </div>
      </div>

      <main style={{ flex: 1 }}>
        <MapContainer
          center={[27.7172, 85.324]}
          zoom={13}
          style={{
            height: "100%",
            width: "100%",
          }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          <MapClickHandler onMapClick={handleMapClick} />

          {exploredNodes.map((position, index) => (
            <CircleMarker
              key={index}
              center={position}
              radius={2.5}
              pathOptions={{
                color: COLORS.explored,
                fillColor: COLORS.explored,
                fillOpacity: 0.7,
                weight: 0,
              }}
            />
          ))}

          {pathNodes.length > 1 && (
            <Polyline
              positions={pathNodes}
              pathOptions={{
                color: COLORS.path,
                weight: 6,
                opacity: 0.95,
              }}
            />
          )}

          {startPoint && (
            <CircleMarker
              center={[startPoint.lat, startPoint.lng]}
              radius={9}
              pathOptions={{
                color: "#ffffff",
                fillColor: COLORS.start,
                fillOpacity: 1,
                weight: 3,
              }}
            />
          )}

          {endPoint && (
            <CircleMarker
              center={[endPoint.lat, endPoint.lng]}
              radius={9}
              pathOptions={{
                color: "#ffffff",
                fillColor: COLORS.end,
                fillOpacity: 1,
                weight: 3,
              }}
            />
          )}
        </MapContainer>
      </main>

      {stats && (
        <footer
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "40px",
            padding: "11px",
            background: "#111827",
            color: "#d1d5db",
            borderTop: "1px solid #374151",
            fontSize: "13px",
          }}
        >
          <span>
            Distance <strong>{stats.distance} km</strong>
          </span>

          <span>
            Explored <strong>{stats.explored}</strong> nodes
          </span>

          <span>
            Path <strong>{stats.path}</strong> nodes
          </span>
        </footer>
      )}
    </div>
  );
}

export default App;
