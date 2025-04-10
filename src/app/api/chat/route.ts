import { Anthropic } from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { BridgeMCP } from '@/mcp/bridge';
import * as agentKit from '@/lib/agent-kit-logic';
import { ethers } from 'ethers';

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
    
type TransactionAction = 
    BridgeAction | 
    'send_edu' | 'send_erc20_token' | 
    'swap_tokens' | 'swap_edu_for_tokens' | 'swap_tokens_for_edu' | 
    'wrap_edu' | 'unwrap_wedu';
    
type Action = TransactionAction | InfoAction;

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

// --- System Prompts (Grouped by Agent) ---
const SYSTEM_PROMPT_BRIDGING = `You are Lilikoi's Bridging Agent... focus ONLY on approve/deposit/withdraw between Arbitrum (ID ${ARBITRUM_CHAIN_ID}) and EDU Chain (ID ${EDUCHAIN_CHAIN_ID}). Use the provided tools.`; 
const SYSTEM_PROMPT_TRANSACTION = `You are Lilikoi's Transaction Agent... focus ONLY on sending native EDU (on EDU Chain ${EDUCHAIN_CHAIN_ID}) using 'send_edu' OR the EDU ERC20 token (${ARBITRUM_EDU_TOKEN_ADDRESS}) on Arbitrum (${ARBITRUM_CHAIN_ID}) using 'send_erc20_token'. Ask for recipient and amount if missing.`;
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

// --- Map Agent IDs to their configs --- 
const agentConfigs: { [key: string]: { tools: Anthropic.Tool[], prompt: string } } = {
    bridging: { tools: bridgingTools, prompt: SYSTEM_PROMPT_BRIDGING },
    transaction: { tools: transactionTools, prompt: SYSTEM_PROMPT_TRANSACTION },
    dex: { tools: dexTools, prompt: SYSTEM_PROMPT_DEX },
    utility: { tools: utilityTools, prompt: SYSTEM_PROMPT_UTILITY }, // Added utility
    // Fallback / default agent config - maybe map to utility?
    default: { tools: utilityTools, prompt: SYSTEM_PROMPT_UTILITY }, 
};

// Mapping of common token names/symbols to addresses (case-insensitive)
const TOKEN_NAME_TO_ADDRESS_MAP: { [key: string]: string } = {
    edu: WEDU_ADDRESS, // Assuming native EDU price is tracked via WEDU
    wedu: WEDU_ADDRESS,
    // Add other common tokens
    usdc: '0x836d275563bAb5E93Fd6Ca62a95dB7065Da94342', // EDU Chain USDC - Reverted to correct address
    usdt: '0x7277Cc818e3F3FfBb169c6Da9CC77Fc2d2a34895', // EDU Chain USDT - Assuming this is correct
    weth: '0x79C428A058625387c71F684BA5980414aF38b0d6', // EDU Chain WETH
    wbtc: '0x5D049c53F1dFCB8C4328554854fe44D5C48e5461'  // EDU Chain WBTC
};

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
    const MAX_TOOL_CALLS = 5; // Limit loops
    let lastToolResultContent: any = null; // Track last result
    let lastToolNameCalled: string | null = null; // Track last tool name
    let lastIterationHadError = false; // Track last error status
    const toolCallSequence: string[] = []; // <-- Add array to track tool calls

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
                  targetChainId = EDUCHAIN_CHAIN_ID; // Default assumption for DEX/Transaction unless specified
      if (agentId === 'bridging') {
          if (['approve', 'deposit'].includes(toolName)) targetChainId = ARBITRUM_CHAIN_ID;
                      // withdraw stays on EDUCHAIN_CHAIN_ID
      } else if (agentId === 'transaction') {
                       if (toolName === 'send_erc20_token') {
                            // Use assertion after checking property existence (safer)
                            if (toolInput && typeof toolInput.tokenAddress === 'string' && 
                                (toolInput as SendErc20TokenInput).tokenAddress?.toLowerCase() === ARBITRUM_EDU_TOKEN_ADDRESS.toLowerCase()) {
                   targetChainId = ARBITRUM_CHAIN_ID;
                            }
                       } 
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
      if (transactionData && (internalTxPrepTools[finalAction as Exclude<TransactionAction, BridgeAction>] || ['approve', 'deposit', 'withdraw'].includes(finalAction || ''))) {
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
            // Assuming agentKit function handles targetChainId implicitly or takes it if needed
            return await toolFn(resolvedTokenAddress, input.recipient, input.amount); 
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

