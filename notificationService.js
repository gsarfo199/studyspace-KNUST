 import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

export async function setupNotifications() {
  try {
    if(Platform.OS === 'web') return null;
    const { status } = await Notifications.requestPermissionsAsync();
    if(status!== 'granted') return null;
    if(Platform.OS === 'android'){
      await Notifications.setNotificationChannelAsync('leaving', {
        name: 'Seat Leaving', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0,250,250,250],
      });
    }
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch(e){ return null; }
}

export async function showLocalYourTurn(libraryName, block, row) {
  try {
    const hour = new Date().getHours();
    if(hour >= 22 || hour < 6) return; // quiet 10pm-6am #55
    await Notifications.scheduleNotificationAsync({
      content: { title: "YOUR TURN! " + libraryName, body: "Block "+block+" Row "+row+" - Go now! 25m hold #60", sound: true },
      trigger: null,
    });
  } catch(e){}
}