import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { collection, doc, runTransaction, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';

export default function BookingScreen({ navigation }) {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'spaces'), (snap) => {
      setSpaces(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const joinQueue = async (spaceId) => {
    await addDoc(collection(db, 'queues'), {
      spaceId,
      userId: auth.currentUser.uid,
      status: 'waiting',
      createdAt: serverTimestamp()
    });
    navigation.navigate('QueueScreen', { spaceId });
  };

  const bookSeat = async (space) => {
    const spaceRef = doc(db, 'spaces', space.id);
    const bookingRef = doc(collection(db, 'bookings'));

    try {
      await runTransaction(db, async (transaction) => {
        const spaceDoc = await transaction.get(spaceRef);
        if (!spaceDoc.exists()) throw "Space not found";
        
        const data = spaceDoc.data();
        if (data.availableSeats <= 0) {
          throw "FULL";
        }
        
        transaction.update(spaceRef, { availableSeats: data.availableSeats - 1 });
        transaction.set(bookingRef, {
          spaceId: space.id,
          userId: auth.currentUser.uid,
          status: 'booked',
          createdAt: serverTimestamp()
        });
      });
      Alert.alert("Booked! 🎉", `Seat booked at ${space.name}`);
    } catch (e) {
      if (e === "FULL") {
        Alert.alert("Space Full", "Joining queue...", [
          { text: "OK", onPress: () => joinQueue(space.id) }
        ]);
      } else {
        Alert.alert("Error", e.toString());
      }
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 100 }} />;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 16 }}>Study Spaces</Text>
      <FlatList
        data={spaces}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 }}>
            <View>
              <Text style={{ fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
              <Text style={{ color: item.availableSeats > 0 ? 'green' : 'red', marginTop: 4 }}>
                {item.availableSeats > 0 ? `${item.availableSeats} seats left` : 'Full - Join Queue'}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => bookSeat(item)} 
              style={{ backgroundColor: item.availableSeats > 0 ? '#111' : '#F97316', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 20 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{item.availableSeats > 0 ? 'Book' : 'Queue'}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}