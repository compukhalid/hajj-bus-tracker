import { useState, useEffect, useRef, useCallback } from "react";
import {
  saveBusData, saveBusConfigs, saveAdminPin, saveOpenBoarding,
  listenToAllBuses, listenToBusConfigs, listenToAdminPin, listenToOpenBoarding
} from "./firebase";

/* ═══════ CONSTANTS ═══════ */
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
const DEFAULT_ADMIN_PIN = "0000";
const BUS_CAPACITY = 55;
const STATUS_AR = { stopped: "متوقف", boarding: "ركوب الحجاج", commuting: "يتحرك" };

const INITIAL_BUSES = [
  { id: 1, name: "باص 1", color: "#C8A951", supervisor: "أحمد محمد", pin: "1111" },
  { id: 2, name: "باص 2", color: "#3B82F6", supervisor: "علي حسن", pin: "2222" },
  { id: 3, name: "باص 3", color: "#10B981", supervisor: "خالد عبدالله", pin: "3333" },
  { id: 4, name: "باص 4", color: "#E8533F", supervisor: "سعيد إبراهيم", pin: "4444" },
  { id: 5, name: "باص 5", color: "#8B5CF6", supervisor: "محمود يوسف", pin: "5555" },
  { id: 6, name: "باص 6", color: "#EC4899", supervisor: "عمر سالم", pin: "6666" },
  { id: 7, name: "باص 7", color: "#06B6D4", supervisor: "فهد ناصر", pin: "7777" },
];

const INITIAL_BUS_DATA = INITIAL_BUSES.map(b => ({
  id: b.id, students: [], status: "stopped", destination: "",
  location: { lat: 26.2235 + (b.id - 4) * 0.008, lng: 50.5876 + (b.id - 4) * 0.006 }
}));

let _pid = Date.now();
const nid = () => `P${++_pid}`;

/* ═══════ THEMES ═══════ */
const THEMES = {
  dark: {
    bg: "#0F172A", bgCard: "rgba(255,255,255,0.04)", bgCardHover: "rgba(255,255,255,0.08)",
    bgInput: "rgba(255,255,255,0.06)", bgTopBar: "rgba(15,23,42,0.95)",
    text: "#F1F5F9", textMuted: "#94A3B8", textDim: "#64748B",
    border: "rgba(255,255,255,0.08)", borderInput: "rgba(255,255,255,0.12)",
    borderTopBar: "rgba(255,255,255,0.06)",
    modalBg: "#1E293B", modalBorder: "rgba(255,255,255,0.1)",
    loginBg: "linear-gradient(180deg,#0B1120 0%,#152238 50%,#0F172A 100%)",
    loginCard: "rgba(30,41,59,0.7)", loginInput: "rgba(15,23,42,0.8)",
    scrollThumb: "rgba(255,255,255,0.1)",
  },
  light: {
    bg: "#F1F5F9", bgCard: "rgba(0,0,0,0.03)", bgCardHover: "rgba(0,0,0,0.06)",
    bgInput: "rgba(0,0,0,0.04)", bgTopBar: "rgba(255,255,255,0.95)",
    text: "#1E293B", textMuted: "#475569", textDim: "#64748B",
    border: "rgba(0,0,0,0.08)", borderInput: "rgba(0,0,0,0.12)",
    borderTopBar: "rgba(0,0,0,0.08)",
    modalBg: "#FFFFFF", modalBorder: "rgba(0,0,0,0.1)",
    loginBg: "linear-gradient(180deg,#E2E8F0 0%,#F1F5F9 50%,#E2E8F0 100%)",
    loginCard: "rgba(255,255,255,0.9)", loginInput: "rgba(241,245,249,0.9)",
    scrollThumb: "rgba(0,0,0,0.15)",
  }
};
const getTheme = () => { try { return localStorage.getItem("hbt_theme") || "dark"; } catch(e) { return "dark"; } };
const setThemeStorage = (t) => { try { localStorage.setItem("hbt_theme", t); } catch(e) {} };

/* ═══════ LEAFLET ═══════ */
const useLeaflet = () => {
  const [r, setR] = useState(false);
  useEffect(() => {
    if (window.L) { setR(true); return; }
    if (!document.getElementById("lf-css")) { const l = document.createElement("link"); l.id = "lf-css"; l.rel = "stylesheet"; l.href = LEAFLET_CSS; document.head.appendChild(l); }
    if (!document.getElementById("lf-js")) { const s = document.createElement("script"); s.id = "lf-js"; s.src = LEAFLET_JS; s.onload = () => setR(true); document.head.appendChild(s); }
    else { if (window.L) setR(true); else document.getElementById("lf-js").addEventListener("load", () => setR(true)); }
  }, []);
  return r;
};
const mkIcon = (color, status) => {
  if (!window.L) return null;
  const sc = status === "commuting" ? "#22C55E" : status === "boarding" ? "#C8A951" : "#EF4444";
  return window.L.divIcon({ className: "", iconSize: [40, 40], iconAnchor: [20, 20],
    html: `<svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="11" fill="${color}" stroke="#fff" stroke-width="2.5"/><circle cx="20" cy="20" r="4" fill="#fff"/><circle cx="30" cy="10" r="5" fill="${sc}" stroke="#fff" stroke-width="1.5"/></svg>` });
};

/* ═══════ UI ═══════ */
const StatusPill = ({ status }) => {
  const c = { stopped: ["rgba(239,68,68,0.12)", "#EF4444"], commuting: ["rgba(34,197,94,0.12)", "#22C55E"], boarding: ["rgba(200,169,81,0.15)", "#C8A951"] }[status];
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: c[0], color: c[1] }}>● {STATUS_AR[status]}</span>;
};
const Modal = ({ open, onClose, title, children, width, theme }) => {
  if (!open) return null;
  const t = THEMES[theme || "dark"];
  return (<div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: t.modalBg, borderRadius: 16, border: `1px solid ${t.modalBorder}`, padding: 24, width: "100%", maxWidth: width || 460, maxHeight: "88vh", overflowY: "auto", direction: "rtl", color: t.text }}>
      {title && <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 16 }}>{title}</div>}
      {children}
    </div></div>);
};
const Btn = ({ children, onClick, color, disabled, small, style: s }) => (
  <button onClick={onClick} disabled={disabled} style={{ padding: small ? "6px 12px" : "10px 16px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer", background: color || "#C8A951", color: "#fff", fontWeight: 700, fontSize: small ? 12 : 14, opacity: disabled ? 0.4 : 1, transition: "all 0.2s", fontFamily: "inherit", ...s }}>{children}</button>
);
const Input = ({ value, onChange, placeholder, type, style: s }) => (
  <input type={type || "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", direction: "rtl", boxSizing: "border-box", fontFamily: "inherit", ...s }} />
);

/* ═══════ LOGIN ═══════ */
const LoginPage = ({ onLogin, adminPin, busConfigs, theme, toggleTheme }) => {
  const [pin, setPin] = useState(""); const [error, setError] = useState(""); const [mode, setMode] = useState("supervisor");
  const t = THEMES[theme || "dark"];
  const go = () => {
    if (!pin.trim()) { setError("أدخل الرقم"); return; }
    if (mode === "admin") { if (pin === adminPin) onLogin({ role: "admin" }); else setError("رقم الإدارة غير صحيح"); }
    else { const bus = busConfigs.find(b => b.pin === pin); if (bus) onLogin({ role: "supervisor", busId: bus.id }); else setError("رقم المشرف غير صحيح"); }
  };
  return (
    <div style={{ minHeight: "100vh", background: t.loginBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic',sans-serif", transition: "background 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Amiri:wght@700&display=swap" rel="stylesheet" />
      {/* Theme toggle on login page */}
      <button onClick={toggleTheme} style={{ position: "absolute", top: 20, left: 20, background: theme === "dark" ? "rgba(251,191,36,0.15)" : "rgba(99,102,241,0.15)", border: `1px solid ${theme === "dark" ? "rgba(251,191,36,0.3)" : "rgba(99,102,241,0.3)"}`, color: theme === "dark" ? "#FBBF24" : "#6366F1", borderRadius: 10, padding: "8px 12px", fontSize: 18, cursor: "pointer", transition: "all 0.3s" }}>{theme === "dark" ? "☀️" : "🌙"}</button>
      <div style={{ marginBottom: 24 }}><svg width="120" height="100" viewBox="0 0 120 100" fill="none"><rect x="10" y="20" width="100" height="55" rx="12" fill="#C8A951" opacity="0.9" /><rect x="15" y="28" width="25" height="20" rx="4" fill="#0B1120" opacity="0.7" /><rect x="47" y="28" width="25" height="20" rx="4" fill="#0B1120" opacity="0.7" /><rect x="79" y="28" width="25" height="20" rx="4" fill="#0B1120" opacity="0.7" /><rect x="10" y="55" width="100" height="8" fill="#A67C2E" /><rect x="45" y="55" width="30" height="20" rx="3" fill="#1E293B" /><circle cx="30" cy="80" r="8" fill="#334155" stroke="#C8A951" strokeWidth="3" /><circle cx="90" cy="80" r="8" fill="#334155" stroke="#C8A951" strokeWidth="3" /></svg></div>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        {mode === "admin" ? <div style={{ fontSize: 28, fontWeight: 800, color: "#C8A951", fontFamily: "'Amiri',serif" }}>لوحة الإدارة</div>
          : <><div style={{ fontSize: 36, fontWeight: 800, color: "#C8A951", fontFamily: "'Amiri',serif", lineHeight: 1.2 }}>حملة المواسم</div><div style={{ fontSize: 16, color: "rgba(203,213,225,0.8)", marginTop: 4 }}>نظام متابعة الباصات</div></>}
        <div style={{ width: 60, height: 3, background: "linear-gradient(90deg,transparent,#C8A951,transparent)", margin: "12px auto 0" }} />
      </div>
      <div style={{ width: "100%", maxWidth: 400, background: t.loginCard, borderRadius: 16, padding: "32px 24px", marginTop: 32, border: `1px solid ${t.border}` }}>
        <div style={{ textAlign: "center", fontSize: 15, color: t.textMuted, marginBottom: 16 }}>{mode === "supervisor" ? "الرقم الشخصي أو رقم المشرف" : "رقم دخول الإدارة"}</div>
        <input type="password" inputMode="numeric" value={pin} onChange={e => { setPin(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && go()}
          placeholder="أدخل رقمك" style={{ width: "100%", background: t.loginInput, border: `1px solid ${error ? "rgba(239,68,68,0.5)" : t.borderInput}`, color: t.text, borderRadius: 12, padding: "18px 16px", fontSize: 18, textAlign: "center", outline: "none", boxSizing: "border-box", fontFamily: "inherit", letterSpacing: "0.2em" }} />
        {error && <div style={{ color: "#EF4444", fontSize: 13, textAlign: "center", marginTop: 8, fontWeight: 600 }}>{error}</div>}
        <button onClick={go} style={{ width: "100%", padding: 16, borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#C8A951,#A67C2E)", color: "#0B1120", fontSize: 20, fontWeight: 800, marginTop: 16, fontFamily: "inherit" }}>دخول</button>
      </div>
      <button onClick={() => { setMode(mode === "supervisor" ? "admin" : "supervisor"); setPin(""); setError(""); }} style={{ background: "none", border: "none", color: t.textDim, fontSize: 14, marginTop: 24, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>{mode === "supervisor" ? "دخول الإدارة" : "دخول المشرف"}</button>
      <div style={{ marginTop: 32, fontSize: 13, color: t.textDim, textAlign: "center", opacity: 0.7 }}>برمجة وتصميم / خالد محمود المرزوقي</div>
    </div>
  );
};

/* ═══════ MAPS ═══════ */
const AllBusesMap = ({ busesData, busConfigs, onSelectBus }) => {
  const ref = useRef(null); const mapRef = useRef(null); const markers = useRef({}); const ready = useLeaflet();
  useEffect(() => {
    if (!ready || !ref.current || mapRef.current) return; const L = window.L;
    const m = L.map(ref.current, { center: [26.2235, 50.5876], zoom: 13, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: "topright" }).addTo(m); L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(m); mapRef.current = m;
    busesData.forEach(b => { const bc = busConfigs.find(c => c.id === b.id); if (!b.location) return; markers.current[b.id] = L.marker([b.location.lat, b.location.lng], { icon: mkIcon(bc.color, b.status) }).addTo(m).on("click", () => onSelectBus(b.id)); });
    const locs = busesData.filter(b => b.location).map(b => [b.location.lat, b.location.lng]); if (locs.length) m.fitBounds(locs, { padding: [40, 40], maxZoom: 14 });
    return () => { m.remove(); mapRef.current = null; markers.current = {}; };
  }, [ready]);
  useEffect(() => { if (!mapRef.current || !ready) return; busesData.forEach(b => { const bc = busConfigs.find(c => c.id === b.id); const mk = markers.current[b.id]; if (!mk || !b.location) return; mk.setLatLng([b.location.lat, b.location.lng]); mk.setIcon(mkIcon(bc.color, b.status)); }); }, [busesData, ready]);
  return (<div style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 20 }}><div ref={ref} style={{ width: "100%", height: 300 }} />{!ready && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.95)", color: "#64748B", fontSize: 13 }}>جاري التحميل...</div>}</div>);
};
const BusMap = ({ location, status, busColor }) => {
  const ref = useRef(null); const mapRef = useRef(null); const markerRef = useRef(null); const ready = useLeaflet();
  useEffect(() => { if (!ready || !ref.current || !location || mapRef.current) return; const L = window.L; const m = L.map(ref.current, { center: [location.lat, location.lng], zoom: 15, zoomControl: false, attributionControl: false }); L.control.zoom({ position: "topright" }).addTo(m); L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(m); markerRef.current = L.marker([location.lat, location.lng], { icon: mkIcon(busColor, status) }).addTo(m); mapRef.current = m; return () => { m.remove(); mapRef.current = null; }; }, [ready]);
  useEffect(() => { if (!mapRef.current || !markerRef.current || !location) return; markerRef.current.setLatLng([location.lat, location.lng]); markerRef.current.setIcon(mkIcon(busColor, status)); mapRef.current.panTo([location.lat, location.lng], { animate: true }); }, [location, status]);
  return (<div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}><div ref={ref} style={{ width: "100%", height: 220 }} />{!ready && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.95)", color: "#64748B", fontSize: 13 }}>جاري التحميل...</div>}</div>);
};

/* ═══════ ADMIN: PILGRIM MGMT ═══════ */
const PilgrimMgmtPage = ({ busesData, busConfigs, onAdd, onDelete, onEdit, onTransfer, onBulkImport, onBack }) => {
  const [selectedBusId, setSelectedBusId] = useState(1);
  const [addName, setAddName] = useState(""); const [addType, setAddType] = useState("pilgrim"); const [addRoom, setAddRoom] = useState(""); const [addPhone, setAddPhone] = useState(""); const [addFamilyNum, setAddFamilyNum] = useState(""); const [addIsHead, setAddIsHead] = useState(false);
  const [editing, setEditing] = useState(null); const [editName, setEditName] = useState(""); const [editRoom, setEditRoom] = useState(""); const [editPhone, setEditPhone] = useState("");
  const [transferring, setTransferring] = useState(null); const [transferTo, setTransferTo] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false); const [bulkText, setBulkText] = useState(""); const [bulkPreview, setBulkPreview] = useState(null);
  const [search, setSearch] = useState("");
  const currentBus = busesData.find(b => b.id === selectedBusId); const students = currentBus?.students || [];
  const filtered = search.trim() ? students.filter(s => s.name.includes(search.trim())) : students;

  const parseBulk = () => {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean); const valid = [], invalid = [];
    lines.forEach(line => {
      const parts = line.split(/[,\t]/).map(p => p.trim()); if (parts.length < 2) { invalid.push({ line, reason: "تنسيق خاطئ" }); return; }
      const name = parts[0]; const busId = parseInt(parts[1]); if (isNaN(busId) || busId < 1 || busId > 7) { invalid.push({ line, reason: "رقم باص غير صحيح" }); return; }
      const familyNum = parts[2] || ""; const typeRaw = (parts[3] || "h").toLowerCase(); const room = parts[4] || "";
      valid.push({ name, busId, type: typeRaw === "a" ? "admin" : "pilgrim", familyNum, isHead: typeRaw === "head", room });
    });
    const busCounts = {}; busesData.forEach(b => { busCounts[b.id] = b.students.length; });
    const ok = [], skip = []; valid.forEach(e => { if (busCounts[e.busId] >= BUS_CAPACITY) { skip.push({ ...e, reason: `باص ${e.busId} ممتلئ` }); } else { ok.push(e); busCounts[e.busId]++; } });
    setBulkPreview({ valid: ok, invalid: [...invalid, ...skip] });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>→ رجوع</button>
        <div style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>إدارة الحجاج</div></div>
        <Btn onClick={() => setBulkOpen(true)} color="#10B981" small>📋 استيراد جماعي</Btn>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 6 }}>
        {busesData.map(b => { const bc = busConfigs.find(c => c.id === b.id); const active = selectedBusId === b.id; return (<button key={b.id} onClick={() => setSelectedBusId(b.id)} style={{ padding: "10px 14px", borderRadius: 10, border: `2px solid ${active ? bc.color : "rgba(255,255,255,0.08)"}`, background: active ? bc.color + "22" : "rgba(255,255,255,0.03)", color: active ? "#F1F5F9" : "#64748B", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>{bc.name} ({b.students.length}/{BUS_CAPACITY})</button>); })}
      </div>
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10 }}>إضافة شخص جديد</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <Input value={addName} onChange={setAddName} placeholder="الاسم الكامل" />
          <select value={addType} onChange={e => setAddType(e.target.value)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 8, padding: "10px 12px", fontSize: 14, direction: "rtl", fontFamily: "inherit", outline: "none" }}><option value="pilgrim" style={{ background: "#1E293B" }}>🕋 حاج</option><option value="admin" style={{ background: "#1E293B" }}>👤 إداري</option></select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <Input value={addRoom} onChange={setAddRoom} placeholder="رقم الغرفة" />
          <Input value={addPhone} onChange={setAddPhone} placeholder="رقم الهاتف" />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Input value={addFamilyNum} onChange={setAddFamilyNum} placeholder="رقم العائلة" />{addFamilyNum && <label style={{ fontSize: 11, color: "#C8A951", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", cursor: "pointer" }}><input type="checkbox" checked={addIsHead} onChange={e => setAddIsHead(e.target.checked)} /> رب</label>}</div>
        </div>
        <Btn onClick={() => { if (!addName.trim() || students.length >= BUS_CAPACITY) return; onAdd(selectedBusId, { name: addName.trim(), type: addType, room: addRoom.trim(), phone: addPhone.trim(), familyNum: addFamilyNum.trim(), isHead: addIsHead }); setAddName(""); setAddRoom(""); setAddPhone(""); setAddFamilyNum(""); setAddIsHead(false); }} disabled={!addName.trim() || students.length >= BUS_CAPACITY} color="#22C55E" style={{ width: "100%" }}>{students.length >= BUS_CAPACITY ? "الباص ممتلئ" : "+ إضافة"}</Btn>
      </div>
      <Input value={search} onChange={setSearch} placeholder="🔍 ابحث..." style={{ marginBottom: 12 }} />
      <div style={{ display: "grid", gap: 6 }}>
        {filtered.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "#64748B", fontSize: 13 }}>لا يوجد أشخاص</div>}
        {filtered.map(s => {
          const isE = editing === s.id; const isT = transferring === s.id;
          return (<div key={s.id} style={{ padding: 12, borderRadius: 10, background: s.type === "admin" ? "rgba(139,92,246,0.06)" : "rgba(255,255,255,0.03)", border: `1px solid ${s.type === "admin" ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.06)"}` }}>
            {!isE && !isT ? (<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{s.type === "admin" ? "👤 " : s.isHead ? "👑 " : s.familyNum ? "👥 " : "🕋 "}{s.name}</div><div style={{ fontSize: 10, color: "#64748B", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}><span>{s.type === "admin" ? "إداري" : "حاج"}</span>{s.familyNum && <span style={{ color: "#C8A951" }}>عائلة: {s.familyNum}{s.isHead ? " (رب)" : ""}</span>}{s.room && <span>غ{s.room}</span>}{s.phone && <span>📱{s.phone}</span>}</div></div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => { setEditing(s.id); setEditName(s.name); setEditRoom(s.room || ""); setEditPhone(s.phone || ""); }} style={{ background: "rgba(59,130,246,0.15)", border: "none", color: "#60A5FA", borderRadius: 6, padding: "5px 10px", fontSize: 10, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>✏️</button>
                <button onClick={() => { setTransferring(s.id); setTransferTo(""); }} style={{ background: "rgba(139,92,246,0.15)", border: "none", color: "#A78BFA", borderRadius: 6, padding: "5px 10px", fontSize: 10, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>🔄</button>
                <button onClick={() => { if (window.confirm(`حذف ${s.name}؟`)) onDelete(selectedBusId, s.id); }} style={{ background: "rgba(239,68,68,0.15)", border: "none", color: "#EF4444", borderRadius: 6, padding: "5px 10px", fontSize: 10, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>🗑️</button>
              </div></div>
            ) : isE ? (<div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}><Input value={editName} onChange={setEditName} placeholder="الاسم" /><Input value={editRoom} onChange={setEditRoom} placeholder="غرفة" /></div><Input value={editPhone} onChange={setEditPhone} placeholder="هاتف" style={{ marginBottom: 8 }} /><div style={{ display: "flex", gap: 6 }}><Btn onClick={() => { onEdit(selectedBusId, s.id, { name: editName, room: editRoom, phone: editPhone }); setEditing(null); }} color="#22C55E" small>💾</Btn><Btn onClick={() => setEditing(null)} color="transparent" small style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>إلغاء</Btn></div></div>
            ) : (<div><select value={transferTo} onChange={e => setTransferTo(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 6, padding: "8px", fontSize: 12, direction: "rtl", fontFamily: "inherit", outline: "none", marginBottom: 6 }}><option value="">اختر...</option>{busConfigs.filter(b => b.id !== selectedBusId).map(b => { const tb = busesData.find(x => x.id === b.id); return <option key={b.id} value={b.id} disabled={tb.students.length >= BUS_CAPACITY} style={{ background: "#1E293B" }}>{b.name} ({tb.students.length}/{BUS_CAPACITY})</option>; })}</select><div style={{ display: "flex", gap: 6 }}><Btn onClick={() => { if (transferTo) { onTransfer(selectedBusId, s.id, Number(transferTo)); setTransferring(null); } }} disabled={!transferTo} color="#8B5CF6" small>نقل</Btn><Btn onClick={() => setTransferring(null)} color="transparent" small style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>إلغاء</Btn></div></div>)}
          </div>);
        })}
      </div>
      <Modal open={bulkOpen} onClose={() => { setBulkOpen(false); setBulkPreview(null); setBulkText(""); }} title="📋 استيراد جماعي" width={600}>
        {!bulkPreview ? (<div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8, lineHeight: 1.7 }}>التنسيق: <span style={{ color: "#C8A951", fontWeight: 700 }}>الاسم, رقم الباص, رقم العائلة, النوع, رقم الغرفة</span></div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, lineHeight: 1.6 }}>• <b>النوع</b>: head = رب | h = حاج | a = إداري<br />• رقم العائلة والغرفة اختياريان</div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 8, fontFamily: "monospace", direction: "ltr", textAlign: "left", lineHeight: 1.6 }}>محمد أحمد, 1, 1, head, 201<br />فاطمة أحمد, 1, 1, h, 201<br />عبدالله سالم, 2, , h, 305<br />خالد الإبراهيم, 2, , a</div>
          <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder="اكتب أو الصق..." style={{ width: "100%", minHeight: 200, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 8, padding: 12, fontSize: 13, outline: "none", direction: "rtl", boxSizing: "border-box", fontFamily: "monospace", resize: "vertical" }} />
          <Btn onClick={parseBulk} disabled={!bulkText.trim()} color="#10B981" style={{ width: "100%", marginTop: 12 }}>📝 معاينة</Btn>
        </div>) : (<div>
          {bulkPreview.valid.length > 0 && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 13, fontWeight: 700, color: "#22C55E", marginBottom: 8 }}>✅ {bulkPreview.valid.length} شخص:</div><div style={{ maxHeight: 250, overflowY: "auto", background: "rgba(34,197,94,0.05)", borderRadius: 8, padding: 8 }}>{bulkPreview.valid.map((e, i) => <div key={i} style={{ fontSize: 12, color: "#E2E8F0", padding: "4px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between" }}><span>{e.isHead ? "👑" : e.type === "admin" ? "👤" : "🕋"} {e.name}</span><span style={{ color: "#64748B", fontSize: 10 }}>باص {e.busId}{e.familyNum ? ` • عائلة ${e.familyNum}` : ""}</span></div>)}</div></div>}
          {bulkPreview.invalid.length > 0 && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 13, fontWeight: 700, color: "#EF4444", marginBottom: 8 }}>⚠️ {bulkPreview.invalid.length} تجاهل:</div><div style={{ maxHeight: 120, overflowY: "auto", background: "rgba(239,68,68,0.05)", borderRadius: 8, padding: 8 }}>{bulkPreview.invalid.map((e, i) => <div key={i} style={{ fontSize: 11, color: "#94A3B8", padding: "3px 8px" }}>{e.name || e.line} — <span style={{ color: "#EF4444" }}>{e.reason}</span></div>)}</div></div>}
          <div style={{ display: "flex", gap: 8 }}><Btn onClick={() => setBulkPreview(null)} color="transparent" style={{ flex: 1, border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>رجوع</Btn><Btn onClick={() => { if (bulkPreview?.valid?.length) onBulkImport(bulkPreview.valid); setBulkOpen(false); setBulkText(""); setBulkPreview(null); }} disabled={!bulkPreview.valid.length} color="#22C55E" style={{ flex: 2 }}>✅ تأكيد</Btn></div>
        </div>)}
      </Modal>
    </div>
  );
};

/* ═══════ ADMIN: BUS MGMT ═══════ */
const BusMgmtPage = ({ busConfigs, onUpdate, adminPin, onUpdatePin, onBack }) => {
  const [editing, setEditing] = useState(null); const [editSup, setEditSup] = useState(""); const [editPin, setEditPin] = useState("");
  const [pinModal, setPinModal] = useState(false); const [oldPin, setOldPin] = useState(""); const [newPin, setNewPin] = useState(""); const [confirmPin, setConfirmPin] = useState(""); const [pinErr, setPinErr] = useState(""); const [pinOk, setPinOk] = useState(false);
  const changePin = () => { setPinErr(""); setPinOk(false); if (oldPin !== adminPin) { setPinErr("الرقم القديم غير صحيح"); return; } if (!newPin || newPin.length < 4) { setPinErr("4 أرقام على الأقل"); return; } if (newPin !== confirmPin) { setPinErr("غير متطابقين"); return; } onUpdatePin(newPin); setPinOk(true); setOldPin(""); setNewPin(""); setConfirmPin(""); setTimeout(() => { setPinModal(false); setPinOk(false); }, 1500); };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>→ رجوع</button>
        <div style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>إدارة الباصات</div></div>
        <Btn onClick={() => setPinModal(true)} color="#EF4444" small>🔑 كلمة سر الإدارة</Btn>
      </div>
      {busConfigs.map(bc => (<div key={bc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, background: editing === bc.id ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.04)", marginBottom: 10, border: `1px solid ${editing === bc.id ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"}` }}>
        <div style={{ width: 8, height: 48, borderRadius: 4, background: bc.color }} />
        <div style={{ flex: 1 }}>{editing === bc.id ? (<div><Input value={editSup} onChange={setEditSup} placeholder="المشرف" style={{ marginBottom: 8 }} /><Input value={editPin} onChange={setEditPin} placeholder="رقم الدخول" style={{ marginBottom: 10 }} /><div style={{ display: "flex", gap: 6 }}><Btn onClick={() => { onUpdate(busConfigs.map(x => x.id === editing ? { ...x, supervisor: editSup, pin: editPin } : x)); setEditing(null); }} color="#22C55E" small>💾</Btn><Btn onClick={() => setEditing(null)} color="transparent" small style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>إلغاء</Btn></div></div>) : (<div><div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>{bc.name}</div><div style={{ fontSize: 12, color: "#94A3B8" }}>المشرف: {bc.supervisor}</div><div style={{ fontSize: 11, color: "#64748B" }}>رقم: {bc.pin}</div></div>)}</div>
        {editing !== bc.id && <button onClick={() => { setEditing(bc.id); setEditSup(bc.supervisor); setEditPin(bc.pin); }} style={{ background: "rgba(59,130,246,0.15)", border: "none", color: "#60A5FA", borderRadius: 6, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>✏️</button>}
      </div>))}
      <Modal open={pinModal} onClose={() => { setPinModal(false); setPinErr(""); }} title="🔑 تغيير كلمة سر الإدارة">
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>الرقم القديم</div><Input type="password" value={oldPin} onChange={setOldPin} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>الجديد</div><Input type="password" value={newPin} onChange={setNewPin} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>تأكيد</div><Input type="password" value={confirmPin} onChange={setConfirmPin} style={{ marginBottom: 10 }} />
        {pinErr && <div style={{ color: "#EF4444", fontSize: 12, marginBottom: 10 }}>{pinErr}</div>}
        {pinOk && <div style={{ color: "#22C55E", fontSize: 12, marginBottom: 10 }}>✅ تم</div>}
        <Btn onClick={changePin} color="#22C55E" style={{ width: "100%" }}>تغيير</Btn>
      </Modal>
    </div>
  );
};

/* ═══════ ADMIN DASHBOARD ═══════ */
const AdminDashboard = ({ busesData, busConfigs, onSelectBus, onLogout, openBoarding, onEnableOpen, onDisableOpen, onGoToPilgrimMgmt, onGoToBusMgmt }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
      <div><div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>لوحة التحكم</div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Btn onClick={onGoToPilgrimMgmt} color="#10B981" small>🕋 إدارة الحجاج</Btn><Btn onClick={onGoToBusMgmt} color="#3B82F6" small>🚌 إدارة الباصات</Btn><Btn onClick={onLogout} color="#EF4444" small>خروج</Btn></div>
    </div>
    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 12 }}>وضع الركوب</div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onDisableOpen} style={{ flex: 1, padding: "14px 12px", borderRadius: 10, border: "2px solid", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: !openBoarding ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.02)", borderColor: !openBoarding ? "rgba(34,197,94,0.55)" : "rgba(255,255,255,0.08)", color: !openBoarding ? "#22C55E" : "#64748B" }}><div style={{ fontSize: 24, marginBottom: 4 }}>🔒</div>الوضع العادي</button>
        <button onClick={onEnableOpen} style={{ flex: 1, padding: "14px 12px", borderRadius: 10, border: "2px solid", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: openBoarding ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.02)", borderColor: openBoarding ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.08)", color: openBoarding ? "#FBBF24" : "#64748B" }}><div style={{ fontSize: 24, marginBottom: 4 }}>🔓</div>الركوب المفتوح</button>
      </div>
    </div>
    <AllBusesMap busesData={busesData} busConfigs={busConfigs} onSelectBus={onSelectBus} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
      {busesData.map(bus => { const bc = busConfigs.find(c => c.id === bus.id); const chk = bus.students.filter(s => s.checkedIn).length; const pct = bus.students.length > 0 ? Math.round((chk / bus.students.length) * 100) : 0; return (
        <div key={bus.id} onClick={() => onSelectBus(bus.id)} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", padding: 20, cursor: "pointer", transition: "all 0.2s", position: "relative", overflow: "hidden" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: bc.color }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}><div><div style={{ fontSize: 17, fontWeight: 700, color: "#F1F5F9" }}>{bc.name}</div><div style={{ fontSize: 11, color: "#64748B" }}>المشرف: {bc.supervisor}</div></div><StatusPill status={bus.status} /></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, color: "#94A3B8" }}>الحضور</span><span style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>{chk}/{bus.students.length}</span></div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: bc.color, transition: "width 0.5s" }} /></div>
        </div>); })}
    </div>
  </div>
);

/* ═══════ BUS LEADER VIEW ═══════ */
const BusLeaderView = ({ busData, busConfig, allBusConfigs, allBusesData, onBack, onUpdate, onCrossBoard, openBoarding }) => {
  const [scanAnim, setScanAnim] = useState(null); const [gpsStatus, setGpsStatus] = useState("waiting");
  const [searchQ, setSearchQ] = useState(""); const [copied, setCopied] = useState(null);
  const [destModal, setDestModal] = useState(false); const [destInput, setDestInput] = useState("");
  const [familyModal, setFamilyModal] = useState(false); const [familyCheckinModal, setFamilyCheckinModal] = useState(null);
  const [crossBoardModal, setCrossBoardModal] = useState(false); const [crossBoardSearch, setCrossBoardSearch] = useState(""); const [crossBoardFilterBus, setCrossBoardFilterBus] = useState("");
  const [editPilgrimState, setEditPilgrimState] = useState(null); const [epName, setEpName] = useState(""); const [epPhone, setEpPhone] = useState(""); const [epRoom, setEpRoom] = useState("");
  const [familyNumCheckin, setFamilyNumCheckin] = useState("");
  const geoRef = useRef(null);

  const students = busData.students; const checked = students.filter(s => s.checkedIn).length; const total = students.length; const isFull = total >= BUS_CAPACITY;
  const familyNums = [...new Set(students.filter(s => s.familyNum).map(s => s.familyNum))];

  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus("simulated"); return; }
    navigator.geolocation.getCurrentPosition(p => { setGpsStatus("active"); onUpdate({ ...busData, location: { lat: p.coords.latitude, lng: p.coords.longitude } }); }, () => setGpsStatus("simulated"), { enableHighAccuracy: true, timeout: 8000 });
    geoRef.current = navigator.geolocation.watchPosition(p => { setGpsStatus("active"); onUpdate(prev => ({ ...(prev || busData), location: { lat: p.coords.latitude, lng: p.coords.longitude } })); }, () => setGpsStatus("simulated"), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return () => { if (geoRef.current !== null) navigator.geolocation.clearWatch(geoRef.current); };
  }, []);

  const togglePilgrim = (pid) => { const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); const st = students.find(s => s.id === pid); if (!st.checkedIn) { setScanAnim(pid); setTimeout(() => setScanAnim(null), 800); } onUpdate({ ...busData, students: students.map(s => s.id === pid ? { ...s, checkedIn: !s.checkedIn, time: s.checkedIn ? null : now, method: s.checkedIn ? null : "manual" } : s) }); };
  const checkinFamily = (headOrFamNum, allMembers) => { const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); let memberIds; if (typeof headOrFamNum === "string") { memberIds = students.filter(s => s.familyNum === headOrFamNum).map(s => s.id); } else { memberIds = students.filter(s => s.familyNum && s.familyNum === headOrFamNum.familyNum).map(s => s.id); } if (allMembers) { onUpdate({ ...busData, students: students.map(s => memberIds.includes(s.id) ? { ...s, checkedIn: true, time: now, method: "manual" } : s) }); } else if (typeof headOrFamNum !== "string") { togglePilgrim(headOrFamNum.id); } setFamilyCheckinModal(null); setFamilyNumCheckin(""); };
  const setStatus = (s) => { if (s === "commuting") { setDestModal(true); return; } onUpdate({ ...busData, status: s, destination: "" }); };
  const confirmDest = () => { if (!destInput.trim()) return; onUpdate({ ...busData, status: "commuting", destination: destInput.trim() }); setDestModal(false); setDestInput(""); };
  const copyList = (type) => { const list = students.filter(s => type === "present" ? s.checkedIn : !s.checkedIn); const header = type === "present" ? `✅ الحاضرون (${list.length})` : `❌ الغائبون (${list.length})`; const text = header + "\n" + list.map((s, i) => `${i + 1}. ${s.name}${s.room ? ` (غ${s.room})` : ""}`).join("\n"); const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); setCopied(type); setTimeout(() => setCopied(null), 2500); } catch (e) { } document.body.removeChild(ta); };
  const savePilgrimEdit = () => { if (!editPilgrimState) return; onUpdate({ ...busData, students: students.map(s => s.id === editPilgrimState.id ? { ...s, name: epName || s.name, phone: epPhone, room: epRoom } : s) }); setEditPilgrimState(null); };
  const createFamily = (ids, headId, familyNum) => { onUpdate({ ...busData, students: students.map(s => ids.includes(s.id) ? { ...s, familyNum, isHead: s.id === headId } : s) }); };
  const removeFamily = (famNum) => { onUpdate({ ...busData, students: students.map(s => s.familyNum === famNum ? { ...s, familyNum: "", isHead: false } : s) }); };
  const resetCheckins = () => { onUpdate({ ...busData, students: students.map(s => ({ ...s, checkedIn: false, time: null, method: null })), status: "stopped", destination: "" }); };

  const sorted = [...students].sort((a, b) => { if (a.type === "admin" && b.type !== "admin") return 1; if (b.type === "admin" && a.type !== "admin") return -1; if (a.isHead && !b.isHead) return -1; if (!a.isHead && b.isHead) return 1; return 0; });
  const filtered = searchQ.trim() ? sorted.filter(s => s.name.includes(searchQ.trim())) : sorted;
  const filteredHome = filtered.filter(s => s.homeBusId === busData.id);
  const filteredCross = filtered.filter(s => s.homeBusId !== busData.id);
  const allAvailable = openBoarding && allBusesData ? allBusesData.flatMap(b => b.students).filter(s => s.homeBusId !== busData.id).filter(s => !students.find(x => x.id === s.id)) : [];

  const renderCard = (s) => {
    const isHead = s.isHead; const isAdm = s.type === "admin"; const isCross = s.homeBusId !== busData.id;
    const wentAway = s.boardedBus && !isCross; const homeBc = isCross ? allBusConfigs.find(b => b.id === s.homeBusId) : null;
    const boardedBc = wentAway ? allBusConfigs.find(b => b.id === s.boardedBus) : null;
    let bg, bc2, bw;
    if (wentAway) { bg = "rgba(200,169,81,0.15)"; bc2 = "rgba(200,169,81,0.4)"; bw = "1px"; }
    else if (isCross) { bg = "rgba(251,191,36,0.08)"; bc2 = "rgba(251,191,36,0.4)"; bw = "1px"; }
    else if (isAdm) { bg = s.checkedIn ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.05)"; bc2 = "rgba(139,92,246,0.3)"; bw = "1px"; }
    else if (isHead) { bg = s.checkedIn ? `${busConfig.color}18` : "rgba(200,169,81,0.06)"; bc2 = "rgba(200,169,81,0.6)"; bw = "2px"; }
    else { bg = s.checkedIn ? `${busConfig.color}18` : "rgba(255,255,255,0.03)"; bc2 = s.checkedIn ? busConfig.color + "40" : "rgba(255,255,255,0.06)"; bw = "1px"; }
    return (<div key={s.id} onClick={() => { if (wentAway) return; if (isHead && !isCross) { setFamilyCheckinModal(s); return; } togglePilgrim(s.id); }} style={{ padding: "10px 12px", borderRadius: 10, cursor: wentAway ? "default" : "pointer", userSelect: "none", transition: "all 0.3s", background: bg, border: `${bw} solid ${bc2}`, transform: scanAnim === s.id ? "scale(1.06)" : "scale(1)", opacity: wentAway ? 0.75 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: s.checkedIn || wentAway ? "#F1F5F9" : "#475569" }}>{isAdm ? "👤 " : isHead && !isCross ? "👑 " : isCross ? "🔄 " : s.familyNum ? "👥 " : ""}{s.name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {!wentAway && !isAdm && <button onClick={e => { e.stopPropagation(); setEditPilgrimState(s); setEpName(s.name); setEpPhone(s.phone || ""); setEpRoom(s.room || ""); }} style={{ background: "rgba(59,130,246,0.15)", border: "none", color: "#60A5FA", borderRadius: 4, padding: "2px 6px", fontSize: 9, cursor: "pointer", fontFamily: "inherit" }}>✏️</button>}
          <span style={{ fontSize: 16 }}>{wentAway ? "🚌" : s.checkedIn ? "✅" : "⬜"}</span>
        </div>
      </div>
      {isAdm && <div style={{ fontSize: 9, color: "#A78BFA", marginTop: 2, fontWeight: 700 }}>إداري</div>}
      {isCross && homeBc && <div style={{ fontSize: 10, color: "#FBBF24", marginTop: 2, fontWeight: 600 }}>📍 من {homeBc.name}</div>}
      {wentAway && boardedBc && <div style={{ fontSize: 10, color: "#C8A951", marginTop: 2, fontWeight: 700 }}>🚌 ركب {boardedBc.name}</div>}
      {isHead && !isCross && !isAdm && s.familyNum && <div style={{ fontSize: 10, color: "#C8A951", marginTop: 2 }}>👑 عائلة {s.familyNum}</div>}
      {s.room && <div style={{ fontSize: 9, color: "#64748B", marginTop: 1 }}>غرفة {s.room}</div>}
      {s.checkedIn && s.time && !wentAway && <div style={{ fontSize: 10, color: "#64748B", marginTop: 3 }}>{s.time}</div>}
    </div>);
  };

  const statusBtns = [{ key: "stopped", label: "متوقف", icon: "⏹", color: "#EF4444", bg: "rgba(239,68,68,0.12)" }, { key: "boarding", label: "ركوب الحجاج", icon: "🚶", color: "#C8A951", bg: "rgba(200,169,81,0.12)" }, { key: "commuting", label: "يتحرك", icon: "🚌", color: "#22C55E", bg: "rgba(34,197,94,0.12)" }];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>→ رجوع</button>
        <div style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>{busConfig.name} — {busConfig.supervisor}</div></div>
        <Btn onClick={resetCheckins} color="transparent" small style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>🔄</Btn>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 14px", borderRadius: 10, background: gpsStatus === "active" ? "rgba(34,197,94,0.08)" : "rgba(251,191,36,0.08)", border: `1px solid ${gpsStatus === "active" ? "rgba(34,197,94,0.2)" : "rgba(251,191,36,0.2)"}` }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: gpsStatus === "active" ? "#22C55E" : "#FBBF24" }} /><span style={{ fontSize: 12, fontWeight: 600, color: gpsStatus === "active" ? "#22C55E" : "#FBBF24" }}>{gpsStatus === "active" ? "📱 GPS نشط" : "📍 محاكاة"}</span></div>
      {openBoarding && <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><div style={{ fontSize: 12, color: "#FBBF24", fontWeight: 700 }}>🔓 ركوب مفتوح</div><Btn onClick={() => { setCrossBoardModal(true); setCrossBoardSearch(""); setCrossBoardFilterBus(""); }} color="#FBBF24" small disabled={isFull} style={{ color: "#0B1120" }}>{isFull ? "ممتلئ" : "+ من باص آخر"}</Btn></div>}
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 12 }}>الحالة {busData.status === "commuting" && busData.destination && <span style={{ color: "#22C55E" }}>← {busData.destination}</span>}</div>
        <div style={{ display: "flex", gap: 8 }}>{statusBtns.map(btn => <button key={btn.key} onClick={() => setStatus(btn.key)} style={{ flex: 1, padding: "12px 8px", borderRadius: 10, border: "2px solid", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: busData.status === btn.key ? btn.bg : "rgba(255,255,255,0.02)", borderColor: busData.status === btn.key ? btn.color + "55" : "rgba(255,255,255,0.06)", color: busData.status === btn.key ? btn.color : "#64748B" }}><div style={{ fontSize: 22, marginBottom: 4 }}>{btn.icon}</div>{btn.label}</button>)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: `linear-gradient(135deg,${busConfig.color}18,${busConfig.color}08)`, borderRadius: 14, border: `1px solid ${busConfig.color}30`, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: "#F1F5F9", lineHeight: 1, fontFamily: "'JetBrains Mono',monospace" }}>{checked}<span style={{ fontSize: 20, color: "#64748B" }}>/{total}</span></div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>{checked === total && total > 0 ? "✅ الجميع" : total === 0 ? "لا يوجد ركاب" : `${total - checked} متبقي`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Btn onClick={() => setFamilyModal(true)} color="#8B5CF6" small style={{ flex: 1 }}>👨‍👩‍👧‍👦 العائلات</Btn>
          {familyNums.length > 0 && <div style={{ background: "rgba(200,169,81,0.08)", borderRadius: 10, padding: 8, border: "1px solid rgba(200,169,81,0.2)" }}>
            <div style={{ fontSize: 10, color: "#C8A951", marginBottom: 4, fontWeight: 700 }}>تسجيل عائلة</div>
            <div style={{ display: "flex", gap: 4 }}>
              <select value={familyNumCheckin} onChange={e => setFamilyNumCheckin(e.target.value)} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 6, padding: "6px 8px", fontSize: 12, direction: "rtl", fontFamily: "inherit", outline: "none" }}><option value="">العائلة...</option>{familyNums.map(fn => <option key={fn} value={fn} style={{ background: "#1E293B" }}>{fn}</option>)}</select>
              <Btn onClick={() => { if (familyNumCheckin) checkinFamily(familyNumCheckin, true); }} disabled={!familyNumCheckin} color="#C8A951" small style={{ fontSize: 10 }}>✅</Btn>
            </div>
          </div>}
        </div>
      </div>
      <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>الركاب</div><div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748B" }}><span>🟢 {checked}</span><span>⚫ {total - checked}</span></div></div>
      <Input value={searchQ} onChange={setSearchQ} placeholder="🔍 ابحث..." style={{ marginBottom: 12 }} />
      {total === 0 ? <div style={{ padding: 40, textAlign: "center", color: "#64748B", fontSize: 13, background: "rgba(255,255,255,0.02)", borderRadius: 12, marginBottom: 16 }}>لا يوجد ركاب — الإدارة تضيفهم.</div> : (
        <><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 6, marginBottom: filteredCross.length > 0 ? 12 : 16 }}>{filteredHome.map(renderCard)}</div>
          {filteredCross.length > 0 && <><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><div style={{ flex: 1, height: 1, background: "rgba(251,191,36,0.3)" }} /><div style={{ fontSize: 11, color: "#FBBF24", fontWeight: 700, padding: "4px 10px", background: "rgba(251,191,36,0.1)", borderRadius: 20 }}>🔄 من باصات أخرى ({filteredCross.length})</div><div style={{ flex: 1, height: 1, background: "rgba(251,191,36,0.3)" }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 6, marginBottom: 16 }}>{filteredCross.map(renderCard)}</div></>}</>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <button onClick={() => copyList("absent")} style={{ padding: 12, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: copied === "absent" ? "#22C55E" : "#EF4444", fontFamily: "inherit" }}>{copied === "absent" ? "✅ تم!" : `📋 الغائبين (${total - checked})`}</button>
        <button onClick={() => copyList("present")} style={{ padding: 12, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: copied === "present" ? "#22C55E" : "#10B981", fontFamily: "inherit" }}>{copied === "present" ? "✅ تم!" : `📋 الحاضرين (${checked})`}</button>
      </div>
      <div style={{ marginBottom: 16 }}><div style={{ fontSize: 13, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>📍 الموقع</div><BusMap location={busData.location} status={busData.status} busColor={busConfig.color} /></div>

      <Modal open={destModal} onClose={() => setDestModal(false)} title="🚌 الوجهة"><Input value={destInput} onChange={setDestInput} placeholder="اكتب الوجهة..." style={{ marginBottom: 12, fontSize: 16, padding: "14px 16px" }} /><Btn onClick={confirmDest} disabled={!destInput.trim()} color="#22C55E" style={{ width: "100%", fontSize: 16, padding: 14 }}>✅ تأكيد</Btn></Modal>
      <Modal open={!!editPilgrimState} onClose={() => setEditPilgrimState(null)} title="✏️ تعديل البيانات">{editPilgrimState && <div><div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>الاسم</div><Input value={epName} onChange={setEpName} style={{ marginBottom: 10 }} /><div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>الهاتف</div><Input value={epPhone} onChange={setEpPhone} style={{ marginBottom: 10 }} /><div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>الغرفة</div><Input value={epRoom} onChange={setEpRoom} style={{ marginBottom: 10 }} /><Btn onClick={savePilgrimEdit} color="#22C55E" style={{ width: "100%" }}>💾 حفظ</Btn></div>}</Modal>

      <Modal open={familyModal} onClose={() => setFamilyModal(false)} title="العائلات" width={500}>
        {(() => { const ef = {}; students.forEach(s => { if (s.familyNum) { if (!ef[s.familyNum]) ef[s.familyNum] = []; ef[s.familyNum].push(s); } }); const ua = students.filter(s => !s.familyNum && s.type !== "admin"); return <FamilyContent existingFams={ef} unassigned={ua} onCreateFamily={createFamily} onRemoveFamily={removeFamily} students={students} />; })()}
      </Modal>

      <Modal open={!!familyCheckinModal} onClose={() => setFamilyCheckinModal(null)} title="👑 تسجيل العائلة">
        {familyCheckinModal && (() => { const members = students.filter(s => s.familyNum && s.familyNum === familyCheckinModal.familyNum); return (<div><div style={{ fontSize: 14, color: "#94A3B8", marginBottom: 16 }}>عائلة {familyCheckinModal.familyNum} ({members.length})</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>{members.map(m => <span key={m.id} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: m.checkedIn ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)", color: m.checkedIn ? "#22C55E" : "#94A3B8" }}>{m.isHead ? "👑 " : ""}{m.name} {m.checkedIn ? "✅" : ""}</span>)}</div><div style={{ display: "flex", gap: 8 }}><Btn onClick={() => checkinFamily(familyCheckinModal, false)} color="#3B82F6" style={{ flex: 1 }}>رب العائلة فقط</Btn><Btn onClick={() => checkinFamily(familyCheckinModal, true)} color="#22C55E" style={{ flex: 1 }}>✅ كل العائلة</Btn></div></div>); })()}
      </Modal>

      <Modal open={crossBoardModal} onClose={() => setCrossBoardModal(false)} title="🔄 إضافة من باص آخر" width={520}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}><input type="text" value={crossBoardSearch} onChange={e => setCrossBoardSearch(e.target.value)} placeholder="🔍 ابحث..." style={{ flex: 2, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", direction: "rtl", fontFamily: "inherit" }} /><select value={crossBoardFilterBus} onChange={e => setCrossBoardFilterBus(e.target.value)} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 8, padding: "10px", fontSize: 13, direction: "rtl", fontFamily: "inherit", outline: "none" }}><option value="">الكل</option>{allBusConfigs.filter(b => b.id !== busData.id).map(b => <option key={b.id} value={b.id} style={{ background: "#1E293B" }}>{b.name}</option>)}</select></div>
        {isFull && <div style={{ padding: 10, borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 12, color: "#EF4444", fontWeight: 700, textAlign: "center", marginBottom: 12 }}>ممتلئ</div>}
        <div style={{ maxHeight: 300, overflowY: "auto", display: "grid", gap: 4 }}>
          {allAvailable.filter(s => !crossBoardFilterBus || s.homeBusId === Number(crossBoardFilterBus)).filter(s => !crossBoardSearch.trim() || s.name.includes(crossBoardSearch.trim())).slice(0, 100).map(s => { const home = allBusConfigs.find(b => b.id === s.homeBusId); return (<div key={`${s.homeBusId}-${s.id}`} onClick={() => { if (isFull) return; onCrossBoard(s.id, s.homeBusId, busData.id); setCrossBoardModal(false); }} style={{ padding: "10px 14px", borderRadius: 8, cursor: isFull ? "not-allowed" : "pointer", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: isFull ? 0.4 : 1 }}><span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{s.name}</span><span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: home?.color + "22", color: home?.color, fontWeight: 700 }}>📍 {home?.name}</span></div>); })}
          {allAvailable.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#64748B", fontSize: 12 }}>لا يوجد</div>}
        </div>
      </Modal>
    </div>
  );
};

/* ═══════ FAMILY CONTENT ═══════ */
const FamilyContent = ({ existingFams, unassigned, onCreateFamily, onRemoveFamily, students }) => {
  const [selected, setSelected] = useState([]); const [headId, setHeadId] = useState(""); const [familyNum, setFamilyNum] = useState("");
  const toggleSel = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  return (<div>
    {Object.keys(existingFams).length > 0 && <div style={{ marginBottom: 20 }}><div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>العائلات الحالية</div>
      {Object.entries(existingFams).map(([fn, members]) => { const head = members.find(m => m.isHead); return (<div key={fn} style={{ background: "rgba(200,169,81,0.08)", borderRadius: 10, padding: 12, marginBottom: 8, border: "1px solid rgba(200,169,81,0.2)" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 700, color: "#C8A951" }}>عائلة {fn} — {head?.name || "—"} ({members.length})</span><button onClick={() => onRemoveFamily(fn)} style={{ background: "rgba(239,68,68,0.15)", border: "none", color: "#EF4444", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>فك</button></div><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{members.map(m => <span key={m.id} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: m.isHead ? "rgba(200,169,81,0.2)" : "rgba(255,255,255,0.05)", color: m.isHead ? "#C8A951" : "#94A3B8", fontWeight: m.isHead ? 700 : 400 }}>{m.isHead ? "👑 " : ""}{m.name}</span>)}</div></div>); })}</div>}
    <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>إنشاء عائلة</div>
    {unassigned.length < 2 ? <div style={{ fontSize: 12, color: "#64748B", padding: 12, textAlign: "center" }}>لا يوجد حجاج كافين</div> : <>
      <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>رقم العائلة</div><Input value={familyNum} onChange={setFamilyNum} placeholder="مثال: 1" /></div>
      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>اختر الأفراد</div>
      <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>{unassigned.map(s => <div key={s.id} onClick={() => toggleSel(s.id)} style={{ padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, background: selected.includes(s.id) ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${selected.includes(s.id) ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)"}`, color: selected.includes(s.id) ? "#60A5FA" : "#64748B" }}>{selected.includes(s.id) ? "✓ " : ""}{s.name}</div>)}</div>
      {selected.length >= 2 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>رب العائلة</div><select value={headId} onChange={e => setHeadId(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 8, padding: "8px 10px", fontSize: 13, direction: "rtl", fontFamily: "inherit", outline: "none" }}><option value="">اختر...</option>{selected.map(id => { const s = students.find(x => x.id === id); return <option key={id} value={id} style={{ background: "#1E293B" }}>{s?.name}</option>; })}</select></div>}
      <Btn onClick={() => { if (selected.length >= 2 && headId && familyNum.trim()) { onCreateFamily(selected, headId, familyNum.trim()); setSelected([]); setHeadId(""); setFamilyNum(""); } }} disabled={selected.length < 2 || !headId || !familyNum.trim()} color="#C8A951" style={{ width: "100%" }}>👨‍👩‍👧‍👦 إنشاء ({selected.length})</Btn>
    </>}
  </div>);
};

/* ═══════ MAIN APP ═══════ */
export default function App() {
  const [auth, setAuth] = useState(null);
  const [view, setView] = useState("dashboard");
  const [theme, setThemeState] = useState(getTheme);
  const toggleTheme = () => { const n = theme === "dark" ? "light" : "dark"; setThemeState(n); setThemeStorage(n); };
  const t = THEMES[theme];
  const [adminPin, setAdminPin] = useState(DEFAULT_ADMIN_PIN);
  const [busConfigs, setBusConfigs] = useState(INITIAL_BUSES);
  const [openBoarding, setOpenBoarding] = useState(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [busesData, setBusesData] = useState(INITIAL_BUS_DATA);
  const [loading, setLoading] = useState(true);

  // ═══════ FIREBASE LISTENERS (real-time sync) ═══════
  useEffect(() => {
    const unsubs = [];
    // Listen to all buses
    unsubs.push(listenToAllBuses((buses) => {
      if (buses.length > 0) {
        setBusesData(prev => {
          const merged = INITIAL_BUS_DATA.map(ib => {
            const fromFb = buses.find(b => b.id === ib.id);
            return fromFb || ib;
          });
          return merged;
        });
      }
      setLoading(false);
    }));
    // Listen to bus configs
    unsubs.push(listenToBusConfigs((configs) => { if (configs) setBusConfigs(configs); }));
    // Listen to admin pin
    unsubs.push(listenToAdminPin((pin) => { if (pin) setAdminPin(pin); }));
    // Listen to open boarding
    unsubs.push(listenToOpenBoarding((enabled) => { setOpenBoarding(!!enabled); }));
    return () => unsubs.forEach(u => u());
  }, []);

  // ═══════ SAVE HELPERS (write to Firestore) ═══════
  const persistBus = (busId, data) => {
    saveBusData(busId, data);
  };

  const updateBus = useCallback((busId, dataOrFn) => {
    setBusesData(prev => {
      const updated = prev.map(b => {
        if (b.id !== busId) return b;
        const newData = typeof dataOrFn === "function" ? { ...b, ...dataOrFn(b) } : dataOrFn;
        persistBus(busId, newData);
        return newData;
      });
      return updated;
    });
  }, []);

  const updateAdminPin = (p) => { setAdminPin(p); saveAdminPin(p); };
  const updateBusConfigs = (configs) => { setBusConfigs(configs); saveBusConfigs(configs); };
  const updateOpenBoarding = (val) => { setOpenBoarding(val); saveOpenBoarding(val); };

  const addPilgrim = (busId, data) => {
    setBusesData(prev => {
      const updated = prev.map(b => {
        if (b.id !== busId || b.students.length >= BUS_CAPACITY) return b;
        const newBus = { ...b, students: [...b.students, { id: nid(), name: data.name, type: data.type || "pilgrim", room: data.room || "", phone: data.phone || "", familyNum: data.familyNum || "", isHead: !!data.isHead, checkedIn: false, time: null, method: null, homeBusId: busId, boardedBus: null }] };
        persistBus(busId, newBus);
        return newBus;
      });
      return updated;
    });
  };

  const deletePilgrim = (busId, pid) => {
    setBusesData(prev => {
      const updated = prev.map(b => {
        if (b.id !== busId) return b;
        const newBus = { ...b, students: b.students.filter(s => s.id !== pid) };
        persistBus(busId, newBus);
        return newBus;
      });
      return updated;
    });
  };

  const editPilgrim = (busId, pid, data) => {
    setBusesData(prev => {
      const updated = prev.map(b => {
        if (b.id !== busId) return b;
        const newBus = { ...b, students: b.students.map(s => s.id === pid ? { ...s, ...data } : s) };
        persistBus(busId, newBus);
        return newBus;
      });
      return updated;
    });
  };

  const transferPilgrim = (fromBus, pid, toBus) => {
    setBusesData(prev => {
      const from = prev.find(b => b.id === fromBus); const p = from?.students.find(s => s.id === pid);
      if (!p) return prev; const target = prev.find(b => b.id === toBus);
      if (target.students.length >= BUS_CAPACITY) return prev;
      const updated = prev.map(b => {
        if (b.id === fromBus) { const nb = { ...b, students: b.students.filter(s => s.id !== pid) }; persistBus(fromBus, nb); return nb; }
        if (b.id === toBus) { const nb = { ...b, students: [...b.students, { ...p, homeBusId: toBus, checkedIn: false, time: null, familyNum: "", isHead: false }] }; persistBus(toBus, nb); return nb; }
        return b;
      });
      return updated;
    });
  };

  const bulkImport = (entries) => {
    setBusesData(prev => {
      const nb = prev.map(b => ({ ...b, students: [...b.students] }));
      entries.forEach(e => {
        const bus = nb.find(b => b.id === e.busId);
        if (!bus || bus.students.length >= BUS_CAPACITY) return;
        bus.students.push({ id: nid(), name: e.name, type: e.type || "pilgrim", room: e.room || "", phone: "", familyNum: e.familyNum || "", isHead: !!e.isHead, checkedIn: false, time: null, method: null, homeBusId: e.busId, boardedBus: null });
      });
      nb.forEach(b => persistBus(b.id, b));
      return nb;
    });
  };

  const crossBoardPilgrim = (pid, homeBusId, targetBusId) => {
    setBusesData(prev => {
      const home = prev.find(b => b.id === homeBusId); const p = home?.students.find(s => s.id === pid);
      if (!p) return prev; const target = prev.find(b => b.id === targetBusId);
      if (target.students.length >= BUS_CAPACITY) return prev;
      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
      const updated = prev.map(b => {
        if (b.id === homeBusId) { const nb = { ...b, students: b.students.map(s => s.id === pid ? { ...s, checkedIn: false, boardedBus: targetBusId, time: now } : s) }; persistBus(homeBusId, nb); return nb; }
        if (b.id === targetBusId) { const nb = { ...b, students: [...b.students, { ...p, checkedIn: true, time: now, method: "manual", boardedBus: null }] }; persistBus(targetBusId, nb); return nb; }
        return b;
      });
      return updated;
    });
  };

  const disableOpenBoarding = () => {
    updateOpenBoarding(false);
    setBusesData(prev => {
      const updated = prev.map(b => {
        const nb = { ...b, students: b.students.filter(s => s.homeBusId === b.id).map(s => ({ ...s, boardedBus: null })) };
        persistBus(b.id, nb);
        return nb;
      });
      return updated;
    });
  };

  // Simulated GPS
  useEffect(() => { const iv = setInterval(() => { setBusesData(prev => prev.map(b => { if (b.status !== "commuting" || !b.location) return b; return { ...b, location: { lat: b.location.lat + (Math.random() - 0.45) * 0.0015, lng: b.location.lng + (Math.random() - 0.45) * 0.0015 } }; })); }, 3000); return () => clearInterval(iv); }, []);

  const selBus = typeof view === "number" ? busesData.find(b => b.id === view) : null;
  const selConfig = typeof view === "number" ? busConfigs.find(b => b.id === view) : null;

  if (loading) return (<div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", color: "#C8A951", fontSize: 18, fontFamily: "'IBM Plex Sans Arabic',sans-serif", direction: "rtl" }}><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap" rel="stylesheet" />جاري تحميل البيانات...</div>);
  if (!auth) return <LoginPage onLogin={({ role, busId }) => { if (role === "admin") { setAuth({ role: "admin" }); setView("dashboard"); } else { setAuth({ role: "supervisor", busId }); setView(busId); } }} adminPin={adminPin} busConfigs={busConfigs} theme={theme} toggleTheme={toggleTheme} />;

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'IBM Plex Sans Arabic',sans-serif", transition: "background 0.3s, color 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=JetBrains+Mono:wght@700;900&family=Amiri:wght@700&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;}.leaflet-container{font-family:inherit!important;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-thumb{background:${t.scrollThumb};border-radius:3px;}`}</style>
      <div style={{ background: t.bgTopBar, borderBottom: `1px solid ${t.borderTopBar}`, backdropFilter: "blur(20px)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 1100, transition: "background 0.3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#C8A951,#A67C2E)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🕋</div><div><div style={{ fontSize: 17, fontWeight: 800 }}>نظام تتبع باصات الحجاج</div><div style={{ fontSize: 11, color: t.textDim }}>{auth.role === "admin" ? "الإدارة" : `المشرف: ${selConfig?.supervisor || ""}`}</div></div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={toggleTheme} title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"} style={{ background: theme === "dark" ? "rgba(251,191,36,0.15)" : "rgba(99,102,241,0.15)", border: `1px solid ${theme === "dark" ? "rgba(251,191,36,0.3)" : "rgba(99,102,241,0.3)"}`, color: theme === "dark" ? "#FBBF24" : "#6366F1", borderRadius: 8, padding: "6px 10px", fontSize: 16, cursor: "pointer", transition: "all 0.3s" }}>{theme === "dark" ? "☀️" : "🌙"}</button>
          {auth.role === "admin" && view !== "dashboard" && <Btn onClick={() => setView("dashboard")} color="rgba(200,169,81,0.15)" small style={{ border: "1px solid rgba(200,169,81,0.3)", color: "#C8A951" }}>الرئيسية</Btn>}
          <Btn onClick={() => { setAuth(null); setView("dashboard"); }} color="rgba(239,68,68,0.15)" small style={{ border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444" }}>خروج</Btn>
        </div>
      </div>
      <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        {auth.role === "admin" && view === "dashboard" && <AdminDashboard busesData={busesData} busConfigs={busConfigs} onSelectBus={id => setView(id)} onLogout={() => { setAuth(null); setView("dashboard"); }} openBoarding={openBoarding} onEnableOpen={() => updateOpenBoarding(true)} onDisableOpen={() => { if (openBoarding) setConfirmDisableOpen(true); }} onGoToPilgrimMgmt={() => setView("pilgrim-mgmt")} onGoToBusMgmt={() => setView("bus-mgmt")} />}
        {auth.role === "admin" && view === "pilgrim-mgmt" && <PilgrimMgmtPage busesData={busesData} busConfigs={busConfigs} onAdd={addPilgrim} onDelete={deletePilgrim} onEdit={editPilgrim} onTransfer={transferPilgrim} onBulkImport={bulkImport} onBack={() => setView("dashboard")} />}
        {auth.role === "admin" && view === "bus-mgmt" && <BusMgmtPage busConfigs={busConfigs} onUpdate={updateBusConfigs} adminPin={adminPin} onUpdatePin={updateAdminPin} onBack={() => setView("dashboard")} />}
        {typeof view === "number" && selBus && selConfig && <BusLeaderView busData={selBus} busConfig={selConfig} allBusConfigs={busConfigs} allBusesData={busesData} onBack={() => auth.role === "admin" ? setView("dashboard") : setAuth(null)} onUpdate={data => updateBus(selBus.id, data)} onCrossBoard={crossBoardPilgrim} openBoarding={openBoarding} />}
      </div>
      <Modal open={confirmDisableOpen} onClose={() => setConfirmDisableOpen(false)} title="تأكيد">
        <div style={{ fontSize: 14, color: "#E2E8F0", marginBottom: 20 }}>إنهاء الركوب المفتوح وإرجاع الحجاج لباصاتهم؟</div>
        <div style={{ display: "flex", gap: 8 }}><Btn onClick={() => setConfirmDisableOpen(false)} color="transparent" style={{ flex: 1, border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>إلغاء</Btn><Btn onClick={() => { disableOpenBoarding(); setConfirmDisableOpen(false); }} color="#22C55E" style={{ flex: 1 }}>✅ نعم</Btn></div>
      </Modal>
    </div>
  );
}
