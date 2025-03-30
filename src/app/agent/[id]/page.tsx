'use client';

import { useParams } from 'next/navigation';
import { ConnectKitButton } from 'connectkit';
import { useState } from 'react';
import { ChatInterface } from '@/components/ChatInterface';

const agentNames = {
  bridging: 'Bridging Agent',
  lp: 'LP Provisioning Agent',
  utility: 'Utility Agent',
};

export default function AgentPage() {
  const params = useParams();
  const agentId = params.id as string;
  const agentName = agentNames[agentId as keyof typeof agentNames];

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">{agentName}</h1>
          <ConnectKitButton />
        </div>
        
        <ChatInterface agentId={agentId} />
      </div>
    </main>
  );
} 