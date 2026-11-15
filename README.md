# ISL Voice AI — setup guide

## Files (all go in the ROOT of your GitHub repo)
| File | What it does |
|---|---|
| index.html | Main page (menu, language, settings, install button) |
| translate.html | Live camera translator + voice |
| train.html | Teach the AI your own signs (free, on your phone) |
| isl-core.js | Shared AI code (recognition, training, speech) |
| manifest.webmanifest, sw.js, icon-192.png, icon-512.png | Make it an installable phone app that works offline |
| model.json | **You create this** in train.html (step 3 below) |

## 1. Publish for free (GitHub Pages)
1. Open your repo in the browser → **Add file → Upload files**.
2. Select all files above (replace the old index.html and translate.html) → **Commit changes**.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main, folder: / (root) → Save.** (Free accounts need a public repo.)
4. Wait 1–2 minutes. Your site is at `https://<your-username>.github.io/<repo-name>/`.
5. Open the link on your phone. The camera only works on this https link, not when opening the file from phone storage.

## 2. Make it a phone app (free, no app store)
- **iPhone (Safari):** Share → Add to Home Screen.
- **Android (Chrome):** ⋮ menu → Install app (or use ⋮ → Install in the site's own menu).
It then opens full-screen with its own icon and works offline after the first visit.

## 3. Train your model (free)
1. Open `/train.html` on your phone → **Start camera**.
2. Pick a sign → **Record** → make the sign when the countdown ends. Do this **at least 3 times per sign**, changing distance/angle a little each time. Ask other people to record too.
3. Tap **Train & check accuracy**. Fix any sign marked yellow/red by recording more.
4. Tap **Download model.json**, then upload it to the repo root (same place as index.html) and commit.
5. Reload the translator. The badge at the top shows **Custom AI**. Without a model.json it uses the old built-in rules.

Add new words with **+ New sign** (you can type the English, Hindi and Punjabi text to speak).

## 4. Updating later
- Changed any file? Open `sw.js` and change `isl-v1` to `isl-v2` so phones download the new version.
- Train on the same phone you will test with, and use the same camera (front/back).

## Good to know
- Recognition uses single-frame hand shapes. Many real ISL words involve movement and facial expression, so treat this as a starting point and have ISL users/teachers check the signs.
- Camera video never leaves the device.
- Hindi/Punjabi speech needs a Hindi/Punjabi voice installed on the phone (Settings → Accessibility → Text-to-speech). Text is always shown.
- Play Store / App Store versions are possible later (PWABuilder wraps this site; stores charge developer fees). Not needed for installing.

## Changes made to your original code
- Added: Stop/flip camera, voice on/off, language picker, recent signs, offline + install support, trainer page, real Settings (language, voice, hold time).
- Fixed: repeated signs now re-speak after you lower your hand; Hindi "Help Me" had stray Punjabi letters; pinned MediaPipe version; removed pinch-zoom lock (accessibility); camera errors shown on screen.
- Removed: fake Google/email login (it did not log anyone in), "Premium Member" text, and caste / father's name from the public page. Your phone and social links are still there; remove them in index.html if you prefer.
