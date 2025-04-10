'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';

// Example queries for the agents
const agentExamples = {
  bridging: [
    'Bridge 100 EDU to Arbitrum',
    'Show me cheapest route'
  ],
  dex: [
    'Swap 100 USDC to ETH',
    'Find LP pool for 500 USDC'
  ],
  transaction: [
    'Send 5 EDU to 0x123...',
    'Transfer USDC to my friend'
  ],
  utility: [
    'Gas price on Arbitrum',
    'Current price of EDU?'
  ]
};

// Define agent information with detailed descriptions
const agents = [
  {
    id: 'bridging',
    name: 'Bridging agent',
    description: 'Helps you move your tokens between blockchains, picking the fastest and cheapest way.',
    icon: '🌉',
    color: 'text-[#4C9EEB]'
  },
  {
    id: 'dex',
    name: 'LP Optimizer agent',
    description: 'Suggests the best ways to invest your tokens based on your amount and risk level.',
    icon: '📈',
    color: 'text-[#5BBA6F]'
  },
  {
    id: 'utility',
    name: 'Utility agents',
    description: 'Lets you check balances, token prices, send or swap tokens easily.',
    icon: '🛠️',
    color: 'text-[#9F7AEA]'
  },
  {
    id: 'transaction',
    name: 'Transaction agent',
    description: 'Send EDU or ERC20 tokens on EDU Chain / Arbitrum with simple commands.',
    icon: '💸',
    color: 'text-[#F0B86E]'
  }
];

export default function AgentsPage() {
  const { isConnected } = useAccount();

  return (
    <main className="min-h-screen bg-[#121212] text-white">
      {/* Navigation Bar */}
      <nav className="max-w-6xl mx-auto py-4 px-8 flex justify-between items-center border border-gray-800 rounded-full mt-4 bg-[#17171a]">
        <div className="flex items-center">
          <Link href="/" className="flex items-center space-x-2">
          <Link href="/" className="flex items-center">
           <img src="/LOGO.svg" alt="Lilikoi Logo" />
        </Link>
          </Link>
        </div>
        
        <div className="flex space-x-8">
          <Link href="/" className="text-gray-300 px-4 py-2">Home</Link>
          <Link href="/agent" className="bg-[#5958cc] px-6 py-2 rounded-full">Agents</Link>

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
      
      {/* Title */}
      <div className="max-w-6xl mx-auto mt-16 mb-12 px-8">
        <h1 className="text-4xl font-bold text-center">Available Agents</h1>
      </div>
      
      {/* Agent Cards */}
      <div className="max-w-6xl mx-auto px-8 grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {agents.map((agent) => (
          <Link 
            key={agent.id}
            href={`/agent/${agent.id}`}
            className="bg-[#1E1A2F] rounded-xl p-8 border border-gray-800 flex flex-col hover:bg-[#252336] transition-colors"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-semibold flex items-center">
                <span className="mr-2">{agent.name}</span>
                <span className={`${agent.color} text-sm font-normal`}>agent{agent.id === 'utility' ? 's' : ''}</span>
              </h2>
              <p className="text-gray-400 mt-2">{agent.description}</p>
            </div>
            
            <div className="mt-auto">
              <p className="text-sm text-gray-500 mb-3">Try asking:</p>
              <div className="space-y-3">
                {agentExamples[agent.id as keyof typeof agentExamples]?.map((example, index) => (
                  <div 
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = `/agent/${agent.id}?q=${encodeURIComponent(example)}`;
                    }}
                    className="block p-3 bg-[#252336] text-white rounded-lg hover:bg-[#2E2B40] transition-colors cursor-pointer"
                  >
                    {example}
                  </div>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
      
      {/* Chat with Lilikoi Button */}
      <div className="flex justify-center mb-16">
        <Link 
          href="/chat"
          className="bg-[#5958cc] hover:bg-[#4A49AB] text-white font-medium py-3 px-8 rounded-full transition-colors"
        >
          Chat with Lilikoi
        </Link>
      </div>
    </main>
  );
} 