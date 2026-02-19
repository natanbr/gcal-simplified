import { WeatherData, TideData } from '../src/types';
import stations from '../stations.json';

const SOOKE_LAT = 48.3746;
const SOOKE_LONG = -123.7276;
const CHS_API_BASE = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';




interface Station {
    id: string;
    code: string;
    officialName: string;
    latitude: number;
    longitude: number;
    timeSeries: { code: string }[];
}

export class WeatherService {

    private validateCoordinates(lat: unknown, lng: unknown): void {
        if (typeof lat !== 'number' || typeof lng !== 'number') {
            throw new Error('Invalid coordinate type');
        }
        if (lat < -90 || lat > 90) {
            throw new Error('Invalid latitude');
        }
        if (lng < -180 || lng > 180) {
            throw new Error('Invalid longitude');
        }
    }

    async getWeather(lat: number = SOOKE_LAT, lng: number = SOOKE_LONG): Promise<WeatherData> {
        this.validateCoordinates(lat, lng);

        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.searchParams.append('latitude', lat.toString());
        url.searchParams.append('longitude', lng.toString());
        url.searchParams.append('current', 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m');
        url.searchParams.append('hourly', 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m');
        url.searchParams.append('daily', 'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min');
        url.searchParams.append('timezone', 'auto');
        url.searchParams.append('forecast_days', '7');

        try {
            const response = await fetch(url.toString());
            if (!response.ok) throw new Error('Weather fetch failed');
            const data = await response.json();

            return {
                current: {
                    temperature: data.current.temperature_2m,
                    weatherCode: data.current.weather_code,
                    windSpeed: data.current.wind_speed_10m,
                    windDirection: data.current.wind_direction_10m,
                    windGusts: data.current.wind_gusts_10m
                },
                daily: {
                    sunrise: data.daily.sunrise,
                    sunset: data.daily.sunset,
                    weather_code: data.daily.weather_code,
                    temperature_2m_max: data.daily.temperature_2m_max,
                    temperature_2m_min: data.daily.temperature_2m_min
                },
                hourly: {
                    time: data.hourly.time,
                    temperature_2m: data.hourly.temperature_2m,
                    precipitation_probability: data.hourly.precipitation_probability,
                    weather_code: data.hourly.weather_code,
                    wind_speed_10m: data.hourly.wind_speed_10m,
                    wind_direction_10m: data.hourly.wind_direction_10m,
                    wind_gusts_10m: data.hourly.wind_gusts_10m
                }
            };
        } catch (error) {
            console.error('Error fetching weather:', error);
            throw error;
        }
    }

    async getTides(tideStationCode: string = '07020', currentStationCode: string = '07090', lat: number = SOOKE_LAT, lng: number = SOOKE_LONG): Promise<TideData> {
        this.validateCoordinates(lat, lng);

        // 1. Define Time Range
        const now = new Date();
        const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const end = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

        // 2. Identify Stations by Code
        const allStations = stations as Station[];
        const tideStation = allStations.find(s => s.code === tideStationCode) || allStations.find(s => s.code === '07020'); // Default Sooke
        const currentStation = allStations.find(s => s.code === currentStationCode) || allStations.find(s => s.code === '07090') || allStations.find(s => s.code === '07040'); // Default Race

        const tideStationId = tideStation?.id;
        const currentStationId = currentStation?.id;

        if (!tideStationId) {
            console.warn(`Tide Station not found for code: ${tideStationCode}`);
        }

        // Determine codes dynamically from the station definition
        let currentSpeedCode = 'wcp';
        let currentEventCode = 'wcp-hilo';

        if (currentStation) {
            // Look for specific speed code
            const speedSeries = currentStation.timeSeries?.find((ts: any) =>
                ['wcp', 'wcsp1', 'wcs1'].includes(ts.code)
            );
            if (speedSeries) currentSpeedCode = speedSeries.code;

            // Look for specific event/hilo code
            const eventSeries = currentStation.timeSeries?.find((ts: any) =>
                ['wcp-hilo', 'wcp1-events', 'wcp-events'].includes(ts.code)
            );
            if (eventSeries) currentEventCode = eventSeries.code;
        }

        const shouldUseChsCurrents = !!currentStationId;

        // 3. Construct URLs
        // Open-Meteo for Waves/Temp only (plus currents as fallback)
        const omUrl = new URL('https://marine-api.open-meteo.com/v1/marine');
        omUrl.searchParams.append('latitude', lat.toString());
        omUrl.searchParams.append('longitude', lng.toString());
        omUrl.searchParams.append('hourly', 'wave_height,wave_period,swell_wave_height,swell_wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature');
        omUrl.searchParams.append('timezone', 'America/Vancouver');

        // CHS Tide URLs
        const chsTideUrl = tideStationId ? `${CHS_API_BASE}/stations/${tideStationId}/data?time-series-code=wlp&from=${start}&to=${end}` : '';
        const chsTideHiloUrl = tideStationId ? `${CHS_API_BASE}/stations/${tideStationId}/data?time-series-code=wlp-hilo&from=${start}&to=${end}` : '';

        // CHS Current URLs (if applicable)
        let chsCurrentUrl = '';
        let chsCurrentHiloUrl = '';

        if (shouldUseChsCurrents && currentStationId) {
            chsCurrentUrl = `${CHS_API_BASE}/stations/${currentStationId}/data?time-series-code=${currentSpeedCode}&from=${start}&to=${end}`;
            chsCurrentHiloUrl = `${CHS_API_BASE}/stations/${currentStationId}/data?time-series-code=${currentEventCode}&from=${start}&to=${end}`;
        }

        try {
            const promises = [
                fetch(omUrl.toString()),
                tideStationId ? fetch(chsTideUrl) : Promise.resolve({ ok: false } as Response),
                tideStationId ? fetch(chsTideHiloUrl) : Promise.resolve({ ok: false } as Response)
            ];

            if (shouldUseChsCurrents) {
                promises.push(fetch(chsCurrentUrl));
                promises.push(fetch(chsCurrentHiloUrl));
            }

            const responses = await Promise.all(promises);
            const omResponse = responses[0] as Response;
            const chsTideResponse = responses[1] as Response;
            const chsTideHiloResponse = responses[2] as Response;
            const chsCurrentResponse = shouldUseChsCurrents ? responses[3] as Response : null;
            const chsCurrentHiloResponse = shouldUseChsCurrents ? responses[4] as Response : null;

            // Process Open-Meteo
            let omData: any = {};
            if (omResponse.ok) {
                omData = await omResponse.json();
            } else {
                console.warn('Open-Meteo Marine API unavailable');
            }

            const hourlyTime = omData.hourly?.time || [];
            let tideHeights: number[] = [];
            let currentSpeeds: number[] = [];
            let currentDirections: number[] = [];
            let hiloData: { time: string; value: number; type: string }[] = [];

            // 4. Process Tide Data (CHS wlp/wlp-hilo)
            if (chsTideHiloResponse?.ok) {
                try {
                    const data = await chsTideHiloResponse.json() as { eventDate: string; value: number }[];
                    // Sort by time to ensure correct relative comparisons
                    data.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());

                    const events = data.map((h, i, arr) => {
                        let type = 'Tide Ext.';
                        const val = h.value;

                        // Use neighbors to determine High vs Low
                        // If it's a local maximum, it's High. If local minimum, it's Low.
                        // Since this is a list of extrema, we can just compare with the next or previous.

                        // Try to compare with next
                        if (i < arr.length - 1) {
                            const nextVal = arr[i + 1].value;
                            if (val > nextVal) type = 'High Tide';
                            else if (val < nextVal) type = 'Low Tide';
                        }
                        // If it's the last one, compare with previous
                        else if (i > 0) {
                            const prevVal = arr[i - 1].value;
                            if (val > prevVal) type = 'High Tide';
                            else if (val < prevVal) type = 'Low Tide';
                        }
                        // Fallback for single point (unlikely)
                        else {
                            type = val > 1.5 ? 'High Tide' : 'Low Tide';
                        }

                        return {
                            time: h.eventDate,
                            value: val,
                            type: type
                        };
                    });
                    hiloData.push(...events);
                } catch (e) { console.warn('Parse Error CHS Tide Hilo', e); }
            }

            if (chsTideResponse?.ok && hourlyTime.length > 0) {
                try {
                    const data = await chsTideResponse.json() as { eventDate: string; value: number }[];
                    tideHeights = this.mapChsDataToHourly(hourlyTime, data);
                } catch (e) { console.warn('Parse Error CHS Tide', e); }
            }

            // 5. Process Current Data (CHS wcp/wcp-hilo OR Open-Meteo fallback)
            let isModeledData = false;

            if (shouldUseChsCurrents && chsCurrentResponse?.ok && chsCurrentHiloResponse?.ok) {
                // CHS Path
                try {
                    // Current Extremes (Slack, Max Flood, Max Ebb)
                    const hiloRaw = await chsCurrentHiloResponse.json() as { eventDate: string; value: number; qualifier?: string }[];
                    const currentEvents = hiloRaw.map(h => {
                        const val = h.value;
                        let type = 'Slack Water';

                        // Check distinct qualifier (wcp1-events uses this)
                        if (h.qualifier === 'EXTREMA_EBB') type = 'Max Ebb';
                        else if (h.qualifier === 'EXTREMA_FLOOD') type = 'Max Flood';
                        else if (h.qualifier === 'SLACK') type = 'Slack Water';
                        else if (Math.abs(val) > 0.1) {
                            // Fallback to sign-based check if qualifier missing
                            type = val > 0 ? 'Max Flood' : 'Max Ebb';
                        }

                        return {
                            time: h.eventDate,
                            value: val,
                            type: type
                        };
                    });
                    hiloData.push(...currentEvents);

                    // Current Series
                    const seriesRaw = await chsCurrentResponse.json() as { eventDate: string; value: number }[];
                    currentSpeeds = this.mapChsDataToHourly(hourlyTime, seriesRaw);
                    currentSpeeds = currentSpeeds.map(v => Math.abs(v));

                    // Validation: Check for high speed flows if this is likely a major pass
                    // Check if station is Race Passage or Active Pass (major flows)
                    // If max speed < 2.0kn, data is suspect.
                    const isMajorPass = currentStation?.officialName.includes('Race') || currentStation?.officialName.includes('Active');

                    if (isMajorPass) {
                        const maxSpeed = Math.max(...currentSpeeds);
                        if (maxSpeed < 2.0 && maxSpeed > -1) { // -Infinity check
                            console.warn(`CHS Current Data Suspect: Max speed ${maxSpeed}kn < 2.0kn for ${currentStation?.officialName}. Falling back.`);
                            isModeledData = true; // Trigger fallback
                        }
                    }

                } catch (e) {
                    console.warn('Parse Error CHS Currents', e);
                    isModeledData = true;
                }
            } else {
                console.warn(`CHS Fetch Failed. CurrentCode: ${currentSpeedCode}, EventCode: ${currentEventCode}, Status: ${chsCurrentResponse?.status}/${chsCurrentHiloResponse?.status}`);
                isModeledData = true;
            }

            if (isModeledData || currentSpeeds.length === 0) {
                // Use Open-Meteo
                currentSpeeds = omData.hourly?.ocean_current_velocity || [];
                currentDirections = omData.hourly?.ocean_current_direction || [];
            }

            // sort hilo data by time
            hiloData.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

            return {
                location: `Lat: ${lat.toFixed(2)}, Lng: ${lng.toFixed(2)}`,
                station: isModeledData ? "Modeled Data (Warning)" : `${tideStation?.officialName || 'Unknown'} (Tides) & ${currentStation?.officialName || 'Unknown'} (Currents)`,
                water_temperature: omData.hourly?.sea_surface_temperature?.[0] || 9.5,
                sources: [
                    { name: "Open-Meteo", details: "Waves, Temp" },
                    { name: "CHS Tides", details: `Station ${tideStation?.code || tideStationCode}` },
                    shouldUseChsCurrents && !isModeledData
                        ? { name: "CHS Currents", details: `Station ${currentStation?.code || currentStationCode}` }
                        : { name: "Weather Model", details: "Warning: Modeled open-ocean data. Not accurate for channels/passes." }
                ],
                hourly: {
                    time: hourlyTime,
                    tide_height: tideHeights,
                    wave_height: omData.hourly?.swell_wave_height || omData.hourly?.wave_height,
                    wave_period: omData.hourly?.swell_wave_period || omData.hourly?.wave_period,
                    current_speed: currentSpeeds,
                    current_direction: currentDirections
                },
                hilo: hiloData
            };

        } catch (error) {
            console.warn('Error fetching tides:', error);
            // Return empty structure or safe fallback
            return { hourly: { time: [], tide_height: [] } };
        }
    }

    private mapChsDataToHourly(hourlyTime: string[], chsData: { eventDate: string; value: number }[]): number[] {
        // Pre-parse timestamps to avoid repeated new Date() calls inside the loop
        const parsedChsData = chsData.map(d => ({
            time: new Date(d.eventDate).getTime(),
            value: d.value
        }));

        if (parsedChsData.length === 0) {
            return hourlyTime.map(() => 0);
        }

        return hourlyTime.map((t: string) => {
            const time = new Date(t).getTime();
            // Find closest CHS data point
            // Optimization: Assuming sorted data could trigger binary search, but linear is fine for <1000 items
            const closest = parsedChsData.reduce((prev, curr) => {
                const prevDiff = Math.abs(prev.time - time);
                const currDiff = Math.abs(curr.time - time);
                return currDiff < prevDiff ? curr : prev;
            }, parsedChsData[0]);

            if (closest && Math.abs(closest.time - time) < 45 * 60 * 1000) {
                return closest.value;
            }
            return 0; // Or null/undefined if preferred
        });
    }

}

export const weatherService = new WeatherService();
