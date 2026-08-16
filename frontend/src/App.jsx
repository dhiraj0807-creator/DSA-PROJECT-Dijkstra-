import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const COLORS = {
  start: "#22c55e",
  end: "#ef4444",
  explored: "#16a34a",
  path: "#dc2626",
};

function createPinIcon(type, label) {
  return L.divIcon({
    className: "map-pin-wrapper",
    html: `<span class="map-pin map-pin--${type}" aria-label="${label}"><span class="map-pin__dot"></span></span>`,
    iconSize: [28, 38], iconAnchor: [14, 38], tooltipAnchor: [0, -34], popupAnchor: [0, -36],
  });
}

const startIcon = createPinIcon("start", "Start");
const destinationIcon = createPinIcon("destination", "Destination");

// How many animation ticks we spread the whole exploration/path across.
// Batching several edges per tick keeps the "frontier spreading outward"
// feel even when a route explores thousands of road segments, without
// making the animation take forever (or the browser choke on one timer
// per edge).
const EXPLORE_TICKS = 220;
const PATH_TICKS = 60;
// Drawing every edge from a very large search can overwhelm a browser. We
// keep the first real relaxation segments in their actual order; no roads
// are invented. The route itself is always drawn completely.
const MAX_EXPLORED_SEGMENTS = 7000;

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

function speedToDelayMs(speedValue) {
  // speedValue: 1 (slow) .. 100 (fast) -> delay in ms per animation tick
  return 220 - speedValue * 2;
}

export default function App() {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [status, setStatus] = useState("Click the map to select a starting point.");
  const [isRunning, setIsRunning] = useState(false);
  const [isAnimatingPath, setIsAnimatingPath] = useState(false);
  const [exploredSegments, setExploredSegments] = useState([]);
  const [pathSegments, setPathSegments] = useState([]);
  const [stats, setStats] = useState(null);
  const [speed, setSpeed] = useState(70); // 1 (slow) - 100 (fast)

  const timerRef = useRef(null);
  const requestRef = useRef(null);
  const runIdRef = useRef(0);

  const clearPendingTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelActiveWork = () => {
    runIdRef.current += 1;
    clearPendingTimer();
    if (requestRef.current) {
      requestRef.current.abort();
      requestRef.current = null;
    }
  };

  useEffect(() => () => {
    // Do not let an old request or timer update an unmounted map component.
    runIdRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (requestRef.current) requestRef.current.abort();
  }, []);

  const handleMapClick = (latlng) => {
    if (isRunning || isAnimatingPath) return;

    if (!startPoint) {
      setStartPoint(latlng);
      setStatus("Start selected — click the map to select destination.");
      return;
    }

    if (!endPoint) {
      setEndPoint(latlng);
      setStatus("Ready — find the shortest path.");
      return;
    }

    // Both points are already set and a run has completed — treat this
    // click as the start of a brand new selection instead of forcing a
    // manual Reset first.
    setStartPoint(latlng);
    setEndPoint(null);
    setExploredSegments([]);
    setPathSegments([]);
    setStats(null);
    setStatus("New start selected — click the map to select destination.");
  };

  const animateExploration = (edges, onDone, runId) => {
    const chunkSize = Math.max(1, Math.ceil(edges.length / EXPLORE_TICKS));
    const delay = speedToDelayMs(speed);
    const revealed = [];
    let i = 0;

    const tick = () => {
      if (runId !== runIdRef.current) return;

      const next = edges.slice(i, i + chunkSize);
      for (const edge of next) {
        if (revealed.length < MAX_EXPLORED_SEGMENTS && edge.geometry && edge.geometry.length > 1) {
          revealed.push(edge.geometry);
        }
      }
      i += chunkSize;
      setExploredSegments([...revealed]);
      const displayNote = edges.length > MAX_EXPLORED_SEGMENTS
        ? ` (showing the first ${MAX_EXPLORED_SEGMENTS})`
        : "";
      setStatus(`Dijkstra is exploring the road network... ${Math.min(i, edges.length)} of ${edges.length}${displayNote}`);

      if (i < edges.length) {
        timerRef.current = setTimeout(tick, delay);
      } else {
        if (runId === runIdRef.current) onDone();
      }
    };

    tick();
  };

  const animatePath = (edges, onDone, runId) => {
    const chunkSize = Math.max(1, Math.ceil(edges.length / PATH_TICKS));
    const delay = Math.max(15, speedToDelayMs(speed) / 2);
    const revealed = [];
    let i = 0;

    const tick = () => {
      if (runId !== runIdRef.current) return;

      const next = edges.slice(i, i + chunkSize);
      for (const edge of next) {
        if (edge.geometry && edge.geometry.length > 1) {
          revealed.push(edge.geometry);
        }
      }
      i += chunkSize;
      setPathSegments([...revealed]);

      if (i < edges.length) {
        timerRef.current = setTimeout(tick, delay);
      } else {
        if (runId === runIdRef.current) onDone();
      }
    };

    tick();
  };

  const runDijkstra = async () => {
    if (!startPoint || !endPoint) {
      setStatus("Please select both a start and a destination point first.");
      return;
    }

    cancelActiveWork();
    const runId = runIdRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setIsRunning(true);
    setIsAnimatingPath(false);
    setExploredSegments([]);
    setPathSegments([]);
    setStats(null);
    setStatus("Preparing Dijkstra exploration...");

    let data;
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
        signal: controller.signal,
      });

      if (runId !== runIdRef.current) return;
      requestRef.current = null;

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus(err.detail || "The backend rejected this request.");
        setIsRunning(false);
        return;
      }

      data = await res.json();
    } catch (err) {
      if (err.name === "AbortError" || runId !== runIdRef.current) return;
      setStatus("Could not connect to the backend. Make sure FastAPI is running on port 8000.");
      setIsRunning(false);
      return;
    }

    if (runId !== runIdRef.current) return;
    // Replace the click markers with the exact road nodes used by Dijkstra,
    // so the visible endpoints connect to the displayed route.
    setStartPoint({ lat: data.source.lat, lng: data.source.lon });
    setEndPoint({ lat: data.target.lat, lng: data.target.lon });

    setStatus("Dijkstra is exploring the road network...");

    animateExploration(data.explored_edges, () => {
      setStatus("Destination reached — displaying shortest route...");
      setIsRunning(false);
      setIsAnimatingPath(true);

      timerRef.current = setTimeout(() => {
        if (runId !== runIdRef.current) return;
        setStatus("Destination reached — displaying shortest route...");
        animatePath(data.path_edges, () => {
          setStats({
            distance_km: data.distance_km,
            nodes_explored: data.nodes_explored,
            path_length: data.path.length,
            execution_time_ms: data.execution_time_ms,
          });
          setStatus("Shortest route found");
          setIsAnimatingPath(false);
        }, runId);
      }, 300);
    }, runId);
  };

  const reset = () => {
    cancelActiveWork();
    setStartPoint(null);
    setEndPoint(null);
    setExploredSegments([]);
    setPathSegments([]);
    setStats(null);
    setIsRunning(false);
    setIsAnimatingPath(false);
    setStatus("Click the map to select a starting point.");
  };

  const busy = isRunning || isAnimatingPath;

  return (
    <div className="app-shell" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        className="project-header"
        style={{
          padding: "12px 20px",
          background: "#1e293b",
          color: "white",
          display: "flex",
          alignItems: "center",
          gap: "20px",
          flexWrap: "wrap",
          borderBottom: "1px solid #334155",
        }}
      >
        <div className="title-block">
          <p>COMPUTER ENGINEERING · DSA VISUALIZER</p>
          <h1>DIJKSTRA PATHFINDER</h1>
          <small>Kathmandu Road Network · Real OpenStreetMap Data</small>
        </div>

        <span className={`status-badge ${busy ? "status-badge--running" : stats ? "status-badge--complete" : ""}`} style={{ flex: 1, minWidth: "220px" }}><i />{status}</span>

        <label className="speed-control" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>Animation speed</span> Slow
          <input
            type="range"
            min="1"
            max="100"
            value={speed}
            onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
            style={{ width: "90px" }}
            disabled={busy}
          />
          Fast
        </label>

        <button
          onClick={runDijkstra}
          disabled={busy || !startPoint || !endPoint}
          style={{
            padding: "8px 16px",
            background: busy || !startPoint || !endPoint ? "#334155" : "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: busy || !startPoint || !endPoint ? "not-allowed" : "pointer",
            fontWeight: "bold",
            fontSize: "0.9rem",
          }}
        >
          {busy ? "Dijkstra Running..." : "Find Shortest Path"}
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
            fontSize: "0.9rem",
          }}
        >
          Reset
        </button>
      </div>

      {/* Legend */}
      <div
        className="map-legend"
        style={{
          padding: "8px 20px",
          background: "#1e293b",
          display: "flex",
          gap: "20px",
          fontSize: "0.8rem",
          borderBottom: "1px solid #334155",
        }}
      >
        {[
          { color: COLORS.start, label: "Start" },
          { color: COLORS.end, label: "Destination" },
          { color: COLORS.explored, label: "Dijkstra exploration" },
          { color: COLORS.path, label: "Shortest route" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px", color: "#cbd5e1" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: color }} />
            {label}
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="map-frame" style={{ flex: 1 }}>
        <MapContainer
          center={[27.7172, 85.324]}
          zoom={14}
          preferCanvas={true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          />

          <MapClickHandler onMapClick={handleMapClick} />

          {/* All explored road edges drawn as one multi-polyline layer,
              instead of thousands of separate React components. */}
          {exploredSegments.length > 0 && (
            <Polyline
              positions={exploredSegments}
              pathOptions={{ color: COLORS.explored, weight: 2.5, opacity: 0.68, lineCap: "round" }}
            />
          )}

          {pathSegments.length > 0 && (
            <Polyline
              positions={pathSegments}
              pathOptions={{ color: COLORS.path, weight: 6, opacity: 0.96, lineCap: "round", lineJoin: "round" }}
            />
          )}

          {startPoint && (
            <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon}>
              <Tooltip direction="top" offset={[0, -34]}>Start</Tooltip>
              <Popup><strong>Start</strong><br />Snapped road-network node</Popup>
            </Marker>
          )}

          {endPoint && (
            <Marker position={[endPoint.lat, endPoint.lng]} icon={destinationIcon}>
              <Tooltip direction="top" offset={[0, -34]}>Destination</Tooltip>
              <Popup><strong>Destination</strong><br />Snapped road-network node</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Stats */}
      {stats && (
        <div
          className="result-card"
          style={{
            padding: "10px 20px",
            background: "#1e293b",
            color: "#f1f5f9",
            display: "flex",
            gap: "30px",
            fontSize: "0.9rem",
            borderTop: "1px solid #334155",
          }}
        >
          <span className="result-title">Shortest route found<br /><strong>{stats.distance_km} km</strong></span>
          <span>
            Nodes explored: <strong>{stats.nodes_explored}</strong>
          </span>
          <span>
            Path nodes: <strong>{stats.path_length}</strong>
          </span>
          <span>
            Algorithm time: <strong>{stats.execution_time_ms} ms</strong>
          </span>
        </div>
      )}
    </div>
  );
}
