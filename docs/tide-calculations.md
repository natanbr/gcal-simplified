# Tide and Marine Data Documentation

This document explains in detail how tide, current, and marine parameters are retrieved, calculated, and displayed in the application.

## 1. Data Sources and APIs

The application uses two primary APIs for marine information, centered around **Whiffin Spit, Sooke, BC**.

### Location Metadata

- **Latitude**: `48.3746`
- **Longitude**: `-123.7276`
- **Station ID (CHS)**: `07020` (Sooke Station)
- **Timezone**: `America/Vancouver`

### APIs Used

#### A. Open-Meteo Marine API

Provides oceanographic model data including currents, waves, and sea temperature.

- **Base URL**: `https://marine-api.open-meteo.com/v1/marine`
- **Example Fetch**:
  `https://marine-api.open-meteo.com/v1/marine?latitude=48.3746&longitude=-123.7276&hourly=wave_height,wave_period,swell_wave_height,swell_wave_period,sea_surface_temperature&timezone=America%2FVancouver`
  _(Note: ocean_current_velocity only used as fallback)_

#### B. Canadian Hydrographic Service (CHS) IWLS API

Provides official water level observations and predictions.

- **Base URL**: `https://api-iwls.dfo-mpo.gc.ca/api/v1`
- **Tide Heights (Hourly/wlp)**:
  `https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/{tide_station_id}/data?time-series-code=wlp...`
- **Tidal Extremes (High/Low/wlp-hilo)**:
  `https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/{tide_station_id}/data?time-series-code=wlp-hilo...`
- **Current Predictions (Hourly/wcp)**:
  `https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/{current_station_id}/data?time-series-code=wcp...`
- **Current Extremes (Slack/Max/wcp-hilo)**:
  `https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/{current_station_id}/data?time-series-code=wcp-hilo...`

---

## 2. API Response Structures

### Open-Meteo Marine

Returns hourly arrays of marine parameters.

```json
{
  "hourly": {
    "time": ["2026-02-05T00:00", "2026-02-05T01:00", "2026-02-05T02:00"],
    "ocean_current_velocity": [0.5, 0.2, 0.1],
    "ocean_current_direction": [90, 95, 100],
    "wave_height": [0.4, 0.5, 0.4]
  }
}
```

### CHS IWLS (wlp / wlp-hilo)

Returns a list of timestamped water level events.

```json
[
  { "eventDate": "2026-02-05T13:54:00Z", "value": 3.12 },
  { "eventDate": "2026-02-05T20:21:00Z", "value": 0.45 }
]
```

_Note: Value is water level in meters relative to chart datum._

---

## 3. Data Parameters Mapping

| Parameter              | Source API     | Requirement / Logic                                        |
| :--------------------- | :------------- | :--------------------------------------------------------- |
| **Tide Height**        | CHS (wlp)      | Hourly water level samples.                                |
| **High/Low Tide**      | CHS (wlp-hilo) | Official prediction for tidal extremes.                    |
| **Current Speed**      | CHS (wcp)      | Hourly current velocity predictions.                       |
| **Current Direction**  | CHS (wcp)      | Current bearing (if available) or inferred from +/- speed. |
| **Wave Height/Period** | Open-Meteo     | Swell wave characteristics.                                |
| **Water Temp**         | Open-Meteo     | Sea surface temperature (°C).                              |
| **Slack Water Time**   | CHS (wcp-hilo) | Official slack water times from CHS.                       |
| **Max Ebb/Flood**      | CHS (wcp-hilo) | Official max current times from CHS.                       |
| **Slack Windows**      | Calculated     | Time span where current speed stays below 0.5 knots.       |

---

## 4. Calculated Parameters & Logic

### A. Precise Extreme Time (Parabolic Interpolation)

**Assumption**: Tidal and current curves follow a roughly parabolic shape near their peaks and troughs.
**Source**: Three hourly data points centered on a local peak/trough.
**PSEUDO-REF**: `interpolate_extreme_time`

### B. Current Events (Slack, Max Flood, Max Ebb)

We fetch current events from CHS using the `wcp-hilo` or `wcp1-events` time-series code.

**Data Mapping Table:**

| CHS Field          | Value/Qualifier | App Event Type |
| :----------------- | :-------------- | :------------- |
| `qualifier`        | `SLACK`         | `Slack Water`  |
| `qualifier`        | `EXTREMA_FLOOD` | `Max Flood`    |
| `qualifier`        | `EXTREMA_EBB`   | `Max Ebb`      |
| `value` (fallback) | `> 0`           | `Max Flood`    |
| `value` (fallback) | `< 0`           | `Max Ebb`      |
| `value` (fallback) | `~ 0`           | `Slack Water`  |

> **Note:** For Race Passage (Station 07040), the data comes from `wcp1-events`, which explicitly provides the `qualifier` field (e.g., `EXTREMA_FLOOD`, `EXTREMA_EBB`). This is prioritized over value checks.

### C. Slack Window Boundaries (Linear Interpolation)

**Assumption**: Change in current speed is roughly linear between hourly data points when crossing a threshold.
**Source**: Two hourly data points (one above and one below the threshold).
**PSEUDO-REF**: `calculate_slack_boundaries`

### C. Peak Detection

**Logic**: Iterates through hourly data. If the trend changes from increasing to decreasing (or vice versa), an extreme event is identified at the previous index.
**PSEUDO-REF**: `detect_peak_indices`

---

## 5. High-Level Pseudo-Code

### `calculate_vertex_offset(y1, y2, y3)`

_Calculates the horizontal offset (-0.5 to +0.5 hours) for the vertex of a parabola._

```python
def find_vertex_offset(y1, y2, y3):
    denominator = 2 * (y1 + y3 - 2 * y2)
    if abs(denominator) < 0.0001:
        return 0 # Flat plateau or linear
    return -(y3 - y1) / denominator
```

### `interpolate_extreme_time(times, values, index)`

_Refines an hourly index into a precise timestamp._

```python
def interpolate_extreme_time(times, values, index):
    y1 = values[index-1]
    y2 = values[index]
    y3 = values[index+1]

    offset_hours = find_vertex_offset(y1, y2, y3)
    # Clamp offset to +/- 30 minutes to stay within the hourly bounds
    clamped_offset = clamp(offset_hours, -0.5, 0.5)

    base_time = parse_iso(times[index])
    return base_time + (clamped_offset * 60 minutes)
```

### `calculate_slack_boundaries(times, speeds, slack_index, threshold=0.5)`

_Finds the 'start' and 'end' of a safe slack window._

```python
def calculate_slack_boundaries(times, speeds, slack_idx, threshold):
    # 1. Expand backwards to find index where speed > threshold
    start_idx = find_first_speed_above_threshold_backwards(slack_idx)

    # 2. Linearly interpolate start time
    v_prev = speeds[start_idx-1]
    v_curr = speeds[start_idx]
    # Solve for t where speed == threshold
    fraction = (v_prev - threshold) / (v_prev - v_curr)
    precise_start = times[start_idx-1] + (fraction * 1 hour)

    # 3. Repeat forwards for precise_end
    # ...
    return (precise_start, precise_end)
```

### `detect_peak_indices(values)`

_Finds indices of local maxima/minima._

```python
def find_peaks(values):
    peaks = []
    trend = 0 # 1: up, -1: down
    for i in range(1, len(values)):
        diff = values[i] - values[i-1]
        if diff > epsilon:
            if trend == -1:
                peaks.append(i-1) # Local minimum
            trend = 1
        elif diff < -epsilon:
            if trend == 1:
                peaks.append(i-1) # Local maximum
            trend = -1
    return peaks
```
