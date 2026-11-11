 import 'react-native-url-polyfill/auto';
import React, { useState, useEffect, createContext, useContext } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';

// Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

// ---------- FIREBASE CONFIG - REPLACE WITH YOURS ----------
const firebaseConfig = {
   // For Firebase JS SDK v7.20.0 and later, measurementId is optional

  apiKey: "AIzaSyB5BEVdErkR4V7C3aHx9ksvp6l8NdXK8vU",
  authDomain: "studyspace-knust-2026.firebaseapp.com",
  projectId: "studyspace-knust-2026",
  storageBucket: "studyspace-knust-2026.firebasestorage.app",
  messagingSenderId: "258717862501",
  appId: "1:258717862501:web:578e75a6b8c5366032148c",
  measurementId: "G-1CZBL0553N"

};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// ----------------------------------------------------------

const AuthContext = createContext();

const KNUST_LIBRARIES = [
  { id: '1', name: 'Main Library (Prempeh II)', lat: 6.6708, lng: -1.5644, capacity: 500 },
  { id: '2', name: 'College of Science Library', lat: 6.6745, lng: -1.5700, capacity: 200 },
  { id: '3', name: 'College of Engineering Library', lat: 6.6720, lng: -1.5670, capacity: 180 },
  { id: '4', name: 'College of Humanities Library', lat: 6.6690, lng: -1.5620, capacity: 150 },
];

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    signInAnonymously(auth).catch(console.log);
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    return unsub;
  }, []);
  return <AuthContext.Provider value={{ user }}>{!loading && children}</AuthContext.Provider>;
}

function HomeScreen({ navigation }) {
  const [reports, setReports] = useState([]);
  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => console.log("Firestore not configured yet"));
    return unsub;
  }, []);

  const getLatestForLibrary = (libId) => reports.find(r => r.libraryId === libId);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>StudySpace KNUST</Text>
      <Text style={styles.subtitle}>Real-time occupancy • Verified within 200m</Text>
      <FlatList
        data={KNUST_LIBRARIES}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const latest = getLatestForLibrary(item.id);
          return (
            <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Detail', { library: item })}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text>Capacity: {item.capacity}</Text>
              <Text style={{ color: latest ? '#0a7' : '#999', fontWeight: 'bold', marginTop: 6 }}>
                {latest ? `${latest.occupancy}% full • ${latest.status} • ${latest.verified ? '✓ Verified' : 'Unverified'}` : 'No recent report'}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
      <StatusBar style="auto" />
    </View>
  );
}

function LibraryDetailScreen({ route, navigation }) {
  const { library } = route.params;
  const { user } = useContext(AuthContext);
  const [occupancy, setOccupancy] = useState('50');
  const [locLoading, setLocLoading] = useState(false);

  const submitReport = async () => {
    setLocLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Location needed for verification'); setLocLoading(false); return; }
      let location = await Location.getCurrentPositionAsync({});
      const distance = getDistance(location.coords.latitude, location.coords.longitude, library.lat, library.lng);
      const isVerified = distance <= 200;

      await addDoc(collection(db, 'reports'), {
        libraryId: library.id,
        libraryName: library.name,
        occupancy: parseInt(occupancy),
        status: parseInt(occupancy) > 80 ? 'Full' : parseInt(occupancy) > 50 ? 'Busy' : 'Available',
        verified: isVerified,
        distance: Math.round(distance),
        userId: user?.uid,
        createdAt: serverTimestamp()
      });
      Alert.alert(isVerified ? 'Verified Report Submitted!' : 'Report Submitted (Unverified)', `You are ${Math.round(distance)}m away. Verified only within 200m.`);
      navigation.goBack();
    } catch (e) { Alert.alert('Error', e.message); }
    setLocLoading(false);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{library.name}</Text>
      <Text style={styles.subtitle}>Your location must be within 200m to verify. We do NOT track you inside.</Text>
      
      <View style={styles.card}>
        <Text>Occupancy % (0-100):</Text>
        <TextInput style={styles.input} value={occupancy} onChangeText={setOccupancy} keyboardType="numeric" placeholder="e.g. 70" />
        <TouchableOpacity style={styles.button} onPress={submitReport} disabled={locLoading}>
          {locLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit Occupancy Report</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180; const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180; const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'StudySpace KNUST' }} />
          <Stack.Screen name="Detail" component={LibraryDetailScreen} options={{ title: 'Report Occupancy' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', marginTop: 20 },
  subtitle: { color: '#666', marginBottom: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, elevation: 2 },
  cardTitle: { fontWeight: 'bold', fontSize: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginTop: 8 },
  button: { backgroundColor: '#0a2a66', padding: 14, borderRadius: 10, marginTop: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold' }
});