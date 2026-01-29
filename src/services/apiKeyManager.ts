import { GoogleGenerativeAI } from '@google/generative-ai';

export interface APIKeyStatus {
  isValid: boolean;
  keyType: 'default' | 'user' | 'none';
  lastChecked: Date | null;
  errorMessage?: string;
}

export class APIKeyManager {
  private static instance: APIKeyManager;
  private defaultApiKey: string;
  private userApiKey: string | null = null;
  private keyStatus: APIKeyStatus = {
    isValid: false,
    keyType: 'none',
    lastChecked: null
  };

  private constructor() {
    this.defaultApiKey = 'AIzaSyB3jfxdMQzPpIb5MNfT8DtP5MOvT_Sp7qk';
    this.loadUserApiKey();
  }

  public static getInstance(): APIKeyManager {
    if (!APIKeyManager.instance) {
      APIKeyManager.instance = new APIKeyManager();
    }
    return APIKeyManager.instance;
  }

  private loadUserApiKey(): void {
    try {
      const stored = localStorage.getItem('gemini_user_api_key');
      if (stored) {
        this.userApiKey = stored;
        console.log('✅ User API key loaded from localStorage');
      }
    } catch (error) {
      console.warn('Failed to load user API key from localStorage:', error);
    }
  }

  private saveUserApiKey(apiKey: string): void {
    try {
      localStorage.setItem('gemini_user_api_key', apiKey);
      console.log('✅ User API key saved to localStorage');
    } catch (error) {
      console.warn('Failed to save user API key to localStorage:', error);
    }
  }

  public async setUserApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
    if (!apiKey || apiKey.trim().length === 0) {
      return { success: false, message: 'API key cannot be empty' };
    }

    // Basic validation
    if (!apiKey.startsWith('AIza') || apiKey.length < 30) {
      return { success: false, message: 'Invalid API key format. Google API keys start with "AIza"' };
    }

    console.log('🔑 Validating user API key...');
    
    try {
      // Test the API key by making a simple request
      const genAI = new GoogleGenerativeAI(apiKey.trim());
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      
      // Simple test prompt
      const result = await model.generateContent("Hello");
      const response = result.response.text();
      
      if (response) {
        this.userApiKey = apiKey.trim();
        this.saveUserApiKey(apiKey.trim());
        this.keyStatus = {
          isValid: true,
          keyType: 'user',
          lastChecked: new Date()
        };
        console.log('✅ User API key validated successfully');
        return { success: true, message: 'API key validated and saved successfully!' };
      } else {
        return { success: false, message: 'API key validation failed - no response received' };
      }
    } catch (error: any) {
      console.error('❌ API key validation failed:', error);
      
      let errorMessage = 'Invalid API key';
      if (error.message?.includes('quota')) {
        errorMessage = 'API key quota exceeded. Please check your Google AI Studio quota.';
      } else if (error.message?.includes('invalid')) {
        errorMessage = 'Invalid API key. Please check the key from Google AI Studio.';
      } else if (error.message?.includes('permission')) {
        errorMessage = 'API key lacks required permissions. Ensure Gemini API is enabled.';
      }
      
      return { success: false, message: errorMessage };
    }
  }

  public clearUserApiKey(): void {
    this.userApiKey = null;
    try {
      localStorage.removeItem('gemini_user_api_key');
      console.log('✅ User API key cleared');
    } catch (error) {
      console.warn('Failed to clear user API key from localStorage:', error);
    }
    this.keyStatus = {
      isValid: false,
      keyType: 'none',
      lastChecked: new Date()
    };
  }

  public getCurrentApiKey(): string | null {
    // Priority: user key first, then default key
    if (this.userApiKey) {
      console.log('🔑 Using user-provided API key');
      return this.userApiKey;
    } else if (this.defaultApiKey) {
      console.log('🔑 Using default API key');
      return this.defaultApiKey;
    }
    return null;
  }

  public async createGeminiInstance(): Promise<GoogleGenerativeAI | null> {
    const apiKey = this.getCurrentApiKey();
    if (!apiKey) {
      console.error('❌ No API key available');
      return null;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      console.log(`✅ Gemini AI initialized with ${this.userApiKey ? 'user' : 'default'} API key`);
      return genAI;
    } catch (error) {
      console.error('❌ Failed to create Gemini instance:', error);
      return null;
    }
  }

  public getKeyStatus(): APIKeyStatus {
    return { ...this.keyStatus };
  }

  public hasUserApiKey(): boolean {
    return !!this.userApiKey;
  }

  public async testCurrentKey(): Promise<APIKeyStatus> {
    const apiKey = this.getCurrentApiKey();
    
    if (!apiKey) {
      this.keyStatus = {
        isValid: false,
        keyType: 'none',
        lastChecked: new Date(),
        errorMessage: 'No API key available'
      };
      return this.keyStatus;
    }

    try {
      console.log('🧪 Testing current API key...');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      
      const result = await model.generateContent("Test");
      const response = result.response.text();
      
      if (response) {
        this.keyStatus = {
          isValid: true,
          keyType: this.userApiKey ? 'user' : 'default',
          lastChecked: new Date()
        };
        console.log('✅ API key test successful');
      } else {
        throw new Error('No response received');
      }
    } catch (error: any) {
      console.error('❌ API key test failed:', error);
      
      let errorMessage = 'API key test failed';
      if (error.message?.includes('quota')) {
        errorMessage = 'API quota exceeded';
      } else if (error.message?.includes('invalid')) {
        errorMessage = 'Invalid API key';
      } else if (error.message?.includes('permission')) {
        errorMessage = 'Insufficient permissions';
      }
      
      this.keyStatus = {
        isValid: false,
        keyType: this.userApiKey ? 'user' : 'default',
        lastChecked: new Date(),
        errorMessage
      };
    }

    return this.keyStatus;
  }

  // Mark the current API key as working without doing another test call
  public markKeyAsWorking(): void {
    const apiKey = this.getCurrentApiKey();
    if (apiKey) {
      this.keyStatus = {
        isValid: true,
        keyType: this.userApiKey ? 'user' : 'default',
        lastChecked: new Date()
      };
      console.log('✅ API key marked as working');
    }
  }
}

// Singleton instance
export const apiKeyManager = APIKeyManager.getInstance();