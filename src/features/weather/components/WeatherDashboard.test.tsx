import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock must be defined before imports that use it, OR rely on hoisting.
// We'll trust hoisting but define it clearly.
// Using explicit any for children as per original file style
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('../../../components/SideDrawer', () => ({
    SideDrawer: ({ isOpen, children }: { isOpen: boolean, children: any }) => {
        // Render children directly if open
        return isOpen ? <div data-testid="drawer-content">{children}</div> : null;
    }
}));

import { WeatherDashboard } from './WeatherDashboard';

describe('WeatherDashboard', () => {
    it('should render correct buttons for Weather and Tasks', async () => {
        const mockWeather = {
            current: { temperature: 10, weatherCode: 0, windSpeed: 5, windDirection: 180, windGusts: 10 },
            daily: { sunrise: [], sunset: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] },
            hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] }
        };
        const mockTasks: any[] = [];

        render(<WeatherDashboard 
            weather={mockWeather} 
            tasks={mockTasks}
        />);

        // Weather button should show temperature
        expect(screen.getByText(/10°C/i)).toBeDefined();


        // Tasks button existence
        expect(screen.getByText(/Tasks/i)).toBeDefined();
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

        render(<WeatherDashboard 
            weather={mockWeather} 
            tasks={mockTasks}
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
