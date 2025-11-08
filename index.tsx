// ✅ Add Buffer and process polyfills for Privy Solana SDK and @solana/spl-token
// MUST be at the very top before any other imports
import { Buffer } from 'buffer';
import process from 'process';

// Make Buffer and process available globally BEFORE any other code runs
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}
if (typeof globalThis.process === 'undefined') {
  globalThis.process = process;
}
// Also set on window for browser compatibility
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
  (window as any).process = process;
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string;
const heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY || '';

if (!privyAppId) {
  throw new Error("VITE_PRIVY_APP_ID is not set in environment variables");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'google'],
        appearance: {
          theme: 'light',
          accentColor: '#6366f1',
          showWalletLoginFirst: false,
          walletChainType: 'solana-only', // ✅ Forces Solana-only wallet creation
        },
        // ✅ Configure Solana RPC endpoints
        solana: {
          rpcs: {
            'solana:mainnet-beta': {
              rpc: createSolanaRpc(
                `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
              ),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                `wss://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
              ),
            },
          },
        },
        // ✅ CRITICAL: Create Solana embedded wallets for all users
        embeddedWallets: {
          createOnLogin: 'all-users',
        },
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);
