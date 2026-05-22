import { useState, useEffect, useRef, useCallback } from "react";
import {
  saveBusData, saveBusConfigs, saveSettings,
  listenToAllBuses, listenToBusConfigs, listenToSettings,
  saveCar, deleteCar as deleteCarFb, listenToCars, addCarHistory, listenToCarHistory,
  saveCarTracking, listenToCarTracking, saveSavedNames, listenToSavedNames, uploadImage,
  saveCarRequest, listenToCarRequests, closeCarRequest, listenToCarRequestsLog
} from "./firebase";

/* ═══════ CONSTANTS ═══════ */
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
const BUS_CAPACITY = 55;
const STATUS_AR = { stopped: "متوقف", boarding: "ركوب الحجاج", commuting: "يتحرك" };
const INITIAL_BUSES = [
  { id:1,name:"باص 1",color:"#C8A951",supervisor:"أحمد محمد",pin:"1111",busAdmins:[] },
  { id:2,name:"باص 2",color:"#3B82F6",supervisor:"علي حسن",pin:"2222",busAdmins:[] },
  { id:3,name:"باص 3",color:"#10B981",supervisor:"خالد عبدالله",pin:"3333",busAdmins:[] },
  { id:4,name:"باص 4",color:"#E8533F",supervisor:"سعيد إبراهيم",pin:"4444",busAdmins:[] },
  { id:5,name:"باص 5",color:"#8B5CF6",supervisor:"محمود يوسف",pin:"5555",busAdmins:[] },
  { id:6,name:"باص 6",color:"#EC4899",supervisor:"عمر سالم",pin:"6666",busAdmins:[] },
  { id:7,name:"باص 7",color:"#06B6D4",supervisor:"فهد ناصر",pin:"7777",busAdmins:[] },
];
const INITIAL_BUS_DATA = INITIAL_BUSES.map(b => ({
  id:b.id, students:[], status:"stopped", destination:"",
  location:{lat:26.2235+(b.id-4)*0.008,lng:50.5876+(b.id-4)*0.006}
}));

let _pid = Date.now(); const nid = () => `P${++_pid}`;

/* ═══════ COMMITTEES & VEHICLE TYPES ═══════ */
const DEFAULT_COMMITTEES = [
  "الإدارة","لجنة البرامج والإرشاد","لجنة التغذية والضيافة",
  "لجنة الدعم والمساندة","لجنة المعلومات","لجنة التفويج والطريق",
  "اللجنة النسائية","اللجنة الإعلامية"
];
const VEHICLE_TYPES = [
  { value: "car_with_driver", label: "🚗 سيارة مع سائق" },
  { value: "car_without_driver", label: "🔑 سيارة بدون سائق" },
  { value: "refrigerated_truck", label: "❄️ شاحنة مبردة" },
  { value: "bus", label: "🚌 باص" }
];
const vehicleLabel = (val) => (VEHICLE_TYPES.find(v => v.value === val)?.label) || val || "—";

/* ═══════ PIN VALIDATION ═══════ */
// Returns array of {pin, label} for all PINs currently in use, optionally excluding one
const collectAllPins=(settings,busConfigs,excludeKey)=>{
  const pins=[];
  if(excludeKey!=="adminPin"&&settings.adminPin) pins.push({pin:settings.adminPin,label:"الإدارة"});
  if(excludeKey!=="viewerPin"&&settings.viewerPin) pins.push({pin:settings.viewerPin,label:"المشاهد"});
  if(excludeKey!=="carSupervisorPin"&&settings.carSupervisorPin) pins.push({pin:settings.carSupervisorPin,label:"مشرف السيارات"});
  busConfigs.forEach(bc=>{
    if(excludeKey!==`bus_${bc.id}`&&bc.pin) pins.push({pin:bc.pin,label:`مشرف ${bc.name}`});
    (bc.busAdmins||[]).forEach(ba=>{
      if(excludeKey!==`ba_${ba.id}`&&ba.pin) pins.push({pin:ba.pin,label:`إداري ${bc.name}: ${ba.name}`});
    });
  });
  return pins;
};
// Returns conflict label or null
const checkPinConflict=(newPin,settings,busConfigs,excludeKey)=>{
  if(!newPin||!newPin.trim())return null;
  const allPins=collectAllPins(settings,busConfigs,excludeKey);
  const conflict=allPins.find(p=>p.pin===newPin.trim());
  return conflict?conflict.label:null;
};

/* ═══════ THEMES ═══════ */
const THEMES = {
  dark: { bg:"#0F172A",bgCard:"rgba(255,255,255,0.04)",bgCardHover:"rgba(255,255,255,0.08)",bgInput:"rgba(255,255,255,0.06)",bgTopBar:"rgba(15,23,42,0.95)",text:"#F1F5F9",textMuted:"#94A3B8",textDim:"#64748B",border:"rgba(255,255,255,0.08)",borderInput:"rgba(255,255,255,0.12)",borderTopBar:"rgba(255,255,255,0.06)",modalBg:"#1E293B",modalBorder:"rgba(255,255,255,0.1)",loginBg:"linear-gradient(180deg,#0B1120 0%,#152238 50%,#0F172A 100%)",loginCard:"rgba(30,41,59,0.7)",loginInput:"rgba(15,23,42,0.8)",scrollThumb:"rgba(255,255,255,0.1)" },
  light: { bg:"#F1F5F9",bgCard:"rgba(0,0,0,0.03)",bgCardHover:"rgba(0,0,0,0.06)",bgInput:"rgba(0,0,0,0.04)",bgTopBar:"rgba(255,255,255,0.95)",text:"#1E293B",textMuted:"#475569",textDim:"#64748B",border:"rgba(0,0,0,0.08)",borderInput:"rgba(0,0,0,0.12)",borderTopBar:"rgba(0,0,0,0.08)",modalBg:"#FFFFFF",modalBorder:"rgba(0,0,0,0.1)",loginBg:"linear-gradient(180deg,#E2E8F0 0%,#F1F5F9 50%,#E2E8F0 100%)",loginCard:"rgba(255,255,255,0.9)",loginInput:"rgba(241,245,249,0.9)",scrollThumb:"rgba(0,0,0,0.15)" }
};
const getTheme=()=>{try{return localStorage.getItem("hbt_theme")||"dark"}catch(e){return"dark"}};
const setThemeStorage=(t)=>{try{localStorage.setItem("hbt_theme",t)}catch(e){}};

/* ═══════ LEAFLET ═══════ */
const useLeaflet=()=>{const[r,setR]=useState(false);useEffect(()=>{if(window.L){setR(true);return;}if(!document.getElementById("lf-css")){const l=document.createElement("link");l.id="lf-css";l.rel="stylesheet";l.href=LEAFLET_CSS;document.head.appendChild(l);}if(!document.getElementById("lf-js")){const s=document.createElement("script");s.id="lf-js";s.src=LEAFLET_JS;s.onload=()=>setR(true);document.head.appendChild(s);}else{if(window.L)setR(true);else document.getElementById("lf-js").addEventListener("load",()=>setR(true));}},[]); return r;};
const mkIcon=(color,status)=>{if(!window.L)return null;const sc=status==="commuting"?"#22C55E":status==="boarding"?"#C8A951":"#EF4444";return window.L.divIcon({className:"",iconSize:[40,40],iconAnchor:[20,20],html:`<svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="11" fill="${color}" stroke="#fff" stroke-width="2.5"/><circle cx="20" cy="20" r="4" fill="#fff"/><circle cx="30" cy="10" r="5" fill="${sc}" stroke="#fff" stroke-width="1.5"/></svg>`});};

/* ═══════ UI COMPONENTS ═══════ */
const StatusPill=({status})=>{const c={stopped:["rgba(239,68,68,0.12)","#EF4444"],commuting:["rgba(34,197,94,0.12)","#22C55E"],boarding:["rgba(200,169,81,0.15)","#C8A951"]}[status];return<span style={{display:"inline-flex",alignItems:"center",padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:600,background:c[0],color:c[1]}}>● {STATUS_AR[status]}</span>;};

const Modal=({open,onClose,title,children,width,t})=>{if(!open)return null;const th=t||THEMES.dark;return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}><div onClick={e=>e.stopPropagation()} style={{background:th.modalBg,borderRadius:16,border:`1px solid ${th.modalBorder}`,padding:24,width:"100%",maxWidth:width||460,maxHeight:"88vh",overflowY:"auto",direction:"rtl",color:th.text}}>{title&&<div style={{fontSize:18,fontWeight:800,marginBottom:16}}>{title}</div>}{children}</div></div>);};

const Btn=({children,onClick,color,disabled,small,style:s})=>(<button onClick={onClick} disabled={disabled} style={{padding:small?"6px 12px":"10px 16px",borderRadius:8,border:"none",cursor:disabled?"not-allowed":"pointer",background:color||"#C8A951",color:"#fff",fontWeight:700,fontSize:small?12:14,opacity:disabled?0.4:1,fontFamily:"inherit",...s}}>{children}</button>);

const Input=({value,onChange,placeholder,type,style:s})=>(<input type={type||"text"} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:8,padding:"10px 12px",fontSize:14,outline:"none",direction:"rtl",boxSizing:"border-box",fontFamily:"inherit",...s}}/>);

/* ═══════ LOGIN PAGE ═══════ */
const LoginPage=({onLogin,settings,busConfigs,theme,toggleTheme})=>{
  const[pin,setPin]=useState("");const[error,setError]=useState("");const[mode,setMode]=useState("supervisor");
  const t=THEMES[theme||"dark"];
  const go=()=>{
    if(!pin.trim()){setError("أدخل الرقم");return;}
    if(mode==="admin"){
      if(pin===settings.adminPin) onLogin({role:"admin"});
      else if(pin===settings.viewerPin) onLogin({role:"viewer"});
      else if(pin===settings.carSupervisorPin) onLogin({role:"carSupervisor"});
      else setError("رقم غير صحيح");
    } else {
      // Check bus supervisors
      const bus=busConfigs.find(b=>b.pin===pin);
      if(bus){onLogin({role:"supervisor",busId:bus.id});return;}
      // Check bus admins
      for(const bc of busConfigs){
        const ba=(bc.busAdmins||[]).find(a=>a.pin===pin);
        if(ba){onLogin({role:"busAdmin",busId:bc.id,adminId:ba.id,canCheckin:ba.canCheckin});return;}
      }
      setError("رقم غير صحيح");
    }
  };
  return(
    <div style={{minHeight:"100vh",background:t.loginBg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,direction:"rtl",fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Amiri:wght@700&display=swap" rel="stylesheet"/>
      <button onClick={toggleTheme} style={{position:"absolute",top:20,left:20,background:theme==="dark"?"rgba(251,191,36,0.15)":"rgba(99,102,241,0.15)",border:`1px solid ${theme==="dark"?"rgba(251,191,36,0.3)":"rgba(99,102,241,0.3)"}`,color:theme==="dark"?"#FBBF24":"#6366F1",borderRadius:10,padding:"8px 12px",fontSize:18,cursor:"pointer"}}>{theme==="dark"?"☀️":"🌙"}</button>
      <div style={{marginBottom:24}}><svg width="120" height="100" viewBox="0 0 120 100" fill="none"><rect x="10" y="20" width="100" height="55" rx="12" fill="#C8A951" opacity="0.9"/><rect x="15" y="28" width="25" height="20" rx="4" fill="#0B1120" opacity="0.7"/><rect x="47" y="28" width="25" height="20" rx="4" fill="#0B1120" opacity="0.7"/><rect x="79" y="28" width="25" height="20" rx="4" fill="#0B1120" opacity="0.7"/><rect x="10" y="55" width="100" height="8" fill="#A67C2E"/><rect x="45" y="55" width="30" height="20" rx="3" fill="#1E293B"/><circle cx="30" cy="80" r="8" fill="#334155" stroke="#C8A951" strokeWidth="3"/><circle cx="90" cy="80" r="8" fill="#334155" stroke="#C8A951" strokeWidth="3"/></svg></div>
      <div style={{textAlign:"center",marginBottom:8}}>
        {mode==="admin"?<div style={{fontSize:28,fontWeight:800,color:"#C8A951",fontFamily:"'Amiri',serif"}}>لوحة الإدارة</div>
        :<><div style={{fontSize:36,fontWeight:800,color:"#C8A951",fontFamily:"'Amiri',serif",lineHeight:1.2}}>حملة المواسم</div><div style={{fontSize:16,color:t.textMuted,marginTop:4}}>نظام متابعة الباصات</div></>}
        <div style={{width:60,height:3,background:"linear-gradient(90deg,transparent,#C8A951,transparent)",margin:"12px auto 0"}}/>
      </div>
      <div style={{width:"100%",maxWidth:400,background:t.loginCard,borderRadius:16,padding:"32px 24px",marginTop:32,border:`1px solid ${t.border}`}}>
        <div style={{textAlign:"center",fontSize:15,color:t.textMuted,marginBottom:16}}>{mode==="supervisor"?"الرقم الشخصي أو رقم المشرف":"رقم الدخول"}</div>
        <input type="password" inputMode="numeric" value={pin} onChange={e=>{setPin(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="أدخل رقمك" style={{width:"100%",background:t.loginInput,border:`1px solid ${error?"rgba(239,68,68,0.5)":t.borderInput}`,color:t.text,borderRadius:12,padding:"18px 16px",fontSize:18,textAlign:"center",outline:"none",boxSizing:"border-box",fontFamily:"inherit",letterSpacing:"0.2em"}}/>
        {error&&<div style={{color:"#EF4444",fontSize:13,textAlign:"center",marginTop:8,fontWeight:600}}>{error}</div>}
        <button onClick={go} style={{width:"100%",padding:16,borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#C8A951,#A67C2E)",color:"#0B1120",fontSize:20,fontWeight:800,marginTop:16,fontFamily:"inherit"}}>دخول</button>
      </div>
      <button onClick={()=>{setMode(mode==="supervisor"?"admin":"supervisor");setPin("");setError("");}} style={{background:"none",border:"none",color:t.textDim,fontSize:14,marginTop:24,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}>{mode==="supervisor"?"دخول الإدارة / مشرف السيارات":"دخول المشرف"}</button>
      <a href="/request-car" style={{marginTop:20,padding:"14px 28px",borderRadius:12,background:"rgba(6,182,212,0.15)",border:"1px solid rgba(6,182,212,0.35)",color:"#06B6D4",fontSize:15,fontWeight:700,cursor:"pointer",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:8,fontFamily:"inherit"}}>🚗 طلب وسيلة نقل</a>
      <div style={{marginTop:32,fontSize:13,color:t.textDim,textAlign:"center",opacity:0.7}}>برمجة وتصميم / خالد محمود المرزوقي</div>
    </div>
  );
};

/* ═══════ MAPS ═══════ */
const SimpleMap=({locations,height,busConfigs})=>{
  const ref=useRef(null);const mapRef=useRef(null);const markers=useRef({});const ready=useLeaflet();
  useEffect(()=>{
    if(!ready||!ref.current||mapRef.current)return;const L=window.L;
    const m=L.map(ref.current,{center:[26.2235,50.5876],zoom:13,zoomControl:false,attributionControl:false});
    L.control.zoom({position:"topright"}).addTo(m);L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{maxZoom:19}).addTo(m);mapRef.current=m;
    const locs=locations.filter(l=>l.lat&&l.lng);
    locs.forEach(l=>{const ic=mkIcon(l.color||"#C8A951",l.status||"stopped");markers.current[l.id]=L.marker([l.lat,l.lng],{icon:ic}).addTo(m).bindPopup(`<div style="text-align:center;font-family:sans-serif;font-weight:700;">${l.label||""}</div>`);});
    if(locs.length)m.fitBounds(locs.map(l=>[l.lat,l.lng]),{padding:[40,40],maxZoom:14});
    return()=>{m.remove();mapRef.current=null;markers.current={};};
  },[ready]);
  useEffect(()=>{if(!mapRef.current||!ready)return;locations.forEach(l=>{const mk=markers.current[l.id];if(mk&&l.lat&&l.lng){mk.setLatLng([l.lat,l.lng]);mk.setIcon(mkIcon(l.color||"#C8A951",l.status||"stopped"));}});},[locations,ready]);
  return(<div style={{position:"relative",borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)",marginBottom:20}}><div ref={ref} style={{width:"100%",height:height||300}}/>{!ready&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.95)",color:"#64748B",fontSize:13}}>جاري التحميل...</div>}</div>);
};

/* ═══════ ADMIN: PILGRIM MGMT (unchanged from before, compact) ═══════ */
const PilgrimMgmtPage=({busesData,busConfigs,onAdd,onDelete,onEdit,onTransfer,onBulkImport,onBack,t})=>{
  const[sid,setSid]=useState(1);const[an,setAn]=useState("");const[at,setAt]=useState("pilgrim");const[ar,setAr]=useState("");const[ap,setAp]=useState("");const[af,setAf]=useState("");const[ah,setAh]=useState(false);
  const[editing,setEditing]=useState(null);const[en,setEn]=useState("");const[er,setEr]=useState("");const[ep,setEp]=useState("");
  const[transferring,setTransferring]=useState(null);const[tt,setTt]=useState("");
  const[bulkOpen,setBulkOpen]=useState(false);const[bulkText,setBulkText]=useState("");const[bulkPreview,setBulkPreview]=useState(null);
  const[search,setSearch]=useState("");
  const cb=busesData.find(b=>b.id===sid);const sts=cb?.students||[];
  const filtered=search.trim()?sts.filter(s=>s.name.includes(search.trim())):sts;
  const parseBulk=()=>{const lines=bulkText.split("\n").map(l=>l.trim()).filter(Boolean);const valid=[],invalid=[];
    lines.forEach(line=>{const parts=line.split(/[,\t]/).map(p=>p.trim());if(parts.length<2){invalid.push({line,reason:"تنسيق خاطئ"});return;}const name=parts[0];const busId=parseInt(parts[1]);if(isNaN(busId)||busId<1||busId>7){invalid.push({line,reason:"رقم باص غير صحيح"});return;}valid.push({name,busId,familyNum:parts[2]||"",type:(parts[3]||"h").toLowerCase()==="a"?"admin":"pilgrim",isHead:(parts[3]||"").toLowerCase()==="head",room:parts[4]||""});});
    const bc={};busesData.forEach(b=>{bc[b.id]=b.students.length;});const ok=[],skip=[];valid.forEach(e=>{if(bc[e.busId]>=BUS_CAPACITY){skip.push({...e,reason:`ممتلئ`});}else{ok.push(e);bc[e.busId]++;}});setBulkPreview({valid:ok,invalid:[...invalid,...skip]});};
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:t.textMuted,borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>→ رجوع</button>
        <div style={{flex:1}}><div style={{fontSize:20,fontWeight:800}}>إدارة الحجاج</div></div>
        <Btn onClick={()=>setBulkOpen(true)} color="#10B981" small>📋 استيراد جماعي</Btn>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:16,overflowX:"auto",paddingBottom:6}}>
        {busesData.map(b=>{const bc=busConfigs.find(c=>c.id===b.id);const active=sid===b.id;return(<button key={b.id} onClick={()=>setSid(b.id)} style={{padding:"10px 14px",borderRadius:10,border:`2px solid ${active?bc.color:"rgba(255,255,255,0.08)"}`,background:active?bc.color+"22":"transparent",color:active?t.text:t.textDim,fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{bc.name} ({b.students.length}/{BUS_CAPACITY})</button>);})}
      </div>
      <div style={{background:t.bgCard,borderRadius:12,border:`1px solid ${t.border}`,padding:14,marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:t.textMuted,marginBottom:10}}>إضافة شخص جديد</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}><Input value={an} onChange={setAn} placeholder="الاسم"/><select value={at} onChange={e=>setAt(e.target.value)} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:8,padding:"10px",fontSize:14,fontFamily:"inherit",outline:"none"}}><option value="pilgrim">🕋 حاج</option><option value="admin">👤 إداري</option></select></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}><Input value={ar} onChange={setAr} placeholder="غرفة"/><Input value={ap} onChange={setAp} placeholder="هاتف"/><div style={{display:"flex",gap:4,alignItems:"center"}}><Input value={af} onChange={setAf} placeholder="عائلة"/>{af&&<label style={{fontSize:11,color:"#C8A951",display:"flex",alignItems:"center",gap:2,whiteSpace:"nowrap"}}><input type="checkbox" checked={ah} onChange={e=>setAh(e.target.checked)}/> رب</label>}</div></div>
        <Btn onClick={()=>{if(!an.trim()||sts.length>=BUS_CAPACITY)return;onAdd(sid,{name:an.trim(),type:at,room:ar.trim(),phone:ap.trim(),familyNum:af.trim(),isHead:ah});setAn("");setAr("");setAp("");setAf("");setAh(false);}} disabled={!an.trim()||sts.length>=BUS_CAPACITY} color="#22C55E" style={{width:"100%"}}>{sts.length>=BUS_CAPACITY?"ممتلئ":"+ إضافة"}</Btn>
      </div>
      <Input value={search} onChange={setSearch} placeholder="🔍 ابحث..." style={{marginBottom:12}}/>
      <div style={{display:"grid",gap:6}}>
        {filtered.length===0&&<div style={{padding:30,textAlign:"center",color:t.textDim,fontSize:13}}>لا يوجد</div>}
        {filtered.map(s=>{const isE=editing===s.id;const isT=transferring===s.id;return(<div key={s.id} style={{padding:12,borderRadius:10,background:t.bgCard,border:`1px solid ${t.border}`}}>
          {!isE&&!isT?(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{s.type==="admin"?"👤 ":s.isHead?"👑 ":s.familyNum?"👥 ":"🕋 "}{s.name}</div><div style={{fontSize:10,color:t.textDim,marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}><span>{s.type==="admin"?"إداري":"حاج"}</span>{s.familyNum&&<span style={{color:"#C8A951"}}>عائلة {s.familyNum}</span>}{s.room&&<span>غ{s.room}</span>}{s.phone&&<span>📱{s.phone}</span>}</div></div>
            <div style={{display:"flex",gap:4}}><button onClick={()=>{setEditing(s.id);setEn(s.name);setEr(s.room||"");setEp(s.phone||"");}} style={{background:"rgba(59,130,246,0.15)",border:"none",color:"#60A5FA",borderRadius:6,padding:"5px 10px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✏️</button><button onClick={()=>{setTransferring(s.id);setTt("");}} style={{background:"rgba(139,92,246,0.15)",border:"none",color:"#A78BFA",borderRadius:6,padding:"5px 10px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🔄</button><button onClick={()=>{if(window.confirm(`حذف ${s.name}؟`))onDelete(sid,s.id);}} style={{background:"rgba(239,68,68,0.15)",border:"none",color:"#EF4444",borderRadius:6,padding:"5px 10px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button></div></div>
          ):isE?(<div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}><Input value={en} onChange={setEn} placeholder="الاسم"/><Input value={er} onChange={setEr} placeholder="غرفة"/></div><Input value={ep} onChange={setEp} placeholder="هاتف" style={{marginBottom:8}}/><div style={{display:"flex",gap:6}}><Btn onClick={()=>{onEdit(sid,s.id,{name:en,room:er,phone:ep});setEditing(null);}} color="#22C55E" small>💾</Btn><Btn onClick={()=>setEditing(null)} color="transparent" small style={{border:`1px solid ${t.border}`,color:t.textMuted}}>إلغاء</Btn></div></div>
          ):(<div><select value={tt} onChange={e=>setTt(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:6,padding:"8px",fontSize:12,fontFamily:"inherit",outline:"none",marginBottom:6}}><option value="">اختر...</option>{busConfigs.filter(b=>b.id!==sid).map(b=>{const tb=busesData.find(x=>x.id===b.id);return<option key={b.id} value={b.id} disabled={tb.students.length>=BUS_CAPACITY}>{b.name} ({tb.students.length}/{BUS_CAPACITY})</option>;})}</select><div style={{display:"flex",gap:6}}><Btn onClick={()=>{if(tt){onTransfer(sid,s.id,Number(tt));setTransferring(null);}}} disabled={!tt} color="#8B5CF6" small>نقل</Btn><Btn onClick={()=>setTransferring(null)} color="transparent" small style={{border:`1px solid ${t.border}`,color:t.textMuted}}>إلغاء</Btn></div></div>)}
        </div>);})}
      </div>
      <Modal open={bulkOpen} onClose={()=>{setBulkOpen(false);setBulkPreview(null);setBulkText("");}} title="📋 استيراد جماعي" width={600} t={t}>
        {!bulkPreview?(<div><div style={{fontSize:12,color:t.textMuted,marginBottom:8,lineHeight:1.7}}>التنسيق: الاسم, باص, عائلة, نوع(head/h/a), غرفة</div>
          <textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder="الصق البيانات..." style={{width:"100%",minHeight:200,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:8,padding:12,fontSize:13,outline:"none",fontFamily:"monospace",resize:"vertical",boxSizing:"border-box"}}/>
          <Btn onClick={parseBulk} disabled={!bulkText.trim()} color="#10B981" style={{width:"100%",marginTop:12}}>📝 معاينة</Btn></div>
        ):(<div>{bulkPreview.valid.length>0&&<div style={{marginBottom:16}}><div style={{fontSize:13,fontWeight:700,color:"#22C55E",marginBottom:8}}>✅ {bulkPreview.valid.length} شخص</div><div style={{maxHeight:250,overflowY:"auto",background:"rgba(34,197,94,0.05)",borderRadius:8,padding:8}}>{bulkPreview.valid.map((e,i)=><div key={i} style={{fontSize:12,padding:"4px 8px",borderBottom:"1px solid rgba(255,255,255,0.04)",display:"flex",justifyContent:"space-between"}}><span>{e.name}</span><span style={{fontSize:10,color:t.textDim}}>باص {e.busId}{e.familyNum?` • ${e.familyNum}`:""}</span></div>)}</div></div>}
          {bulkPreview.invalid.length>0&&<div style={{marginBottom:16}}><div style={{fontSize:13,fontWeight:700,color:"#EF4444",marginBottom:8}}>⚠️ {bulkPreview.invalid.length} تجاهل</div></div>}
          <div style={{display:"flex",gap:8}}><Btn onClick={()=>setBulkPreview(null)} color="transparent" style={{flex:1,border:`1px solid ${t.border}`,color:t.textMuted}}>رجوع</Btn><Btn onClick={()=>{if(bulkPreview?.valid?.length)onBulkImport(bulkPreview.valid);setBulkOpen(false);setBulkText("");setBulkPreview(null);}} disabled={!bulkPreview.valid.length} color="#22C55E" style={{flex:2}}>✅ تأكيد</Btn></div></div>)}
      </Modal>
    </div>
  );
};

/* ═══════ ADMIN: BUS MGMT ═══════ */
const BusMgmtPage=({busConfigs,onUpdate,settings,onUpdateSettings,onBack,t})=>{
  const[editing,setEditing]=useState(null);const[es,setEs]=useState("");const[ep,setEp]=useState("");const[supErr,setSupErr]=useState("");
  const[pinModal,setPinModal]=useState(null);const[oldP,setOldP]=useState("");const[newP,setNewP]=useState("");const[confP,setConfP]=useState("");const[pErr,setPErr]=useState("");const[pOk,setPOk]=useState(false);
  const changePin=(key,currentVal)=>{
    setPErr("");setPOk(false);
    if(oldP!==currentVal){setPErr("الرقم القديم غير صحيح");return;}
    if(!newP||newP.length<4){setPErr("4 أرقام على الأقل");return;}
    if(newP!==confP){setPErr("غير متطابقين");return;}
    // Block 0000 unless changing viewerPin
    if(newP==="0000"&&key!=="viewerPin"){setPErr("الرقم 0000 محجوز للمشاهد");return;}
    // Check conflict with other PINs in the system
    const conflict=checkPinConflict(newP,settings,busConfigs,key);
    if(conflict){setPErr(`الرقم مستخدم بالفعل (${conflict})`);return;}
    onUpdateSettings({...settings,[key]:newP});setPOk(true);setOldP("");setNewP("");setConfP("");
    setTimeout(()=>{setPinModal(null);setPOk(false);},1500);
  };
  const saveSupervisor=()=>{
    setSupErr("");
    if(!ep||ep.length<4){setSupErr("الرقم 4 أرقام على الأقل");return;}
    if(ep==="0000"){setSupErr("الرقم 0000 محجوز للمشاهد");return;}
    const conflict=checkPinConflict(ep,settings,busConfigs,`bus_${editing}`);
    if(conflict){setSupErr(`الرقم مستخدم بالفعل (${conflict})`);return;}
    onUpdate(busConfigs.map(x=>x.id===editing?{...x,supervisor:es,pin:ep}:x));
    setEditing(null);setSupErr("");
  };
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:t.textMuted,borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>→ رجوع</button>
        <div style={{flex:1}}><div style={{fontSize:20,fontWeight:800}}>إدارة الباصات والإعدادات</div></div>
      </div>
      {/* PIN management */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:20}}>
        <Btn onClick={()=>setPinModal("adminPin")} color="#EF4444" small>🔑 كلمة سر الإدارة</Btn>
        <Btn onClick={()=>setPinModal("viewerPin")} color="#8B5CF6" small>👁️ كلمة سر المشاهد</Btn>
        <Btn onClick={()=>setPinModal("carSupervisorPin")} color="#06B6D4" small>🚗 كلمة سر السيارات</Btn>
      </div>
      <div style={{fontSize:11,color:t.textDim,marginBottom:16,display:"flex",gap:16,flexWrap:"wrap"}}>
        <span>الإدارة: {settings.adminPin}</span><span>المشاهد: {settings.viewerPin}</span><span>السيارات: {settings.carSupervisorPin}</span>
      </div>
      {busConfigs.map(bc=>(<div key={bc.id} style={{display:"flex",alignItems:"center",gap:10,padding:14,borderRadius:12,background:editing===bc.id?"rgba(59,130,246,0.08)":t.bgCard,marginBottom:10,border:`1px solid ${editing===bc.id?"rgba(59,130,246,0.3)":t.border}`}}>
        <div style={{width:8,height:48,borderRadius:4,background:bc.color}}/>
        <div style={{flex:1}}>{editing===bc.id?(
          <div>
            <Input value={es} onChange={setEs} placeholder="المشرف" style={{marginBottom:8}}/>
            <Input value={ep} onChange={v=>{setEp(v);setSupErr("");}} placeholder="رقم الدخول" style={{marginBottom:6}}/>
            {supErr&&<div style={{color:"#EF4444",fontSize:11,marginBottom:8,fontWeight:600}}>{supErr}</div>}
            <div style={{display:"flex",gap:6}}><Btn onClick={saveSupervisor} color="#22C55E" small>💾</Btn><Btn onClick={()=>{setEditing(null);setSupErr("");}} color="transparent" small style={{border:`1px solid ${t.border}`,color:t.textMuted}}>إلغاء</Btn></div>
          </div>
        ):(<div><div style={{fontSize:15,fontWeight:700}}>{bc.name}</div><div style={{fontSize:12,color:t.textMuted}}>المشرف: {bc.supervisor} | رقم: {bc.pin}</div><div style={{fontSize:10,color:t.textDim}}>إداريون: {(bc.busAdmins||[]).length}</div></div>)}</div>
        {editing!==bc.id&&<button onClick={()=>{setEditing(bc.id);setEs(bc.supervisor);setEp(bc.pin);setSupErr("");}} style={{background:"rgba(59,130,246,0.15)",border:"none",color:"#60A5FA",borderRadius:6,padding:"8px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>}
      </div>))}
      <Modal open={!!pinModal} onClose={()=>{setPinModal(null);setPErr("");}} title={`🔑 تغيير كلمة السر`} t={t}>
        <div style={{fontSize:11,color:t.textDim,marginBottom:6}}>القديم</div><Input type="password" value={oldP} onChange={setOldP} style={{marginBottom:10}}/>
        <div style={{fontSize:11,color:t.textDim,marginBottom:6}}>الجديد</div><Input type="password" value={newP} onChange={setNewP} style={{marginBottom:10}}/>
        <div style={{fontSize:11,color:t.textDim,marginBottom:6}}>تأكيد</div><Input type="password" value={confP} onChange={setConfP} style={{marginBottom:10}}/>
        {pErr&&<div style={{color:"#EF4444",fontSize:12,marginBottom:10}}>{pErr}</div>}
        {pOk&&<div style={{color:"#22C55E",fontSize:12,marginBottom:10}}>✅ تم</div>}
        <Btn onClick={()=>changePin(pinModal,settings[pinModal])} color="#22C55E" style={{width:"100%"}}>تغيير</Btn>
      </Modal>
    </div>
  );
};

/* ═══════ CAR MANAGEMENT ═══════ */
const CarMgmtPage=({cars,onSaveCar,onDeleteCar,onAddHistory,savedUsers:rawSavedUsers,savedReceivers,onSaveUsers,onSaveReceivers,onBack,t,readOnly,baseUrl})=>{
  const[tab,setTab]=useState("cars"); // "cars" | "requests" | "log"
  const[carRequests,setCarRequests]=useState([]);
  const[carRequestsLog,setCarRequestsLog]=useState([]);
  const[closeConfirm,setCloseConfirm]=useState(null);
  const[addModal,setAddModal]=useState(false);const[carNum,setCarNum]=useState("");const[plate,setPlate]=useState("");const[driver,setDriver]=useState("");
  const[driverImg,setDriverImg]=useState(null);const[carImg,setCarImg]=useState(null);const[uploading,setUploading]=useState(false);
  const[useModal,setUseModal]=useState(null);const[userName,setUserName]=useState("");const[userPhone,setUserPhone]=useState("");
  const[returnModal,setReturnModal]=useState(null);const[receiver,setReceiver]=useState("");
  const[histModal,setHistModal]=useState(null);const[history,setHistory]=useState([]);
  const[manageSavedModal,setManageSavedModal]=useState(false);
  const[previewImg,setPreviewImg]=useState(null);
  // Real-time car tracking locations
  const[carTrackingLocs,setCarTrackingLocs]=useState({});

  // Normalize savedUsers: handle old string[] format and new {name,phone}[] format
  const savedUsers=(rawSavedUsers||[]).map(u=>typeof u==="string"?{name:u,phone:""}:u).filter(u=>u&&u.name);

  useEffect(()=>{if(histModal){const unsub=listenToCarHistory(histModal,setHistory);return()=>unsub();}},[histModal]);
  useEffect(()=>{const u1=listenToCarRequests(setCarRequests);const u2=listenToCarRequestsLog(setCarRequestsLog);return()=>{u1();u2();};},[]);

  // Listen to all active car tracking locations
  useEffect(()=>{
    const unsubs=[];
    cars.forEach(car=>{
      if(car.status==="in-use"&&car.trackingId){
        const unsub=listenToCarTracking(car.trackingId,(data)=>{
          if(data?.location){
            setCarTrackingLocs(prev=>({...prev,[car.id]:{lat:data.location.lat,lng:data.location.lng,lastUpdate:data.lastUpdate}}));
          }
        });
        unsubs.push(unsub);
      }
    });
    return()=>unsubs.forEach(u=>u());
  },[cars]);

  const addCar=async()=>{if(!carNum.trim())return;setUploading(true);
    let dUrl="",cUrl="";
    if(driverImg){dUrl=await uploadImage(`cars/${Date.now()}_driver`,driverImg);}
    if(carImg){cUrl=await uploadImage(`cars/${Date.now()}_car`,carImg);}
    const id=`CAR-${Date.now()}`;
    await onSaveCar(id,{carNumber:carNum.trim(),plate:plate.trim(),driverName:driver.trim(),driverImage:dUrl||"",carImage:cUrl||"",status:"available",currentUser:null,trackingId:null});
    setCarNum("");setPlate("");setDriver("");setDriverImg(null);setCarImg(null);setAddModal(false);setUploading(false);
  };

  const markUsed=async(car)=>{if(!userName.trim())return;
    const trackingId=`TRK-${Date.now()}`;
    await onSaveCar(car.id,{...car,status:"in-use",currentUser:{name:userName.trim(),phone:userPhone.trim(),startTime:Date.now()},trackingId});
    await saveCarTracking(trackingId,{carId:car.id,userName:userName.trim(),active:true,location:null});
    await onAddHistory(car.id,{type:"checkout",userName:userName.trim(),userPhone:userPhone.trim(),timestamp:Date.now()});
    // Save user with phone — savedUsers is array of {name, phone}
    const existing=savedUsers.find(u=>u.name===userName.trim());
    if(!existing){
      onSaveUsers([...savedUsers,{name:userName.trim(),phone:userPhone.trim()}]);
    } else if(userPhone.trim()&&existing.phone!==userPhone.trim()){
      // Update phone if changed
      onSaveUsers(savedUsers.map(u=>u.name===userName.trim()?{...u,phone:userPhone.trim()}:u));
    }
    setUserName("");setUserPhone("");setUseModal(null);
  };

  const markAvailable=async(car)=>{if(!receiver.trim())return;
    if(car.trackingId){await saveCarTracking(car.trackingId,{active:false});}
    await onSaveCar(car.id,{...car,status:"available",currentUser:null,trackingId:null});
    await onAddHistory(car.id,{type:"return",receiver:receiver.trim(),timestamp:Date.now(),previousUser:car.currentUser?.name||""});
    if(!savedReceivers.find(r=>r===receiver.trim())){onSaveReceivers([...savedReceivers,receiver.trim()]);}
    setReceiver("");setReturnModal(null);
    // Remove tracking location
    setCarTrackingLocs(prev=>{const n={...prev};delete n[car.id];return n;});
  };

  const trackingUrl=(trackingId)=>`${baseUrl}/track/${trackingId}`;
  const copyText=(text)=>{const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");}catch(e){}document.body.removeChild(ta);};

  // Map locations from real tracking data
  const carLocations=cars.filter(c=>c.status==="in-use").map(c=>{
    const loc=carTrackingLocs[c.id];
    if(!loc) return null;
    return {id:c.id,lat:loc.lat,lng:loc.lng,color:"#06B6D4",status:"commuting",label:c.carNumber};
  }).filter(Boolean);

  const selectOpt={background:"#1E293B",color:"#F1F5F9"};

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:t.textMuted,borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>→ رجوع</button>
        <div style={{flex:1}}><div style={{fontSize:20,fontWeight:800}}>🚗 إدارة السيارات</div></div>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:16,background:t.bgCard,padding:4,borderRadius:10,border:`1px solid ${t.border}`}}>
        <button onClick={()=>setTab("cars")} style={{flex:1,padding:"10px 12px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",background:tab==="cars"?"rgba(6,182,212,0.15)":"transparent",color:tab==="cars"?"#06B6D4":t.textDim}}>🚗 السيارات ({cars.length})</button>
        <button onClick={()=>setTab("requests")} style={{flex:1,padding:"10px 12px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",background:tab==="requests"?"rgba(251,191,36,0.15)":"transparent",color:tab==="requests"?"#FBBF24":t.textDim,position:"relative"}}>📋 الطلبات{carRequests.length>0&&<span style={{position:"absolute",top:2,right:2,background:"#EF4444",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:800}}>{carRequests.length}</span>}</button>
        <button onClick={()=>setTab("log")} style={{flex:1,padding:"10px 12px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",background:tab==="log"?"rgba(139,92,246,0.15)":"transparent",color:tab==="log"?"#A78BFA":t.textDim}}>📚 السجل ({carRequestsLog.length})</button>
      </div>

      {tab==="requests"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:14,fontWeight:700,color:t.textMuted}}>الطلبات المفتوحة ({carRequests.length})</div>
          <div style={{fontSize:11,color:t.textDim}}>الرابط العام: {baseUrl}/request-car</div>
        </div>
        {carRequests.length===0?<div style={{padding:40,textAlign:"center",color:t.textDim,fontSize:13,background:t.bgCard,borderRadius:12,border:`1px solid ${t.border}`}}>لا توجد طلبات حالياً</div>:
        <div style={{display:"grid",gap:10}}>{carRequests.map(r=>(
          <div key={r.id} style={{background:t.bgCard,borderRadius:12,border:`1px solid ${t.border}`,padding:16,borderRightWidth:3,borderRightColor:"#FBBF24"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:8,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:15,fontWeight:800}}>{r.name}</div>
                <a href={`tel:${r.phone}`} style={{fontSize:12,color:"#60A5FA",textDecoration:"none"}}>📱 {r.phone}</a>
              </div>
              <span style={{fontSize:11,padding:"4px 10px",borderRadius:6,background:"rgba(251,191,36,0.15)",color:"#FBBF24",fontWeight:700}}>{vehicleLabel(r.vehicleType)}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:10}}>
              <div style={{fontSize:11,color:t.textDim}}>🏛️ <strong style={{color:t.text}}>{r.committee}</strong></div>
              <div style={{fontSize:11,color:t.textDim}}>📅 <strong style={{color:t.text}}>{r.dateTime?new Date(r.dateTime).toLocaleString("ar-BH",{dateStyle:"short",timeStyle:"short"}):"—"}</strong></div>
              <div style={{fontSize:11,color:t.textDim}}>📍 <strong style={{color:t.text}}>{r.destination}</strong></div>
              <div style={{fontSize:11,color:t.textDim}}>⏱️ <strong style={{color:t.text}}>{r.duration}</strong></div>
            </div>
            {r.notes&&<div style={{fontSize:12,color:t.textMuted,padding:"8px 10px",background:"rgba(255,255,255,0.03)",borderRadius:6,marginBottom:10}}>💬 {r.notes}</div>}
            <div style={{fontSize:10,color:t.textDim,marginBottom:10}}>⏰ ورد في: {r.createdAt?new Date(r.createdAt).toLocaleString("ar-BH"):""}</div>
            {!readOnly&&<Btn onClick={()=>setCloseConfirm(r)} color="#22C55E" small style={{width:"100%"}}>✅ إغلاق الحالة</Btn>}
          </div>
        ))}</div>}
      </div>}

      {tab==="log"&&<div>
        <div style={{fontSize:14,fontWeight:700,color:t.textMuted,marginBottom:12}}>الطلبات المغلقة ({carRequestsLog.length})</div>
        {carRequestsLog.length===0?<div style={{padding:40,textAlign:"center",color:t.textDim,fontSize:13,background:t.bgCard,borderRadius:12,border:`1px solid ${t.border}`}}>لا يوجد سجل</div>:
        <div style={{display:"grid",gap:8}}>{carRequestsLog.map(r=>(
          <div key={r.id} style={{background:t.bgCard,borderRadius:10,border:`1px solid ${t.border}`,padding:12,opacity:0.85}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,gap:8,flexWrap:"wrap"}}>
              <div style={{fontSize:13,fontWeight:700}}>{r.name} <span style={{fontSize:10,color:t.textDim,fontWeight:400}}>({r.phone})</span></div>
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:"rgba(139,92,246,0.15)",color:"#A78BFA",fontWeight:700}}>{vehicleLabel(r.vehicleType)}</span>
            </div>
            <div style={{fontSize:10,color:t.textDim,display:"flex",gap:10,flexWrap:"wrap"}}>
              <span>🏛️ {r.committee}</span><span>📍 {r.destination}</span><span>⏱️ {r.duration}</span>
            </div>
            {r.notes&&<div style={{fontSize:10,color:t.textDim,marginTop:4}}>💬 {r.notes}</div>}
            <div style={{fontSize:9,color:t.textDim,marginTop:6,borderTop:`1px solid ${t.border}`,paddingTop:6}}>✅ أُغلق: {r.closedAt?new Date(r.closedAt).toLocaleString("ar-BH"):""}</div>
          </div>
        ))}</div>}
      </div>}

      {tab==="cars"&&<>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{flex:1,fontSize:12,color:t.textDim}}>{cars.length} سيارة — {cars.filter(c=>c.status==="in-use").length} مستخدمة</div>
        <div style={{display:"flex",gap:6}}>
          {!readOnly&&<Btn onClick={()=>setManageSavedModal(true)} color="#8B5CF6" small>📇 المستخدمون</Btn>}
          {!readOnly&&<Btn onClick={()=>setAddModal(true)} color="#06B6D4" small>+ سيارة</Btn>}
        </div>
      </div>

      {carLocations.length>0&&<SimpleMap locations={carLocations} height={250}/>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
        {cars.map(car=>{const inUse=car.status==="in-use";const loc=carTrackingLocs[car.id];return(
          <div key={car.id} style={{background:t.bgCard,borderRadius:14,border:`1px solid ${inUse?"rgba(6,182,212,0.3)":t.border}`,padding:16,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:inUse?"#06B6D4":"#64748B"}}/>
            <div style={{display:"flex",gap:12,marginBottom:12}}>
              {car.carImage&&<img src={car.carImage} alt="" onClick={(e)=>{e.stopPropagation();setPreviewImg(car.carImage);}} style={{width:60,height:45,objectFit:"cover",borderRadius:8,border:`1px solid ${t.border}`,cursor:"pointer"}}/>}
              <div style={{flex:1}}>
                <div style={{fontSize:16,fontWeight:800}}>{car.carNumber}</div>
                <div style={{fontSize:11,color:t.textDim}}>لوحة: {car.plate}</div>
                <div style={{fontSize:11,color:t.textDim}}>السائق: {car.driverName}</div>
              </div>
              {car.driverImage&&<img src={car.driverImage} alt="" onClick={(e)=>{e.stopPropagation();setPreviewImg(car.driverImage);}} style={{width:40,height:40,objectFit:"cover",borderRadius:"50%",border:`2px solid ${t.border}`,cursor:"pointer"}}/>}
            </div>
            <div style={{padding:"8px 12px",borderRadius:8,background:inUse?"rgba(6,182,212,0.1)":"rgba(34,197,94,0.1)",border:`1px solid ${inUse?"rgba(6,182,212,0.2)":"rgba(34,197,94,0.2)"}`,marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:inUse?"#06B6D4":"#22C55E"}}>{inUse?"🚗 مستخدمة":"✅ غير مستخدمة"}</div>
              {inUse&&car.currentUser&&(<div style={{marginTop:6}}>
                <div style={{fontSize:12}}>المستخدم: {car.currentUser.name}</div>
                {car.currentUser.phone&&<a href={`tel:${car.currentUser.phone}`} style={{fontSize:12,color:"#60A5FA",textDecoration:"none"}}>📱 {car.currentUser.phone}</a>}
                <div style={{fontSize:10,color:t.textDim,marginTop:4}}>منذ: {new Date(car.currentUser.startTime).toLocaleString("ar-BH")}</div>
                {loc&&<div style={{fontSize:10,color:"#22C55E",marginTop:2}}>📍 آخر تحديث: {loc.lastUpdate?new Date(loc.lastUpdate).toLocaleTimeString("ar-BH"):""}</div>}
                {!loc&&<div style={{fontSize:10,color:"#FBBF24",marginTop:2}}>⏳ بانتظار موقع المستخدم...</div>}
                {car.trackingId&&<div style={{marginTop:6}}><div style={{fontSize:10,color:t.textDim}}>رابط التتبع:</div><div style={{display:"flex",gap:4,marginTop:2}}><input readOnly value={trackingUrl(car.trackingId)} style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:6,padding:"4px 8px",fontSize:10,fontFamily:"monospace",outline:"none"}}/><Btn onClick={()=>copyText(trackingUrl(car.trackingId))} color="#3B82F6" small style={{fontSize:10}}>نسخ</Btn></div></div>}
              </div>)}
            </div>
            <div style={{display:"flex",gap:6}}>
              {!readOnly&&!inUse&&<Btn onClick={()=>{setUseModal(car);setUserName("");setUserPhone("");}} color="#06B6D4" small style={{flex:1}}>تسجيل استخدام</Btn>}
              {!readOnly&&inUse&&<Btn onClick={()=>{setReturnModal(car);setReceiver("");}} color="#22C55E" small style={{flex:1}}>تسليم المفتاح</Btn>}
              <Btn onClick={()=>setHistModal(car.id)} color="transparent" small style={{border:`1px solid ${t.border}`,color:t.textMuted}}>📋</Btn>
              {!readOnly&&<Btn onClick={()=>{if(window.confirm("حذف السيارة؟"))onDeleteCar(car.id);}} color="#EF4444" small>🗑️</Btn>}
            </div>
          </div>
        );})}
      </div>
      </>}

      {/* Close request confirmation modal */}
      <Modal open={!!closeConfirm} onClose={()=>setCloseConfirm(null)} title="✅ إغلاق الطلب" t={t}>
        {closeConfirm&&<div>
          <div style={{fontSize:14,marginBottom:8}}>سيتم إغلاق طلب <strong>{closeConfirm.name}</strong> ونقله إلى السجل.</div>
          <div style={{fontSize:12,color:t.textDim,marginBottom:16,padding:"8px 12px",background:"rgba(255,255,255,0.03)",borderRadius:8}}>{vehicleLabel(closeConfirm.vehicleType)} • {closeConfirm.destination}</div>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>setCloseConfirm(null)} color="transparent" style={{flex:1,border:`1px solid ${t.border}`,color:t.textMuted}}>إلغاء</Btn>
            <Btn onClick={async()=>{await closeCarRequest(closeConfirm.id,closeConfirm);setCloseConfirm(null);}} color="#22C55E" style={{flex:1}}>✅ تأكيد الإغلاق</Btn>
          </div>
        </div>}
      </Modal>

      {/* Add car modal */}
      <Modal open={addModal} onClose={()=>setAddModal(false)} title="+ إضافة سيارة" t={t}>
        <Input value={carNum} onChange={setCarNum} placeholder="رقم السيارة" style={{marginBottom:8}}/>
        <Input value={plate} onChange={setPlate} placeholder="رقم اللوحة" style={{marginBottom:8}}/>
        <Input value={driver} onChange={setDriver} placeholder="اسم السائق" style={{marginBottom:8}}/>
        <div style={{fontSize:11,color:t.textDim,marginBottom:4}}>صورة السائق</div>
        <input type="file" accept="image/*" onChange={e=>setDriverImg(e.target.files[0])} style={{marginBottom:8,fontSize:12,color:"inherit"}}/>
        <div style={{fontSize:11,color:t.textDim,marginBottom:4}}>صورة السيارة</div>
        <input type="file" accept="image/*" onChange={e=>setCarImg(e.target.files[0])} style={{marginBottom:12,fontSize:12,color:"inherit"}}/>
        <Btn onClick={addCar} disabled={!carNum.trim()||uploading} color="#06B6D4" style={{width:"100%"}}>{uploading?"جاري الرفع...":"إضافة"}</Btn>
      </Modal>

      {/* Use car modal */}
      <Modal open={!!useModal} onClose={()=>setUseModal(null)} title="🚗 تسجيل استخدام" t={t}>
        <div style={{fontSize:11,color:t.textDim,marginBottom:4}}>اختر مستخدم سابق أو اكتب اسم جديد</div>
        <select value="" onChange={e=>{
          const sel=savedUsers.find(u=>u.name===e.target.value);
          if(sel){setUserName(sel.name);setUserPhone(sel.phone||"");}
        }} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:6,padding:"8px",fontSize:12,fontFamily:"inherit",outline:"none",marginBottom:8}}>
          <option value="" style={selectOpt}>— اختر من القائمة —</option>
          {savedUsers.map((u,i)=><option key={i} value={u.name} style={selectOpt}>{u.name}{u.phone?` (${u.phone})`:""}</option>)}
        </select>
        <div style={{fontSize:11,color:t.textDim,marginBottom:4}}>الاسم</div>
        <Input value={userName} onChange={setUserName} placeholder="اسم المستخدم" style={{marginBottom:8}}/>
        <div style={{fontSize:11,color:t.textDim,marginBottom:4}}>رقم الهاتف</div>
        <Input value={userPhone} onChange={setUserPhone} placeholder="رقم الهاتف" style={{marginBottom:12}}/>
        <Btn onClick={()=>markUsed(useModal)} disabled={!userName.trim()} color="#06B6D4" style={{width:"100%"}}>✅ تأكيد</Btn>
      </Modal>

      {/* Return car modal */}
      <Modal open={!!returnModal} onClose={()=>setReturnModal(null)} title="🔑 تسليم المفتاح" t={t}>
        <div style={{fontSize:11,color:t.textDim,marginBottom:4}}>تم التسليم إلى</div>
        <select value="" onChange={e=>{if(e.target.value)setReceiver(e.target.value);}} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:6,padding:"8px",fontSize:12,fontFamily:"inherit",outline:"none",marginBottom:8}}>
          <option value="" style={selectOpt}>— اختر من القائمة —</option>
          {savedReceivers.filter(n=>n&&n.trim()).map((n,i)=><option key={i} value={n} style={selectOpt}>{n}</option>)}
        </select>
        <Input value={receiver} onChange={setReceiver} placeholder="أو اكتب اسم جديد" style={{marginBottom:8}}/>
        <div style={{fontSize:11,color:t.textDim,marginBottom:12}}>⏰ سيتم تسجيل الوقت الحالي تلقائياً</div>
        <Btn onClick={()=>markAvailable(returnModal)} disabled={!receiver.trim()} color="#22C55E" style={{width:"100%"}}>✅ تأكيد التسليم</Btn>
      </Modal>

      {/* History modal */}
      <Modal open={!!histModal} onClose={()=>setHistModal(null)} title="📋 سجل الاستخدام" width={500} t={t}>
        {history.length===0?<div style={{padding:20,textAlign:"center",color:t.textDim}}>لا يوجد سجل</div>:
        <div style={{display:"grid",gap:6}}>{history.map(h=>(
          <div key={h.id} style={{padding:10,borderRadius:8,background:t.bgCard,border:`1px solid ${t.border}`,fontSize:12}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontWeight:700,color:h.type==="checkout"?"#06B6D4":"#22C55E"}}>{h.type==="checkout"?"🚗 استخدام":"🔑 تسليم"}</span>
              <span style={{fontSize:10,color:t.textDim}}>{h.timestamp?new Date(h.timestamp).toLocaleString("ar-BH"):""}</span>
            </div>
            {h.type==="checkout"&&<div style={{color:t.textMuted,marginTop:4}}>المستخدم: {h.userName}{h.userPhone?` (${h.userPhone})`:""}</div>}
            {h.type==="return"&&<div style={{color:t.textMuted,marginTop:4}}>المستلم: {h.receiver}{h.previousUser?` | كان: ${h.previousUser}`:""}</div>}
          </div>
        ))}</div>}
      </Modal>

      {/* Manage saved users/receivers */}
      <Modal open={manageSavedModal} onClose={()=>setManageSavedModal(false)} title="📇 إدارة المستخدمين المحفوظين" width={500} t={t}>
        <div style={{fontSize:13,fontWeight:700,color:t.textMuted,marginBottom:8}}>مستخدمو السيارات</div>
        {savedUsers.length===0?<div style={{fontSize:12,color:t.textDim,padding:10,textAlign:"center"}}>لا يوجد</div>:
        <div style={{marginBottom:16}}>{savedUsers.map((u,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:t.bgCard,border:`1px solid ${t.border}`,marginBottom:4}}>
            <div><div style={{fontSize:13,fontWeight:600}}>{u.name}</div>{u.phone&&<div style={{fontSize:10,color:t.textDim}}>📱 {u.phone}</div>}</div>
            <button onClick={()=>onSaveUsers(savedUsers.filter((_,j)=>j!==i))} style={{background:"rgba(239,68,68,0.15)",border:"none",color:"#EF4444",borderRadius:6,padding:"4px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button>
          </div>
        ))}</div>}
        <div style={{fontSize:13,fontWeight:700,color:t.textMuted,marginBottom:8,marginTop:16,borderTop:`1px solid ${t.border}`,paddingTop:12}}>مستلمو المفاتيح</div>
        {savedReceivers.filter(n=>n&&n.trim()).length===0?<div style={{fontSize:12,color:t.textDim,padding:10,textAlign:"center"}}>لا يوجد</div>:
        <div>{savedReceivers.filter(n=>n&&n.trim()).map((n,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:t.bgCard,border:`1px solid ${t.border}`,marginBottom:4}}>
            <div style={{fontSize:13,fontWeight:600}}>{n}</div>
            <button onClick={()=>onSaveReceivers(savedReceivers.filter(x=>x!==n))} style={{background:"rgba(239,68,68,0.15)",border:"none",color:"#EF4444",borderRadius:6,padding:"4px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button>
          </div>
        ))}</div>}
      </Modal>

      {/* Image preview */}
      {previewImg&&<div onClick={()=>setPreviewImg(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000,cursor:"pointer",padding:20}}>
        <img src={previewImg} alt="" style={{maxWidth:"90vw",maxHeight:"85vh",objectFit:"contain",borderRadius:12,boxShadow:"0 8px 40px rgba(0,0,0,0.5)"}}/>
        <div style={{position:"absolute",top:20,right:20,background:"rgba(255,255,255,0.15)",borderRadius:"50%",width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#fff"}}>✕</div>
      </div>}
    </div>
  );
};

/* ═══════ ADMIN DASHBOARD ═══════ */
const AdminDashboard=({busesData,busConfigs,onSelectBus,onLogout,boardingMode,onSetMode,onGoTo,t,readOnly})=>{
  const isOpen=boardingMode==="open";
  const isOutbound=boardingMode==="roundtrip-outbound";
  const isReturn=boardingMode==="roundtrip-return";
  const isNormal=boardingMode==="normal";
  const[notReturnedAllModal,setNotReturnedAllModal]=useState(false);
  const[copied,setCopied]=useState(null);

  // Build per-bus not-returned summary for return mode
  const perBusNotReturned=isReturn?busesData.map(b=>{
    const bc=busConfigs.find(c=>c.id===b.id);
    const list=b.students.filter(s=>s.wentOut&&!s.checkedIn);
    const families={};
    list.forEach(s=>{const fn=s.familyNum||"_individuals";if(!families[fn])families[fn]=[];families[fn].push(s);});
    return{bus:b,config:bc,list,families};
  }).filter(x=>x.list.length>0):[];

  const totalNotReturned=perBusNotReturned.reduce((sum,x)=>sum+x.list.length,0);

  const buildBusText=(entry)=>{
    let text=`━━━━━━━━━━━━━━\n🚌 ${entry.config.name} — لم يعد بعد (${entry.list.length})\n━━━━━━━━━━━━━━\n`;
    Object.entries(entry.families).forEach(([fn,members])=>{
      if(fn==="_individuals"){
        members.forEach(s=>{text+=`• ${s.name}${s.room?` (غ${s.room})`:""}${s.phone?` 📱${s.phone}`:""}\n`;});
      } else {
        const head=members.find(m=>m.isHead);
        text+=`\n👨‍👩‍👧‍👦 عائلة ${fn}${head?` (رب: ${head.name})`:""} — ${members.length} فرد:\n`;
        members.forEach(s=>{text+=`  - ${s.isHead?"👑 ":""}${s.name}${s.room?` (غ${s.room})`:""}\n`;});
      }
    });
    return text;
  };

  const copyTextToClipboard=(text,key)=>{
    const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();
    try{document.execCommand("copy");setCopied(key);setTimeout(()=>setCopied(null),2500);}catch(e){}
    document.body.removeChild(ta);
  };

  const copyAllNotReturned=()=>{
    let text=`⚠️ تقرير من لم يعد بعد — جميع الباصات\nالإجمالي: ${totalNotReturned} حاج\n\n`;
    perBusNotReturned.forEach(entry=>{text+=buildBusText(entry)+"\n";});
    copyTextToClipboard(text,"all");
  };

  return(
  <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
      <div><div style={{fontSize:20,fontWeight:800}}>لوحة التحكم</div></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {!readOnly&&<><Btn onClick={()=>onGoTo("pilgrim-mgmt")} color="#10B981" small>🕋 الحجاج</Btn><Btn onClick={()=>onGoTo("bus-mgmt")} color="#3B82F6" small>🚌 الباصات</Btn></>}
        <Btn onClick={()=>onGoTo("cars")} color="#06B6D4" small>🚗 السيارات</Btn>
        <Btn onClick={onLogout} color="#EF4444" small>خروج</Btn>
      </div>
    </div>
    {!readOnly&&<div style={{background:t.bgCard,borderRadius:14,border:`1px solid ${t.border}`,padding:16,marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:700,color:t.textDim,marginBottom:12}}>وضع التفويج</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <button onClick={()=>onSetMode("normal")} style={{padding:"14px 12px",borderRadius:10,border:"2px solid",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",background:isNormal?"rgba(34,197,94,0.12)":"transparent",borderColor:isNormal?"rgba(34,197,94,0.55)":"rgba(255,255,255,0.08)",color:isNormal?"#22C55E":t.textDim}}><div style={{fontSize:24,marginBottom:4}}>🔒</div>عادي</button>
        <button onClick={()=>onSetMode("open")} style={{padding:"14px 12px",borderRadius:10,border:"2px solid",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",background:isOpen?"rgba(251,191,36,0.12)":"transparent",borderColor:isOpen?"rgba(251,191,36,0.55)":"rgba(255,255,255,0.08)",color:isOpen?"#FBBF24":t.textDim}}><div style={{fontSize:24,marginBottom:4}}>🔓</div>مفتوح</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <button onClick={()=>onSetMode("roundtrip-outbound")} style={{padding:"14px 12px",borderRadius:10,border:"2px solid",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",background:isOutbound?"rgba(59,130,246,0.12)":"transparent",borderColor:isOutbound?"rgba(59,130,246,0.55)":"rgba(255,255,255,0.08)",color:isOutbound?"#60A5FA":t.textDim}}><div style={{fontSize:24,marginBottom:4}}>🕋</div>ذهاب (للحرم)</button>
        <button onClick={()=>onSetMode("roundtrip-return")} disabled={!isOutbound&&!isReturn} style={{padding:"14px 12px",borderRadius:10,border:"2px solid",cursor:!isOutbound&&!isReturn?"not-allowed":"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",background:isReturn?"rgba(168,85,247,0.12)":"transparent",borderColor:isReturn?"rgba(168,85,247,0.55)":"rgba(255,255,255,0.08)",color:isReturn?"#A78BFA":t.textDim,opacity:!isOutbound&&!isReturn?0.4:1}}><div style={{fontSize:24,marginBottom:4}}>↩️</div>عودة (تسجيل الراجعين)</button>
      </div>
      {isOutbound&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.2)",fontSize:11,color:"#60A5FA"}}>📌 مرحلة الذهاب: سجّل الحجاج الذاهبين. عند الوصول للحرم، اضغط "عودة" لتسجيل الراجعين.</div>}
      {isReturn&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"rgba(168,85,247,0.08)",border:"1px solid rgba(168,85,247,0.2)",fontSize:11,color:"#A78BFA"}}>📌 مرحلة العودة: يظهر فقط من ذهبوا. اضغط "عادي" لإنهاء التفويج.</div>}
    </div>}
    {isReturn&&totalNotReturned>0&&<div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:12,padding:14,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:"#EF4444"}}>⚠️ {totalNotReturned} حاج لم يعد بعد</div>
          <div style={{fontSize:11,color:t.textMuted,marginTop:2}}>موزّعون على {perBusNotReturned.length} باص</div>
        </div>
        <Btn onClick={()=>setNotReturnedAllModal(true)} color="#EF4444" small>📋 عرض ونسخ</Btn>
      </div>
    </div>}
    <SimpleMap locations={busesData.filter(b=>b.location).map(b=>({id:b.id,lat:b.location.lat,lng:b.location.lng,color:busConfigs.find(c=>c.id===b.id)?.color,status:b.status,label:busConfigs.find(c=>c.id===b.id)?.name}))} height={300}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
      {busesData.map(bus=>{
        const bc=busConfigs.find(c=>c.id===bus.id);
        const chk=bus.students.filter(s=>s.checkedIn).length;
        let totalS,pct,label;
        if(isOpen){
          totalS=BUS_CAPACITY;pct=Math.round((chk/BUS_CAPACITY)*100);label="الركاب الحاليون";
        } else if(isReturn){
          // In return mode: total = those who went out, checked = those returned
          const wentOut=bus.students.filter(s=>s.wentOut).length;
          totalS=wentOut;pct=wentOut>0?Math.round((chk/wentOut)*100):0;label="عاد من الذهاب";
        } else {
          totalS=bus.students.length;pct=totalS>0?Math.round((chk/totalS)*100):0;label=isOutbound?"حاضر للذهاب":"الحضور";
        }
        const notReturned=isReturn?bus.students.filter(s=>s.wentOut&&!s.checkedIn).length:0;
        return(
        <div key={bus.id} onClick={()=>onSelectBus(bus.id)} style={{background:t.bgCard,borderRadius:16,border:`1px solid ${t.border}`,padding:20,cursor:"pointer",position:"relative",overflow:"hidden"}}
          onMouseEnter={e=>{e.currentTarget.style.background=t.bgCardHover;}} onMouseLeave={e=>{e.currentTarget.style.background=t.bgCard;}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:bc.color}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}><div><div style={{fontSize:17,fontWeight:700}}>{bc.name}</div><div style={{fontSize:11,color:t.textDim}}>المشرف: {bc.supervisor}</div></div><StatusPill status={bus.status}/></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:13,color:t.textMuted}}>{label}</span><span style={{fontSize:13,fontWeight:700}}>{chk}/{totalS}</span></div>
          <div style={{height:6,background:"rgba(128,128,128,0.15)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:bc.color}}/></div>
          {isReturn&&notReturned>0&&<div style={{fontSize:11,color:"#EF4444",marginTop:8,fontWeight:700}}>⚠️ {notReturned} لم يعد بعد</div>}
        </div>);})}
    </div>

    {/* All buses "not returned" modal — separate copy per bus + one big copy */}
    <Modal open={notReturnedAllModal} onClose={()=>setNotReturnedAllModal(false)} title="⚠️ تقرير من لم يعد بعد" width={600} t={t}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:8,flexWrap:"wrap"}}>
        <div style={{fontSize:13,color:t.textMuted}}>إجمالي: <strong style={{color:"#EF4444"}}>{totalNotReturned}</strong> حاج في {perBusNotReturned.length} باص</div>
        <Btn onClick={copyAllNotReturned} disabled={totalNotReturned===0} color="#EF4444" small>{copied==="all"?"✅ تم نسخ الكل":"📋 نسخ تقرير كل الباصات"}</Btn>
      </div>
      {perBusNotReturned.length===0?<div style={{padding:20,textAlign:"center",color:"#22C55E",fontSize:13}}>✅ الجميع عاد</div>:
      <div style={{display:"grid",gap:12,maxHeight:500,overflowY:"auto"}}>{perBusNotReturned.map(entry=>(
        <div key={entry.bus.id} style={{background:t.bgCard,borderRadius:12,border:`2px solid ${entry.config.color}40`,padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:entry.config.color}}>🚌 {entry.config.name}</div>
              <div style={{fontSize:11,color:t.textDim}}>المشرف: {entry.config.supervisor} • {entry.list.length} حاج لم يعد</div>
            </div>
            <Btn onClick={()=>copyTextToClipboard(buildBusText(entry),`bus-${entry.bus.id}`)} color={entry.config.color} small style={{fontSize:11}}>{copied===`bus-${entry.bus.id}`?"✅ تم":"📋 نسخ هذا الباص"}</Btn>
          </div>
          <div style={{display:"grid",gap:6}}>
            {Object.entries(entry.families).map(([fn,members])=>{
              const head=members.find(m=>m.isHead);
              if(fn==="_individuals"){
                return(<div key="indiv" style={{padding:8,borderRadius:8,background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.15)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#EF4444",marginBottom:4}}>🧍 أفراد ({members.length})</div>
                  {members.map(s=><div key={s.id} style={{fontSize:11,padding:"3px 6px"}}>• {s.name}{s.room?` (غ${s.room})`:""}</div>)}
                </div>);
              }
              return(<div key={fn} style={{padding:8,borderRadius:8,background:"rgba(200,169,81,0.06)",border:"1px solid rgba(200,169,81,0.15)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#C8A951",marginBottom:4}}>👨‍👩‍👧‍👦 عائلة {fn}{head&&` (رب: ${head.name})`} — {members.length}</div>
                {members.map(s=><div key={s.id} style={{fontSize:11,padding:"3px 6px"}}>{s.isHead?"👑 ":""}{s.name}{s.room?` (غ${s.room})`:""}</div>)}
              </div>);
            })}
          </div>
        </div>
      ))}</div>}
    </Modal>
  </div>
  );
};

/* ═══════ BUS LEADER VIEW ═══════ */
const BusLeaderView=({busData,busConfig,allBusConfigs,allBusesData,onBack,onUpdate,onCrossBoard,onRemoveCrossBoarded,boardingMode,canCheckin,canManageFamilies,canChangeStatus,busAdmins,onUpdateBusAdmins,settings,currentUserName,t})=>{
  const[scanAnim,setScanAnim]=useState(null);const[gpsStatus,setGpsStatus]=useState("waiting");
  const[searchQ,setSearchQ]=useState("");const[copied,setCopied]=useState(null);
  const[destModal,setDestModal]=useState(false);const[destInput,setDestInput]=useState("");
  const[familyModal,setFamilyModal]=useState(false);const[familyCheckinModal,setFamilyCheckinModal]=useState(null);
  const[crossBoardModal,setCrossBoardModal]=useState(false);const[crossBoardSearch,setCrossBoardSearch]=useState("");const[crossBoardFilterBus,setCrossBoardFilterBus]=useState("");
  const[editPilgrimState,setEditPilgrimState]=useState(null);const[epName,setEpName]=useState("");const[epPhone,setEpPhone]=useState("");const[epRoom,setEpRoom]=useState("");const[epFamilyNum,setEpFamilyNum]=useState("");const[epIsHead,setEpIsHead]=useState(false);
  const[familyNumCheckin,setFamilyNumCheckin]=useState("");
  const[adminMgmt,setAdminMgmt]=useState(false);const[newAdminName,setNewAdminName]=useState("");const[newAdminPin,setNewAdminPin]=useState("");const[newAdminCheckin,setNewAdminCheckin]=useState(false);const[newAdminErr,setNewAdminErr]=useState("");
  const[wentAwayModal,setWentAwayModal]=useState(false);
  const[notBoardedModal,setNotBoardedModal]=useState(false);
  const[notReturnedModal,setNotReturnedModal]=useState(false);
  const geoRef=useRef(null);

  const students=busData.students;

  // boardingMode: "normal" | "open" | "roundtrip-outbound" | "roundtrip-return"
  const isOpen=boardingMode==="open";
  const isOutbound=boardingMode==="roundtrip-outbound";
  const isReturn=boardingMode==="roundtrip-return";

  // Visibility and counters logic per mode:
  //   open: show only checked-in (boarded); capacity X/55
  //   outbound: show all assigned; counter = checkedIn/assigned (these will become "wentOut" when mode switches to return)
  //   return: show only those with wentOut=true (and didn't go = wentOut=false visible too as struck-out);
  //           counter = returned (checkedIn)/wentOut
  //   normal: show all assigned; counter = checkedIn/assigned
  const checkedInStudents=students.filter(s=>s.checkedIn);
  const boardedCount=checkedInStudents.length;

  let visibleStudents,checked,total,isFull;
  if(isOpen){
    visibleStudents=checkedInStudents;
    checked=boardedCount;total=BUS_CAPACITY;
    isFull=boardedCount>=BUS_CAPACITY;
  } else if(isReturn){
    // Show those who went out + those who didn't go (struck out)
    visibleStudents=students;
    const wentOutCount=students.filter(s=>s.wentOut).length;
    checked=students.filter(s=>s.wentOut&&s.checkedIn).length;
    total=wentOutCount;
    isFull=false;
  } else {
    // normal or outbound
    visibleStudents=students;
    checked=boardedCount;total=students.length;
    isFull=students.length>=BUS_CAPACITY;
  }
  const familyNums=[...new Set(students.filter(s=>s.familyNum).map(s=>s.familyNum))];

  useEffect(()=>{if(!navigator.geolocation){setGpsStatus("simulated");return;}navigator.geolocation.getCurrentPosition(p=>{setGpsStatus("active");onUpdate({...busData,location:{lat:p.coords.latitude,lng:p.coords.longitude}});},()=>setGpsStatus("simulated"),{enableHighAccuracy:true,timeout:8000});geoRef.current=navigator.geolocation.watchPosition(p=>{setGpsStatus("active");onUpdate(prev=>({...(prev||busData),location:{lat:p.coords.latitude,lng:p.coords.longitude}}));},()=>setGpsStatus("simulated"),{enableHighAccuracy:true,maximumAge:5000,timeout:15000});return()=>{if(geoRef.current!==null)navigator.geolocation.clearWatch(geoRef.current);};},[]);

  const togglePilgrim=(pid)=>{
    if(!canCheckin)return;
    const st=students.find(s=>s.id===pid);
    if(!st)return;
    const isCross=st.homeBusId!==busData.id;
    // If toggling OFF a cross-boarded pilgrim → return to home bus
    if(st.checkedIn&&isCross){
      if(onRemoveCrossBoarded){onRemoveCrossBoarded(pid,busData.id);}
      return;
    }
    // In return mode: only allow toggling those who went out
    if(isReturn&&!st.wentOut){return;}
    const now=new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
    if(!st.checkedIn){setScanAnim(pid);setTimeout(()=>setScanAnim(null),800);}
    onUpdate({...busData,students:students.map(s=>s.id===pid?{...s,checkedIn:!s.checkedIn,time:s.checkedIn?null:now,method:s.checkedIn?null:"manual",addedBy:s.checkedIn?"":(currentUserName||"")}:s)});
  };
  const checkinFamily=(headOrFamNum,allMembers)=>{
    if(!canCheckin)return;
    const now=new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
    let memberIds;
    if(typeof headOrFamNum==="string"){
      memberIds=students.filter(s=>s.familyNum===headOrFamNum).map(s=>s.id);
    } else {
      memberIds=students.filter(s=>s.familyNum&&s.familyNum===headOrFamNum.familyNum).map(s=>s.id);
    }
    // In return mode, filter to only those who went out
    if(isReturn){
      memberIds=memberIds.filter(mid=>{const m=students.find(s=>s.id===mid);return m&&m.wentOut;});
    }
    if(allMembers){
      onUpdate({...busData,students:students.map(s=>memberIds.includes(s.id)?{...s,checkedIn:true,time:now,method:"manual",addedBy:currentUserName||""}:s)});
    } else if(typeof headOrFamNum!=="string"){
      togglePilgrim(headOrFamNum.id);
    }
    setFamilyCheckinModal(null);setFamilyNumCheckin("");
  };
  const setStatus=(s)=>{if(!canChangeStatus)return;if(s==="commuting"){setDestModal(true);return;}onUpdate({...busData,status:s,destination:""});};
  const confirmDest=()=>{if(!destInput.trim())return;onUpdate({...busData,status:"commuting",destination:destInput.trim()});setDestModal(false);setDestInput("");};
  const copyList=(type)=>{const list=visibleStudents.filter(s=>type==="present"?s.checkedIn:!s.checkedIn);const text=(type==="present"?`✅ الحاضرون في ${busConfig.name} (${list.length})`:`❌ الغائبون عن ${busConfig.name} (${list.length})`)+"\n"+list.map((s,i)=>`${i+1}. ${s.name}${s.familyNum?` [عائلة ${s.familyNum}]`:""}${s.room?` (غ${s.room})`:""}`).join("\n");const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");setCopied(type);setTimeout(()=>setCopied(null),2500);}catch(e){}document.body.removeChild(ta);};
  const savePilgrimEdit=()=>{
    if(!editPilgrimState)return;
    // If isHead is set, we need to ensure they belong to the family
    const newFamily=epFamilyNum.trim();
    onUpdate({...busData,students:students.map(s=>{
      if(s.id===editPilgrimState.id){
        return{...s,name:epName||s.name,phone:epPhone,room:epRoom,familyNum:newFamily,isHead:newFamily?epIsHead:false};
      }
      // If this person became head of a family, unset isHead on the previous head of that family
      if(epIsHead&&newFamily&&s.familyNum===newFamily&&s.id!==editPilgrimState.id&&s.isHead){
        return{...s,isHead:false};
      }
      return s;
    })});
    setEditPilgrimState(null);
  };
  const createFamily=(ids,headId,familyNum)=>{onUpdate({...busData,students:students.map(s=>ids.includes(s.id)?{...s,familyNum,isHead:s.id===headId}:s)});};
  const removeFamily=(famNum)=>{onUpdate({...busData,students:students.map(s=>s.familyNum===famNum?{...s,familyNum:"",isHead:false}:s)});};
  const resetCheckins=()=>{if(!canCheckin)return;onUpdate({...busData,students:students.map(s=>({...s,checkedIn:false,time:null,method:null,addedBy:""})),status:"stopped",destination:""});};

  const sorted=[...visibleStudents].sort((a,b)=>{
    // In return mode: "didn't go" go to bottom
    if(isReturn){
      if(a.wentOut&&!b.wentOut)return -1;
      if(!a.wentOut&&b.wentOut)return 1;
    }
    if(a.type==="admin"&&b.type!=="admin")return 1;
    if(b.type==="admin"&&a.type!=="admin")return -1;
    if(a.isHead&&!b.isHead)return -1;
    if(!a.isHead&&b.isHead)return 1;
    return 0;
  });
  const filtered=searchQ.trim()?sorted.filter(s=>(s.name||"").toLowerCase().includes(searchQ.trim().toLowerCase())):sorted;
  const filteredHome=filtered.filter(s=>s.homeBusId===busData.id);
  const filteredCross=filtered.filter(s=>s.homeBusId!==busData.id);

  // AVAILABLE LIST for cross-boarding (only in open mode): ALL pilgrims from ALL buses
  const allAvailable=isOpen&&allBusesData
    ? allBusesData.flatMap(b=>b.students)
        .filter(s=>{
          if(students.find(x=>x.id===s.id))return false;
          if(s.boardedBus)return false;
          if(s.type==="admin")return false;
          return true;
        })
    : [];

  // Who from my bus went to other buses (open mode only)
  const homeWentAway=allBusesData
    ? allBusesData.flatMap(b=>b.students).filter(s=>s.homeBusId===busData.id&&s.boardedBus)
    : [];

  // Who from my bus hasn't boarded any bus (open mode only)
  const homeNotBoarded=allBusesData
    ? allBusesData.find(b=>b.id===busData.id)?.students.filter(s=>s.homeBusId===busData.id&&!s.checkedIn&&!s.boardedBus&&s.type!=="admin")||[]
    : [];

  // Who went out but hasn't returned yet (return mode)
  const notReturned=students.filter(s=>s.wentOut&&!s.checkedIn);
  // Group by family for the "didn't return" list
  const notReturnedFamilies={};
  notReturned.forEach(s=>{
    const fn=s.familyNum||"_individuals";
    if(!notReturnedFamilies[fn])notReturnedFamilies[fn]=[];
    notReturnedFamilies[fn].push(s);
  });

  const copyWentAwayList=()=>{
    const text=`🚌 حجاج ${busConfig.name} ركبوا في باصات أخرى (${homeWentAway.length})\n`+
      homeWentAway.map((s,i)=>{const bus=allBusConfigs.find(b=>b.id===s.boardedBus);return `${i+1}. ${s.name} → ${bus?.name||"باص"} ${s.time?`(${s.time})`:""}${s.addedBy?` — أدخله: ${s.addedBy}`:""}`;}).join("\n");
    const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");setCopied("wentAway");setTimeout(()=>setCopied(null),2500);}catch(e){}document.body.removeChild(ta);
  };
  const copyNotBoardedList=()=>{
    const text=`⏳ حجاج ${busConfig.name} لم يركبوا أي باص بعد (${homeNotBoarded.length})\n`+
      homeNotBoarded.map((s,i)=>`${i+1}. ${s.name}${s.familyNum?` [عائلة ${s.familyNum}]`:""}${s.room?` (غ${s.room})`:""}`).join("\n");
    const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");setCopied("notBoarded");setTimeout(()=>setCopied(null),2500);}catch(e){}document.body.removeChild(ta);
  };
  const copyNotReturnedList=()=>{
    let text=`⚠️ ${busConfig.name} — لم يعد بعد (${notReturned.length})\n`;
    Object.entries(notReturnedFamilies).forEach(([fn,members])=>{
      if(fn==="_individuals"){
        members.forEach((s,i)=>{text+=`• ${s.name}${s.room?` (غ${s.room})`:""}\n`;});
      } else {
        const head=members.find(m=>m.isHead);
        text+=`\n👨‍👩‍👧‍👦 عائلة ${fn}${head?` (رب: ${head.name})`:""} — ${members.length} فرد:\n`;
        members.forEach(s=>{text+=`  - ${s.isHead?"👑 ":""}${s.name}${s.room?` (غ${s.room})`:""}\n`;});
      }
    });
    const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");setCopied("notReturned");setTimeout(()=>setCopied(null),2500);}catch(e){}document.body.removeChild(ta);
  };
  // Copy a single family's "not returned" status
  const copySingleFamily=(fn,members)=>{
    const head=members.find(m=>m.isHead);
    let text;
    if(fn==="_individuals"){
      text=`⚠️ ${busConfig.name} — حجاج لم يعودوا (${members.length}):\n`+
        members.map(s=>`• ${s.name}${s.room?` (غ${s.room})`:""}`).join("\n");
    } else {
      text=`⚠️ ${busConfig.name} — عائلة ${fn}${head?` (رب: ${head.name})`:""} لم تعد بعد (${members.length} فرد):\n`+
        members.map(s=>`• ${s.isHead?"👑 ":""}${s.name}${s.room?` (غ${s.room})`:""}`).join("\n");
    }
    const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");setCopied(`fam-${fn}`);setTimeout(()=>setCopied(null),2500);}catch(e){}document.body.removeChild(ta);
  };

  const renderCard=(s)=>{
    const isHead=s.isHead;const isAdm=s.type==="admin";const isCross=s.homeBusId!==busData.id;
    const wentAway=s.boardedBus&&!isCross;const homeBc=isCross?allBusConfigs.find(b=>b.id===s.homeBusId):null;
    const boardedBc=wentAway?allBusConfigs.find(b=>b.id===s.boardedBus):null;
    // In return mode: this person didn't go on the outbound trip
    const didntGo=isReturn&&!s.wentOut&&!isAdm;
    // In return mode: this person went out but didn't return yet
    const didntReturn=isReturn&&s.wentOut&&!s.checkedIn;
    let bg,bc2,bw;
    if(didntGo){bg="rgba(100,116,139,0.08)";bc2="rgba(100,116,139,0.3)";bw="1px";}
    else if(didntReturn){bg="rgba(239,68,68,0.08)";bc2="rgba(239,68,68,0.3)";bw="1px";}
    else if(wentAway){bg="rgba(200,169,81,0.15)";bc2="rgba(200,169,81,0.4)";bw="1px";}
    else if(isCross){bg="rgba(251,191,36,0.08)";bc2="rgba(251,191,36,0.4)";bw="1px";}
    else if(isAdm){bg=s.checkedIn?"rgba(139,92,246,0.15)":"rgba(139,92,246,0.05)";bc2="rgba(139,92,246,0.3)";bw="1px";}
    else if(isHead){bg=s.checkedIn?`${busConfig.color}18`:"rgba(200,169,81,0.06)";bc2="rgba(200,169,81,0.6)";bw="2px";}
    else{bg=s.checkedIn?`${busConfig.color}18`:t.bgCard;bc2=s.checkedIn?busConfig.color+"40":t.border;bw="1px";}
    const clickable=!wentAway&&canCheckin&&!didntGo;
    return(<div key={s.id} onClick={()=>{if(!clickable)return;if(isHead&&!isCross){setFamilyCheckinModal(s);return;}togglePilgrim(s.id);}} style={{padding:"10px 12px",borderRadius:10,cursor:clickable?"pointer":"default",userSelect:"none",background:bg,border:`${bw} solid ${bc2}`,transform:scanAnim===s.id?"scale(1.06)":"scale(1)",opacity:wentAway||didntGo?0.6:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:600,color:s.checkedIn||wentAway?t.text:t.textMuted,textDecoration:didntGo?"line-through":"none"}}>{isAdm?"👤 ":isHead&&!isCross?"👑 ":isCross?"🔄 ":s.familyNum?"👥 ":""}{s.name}</span>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          {canCheckin&&!wentAway&&!isAdm&&<button onClick={e=>{e.stopPropagation();setEditPilgrimState(s);setEpName(s.name);setEpPhone(s.phone||"");setEpRoom(s.room||"");setEpFamilyNum(s.familyNum||"");setEpIsHead(!!s.isHead);}} style={{background:"rgba(59,130,246,0.15)",border:"none",color:"#60A5FA",borderRadius:4,padding:"2px 6px",fontSize:9,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>}
          <span style={{fontSize:16}}>{didntGo?"🚫":didntReturn?"⏳":wentAway?"🚌":s.checkedIn?"✅":"⬜"}</span>
        </div>
      </div>
      {isAdm&&<div style={{fontSize:9,color:"#A78BFA",marginTop:2,fontWeight:700}}>إداري</div>}
      {didntGo&&<div style={{fontSize:10,color:"#64748B",marginTop:2,fontWeight:700}}>🚫 لم يذهب</div>}
      {didntReturn&&<div style={{fontSize:10,color:"#EF4444",marginTop:2,fontWeight:700}}>⏳ لم يعد بعد</div>}
      {isCross&&homeBc&&<div style={{fontSize:10,color:"#FBBF24",marginTop:2,fontWeight:600}}>📍 من {homeBc.name}</div>}
      {wentAway&&boardedBc&&<div style={{fontSize:10,color:"#C8A951",marginTop:2,fontWeight:700}}>🚌 ركب {boardedBc.name}</div>}
      {s.familyNum&&!isCross&&<div style={{fontSize:10,color:"#C8A951",marginTop:2,fontWeight:600}}>{isHead?"👑 ":"👥 "}عائلة {s.familyNum}</div>}
      {s.room&&<div style={{fontSize:9,color:t.textDim,marginTop:1}}>غرفة {s.room}</div>}
      {s.checkedIn&&s.time&&!wentAway&&<div style={{fontSize:10,color:t.textDim,marginTop:3}}>⏰ {s.time}</div>}
      {s.checkedIn&&s.addedBy&&!wentAway&&<div style={{fontSize:9,color:"#60A5FA",marginTop:1,fontWeight:600}}>👤 أدخله: {s.addedBy}</div>}
    </div>);
  };

  const statusBtns=[{key:"stopped",label:"متوقف",icon:"⏹",color:"#EF4444",bg:"rgba(239,68,68,0.12)"},{key:"boarding",label:"ركوب",icon:"🚶",color:"#C8A951",bg:"rgba(200,169,81,0.12)"},{key:"commuting",label:"يتحرك",icon:"🚌",color:"#22C55E",bg:"rgba(34,197,94,0.12)"}];

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:t.textMuted,borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:14,fontWeight:600,fontFamily:"inherit"}}>→ رجوع</button>
        <div style={{flex:1}}><div style={{fontSize:20,fontWeight:800}}>{busConfig.name} — {busConfig.supervisor}</div></div>
        <div style={{display:"flex",gap:4}}>
          {canChangeStatus&&onUpdateBusAdmins&&<Btn onClick={()=>setAdminMgmt(true)} color="#8B5CF6" small>👥 إداريون</Btn>}
          {canCheckin&&<Btn onClick={resetCheckins} color="transparent" small style={{border:`1px solid ${t.border}`,color:t.textMuted}}>🔄</Btn>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 14px",borderRadius:10,background:gpsStatus==="active"?"rgba(34,197,94,0.08)":"rgba(251,191,36,0.08)"}}><span style={{width:8,height:8,borderRadius:"50%",background:gpsStatus==="active"?"#22C55E":"#FBBF24"}}/><span style={{fontSize:12,fontWeight:600,color:gpsStatus==="active"?"#22C55E":"#FBBF24"}}>{gpsStatus==="active"?"📱 GPS":"📍 محاكاة"}</span></div>
      {isOpen&&canCheckin&&<div style={{marginBottom:12,padding:"12px 14px",borderRadius:10,background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:"#FBBF24",fontWeight:700}}>🔓 وضع التفويج المفتوح</div>
          <Btn onClick={()=>{setCrossBoardModal(true);setCrossBoardSearch("");setCrossBoardFilterBus("");}} color="#FBBF24" small disabled={isFull} style={{color:"#0B1120"}}>{isFull?"ممتلئ":"+ إضافة راكب"}</Btn>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <Btn onClick={()=>setWentAwayModal(true)} color="rgba(200,169,81,0.2)" small style={{color:"#C8A951",border:"1px solid rgba(200,169,81,0.3)",fontSize:11}}>🚌 ركبوا باصات أخرى ({homeWentAway.length})</Btn>
          <Btn onClick={()=>setNotBoardedModal(true)} color="rgba(239,68,68,0.15)" small style={{color:"#EF4444",border:"1px solid rgba(239,68,68,0.3)",fontSize:11}}>⏳ لم يركبوا بعد ({homeNotBoarded.length})</Btn>
        </div>
      </div>}
      {isOutbound&&canCheckin&&<div style={{marginBottom:12,padding:"12px 14px",borderRadius:10,background:"rgba(59,130,246,0.1)",border:"1px solid rgba(59,130,246,0.3)"}}>
        <div style={{fontSize:12,color:"#60A5FA",fontWeight:700,marginBottom:4}}>🕋 مرحلة الذهاب</div>
        <div style={{fontSize:11,color:t.textMuted}}>سجّل الحجاج الذاهبين. سيتم حفظهم لمرحلة العودة.</div>
      </div>}
      {isReturn&&canCheckin&&<div style={{marginBottom:12,padding:"12px 14px",borderRadius:10,background:"rgba(168,85,247,0.1)",border:"1px solid rgba(168,85,247,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:"#A78BFA",fontWeight:700}}>↩️ مرحلة العودة</div>
        </div>
        <div style={{fontSize:11,color:t.textMuted,marginBottom:8}}>سجّل من عاد. من لم يذهب يظهر مشطوباً (لا يمكن تسجيله).</div>
        <Btn onClick={()=>setNotReturnedModal(true)} color="rgba(239,68,68,0.2)" small style={{color:"#EF4444",border:"1px solid rgba(239,68,68,0.3)",fontSize:11,width:"100%"}}>⚠️ لم يعد بعد ({notReturned.length})</Btn>
      </div>}
      {canChangeStatus&&<div style={{background:t.bgCard,borderRadius:14,border:`1px solid ${t.border}`,padding:16,marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:t.textDim,marginBottom:12}}>الحالة {busData.status==="commuting"&&busData.destination&&<span style={{color:"#22C55E"}}>← {busData.destination}</span>}</div>
        <div style={{display:"flex",gap:8}}>{statusBtns.map(btn=><button key={btn.key} onClick={()=>setStatus(btn.key)} style={{flex:1,padding:"12px 8px",borderRadius:10,border:"2px solid",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",background:busData.status===btn.key?btn.bg:"transparent",borderColor:busData.status===btn.key?btn.color+"55":t.border,color:busData.status===btn.key?btn.color:t.textDim}}><div style={{fontSize:22,marginBottom:4}}>{btn.icon}</div>{btn.label}</button>)}</div>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div style={{background:`linear-gradient(135deg,${busConfig.color}18,${busConfig.color}08)`,borderRadius:14,border:`1px solid ${busConfig.color}30`,padding:20,textAlign:"center"}}>
          <div style={{fontSize:48,fontWeight:900,lineHeight:1,fontFamily:"'JetBrains Mono',monospace"}}>{checked}<span style={{fontSize:20,color:t.textDim}}>/{total}</span></div>
          <div style={{fontSize:12,color:t.textMuted,marginTop:8}}>{isReturn?(total===0?"لا يوجد ذاهبون":checked===total?"✅ الجميع عاد":`${total-checked} لم يعد`):isOutbound?(total===0?"لا يوجد ركاب":checked===total?"✅ الجميع حاضر":`${total-checked} متبقي`):(checked===total&&total>0?"✅ الجميع":total===0?"لا يوجد":`${total-checked} متبقي`)}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {canManageFamilies&&<Btn onClick={()=>setFamilyModal(true)} color="#8B5CF6" small style={{flex:1}}>👨‍👩‍👧‍👦 العائلات</Btn>}
          {canCheckin&&familyNums.length>0&&<div style={{background:"rgba(200,169,81,0.08)",borderRadius:10,padding:8,border:"1px solid rgba(200,169,81,0.2)"}}>
            <div style={{fontSize:10,color:"#C8A951",marginBottom:4,fontWeight:700}}>تسجيل عائلة</div>
            <div style={{display:"flex",gap:4}}><select value={familyNumCheckin} onChange={e=>setFamilyNumCheckin(e.target.value)} style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:6,padding:"6px 8px",fontSize:12,fontFamily:"inherit",outline:"none"}}><option value="">العائلة...</option>{familyNums.map(fn=><option key={fn} value={fn}>{fn}</option>)}</select><Btn onClick={()=>{if(familyNumCheckin)checkinFamily(familyNumCheckin,true);}} disabled={!familyNumCheckin} color="#C8A951" small style={{fontSize:10}}>✅</Btn></div>
          </div>}
        </div>
      </div>
      <div style={{marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:14,fontWeight:700}}>الركاب</div><div style={{display:"flex",gap:12,fontSize:12,color:t.textDim}}><span>🟢 {checked}</span><span>⚫ {total-checked}</span></div></div>
      <Input value={searchQ} onChange={setSearchQ} placeholder="🔍 ابحث..." style={{marginBottom:12}}/>
      {total===0?<div style={{padding:40,textAlign:"center",color:t.textDim,fontSize:13,background:t.bgCard,borderRadius:12,marginBottom:16}}>
        {isOpen?"🔓 وضع التفويج المفتوح — اضغط '+ إضافة راكب' لبدء تسجيل الركاب":isReturn?"↩️ لا يوجد أحد في الذهاب — لا حجاج لتسجيل عودتهم":"لا يوجد ركاب"}
      </div>:(
        <><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:6,marginBottom:filteredCross.length>0?12:16}}>{filteredHome.map(renderCard)}</div>
          {filteredCross.length>0&&<><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><div style={{flex:1,height:1,background:"rgba(251,191,36,0.3)"}}/><div style={{fontSize:11,color:"#FBBF24",fontWeight:700,padding:"4px 10px",background:"rgba(251,191,36,0.1)",borderRadius:20}}>🔄 ({filteredCross.length})</div><div style={{flex:1,height:1,background:"rgba(251,191,36,0.3)"}}/></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:6,marginBottom:16}}>{filteredCross.map(renderCard)}</div></>}</>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
        <button onClick={()=>copyList("absent")} style={{padding:12,borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:12,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",color:copied==="absent"?"#22C55E":"#EF4444",fontFamily:"inherit"}}>{copied==="absent"?"✅ تم!":"📋 الغائبين"}</button>
        <button onClick={()=>copyList("present")} style={{padding:12,borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:12,background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",color:copied==="present"?"#22C55E":"#10B981",fontFamily:"inherit"}}>{copied==="present"?"✅ تم!":"📋 الحاضرين"}</button>
      </div>
      <SimpleMap locations={busData.location?[{id:busData.id,lat:busData.location.lat,lng:busData.location.lng,color:busConfig.color,status:busData.status,label:busConfig.name}]:[]} height={220}/>

      {/* MODALS */}
      <Modal open={destModal} onClose={()=>setDestModal(false)} title="🚌 الوجهة" t={t}><Input value={destInput} onChange={setDestInput} placeholder="الوجهة..." style={{marginBottom:12,fontSize:16,padding:"14px"}}/><Btn onClick={confirmDest} disabled={!destInput.trim()} color="#22C55E" style={{width:"100%",fontSize:16,padding:14}}>✅ تأكيد</Btn></Modal>
      <Modal open={!!editPilgrimState} onClose={()=>setEditPilgrimState(null)} title="✏️ تعديل" t={t}>{editPilgrimState&&<div>
        <div style={{fontSize:11,color:t.textDim,marginBottom:4}}>الاسم</div>
        <Input value={epName} onChange={setEpName} placeholder="الاسم" style={{marginBottom:10}}/>
        <div style={{fontSize:11,color:t.textDim,marginBottom:4}}>الهاتف</div>
        <Input value={epPhone} onChange={setEpPhone} placeholder="الهاتف" style={{marginBottom:10}}/>
        <div style={{fontSize:11,color:t.textDim,marginBottom:4}}>الغرفة</div>
        <Input value={epRoom} onChange={setEpRoom} placeholder="الغرفة" style={{marginBottom:10}}/>
        <div style={{fontSize:11,color:t.textDim,marginBottom:4}}>رقم العائلة (اتركه فارغاً للإزالة من أي عائلة)</div>
        <Input value={epFamilyNum} onChange={setEpFamilyNum} placeholder="رقم العائلة" style={{marginBottom:8}}/>
        {epFamilyNum.trim()&&<label style={{fontSize:12,color:"#C8A951",display:"flex",alignItems:"center",gap:6,marginBottom:12,cursor:"pointer",padding:"8px 10px",background:"rgba(200,169,81,0.08)",borderRadius:8,border:"1px solid rgba(200,169,81,0.2)"}}><input type="checkbox" checked={epIsHead} onChange={e=>setEpIsHead(e.target.checked)}/> 👑 رب العائلة</label>}
        <Btn onClick={savePilgrimEdit} color="#22C55E" style={{width:"100%"}}>💾 حفظ</Btn>
      </div>}</Modal>

      {/* Family modal */}
      <Modal open={familyModal} onClose={()=>setFamilyModal(false)} title="العائلات" width={500} t={t}>
        {(()=>{const ef={};students.forEach(s=>{if(s.familyNum){if(!ef[s.familyNum])ef[s.familyNum]=[];ef[s.familyNum].push(s);}});const ua=students.filter(s=>!s.familyNum&&s.type!=="admin");return(<div>
          {Object.keys(ef).length>0&&<div style={{marginBottom:20}}>{Object.entries(ef).map(([fn,members])=>{const head=members.find(m=>m.isHead);return(<div key={fn} style={{background:"rgba(200,169,81,0.08)",borderRadius:10,padding:12,marginBottom:8,border:"1px solid rgba(200,169,81,0.2)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{fontSize:13,fontWeight:700,color:"#C8A951"}}>عائلة {fn} — {head?.name||"—"} ({members.length})</span><button onClick={()=>removeFamily(fn)} style={{background:"rgba(239,68,68,0.15)",border:"none",color:"#EF4444",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>فك</button></div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{members.map(m=><span key={m.id} style={{fontSize:11,padding:"2px 8px",borderRadius:6,background:m.isHead?"rgba(200,169,81,0.2)":"rgba(255,255,255,0.05)",color:m.isHead?"#C8A951":t.textMuted}}>{m.isHead?"👑 ":""}{m.name}</span>)}</div></div>);})}</div>}
          {ua.length>=2&&<FamilyCreator unassigned={ua} students={students} onCreateFamily={createFamily} t={t}/>}
        </div>);})()}
      </Modal>

      {/* Family checkin */}
      <Modal open={!!familyCheckinModal} onClose={()=>setFamilyCheckinModal(null)} title="👑 تسجيل" t={t}>
        {familyCheckinModal&&(()=>{const members=students.filter(s=>s.familyNum&&s.familyNum===familyCheckinModal.familyNum);return(<div><div style={{fontSize:14,color:t.textMuted,marginBottom:16}}>عائلة {familyCheckinModal.familyNum} ({members.length})</div><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:20}}>{members.map(m=><span key={m.id} style={{fontSize:12,padding:"4px 10px",borderRadius:6,background:m.checkedIn?"rgba(34,197,94,0.15)":"rgba(255,255,255,0.05)",color:m.checkedIn?"#22C55E":t.textMuted}}>{m.isHead?"👑 ":""}{m.name} {m.checkedIn?"✅":""}</span>)}</div><div style={{display:"flex",gap:8}}><Btn onClick={()=>checkinFamily(familyCheckinModal,false)} color="#3B82F6" style={{flex:1}}>رب العائلة فقط</Btn><Btn onClick={()=>checkinFamily(familyCheckinModal,true)} color="#22C55E" style={{flex:1}}>✅ الكل</Btn></div></div>);})()}
      </Modal>

      {/* Cross-board */}
      <Modal open={crossBoardModal} onClose={()=>setCrossBoardModal(false)} title="🔄 إضافة راكب" width={520} t={t}>
        <div style={{fontSize:11,color:t.textDim,marginBottom:8}}>اختر حاج من قائمة كل الباصات</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}><input type="text" value={crossBoardSearch} onChange={e=>setCrossBoardSearch(e.target.value)} placeholder="🔍 ابحث بالاسم..." style={{flex:2,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:8,padding:"10px",fontSize:14,outline:"none",fontFamily:"inherit"}}/><select value={crossBoardFilterBus} onChange={e=>setCrossBoardFilterBus(e.target.value)} style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:8,padding:"10px",fontSize:13,fontFamily:"inherit",outline:"none"}}><option value="" style={{background:"#1E293B",color:"#F1F5F9"}}>كل الباصات</option>{allBusConfigs.map(b=><option key={b.id} value={b.id} style={{background:"#1E293B",color:"#F1F5F9"}}>{b.name}</option>)}</select></div>
        <div style={{fontSize:10,color:t.textDim,marginBottom:8}}>المتاح: {allAvailable.length} حاج</div>
        <div style={{maxHeight:300,overflowY:"auto",display:"grid",gap:4}}>{allAvailable
          .filter(s=>!crossBoardFilterBus||s.homeBusId===Number(crossBoardFilterBus))
          .filter(s=>{if(!crossBoardSearch.trim())return true;const q=crossBoardSearch.trim().toLowerCase();return (s.name||"").toLowerCase().includes(q);})
          .slice(0,200).map(s=>{const home=allBusConfigs.find(b=>b.id===s.homeBusId);return(
          <div key={`${s.homeBusId}-${s.id}`} onClick={()=>{if(isFull)return;onCrossBoard(s.id,s.homeBusId,busData.id,busConfig.supervisor);setCrossBoardModal(false);}} style={{padding:"10px 14px",borderRadius:8,cursor:isFull?"not-allowed":"pointer",background:t.bgCard,border:`1px solid ${t.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:isFull?0.4:1}}>
            <span style={{fontSize:13,fontWeight:600}}>{s.name}</span>
            <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:home?.color+"22",color:home?.color,fontWeight:700}}>📍 {home?.name}</span>
          </div>);})}{allAvailable.length===0&&<div style={{padding:20,textAlign:"center",color:t.textDim,fontSize:12}}>لا يوجد حجاج متاحون</div>}</div>
      </Modal>

      {/* Went away modal */}
      <Modal open={wentAwayModal} onClose={()=>setWentAwayModal(false)} title="🚌 حجاجي الذين ركبوا باصات أخرى" width={520} t={t}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:12,color:t.textDim}}>{homeWentAway.length} حاج</div>
          <Btn onClick={copyWentAwayList} disabled={homeWentAway.length===0} color="#C8A951" small>{copied==="wentAway"?"✅ تم النسخ":"📋 نسخ القائمة"}</Btn>
        </div>
        {homeWentAway.length===0?<div style={{padding:20,textAlign:"center",color:t.textDim,fontSize:13}}>لا يوجد</div>:
        <div style={{maxHeight:400,overflowY:"auto",display:"grid",gap:4}}>{homeWentAway.map(s=>{const bus=allBusConfigs.find(b=>b.id===s.boardedBus);return(
          <div key={s.id} style={{padding:"10px 12px",borderRadius:8,background:t.bgCard,border:`1px solid ${t.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:13,fontWeight:600}}>{s.name}</span>
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:bus?.color+"22",color:bus?.color,fontWeight:700}}>🚌 {bus?.name}</span>
            </div>
            <div style={{fontSize:10,color:t.textDim,display:"flex",gap:10}}>
              {s.time&&<span>⏰ {s.time}</span>}
              {s.addedBy&&<span>👤 أدخله: {s.addedBy}</span>}
            </div>
          </div>);})}</div>}
      </Modal>

      {/* Not boarded modal */}
      <Modal open={notBoardedModal} onClose={()=>setNotBoardedModal(false)} title="⏳ حجاجي الذين لم يركبوا بعد" width={520} t={t}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:12,color:t.textDim}}>{homeNotBoarded.length} حاج</div>
          <Btn onClick={copyNotBoardedList} disabled={homeNotBoarded.length===0} color="#EF4444" small>{copied==="notBoarded"?"✅ تم النسخ":"📋 نسخ القائمة"}</Btn>
        </div>
        {homeNotBoarded.length===0?<div style={{padding:20,textAlign:"center",color:t.textDim,fontSize:13}}>✅ كل الحجاج ركبوا</div>:
        <div style={{maxHeight:400,overflowY:"auto",display:"grid",gap:4}}>{homeNotBoarded.map(s=>(
          <div key={s.id} style={{padding:"10px 12px",borderRadius:8,background:t.bgCard,border:`1px solid ${t.border}`}}>
            <div style={{fontSize:13,fontWeight:600}}>{s.name}</div>
            {s.familyNum&&<div style={{fontSize:10,color:"#C8A951",marginTop:2,fontWeight:600}}>{s.isHead?"👑 ":"👥 "}عائلة {s.familyNum}</div>}
            {s.room&&<div style={{fontSize:10,color:t.textDim,marginTop:2}}>غرفة {s.room}</div>}
            {s.phone&&<div style={{fontSize:10,color:t.textDim}}>📱 {s.phone}</div>}
          </div>
        ))}</div>}
      </Modal>

      {/* Not returned modal (return mode) */}
      <Modal open={notReturnedModal} onClose={()=>setNotReturnedModal(false)} title="⚠️ لم يعد من الذهاب بعد" width={520} t={t}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:t.textDim}}>{notReturned.length} حاج لم يعد</div>
          <Btn onClick={copyNotReturnedList} disabled={notReturned.length===0} color="#EF4444" small>{copied==="notReturned"?"✅ تم النسخ":"📋 نسخ الكل"}</Btn>
        </div>
        {notReturned.length===0?<div style={{padding:20,textAlign:"center",color:"#22C55E",fontSize:13}}>✅ الجميع عاد</div>:
        <div style={{maxHeight:400,overflowY:"auto",display:"grid",gap:8}}>{Object.entries(notReturnedFamilies).map(([fn,members])=>{
          if(fn==="_individuals"){
            return(<div key="indiv" style={{padding:10,borderRadius:10,background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:6}}>
                <div style={{fontSize:12,fontWeight:700,color:"#EF4444"}}>🧍 أفراد بدون عائلة ({members.length})</div>
                <Btn onClick={()=>copySingleFamily("_individuals",members)} color="#EF4444" small style={{fontSize:10,padding:"4px 8px"}}>{copied===`fam-_individuals`?"✅":"📋 نسخ"}</Btn>
              </div>
              {members.map(s=>(<div key={s.id} style={{padding:"6px 10px",borderRadius:6,background:t.bgCard,fontSize:12,marginBottom:4}}>
                {s.name}{s.room?` (غ${s.room})`:""}{s.phone?` 📱${s.phone}`:""}
              </div>))}
            </div>);
          }
          const head=members.find(m=>m.isHead);
          return(<div key={fn} style={{padding:12,borderRadius:10,background:"rgba(200,169,81,0.08)",border:"1px solid rgba(200,169,81,0.25)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:6}}>
              <div style={{fontSize:12,fontWeight:700,color:"#C8A951"}}>👨‍👩‍👧‍👦 عائلة {fn} — {members.length} فرد {head&&`(رب: ${head.name})`}</div>
              <Btn onClick={()=>copySingleFamily(fn,members)} color="#C8A951" small style={{fontSize:10,padding:"4px 8px"}}>{copied===`fam-${fn}`?"✅":"📋 نسخ"}</Btn>
            </div>
            <div style={{display:"grid",gap:4}}>{members.map(s=>(
              <div key={s.id} style={{padding:"6px 10px",borderRadius:6,background:t.bgCard,fontSize:12}}>
                {s.isHead?"👑 ":""}{s.name}{s.room?` (غ${s.room})`:""}
              </div>))}</div>
          </div>);
        })}</div>}
      </Modal>

      {/* Bus admin management */}
      <Modal open={adminMgmt} onClose={()=>setAdminMgmt(false)} title="👥 إدارة إداريي الباص" t={t}>
        {(busAdmins||[]).map(ba=>(<div key={ba.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:10,borderRadius:8,background:t.bgCard,border:`1px solid ${t.border}`,marginBottom:6}}>
          <div><div style={{fontSize:13,fontWeight:600}}>👤 {ba.name}</div><div style={{fontSize:10,color:t.textDim}}>رقم: {ba.pin} | {ba.canCheckin?"✅ يدخل حجاج":"👁️ مشاهدة فقط"}</div></div>
          <div style={{display:"flex",gap:4}}>
            <Btn onClick={()=>{const updated=(busAdmins||[]).map(a=>a.id===ba.id?{...a,canCheckin:!a.canCheckin}:a);onUpdateBusAdmins(updated);}} color={ba.canCheckin?"#EF4444":"#22C55E"} small>{ba.canCheckin?"إلغاء الصلاحية":"إعطاء صلاحية"}</Btn>
            <Btn onClick={()=>{
              // Remove from bus admins list
              onUpdateBusAdmins((busAdmins||[]).filter(a=>a.id!==ba.id));
              // Also remove from students list
              const studentMatch=students.find(s=>s.busAdminId===ba.id);
              if(studentMatch){onUpdate({...busData,students:students.filter(s=>s.busAdminId!==ba.id)});}
            }} color="#EF4444" small>🗑️</Btn>
          </div>
        </div>))}
        <div style={{borderTop:`1px solid ${t.border}`,paddingTop:12,marginTop:12}}>
          <div style={{fontSize:12,fontWeight:700,color:t.textMuted,marginBottom:8}}>إضافة إداري جديد</div>
          <Input value={newAdminName} onChange={setNewAdminName} placeholder="الاسم" style={{marginBottom:6}}/>
          <Input value={newAdminPin} onChange={v=>{setNewAdminPin(v);setNewAdminErr("");}} placeholder="رقم الدخول" style={{marginBottom:6}}/>
          {newAdminErr&&<div style={{color:"#EF4444",fontSize:11,marginBottom:8,fontWeight:600}}>{newAdminErr}</div>}
          <label style={{fontSize:12,color:t.textMuted,display:"flex",alignItems:"center",gap:6,marginBottom:10,cursor:"pointer"}}><input type="checkbox" checked={newAdminCheckin} onChange={e=>setNewAdminCheckin(e.target.checked)}/> صلاحية إدخال الحجاج</label>
          <Btn onClick={()=>{
            setNewAdminErr("");
            if(!newAdminName.trim()||!newAdminPin.trim())return;
            if(newAdminPin.trim().length<4){setNewAdminErr("الرقم 4 أرقام على الأقل");return;}
            if(newAdminPin.trim()==="0000"){setNewAdminErr("الرقم 0000 محجوز للمشاهد");return;}
            // Check conflict
            const conflict=settings?checkPinConflict(newAdminPin.trim(),settings,allBusConfigs,null):null;
            if(conflict){setNewAdminErr(`الرقم مستخدم بالفعل (${conflict})`);return;}
            const baId=`BA-${Date.now()}`;
            const newA={id:baId,name:newAdminName.trim(),pin:newAdminPin.trim(),canCheckin:newAdminCheckin};
            // Add to bus admins list
            onUpdateBusAdmins([...(busAdmins||[]),newA]);
            // Also add to students list as type "admin"
            const alreadyInStudents=students.find(s=>s.name===newAdminName.trim()&&s.type==="admin");
            if(!alreadyInStudents){
              onUpdate({...busData,students:[...students,{id:nid(),name:newAdminName.trim(),type:"admin",room:"",phone:"",familyNum:"",isHead:false,checkedIn:false,time:null,method:null,homeBusId:busData.id,boardedBus:null,busAdminId:baId}]});
            }
            setNewAdminName("");setNewAdminPin("");setNewAdminCheckin(false);
          }} disabled={!newAdminName.trim()||!newAdminPin.trim()} color="#22C55E" style={{width:"100%"}}>+ إضافة</Btn>
        </div>
      </Modal>
    </div>
  );
};

/* ═══════ FAMILY CREATOR ═══════ */
const FamilyCreator=({unassigned,students,onCreateFamily,t})=>{
  const[selected,setSelected]=useState([]);const[headId,setHeadId]=useState("");const[familyNum,setFamilyNum]=useState("");
  return(<div>
    <div style={{fontSize:13,fontWeight:700,color:t.textMuted,marginBottom:8}}>إنشاء عائلة</div>
    <Input value={familyNum} onChange={setFamilyNum} placeholder="رقم العائلة" style={{marginBottom:8}}/>
    <div style={{maxHeight:200,overflowY:"auto",marginBottom:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>{unassigned.map(s=><div key={s.id} onClick={()=>setSelected(p=>p.includes(s.id)?p.filter(x=>x!==s.id):[...p,s.id])} style={{padding:"6px 10px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,background:selected.includes(s.id)?"rgba(59,130,246,0.15)":t.bgCard,border:`1px solid ${selected.includes(s.id)?"rgba(59,130,246,0.4)":t.border}`,color:selected.includes(s.id)?"#60A5FA":t.textDim}}>{selected.includes(s.id)?"✓ ":""}{s.name}</div>)}</div>
    {selected.length>=2&&<div style={{marginBottom:12}}><select value={headId} onChange={e=>setHeadId(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"inherit",borderRadius:8,padding:"8px",fontSize:13,fontFamily:"inherit",outline:"none"}}><option value="">رب العائلة...</option>{selected.map(id=>{const s=students.find(x=>x.id===id);return<option key={id} value={id}>{s?.name}</option>;})}</select></div>}
    <Btn onClick={()=>{if(selected.length>=2&&headId&&familyNum.trim()){onCreateFamily(selected,headId,familyNum.trim());setSelected([]);setHeadId("");setFamilyNum("");}}} disabled={selected.length<2||!headId||!familyNum.trim()} color="#C8A951" style={{width:"100%"}}>👨‍👩‍👧‍👦 إنشاء ({selected.length})</Btn>
  </div>);
};

/* ═══════ TRACKING PAGE (public, no login) ═══════ */
const TrackingPage=({trackingId})=>{
  const[status,setStatus]=useState("connecting");
  const[coords,setCoords]=useState(null);
  const[accuracy,setAccuracy]=useState(null);
  const[updateCount,setUpdateCount]=useState(0);

  useEffect(()=>{
    if(!trackingId)return;
    if(!navigator.geolocation){setStatus("no-gps");return;}

    // First: request a single high-accuracy position to trigger permission prompt
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        setStatus("active");
        const loc={lat:pos.coords.latitude,lng:pos.coords.longitude};
        setCoords(loc);setAccuracy(Math.round(pos.coords.accuracy));
        saveCarTracking(trackingId,{location:loc,lastUpdate:Date.now(),active:true,accuracy:pos.coords.accuracy});
        setUpdateCount(c=>c+1);
      },
      (err)=>{setStatus("error");},
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    );

    // Then: continuously watch with high accuracy
    const watchId=navigator.geolocation.watchPosition(
      (pos)=>{
        setStatus("active");
        const loc={lat:pos.coords.latitude,lng:pos.coords.longitude};
        setCoords(loc);setAccuracy(Math.round(pos.coords.accuracy));
        saveCarTracking(trackingId,{location:loc,lastUpdate:Date.now(),active:true,accuracy:pos.coords.accuracy});
        setUpdateCount(c=>c+1);
      },
      (err)=>{
        if(err.code===1) setStatus("denied");
        else setStatus("error");
      },
      {enableHighAccuracy:true,maximumAge:0,timeout:20000}
    );
    return()=>navigator.geolocation.clearWatch(watchId);
  },[trackingId]);

  return(
    <div style={{minHeight:"100vh",background:"#0F172A",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,direction:"rtl",fontFamily:"'IBM Plex Sans Arabic',sans-serif",color:"#F1F5F9"}}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap" rel="stylesheet"/>
      <div style={{fontSize:48,marginBottom:16}}>🚗</div>
      <div style={{fontSize:22,fontWeight:800,marginBottom:8}}>تتبع السيارة</div>
      <div style={{fontSize:14,color:status==="active"?"#22C55E":status==="error"||status==="denied"?"#EF4444":"#FBBF24",fontWeight:600,textAlign:"center",lineHeight:1.8}}>
        {status==="active"&&"📍 يتم إرسال موقعك بنجاح"}
        {status==="error"&&"⚠️ خطأ في GPS — تأكد من تفعيل خدمات الموقع في إعدادات الهاتف"}
        {status==="denied"&&"🚫 تم رفض إذن الموقع — اسمح للمتصفح بالوصول للموقع من الإعدادات"}
        {status==="no-gps"&&"⚠️ GPS غير متاح في هذا الجهاز"}
        {status==="connecting"&&"جاري طلب إذن الموقع..."}
      </div>
      {status==="active"&&coords&&(
        <div style={{marginTop:20,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:12,padding:16,textAlign:"center",width:"100%",maxWidth:350}}>
          <div style={{fontSize:12,color:"#94A3B8",marginBottom:8}}>📡 بيانات الموقع</div>
          <div style={{fontSize:11,color:"#22C55E",fontFamily:"monospace",marginBottom:4}}>خط العرض: {coords.lat.toFixed(6)}</div>
          <div style={{fontSize:11,color:"#22C55E",fontFamily:"monospace",marginBottom:4}}>خط الطول: {coords.lng.toFixed(6)}</div>
          <div style={{fontSize:11,color:accuracy&&accuracy<50?"#22C55E":accuracy&&accuracy<200?"#FBBF24":"#EF4444",marginBottom:4}}>الدقة: {accuracy} متر</div>
          <div style={{fontSize:10,color:"#64748B"}}>عدد التحديثات: {updateCount}</div>
        </div>
      )}
      {status==="active"&&<div style={{marginTop:16,fontSize:12,color:"#94A3B8",textAlign:"center"}}>⚠️ أبقِ هذه الصفحة مفتوحة ولا تقفل الشاشة</div>}
      {(status==="error"||status==="denied")&&<div style={{marginTop:16,fontSize:12,color:"#94A3B8",textAlign:"center",lineHeight:1.8}}>
        حاول الخطوات التالية:<br/>
        1. افتح إعدادات الهاتف → الموقع → فعّله<br/>
        2. في المتصفح اسمح بالوصول للموقع<br/>
        3. أعد تحميل هذه الصفحة
      </div>}
    </div>
  );
};

/* ═══════ CAR REQUEST PAGE (public, no login) ═══════ */
const CarRequestPage=()=>{
  const t=THEMES["dark"];
  const[name,setName]=useState("");
  const[phone,setPhone]=useState("");
  const[committee,setCommittee]=useState("");
  const[customCommittee,setCustomCommittee]=useState("");
  const[vehicleType,setVehicleType]=useState("");
  const[dateTime,setDateTime]=useState("");
  const[destination,setDestination]=useState("");
  const[duration,setDuration]=useState("");
  const[notes,setNotes]=useState("");
  const[submitting,setSubmitting]=useState(false);
  const[done,setDone]=useState(false);
  const[error,setError]=useState("");

  const submit=async()=>{
    setError("");
    const finalCommittee=committee==="__other__"?customCommittee.trim():committee;
    if(!name.trim()||!phone.trim()||!finalCommittee||!vehicleType||!dateTime||!destination.trim()||!duration.trim()){
      setError("الرجاء تعبئة جميع الحقول المطلوبة");return;
    }
    setSubmitting(true);
    try{
      await saveCarRequest({
        name:name.trim(),phone:phone.trim(),committee:finalCommittee,vehicleType,
        dateTime,destination:destination.trim(),duration:duration.trim(),notes:notes.trim()
      });
      setDone(true);
    }catch(e){setError("حدث خطأ. حاول مرة أخرى.");}
    setSubmitting(false);
  };

  if(done){
    return(<div style={{minHeight:"100vh",background:t.loginBg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,direction:"rtl",fontFamily:"'IBM Plex Sans Arabic',sans-serif",color:t.text}}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <div style={{fontSize:80,marginBottom:20}}>✅</div>
      <div style={{fontSize:24,fontWeight:800,marginBottom:12,color:"#22C55E"}}>تم استلام طلبك</div>
      <div style={{fontSize:15,color:t.textMuted,textAlign:"center",maxWidth:400,lineHeight:1.8}}>سيتم التواصل معك قريباً من قبل مشرف السيارات</div>
      <button onClick={()=>{setDone(false);setName("");setPhone("");setCommittee("");setCustomCommittee("");setVehicleType("");setDateTime("");setDestination("");setDuration("");setNotes("");}} style={{marginTop:32,padding:"14px 32px",borderRadius:12,background:"rgba(6,182,212,0.15)",border:"1px solid rgba(6,182,212,0.35)",color:"#06B6D4",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📝 طلب آخر</button>
    </div>);
  }

  const selectStyle={width:"100%",background:t.loginInput,border:`1px solid ${t.borderInput}`,color:t.text,borderRadius:10,padding:"14px 12px",fontSize:15,outline:"none",boxSizing:"border-box",fontFamily:"inherit",marginBottom:12};
  const inputStyle={...selectStyle};
  const optStyle={background:"#1E293B",color:"#F1F5F9"};
  const labelStyle={fontSize:13,fontWeight:600,color:t.textMuted,marginBottom:6,display:"block"};

  return(<div style={{minHeight:"100vh",background:t.loginBg,padding:"24px 16px",direction:"rtl",fontFamily:"'IBM Plex Sans Arabic',sans-serif",color:t.text}}>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Amiri:wght@700&display=swap" rel="stylesheet"/>
    <div style={{maxWidth:480,margin:"0 auto"}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:64,marginBottom:12}}>🚗</div>
        <div style={{fontSize:28,fontWeight:800,color:"#C8A951",fontFamily:"'Amiri',serif",lineHeight:1.2}}>طلب وسيلة نقل</div>
        <div style={{width:60,height:3,background:"linear-gradient(90deg,transparent,#C8A951,transparent)",margin:"12px auto 0"}}/>
      </div>
      <div style={{background:t.loginCard,borderRadius:16,padding:"24px 20px",border:`1px solid ${t.border}`}}>
        <label style={labelStyle}>اسم صاحب الطلب *</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="الاسم الكامل" style={inputStyle}/>
        <label style={labelStyle}>رقم الجوال *</label>
        <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="رقم الجوال" inputMode="tel" style={inputStyle}/>
        <label style={labelStyle}>اللجنة *</label>
        <select value={committee} onChange={e=>setCommittee(e.target.value)} style={selectStyle}>
          <option value="" style={optStyle}>— اختر اللجنة —</option>
          {DEFAULT_COMMITTEES.map(c=><option key={c} value={c} style={optStyle}>{c}</option>)}
          <option value="__other__" style={optStyle}>أخرى...</option>
        </select>
        {committee==="__other__"&&<input value={customCommittee} onChange={e=>setCustomCommittee(e.target.value)} placeholder="اكتب اسم اللجنة" style={inputStyle}/>}
        <label style={labelStyle}>نوع وسيلة النقل المطلوبة *</label>
        <select value={vehicleType} onChange={e=>setVehicleType(e.target.value)} style={selectStyle}>
          <option value="" style={optStyle}>— اختر النوع —</option>
          {VEHICLE_TYPES.map(v=><option key={v.value} value={v.value} style={optStyle}>{v.label}</option>)}
        </select>
        <label style={labelStyle}>اليوم والوقت المطلوب *</label>
        <input type="datetime-local" value={dateTime} onChange={e=>setDateTime(e.target.value)} style={inputStyle}/>
        <label style={labelStyle}>الوجهة *</label>
        <input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="إلى أين؟" style={inputStyle}/>
        <label style={labelStyle}>المدة *</label>
        <input value={duration} onChange={e=>setDuration(e.target.value)} placeholder="مثال: ساعة، نصف ساعة، يوم كامل" style={inputStyle}/>
        <label style={labelStyle}>معلومات أخرى (اختياري)</label>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="أي ملاحظات إضافية..." style={{...inputStyle,minHeight:80,resize:"vertical",fontFamily:"inherit"}}/>
        {error&&<div style={{color:"#EF4444",fontSize:13,textAlign:"center",marginBottom:12,fontWeight:600,padding:"8px 12px",background:"rgba(239,68,68,0.08)",borderRadius:8}}>{error}</div>}
        <button onClick={submit} disabled={submitting} style={{width:"100%",padding:16,borderRadius:12,border:"none",cursor:submitting?"not-allowed":"pointer",background:submitting?"#475569":"linear-gradient(135deg,#06B6D4,#0891B2)",color:"#fff",fontSize:18,fontWeight:800,marginTop:8,fontFamily:"inherit",opacity:submitting?0.6:1}}>{submitting?"جاري الإرسال...":"📨 إرسال الطلب"}</button>
      </div>
      <div style={{textAlign:"center",marginTop:20}}>
        <a href="/" style={{color:t.textDim,fontSize:13,textDecoration:"underline"}}>← الصفحة الرئيسية</a>
      </div>
      <div style={{marginTop:24,fontSize:12,color:t.textDim,textAlign:"center",opacity:0.7}}>برمجة وتصميم / خالد محمود المرزوقي</div>
    </div>
  </div>);
};

/* ═══════ MAIN APP ═══════ */
/* ═══════ APP ROUTER ═══════ */
export default function AppRouter() {
  const path=window.location.pathname;
  const trackMatch=path.match(/\/track\/(.+)/);
  if(trackMatch) return <TrackingPage trackingId={trackMatch[1]}/>;
  if(path==="/request-car"||path==="/request-car/") return <CarRequestPage/>;
  return <MainApp/>;
}

function MainApp() {
  const[auth,setAuth]=useState(null);
  const[view,setView]=useState("dashboard");
  const[theme,setThemeState]=useState(getTheme);
  const toggleTheme=()=>{const n=theme==="dark"?"light":"dark";setThemeState(n);setThemeStorage(n);};
  const t=THEMES[theme];
  const DEFAULT_SETTINGS={adminPin:"2026",viewerPin:"0000",carSupervisorPin:"7070",openBoarding:false,boardingMode:"normal"};
  const[settings,setSettings]=useState(DEFAULT_SETTINGS);
  const[busConfigs,setBusConfigs]=useState(INITIAL_BUSES);
  const[busesData,setBusesData]=useState(INITIAL_BUS_DATA);
  const[cars,setCars]=useState([]);
  const[savedUsers,setSavedUsers]=useState([]);
  const[savedReceivers,setSavedReceivers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[pendingMode,setPendingMode]=useState(null);

  const settingsReceivedRef=useRef(false);
  useEffect(()=>{const unsubs=[];
    unsubs.push(listenToAllBuses(buses=>{if(buses.length>0){setBusesData(INITIAL_BUS_DATA.map(ib=>{const fb=buses.find(b=>b.id===ib.id);return fb||ib;}));}setLoading(false);}));
    unsubs.push(listenToBusConfigs(configs=>{if(configs)setBusConfigs(configs);}));
    // Listen to settings — merge with defaults to ensure all keys exist
    unsubs.push(listenToSettings("main",data=>{
      if(data){
        settingsReceivedRef.current=true;
        setSettings(prev=>{
          const merged={...DEFAULT_SETTINGS,...data};
          // Migrate old openBoarding(bool) to new boardingMode(string)
          if(typeof merged.boardingMode==="undefined"){
            merged.boardingMode=merged.openBoarding?"open":"normal";
          }
          return merged;
        });
      }
    }));
    // Also check old-format settings from previous version
    unsubs.push(listenToSettings("adminPin",data=>{
      if(data&&data.pin){
        setSettings(prev=>({...prev,adminPin:data.pin}));
      }
    }));
    // If settings doc doesn't exist after 3 seconds AND we haven't received any data, create it with defaults.
    // Critical: only write defaults if we never received anything (otherwise we'd overwrite real data).
    const initTimer=setTimeout(()=>{
      if(!settingsReceivedRef.current){
        saveSettings("main",DEFAULT_SETTINGS);
      }
    },3000);
    unsubs.push(listenToCars(setCars));
    unsubs.push(listenToSavedNames("carUsers",names=>{if(names)setSavedUsers(names);}));
    unsubs.push(listenToSavedNames("keyReceivers",names=>{if(names)setSavedReceivers(names);}));
    return()=>{unsubs.forEach(u=>u());clearTimeout(initTimer);};
  },[]);

  const persistBus=(busId,data)=>{saveBusData(busId,data);};
  const updateBus=useCallback((busId,dataOrFn)=>{setBusesData(prev=>{const updated=prev.map(b=>{if(b.id!==busId)return b;const nd=typeof dataOrFn==="function"?{...b,...dataOrFn(b)}:dataOrFn;persistBus(busId,nd);return nd;});return updated;});},[]);
  const updateSettings=(s)=>{setSettings(s);saveSettings("main",s);};
  const updateBusConfigsFn=(configs)=>{setBusConfigs(configs);saveBusConfigs(configs);};

  // Helper: returns the count that matters for capacity check
  // In open mode: only checked-in students count toward capacity
  // In other modes: all assigned students count
  const getBusCount=(busStudents)=>settings.boardingMode==="open"
    ? busStudents.filter(s=>s.checkedIn).length
    : busStudents.length;

  // setBoardingMode handles all transitions cleanly:
  //  → "normal": reset checkedIn, wentOut, boardedBus, return cross-boarded
  //  → "open": no data change, just allow cross-boarding
  //  → "roundtrip-outbound": reset checkedIn (start fresh outbound check-in)
  //  → "roundtrip-return": for each currently checkedIn student, set wentOut=true; then reset checkedIn
  //                       (only when transitioning FROM outbound; if already in return, no-op)
  const setBoardingMode=(newMode)=>{
    const oldMode=settings.boardingMode;
    if(oldMode===newMode)return;
    updateSettings({...settings,boardingMode:newMode,openBoarding:newMode==="open"});
    setBusesData(prev=>{
      const u=prev.map(b=>{
        let students=b.students;
        if(newMode==="normal"){
          // Full reset: clear wentOut, boardedBus, return all cross-boarded pilgrims
          students=students.filter(s=>s.homeBusId===b.id).map(s=>({...s,boardedBus:null,wentOut:false,checkedIn:false,time:null,method:null,addedBy:""}));
        } else if(newMode==="roundtrip-outbound"){
          // Start fresh outbound; clear any prior round-trip data
          students=students.filter(s=>s.homeBusId===b.id).map(s=>({...s,boardedBus:null,wentOut:false,checkedIn:false,time:null,method:null,addedBy:""}));
        } else if(newMode==="roundtrip-return"&&oldMode==="roundtrip-outbound"){
          // Lock in: those checked in are the ones who went out; reset checkedIn for return tracking
          students=students.map(s=>({...s,wentOut:!!s.checkedIn,checkedIn:false,time:null,method:null,addedBy:""}));
        } else if(newMode==="open"){
          // From any mode: clear wentOut just in case
          students=students.map(s=>({...s,wentOut:false}));
        }
        const nb={...b,students};
        persistBus(b.id,nb);
        return nb;
      });
      return u;
    });
  };

  const addPilgrim=(busId,data)=>{setBusesData(prev=>{const u=prev.map(b=>{if(b.id!==busId||getBusCount(b.students)>=BUS_CAPACITY)return b;const nb={...b,students:[...b.students,{id:nid(),name:data.name,type:data.type||"pilgrim",room:data.room||"",phone:data.phone||"",familyNum:data.familyNum||"",isHead:!!data.isHead,checkedIn:false,time:null,method:null,homeBusId:busId,boardedBus:null}]};persistBus(busId,nb);return nb;});return u;});};
  const deletePilgrim=(busId,pid)=>{
    // If the deleted student is a bus admin, also remove from busConfigs.busAdmins
    const bus=busesData.find(b=>b.id===busId);
    const student=bus?.students.find(s=>s.id===pid);
    if(student?.busAdminId){
      const updated=busConfigs.map(bc=>bc.id===busId?{...bc,busAdmins:(bc.busAdmins||[]).filter(a=>a.id!==student.busAdminId)}:bc);
      updateBusConfigsFn(updated);
    } else if(student?.type==="admin"){
      // Admin added by management — check if there's a matching busAdmin by name
      const updated=busConfigs.map(bc=>bc.id===busId?{...bc,busAdmins:(bc.busAdmins||[]).filter(a=>a.name!==student.name)}:bc);
      updateBusConfigsFn(updated);
    }
    setBusesData(prev=>{const u=prev.map(b=>{if(b.id!==busId)return b;const nb={...b,students:b.students.filter(s=>s.id!==pid)};persistBus(busId,nb);return nb;});return u;});
  };
  const editPilgrim=(busId,pid,data)=>{setBusesData(prev=>{const u=prev.map(b=>{if(b.id!==busId)return b;const nb={...b,students:b.students.map(s=>s.id===pid?{...s,...data}:s)};persistBus(busId,nb);return nb;});return u;});};
  const transferPilgrim=(fromBus,pid,toBus)=>{setBusesData(prev=>{const from=prev.find(b=>b.id===fromBus);const p=from?.students.find(s=>s.id===pid);if(!p)return prev;const target=prev.find(b=>b.id===toBus);if(getBusCount(target.students)>=BUS_CAPACITY)return prev;const u=prev.map(b=>{if(b.id===fromBus){const nb={...b,students:b.students.filter(s=>s.id!==pid)};persistBus(fromBus,nb);return nb;}if(b.id===toBus){const nb={...b,students:[...b.students,{...p,homeBusId:toBus,checkedIn:false,time:null,familyNum:"",isHead:false}]};persistBus(toBus,nb);return nb;}return b;});return u;});};
  const bulkImport=(entries)=>{setBusesData(prev=>{const nb=prev.map(b=>({...b,students:[...b.students]}));entries.forEach(e=>{const bus=nb.find(b=>b.id===e.busId);if(!bus||bus.students.length>=BUS_CAPACITY)return;bus.students.push({id:nid(),name:e.name,type:e.type||"pilgrim",room:e.room||"",phone:"",familyNum:e.familyNum||"",isHead:!!e.isHead,checkedIn:false,time:null,method:null,homeBusId:e.busId,boardedBus:null});});nb.forEach(b=>persistBus(b.id,b));return nb;});};
  const crossBoardPilgrim=(pid,homeBusId,targetBusId,addedBy)=>{setBusesData(prev=>{const home=prev.find(b=>b.id===homeBusId);const p=home?.students.find(s=>s.id===pid);if(!p)return prev;const target=prev.find(b=>b.id===targetBusId);
    const isOpen=settings.boardingMode==="open";
    const targetCount=isOpen
      ? target.students.filter(s=>s.checkedIn).length
      : target.students.length;
    if(targetCount>=BUS_CAPACITY)return prev;
    // Check: is this person already boarded in another bus? Don't allow duplicate
    if(p.boardedBus&&p.boardedBus!==targetBusId)return prev;
    const now=new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
    const u=prev.map(b=>{
      if(b.id===homeBusId){const nb={...b,students:b.students.map(s=>s.id===pid?{...s,checkedIn:false,boardedBus:targetBusId,time:now,addedBy:addedBy||""}:s)};persistBus(homeBusId,nb);return nb;}
      if(b.id===targetBusId){const nb={...b,students:[...b.students,{...p,checkedIn:true,time:now,method:"manual",boardedBus:null,addedBy:addedBy||""}]};persistBus(targetBusId,nb);return nb;}
      return b;
    });return u;});};

  // Remove a cross-boarded pilgrim — return them to their home bus
  const removeCrossBoarded=(pid,currentBusId)=>{setBusesData(prev=>{
    const current=prev.find(b=>b.id===currentBusId);
    const p=current?.students.find(s=>s.id===pid);
    if(!p)return prev;
    const homeBusId=p.homeBusId;
    const u=prev.map(b=>{
      if(b.id===currentBusId){const nb={...b,students:b.students.filter(s=>s.id!==pid)};persistBus(currentBusId,nb);return nb;}
      if(b.id===homeBusId){const nb={...b,students:b.students.map(s=>s.id===pid?{...s,boardedBus:null,checkedIn:false,time:null,addedBy:""}:s)};persistBus(homeBusId,nb);return nb;}
      return b;
    });return u;});};

  const updateBusAdmins=(busId,admins)=>{const updated=busConfigs.map(bc=>bc.id===busId?{...bc,busAdmins:admins}:bc);updateBusConfigsFn(updated);};

  useEffect(()=>{const iv=setInterval(()=>{setBusesData(prev=>prev.map(b=>{if(b.status!=="commuting"||!b.location)return b;return{...b,location:{lat:b.location.lat+(Math.random()-0.45)*0.0015,lng:b.location.lng+(Math.random()-0.45)*0.0015}};}));},3000);return()=>clearInterval(iv);},[]);

  const selBus=typeof view==="number"?busesData.find(b=>b.id===view):null;
  const selConfig=typeof view==="number"?busConfigs.find(b=>b.id===view):null;
  const baseUrl=window.location.origin;

  if(loading)return(<div style={{minHeight:"100vh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",color:"#C8A951",fontSize:18,fontFamily:"'IBM Plex Sans Arabic',sans-serif",direction:"rtl"}}><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap" rel="stylesheet"/>جاري تحميل البيانات...</div>);
  if(!auth)return<LoginPage onLogin={({role,busId,adminId,canCheckin})=>{setAuth({role,busId,adminId,canCheckin});if(role==="admin"||role==="viewer")setView("dashboard");else if(role==="carSupervisor")setView("cars");else setView(busId);}} settings={settings} busConfigs={busConfigs} theme={theme} toggleTheme={toggleTheme}/>;

  // Determine permissions
  const isAdmin=auth.role==="admin";
  const isViewer=auth.role==="viewer";
  const isSupervisor=auth.role==="supervisor";
  const isBusAdmin=auth.role==="busAdmin";
  const isCarSupervisor=auth.role==="carSupervisor";
  const readOnly=isViewer;

  // Compute the current user's display name (used to record who checked in each pilgrim)
  let currentUserName="";
  if(isAdmin) currentUserName="الإدارة";
  else if(isSupervisor){
    const myBus=busConfigs.find(b=>b.id===auth.busId);
    currentUserName=myBus?`المشرف ${myBus.supervisor}`:"المشرف";
  } else if(isBusAdmin){
    const myBus=busConfigs.find(b=>b.id===auth.busId);
    const me=myBus?.busAdmins?.find(a=>a.id===auth.adminId);
    currentUserName=me?`الإداري ${me.name}`:"الإداري";
  }

  // Pending mode change (shows confirmation modal for destructive transitions)
  const requestModeChange=(newMode)=>{
    const cur=settings.boardingMode||"normal";
    if(cur===newMode)return;
    // Destructive transitions that need confirmation:
    //   open → anything (will clear cross-boards)
    //   roundtrip-outbound → normal/open (will discard outbound data)
    //   roundtrip-return → normal/open (will discard round-trip data)
    //   normal → roundtrip-outbound or open: no confirmation needed
    //   roundtrip-outbound → roundtrip-return: no confirm; this is the natural progression
    const destructive=
      (cur==="open"&&newMode!=="open")||
      (cur==="roundtrip-outbound"&&(newMode==="normal"||newMode==="open"))||
      (cur==="roundtrip-return"&&(newMode==="normal"||newMode==="open"));
    if(destructive){
      setPendingMode(newMode);
    } else {
      setBoardingMode(newMode);
    }
  };

  return(
    <div dir="rtl" style={{minHeight:"100vh",background:t.bg,color:t.text,fontFamily:"'IBM Plex Sans Arabic',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=JetBrains+Mono:wght@700;900&family=Amiri:wght@700&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;}.leaflet-container{font-family:inherit!important;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-thumb{background:${t.scrollThumb};border-radius:3px;}`}</style>
      <div style={{background:t.bgTopBar,borderBottom:`1px solid ${t.borderTopBar}`,backdropFilter:"blur(20px)",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:1100}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#C8A951,#A67C2E)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🕋</div><div><div style={{fontSize:17,fontWeight:800}}>نظام تتبع باصات الحجاج</div><div style={{fontSize:11,color:t.textDim}}>{isAdmin?"الإدارة":isViewer?"مشاهد":isCarSupervisor?"مشرف السيارات":isSupervisor?`المشرف: ${selConfig?.supervisor||""}`:isBusAdmin?"إداري الباص":""}</div></div></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={toggleTheme} style={{background:theme==="dark"?"rgba(251,191,36,0.15)":"rgba(99,102,241,0.15)",border:`1px solid ${theme==="dark"?"rgba(251,191,36,0.3)":"rgba(99,102,241,0.3)"}`,color:theme==="dark"?"#FBBF24":"#6366F1",borderRadius:8,padding:"6px 10px",fontSize:16,cursor:"pointer"}}>{theme==="dark"?"☀️":"🌙"}</button>
          {(isAdmin||isViewer)&&view!=="dashboard"&&<Btn onClick={()=>setView("dashboard")} color="rgba(200,169,81,0.15)" small style={{border:"1px solid rgba(200,169,81,0.3)",color:"#C8A951"}}>الرئيسية</Btn>}
          {isCarSupervisor&&view!=="cars"&&<Btn onClick={()=>setView("cars")} color="rgba(6,182,212,0.15)" small style={{border:"1px solid rgba(6,182,212,0.3)",color:"#06B6D4"}}>السيارات</Btn>}
          <Btn onClick={()=>{setAuth(null);setView("dashboard");}} color="rgba(239,68,68,0.15)" small style={{border:"1px solid rgba(239,68,68,0.3)",color:"#EF4444"}}>خروج</Btn>
        </div>
      </div>
      <div style={{padding:20,maxWidth:1100,margin:"0 auto"}}>
        {(isAdmin||isViewer)&&view==="dashboard"&&<AdminDashboard busesData={busesData} busConfigs={busConfigs} onSelectBus={id=>setView(id)} onLogout={()=>{setAuth(null);setView("dashboard");}} boardingMode={settings.boardingMode||"normal"} onSetMode={requestModeChange} onGoTo={v=>setView(v)} t={t} readOnly={readOnly}/>}
        {isAdmin&&view==="pilgrim-mgmt"&&<PilgrimMgmtPage busesData={busesData} busConfigs={busConfigs} onAdd={addPilgrim} onDelete={deletePilgrim} onEdit={editPilgrim} onTransfer={transferPilgrim} onBulkImport={bulkImport} onBack={()=>setView("dashboard")} t={t}/>}
        {isAdmin&&view==="bus-mgmt"&&<BusMgmtPage busConfigs={busConfigs} onUpdate={updateBusConfigsFn} settings={settings} onUpdateSettings={updateSettings} onBack={()=>setView("dashboard")} t={t}/>}
        {(isAdmin||isViewer||isCarSupervisor)&&view==="cars"&&<CarMgmtPage cars={cars} onSaveCar={saveCar} onDeleteCar={deleteCarFb} onAddHistory={addCarHistory} savedUsers={savedUsers} savedReceivers={savedReceivers} onSaveUsers={n=>saveSavedNames("carUsers",n)} onSaveReceivers={n=>saveSavedNames("keyReceivers",n)} onBack={()=>(isAdmin||isViewer)?setView("dashboard"):setAuth(null)} t={t} readOnly={isViewer} baseUrl={baseUrl}/>}
        {typeof view==="number"&&selBus&&selConfig&&<BusLeaderView busData={selBus} busConfig={selConfig} allBusConfigs={busConfigs} allBusesData={busesData}
          onBack={()=>(isAdmin||isViewer)?setView("dashboard"):setAuth(null)}
          onUpdate={data=>updateBus(selBus.id,data)}
          onCrossBoard={crossBoardPilgrim}
          onRemoveCrossBoarded={removeCrossBoarded}
          boardingMode={settings.boardingMode||"normal"}
          canCheckin={isAdmin||isSupervisor||(isBusAdmin&&auth.canCheckin)}
          canManageFamilies={isAdmin||isSupervisor}
          canChangeStatus={isAdmin||isSupervisor}
          busAdmins={selConfig.busAdmins||[]}
          onUpdateBusAdmins={isSupervisor||isAdmin?(admins)=>updateBusAdmins(selBus.id,admins):null}
          settings={settings}
          currentUserName={currentUserName}
          t={t}/>}
      </div>
      <Modal open={!!pendingMode} onClose={()=>setPendingMode(null)} title="تأكيد تغيير الوضع" t={t}>
        <div style={{fontSize:14,marginBottom:8}}>
          {pendingMode==="normal"&&"إنهاء التفويج الحالي والعودة للوضع العادي؟"}
          {pendingMode==="open"&&"تغيير الوضع إلى التفويج المفتوح؟ سيتم إنهاء التفويج الحالي."}
          {pendingMode==="roundtrip-outbound"&&"بدء تفويج ذهاب جديد؟ سيتم مسح أي بيانات تفويج سابقة."}
        </div>
        <div style={{fontSize:12,color:t.textDim,marginBottom:20,padding:"8px 12px",background:"rgba(239,68,68,0.08)",borderRadius:8,border:"1px solid rgba(239,68,68,0.2)"}}>⚠️ سيتم مسح حالة الحضور الحالية لجميع الباصات.</div>
        <div style={{display:"flex",gap:8}}><Btn onClick={()=>setPendingMode(null)} color="transparent" style={{flex:1,border:`1px solid ${t.border}`,color:t.textMuted}}>إلغاء</Btn><Btn onClick={()=>{setBoardingMode(pendingMode);setPendingMode(null);}} color="#22C55E" style={{flex:1}}>✅ نعم، متابعة</Btn></div>
      </Modal>
    </div>
  );
}
