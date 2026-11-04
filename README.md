# Ideahub HQ: virtual office (test deploy)

A 3D office where your team signs in with Google, walks around (WASD), asks to join a room,
and a host lets them in. Each room opens a Google Meet link.

Files:
- `index.html`: the whole app (static, no build step)
- `firebase-config.js`: your Firebase settings (step 2)
- `database.rules.json`: who can read and write what (step 2)

Until `firebase-config.js` is filled in, the page runs in preview mode with sample people.

---

## 1. Make a test Google Meet link (2 minutes)

1. Go to https://meet.google.com and sign in with your Google account.
2. Click **New meeting** → **Create a meeting for later**.
3. Copy the link (looks like `https://meet.google.com/abc-defg-hij`).

Make one link per room you want to test (one is enough to start).
Free personal accounts have a time limit on group calls; Google Workspace accounts allow longer meetings.

## 2. Set up Firebase (free tier is plenty for testing)

1. Go to https://console.firebase.google.com → **Add project** (Google Analytics not needed).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
3. **Build → Realtime Database → Create database.** Pick a location close to your team
   (for Manila, **Singapore / asia-southeast1**). Start in **locked mode**.
4. In Realtime Database open the **Rules** tab, replace everything with the contents of
   `database.rules.json`, and click **Publish**.
5. In Realtime Database open the **Data** tab and add who may enter. Emails are written in
   lowercase with every `.` changed to `,` (Firebase keys can't contain dots):

   ```
   allowed
     wyline@marketingmediacloud,com : true
     teammate@example,com           : true
   admins
     wyline@marketingmediacloud,com : true
   ```

   - `allowed`: everyone who can sign in to the office.
   - `admins`: hosts. They see the Meet links, let people in, and can go into any room.

   Tip: hover the root of the Data tab, click **+**, name it `allowed`, then add children
   with value `true` (boolean, not the text "true").
6. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app (no hosting needed).
   Copy the `firebaseConfig` values into `firebase-config.js`. Also copy `databaseURL`
   from the Realtime Database page if it isn't in the snippet.

## 3. Deploy to Vercel

**Option A: Vercel CLI**
```bash
npm i -g vercel
cd ideahub-office
vercel          # first deploy (answer the prompts; framework: "Other", no build command)
vercel --prod   # production URL
```

**Option B: GitHub**
Push this folder to a GitHub repo → https://vercel.com/new → Import → Framework preset **Other** → Deploy.

Then in Firebase: **Authentication → Settings → Authorized domains → Add domain** and add your
Vercel domain (for example `ideahub-office.vercel.app`). Without this, Google sign-in is blocked.

To try it on your own computer first: `npx serve .` in this folder and open http://localhost:3000
(`localhost` is already an authorized domain).

## 4. First run

1. Open the site and **Sign in with Google** with an admin email.
2. Select a room → paste its Meet link in **Meet link · hosts only** → **Save**.
3. Your teammate (in `allowed`, not `admins`) signs in, walks to that room's door and presses **E**
   (or clicks **Ask to join**).
4. You see them waiting → **Let in**. Their door opens and **Join meeting** opens the Meet link.

## How it works

- Sign-in: Firebase Authentication with Google. Only verified emails listed under `allowed` get in.
- Live data: Firebase Realtime Database. Requests, approvals and who's in each room update instantly.
- Walking: your position is shared about 8 times a second while you walk; it disappears when you close the tab.
- Meet links are readable only by admins. A member gets the link for a room only when an admin lets them in.
  The database rules also stop anyone from marking themselves "in" a room they weren't let into.
- Google Meet's own settings still apply. If a meeting's "Quick access" is off, people are asked to join again inside Meet.

## Room IDs

The code names rooms internally; keep these if you edit the rules:
`creative` = Room 1, `viktor` = Room 2, `room3` = Room 3, `lobby` = Conference Room.
