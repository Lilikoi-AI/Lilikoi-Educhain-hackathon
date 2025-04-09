'use client';

import { useParams, useRouter } from 'next/navigation';
import { ConnectKitButton } from 'connectkit';
import { useState, useEffect } from 'react';
import { ChatInterface } from '@/components/ChatInterface';
import Link from 'next/link';
import React from 'react';

const agentInfo = {
  bridging: {
    name: 'Bridging Agent',
    description: 'Bridge EDU tokens between Arbitrum and EDU Chain',
    icon: '🌉',
  },
  transaction: {
    name: 'Transaction Agent',
    description: 'Send native EDU or ERC20 tokens on EDU Chain or Arbitrum',
    icon: '💸',
  },
  dex: {
    name: 'DEX Agent',
    description: 'Swap, wrap, or unwrap tokens on the EDU Chain DEX',
    icon: '🔄',
  },
  lp: {
    name: 'LP Provisioning Agent',
    description: 'Provide liquidity and earn rewards',
    icon: '💧',
  },
  utility: {
    name: 'Utility Agent',
    description: 'Access utilities and ecosystem features',
    icon: '🛠️',
  },
};

// Define the expected shape of the params object
interface AgentPageParams {
  id: string; // The dynamic segment from the URL, e.g., "bridging", "transaction"
}

// Define the props for the Page component
interface AgentPageProps {
  params: AgentPageParams;
}

export default function Page({ params }: AgentPageProps) {
  const router = useRouter();
  const agentId = params.id;
  const agent = agentInfo[agentId as keyof typeof agentInfo];
  
  // Redirect to bridging if invalid agent
  useEffect(() => {
    if (!agent && typeof window !== 'undefined') {
      router.push('/agent/bridging');
    }
  }, [agent, router]);

  if (!agent) return null;

  // Determine agent title or configuration based on ID (optional)
  const getAgentTitle = (id: string) => {
    switch(id.toLowerCase()) {
      case 'bridging': return 'Bridging Agent';
      case 'transaction': return 'Transaction Agent';
      case 'dex': return 'DEX Agent';
      case 'lp': return 'LP Provisioning Agent';
      case 'utility': return 'Utility Agent';
      default: return 'DeFi Agent'; // Fallback title
    }
  };
  const agentTitle = getAgentTitle(agentId);

  // Determine description (optional)
  const getAgentDescription = (id: string) => {
      switch(id.toLowerCase()) {
        case 'bridging': return 'Bridge EDU tokens between Arbitrum and EDU Chain.';
        case 'transaction': return 'Send native EDU or ERC20 tokens on EDU Chain or Arbitrum.';
        case 'dex': return 'Swap, wrap, or unwrap tokens on the EDU Chain DEX.';
        // Add descriptions for other agents
        default: return 'Your assistant for DeFi tasks.';
      }
    };
  const agentDescription = getAgentDescription(agentId);

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-purple-900/40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
            Lilikoi
          </Link>
          <ConnectKitButton />
        </div>
      </header>
      
      <div className="max-w-6xl mx-auto px-4 pb-8">
        {/* Agent Navigation Tabs */}
        <div className="mt-6 mb-4 flex border-b border-gray-800">
          {Object.entries(agentInfo).map(([id, info]) => (
            <Link
              href={`/agent/${id}`}
              key={id}
              className={`px-5 py-3 text-sm font-medium mr-2 transition-all ${
                id === agentId
                  ? 'text-purple-400 border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="mr-2">{info.icon}</span>
              {info.name}
            </Link>
          ))}
        </div>
        
        {/* Display dynamic title and description */}
        <div className="mb-6 text-center md:text-left">
            <h1 className="text-3xl font-bold mb-2 text-white">{agentTitle}</h1>
            <p className="text-gray-400">{agentDescription}</p>
        </div>
        
        {/* Chat Interface */}
        <div className="bg-gray-900 rounded-lg border border-purple-900/40 overflow-hidden shadow-xl">
          <ChatInterface agentId={agentId} />
        </div>
      </div>
    </main>
  );
} 