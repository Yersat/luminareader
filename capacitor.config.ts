import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yersat.LuminaReader',
  appName: 'Lumina Reader',
  webDir: 'dist',

  // Server settings for live reload during development
  server: {
    // For development, you can enable this to load from your dev server:
    // url: 'http://YOUR_LOCAL_IP:3000',
    // cleartext: true,

    // Allow navigation to Firebase and other external URLs
    allowNavigation: [
      'firebasestorage.googleapis.com',
      'firebase.googleapis.com',
      '*.firebaseapp.com'
    ]
  },

  // iOS-specific configuration
  ios: {
    // Use WKWebView's scroll behavior
    scrollEnabled: true,
    // Content inset adjustment behavior
    contentInset: 'automatic',
    // Allow background audio (if needed for future features)
    allowsLinkPreview: false,
    // Scheme for the app
    scheme: 'lumina'
  },

  // Android-specific configuration
  android: {
    // Allow mixed content (http and https)
    allowMixedContent: true,
    // Capture input for the keyboard
    captureInput: true,
    // Use the modern WebView
    webContentsDebuggingEnabled: false, // Disabled for production
    // Background color while loading
    backgroundColor: '#1A1625'
  },

  // Plugin configurations
  plugins: {
    // Keyboard plugin settings
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    // Status bar settings
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1A1625'
    }
  }
};

export default config;
