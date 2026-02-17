import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import './index.css';
import App from './App';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { MarketingLanding } from './components/MarketingLanding';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const isNative = Capacitor.isNativePlatform();
root.render(
  <React.StrictMode>
    {isNative ? (
      <AuthProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </AuthProvider>
    ) : (
      <MarketingLanding />
    )}
  </React.StrictMode>
);
