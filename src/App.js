import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════
   CONSTANTS & DATA
   ═══════════════════════════════════════════════════════ */
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
const ADMIN_PIN = "0000";
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

const genPilgrims = (busId) => Array.from({ length: 50 }, (_, i) => ({
  id: `B${String(busId).padStart(2, "0")}-P${String(i + 1).padStart(3, "0")}`,
  name: `حاج ${i + 1}`, checkedIn: false, time: null, method: null,
  familyId: null, isHead: false,
}));

let familyCounter = 0;
const nextFamilyId = () => `FAM-${++familyCounter}`;

/* ═══════════════════════════════════════════════════════
   LEAFLET HOOK
   ═══════════════════════════════════════════════════════ */
const useLeaflet = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.L) { setReady(true); return; }
    if (!document.getElementById("lf-css")) {
      const l = document.createElement("link"); l.id = "lf-css"; l.rel = "stylesheet"; l.href = LEAFLET_CSS; document.head.appendChild(l);
    }
    if (!document.getElementById("lf-js")) {
      const s = document.createElement("script"); s.id = "lf-js"; s.src = LEAFLET_JS; s.onload = () => setReady(true); document.head.appendChild(s);
    } else { if (window.L) setReady(true); else document.getElementById("lf-js").addEventListener("load", () => setReady(true)); }
  }, []);
  return ready;
};

const mkIcon = (color, status) => {
  if (!window.L) return null;
  const sc = status === "commuting" ? "#22C55E" : status === "boarding" ? "#C8A951" : "#EF4444";
  const pulse = status === "commuting" ? `<circle cx="20" cy="20" r="18" fill="${color}" opacity="0.15"><animate attributeName="r" values="14;20;14" dur="2s" repeatCount="indefinite"/></circle>` : "";
  return window.L.divIcon({ className: "", iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -22],
    html: `<svg width="40" height="40" viewBox="0 0 40 40"><${pulse}<circle cx="20" cy="20" r="11" fill="${color}" stroke="#fff" stroke-width="2.5"/><circle cx="20" cy="20" r="4" fill="#fff"/><circle cx="30" cy="10" r="5" fill="${sc}" stroke="#fff" stroke-width="1.5"/></svg>` });
};

/* ═══════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════ */
const StatusPill = ({ status }) => {
  const c = { stopped: ["rgba(239,68,68,0.12)", "#EF4444", "rgba(239,68,68,0.25)"], commuting: ["rgba(34,197,94,0.12)", "#22C55E", "rgba(34,197,94,0.25)"], boarding: ["rgba(200,169,81,0.15)", "#C8A951", "rgba(200,169,81,0.3)"] }[status];
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: c[0], color: c[1], border: `1px solid ${c[2]}` }}>● {STATUS_AR[status]}</span>;
};

/* Modal */
const Modal = ({ open, onClose, title, children, width }) => {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#1E293B", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", padding: 24, width: "100%", maxWidth: width || 420, maxHeight: "85vh", overflowY: "auto", direction: "rtl" }}>
        {title && <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9", marginBottom: 16 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
};

const Btn = ({ children, onClick, color, disabled, small, style: s }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: small ? "6px 12px" : "10px 16px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    background: color || "#C8A951", color: "#fff", fontWeight: 700, fontSize: small ? 12 : 14,
    opacity: disabled ? 0.4 : 1, transition: "all 0.2s", fontFamily: "inherit", ...s,
  }}>{children}</button>
);

const Input = ({ value, onChange, placeholder, type, style: s }) => (
  <input type={type || "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", direction: "rtl", boxSizing: "border-box", fontFamily: "inherit", ...s }} />
);

/* ═══════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════ */
const LoginPage = ({ onLogin }) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("supervisor"); // supervisor | admin

  const handleLogin = () => {
    if (!pin.trim()) { setError("أدخل الرقم"); return; }
    if (mode === "admin") {
      if (pin === ADMIN_PIN) onLogin({ role: "admin" });
      else setError("رقم الإدارة غير صحيح");
    } else {
      onLogin({ role: "supervisor", pin });
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0B1120 0%, #152238 50%, #0F172A 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Amiri:wght@700&display=swap" rel="stylesheet" />

      {/* Bus SVG illustration */}
      <div style={{ marginBottom: 24 }}>
        <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
          <rect x="10" y="20" width="100" height="55" rx="12" fill="#C8A951" opacity="0.9"/>
          <rect x="15" y="28" width="25" height="20" rx="4" fill="#0B1120" opacity="0.7"/>
          <rect x="47" y="28" width="25" height="20" rx="4" fill="#0B1120" opacity="0.7"/>
          <rect x="79" y="28" width="25" height="20" rx="4" fill="#0B1120" opacity="0.7"/>
          <rect x="10" y="55" width="100" height="8" fill="#A67C2E"/>
          <rect x="45" y="55" width="30" height="20" rx="3" fill="#1E293B"/>
          <circle cx="30" cy="80" r="8" fill="#334155" stroke="#C8A951" strokeWidth="3"/>
          <circle cx="90" cy="80" r="8" fill="#334155" stroke="#C8A951" strokeWidth="3"/>
          <rect x="5" y="40" width="6" height="12" rx="2" fill="#FBBF24" opacity="0.8"/>
          <rect x="109" y="40" width="6" height="12" rx="2" fill="#EF4444" opacity="0.8"/>
          <text x="60" y="52" textAnchor="middle" fill="#C8A951" fontSize="8" fontWeight="bold">الحجاج</text>
        </svg>
      </div>

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        {mode === "admin" ? (
          <div style={{ fontSize: 28, fontWeight: 800, color: "#C8A951", fontFamily: "'Amiri', serif", lineHeight: 1.2 }}>لوحة الإدارة</div>
        ) : (
          <>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#C8A951", fontFamily: "'Amiri', serif", lineHeight: 1.2 }}>حملة المواسم</div>
            <div style={{ fontSize: 16, color: "rgba(203,213,225,0.8)", marginTop: 4 }}>نظام متابعة الباصات</div>
          </>
        )}
        <div style={{ width: 60, height: 3, background: "linear-gradient(90deg, transparent, #C8A951, transparent)", margin: "12px auto 0" }} />
      </div>

      {/* Login Card */}
      <div style={{ width: "100%", maxWidth: 400, background: "rgba(30,41,59,0.7)", borderRadius: 16, padding: "32px 24px", marginTop: 32, border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(10px)" }}>
        <div style={{ textAlign: "center", fontSize: 15, color: "rgba(203,213,225,0.7)", marginBottom: 16 }}>
          {mode === "supervisor" ? "الرقم الشخصي أو رقم المشرف" : "رقم دخول الإدارة"}
        </div>
        <input
          type="password" inputMode="numeric" value={pin}
          onChange={e => { setPin(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          placeholder="أدخل رقمك"
          style={{
            width: "100%", background: "rgba(15,23,42,0.8)", border: `1px solid ${error ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`,
            color: "#F1F5F9", borderRadius: 12, padding: "18px 16px", fontSize: 18, textAlign: "center",
            outline: "none", boxSizing: "border-box", fontFamily: "inherit", letterSpacing: "0.2em",
          }}
        />
        {error && <div style={{ color: "#EF4444", fontSize: 13, textAlign: "center", marginTop: 8, fontWeight: 600 }}>{error}</div>}

        <button onClick={handleLogin} style={{
          width: "100%", padding: "16px", borderRadius: 12, border: "none", cursor: "pointer",
          background: "linear-gradient(135deg, #C8A951, #A67C2E)", color: "#0B1120",
          fontSize: 20, fontWeight: 800, marginTop: 16, fontFamily: "inherit",
          boxShadow: "0 4px 20px rgba(200,169,81,0.3)",
        }}>دخول</button>
      </div>

      {/* Toggle */}
      <button onClick={() => { setMode(mode === "supervisor" ? "admin" : "supervisor"); setPin(""); setError(""); }}
        style={{ background: "none", border: "none", color: "rgba(203,213,225,0.5)", fontSize: 14, marginTop: 24, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
        {mode === "supervisor" ? "دخول الإدارة" : "دخول المشرف"}
      </button>

      {/* Credit */}
      <div style={{ marginTop: 32, fontSize: 13, color: "rgba(148,163,184,0.5)", textAlign: "center" }}>
        برمجة وتصميم / خالد محمود المرزوقي
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   ALL-BUSES MAP
   ═══════════════════════════════════════════════════════ */
const AllBusesMap = ({ busesData, busConfigs, onSelectBus }) => {
  const ref = useRef(null); const mapRef = useRef(null); const markers = useRef({});
  const ready = useLeaflet();
  useEffect(() => {
    if (!ready || !ref.current || mapRef.current) return;
    const L = window.L;
    const m = L.map(ref.current, { center: [26.2235, 50.5876], zoom: 13, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: "topright" }).addTo(m);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(m);
    mapRef.current = m;
    busesData.forEach(b => {
      const bc = busConfigs.find(c => c.id === b.id); if (!b.location) return;
      const ic = mkIcon(bc.color, b.status);
      markers.current[b.id] = L.marker([b.location.lat, b.location.lng], { icon: ic }).addTo(m).on("click", () => onSelectBus(b.id));
    });
    const locs = busesData.filter(b => b.location).map(b => [b.location.lat, b.location.lng]);
    if (locs.length) m.fitBounds(locs, { padding: [40, 40], maxZoom: 14 });
    return () => { m.remove(); mapRef.current = null; markers.current = {}; };
  }, [ready]);
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    busesData.forEach(b => {
      const bc = busConfigs.find(c => c.id === b.id); const mk = markers.current[b.id];
      if (!mk || !b.location) return;
      mk.setLatLng([b.location.lat, b.location.lng]);
      mk.setIcon(mkIcon(bc.color, b.status));
    });
  }, [busesData, ready]);
  return (
    <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 20 }}>
      <div ref={ref} style={{ width: "100%", height: 300 }} />
      {!ready && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.95)", color: "#64748B", fontSize: 13, fontWeight: 600 }}>جاري تحميل الخريطة...</div>}
      <div style={{ position: "absolute", top: 12, right: 50, padding: "6px 12px", borderRadius: 8, background: "rgba(0,0,0,0.7)", fontSize: 12, color: "#E2E8F0", fontWeight: 700, zIndex: 1000, border: "1px solid rgba(255,255,255,0.1)" }}>🗺️ مواقع جميع الباصات</div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   SINGLE BUS MAP
   ═══════════════════════════════════════════════════════ */
const BusMap = ({ location, status, busColor }) => {
  const ref = useRef(null); const mapRef = useRef(null); const markerRef = useRef(null);
  const trailRef = useRef(null); const pts = useRef([]);
  const ready = useLeaflet();
  useEffect(() => {
    if (!ready || !ref.current || !location || mapRef.current) return;
    const L = window.L;
    const m = L.map(ref.current, { center: [location.lat, location.lng], zoom: 15, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: "topright" }).addTo(m);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(m);
    markerRef.current = L.marker([location.lat, location.lng], { icon: mkIcon(busColor, status) }).addTo(m);
    trailRef.current = L.polyline([], { color: busColor, weight: 3, opacity: 0.6, dashArray: "8 4" }).addTo(m);
    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; };
  }, [ready]);
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !location) return;
    const p = [location.lat, location.lng];
    markerRef.current.setLatLng(p); markerRef.current.setIcon(mkIcon(busColor, status));
    if (status === "commuting") { pts.current.push(p); if (pts.current.length > 500) pts.current.shift(); if (trailRef.current) trailRef.current.setLatLngs(pts.current); }
    mapRef.current.panTo(p, { animate: true, duration: 1 });
  }, [location, status]);
  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div ref={ref} style={{ width: "100%", height: 220 }} />
      {!ready && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.95)", color: "#64748B", fontSize: 13 }}>جاري تحميل الخريطة...</div>}
      <div style={{ position: "absolute", top: 10, left: 10, padding: "5px 10px", borderRadius: 8, background: "rgba(0,0,0,0.65)", fontSize: 11, color: "#E2E8F0", fontWeight: 600, zIndex: 1000, display: "flex", alignItems: "center", gap: 6, border: "1px solid rgba(255,255,255,0.1)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: status === "commuting" ? "#22C55E" : status === "boarding" ? "#C8A951" : "#EF4444", animation: status === "commuting" ? "pulse 1.5s infinite" : "none" }} />
        {status === "commuting" ? "تتبع مباشر" : STATUS_AR[status]}
      </div>
      {location && <div style={{ position: "absolute", bottom: 10, left: 10, padding: "4px 8px", borderRadius: 6, background: "rgba(0,0,0,0.6)", fontSize: 10, color: "rgba(148,163,184,0.8)", fontFamily: "monospace", zIndex: 1000 }}>{location.lat.toFixed(5)}°N, {location.lng.toFixed(5)}°E</div>}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   PILGRIM MANAGEMENT MODAL
   ═══════════════════════════════════════════════════════ */
const PilgrimMgmtModal = ({ open, onClose, pilgrim, busId, allBuses, onSave, onDelete, onTransfer }) => {
  const [name, setName] = useState(pilgrim?.name || "");
  const [transferTo, setTransferTo] = useState("");
  if (!open || !pilgrim) return null;
  return (
    <Modal open={open} onClose={onClose} title="إدارة الحاج">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>اسم الحاج</div>
        <Input value={name} onChange={setName} placeholder="اسم الحاج" />
        <Btn onClick={() => { onSave(pilgrim.id, name); onClose(); }} color="#3B82F6" style={{ marginTop: 8, width: "100%" }}>💾 حفظ الاسم</Btn>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>نقل إلى باص آخر</div>
        <select value={transferTo} onChange={e => setTransferTo(e.target.value)}
          style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 8, padding: "10px 12px", fontSize: 14, direction: "rtl", fontFamily: "inherit", outline: "none" }}>
          <option value="">اختر الباص...</option>
          {allBuses.filter(b => b.id !== busId).map(b => <option key={b.id} value={b.id} style={{ background: "#1E293B" }}>{b.name}</option>)}
        </select>
        <Btn onClick={() => { if (transferTo) { onTransfer(pilgrim.id, Number(transferTo)); onClose(); } }} color="#8B5CF6" disabled={!transferTo} style={{ marginTop: 8, width: "100%" }}>🔄 نقل الحاج</Btn>
      </div>
      <Btn onClick={() => { if (window.confirm("هل أنت متأكد من حذف هذا الحاج؟")) { onDelete(pilgrim.id); onClose(); } }} color="#EF4444" style={{ width: "100%" }}>🗑️ حذف الحاج</Btn>
    </Modal>
  );
};

/* ═══════════════════════════════════════════════════════
   FAMILY MANAGEMENT MODAL
   ═══════════════════════════════════════════════════════ */
const FamilyModal = ({ open, onClose, students, busId, allBusConfigs, onCreateFamily, onRemoveFamily, onEditFamily, onTransferFamily }) => {
  const [selected, setSelected] = useState([]);
  const [headId, setHeadId] = useState("");
  const [editFam, setEditFam] = useState(null); // familyId being edited
  const [editMembers, setEditMembers] = useState([]);
  const [editHead, setEditHead] = useState("");
  const [transferFam, setTransferFam] = useState(null);
  const [transferTo, setTransferTo] = useState("");

  const existingFamilies = {};
  students.forEach(s => { if (s.familyId) { if (!existingFamilies[s.familyId]) existingFamilies[s.familyId] = []; existingFamilies[s.familyId].push(s); } });
  const unassigned = students.filter(s => !s.familyId);

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleEditMember = (id) => setEditMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const startEdit = (fid, members) => {
    setEditFam(fid);
    setEditMembers(members.map(m => m.id));
    setEditHead(members.find(m => m.isHead)?.id || "");
  };

  const saveEdit = () => {
    if (editMembers.length >= 2 && editHead) {
      onEditFamily(editFam, editMembers, editHead);
      setEditFam(null); setEditMembers([]); setEditHead("");
    }
  };

  const handleTransfer = () => {
    if (transferFam && transferTo) {
      onTransferFamily(transferFam, Number(transferTo));
      setTransferFam(null); setTransferTo("");
    }
  };

  // All students available for editing (unassigned + current family members)
  const editAvailable = editFam ? students.filter(s => !s.familyId || s.familyId === editFam) : [];

  return (
    <Modal open={open} onClose={() => { onClose(); setEditFam(null); setTransferFam(null); }} title="إدارة العائلات" width={520}>
      {/* Existing families */}
      {Object.keys(existingFamilies).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>العائلات الحالية ({Object.keys(existingFamilies).length})</div>
          {Object.entries(existingFamilies).map(([fid, members]) => {
            const head = members.find(m => m.isHead);
            const isEditing = editFam === fid;
            const isTransferring = transferFam === fid;
            return (
              <div key={fid} style={{ background: isEditing ? "rgba(59,130,246,0.08)" : "rgba(200,169,81,0.08)", borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${isEditing ? "rgba(59,130,246,0.3)" : "rgba(200,169,81,0.2)"}`, transition: "all 0.2s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#C8A951" }}>👨‍👩‍👧‍👦 عائلة {head?.name || "—"} ({members.length})</span>
                  {!isEditing && !isTransferring && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => startEdit(fid, members)} style={{ background: "rgba(59,130,246,0.15)", border: "none", color: "#60A5FA", borderRadius: 6, padding: "4px 8px", fontSize: 10, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>✏️ تعديل</button>
                      <button onClick={() => { setTransferFam(fid); setTransferTo(""); }} style={{ background: "rgba(139,92,246,0.15)", border: "none", color: "#A78BFA", borderRadius: 6, padding: "4px 8px", fontSize: 10, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>🔄 نقل</button>
                      <button onClick={() => onRemoveFamily(fid)} style={{ background: "rgba(239,68,68,0.15)", border: "none", color: "#EF4444", borderRadius: 6, padding: "4px 8px", fontSize: 10, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>🗑️ حذف</button>
                    </div>
                  )}
                </div>

                {/* Normal view */}
                {!isEditing && !isTransferring && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {members.map(m => (
                      <span key={m.id} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: m.isHead ? "rgba(200,169,81,0.2)" : "rgba(255,255,255,0.05)", color: m.isHead ? "#C8A951" : "#94A3B8", fontWeight: m.isHead ? 700 : 400 }}>{m.isHead ? "👑 " : ""}{m.name}</span>
                    ))}
                  </div>
                )}

                {/* Edit mode */}
                {isEditing && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>اختر أفراد العائلة (اضغط لإضافة أو إزالة)</div>
                    <div style={{ maxHeight: 150, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginBottom: 8 }}>
                      {editAvailable.map(s => (
                        <div key={s.id} onClick={() => toggleEditMember(s.id)} style={{
                          padding: "4px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600,
                          background: editMembers.includes(s.id) ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${editMembers.includes(s.id) ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                          color: editMembers.includes(s.id) ? "#60A5FA" : "#64748B",
                        }}>{editMembers.includes(s.id) ? "✓ " : ""}{s.name}</div>
                      ))}
                    </div>
                    {editMembers.length >= 2 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>رب العائلة</div>
                        <select value={editHead} onChange={e => setEditHead(e.target.value)}
                          style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 6, padding: "6px 8px", fontSize: 12, direction: "rtl", fontFamily: "inherit", outline: "none" }}>
                          <option value="">اختر...</option>
                          {editMembers.map(id => { const s = students.find(x => x.id === id); return <option key={id} value={id} style={{ background: "#1E293B" }}>{s?.name}</option>; })}
                        </select>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn onClick={saveEdit} disabled={editMembers.length < 2 || !editHead} color="#22C55E" small>💾 حفظ</Btn>
                      <Btn onClick={() => setEditFam(null)} color="transparent" small style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>إلغاء</Btn>
                    </div>
                  </div>
                )}

                {/* Transfer mode */}
                {isTransferring && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>نقل العائلة كاملة إلى باص آخر</div>
                    <select value={transferTo} onChange={e => setTransferTo(e.target.value)}
                      style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 6, padding: "8px 10px", fontSize: 12, direction: "rtl", fontFamily: "inherit", outline: "none", marginBottom: 8 }}>
                      <option value="">اختر الباص...</option>
                      {allBusConfigs.filter(b => b.id !== busId).map(b => <option key={b.id} value={b.id} style={{ background: "#1E293B" }}>{b.name} — {b.supervisor}</option>)}
                    </select>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn onClick={handleTransfer} disabled={!transferTo} color="#8B5CF6" small>🔄 نقل العائلة</Btn>
                      <Btn onClick={() => setTransferFam(null)} color="transparent" small style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>إلغاء</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create new family */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>إنشاء عائلة جديدة</div>
      {unassigned.length < 2 ? (
        <div style={{ fontSize: 12, color: "#64748B", padding: 12, textAlign: "center", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>لا يوجد حجاج كافين غير مضمومين لعائلة</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>اختر الحجاج ثم حدد رب العائلة</div>
          <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {unassigned.map(s => (
              <div key={s.id} onClick={() => toggleSelect(s.id)} style={{
                padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: selected.includes(s.id) ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${selected.includes(s.id) ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                color: selected.includes(s.id) ? "#60A5FA" : "#64748B",
              }}>{selected.includes(s.id) ? "✓ " : ""}{s.name}</div>
            ))}
          </div>
          {selected.length >= 2 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>رب العائلة</div>
              <select value={headId} onChange={e => setHeadId(e.target.value)}
                style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#F1F5F9", borderRadius: 8, padding: "8px 10px", fontSize: 13, direction: "rtl", fontFamily: "inherit", outline: "none" }}>
                <option value="">اختر رب العائلة...</option>
                {selected.map(id => { const s = students.find(x => x.id === id); return <option key={id} value={id} style={{ background: "#1E293B" }}>{s?.name}</option>; })}
              </select>
            </div>
          )}
          <Btn onClick={() => { if (selected.length >= 2 && headId) { onCreateFamily(selected, headId); setSelected([]); setHeadId(""); } }}
            disabled={selected.length < 2 || !headId} color="#C8A951" style={{ width: "100%" }}>
            👨‍👩‍👧‍👦 إنشاء العائلة ({selected.length} أفراد)
          </Btn>
        </>
      )}
    </Modal>
  );
};

/* ═══════════════════════════════════════════════════════
   ADMIN DASHBOARD
   ═══════════════════════════════════════════════════════ */
const AdminDashboard = ({ busesData, busConfigs, onSelectBus, onUpdateBusConfigs, onLogout }) => {
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [editBus, setEditBus] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPin, setEditPin] = useState("");
  const [editSupervisor, setEditSupervisor] = useState("");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>لوحة تحكم الإدارة</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>إدارة جميع الباصات والمشرفين</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => setMgmtOpen(true)} color="#3B82F6" small>⚙️ إدارة المشرفين</Btn>
          <Btn onClick={onLogout} color="#EF4444" small>خروج</Btn>
        </div>
      </div>

      <AllBusesMap busesData={busesData} busConfigs={busConfigs} onSelectBus={onSelectBus} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {busesData.map(bus => {
          const bc = busConfigs.find(c => c.id === bus.id);
          const chk = bus.students.filter(s => s.checkedIn).length;
          const pct = Math.round((chk / bus.students.length) * 100);
          return (
            <div key={bus.id} onClick={() => onSelectBus(bus.id)} style={{
              background: "rgba(255,255,255,0.04)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
              padding: 20, cursor: "pointer", transition: "all 0.2s", position: "relative", overflow: "hidden",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: bc.color }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#F1F5F9" }}>{bc.name}</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>المشرف: {bc.supervisor}</div>
                  <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", marginTop: 2 }}>
                    {bus.status === "commuting" && bus.destination ? `← ${bus.destination}` : STATUS_AR[bus.status]}
                  </div>
                </div>
                <StatusPill status={bus.status} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#94A3B8" }}>الحضور</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: chk === bus.students.length ? "#22C55E" : "#F1F5F9" }}>{chk}/{bus.students.length}</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: chk === bus.students.length ? "#22C55E" : bc.color, transition: "width 0.5s ease" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Supervisor Management Modal */}
      <Modal open={mgmtOpen} onClose={() => { setMgmtOpen(false); setEditBus(null); }} title="إدارة المشرفين" width={500}>
        {busConfigs.map(bc => (
          <div key={bc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, background: editBus === bc.id ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.04)", marginBottom: 8, border: `1px solid ${editBus === bc.id ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"}`, transition: "all 0.2s" }}>
            <div style={{ width: 8, height: 36, borderRadius: 4, background: bc.color }} />
            <div style={{ flex: 1 }}>
              {editBus === bc.id ? (
                <div>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>اسم المشرف</div>
                  <Input value={editSupervisor} onChange={setEditSupervisor} placeholder="اسم المشرف" style={{ marginBottom: 6 }} />
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>رقم الدخول</div>
                  <Input value={editPin} onChange={setEditPin} placeholder="رقم الدخول" style={{ marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn onClick={() => {
                      onUpdateBusConfigs(busConfigs.map(b => b.id === editBus ? { ...b, supervisor: editSupervisor, pin: editPin } : b));
                      setEditBus(null);
                    }} color="#22C55E" small>💾 حفظ</Btn>
                    <Btn onClick={() => setEditBus(null)} color="transparent" small style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>إلغاء</Btn>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{bc.name} — {bc.supervisor}</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>رقم الدخول: {bc.pin}</div>
                </div>
              )}
            </div>
            {editBus !== bc.id && (
              <button onClick={(e) => { e.stopPropagation(); setEditBus(bc.id); setEditPin(bc.pin); setEditSupervisor(bc.supervisor); }}
                style={{ background: "rgba(59,130,246,0.15)", border: "none", color: "#60A5FA", borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>✏️ تعديل</button>
            )}
          </div>
        ))}
      </Modal>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   BUS LEADER VIEW
   ═══════════════════════════════════════════════════════ */
const BusLeaderView = ({ busData, busConfig, allBusConfigs, onBack, onUpdate, onTransferPilgrim, onTransferFamily, isAdmin }) => {
  const [scanAnim, setScanAnim] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("waiting");
  const [searchQ, setSearchQ] = useState("");
  const [copied, setCopied] = useState(null);
  const [manageMode, setManageMode] = useState(false); // toggle between check-in and manage
  const [destModal, setDestModal] = useState(false);
  const [destInput, setDestInput] = useState("");
  const [mgmtPilgrim, setMgmtPilgrim] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [addName, setAddName] = useState("");
  const [familyModal, setFamilyModal] = useState(false);
  const [familyCheckinModal, setFamilyCheckinModal] = useState(null); // pilgrim obj (head)
  const geoRef = useRef(null);
  const searchRef = useRef(null);

  const students = busData.students;
  const checked = students.filter(s => s.checkedIn).length;
  const total = students.length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus("simulated"); return; }
    navigator.geolocation.getCurrentPosition(
      p => { setGpsStatus("active"); onUpdate({ ...busData, location: { lat: p.coords.latitude, lng: p.coords.longitude } }); },
      () => setGpsStatus("simulated"), { enableHighAccuracy: true, timeout: 8000 });
    geoRef.current = navigator.geolocation.watchPosition(
      p => { setGpsStatus("active"); onUpdate(prev => ({ ...(prev || busData), location: { lat: p.coords.latitude, lng: p.coords.longitude } })); },
      () => setGpsStatus("simulated"), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return () => { if (geoRef.current !== null) navigator.geolocation.clearWatch(geoRef.current); };
  }, []);

  const simulateNFC = () => {
    const un = students.filter(s => !s.checkedIn);
    if (!un.length) return;
    const p = un[Math.floor(Math.random() * un.length)];
    const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    setScanAnim(p.id); setTimeout(() => setScanAnim(null), 1200);
    onUpdate({ ...busData, students: students.map(s => s.id === p.id ? { ...s, checkedIn: true, time: now, method: "nfc" } : s) });
  };

  const togglePilgrim = (pid) => {
    const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const st = students.find(s => s.id === pid);
    if (!st.checkedIn) { setScanAnim(pid); setTimeout(() => setScanAnim(null), 800); }
    onUpdate({ ...busData, students: students.map(s => s.id === pid ? { ...s, checkedIn: !s.checkedIn, time: s.checkedIn ? null : now, method: s.checkedIn ? null : "manual" } : s) });
  };

  const checkinFamily = (headPilgrim, allMembers) => {
    const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const memberIds = students.filter(s => s.familyId === headPilgrim.familyId).map(s => s.id);
    if (allMembers) {
      onUpdate({ ...busData, students: students.map(s => memberIds.includes(s.id) ? { ...s, checkedIn: true, time: now, method: "manual" } : s) });
    } else {
      togglePilgrim(headPilgrim.id);
    }
    setFamilyCheckinModal(null);
  };

  const setStatus = (s) => {
    if (s === "commuting") { setDestModal(true); return; }
    onUpdate({ ...busData, status: s, destination: s === "commuting" ? busData.destination : "" });
  };

  const confirmDest = () => {
    if (!destInput.trim()) return;
    onUpdate({ ...busData, status: "commuting", destination: destInput.trim() });
    setDestModal(false); setDestInput("");
  };

  const copyList = (type) => {
    const list = students.filter(s => type === "present" ? s.checkedIn : !s.checkedIn);
    const header = type === "present" ? `✅ الحجاج المتواجدون في ${busConfig.name} (${list.length})` : `❌ الحجاج الغائبون عن ${busConfig.name} (${list.length})`;
    const text = header + "\n" + list.map((s, i) => `${i + 1}. ${s.name}${s.time ? ` — ${s.time}` : ""}`).join("\n");
    // Fallback copy method
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); setCopied(type); setTimeout(() => setCopied(null), 2500); }
    catch(e) { navigator.clipboard?.writeText(text).then(() => { setCopied(type); setTimeout(() => setCopied(null), 2500); }); }
    document.body.removeChild(ta);
  };

  const addPilgrim = () => {
    if (!addName.trim()) return;
    const newId = `B${String(busData.id).padStart(2,"0")}-P${String(students.length + 1).padStart(3,"0")}`;
    onUpdate({ ...busData, students: [...students, { id: newId, name: addName.trim(), checkedIn: false, time: null, method: null, familyId: null, isHead: false }] });
    setAddName(""); setAddModal(false);
  };

  const savePilgrimName = (pid, name) => {
    onUpdate({ ...busData, students: students.map(s => s.id === pid ? { ...s, name } : s) });
  };

  const deletePilgrim = (pid) => {
    onUpdate({ ...busData, students: students.filter(s => s.id !== pid) });
  };

  const createFamily = (ids, headId) => {
    const fid = nextFamilyId();
    onUpdate({ ...busData, students: students.map(s => ids.includes(s.id) ? { ...s, familyId: fid, isHead: s.id === headId } : s) });
  };

  const removeFamily = (fid) => {
    onUpdate({ ...busData, students: students.map(s => s.familyId === fid ? { ...s, familyId: null, isHead: false } : s) });
  };

  const editFamily = (fid, newMemberIds, newHeadId) => {
    // Remove old family assignments for this fid, then assign new members
    onUpdate({ ...busData, students: students.map(s => {
      if (s.familyId === fid) return { ...s, familyId: null, isHead: false }; // clear old
      return s;
    }).map(s => {
      if (newMemberIds.includes(s.id)) return { ...s, familyId: fid, isHead: s.id === newHeadId };
      return s;
    })});
  };

  const transferFamily = (fid, toBusId) => {
    const familyMembers = students.filter(s => s.familyId === fid);
    if (!familyMembers.length) return;
    onTransferFamily(busData.id, fid, toBusId);
  };

  const resetAll = () => {
    // Preserve family assignments, only reset check-in status
    onUpdate({ ...busData, students: students.map(s => ({ ...s, checkedIn: false, time: null, method: null })), status: "stopped", destination: "" });
    setSearchQ("");
  };

  // Sort: heads first, then others
  const sortedStudents = [...students].sort((a, b) => {
    if (a.isHead && !b.isHead) return -1;
    if (!a.isHead && b.isHead) return 1;
    return 0;
  });

  const filtered = searchQ.trim() ? sortedStudents.filter(s => s.name.includes(searchQ.trim()) || s.id.toLowerCase().includes(searchQ.trim().toLowerCase())) : sortedStudents;
  const isSearching = searchQ.trim().length > 0;

  const statusBtns = [
    { key: "stopped", label: "متوقف", icon: "⏹", color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
    { key: "boarding", label: "ركوب الحجاج", icon: "🚶", color: "#C8A951", bg: "rgba(200,169,81,0.12)" },
    { key: "commuting", label: "يتحرك", icon: "🚌", color: "#22C55E", bg: "rgba(34,197,94,0.12)" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>→ رجوع</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>{busConfig.name} — {busConfig.supervisor}</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>نظام تسجيل حضور الحجاج</div>
        </div>
        <Btn onClick={resetAll} color="transparent" small style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>🔄 إعادة</Btn>
      </div>

      {/* GPS */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 14px", borderRadius: 10, background: gpsStatus === "active" ? "rgba(34,197,94,0.08)" : "rgba(251,191,36,0.08)", border: `1px solid ${gpsStatus === "active" ? "rgba(34,197,94,0.2)" : "rgba(251,191,36,0.2)"}` }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: gpsStatus === "active" ? "#22C55E" : "#FBBF24" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: gpsStatus === "active" ? "#22C55E" : "#FBBF24" }}>
          {gpsStatus === "active" ? "📱 GPS نشط — يتم تحديد الموقع من هاتفك" : "📍 وضع المحاكاة"}
        </span>
      </div>

      {/* Status */}
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 12 }}>حالة الباص {busData.status === "commuting" && busData.destination && <span style={{ color: "#22C55E" }}>← {busData.destination}</span>}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {statusBtns.map(btn => (
            <button key={btn.key} onClick={() => setStatus(btn.key)} style={{
              flex: 1, padding: "12px 8px", borderRadius: 10, border: "2px solid", cursor: "pointer", transition: "all 0.2s", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              background: busData.status === btn.key ? btn.bg : "rgba(255,255,255,0.02)",
              borderColor: busData.status === btn.key ? btn.color + "55" : "rgba(255,255,255,0.06)",
              color: busData.status === btn.key ? btn.color : "#64748B",
              transform: busData.status === btn.key ? "scale(1.02)" : "scale(1)",
            }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{btn.icon}</div>{btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Counter + NFC */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: `linear-gradient(135deg, ${busConfig.color}18, ${busConfig.color}08)`, borderRadius: 14, border: `1px solid ${busConfig.color}30`, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: "#F1F5F9", lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
            {checked}<span style={{ fontSize: 20, color: "#64748B", fontWeight: 500 }}>/{total}</span>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginTop: 12 }}>
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: checked === total ? "#22C55E" : busConfig.color, transition: "width 0.5s" }} />
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>{checked === total ? "✅ جميع الحجاج على متن الباص" : `${total - checked} حاج متبقي`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={simulateNFC} style={{ flex: 1, borderRadius: 14, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${busConfig.color}, ${busConfig.color}CC)`, color: "#fff", fontWeight: 800, fontSize: 15, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
            <span style={{ fontSize: 28 }}>📱</span>محاكاة مسح NFC
          </button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            <Btn onClick={() => setAddModal(true)} color="#3B82F6" small>+ إضافة حاج</Btn>
            <Btn onClick={() => setFamilyModal(true)} color="#8B5CF6" small>👨‍👩‍👧‍👦 العائلات</Btn>
            <Btn onClick={() => setManageMode(!manageMode)} color={manageMode ? "#EF4444" : "#64748B"} small style={{ border: manageMode ? "none" : "1px solid rgba(255,255,255,0.15)" }}>
              {manageMode ? "✕ إنهاء الإدارة" : "⚙️ إدارة الحجاج"}
            </Btn>
          </div>
        </div>
      </div>

      {/* Roster Header + Search */}
      <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>قائمة الحجاج</div>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748B" }}>
          <span>🟢 {checked}</span><span>⚫ {total - checked}</span>
        </div>
      </div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <input ref={searchRef} type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="🔍 ابحث عن اسم الحاج..."
          style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${isSearching ? busConfig.color + "55" : "rgba(255,255,255,0.12)"}`, color: "#F1F5F9", borderRadius: 12, padding: "12px 16px", paddingLeft: searchQ ? 40 : 16, fontSize: 14, outline: "none", direction: "rtl", boxSizing: "border-box", fontFamily: "inherit" }} />
        {searchQ && <button onClick={() => { setSearchQ(""); searchRef.current?.focus(); }} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.1)", border: "none", color: "#94A3B8", cursor: "pointer", borderRadius: "50%", width: 24, height: 24, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>}
        {isSearching && <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>عرض {filtered.length} نتيجة</div>}
      </div>

      {/* Manage Mode Banner */}
      {manageMode && (
        <div style={{ marginBottom: 8, padding: "8px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 12, color: "#EF4444", fontWeight: 600, textAlign: "center" }}>
          ⚙️ وضع الإدارة — اضغط على أي حاج لتعديله أو نقله أو حذفه
        </div>
      )}

      {/* Student Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 6, marginBottom: 16 }}>
        {filtered.map(s => {
          const isHead = s.isHead;
          const familyMembers = s.familyId ? students.filter(x => x.familyId === s.familyId) : [];
          return (
            <div key={s.id} onClick={() => {
              if (manageMode) { setMgmtPilgrim(s); }
              else if (isHead) { setFamilyCheckinModal(s); }
              else { togglePilgrim(s.id); }
            }} style={{
              padding: "10px 12px", borderRadius: 10, cursor: "pointer", userSelect: "none", transition: "all 0.3s",
              background: manageMode ? "rgba(239,68,68,0.04)" : s.checkedIn ? `${busConfig.color}18` : isHead ? "rgba(200,169,81,0.06)" : "rgba(255,255,255,0.03)",
              border: `${isHead ? "2px" : "1px"} solid ${manageMode ? "rgba(239,68,68,0.2)" : isHead ? "rgba(200,169,81,0.4)" : s.checkedIn ? busConfig.color + "40" : "rgba(255,255,255,0.06)"}`,
              transform: scanAnim === s.id ? "scale(1.06)" : "scale(1)",
              boxShadow: scanAnim === s.id ? `0 0 20px ${busConfig.color}44` : isHead && !manageMode ? "0 0 8px rgba(200,169,81,0.1)" : "none",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: s.checkedIn ? "#F1F5F9" : "#475569" }}>
                  {manageMode ? "⚙️ " : isHead ? "👑 " : s.familyId ? "👤 " : ""}{s.name}
                </span>
                <span style={{ fontSize: 16 }}>{s.checkedIn ? "✅" : "⬜"}</span>
              </div>
              {isHead && familyMembers.length > 0 && !manageMode && (
                <div style={{ fontSize: 10, color: "#C8A951", marginTop: 2 }}>رب عائلة ({familyMembers.length} أفراد)</div>
              )}
              {s.checkedIn && s.time && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: "#64748B" }}>{s.time}</span>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: s.method === "nfc" ? "rgba(59,130,246,0.15)" : "rgba(148,163,184,0.1)", color: s.method === "nfc" ? "#60A5FA" : "#94A3B8", fontWeight: 600 }}>{s.method === "nfc" ? "NFC" : "يدوي"}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Copy Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <button onClick={() => copyList("absent")} style={{ padding: 12, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: copied === "absent" ? "#22C55E" : "#EF4444", fontFamily: "inherit", transition: "all 0.3s" }}>
          {copied === "absent" ? "✅ تم النسخ!" : `📋 نسخ الغائبين (${total - checked})`}
        </button>
        <button onClick={() => copyList("present")} style={{ padding: 12, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: copied === "present" ? "#22C55E" : "#10B981", fontFamily: "inherit", transition: "all 0.3s" }}>
          {copied === "present" ? "✅ تم النسخ!" : `📋 نسخ الحاضرين (${checked})`}
        </button>
      </div>

      {/* Map at bottom */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>📍 موقع الباص</div>
        <BusMap location={busData.location} status={busData.status} busColor={busConfig.color} />
      </div>

      {/* ── MODALS ── */}

      {/* Destination Popup */}
      <Modal open={destModal} onClose={() => setDestModal(false)} title="🚌 إلى أين يتحرك الباص؟">
        <Input value={destInput} onChange={setDestInput} placeholder="اكتب الوجهة هنا..." style={{ marginBottom: 12, fontSize: 16, padding: "14px 16px" }} />
        <Btn onClick={confirmDest} disabled={!destInput.trim()} color="#22C55E" style={{ width: "100%", fontSize: 16, padding: 14 }}>✅ تأكيد وتحريك الباص</Btn>
        {!destInput.trim() && <div style={{ textAlign: "center", fontSize: 12, color: "#EF4444", marginTop: 8 }}>يجب كتابة الوجهة أولاً</div>}
      </Modal>

      {/* Pilgrim Management */}
      <PilgrimMgmtModal open={!!mgmtPilgrim} onClose={() => setMgmtPilgrim(null)} pilgrim={mgmtPilgrim}
        busId={busData.id} allBuses={allBusConfigs} onSave={savePilgrimName} onDelete={deletePilgrim}
        onTransfer={(pid, toBus) => { onTransferPilgrim(busData.id, pid, toBus); setMgmtPilgrim(null); }} />

      {/* Add Pilgrim */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="➕ إضافة حاج جديد">
        <Input value={addName} onChange={setAddName} placeholder="اسم الحاج" style={{ marginBottom: 12 }} />
        <Btn onClick={addPilgrim} disabled={!addName.trim()} color="#3B82F6" style={{ width: "100%" }}>إضافة</Btn>
      </Modal>

      {/* Family Management */}
      <FamilyModal open={familyModal} onClose={() => setFamilyModal(false)} students={students}
        busId={busData.id} allBusConfigs={allBusConfigs}
        onCreateFamily={createFamily} onRemoveFamily={removeFamily}
        onEditFamily={editFamily} onTransferFamily={transferFamily} />

      {/* Family Head Check-in */}
      <Modal open={!!familyCheckinModal} onClose={() => setFamilyCheckinModal(null)} title="👑 تسجيل حضور رب العائلة">
        {familyCheckinModal && (() => {
          const members = students.filter(s => s.familyId === familyCheckinModal.familyId);
          return (
            <div>
              <div style={{ fontSize: 14, color: "#94A3B8", marginBottom: 16 }}>
                عائلة {familyCheckinModal.name} — {members.length} أفراد
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                {members.map(m => <span key={m.id} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: m.checkedIn ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)", color: m.checkedIn ? "#22C55E" : "#94A3B8", border: `1px solid ${m.checkedIn ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}` }}>{m.isHead ? "👑 " : ""}{m.name} {m.checkedIn ? "✅" : ""}</span>)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={() => checkinFamily(familyCheckinModal, false)} color="#3B82F6" style={{ flex: 1 }}>تسجيل رب العائلة فقط</Btn>
                <Btn onClick={() => checkinFamily(familyCheckinModal, true)} color="#22C55E" style={{ flex: 1 }}>✅ تسجيل كل العائلة</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════ */
export default function App() {
  const [auth, setAuth] = useState(null); // null | { role, busId? }
  const [view, setView] = useState("dashboard"); // "dashboard" | busId number
  const [busConfigs, setBusConfigs] = useState(INITIAL_BUSES);
  const [busesData, setBusesData] = useState(
    INITIAL_BUSES.map(b => ({ id: b.id, students: genPilgrims(b.id), status: "stopped", destination: "", location: { lat: 26.2235 + (b.id - 4) * 0.008, lng: 50.5876 + (b.id - 4) * 0.006 } }))
  );

  const handleLogin = ({ role, pin }) => {
    if (role === "admin") { setAuth({ role: "admin" }); return; }
    const bus = busConfigs.find(b => b.pin === pin);
    if (bus) { setAuth({ role: "supervisor", busId: bus.id }); setView(bus.id); }
    else { return; } // LoginPage handles error
  };

  // Override login to pass error back
  const handleLoginFull = ({ role, pin }) => {
    if (role === "admin") { setAuth({ role: "admin" }); return true; }
    const bus = busConfigs.find(b => b.pin === pin);
    if (bus) { setAuth({ role: "supervisor", busId: bus.id }); setView(bus.id); return true; }
    return false;
  };

  const updateBus = useCallback((busId, dataOrFn) => {
    setBusesData(prev => prev.map(b => {
      if (b.id !== busId) return b;
      if (typeof dataOrFn === "function") return { ...b, ...dataOrFn(b) };
      return dataOrFn;
    }));
  }, []);

  const transferPilgrim = (fromBus, pilgrimId, toBus) => {
    setBusesData(prev => {
      const from = prev.find(b => b.id === fromBus);
      const pilgrim = from.students.find(s => s.id === pilgrimId);
      if (!pilgrim) return prev;
      return prev.map(b => {
        if (b.id === fromBus) return { ...b, students: b.students.filter(s => s.id !== pilgrimId) };
        if (b.id === toBus) return { ...b, students: [...b.students, { ...pilgrim, id: `B${String(toBus).padStart(2,"0")}-P${String(b.students.length + 1).padStart(3,"0")}`, checkedIn: false, time: null }] };
        return b;
      });
    });
  };

  const transferFamilyFn = (fromBus, familyId, toBus) => {
    setBusesData(prev => {
      const from = prev.find(b => b.id === fromBus);
      const familyMembers = from.students.filter(s => s.familyId === familyId);
      if (!familyMembers.length) return prev;
      return prev.map(b => {
        if (b.id === fromBus) return { ...b, students: b.students.filter(s => s.familyId !== familyId) };
        if (b.id === toBus) {
          const newMembers = familyMembers.map((m, i) => ({
            ...m,
            id: `B${String(toBus).padStart(2,"0")}-P${String(b.students.length + i + 1).padStart(3,"0")}`,
            checkedIn: false, time: null,
          }));
          return { ...b, students: [...b.students, ...newMembers] };
        }
        return b;
      });
    });
  };

  // Simulated GPS
  useEffect(() => {
    const iv = setInterval(() => {
      setBusesData(prev => prev.map(b => {
        if (b.status !== "commuting" || !b.location) return b;
        return { ...b, location: { lat: b.location.lat + (Math.random() - 0.45) * 0.0015, lng: b.location.lng + (Math.random() - 0.45) * 0.0015 } };
      }));
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const selBus = typeof view === "number" ? busesData.find(b => b.id === view) : null;
  const selConfig = typeof view === "number" ? busConfigs.find(b => b.id === view) : null;

  if (!auth) {
    return <LoginPage onLogin={({ role, pin }) => {
      if (role === "admin") { setAuth({ role: "admin" }); return; }
      const bus = busConfigs.find(b => b.pin === pin);
      if (bus) { setAuth({ role: "supervisor", busId: bus.id }); setView(bus.id); }
    }} />;
  }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#0F172A", color: "#F1F5F9", fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=JetBrains+Mono:wght@700;900&family=Amiri:wght@700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        * { box-sizing: border-box; }
        .leaflet-container { font-family: inherit !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      `}</style>

      {/* Top Bar */}
      <div style={{ background: "rgba(15,23,42,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(20px)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 1100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #C8A951, #A67C2E)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🕋</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>نظام تتبع باصات الحجاج</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>{auth.role === "admin" ? "الإدارة" : `المشرف: ${selConfig?.supervisor || ""}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {auth.role === "admin" && typeof view === "number" && (
            <Btn onClick={() => setView("dashboard")} color="rgba(200,169,81,0.15)" small style={{ border: "1px solid rgba(200,169,81,0.3)", color: "#C8A951" }}>لوحة التحكم</Btn>
          )}
          <Btn onClick={() => { setAuth(null); setView("dashboard"); }} color="rgba(239,68,68,0.15)" small style={{ border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444" }}>خروج</Btn>
        </div>
      </div>

      <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        {auth.role === "admin" && view === "dashboard" ? (
          <AdminDashboard busesData={busesData} busConfigs={busConfigs} onSelectBus={id => setView(id)} onUpdateBusConfigs={setBusConfigs} onLogout={() => { setAuth(null); setView("dashboard"); }} />
        ) : selBus && selConfig ? (
          <BusLeaderView busData={selBus} busConfig={selConfig} allBusConfigs={busConfigs}
            onBack={() => auth.role === "admin" ? setView("dashboard") : setAuth(null)}
            onUpdate={data => updateBus(selBus.id, data)}
            onTransferPilgrim={transferPilgrim}
            onTransferFamily={transferFamilyFn}
            isAdmin={auth.role === "admin"} />
        ) : null}
      </div>
    </div>
  );
}
