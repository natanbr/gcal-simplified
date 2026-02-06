import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TidesPanel } from './WeatherDashboard';
import { WeatherData, TideData } from '../types';

describe('TidesPanel - Tide Event Detection', () => {
    it('should correctly detect Slack -> Max -> Slack pattern with plateau data', () => {
        const mockWeather: WeatherData = {
            current: { temperature: 10, weatherCode: 0, windSpeed: 5, windDirection: 180, windGusts: 10 },
            daily: { sunrise: [], sunset: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] },
            hourly: { 
                time: ['2026-02-06T00:00', '2026-02-06T01:00', '2026-02-06T02:00', '2026-02-06T03:00', '2026-02-06T04:00', '2026-02-06T05:00', '2026-02-06T06:00', '2026-02-06T07:00'],
                temperature_2m: [10, 10, 10, 10, 10, 10, 10, 10],
                precipitation_probability: [0, 0, 0, 0, 0, 0, 0, 0],
                weather_code: [0, 0, 0, 0, 0, 0, 0, 0],
                wind_speed_10m: [5, 5, 5, 5, 5, 5, 5, 5],
                wind_direction_10m: [180, 180, 180, 180, 180, 180, 180, 180],
                wind_gusts_10m: [10, 10, 10, 10, 10, 10, 10, 10]
            }
        };
        
        // Create data with plateaus that caused the bug:
        // Pattern: High -> Low (Slack) -> Plateau High (Max) -> Low (Slack) -> High
        const mockTides: TideData = {
            location: 'Sooke',
            station: 'Test',
            sources: [],
            water_temperature: 10,
            hourly: { 
                time: [
                    '2026-02-06T00:00', // i=0: 0.5
                    '2026-02-06T01:00', // i=1: 0.1 (decreasing)
                    '2026-02-06T02:00', // i=2: 0.1 (plateau - should be SLACK)
                    '2026-02-06T03:00', // i=3: 0.6 (increasing)
                    '2026-02-06T04:00', // i=4: 0.6 (plateau - should be MAX)
                    '2026-02-06T05:00', // i=5: 0.1 (decreasing)
                    '2026-02-06T06:00', // i=6: 0.1 (plateau - should be SLACK)
                    '2026-02-06T07:00', // i=7: 0.5 (increasing)
                ], 
                tide_height: [0, 0, 0, 0, 0, 0, 0, 0], 
                current_speed: [0.5, 0.1, 0.1, 0.6, 0.6, 0.1, 0.1, 0.5],
                current_direction: [90, 90, 90, 90, 90, 90, 90, 90],
                wave_height: [0, 0, 0, 0, 0, 0, 0, 0],
                wave_period: [0, 0, 0, 0, 0, 0, 0, 0]
            }
        };

        const { container } = render(<TidesPanel tides={mockTides} weather={mockWeather} />);
        
        // The component should render a table with events
        const table = container.querySelector('table');
        expect(table).toBeTruthy();
        
        // Should have detected events: Slack at 02:00, Max at 04:00, Slack at 06:00
        // Check for "Slack" text (should appear twice)
        const slackElements = screen.getAllByText(/Slack/i);
        expect(slackElements.length).toBeGreaterThanOrEqual(2); // At least 2 slack events
        
        // Check for Max Flood or Max Ebb
        const maxElements = screen.queryAllByText(/Max (Flood|Ebb)/i);
        expect(maxElements.length).toBeGreaterThanOrEqual(1); // At least 1 max event
        
        // Most importantly: verify no adjacent slacks by checking the pattern
        // The table rows should alternate between Slack and Max events
        const eventRows = container.querySelectorAll('tbody tr:not([class*="bg-zinc-900"])');
        
        let lastEventType: string | null = null;
        eventRows.forEach((row) => {
            const eventCell = row.querySelector('td:first-child');
            if (eventCell) {
                const eventText = eventCell.textContent || '';
                if (eventText.includes('Slack') || eventText.includes('Max')) {
                    const currentType = eventText.includes('Slack') ? 'Slack' : 'Max';
                    
                    // Verify no two consecutive Slacks
                    if (lastEventType === 'Slack' && currentType === 'Slack') {
                        throw new Error('Found adjacent Slack events - algorithm failed!');
                    }
                    
                    lastEventType = currentType;
                }
            }
        });
    });
});
