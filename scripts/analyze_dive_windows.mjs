// Analyze dive windows from the raw data provided by the user
// Times in hilo are UTC (Z suffix), hourly times are local (no suffix) = PDT (UTC-7)
// Current time: 2026-04-09T11:11 PDT = 2026-04-09T18:11 UTC

const SLACK_THRESHOLD = 0.5; // kn (from config)
const MIN_WINDOW = 30; // minutes
const MAX_HALF_BINS = 4;

// ── Raw hilo events (UTC) → convert to local PDT for display ─────────────────
const hilo = [
  { time: "2026-04-08T19:09:00Z", value: 4.067, type: "Max Ebb" },
  { time: "2026-04-08T20:44:00Z", value: 0.925, type: "Low Tide" },
  { time: "2026-04-08T22:51:00Z", value: 0, type: "Slack Water" },
  { time: "2026-04-09T01:47:00Z", value: 4.09, type: "Max Flood" },
  { time: "2026-04-09T06:23:00Z", value: 0, type: "Slack Water" },
  { time: "2026-04-09T09:24:00Z", value: 2.741, type: "Max Ebb" },
  { time: "2026-04-09T11:53:00Z", value: 2.678, type: "High Tide" },
  { time: "2026-04-09T14:23:00Z", value: 0.89, type: "Max Ebb" },  // NOTE: 0.89 kn - very weak!
  { time: "2026-04-09T20:08:00Z", value: 3.627, type: "Max Ebb" },
  { time: "2026-04-09T21:39:00Z", value: 0.978, type: "Low Tide" },
  { time: "2026-04-09T23:44:00Z", value: 0, type: "Slack Water" }, // APR 9 16:44 PDT
  { time: "2026-04-10T02:47:00Z", value: 3.689, type: "Max Flood" },
  { time: "2026-04-10T07:21:00Z", value: 0, type: "Slack Water" }, // APR 10 00:21 PDT (night → filtered)
  { time: "2026-04-10T10:52:00Z", value: 2.789, type: "Max Ebb" },
  { time: "2026-04-10T12:48:00Z", value: 2.57, type: "High Tide" },
  { time: "2026-04-10T15:53:00Z", value: 1.112, type: "Max Ebb" }, // NOTE: 1.112 kn
  { time: "2026-04-10T21:20:00Z", value: 3.295, type: "Max Ebb" },
  { time: "2026-04-10T22:37:00Z", value: 1.021, type: "Low Tide" },
  { time: "2026-04-11T00:42:00Z", value: 0, type: "Slack Water" }, // APR 10 17:42 PDT
  { time: "2026-04-11T05:03:00Z", value: 3.647, type: "Max Flood" },
  { time: "2026-04-11T08:12:00Z", value: 0, type: "Slack Water" }, // APR 11 01:12 PDT (night → filtered)
  { time: "2026-04-11T12:24:00Z", value: 3.165, type: "Max Ebb" },
  { time: "2026-04-11T14:20:00Z", value: 2.45, type: "High Tide" },
  { time: "2026-04-11T17:07:00Z", value: 0.632, type: "Max Ebb" }, // NOTE: 0.632 kn
  { time: "2026-04-11T22:30:00Z", value: 3.223, type: "Max Ebb" },
  { time: "2026-04-11T23:35:00Z", value: 1.058, type: "Low Tide" },
  { time: "2026-04-12T01:46:00Z", value: 0, type: "Slack Water" }, // APR 11 18:46 PDT
  { time: "2026-04-12T05:56:00Z", value: 3.839, type: "Max Flood" },
  { time: "2026-04-12T07:46:00Z", value: 2.333, type: "High Tide" },
  { time: "2026-04-12T08:55:00Z", value: 0, type: "Slack Water" }, // APR 12 01:55 PDT (night)
  { time: "2026-04-12T12:33:00Z", value: 2.209, type: "Low Tide" }, // unusual: Low Tide in middle
  { time: "2026-04-12T13:14:00Z", value: 3.616, type: "Max Ebb" },
  { time: "2026-04-12T15:55:00Z", value: 2.357, type: "High Tide" },
  { time: "2026-04-12T18:18:00Z", value: 0, type: "Slack Water" }, // APR 12 11:18 PDT
  { time: "2026-04-12T23:31:00Z", value: 3.367, type: "Max Ebb" },
  { time: "2026-04-13T00:29:00Z", value: 1.099, type: "Low Tide" },
  { time: "2026-04-13T02:50:00Z", value: 0, type: "Slack Water" }, // APR 12 19:50 PDT
  { time: "2026-04-13T06:37:00Z", value: 3.927, type: "Max Flood" },
  { time: "2026-04-13T07:49:00Z", value: 2.365, type: "High Tide" },
  { time: "2026-04-13T09:30:00Z", value: 0, type: "Slack Water" }, // APR 13 02:30 PDT (night)
  { time: "2026-04-13T13:22:00Z", value: 1.975, type: "Low Tide" },
  { time: "2026-04-13T13:37:00Z", value: 3.998, type: "Max Ebb" },
  { time: "2026-04-13T17:13:00Z", value: 0, type: "Slack Water" }, // APR 13 10:13 PDT
  { time: "2026-04-13T17:27:00Z", value: 2.31, type: "High Tide" },
  { time: "2026-04-13T18:52:00Z", value: 1.423, type: "Max Flood" }, // NOTE: 1.423 kn
  { time: "2026-04-13T21:13:00Z", value: 0, type: "Slack Water" }, // APR 13 14:13 PDT
  { time: "2026-04-14T00:25:00Z", value: 3.592, type: "Max Ebb" },
  { time: "2026-04-14T01:14:00Z", value: 1.165, type: "Low Tide" },
  { time: "2026-04-14T03:50:00Z", value: 0, type: "Slack Water" }, // APR 13 20:50 PDT
  { time: "2026-04-14T07:14:00Z", value: 3.88, type: "Max Flood" },
  { time: "2026-04-14T08:03:00Z", value: 2.426, type: "High Tide" },
  { time: "2026-04-14T09:58:00Z", value: 0, type: "Slack Water" }, // APR 14 02:58 PDT (night)
  { time: "2026-04-14T13:48:00Z", value: 4.372, type: "Max Ebb" },
  { time: "2026-04-14T14:06:00Z", value: 1.692, type: "Low Tide" },
  { time: "2026-04-14T17:27:00Z", value: 0, type: "Slack Water" }, // APR 14 10:27 PDT
  { time: "2026-04-14T19:01:00Z", value: 2.302, type: "High Tide" },
  { time: "2026-04-14T19:35:00Z", value: 2.659, type: "Max Flood" },
  { time: "2026-04-14T22:24:00Z", value: 0, type: "Slack Water" }, // APR 14 15:24 PDT
  { time: "2026-04-15T01:16:00Z", value: 3.82, type: "Max Ebb" },
  { time: "2026-04-15T01:51:00Z", value: 1.272, type: "Low Tide" },
  { time: "2026-04-15T04:44:00Z", value: 0, type: "Slack Water" }, // APR 14 21:44 PDT (night)
  { time: "2026-04-15T07:50:00Z", value: 3.742, type: "Max Flood" },
  { time: "2026-04-15T08:20:00Z", value: 2.523, type: "High Tide" },
  { time: "2026-04-15T10:25:00Z", value: 0, type: "Slack Water" }, // APR 15 03:25 PDT (night)
  { time: "2026-04-15T13:52:00Z", value: 4.821, type: "Max Ebb" },
  { time: "2026-04-15T14:50:00Z", value: 1.369, type: "Low Tide" },
  { time: "2026-04-15T17:47:00Z", value: 0, type: "Slack Water" }, // APR 15 10:47 PDT ← the window in the app
  { time: "2026-04-15T20:15:00Z", value: 3.849, type: "Max Flood" },
  { time: "2026-04-15T20:19:00Z", value: 2.307, type: "High Tide" },
  { time: "2026-04-15T23:17:00Z", value: 0, type: "Slack Water" }, // APR 15 16:17 PDT ← the SECOND window shown
  { time: "2026-04-16T02:09:00Z", value: 4.024, type: "Max Ebb" },
  { time: "2026-04-16T02:23:00Z", value: 1.422, type: "Low Tide" },
  { time: "2026-04-16T05:34:00Z", value: 0, type: "Slack Water" },
  { time: "2026-04-16T08:26:00Z", value: 3.571, type: "Max Flood" },
  { time: "2026-04-16T08:37:00Z", value: 2.663, type: "High Tide" },
  { time: "2026-04-16T10:52:00Z", value: 0, type: "Slack Water" },
  { time: "2026-04-16T14:01:00Z", value: 5.361, type: "Max Ebb" },
  { time: "2026-04-16T15:33:00Z", value: 1.028, type: "Low Tide" },
];

// Hourly current speeds (local time, no Z)
const currentSpeeds = [
  0.273, 1.525, 2.624, 2.676, 2.309, 1.752, 1.220, 0.917,  // Apr 9 00-07
  0.967, 1.390, 2.066, 2.798, 3.373, 3.623, 3.133, 1.708,  // Apr 9 08-15
  0.359, 0.069, 1.359, 3.120, 3.669, 3.080, 1.929, 0.740,  // Apr 9 16-23
  0.053, 0.229, 1.260, 2.392, 2.786, 2.587, 2.146, 1.631,  // Apr 10 00-07
  1.237, 1.114, 1.330, 1.829, 2.448, 2.988, 3.275, 2.986,  // Apr 10 08-15
  1.673, 0.339, 0.043, 0.746, 1.988, 3.147, 3.646, 2.888,  // Apr 10 16-23
  1.157, 0.036, 0.275, 1.230, 2.374, 3.095, 3.065, 2.511,  // Apr 11 00-07
  1.696, 0.966, 0.636, 0.800, 1.339, 2.072, 2.758, 3.168,  // Apr 11 08-15
  3.040, 1.818, 0.419, 0.030, 0.772, 2.136, 3.383, 3.834,  // Apr 11 16-23
  2.750, 0.827, 0.003, 0.533, 1.709, 2.935, 3.590, 3.416,  // Apr 12 00-07
  2.635, 1.547, 0.556, 0.031, 0.147, 0.808, 1.776, 2.712,  // Apr 12 08-15
  3.286, 3.194, 1.961, 0.498, 0.019, 0.852, 2.408, 3.675,  // Apr 12 16-23
  3.758, 2.088, 0.284, 0.144, 1.173, 2.660, 3.781, 3.887,  // Apr 13 00-07
  2.710, 1.025, 0.036, 0.655, 1.412, 0.751, 0.030, 0.505,  // Apr 13 08-15
  2.118, 3.444, 3.340, 2.002, 0.502, 0.023, 1.022, 2.751,  // Apr 13 16-23
  3.835, 3.174, 1.079, 0.001, 0.738, 2.395, 3.919, 4.340,  // Apr 14 00-07
  3.306, 1.493, 0.162, 0.413, 2.198, 2.518, 1.317, 0.130,  // Apr 14 08-15
  0.398, 2.257, 3.739, 3.414, 1.910, 0.406, 0.068, 1.341,  // Apr 14 16-23
  3.114, 3.704, 2.154, 0.235, 0.332, 2.100, 4.109, 4.807,  // Apr 15 00-07
  3.892, 2.073, 0.460, 0.073, 1.884, 3.752, 3.297, 1.464,  // Apr 15 08-15
  0.082, 0.589, 2.627, 3.997, 3.440, 1.751, 0.267, 0.198,  // Apr 15 16-23
  1.785, 3.373, 3.114, 1.006, 0.024, 1.538, 4.097, 5.361,  // Apr 16 00-07
  4.172, 1.619, 0.037, 0.874, 3.363, 5.228, 4.762, 2.391,  // Apr 16 08-15
  0.285, 0.370, 2.569, 4.870, 5.167, 3.190, 0.746, 0.072,  // Apr 16 16-23
];

// Sunrise / sunset in LOCAL time (matching hourly array format)
const sunrises = ["2026-04-09T06:35","2026-04-10T06:33","2026-04-11T06:31","2026-04-12T06:29","2026-04-13T06:27","2026-04-14T06:25","2026-04-15T06:24","2026-04-16T06:22"];
const sunsets  = ["2026-04-09T19:56","2026-04-10T19:58","2026-04-11T19:59","2026-04-12T20:01","2026-04-13T20:02","2026-04-14T20:04","2026-04-15T20:05","2026-04-16T20:07"];

// Current time: 2026-04-09T11:11 PDT
const nowLocal = new Date("2026-04-09T11:11:00");

// DAYLIGHT_BUFFER_MINS from config
const DAYLIGHT_BUFFER = 30; // minutes

function toLocal(utcStr) {
  // Convert UTC ISO (with Z) to local PDT display string
  const d = new Date(utcStr);
  const h = d.getUTCHours() - 7;
  const m = d.getUTCMinutes();
  const day = new Date(d);
  day.setUTCHours(h < 0 ? h + 24 : h, m, 0, 0);
  if (h < 0) day.setUTCDate(day.getUTCDate() - 1);
  const yr = day.getUTCFullYear();
  const mo = String(day.getUTCMonth()+1).padStart(2,'0');
  const dy = String(day.getUTCDate()).padStart(2,'0');
  const hh = String(day.getUTCHours()).padStart(2,'0');
  const mm = String(day.getUTCMinutes()).padStart(2,'0');
  return `${yr}-${mo}-${dy}T${hh}:${mm}`;
}

function parseLocal(s) {
  return new Date(s.replace('T',' ') + ' PDT');
}

function diffMins(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60000);
}

// Hourly time array in LOCAL time (matching the data)
const hourlyTimes = [];
for (let d = 9; d <= 16; d++) {
  for (let h = 0; h < 24; h++) {
    if (d === 16 && h > 23) break;
    hourlyTimes.push(`2026-04-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00`);
  }
}

console.log('=== COMPLETE SLACK ANALYSIS (APR 9 – APR 16) ===\n');
console.log('All times are PDT (UTC-7). Current threshold for dive window: < 0.5 kn\n');

// Extract all slack events
const slackEvents = hilo.filter(h => h.type === 'Slack Water');

console.log('ALL SLACK EVENTS:');
slackEvents.forEach(s => {
  const localTime = toLocal(s.time);
  const localDate = new Date(localTime);
  
  // Find hourly index (by matching hour)
  const idx = hourlyTimes.findIndex(t => t.startsWith(localTime.substring(0,13)));
  const speed = idx !== -1 ? currentSpeeds[idx] : '?';
  
  // Speed ±1h, ±2h
  const sp = [idx-2, idx-1, idx, idx+1, idx+2].map(i => i >= 0 && i < currentSpeeds.length ? currentSpeeds[i].toFixed(2) : '?');
  
  // Find sunrise/sunset for this day
  const dayStr = localTime.substring(0,10);
  const sr = sunrises.find(s => s.startsWith(dayStr));
  const ss = sunsets.find(s => s.startsWith(dayStr));
  
  const isPast = localDate < nowLocal;
  const isNight = sr && ss ? (localDate < new Date(sr) || localDate > new Date(ss)) : false;
  
  // Count adjacent bins below threshold
  let binsBelowLeft = 0;
  let idxL = idx;
  while (idxL > 0 && currentSpeeds[idxL-1] < SLACK_THRESHOLD) { idxL--; binsBelowLeft++; }
  let binsBelowRight = 0;
  let idxR = idx;
  while (idxR < currentSpeeds.length-1 && currentSpeeds[idxR+1] < SLACK_THRESHOLD) { idxR++; binsBelowRight++; }
  
  const windowMins = (binsBelowLeft + binsBelowRight + 1) * 60;
  
  let flags = [];
  if (isPast) flags.push('⏮ PAST');
  if (isNight) flags.push('🌙 NIGHT→FILTERED');
  if (!isPast && !isNight) {
    if (windowMins >= 30) flags.push(`✅ SHOULD SHOW (${windowMins}+ min window, speed=${typeof speed === 'number' ? speed.toFixed(3) : speed} kn)`);
    else flags.push(`❌ TOO SHORT (${windowMins} min)`);
  }
  
  console.log(`  ${localTime} (UTC: ${s.time.substring(11,16)}) | speed@hour: ${typeof speed === 'number'? speed.toFixed(3): speed} | speeds[-2h to +2h]: [${sp.join(', ')}] | ${flags.join(' ')}`);
  console.log(`    └─ bins below ${SLACK_THRESHOLD}kn: left=${binsBelowLeft}, right=${binsBelowRight}, window≈${windowMins}min`);
});

// Specifically analyze Apr 9 16:44 PDT slack
console.log('\n=== DEEP DIVE: APR 9 16:44 PDT SLACK (the missing window) ===');
console.log('Slack UTC: 2026-04-09T23:44:00Z = 16:44 PDT');
console.log('Hourly speeds around this slack:');
for (let h = 14; h <= 23; h++) {
  const t = `2026-04-09T${String(h).padStart(2,'0')}:00`;
  const idx = hourlyTimes.indexOf(t);
  const spd = idx !== -1 ? currentSpeeds[idx] : '?';
  const marker = (h === 16 || h === 17) ? ' ◄ SLACK HOUR' : '';
  console.log(`  App hour index ${idx}: ${t} → ${typeof spd === 'number' ? spd.toFixed(3) : spd} kn${marker}`);
}
console.log('  "Slack Water" event in hilo is at 23:44 UTC (16:44 PDT)');
console.log('  Closest hourly bin: Apr 9 16:00 PDT → speed =', currentSpeeds[16].toFixed(3), 'kn');
console.log('  Next hourly bin:    Apr 9 17:00 PDT → speed =', currentSpeeds[17].toFixed(3), 'kn');
console.log('');
console.log('  ⚠️  ISSUE: The hilo event time (16:44 PDT) maps to hour-bin index 16 (16:00 PDT)');
console.log('  The code does: times.findIndex(t => t.startsWith(h.time.substring(0, 13)))');
console.log('  h.time = "2026-04-09T23:44:00Z" (UTC!)');  
console.log('  h.time.substring(0,13) = "2026-04-09T23" (searching for 23:xx UTC hour)');
console.log('  But hourly times are in LOCAL PDT format: "2026-04-09T16:00", "2026-04-09T17:00"');
console.log('  → findIndex returns -1 (NO MATCH!) because UTC "23" ≠ local "16"');
console.log('');
console.log('  🔴 ROOT CAUSE: hilo times are UTC (with Z suffix), hourly times are local (no Z).');
console.log('     The substring match tries to find "2026-04-09T23" in local-time array.');
console.log('     There is NO "2026-04-09T23:xx" in PDT local time → the slack is NEVER');
console.log('     added to slackIndices → window is never computed!');

console.log('\n=== SUMMARY OF ALL WINDOWS (expected vs actual) ===');
const allSlackLocal = slackEvents.map(s => ({
  utc: s.time,
  local: toLocal(s.time),
  speed: (() => {
    // Try UTC hour match failure
    const utcHour = s.time.substring(0,13);
    const localHour = toLocal(s.time).substring(0,13);
    const utcIdx = hourlyTimes.findIndex(t => t.startsWith(utcHour.replace('Z','')));
    const localIdx = hourlyTimes.findIndex(t => t.startsWith(localHour));
    return { utcIdx, localIdx, spd: localIdx >= 0 ? currentSpeeds[localIdx] : currentSpeeds[utcIdx >= 0 ? utcIdx : 0] };
  })(),
}));

console.log('\nExpected dive windows (daylight, future, all slacks):');
allSlackLocal.forEach(s => {
  const local = new Date(s.local);
  const isPast = local < nowLocal;
  const dayStr = s.local.substring(0,10);
  const sr = new Date(sunrises.find(x => x.startsWith(dayStr)) || '');
  const ss = new Date(sunsets.find(x => x.startsWith(dayStr)) || '');
  const isDaylight = local >= sr && local <= ss;
  const prevEbb = hilo.filter(h => h.type === 'Max Ebb' && new Date(toLocal(h.time)) < local).at(-1);
  const nextFlood = hilo.filter(h => h.type === 'Max Flood' && new Date(toLocal(h.time)) > local).at(0);
  const ebbbefore = prevEbb ? `ebb before: ${prevEbb.value}kn @ ${toLocal(prevEbb.time).substring(11,16)}` : '';
  const floodafter = nextFlood ? `flood after: ${nextFlood.value}kn @ ${toLocal(nextFlood.time).substring(11,16)}` : '';
  
  let status = '';
  if (isPast) status = '⏮ Past';
  else if (!isDaylight) status = '🌙 Night (filtered)';
  else status = '✅ Should be in dive window list';
  
  console.log(`  ${s.local} | ${status} | ${ebbbefore} | ${floodafter}`);
});

console.log('\n=== APR 15 WINDOW VERIFICATION (the one the app shows) ===');
// The app shows slack at 16:17 PDT = 23:17 UTC
// max ebb before: 13:52 UTC = 06:52 PDT at 4.821 kn
// next max flood: 20:15 UTC = 13:15 PDT at 3.849 kn
const apr15Slack = toLocal("2026-04-15T23:17:00Z");
console.log(`Slack at 16:17 PDT = ${apr15Slack}`);
console.log('Max Ebb before: 06:52 PDT at 4.821 kn');
console.log('Max Flood after: 13:15 PDT at 3.849 kn');

// Window: speed around Apr 15 16:00-17:00
const apr15h = [14,15,16,17,18,19,20,21,22,23];
console.log('Speeds around Apr 15 16:17 PDT:');
apr15h.forEach(h => {
  const idx = hourlyTimes.indexOf(`2026-04-15T${String(h).padStart(2,'0')}:00`);
  if (idx >= 0) console.log(`  ${hourlyTimes[idx]}: ${currentSpeeds[idx].toFixed(3)} kn ${currentSpeeds[idx] < SLACK_THRESHOLD ? '← BELOW THRESHOLD' : ''}`);
});
