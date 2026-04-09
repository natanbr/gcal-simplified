import type { MarineLocation } from '../types';

// Re-export MarineLocation for backward compat within module
export type { MarineLocation };

// ── Location Registry ─────────────────────────────────────────────────────────
//
// Deduplication rule: every entry MUST have a unique (tideStation, currentStation) pair.
// Sites sharing identical stations produce identical data — do NOT add duplicates.
//
// Available CHS current stations in the southern Vancouver Island / Juan de Fuca region:
//   07090  Race Passage    (48.31, -123.54) — primary reference for Strait crossings
//   07100  Juan de Fuca East (48.23, -123.53) — open-water JdF, east
//   07527  Active Pass     (48.86, -123.31) — Gulf Islands tidal channel
//
// ⚠️ No CHS current station exists west of Race Passage in the strait.
//    Port Renfrew / Sombrio / Jordan River all fall back to Race Passage.
//    NOAA NDBC buoy FRDW1 (Destruction Island, WA) monitors the western strait
//    but is currently used as reference only (see Hydrography Data Engineer resources).

export const MARINE_LOCATIONS: MarineLocation[] = [
    // ── West Strait: open-coast surf/ dive sites, Race Passage currents ─────────
    {
        id: "port-renfrew",
        name: "Port Renfrew",
        tideStation: "08525",   // Port Renfrew — own CHS tide station at 48.555, -124.421
        currentStation: "07090", // Race Passage — best available; no CHS station further west
        coords: { lat: 48.55, lng: -124.41 }
    },
    {
        id: "point-no-point",
        name: "Point No Point / Jordan River",
        tideStation: "07010",   // Point No Point — 48.3951, -123.9709
        currentStation: "07090", // Race Passage
        coords: { lat: 48.39, lng: -123.97 }
    },
    {
        id: "sheringham",
        name: "Sheringham Point",
        tideStation: "07013",   // Sheringham Point — 48.377, -123.921
        currentStation: "07090", // Race Passage
        coords: { lat: 48.38, lng: -123.92 }
    },
    {
        id: "sooke",
        name: "Sooke / East Sooke",
        tideStation: "07020",   // Sooke — 48.3695, -123.726
        currentStation: "07090", // Race Passage
        coords: { lat: 48.37, lng: -123.72 }
    },
    // ── Victoria / Race Rocks: Race Passage currents ──────────────────────────
    {
        id: "becher-bay",
        name: "Becher Bay / Race Rocks",
        tideStation: "07030",   // Becher Bay — 48.3349, -123.6038
        currentStation: "07090", // Race Passage — dominant channel current here
        coords: { lat: 48.33, lng: -123.60 }
    },
    {
        id: "pedder-bay",
        name: "Pedder Bay",
        tideStation: "07080",   // Pedder Bay — 48.3317, -123.5501
        currentStation: "07090", // Race Passage
        coords: { lat: 48.33, lng: -123.55 }
    },
    {
        id: "william-head",
        name: "William Head / Witty's Lagoon",
        tideStation: "07082",   // William Head — 48.341, -123.5369
        currentStation: "07090", // Race Passage
        coords: { lat: 48.34, lng: -123.54 }
    },
    // ── Victoria / Oak Bay: Juan de Fuca East currents ───────────────────────
    {
        id: "clover-point",
        name: "Clover Point",
        tideStation: "07115",   // Clover Point — 48.4038, -123.3486
        currentStation: "07100", // Juan de Fuca - East
        coords: { lat: 48.40, lng: -123.35 }
    },
    {
        id: "oak-bay",
        name: "Oak Bay / Ten Mile Point",
        tideStation: "07130",   // Oak Bay — 48.4237, -123.3027
        currentStation: "07100", // Juan de Fuca - East
        coords: { lat: 48.42, lng: -123.30 }
    },
    {
        id: "finnerty-cove",
        name: "Finnerty Cove / Cadboro Bay",
        tideStation: "07140",   // Finnerty Cove — 48.4736, -123.2961
        currentStation: "07100", // Juan de Fuca - East
        coords: { lat: 48.47, lng: -123.30 }
    },
    // ── Saanich Inlet ─────────────────────────────────────────────────────────
    {
        id: "brentwood-bay",
        name: "Brentwood Bay (Saanich Inlet)",
        tideStation: "07280",   // Brentwood Bay — 48.578, -123.467
        currentStation: "07090", // Race Passage — no dedicated inlet current station in CHS
        coords: { lat: 48.58, lng: -123.47 }
    },
    // ── Gulf Islands ──────────────────────────────────────────────────────────
    {
        id: "salt-spring",
        name: "Salt Spring (Fulford Harbour)",
        tideStation: "07330",   // Fulford Harbour — 48.769, -123.451
        currentStation: "07527", // Active Pass — 48.860, -123.313
        coords: { lat: 48.77, lng: -123.45 }
    },
    {
        id: "gulf-islands",
        name: "Galiano / Saturna (Active Pass)",
        tideStation: "07330",   // Fulford Harbour — nearest tide station with wlp data
        // FIXED: Active Pass (07527) has NO wlp/wlp-hilo series (HTTP 404).
        // Using Fulford Harbour tides instead.
        currentStation: "07527", // Active Pass — wcp1-events + wcsp1 confirmed available
        coords: { lat: 48.86, lng: -123.31 }
    },
];

/** Convenience: find a location by id, falling back to first location */
export function getLocationById(id: string): MarineLocation {
    return MARINE_LOCATIONS.find(l => l.id === id) ?? MARINE_LOCATIONS[0];
}
