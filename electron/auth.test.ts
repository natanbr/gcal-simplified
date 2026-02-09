import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth';
import http from 'http';
import { shell } from 'electron';

vi.mock('electron', () => ({
    shell: {
        openExternal: vi.fn(),
    },
}));

vi.mock('electron-store', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        })),
    };
});

const mockOAuth2Client = {
    generateAuthUrl: vi.fn().mockReturnValue('http://mock-auth-url'),
    getToken: vi.fn().mockResolvedValue({ tokens: { access_token: 'mock-token' } }),
    setCredentials: vi.fn(),
};

vi.mock('googleapis', () => {
    return {
        google: {
            auth: {
                OAuth2: vi.fn().mockImplementation(() => mockOAuth2Client),
            },
        },
    };
});

describe('AuthService', () => {
    let authService: AuthService;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GOOGLE_CLIENT_ID = 'test-id';
        process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
        authService = new AuthService();
    });

    it('should start server on port 0 and use dynamic port in auth URL', async () => {
        const mockServer = {
            listen: vi.fn((port, cb) => {
                if (cb) setTimeout(cb, 0);
                return mockServer;
            }),
            address: vi.fn().mockReturnValue({ port: 12345 }),
            close: vi.fn(),
            on: vi.fn(),
        };

        const createServerSpy = vi.spyOn(http, 'createServer').mockReturnValue(mockServer as any);

        // We don't await because startAuth only resolves when the callback is called
        authService.startAuth();

        // Give it a moment to call the listen callback
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(createServerSpy).toHaveBeenCalled();
        expect(mockServer.listen).toHaveBeenCalledWith(0, expect.any(Function));

        // Verify that generateAuthUrl was called with the correct dynamic port
        expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith(expect.objectContaining({
            redirect_uri: 'http://localhost:12345/callback'
        }));

        // Verify shell.openExternal was called
        expect(shell.openExternal).toHaveBeenCalledWith('http://mock-auth-url');
    });
});
