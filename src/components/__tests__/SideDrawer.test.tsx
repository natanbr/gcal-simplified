import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SideDrawer } from '../SideDrawer';
import { describe, it, expect, vi } from 'vitest';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    const MOTION_PROPS = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'variants', 'layout']);
    const MotionDiv = React.forwardRef(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props: any, ref: React.Ref<HTMLDivElement>) => {
            const htmlProps = Object.fromEntries(
                Object.entries(props).filter(([key]: [string, unknown]) => !MOTION_PROPS.has(key))
            );
            return React.createElement('div', { ref, ...htmlProps });
        }
    );
    MotionDiv.displayName = 'MotionDiv';
    return {
        motion: { div: MotionDiv },
        AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    };
});

// Mock lucide-react icons
vi.mock('lucide-react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('lucide-react')>();
    return { ...actual };
});

describe('SideDrawer', () => {
    const onCloseMock = vi.fn();
    const defaultProps = {
        isOpen: true,
        onClose: onCloseMock,
        title: 'Test Drawer',
        children: <div data-testid="drawer-children">Children Content</div>,
    };

    it('renders the drawer when isOpen is true', () => {
        render(<SideDrawer {...defaultProps} />);

        expect(screen.getByTestId('drawer-title')).toHaveTextContent('Test Drawer');
        expect(screen.getByTestId('drawer-children')).toBeInTheDocument();
        expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument();
    });

    it('does not render content when isOpen is false', () => {
        render(<SideDrawer {...defaultProps} isOpen={false} />);

        expect(screen.queryByTestId('drawer-title')).not.toBeInTheDocument();
        expect(screen.queryByTestId('drawer-children')).not.toBeInTheDocument();
    });

    it('calls onClose when clicking the backdrop', () => {
        render(<SideDrawer {...defaultProps} />);

        fireEvent.click(screen.getByTestId('drawer-backdrop'));
        expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking the close button', () => {
        onCloseMock.mockClear();
        render(<SideDrawer {...defaultProps} />);

        fireEvent.click(screen.getByTestId('close-drawer-button'));
        expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('renders the portal in document.body and not in the container', () => {
        const { container } = render(<SideDrawer {...defaultProps} />);

        const backdrop = screen.getByTestId('drawer-backdrop');
        const drawerTitle = screen.getByTestId('drawer-title');

        // Should be in document.body
        expect(document.body.contains(backdrop)).toBe(true);
        expect(document.body.contains(drawerTitle)).toBe(true);

        // Should NOT be in the render container
        expect(container.contains(backdrop)).toBe(false);
        expect(container.contains(drawerTitle)).toBe(false);
    });
});
