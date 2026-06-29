# 🚽 Gotta Go!

**Emergency toilet reconnaissance — with badges.**

When nature calls, you shouldn't need a PhD in urban planning. **Gotta Go!** uses your GPS to scout nearby restrooms, lets you **collect** unclaimed spots like a very urgent Pokémon trainer, and shames absolutely nobody for needing a wee.

No app store. No build step. No backend (yet). Just three files and the open internet.

---

## ✨ What it does

- **📍 Pin me!** — finds you on a map
- **🗺️ Scouts the area** — public toilets *and* places that probably have one (cafés, petrol stations, libraries, train stations, etc.)
- **🏆 Collect spots** — first person to rate, upload a photo, or report a missing loo gets permanent credit
- **🎖️ Earn badges** — show off on your profile like the hero you are
- **🛑 Anti-cheat** — you must be within **100 m** to rate or photograph a spot (GPS checked live)
- **🕵️ Report secret loos** — add places the map doesn't know about yet

---

## 🚀 Run it locally

You need a tiny local web server (browsers block GPS on `file://` URLs).

```bash
cd Public-Toilets
python3 -m http.server 8766
```

Open **http://localhost:8766** and allow location when asked.

> Port already taken? Pick any free port: `python3 -m http.server 9000`

---

## 🎮 How to play

1. Hit **🎯 Pin me!**
2. Browse the sidebar list or tap map pins
3. Look for **✨ Unclaimed** spots — those are yours for the taking
4. Get within 100 m, drop a rating or photo, and **collect it**
5. Watch your profile bar fill up with badges and bragging rights

### Your test profile

You're logged in as **`@PorcelainPioneer`** (fake auth for now). Data lives in your browser's `localStorage`.

After your first search, the app seeds **3 demo collectors** so you can see how claimed spots look:

| Explorer | Vibe |
|----------|------|
| `@ThroneTracker` | Absolute unit. Many badges. |
| `@FlushFinder` | Solid mid-tier collector |
| `@LooLooter` | Photo pioneer energy |

Everyone else in the results? Fair game. Go get 'em.

---

## 🏅 Badges

| Badge | How to earn |
|-------|-------------|
| 🌱 **Rookie Scout** | You exist. Welcome. |
| 🏆 **First Collect** | Claim your first spot |
| 📸 **Photo Pioneer** | Upload your first restroom photo |
| 🎒 **Collector ×5** | Collect 5 spots |
| 👑 **Collector ×10** | Collect 10 spots |
| 📷 **Shutterbug** | Upload 5 photos |

Badges appear on your profile, list cards, and detail views — because glory belongs in the bathroom.

---

## 📁 Project structure

```
Public-Toilets/
├── index.html   # One page to rule them all
├── styles.css   # Loud colours, sticker shadows, zero corporate energy
├── app.js       # GPS, map, API, collectors, badges, localStorage
└── README.md    # You are here
```

That's it. No webpack. No npm install marathons. No 47 config files.

---

## 🛠️ Tech stack

| Thing | What |
|-------|------|
| **Leaflet** | Interactive map |
| **OpenStreetMap** | Map tiles |
| **Overpass API** | Free POI data (no API key) |
| **localStorage** | Ratings, photos, collections, your fake profile |

### Why OpenStreetMap / Overpass?

- **Free** — no billing account, no API key drama
- **Broad** — finds cafés, shops, stations, not just tagged `amenity=toilets`
- **Fair use** — one query per search, cached 5 minutes; fine for personal use

Outgrowing the free tier? Future you might want Google Places, Foursquare, or your own Overpass instance. Future you can figure that out. Future you is smart.

---

## 🔮 Not built yet (on purpose)

- Real login / accounts
- Server-side database
- Moderation queue for reported loos
- Verified "this bathroom is actually public" checks

For now it's a prototype you can poke, prod, and show your friends while saying *"imagine if..."*

---

## 🧹 Reset everything

Nuclear option — wipes all local data and re-seeds demo collectors:

```javascript
localStorage.clear();
location.reload();
```

Paste that in your browser dev tools console. Poof. Fresh start. Like nothing embarrassing ever happened.

---

## 🧻 Philosophy

Public restrooms are infrastructure. Knowing where they are shouldn't be a luxury. Also, if you're the first person to document a petrol station loo at 2 AM, you deserve a badge and our eternal respect.

**Stay hydrated. Plan ahead. Collect responsibly.**

---

*Built with silliness, OpenStreetMap, and the universal human experience.*
# Gotta-Go---Toilet-Map
