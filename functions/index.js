 const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { Expo } = require("expo-server-sdk");

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

// === KEEP YOUR EXISTING PAYSTACK VERIFICATION ===
exports.verifyPaystack = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login");
  const ref = data.reference;
  const res = await axios.get(`https://api.paystack.co/transaction/verify/${ref}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` }
  });
  if (res.data.data.status === "success" && res.data.data.amount >= 100) {
    await admin.firestore().collection("users").doc(context.auth.uid).update({ isPremium: true });
    await admin.firestore().collection("payments").doc(ref).set({ status: "verified" }, { merge: true });
    return { ok: true };
  }
  throw new functions.https.HttpsError("failed-precondition", "Payment not verified");
});

// === KEEP YOUR EXISTING BOOKING NOTIFICATION ===
exports.sendBookingNotification = functions.firestore.document("bookings/{bookingId}").onCreate(async (snap, context) => {
  const booking = snap.data();
  const bookingId = context.params.bookingId;
  console.log("New booking:", bookingId, booking);
  try {
    const spaceId = booking.spaceId;
    if (!spaceId) return null;
    const spaceDoc = await db.collection("studySpaces").doc(spaceId).get();
    if (!spaceDoc.exists) return null;
    const spaceData = spaceDoc.data();
    const ownerId = spaceData.ownerId || spaceData.createdBy;
    if (!ownerId) return null;
    const ownerDoc = await db.collection("users").doc(ownerId).get();
    if (!ownerDoc.exists) return null;
    const ownerData = ownerDoc.data();
    const pushToken = ownerData.expoPushToken || ownerData.pushToken;
    if (!pushToken) return null;
    if (!Expo.isExpoPushToken(pushToken)) return null;

    const messages = [{
      to: pushToken,
      sound: 'default',
      priority: 'high',
      channelId: 'bookings',
      title: `📚 New Booking - ${spaceData.name || 'Your Space'}`,
      body: `${booking.userName || 'Someone'} booked ${booking.date || ''} at ${booking.timeSlot || booking.time || ''}`,
      data: { bookingId: bookingId, spaceId: spaceId, type: 'new_booking' },
    }];
    let chunks = expo.chunkPushNotifications(messages);
    for (let chunk of chunks) {
      try { await expo.sendPushNotificationsAsync(chunk); } catch (e) { console.error(e); }
    }
    await db.collection("users").doc(ownerId).collection("notifications").add({
      title: `New Booking - ${spaceData.name || 'Your Space'}`,
      body: `${booking.userName || 'Someone'} booked for ${booking.date || ''}`,
      type: 'new_booking', bookingId, spaceId, read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return null;
  } catch (err) { console.error("sendBookingNotification ERROR:", err); return null; }
});

// === KEEP YOUR EXISTING TRIPLE VERIFICATION ===
exports.verifyCrowdReport = functions.firestore.document("reports/{reportId}").onCreate(async (snap, context) => {
  const report = snap.data();
  const { libraryId, status } = report;
  if (!libraryId || !status) return null;
  const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentSnap = await db.collection("reports")
    .where("libraryId", "==", libraryId)
    .where("status", "==", status)
    .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(tenMinsAgo))
    .get();
  const uniqueUsers = new Set();
  recentSnap.forEach(d => {
    const u = d.data().userId || d.data().deviceId;
    if (u) uniqueUsers.add(u);
  });
  console.log(`Library ${libraryId} status ${status}: ${uniqueUsers.size} unique reporters in 10 mins`);
  if (uniqueUsers.size >= 3) {
    await db.collection("libraries").doc(libraryId).set({
      confirmedStatus: status,
      lastConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedByCount: uniqueUsers.size,
    }, { merge: true });
    console.log(`CONFIRMED ${libraryId} = ${status}`);
  } else {
    await db.collection("libraries").doc(libraryId).set({
      pendingStatus: status,
      lastReportAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return null;
});

// === MERGED: STAMPEDE KILLER + V16 AUTO-ASSIGN (was 2 handlers, now 1) ===
exports.onSeatLeaving = functions.firestore.document("leavingReports/{leavingId}").onCreate(async (snap, context) => {
  const leaving = snap.data();
  const { libraryId, assignmentId } = leaving;
  if (!libraryId) return null;

  // 1) Try YOUR existing liveRequests queue first
  let nextUserId = null;
  let nextDocRef = null;
  let nextSource = null;

  const liveQ = await db.collection("liveRequests")
    .where("libraryId", "==", libraryId)
    .where("status", "==", "WAITING")
    .orderBy("createdAt", "asc")
    .limit(1)
    .get();

  if (!liveQ.empty) {
    nextDocRef = liveQ.docs[0].ref;
    nextUserId = liveQ.docs[0].data().userId;
    nextSource = "liveRequests";
  } else {
    // 2) Fallback to V16 queue - only ONLINE users, like WhatsApp
    const queueQ = await db.collection("queue")
      .where("libraryId", "==", libraryId)
      .where("status", "==", "WAITING")
      .orderBy("fairScore", "desc")
      .orderBy("createdAt", "asc")
      .limit(5)
      .get();
    for (const d of queueQ.docs) {
      const uDoc = await db.collection("users").doc(d.data().userId).get();
      if (uDoc.exists && uDoc.data().presence === "online") {
        nextDocRef = d.ref;
        nextUserId = d.data().userId;
        nextSource = "queue";
        break;
      }
    }
  }

  if (!nextUserId) {
    console.log("No one in queue, seat stays AVAILABLE");
    await db.collection("libraries").doc(libraryId).set({
      confirmedStatus: "empty",
      lastConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return null;
  }

  const expires = new Date(Date.now() + 2 * 60 * 1000); // 2 mins to claim

  if (nextSource === "liveRequests") {
    await nextDocRef.update({
      status: "NOTIFIED",
      assignmentId: assignmentId || context.params.leavingId,
      notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expires),
    });
  } else {
    // V16 queue: create leavingAssignment so app shows YOUR TURN banner
    await db.collection("leavingAssignments").add({
      libraryId,
      libraryName: leaving.libraryName || libraryId,
      assignedTo: nextUserId,
      assignedFrom: leaving.userId,
      block: leaving.block, row: leaving.row,
      status: "PENDING",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 60 * 1000)),
    });
  }

  // Send push ONLY to this 1 user
  const userDoc = await db.collection("users").doc(nextUserId).get();
  const pushToken = userDoc.data()?.expoPushToken || userDoc.data()?.pushToken;
  if (pushToken && Expo.isExpoPushToken(pushToken)) {
    await expo.sendPushNotificationsAsync([{
      to: pushToken,
      sound: 'default',
      priority: 'high',
      title: "Your turn! Seat opening soon",
      body: "A seat will be free in 15 mins. You have 2 mins to CLAIM it. It will be held 25 mins for your walk from Kotei.",
      data: { libraryId, assignmentId: assignmentId || context.params.leavingId, type: 'queue_turn' }
    }]);
    console.log(`Notified ONLY ${nextUserId} via ${nextSource}`);
  }
  return null;
});

// === NEW V16: AUTO-EXPIRE - Runs every 10 mins even if app is closed ===
exports.autoExpire = functions.pubsub.schedule("every 10 minutes").onRun(async () => {
  const now = Date.now();
  const old = await db.collection("reports").where("createdAt", "<", new Date(now - 60 * 60 * 1000)).limit(200).get();
  for (const d of old.docs) { await d.ref.update({ expired: true }).catch(()=>{}); }
  const assigns = await db.collection("leavingAssignments").where("status","==","PENDING").where("expiresAt","<", new Date(now)).limit(100).get();
  for (const d of assigns.docs) { await d.ref.update({ status: "EXPIRED" }).catch(()=>{}); }
  console.log(`V16 autoExpire: ${old.size} reports, ${assigns.size} assignments`);
  return null;
});

// === NEW V16: SEAT FREE NOTIFY - When library goes FULL -> FREE ===
exports.notifySeatFree = functions.firestore.document("libraries/{libId}").onUpdate(async (change, context) => {
  const before = change.before.data();
  const after = change.after.data();
  if ((before.availableSeats || 0) <= 0 && (after.availableSeats || 0) > 0) {
    // Notify watchlist users (V16 queue system)
    const watchers = await db.collection("watchlist").where("libraryId","==",context.params.libId).limit(100).get();
    const messages = [];
    for (const w of watchers.docs) {
      const uDoc = await db.collection("users").doc(w.data().userId).get();
      const token = uDoc.data()?.expoPushToken || uDoc.data()?.pushToken;
      if (token && Expo.isExpoPushToken(token)) {
        messages.push({
          to: token, sound: 'default', priority: 'high',
          title: `🟢 ${after.name} has ${after.availableSeats} FREE seats!`,
          body: `Go now - ${after.freeBlock ? `Block ${after.freeBlock} Row ${after.freeRow || ''}` : 'Tap to open'}`,
          data: { libraryId: context.params.libId, type: 'seat_free' }
        });
      }
      await db.collection("notifications").add({
        userId: w.data().userId,
        libraryId: context.params.libId,
        libraryName: after.name,
        message: `${after.name} has ${after.availableSeats} FREE seats! Go now!`,
        type: "SEAT_FREE", read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (messages.length > 0) {
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) { try { await expo.sendPushNotificationsAsync(chunk); } catch(e){ console.error(e); } }
    }
    console.log(`Seat free in ${after.name}: notified ${watchers.size} watchers, ${messages.length} pushes`);
  }
  return null;
});