'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, getDefaultConfig } from 'connectkit';

// Define EDU Chain network
const eduChain = {
  id: 656_476,
  name: 'EDU Chain',
  network: 'educhain',
  nativeCurrency: {
    decimals: 18,
    name: 'EDU',
    symbol: 'EDU',
  },
  rpcUrls: {
    default: { http: ['https://rpc.open-campus-codex.gelato.digital'] },
    public: { http: ['https://rpc.open-campus-codex.gelato.digital'] },
  },
  blockExplorers: {
    default: {
      name: 'EDU Chain Explorer',
      url: 'https://opencampus-codex.blockscout.com',
    },
  },
  testnet: false,
} as const;

const config = createConfig(
  getDefaultConfig({
    // Your dApp's info
    appName: 'Lilikoi DeFi',
    // Your project ID from WalletConnect Cloud
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    chains: [arbitrum, eduChain],
    transports: {
      [arbitrum.id]: http(),
      [eduChain.id]: http('https://rpc.open-campus-codex.gelato.digital'),
    },
  }),
);

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider customTheme={{
          "--ck-font-family": "Inter, sans-serif",
          "--ck-border-radius": "8px",
          "--ck-primary-button-background": "#9333ea", // Purple-600
          "--ck-primary-button-hover-background": "#7e22ce", // Purple-700
          "--ck-body-background": "#111111",
          "--ck-body-color": "#ffffff",
          "--ck-body-color-muted": "#9ca3af",
          "--ck-body-action-color": "#9333ea",
        }}>
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
} 