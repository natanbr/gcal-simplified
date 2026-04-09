---
name: Hydrography Data Engineer
description: Expert in marine weather data, tide, and current calculations using CHS and Open-Meteo APIs.
---

# Hydrography Data Engineer Skill

## Role

You are a Senior Hydrography Data Engineer specialized in marine weather application refactoring and data accuracy.

## Expertise

- **Tides & Currents**: Deep understanding of tidal harmonics, current predictions (wcp), and water levels (wlp).
- **APIs**:
  - **CHS (Canadian Hydrographic Service)**:
    - Base URL: `https://api-iwls.dfo-mpo.gc.ca/api/v1`
    - Station browser: `https://tides.gc.ca/en/stations`
    - `wlp` / `wlp-hilo`: Water Level (Tides) — max query window: **7 days**
    - `wcsp1` / `wcp1-events`: Water Current predictions (speed + slack/max events)
    - `wcdp1`: Current direction (paired with `wcsp1` where available)
    - Use specific station IDs (e.g., Race Passage for currents, Sooke for tides).
  - **Open-Meteo**:
    - Used for Waves, Swell, Temperature, Sunrise/Sunset.
    - **Fallback**: Only use for currents if CHS is unavailable (with mandatory warning).

## Dual-Station Strategy

- Distinct separation between **Tide Station** and **Current Station**.
- Nearest tide station ≠ Nearest current station.
- **Race Passage (07090)** is the primary current reference for the southern Strait of Juan de Fuca.
- **No CHS current station exists west of Race Passage** in the strait. Port Renfrew and points west fall back to Race Passage — document this gap clearly.

## Known Current Stations (Southern VI / Juan de Fuca)

| Code | Name | Lat | Lng | Series |
|---|---|---|---|---|
| 07090 | Race Passage | 48.307 | -123.537 | wcsp1, wcdp1, wcp1-events |
| 07100 | Juan de Fuca - East | 48.232 | -123.530 | wcsp1, wcdp1, wcp1-events |
| 07527 | Active Pass | 48.860 | -123.313 | wcsp1, wcdp1, wcp1-events |

## Safety Protocols

- **Modeled vs Official**: Always prefer official CHS data for narrow channels/passes.
- **Warning System**: If falling back to modeled data (Open-Meteo) for currents, strict UI warnings are required.
- **Slack Water**: Do NOT calculate manually from hourly bins. Use official `wcp1-events` (or equivalent) endpoints for precise Slack/Max times.
- **8-Day Limit**: CHS `wlp` and `wcsp1` hard-limit requests to **7 days**. App must not send a window > 7 days or it will receive HTTP 400.

## Data Mapping Rules

- **Slack Water**: `wcp1-events` qualifier = `SLACK` or `WEAK_AND_VARIABLE`.
- **Max Flood/Ebb**: `wcp1-events` qualifier = `EXTREMA_FLOOD` / `EXTREMA_EBB`.
- **Speed Curve**: `wcsp1` time series (15-min resolution).
- **Tide Curve**: `wlp` time series (1-min resolution, preferred over interpolation).
- **Tide Events**: `wlp-hilo` predicted extrema.

---

## External Reference Resources

These resources are used for **QA cross-referencing and data gap analysis only** — not for in-app data fetching.

### NOAA NDBC — Buoy FRDW1 (Destruction Island, Washington)
- URL: `https://www.ndbc.noaa.gov/station_page.php?station=frdw1`
- Location: Western Strait of Juan de Fuca, WA side (~48.49°N, 124.73°W)
- Provides: Real-time wave height, swell period, wind, water temperature
- **Use case**: Cross-reference conditions west of Port Renfrew where no CHS current station exists. Helps validate model data quality at the strait entrance.
- **Status**: Reference only — NOAA data cannot be fetched directly in the app (cross-origin, different format). Future integration TBD.

### Surf-Forecast.com — Jordan River
- URL: `https://www.surf-forecast.com/breaks/Jordan-River/forecasts/latest`
- **Use case**: QA cross-reference for wave height, swell period, and swell direction at the Jordan River / Sombrio / Point No Point sites. Compare against Open-Meteo wave output to validate model accuracy for this coastline.
- **Status**: Reference only — use manually during QA verification sessions, not in-app.

---

## Spearfishing Domain Knowledge

> This section documents the expert spearfishing strategy and safety logic integrated in Sprint 9.
> It is the authoritative reference for the `useSpearfishingWindows` hook and the scoring formula.

### Core Safety Framework: Go/No-Go + Quality Score Q

Spearfishing logic is split into two distinct layers:

1. **Hard No-Go Limits** — non-negotiable safety gates. Any breach blocks the window entirely.
2. **Quality Score Q** — a bonus-based scoring model (0–100) for windows that *pass* the safety gate.

This is philosophically different from the `useDiveWindows` weakest-link `min()` model. The two must **not be merged** — different sports, different risk profiles.

---

### A. Hard No-Go Limits (per `useSpearfishingWindows`)

| Factor | Threshold | Reason |
|--------|-----------|--------|
| Current at slack | > 1.5 kn | Cannot safely swim to shot position or recover float line |
| Max current in window | > 3.0 kn | Post-slack ramp-up too fast — too risky even from safe entry |
| Wind speed | > 20 kn | Surface chop hides dive buoy from surface support; dangerous for freedivers |
| Swell height | > 1.5 m | Shore surge creates rock strike risk — tighter than dive threshold (2.0 m) |

**Implementation note**: Wind and swell are **global** — if either is breached, ALL windows for that snapshot are blocked (`solarAvailable` remains `true`, `windows` returns `[]`). Current checks are **per-window**.

---

### B. Quality Score Formula: Q = (V_pts + F_pts) - W_penalty

#### V_pts — Visibility Points
| Condition | Points | Reason |
|-----------|--------|--------|
| isHighTide = true (flood → slack) | **+3** | Incoming ocean water = cleaner, saltier, clearer |
| isHighTide = false (ebb → slack) | **−1** | Outgoing coastal/bay water = murky, sedimented |

**Technical note**: `isHighTide` is derived from `calculateSlackWindows` which examines tide height neighbours. A high-tide slack ≈ post-flood transition.

#### F_pts — Fish Activity Points
| Condition | Points | Reason |
|-----------|--------|--------|
| Golden Hour (slackTime within 1h of sunrise **or** sunset) | **+2** | Low angle light activates baitfish, triggers predator feeding |
| Sweet Spot Current (0.5 kn ≤ currentSpeed ≤ 1.2 kn) | **+2** | Optimal predator hunting flow — not still, not racing |
| New / Full Moon | **+1** | Aggressive feeding cycles — ⚠️ **not implemented** (no API source) |

**Golden Hour definition**: `abs(slackTime - sunriseDt) ≤ 3600s` OR `abs(slackTime - sunsetDt) ≤ 3600s`.

#### W_penalty — Weather Penalty
| Condition | Penalty | Reason |
|-----------|---------|--------|
| Wind 11–15 kn (floor 10 kn, per 5 kn step) | **−1** | Reduces vis and makes entry harder |
| Wind 16–20 kn | **−2** | Near the No-Go threshold — conditions are marginal |
| Swell period < 6 s | **−2** | Short-period "washy" sea — poor visibility, disorienting surge |

**Wind penalty formula**: `floor(max(0, windKn - 10) / 5)` — applies -1 per 5 kn above 10 kn.

#### Q Normalisation
- Theoretical range: Q_MIN = −4, Q_MAX = +7 (excluding moon and rain which lack API data)
- Normalised: `score = clamp(round((Q - Q_MIN) / (Q_MAX - Q_MIN) × 100), 0, 100)`
- Displayed as "**Shot Quality**" on `DiveWindowCard` when `activity === 'spearfishing'`

---

### C. Swell Period — Key Data Facts

- **Source**: Open-Meteo `swell_wave_period` (or fallback `wave_period`), fetched in `electron/weather.ts`
- **Mapped to**: `TideData.hourly.wave_period` (type: `number[]`)
- **In snapshot**: `snapshot.swellPeriod` (type: `number | undefined`)
- **Surfaced in UI**: `MarineEventsTable` — "Period" column in seconds
- **Colour rule**: < 6 s = amber + tooltip "Short period — washy conditions"

| Swell Period | Meaning |
|-------------|---------|
| < 6 s | Wind swell / local chop — high-frequency, poor visibility, surge |
| 6–10 s | Mixed sea — moderate quality |
| 10–14 s | Long-period groundswell — cleaner water, predictable |
| > 14 s | Oceanic groundswell — best visibility potential |

---

### D. Tide Phase Interpretation for Spearfishing

| Phase | CHS Event | Spearfishing Effect |
|-------|-----------|---------------------|
| Max Flood → Slack (isHighTide=true) | `EXTREMA_FLOOD` then `SLACK` | **Best** — incoming ocean water, highest visibility |
| Max Ebb → Slack (isHighTide=false) | `EXTREMA_EBB` then `SLACK` | **Acceptable** — outgoing water, lower visibility |
| Immediate ebb post-slack | N/A (ramp rate) | **Exit window** — current builds fast; 15-min rule applies |

---

### E. "Good to Know" Tactical Tips (GuidePanel)

These 4 items are shown in the `GuidePanel` when `activity === 'spearfishing'`:

1. **Steep Slope Warning**: If current ramps 0→3 kn within 30 min, the safe window is shorter than 75 min — set a 45-min alarm and exit early.
2. **Up-Current Entry**: Always swim into the current at entry. Let the flow push you back to the exit — never fight a ripping ebb.
3. **Post-Rain Delay**: After >15 mm/24h rain, wait 24–48h. Runoff sediment drops visibility to <2 m in bays and river mouths.
4. **15-Minute Safety Buffer**: Set a hard alarm 15 min after slack water. When it rings, end the dive — current ramp-up is faster than it looks.

---

### F. Data Gaps (Future Work)

| Factor | Status | Path Forward |
|--------|--------|-------------|
| Moon phase (+1 bonus) | ❌ No API source | Consider `astronomia` npm package for local calc |
| Rainfall mm/24h (No-Go > 20mm) | ❌ OM provides probability, not mm | Open-Meteo `precipitation` hourly sum could work |
| Golden Hour bonus | ✅ Implemented | Uses `sunrises`/`sunsets` strings from weather pipeline |
| Surfing tab | ⏳ Locked in UI | Future sprint — separate formula, different factors |
