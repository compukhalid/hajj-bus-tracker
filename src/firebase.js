import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, getDocs, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB9gFK33FsmwpFRrqhhYVucKfwbU7D1OC8",
  authDomain: "hajj-bus-tracker.firebaseapp.com",
  projectId: "hajj-bus-tracker",
  storageBucket: "hajj-bus-tracker.firebasestorage.app",
  messagingSenderId: "349742366780",
  appId: "1:349742366780:web:724b632922e5866ca18339"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// ═══════ BUS DATA ═══════
export const saveBusData = async (busId, data) => {
  try { await setDoc(doc(db, "buses", String(busId)), data); } catch (e) { console.error("saveBusData:", e); }
};
export const saveBusConfigs = async (configs) => {
  try { await setDoc(doc(db, "settings", "busConfigs"), { configs }); } catch (e) { console.error("saveBusConfigs:", e); }
};
export const saveSettings = async (key, data) => {
  try { await setDoc(doc(db, "settings", key), data); } catch (e) { console.error("saveSettings:", e); }
};

// ═══════ LISTENERS ═══════
export const listenToAllBuses = (callback) => {
  return onSnapshot(collection(db, "buses"), (snap) => {
    const buses = []; snap.forEach((d) => buses.push({ id: Number(d.id), ...d.data() })); callback(buses);
  });
};
export const listenToBusConfigs = (callback) => {
  return onSnapshot(doc(db, "settings", "busConfigs"), (snap) => { if (snap.exists()) callback(snap.data().configs); });
};
export const listenToSettings = (key, callback) => {
  return onSnapshot(doc(db, "settings", key), (snap) => { if (snap.exists()) callback(snap.data()); });
};

// ═══════ CARS ═══════
export const saveCar = async (carId, data) => {
  try { await setDoc(doc(db, "cars", carId), data); } catch (e) { console.error("saveCar:", e); }
};
export const deleteCar = async (carId) => {
  try { await deleteDoc(doc(db, "cars", carId)); } catch (e) { console.error("deleteCar:", e); }
};
export const listenToCars = (callback) => {
  return onSnapshot(collection(db, "cars"), (snap) => {
    const cars = []; snap.forEach((d) => cars.push({ id: d.id, ...d.data() })); callback(cars);
  });
};

// ═══════ CAR USAGE HISTORY ═══════
export const addCarHistory = async (carId, entry) => {
  try { await addDoc(collection(db, "cars", carId, "history"), entry); } catch (e) { console.error("addCarHistory:", e); }
};
export const listenToCarHistory = (carId, callback) => {
  return onSnapshot(collection(db, "cars", carId, "history"), (snap) => {
    const h = []; snap.forEach((d) => h.push({ id: d.id, ...d.data() })); h.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); callback(h);
  });
};

// ═══════ CAR TRACKING (public links) ═══════
export const saveCarTracking = async (trackingId, data) => {
  try { await setDoc(doc(db, "tracking", trackingId), data); } catch (e) { console.error("saveCarTracking:", e); }
};
export const listenToCarTracking = (trackingId, callback) => {
  return onSnapshot(doc(db, "tracking", trackingId), (snap) => { if (snap.exists()) callback(snap.data()); });
};

// ═══════ SAVED NAMES ═══════
export const saveSavedNames = async (key, names) => {
  try { await setDoc(doc(db, "savedNames", key), { names }); } catch (e) { console.error("saveSavedNames:", e); }
};
export const listenToSavedNames = (key, callback) => {
  return onSnapshot(doc(db, "savedNames", key), (snap) => { if (snap.exists()) callback(snap.data().names); });
};

// ═══════ IMAGE UPLOAD ═══════
export const uploadImage = async (path, file) => {
  try {
    const sRef = storageRef(storage, path);
    await uploadBytes(sRef, file);
    return await getDownloadURL(sRef);
  } catch (e) { console.error("uploadImage:", e); return null; }
};

export { db, storage };
