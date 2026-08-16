import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";
const COLORS = { start: "#22c55e", end: "#ef4444", explored: "#16a34a", path: "#dc2626" };
const EXPLORE_TICKS = 220;
const PATH_TICKS = 60;
const EXPLORE_DELAY_MS = 75;
const PATH_DELAY_MS = 32;
const MAX_EXPLORED_SEGMENTS = 7000;

function createPinIcon(type, label) {
  return L.divIcon({
    className: "map-pin-wrapper",
    html: `<span class="map-pin map-pin--${type}" aria-label="${label}"><span class="map-pin__dot"></span></span>`,
    iconSize: [28, 38], iconAnchor: [14, 38], tooltipAnchor: [0, -34], popupAnchor: [0, -36],
  });
}

const startIcon = createPinIcon("start", "Start");
const destinationIcon = createPinIcon("destination", "Destination");

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click(e) { onMapClick(e.latlng); } });
  return null;
}

export default function App() {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [status, setStatus] = useState("Click on the map to select a starting point.");
  const [isRunning, setIsRunning] = useState(false);
  const [isAnimatingPath, setIsAnimatingPath] = useState(false);
  const [exploredSegments, setExploredSegments] = useState([]);
  const [pathSegments, setPathSegments] = useState([]);
  const [stats, setStats] = useState(null);
  const timerRef = useRef(null);
  const requestRef = useRef(null);
  const runIdRef = useRef(0);

  const clearPendingTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };
  const cancelActiveWork = () => {
    runIdRef.current += 1;
    clearPendingTimer();
    if (requestRef.current) { requestRef.current.abort(); requestRef.current = null; }
  };

  useEffect(() => () => {
    runIdRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (requestRef.current) requestRef.current.abort();
  }, []);

  const handleMapClick = (latlng) => {
    if (isRunning || isAnimatingPath) return;
    if (!startPoint) { setStartPoint(latlng); setStatus("Start selected. Select a destination."); return; }
    if (!endPoint) { setEndPoint(latlng); setStatus("Ready to find the shortest route."); return; }
    setStartPoint(latlng);
    setEndPoint(null);
    setExploredSegments([]);
    setPathSegments([]);
    setStats(null);
    setStatus("New start selected. Select a destination.");
  };

  const animateExploration = (edges, onDone, runId) => {
    const chunkSize = Math.max(1, Math.ceil(edges.length / EXPLORE_TICKS));
    const revealed = [];
    let i = 0;
    const tick = () => {
      if (runId !== runIdRef.current) return;
      const next = edges.slice(i, i + chunkSize);
      for (const edge of next) {
        if (revealed.length < MAX_EXPLORED_SEGMENTS && edge.geometry && edge.geometry.length > 1) revealed.push(edge.geometry);
      }
      i += chunkSize;
      setExploredSegments([...revealed]);
      if (i < edges.length) timerRef.current = setTimeout(tick, EXPLORE_DELAY_MS);
      else if (runId === runIdRef.current) onDone();
    };
    tick();
  };

  const animatePath = (edges, onDone, runId) => {
    const chunkSize = Math.max(1, Math.ceil(edges.length / PATH_TICKS));
    const revealed = [];
    let i = 0;
    const tick = () => {
      if (runId !== runIdRef.current) return;
      const next = edges.slice(i, i + chunkSize);
      for (const edge of next) if (edge.geometry && edge.geometry.length > 1) revealed.push(edge.geometry);
      i += chunkSize;
      setPathSegments([...revealed]);
      if (i < edges.length) timerRef.current = setTimeout(tick, PATH_DELAY_MS);
      else if (runId === runIdRef.current) onDone();
    };
    tick();
  };

  const runDijkstra = async () => {
    if (!startPoint || !endPoint) { setStatus("Please select both a start and a destination point first."); return; }
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_lat: startPoint.lat, start_lon: startPoint.lng, end_lat: endPoint.lat, end_lon: endPoint.lng }),
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
    setStartPoint({ lat: data.source.lat, lng: data.source.lon });
    setEndPoint({ lat: data.target.lat, lng: data.target.lon });
    setStatus("Dijkstra is exploring the road network...");
    animateExploration(data.explored_edges, () => {
      setStatus("Destination reached. Displaying shortest route...");
      setIsRunning(false);
      setIsAnimatingPath(true);
      timerRef.current = setTimeout(() => {
        if (runId !== runIdRef.current) return;
        animatePath(data.path_edges, () => {
          setStats({ distance_km: data.distance_km, nodes_explored: data.nodes_explored, path_length: data.path.length, execution_time_ms: data.execution_time_ms });
          setStatus("Shortest route found.");
          setIsAnimatingPath(false);
        }, runId);
      }, 300);
    }, runId);
  };

  const reset = () => {
    cancelActiveWork();
    setStartPoint(null); setEndPoint(null); setExploredSegments([]); setPathSegments([]); setStats(null);
    setIsRunning(false); setIsAnimatingPath(false);
    setStatus("Click on the map to select a starting point.");
  };
  const busy = isRunning || isAnimatingPath;

  return (
    <div className="app-shell">
      <header className="project-header">
        <div className="title-block">
          <p className="eyebrow">DSA Project</p>
          <h1>Implementation of Dijkstra for Route Visualization for Kathmandu</h1>
          <div className="student-credits">
            <span>BCT Students</span>
            <p>Dhiraj Shrestha — 081BCT031</p>
            <p>Janak Bhatt — 081BCT036</p>
            <p>Himanshu Chand — 081BCT034</p>
          </div>
        </div>
      </header>

      <main className="map-area">
        <div className="map-heading">
          <div><p className="section-label">Kathmandu road network</p><h2>Select two points on the map</h2></div>
          <p className="map-source">OpenStreetMap road data</p>
        </div>
        <div className="map-frame">
          <MapContainer center={[27.7172, 85.324]} zoom={14} preferCanvas={true} style={{ height: "100%", width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>' />
            <MapClickHandler onMapClick={handleMapClick} />
            {exploredSegments.length > 0 && <Polyline positions={exploredSegments} pathOptions={{ color: COLORS.explored, weight: 2.5, opacity: 0.68, lineCap: "round" }} />}
            {pathSegments.length > 0 && <Polyline positions={pathSegments} pathOptions={{ color: COLORS.path, weight: 6, opacity: 0.96, lineCap: "round", lineJoin: "round" }} />}
            {startPoint && <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon}><Tooltip direction="top" offset={[0, -34]}>Start</Tooltip><Popup><strong>Start</strong><br />Snapped road-network node</Popup></Marker>}
            {endPoint && <Marker position={[endPoint.lat, endPoint.lng]} icon={destinationIcon}><Tooltip direction="top" offset={[0, -34]}>Destination</Tooltip><Popup><strong>Destination</strong><br />Snapped road-network node</Popup></Marker>}
          </MapContainer>
          <div className="map-legend" aria-label="Map legend">
            <div><i className="legend-marker legend-marker--start" />Start</div>
            <div><i className="legend-marker legend-marker--destination" />Destination</div>
            <div><i className="legend-line legend-line--explored" />Dijkstra exploration</div>
            <div><i className="legend-line legend-line--path" />Shortest route</div>
          </div>
        </div>
      </main>

      <section className="control-panel" aria-label="Route controls and status">
        <div className={`status-badge ${busy ? "status-badge--running" : stats ? "status-badge--complete" : ""}`}><i /><span>Status</span><p>{status}</p></div>
        <div className="route-controls">
          <button className="primary-button" onClick={runDijkstra} disabled={busy || !startPoint || !endPoint}>{busy ? "Dijkstra Running..." : "Find Shortest Route"}</button>
          <button className="reset-button" onClick={reset}>Reset</button>
        </div>
      </section>

      {stats && <section className="result-card" aria-live="polite">
        <div className="result-route"><p>Shortest Route Found</p><strong>Distance: {stats.distance_km.toFixed(2)} km</strong></div>
        <dl className="result-stats">
          <div><dt>Nodes Explored</dt><dd>{stats.nodes_explored}</dd></div>
          <div><dt>Path Nodes</dt><dd>{stats.path_length}</dd></div>
          <div><dt>Computational Time</dt><dd>{stats.execution_time_ms} ms</dd></div>
        </dl>
      </section>}
    </div>
  );
}
