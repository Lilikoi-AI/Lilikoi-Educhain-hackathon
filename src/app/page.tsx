import Link from 'next/link';

const agents = [
  {
    id: 'bridging',
    name: 'Bridging Agent',
    description: 'Bridge tokens between chains',
    icon: '🌉',
  },
  {
    id: 'lp',
    name: 'LP Provisioning Agent',
    description: 'Manage liquidity positions',
    icon: '💧',
  },
  {
    id: 'utility',
    name: 'Utility Agent',
    description: 'General DeFi operations',
    icon: '🛠️',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold text-center mb-4 bg-gradient-to-r from-purple-500 to-pink-500 text-transparent bg-clip-text">
          Lilikoi - Your DeFi Brain
        </h1>
        <p className="text-center text-gray-400 mb-12">
          Choose your AI agent to get started with DeFi operations
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/agent/${agent.id}`}
              className="block p-6 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors border border-gray-700"
            >
              <div className="text-4xl mb-4">{agent.icon}</div>
              <h2 className="text-xl font-semibold mb-2">{agent.name}</h2>
              <p className="text-gray-400">{agent.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
