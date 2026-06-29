/**
 * Public Toilets Near You
 * -----------------------
 * A single-page app that:
 *  1. Uses GPS to find your location
 *  2. Loads nearby restroom spots from OpenStreetMap (Overpass API):
 *     dedicated toilets plus businesses & public places that usually have one
 *  3. Shows them on a Leaflet map and in a sidebar list
 *  4. Lets you rate / photo-upload only when you are close enough
 *  5. Accepts requests to add toilets missing from the map
 *
 * Data sources:
 *  - Map tiles: OpenStreetMap via Leaflet
 *  - Locations: Overpass API (free, no API key) — see OSM section below
 *  - Ratings, photos, add-requests: localStorage (no backend yet)
 *
 *  - Ratings, photos, add-requests: localStorage (no backend yet)
 *  - Collector credit: first person to rate OR upload a photo "claims" the spot
 *
 * Future (not MVP): real login, server-side moderation, verified reviews.
 */

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** Fake logged-in user for testing until auth exists. */
const DEFAULT_USER = {
  id: "user-you",
  username: "PorcelainPioneer",
  badges: ["rookie_scout"],
};

/**
 * Demo explorers — auto-assigned as collectors on a few spots so you can
 * preview the UI before you collect anything yourself.
 */
const DEMO_USERS = [
  {
    id: "demo-throne-tracker",
    username: "ThroneTracker",
    badges: ["first_discovery", "photo_pioneer", "collector_10", "shutterbug"],
  },
  {
    id: "demo-flush-finder",
    username: "FlushFinder",
    badges: ["first_discovery", "collector_5"],
  },
  {
    id: "demo-loo-looter",
    username: "LooLooter",
    badges: ["first_discovery", "photo_pioneer", "shutterbug"],
  },
];

/** Badge definitions shown next to usernames. */
const BADGE_CATALOG = {
  rookie_scout: { emoji: "🌱", label: "Rookie Scout", title: "New explorer on the map" },
  first_discovery: { emoji: "🏆", label: "First Collect", title: "First to collect a spot" },
  photo_pioneer: { emoji: "📸", label: "Photo Pioneer", title: "First photo at a spot" },
  collector_5: { emoji: "🎒", label: "Collector ×5", title: "Collected 5 restroom spots" },
  collector_10: { emoji: "👑", label: "Collector ×10", title: "Collected 10 restroom spots" },
  shutterbug: { emoji: "📷", label: "Shutterbug", title: "Uploaded 5 restroom photos" },
};

/** How many demo collectors to seed per new search area. */
const DEMO_COLLECTOR_COUNT = 3;

/** How close (metres) you must be to rate or upload a photo. */
const PROXIMITY_METRES = 100;

/** Default map centre before GPS is available (London). */
const DEFAULT_CENTER = [51.5074, -0.1278];

/** localStorage keys — keep names stable so data survives app updates. */
const STORAGE_KEYS = {
  ratings: "pt_ratings_v1",
  requests: "pt_requests_v1",
  user: "pt_user_v1",
  discoveries: "pt_discoveries_v1",
  demoSeeded: "pt_demo_seeded_v1",
};

/** Overpass API endpoints (free public mirrors; we try the next if one is busy). */
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** Re-use recent search results to avoid hammering Overpass on every click. */
const OVERPASS_CACHE_TTL_MS = 5 * 60 * 1000;
/** @type {{ key: string, data: Toilet[], fetchedAt: number } | null} */
let overpassCache = null;

/** Cap list size so dense city centres stay fast and readable. */
const MAX_RESULTS = 120;

/* -------------------------------------------------------------------------- */
/* Application state                                                          */
/* -------------------------------------------------------------------------- */

/** @type {{ lat: number, lng: number } | null} */
let userLocation = null;

/** @type {Array<Toilet>} Toilets currently shown on map and list. */
let toilets = [];

/** @type {Toilet | null} Selected toilet in the detail dialog. */
let selectedToilet = null;

/** @type {number | null} Star rating the user picked (1–5). */
let pendingStars = null;

/** Current fake-logged-in explorer profile. */
let currentUser = loadUser();

/** Leaflet map instance, user marker, and toilet markers. */
let map = null;
let userMarker = null;
const toiletMarkers = new Map();

/**
 * @typedef {Object} Toilet
 * @property {string} id        Unique id (OSM id or local id)
 * @property {string} name      Display name
 * @property {number} lat
 * @property {number} lng
 * @property {string} [address] Optional address or description
 * @property {"osm" | "request"} source Where the record came from
 * @property {"confirmed" | "likely"} kind Confirmed toilet vs likely restroom
 * @property {string} category Short label, e.g. "Cafe", "Public toilet"
 */

/**
 * @typedef {Object} UserProfile
 * @property {string} id
 * @property {string} username
 * @property {string[]} badges
 */

/**
 * @typedef {Object} Discovery
 * @property {string} userId
 * @property {string} username
 * @property {string[]} badges Snapshot of badges when they collected
 * @property {number} timestamp
 * @property {"rate" | "photo" | "report"} firstAction How they claimed it
 */

/**
 * @typedef {Object} Rating
 * @property {number} stars      1–5
 * @property {string} [text]     Optional review note
 * @property {string} [photo]   Base64 data URL (demo storage only)
 * @property {number} timestamp
 * @property {string} [userId]
 * @property {string} [username]
 * @property {string[]} [badges]
 */

/* -------------------------------------------------------------------------- */
/* DOM references                                                             */
/* -------------------------------------------------------------------------- */

const els = {
  btnLocate: document.getElementById("btn-locate"),
  btnAddRequest: document.getElementById("btn-add-request"),
  btnSubmitRating: document.getElementById("btn-submit-rating"),
  radiusSelect: document.getElementById("radius-select"),
  statusMessage: document.getElementById("status-message"),
  toiletList: document.getElementById("toilet-list"),
  detailDialog: document.getElementById("detail-dialog"),
  requestDialog: document.getElementById("request-dialog"),
  requestForm: document.getElementById("request-form"),
  detailName: document.getElementById("detail-name"),
  detailAddress: document.getElementById("detail-address"),
  detailDistance: document.getElementById("detail-distance"),
  detailStars: document.getElementById("detail-stars"),
  detailRatingCount: document.getElementById("detail-rating-count"),
  detailPhotos: document.getElementById("detail-photos"),
  proximityHint: document.getElementById("proximity-hint"),
  starInput: document.getElementById("star-input"),
  photoInput: document.getElementById("photo-input"),
  reviewText: document.getElementById("review-text"),
  requestName: document.getElementById("request-name"),
  requestNotes: document.getElementById("request-notes"),
  requestLocationHint: document.getElementById("request-location-hint"),
  userDisplayName: document.getElementById("user-display-name"),
  userBadges: document.getElementById("user-badges"),
  userStats: document.getElementById("user-stats"),
  detailCollector: document.getElementById("detail-collector"),
};

/* -------------------------------------------------------------------------- */
/* Map setup                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Initialise the Leaflet map and a default view.
 */
function initMap() {
  map = L.map("map").setView(DEFAULT_CENTER, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
}

/**
 * Build a silly emoji pin for the map.
 * @param {"confirmed" | "likely"} kind
 * @returns {L.DivIcon}
 */
function createToiletIcon(kind) {
  const emoji = kind === "confirmed" ? "🚻" : "🚽";
  const extraClass = kind === "likely" ? " map-pin--likely" : "";
  return L.divIcon({
    className: `map-pin${extraClass}`,
    html: `<span class="map-pin__emoji">${emoji}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 28],
  });
}

/**
 * Place or move the marker showing the user's GPS position.
 * @param {number} lat
 * @param {number} lng
 */
function setUserMarker(lat, lng) {
  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
  } else {
    userMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: "user-marker-wrap",
        html:
          '<div class="user-marker">' +
          '<span class="user-marker__emoji">🏃</span>' +
          '<span class="user-marker__label">YOU</span>' +
          "</div>",
        iconSize: [48, 48],
        iconAnchor: [24, 40],
      }),
      zIndexOffset: 1000,
    }).addTo(map);
    userMarker.bindPopup("🏃 You are here — hold it together!");
  }
}

/**
 * Draw toilet markers on the map; clicking opens the detail dialog.
 */
function renderMapMarkers() {
  toiletMarkers.forEach((marker) => map.removeLayer(marker));
  toiletMarkers.clear();

  toilets.forEach((toilet) => {
    const marker = L.marker([toilet.lat, toilet.lng], {
      icon: createToiletIcon(toilet.kind || "likely"),
    })
      .addTo(map)
      .bindPopup(`🚽 ${toilet.name}`);

    marker.on("click", () => openToiletDetail(toilet));
    toiletMarkers.set(toilet.id, marker);
  });
}

/* -------------------------------------------------------------------------- */
/* Geolocation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Ask the browser for the user's GPS coordinates.
 * @returns {Promise<{ lat: number, lng: number }>}
 */
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        const messages = {
          1: "Location permission denied. Allow GPS access and try again.",
          2: "Could not determine your location.",
          3: "Location request timed out.",
        };
        reject(new Error(messages[error.code] || "Unknown geolocation error."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Distance maths                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Haversine distance between two lat/lng points, in metres.
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number}
 */
function distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Format a distance for display.
 * @param {number} metres
 * @returns {string}
 */
function formatDistance(metres) {
  if (metres < 1000) return `${Math.round(metres)} m away`;
  return `${(metres / 1000).toFixed(1)} km away`;
}

/**
 * True if the user is close enough to interact with a toilet.
 * @param {Toilet} toilet
 * @returns {boolean}
 */
function isUserNearToilet(toilet) {
  if (!userLocation) return false;
  return (
    distanceMetres(
      userLocation.lat,
      userLocation.lng,
      toilet.lat,
      toilet.lng
    ) <= PROXIMITY_METRES
  );
}

/* -------------------------------------------------------------------------- */
/* OpenStreetMap / Overpass API                                               */
/* -------------------------------------------------------------------------- */
/*
 * Why Overpass?
 *  - Free, no API key, works from the browser
 *  - Same data behind OpenStreetMap — cafes, stations, libraries, etc.
 *
 * Rate limits (rough guide):
 *  - Public Overpass servers ask for fair use (~1 query/sec, ~10k/day/IP)
 *  - This app sends ONE query when you locate or change radius, then caches
 *    results for 5 minutes — fine for personal use; not for high-traffic prod
 *    without your own Overpass instance or a paid Places API (Google, Foursquare).
 *
 * Paid alternatives if you outgrow this:
 *  - Google Places / Foursquare / Geoapify — better business coverage, costs money
 */

/** OSM tag groups: places people can usually find a restroom. */
const OSM_AMENITIES =
  "toilets|restaurant|cafe|fast_food|bar|pub|library|fuel|pharmacy|hospital|" +
  "clinic|community_centre|townhall|cinema|theatre|arts_centre|place_of_worship|" +
  "bus_station|food_court|ice_cream|social_facility|marketplace|charging_station|" +
  "bank|post_office|ferry_terminal";
const OSM_SHOPS = "supermarket|department_store|mall|convenience|shopping_centre";
const OSM_TOURISM = "museum|hotel|hostel|attraction|theme_park|gallery|zoo|aquarium";
const OSM_LEISURE = "sports_centre|fitness_centre|swimming_pool|stadium";

/** Human-readable labels for OSM tag values. */
const TAG_LABELS = {
  toilets: "Public toilet",
  restaurant: "Restaurant",
  cafe: "Cafe",
  fast_food: "Fast food",
  bar: "Bar",
  pub: "Pub",
  library: "Library",
  fuel: "Petrol station",
  pharmacy: "Pharmacy",
  hospital: "Hospital",
  clinic: "Clinic",
  community_centre: "Community centre",
  townhall: "Town hall",
  cinema: "Cinema",
  theatre: "Theatre",
  arts_centre: "Arts centre",
  place_of_worship: "Place of worship",
  bus_station: "Bus station",
  food_court: "Food court",
  ice_cream: "Ice cream shop",
  social_facility: "Social facility",
  marketplace: "Marketplace",
  charging_station: "Charging station",
  bank: "Bank",
  post_office: "Post office",
  ferry_terminal: "Ferry terminal",
  supermarket: "Supermarket",
  department_store: "Department store",
  mall: "Shopping mall",
  convenience: "Convenience store",
  shopping_centre: "Shopping centre",
  museum: "Museum",
  hotel: "Hotel",
  hostel: "Hostel",
  attraction: "Attraction",
  theme_park: "Theme park",
  gallery: "Gallery",
  zoo: "Zoo",
  aquarium: "Aquarium",
  sports_centre: "Sports centre",
  fitness_centre: "Gym",
  swimming_pool: "Swimming pool",
  stadium: "Stadium",
  station: "Train station",
  rest_area: "Rest area",
  park: "Park",
};

/**
 * Build an Overpass QL query for confirmed toilets and likely restroom locations.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusMetres
 * @returns {string}
 */
function buildOverpassQuery(lat, lng, radiusMetres) {
  const around = `(around:${radiusMetres},${lat},${lng})`;
  return `
    [out:json][timeout:30];
    (
      node["amenity"~"^(${OSM_AMENITIES})$"]${around};
      way["amenity"~"^(${OSM_AMENITIES})$"]${around};
      node["shop"~"^(${OSM_SHOPS})$"]${around};
      way["shop"~"^(${OSM_SHOPS})$"]${around};
      node["tourism"~"^(${OSM_TOURISM})$"]${around};
      way["tourism"~"^(${OSM_TOURISM})$"]${around};
      node["leisure"~"^(${OSM_LEISURE})$"]${around};
      way["leisure"~"^(${OSM_LEISURE})$"]${around};
      node["railway"="station"]${around};
      way["railway"="station"]${around};
      node["highway"="rest_area"]${around};
      way["highway"="rest_area"]${around};
      node["toilets"="yes"]${around};
      way["toilets"="yes"]${around};
      node["leisure"="park"]["toilets"="yes"]${around};
      way["leisure"="park"]["toilets"="yes"]${around};
    );
    out center tags;
  `;
}

/**
 * Cache key: round GPS so tiny movements do not trigger a new API call.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusMetres
 * @returns {string}
 */
function overpassCacheKey(lat, lng, radiusMetres) {
  return `${lat.toFixed(3)},${lng.toFixed(3)},${radiusMetres}`;
}

/**
 * POST a query to Overpass, trying fallback servers if one is overloaded.
 * @param {string} query
 * @returns {Promise<object>}
 */
async function queryOverpass(query) {
  let lastError = null;

  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, { method: "POST", body: query });

      if (response.status === 429 || response.status === 504) {
        lastError = new Error("Overpass server busy — try again in a moment.");
        continue;
      }

      if (!response.ok) {
        lastError = new Error("Could not load places from OpenStreetMap.");
        continue;
      }

      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Network error.");
    }
  }

  throw lastError || new Error("Could not load places from OpenStreetMap.");
}

/**
 * Fetch restroom-related places near a point from OpenStreetMap.
 * Includes dedicated toilets AND businesses/public venues that usually have one.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusMetres
 * @returns {Promise<Toilet[]>}
 */
async function fetchToiletsFromOSM(lat, lng, radiusMetres) {
  const cacheKey = overpassCacheKey(lat, lng, radiusMetres);
  const now = Date.now();

  if (
    overpassCache &&
    overpassCache.key === cacheKey &&
    now - overpassCache.fetchedAt < OVERPASS_CACHE_TTL_MS
  ) {
    return overpassCache.data;
  }

  const query = buildOverpassQuery(lat, lng, radiusMetres);
  const data = await queryOverpass(query);
  const parsed = prioritizeAndLimit(parseOverpassElements(data.elements || []), lat, lng);

  overpassCache = { key: cacheKey, data: parsed, fetchedAt: now };
  return parsed;
}

/**
 * Classify an OSM element and decide if it is a confirmed or likely restroom spot.
 * @param {Record<string, string>} tags
 * @returns {{ kind: "confirmed" | "likely", category: string }}
 */
function classifyOsmTags(tags) {
  if (tags.amenity === "toilets" || tags.toilets === "yes") {
    return { kind: "confirmed", category: "Public toilet" };
  }

  const candidates = [
    ["amenity", tags.amenity],
    ["shop", tags.shop],
    ["tourism", tags.tourism],
    ["leisure", tags.leisure],
    ["railway", tags.railway === "station" ? "station" : null],
    ["highway", tags.highway === "rest_area" ? "rest_area" : null],
  ];

  for (const [group, value] of candidates) {
    if (!value) continue;
    const label = TAG_LABELS[value] || value.replace(/_/g, " ");
    return { kind: "likely", category: label };
  }

  return { kind: "likely", category: "Public place" };
}

/**
 * Turn raw Overpass elements into our Toilet objects.
 * @param {Array<object>} elements
 * @returns {Toilet[]}
 */
function parseOverpassElements(elements) {
  const results = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;

    const tags = el.tags || {};
    const { kind, category } = classifyOsmTags(tags);
    const name =
      tags.name ||
      tags.brand ||
      tags.operator ||
      tags["addr:street"] ||
      `${category} (likely restroom)`;

    results.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      lat,
      lng,
      address: buildAddressFromTags(tags, kind),
      source: "osm",
      kind,
      category,
    });
  }

  return dedupeToilets(results);
}

/**
 * Sort by confirmed toilets first, then distance; cap total results.
 * @param {Toilet[]} list
 * @param {number} lat
 * @param {number} lng
 * @returns {Toilet[]}
 */
function prioritizeAndLimit(list, lat, lng) {
  return [...list]
    .sort((a, b) => {
      const kindOrder = { confirmed: 0, likely: 1 };
      const kindDiff = kindOrder[a.kind] - kindOrder[b.kind];
      if (kindDiff !== 0) return kindDiff;
      return (
        distanceMetres(lat, lng, a.lat, a.lng) -
        distanceMetres(lat, lng, b.lat, b.lng)
      );
    })
    .slice(0, MAX_RESULTS);
}

/**
 * Build a readable address string from OSM tags, if available.
 * @param {Record<string, string>} tags
 * @param {"confirmed" | "likely"} kind
 * @returns {string}
 */
function buildAddressFromTags(tags, kind = "likely") {
  const parts = [
    tags["addr:street"],
    tags["addr:city"],
    tags["addr:postcode"],
  ].filter(Boolean);

  const base = parts.length ? parts.join(", ") : tags.description || "OpenStreetMap listing";
  if (kind === "likely") {
    return `${base} · Restroom not verified — usually available for customers/public`;
  }
  return base;
}

/**
 * Remove duplicate toilets that share nearly the same coordinates.
 * @param {Toilet[]} list
 * @returns {Toilet[]}
 */
function dedupeToilets(list) {
  const kept = [];

  for (const toilet of list) {
    const duplicate = kept.some(
      (other) =>
        distanceMetres(toilet.lat, toilet.lng, other.lat, other.lng) < 15
    );
    if (!duplicate) kept.push(toilet);
  }

  return kept;
}

/* -------------------------------------------------------------------------- */
/* Users, badges, and collector credit                                        */
/* -------------------------------------------------------------------------- */

/**
 * Load the fake logged-in user from localStorage (or create the default).
 * @returns {UserProfile}
 */
function loadUser() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || "null");
    if (saved?.id && saved?.username) return saved;
  } catch {
    /* fall through */
  }
  saveUser(DEFAULT_USER);
  return { ...DEFAULT_USER, badges: [...DEFAULT_USER.badges] };
}

/**
 * @param {UserProfile} user
 */
function saveUser(user) {
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

/**
 * @returns {Record<string, Discovery>}
 */
function loadDiscoveries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.discoveries) || "{}");
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, Discovery>} data
 */
function saveDiscoveries(data) {
  localStorage.setItem(STORAGE_KEYS.discoveries, JSON.stringify(data));
}

/**
 * Who collected (discovered) this spot first?
 * @param {string} toiletId
 * @returns {Discovery | null}
 */
function getCollectorForToilet(toiletId) {
  return loadDiscoveries()[toiletId] || null;
}

/**
 * Count how many spots a user has collected.
 * @param {string} userId
 * @returns {number}
 */
function countCollectionsByUser(userId) {
  return Object.values(loadDiscoveries()).filter((d) => d.userId === userId).length;
}

/**
 * Count photo uploads by a user across all ratings.
 * @param {string} userId
 * @returns {number}
 */
function countPhotosByUser(userId) {
  let total = 0;
  for (const list of Object.values(loadRatings())) {
    total += list.filter((r) => r.photo && r.userId === userId).length;
  }
  return total;
}

/**
 * Recompute profile badges from collections and photos.
 * @param {UserProfile} user
 * @returns {UserProfile}
 */
function refreshUserBadges(user) {
  const badges = new Set(user.badges);
  badges.add("rookie_scout");

  const collections = countCollectionsByUser(user.id);
  if (collections >= 1) badges.add("first_discovery");
  if (collections >= 5) badges.add("collector_5");
  if (collections >= 10) badges.add("collector_10");

  const photos = countPhotosByUser(user.id);
  if (photos >= 1) badges.add("photo_pioneer");
  if (photos >= 5) badges.add("shutterbug");

  return { ...user, badges: [...badges] };
}

/**
 * Claim a spot for the current user (first rating or photo only).
 * @param {string} toiletId
 * @param {"rate" | "photo" | "report"} action
 * @returns {Discovery | null} The new discovery, or null if already collected
 */
function tryClaimSpot(toiletId, action) {
  const discoveries = loadDiscoveries();
  if (discoveries[toiletId]) return null;

  const discovery = {
    userId: currentUser.id,
    username: currentUser.username,
    badges: [...currentUser.badges],
    timestamp: Date.now(),
    firstAction: action,
  };

  discoveries[toiletId] = discovery;
  saveDiscoveries(discoveries);

  currentUser = refreshUserBadges(currentUser);
  saveUser(currentUser);
  renderUserPanel();

  return discovery;
}

/**
 * Seed a few demo collectors so you can preview the feature immediately.
 * Only fills spots that nobody has collected yet.
 * @param {Toilet[]} toiletList
 */
function seedDemoCollectors(toiletList) {
  const discoveries = loadDiscoveries();
  const ratings = loadRatings();
  const seededIds = new Set(
    JSON.parse(localStorage.getItem(STORAGE_KEYS.demoSeeded) || "[]")
  );

  let demoIndex = 0;

  for (const toilet of toiletList) {
    if (demoIndex >= DEMO_COLLECTOR_COUNT) break;
    if (discoveries[toilet.id] || seededIds.has(toilet.id)) continue;

    const demoUser = DEMO_USERS[demoIndex];
    const timestamp = Date.now() - (demoIndex + 1) * 86_400_000;

    discoveries[toilet.id] = {
      userId: demoUser.id,
      username: demoUser.username,
      badges: [...demoUser.badges],
      timestamp,
      firstAction: demoIndex === 2 ? "photo" : "rate",
    };

    if (!ratings[toilet.id]?.length) {
      ratings[toilet.id] = [
        {
          userId: demoUser.id,
          username: demoUser.username,
          badges: demoUser.badges,
          stars: 5 - (demoIndex % 2),
          text:
            demoIndex === 0
              ? "Legendary throne. Would queue again."
              : demoIndex === 1
                ? "Solid emergency option!"
                : "First photo proof — it exists!",
          timestamp,
        },
      ];
    }

    seededIds.add(toilet.id);
    demoIndex += 1;
  }

  saveDiscoveries(discoveries);
  saveRatings(ratings);
  localStorage.setItem(STORAGE_KEYS.demoSeeded, JSON.stringify([...seededIds]));
}

/**
 * Build HTML for a row of badge chips.
 * @param {string[]} badgeIds
 * @param {"sm" | "md"} [size]
 * @param {boolean} [highlightYou]
 * @returns {string}
 */
function renderBadgesHtml(badgeIds, size = "sm", highlightYou = false) {
  const unique = [...new Set(badgeIds)];
  return unique
    .map((id) => {
      const badge = BADGE_CATALOG[id];
      if (!badge) return "";
      const extra = highlightYou ? " badge--you" : id === "first_discovery" ? " badge--gold" : "";
      return `<span class="badge badge--${size}${extra}" title="${escapeHtml(badge.title)}">${badge.emoji} ${escapeHtml(badge.label)}</span>`;
    })
    .join("");
}

/**
 * Collector line for sidebar list cards.
 * @param {Discovery | null} collector
 * @returns {string}
 */
function renderCollectorListHtml(collector) {
  if (!collector) {
    return `<div class="toilet-item__collector toilet-item__collector--unclaimed">✨ Unclaimed — be the first to collect!</div>`;
  }

  const isYou = collector.userId === currentUser.id;
  const className = isYou
    ? "toilet-item__collector toilet-item__collector--you"
    : "toilet-item__collector";

  return `
    <div class="${className}">
      🏆 Collected by <strong>@${escapeHtml(collector.username)}</strong>
      ${isYou ? " (that’s you!)" : ""}
      <div class="badge-row">${renderBadgesHtml(collector.badges)}</div>
    </div>
  `;
}

/**
 * Collector panel for the detail dialog.
 * @param {Discovery | null} collector
 * @param {Toilet} toilet
 * @returns {string}
 */
function renderCollectorDetailHtml(collector, toilet) {
  if (!collector) {
    return `
      <p class="collector-card__title">✨ Still unclaimed!</p>
      <p class="collector-card__cta">Get within ${PROXIMITY_METRES} m and be the first to rate or upload a photo — it goes on your profile forever.</p>
    `;
  }

  const isYou = collector.userId === currentUser.id;
  const actionLabels = {
    rate: "first review",
    photo: "first photo",
    report: "map report",
  };
  const when = new Date(collector.timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `
    <p class="collector-card__title">${isYou ? "🎉 You collected this one!" : "🏆 Collected by"}</p>
    <p class="collector-card__user">@${escapeHtml(collector.username)}${isYou ? " (you!)" : ""}</p>
    <div class="badge-row">${renderBadgesHtml(collector.badges, "md", isYou)}</div>
    <p class="collector-card__meta">
      First on the map via ${actionLabels[collector.firstAction] || "visit"} · ${when}
    </p>
    ${isYou ? '<p class="collector-card__cta">Nice work, pioneer — this spot is in your collection.</p>' : `<p class="collector-card__meta">${escapeHtml(toilet.name)} was claimed before you got here. You can still add your review!</p>`}
  `;
}

/**
 * Refresh the header profile bar (username, badges, collection count).
 */
function renderUserPanel() {
  if (!els.userDisplayName) return;

  const collections = countCollectionsByUser(currentUser.id);
  els.userDisplayName.textContent = `@${currentUser.username}`;
  els.userBadges.innerHTML = renderBadgesHtml(currentUser.badges, "md", true);
  els.userStats.textContent =
    collections === 0
      ? "No spots collected yet — go claim one!"
      : `${collections} spot${collections === 1 ? "" : "s"} in your collection`;
}

/* -------------------------------------------------------------------------- */
/* localStorage: ratings and add-requests                                     */
/* -------------------------------------------------------------------------- */

/**
 * @returns {Record<string, Rating[]>}
 */
function loadRatings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ratings) || "{}");
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, Rating[]>} data
 */
function saveRatings(data) {
  localStorage.setItem(STORAGE_KEYS.ratings, JSON.stringify(data));
}

/**
 * @param {string} toiletId
 * @returns {Rating[]}
 */
function getRatingsForToilet(toiletId) {
  return loadRatings()[toiletId] || [];
}

/**
 * @param {string} toiletId
 * @param {Rating} rating
 */
function addRating(toiletId, rating) {
  const all = loadRatings();
  if (!all[toiletId]) all[toiletId] = [];
  all[toiletId].push(rating);
  saveRatings(all);
}

/**
 * @returns {Array<object>}
 */
function loadRequests() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.requests) || "[]");
  } catch {
    return [];
  }
}

/**
 * @param {Array<object>} requests
 */
function saveRequests(requests) {
  localStorage.setItem(STORAGE_KEYS.requests, JSON.stringify(requests));
}

/**
 * Turn approved local requests into Toilet entries near the user.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusMetres
 * @returns {Toilet[]}
 */
function getLocalRequestToilets(lat, lng, radiusMetres) {
  return loadRequests()
    .filter((req) => {
      const d = distanceMetres(lat, lng, req.lat, req.lng);
      return d <= radiusMetres;
    })
    .map((req) => ({
      id: req.id,
      name: req.name,
      lat: req.lat,
      lng: req.lng,
      address: req.notes || "User-submitted location",
      source: "request",
      kind: "confirmed",
      category: "Community submitted",
    }));
}

/* -------------------------------------------------------------------------- */
/* UI helpers                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Update the status banner at the top of the sidebar.
 * @param {string} message
 * @param {"info" | "error" | "success"} [type]
 */
function setStatus(message, type = "info") {
  els.statusMessage.textContent = message;
  els.statusMessage.className = "status-message";
  if (type === "error") els.statusMessage.classList.add("status-message--error");
  if (type === "success") els.statusMessage.classList.add("status-message--success");
}

/**
 * Render average stars as filled/empty characters.
 * @param {number} average 0–5
 * @returns {string}
 */
function renderStars(average) {
  const full = Math.round(average);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(full);
}

/**
 * Sort toilets by distance from the user, then render list + map.
 */
function renderToiletList() {
  els.toiletList.innerHTML = "";

  if (!toilets.length) {
    els.toiletList.innerHTML =
      '<li class="status-message">😱 Nothing nearby! Widen the search or snitch on a secret loo below.</li>';
    renderMapMarkers();
    return;
  }

  const sorted = [...toilets].sort((a, b) => {
    const kindOrder = { confirmed: 0, likely: 1 };
    const kindDiff = kindOrder[a.kind] - kindOrder[b.kind];
    if (kindDiff !== 0) return kindDiff;

    const distA = userLocation
      ? distanceMetres(userLocation.lat, userLocation.lng, a.lat, a.lng)
      : 0;
    const distB = userLocation
      ? distanceMetres(userLocation.lat, userLocation.lng, b.lat, b.lng)
      : 0;
    return distA - distB;
  });

  sorted.forEach((toilet) => {
    const ratings = getRatingsForToilet(toilet.id);
    const avg =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length
        : 0;

    const dist = userLocation
      ? distanceMetres(userLocation.lat, userLocation.lng, toilet.lat, toilet.lng)
      : null;

    const collector = getCollectorForToilet(toilet.id);

    const li = document.createElement("li");
    li.className = "toilet-item";
    li.dataset.id = toilet.id;
    li.innerHTML = `
      <p class="toilet-item__name">${escapeHtml(toilet.name)}</p>
      <p class="toilet-item__meta">
        ${escapeHtml(toilet.category)}${toilet.kind === "likely" ? " · Likely restroom" : ""}
        ${ratings.length ? ` · <span class="stars">${renderStars(avg)}</span> (${ratings.length})` : " · No ratings yet"}
        · ${dist != null ? formatDistance(dist) : ""}
      </p>
      ${renderCollectorListHtml(collector)}
    `;

    li.addEventListener("click", () => openToiletDetail(toilet));
    els.toiletList.appendChild(li);
  });

  renderMapMarkers();
}

/**
 * Prevent XSS when inserting user-provided strings into HTML.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Open the detail dialog for a toilet and refresh proximity-based controls.
 * @param {Toilet} toilet
 */
function openToiletDetail(toilet) {
  selectedToilet = toilet;
  pendingStars = null;

  const ratings = getRatingsForToilet(toilet.id);
  const collector = getCollectorForToilet(toilet.id);
  const avg =
    ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length
      : 0;

  els.detailName.textContent = toilet.name;
  els.detailAddress.textContent = toilet.address || "No address listed";

  if (userLocation) {
    const dist = distanceMetres(
      userLocation.lat,
      userLocation.lng,
      toilet.lat,
      toilet.lng
    );
    els.detailDistance.textContent = formatDistance(dist);
  } else {
    els.detailDistance.textContent = "Location unknown";
  }

  els.detailCollector.className = "collector-card";
  if (collector?.userId === currentUser.id) {
    els.detailCollector.classList.add("collector-card--you");
  } else if (!collector) {
    els.detailCollector.classList.add("collector-card--unclaimed");
  }
  els.detailCollector.innerHTML = renderCollectorDetailHtml(collector, toilet);

  els.detailStars.textContent = ratings.length ? renderStars(avg) : "Nobody’s rated this throne yet";
  els.detailRatingCount.textContent = ratings.length
    ? `${ratings.length} brave reviewer${ratings.length === 1 ? "" : "s"}`
    : "Be a legend — rate it first!";

  // Show photos from past ratings
  els.detailPhotos.innerHTML = "";
  ratings
    .filter((r) => r.photo)
    .forEach((r) => {
      const img = document.createElement("img");
      img.src = r.photo;
      img.alt = r.username ? `Photo by @${r.username}` : "User photo of this toilet";
      els.detailPhotos.appendChild(img);
    });

  const near = isUserNearToilet(toilet);
  updateProximityControls();
  if (!collector && near) {
    els.proximityHint.textContent =
      "✨ Unclaimed spot! Rate or upload a photo to collect it for @"
      + currentUser.username
      + ".";
    els.proximityHint.classList.add("proximity-hint--ok");
  }
  resetRatingForm();
  els.detailDialog.showModal();

  // Pan map to selected toilet
  map.setView([toilet.lat, toilet.lng], Math.max(map.getZoom(), 16));
  toiletMarkers.get(toilet.id)?.openPopup();
}

/**
 * Enable or disable rating controls based on GPS proximity.
 */
function updateProximityControls() {
  const near = selectedToilet && isUserNearToilet(selectedToilet);

  els.proximityHint.textContent = near
    ? `✅ Close enough! ${PROXIMITY_METRES} m away — drop your stars or a pic.`
    : `🏃‍♂️ Still too far! Waddle within ${PROXIMITY_METRES} m to review this bathroom.`;

  els.proximityHint.classList.toggle("proximity-hint--ok", Boolean(near));
  els.starInput.classList.toggle("is-disabled", !near);
  els.photoInput.disabled = !near;
  els.reviewText.disabled = !near;
  els.btnSubmitRating.disabled = !near;

  highlightStarButtons(pendingStars || 0);
}

/**
 * Reset star picker and form fields after submit or dialog open.
 */
function resetRatingForm() {
  pendingStars = null;
  els.reviewText.value = "";
  els.photoInput.value = "";
  highlightStarButtons(0);
}

/**
 * Highlight star buttons up to the chosen value.
 * @param {number} count
 */
function highlightStarButtons(count) {
  els.starInput.querySelectorAll("button").forEach((btn) => {
    const value = Number(btn.dataset.stars);
    btn.classList.toggle("is-selected", value <= count);
  });
}

/**
 * Read a selected image file as a base64 data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read photo."));
    reader.readAsDataURL(file);
  });
}

/* -------------------------------------------------------------------------- */
/* Main workflows                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Full refresh: locate user, fetch OSM data, merge local requests, render UI.
 */
async function locateAndLoadToilets() {
  els.btnLocate.disabled = true;
  setStatus("🏃 Triangulating your position…");

  try {
    userLocation = await getCurrentPosition();
    setUserMarker(userLocation.lat, userLocation.lng);
    map.setView([userLocation.lat, userLocation.lng], 15);

    setStatus("🗺️ Scouring the map for thrones, cafes, and sneaky restrooms…");

    const radius = Number(els.radiusSelect.value);
    const osmToilets = await fetchToiletsFromOSM(
      userLocation.lat,
      userLocation.lng,
      radius
    );

    const localToilets = getLocalRequestToilets(
      userLocation.lat,
      userLocation.lng,
      radius
    );

    toilets = prioritizeAndLimit(
      dedupeToilets([...osmToilets, ...localToilets]),
      userLocation.lat,
      userLocation.lng
    );

    seedDemoCollectors(toilets);

    const confirmed = toilets.filter((t) => t.kind === "confirmed").length;
    const likely = toilets.filter((t) => t.kind === "likely").length;

    setStatus(
      `🎉 Scout report: ${toilets.length} spot${toilets.length === 1 ? "" : "s"} (${confirmed} confirmed throne${confirmed === 1 ? "" : "s"}, ${likely} maybe-loo${likely === 1 ? "" : "s"}).`,
      "success"
    );
    renderToiletList();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.btnLocate.disabled = false;
  }
}

/**
 * Submit a rating (and optional photo) for the selected toilet.
 */
async function submitRating() {
  if (!selectedToilet) return;

  if (!isUserNearToilet(selectedToilet)) {
    setStatus(
      `🛑 Too far away! Get within ${PROXIMITY_METRES} m before reviewing.`,
      "error"
    );
    return;
  }

  if (!pendingStars) {
    setStatus("⭐ Pick some stars first, you shy reviewer.", "error");
    return;
  }

  /** @type {Rating} */
  const rating = {
    stars: pendingStars,
    text: els.reviewText.value.trim(),
    timestamp: Date.now(),
    userId: currentUser.id,
    username: currentUser.username,
    badges: [...currentUser.badges],
  };

  const file = els.photoInput.files?.[0];
  const hadCollector = Boolean(getCollectorForToilet(selectedToilet.id));
  if (file) {
    if (file.size > 800_000) {
      setStatus("📸 That photo’s huge — keep it under 800 KB please.", "error");
      return;
    }
    rating.photo = await readFileAsDataUrl(file);
  }

  if (!hadCollector) {
    const action = rating.photo ? "photo" : "rate";
    tryClaimSpot(selectedToilet.id, action);
    setStatus(
      `🏆 You collected “${selectedToilet.name}”! First ${action === "photo" ? "photo" : "review"} on the board — it’s yours.`,
      "success"
    );
  }

  addRating(selectedToilet.id, rating);
  currentUser = refreshUserBadges(currentUser);
  saveUser(currentUser);
  renderUserPanel();
  resetRatingForm();
  renderToiletList();
  openToiletDetail(selectedToilet);

  if (hadCollector) {
    setStatus("🎊 Review deployed! Future waddlers thank you.", "success");
  }
}

/**
 * Handle the “request a missing toilet” form.
 * @param {SubmitEvent} event
 */
async function handleAddRequest(event) {
  event.preventDefault();

  if (!userLocation) {
    setStatus("📍 Pin yourself on the map first, then snitch on a loo.", "error");
    return;
  }

  const name = els.requestName.value.trim();
  const notes = els.requestNotes.value.trim();

  if (!name) return;

  const request = {
    id: `req-${Date.now()}`,
    name,
    notes,
    lat: userLocation.lat,
    lng: userLocation.lng,
    createdAt: Date.now(),
    submittedBy: currentUser.id,
  };

  const requests = loadRequests();
  requests.push(request);
  saveRequests(requests);

  tryClaimSpot(request.id, "report");

  els.requestForm.reset();
  els.requestDialog.close();

  setStatus(`🚽 “${name}” is on the map — and YOU collected it first!`, "success");

  // Reload list so the new toilet shows up immediately
  const radius = Number(els.radiusSelect.value);
  const osmToilets = await fetchToiletsFromOSM(
    userLocation.lat,
    userLocation.lng,
    radius
  ).catch(() => []);
  const localToilets = getLocalRequestToilets(
    userLocation.lat,
    userLocation.lng,
    radius
  );
  toilets = prioritizeAndLimit(
    dedupeToilets([...osmToilets, ...localToilets]),
    userLocation.lat,
    userLocation.lng
  );
  renderUserPanel();
  renderToiletList();
}

/* -------------------------------------------------------------------------- */
/* Event listeners                                                            */
/* -------------------------------------------------------------------------- */

function bindEvents() {
  els.btnLocate.addEventListener("click", locateAndLoadToilets);

  els.radiusSelect.addEventListener("change", () => {
    if (userLocation) locateAndLoadToilets();
  });

  els.btnAddRequest.addEventListener("click", () => {
    if (!userLocation) {
      setStatus("🎯 Hit “Pin me!” first, then report a secret loo.", "error");
      return;
    }
    els.requestLocationHint.textContent = `📍 Pin drops at ${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)} — right where you’re standing.`;
    els.requestDialog.showModal();
  });

  els.requestForm.addEventListener("submit", handleAddRequest);
  els.btnSubmitRating.addEventListener("click", submitRating);

  // Close buttons must be type="button" — a submit button would trigger required-field validation.
  document.querySelectorAll(".dialog__close").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest("dialog")?.close();
    });
  });

  // Star picker buttons
  els.starInput.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!selectedToilet || !isUserNearToilet(selectedToilet)) return;
      pendingStars = Number(btn.dataset.stars);
      highlightStarButtons(pendingStars);
    });
  });

  // Re-check proximity if user moves while dialog is open (watch position)
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserMarker(userLocation.lat, userLocation.lng);
        if (selectedToilet && els.detailDialog.open) {
          updateProximityControls();
          const dist = distanceMetres(
            userLocation.lat,
            userLocation.lng,
            selectedToilet.lat,
            selectedToilet.lng
          );
          els.detailDistance.textContent = formatDistance(dist);
        }
      },
      () => {
        /* Ignore watch errors silently; initial locate still shows a message. */
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

initMap();
bindEvents();
renderUserPanel();
