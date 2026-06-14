# InfecSure — Frontend Performance & Firestore Quota Guidelines

> **Context**: Firestore free tier allows **50,000 reads/day**.  
> Every unguarded `useEffect` that re-fetches on every render, every
> `onSnapshot` listener that isn't needed, and every full-collection read
> without a `where` filter burns quota that cannot be recovered until midnight.

---

## C1. Fix Fetch Loops — `useEffect` Dependency Arrays

Every `useEffect` that calls Firestore **must** have a dependency array.
Missing the array causes the effect to re-run on every render — which can
exhaust the 50k/day read quota within hours.

```jsx
// ❌ WRONG — runs on every render
useEffect(() => {
  fetchWards();
});

// ✅ CORRECT — runs once on mount
useEffect(() => {
  fetchWards();
}, []);

// ✅ CORRECT — runs only when wardId changes
useEffect(() => {
  fetchLabResults(wardId);
}, [wardId]);
```

**Checklist before every PR**:
- `grep -rn "useEffect(" src/` — manually verify each one has a `[]` or `[dep]` array.

---

## C2. Cut Firestore Read Volume

### Replace full-collection fetches with filtered queries

```js
// ❌ WRONG — reads every alert document
const snap = await getDocs(collection(db, "alerts"));

// ✅ CORRECT — server-side filter, only reads what you need
const q = query(
  collection(db, "alerts"),
  where("status", "==", "pending"),
  where("ward_id", "==", currentWardId),
  limit(20)
);
const snap = await getDocs(q);
```

### Replace `onSnapshot` with one-time reads unless live updates are essential

`onSnapshot` keeps an open connection and counts a read **every time a
document changes**, not just when you open the page.

```js
// ❌ AVOID unless the view genuinely needs live updates (e.g. alert badge)
onSnapshot(collection(db, "alerts"), (snap) => { ... });

// ✅ PREFER for most views — reads once and stops
const snap = await getDocs(q);
```

Genuine use cases for `onSnapshot`: a real-time alert counter in the nav
bar, or a live heatmap that must update within seconds of a new lab result.
Everything else should use `getDocs` / `getDoc`.

### Paginate large lists — don't fetch the whole collection

```js
// First page
const first = query(collection(db, "lab_results"), orderBy("created_at", "desc"), limit(25));
const snap = await getDocs(first);

// Next page (cursor-based — safe for large collections)
const lastDoc = snap.docs[snap.docs.length - 1];
const next = query(
  collection(db, "lab_results"),
  orderBy("created_at", "desc"),
  startAfter(lastDoc),
  limit(25)
);
```

---

## C3. Firestore Security Rules

The Firebase `apiKey`, `projectId`, and other `firebaseConfig` values in
your frontend JavaScript are **safe to expose** — they identify the project
but do not grant access.  
However, **Firestore Security Rules** determine what an unauthenticated or
authenticated user can actually read or write.

**Check your `firestore.rules` in the Firebase Console now:**

```
// ❌ DANGEROUS — anyone on the internet can read/write your database
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

```
// ✅ RECOMMENDED minimum — only authenticated users
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own user doc
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // All other collections — require auth, and ideally role checks
    match /{collection}/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
                      in ["icno", "sister", "lab", "doctor"];
    }
  }
}
```

Apply rules in: **Firebase Console → Firestore Database → Rules → Publish**.

---

## C4. Pre-computed Analytics (Apriori / Association Mining)

Association mining (`apriori`, `find_root_cause_associations`) is a
computationally heavy, slow operation.  
**Do not trigger it on page load or on every request.**

### Recommended architecture

1. The backend exposes a `/reports/associations` endpoint (ICNO-only) that
   runs the mining and writes results to a Firestore `analytics_summary`
   collection with a TTL-style `computed_at` timestamp.
2. The frontend reads **only** the `analytics_summary` document (1 read).
3. A scheduled Cloud Function (or a cron job via Render's cron service)
   re-runs the mining once per day/week and updates `analytics_summary`.

```js
// ✅ Frontend — read pre-computed summary only
const summaryDoc = await getDoc(doc(db, "analytics_summary", "associations"));
const rules = summaryDoc.data()?.rules ?? [];
```

```
// Firestore security rule for analytics_summary
match /analytics_summary/{docId} {
  allow read: if request.auth != null;
  allow write: if false;  // Only writable by backend service account
}
```

This pattern cuts association-mining Firestore reads from O(wards × audits × lab_results)
per page load down to **1 read per user visit**.
