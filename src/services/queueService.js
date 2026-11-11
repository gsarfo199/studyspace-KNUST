 // src/services/queueService.js - FIXED + Triple Verification ready
import { db, auth } from "../../firebaseConfig";
import {
  addDoc, collection, doc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp, getDoc,
  query, where, getDocs, orderBy, limit
} from "firebase/firestore";
// REMOVED: import { claimSeat } - you were not using it and file doesn't exist

// 1. STUDENT AT KOTEI JOINS QUEUE - No running yet
export const joinQueue = async (libraryId, userLat, userLng) => {
  const user = auth.currentUser;
  if (!user) throw new Error("Login first");

  const q = query(
    collection(db, "liveRequests"),
    where("userId", "==", user.uid),
    where("libraryId", "==", libraryId),
    where("status", "==", "WAITING")
  );
  const existing = await getDocs(q);
  if (!existing.empty) throw new Error("You are already in queue for this library");

  const ref = await addDoc(collection(db, "liveRequests"), {
    userId: user.uid,
    libraryId: libraryId,
    status: "WAITING", // WAITING, NOTIFIED, CLAIMED, EXPIRED
    userLocation: { lat: userLat, lng: userLng },
    createdAt: serverTimestamp(),
    notifiedAt: null,
    expiresAt: null
  });

  const allWaiting = await getDocs(query(
    collection(db, "liveRequests"),
    where("libraryId", "==", libraryId),
    where("status", "==", "WAITING"),
    orderBy("createdAt", "asc")
  ));
  const position = allWaiting.docs.findIndex(d => d.id === ref.id) + 1;
  return { queueId: ref.id, position };
};

// 2. STUDENT LEAVES QUEUE (cancel)
export const leaveQueue = async (queueId) => {
  await deleteDoc(doc(db, "liveRequests", queueId));
};

// 3. NEW: REPORT CROWD STATUS - Triple Verification
// Call this from ReportScreen.js
export const reportCrowdStatus = async (libraryId, status) => {
  const user = auth.currentUser;
  if (!user) throw new Error("Login first");
  // status = 'empty' | 'half' | 'full'

  await addDoc(collection(db, "reports"), {
    libraryId,
    status,
    userId: user.uid,
    deviceId: user.uid, // use uid as deviceId for now, prevents 1 user faking 3 reports
    createdAt: serverTimestamp(),
  });

  // The verification itself happens in functions/index.js
  // This just saves the report. We don't trust client to decide.
  return true;
};

// 4. STAMPEDE KILLER - Called when someone reports leaving
export const assignToNextInQueue = async (assignmentId, libraryId) => {
  const q = query(
    collection(db, "liveRequests"),
    where("libraryId", "==", libraryId),
    where("status", "==", "WAITING"),
    orderBy("createdAt", "asc"),
    limit(1)
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    console.log("No one in queue, seat stays AVAILABLE");
    return null;
  }

  const nextRequest = snap.docs[0];
  const nextUserId = nextRequest.data().userId;

  const claimWindowExpires = new Date();
  claimWindowExpires.setMinutes(claimWindowExpires.getMinutes() + 2);

  await updateDoc(doc(db, "liveRequests", nextRequest.id), {
    status: "NOTIFIED",
    assignmentId: assignmentId,
    notifiedAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(claimWindowExpires)
  });

  await sendPushToUser(nextUserId, {
    title: "Your turn! Seat opening soon",
    body: "A seat will be free in 15 mins. You have 2 mins to CLAIM it. It will be held 25 mins for your walk from Kotei.",
    data: { assignmentId, libraryId }
  });

  console.log(`Notified ONLY user ${nextUserId}, not 30 people. No stampede.`);
  return nextUserId;
};

// 5. AUTO-EXPIRE NOTIFIED BUT NOT CLAIMED
export const expireNotifiedQueue = async () => {
  const q = query(
    collection(db, "liveRequests"),
    where("status", "==", "NOTIFIED"),
    where("expiresAt", "<", Timestamp.now())
  );
  const snaps = await getDocs(q);

  for (const d of snaps.docs) {
    const data = d.data();
    await updateDoc(doc(db, "liveRequests", d.id), { status: "EXPIRED" });
    console.log(`User ${data.userId} didn't claim in 2 mins, passing to next`);
    await assignToNextInQueue(data.assignmentId, data.libraryId);
  }
};

// Mock push - replace with Expo push later
async function sendPushToUser(userId, message) {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) {
    console.log("No user doc for", userId);
    return;
  }
  const pushToken = userDoc.data()?.expoPushToken;
  if (!pushToken) {
    console.log("No push token for", userId);
    return;
  }

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: pushToken,
      sound: 'default',
      priority: 'high',
      ...message
    })
  });
}