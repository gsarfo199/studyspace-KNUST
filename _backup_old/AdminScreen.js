import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function AdminScreen() {
  const [libs, setLibs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [seats, setSeats] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [hint, setHint] = useState('');
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const ADMIN_CODE = "KNUST2026"; // change this

  useEffect(() => {
    const fetchLibs = async () => {
      const snap = await getDocs(collection(db, "libraries"));
      setLibs(snap.docs.map(d => ({id: d.id, ...d.data()})));
    };
    fetchLibs();
  }, []);

  const unlock = () => {
    if(password === ADMIN_CODE) setUnlocked(true);
    else Alert.alert("Wrong code");
  };

  const save = async () => {
    if(!selected) return;
    try {
      await updateDoc(doc(db, "libraries", selected.id), {
        totalSeats: parseInt(seats),
        photoUrl: photoUrl,
        indoorHint: hint,
      });
      Alert.alert("Saved! Updates live for all students instantly");
      setSelected(null);
    } catch(e){ Alert.alert(e.message) }
  };

  if(!unlocked){
    return (
      <View style={{flex:1, padding:20, justifyContent:'center'}}>
        <Text style={{fontSize:18, fontWeight:'bold', marginBottom:10}}>Admin Login</Text>
        <TextInput placeholder="Enter admin code" secureTextEntry value={password} onChangeText={setPassword} style={{borderWidth:1, padding:12, borderRadius:8, marginBottom:12}} />
        <TouchableOpacity onPress={unlock} style={{backgroundColor:'black', padding:14, borderRadius:8}}><Text style={{color:'white', textAlign:'center'}}>Unlock</Text></TouchableOpacity>
      </View>
    );
  }

  if(selected){
    return (
      <ScrollView style={{flex:1, padding:20}}>
        <Text style={{fontSize:18, fontWeight:'bold'}}>{selected.name}</Text>
        <Text style={{marginTop:15}}>Total Seats (count them now)</Text>
        <TextInput value={seats} onChangeText={setSeats} keyboardType="numeric" placeholder={String(selected.totalSeats || 500)} style={{borderWidth:1, padding:12, borderRadius:8, marginTop:5}} />
        
        <Text style={{marginTop:15}}>Floor Plan Photo URL</Text>
        <TextInput value={photoUrl} onChangeText={setPhotoUrl} placeholder="Paste Firebase Storage URL or leave placeholder" style={{borderWidth:1, padding:12, borderRadius:8, marginTop:5}} />
        <Text style={{fontSize:12, color:'gray'}}>For now leave as placeholder, update later from campus</Text>

        <Text style={{marginTop:15}}>Indoor Hint</Text>
        <TextInput value={hint} onChangeText={setHint} placeholder="e.g. Block A = Left wing 2nd floor" style={{borderWidth:1, padding:12, borderRadius:8, marginTop:5}} />

        <TouchableOpacity onPress={save} style={{backgroundColor:'green', padding:16, borderRadius:8, marginTop:20}}><Text style={{color:'white', textAlign:'center', fontWeight:'bold'}}>SAVE - Goes Live Instantly</Text></TouchableOpacity>
        <TouchableOpacity onPress={()=>setSelected(null)} style={{padding:16, marginTop:10}}><Text style={{textAlign:'center'}}>Back</Text></TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{flex:1, padding:20}}>
      <Text style={{fontSize:18, fontWeight:'bold', marginBottom:15}}>Select Library to Edit on Site</Text>
      {libs.map(l => (
        <TouchableOpacity key={l.id} onPress={()=>{setSelected(l); setSeats(String(l.totalSeats||'')); setPhotoUrl(l.photoUrl||''); setHint(l.indoorHint||'');}} style={{padding:15, borderWidth:1, borderRadius:10, marginBottom:10}}>
          <Text style={{fontWeight:'bold'}}>{l.name}</Text>
          <Text>Seats: {l.totalSeats || 'not set'} | Photo: {l.photoUrl ? 'Yes' : 'Placeholder'}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}