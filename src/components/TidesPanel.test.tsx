import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TidesPanel } from './WeatherDashboard';
import { WeatherData, TideData } from '../types';
import { addHours, startOfDay, format } from 'date-fns';

describe('TidesPanel - Tide Event Detection', () => {
    it('should correctly detect Slack -> Max -> Slack pattern with plateau data', () => {
        const today = startOfDay(new Date());
        const baseTime = addHours(today, 24);

        const times = Array.from({ length: 8 }, (_, i) => format(addHours(baseTime, i), "yyyy-MM-dd'T'HH:00"));

        const mockWeather: WeatherData = {
            current: { temperature: 10, weatherCode: 0, windSpeed: 5, windDirection: 180, windGusts: 10 },
            daily: { sunrise: [], sunset: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] },
            hourly: { 
                time: times,
                temperature_2m: Array(8).fill(10),
                precipitation_probability: Array(8).fill(0),
                weather_code: Array(8).fill(0),
                wind_speed_10m: Array(8).fill(5),
                wind_direction_10m: Array(8).fill(180),
                wind_gusts_10m: Array(8).fill(10)
            }
        };
        
        const mockTides: TideData = {
            location: 'Sooke',
            station: 'Test',
            sources: [],
            water_temperature: 10,
            hourly: { 
                time: times,
                tide_height: Array(8).fill(0),
                current_speed: [0.5, 0.1, 0.1, 0.6, 0.6, 0.1, 0.1, 0.5],
                current_direction: Array(8).fill(90),
                wave_height: Array(8).fill(0),
                wave_period: Array(8).fill(0)
            }
        };

        const { container } = render(<TidesPanel tides={mockTides} weather={mockWeather} locationId="sooke" onLocationChange={() => {}} loading={false} />);
        
        // Slack at i=2, Max at i=4, Slack at i=6
        const slackElements = screen.getAllByText(/Slack/i);
        expect(slackElements.length).toBeGreaterThanOrEqual(2);
        
        const maxElements = screen.queryAllByText(/Max (Flood|Ebb)/i);
        expect(maxElements.length).toBeGreaterThanOrEqual(1);
        
        // Verify alternating pattern
        const allRows = Array.from(container.querySelectorAll('tbody tr'));
        const eventRows = allRows.filter(row => !row.querySelector('td[colSpan="7"]'));
        
        let lastEventType: string | null = null;
        eventRows.forEach((row) => {
            const eventCell = row.querySelector('td:first-child');
            if (eventCell) {
                const eventText = eventCell.textContent || '';
                if (eventText.includes('Slack') || eventText.includes('Max')) {
                    const currentType = eventText.includes('Slack') ? 'Slack' : 'Max';
                    
                    if (lastEventType === 'Slack' && currentType === 'Slack') {
                        throw new Error('Found adjacent Slack events - algorithm failed!');
                    }
                    
                    lastEventType = currentType;
                }
            }
        });
    });
});
