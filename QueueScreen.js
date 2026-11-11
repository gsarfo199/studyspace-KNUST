import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import QueueCard from '../components/QueueCard';

export default function QueueScreen({ route }) {
  const { spaceId } = route.params;
  const [position, setPosition] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, 'queues'),
      where('spaceId', '==', spaceId),
      where('status', '==', 'waiting'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const myIndex = list.findIndex(item => item.userId === auth.currentUser.uid);
      if (myIndex !== -1) setPosition(myIndex + 1);
    });
    return unsub;
  }, []);

  if (!position) return <ActivityIndicator style={{ marginTop: 100 }} />;

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
      <QueueCard position={position} />
      <Text style={{ textAlign: 'center', marginTop: 20, color: '#999' }}>
        We will send you a push notification when seat is ready. You can close app.
      </Text>
    </View>
  );
}