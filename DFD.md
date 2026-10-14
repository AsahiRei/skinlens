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

**Figure 1: Context Diagram of Skin Image Classification/Detection**

Figure 1 shows the high-level context of the Skin Image Classification/Detection process in the SkinLens application. The process begins with the User as the primary external entity, who provides the input image through guided camera capture with single or multi-angle modes or gallery selection, along with post-detection survey answers for the detected condition. In the SkinLens App central process, image enhancement and preprocessing are performed, followed by on-device inference using detection_model.tflite through react-native-fast-tflite to generate a five-class detection result among acne, dry, eczema, normal, and oily with confidence score and face-identity verification. During the scoring and recommendation phase, the detection baseline is combined with the survey-derived severity score in a 60/40 weighted formula to compute an overall skin health score, while a deterministic rule-based generator using the local knowledge base produces a personalized skincare routine with no large language model involved. Concurrently, in the background, the captured image is uploaded to Cloudinary for cloud storage, and all results are persisted locally in SQLite and remotely in Supabase. The User ultimately receives the detection result, health score, top-three predictions, and product recommendations as outputs.

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
               |  - Camera: vision-camera + face-detector |
               |    bounding box, lighting + alignment    |
               |    gate (score >= 50), Single + Multi-   |
               |    Angle (front/left/right)              |
               |  - Gallery (expo-image-picker)           |
               |  Output: imageUri / imageUris (file://)  |
               +--------------------+---------------------+
                                    |
                               imageUri(s)
                                    |
                                    v
               +------------------------------------------+
               |  1.1 ENHANCE IMAGE                       |
               |  - enhanceImage(): resize to 512x512     |
               |  - Gray-world white balance +            |
               |    auto-exposure to mid-gray (127.5)     |
               |  Output: enhancedUri (cache .jpg)        |
               +--------------------+---------------------+
                                    |
                               enhancedUri
                                    |
                                    v
               +------------------------------------------+
               |  1.2 PREPROCESS IMAGE                    |
               |  - Resize to 224x224 via                 |
               |    expo-image-manipulator                |
               |  - Decode JPEG (jpeg-js) to raw bytes    |
               |  - Gray-world gains + exposure gain      |
               |  - Convert to Float32Array RGB           |
               |  Output: Float32Array [1x224x224x3]      |
               |          (150,528 values)                |
               +--------------------+---------------------+
                                    |
                               inputBuffer (ArrayBuffer)
                                    |
                                    v
               +------------------------------------------+
               |  1.3 RUN TFLite INFERENCE                |
               |  - detection_model.tflite via            |
               |    react-native-fast-tflite (cached,     |
               |   Expo Asset resolve)                   |
               |  Output: Float32Array [5] probabilities  |
               +--------------------+---------------------+
                                    |
                         probabilities [5]
                                    |
                                    v
               +------------------------------------------+
               |  1.4 MAP CLASS LABEL                     |
               |  Classes: acne | dry | eczema | normal   |
               |           | oily (5 classes)             |
               |  - argmax -> label + confidence          |
               |  - Multi-angle: average probs across    |
               |    front/left/right                    |
               |  Output: ClassificationResult            |
               +--------------------+---------------------+
                                    |
                          detection label + confidence
                                    |
                                    v
               +------------------------------------------+
               |  1.5 FACE VERIFICATION GATE              |
               |  - MobileFaceNet (112x112 -> 192-d,      |
               |    normalized [-1,1])                   |
               |  - cosineSimilarity >= 0.60 else         |
               |    -> face-mismatch screen               |
               |  - No enrolled embedding -> pass-through |
               +------------------------------------------+
                                    |
                                    v
               +------------------------------------------+
               |  1.6 SURVEY (Post-Detection)             |
               |  - Condition-specific questions from     |
               |    survey-questions.json +               |
               |    detection-meta.json badge             |
               |  - points/maxPoints -> severityScore     |
               |  Output: severityScore (0-100)           |
               +--------------------+---------------------+
                                    |
                    label, confidence, surveyAnswers, severityScore
                                    |
                                    v
               +------------------------------------------+
               |  1.7 COMPUTE HEALTH SCORE                |
               |  Baselines: normal 85, dry 60, oily 55,  |
               |             acne 55, eczema 40           |
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
| 1.8 GENERATE ROUTINE (RULE-BASED)|    | 1.9 UPLOAD IMAGE                 |
| - NO LLM: buildRuleBasedRoutine() |    | - Cloudinary API (folder:       |
| - knowledge.json via knowledge.ts |    |   skinlens/scans, retries=2)   |
| - skin_profile + lifestyle_profile|    | - Returns cloud URL or null      |
| Output: routineJson (JSON)       |    | Output: cloudinaryUrl | null     |
+----------------+-----------------+    +----------------+-----------------+
                 |                                     |
                 v                                     v
               +------------------------------------------+
               |  1.10 SAVE RESULTS                       |
               |  - SQLite: insertRoutine() +             |
               |    insertResult() (UPSERT_RESULT_SQL)    |
               |  - Supabase: insert (online) else        |
               |    negative temp-id + enqueue sync_queue |
               |  - Server strips confidence /            |
               |    detection_label / survey_answers      |
               +--------------------+---------------------+
                                    |
                           saved result + routine
                                    |
                                    v
               +------------------------------------------+
               |  1.11 DISPLAY RESULTS                    |
               |  - Circular health score gauge           |
               |  - Top-3 predictions bars                |
               |  - Detection explanation                 |
               |  - Recommended products list             |
               +------------------------------------------+
```

**Figure 2: Level 1 Data Flow Diagram of Skin Image Classification/Detection**

Figure 2 shows the detailed Level 1 decomposition of the Skin Image Classification/Detection process. The process begins with Process 1.0 Capture Image, where the imageUri is acquired via guided vision-camera capture with face-detector bounding box, lighting and alignment gating, and single or multi-angle (front/left/right) modes, or via gallery through expo-image-picker. In the Enhance Image phase (1.1), enhanceImage resizes to 512x512 and applies gray-world white balance with auto-exposure correction to mid-gray. During the Preprocess Image stage (1.2), the image is resized to 224x224, decoded from JPEG to raw bytes via jpeg-js, and converted into a Float32Array of RGB values with 150,528 elements with per-channel gains to ensure uniform input dimensions. During the Run TFLite Inference stage (1.3), the cached detection_model.tflite is executed via react-native-fast-tflite to produce five class probabilities, which are then transformed in the Map Class Label phase (1.4) into categorical representations of acne, dry, eczema, normal, or oily with argmax confidence, averaging probabilities across angles when multi-angle capture is used. The Face Verification Gate (1.5) runs MobileFaceNet to produce a 192-dimensional embedding and enforces cosine similarity of at least 0.55 against the enrolled identity, routing mismatches to the face-mismatch screen. The Survey phase (1.6) presents condition-specific questions from survey-questions.json to derive a severityScore from 0 to 100 via points ratio. Concurrently, the Compute Health Score stage (1.7) applies baselines of normal 85, dry 60, oily 55, acne 55, and eczema 40 in a weighted formula where the detection baseline contributes 60% and the survey score contributes 40% to yield the overallScore. The Generate Routine phase (1.8) is purely rule-based through buildRuleBasedRoutine using knowledge.json with skin and lifestyle profiles to produce routineJson with no large language model involved, while the Upload Image phase (1.9) transmits the image to Cloudinary under skinlens/scans with two retries to obtain a cloud URL or null on failure. Finally, in the Save Results (1.10) and Display Results (1.11) phases, all data are persisted through SQLite insertRoutine and insertResult operations with Supabase insert when online or negative temporary identifiers with sync_queue enqueue when offline, stripping local-only confidence, detection_label, and survey_answers for server payloads, and rendered through a circular health score gauge, top-three prediction bars, detection explanation, and recommended products list. Note: the on-device Qwen3-0.6B model via llama.rn is used only for the AI chatbot assistant, not for routine generation.

### Explanation

| Step | Process | Key Files | Data In | Data Out |
|------|---------|-----------|---------|----------|
| 1.0 | Capture Image | `app/(tabs)/scan.tsx`, `app/(modules)/camera.tsx` | User tap (camera/gallery, single/multi-angle) | `imageUri` / `imageUris` (local file path) |
| 1.1 | Enhance Image | `utils/skin-prediction.ts:88-123` | `imageUri` | `enhancedUri` (512x512 white-balanced JPG) |
| 1.2 | Preprocess Image | `utils/skin-prediction.ts:125-208` | `imageUri` | `Float32Array` [1x224x224x3, 150528 values] |
| 1.3 | TFLite Inference | `utils/skin-prediction.ts:15-31, 210-211` | `ArrayBuffer` (inputBuffer) | `Float32Array` [5] probabilities |
| 1.4 | Map Class Label | `utils/skin-prediction.ts:33, 219-237` | 5 probabilities | `{ label, confidence, probabilities }` (acne/dry/eczema/normal/oily) |
| 1.5 | Face Verification Gate | `app/(modules)/analyzing.tsx:133-164`, `utils/face-embeddings.ts` | live image + enrolled embedding | pass to survey or `face-mismatch` route |
| 1.6 | Post-Survey | `app/(modules)/survey.tsx`, `data/survey-questions.json` | detection label | `severityScore` (points/maxPoints*100) |
| 1.7 | Compute Health Score | `app/(modules)/scan-results.tsx:42-48, 115-116` | detection baseline + surveyScore | `overallScore` (baseline*0.6+survey*0.4) |
| 1.8 | Generate Routine (Rule-Based) | `utils/routine-generator.ts:168-311`, `utils/knowledge.ts` | skin/lifestyle profile + concern + score | `routineJson` |
| 1.9 | Upload Image | `utils/cloudinary.ts:60-85` | `imageUri` | `cloudinaryUrl` or null (retries=2) |
| 1.10 | Save Results | `lib/db/results.ts:425-539`, `lib/db/routines.ts` | all data | SQLite rows + Supabase insert or temp-id + sync_queue |
| 1.11 | Display Results | `app/(modules)/scan-results.tsx` | result data | UI rendering (gauge + top-3 + explanation) |

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

**Figure 3: Context Diagram of Authentication (Offline + Online)**

Figure 3 shows the high-level context of the Authentication process in the SkinLens application. The process begins with the User providing credentials in the form of email and password input or Google OAuth selection, including deep-link callbacks for password recovery. In the SkinLens App central process, authentication requests are validated and session states are managed through an offline-first strategy. During online operation, the Supabase Auth cloud service acts as the external authority for sign-in, sign-up, OAuth token exchange, and password reset, returning a session token and authentication status. Concurrently, the AsyncStorage local cache stores the access token, refresh token, and onboarding flag to enable persistent sessions with automatic token refresh. The User ultimately receives authentication status and session continuity, allowing full application access even when offline after the initial login has been cached.

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
               |  - withTimeout guards (4s/8s/5s/15s)     |
               |  - AsyncStorage "is_onboarded"           |
               |  - SQLite user_profile.user_setup        |
               |    (offline-first, decides route)        |
               |  - Cached session (getSession, no net)  |
               |  - validateSession() only if no cache    |
               |  Routes: onboarding / welcome /          |
               |          (user-setup) / (tabs)           |
               +--------------------+---------------------+
                                    |
                route + stuck-loader watchdog (12s Retry)
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
 | Password()       | | -> upsertProfile | | skipBrowser-     |
 | -> Supabase API  | | -> Supabase API  | | Redirect + open- |
 | -> AsyncStorage  | | -> AsyncStorage  | | AuthSessionAsync |
 | (persist token)  | | (persist token)  | | -> createSession |
 |                  | |                  | | FromUrl          |
 +--------+---------+ +--------+---------+ +--------+---------+
          |                     |                    |
          v                     v                    v
               +------------------------------------------+
               |  2.5 SESSION PERSISTENCE + VALIDATION    |
               |  - AsyncStorage: access_token,           |
               |    refresh_token                         |
               |  - autoRefreshToken: true                |
               |  - persistSession: true                  |
               |  - validateSession(): getUser() server   |
               |    check; network fail -> keep cache;    |
               |    auth reject (401/403/JWT gone) ->     |
               |    signOutLocal(local scope) + purge     |
               +--------------------+---------------------+
                                    |
                           session + user.id
                                    |
                                    v
               +------------------------------------------+
               |  2.6 PROFILE + SETUP CHECK               |
               |  1. SQLite: SELECT user_setup WHERE id   |
               |  2. If user_setup=1 -> (tabs) immediately|
               |  3. If no cache -> Supabase user_profile |
               |     user_setup? true -> (tabs), else     |
               |     -> (user-setup)                     |
               |  4. If offline/timeout -> (tabs)         |
               |     empty-state (fail-open)              |
               +--------------------+---------------------+
                                    |
                           user_setup status
                                    |
                                    v
               +------------------------------------------+
               |  2.7 PASSWORD RESET FLOW                 |
               |  - sendResetEmail() -> Supabase          |
               |    (redirect: /create-new-password)      |
               |  - Deep-link: /create-new-password       |
               |  - onAuthStateChange("PASSWORD_RECOVERY")|
               |  - updatePassword() -> Supabase          |
               +--------------------+---------------------+
                                    |
                                    v
               +------------------------------------------+
               |  2.8 INVALID-SESSION PURGE               |
               |  - handleInvalidSession():               |
               |    signOutLocal + DELETE 8 user tables   |
               |    + DELETE sync_queue                   |
               |  - Trigger: validateSession / sync 401 / |
               |    RLS 42501 / SyncManager guard         |
               |  - Route -> /welcome                     |
               +------------------------------------------+
```

**Figure 4: Level 1 Data Flow Diagram of Authentication**

Figure 4 shows the detailed Level 1 decomposition of the Authentication process. The process begins with Process 2.0 Routing Gate in app/index.tsx, where withTimeout-guarded checks of AsyncStorage is_onboarded status, cached Supabase session, and SQLite local profile determine routing toward onboarding, welcome, user-setup, or main tabs with a stuck-loader watchdog offering retry. In the Auth Method Selection phase (2.1), the welcome screen presents email/password login, registration, and Google OAuth options. During Process 2.2 Email/Password Login, signInWithPassword authenticates against the Supabase API and persists the token in AsyncStorage, while Process 2.3 Register performs signUp followed by upsertProfile to create both authentication record and user profile. Concurrently, Process 2.4 Google OAuth utilizes signInWithOAuth with skipBrowserRedirect, openAuthSessionAsync, and createSessionFromUrl to establish a session from the external provider. The Session Persistence and Validation stage (2.5) configures persistSession and autoRefreshToken to cache access and refresh tokens locally, while validateSession verifies the token server-side through getUser, retaining the cache on network failure and purging on authentication rejection. The Profile and Setup Check phase (2.6) implements offline-first logic by querying SQLite user_setup first for immediate routing to tabs, falling back to Supabase query when no cache exists with branching to user-setup or tabs, and still routing to tabs in empty state when offline. The Password Reset Flow (2.7) handles sendResetEmail with redirect to create-new-password, deep-link navigation, PASSWORD_RECOVERY event detection, and updatePassword execution. Finally, the Invalid-Session Purge (2.8) executes handleInvalidSession with local-scope sign-out and deletion of eight user tables plus sync_queue, routing to welcome when the account is deleted or revoked.

### Explanation

| Step | Process | Key Files | Data In | Data Out |
|------|---------|-----------|---------|----------|
| 2.0 | Routing Gate | `app/index.tsx:20-210` | App launch | route: onboarding/welcome/(user-setup)/(tabs) |
| 2.1 | Auth Selection | `app/welcome.tsx` | User choice | selected auth method |
| 2.2 | Email/Pass Login | `components/Login.tsx`, `utils/supabase.ts` | email, password | Supabase session |
| 2.3 | Register | `components/Register.tsx`, `utils/supabase.ts:61-75` | email, password, name | new user + user_profile upsert |
| 2.4 | Google OAuth | `utils/supabase.ts:77-123` | Google credentials | Supabase session + profile |
| 2.5 | Session Persistence + Validation | `utils/supabase.ts:32-42, 200-258` | session tokens | AsyncStorage cache or purge |
| 2.6 | Profile + Setup Check | `app/index.tsx:122-195` | user.id | route decision (fail-open to tabs) |
| 2.7 | Password Reset | `app/forgot-password.tsx`, `app/create-new-password.tsx`, `utils/supabase.ts:125-136` | email | reset link + new password |
| 2.8 | Invalid-Session Purge | `lib/db/auth.ts:30-51`, `utils/supabase.ts:190-198` | rejected session | cleared storage + route /welcome |

### Offline Auth Behavior

```
App Launch (withTimeout guards + 12s stuck watchdog)
    |
    v
AsyncStorage("is_onboarded")? ---No---> Onboarding
    |Yes ("true")
    v
supabase.auth.getSession() (cache only, no network)
    |no session
    v
Welcome (login/register) <--- invalid session purged
    |                                (handleInvalidSession)
    | has cached session
    v
SQLite user_profile.user_setup WHERE id? ---1---> (tabs) immediately
    |null / 0 (not cached / incomplete)      (no network wait)
    v
validateSession() -> supabase.auth.getUser() (12s outer timeout)
    |network error -> keep cache -> (tabs) empty-state
    |auth reject (401/403/JWT/user_not_found) -> purge -> Welcome
    |valid
    v
Supabase user_profile.user_setup? ---true---> (tabs)
    |false/null
    v
(user-setup) flow -> face-enroll / setup / results
    |
    | (first login requires network)
    v
Network available? ---Yes---> Supabase auth -> persist in AsyncStorage
    |No
    v
Show error (offline login not possible
for first time)
```

**Figure 5: Offline Authentication Behavior Flow**

Figure 5 shows the Offline Authentication Behavior flow implemented to support offline-first access. The process begins at application launch with a check of the AsyncStorage is_onboarded flag, where a negative result routes the user to onboarding. If onboarded, the SQLite user_profile is queried for user_setup status, and a cached profile grants immediate access to the main tabs without network dependency. During the session validation stage, Supabase auth.getSession is consulted only when no local cache exists, routing authenticated users to server-side profile verification or unauthenticated users to the welcome screen. Concurrently, first-time login is enforced to require network availability, where successful Supabase authentication persists tokens in AsyncStorage, while offline attempts display an error. This design ensures that after the initial successful login, subsequent launches read from local storage first and the application operates fully offline with cached data.

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

**Figure 6: Context Diagram of Sync Management (Offline to Online)**

Figure 6 shows the high-level context of the Sync Management process. The process begins with the User performing write operations such as profile updates, scan results, and routine step toggles within the SkinLens App. In the central process, all writes are applied immediately to the local SQLite database to provide instant feedback, while a corresponding entry is enqueued in the sync_queue table containing table name, operation type, record identifier, and JSON payload. During the synchronization phase, the processSyncQueue function transmits queued operations to the Supabase PostgreSQL cloud database when connectivity is available, handling upsert, insert, update, and delete operations per table. The User ultimately receives synced status confirmation through updated synced_at timestamps, ensuring eventual consistency between local and cloud data stores without blocking the user interface.

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
               |  - Negative temp-id if server write fails|
               |  Tables: user_profile, skin_profile,     |
               |  lifestyle_profile, results, routines,   |
               |  routine_progress, sensitivity_history,   |
               |  notifications                          |
               +--------------------+---------------------+
                                    |
                           local record saved
                                    |
                                    v
               +------------------------------------------+
               |  3.1 ENQUEUE SYNC ENTRY                  |
               |  enqueueSync(): INSERT INTO sync_queue:  |
               |  - table_name, operation, record_id      |
               |  - payload (JSON), created_at            |
               |  Ops: upsert | insert | delete | update  |
               |  - Skip queue if user = "anonymous"      |
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
 | Supabase write;  | | - On AppState    | |   refresh from   |
 | on fail keep     | |   foreground     | |   Supabase       |
 | queue + neg id;  | | - validateBefore | | - swallow()      |
 | swallow errors   | |   Sync first     | |   errors         |
 +------------------+ +--------+---------+ +------------------+
                                 |
                                 v
               +------------------------------------------+
               |  3.5 PROCESS SYNC QUEUE                  |
               |  processSyncQueue() + guard (processing) |
               |  - validateSession() first; if invalid   |
               |    -> handleInvalidSession + return      |
               |  - Dequeue all entries (ASC by id)       |
               |  - For each entry: table router, upload  |
               |    image if results, remap temp-ids,     |
               |    remove entry on success, drop on RLS  |
               |    42501, continue on failure            |
               |  - Update synced_at timestamp            |
               +--------------------+---------------------+
                                    |
                     Supabase write results
                                    |
                                    v
               +------------------------------------------+
               |  3.6 TABLE ROUTER                        |
               |                                           |
               |  user_profile -----> upsert/update by id |
               |  skin_profile -----> upsert by id        |
               |  lifestyle_profile -> upsert by id       |
               |  results ---------> Cloudinary if        |
               |    file://, strip confidence /           |
               |    detection_label / survey_answers,     |
               |    insert-without-id if temp<0 + remap   |
               |    local id, else upsert; drop if        |
               |    user_id mismatch                     |
               |  routines ---------> upsert + remap      |
               |    temp routine_id + progress FK         |
               |  routine_progress -> upsert composite    |
               |    PK (user,routine,period,step,date)   |
               |    or delete                            |
               |  sensitivity_history-> insert (no id,    |
               |    natural-key match) or delete by lookup|
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
                |  - OfflineModal shown when offline      |
               |  - Triggers sync on reconnection         |
               +------------------------------------------+
```

**Figure 7: Level 1 Data Flow Diagram of Sync Management**

Figure 7 shows the detailed Level 1 decomposition of the Sync Management process. The process begins with Process 3.0 Write to Local SQLite, where user actions are inserted or updated immediately across user_profile, skin_profile, lifestyle_profile, results, routines, routine_progress, sensitivity_history, and notifications tables for instant feedback, assigning monotonic negative temporary identifiers when the server write fails. In the Enqueue Sync Entry phase (3.1), a record is inserted into sync_queue through enqueueSync with table_name, operation among upsert, insert, delete, and update, record_id, payload, and created_at timestamp, skipping queueing for anonymous sessions that can never satisfy row-level security. During Process 3.2 Attempt Immediate Sync, a fire-and-forget Supabase write is attempted with errors swallowed to retain the queue entry for retry, while Process 3.3 Sync Manager component triggers processSyncQueue on mount, on offline-to-online transition, and on application foregrounding after validateBeforeSync verification. Concurrently, Process 3.4 Read-Through Cache serves reads from SQLite for speed with background refresh from Supabase. The Process Sync Queue stage (3.5) enforces a concurrency guard, validates the session server-side with invalidation purge on deleted accounts, dequeues all entries in ascending order, uploads images to Cloudinary when handling the results table, remaps temporary identifiers to server-generated identifiers, drops entries rejected by row-level security error 42501 or user mismatch, and removes entries on success while logging and continuing on failure. The Table Router phase (3.6) directs user_profile, skin_profile, lifestyle_profile, results with local-field stripping, routines with progress foreign-key remapping, routine_progress with composite primary key, sensitivity_history with natural-key matching without identifier, and notifications to their respective upsert, insert, update, or delete handlers. Finally, in the Update synced_at (3.7) and Connectivity Monitor (3.8) phases, synchronized tables are timestamped and NetInfo-based useNetwork tracking displays an offline modal and initiates synchronization upon reconnection.

### Explanation

| Step | Process | Key Files | Data In | Data Out |
|------|---------|-----------|---------|----------|
| 3.0 | Write to SQLite | `lib/db/profile.ts`, `lib/db/results.ts`, `lib/db/routines.ts`, `lib/db/sensitivity.ts` | user action data | local record (real or temp negative id) |
| 3.1 | Enqueue Sync | `lib/db/sync-queue.ts:5-23` | table, operation, record_id, payload | sync_queue entry (op: upsert/insert/delete/update) |
| 3.2 | Immediate Sync | `lib/db/results.ts:453-516` etc. (each write function) | local record | Supabase result or queued retry (fire-and-forget) |
| 3.3 | SyncManager Component | `components/SyncManager.tsx:36-83` | mount / network change / AppState active | validateBeforeSync + processSyncQueue() |
| 3.4 | Read-Through Cache | `lib/db/profile.ts`, `lib/db/results.ts:131-160` | read request | SQLite data + background Supabase refresh |
| 3.5 | Process Queue | `lib/db/sync.ts:34-66` | sync_queue entries | synced records (guarded, validated) |
| 3.6 | Table Router | `lib/db/sync.ts:71-375` | entry.table_name + operation | Supabase API call per table |
| 3.7 | Update synced_at | `lib/db/sync.ts:408-413` | table names | timestamp update |
| 3.8 | Connectivity Monitor | `hooks/useNetwork.tsx`, `components/OfflineModal.tsx` | NetInfo state | online/offline status |

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

**Figure 8: Data Flow of Offline Write to Online Sync (Routine Step Example)**

Figure 8 shows the step-by-step data flow of an offline write followed by online synchronization using routine step toggling as an example. The process begins with the user toggling a routine step while offline, which triggers an immediate SQLite UPDATE on routine_progress to reflect completion instantly in the user interface. In the queueing phase, an entry is inserted into sync_queue specifying routine_progress as the target table with upsert operation and JSON payload. During the immediate sync attempt, the Supabase upsert fails due to lack of network connectivity, causing the entry to remain in the queue while the user still perceives successful completion locally. After a period of offline operation, the NetInfo connectivity monitor detects restoration of connection through isConnected and isInternetReachable flags. Concurrently, the SyncManager component observes the transition from offline to online and invokes processSyncQueue, which dequeues entries in order and routes routine_progress operations to Supabase upsert using composite primary keys. Upon success, the queue entry is removed and synced_at is updated, ensuring the cloud database eventually matches the local database while preserving responsiveness and data integrity.

---

## Summary Table

| Feature | External Entities | Processes | Data Stores | Key Technologies |
|---------|------------------|-----------|-------------|-----------------|
| **Skin Classification** | User, Cloudinary | 11 (capture -> enhance -> preprocess -> inference -> classify -> face-verify -> survey -> score -> rule-based generate -> upload -> save/display) | SQLite, Supabase, Cloudinary | react-native-fast-tflite (5-class), MobileFaceNet, expo-image-manipulator, knowledge.json rule engine (llama.rn Qwen3 used only for chatbot) |
| **Authentication** | User, Supabase Auth, Google OAuth | 8 (gate -> selection -> login/register/OAuth -> persistence+validation -> profile/setup check -> password reset -> invalid-session purge) | AsyncStorage, SQLite, Supabase | Supabase Auth, expo-web-browser, deep-links, validateSession/getUser |
| **Sync Management** | User, Supabase DB, Cloudinary | 8 (write -> enqueue -> immediate sync -> SyncManager -> process queue -> table router -> update synced_at -> monitor) | SQLite (sync_queue + 8 user tables), Supabase | NetInfo, sync_queue pattern, temp-id remap, RLS handling, read-through cache |
