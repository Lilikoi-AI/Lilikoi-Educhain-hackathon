'use client';

import { useParams, useRouter } from 'next/navigation';
import { ConnectKitButton } from 'connectkit';
import { useState, useEffect } from 'react';
import { ChatInterface } from '@/components/ChatInterface';
import Link from 'next/link';

const agentInfo = {
  bridging: {
    name: 'Bridging Agent',
    description: 'Bridge EDU tokens between Arbitrum and EDU Chain',
    icon: '🌉',
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

export default function AgentPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const agent = agentInfo[agentId as keyof typeof agentInfo];
  
  // Redirect to bridging if invalid agent
  useEffect(() => {
    if (!agent && typeof window !== 'undefined') {
      router.push('/agent/bridging');
    }
  }, [agent, router]);

  if (!agent) return null;

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
        
        {/* Agent Description */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1 flex items-center">
            <span className="mr-2 text-3xl">{agent.icon}</span>
            {agent.name}
          </h1>
          <p className="text-gray-400">{agent.description}</p>
        </div>
        
        {/* Chat Interface */}
        <div className="bg-gray-900 rounded-lg border border-purple-900/40 overflow-hidden shadow-xl">
          <ChatInterface agentId={agentId} />
        </div>
      </div>
    </main>
  );
} 