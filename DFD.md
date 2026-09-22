# Data Flow Diagrams (DFD) - SkinLens

---

## 1. Skin Image Classification/Detection

### Context Diagram (Level 0)

```
+-------------------+                    +-------------------+
|                   |   image (photo)    |                   |
|                   | -----------------> |                   |
|                   |   detection result |                   |
|                   | <----------------- |                   |
|                   |   survey answers   |                   |
|   USER            | -----------------> |   SKINLENS APP    |
|                   |   health score +   |                   |
|                   | <----------------- |   (TFLite AI)     |
|                   |   recommendations  |                   |
+-------------------+                    +-------------------+
                                               |
                                               | (background)
                                               v
                                        +-------------------+
                                        |   Cloudinary      |
                                        |   (image upload)  |
                                        +-------------------+
```

### Level 1 DFD

```
                         +--------------------------+
                         |         USER             |
                         +-----------+--------------+
                                     |
                          image (capture/select)
                                     |
                                     v
              +------------------------------------------+
              |  1.0 CAPTURE IMAGE                       |
              |  - Camera (face detection bounding box)  |
              |  - Gallery (expo-image-picker)           |
              |  Output: imageUri (file://)              |
              +--------------------+---------------------+
                                   |
                              imageUri
                                   |
                                   v
              +------------------------------------------+
              |  1.1 PREPROCESS IMAGE                    |
              |  - Resize to 224x224                     |
              |  - Decode JPEG to raw bytes              |
              |  - Convert to Float32Array (RGB)         |
              |  Output: Float32Array [224x224x3]        |
              +--------------------+---------------------+
                                   |
                              inputBuffer
                                   |
                                   v
              +------------------------------------------+
              |  1.2 RUN TFLite INFERENCE                |
              |  - Load detection_model.tflite (cached)  |
              |  - GPU-accelerated (android-gpu)         |
              |  Output: Float32Array [4] probabilities  |
              +--------------------+---------------------+
                                   |
                         label, confidence, probabilities
                                   |
                                   v
              +------------------------------------------+
              |  1.3 MAP CLASS LABEL                     |
              |  Classes: acne | eczema | normal | psoriasis |
              |  Output: ClassificationResult            |
              +--------------------+---------------------+
                                   |
                          detection label + confidence
                                   |
                                   v
              +------------------------------------------+
              |  1.4 SURVEY (Post-Detection)             |
              |  - 3 condition-specific questions        |
              |  - Duration, severity, coverage          |
              |  Output: severityScore (0-100)           |
              +--------------------+---------------------+
                                   |
                    label, confidence, surveyAnswers, severityScore
                                   |
                                   v
              +------------------------------------------+
              |  1.5 COMPUTE HEALTH SCORE                |
              |  score = detectionBaseline*0.6 +         |
              |          surveyScore*0.4                  |
              |  Output: overallScore (0-100)            |
              +--------------------+---------------------+
                                   |
                                   |
              +--------------------+---------------------+
              |                                          |
              v                                          v
+----------------------------------+    +----------------------------------+
| 1.6 GENERATE ROUTINE (LLM)      |    | 1.7 UPLOAD IMAGE                 |
| - On-device Qwen3-0.6B model    |    | - Cloudinary API                 |
| - User profile + knowledge base  |    | - Returns cloud URL              |
| Output: routineJson (JSON)       |    | Output: cloudinaryUrl            |
+----------------+-----------------+    +----------------+-----------------+
                 |                                     |
                 v                                     v
              +------------------------------------------+
              |  1.8 SAVE RESULTS                        |
              |  - SQLite: insertResult() + insertRoutine() |
              |  - Supabase: upsert (online)             |
              |  - sync_queue: enqueue (if offline)      |
              +--------------------+---------------------+
                                   |
                          saved result + routine
                                   |
                                   v
              +------------------------------------------+
              |  1.9 DISPLAY RESULTS                     |
              |  - Circular health score gauge           |
              |  - Detection explanation                 |
              |  - Recommended products list             |
              +------------------------------------------+
```

### Explanation

| Step | Process | Key Files | Data In | Data Out |
|------|---------|-----------|---------|----------|
| 1.0 | Capture Image | `app/(tabs)/scan.tsx`, `app/(modules)/camera.tsx` | User tap (camera/gallery) | `imageUri` (local file path) |
| 1.1 | Preprocess Image | `utils/skin-prediction.ts:32-77` | `imageUri` | `Float32Array` [150528 values] |
| 1.2 | TFLite Inference | `utils/skin-prediction.ts:84-85` | `ArrayBuffer` (inputBuffer) | `Float32Array` [4] probabilities |
| 1.3 | Map Class Label | `utils/skin-prediction.ts:93-105` | 4 probabilities | `{ label, confidence, probabilities }` |
| 1.4 | Post-Survey | `app/(modules)/survey.tsx` | detection label | `severityScore` |
| 1.5 | Compute Health Score | `app/(modules)/scan-results.tsx:65-66` | detection + survey scores | `overallScore` |
| 1.6 | Generate Routine (LLM) | `utils/routine-generator.ts` | user profile + detection label | `routineJson` |
| 1.7 | Upload Image | `utils/cloudinary.ts` | `imageUri` | `cloudinaryUrl` |
| 1.8 | Save Results | `lib/db/results.ts`, `lib/db/routines.ts` | all data | SQLite + Supabase records |
| 1.9 | Display Results | `app/(modules)/scan-results.tsx` | result data | UI rendering |

---

## 2. Authentication (Offline + Online)

### Context Diagram (Level 0)

```
+-------------------+                    +-------------------+
|                   |   credentials      |                   |
|                   | -----------------> |                   |
|                   |   auth status      |                   |
|                   | <----------------- |                   |
|                   |   session token    |                   |
|   USER            | <----------------- |   SKINLENS APP    |
|                   |                    |                   |
|                   |   (deep-link)      |                   |
|                   | -----------------> |                   |
+-------------------+                    +-------------------+
                                               |
                                               | (online only)
                                               v
                                        +-------------------+
                                        |   Supabase Auth   |
                                        |   (cloud)         |
                                        +-------------------+
                                               |
                                               v
                                        +-------------------+
                                        |   AsyncStorage    |
                                        |   (local cache)   |
                                        +-------------------+
```

### Level 1 DFD

```
                         +--------------------------+
                         |         USER             |
                         +-----------+--------------+
                                     |
                    credentials / tap OAuth button
                                     |
                                     v
              +------------------------------------------+
              |  2.0 ROUTING GATE (app/index.tsx)        |
              |  Check AsyncStorage "is_onboarded"       |
              |  Check SQLite for local profile          |
              |  Check Supabase session                  |
              +--------------------+---------------------+
                                   |
                      route: onboarding / welcome / tabs
                                   |
                                   v
              +------------------------------------------+
              |  2.1 AUTH METHOD SELECTION               |
              |  Screen: welcome.tsx                     |
              |  - Email/Password Login                  |
              |  - Email/Password Register               |
              |  - Google OAuth                          |
              +-----+----------------+------------------+
                    |                |
           +--------+        +------+------+
           |                 |             |
           v                 v             v
+------------------+ +------------------+ +------------------+
| 2.2 EMAIL/PASS   | | 2.3 REGISTER     | | 2.4 GOOGLE OAUTH |
| LOGIN            | |                  | |                  |
| signInWith-      | | signUp()         | | signInWithOAuth  |
| Password()       | | -> upsertProfile | | -> openAuth-     |
| -> Supabase API  | | -> Supabase API  | |   SessionAsync   |
| -> AsyncStorage  | | -> AsyncStorage  | | -> createSession  |
| (persist token)  | | (persist token)  | |   FromUrl         |
+--------+---------+ +--------+---------+ +--------+---------+
         |                     |                    |
         v                     v                    v
              +------------------------------------------+
              |  2.5 SESSION PERSISTENCE                 |
              |  - AsyncStorage: access_token,           |
              |    refresh_token                         |
              |  - autoRefreshToken: true                |
              |  - persistSession: true                  |
              +--------------------+---------------------+
                                   |
                          session + user.id
                                   |
                                   v
              +------------------------------------------+
              |  2.6 PROFILE CHECK (Offline-First)       |
              |  1. SQLite: SELECT user_setup            |
              |  2. If cached -> route to tabs           |
              |  3. If not cached -> Supabase query      |
              |  4. If offline -> still route to tabs    |
              +--------------------+---------------------+
                                   |
                          user_setup status
                                   |
                                   v
              +------------------------------------------+
              |  2.7 PASSWORD RESET FLOW                 |
              |  - sendResetEmail() -> Supabase          |
              |  - Deep-link: /create-new-password       |
              |  - onAuthStateChange("PASSWORD_RECOVERY")|
              |  - updatePassword() -> Supabase          |
              +------------------------------------------+
```

### Explanation

| Step | Process | Key Files | Data In | Data Out |
|------|---------|-----------|---------|----------|
| 2.0 | Routing Gate | `app/index.tsx` | App launch | route decision |
| 2.1 | Auth Selection | `app/welcome.tsx` | User choice | selected auth method |
| 2.2 | Email/Pass Login | `components/Login.tsx`, `utils/supabase.ts:22-36` | email, password | Supabase session |
| 2.3 | Register | `components/Register.tsx`, `utils/supabase.ts:55-69` | email, password, name | new user + profile |
| 2.4 | Google OAuth | `utils/supabase.ts:71-117` | Google credentials | Supabase session + profile |
| 2.5 | Session Persistence | `utils/supabase.ts:26-31` | session tokens | AsyncStorage cache |
| 2.6 | Profile Check | `app/index.tsx:33-60` | user.id | route decision |
| 2.7 | Password Reset | `app/forgot-password.tsx`, `utils/supabase.ts:119-130` | email | reset link + new password |

### Offline Auth Behavior

```
App Launch
    |
    v
AsyncStorage("is_onboarded")? ---No---> Onboarding
    |Yes
    v
SQLite user_profile.user_setup? ---1---> Tabs (full access)
    |null (not cached)
    v
Supabase auth.getSession()? ---valid---> Check server for user_setup
    |no session                              |No local cache
    v                                        v
Welcome (login/register)               Tabs (empty state)
    |
    | (first login requires network)
    v
Network available? ---Yes---> Supabase auth -> persist in AsyncStorage
    |No
    v
Show error (offline login not possible
for first time)
```

**Key insight:** After first successful login, the session token is persisted in AsyncStorage. Subsequent app launches read from local storage first. The app works fully offline with cached data.

---

## 3. Sync Management (Offline <-> Online)

### Context Diagram (Level 0)

```
+-------------------+                    +-------------------+
|                   |   write operations |                   |
|                   | -----------------> |                   |
|                   |   synced status    |                   |
|                   | <----------------- |                   |
|   USER            |                    |   SKINLENS APP    |
|                   |                    |                   |
+-------------------+                    +---------+---------+
                                                 |
                                      sync_queue + processSyncQueue()
                                                 |
                                                 v
                                        +-------------------+
                                        |   Supabase DB     |
                                        |   (PostgreSQL)    |
                                        +-------------------+
```

### Level 1 DFD

```
                         +--------------------------+
                         |         USER             |
                         +-----------+--------------+
                                     |
              profile update / scan result / toggle step
                                     |
                                     v
              +------------------------------------------+
              |  3.0 WRITE TO LOCAL SQLite               |
              |  - Insert/update data immediately        |
              |  - User sees instant feedback            |
              |  Tables: user_profile, skin_profile,     |
              |  lifestyle_profile, results, routines,   |
              |  routine_progress, notifications         |
              +--------------------+---------------------+
                                   |
                          local record saved
                                   |
                                   v
              +------------------------------------------+
              |  3.1 ENQUEUE SYNC ENTRY                  |
              |  INSERT INTO sync_queue:                 |
              |  - table_name, operation, record_id      |
              |  - payload (JSON), created_at            |
              |  Operations: upsert | insert | delete    |
              +--------------------+---------------------+
                                   |
                          sync_queue entry
                                   |
              +--------------------+---------------------+
              |                    |                      |
              v                    v                      v
+------------------+ +------------------+ +------------------+
| 3.2 ATTEMPT      | | 3.3 SYNC MANAGER | | 3.4 READ-THROUGH |
| IMMEDIATE SYNC   | | (component)      | | CACHE            |
| (fire-and-forget)| | - On mount       | | - Read SQLite    |
|                  | | - On online      | | - Return fast    |
| Online: try      | |   transition     | | - Background     |
| Supabase write   | | - Calls process- | |   refresh from   |
| swallow errors   | |   SyncQueue()    | |   Supabase       |
+------------------+ +--------+---------+ +------------------+
                                |
                                v
              +------------------------------------------+
              |  3.5 PROCESS SYNC QUEUE                  |
              |  processSyncQueue()                      |
              |  - Dequeue all entries (ASC by id)       |
              |  - For each entry:                       |
              |    1. Resolve table-specific operation   |
              |    2. Upload image if results table      |
              |    3. Execute Supabase upsert/delete     |
              |    4. Remove entry on success            |
              |    5. Log error, continue on failure     |
              |  - Update synced_at timestamp            |
              +--------------------+---------------------+
                                   |
                    Supabase write results
                                   |
                                   v
              +------------------------------------------+
              |  3.6 TABLE ROUTER                        |
              |                                           |
              |  user_profile -----> upsert by id        |
              |  skin_profile -----> upsert by id        |
              |  lifestyle_profile -> upsert by id       |
              |  results ---------> upload image to      |
              |                     Cloudinary, then    |
              |                     upsert (strip local |
              |                     fields)             |
              |  routines ---------> upsert by id       |
              |  routine_progress -> upsert composite   |
              |                     PK or delete        |
              |  notifications ----> upsert/delete/     |
              |                     update by id        |
              +------------------------------------------+
                                   |
                                   v
              +------------------------------------------+
              |  3.7 UPDATE SYNCED_AT                    |
              |  UPDATE [table] SET synced_at = ?        |
              |  For all tables that had entries synced  |
              +------------------------------------------+
                                   |
                                   v
              +------------------------------------------+
              |  3.8 CONNECTIVITY MONITOR                |
              |  useNetwork() (NetInfo)                  |
              |  - Tracks isConnected + isInternet-      |
              |    Reachable                             |
              |  - OfflineBanner shown when offline      |
              |  - Triggers sync on reconnection         |
              +------------------------------------------+
```

### Explanation

| Step | Process | Key Files | Data In | Data Out |
|------|---------|-----------|---------|----------|
| 3.0 | Write to SQLite | `lib/db/profile.ts`, `lib/db/results.ts`, `lib/db/routines.ts` | user action data | local record |
| 3.1 | Enqueue Sync | `lib/db/sync-queue.ts:5-23` | table, operation, record_id, payload | sync_queue entry |
| 3.2 | Immediate Sync | `lib/db/results.ts` etc. (each write function) | sync_queue entry | Supabase result (fire-and-forget) |
| 3.3 | SyncManager Component | `components/SyncManager.tsx` | network state change | triggers processSyncQueue() |
| 3.4 | Read-Through Cache | `lib/db/profile.ts`, `lib/db/results.ts` | read request | SQLite data + background Supabase refresh |
| 3.5 | Process Queue | `lib/db/sync.ts:7-182` | sync_queue entries | synced records |
| 3.6 | Table Router | `lib/db/sync.ts:14-167` | entry.table_name + operation | Supabase API call |
| 3.7 | Update synced_at | `lib/db/sync.ts:178-181` | table names | timestamp update |
| 3.8 | Connectivity Monitor | `hooks/useNetwork.tsx` | NetInfo state | online/offline status |

### Sync Queue Schema

```sql
CREATE TABLE sync_queue (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,    -- target Supabase table
  operation  TEXT NOT NULL,    -- 'upsert' | 'insert' | 'delete' | 'update'
  record_id  TEXT,             -- primary key of the record
  payload    TEXT NOT NULL,    -- JSON-serialized record data
  created_at TEXT NOT NULL     -- ISO timestamp
);
```

### Data Flow: Offline Write -> Online Sync

```
User toggles routine step (offline)
    |
    v
[3.0] SQLite: UPDATE routine_progress
    |
    v
[3.1] sync_queue: INSERT { table: "routine_progress", operation: "upsert", payload: {...} }
    |
    v
[3.2] Attempt Supabase upsert -> FAILS (no network) -> entry stays in queue
    |
    v
User sees: step marked complete (local, instant)
    |
    ... time passes, device comes online ...
    |
    v
[3.8] NetInfo detects: isConnected=true, isInternetReachable=true
    |
    v
[3.3] SyncManager: wasOffline was true, now online -> trigger processSyncQueue()
    |
    v
[3.5] Dequeue all entries (sorted by id ASC)
    |
    v
[3.6] For each entry:
    |   routine_progress -> upsert to Supabase with composite PK
    |   -> SUCCESS -> removeSyncEntry(id)
    |
    v
[3.7] UPDATE routine_progress SET synced_at = [now]
    |
    v
Cloud DB now matches local DB
```

---

## Summary Table

| Feature | External Entities | Processes | Data Stores | Key Technologies |
|---------|------------------|-----------|-------------|-----------------|
| **Skin Classification** | User, Cloudinary | 9 (capture -> preprocess -> inference -> classify -> survey -> score -> generate -> upload -> save) | SQLite, Supabase, Cloudinary | TFLite (GPU), llama.rn, expo-image-manipulator |
| **Authentication** | User, Supabase Auth, Google OAuth | 7 (gate -> selection -> login/register/OAuth -> persistence -> profile check -> password reset) | AsyncStorage, SQLite, Supabase | Supabase Auth, expo-web-browser, deep-links |
| **Sync Management** | User, Supabase DB, Cloudinary | 8 (write -> enqueue -> immediate sync -> SyncManager -> process queue -> table router -> update synced_at -> monitor) | SQLite (sync_queue), Supabase | NetInfo, sync_queue pattern, read-through cache |
