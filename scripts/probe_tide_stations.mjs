// Probe all candidate tide stations and Port Renfrew tide station
const CHS_BASE = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';
const now = new Date();
const start = now.toISOString();
const end = new Date(now.getTime() + 6.9 * 24 * 60 * 60 * 1000).toISOString();

const stations = [
  // User-requested tide stations
  { code: '07010', id: '5dd30650e0fdc4b9b4be6c25', name: 'Point No Point' },
  { code: '07013', id: '5cebf1df3d0f4a073c4bbd0d', name: 'Sheringham Point' },
  { code: '07020', id: '5cebf1df3d0f4a073c4bbd0f', name: 'Sooke' },
  { code: '07024', id: '5cebf1df3d0f4a073c4bbd11', name: 'Sooke Basin' },
  { code: '07030', id: '5cebf1df3d0f4a073c4bbd13', name: 'Becher Bay' },
  { code: '07080', id: '5cebf1df3d0f4a073c4bbd15', name: 'Pedder Bay' },
  { code: '07082', id: '5dd3064de0fdc4b9b4be66e0', name: 'William Head' },
  { code: '07115', id: '5dd3064fe0fdc4b9b4be691e', name: 'Clover Point' },
  { code: '07130', id: '5cebf1df3d0f4a073c4bbd22', name: 'Oak Bay' },
  { code: '07140', id: '5cebf1df3d0f4a073c4bbd24', name: 'Finnerty Cove' },
  { code: '07280', id: '5dd30650e0fdc4b9b4be6b74', name: 'Brentwood Bay' },
  { code: '07284', id: '5cebf1df3d0f4a073c4bbd2f', name: 'Finlayson Arm' },
  // Port Renfrew - has tide data in CHS
  { code: '08525', id: '5cebf1e23d0f4a073c4bc060', name: 'Port Renfrew' },
  // Fulford Harbour (already in app for Salt Spring)
  { code: '07330', id: '5cebf1df3d0f4a073c4bbd35', name: 'Fulford Harbour' },
];

async function checkSeries(stationId, stationName, stationCode, seriesCode) {
  const url = `${CHS_BASE}/stations/${stationId}/data?time-series-code=${seriesCode}&from=${start}&to=${end}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      return { ok: false, httpStatus: res.status };
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, httpStatus: 200, count: 0, note: 'EMPTY' };
    }
    const sorted = data.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
    const intervalMins = sorted.length > 1
      ? Math.round((new Date(sorted[1].eventDate) - new Date(sorted[0].eventDate)) / 60000)
      : null;
    const spanDays = ((new Date(sorted[sorted.length - 1].eventDate) - new Date(sorted[0].eventDate)) / (24 * 60 * 60 * 1000)).toFixed(1);
    return { ok: true, httpStatus: 200, count: data.length, intervalMins, spanDays };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log(`Probing ${stations.length} tide stations: ${start} → ${end}\n`);
  for (const s of stations) {
    const wlp = await checkSeries(s.id, s.name, s.code, 'wlp');
    const hilo = await checkSeries(s.id, s.name, s.code, 'wlp-hilo');
    console.log(JSON.stringify({
      code: s.code,
      name: s.name,
      wlp: wlp.ok ? `✅ ${wlp.count} pts @ ${wlp.intervalMins}min, ${wlp.spanDays}d` : `❌ HTTP ${wlp.httpStatus}${wlp.note ? ' EMPTY' : ''}`,
      wlpHilo: hilo.ok ? `✅ ${hilo.count} events, ${hilo.spanDays}d` : `❌ HTTP ${hilo.httpStatus}${hilo.note ? ' EMPTY' : ''}`,
    }));
  }
}

main().catch(console.error);
