import { db } from '../../firebaseConfig';
import { collection, query, where, getDocs, doc, setDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

export const submitVerifiedReport = async (libraryId, libraryName, availableSeats, userId, distance) => {
  const isWithin200m = distance <= 200;
  await addDoc(collection(db, "reports"), {
    libraryId, libraryName,
    availableSeats: Number(availableSeats),
    userId,
    distance: Math.round(distance),
    verified: false,
    createdAt: serverTimestamp(),
    isAnonymous: true
  });
  const tenMinsAgo = Timestamp.fromMillis(Date.now() - 10*60*1000);
  const q = query(collection(db, "reports"), where('libraryId','==',libraryId), where('createdAt','>=',tenMinsAgo));
  const snap = await getDocs(q);
  const sameSeatReports = snap.docs.filter(d => Math.abs(d.data().availableSeats - Number(availableSeats)) < 15);
  const uniqueUsers = new Set(sameSeatReports.map(d=>d.data().userId));
  if(uniqueUsers.size >= 3 && isWithin200m){
    await setDoc(doc(db, "libraries", libraryId), { availableSeats: Number(availableSeats), lastVerified: serverTimestamp(), verifiedBy: uniqueUsers.size }, {merge:true});
    return { verified: true, msg: `✅ VERIFIED by ${uniqueUsers.size} students - ${Math.round(distance)}m away` };
  }
  return { verified: false, msg: `UNVERIFIED: ${uniqueUsers.size}/3 needed. You are ${Math.round(distance)}m away` };
}