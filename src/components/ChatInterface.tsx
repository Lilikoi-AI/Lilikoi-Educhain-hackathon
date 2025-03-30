'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useBridgeTransaction, TransactionStatus } from '@/hooks/useBridgeTransaction';
import { BridgeTransactionData } from '@/hooks/useBridgeTransaction';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatInterfaceProps {
  agentId: string;
}

export function ChatInterface({ agentId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<BridgeTransactionData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { address, isConnected } = useAccount();
  const {
    executeTransaction,
    status: txStatus,
    result: txResult,
    isSuccess,
    isError,
    isPending,
  } = useBridgeTransaction();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Watch for transaction status changes
  useEffect(() => {
    if (currentTransaction) {
      if (isSuccess) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: `✅ Transaction successful! Hash: ${txResult.hash}`,
          },
        ]);
        setCurrentTransaction(null);
      } else if (isError) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: `❌ Transaction failed: ${txResult.error}`,
          },
        ]);
        setCurrentTransaction(null);
      }
    }
  }, [txStatus, txResult, isSuccess, isError, currentTransaction]);

  // Parse transaction data from API response
  const handleTransactionData = (data: any) => {
    console.log('Received transaction data from API:', data);

    if (!data) {
      console.error('No transaction data received');
      return;
    }

    try {
      // Parse the transaction data if it's a string
      const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      console.log('Parsed transaction data:', parsedData);

      // Create transaction data object
      const txData: BridgeTransactionData = {
        from: address as string,
        to: parsedData.to,
        data: parsedData.data,
        value: parsedData.value,
        chainId: parsedData.chainId,
        gas: parsedData.gas || '2000000', // Default gas if not provided
        gasPrice: parsedData.gasPrice,
        maxFeePerGas: parsedData.maxFeePerGas,
        maxPriorityFeePerGas: parsedData.maxPriorityFeePerGas,
        nonce: parsedData.nonce,
      };

      // Validate 'to' address has 0x prefix
      if (!txData.to || !txData.to.startsWith('0x')) {
        throw new Error('Invalid "to" address. Must be a valid hex address with 0x prefix.');
      }

      console.log('Formatted transaction data for wallet:', JSON.stringify(txData, null, 2));

      // Save current transaction and execute
      setCurrentTransaction(txData);
      console.log('Executing transaction with wallet client');
      executeTransaction(txData);

      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: '🔄 Please confirm the transaction in your wallet...',
        },
      ]);
    } catch (error) {
      console.error('Error parsing transaction data:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: `❌ Failed to process transaction data: ${(error as Error).message}`,
        },
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !isConnected || isPending) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      console.log('Sending message to API:', {
        agentId,
        userMessage,
        address,
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId,
          userMessage,
          address,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      console.log('API response:', data);

      // Add the assistant message
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.content },
      ]);

      // Check if there's any transaction data to process
      if (data.transactionData && agentId === 'bridging') {
        console.log('Transaction data received, processing...');
        handleTransactionData(data.transactionData);
      } else {
        console.log('No transaction data in response');
      }
    } catch (error) {
      console.error('API request error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user'
              ? 'justify-end'
              : message.role === 'system'
                ? 'justify-center'
                : 'justify-start'
              }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${message.role === 'user'
                ? 'bg-purple-600 text-white'
                : message.role === 'system'
                  ? 'bg-gray-700 text-gray-100'
                  : 'bg-gray-800 text-gray-200'
                }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isConnected
                ? isPending
                  ? "Transaction in progress..."
                  : "Type your message..."
                : "Please connect your wallet first"
            }
            disabled={!isConnected || isLoading || isPending}
            className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            type="submit"
            disabled={!isConnected || isLoading || isPending}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "..." : isPending ? "Pending..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
} 