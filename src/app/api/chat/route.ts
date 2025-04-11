import { Anthropic } from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { BridgeMCP } from '@/mcp/bridge';
import * as agentKit from '@/lib/agent-kit-logic';
import { ethers } from 'ethers';
import { SailfishBridge } from '@/lib/sailfish-bridge-logic';
import { Bridge } from '@/lib/bridge-logic';

// BSC OFT ABI used for bridging
const BSC_ABI = [
  "function estimateSendFee(uint16 dstChainId, bytes calldata toAddress, uint256 amount, bool useZro, bytes calldata adapterParams) external view returns (uint256 nativeFee, uint256 zroFee)",
  "function sendFrom(address from, uint16 dstChainId, bytes calldata toAddress, uint256 amount, address payable refundAddress, address zroPaymentAddress, bytes calldata adapterParams) external payable"
];

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type BridgeAction = 'approve' | 'deposit' | 'withdraw';
type InfoAction = 
    'get_token_price' | 'get_token_info' | 'get_pool_info' | 'get_top_tokens' | 'get_top_pools' | 'get_total_tvl' | 
    'get_24h_volume' | 'get_token_historical_data' | 'get_pool_historical_data' | 
    'get_edu_balance' | 'get_token_balance' | 'get_multiple_token_balances' | 'get_nft_balance' | 'get_wallet_overview' | 
    'get_swap_quote' | 
    'get_external_market_data' | 'check_arbitrage_opportunities' | 'get_external_market_config' | 
    'get_rpc_url'; 

// Define Sailfish action types
type SailfishAction = 
    // Arb <-> Edu Chain
    'sailfish_is_edu_approved' | 
    'sailfish_approve_edu' | 
    'sailfish_bridge_from_arb' | 
    'sailfish_bridge_from_edu' | 
    'sailfish_estimate_bridge_fee' | 
    'sailfish_has_enough_edu_on_arb' | // New
    
    // BSC -> Arbitrum
    'sailfish_is_edu_approved_on_bsc' | 
    'sailfish_approve_edu_on_bsc' | 
    'sailfish_estimate_bridge_fee_bsc_to_arb' | 
    'sailfish_bridge_from_bsc_to_arb' | 
    'sailfish_has_enough_edu_on_bsc' | // New
    'sailfish_has_enough_bnb';         // New
    
type TransactionAction = 
    BridgeAction | 
    'send_edu' | 'send_erc20_token' | 
    'swap_tokens' | 'swap_edu_for_tokens' | 'swap_tokens_for_edu' | 
    'wrap_edu' | 'unwrap_wedu';
    
type Action = TransactionAction | InfoAction | SailfishAction;

const internalInfoTools: { [K in InfoAction]?: (...args: any[]) => Promise<any> } = {
    get_token_price: agentKit.getTokenPrice,
    get_token_info: agentKit.getToken,         
    get_pool_info: agentKit.getPool,           
    get_top_tokens: agentKit.getTopTokens,     
    get_top_pools: agentKit.getTopPools,       
    get_total_tvl: agentKit.getTotalTVL,       
    get_24h_volume: agentKit.getFactory,
    get_token_historical_data: agentKit.getTokenDayData,
    get_pool_historical_data: agentKit.getPoolDayData,
    get_edu_balance: agentKit.getEduBalance,
    get_token_balance: agentKit.getTokenBalance,
    get_multiple_token_balances: agentKit.getMultipleTokenBalances,
    get_nft_balance: agentKit.getERC721Balance,
    get_wallet_overview: agentKit.getWalletOverview,
    get_swap_quote: agentKit.getSwapQuote,
    get_external_market_data: agentKit.getExternalMarketData,
    check_arbitrage_opportunities: agentKit.checkArbitrageOpportunities,
    get_external_market_config: async () => agentKit.getConfig(),
    get_rpc_url: async () => agentKit.getRpcUrl(),
};

const internalTxPrepTools: { [K in Exclude<TransactionAction, BridgeAction>]?: (...args: any[]) => Promise<any> } = {
    send_edu: agentKit.prepareSendEduTx,
    send_erc20_token: agentKit.prepareSendErc20Tx,
    swap_tokens: agentKit.prepareSwapTokensTx,
    swap_edu_for_tokens: agentKit.prepareSwapEduForTokensTx,
    swap_tokens_for_edu: agentKit.prepareSwapTokensForEduTx,
    wrap_edu: agentKit.prepareWrapEduTx,
    unwrap_wedu: agentKit.prepareUnwrapWeduTx,
};

// Implement Sailfish bridging tools
const internalSailfishTools: { [K in SailfishAction]?: (...args: any[]) => Promise<any> } = {
  sailfish_is_edu_approved: async (amount: string, ownerAddress: string, sourceChain: string) => {
    if (sourceChain !== 'arbitrum') {
      throw new Error('Currently only Arbitrum source chain is supported for approval checks');
    }
    
    // Create a provider for Arbitrum
    const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc');
    const bridge = new SailfishBridge(provider);
    
    const result = await bridge.isEduApprovedOnArb(ownerAddress, amount);
    return { approved: result };
  },
  
  sailfish_approve_edu: async (amount: string, sourceChain: string) => {
    if (sourceChain !== 'arbitrum') {
      throw new Error('Currently only Arbitrum source chain is supported for approvals');
    }
    
    // Create a provider for Arbitrum
    const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc');
    const bridge = new SailfishBridge(provider);
    
    const txData = await bridge.prepareApproveEduOnArb();
    return txData;
  },
  
  sailfish_bridge_from_arb: async (amount: string, address: string) => {
    // Create a provider for Arbitrum
    const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc');
    const bridge = new SailfishBridge(provider);
    
    const txData = await bridge.prepareBridgeEduFromArbToEdu(amount);
    return txData;
  },
  
  sailfish_bridge_from_edu: async (amount: string, address: string) => {
    // This is a placeholder for bridging from EDU to Arbitrum
    // Not yet implemented in the SDK
    throw new Error('Bridging from EDU to Arbitrum not yet implemented');
  },
  
  sailfish_estimate_bridge_fee: async (amount: string, sourceChain: string, targetChain: string) => {
    if (sourceChain !== 'arbitrum' || targetChain !== 'educhain') {
      throw new Error('Currently only Arbitrum to EDU Chain is supported for fee estimation');
    }
    
    // Placeholder for fee estimation from Arbitrum to EDU Chain
    return { fee: "0.001", currency: "ETH" };
  },
  
  // BSC to Arbitrum bridging tools
  sailfish_is_edu_approved_on_bsc: async (amount: string, ownerAddress: string) => {
    // Create a provider for BSC
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org');
    const bridge = new Bridge(provider);
    
    const result = await bridge.isEduApprovedOnBsc(ownerAddress, amount);
    return { approved: result };
  },
  
  sailfish_approve_edu_on_bsc: async () => {
    // Create a provider for BSC
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org');
    const bridge = new Bridge(provider);
    
    const txData = await bridge.approveEduOnBsc();
    return txData;
  },
  
  sailfish_estimate_bridge_fee_bsc_to_arb: async (amount: string, address: string, gasOnDestination: string = "0.0005") => {
    // Create a provider for BSC
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org');
    const bridge = new Bridge(provider);
    
    // Call the estimateBridgeFee method (which will now handle errors gracefully)
    const fee = await bridge.estimateBridgeFee(amount, address, gasOnDestination);
    return { fee, currency: "BNB" }; // Return the estimated (or default) fee
  },
  
  sailfish_bridge_from_bsc_to_arb: async (amount: string, address: string, gasOnDestination: string = "0.0005") => {
    // Create a provider for BSC
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org');
    const bridge = new Bridge(provider);
    
    const txData = await bridge.bridgeEduFromBscToArb(amount, address, gasOnDestination);
    return txData;
  },
  
  sailfish_has_enough_edu_on_bsc: async (amount: string, ownerAddress: string) => {
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org');
    const bridge = new Bridge(provider);
    const result = await bridge.hasEnoughEdu(ownerAddress, amount); // Corrected: hasEnoughEdu
    return { hasEnough: result };
  },
  
  sailfish_has_enough_bnb: async (fee: string, ownerAddress: string) => {
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org');
    const bridge = new Bridge(provider);
    // Corrected: hasEnoughBnb, parameter name is 'fee'
    const result = await bridge.hasEnoughBnb(ownerAddress, fee); 
    return { hasEnough: result };
  },

  sailfish_has_enough_edu_on_arb: async (amount: string, ownerAddress: string) => {
    const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc');
    const bridge = new Bridge(provider); // Bridge class now handles both BSC and Arb checks
    const result = await bridge.hasEnoughEduOnArb(ownerAddress, amount);
    return { hasEnough: result };
  }
};

// --- Constants ---
const ARBITRUM_EDU_TOKEN_ADDRESS = "0xf8173a39c56a554837C4C7f104153A005D284D11";
const ARBITRUM_CHAIN_ID = 42161;
const EDUCHAIN_CHAIN_ID = 41923;

// Define necessary constants locally if not imported
const WEDU_ADDRESS = '0xd02E8c38a8E3db71f8b2ae30B8186d7874934e12'; // Replace with actual WEDU address if different

// --- Type Definitions for Tool Inputs --- 
interface BaseToolInput { [key: string]: any; } // Looser base for flexibility

interface WalletAddressInput extends BaseToolInput { walletAddress?: string; }
interface TokenAddressInput extends BaseToolInput { tokenAddress?: string; }
interface TokenIdInput extends BaseToolInput { tokenId?: string; }
interface RecipientInput extends BaseToolInput { recipient?: string; }
interface AddressInput extends BaseToolInput { address?: string; }
interface AmountInput extends BaseToolInput { amount?: string; }
interface TokenInOutAmountInput extends BaseToolInput { tokenIn?: string; tokenOut?: string; amountIn?: string; }
interface SlippageDeadlineInput extends BaseToolInput { slippagePercentage?: number; deadlineMinutes?: number; }

// Specific Tool Input Interfaces (Combine as needed)
interface GetBalanceInput extends WalletAddressInput {}
interface GetTokenInfoInput extends TokenIdInput {}
interface GetTokenBalanceInput extends TokenAddressInput, WalletAddressInput {}
interface SendEduInput extends RecipientInput, AmountInput {}
interface SendErc20TokenInput extends TokenAddressInput, RecipientInput, AmountInput {}
interface SwapQuoteInput extends TokenInOutAmountInput {}
interface SwapTokensInput extends TokenInOutAmountInput, RecipientInput, SlippageDeadlineInput {}
interface SwapEduForTokensInput extends BaseToolInput { tokenOut?: string; amountIn?: string; recipient?: string; slippagePercentage?: number; deadlineMinutes?: number; }
interface SwapTokensForEduInput extends BaseToolInput { tokenIn?: string; amountIn?: string; recipient?: string; slippagePercentage?: number; deadlineMinutes?: number; }
interface WrapUnwrapInput extends AmountInput {}
interface BridgeInput extends AddressInput, AmountInput {}

// --- Define ALL Tool Schemas --- 
// (Ensure these are the complete, correct schemas from previous steps)
const getEduBalanceSchema: Anthropic.Tool = {
    name: "get_edu_balance", description: "Get the native EDU balance of a specific wallet address on the EDU Chain.",
    input_schema: { type: "object", properties: { address: { type: "string", description: "The wallet address (starting with 0x) to check the balance for." } }, required: ["address"] }
};
const sendEduSchema: Anthropic.Tool = {
    name: "send_edu", description: "Prepare a transaction to send *native EDU* (the base currency) on the *EDU Chain* to a specified recipient address, also on the EDU Chain. This is NOT for ERC20 tokens or bridging.",
    input_schema: { type: "object", properties: { recipient: { type: "string", description: "The destination wallet address (starting with 0x) to send EDU to." }, amount: { type: "string", description: "The amount of EDU to send (e.g., \"0.5\", \"10\")." } }, required: ["recipient", "amount"] }
};
const wrapEduSchema: Anthropic.Tool = {
    name: "wrap_edu", description: "Prepare a transaction to wrap *native EDU* into Wrapped EDU (WEDU) on the *EDU Chain*.",
    input_schema: { type: "object", properties: { amount: { type: "string", description: "The amount of native EDU to wrap (e.g., \"1.2\")." } }, required: ["amount"] }
};
const approveSchema: Anthropic.Tool = {
    name: "approve", description: `Prepare an approval transaction on the *Arbitrum* chain (Chain ID ${ARBITRUM_CHAIN_ID}) to allow the bridge contract to spend the user's *EDU ERC20 token* (Address: ${ARBITRUM_EDU_TOKEN_ADDRESS}). This is the first step required before depositing tokens *from Arbitrum to EDU Chain*.`,
    input_schema: { type: "object", properties: { amount: { type: "string", description: "The amount of EDU to approve for bridging." } }, required: ["amount"] }
};
const depositSchema: Anthropic.Tool = {
    name: "deposit", description: `Prepare a deposit transaction on the *Arbitrum* chain (Chain ID ${ARBITRUM_CHAIN_ID}) to lock *EDU ERC20 tokens* (Address: ${ARBITRUM_EDU_TOKEN_ADDRESS}) in the bridge contract, initiating the transfer *from Arbitrum to EDU Chain*. Requires prior approval.`,
    input_schema: { type: "object", properties: { amount: { type: "string", description: "The amount of EDU to deposit into the bridge." } }, required: ["amount"] }
};
const withdrawSchema: Anthropic.Tool = {
    name: "withdraw", description: `Prepare a withdrawal transaction on the *EDU Chain* (Chain ID ${EDUCHAIN_CHAIN_ID}) to claim *native EDU* that was bridged *from Arbitrum*. This completes the bridge transfer to the EDU Chain.`,
    input_schema: { type: "object", properties: { amount: { type: "string", description: "The amount of EDU to withdraw/claim on EDU Chain." } }, required: ["amount"] } 
};
const getTokenBalanceSchema: Anthropic.Tool = {
    name: "get_token_balance", 
    description: `Get the balance of a specific ERC20 token for a given wallet address on the EDU Chain. Provide the token name (e.g., 'USDC', 'WETH') or its contract address.`,
    input_schema: { type: "object", properties: { tokenAddress: { type: "string", description: "The name (e.g., 'USDC') or the contract address (0x...) of the ERC20 token." }, walletAddress: { type: "string", description: "The wallet address (0x...) to check the balance for." } }, required: ["tokenAddress", "walletAddress"] }
};
const sendErc20TokenSchema: Anthropic.Tool = {
    name: "send_erc20_token", description: `Prepare a transaction to send a specific ERC20 token from the user's wallet to a recipient. Specify the token's contract address. For sending EDU *on Arbitrum*, use token address ${ARBITRUM_EDU_TOKEN_ADDRESS}. For other ERC20s, assume they are on EDU Chain (${EDUCHAIN_CHAIN_ID}).`,
    input_schema: { type: "object", properties: { tokenAddress: { type: "string", description: "The address of the ERC20 token contract to send." }, recipient: { type: "string", description: "The destination wallet address." }, amount: { type: "string", description: "The amount of the token to send." } }, required: ["tokenAddress", "recipient", "amount"] }
};
const swapTokensSchema: Anthropic.Tool = {
    name: "swap_tokens", description: "Prepare a transaction to swap one ERC20 token for another on the *EDU Chain* DEX (SailFish).",
    input_schema: { type: "object", properties: { tokenIn: { type: "string", description: "The address of the ERC20 token to swap FROM." }, tokenOut: { type: "string", description: "The address of the ERC20 token to swap TO." }, amountIn: { type: "string", description: "The amount of tokenIn to swap." }, recipient: { type: "string", description: "The address that will receive the output tokens." }, slippagePercentage: { type: "number", description: "Optional: Max allowed slippage percentage. Defaults handled backend." }, deadlineMinutes: { type: "integer", description: "Optional: Transaction deadline in minutes. Defaults handled backend." } }, required: ["tokenIn", "tokenOut", "amountIn", "recipient"] }
};
const swapEduForTokensSchema: Anthropic.Tool = {
    name: "swap_edu_for_tokens", description: "Prepare a transaction to swap *native EDU* for a specific ERC20 token on the *EDU Chain* DEX (SailFish).",
    input_schema: { type: "object", properties: { tokenOut: { type: "string", description: "The address of the ERC20 token to swap TO." }, amountIn: { type: "string", description: "The amount of native EDU to swap." }, recipient: { type: "string", description: "The address that will receive the output tokens." }, slippagePercentage: { type: "number", description: "Optional: Max allowed slippage percentage. Defaults handled backend." }, deadlineMinutes: { type: "integer", description: "Optional: Transaction deadline in minutes. Defaults handled backend." } }, required: ["tokenOut", "amountIn", "recipient"] }
};
const swapTokensForEduSchema: Anthropic.Tool = {
    name: "swap_tokens_for_edu", description: "Prepare a transaction to swap a specific ERC20 token for *native EDU* on the *EDU Chain* DEX (SailFish).",
    input_schema: { type: "object", properties: { tokenIn: { type: "string", description: "The address of the ERC20 token to swap FROM." }, amountIn: { type: "string", description: "The amount of tokenIn to swap." }, recipient: { type: "string", description: "The address that will receive the native EDU." }, slippagePercentage: { type: "number", description: "Optional: Max allowed slippage percentage. Defaults handled backend." }, deadlineMinutes: { type: "integer", description: "Optional: Transaction deadline in minutes. Defaults handled backend." } }, required: ["tokenIn", "amountIn", "recipient"] }
};
const unwrapWeduSchema: Anthropic.Tool = {
    name: "unwrap_wedu", description: "Prepare a transaction to unwrap Wrapped EDU (WEDU) back into *native EDU* on the *EDU Chain*.",
    input_schema: { type: "object", properties: { amount: { type: "string", description: "The amount of WEDU to unwrap." } }, required: ["amount"] }
};
const getTokenPriceSchema: Anthropic.Tool = {
    name: "get_token_price", description: "Get the current USD price of a specific token on the EDU Chain DEX.",
    input_schema: { type: "object", properties: { tokenId: { type: "string", description: "The address of the token." } }, required: ["tokenId"] }
};
const getTokenInfoSchema: Anthropic.Tool = {
    name: "get_token_info", description: "Get detailed information about a specific token on the EDU Chain DEX (symbol, name, decimals, TVL, volume, etc.).",
    input_schema: { type: "object", properties: { tokenId: { type: "string", description: "The address of the token." } }, required: ["tokenId"] }
};
const getPoolInfoSchema: Anthropic.Tool = {
    name: "get_pool_info", description: "Get detailed information about a specific liquidity pool on the EDU Chain DEX.",
    input_schema: { type: "object", properties: { poolId: { type: "string", description: "The address of the liquidity pool." } }, required: ["poolId"] }
};
const getTopTokensSchema: Anthropic.Tool = {
    name: "get_top_tokens", description: "Get a list of the top tokens on the EDU Chain DEX, ordered by TVL.",
    input_schema: { type: "object", properties: { count: { type: "integer", description: "Optional: The number of top tokens to return. Defaults handled backend." } }, required: [] }
};
const getTopPoolsSchema: Anthropic.Tool = {
    name: "get_top_pools", description: "Get a list of the top liquidity pools on the EDU Chain DEX, ordered by TVL.",
    input_schema: { type: "object", properties: { count: { type: "integer", description: "Optional: The number of top pools to return. Defaults handled backend." } }, required: [] }
};
const getTotalTvlSchema: Anthropic.Tool = {
    name: "get_total_tvl", description: "Get the total value locked (TVL) across the entire EDU Chain DEX.",
    input_schema: { type: "object", properties: {}, required: [] }
};
const get24hVolumeSchema: Anthropic.Tool = {
    name: "get_24h_volume", description: "Get the total trading volume across the entire EDU Chain DEX in the last 24 hours.",
    input_schema: { type: "object", properties: {}, required: [] }
};
const getSwapQuoteSchema: Anthropic.Tool = {
    name: "get_swap_quote", 
    description: "Get a price quote for swapping one token for another on the EDU Chain DEX (SailFish). Provide token names/symbols (e.g., 'EDU', 'USDC') or addresses. Does not execute the swap.",
    input_schema: { 
        type: "object", 
        properties: { 
            tokenIn: { type: "string", description: "Name/symbol (e.g., 'EDU') or address of the token to swap FROM." },
            tokenOut: { type: "string", description: "Name/symbol (e.g., 'USDC') or address of the token to swap TO." },
            amountIn: { type: "string", description: "The amount of tokenIn to quote for swapping." } 
        }, 
        required: ["tokenIn", "tokenOut", "amountIn"] 
    }
};

// --- Define Schemas for remaining Utility/Info Tools ---
const getTokenHistoricalDataSchema: Anthropic.Tool = {
    name: "get_token_historical_data", description: "Get historical daily data (price, volume, TVL) for a specific token on the EDU Chain DEX.",
    input_schema: { type: "object", properties: { tokenId: { type: "string", description: "The address of the token." }, count: { type: "integer", description: "Optional: The number of past days of data to return. Defaults handled backend." } }, required: ["tokenId"] }
};
const getPoolHistoricalDataSchema: Anthropic.Tool = {
    name: "get_pool_historical_data", description: "Get historical daily data (volume, TVL) for a specific liquidity pool on the EDU Chain DEX.",
    input_schema: { type: "object", properties: { poolId: { type: "string", description: "The address of the liquidity pool." }, count: { type: "integer", description: "Optional: The number of past days of data to return. Defaults handled backend." } }, required: ["poolId"] }
};
const getMultipleTokenBalancesSchema: Anthropic.Tool = {
    name: "get_multiple_token_balances", description: "Get the balances for multiple specified ERC20 tokens for a given wallet address on the EDU Chain.",
    input_schema: { type: "object", properties: { tokenAddresses: { type: "array", items: { type: "string" }, description: "An array of ERC20 token addresses to check." }, walletAddress: { type: "string", description: "The wallet address to check balances for." } }, required: ["tokenAddresses", "walletAddress"] }
};
const getNftBalanceSchema: Anthropic.Tool = {
    name: "get_nft_balance", description: "Get the balance (count) of NFTs held by a wallet from a specific ERC721 collection on the EDU Chain.",
    input_schema: { type: "object", properties: { nftAddress: { type: "string", description: "The address of the ERC721 NFT contract." }, walletAddress: { type: "string", description: "The wallet address to check the NFT balance for." } }, required: ["nftAddress", "walletAddress"] }
};
const getWalletOverviewSchema: Anthropic.Tool = {
    name: "get_wallet_overview", description: "Get an overview of a wallet's holdings on EDU Chain, including native EDU balance and optionally balances of specified ERC20 tokens and NFTs.",
    input_schema: { type: "object", properties: { walletAddress: { type: "string", description: "The wallet address to get an overview for." }, tokenAddresses: { type: "array", items: { type: "string" }, description: "Optional: An array of ERC20 token addresses to include in the overview." }, nftAddresses: { type: "array", items: { type: "string" }, description: "Optional: An array of ERC721 NFT contract addresses to include." } }, required: ["walletAddress"] }
};
const getExternalMarketDataSchema: Anthropic.Tool = {
    name: "get_external_market_data", description: "Get the current market price and other data for native EDU from external centralized exchanges (CEX).",
    input_schema: { type: "object", properties: {}, required: [] }
};
const checkArbitrageOpportunitiesSchema: Anthropic.Tool = {
    name: "check_arbitrage_opportunities", description: "Check for potential price differences (arbitrage opportunities) for EDU between centralized exchanges and the EDU Chain DEX (SailFish).",
    input_schema: { type: "object", properties: { threshold: { type: "number", description: "Optional: Minimum price difference percentage to report as an opportunity. Defaults handled backend." } }, required: [] }
};
const getExternalMarketConfigSchema: Anthropic.Tool = {
    name: "get_external_market_config", description: "View the current configuration being used to fetch external market data (API URL, symbols).",
    input_schema: { type: "object", properties: {}, required: [] }
};
const getRpcUrlSchema: Anthropic.Tool = {
    name: "get_rpc_url", description: "View the current EDU Chain RPC URL being used by the agent for blockchain interactions.",
    input_schema: { type: "object", properties: {}, required: [] }
};

// --- Create Tool Lists for each Agent --- 
// (Ensure all schemas used below are fully defined above)
const bridgingTools: Anthropic.Tool[] = [ approveSchema, depositSchema, withdrawSchema, getTokenBalanceSchema ];
const transactionTools: Anthropic.Tool[] = [ sendEduSchema, sendErc20TokenSchema, getEduBalanceSchema, getTokenBalanceSchema ];
const dexTools: Anthropic.Tool[] = [ swapTokensSchema, swapEduForTokensSchema, swapTokensForEduSchema, wrapEduSchema, unwrapWeduSchema, getSwapQuoteSchema, getPoolInfoSchema, getTokenPriceSchema, getTokenInfoSchema, getTokenBalanceSchema ];
const utilityTools: Anthropic.Tool[] = [ 
    // Core Info
    getEduBalanceSchema, getTokenBalanceSchema, getMultipleTokenBalancesSchema, 
    getNftBalanceSchema, getWalletOverviewSchema, 
    // DEX Info
    getTokenPriceSchema, getTokenInfoSchema, getPoolInfoSchema, getTopTokensSchema, 
    getTopPoolsSchema, getTotalTvlSchema, get24hVolumeSchema, getSwapQuoteSchema, 
    // Historical Data
    getTokenHistoricalDataSchema, getPoolHistoricalDataSchema,
    // External/Config
    getExternalMarketDataSchema, checkArbitrageOpportunitiesSchema, 
    getExternalMarketConfigSchema, getRpcUrlSchema
];

// --- NEW: Sailfish Bridge Tool Schemas ---
const sailfish_estimate_bridge_fee_schema: Anthropic.Tool = {
    name: "sailfish_estimate_bridge_fee",
    description: "Estimate the fee for bridging EDU tokens between Arbitrum and EDU Chain using the Sailfish SDK.",
    input_schema: {
        type: "object",
        properties: {
            amount: { type: "string", description: "The amount of EDU to bridge." },
            recipient: { type: "string", description: "The recipient address on the destination chain." },
            sourceChain: { type: "string", enum: ["arbitrum", "educhain"], description: "The source chain ('arbitrum' or 'educhain')." }
        },
        required: ["amount", "recipient", "sourceChain"]
    }
};

const sailfish_is_edu_approved_schema: Anthropic.Tool = {
    name: "sailfish_is_edu_approved",
    description: "Check if the Sailfish bridge contract is approved to spend the specified amount of EDU ERC20 tokens on behalf of the user on the source chain.",
    input_schema: {
        type: "object",
        properties: {
            amount: { type: "string", description: "The amount of EDU to check approval for." },
            ownerAddress: { type: "string", description: "The user's wallet address." },
            sourceChain: { type: "string", enum: ["arbitrum", "educhain"], description: "The source chain where the EDU ERC20 token exists ('arbitrum' or 'educhain')." }
        },
        required: ["amount", "ownerAddress", "sourceChain"]
    }
};

const sailfish_approve_edu_schema: Anthropic.Tool = {
    name: "sailfish_approve_edu",
    description: "Prepare the transaction to approve the Sailfish bridge contract to spend the user's EDU ERC20 tokens on the source chain.",
    input_schema: {
        type: "object",
        properties: {
            amount: { type: "string", description: "The amount of EDU to approve." },
            sourceChain: { type: "string", enum: ["arbitrum", "educhain"], description: "The source chain where the approval should happen ('arbitrum' or 'educhain')." }
        },
        required: ["amount", "sourceChain"]
    }
};

const sailfish_bridge_from_arb_schema: Anthropic.Tool = {
    name: "sailfish_bridge_from_arb",
    description: "Prepare the transaction to bridge EDU ERC20 tokens FROM Arbitrum TO EDU Chain using the Sailfish SDK.",
    input_schema: {
        type: "object",
        properties: {
            amount: { type: "string", description: "The amount of EDU to bridge." },
            recipient: { type: "string", description: "The recipient address on EDU Chain." }
        },
        required: ["amount", "recipient"]
    }
};

const sailfish_bridge_from_edu_schema: Anthropic.Tool = {
    name: "sailfish_bridge_from_edu",
    description: "Prepare the transaction to bridge native EDU tokens FROM EDU Chain TO Arbitrum using the Sailfish SDK.", // Assuming it handles native EDU from EduChain
    input_schema: {
        type: "object",
        properties: {
            amount: { type: "string", description: "The amount of native EDU to bridge." },
            recipient: { type: "string", description: "The recipient address on Arbitrum." }
        },
        required: ["amount", "recipient"]
    }
};

// --- NEW: BSC to Arbitrum Bridge Tool Schemas ---
const sailfish_is_edu_approved_on_bsc_schema: Anthropic.Tool = {
    name: "sailfish_is_edu_approved_on_bsc",
    description: "Check if the bridge contract is approved to spend the specified amount of EDU ERC20 tokens on behalf of the user on BSC.",
    input_schema: {
        type: "object",
        properties: {
            amount: { type: "string", description: "The amount of EDU to check approval for." },
            ownerAddress: { type: "string", description: "The user's wallet address." }
        },
        required: ["amount", "ownerAddress"]
    }
};

const sailfish_approve_edu_on_bsc_schema: Anthropic.Tool = {
    name: "sailfish_approve_edu_on_bsc",
    description: "Prepare the transaction to approve the bridge contract to spend the user's EDU ERC20 tokens on BSC.",
    input_schema: {
        type: "object",
        properties: {
            amount: { type: "string", description: "The amount of EDU to approve." }
        },
        required: ["amount"]
    }
};

const sailfish_estimate_bridge_fee_bsc_to_arb_schema: Anthropic.Tool = {
    name: "sailfish_estimate_bridge_fee_bsc_to_arb",
    description: "Estimate the fee for bridging EDU tokens from BSC to Arbitrum using the Sailfish SDK.",
    input_schema: {
        type: "object",
        properties: {
            amount: { type: "string", description: "The amount of EDU to bridge." },
            address: { type: "string", description: "The recipient address on Arbitrum." },
            gasOnDestination: { type: "string", description: "Optional: Amount of ETH to airdrop for gas on Arbitrum." }
        },
        required: ["amount", "address"]
    }
};

const sailfish_bridge_from_bsc_to_arb_schema: Anthropic.Tool = {
    name: "sailfish_bridge_from_bsc_to_arb",
    description: "Prepare the transaction to bridge EDU ERC20 tokens FROM BSC TO Arbitrum using the Sailfish SDK.",
    input_schema: {
        type: "object",
        properties: {
            amount: { type: "string", description: "The amount of EDU to bridge." },
            address: { type: "string", description: "The recipient address on Arbitrum." },
            gasOnDestination: { type: "string", description: "Optional: Amount of ETH to airdrop for gas on Arbitrum." }
        },
        required: ["amount", "address"]
    }
};

// List of tools for the new agent
const sailfishBridgingTools: Anthropic.Tool[] = [
    sailfish_estimate_bridge_fee_schema,
    sailfish_is_edu_approved_schema,
    sailfish_approve_edu_schema,
    sailfish_bridge_from_arb_schema,
    sailfish_bridge_from_edu_schema,
    // New BSC to Arbitrum tools
    sailfish_is_edu_approved_on_bsc_schema,
    sailfish_approve_edu_on_bsc_schema,
    sailfish_estimate_bridge_fee_bsc_to_arb_schema,
    sailfish_bridge_from_bsc_to_arb_schema
];

// --- System Prompts (Grouped by Agent) ---
const SYSTEM_PROMPT_BRIDGING = `You are Lilikoi's Bridging Agent. You help users bridge their EDU ERC20 tokens (${ARBITRUM_EDU_TOKEN_ADDRESS}) between Arbitrum (ID ${ARBITRUM_CHAIN_ID}) and EDU Chain (ID ${EDUCHAIN_CHAIN_ID}).
 
 **Bridging from Arbitrum to EDU Chain:**
 1. The user must first **approve** the bridge contract to spend their EDU tokens on Arbitrum. Use the 'approve' tool with the specified amount. Ensure the user confirms this on the Arbitrum network.
 2. After the approval is successful, the user must **deposit** the tokens into the bridge contract on Arbitrum. Use the 'deposit' tool with the same amount. Ensure the user confirms this on the Arbitrum network.
 3. Inform the user that the tokens will arrive on EDU Chain shortly after the deposit is confirmed.
 
 **Bridging from EDU Chain to Arbitrum:**
 1. The user needs to **withdraw** their tokens via the bridge contract on EDU Chain. Use the 'withdraw' tool with the specified amount. Ensure the user confirms this on the EDU Chain network.
 2. Inform the user that the tokens will be available on Arbitrum after the withdrawal is confirmed.
 
 Always clarify the direction and amount if the user's request is unclear. Use only the provided tools: approve, deposit, withdraw.`;
const SYSTEM_PROMPT_TRANSACTION = `You are Lilikoi's Transaction Agent. Your purpose is solely to facilitate the sending of funds using the 'send_edu' tool for native EDU on EDU Chain (ID ${EDUCHAIN_CHAIN_ID}) or the 'send_erc20_token' tool for ERC20 tokens.

You can send the following tokens:
- Native EDU (on EDU Chain ${EDUCHAIN_CHAIN_ID}) using 'send_edu'.
- ERC20 Tokens (using 'send_erc20_token') like:
  - EDU on Arbitrum (ID ${ARBITRUM_CHAIN_ID}, Address: ${ARBITRUM_EDU_TOKEN_ADDRESS})
  - USDC on Arbitrum (ID ${ARBITRUM_CHAIN_ID}, Address: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831)
  - USDC on EDU Chain (ID ${EDUCHAIN_CHAIN_ID}, Address: 0x836d275563bAb5E93Fd6Ca62a95dB7065Da94342)
  - USDT on EDU Chain (ID ${EDUCHAIN_CHAIN_ID}, Address: 0x7277Cc818e3F3FfBb169c6Da9CC77Fc2d2a34895)
  - Other standard ERC20s primarily assumed to be on EDU Chain unless specified otherwise (e.g., 'on Arbitrum').

IMPORTANT:
- For ERC20 tokens, clearly identify the token (e.g., 'USDC', 'EDU') and the network ('Arbitrum' or 'EDU Chain'). If the network is not specified, assume EDU Chain unless it's the specific Arbitrum EDU token.
- Use ONLY the 'send_erc20_token' tool for sending ERC20 tokens.
- Use ONLY the 'send_edu' tool for sending native EDU.
- Do not combine sending actions with other operations like swapping or bridging in the same request.

Always ask for the token name/symbol, the network (if ambiguous), the recipient address, and the amount if not provided.`;
const SYSTEM_PROMPT_DEX = `You are Lilikoi's DEX Agent on the EDU Chain (ID ${EDUCHAIN_CHAIN_ID}). Your goal is to help users swap tokens, wrap/unwrap EDU, or get quotes.

When a user asks to swap tokens (e.g., "swap 0.1 EDU for USDC" or "swap 5 WETH for DAI"):
1.  **First, use the 'get_swap_quote' tool.** Identify the input token (tokenIn), output token (tokenOut), and the input amount (amountIn) from the user's message. Provide the token names/symbols (like 'EDU', 'USDC') or addresses to the tool. Ask the user if any information is missing.
2.  **IMPORTANT: Getting the quote is only step one.** AFTER you successfully receive the quote result, you MUST proceed to the next step: Check the user's balance.
    *   **CRITICAL:** If the user's original request was to swap native **EDU**, you MUST use the **'get_edu_balance'** tool, regardless of what tokens were used internally for the quote (like WEDU). Do NOT use 'get_token_balance' for a native EDU swap request.
    *   For other ERC20 tokens (like WETH, USDC), use the **'get_token_balance'** tool.
    *   Use the 'tokenIn' name/symbol and 'amountIn' from the original user request/quote context. The user's wallet address is provided in the user message context.
3.  If the balance check shows insufficient funds, inform the user and STOP.
4.  **If the balance IS sufficient, THEN use the appropriate swap preparation tool:**
    *   **CRITICAL:** If the user's original request was to swap native **EDU**, you MUST use the **'swap_edu_for_tokens'** tool. Do NOT use 'swap_tokens' for a native EDU swap request.
    *   If swapping from an ERC20 *to* native EDU, use **'swap_tokens_for_edu'**.
    *   For all other ERC20-to-ERC20 swaps, use **'swap_tokens'**.
    *   Use the details from the quote (recipient defaults to user's address) to prepare the transaction data.
5.  Return the final transaction data to the user for confirmation.

For wrap/unwrap requests (e.g., "wrap 1 EDU", "unwrap 2 WEDU"), directly use the 'wrap_edu' or 'unwrap_wedu' preparation tools.
For quote-only requests (e.g., "how much USDC for 1 EDU?"), use only the 'get_swap_quote' tool and DO NOT proceed to balance checks or transaction preparation.
Use other info tools ('get_pool_info', 'get_token_price', 'get_token_info') only if specifically asked.`;
const SYSTEM_PROMPT_UTILITY = `You are Lilikoi's Utility & Info Agent on the EDU Chain (ID ${EDUCHAIN_CHAIN_ID}). Your primary role is to answer user questions about tokens, balances, pools, TVL, volume, prices, etc., by using the provided tools to fetch data.

WHEN YOU RECEIVE A RESULT FROM A TOOL CALL:
Your goal is to present this data clearly and concisely to the user. Follow these formatting guidelines:
- Use markdown formatting (like bullet points '•', bolding '**') for readability.
- For lists (like top tokens or pools), use bullet points, showing key info for each item (e.g., name, symbol, TVL, volume).
- For balances: Clearly state the token name/symbol, the amount, and its approximate USD value if available (e.g., "Your USDC balance is: **123.45 USDC** ($123.45 USD)").
- For prices: State the price clearly (e.g., "The current price of WEDU is $X.XX USD.").
- For general info (like TVL or volume): State the value clearly (e.g., "Total TVL on the DEX is $X,XXX,XXX.XX USD.").
- Keep explanations brief and focused on the data presented.
- If a tool returns an error, inform the user clearly about the error.

ALWAYS use the tools provided to get the latest information before answering the user's question. Do not make up data.`;

// --- NEW: Sailfish Bridging Agent System Prompt ---
const SYSTEM_PROMPT_SAILFISH_BRIDGING = `You are Lilikoi's Sailfish Bridging Agent. Your goal is to help users bridge EDU tokens between chains (BSC, Arbitrum, and EDU Chain) using the Sailfish SDK tools.

Supported Directions:
- BSC (EDU ERC20) -> Arbitrum (EDU ERC20) 
- Arbitrum (EDU ERC20) -> EDU Chain (Native EDU)
- EDU Chain (Native EDU) -> Arbitrum (EDU ERC20) - (Bridging FROM EDU Chain is not fully implemented yet, inform user if asked)

General Bridging Steps (Follow STRICTLY):
1.  **Identify:** Ask the user for the source chain, destination chain, amount, and destination address if not provided.
2.  **Estimate Fee & Check Balances (Crucial Pre-check for BSC->Arb):**
    *   For BSC -> Arbitrum: 
        a. First, use 'sailfish_estimate_bridge_fee_bsc_to_arb' to get the estimated BNB fee. Inform the user.
        b. THEN, use 'sailfish_has_enough_edu_on_bsc' to check the EDU amount.
        c. THEN, use 'sailfish_has_enough_bnb' using the fee estimated in step 2a.
        d. **Confirm BOTH balances (EDU and BNB) are sufficient before proceeding.** If not, inform the user clearly and STOP.
    *   For Arbitrum -> EDU Chain: Use 'sailfish_has_enough_edu_on_arb' for the EDU amount. **Confirm sufficiency before proceeding.** If not, inform user and STOP.
3.  **Check Approval (Mandatory before bridging):**
    *   For BSC -> Arbitrum: Use 'sailfish_is_edu_approved_on_bsc'.
    *   For Arbitrum -> EDU Chain: Use 'sailfish_is_edu_approved' (with sourceChain='arbitrum').
4.  **Request Approval (If needed):**
    *   For BSC -> Arbitrum: Use 'sailfish_approve_edu_on_bsc'. Explain this prepares a transaction for the user to sign.
    *   For Arbitrum -> EDU Chain: Use 'sailfish_approve_edu' (with sourceChain='arbitrum'). Explain this prepares a transaction.
    *   **Wait for user confirmation of approval transaction success before proceeding.**
5.  **Execute Bridge (Final Step):**
    *   For BSC -> Arbitrum: Use 'sailfish_bridge_from_bsc_to_arb'. Provide amount, address, and optionally gasOnDestination. Explain this prepares the final bridge transaction.
    *   For Arbitrum -> EDU Chain: Use 'sailfish_bridge_from_arb'. Provide amount and address. Explain this prepares the final bridge transaction.
    *   For EDU Chain -> Arbitrum: Inform the user this direction is not yet supported.

Important Notes:
- ALWAYS confirm the user's wallet address if relevant checks require it.
- Do NOT proceed if any check (balance, approval) fails.
- Clearly explain each step and what the user needs to do (e.g., sign a transaction).
- When providing transaction data (approve, bridge), explain its purpose clearly.
- For BSC->Arb, the fee is included in the transaction VALUE. For Arb->Edu, the fee is standard ETH gas.
- Be precise and follow the steps in order.`;

// --- Map Agent IDs to their configs --- 
const agentConfigs: { [key: string]: { tools: Anthropic.Tool[], prompt: string } } = {
    bridging: { tools: bridgingTools, prompt: SYSTEM_PROMPT_BRIDGING },
    transaction: { tools: transactionTools, prompt: SYSTEM_PROMPT_TRANSACTION },
    dex: { tools: dexTools, prompt: SYSTEM_PROMPT_DEX },
    utility: { tools: utilityTools, prompt: SYSTEM_PROMPT_UTILITY },
    // NEW AGENT:
    'sailfish-bridging': { tools: sailfishBridgingTools, prompt: SYSTEM_PROMPT_SAILFISH_BRIDGING }, 
    // Fallback / default agent config
    default: { tools: utilityTools, prompt: SYSTEM_PROMPT_UTILITY }, 
};

// Mapping of common token names/symbols to addresses (case-insensitive)
const TOKEN_NAME_TO_ADDRESS_MAP: { [key: string]: string } = {
    edu: WEDU_ADDRESS, // Assuming native EDU price is tracked via WEDU
    wedu: WEDU_ADDRESS,
    // EDU Chain Tokens
    usdc_educhain: '0x836d275563bAb5E93Fd6Ca62a95dB7065Da94342', 
    usdc: '0x836d275563bAb5E93Fd6Ca62a95dB7065Da94342', // Also allow 'usdc' for EDU Chain default
    usdt_educhain: '0x7277Cc818e3F3FfBb169c6Da9CC77Fc2d2a34895',
    usdt: '0x7277Cc818e3F3FfBb169c6Da9CC77Fc2d2a34895', // Also allow 'usdt' for EDU Chain default
    weth: '0x79C428A058625387c71F684BA5980414aF38b0d6', 
    wbtc: '0x5D049c53F1dFCB8C4328554854fe44D5C48e5461',
    // Arbitrum Tokens
    edu_arbitrum: ARBITRUM_EDU_TOKEN_ADDRESS,
    usdc_arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    // Note: Add BSC addresses if needed later
};

// Keep track of known Arbitrum token addresses (lowercase)
const ARBITRUM_TOKEN_ADDRESSES = new Set([
    ARBITRUM_EDU_TOKEN_ADDRESS.toLowerCase(),
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
    // Add other known Arbitrum token addresses here
].map(addr => addr.toLowerCase()));

export async function POST(request: Request) {
  const { agentId = 'default', userMessage, address, // Removed forceAction and amount for now, handle differently if needed
          // Allow passing previous messages for multi-turn state
          history = [] 
        } = await request.json(); 

  // TODO: Re-implement forceAction logic if necessary, maybe as a special user message or flag?

  // *** Select tools and prompt based on agentId ***
  const config = agentConfigs[agentId.toLowerCase()] || agentConfigs.default;
  const selectedTools = config.tools;
  const selectedSystemPrompt = config.prompt;
  
  console.log(`Using config for agentId: ${agentId}`);

  // Initialize messages array with history and current user message
  let messages: Anthropic.Messages.MessageParam[] = [
      // TODO: Add proper history mapping if frontend format differs
      // ...history, 
          {
            role: 'user',
        // Inject address into the main user message for context
            content: `User's wallet address is ${address || 'not provided'}. Help them with their request: ${userMessage}`,
          },
  ];
  
    let finalAssistantMessage: string | null = null;
    let transactionData: any = null;
    let finalAction: string | null = null;
    let targetChainId: number | null = null; 
    let savedToolInput: Record<string, any> | null = null;
    const MAX_TOOL_CALLS = 10; // Limit loops (Increased from 5)
    let lastToolResultContent: any = null; // Track last result
    let lastToolNameCalled: string | null = null; // Track last tool name
    let lastIterationHadError = false; // Track last error status
    let toolCallSequence: string[] = []; // <-- Add array to track tool calls

  try {
      for (let i = 0; i < MAX_TOOL_CALLS; i++) {
          console.log(`--- Making LLM Call #${i + 1} ---`);
          console.log('Messages:', JSON.stringify(messages, null, 2));
          
          const response = await anthropic.messages.create({
              model: 'claude-3-haiku-20240307', 
              max_tokens: 2048, 
              system: selectedSystemPrompt,
              messages: messages,
              tools: selectedTools,
          });

          console.log(`Anthropic Raw Response (Call #${i + 1}):`);
          // console.log(JSON.stringify(response, null, 2));

          let hasToolUse = false;
          let responseMessages: Anthropic.Messages.MessageParam[] = []; // Messages to add for the next iteration

          // Add the assistant's response message(s) to the history for the next turn
          responseMessages.push({
              role: 'assistant',
              content: response.content
          });

          // Process response blocks
          for (const block of response.content) {
              if (block.type === 'text') {
                  // If we get text, assume it's the final answer for now
                  // Could potentially refine this to allow text + tool call?
                  finalAssistantMessage = (finalAssistantMessage ? finalAssistantMessage + '\n' : '') + block.text;
              } else if (block.type === 'tool_use') {
                  hasToolUse = true;
                  const toolUseBlock = block as Anthropic.Messages.ToolUseBlock;
      const toolName = toolUseBlock.name as Action;
                  // Cast toolInput initially, but validate/assert before use
                  const toolInput = toolUseBlock.input as BaseToolInput || {}; 
                  const toolUseId = toolUseBlock.id;

                  console.log(`Tool Use Detected: ${toolName}`, "Input:", toolInput, "ID:", toolUseId);
                  
                  toolCallSequence.push(toolName); // <-- Record the tool call
                  
                  finalAction = toolName; // Track the last action called
                  savedToolInput = { ...toolInput }; // Save input for frontend context
                  
                  // --- Determine Target Chain ID --- 
                  targetChainId = EDUCHAIN_CHAIN_ID; // Default assumption for DEX/Utility unless specified
      if (agentId === 'bridging') {
          if (['approve', 'deposit'].includes(toolName)) targetChainId = ARBITRUM_CHAIN_ID;
                      // withdraw stays on EDUCHAIN_CHAIN_ID
      } else if (agentId === 'transaction') {
                       if (toolName === 'send_erc20_token') {
                            // Check if the resolved token address belongs to the set of known Arbitrum tokens
                            const input = toolInput as SendErc20TokenInput;
                            const resolvedTokenAddress = resolveTokenIdentifier(input.tokenAddress, 'tokenAddress'); // Resolve first
                            if (ARBITRUM_TOKEN_ADDRESSES.has(resolvedTokenAddress.toLowerCase())) {
                   targetChainId = ARBITRUM_CHAIN_ID;
                                console.log(`Target chain set to Arbitrum for known token: ${resolvedTokenAddress}`);
                            } else {
                                // Default to EDU Chain for other ERC20s unless specified otherwise
                                console.log(`Target chain defaulting to EDU Chain for token: ${resolvedTokenAddress}`);
                            }
                       } 
                       // Note: send_edu implicitly targets EDUCHAIN_CHAIN_ID based on agent setup
                  } 
                  // else DEX/Utility stay on EDUCHAIN_CHAIN_ID
      console.log(`[${agentId}] Determined Target Chain ID for action ${toolName}: ${targetChainId}`);

                  // --- Address Injection (Using Type Assertions after checks) ---
      if (address) {
          if (['get_edu_balance', 'get_token_balance', 'get_multiple_token_balances', 'get_nft_balance', 'get_wallet_overview'].includes(toolName)) {
                          const typedInput = toolInput as WalletAddressInput;
                          if (typedInput.walletAddress === undefined || typedInput.walletAddress === '') {
                              typedInput.walletAddress = address;
                  console.log(`Injected connected address into walletAddress for ${toolName}`);
              }
          }
          if (['send_edu', 'send_erc20_token', 'swap_tokens', 'swap_edu_for_tokens', 'swap_tokens_for_edu'].includes(toolName)) {
                           const typedInput = toolInput as RecipientInput; // Assert relevant type
                           if (typedInput.recipient === undefined || typedInput.recipient === '') {
                               typedInput.recipient = address;
                               console.log(`Injected/Defaulted recipient to self for ${toolName}`);
                           }
                      }
          if (['approve', 'deposit', 'withdraw'].includes(toolName)) {
                          const typedInput = toolInput as AddressInput; // Assert relevant type
                          if (typedInput.address === undefined || typedInput.address === '') {
                              typedInput.address = address;
                  console.log(`Injected connected address into address for ${toolName}`);
              }
          }
                  }
                  // --- End Address Injection ---

                  let toolResultContent: any = null;
                  let isError = false;
                  lastToolNameCalled = toolName; // Update last tool called
                  lastIterationHadError = false; // Reset error status for this iteration

                  try {
                      // --- Execute Tool --- 
        const infoToolFn = internalInfoTools[toolName as InfoAction];
                      const txPrepToolFn = internalTxPrepTools[toolName as Exclude<TransactionAction, BridgeAction>];
                      const bridgeAction = (toolName === 'approve' || toolName === 'deposit' || toolName === 'withdraw') ? toolName as BridgeAction : null;
                      const sailfishToolFn = internalSailfishTools[toolName as SailfishAction];

        if (infoToolFn) {
                          console.log(`Executing Info Tool: ${toolName}`);
                          // Refactored to use a single handler for info tools
                          toolResultContent = await executeInfoTool(toolName as InfoAction, toolInput, address);
                          // Info tools don't generate final transaction data
                          transactionData = null; 
                          // Clear assistant message if info tool ran successfully, 
                          // let next LLM response generate it based on tool result
                          finalAssistantMessage = null; 
                      } else if (txPrepToolFn) {
                          console.log(`Executing Tx Prep Tool: ${toolName}`);
                          // Refactored to use a single handler for tx prep tools
                          transactionData = await executeTxPrepTool(toolName as Exclude<TransactionAction, BridgeAction>, toolInput, address, targetChainId);
                          toolResultContent = transactionData; // Use prepared tx as result for LLM
                          // Tx prep is usually the final step, agent should provide text explanation
                      } else if (bridgeAction) {
                          console.log(`Executing Bridge Tool: ${bridgeAction}`);
                          transactionData = await executeBridgeTool(bridgeAction, toolInput, address); 
                          toolResultContent = transactionData; // Use prepared tx as result for LLM
                         // Bridge prep is usually final step, agent should provide text explanation
                      } else if (sailfishToolFn) {
                          const currentSailfishAction = toolName as SailfishAction; // Assert type here
                          console.log(`Executing Sailfish Tool: ${currentSailfishAction}`);
                          
                          // Handle Sailfish tools based on their type - Use asserted variable
                          if (currentSailfishAction === 'sailfish_is_edu_approved') {
                              const input = toolInput as { amount?: string, ownerAddress?: string, sourceChain?: string };
                              if (!input.amount) throw new Error('Amount missing for sailfish_is_edu_approved');
                              if (!input.ownerAddress) throw new Error('Owner address missing for sailfish_is_edu_approved');
                              if (!input.sourceChain) throw new Error('Source chain missing for sailfish_is_edu_approved');
                              
                              toolResultContent = await sailfishToolFn(input.amount, input.ownerAddress, input.sourceChain);
                              transactionData = null;
                              finalAssistantMessage = null;
                          } else if (currentSailfishAction === 'sailfish_approve_edu') {
                              const input = toolInput as { amount?: string, sourceChain?: string };
                              if (!input.amount) throw new Error('Amount missing for sailfish_approve_edu');
                              if (!input.sourceChain) throw new Error('Source chain missing for sailfish_approve_edu');
                              
                              transactionData = await sailfishToolFn(input.amount, input.sourceChain);
                              toolResultContent = transactionData;
                          } else if (currentSailfishAction === 'sailfish_bridge_from_arb') {
                              const input = toolInput as { amount?: string, recipient?: string };
                              if (!input.amount) throw new Error('Amount missing for sailfish_bridge_from_arb');
                              if (!input.recipient) throw new Error('Recipient missing for sailfish_bridge_from_arb');
                              
                              transactionData = await sailfishToolFn(input.amount, input.recipient);
                              toolResultContent = transactionData;
                          } else if (currentSailfishAction === 'sailfish_bridge_from_edu') {
                              const input = toolInput as { amount?: string, recipient?: string };
                              if (!input.amount) throw new Error('Amount missing for sailfish_bridge_from_edu');
                              if (!input.recipient) throw new Error('Recipient missing for sailfish_bridge_from_edu');
                              
                              transactionData = await sailfishToolFn(input.amount, input.recipient);
                              toolResultContent = transactionData;
                          } else if (currentSailfishAction === 'sailfish_estimate_bridge_fee') {
                              const input = toolInput as { amount?: string, recipient?: string, sourceChain?: string };
                              if (!input.amount) throw new Error('Amount missing for sailfish_estimate_bridge_fee');
                              if (!input.recipient) throw new Error('Recipient missing for sailfish_estimate_bridge_fee');
                              if (!input.sourceChain) throw new Error('Source chain missing for sailfish_estimate_bridge_fee');
                              
                              toolResultContent = await sailfishToolFn(input.amount, input.recipient, input.sourceChain);
                              transactionData = null;
                              finalAssistantMessage = null;
                          } else if (currentSailfishAction === 'sailfish_is_edu_approved_on_bsc') { // Corrected else if
                              const input = toolInput as { amount?: string, ownerAddress?: string };
                              if (!input.amount) throw new Error('Amount missing for sailfish_is_edu_approved_on_bsc');
                              if (!input.ownerAddress) throw new Error('Owner address missing for sailfish_is_edu_approved_on_bsc');
                              
                              toolResultContent = await sailfishToolFn(input.amount, input.ownerAddress);
                              transactionData = null;
                              finalAssistantMessage = null;
                          } else if (currentSailfishAction === 'sailfish_approve_edu_on_bsc') {
                              const input = toolInput as { amount?: string };
                              // SDK approves MaxUint256, amount might not be needed in input schema? Revisit if needed.
                              // if (!input.amount) throw new Error('Amount missing for sailfish_approve_edu_on_bsc'); 
                              
                              transactionData = await sailfishToolFn(/* input.amount */); // Pass amount if required by backend implementation
                              toolResultContent = transactionData;
                          } else if (currentSailfishAction === 'sailfish_estimate_bridge_fee_bsc_to_arb') {
                              const input = toolInput as { amount?: string, address?: string, gasOnDestination?: string };
                              if (!input.amount) throw new Error('Amount missing for sailfish_estimate_bridge_fee_bsc_to_arb');
                              if (!input.address) throw new Error('Address missing for sailfish_estimate_bridge_fee_bsc_to_arb');
                              
                              toolResultContent = await sailfishToolFn(input.amount, input.address, input.gasOnDestination);
                              transactionData = null;
                              finalAssistantMessage = null;
                          } else if (currentSailfishAction === 'sailfish_bridge_from_bsc_to_arb') {
                              const input = toolInput as { amount?: string, address?: string, gasOnDestination?: string };
                              if (!input.amount) throw new Error('Amount missing for sailfish_bridge_from_bsc_to_arb');
                              if (!input.address) throw new Error('Address missing for sailfish_bridge_from_bsc_to_arb');
                              
                              transactionData = await sailfishToolFn(input.amount, input.address, input.gasOnDestination);
                              toolResultContent = transactionData;
                          } else if (currentSailfishAction === 'sailfish_has_enough_edu_on_bsc') {
                              const input = toolInput as { amount?: string, ownerAddress?: string };
                              if (!input.amount) throw new Error('Amount missing for sailfish_has_enough_edu_on_bsc');
                              if (!input.ownerAddress) throw new Error('Owner address missing for sailfish_has_enough_edu_on_bsc');
                              toolResultContent = await sailfishToolFn(input.amount, input.ownerAddress);
                              transactionData = null; 
                              finalAssistantMessage = null;
                          } else if (currentSailfishAction === 'sailfish_has_enough_bnb') {
                              const input = toolInput as { fee?: string, ownerAddress?: string };
                              if (!input.fee) throw new Error('Fee missing for sailfish_has_enough_bnb');
                              if (!input.ownerAddress) throw new Error('Owner address missing for sailfish_has_enough_bnb');
                              toolResultContent = await sailfishToolFn(input.fee, input.ownerAddress);
                              transactionData = null; 
                              finalAssistantMessage = null;
                          } else if (currentSailfishAction === 'sailfish_has_enough_edu_on_arb') {
                              const input = toolInput as { amount?: string, ownerAddress?: string };
                              if (!input.amount) throw new Error('Amount missing for sailfish_has_enough_edu_on_arb');
                              if (!input.ownerAddress) throw new Error('Owner address missing for sailfish_has_enough_edu_on_arb');
                              toolResultContent = await sailfishToolFn(input.amount, input.ownerAddress);
                              transactionData = null; 
                              finalAssistantMessage = null;
                          }
                            
                          // Set target chain ID for relevant tools
                          if (currentSailfishAction === 'sailfish_bridge_from_arb' || 
                              (currentSailfishAction === 'sailfish_approve_edu' && (toolInput as { sourceChain?: string }).sourceChain === 'arbitrum')) {
                              targetChainId = ARBITRUM_CHAIN_ID;
                          } else if (currentSailfishAction === 'sailfish_bridge_from_edu' || 
                                    (currentSailfishAction === 'sailfish_approve_edu' && (toolInput as { sourceChain?: string }).sourceChain === 'educhain')) {
                              targetChainId = EDUCHAIN_CHAIN_ID;
                          } else if (currentSailfishAction === 'sailfish_approve_edu_on_bsc' || currentSailfishAction === 'sailfish_bridge_from_bsc_to_arb') {
                              targetChainId = 56; // BSC Chain ID
                          }
                        } else {
                          throw new Error(`Unknown tool name: ${toolName}`);
                      }
                      
                      console.log(`Tool ${toolName} executed successfully.`);
                  } catch (error) {
                      console.error(`Error executing tool ${toolName}:`, error);
                      isError = true;
                      toolResultContent = { error: `Failed to execute tool ${toolName}: ${(error as Error).message}` };
                      // Keep any previous assistant message and append error
                      finalAssistantMessage = finalAssistantMessage ? `${finalAssistantMessage}\n\nError: Failed to execute tool ${toolName}. ${(error as Error).message}` 
                                                                    : `Error: Failed to execute tool ${toolName}. ${(error as Error).message}`;
                  }
                  
                  // Update tracking variables *after* try/catch
                  lastToolResultContent = toolResultContent;
                  lastIterationHadError = isError;
                  
                  // Add the tool result message to be sent back to the LLM
                  responseMessages.push({
                      role: 'user', // Must be 'user' role for tool results
                      content: [
                          {
                              type: 'tool_result',
                              tool_use_id: toolUseId,
                              content: typeof toolResultContent === 'string' ? toolResultContent : JSON.stringify(toolResultContent, replacer), // Convert to string if not already
                              is_error: isError,
                          }
                      ]
                  });
              }
          }

          // Add the response and result messages to the main history
          messages.push(...responseMessages);

          // If the last response did NOT contain a tool use, break the loop
          if (!hasToolUse) {
              console.log('--- Loop ended: No tool use in last response --- ');
                        break;
                    }
                    
          // Safety break if max iterations reached
          if (i === MAX_TOOL_CALLS - 1) {
              console.warn('--- Loop ended: Max tool calls reached --- ');
              if (!finalAssistantMessage) { // Provide a fallback message if none exists
                  finalAssistantMessage = "Sorry, I couldn't complete the request within the allowed steps.";
                        }
                        break;
                    }
      }

      // --- Send Final Response --- 
      // If the loop finished without a final text message (e.g., hit max calls after tool use)
      // construct a message based on the last tool result.
      if (!finalAssistantMessage) { 
           if (lastIterationHadError) {
                // Error message should have already been set in the catch block
                finalAssistantMessage = finalAssistantMessage || `An error occurred during the last step (${lastToolNameCalled || 'unknown tool'}). Please check the logs.`; 
                console.error('Loop finished after error, finalAssistantMessage was:', finalAssistantMessage);
           } else if (lastToolResultContent) {
               console.log('Loop finished without final text, using last tool result.');
               // Use a simple representation of the last result
               finalAssistantMessage = `I reached the step limit after performing the action '${lastToolNameCalled || 'unknown'}. Here is the result:\n\n\`\`\`json\n${JSON.stringify(lastToolResultContent, replacer, 2)}\n\`\`\``;
                                        } else {
               // Fallback if loop ended strangely without text or tool result
               console.error('Loop finished without a final assistant message or last tool result.');
               finalAssistantMessage = "Sorry, something went wrong and I couldn't generate a final response.";
           }
      }
      
      const responsePayload: { 
        content: string; 
        transactionData?: any; 
        action?: string | null; 
        targetChainId?: number | null;
        toolInput?: Record<string, any>;
        toolCallSequence?: string[]; // <-- Add sequence to payload type
        // Add history back if needed by frontend
        // history?: Anthropic.Messages.MessageParam[]; 
      } = {
          content: finalAssistantMessage
      };
      // Attach transaction data ONLY if the *last* action was a tx prep/bridge
      if (transactionData && (internalTxPrepTools[finalAction as Exclude<TransactionAction, BridgeAction>] || 
                            ['approve', 'deposit', 'withdraw'].includes(finalAction || '') || 
                            ['sailfish_approve_edu', 'sailfish_bridge_from_arb', 'sailfish_bridge_from_edu',
                             'sailfish_approve_edu_on_bsc', 'sailfish_bridge_from_bsc_to_arb'].includes(finalAction || ''))) {
          responsePayload.transactionData = transactionData;
          console.log('Attaching final transaction data to response for action:', finalAction);
      }
      if (finalAction) {
          responsePayload.action = finalAction;
      }
      if (targetChainId !== null) {
          responsePayload.targetChainId = targetChainId;
      }
      // Include the input of the *last* tool called for context
      if (savedToolInput && Object.keys(savedToolInput).length > 0) {
          responsePayload.toolInput = savedToolInput;
          console.log('Including last toolInput in response:', savedToolInput);
      }

      // Add the tool call sequence to the response
      if (toolCallSequence.length > 0) {
          responsePayload.toolCallSequence = toolCallSequence;
          console.log('Including toolCallSequence in response:', toolCallSequence);
      }
      
      // responsePayload.history = messages; // Optional: send back full history
      
      return NextResponse.json(responsePayload);

  } catch (error) {
      console.error('API Route Error:', error);
      // Ensure error is serializable
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
          { content: `Sorry, an unexpected error occurred: ${errorMessage}`, error: errorMessage },
          { status: 500 }
      );
  }
}

// --- Helper: BigInt Replacer --- (Keep this)
const replacer = (key: string, value: any) => 
    typeof value === 'bigint' ? value.toString() : value;

// --- Helper: Execute Info Tool --- (Updated for Type Safety)
async function executeInfoTool(toolName: InfoAction, toolInput: BaseToolInput, connectedAddress: string | null): Promise<any> {
    const toolFn = internalInfoTools[toolName];
    if (!toolFn) throw new Error(`Internal mapping missing for info tool: ${toolName}`);

    console.log(`Calling agentKit function for ${toolName} with input:`, toolInput);
    
    // Use type assertions and checks before calling agentKit functions
    switch(toolName) {
        case 'get_token_balance': { 
            const input = toolInput as GetTokenBalanceInput;
            const resolvedTokenAddress = resolveTokenIdentifier(input.tokenAddress, 'tokenAddress');
            if (!input.walletAddress) throw new Error('Wallet address missing for get_token_balance');
            return await toolFn(resolvedTokenAddress, input.walletAddress);
        }
        case 'get_edu_balance': {
             const input = toolInput as GetBalanceInput;
             if (!input.walletAddress) throw new Error('Wallet address missing for get_edu_balance');
             return await toolFn(input.walletAddress);
        }
        case 'get_swap_quote': {
            const input = toolInput as SwapQuoteInput;
            const resolvedTokenIn = resolveTokenIdentifier(input.tokenIn, 'tokenIn');
            const resolvedTokenOut = resolveTokenIdentifier(input.tokenOut, 'tokenOut');
            if (!input.amountIn) throw new Error ('amountIn missing for get_swap_quote');
            return await toolFn(resolvedTokenIn, resolvedTokenOut, input.amountIn);
        }
        case 'get_token_price': {
            const input = toolInput as GetTokenInfoInput; // Uses tokenId
            const resolvedTokenId = resolveTokenIdentifier(input.tokenId, 'tokenId');
            return await toolFn(resolvedTokenId);
        }        
        case 'get_token_info': { 
            const input = toolInput as GetTokenInfoInput; // Uses tokenId
            const resolvedTokenId = resolveTokenIdentifier(input.tokenId, 'tokenId');
            return await toolFn(resolvedTokenId);
        }
        
        // Added Cases for Missing Info Tools
        case 'get_pool_info': {
            const input = toolInput as BaseToolInput & { poolId?: string };
            if (!input.poolId || !input.poolId.startsWith('0x')) throw new Error('Invalid poolId missing for get_pool_info');
            return await toolFn(input.poolId);
        }
                    case 'get_top_tokens': {
            const input = toolInput as BaseToolInput & { count?: number };
            return await toolFn(input.count); // Pass optional count
                    }
                    case 'get_top_pools': {
            const input = toolInput as BaseToolInput & { count?: number };
            return await toolFn(input.count); // Pass optional count
                    }
                    case 'get_total_tvl': {
            return await toolFn(); // No args expected
                    }
                    case 'get_24h_volume': {
            return await toolFn(); // No args expected (calls getFactory)
        }
        case 'get_token_historical_data': {
            const input = toolInput as BaseToolInput & { tokenId?: string, count?: number };
            const resolvedTokenId = resolveTokenIdentifier(input.tokenId, 'tokenId');
            return await toolFn(resolvedTokenId, input.count); // Pass tokenId and optional count
        }
        case 'get_pool_historical_data': {
            const input = toolInput as BaseToolInput & { poolId?: string, count?: number };
            if (!input.poolId || !input.poolId.startsWith('0x')) throw new Error('Invalid poolId missing for get_pool_historical_data');
            return await toolFn(input.poolId, input.count); // Pass poolId and optional count
        }
        case 'get_multiple_token_balances': {
            const input = toolInput as BaseToolInput & { tokenAddresses?: string[], walletAddress?: string };
            if (!Array.isArray(input.tokenAddresses)) throw new Error('tokenAddresses must be an array for get_multiple_token_balances');
            if (!input.walletAddress) throw new Error('Wallet address missing for get_multiple_token_balances');
            // Optional: Resolve each address in the array if needed
            const resolvedAddresses = input.tokenAddresses.map(addr => resolveTokenIdentifier(addr, 'tokenAddresses item'));
            return await toolFn(resolvedAddresses, input.walletAddress);
        }
        case 'get_nft_balance': {
            const input = toolInput as BaseToolInput & { nftAddress?: string, walletAddress?: string };
            if (!input.nftAddress || !input.nftAddress.startsWith('0x')) throw new Error('Invalid nftAddress missing for get_nft_balance');
            if (!input.walletAddress) throw new Error('Wallet address missing for get_nft_balance');
            return await toolFn(input.nftAddress, input.walletAddress);
        }
        case 'get_wallet_overview': {
            const input = toolInput as BaseToolInput & { walletAddress?: string, tokenAddresses?: string[], nftAddresses?: string[] };
            if (!input.walletAddress) throw new Error('Wallet address missing for get_wallet_overview');
             // Optional: Resolve token addresses if needed
            const resolvedTokenAddrs = input.tokenAddresses?.map(addr => resolveTokenIdentifier(addr, 'tokenAddresses item'));
            return await toolFn(input.walletAddress, resolvedTokenAddrs, input.nftAddresses);
        }
                    case 'get_external_market_data': {
             return await toolFn(); // No args expected
                    }
                    case 'check_arbitrage_opportunities': {
            const input = toolInput as BaseToolInput & { threshold?: number };
            return await toolFn(input.threshold); // Pass optional threshold
        }
                    case 'get_external_market_config': {
             return await toolFn(); // No args expected
                    }
                    case 'get_rpc_url': {
             return await toolFn(); // No args expected
        }
    }
}

// --- Helper: Execute Tx Prep Tool --- (Updated for Type Safety)
async function executeTxPrepTool(toolName: Exclude<TransactionAction, BridgeAction>, toolInput: BaseToolInput, connectedAddress: string | null, targetChainId: number | null): Promise<any> {
    const toolFn = internalTxPrepTools[toolName];
    if (!toolFn) throw new Error(`Internal mapping missing for tx prep tool: ${toolName}`);

    console.log(`Calling agentKit function for ${toolName} with input:`, toolInput);
    
    // Use type assertions and checks before calling agentKit functions
    switch(toolName) {
        case 'send_edu': { 
            const input = toolInput as SendEduInput;
            if (!input.recipient) throw new Error('Recipient missing for send_edu');
            if (!input.amount) throw new Error ('Amount missing for send_edu');
            return await toolFn(input.recipient, input.amount);
        }
        case 'send_erc20_token': { 
            const input = toolInput as SendErc20TokenInput;
            const resolvedTokenAddress = resolveTokenIdentifier(input.tokenAddress, 'tokenAddress');
            if (!input.recipient) throw new Error('Recipient missing for send_erc20_token');
            if (!input.amount) throw new Error ('Amount missing for send_erc20_token');
            // Ensure targetChainId is provided for ERC20 transfers
            if (targetChainId === null) {
                throw new Error('Target chain ID is required for send_erc20_token but was not determined.');
            }
            // Pass targetChainId as the first argument
            return await toolFn(targetChainId, resolvedTokenAddress, input.recipient, input.amount); 
        }
        case 'swap_tokens': { 
            const input = toolInput as SwapTokensInput;
            const resolvedTokenIn = resolveTokenIdentifier(input.tokenIn, 'tokenIn');
            const resolvedTokenOut = resolveTokenIdentifier(input.tokenOut, 'tokenOut');
            if (!input.recipient) throw new Error('Recipient missing for swap_tokens');
            if (!input.amountIn) throw new Error ('amountIn missing for swap_tokens');
            return await toolFn(resolvedTokenIn, resolvedTokenOut, input.amountIn, input.recipient, input.slippagePercentage, input.deadlineMinutes);
        }
        case 'swap_edu_for_tokens': {
            const input = toolInput as SwapEduForTokensInput;
            const resolvedTokenOut = resolveTokenIdentifier(input.tokenOut, 'tokenOut');
            if (!input.recipient) throw new Error('Recipient missing for swap_edu_for_tokens');
            if (!input.amountIn) throw new Error ('amountIn missing for swap_edu_for_tokens');
            return await toolFn(resolvedTokenOut, input.amountIn, input.recipient, input.slippagePercentage, input.deadlineMinutes);
        }
        case 'swap_tokens_for_edu': {
            const input = toolInput as SwapTokensForEduInput;
            const resolvedTokenIn = resolveTokenIdentifier(input.tokenIn, 'tokenIn');
            if (!input.recipient) throw new Error('Recipient missing for swap_tokens_for_edu');
            if (!input.amountIn) throw new Error ('amountIn missing for swap_tokens_for_edu');
            return await toolFn(resolvedTokenIn, input.amountIn, input.recipient, input.slippagePercentage, input.deadlineMinutes);
        }
              case 'wrap_edu': 
        case 'unwrap_wedu': { 
            const input = toolInput as WrapUnwrapInput;
            if (!input.amount) throw new Error (`Amount missing for ${toolName}`);
            return await toolFn(input.amount);
        }
              default:
            throw new Error(`Argument handling not defined for tx prep tool: ${toolName}`);
    }
}

// --- Helper: Execute Bridge Tool --- (Updated for Type Safety)
async function executeBridgeTool(bridgeAction: BridgeAction, toolInput: BaseToolInput, connectedAddress: string | null): Promise<any> {
    const input = toolInput as BridgeInput;
    const pubkey = input.address; // Use injected address
    const amount = input.amount;

            if (!pubkey || typeof pubkey !== 'string') {
                throw new Error(`Missing or invalid user address (pubkey) for BridgeMCP action '${bridgeAction}'`);
            }
             if (!amount || typeof amount !== 'string') {
                throw new Error(`Missing or invalid amount for BridgeMCP action '${bridgeAction}'`);
            }

    // ... (rest of bridge logic: call BridgeMCP, check result, parse data) ...
    const bridgeFn = BridgeMCP[bridgeAction];
    // ... (error checking, call, result parsing) ...
    const bridgeResult = await bridgeFn(pubkey, amount); 
    // ... (handle bridgeResult.error and bridgeResult.data) ...
    if (bridgeResult.data) {
         let parsedData = typeof bridgeResult.data === 'string' ? JSON.parse(bridgeResult.data) : bridgeResult.data;
         // ... validation ...
         return parsedData;
    } else { 
        throw new Error(/* ... */); 
    }
}

// --- NEW Helper: Resolve Token Identifier ---
function resolveTokenIdentifier(identifier: string | undefined, paramName: string): string {
    if (typeof identifier !== 'string' || identifier === '') {
        throw new Error(`Missing or invalid token identifier for parameter: ${paramName}`);
    }
    const lowerCaseId = identifier.toLowerCase();
    if (TOKEN_NAME_TO_ADDRESS_MAP[lowerCaseId]) {
        const address = TOKEN_NAME_TO_ADDRESS_MAP[lowerCaseId];
        console.log(`Resolved token '${identifier}' to address: ${address} for param '${paramName}'`);
        return address;
    } else if (identifier.startsWith('0x') && identifier.length === 42) {
        // console.log(`Using provided address for token: ${identifier} for param '${paramName}'`);
        return identifier; // Assume it's a valid address if it looks like one
            } else { 
        throw new Error(`Unknown token identifier: '${identifier}' for param '${paramName}'. Cannot resolve to an address. Known names: ${Object.keys(TOKEN_NAME_TO_ADDRESS_MAP).join(', ')}`);
    }
}

// --- Make sure TOKEN_NAME_TO_ADDRESS_MAP, internalInfoTools, internalTxPrepTools, BridgeMCP, agentConfigs are defined above ---

