import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { WeatherWidget } from '../WeatherWidget';
import { WeatherData, TideData } from '../../types';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockWeather: WeatherData = {
    current: {
        temperature: 15.5,
        weatherCode: 0, // Sunny
        windSpeed: 10,
    },
    daily: {
        sunrise: [],
        sunset: [],
        weather_code: [0, 1, 2],
    },
    hourly: {
        time: [new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()],
        temperature_2m: [15.5, 16.5],
        precipitation_probability: [0, 0],
        weather_code: [0, 0],
    },
};

const mockTides: TideData = {
    hourly: {
        time: [new Date().toISOString()],
        tide_height: [1.5],
    },
};

describe('WeatherWidget', () => {
    it('renders the current temperature on the button', () => {
        render(<WeatherWidget weather={mockWeather} tides={mockTides} />);
        expect(screen.getByText('16°C')).toBeInTheDocument(); // Math.round(15.5)
    });

    it('opens the modal when clicked', () => {
        render(<WeatherWidget weather={mockWeather} tides={mockTides} />);
        const button = screen.getByRole('button');
        fireEvent.click(button);

        expect(screen.getByText('Sooke, BC')).toBeInTheDocument();
        expect(screen.getByText('Hourly Forecast')).toBeInTheDocument();
        expect(screen.getByText('Spearfishing / Tides')).toBeInTheDocument();
    });

    it('displays hourly forecast data in the modal', () => {
        render(<WeatherWidget weather={mockWeather} tides={mockTides} />);
        fireEvent.click(screen.getByRole('button'));

        expect(screen.getByText('now:')).toBeInTheDocument();
        // Since Math.round(15.5) is 16
        const temps = screen.getAllByText('16°C');
        expect(temps.length).toBeGreaterThan(0);
    });

    it('renders a close button that closes the modal', () => {
        render(<WeatherWidget weather={mockWeather} tides={mockTides} />);
        fireEvent.click(screen.getByRole('button'));
        
        const closeButton = screen.getByLabelText('Close');
        fireEvent.click(closeButton);
        
        expect(screen.queryByText('Sooke, BC')).not.toBeInTheDocument();
    });
});
