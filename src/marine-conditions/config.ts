// ── Marine Conditions — Named Constants ────────────────────────────────────────
// Change values here, not scattered in calculations.

/** Current speed (knots) below which we consider it "slack" */
export const SLACK_THRESHOLD = 0.5;

/** Number of days ahead to compute dive windows and show in events table */
export const FORECAST_DAYS = 7;

/** Floating-point epsilon: prevents exact-0.5 from being ambiguous */
export const EPSILON = 0.001;

/** Minutes of buffer before/after civil sunrise/sunset for daylight filter */
export const DAYLIGHT_BUFFER_MINS = 30;

/** localStorage key for persisted marine settings — bump version on breaking change */
export const MARINE_SETTINGS_KEY = 'marine-settings-v1';

/** Default location ID if nothing is persisted */
export const DEFAULT_LOCATION_ID = 'sooke';
