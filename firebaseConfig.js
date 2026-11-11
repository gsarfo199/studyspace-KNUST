 // firebaseConfig.js - FINAL - with your real API key
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth, initializeAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyB5BEVdErkR4V7C3aHx9ksvp6l8NdXK8vU",
  authDomain: "studyspace-knust-2026.firebaseapp.com",
  projectId: "studyspace-knust-2026",
  storageBucket: "studyspace-knust-2026.firebasestorage.app",
  messagingSenderId: "258717862501",
  appId: "1:258717862501:web:578e75a6b8c5366032148c",
  measurementId: "G-1CZBL0553N"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    const { getReactNativePersistence } = require("firebase/auth");
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    auth = getAuth(app);
  }
}

export { auth };
export const storage = getStorage(app);
export default app;