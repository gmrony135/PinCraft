// Keep the owner filter in every query, including the bounded missing-index path.
export async function readOwnedPinJobs(collection, uid) {
  try { return await collection.where('ownerUID', '==', uid).orderBy('createdAt', 'desc').limit(100).get(); }
  catch (error) {
    const missingIndex = [9, '9', 'failed-precondition'].includes(error?.code) && /index/i.test(error?.message || '');
    if (!missingIndex) throw error;
    // A single-field equality query does not need the composite ordering index.
    // Read one extra record so a partial page is never claimed to be the newest.
    const snapshot = await collection.where('ownerUID', '==', uid).limit(101).get();
    if (snapshot.docs.length > 100) throw error;
    const timestamp = doc => { const v = doc.data()?.createdAt; return typeof v?.toMillis === 'function' ? v.toMillis() : new Date(v || 0).getTime() || 0; };
    return { docs: [...snapshot.docs].sort((a,b) => timestamp(b)-timestamp(a)) };
  }
}
