import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const COLORS = {
  start: "#22c55e",
  end: "#ef4444",
  explored: "#3b82f6",
  path: "#f59e0b",
};

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
  const [status, setStatus] = useState("Click on the map to choose a starting point");
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
      setStatus("Start point selected. Click the map again to choose the destination.");
      return;
    }

    if (!endPoint) {
      setEndPoint(latlng);
      setStatus("Start and destination selected. Press Find Path.");
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
    setStatus("New start point selected. Click the map again to choose the destination.");
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
      setStatus(`Dijkstra relaxing roads... ${Math.min(i, edges.length)} of ${edges.length}${displayNote}`);

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
    setStatus("Sending request to backend...");

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

    setStatus(`Dijkstra finalized ${data.nodes_explored} nodes. Showing road relaxations...`);

    animateExploration(data.explored_edges, () => {
      setStatus("Destination reached. Building shortest path...");
      setIsRunning(false);
      setIsAnimatingPath(true);

      timerRef.current = setTimeout(() => {
        if (runId !== runIdRef.current) return;
        setStatus("Displaying shortest route...");
        animatePath(data.path_edges, () => {
          setStats({
            distance_km: data.distance_km,
            nodes_explored: data.nodes_explored,
            path_length: data.path.length,
            execution_time_ms: data.execution_time_ms,
          });
          setStatus(`Shortest path found — ${data.distance_km} km`);
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
    setStatus("Click on the map to choose a starting point");
  };

  const busy = isRunning || isAnimatingPath;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0f172a" }}>
      {/* Header */}
      <div
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
        <h1 style={{ margin: 0, fontSize: "1.2rem", color: "#f1f5f9" }}>Dijkstra Pathfinder</h1>

        <span style={{ flex: 1, color: "#94a3b8", fontSize: "0.9rem", minWidth: "220px" }}>{status}</span>

        <label style={{ color: "#94a3b8", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px" }}>
          Slow
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
          {busy ? "Running..." : "Find Path"}
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
          { color: COLORS.explored, label: "Successful edge relaxations" },
          { color: COLORS.path, label: "Shortest path" },
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
              pathOptions={{ color: COLORS.explored, weight: 2.5, opacity: 0.55 }}
            />
          )}

          {pathSegments.length > 0 && (
            <Polyline
              positions={pathSegments}
              pathOptions={{ color: COLORS.path, weight: 6, opacity: 0.95, lineCap: "round" }}
            />
          )}

          {startPoint && (
            <CircleMarker
              center={[startPoint.lat, startPoint.lng]}
              radius={9}
              pathOptions={{ color: COLORS.start, fillColor: COLORS.start, fillOpacity: 1, weight: 2 }}
            />
          )}

          {endPoint && (
            <CircleMarker
              center={[endPoint.lat, endPoint.lng]}
              radius={9}
              pathOptions={{ color: COLORS.end, fillColor: COLORS.end, fillOpacity: 1, weight: 2 }}
            />
          )}
        </MapContainer>
      </div>

      {/* Stats */}
      {stats && (
        <div
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
          <span>
            Distance: <strong>{stats.distance_km} km</strong>
          </span>
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
