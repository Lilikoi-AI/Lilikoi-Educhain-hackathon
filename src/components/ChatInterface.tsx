'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useBridgeTransaction, TransactionStatus, BridgeTransactionData } from '@/hooks/useBridgeTransaction';

// Define Chain Info & Explorer URLs
const EDUCHAIN_CHAIN_ID = 41923;
const ARBITRUM_CHAIN_ID = 42161;
const EXPLORER_URLS: { [key: number]: { name: string; url: string } } = {
    [EDUCHAIN_CHAIN_ID]: { name: "EDU Chain Explorer", url: "https://eduscan.live/tx/" },
    [ARBITRUM_CHAIN_ID]: { name: "Arbiscan", url: "https://arbiscan.io/tx/" },
};

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | React.ReactNode;
  timestamp: string;
}

interface ChatInterfaceProps {
  agentId: string;
}

// Define actions that happen on EDU Chain
const EDU_CHAIN_ACTIONS: Set<string> = new Set([
  'withdraw', // Bridge from EDU Chain
  'wrap_edu',
  'unwrap_wedu',
  'send_edu', // Assuming sends are on EDU Chain
  'send_erc20_token', // Assuming sends are on EDU Chain
  'swap_tokens', // Assuming swaps happen on EDU Chain DEX
  'swap_edu_for_tokens', // Assuming swaps happen on EDU Chain DEX
  'swap_tokens_for_edu' // Assuming swaps happen on EDU Chain DEX
]);

// Define actions that happen on Arbitrum
const ARBITRUM_ACTIONS: Set<string> = new Set([
  'approve', // Bridge approval on Arbitrum
  'deposit' // Bridge deposit from Arbitrum
]);

export function ChatInterface({ agentId }: ChatInterfaceProps) {
  // --- 1. State Variables --- 
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<BridgeTransactionData | null>(null);
  const [bridgeStep, setBridgeStep] = useState<string | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingTxData, setPendingTxData] = useState<BridgeTransactionData | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingChainId, setPendingChainId] = useState<number | null>(null); 
  const [pendingAmount, setPendingAmount] = useState<string | null>(null);

  // --- 2. Hooks --- 
  const { address, isConnected, chain } = useAccount(); 
  const {
    executeTransaction,
    status: txStatus,
    result: txResult,
    isPending: isTxLoading,
    isSuccess,
    isError,
    reset,
  } = useBridgeTransaction();

  // --- 3. Utility Functions --- 
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getCurrentTime = useCallback(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), []);
  
  const formatTransactionMessage = useCallback((action: string, txHash: string, chainId: number | null) => {
    const explorer = chainId ? EXPLORER_URLS[chainId] : null;
    const explorerLink = explorer && txHash ? `${explorer.url}${txHash}` : '#';
    const explorerName = explorer ? explorer.name : 'Block Explorer';
    const chainName = explorer ? explorer.name.replace(' Explorer','').replace('scan','') : null;
    return (
      <div className="flex flex-col space-y-2">
        <p className="text-green-400">✅ {action.replace(/_/g, ' ').charAt(0).toUpperCase() + action.replace(/_/g, ' ').slice(1)} transaction successful{chainName ? ` on ${chainName}` : ''}!</p>
        {txHash && explorer && (
          <a href={explorerLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline text-sm">
            View on {explorerName}
          </a>
        )}
      </div>
    );
  }, []);

  const formatErrorMessage = useCallback((action: string, errorMsg: string) => {
      return (
          <p className="text-red-400">❌ Error during {action.replace(/_/g, ' ')}: {errorMsg}</p>
      );
  }, []);

  const formatPendingMessage = useCallback((chainId: number | null) => {
     const targetNetwork = chainId ? EXPLORER_URLS[chainId]?.name.replace(' Explorer','').replace('scan','') : null;
     return (
         <p className="text-yellow-400">
             ⏳ Please confirm the transaction in your wallet.
             {targetNetwork && ` Ensure your wallet is connected to the ${targetNetwork} network (ID: ${chainId}).`}
         </p>
     );
  }, []);

  // --- 4. State Clearing Function --- 
  const clearPendingState = useCallback(() => {
      setPendingTxData(null);
      setPendingAction(null);
      setPendingChainId(null);
      setPendingAmount(null);
      reset(); 
  }, [reset]);

  // --- 5. Transaction Execution Function (Accept Args) --- 
  const runTransaction = useCallback((txData: BridgeTransactionData, action: string, chainId: number | null) => {
    // Check passed arguments instead of state
    if (txData && action) {
        console.log('[runTransaction] Attempting transaction:', action, 'Target Chain:', chainId);
        
        setMessages((prev) => [
            ...prev,
            // Pass chainId from argument
            { role: 'system', content: formatPendingMessage(chainId), timestamp: getCurrentTime() },
        ]);

        try {
            executeTransaction(txData); // Use passed txData
            console.log('[runTransaction] executeTransaction called for:', action);
        } catch (error) {
            console.error(`[runTransaction] Immediate error calling executeTransaction for ${action}:`, error);
            setMessages((prev) => [
                ...prev,
                { role: 'system', content: formatErrorMessage(action, `Failed to initiate transaction: ${(error as Error).message}`), timestamp: getCurrentTime() },
            ]);
            clearPendingState(); 
        }
    } else {
        console.error("[runTransaction] Aborted: Missing txData or action argument.");
    }
  // Remove state dependencies, use function dependencies
  }, [executeTransaction, getCurrentTime, formatPendingMessage, formatErrorMessage, clearPendingState, setMessages]); 

  // --- 6. Submission Handler (Pass Args to runTransaction) --- 
  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement> | Event, isAutoTrigger = false, forcedAction: string | null = null) => {
    if (e) e.preventDefault();
    const messageToSend = isAutoTrigger ? lastUserMessage : input;
    if (!messageToSend.trim() || isLoading || !isConnected) return;

    const newUserMessage: Message = {
      role: 'user',
      content: messageToSend,
      timestamp: getCurrentTime()
    };
    setMessages((prev) => [...prev, newUserMessage]);
    if (!isAutoTrigger) setInput('');
    setIsLoading(true);
    setLastUserMessage(messageToSend); 
    clearPendingState(); 
    setCurrentTransaction(null); 
    setBridgeStep(null); 

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userMessage: messageToSend, address: address, forceAction: forcedAction }),
      });
      const data = await response.json();
      setIsLoading(false);

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.content) {
          setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: data.content, timestamp: getCurrentTime() },
          ]);
      }

      if (data.transactionData && data.action && data.targetChainId) {
        const targetChainId = data.targetChainId as number;
        const action = data.action as string;
        console.log('[TRANSACTION PREP] Action:', action, 'Target Chain:', targetChainId);
        console.log('[TRANSACTION PREP] ToolInput:', data.toolInput); // Debug toolInput
        
        const txData: BridgeTransactionData = { 
             from: address as string, 
             to: data.transactionData.to,
             data: data.transactionData.data,
             value: data.transactionData.value,
             gas: data.transactionData.gas || '2000000', 
             gasPrice: data.transactionData.gasPrice,
             maxFeePerGas: data.transactionData.maxFeePerGas,
             maxPriorityFeePerGas: data.transactionData.maxPriorityFeePerGas,
             nonce: data.transactionData.nonce,
        };

        // *** Store amount if action is approve ***
        if (action === 'approve' && data.toolInput?.amount) { // Assuming API returns toolInput
            setPendingAmount(data.toolInput.amount as string);
            console.log('Stored pending amount for deposit:', data.toolInput.amount);
        } else if (action === 'approve') {
            // Fallback or error if amount missing for approve
            console.error("Amount missing from toolInput for approve action!");
            // Handle error appropriately - maybe don't proceed?
        }
        
        // Set pending state (txData, action, chainId) ...
        setPendingTxData(txData);
        setPendingAction(action);
        setPendingChainId(targetChainId); 
        setCurrentTransaction(txData); 
        setBridgeStep(action as any); 
        
        // Call runTransaction directly (no network switch)
        console.log(`Proceeding to request transaction signature on wallet (User must ensure correct network: ${targetChainId})`);
        runTransaction(txData, action, targetChainId); 
      }

    } catch (error) {
        console.error('API Error:', error);
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: formatErrorMessage('API Error', (error as Error).message), timestamp: getCurrentTime() },
        ]);
        clearPendingState(); 
    }
  }, [agentId, input, isLoading, isConnected, address, lastUserMessage, runTransaction, clearPendingState, reset, getCurrentTime, formatErrorMessage]); 

  // --- 7. Auto-Deposit Trigger Function --- 
  const triggerDeposit = useCallback(async () => {
      if (!pendingAmount) {
          console.error("Cannot trigger deposit: pending amount not found.");
          setMessages((prev) => [
            ...prev, { role: 'system', content: formatErrorMessage('Deposit', 'Cannot proceed with deposit: approved amount not found.'), timestamp: getCurrentTime() }
          ]);
          clearPendingState(); // Clear other state
          return;
      }
      if (!address) {
           console.error("Cannot trigger deposit: address not found.");
           return; // Should not happen if approve worked
      }

      console.log(`Automatically triggering deposit for amount: ${pendingAmount}`);
      setIsLoading(true); // Show loading for the backend call
      // Reset parts of state before the new API call, keep amount
      setPendingTxData(null);
      setPendingAction(null); // Action will be set by response
      setPendingChainId(null); // ChainId will be set by response
      reset(); // Reset wagmi state
      
      try {
         const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: 'bridging', // Hardcode for bridging context
                userMessage: `Automatic deposit trigger after approve for ${pendingAmount} EDU.`, // Context msg
                address: address,
                forceAction: 'deposit', // Force the deposit action
                amount: pendingAmount, // Send the stored amount
            }),
        });
        const data = await response.json();
        setIsLoading(false);

        if (data.error) throw new Error(data.error);

        // Add assistant message (if any)
        if (data.content) {
            setMessages((prev) => [
              ...prev, { role: 'assistant', content: data.content, timestamp: getCurrentTime() }
            ]);
        }
        
        // Handle the returned transaction data for deposit
        if (data.transactionData && data.action === 'deposit' && data.targetChainId) {
            const targetChainId = data.targetChainId as number;
            const action = data.action as string;
            console.log('[Deposit Trigger] Raw transactionData received:', data.transactionData);
            
            // Properly map transaction data
            const txData: BridgeTransactionData = { 
                from: address as string, 
                to: data.transactionData.to,
                data: data.transactionData.data,
                value: data.transactionData.value || '0x0',
                gas: data.transactionData.gas || '2000000', 
                gasPrice: data.transactionData.gasPrice,
                maxFeePerGas: data.transactionData.maxFeePerGas,
                maxPriorityFeePerGas: data.transactionData.maxPriorityFeePerGas,
                nonce: data.transactionData.nonce,
            };
            
            console.log('[Deposit Trigger] Received action:', action, 'Target Chain:', targetChainId);
            console.log('[Deposit Trigger] Transaction data:', txData);
            
            // Set pending state for deposit
            setPendingTxData(txData);
            setPendingAction(action);
            setPendingChainId(targetChainId);
            setCurrentTransaction(txData);
            setBridgeStep(action as any);
            
            // Run the deposit transaction
            runTransaction(txData, action, targetChainId);
        } else {
             console.error("[Deposit Trigger] API response missing data for deposit:", data);
             throw new Error("Failed to get deposit transaction data from backend.");
        }

      } catch (error) {
          console.error('[Deposit Trigger] API Error:', error);
          setIsLoading(false);
          setMessages((prev) => [
            ...prev, { role: 'system', content: formatErrorMessage('Deposit', (error as Error).message), timestamp: getCurrentTime() }
          ]);
          clearPendingState(); // Clear all state on error
      }
      
  }, [address, pendingAmount, agentId, reset, clearPendingState, runTransaction, getCurrentTime, formatErrorMessage]);

  // --- 8. useEffect Hooks --- 
  // Effect to scroll messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Effect for initial welcome message
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

  // Effect to focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Effect to handle transaction status updates (Success/Error)
  useEffect(() => {
    if (pendingAction && pendingChainId !== null) { 
      if (isSuccess) {
        const currentAction = pendingAction; 
        const currentChainId = pendingChainId;
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: formatTransactionMessage(currentAction, txResult.hash || '', currentChainId), 
            timestamp: getCurrentTime()
          },
        ]);

        // *** Call triggerDeposit instead of handleSubmit ***
        if (currentAction === 'approve') {
           console.log('Approve successful, automatically triggering deposit...');
           // Don't clear state here, triggerDeposit handles its own state management
           triggerDeposit(); 
        } else {
          // Clear state for other successful txs (like deposit, withdraw, send etc)
          clearPendingState(); 
          setBridgeStep(null);
          setCurrentTransaction(null);
          setLastUserMessage('');
        }
      } else if (isError) {
        const currentAction = pendingAction;
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: formatErrorMessage(currentAction, txResult.error || 'Unknown error'), 
            timestamp: getCurrentTime()
          },
        ]);
        clearPendingState();
        setBridgeStep(null);
        setCurrentTransaction(null);
        setLastUserMessage('');
      }
    }
  }, [txStatus, txResult, isSuccess, isError, pendingAction, pendingChainId, reset, clearPendingState, formatTransactionMessage, formatErrorMessage, getCurrentTime, setMessages, setBridgeStep, setCurrentTransaction, setLastUserMessage, triggerDeposit]); // Removed handleSubmit, added triggerDeposit

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
        <form onSubmit={handleSubmit} className="flex space-x-2 items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isConnected ? "Type your message..." : "Connect wallet to continue"}
            disabled={!isConnected || isLoading || isTxLoading}
            className="flex-1 bg-gray-800 rounded-full py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 border border-gray-700 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || !isConnected || isLoading || isTxLoading}
            className={`p-2.5 rounded-full focus:outline-none transition-colors
              ${!input.trim() || !isConnected || isLoading || isTxLoading
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