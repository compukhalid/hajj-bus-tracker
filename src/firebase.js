import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, collection } from "firebase/firestore";

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

// ═══════ Save data to Firestore ═══════
export const saveBusData = async (busId, data) => {
  try {
    await setDoc(doc(db, "buses", String(busId)), data);
  } catch (e) {
    console.error("Error saving bus data:", e);
  }
};

export const saveBusConfigs = async (configs) => {
  try {
    await setDoc(doc(db, "settings", "busConfigs"), { configs });
  } catch (e) {
    console.error("Error saving bus configs:", e);
  }
};

export const saveAdminPin = async (pin) => {
  try {
    await setDoc(doc(db, "settings", "adminPin"), { pin });
  } catch (e) {
    console.error("Error saving admin pin:", e);
  }
};

export const saveOpenBoarding = async (value) => {
  try {
    await setDoc(doc(db, "settings", "openBoarding"), { enabled: value });
  } catch (e) {
    console.error("Error saving open boarding:", e);
  }
};

// ═══════ Listen to real-time changes ═══════
export const listenToBusData = (busId, callback) => {
  return onSnapshot(doc(db, "buses", String(busId)), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
};

export const listenToAllBuses = (callback) => {
  return onSnapshot(collection(db, "buses"), (snap) => {
    const buses = [];
    snap.forEach((d) => buses.push({ id: Number(d.id), ...d.data() }));
    callback(buses);
  });
};

export const listenToBusConfigs = (callback) => {
  return onSnapshot(doc(db, "settings", "busConfigs"), (snap) => {
    if (snap.exists()) callback(snap.data().configs);
  });
};

export const listenToAdminPin = (callback) => {
  return onSnapshot(doc(db, "settings", "adminPin"), (snap) => {
    if (snap.exists()) callback(snap.data().pin);
  });
};

export const listenToOpenBoarding = (callback) => {
  return onSnapshot(doc(db, "settings", "openBoarding"), (snap) => {
    if (snap.exists()) callback(snap.data().enabled);
  });
};

export { db };
