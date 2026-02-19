import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock must be defined before imports that use it, OR rely on hoisting.
// We'll trust hoisting but define it clearly.
// Using explicit any for children as per original file style
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('./SideDrawer', () => ({
    SideDrawer: ({ isOpen, children }: { isOpen: boolean, children: any }) => {
        // Render children directly if open
        return isOpen ? <div data-testid="drawer-content">{children}</div> : null;
    }
}));

import { WeatherDashboard } from './WeatherDashboard';

describe('WeatherDashboard', () => {
    it('should render correct buttons for Weather, Tides, and Tasks', async () => {
        const mockWeather = {
            current: { temperature: 10, weatherCode: 0, windSpeed: 5, windDirection: 180, windGusts: 10 },
            daily: { sunrise: [], sunset: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] },
            hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] }
        };
        const mockTides = {
            location: 'Sooke',
            hourly: { 
                time: ['2023-01-01T00:00', '2023-01-01T01:00', '2023-01-01T02:00'], 
                tide_height: [], 
                current_speed: [0.5, 1.5, 0.5], // Slack -> Max -> Slack
                current_direction: [0, 90, 0],
                wave_height: [0,0,0],
                wave_period: [0,0,0]
            },
            hilo: [],
            sources: []
        };
        const mockTasks: any[] = [];

        // @ts-ignore
        render(<WeatherDashboard 
            // @ts-ignore
            weather={mockWeather} 
            // @ts-ignore
            tides={mockTides} 
            tasks={mockTasks}
            currentLocationId="sooke"
            onLocationChange={() => {}}
            isTidesLoading={false}
            onTidesActive={() => {}}
        />);

        // Weather button should show temperature
        expect(screen.getByText(/10°C/i)).toBeDefined();
        
        // Tides button existence
        expect(screen.getByText(/Tides/i)).toBeDefined();

        // Tasks button existence
        expect(screen.getByText(/Tasks/i)).toBeDefined();
    });

    it('should not crash when opening Tides panel with null tides data', () => {
        const mockWeather = {
            current: { temperature: 10, weatherCode: 0, windSpeed: 5, windDirection: 180, windGusts: 10 },
            daily: { sunrise: [], sunset: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] },
            hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] }
        };

        // @ts-ignore
        render(<WeatherDashboard 
            // @ts-ignore
            weather={mockWeather} 
            tides={null} // Simulate initial lazy load state
            tasks={[]}
            currentLocationId="sooke"
            onLocationChange={() => {}}
            isTidesLoading={true}
            onTidesActive={() => {}}
        />);

        // Find and click the Tides button
        const tidesButton = screen.getByText('Tides').closest('button');
        if (tidesButton) {
            fireEvent.click(tidesButton);
        }

        // Check content rendered (e.g. Diver's Guide which is always present)
        expect(screen.getByText("Diver's Guide")).toBeDefined();
    });

    it('should render tasks list when Tasks button is clicked', () => {
        const mockWeather = {
            current: { temperature: 10, weatherCode: 0, windSpeed: 5, windDirection: 180, windGusts: 10 },
            daily: { sunrise: [], sunset: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] },
            hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] }
        };
        const mockTasks = [
            { id: '1', title: 'Test Task 1', status: 'needsAction' },
            { id: '2', title: 'Test Task 2', status: 'completed' }
        ];

        // @ts-ignore
        render(<WeatherDashboard 
            // @ts-ignore
            weather={mockWeather} 
            tides={null}
            // @ts-ignore
            tasks={mockTasks}
            currentLocationId="sooke"
            onLocationChange={() => {}}
            isTidesLoading={false}
            onTidesActive={() => {}}
        />);

        // Find and click the Tasks button
        const tasksButton = screen.getByText('Tasks').closest('button');
        if (tasksButton) {
            fireEvent.click(tasksButton);
        }

        expect(screen.getByText('Test Task 1')).toBeDefined();
        expect(screen.getByText('Test Task 2')).toBeDefined();
    });
});
