'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useBalance, useReadContract } from 'wagmi';
import { useState, useEffect } from 'react';
import { formatUnits } from 'ethers';

const agents = [
  {
    id: 'bridging',
    name: 'Bridging Agent',
    description: 'Bridge EDU between Arbitrum & EDU Chain',
    // icon: '🌉',
  },
  {
    id: 'transaction',
    name: 'Transaction Agent',
    description: 'Send EDU or ERC20 tokens on EDU Chain / Arbitrum',
    // icon: '💸',
  },
  {
    id: 'dex',
    name: 'DEX Agent',
    description: 'Swap, wrap, or get quotes on EDU Chain DEX',
    // icon: '📈',
  },
  {
    id: 'utility',
    name: 'Utility & Info Agent',
    description: 'Check balances, prices, TVL, etc.',
    // icon: '🛠️',
  },
  // {
  //   id: 'lp',
  //   name: 'LP Provisioning Agent',
  //   description: 'Manage liquidity positions',
  //   icon: '💧',
  // },
];

const recentActivities = [
  {
    title: 'Bridge Bot',
    description: 'Fastest route to Arbitrum',
    agentId: 'bridging',
    // icon: '🌉',
  },
  {
    title: 'DEX Agent',
    description: 'Swap, wrap, or Unwrap tokens on EDU Chain DEX',
    agentId: 'dex',
    // icon: '💧',
  },
  {
    title: 'Utility',
    description: 'EDU price, Token History, Best Pools, etc.',
    agentId: 'utility',
    // icon: '🛠️',
  },
];

// --- Constants ---
const EDUCHAIN_CHAIN_ID = 41923; // Correct Mainnet ID
const USDC_ADDRESS = '0x836d275563bAb5E93Fd6Ca62a95dB7065Da94342'; // Correct USDC on EduChain
const ERC20_ABI = [
  { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], type: 'function' },
  { constant: true, inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], type: 'function' },
] as const; // Use 'as const' for better type inference with wagmi

export default function Home() {
  const { address, isConnected, chain } = useAccount();
  const [walletConnected, setWalletConnected] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [lilikoiScore, setLilikoiScore] = useState<number | null>(null);
  
  // Update wallet connection status when wagmi state changes
  useEffect(() => {
    setWalletConnected(isConnected);
  }, [isConnected]);

  // Ensure component is mounted on client before using hooks reliant on window/localStorage
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Simulate calculating score on mount
  useEffect(() => {
    if (isClient) {
      // Replace with actual calculation logic if available
      // Calculate random score between 50 and 90 (inclusive)
      const minScore = 50;
      const maxScore = 90;
      const calculatedScore = Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore;
      setLilikoiScore(calculatedScore);
    }
  }, [isClient]);

  const isEduChain = chain?.id === EDUCHAIN_CHAIN_ID;

  // --- Fetch Balances using wagmi hooks ---
  const { data: eduBalanceData, isLoading: isLoadingEdu } = useBalance({
    address: address,
    chainId: EDUCHAIN_CHAIN_ID,
    query: { enabled: isClient && isConnected && isEduChain }, // Only query if connected to EduChain on client
  });

  const { data: usdcBalanceData, isLoading: isLoadingUsdc } = useReadContract({
    abi: ERC20_ABI,
    address: USDC_ADDRESS,
    functionName: 'balanceOf',
    args: [address!], // Pass address, ensure it's defined
    chainId: EDUCHAIN_CHAIN_ID,
    query: { enabled: isClient && isConnected && isEduChain && !!address }, // Only query if connected, on EduChain, and address is available
  });

  const { data: usdcDecimals } = useReadContract({
    abi: ERC20_ABI,
    address: USDC_ADDRESS,
    functionName: 'decimals',
    chainId: EDUCHAIN_CHAIN_ID,
    query: { enabled: isClient && isConnected && isEduChain }, // Cache decimals
  });

  // Format balances once data is available
  // HARDCODED BALANCES:
  const formattedEduBalance = '5.0000 EDU';
  const formattedUsdcBalance = '4.0000 USDC';
  // const formattedEduBalance = eduBalanceData ? `${parseFloat(eduBalanceData.formatted).toFixed(4)} ${eduBalanceData.symbol}` : '0.00 EDU';
  // const formattedUsdcBalance = usdcDecimals !== undefined
  //   ? `${parseFloat(formatUnits(usdcBalanceData ?? 0n, usdcDecimals)).toFixed(4)} USDC` 
  //   : '0.00 USDC';

  return (
    <main className="min-h-screen bg-[#121212] text-white">
      {/* Navigation Bar */}
      <nav className="max-w-6xl mx-auto py-4 px-8 flex justify-between items-center border border-gray-800 rounded-full mt-4 bg-[#17171a]">
        <Link href="/" className="flex items-center">
           <img src="/Lilikoi Logo (4).svg" alt="Lilikoi Logo" className="w-24 h-24 " />
        </Link>
        
        <div className="flex space-x-8">
          <Link href="/" className="bg-[#5958cc] px-6 py-2 rounded-full">Home</Link>
          <Link href="/agent" className="text-gray-300 px-4 py-2">Agents</Link>

        </div>
        
        <ConnectKitButton.Custom>
          {({ isConnected, show, address, ensName }) => {
            return (
              <button
                onClick={show}
                className="bg-[#4b52c5] hover:bg-[#3a41a0] text-white font-medium py-2 px-6 rounded-full transition-colors"
              >
                {isConnected 
                  ? `${address?.slice(0, 6)}...${address?.slice(-4)}` 
                  : 'Connect Wallet'}
              </button>
            );
          }}
        </ConnectKitButton.Custom>
      </nav>
      
      {/* Title and Description */}
      <div className="max-w-3xl mx-auto text-center mt-20 mb-12">
        <h1 className="text-5xl font-bold mb-4">
          Lilikoi - Your DeFi Brain
        </h1>
        <p className="text-lg text-gray-300">
          Simplify DeFi. Interact with AI agents to stake, bridge, and manage assets effortlessly.
        </p>
      </div>
      
      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-8">
        {/* Lilikoi Score Card - Reduced padding and text sizes */}
        <div className="relative bg-gradient-to-r from-purple-600 to-blue-600 rounded-3xl p-6 mb-8 overflow-hidden">
          <div className="z-10 relative">
            <h2 className="text-xl font-semibold mb-1">Lilikoi Score</h2>
            <div className="flex items-end">
              <span className="text-6xl font-bold">
                {lilikoiScore !== null ? lilikoiScore : '--'}
              </span>
              <span className="text-2xl mb-1 ml-2">/ 100</span>
            </div>
            <p className="text-sm text-white/80 mt-1">Based on your DeFi actions</p>
          </div>
          <div className="absolute right-8 top-1/2 transform -translate-y-1/2">
            <div className="w-24 h-24 relative">
              <div className="absolute inset-0 rounded-full border border-dashed border-blue-300/30"></div>
              <div className="absolute inset-3">
                <div className="w-full h-full bg-gradient-to-br from-purple-400 to-blue-400 opacity-80 rounded-lg transform rotate-45"></div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Two Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Image container with fixed height */}
          <div className="relative w-full h-[500px] rounded-3xl overflow-hidden border border-gray-800">
            <Image
              src="/Lilikoi-image.jpg"
              alt="Lilikoi DeFi Brain concept image"
              fill
              className="object-contain"
            />
          </div>
          {/* 
          <div className="bg-[#17171a] rounded-3xl p-6 border border-gray-800">
            <h2 className="text-xl font-semibold mb-4">Balance (EduChain)</h2>
            <div className="space-y-4 mt-6">
              {!isClient || !isConnected ? (
                <p className="text-gray-400">Connect wallet to view balance.</p>
              ) : !isEduChain ? (
                 <p className="text-yellow-500">Please connect to EduChain (ID: {EDUCHAIN_CHAIN_ID}).</p>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-lg">EDU</span>
                    <span className="text-lg text-white font-medium">
                        {formattedEduBalance}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-lg">USDC</span>
                     <span className="text-lg text-white font-medium">
                        {formattedUsdcBalance}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
           */}
          
          {/* Recent Activity Section - Added matching fixed height */}
          <div className="bg-[#17171a] rounded-3xl p-6 border border-gray-800 h-[500px]">
            <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
            
            <div className="space-y-4">
              {recentActivities.map((activity, index) => (
                <Link 
                  key={index} 
                  href={`/agent/${activity.agentId}`}
                  className="flex items-center justify-between p-4 bg-[#1c1c24] rounded-xl cursor-pointer hover:bg-[#24242c]"
                >
                  <div className="flex items-center">
                    <div className="bg-[#2a2a35] p-3 rounded-xl mr-4">
                      <img src="/bot-icon.svg" alt="Activity icon" className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-medium">{activity.title}</p>
                      <p className="text-sm text-gray-400">{activity.description}</p>
                    </div>
                  </div>
                  <div className="text-gray-400">
                    {/* Arrow Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
        
        {/* Tip Box */}
        <div className="bg-[#17171a] rounded-3xl p-4 border border-gray-800 flex items-center mb-8">
          <div className="p-2 mr-4 rounded-full bg-[#1c1c24]">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <p className="text-gray-300">Bridging to Base is 40% cheaper today.</p>
        </div>
        
        {/* Agent Cards - Presented in a cleaner grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/agent/${agent.id}`}
              className="block p-6 rounded-xl bg-[#17171a] hover:bg-[#1c1c24] transition-colors border border-gray-800"
            >
              <img src="/bot-icon.svg" alt="Agent icon" className="w-8 h-8 mb-4 p-1 bg-[#2a2a35] rounded-lg" />
              <h2 className="text-xl font-semibold mb-2">{agent.name}</h2>
              <p className="text-gray-400">{agent.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
