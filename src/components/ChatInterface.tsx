'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useBridgeTransaction, TransactionStatus } from '@/hooks/useBridgeTransaction';
import { BridgeTransactionData } from '@/hooks/useBridgeTransaction';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | JSX.Element;
  timestamp?: string;
}

interface ChatInterfaceProps {
  agentId: string;
}

export function ChatInterface({ agentId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<BridgeTransactionData | null>(null);
  const [bridgeStep, setBridgeStep] = useState<'approve' | 'deposit' | 'withdraw' | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { address, isConnected } = useAccount();
  const {
    executeTransaction,
    status: txStatus,
    result: txResult,
    isSuccess,
    isError,
    isPending,
    reset,
  } = useBridgeTransaction();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Add welcome message when component mounts
  useEffect(() => {
    const welcomeMessages: Message[] = [
      {
        role: 'assistant',
        content: getWelcomeMessage(agentId),
        timestamp: getCurrentTime()
      }
    ];
    
    setMessages(welcomeMessages);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [agentId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Get current formatted time
  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get welcome message based on agent type
  const getWelcomeMessage = (id: string) => {
    switch(id) {
      case 'bridging':
        return "Welcome to the Bridging Agent. I can help you transfer EDU tokens between chains. Tell me what you'd like to do:\n\n• Bridge from Arbitrum to EDU Chain\n• Bridge from EDU Chain to Arbitrum (withdraw)";
      case 'lp':
        return "Welcome to the LP Provisioning Agent. I can help you provide liquidity and earn rewards. What would you like to know?";
      case 'utility':
        return "Welcome to the Utility Agent. I can help you with various EDU Chain features. How can I assist you today?";
      default:
        return "Hello! How can I help you today?";
    }
  };

  // Format transaction status messages
  const formatTransactionMessage = (step: string, hash: string) => {
    // Use EDU Chain explorer for withdraw transactions, Arbitrum explorer for others
    const explorerUrl = step === 'withdraw' 
      ? `https://educhain.blockscout.com/tx/${hash}`  // EDU Chain explorer
      : `https://arbiscan.io/tx/${hash}`;             // Arbitrum explorer
    
    const chainName = step === 'withdraw' ? 'EDU Chain' : 'Arbitrum';
    
    return (
      <div className="flex flex-col">
        <div className="flex items-center mb-1.5">
          <div className="text-green-400 mr-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="font-medium text-green-400">{step.charAt(0).toUpperCase() + step.slice(1)} transaction successful</span>
        </div>
        <a 
          href={explorerUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-purple-400 hover:text-purple-300 underline break-all pl-6"
        >
          View on {chainName} explorer
        </a>
      </div>
    );
  };

  // Format transaction error messages
  const formatErrorMessage = (step: string, error: string) => {
    return (
      <div className="flex flex-col">
        <div className="flex items-center mb-1.5">
          <div className="text-red-400 mr-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="font-medium text-red-400">Transaction failed</span>
        </div>
        <div className="text-xs text-red-300/70 pl-6 line-clamp-2">
          {error}
        </div>
      </div>
    );
  };

  // Format pending transaction message
  const formatPendingMessage = () => {
    return (
      <div className="flex items-center">
        <span className="text-gray-300">Confirm in your wallet...</span>
      </div>
    );
  };

  // Format auto-proceeding message
  const formatAutoDepositMessage = () => {
    return (
      <div className="flex items-center">
        <div className="mr-2 w-4 h-4 relative flex justify-center items-center">
          <div className="absolute w-4 h-4 rounded-full border-2 border-purple-400 border-t-transparent"></div>
        </div>
        <span className="text-purple-400">Automatically processing deposit...</span>
      </div>
    );
  };

  // Watch for transaction status changes and handle sequence
  useEffect(() => {
    if (currentTransaction && bridgeStep) {
      if (isSuccess) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: formatTransactionMessage(bridgeStep, txResult.hash || ''),
            timestamp: getCurrentTime()
          },
        ]);

        // If approve was successful, automatically proceed with deposit
        if (bridgeStep === 'approve') {
          setMessages((prev) => [
            ...prev,
            {
              role: 'system',
              content: formatAutoDepositMessage(),
              timestamp: getCurrentTime()
            },
          ]);
          
          // Reset transaction state
          reset();
          setCurrentTransaction(null);
          
          // Trigger deposit with forceAction
          handleSubmit(new Event('submit') as any, true, 'deposit');
        } else {
          // Reset states after other transactions
          setBridgeStep(null);
          setCurrentTransaction(null);
          setLastUserMessage('');
        }
      } else if (isError) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: formatErrorMessage(bridgeStep, txResult.error || 'Unknown error'),
            timestamp: getCurrentTime()
          },
        ]);
        setBridgeStep(null);
        setCurrentTransaction(null);
        setLastUserMessage('');
      }
    }
  }, [txStatus, txResult, isSuccess, isError, currentTransaction, bridgeStep]);

  // Parse transaction data from API response
  const handleTransactionData = (data: any, action: string) => {
    console.log('Received transaction data from API:', data);
    console.log('Action:', action);

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

      // Save current transaction, action, and execute
      setCurrentTransaction(txData);
      setBridgeStep(action as any);
      console.log('Executing transaction with wallet client');
      executeTransaction(txData);

      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: formatPendingMessage(),
          timestamp: getCurrentTime()
        },
      ]);
    } catch (error) {
      console.error('Error parsing transaction data:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: `Failed to process transaction: ${(error as Error).message}`,
          timestamp: getCurrentTime()
        },
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent, isAutomatic: boolean = false, forceAction?: string) => {
    e.preventDefault();
    
    // Use stored message for automatic transactions, otherwise use input
    const userMessage = isAutomatic ? lastUserMessage : input.trim();
    
    if ((!userMessage && !isAutomatic) || isLoading || !isConnected || isPending) return;

    if (!isAutomatic) {
      setInput('');
      setLastUserMessage(userMessage);
      setMessages((prev) => [...prev, { 
        role: 'user', 
        content: userMessage,
        timestamp: getCurrentTime()
      }]);
    }
    
    setIsLoading(true);

    try {
      console.log('Sending message to API:', {
        agentId,
        userMessage,
        address,
        forceAction,
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
          forceAction,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      console.log('API response:', data);

      // Add the assistant message only if not automatic
      if (!isAutomatic) {
        setMessages((prev) => [
          ...prev,
          { 
            role: 'assistant', 
            content: data.content,
            timestamp: getCurrentTime()
          },
        ]);
      }

      // Check if there's any transaction data to process
      if (data.transactionData && agentId === 'bridging') {
        console.log('Transaction data received, processing...');
        handleTransactionData(data.transactionData, data.action);
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
          timestamp: getCurrentTime()
        },
      ]);
    }

    setIsLoading(false);
  };

  // Render loading indicator
  const renderTypingIndicator = () => {
    if (!isLoading) return null;
    
    return (
      <div className="flex justify-start mb-4">
        <div className="bg-gray-800 rounded-lg py-3 px-5">
          <div className="flex space-x-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((message, index) => (
          <div key={index} className="mb-4 last:mb-0">
            {message.role === 'user' && (
              <div className="flex justify-end">
                <div className="max-w-[85%]">
                  <div className="bg-purple-600 px-4 py-3 rounded-2xl rounded-tr-none text-white shadow-sm">
                    {message.content}
                  </div>
                  {message.timestamp && (
                    <div className="text-right mt-1">
                      <span className="text-[10px] text-gray-500">{message.timestamp}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {message.role === 'assistant' && (
              <div className="flex justify-start">
                <div className="max-w-[85%]">
                  <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-tl-none text-white shadow-sm">
                    {message.content}
                  </div>
                  {message.timestamp && (
                    <div className="mt-1">
                      <span className="text-[10px] text-gray-500">{message.timestamp}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {message.role === 'system' && (
              <div className="flex justify-center my-3">
                <div className="px-4 py-1.5 bg-black/40 border border-gray-800 rounded-full text-sm flex items-center">
                  {message.content}
                </div>
              </div>
            )}
          </div>
        ))}
        
        {renderTypingIndicator()}
        
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-800 p-4">
        <form onSubmit={(e) => handleSubmit(e)} className="flex space-x-2 items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isConnected ? "Type your message..." : "Connect wallet to continue"}
            disabled={!isConnected || isPending}
            className="flex-1 bg-gray-800 rounded-full py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 border border-gray-700 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || !isConnected || isLoading || isPending}
            className={`p-2.5 rounded-full focus:outline-none transition-colors
              ${!input.trim() || !isConnected || isLoading || isPending
                ? 'bg-gray-800 text-gray-600'
                : 'bg-purple-600 text-white hover:bg-purple-500'
              }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
} 