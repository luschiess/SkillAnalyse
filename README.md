# CaliTracker

A mobile-first, client-side calisthenics skill analyzer built with React, TypeScript, Vite, MediaPipe Pose Landmarker, and IndexedDB. Its searchable skill library includes handstands, front and back levers, bar and ring skills, planche, core, dips, floorwork, and push-up variations, with category, difficulty, equipment, favorite, and text filters.

## Run locally

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. Camera access requires a secure browser context: HTTPS on a deployed site, or `localhost` during development. Grant camera permission when prompted. If camera access is unavailable, select a skill and upload a video instead.

Create and preview a production build:

```sh
npm run build
npm run preview
```

To deploy, publish the generated `dist/` directory to any static HTTPS host (for example, Cloudflare Pages, Netlify, or Vercel). No backend is required.

## Install on a phone

The production build includes a web app manifest, generated Android/Apple icons, and a Workbox service worker. Deploy `dist/` to Netlify over HTTPS, open the site in Chrome on Android, and choose **Install app** in the browser menu or use the in-app install button when Chrome offers it. On iOS, use Safari's **Share → Add to Home Screen**. The app shell is precached; the public MediaPipe model and matching WASM assets are cached after their first successful load. The app continues to process camera footage and uploaded videos on-device. The service worker does not cache user video, recordings, or IndexedDB training history.

If the app icon source changes, run `npm run generate-pwa-assets` before building. To test offline support locally, run `npm run build` followed by `npm run preview`, load the preview once while online, and then use the browser's offline mode. Netlify builds require Node.js 20.19+ or 22.12+ as declared in `package.json`.

## Privacy and model setup

Pose inference and analysis run in the browser. MediaPipe Tasks Vision 1.1.1 is pinned and bundled with the app; its matching WASM runtime and the Pose Landmarker Lite model are included as local public assets in the production build. No runtime CDN connection is needed to initialize pose detection. The camera feed and uploaded video are not sent to a server. After inference, session metadata and, when available, the recording are kept in this browser's IndexedDB. Browser storage limits vary; a large video may not fit. The training log allows deleting individual sessions or all locally stored data.

The camera uses `getUserMedia()` and recordings use `MediaRecorder` when supported. Browser, device, and selected camera capabilities determine available codecs and camera switching behavior.

## What the analysis means

Pose detection uses actual MediaPipe landmarks. Separate front lever, handstand, handstand push-up, push-up, and bent-arm press analyzers estimate body-line alignment and joint extension from 2D landmarks. Push-up repetitions use elbow-angle phases; estimated body-line alignment, visible elbow-angle asymmetry, and observed elbow movement are provided as camera-dependent signals. The rep counters use joint-angle phases for push/pull exercises, body-line phases for front lever raises and press entries, and wrist displacement events for handstand walking. Hold qualification has configurable position tolerance and smoothing strength. The camera does not independently recognize the selected exercise: push-up hand spacing, elevation, claps, one-arm loading and other variations are not reliably classified. Results identify the selected exercise and clearly list measurement limits rather than claiming visual recognition.

These are coaching estimates, not a validated biomechanical assessment. A single 2D view cannot reliably measure depth, rotation, balance, or every 3D movement; camera angle, occlusion, lighting, clothing, and tracking confidence affect results. A score is withheld when pose evidence is insufficient. Counts and scores should be reviewed against the video, especially for skills whose movement is not well represented by the recommended camera view.

## Skill library and progressions

The extended library records prerequisites, easier and harder variations, related skills, common errors, suggested drills, equipment, and safety notes for each skill. Skill detail pages identify camera support as **partially analyzable** or **manual documentation only**. The manual-only entry lets athletes record their own repetitions and hold duration without producing a camera score. The current pose model does not independently identify exercise intent; advanced levers, rings, aerial skills, and many transitions are intentionally not camera-scored.

Skill favorites and recently viewed skills are stored in browser local storage. Library filters include category, difficulty, equipment, and alphabetic or difficulty sorting.

## Handstand combo analyzer

Choose **Edit combo** from the skill library to arrange press-to-handstand entries, handstand holds, and handstand push-ups. Set repetitions or hold time, add a short cue, and reorder the steps. Record with the existing camera or upload a local video; pose inference still runs locally using the existing MediaPipe model.

The first combo analyzer estimates an inverted entry, a stable-looking interval, and HSPU elbow flexion/extension cycles. It does not claim to identify exercise intent, a controlled press, balance, contact, or exact movement depth. Every timeline segment is initially unconfirmed; review it against the video, adjust its start/end time, and explicitly confirm it. Corrections are saved with the session in this browser. The sequence order and rep count are coaching estimates, not validated recognition.

## Combo library and builder

The combo library contains handstand, bar, push-up, planche, ring, and mixed example sequences with difficulty, descriptions, and prerequisites. Templates can be loaded into the editable builder. Custom combos support skill selection, repetitions, hold time, rest, transition cues, notes, reordering, renaming, duplication, deletion, comparison with a reference, and local persistence. Transferring a combo to Freestyle adds only a reference label: freestyle analysis does not enforce the planned order or claim to recognize unsupported transitions.

Custom combos, favorites, and recently viewed skill IDs use browser local storage; analysis sessions and videos remain in IndexedDB.

## Freestyle mode

Use **Freestyle** from the navigation, dashboard, or top bar to record without selecting an exercise. It reuses the existing camera, MediaPipe Pose Landmarker and local IndexedDB session storage. During a recording you can pause, resume or stop; the report includes detected intervals, pose visibility, approximate repetition/hold measurements and an editable timeline that seeks the saved video. Manual label, timing, count and confirmation edits are stored locally with the session.

The current automatic classifier deliberately reports only broad 2D patterns: inverted handstand-like holds and visible elbow cycles, horizontal front-lever-like positions, push-up-like positions/cycles, a kneeling-start handstand sequence, and an estimated bent-arm horizontal-support-to-handstand transition. These transition labels do not confirm the exact skill or support contact. A rep is marked higher confidence only when the broad pattern is sustained and landmark visibility is strong; this does not validate form or identify an exercise variation. Hold intervals use pose geometry and are not proof of balance. Press-to-handstand intent and straddle/one-leg variants are not automatically distinguished. Diamond, wide, archer, incline/decline and other push-up variations cannot be distinguished reliably. Pull-ups and muscle-ups lack reliable equipment/contact cues in the current pose model, so they remain unclassified unless the user corrects the segment manually. The freestyle timeline lets users label segments with any skill from the library, a combo template, or a custom name, and edit repetitions and hold time; freestyle does not require or enforce a planned combo order. Poorly visible recordings report insufficient evidence instead of fabricating a skill or overall score.

## Project structure

- `src/data/skills.ts` / `src/data/extendedSkills.ts` — categorized skill library and progression metadata.
- `src/data/combos.ts` — combo templates and their ordered skill steps.
- `src/components/ComboLibrary.tsx` — searchable templates and locally saved custom combo builder.
- `src/lib/pose.ts` — lazy MediaPipe model loading and frame inference.
- `src/lib/analyzers/` — category-specific 2D pose feature analyzers and shared landmark math.
- `src/lib/analyzer.ts` — hold tracking, movement-phase counters, and confidence-aware weighted report scoring.
- `src/lib/comboAnalyzer.ts` — estimated handstand combo phases and editable timeline data.
- `src/lib/freestyleAnalyzer.ts` — temporal broad-pose-pattern segmentation, confidence handling, and estimated freestyle reps/holds.
- `src/lib/storage.ts` — IndexedDB session and video persistence.
- `src/App.tsx` / `src/App.css` — responsive dashboard and analysis workflow.

## Validation

```sh
npm run lint
npm run build
```
