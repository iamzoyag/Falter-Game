// Where the player is, as precisely as we can say it in words.
//
// The timezone is no good for this: "Asia/Kolkata" covers all of India (it
// said "Calcutta" to a player in Mumbai). So, if the player allows it, we ask
// the browser for its location (on a laptop that's Wi-Fi positioning, usually
// within a few dozen metres in a city) and turn it into a name with two free
// OpenStreetMap services:
//   1. Photon (photon.komoot.io): the named places nearest the point. A named
//      residential complex or building is best ("at kanakia paris"); else a
//      landmark close by ("near kherwadi police station").
//   2. Nominatim (nominatim.openstreetmap.org): the neighbourhood / suburb
//      ("in bandra east"), and the city.
// One lookup each, at the start of the game, in the background. Nothing is
// saved: the coordinates are dropped once the names come back.
//
// whereabouts() is the current state; placePhrase() is "at kanakia paris" /
// "near …" / "in bandra east" / "in mumbai" / "" (nothing known: say nothing,
// rather than something wrong).

const PHOTON = "https://photon.komoot.io/reverse";
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

const state = { status: "idle", place: null, area: null, city: null, accuracy: null };

export function whereabouts() {
  return state;
}

/** Ask once (call from a user gesture, e.g. the consent button). Never throws. */
export async function requestWhereabouts() {
  if (state.status !== "idle") return state;
  if (!navigator.geolocation) { state.status = "unavailable"; return state; }
  state.status = "asking";
  const pos = await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true, timeout: 20000, maximumAge: 10 * 60 * 1000
    });
  });
  if (!pos) { state.status = "denied"; return state; }
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  state.accuracy = Math.round(accuracy);
  const [place, area] = await Promise.all([nearbyPlace(lat, lon, accuracy), areaName(lat, lon)]);
  Object.assign(state, { status: "ready", place, area: area?.area || null, city: area?.city || null });
  return state;
}

/** "at kanakia paris" / "near …" / "in bandra east" / "in mumbai" / "". Lowercase, in Mochi's voice. */
export function placePhrase() {
  const lc = (s) => String(s).toLowerCase();
  if (state.place?.kind === "at") return `at ${lc(state.place.name)}`;
  if (state.place?.kind === "near") return `near ${lc(state.place.name)}`;
  if (state.area) return `in ${lc(state.area)}`;
  if (state.city) return `in ${lc(state.city)}`;
  return "";
}

// ---------------------------------------------------------------- lookups

// somewhere people live: a named complex, building or tiny neighbourhood
const isHome = (k, v) =>
  (k === "landuse" && v === "residential") || k === "building" ||
  (k === "place" && /^(neighbourhood|quarter|hamlet|isolated_dwelling|locality)$/.test(v));
// something a person would recognise as "near here"
const isLandmark = (k) => ["amenity", "leisure", "tourism", "shop", "historic", "office", "railway", "aeroway", "building", "landuse"].includes(k);

async function nearbyPlace(lat, lon, accuracy) {
  if (!(accuracy < 400)) return null; // too rough to name a building (IP-level fixes are km off)
  const radiusKm = Math.min(0.35, Math.max(0.25, (accuracy / 1000) * 2));
  const data = await getJson(`${PHOTON}?lat=${lat}&lon=${lon}&limit=15&radius=${radiusKm}&lang=en`);
  const feats = (data?.features || [])
    .map((f) => ({
      name: f.properties?.name,
      key: f.properties?.osm_key,
      value: f.properties?.osm_value,
      dist: metres(lat, lon, f.geometry?.coordinates?.[1], f.geometry?.coordinates?.[0])
    }))
    .filter((f) => f.name && f.key !== "highway" && Number.isFinite(f.dist) && f.name.length <= 40)
    .sort((a, b) => a.dist - b.dist);
  const home = feats.find((f) => isHome(f.key, f.value));
  // a complex's point is its middle, so allow for its size as well as the fix's accuracy
  if (home && home.dist <= Math.max(120, accuracy * 1.5)) return { name: home.name, kind: "at" };
  // otherwise whatever named place is closest (a complex across the road, a landmark)
  const near = feats.find((f) => (isHome(f.key, f.value) || isLandmark(f.key)) && f.dist <= 220);
  if (near) return { name: near.name, kind: "near" };
  return null;
}

async function areaName(lat, lon) {
  // zoom 16 gives the suburb people actually use ("bandra east"); coarser zooms can give the ward
  const data = await getJson(`${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1&accept-language=en`);
  const a = data?.address;
  if (!a) return null;
  const ok = (n) => (n && !/\b(ward|zone|district)\b/i.test(n) ? n : null); // admin names nobody says out loud
  return {
    area: ok(a.suburb) || ok(a.neighbourhood) || ok(a.quarter) || ok(a.city_district) || null,
    city: a.city || a.town || a.village || a.county || null
  };
}

async function getJson(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, referrerPolicy: "strict-origin-when-cross-origin" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function metres(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN;
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
