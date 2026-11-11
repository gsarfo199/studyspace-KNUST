 // ===== V18 Firestore-Only + Rules-Fixed - StudySpace =====
import { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Alert, Modal, Platform, ScrollView, TouchableOpacity, Switch, AppState } from 'react-native';
import { collection, onSnapshot, addDoc, doc, setDoc, query, where, serverTimestamp, deleteDoc, getDocs, updateDoc, getDoc, orderBy, limit, runTransaction, Timestamp } from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';

const storage = getStorage();
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true }) });
let Location = null;
if (Platform.OS !== 'web') { try { Location = require('expo-location'); } catch(e){} }

const ADMIN_UIDS = ["pk5rTtFF5kMnptn9DXsHfbdiqlU2", "txahxHBf7eekwbfUv2w3bjSW", "ropL0m4qilVC2EvFSDqUWKU"];
const PAYSTACK_SHOP_URL = "https://paystack.shop/pay/fkb0o0unff";
const PHOTO_MAX_AGE_MS = 60000; const PHOTO_MAX_DISTANCE_M = 40; const MAX_PHOTO_SIZE_KB = 5000;

async function getMyDeviceId(){ let did = await AsyncStorage.getItem('deviceId'); if(!did){ did = `${Platform.OS}_${Device.modelName||'phone'}_${Math.random().toString(36).slice(2,9)}`; await AsyncStorage.setItem('deviceId', did); } return did; }
let lastPosCache = null;
async function velocityCheck(newPos){ if(!lastPosCache) { lastPosCache = { lat: newPos.coords.latitude, lng: newPos.coords.longitude, time: Date.now() }; return false; } const dist = getDistanceMeters(lastPosCache.lat, lastPosCache.lng, newPos.coords.latitude, newPos.coords.longitude); const timeSec = (Date.now() - lastPosCache.time)/1000; const speedMs = dist / Math.max(1, timeSec); lastPosCache = { lat: newPos.coords.latitude, lng: newPos.coords.longitude, time: Date.now() }; if(speedMs > 20 && dist > 500) return true; return false; }

// --- YOUR EXISTING HELPERS - KEEP AS IS ---
const INDOOR_DIRECTIONS = { "prempeh": { "A": "Ground Floor, Right wing, near entrance", "B": "1st Floor, Left wing, quiet zone", "C": "2nd Floor, Left wing, Row near window" }, "default": { "A": "Ground Floor, Block A", "B": "First Floor, Block B, quiet zone", "C": "Second Floor, Block C, near window" } };
const FLOOR_PLANS = { "prempeh": { "G": { name: "Ground Floor", blocks: ["A - Right near entrance", "B - Left quiet zone", "C - Back computers"] } }, "default": { "G": { name: "Ground Floor", blocks: ["A - Block A", "B - Block B", "C - Block C"] } } };
function getIndoorDirection(libraryId, block, row) { const libMap = INDOOR_DIRECTIONS[libraryId] || INDOOR_DIRECTIONS["default"]; const blockDir = libMap[block] || libMap["A"]; return `${blockDir}, Row ${row}`; }

// V18: Firestore is single source of truth - no bundled libraries
const LIBRARY_COORDINATES = { "prempeh": { latitude: 6.67493, longitude: -1.57123 }, "engineering": { latitude: 6.67455, longitude: -1.56985 }, "science": { latitude: 6.67715, longitude: -1.57015 }, "architecture": { latitude: 6.67685, longitude: -1.57255 }, "art": { latitude: 6.67620, longitude: -1.57310 }, "law": { latitude: 6.67405, longitude: -1.57305 }, "business": { latitude: 6.67380, longitude: -1.57220 }, "pharmacy": { latitude: 6.67490, longitude: -1.56850 }, "agriculture": { latitude: 6.67580, longitude: -1.56890 }, "health": { latitude: 6.67510, longitude: -1.56780 }, "humanities": { latitude: 6.67320, longitude: -1.57280 }, "idl": { latitude: 6.67290, longitude: -1.57150 }, "forestry": { latitude: 6.67590, longitude: -1.56810 }, "grinds": { latitude: 6.67420, longitude: -1.57180 }, };
const KNUST_WALK_GRAPH = { "prempeh": { lat: 6.67493, lng: -1.57123, neighbors: { "grinds": 85, "engineering": 220, "science": 310, "business": 180, "humanities": 350 } }, "engineering": { lat: 6.67455, lng: -1.56985, neighbors: { "prempeh": 220, "pharmacy": 90, "agriculture": 150, "forestry": 180, "health": 280 } }, "science": { lat: 6.67715, lng: -1.57015, neighbors: { "prempeh": 310, "architecture": 120, "pharmacy": 280 } }, "architecture": { lat: 6.67685, lng: -1.57255, neighbors: { "science": 120, "art": 80, "prempeh": 250 } }, "art": { lat: 6.67620, lng: -1.57310, neighbors: { "architecture": 80, "law": 180, "business": 150 } }, "law": { lat: 6.67405, lng: -1.57305, neighbors: { "art": 180, "business": 110, "humanities": 180 } }, "business": { lat: 6.67380, lng: -1.57220, neighbors: { "law": 110, "art": 150, "prempeh": 180, "humanities": 150, "idl": 140 } }, "pharmacy": { lat: 6.67490, lng: -1.56850, neighbors: { "engineering": 90, "health": 120, "agriculture": 80 } }, "agriculture": { lat: 6.67580, lng: -1.56890, neighbors: { "pharmacy": 80, "forestry": 60, "engineering": 150 } }, "health": { lat: 6.67510, lng: -1.56780, neighbors: { "pharmacy": 120, "engineering": 280 } }, "humanities": { lat: 6.67320, lng: -1.57280, neighbors: { "business": 150, "law": 180, "idl": 100, "prempeh": 350 } }, "idl": { lat: 6.67290, lng: -1.57150, neighbors: { "humanities": 100, "business": 140 } }, "forestry": { lat: 6.67590, lng: -1.56810, neighbors: { "agriculture": 60, "engineering": 180 } }, "grinds": { lat: 6.67420, lng: -1.57180, neighbors: { "prempeh": 85 } }, };
function getWalkingDistanceMeters(fromLibId, toLibId) { if (fromLibId === toLibId) return 30; const graph = KNUST_WALK_GRAPH; if (!graph[fromLibId] ||!graph[toLibId]) return 500; const distances = {}; const visited = {}; Object.keys(graph).forEach(k => distances[k] = Infinity); distances[fromLibId] = 0; for (let i = 0; i < Object.keys(graph).length; i++) { let min = Infinity, minNode = null; Object.keys(distances).forEach(node => { if (!visited[node] && distances[node] < min) { min = distances[node]; minNode = node; } }); if (!minNode) break; visited[minNode] = true; const neighbors = graph[minNode].neighbors || {}; Object.entries(neighbors).forEach(([nbr, w]) => { if (distances[minNode] + w < distances[nbr]) distances[nbr] = distances[minNode] + w; }); } return distances[toLibId] || 500; }
function getWalkingTimeMins(meters) { return Math.max(1, Math.ceil(meters / 80)); }
function getDistanceMeters(lat1, lon1, lat2, lon2) { const R = 6371000; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2); return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); }
function validateSeats(input, lib) { if(input === '' || input === null) return { ok:false, msg:"Enter seats" }; const n = Number(String(input).trim()); if(isNaN(n)) return { ok:false, msg:`Enter 0 to ${lib.totalSeats}` }; if(!Number.isInteger(n)) return { ok:false, msg:"Whole number only" }; if(n < 0) return { ok:false, msg:"Can't be negative" }; if(n > lib.totalSeats) return { ok:false, msg:`Max ${lib.totalSeats}` }; return { ok:true, value:n }; }
function toSeconds(ts) { try { if (!ts) return 0; if (typeof ts.seconds === 'number') return ts.seconds; if (typeof ts.toMillis === 'function') return Math.floor(ts.toMillis() / 1000); if (ts instanceof Timestamp) return ts.seconds; if (ts._seconds) return ts._seconds; if (ts instanceof Date) return Math.floor(ts.getTime() / 1000); if (typeof ts === 'number') return Math.floor(ts / 1000); return 0; } catch(e){ return 0; } }
function formatTimeAgo(timestamp) { const sec = toSeconds(timestamp); if (!sec) return "Just now"; const diff = Date.now() / 1000 - sec; if (diff < 60) return "Just now"; if (diff < 3600) return `${Math.floor(diff/60)}m ago`; if (diff < 86400) { const h = Math.floor(diff / 3600); return h === 1? "1h ago" : `${h}h ago`; } const days = Math.floor(diff / 86400); return days === 1? "1d ago" : `${days}d ago`; }
function getRealTimeSeats(lib) { const sec = toSeconds(lib.lastVerified); if (!sec) return { state: "FRESH" }; const minsAgo = (Date.now() / 1000 - sec) / 60; if (minsAgo > 120) return { state: "GHOST" }; if (minsAgo > 60) return { state: "EXPIRED" }; if (minsAgo > 15) return { state: "STALE" }; return { state: "FRESH" }; }
function getStatusFromSeats(seats, totalSeats) { if (seats <= 0) return 'full'; if (seats < totalSeats * 0.3) return 'half'; return 'empty'; }
async function checkAndroidMockNative(position) { try { if (position && (position.mocked === true || position.coords?.mocked === true)) return true; return false; } catch(e){ return false; } }

// ===== V16: Push Token =====
async function registerPushToken(uid){
  try{
    if(Platform.OS==='web') return null;
    if(!Device.isDevice) return null;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if(existing!=='granted'){ const { status } = await Notifications.requestPermissionsAsync(); finalStatus = status; }
    if(finalStatus!=='granted') return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig?.extra?.eas?.projectId })).data;
    if(token && uid){ await setDoc(doc(db,"users",uid), { expoPushToken: token, pushUpdatedAt: serverTimestamp() }, { merge:true }); }
    return token;
  }catch(e){ console.log("push token error", e.message); return null; }
}

function AdminPanel({ onClose, user }) {
  const [isResetting, setIsResetting] = useState(false);
  const [seedLib, setSeedLib] = useState("prempeh");
  const [seedSeats, setSeedSeats] = useState("");
  const [seedTotal, setSeedTotal] = useState("450");
  const [seedName, setSeedName] = useState("Prempeh II Library");
  const wipeCollection = async (name) => { const snap = await getDocs(collection(db, name)); await Promise.all(snap.docs.map(d => deleteDoc(doc(db, name, d.id)))); };
  const doResetAll = async () => { if (isResetting) return; setIsResetting(true); try { await wipeCollection("reports"); await wipeCollection("queue"); await wipeCollection("watchlist"); await wipeCollection("leavingAssignments"); await wipeCollection("leavingReports"); await wipeCollection("payments"); await wipeCollection("liveRequests"); await wipeCollection("fakeAttempts"); await wipeCollection("fakeFlags"); await AsyncStorage.removeItem('cached_latestReports'); await AsyncStorage.removeItem('cached_libraries'); Alert.alert("Cleared!"); } catch(e){ Alert.alert(e.message); } setIsResetting(false); };
  const doSeed = async () => {
    const n = Number(seedSeats); if (isNaN(n)) return Alert.alert("Enter number");
    const total = Number(seedTotal) || 200;
    const coords = LIBRARY_COORDINATES[seedLib] || { latitude: 6.67493, longitude: -1.57123 };
    const libName = seedName || seedLib;
    const status = getStatusFromSeats(n, total);
    await setDoc(doc(db,"libraries", seedLib), { name: libName, totalSeats: total, availableSeats: n, confirmedStatus: status, lastVerified: serverTimestamp(), updatedAt: serverTimestamp(), actualLibraryChecked: true, latitude: coords.latitude, longitude: coords.longitude, block: "Block A Row 1-5" }, { merge: true });
    await addDoc(collection(db,"reports"), { libraryId: seedLib, libraryName: libName, availableSeats: n, consensusSeats: n, status, userId: user.uid, deviceId: "ADMIN_SEED", distance: 0, accuracy: 5, type: 'REPORT', createdAt: serverTimestamp(), hasPhoto: false, trustScore: 100, karma: 100 });
    Alert.alert("Seeded", `${libName} = ${n} seats`);
  };
  return (
    <ScrollView style={{flex:1, paddingTop:60, padding:20}}>
      <Text style={{fontWeight:'900', fontSize:18}}>Admin {user.uid}</Text>
      <Text style={{marginTop:16, fontWeight:'900'}}>Seed Real Count</Text>
      <TextInput placeholder="prempeh" value={seedLib} onChangeText={setSeedLib} style={{backgroundColor:'#f1f5f9', padding:14, borderRadius:12, marginTop:10}} />
      <TextInput placeholder="Library Name e.g. Prempeh II Library" value={seedName} onChangeText={setSeedName} style={{backgroundColor:'#f1f5f9', padding:14, borderRadius:12, marginTop:10}} />
      <TextInput placeholder="Total Seats e.g. 450" value={seedTotal} onChangeText={setSeedTotal} keyboardType="numeric" style={{backgroundColor:'#f1f5f9', padding:14, borderRadius:12, marginTop:10}} />
      <TextInput placeholder="Free seats counted" value={seedSeats} onChangeText={setSeedSeats} keyboardType="numeric" style={{backgroundColor:'#f1f5f9', padding:14, borderRadius:12, marginTop:10}} />
      <TouchableOpacity onPress={doSeed} style={{backgroundColor:'#22c55e', padding:15, borderRadius:12, marginTop:12}}><Text style={{color:'white', textAlign:'center', fontWeight:'900'}}>Seed Real Count</Text></TouchableOpacity>
      <TouchableOpacity onPress={doResetAll} style={{backgroundColor:'#ef4444', padding:15, borderRadius:12, marginTop:12}}><Text style={{color:'white', textAlign:'center', fontWeight:'900'}}>CLEAR ALL FAKE DATA</Text></TouchableOpacity>
      <TouchableOpacity onPress={onClose} style={{backgroundColor:'#0f172a', padding:14, borderRadius:10, marginTop:20, marginBottom:40}}><Text style={{color:'white', textAlign:'center'}}>Back</Text></TouchableOpacity>
    </ScrollView>
  );
}

export default function App() {
  const [libraries, setLibraries] = useState([]);
  const [detailLib, setDetailLib] = useState(null);
  const [selectedLib, setSelectedLib] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [phone, setPhone] = useState('');
  const [showPay, setShowPay] = useState(false); const [isPremium, setIsPremium] = useState(false);
  const [search, setSearch] = useState(''); const [watchlist, setWatchlist] = useState([]); const [myPoints, setMyPoints] = useState(3);
  const [myAssignments, setMyAssignments] = useState([]); const [isLeavingAction, setIsLeavingAction] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false); const [isOffline, setIsOffline] = useState(false); const [karma, setKarma] = useState(100);
  const [watchCounts, setWatchCounts] = useState({}); const [showPrivacy, setShowPrivacy] = useState(false); const [consentGiven, setConsentGiven] = useState(false);
  const [tapCount, setTapCount] = useState(0); const lastTapRef = useRef(0);
  const [showReportInput, setShowReportInput] = useState(false); const [reportSeats, setReportSeats] = useState('');
  const [pendingPayLib, setPendingPayLib] = useState(null); const [isSubmittingReport, setIsSubmittingReport] = useState(false); const [isWatching, setIsWatching] = useState(false);
  const [reportPhoto, setReportPhoto] = useState(null); const [latestReports, setLatestReports] = useState({}); const [trustScore, setTrustScore] = useState(100);
  const [photoLocation, setPhotoLocation] = useState(null); const [photoTakenAt, setPhotoTakenAt] = useState(null);
  const [extraWatches, setExtraWatches] = useState(0); const [totalReportsCount, setTotalReportsCount] = useState(0);
  const [showImpactPop, setShowImpactPop] = useState(false); const [impactText, setImpactText] = useState('');
  const [showIndoorMap, setShowIndoorMap] = useState(false); const [indoorTarget, setIndoorTarget] = useState({ block: 'C', row: 1, libId: 'prempeh' });
  const [showInAppMap, setShowInAppMap] = useState(false); const [inAppTargetLib, setInAppTargetLib] = useState(null);
  const [userNearestLib, setUserNearestLib] = useState("prempeh"); const [queueMap, setQueueMap] = useState({});
  const [favLibId, setFavLibId] = useState(null); const [onlineCount, setOnlineCount] = useState(0);

  const handleTitlePress = () => { const now = Date.now(); if (now - lastTapRef.current > 2000) setTapCount(1); else { const newCount = tapCount + 1; setTapCount(newCount); if (newCount >= 3) { setTapCount(0); if (user) setShowAdmin(true); } } lastTapRef.current = now; };

  useEffect(() => { const unsub = NetInfo.addEventListener(s => setIsOffline(!s.isConnected)); return () => unsub(); }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const c = await AsyncStorage.getItem('cached_libraries'); if (c) { const parsed = JSON.parse(c); if(parsed.length>0) setLibraries(parsed.map(l=>({id:l.id, ...l}))); }
        const fav = await AsyncStorage.getItem('favLibId'); if(fav) setFavLibId(fav);
        const consent = await AsyncStorage.getItem('consentGiven'); if (consent === '1') setConsentGiven(true);
        const cachedReports = await AsyncStorage.getItem('cached_latestReports'); if (cachedReports) { try{ setLatestReports(JSON.parse(cachedReports)); }catch(e){} }
      } catch {}
    }; load();
  }, []);
  useEffect(() => { AsyncStorage.setItem('cached_libraries', JSON.stringify(libraries)).catch(()=>{}); }, [libraries]);
  useEffect(() => { if (Object.keys(latestReports).length > 0) AsyncStorage.setItem('cached_latestReports', JSON.stringify(latestReports)).catch(()=>{}); }, [latestReports]);

  // V18 FIX: Libraries from Firestore ONLY - with error handler so permission errors don't crash
  useEffect(() => {
    const unsubLibs = onSnapshot(collection(db, "libraries"), (s) => {
      if (s.empty) { setLibraries([]); return; }
      const libs = s.docs.map(d => {
        const data = d.data();
        const coord = LIBRARY_COORDINATES[d.id] || {};
        return {
          id: d.id,
          name: data.name || d.id,
          totalSeats: data.totalSeats ?? 200,
          availableSeats: data.availableSeats ?? 0,
          block: data.block || (data.freeBlock ? `Block ${data.freeBlock} Row ${data.freeRow || 1}` : "Block A Row 1-5"),
          latitude: data.latitude ?? coord.latitude ?? 6.67493,
          longitude: data.longitude ?? coord.longitude ?? -1.57123,
          lastVerified: data.lastVerified || data.updatedAt || null,
          ...data,
          id: d.id,
        };
      });
      setLibraries(libs);
    }, (e) => { console.log("libraries listener error:", e.message); });
    return () => unsubLibs();
  }, []);

  // V18 FIX: Presence - only when logged in
  useEffect(() => {
    if(!user) return;
    const setOnline = () => setDoc(doc(db,"users",user.uid), { presence: 'online', lastSeen: serverTimestamp() }, { merge:true }).catch(()=>{});
    const setOffline = () => setDoc(doc(db,"users",user.uid), { presence: 'offline', lastSeen: serverTimestamp() }, { merge:true }).catch(()=>{});
    setOnline(); registerPushToken(user.uid);
    const sub = AppState.addEventListener('change', (state)=>{ if(state==='active') setOnline(); else if(state==='background' || state==='inactive') setOffline(); });
    return ()=>{ setOffline(); sub.remove(); };
  }, [user]);

  // V18 FIX: Online count - ONLY when logged in, this was the permission-denied crash
  useEffect(() => {
    if(!user) { setOnlineCount(0); return; }
    const unsub = onSnapshot(query(collection(db,"users"), where("presence","==","online")), s=> setOnlineCount(s.size), (e)=>{ console.log("online count error:", e.message); });
    return ()=>unsub();
  }, [user]);

  useEffect(() => {
    let unsubs = [];
    let unsubAuth = onAuthStateChanged(auth, async u=>{
      unsubs.forEach(fn => { try{ fn(); }catch(e){} }); unsubs = [];
      setUser(u); setAuthLoading(false);
      if(u){
        const q = query(collection(db,"reports"), orderBy("createdAt","desc"), limit(20));
        unsubs.push(onSnapshot(q, s=>{ const map={}; s.docs.forEach(d=>{ const data={id:d.id,...d.data()}; if(!map[data.libraryId]) map[data.libraryId]=data; }); setLatestReports(map); }, (e)=>{ console.log("reports listener error:", e.message); }));
        unsubs.push(onSnapshot(query(collection(db,"watchlist"), where("userId","==",u.uid)), s=> setWatchlist(s.docs.map(d=>d.data().libraryId)), (e)=>{ console.log("watchlist error:", e.message); }));
        unsubs.push(onSnapshot(doc(db,"users",u.uid), d=>{ if(d.exists()){ const data=d.data(); setKarma(data.karma??100); setTrustScore(data.trustScore??100); setExtraWatches(data.extraWatches||0); setIsPremium(data.isPremium||false); if(data.favLibId) setFavLibId(data.favLibId); }}, (e)=>{ console.log("user doc error:", e.message); }));
        unsubs.push(onSnapshot(query(collection(db,"leavingAssignments"), where("assignedTo","==",u.uid), where("status","==","PENDING")), s=>setMyAssignments(s.docs.map(d=>({id:d.id,...d.data()}))), (e)=>{ console.log("assignments error:", e.message); }));
        unsubs.push(onSnapshot(query(collection(db,"queue"), where("userId","==",u.uid), where("status","==","WAITING")), s=>{ const map={}; s.docs.forEach(d=>{ const data=d.data(); map[data.libraryId]={ pos: data.position||99, est: data.estMins||15, id: d.id }; }); setQueueMap(map); }, (e)=>{ console.log("queue error:", e.message); }));
        unsubs.push(onSnapshot(query(collection(db,"reports"), where("userId","==",u.uid)), s=> setTotalReportsCount(s.size), (e)=>{ console.log("my reports error:", e.message); }));
        try { const wcSnap = await getDocs(collection(db,"watchlist")); const counts={}; wcSnap.forEach(d=>{ counts[d.data().libraryId]=(counts[d.data().libraryId]||0)+1; }); setWatchCounts(counts); } catch(e) {}
      }
    });
    return ()=>{ unsubs.forEach(fn => { try{ fn(); }catch(e){} }); unsubAuth(); };
  }, []);

  const setFavourite = async (libId) => {
    setFavLibId(libId); await AsyncStorage.setItem('favLibId', libId);
    if(user) await setDoc(doc(db,"users",user.uid), { favLibId: libId }, { merge:true }).catch(()=>{});
    Alert.alert("My Library set", "App will open here next time like WhatsApp opens to chats");
  };

  const verifyInsideLibrary = async (reportedLib) => {
    if (ADMIN_UIDS.includes(user?.uid)) return { allowed: true, distance: 0, accuracy: 5 };
    if(Platform.OS === 'web' ||!Location) return { allowed: true, distance: 0, accuracy: 0 };
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status!== 'granted') { Alert.alert("Allow location"); return { allowed: false, distance: 999, accuracy: 999 }; }
      let pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (await checkAndroidMockNative(pos)) { Alert.alert("Fake GPS detected"); return { allowed: false, distance: 999, accuracy: 999 }; }
      if (await velocityCheck(pos)) { Alert.alert("Teleport detected"); return { allowed: false, distance: 999, accuracy: 999 }; }
      let dist = 0; const libKey = Object.keys(LIBRARY_COORDINATES).find(k=> reportedLib.name.toLowerCase().includes(k));
      const lat = reportedLib.latitude || LIBRARY_COORDINATES[libKey]?.latitude; const lng = reportedLib.longitude || LIBRARY_COORDINATES[libKey]?.longitude;
      if (lat && lng) dist = getDistanceMeters(pos.coords.latitude, pos.coords.longitude, lat, lng);
      const acc = pos.coords.accuracy || 999; if(acc > 100){ Alert.alert(`Bad GPS ${Math.round(acc)}m`); return { allowed: false, distance: Math.round(dist), accuracy: Math.round(acc) }; }
      if (dist > 500) { Alert.alert(`You are ${Math.round(dist)}m away`); return { allowed: false, distance: Math.round(dist), accuracy: Math.round(acc) }; }
      return { allowed: true, distance: Math.round(dist), accuracy: Math.round(acc) };
    } catch (e) { return { allowed: false, distance: 999, accuracy: 999 }; }
  };
  const getConsensusSeats = async (libraryId, newSeatsValue) => {
    try { const q = query(collection(db, "reports"), where("libraryId", "==", libraryId), orderBy("createdAt","desc"), limit(20)); const snap = await getDocs(q); let values = []; const tenMinsAgoSec = Date.now()/1000 - 600; for (const docSnap of snap.docs){ const data = docSnap.data(); const sec = toSeconds(data.createdAt); if(sec > tenMinsAgoSec && typeof data.availableSeats === 'number'){ if((data.disputes?.length||0)>=2) continue; values.push(data.availableSeats); } } values.push(Number(newSeatsValue)); if(values.length === 0) return Number(newSeatsValue); values.sort((a,b) => a-b); const mid = Math.floor(values.length / 2); return values.length % 2!== 0? values[mid] : Math.round((values[mid-1] + values[mid]) / 2); } catch(e){ return Number(newSeatsValue); }
  };
  const checkRateLimit = async (libraryId) => {
    try { const q = query(collection(db, "reports"), where("userId", "==", user.uid), where("libraryId", "==", libraryId), orderBy("createdAt","desc"), limit(1)); const snap = await getDocs(q); if(!snap.empty) { const last = toSeconds(snap.docs[0].data().createdAt); const diffMins = (Date.now()/1000 - last)/60; if(diffMins < 5){ Alert.alert(`Wait ${Math.ceil(5 - diffMins)}m`); return false; } } return true; } catch(e){ return true; }
  };
  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync(); if(!perm.granted){ Alert.alert("Camera permission needed"); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.3, allowsEditing: false, exif: true, base64: true });
      if(!result.canceled){ const asset = result.assets[0]; if(asset.fileSize && asset.fileSize > MAX_PHOTO_SIZE_KB * 1024){ Alert.alert(`Photo too large`); return; } setReportPhoto(asset); setPhotoTakenAt(Date.now()); if(Location){ try{ const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }); setPhotoLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy || 999 }); }catch(e){ setPhotoLocation(null); } } }
    } catch(e){ Alert.alert("Camera error", e.message); }
  };
  const recalcQueuePositions = async (libraryId) => {
    try { const q = query(collection(db,"queue"), where("libraryId","==",libraryId), where("status","==","WAITING"), orderBy("fairScore","desc"), orderBy("createdAt","asc")); const snap = await getDocs(q); let pos = 1; const jobs = []; for (const d of snap.docs) { if (d.data().userId !== user?.uid) { pos++; continue; } const est = Math.max(2, (pos - 1) * 10); jobs.push(updateDoc(doc(db,"queue",d.id), { position: pos, estMins: est }).catch(()=>{})); pos++; } await Promise.all(jobs); } catch(e) {}
  };
  const handleClaimAssignment = async (assignment) => {
    try { await runTransaction(db, async (transaction) => { const assignRef = doc(db,"leavingAssignments", assignment.id); const snap = await transaction.get(assignRef); if (!snap.exists()) throw new Error("Assignment gone"); if (snap.data().status !== "PENDING") throw new Error("Already claimed"); if (snap.data().assignedTo !== user.uid) throw new Error("Not your seat"); transaction.update(assignRef, { status: "CLAIMED", claimedAt: serverTimestamp() }); }); const q = query(collection(db,"queue"), where("libraryId","==",assignment.libraryId), where("userId","==",user.uid), where("status","==","WAITING")); const snap = await getDocs(q); for (const d of snap.docs) await updateDoc(doc(db,"queue",d.id), { status: "COMPLETED" }); await recalcQueuePositions(assignment.libraryId); Alert.alert("Seat Claimed!", `Go to ${assignment.libraryName} Block ${assignment.block} Row ${assignment.row} now.`); } catch(e){ Alert.alert(e.message); }
  };
  const handleDeclineAssignment = async (assignment) => {
    try { await updateDoc(doc(db,"leavingAssignments", assignment.id), { status: "DECLINED", declinedAt: serverTimestamp() }); Alert.alert("Declined", "Seat passed to next person."); const q = query(collection(db,"queue"), where("libraryId","==",assignment.libraryId), where("status","==","WAITING"), orderBy("fairScore","desc"), orderBy("createdAt","asc"), limit(1)); const snap = await getDocs(q); if(!snap.empty){ const nextDoc = snap.docs[0]; const next = nextDoc.data(); await addDoc(collection(db,"leavingAssignments"), { libraryId: assignment.libraryId, libraryName: assignment.libraryName, assignedTo: next.userId, assignedFrom: user.uid, block: assignment.block, row: assignment.row, status: "PENDING", createdAt: serverTimestamp(), expiresAt: Timestamp.fromDate(new Date(Date.now() + 15*60*1000)) }); await recalcQueuePositions(assignment.libraryId); } } catch(e){ Alert.alert(e.message); }
  };
  const handleLeaveSeat = async (lib) => {
    if(isLeavingAction) return; setIsLeavingAction(true);
    try {
      if (isOffline) { Alert.alert("You are offline"); setIsLeavingAction(false); return; }
      let check = await verifyInsideLibrary(lib); if(!check.allowed){ setIsLeavingAction(false); return; }
      const myDeviceId = await getMyDeviceId(); const freeBlock = String.fromCharCode(65 + Math.floor(Math.random()*3)); const freeRow = Math.floor(Math.random()*8)+1;
      const newSeatsAfterLeave = (getEffectiveData(lib).seats || 0) + 1;
      await addDoc(collection(db, "reports"), { libraryId: lib.id, libraryName: lib.name, availableSeats: newSeatsAfterLeave, consensusSeats: newSeatsAfterLeave, status: getStatusFromSeats(newSeatsAfterLeave, lib.totalSeats), userId: user.uid, deviceId: myDeviceId, distance: check.distance, accuracy: check.accuracy, type: 'LEAVE', block: freeBlock, row: freeRow, createdAt: serverTimestamp(), trustScore, hasPhoto:false });
      await addDoc(collection(db, "leavingReports"), { libraryId: lib.id, libraryName: lib.name, block: freeBlock, row: freeRow, userId: user.uid, createdAt: serverTimestamp(), });
      const queueQ = query(collection(db,"queue"), where("libraryId","==",lib.id), where("status","==","WAITING"), orderBy("fairScore","desc"), orderBy("createdAt","asc"), limit(1));
      const queueSnap = await getDocs(queueQ);
      if(!queueSnap.empty){ const nextDoc = queueSnap.docs[0]; const next = nextDoc.data(); await addDoc(collection(db, "leavingAssignments"), { libraryId: lib.id, libraryName: lib.name, assignedTo: next.userId, assignedFrom: user.uid, block: freeBlock, row: freeRow, status: "PENDING", createdAt: serverTimestamp(), expiresAt: Timestamp.fromDate(new Date(Date.now() + 15*60*1000)) }); await recalcQueuePositions(lib.id); Alert.alert(`You left! Seat given to next in queue`, `Block ${freeBlock} Row ${freeRow} -> Assigned.`); } else { Alert.alert(`You left! Block ${freeBlock} Row ${freeRow} now FREE`); }
      setDetailLib(null);
    } catch(e){ Alert.alert(e.message); } finally { setIsLeavingAction(false); }
  };
  const doEnter = async (lib) => {
    if(isLeavingAction) return; setIsLeavingAction(true);
    try { if (isOffline) { Alert.alert("You are offline"); setIsLeavingAction(false); return; } let check = await verifyInsideLibrary(lib); if(!check.allowed){ setIsLeavingAction(false); return; } const newSeatsAfterEnter = Math.max(0, (getEffectiveData(lib).seats || 0) - 1); await addDoc(collection(db, "reports"), { libraryId: lib.id, libraryName: lib.name, availableSeats: newSeatsAfterEnter, status: getStatusFromSeats(newSeatsAfterEnter, lib.totalSeats), userId: user?.uid||"anon", deviceId: await getMyDeviceId(), distance: check.distance, accuracy: check.accuracy, type: 'ENTER', createdAt: serverTimestamp(), trustScore, hasPhoto:false }); Alert.alert("Entered -1 seat"); setDetailLib(null); } catch(e){ Alert.alert(e.message); } finally { setIsLeavingAction(false); }
  };
  const handlePaidConfirm = async () => { try { if (isOffline) { Alert.alert("You are offline"); return; } await addDoc(collection(db, "payments"), { userId: user.uid, libraryId: pendingPayLib?.id || null, libraryName: pendingPayLib?.name || null, amount: 1, currency: "GHS", provider: "paystack", status: "PENDING_VERIFICATION", createdAt: serverTimestamp() }); setShowPay(false); Alert.alert("Payment Received!", "Admin will verify."); if (pendingPayLib) setTimeout(() => toggleWatchlist(pendingPayLib), 500); } catch(e){ Alert.alert(e.message); } };
  const toggleWatchlist = async (lib) => {
    if(isWatching) return; setIsWatching(true);
    try {
      if (isOffline) { Alert.alert("You are offline"); setIsWatching(false); return; }
      const q = query(collection(db, "queue"), where("libraryId","==",lib.id), where("userId","==",user.uid), where("status","==","WAITING")); const snap = await getDocs(q);
      if(!snap.empty){ for (const d of snap.docs) await updateDoc(doc(db,"queue",d.id), { status: "LEFT", leftAt: serverTimestamp() }); const wq = query(collection(db,"watchlist"), where("libraryId","==",lib.id), where("userId","==",user.uid)); const wsnap = await getDocs(wq); for (const d of wsnap.docs) await deleteDoc(doc(db,"watchlist",d.id)); await recalcQueuePositions(lib.id); setIsWatching(false); return; }
      const baseMax = isPremium? 5 : 3; const maxAllowed = baseMax + (extraWatches||0); if(watchlist.length >= maxAllowed){ setPendingPayLib(lib); setShowPay(true); setIsWatching(false); return; }
      const eff = getEffectiveData(lib); const isFull = eff.seats <= 0;
      const fair = { score: karma + 0 };
      await addDoc(collection(db, "queue"), { libraryId: lib.id, libraryName: lib.name, userId: user.uid, status: "WAITING", createdAt: serverTimestamp(), karma: karma, fairScore: fair.score, position: 999, estMins: 15 });
      await addDoc(collection(db, "watchlist"), { libraryId: lib.id, libraryName: lib.name, userId: user.uid, createdAt: serverTimestamp(), karma: karma });
      await recalcQueuePositions(lib.id);
      Alert.alert(isFull ? "You're in queue!" : "Watching", isFull ? "We'll notify you when a seat frees up." : "We'll alert you when it gets full / free.");
    } catch(e){ Alert.alert(e.message); } finally { setIsWatching(false); }
  };
  const handleAuth = async (isRegister) => {
    if (isAuthBusy) return; setIsAuthBusy(true);
    try {
      const cleanEmail = email.trim().toLowerCase(); const cleanPhone = phone.trim();
      if(!consentGiven){ await AsyncStorage.setItem('consentGiven','1'); setConsentGiven(true); }
      if(!cleanEmail.includes('@')){ Alert.alert("Enter a valid email"); return; }
      if(password.length < 6){ Alert.alert("Password must be 6+ characters"); return; }
      if(isRegister){ const deviceId = await getMyDeviceId(); const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password); await setDoc(doc(db, "users", cred.user.uid), { email: cleanEmail, phone: cleanPhone, deviceId, points: 3, karma: 100, trustScore: 100, extraWatches:0, createdAt: serverTimestamp(), isPremium: false, presence: 'online' }); Alert.alert("Account created!", "Welcome to StudySpace"); } else { await signInWithEmailAndPassword(auth, cleanEmail, password); }
    } catch(e){ Alert.alert("Login failed", e.message); } finally { setIsAuthBusy(false); }
  };
  const submitReport = async () => {
    const target = selectedLib||detailLib; if(!target) return;
    if (isOffline) { Alert.alert("You are offline"); return; }
    const checkValid = validateSeats(reportSeats, target); if(!checkValid.ok){ Alert.alert(checkValid.msg); return; }
    const seatsNum = checkValid.value; if(!reportPhoto){ Alert.alert("Photo Required", "Take a LIVE photo of the seats to prove your report."); return; } if(isSubmittingReport) return; setIsSubmittingReport(true);
    try {
      const canReport = await checkRateLimit(target.id); if(!canReport){ setIsSubmittingReport(false); return; }
      const check = await verifyInsideLibrary(target); if(!check.allowed){ setIsSubmittingReport(false); return; }
      if(reportPhoto){ if(photoTakenAt && (Date.now() - photoTakenAt > PHOTO_MAX_AGE_MS)){ Alert.alert("Photo too old"); setIsSubmittingReport(false); return; } if(photoLocation && target.latitude && target.longitude){ const photoDist = getDistanceMeters(photoLocation.lat, photoLocation.lng, target.latitude, target.longitude); if(photoDist > PHOTO_MAX_DISTANCE_M){ Alert.alert(`Photo taken ${Math.round(photoDist)}m away`); setIsSubmittingReport(false); return; } } }
      const consensusSeats = await getConsensusSeats(target.id, seatsNum); const statusFromSeats = getStatusFromSeats(consensusSeats, target.totalSeats);
      let photoUrl = null; if(reportPhoto && reportPhoto.base64){ try{ const fileName = `reports/${target.id}/${user.uid}_${Date.now()}.jpg`; const storageRef = ref(storage, fileName); await uploadString(storageRef, reportPhoto.base64, 'base64', { contentType: 'image/jpeg' }); photoUrl = await getDownloadURL(storageRef); }catch(e){ photoUrl = null; } }
      await addDoc(collection(db, "reports"), { libraryId: target.id, libraryName: target.name, availableSeats: seatsNum, consensusSeats, status: statusFromSeats, userId: user?.uid, deviceId: await getMyDeviceId(), distance: check.distance, accuracy: check.accuracy, createdAt: serverTimestamp(), hasPhoto:true, photoUrl: photoUrl, confirmations: [], disputes: [], trustScore, karma, type: 'REPORT' });
      await setDoc(doc(db,"libraries", target.id), { availableSeats: consensusSeats, confirmedStatus: statusFromSeats, lastVerified: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
      setReportSeats(''); setReportPhoto(null); setShowReportInput(false); setDetailLib(null); setImpactText(`You helped! ${consensusSeats} seats`); setShowImpactPop(true); setTimeout(()=>setShowImpactPop(false),3000);
    } catch (e) { Alert.alert(e.message); } finally { setIsSubmittingReport(false); }
  };
  const getEffectiveData = (lib) => {
    if (!lib) return { seats: 0, lastVerified: null, isFromLatest: false };
    const latest = latestReports[lib.id]; const libSeats = Math.max(0, Math.min(lib.totalSeats || 500, Number(lib.availableSeats) || 0)); const libTime = toSeconds(lib.lastVerified);
    if (latest) { const reportTime = toSeconds(latest.createdAt); if (libTime > reportTime) return { seats: libSeats, lastVerified: lib.lastVerified || null, isFromLatest: false }; const effSeats = latest.consensusSeats ?? latest.availableSeats ?? 0; const safeSeats = Math.max(0, Math.min(lib.totalSeats || 500, Number(effSeats) || 0)); return { seats: safeSeats, lastVerified: latest.createdAt || null, isFromLatest: true }; }
    return { seats: libSeats, lastVerified: lib.lastVerified || null, isFromLatest: false };
  };
  const filteredLibraries = libraries.filter(l => { if(search &&!l.name.toLowerCase().includes(search.toLowerCase())) return false; return true; }).sort((a,b)=>{
    if(a.id===favLibId) return -1; if(b.id===favLibId) return 1;
    return getEffectiveData(b).seats - getEffectiveData(a).seats;
  });
  const totalFree = libraries.reduce((a,b)=>{ const eff = getEffectiveData(b); return a+(eff.seats||0); },0);
  const favLib = favLibId ? libraries.find(l=>l.id===favLibId) : null;

  if(authLoading){ return (<View style={{flex:1, backgroundColor:'#0f172a', justifyContent:'center', alignItems:'center'}}><Text style={{color:'white', fontWeight:'900', fontSize:24}}>StudySpace</Text><Text style={{color:'#94a3b8', marginTop:8}}>Loading...</Text></View>); }
  if(!user){
    return (
      <LinearGradient colors={['#0f172a','#1e293b']} style={styles.containerAuth}>
        <Text style={styles.titleAuth}>StudySpace</Text><Text style={styles.subAuth}>KNUST Live • {onlineCount} online now</Text>
        <View style={styles.authCard}>
          <View style={{flexDirection:'row', alignItems:'center', marginBottom:14}}><Switch value={consentGiven} onValueChange={async (v)=>{ setConsentGiven(v); if(v){ await AsyncStorage.setItem('consentGiven','1'); } }} trackColor={{false:'#e2e8f0', true:'#22c55e'}} /><Text style={{fontSize:12, marginLeft:8, color:'#475569'}}>I accept anti-sybil & privacy</Text></View>
          <TextInput placeholder="Email" value={email} onChangeText={setEmail} style={styles.inputModern} autoCapitalize='none' placeholderTextColor="#94a3b8" />
          <TextInput placeholder="Phone (unique)" value={phone} onChangeText={setPhone} style={styles.inputModern} keyboardType="phone-pad" placeholderTextColor="#94a3b8" />
          <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry style={styles.inputModern} placeholderTextColor="#94a3b8" />
          <TouchableOpacity disabled={isAuthBusy} onPress={()=>handleAuth(false)} style={[styles.primaryBtn, {opacity: isAuthBusy ? 0.6 : 1}]}><Text style={styles.primaryBtnText}>{isAuthBusy ? 'Please wait...' : 'Login'}</Text></TouchableOpacity>
          <TouchableOpacity disabled={isAuthBusy} onPress={()=>handleAuth(true)} style={[styles.secondaryBtn, {opacity: isAuthBusy ? 0.6 : 1}]}><Text style={styles.secondaryBtnText}>Create account • 3 FREE watches</Text></TouchableOpacity>
          {isOffline && <Text style={{textAlign:'center', color:'#ef4444', fontSize:11, marginTop:10}}>You are offline - showing cached</Text>}
        </View>
      </LinearGradient>
    );
  }
  if(showAdmin){ return <AdminPanel onClose={()=>setShowAdmin(false)} user={user} />; }
  return (
    <View style={styles.containerTable}>
      <LinearGradient colors={['#ffffff','#f8fafc']} style={styles.header}>
        <TouchableOpacity onPress={handleTitlePress}>
          <Text style={styles.titleTable}>StudySpace • {totalFree} FREE</Text>
          <Text style={styles.subHeader}>🟢 {onlineCount} students online • Karma {karma} • {favLib ? `My: ${favLib.name}` : 'Tap ⭐ to set My Library'}</Text>
        </TouchableOpacity>
      </LinearGradient>
      <View style={styles.searchTable}><Text style={{fontSize:16}}>🔍</Text><TextInput placeholder="Search library, e.g. Prempeh, Engineering..." value={search} onChangeText={setSearch} style={{flex:1, marginLeft:10, fontSize:14}} placeholderTextColor="#94a3b8" /></View>
      {favLib && (<View style={{marginHorizontal:14, marginTop:10, backgroundColor:'#dcfce7', padding:12, borderRadius:14}}><Text style={{fontWeight:'900'}}>⭐ My Library: {favLib.name} - {getEffectiveData(favLib).seats} FREE • {formatTimeAgo(getEffectiveData(favLib).lastVerified)}</Text><TouchableOpacity onPress={()=>{ setSelectedLib(favLib); setDetailLib(favLib); }} style={{backgroundColor:'#0f172a', padding:10, borderRadius:10, marginTop:8}}><Text style={{color:'white', textAlign:'center', fontWeight:'800'}}>Open My Library</Text></TouchableOpacity></View>)}
      {myAssignments.length > 0 && (<View style={{marginHorizontal:14, marginTop:10, borderRadius:14, overflow:'hidden'}}><LinearGradient colors={['#22c55e','#16a34a']} style={{padding:12}}><Text style={{color:'white', fontWeight:'900', fontSize:13}}>YOUR TURN! {myAssignments[0].libraryName} Block {myAssignments[0].block} Row {myAssignments[0].row} • Go in 15 min!</Text><View style={{flexDirection:'row', gap:8, marginTop:10}}><TouchableOpacity onPress={()=>handleClaimAssignment(myAssignments[0])} style={{flex:1, backgroundColor:'white', padding:10, borderRadius:10}}><Text style={{textAlign:'center', fontWeight:'900', color:'#15803d'}}>Claim Seat</Text></TouchableOpacity><TouchableOpacity onPress={()=>handleDeclineAssignment(myAssignments[0])} style={{flex:1, backgroundColor:'rgba(0,0,0,0.25)', padding:10, borderRadius:10}}><Text style={{textAlign:'center', fontWeight:'800', color:'white'}}>Decline</Text></TouchableOpacity></View></LinearGradient></View>)}
      {filteredLibraries.length === 0 && (
        <View style={{marginHorizontal:14, marginTop:30, backgroundColor:'white', padding:20, borderRadius:16, alignItems:'center'}}>
          <Text style={{fontWeight:'900', fontSize:16, textAlign:'center'}}>No libraries yet</Text>
          <Text style={{color:'#64748b', textAlign:'center', marginTop:8, fontSize:13}}>Add your first library in Firestore or use Admin Seed.</Text>
        </View>
      )}
      <FlatList data={filteredLibraries} keyExtractor={item => item.id} contentContainerStyle={{paddingBottom:110, paddingTop:8}}
        renderItem={({ item }) => {
          const eff = getEffectiveData(item); const real = getRealTimeSeats({lastVerified: eff.lastVerified}); const isGhost = real.state==="GHOST" && eff.seats===0; const isFree = eff.seats > 0; const walkM = getWalkingDistanceMeters(userNearestLib, item.id); const walkT = getWalkingTimeMins(walkM); const occupancy = Math.min(100, Math.round(((item.totalSeats - eff.seats) / item.totalSeats) * 100)); const q = queueMap[item.id];
          return (
            <TouchableOpacity activeOpacity={0.85} onPress={() => { setSelectedLib(item); setDetailLib(item); setShowReportInput(false); }} style={[styles.modernCard, item.id===favLibId && {borderColor:'#22c55e', borderWidth:2}]}>
              <View style={{flexDirection:'row', justifyContent:'space-between'}}><View style={{flex:1}}><View style={{flexDirection:'row', alignItems:'center', gap:8}}><View style={[styles.statusDot, {backgroundColor: isGhost?'#cbd5e1': isFree?'#22c55e':'#ef4444'}]} /><Text style={styles.cardTitle} numberOfLines={1}>{item.id===favLibId ? '⭐ ' : ''}{item.name}</Text></View><Text style={styles.cardSub}>{item.totalSeats} total • {item.block} • {formatTimeAgo(eff.lastVerified)}</Text></View><View style={[styles.badgeModern, {backgroundColor: isGhost?'#f1f5f9': isFree?'#dcfce7':'#fee2e2'}]}><Text style={[styles.badgeText, {color: isGhost?'#64748b': isFree?'#15803d':'#b91c1c'}]}>{isGhost?'NO DATA': isFree?`${eff.seats} FREE`:'FULL'}</Text></View></View>
              <View style={styles.occupancyBarBg}><View style={[styles.occupancyBarFill, {width: `${occupancy}%`, backgroundColor: isFree?'#22c55e':'#ef4444'}]} /></View>
              <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:8}}><Text style={styles.metaText}>{occupancy}% full • {watchCounts[item.id]||0} watching</Text><Text style={styles.walkText}>🚶 {walkT} min • {walkM}m</Text></View>
              {q && <View style={styles.queueChip}><Text style={styles.queueText}>You #{q.pos} • ~{q.est} min</Text></View>}
              <TouchableOpacity onPress={()=>setFavourite(item.id)} style={{marginTop:8}}><Text style={{fontSize:11, fontWeight:'800', color:'#22c55e'}}>{item.id===favLibId ? '⭐ My Library' : '☆ Set as My Library'}</Text></TouchableOpacity>
            </TouchableOpacity>
          );
        }} />
      {showImpactPop && (<View style={styles.impactPop}><Text style={{color:'white', fontWeight:'900', textAlign:'center'}}>{impactText}</Text></View>)}
      <Modal visible={!!detailLib} transparent animationType="slide" onRequestClose={()=>setDetailLib(null)}>
        <View style={{flex:1, backgroundColor:'rgba(15,23,42,0.55)', justifyContent:'flex-end'}}><View style={styles.bottomSheet}>{detailLib && (<><View style={styles.handle} /><Text style={{fontSize:19, fontWeight:'900', textAlign:'center', color:'#0f172a'}}>{detailLib.name}</Text><Text style={{textAlign:'center', color:'#64748b', marginTop:6, fontSize:13}}>{getEffectiveData(detailLib).seats} / {detailLib.totalSeats} free • {detailLib.block}</Text>
          <View style={styles.actionRow}><TouchableOpacity onPress={()=> { setShowReportInput(!showReportInput); setReportPhoto(null); }} style={[styles.actionPill, {backgroundColor:'#0f172a'}]}><Text style={styles.actionText}>📝 Report</Text></TouchableOpacity><TouchableOpacity disabled={isLeavingAction} onPress={()=> doEnter(detailLib)} style={[styles.actionPill, {backgroundColor:'#2563eb'}]}><Text style={styles.actionText}>{isLeavingAction?'...':'➡️ Enter -1'}</Text></TouchableOpacity></View>
          <View style={styles.actionRow}><TouchableOpacity disabled={isLeavingAction} onPress={()=> handleLeaveSeat(detailLib)} style={[styles.actionPill, {backgroundColor:'#f97316'}]}><Text style={styles.actionText}>{isLeavingAction?'...':'⬆️ Leave +1'}</Text></TouchableOpacity><TouchableOpacity onPress={()=> toggleWatchlist(detailLib)} style={[styles.actionPill, {backgroundColor: watchlist.includes(detailLib.id)? '#22c55e' : '#7c3aed'}]}><Text style={styles.actionText}>{watchlist.includes(detailLib.id)?'✓ In Queue - Tap to Leave':'🔔 Join Queue'}</Text></TouchableOpacity></View>
          {showReportInput && (<View style={styles.reportBox}><Text style={{fontWeight:'800', fontSize:13}}>How many free seats you see?</Text><TextInput autoFocus placeholder="e.g. 25" value={reportSeats} onChangeText={setReportSeats} keyboardType="numeric" style={styles.inputModern} /><TouchableOpacity onPress={takePhoto} style={[styles.primaryBtn, {backgroundColor: reportPhoto? '#22c55e':'#f59e0b', marginTop:8}]}><Text style={styles.primaryBtnText}>{reportPhoto?"Photo OK ✓":"📸 Take LIVE Photo - Required"}</Text></TouchableOpacity><View style={styles.actionRow}><TouchableOpacity onPress={()=>setShowReportInput(false)} style={[styles.actionPill, {backgroundColor:'#f1f5f9'}]}><Text style={[styles.actionText, {color:'#0f172a'}]}>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={isSubmittingReport} onPress={submitReport} style={[styles.actionPill, {backgroundColor:'#0f172a'}]}><Text style={styles.actionText}>{isSubmittingReport?'Uploading...':'Submit'}</Text></TouchableOpacity></View></View>)}
        </>)}<TouchableOpacity onPress={()=>setDetailLib(null)} style={styles.closeBtn}><Text style={{textAlign:'center', fontWeight:'700', color:'#475569'}}>Close</Text></TouchableOpacity></View></View>
      </Modal>
      <View style={styles.bottomBar}><TouchableOpacity onPress={()=>signOut(auth)}><Text style={{color:'white', textAlign:'center', fontWeight:'700', fontSize:12}}>Logout • Karma {karma} • {totalReportsCount} reports • V18 Firestore-Only • {onlineCount} online</Text></TouchableOpacity></View>
    </View>
  );
}
const styles = StyleSheet.create({
  containerTable: { flex: 1, backgroundColor:'#f8fafc' }, header: { paddingTop:54, paddingBottom:16, paddingHorizontal:16, borderBottomWidth:1, borderColor:'#f1f5f9' }, titleTable: { fontSize:20, fontWeight:'900', color:'#0f172a', letterSpacing:-0.6 }, subHeader: { fontSize:12, color:'#64748b', marginTop:4, fontWeight:'600' }, searchTable: { marginHorizontal:16, marginTop:14, backgroundColor:'white', borderRadius:16, flexDirection:'row', alignItems:'center', paddingHorizontal:16, height:52, borderWidth:1, borderColor:'#e2e8f0' }, modernCard: { backgroundColor:'white', borderRadius:20, padding:16, marginBottom:12, marginHorizontal:14, borderWidth:1, borderColor:'#f1f5f9' }, cardTitle: { fontSize:14.5, fontWeight:'800', color:'#0f172a' }, cardSub: { fontSize:11.5, color:'#64748b', marginTop:3, fontWeight:'500' }, statusDot: { width:10, height:10, borderRadius:5 }, badgeModern: { paddingHorizontal:12, paddingVertical:6, borderRadius:20 }, badgeText: { fontSize:11, fontWeight:'900' }, occupancyBarBg: { height:6, backgroundColor:'#f1f5f9', borderRadius:6, marginTop:12, overflow:'hidden' }, occupancyBarFill: { height:6, borderRadius:6 }, metaText: { fontSize:11, color:'#94a3b8', fontWeight:'600' }, walkText: { fontSize:11, color:'#0f172a', fontWeight:'700' }, queueChip: { marginTop:10, backgroundColor:'#fef9c3', paddingHorizontal:10, paddingVertical:6, borderRadius:10, alignSelf:'flex-start', borderWidth:1, borderColor:'#fde68a' }, queueText: { fontSize:11, fontWeight:'800', color:'#854d0e' }, bottomSheet: { backgroundColor:'white', borderTopLeftRadius:28, borderTopRightRadius:28, padding:20, paddingBottom:28 }, handle: { width:36, height:5, backgroundColor:'#e2e8f0', borderRadius:3, alignSelf:'center', marginBottom:14 }, actionRow: { flexDirection:'row', gap:10, marginTop:12 }, actionPill: { flex:1, paddingVertical:15, borderRadius:14, alignItems:'center' }, actionText: { color:'white', fontWeight:'800', fontSize:13 }, reportBox: { marginTop:14, backgroundColor:'#f8fafc', padding:14, borderRadius:16, borderWidth:1, borderColor:'#e2e8f0' }, closeBtn: { padding:14, marginTop:12, backgroundColor:'#f1f5f9', borderRadius:14 }, bottomBar: { position:'absolute', bottom:14, left:14, right:14, backgroundColor:'#0f172a', padding:12, borderRadius:14 }, containerAuth: { flex:1, paddingTop:80, paddingHorizontal:20 }, titleAuth: { fontSize:32, fontWeight:'900', color:'white', textAlign:'center', letterSpacing:-1 }, subAuth: { color:'#94a3b8', textAlign:'center', marginTop:6, fontWeight:'600' }, authCard: { backgroundColor:'white', borderRadius:24, padding:20, marginTop:30 }, inputModern: { backgroundColor:'#f8fafc', padding:15, borderRadius:14, borderWidth:1, borderColor:'#e2e8f0', fontSize:14, marginTop:8, color:'#0f172a' }, primaryBtn: { backgroundColor:'#0f172a', padding:15, borderRadius:14, marginTop:14 }, primaryBtnText: { color:'white', textAlign:'center', fontWeight:'800' }, secondaryBtn: { backgroundColor:'#f1f5f9', padding:15, borderRadius:14, marginTop:10 }, secondaryBtnText: { color:'#0f172a', textAlign:'center', fontWeight:'700' }, impactPop: { position:'absolute', top:120, alignSelf:'center', left:20, right:20, backgroundColor:'#0f172a', padding:16, borderRadius:16, zIndex:99 }
});