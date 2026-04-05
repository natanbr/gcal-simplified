import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const storeInstance = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  return {
    electronStoreInstance: storeInstance,
    safeStorage: {
      isEncryptionAvailable: vi.fn(),
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    },
    shell: {
      openExternal: vi.fn(),
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
          generateAuthUrl = vi.fn();
          getToken = vi.fn();
          setCredentials = vi.fn();
        }
      }
    }
  }
});

import { AuthService } from './auth';

describe('AuthService Storage Security', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveTokens', () => {
    it('should throw an error and not store tokens if encryption is not available', () => {
      mocks.safeStorage.isEncryptionAvailable.mockReturnValue(false);

      authService = new AuthService();

      const tokens = { access_token: 'secret' };

      // Accessing private method for testing via any cast
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (authService as any).saveTokens(tokens);
      }).toThrow('Encryption not available. Refusing to store unencrypted tokens.');

      expect(mocks.electronStoreInstance.set).not.toHaveBeenCalled();
    });

    it('should throw an error and not store tokens if encryption throws an error', () => {
      mocks.safeStorage.isEncryptionAvailable.mockReturnValue(true);
      mocks.safeStorage.encryptString.mockImplementation(() => {
        throw new Error('Encryption error');
      });

      authService = new AuthService();

      const tokens = { access_token: 'secret' };

      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (authService as any).saveTokens(tokens);
      }).toThrow('Token encryption failed. Refusing to store unencrypted tokens.');

      expect(mocks.electronStoreInstance.set).not.toHaveBeenCalled();
    });

    it('should correctly encrypt and store tokens if encryption is successful', () => {
      mocks.safeStorage.isEncryptionAvailable.mockReturnValue(true);
      mocks.safeStorage.encryptString.mockReturnValue(Buffer.from('encrypted_data'));

      authService = new AuthService();

      const tokens = { access_token: 'secret' };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (authService as any).saveTokens(tokens);

      expect(mocks.electronStoreInstance.set).toHaveBeenCalledWith('tokens', expect.any(String));
      expect(mocks.electronStoreInstance.set).toHaveBeenCalledWith('isEncrypted', true);
    });
  });

  describe('loadTokens', () => {
    it('should ignore unencrypted token objects', () => {
      mocks.electronStoreInstance.get.mockImplementation((key) => {
        if (key === 'tokens') return { access_token: 'secret' }; // unencrypted object
        if (key === 'isEncrypted') return false;
        return undefined;
      });

      authService = new AuthService();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (authService as any).loadTokens();

      expect(result).toBeNull();
    });
  });
});
