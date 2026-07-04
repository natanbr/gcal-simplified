import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlocksCanvas } from './BlocksCanvas';
import { BlocksGameState, GameShape } from './types';

interface MockShapeItemProps {
    shape: GameShape;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    isTransparent?: boolean;
}

// Mock ShapeItem to capture props and simulate drags
vi.mock('./ShapeItem', () => ({
    ShapeItem: ({ shape, onPointerDown, isTransparent }: MockShapeItemProps) => (
        <div 
            data-testid={`shape-item-${shape.id}`}
            onPointerDown={onPointerDown}
            style={{ opacity: isTransparent ? 0 : 1 }}
        >
            {shape.name}
        </div>
    )
}));

describe('BlocksCanvas', () => {
    const mockPlaceShape = vi.fn();
    const mockTriggerRescueQuiz = vi.fn();
    const mockSubmitQuizAnswer = vi.fn();
    const mockRefreshRescueShape = vi.fn();

    const mockGameState: BlocksGameState = {
        grid: Array.from({ length: 8 }, () => Array(8).fill(0)),
        standardShapes: [
            { id: '2x2', name: 'Block', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], color: '#f59e0b' },
            null,
            null,
        ],
        rescueShape: null,
        rescueShapeLocked: true,
        altitude: 0,
        score: 0,
        phase: 'playing',
        level: 0,
        quizQuestion: null,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calculates placement position corrected by grab offsets on drag end', () => {
        render(
            <BlocksCanvas
                gameState={mockGameState}
                placeShape={mockPlaceShape}
                triggerRescueQuiz={mockTriggerRescueQuiz}
                submitQuizAnswer={mockSubmitQuizAnswer}
                refreshRescueShape={mockRefreshRescueShape}
            />
        );

        // Find the grid container and mock getBoundingClientRect
        const gridElement = screen.getByTestId('blocks-grid');
        gridElement.getBoundingClientRect = () => ({
            width: 360,
            height: 360,
            top: 10,
            left: 10,
            bottom: 370,
            right: 370,
            x: 10,
            y: 10,
            toJSON: () => {},
        });

        // Trigger pointer down on the shape item
        const shapeItem = screen.getByTestId('shape-item-2x2');
        shapeItem.getBoundingClientRect = () => ({
            width: 96,
            height: 96,
            top: 100,
            left: 100,
            bottom: 196,
            right: 196,
            x: 100,
            y: 100,
            toJSON: () => {},
        });

        // Trigger pointer down with mock coordinates (clientX=148, clientY=148)
        // Offset is (148 - 100) = 48, which translates to grabRow=1, grabCol=1
        fireEvent.pointerDown(shapeItem, { clientX: 148, clientY: 148 });

        // Trigger window pointerup event with drop coordinates (clientX=122, clientY=122)
        // getGridCoord(122, 122) -> row=2, col=2. Offset gridX = 2 - 1 = 1, gridY = 2 - 1 = 1
        const pointerUpEvent = new Event('pointerup');
        Object.defineProperty(pointerUpEvent, 'clientX', { value: 122 });
        Object.defineProperty(pointerUpEvent, 'clientY', { value: 122 });
        window.dispatchEvent(pointerUpEvent);


        expect(mockPlaceShape).toHaveBeenCalledWith(
            expect.objectContaining({ id: '2x2' }),
            1, // gridX
            1, // gridY
            'standard',
            0
        );
    });
});
