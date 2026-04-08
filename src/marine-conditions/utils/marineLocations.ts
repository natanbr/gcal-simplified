import type { MarineLocation } from '../types';

// Re-export MarineLocation for backward compat within module
export type { MarineLocation };

export const MARINE_LOCATIONS: MarineLocation[] = [
    {
        "id": "sooke",
        "name": "Sooke / East Sooke",
        "tideStation": "07020",      // Sooke
        "currentStation": "07090",    // Race Passage
        "coords": { "lat": 48.37, "lng": -123.72 }
    },
    {
        "id": "oak-bay",
        "name": "Oak Bay Islands",
        "tideStation": "07130",
        "currentStation": "07100",
        "coords": { "lat": 48.42, "lng": -123.30 }
    },
    {
        "id": "gordon-head",
        "name": "Gordon Head",
        "tideStation": "07130",
        "currentStation": "07100",
        "coords": { "lat": 48.49, "lng": -123.30 }
    },
    {
        "id": "point-no-point",
        "name": "Point No Point",
        "tideStation": "07010",
        "currentStation": "07090",
        "coords": { "lat": 48.39, "lng": -123.97 }
    },
    {
        "id": "sombrio",
        "name": "Sombrio / Jordan River",
        "tideStation": "07010",
        "currentStation": "07090",
        "coords": { "lat": 48.43, "lng": -124.30 }
    },
    {
        "id": "port-renfrew",
        "name": "Port Renfrew",
        "tideStation": "07010",
        "currentStation": "07090",
        "coords": { "lat": 48.55, "lng": -124.41 }
    },
    {
        "id": "salt-spring",
        "name": "Salt Spring (Fulford)",
        "tideStation": "07330",
        "currentStation": "07527",
        "coords": { "lat": 48.77, "lng": -123.45 }
    },
    {
        "id": "gulf-islands",
        "name": "Galiano / Saturna",
        "tideStation": "07527",
        "currentStation": "07527",   // Active Pass — same ID; both wlp + wcp fetched
        "coords": { "lat": 48.86, "lng": -123.31 }
    }
];

/** Convenience: find a location by id, falling back to first location */
export function getLocationById(id: string): MarineLocation {
    return MARINE_LOCATIONS.find(l => l.id === id) ?? MARINE_LOCATIONS[0];
}
