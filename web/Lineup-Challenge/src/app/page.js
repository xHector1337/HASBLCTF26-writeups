"use client";
import { useState, useEffect, useRef } from "react";

/* HINT #1: The Goalkeeper is Polish. */

const POSITIONS_4231 = [
  { id: "ST",   label: "ST",  row: 1, col: 3 },
  { id: "LW",   label: "LW",  row: 2, col: 1 },
  { id: "CAM",  label: "CAM", row: 2, col: 3 },
  { id: "RW",   label: "RW",  row: 2, col: 5 },
  { id: "CDM2", label: "CDM", row: 3, col: 2 },
  { id: "CDM1", label: "CDM", row: 3, col: 4 },
  { id: "LB",   label: "LB",  row: 4, col: 1 },
  { id: "CB2",  label: "CB",  row: 4, col: 2 },
  { id: "CB1",  label: "CB",  row: 4, col: 4 },
  { id: "RB",   label: "RB",  row: 4, col: 5 },
  { id: "GK",   label: "GK",  row: 5, col: 3 },
];

const GRID_COLS = 6;
const GRID_ROWS = 6;

export default function Home() {
  const [lineup, setLineup] = useState({});
  const [query, setQuery] = useState("");
  const [selectedPos, setSelectedPos] = useState(null);
  const [players, setPlayers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch("/players.txt")
      .then((r) => r.text())
      .then((text) => {
        const lines = text.trim().split("\n").slice(1);
        const parsed = lines.map((line) => {
          const [name, position, age, nationality, club, league] = line.split(",");
          return { name: name?.trim(), position: position?.trim(), age: age?.trim(), nationality: nationality?.trim(), club: club?.trim(), league: league?.trim() };
        }).filter((p) => p.name);
        setPlayers(parsed);
      });
  }, []);

  useEffect(() => {
    if (!query.trim()) { setFiltered([]); return; }
    const q = query.toLowerCase();
    setFiltered(
      players.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.club?.toLowerCase().includes(q) ||
          p.nationality?.toLowerCase().includes(q) ||
          p.position?.toLowerCase().includes(q)
      ).slice(0, 8)
    );
  }, [query, players]);

  const selectPosition = (posId) => {
    setSelectedPos(posId);
    setQuery("");
    setFiltered([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const assignPlayer = (player) => {
    if (!selectedPos) return;
    setLineup((prev) => ({ ...prev, [selectedPos]: player.name }));
    setSelectedPos(null);
    setQuery("");
    setFiltered([]);
    setResult(null);
  };

  const removePlayer = (posId, e) => {
    e.stopPropagation();
    setLineup((prev) => { const next = { ...prev }; delete next[posId]; return next; });
    setResult(null);
  };

  const submitLineup = async () => {
    const filled = POSITIONS_4231.filter((p) => lineup[p.id]);
    if (filled.length < 11) {
      setResult({ type: "error", message: `Fill all 11 positions first. (${filled.length}/11 filled)` });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineup }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ type: "success", flag: data.flag });
      } else {
        setResult({ type: "wrong", message: data.message });
      }
    } catch {
      setResult({ type: "error", message: "Network error." });
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setLineup({});
    setResult(null);
    setSelectedPos(null);
    setQuery("");
  };

  const filledCount = POSITIONS_4231.filter((p) => lineup[p.id]).length;

  const SIDEBAR_ORDER = ["GK","RB","CB1","CB2","LB","CDM1","CDM2","CAM","RW","LW","ST"];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <header style={{
        borderBottom: "1px solid #222",
        padding: "1.2rem 2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--surface)",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", letterSpacing: "0.08em", color: "var(--gold)" }}>
            LINEUP CHALLENGE
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", letterSpacing: "0.12em" }}>4-2-3-1</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <a href="/players.txt" target="_blank" style={{
            fontSize: "0.72rem", color: "var(--text-dim)", textDecoration: "none",
            border: "1px solid #333", padding: "0.35rem 0.8rem", borderRadius: "var(--radius)",
            letterSpacing: "0.06em", transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.target.style.color = "var(--text)"; e.target.style.borderColor = "#555"; }}
          onMouseLeave={e => { e.target.style.color = "var(--text-dim)"; e.target.style.borderColor = "#333"; }}>
            PLAYER LIST
          </a>
          <span style={{ fontSize: "0.72rem", color: filledCount === 11 ? "var(--gold)" : "var(--text-dim)", letterSpacing: "0.1em" }}>
            {filledCount}/11
          </span>
        </div>
      </header>

      <main style={{ flex: 1, display: "flex", gap: "0", overflow: "hidden" }}>
        <div style={{
          flex: "0 0 320px", borderRight: "1px solid #222", background: "var(--surface)",
          display: "flex", flexDirection: "column", padding: "1.5rem", gap: "1rem", overflow: "auto",
        }}>
          <div>
            <p style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--text-dim)", marginBottom: "0.6rem" }}>
              {selectedPos ? `ASSIGNING → ${selectedPos}` : "SELECT A POSITION ON THE PITCH"}
            </p>
            <div style={{ position: "relative" }}>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={selectedPos ? "Search player name, club, nationality…" : "Click a position first"}
                disabled={!selectedPos}
                style={{
                  width: "100%", background: selectedPos ? "var(--surface2)" : "#111",
                  border: `1px solid ${selectedPos ? "var(--gold-dim)" : "#2a2a2a"}`,
                  borderRadius: "var(--radius)", color: "var(--text)", padding: "0.6rem 0.9rem",
                  fontSize: "0.85rem", outline: "none", cursor: selectedPos ? "text" : "not-allowed",
                  transition: "border-color 0.15s",
                }}
              />
              {filtered.length > 0 && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                  background: "#1a1a20", border: "1px solid #2a2a36", borderRadius: "var(--radius)",
                  zIndex: 50, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                }}>
                  {filtered.map((p, i) => (
                    <div key={i} onClick={() => assignPlayer(p)} style={{
                      padding: "0.55rem 0.9rem", cursor: "pointer", borderBottom: "1px solid #222",
                      transition: "background 0.1s", display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#252530"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span style={{ fontSize: "0.85rem" }}>{p.name}</span>
                      <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>{p.position} · {p.club}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <p style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--text-dim)", marginBottom: "0.3rem" }}>CURRENT LINEUP</p>
            {SIDEBAR_ORDER.map((posId) => {
              const pos = POSITIONS_4231.find(p => p.id === posId);
              return (
                <div key={posId} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "0.4rem 0.7rem",
                  background: lineup[posId] ? "var(--surface2)" : "transparent",
                  border: `1px solid ${lineup[posId] ? "#2a2a36" : "transparent"}`,
                  borderRadius: "var(--radius)", transition: "all 0.15s",
                }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-dim)", width: "42px", letterSpacing: "0.06em" }}>{posId}</span>
                  <span style={{ fontSize: "0.82rem", flex: 1 }}>{lineup[posId] || <span style={{ color: "#333" }}>—</span>}</span>
                  {lineup[posId] && (
                    <button onClick={(e) => removePlayer(posId, e)}
                      style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0 2px" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--danger)"}
                      onMouseLeave={e => e.currentTarget.style.color = "#444"}>×</button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {result && (
              <div style={{
                padding: "0.7rem 1rem", borderRadius: "var(--radius)",
                background: result.type === "success" ? "rgba(82,224,138,0.08)" : "rgba(224,82,82,0.08)",
                border: `1px solid ${result.type === "success" ? "var(--success)" : "var(--danger)"}`,
                fontSize: "0.78rem",
                color: result.type === "success" ? "var(--success)" : "var(--danger)",
                wordBreak: "break-all",
              }}>
                {result.type === "success"
                  ? <span>🏆 <strong>CORRECT!</strong><br /><span style={{ fontFamily: "monospace", fontSize: "0.82rem", color: "var(--gold)" }}>{result.flag}</span></span>
                  : result.message}
              </div>
            )}
            <button onClick={submitLineup} disabled={loading || filledCount < 11} style={{
              background: filledCount === 11 ? "var(--gold)" : "#1a1a20",
              color: filledCount === 11 ? "#0e0e10" : "#333",
              border: "none", borderRadius: "var(--radius)", padding: "0.7rem",
              fontFamily: "'Bebas Neue', sans-serif", fontSize: "1rem",
              letterSpacing: "0.12em", cursor: filledCount === 11 ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { if (filledCount === 11) e.currentTarget.style.background = "#ffd060"; }}
            onMouseLeave={e => { if (filledCount === 11) e.currentTarget.style.background = "var(--gold)"; }}>
              {loading ? "CHECKING…" : "SUBMIT LINEUP"}
            </button>
            <button onClick={clearAll} style={{
              background: "transparent", color: "var(--text-dim)", border: "1px solid #222",
              borderRadius: "var(--radius)", padding: "0.5rem", fontSize: "0.72rem",
              letterSpacing: "0.1em", cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "#444"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "#222"; }}>
              CLEAR ALL
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--bg)" }}>
          <Pitch lineup={lineup} selectedPos={selectedPos} onSelectPos={selectPosition} onRemove={removePlayer} />
        </div>
      </main>
    </div>
  );
}

function Pitch({ lineup, selectedPos, onSelectPos, onRemove }) {
  const pitchW = 480;
  const pitchH = 660;

  return (
    <div style={{
      width: `${pitchW}px`, height: `${pitchH}px`, position: "relative",
      background: "linear-gradient(180deg, #2d5a1b 0%, #3a7a24 50%, #2d5a1b 100%)",
      borderRadius: "8px", boxShadow: "0 0 0 2px rgba(255,255,255,0.15), 0 24px 80px rgba(0,0,0,0.7)",
      overflow: "visible", flexShrink: 0,
    }}>
      <PitchLines w={pitchW} h={pitchH} />
      {POSITIONS_4231.map((pos) => {
        const x = (pos.col / GRID_COLS) * pitchW;
        const y = (pos.row / GRID_ROWS) * pitchH;
        const isSelected = selectedPos === pos.id;
        const hasPlayer = !!lineup[pos.id];

        return (
          <div key={pos.id} onClick={() => onSelectPos(pos.id)} style={{
            position: "absolute", left: `${x}px`, top: `${y}px`,
            transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column",
            alignItems: "center", gap: "4px", cursor: "pointer", zIndex: 10, transition: "transform 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.07)"}
          onMouseLeave={e => e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)"}>
            <div style={{
              width: "54px", height: "54px", borderRadius: "50%",
              background: isSelected ? "var(--gold)" : hasPlayer ? "rgba(20,20,28,0.9)" : "rgba(255,255,255,0.08)",
              border: isSelected ? "2px solid #ffd060" : hasPlayer ? "2px solid rgba(255,255,255,0.3)" : "2px dashed rgba(255,255,255,0.3)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              boxShadow: isSelected ? "0 0 0 4px rgba(240,192,64,0.25)" : hasPlayer ? "0 4px 16px rgba(0,0,0,0.5)" : "none",
              transition: "all 0.15s",
            }}>
              {hasPlayer
                ? <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>⚽</span>
                : <span style={{ fontSize: "0.62rem", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em", color: isSelected ? "#0e0e10" : "rgba(255,255,255,0.6)" }}>{pos.label}</span>
              }
            </div>
            {hasPlayer
              ? <div style={{ background: "rgba(10,10,14,0.92)", borderRadius: "4px", padding: "2px 7px", maxWidth: "90px", textAlign: "center" }}>
                  <span style={{ fontSize: "0.62rem", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "80px" }}>
                    {lineup[pos.id].split(" ").slice(-1)[0]}
                  </span>
                </div>
              : <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>{pos.label}</span>
            }
          </div>
        );
      })}
    </div>
  );
}

function PitchLines({ w, h }) {
  const s = { position: "absolute", background: "rgba(255,255,255,0.18)", pointerEvents: "none" };
  const circle = (style) => <div style={{ position: "absolute", borderRadius: "50%", background: "transparent", border: "2px solid rgba(255,255,255,0.18)", pointerEvents: "none", ...style }} />;
  const dot = (style) => <div style={{ position: "absolute", borderRadius: "50%", background: "rgba(255,255,255,0.3)", pointerEvents: "none", ...style }} />;

  return (
    <>
      <div style={{ ...s, left: "10%", right: "10%", top: "10%", bottom: "10%", border: "2px solid rgba(255,255,255,0.18)", background: "transparent", borderRadius: "4px" }} />
      <div style={{ ...s, left: "50%", top: "10%", bottom: "10%", width: "2px", transform: "translateX(-50%)" }} />
      {circle({ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "80px", height: "80px" })}
      <div style={{ ...s, left: "25%", right: "25%", top: "10%", height: "80px", background: "transparent", border: "2px solid rgba(255,255,255,0.18)", borderTop: "none" }} />
      <div style={{ ...s, left: "25%", right: "25%", bottom: "10%", height: "80px", background: "transparent", border: "2px solid rgba(255,255,255,0.18)", borderBottom: "none" }} />
      {dot({ left: "50%", top: "10%", transform: "translateX(-50%)", width: "14px", height: "14px" })}
      {dot({ left: "50%", bottom: "10%", transform: "translateX(-50%)", width: "14px", height: "14px" })}
      {dot({ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "10px", height: "10px" })}
    </>
  );
}