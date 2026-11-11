import React from 'react';
import { View, Text } from 'react-native';

export default function QueueCard({ position }) {
  const getDisplay = (pos) => {
    if (!pos || pos < 1) return { title: "You're in queue", sub: "We'll notify you when ready" };
    if (pos === 1) return { title: "You're next! 🎉", sub: "Stay close, seat freeing up" };
    if (pos === 2) return { title: "Almost there!", sub: "1 person ahead of you" };
    if (pos === 3) return { title: "You're close!", sub: "2 people ahead" };
    if (pos <= 5) return { title: "Hang tight", sub: `About ${pos * 5} mins` };
    return { title: "You're in line", sub: `About ${pos * 4} mins estimated` };
  };

  const q = getDisplay(position);

  return (
    <View style={{ backgroundColor: '#FFF7ED', padding: 16, borderRadius: 16, alignItems: 'center', marginVertical: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>{q.title}</Text>
      <Text style={{ fontSize: 14, color: '#666', marginTop: 4 }}>{q.sub}</Text>
      <View style={{ flexDirection: 'row', marginTop: 12, gap: 6 }}>
        {[...Array(Math.min(position || 1, 5))].map((_, i) => (
          <View key={i} style={{ width: i===0?20:8, height: 8, borderRadius: 4, backgroundColor: i===0 ? '#F97316' : '#FFE4CC' }} />
        ))}
      </View>
    </View>
  );
}