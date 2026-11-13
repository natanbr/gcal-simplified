import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { MCSettingsOverlay } from './MCSettingsOverlay';

afterEach(() => { cleanup(); localStorage.clear(); });

describe('MC Settings manual mission starts belong to the phone', () => {
    it('keeps both schedule editors without a Start or retry control', () => {
        render(<MCStoreProvider><MCSettingsOverlay open onClose={vi.fn()} /></MCStoreProvider>);

        expect(screen.getByText('Morning Mission')).toBeInTheDocument();
        expect(screen.getByText('Evening Mission')).toBeInTheDocument();
        expect(screen.getAllByText('Auto-trigger at')).toHaveLength(2);
        // Positive control: the role query does see this panel's buttons, so the empty result below means something.
        expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument();
        expect(screen.queryAllByRole('button', { name: /start|retry|reset/i })).toHaveLength(0);
        expect(screen.queryByTestId('mc-settings-start-morning')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mc-settings-start-evening')).not.toBeInTheDocument();
    });
});
