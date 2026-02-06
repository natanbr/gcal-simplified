export interface MarineLocation {
    id: string;
    name: string;
    tideStation: string;
    currentStation: string;
    coords: {
        lat: number;
        lng: number;
    };
}

export const MARINE_LOCATIONS: MarineLocation[] = [
    {
        "id": "sooke",
        "name": "Sooke / East Sooke",
        "tideStation": "07020",      // Sooke
        "currentStation": "07090",    // Race Passage
        "coords": { "lat": 48.37, "lng": -123.72 }
    },
    {
        "id": "oak_bay",
        "name": "Oak Bay Islands",
        "tideStation": "07130",      // Oak Bay
        "currentStation": "07100",    // Juan de Fuca East (Best proxy)
        "coords": { "lat": 48.42, "lng": -123.30 }
    },
    {
        "id": "gordon_head",
        "name": "Gordon Head",
        "tideStation": "07130",      // Oak Bay (Closest active)
        "currentStation": "07100",    // Juan de Fuca East
        "coords": { "lat": 48.49, "lng": -123.30 }
    },
    {
        "id": "point_no_point",
        "name": "Point No Point",
        "tideStation": "07010",      // Point No Point
        "currentStation": "07090",    // Race Passage (Ref)
        "coords": { "lat": 48.39, "lng": -123.97 }
    },
    {
        "id": "sombrio",
        "name": "Sombrio / Jordan River",
        "tideStation": "07010",      // Point No Point (Closest active)
        "currentStation": "07090",    // Race Passage (Ref)
        "coords": { "lat": 48.43, "lng": -124.30 }
    },
    {
        "id": "port_renfrew",
        "name": "Port Renfrew",
        "tideStation": "07010",      // Point No Point (Ref)
        "currentStation": "07090",    // Race Passage (Ref)
        "coords": { "lat": 48.55, "lng": -124.41 }
    },
    {
        "id": "salt_spring",
        "name": "Salt Spring (Fulford)",
        "tideStation": "07330",      // Fulford Harbour
        "currentStation": "07527",    // Active Pass (Primary Current Source)
        "coords": { "lat": 48.77, "lng": -123.45 }
    },
    {
        "id": "gulf_islands",
        "name": "Galiano / Saturna",
        "tideStation": "07527",      // Active Pass (Tide)
        "currentStation": "07527",    // Active Pass (Current)
        "coords": { "lat": 48.86, "lng": -123.31 }
    }
];
