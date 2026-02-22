import { describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'http';

// Mocks must be hoisted
const mocks = vi.hoisted(() => {
  const storeInstance = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  return {
    electronStoreInstance: storeInstance,
    safeStorage: {
      isEncryptionAvailable: vi.fn().mockReturnValue(false),
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    },
    shell: {
      openExternal: vi.fn(),
    },
    google: {
      // We will define the class structure in the mock factory
    },
  };
});

vi.mock('electron', () => ({
  shell: mocks.shell,
  safeStorage: mocks.safeStorage,
  app: { getPath: () => '/tmp' },
}));

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
        get = mocks.electronStoreInstance.get;
        set = mocks.electronStoreInstance.set;
        delete = mocks.electronStoreInstance.delete;
    }
  };
});

vi.mock('googleapis', () => {
  return {
    google: {
      auth: {
        OAuth2: class {
            generateAuthUrl = vi.fn().mockReturnValue('http://auth-url');
            getToken = vi.fn().mockResolvedValue({ tokens: {} });
            setCredentials = vi.fn();
        }
      }
    }
  }
});

// Mock http server
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockServer: any = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listen: vi.fn((port: any, host: any, cb: any) => {
    if (cb) cb();
    return mockServer;
  }),
  address: vi.fn().mockReturnValue({ port: 12345 }),
  on: vi.fn(),
  close: vi.fn(),
};

// We need to spy on createServer before importing authService
vi.spyOn(http, 'createServer').mockImplementation((handler) => {
  // Store handler to invoke later
  mockServer._handler = handler;
  return mockServer;
});

// Import the service under test
import { authService } from './auth';

describe('AuthService Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should prevent reflected XSS in auth callback error handling', async () => {
    // Start auth flow to register the handler
    // Catch the rejection since we are simulating an error scenario
    authService.startAuth().catch(() => {});

    // Get the captured request handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (mockServer as any)._handler;
    expect(handler).toBeDefined();

    // simulate response object
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      setHeader: vi.fn(),
    };

    // Simulate a request with XSS payload in error parameter
    const req = {
      url: '/callback?error=<script>alert(1)</script>',
      headers: { host: '127.0.0.1' }
    };

    // Execute the handler
    await handler(req, res);

    // Verify response
    // We expect the response to be safe.

    // Check if Content-Type is text/plain
    const setHeaderCalls = res.setHeader.mock.calls;
    const contentTypeHeader = setHeaderCalls.find(call => call[0].toLowerCase() === 'content-type');

    // Check if body is sanitized
    // The current implementation calls res.end('Authentication failed: ' + error)
    const endCall = res.end.mock.calls[0][0];

    // We require Content-Type header to be set to text/plain for safety when returning raw input
    // OR we require the body to NOT contain the script tag if HTML is allowed

    const hasSafeContentType = contentTypeHeader && contentTypeHeader[1].includes('text/plain');
    const hasSanitizedBody = !endCall.includes('<script>');

    // Fail if neither condition is met
    if (!hasSafeContentType && !hasSanitizedBody) {
        throw new Error('Response is vulnerable to XSS: Content-Type not set to text/plain AND body contains raw script tag.');
    }
  });
});
