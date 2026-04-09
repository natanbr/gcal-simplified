
const CHS_BASE = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';
const now = new Date();
// Use exactly 6.9 days to stay within 7-day limit
const start = new Date(now.getTime()).toISOString();
const end = new Date(now.getTime() + 6.9 * 24 * 60 * 60 * 1000).toISOString();

async function checkSeries(stationId, stationName, seriesCode) {
  const url = `${CHS_BASE}/stations/${stationId}/data?time-series-code=${seriesCode}&from=${start}&to=${end}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      const text = await res.text();
      return { station: stationName, series: seriesCode, httpStatus: res.status, error: text.slice(0, 250) };
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      return { station: stationName, series: seriesCode, httpStatus: 200, error: 'not array', raw: JSON.stringify(data).slice(0, 200) };
    }
    if (data.length === 0) {
      return { station: stationName, series: seriesCode, httpStatus: 200, count: 0, note: 'EMPTY' };
    }
    const sorted = data.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
    const intervalMins = sorted.length > 1
      ? Math.round((new Date(sorted[1].eventDate) - new Date(sorted[0].eventDate)) / 60000)
      : null;
    const spanDays = ((new Date(sorted[sorted.length - 1].eventDate) - new Date(sorted[0].eventDate)) / (24 * 60 * 60 * 1000)).toFixed(1);
    const qualifiers = [...new Set(sorted.map(d => d.qualifier).filter(Boolean))];
    return {
      station: stationName,
      series: seriesCode,
      httpStatus: 200,
      count: data.length,
      intervalMins,
      spanDays,
      first: sorted[0].eventDate,
      last: sorted[sorted.length - 1].eventDate,
      sampleValue: sorted[0].value,
      qualifiers: qualifiers.length > 0 ? qualifiers : undefined,
    };
  } catch (e) {
    return { station: stationName, series: seriesCode, error: e.message };
  }
}

async function main() {
  console.log('=== CHS Station Probes ===');
  console.log(`Time range: ${start} to ${end}`);

  const probes = [
    ['5cebf1df3d0f4a073c4bbd0f', 'Sooke (07020)', 'wlp'],
    ['5cebf1df3d0f4a073c4bbd0f', 'Sooke (07020)', 'wlp-hilo'],
    ['5cebf1df3d0f4a073c4bbd22', 'Oak Bay (07130)', 'wlp'],
    ['5cebf1df3d0f4a073c4bbd22', 'Oak Bay (07130)', 'wlp-hilo'],
    ['5dd30650e0fdc4b9b4be6c25', 'Point No Point (07010)', 'wlp'],
    ['5dd30650e0fdc4b9b4be6c25', 'Point No Point (07010)', 'wlp-hilo'],
    ['5cebf1df3d0f4a073c4bbd35', 'Fulford Harbour (07330)', 'wlp'],
    ['5cebf1df3d0f4a073c4bbd35', 'Fulford Harbour (07330)', 'wlp-hilo'],
    ['63aeee896a2b9417c034d337', 'Race Passage (07090)', 'wcsp1'],
    ['63aeee896a2b9417c034d337', 'Race Passage (07090)', 'wcp1-events'],
    ['63aeee1d84e5432cd3b6c500', 'Juan de Fuca East (07100)', 'wcsp1'],
    ['63aeee1d84e5432cd3b6c500', 'Juan de Fuca East (07100)', 'wcp1-events'],
    ['63aef09f84e5432cd3b6c509', 'Active Pass (07527)', 'wcsp1'],
    ['63aef09f84e5432cd3b6c509', 'Active Pass (07527)', 'wcp1-events'],
    ['63aef09f84e5432cd3b6c509', 'Active Pass (07527)', 'wlp'],
    ['63aef09f84e5432cd3b6c509', 'Active Pass (07527)', 'wlp-hilo'],
  ];

  for (const [id, name, code] of probes) {
    const r = await checkSeries(id, name, code);
    console.log(JSON.stringify(r));
  }

  console.log('=== Open-Meteo Marine (Sooke coords) ===');
  const omUrl = 'https://marine-api.open-meteo.com/v1/marine?latitude=48.37&longitude=-123.72&hourly=wave_height,wave_period,swell_wave_height,swell_wave_period,ocean_current_velocity,sea_surface_temperature&daily=sunrise,sunset&timezone=America/Vancouver&forecast_days=8';
  try {
    const res = await fetch(omUrl, { signal: AbortSignal.timeout(20000) });
    const om = await res.json();
    const omHours = om.hourly && om.hourly.time ? om.hourly.time.length : 0;
    const omWave = om.hourly && om.hourly.wave_height ? om.hourly.wave_height.filter(v => v !== null).length : 0;
    const omCurrent = om.hourly && om.hourly.ocean_current_velocity ? om.hourly.ocean_current_velocity.filter(v => v !== null).length : 0;
    console.log(JSON.stringify({
      source: 'Open-Meteo Marine',
      coords: '48.37, -123.72 (Sooke)',
      totalHourlySlots: omHours,
      totalDays: om.daily && om.daily.time ? om.daily.time.length : 0,
      waveDataPoints: omWave,
      currentDataPoints: omCurrent,
      sunrisePoints: om.daily && om.daily.sunrise ? om.daily.sunrise.length : 0,
      sampleWave: om.hourly && om.hourly.wave_height ? om.hourly.wave_height.slice(0, 5) : [],
      sampleCurrent: om.hourly && om.hourly.ocean_current_velocity ? om.hourly.ocean_current_velocity.slice(0, 5) : [],
      sampleSunrise: om.daily && om.daily.sunrise ? om.daily.sunrise.slice(0, 3) : [],
      temperaturePoints: om.hourly && om.hourly.sea_surface_temperature ? om.hourly.sea_surface_temperature.filter(v => v !== null).length : 0,
    }));
  } catch (e) {
    console.log(JSON.stringify({ source: 'Open-Meteo Marine', error: e.message }));
  }
}

main().catch(console.error);
