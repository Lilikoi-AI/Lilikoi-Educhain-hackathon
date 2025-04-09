import { Anthropic } from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { BridgeMCP } from '@/mcp/bridge';
import * as agentKit from '@/lib/agent-kit-logic';

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
    name: "get_token_balance", description: `Get the balance of a specific ERC20 token for a given wallet address. Use the appropriate token address for the chain (e.g., ${ARBITRUM_EDU_TOKEN_ADDRESS} for EDU on Arbitrum, others for EDU Chain). Assumes EDU Chain unless specified otherwise or EDU token address is the Arbitrum one.`,
    input_schema: { type: "object", properties: { tokenAddress: { type: "string", description: "The address of the ERC20 token contract." }, walletAddress: { type: "string", description: "The wallet address to check the balance for." } }, required: ["tokenAddress", "walletAddress"] }
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
    name: "get_swap_quote", description: "Get a price quote for swapping one token for another on the EDU Chain DEX (SailFish). Does not execute the swap.",
    input_schema: { type: "object", properties: { tokenIn: { type: "string", description: "Address of the token to swap FROM." }, tokenOut: { type: "string", description: "Address of the token to swap TO." }, amountIn: { type: "string", description: "The amount of tokenIn to quote for swapping." } }, required: ["tokenIn", "tokenOut", "amountIn"] }
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
const bridgingTools: Anthropic.Tool[] = [ approveSchema, depositSchema, withdrawSchema, getTokenBalanceSchema ]; // Added balance check
const transactionTools: Anthropic.Tool[] = [ sendEduSchema, sendErc20TokenSchema, getEduBalanceSchema, getTokenBalanceSchema ];
const dexTools: Anthropic.Tool[] = [ swapTokensSchema, swapEduForTokensSchema, swapTokensForEduSchema, wrapEduSchema, unwrapWeduSchema, getSwapQuoteSchema, getPoolInfoSchema, getTokenPriceSchema, getTokenInfoSchema ]; // Added info tools
// Combine many info tools for a general utility/info agent
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
1.  Identify the input token (tokenIn) and output token (tokenOut) and the input amount (amountIn).
2.  **First, use the appropriate balance tool** ('get_edu_balance' for native EDU, 'get_token_balance' for ERC20s like WEDU, USDC) to check if the user's wallet (address provided in the user message context) has *sufficient* balance of the input token.
3.  If the balance is insufficient, inform the user and STOP.
4.  **If the balance IS sufficient, use the 'get_swap_quote' tool** with tokenIn, tokenOut, and amountIn to get the expected output amount and route information.
5.  **Finally, use the appropriate swap preparation tool** ('swap_edu_for_tokens', 'swap_tokens_for_edu', or 'swap_tokens') using the details from the quote (including recipient address, which defaults to the user's address if not specified) to prepare the transaction data.
6.  Return the transaction data to the user for confirmation.

For wrap/unwrap requests (e.g., "wrap 1 EDU", "unwrap 2 WEDU"), directly use the 'wrap_edu' or 'unwrap_wedu' preparation tools.
For quote requests (e.g., "how much USDC for 1 EDU?"), use the 'get_swap_quote' tool only.
Use other info tools ('get_pool_info', 'get_token_price', 'get_token_info') only if specifically asked.`;
const SYSTEM_PROMPT_UTILITY = `You are Lilikoi's Utility & Info Agent... Answer questions about tokens, balances, pools, TVL, volume mostly related to EDU Chain (${EDUCHAIN_CHAIN_ID}). Use the provided tools to get data and present it.`;

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
    usdc: '0x7F5373AE26c3E8FfC4c77b7255DF7eC1A9aF52a6', // EDU Chain USDC 
    usdt: '0x4CcD2b3F70D9a6De2aD8341DB090e9DE30AC0Bef', // EDU Chain USDT
    weth: '0x79C428A058625387c71F684BA5980414aF38b0d6', // EDU Chain WETH
    wbtc: '0x5D049c53F1dFCB8C4328554854fe44D5C48e5461'  // EDU Chain WBTC
};

export async function POST(request: Request) {
  const { agentId = 'default', userMessage, address, forceAction, amount } = await request.json(); // Added amount parameter

  // Extract swap intent information from user message for DEX agent
  let swapIntent = null;
  if (agentId === 'dex' && userMessage.toLowerCase().includes('swap')) {
    // Try to extract swap details from the message
    const eduMatch = userMessage.match(/swap\s+([\d.]+)\s+edu\s+for\s+(\w+)/i);
    const tokenMatch = userMessage.match(/swap\s+([\d.]+)\s+(\w+)\s+for\s+(\w+)/i);
    
    if (eduMatch) {
      swapIntent = {
        isFromEdu: true,
        amount: eduMatch[1],
        toToken: eduMatch[2].toUpperCase()
      };
      console.log('Detected swap from EDU intent:', swapIntent);
    } else if (tokenMatch) {
      swapIntent = {
        isFromEdu: false,
        amount: tokenMatch[1],
        fromToken: tokenMatch[2].toUpperCase(),
        toToken: tokenMatch[3].toUpperCase()
      };
      console.log('Detected swap from token intent:', swapIntent);
    }
  }

  // Handle forceAction for direct deposit after approve
  if (forceAction === 'deposit' && address && amount) {
    console.log(`Force action deposit detected with amount: ${amount} for address: ${address}`);
    try {
      // Directly call BridgeMCP.deposit
      const bridgeResult = await BridgeMCP.deposit(address, amount);
      console.log('[Force Deposit Bridge Result]:', JSON.stringify(bridgeResult, null, 2));

      if (bridgeResult.error) {
        throw new Error(`Bridge error from MCP: ${bridgeResult.error}`);
      }

      // Check if data exists before trying to parse
      if (bridgeResult.data !== undefined && bridgeResult.data !== null) {
        let parsedData: any;
        try {
          // Parse the JSON string if needed
          parsedData = typeof bridgeResult.data === 'string' ? JSON.parse(bridgeResult.data) : bridgeResult.data;
          console.log('[Force Deposit Bridge Result Parsed Data]:', parsedData);
          
          // Validate the parsed object
          if (!parsedData || typeof parsedData !== 'object' || typeof parsedData.to !== 'string' || typeof parsedData.data !== 'string') {
            throw new Error('Parsed bridge data is invalid or missing required fields (to, data).');
          }
          
          // Return successful response with transaction data
          return NextResponse.json({
            content: `Now let's deposit ${amount} EDU tokens to the bridge contract. Please confirm this transaction in your wallet.`,
            transactionData: parsedData,
            action: 'deposit',
            targetChainId: ARBITRUM_CHAIN_ID,
            toolInput: { amount }
          });
        } catch (parseError) {
          console.error('[Force Deposit Parse Error]:', parseError);
          throw new Error(`Failed to parse transaction data received from bridge API for deposit.`);
        }
      } else {
        throw new Error(`Bridge MCP deposit completed without explicit error but returned null or undefined data.`);
      }
    } catch (error) {
      console.error('Force Deposit Error:', error);
      return NextResponse.json(
        { 
          error: `Failed to process deposit: ${(error as Error).message}`,
          content: `Error during deposit: ${(error as Error).message}`
        },
        { status: 500 }
      );
    }
  }

  // *** Select tools and prompt based on agentId ***
  const config = agentConfigs[agentId.toLowerCase()] || agentConfigs.default;
  const selectedTools = config.tools;
  const selectedSystemPrompt = config.prompt;
  
  console.log(`Using config for agentId: ${agentId}`);

  try {
    // --- Anthropic API Call - Use selected tools/prompt --- 
    const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307', 
        max_tokens: 2048, 
        system: selectedSystemPrompt, // <-- Use selected prompt
        messages: [
          {
            role: 'user',
            content: `User's wallet address is ${address || 'not provided'}. Help them with their request: ${userMessage}`,
          },
        ],
        tools: selectedTools, // <-- Use selected tools
    });
    console.log("Anthropic Raw Response (Haiku):"); // Log model name
    // Use JSON.stringify only if debugging is needed, to save console space/cost
    // console.log(JSON.stringify(response, null, 2)); 

    // --- Process Anthropic Response --- 
    let finalAssistantMessage: string | null = null;
    let transactionData: any = null;
    let finalAction: string | null = null;
    let targetChainId: number | null = null; 
    let savedToolInput: Record<string, any> | null = null;

    const textBlocks = response.content.filter(block => block.type === 'text');
    if (textBlocks.length > 0) {
      finalAssistantMessage = textBlocks.map(block => block.text).join('\n');
    }

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUseBlock) {
      const toolName = toolUseBlock.name as Action;
      const toolInput: Record<string, any> = toolUseBlock.input || {}; 
      finalAction = toolName;
      // Save tool input to return to frontend
      savedToolInput = { ...toolInput };
      
      console.log(`Tool Use Detected: ${toolName}`, "Input:", toolInput);

      // Re-evaluate targetChainId determination based on agent & tool
      if (agentId === 'bridging') {
          if (['approve', 'deposit'].includes(toolName)) targetChainId = ARBITRUM_CHAIN_ID;
          else if (toolName === 'withdraw') targetChainId = EDUCHAIN_CHAIN_ID;
          // Add balance check logic if needed
      } else if (agentId === 'transaction') {
          if (toolName === 'send_edu') targetChainId = EDUCHAIN_CHAIN_ID;
          else if (toolName === 'send_erc20_token') {
               // Assume Arbitrum ONLY if the specific EDU token is used
               if (toolInput.tokenAddress?.toLowerCase() === ARBITRUM_EDU_TOKEN_ADDRESS.toLowerCase()) {
                   targetChainId = ARBITRUM_CHAIN_ID;
               } else {
                   targetChainId = EDUCHAIN_CHAIN_ID; // Assume EDU Chain for other ERC20s
               }
          } 
           // Add balance check logic if needed
      } else if (agentId === 'dex') {
          targetChainId = EDUCHAIN_CHAIN_ID; // All DEX actions are on EDU Chain
      } else {
          // Default or Info agent - usually no target chain for tx needed
          targetChainId = null; 
      }
      console.log(`[${agentId}] Determined Target Chain ID for action ${toolName}: ${targetChainId}`);

      // --- Targeted Address Injection --- 
      if (address) {
          console.log(`Checking if address injection needed for tool: ${toolName}`);
          // Tools requiring 'walletAddress'
          if (['get_edu_balance', 'get_token_balance', 'get_multiple_token_balances', 'get_nft_balance', 'get_wallet_overview'].includes(toolName)) {
              if (toolInput.walletAddress === undefined || toolInput.walletAddress === '') {
                  toolInput.walletAddress = address;
                  savedToolInput.walletAddress = address;
                  console.log(`Injected connected address into walletAddress for ${toolName}`);
              }
          }
          // Tools requiring 'recipient' (and defaulting to self if missing)
          if (['send_edu', 'send_erc20_token', 'swap_tokens', 'swap_edu_for_tokens', 'swap_tokens_for_edu'].includes(toolName)) {
              if (toolInput.recipient === undefined || toolInput.recipient === '') {
                  toolInput.recipient = address;
                  savedToolInput.recipient = address;
                  console.log(`Injected connected address into recipient for ${toolName}`);
              }
          }
           // Tools requiring 'address' (e.g., for bridging approve/deposit/withdraw)
          if (['approve', 'deposit', 'withdraw'].includes(toolName)) {
              if (toolInput.address === undefined || toolInput.address === '') {
                  toolInput.address = address;
                  savedToolInput.address = address;
                  console.log(`Injected connected address into address for ${toolName}`);
              }
          }
          // Default recipient to self for specific swap/wrap actions if still missing
          if (toolInput.recipient === undefined || toolInput.recipient === '') {
              if (['wrap_edu', 'unwrap_wedu', 'swap_tokens', 'swap_edu_for_tokens', 'swap_tokens_for_edu'].includes(toolName)) {
                 toolInput.recipient = address;
                 savedToolInput.recipient = address;
                 console.log(`Defaulted recipient to self for action: ${toolName}`);
              }
          }
      }
      // --- End Targeted Address Injection ---
      
      // --- Validate/Extract Address Strings --- 
      let recipientAddr: string | undefined = undefined;
      if (toolInput.recipient) {
          if (typeof toolInput.recipient === 'string') {
              recipientAddr = toolInput.recipient;
          } else if (typeof toolInput.recipient === 'object' && typeof toolInput.recipient.address === 'string') {
              console.warn('Recipient was an object, extracting address string:', toolInput.recipient.address);
              recipientAddr = toolInput.recipient.address; 
          } else {
              throw new Error('Invalid recipient format received from LLM.');
          }
      } else if (address && ['send_edu', 'send_erc20_token', 'swap_tokens', 'swap_edu_for_tokens', 'swap_tokens_for_edu'].includes(toolName)) {
          // Use user's address if recipient is needed but missing
          recipientAddr = address;
          console.log('Recipient missing, using user address:', address);
      }
      // Add similar validation for tokenIn, tokenOut if needed
      // ...
      // --- End Validation --- 
      
      try {
        // Check if it's an INFO tool
        const infoToolFn = internalInfoTools[toolName as InfoAction];
        if (infoToolFn) {
            console.log(`Processing Info Tool Request: ${toolName}`, "Input:", toolInput);
            
            try {
                let toolResult: any;
                
                // --- Handle each tool with proper parameter extraction ---
                switch(toolName) {
                    // Token & Pool Info Tools
                    case 'get_token_price':
                    case 'get_token_info':
                    case 'get_token_historical_data': {
                        let tokenId: string;
                        
                        // Extract and validate tokenId - handle string or token name
                        if (typeof toolInput.tokenId === 'string') {
                            const rawTokenId = toolInput.tokenId;
                            // Check if it's a known token name that needs mapping
                            if (TOKEN_NAME_TO_ADDRESS_MAP[rawTokenId.toLowerCase()]) {
                                tokenId = TOKEN_NAME_TO_ADDRESS_MAP[rawTokenId.toLowerCase()];
                                console.log(`Mapped token name '${rawTokenId}' to address ${tokenId}`);
                            } 
                            // Check if it looks like an address
                            else if (rawTokenId.startsWith('0x') && rawTokenId.length === 42) {
                                tokenId = rawTokenId;
                            } 
                            else {
                                throw new Error(`Unrecognized token identifier: ${rawTokenId}`);
                            }
                        } else {
                            throw new Error(`Invalid tokenId: must be a string address or token name`);
                        }
                        
                        // Get optional count parameter for historical data
                        const count = toolName === 'get_token_historical_data' ? 
                            (typeof toolInput.count === 'number' ? toolInput.count : undefined) : 
                            undefined;
                            
                        // Call the appropriate function with extracted parameters
                        if (toolName === 'get_token_price') {
                            toolResult = await agentKit.getTokenPrice(tokenId);
                        } else if (toolName === 'get_token_info') {
                            toolResult = await agentKit.getToken(tokenId);
                        } else { // get_token_historical_data
                            toolResult = await agentKit.getTokenDayData(tokenId, count);
                        }
                        break;
                    }
                    
                    case 'get_pool_info':
                    case 'get_pool_historical_data': {
                        // Validate poolId
                        if (!toolInput.poolId || typeof toolInput.poolId !== 'string' || 
                            !toolInput.poolId.startsWith('0x')) {
                            throw new Error('Invalid pool address');
                        }
                        
                        const poolId = toolInput.poolId;
                        const count = toolName === 'get_pool_historical_data' ? 
                            (typeof toolInput.count === 'number' ? toolInput.count : undefined) : 
                            undefined;
                            
                        if (toolName === 'get_pool_info') {
                            toolResult = await agentKit.getPool(poolId);
                        } else { // get_pool_historical_data
                            toolResult = await agentKit.getPoolDayData(poolId, count);
                        }
                        break;
                    }
                    
                    // Balance & Wallet Tools
                    case 'get_edu_balance': {
                        // Extract and validate address
                        let walletAddress: string;
                        if (typeof toolInput.address === 'string' && toolInput.address.startsWith('0x')) {
                            walletAddress = toolInput.address;
                        } else if (address) {
                            walletAddress = address;
                            console.log('Using connected wallet address for get_edu_balance');
                        } else {
                            throw new Error('No valid address found for checking EDU balance');
                        }
                        
                        toolResult = await agentKit.getEduBalance(walletAddress);
                        
                        // AUTO-PROGRESSION FOR DEX: If this is a swap intent and we're checking EDU balance
                        if (agentId === 'dex' && swapIntent && swapIntent.isFromEdu) {
                            console.log('Found balance for swap intent, checking if sufficient:', toolResult);
                            
                            // Parse and check balance
                            let hasBalance = false;
                            try {
                                const balanceWei = BigInt(toolResult.balance || '0');
                                const amountWei = BigInt(Math.floor(parseFloat(swapIntent.amount) * 1e18)); // Simple conversion to wei
                                hasBalance = balanceWei >= amountWei;
                                console.log(`Balance check: ${balanceWei} >= ${amountWei} = ${hasBalance}`);
                            } catch (e) {
                                console.error('Error checking balance:', e);
                            }
                            
                            if (hasBalance) {
                                // Proceed with swap instead of just showing balance
                                console.log('Balance is sufficient, auto-proceeding with swap...');
                                
                                // Look up the token address
                                let tokenOutAddress = '';
                                try {
                                    // Get mapped address for common tokens
                                    const tokenName = swapIntent.toToken.toLowerCase();
                                    if (TOKEN_NAME_TO_ADDRESS_MAP[tokenName]) {
                                        tokenOutAddress = TOKEN_NAME_TO_ADDRESS_MAP[tokenName];
                                        console.log(`Found address for ${tokenName}: ${tokenOutAddress}`);
                                    } else {
                                        console.log(`Unknown token: ${tokenName}. Available tokens:`, Object.keys(TOKEN_NAME_TO_ADDRESS_MAP));
                                    }
                                } catch (e) {
                                    console.error('Error getting token address:', e);
                                }
                                
                                if (tokenOutAddress) {
                                    // Always get swap quote first
                                    console.log(`Getting swap quote for ${swapIntent.amount} EDU to ${tokenOutAddress}...`);
                                    try {
                                        const quoteResult = await agentKit.getSwapQuote(WEDU_ADDRESS, tokenOutAddress, swapIntent.amount);
                                        console.log('Swap quote result:', quoteResult);
                                        
                                        if (quoteResult) {
                                            // Update the assistant message to show the quote first
                                            const amountOut = parseFloat(quoteResult.formattedAmountOut || '0').toFixed(6);
                                            console.log(`Quote received: ${amountOut} ${quoteResult.tokenOutSymbol}`);
                                            
                                            // Now prepare the swap transaction
                                            console.log('Preparing swap transaction...');
                                            const txData = await agentKit.prepareSwapEduForTokensTx(
                                                tokenOutAddress, 
                                                swapIntent.amount, 
                                                address, 
                                                0.5, // default slippage
                                                20 // default deadline 
                                            );
                                            console.log('Swap transaction prepared:', txData);
                                            
                                            // Set transaction data for the response
                                            transactionData = txData;
                                            finalAction = 'swap_edu_for_tokens';
                                            targetChainId = EDUCHAIN_CHAIN_ID;
                                            savedToolInput = {
                                                tokenOut: tokenOutAddress,
                                                amountIn: swapIntent.amount,
                                                recipient: address,
                                                slippagePercentage: 0.5,
                                                deadlineMinutes: 20
                                            };
                                            
                                            // Update message to show both quote and transaction details
                                            finalAssistantMessage = `Your EDU balance: **${toolResult.balanceDisplay} EDU** ($${toolResult.balanceUSD})

Based on your request to swap ${swapIntent.amount} EDU for ${swapIntent.toToken}:

• Quote: You will receive approximately **${amountOut} ${quoteResult.tokenOutSymbol}**
• Price impact: ${(quoteResult.priceImpact || 0).toFixed(2)}%
• Slippage tolerance: 0.5%

I've prepared the transaction for you. Please confirm it in your wallet.`;
                                        } else {
                                            console.error('No quote result received');
                                            finalAssistantMessage = `Your EDU balance: **${toolResult.balanceDisplay} EDU** ($${toolResult.balanceUSD})\n\nI couldn't get a quote for swapping to ${swapIntent.toToken}. Please try again or specify a different token.`;
                                        }
                                    } catch (quoteError) {
                                        console.error('Error getting swap quote:', quoteError);
                                        
                                        // Check specifically for "No route found" error
                                        if (quoteError instanceof Error && quoteError.message.includes('No route found')) {
                                            finalAssistantMessage = `Your EDU balance: **${toolResult.balanceDisplay} EDU** ($${toolResult.balanceUSD})

I couldn't find a valid swap route from EDU to ${swapIntent.toToken}. This likely means:

• There may not be enough liquidity in the EDU-${swapIntent.toToken} pools
• A direct trading pair might not exist between these tokens
• The DEX might not support this token pair yet

You could try:
• A different token with more liquidity
• A smaller amount
• Using an intermediary token (e.g., swap EDU → WETH → ${swapIntent.toToken})`; 
                                        } else {
                                            finalAssistantMessage = `Your EDU balance: **${toolResult.balanceDisplay} EDU** ($${toolResult.balanceUSD})\n\nError getting a quote: ${(quoteError as Error).message}`;
                                        }
                                    }
                                } else {
                                    // No token address found
                                    finalAssistantMessage = `Your EDU balance: **${toolResult.balanceDisplay} EDU** ($${toolResult.balanceUSD})\n\nI couldn't find the token address for ${swapIntent.toToken}. Supported tokens: ${Object.keys(TOKEN_NAME_TO_ADDRESS_MAP).join(', ')}`;
                                }
                            } else {
                                // Not enough balance
                                finalAssistantMessage = `Your EDU balance: **${toolResult.balanceDisplay} EDU** ($${toolResult.balanceUSD})\n\nYou don't have enough EDU to swap ${swapIntent.amount} EDU for ${swapIntent.toToken}.`;
                            }
                        }
                        break;
                    }
                    
                    case 'get_token_balance': {
                        // Validate required parameters
                        if (!toolInput.tokenAddress || typeof toolInput.tokenAddress !== 'string') {
                            throw new Error('tokenAddress is required and must be a string');
                        }
                        
                        let walletAddress: string;
                        if (typeof toolInput.walletAddress === 'string' && toolInput.walletAddress.startsWith('0x')) {
                            walletAddress = toolInput.walletAddress;
                        } else if (address) {
                            walletAddress = address;
                            console.log('Using connected wallet address for get_token_balance');
                        } else {
                            throw new Error('No valid wallet address found for checking token balance');
                        }
                        
                        toolResult = await agentKit.getTokenBalance(toolInput.tokenAddress, walletAddress);
                        
                        // AUTO-PROGRESSION FOR DEX: If this is a swap intent and we're checking token balance
                        if (agentId === 'dex' && swapIntent && !swapIntent.isFromEdu) {
                            console.log('Found token balance for swap intent, checking if sufficient:', toolResult);
                            
                            // Similar logic for token-to-token or token-to-EDU swaps could be implemented here
                            // This would involve checking if the token address matches swapIntent.fromToken
                            // And then proceeding with the appropriate swap preparation
                        }
                        break;
                    }
                    
                    case 'get_multiple_token_balances': {
                        // Validate parameters
                        if (!Array.isArray(toolInput.tokenAddresses)) {
                            throw new Error('tokenAddresses must be an array of token addresses');
                        }
                        
                        let walletAddress: string;
                        if (typeof toolInput.walletAddress === 'string' && toolInput.walletAddress.startsWith('0x')) {
                            walletAddress = toolInput.walletAddress;
                        } else if (address) {
                            walletAddress = address;
                            console.log('Using connected wallet address for get_multiple_token_balances');
                        } else {
                            throw new Error('No valid wallet address found for checking multiple token balances');
                        }
                        
                        toolResult = await agentKit.getMultipleTokenBalances(toolInput.tokenAddresses, walletAddress);
                        break;
                    }
                    
                    case 'get_nft_balance': {
                        // Validate parameters
                        if (!toolInput.nftAddress || typeof toolInput.nftAddress !== 'string') {
                            throw new Error('nftAddress is required and must be a string');
                        }
                        
                        let walletAddress: string;
                        if (typeof toolInput.walletAddress === 'string' && toolInput.walletAddress.startsWith('0x')) {
                            walletAddress = toolInput.walletAddress;
                        } else if (address) {
                            walletAddress = address;
                            console.log('Using connected wallet address for get_nft_balance');
                        } else {
                            throw new Error('No valid wallet address found for checking NFT balance');
                        }
                        
                        toolResult = await agentKit.getERC721Balance(toolInput.nftAddress, walletAddress);
                        break;
                    }
                    
                    case 'get_wallet_overview': {
                        let walletAddress: string;
                        if (typeof toolInput.walletAddress === 'string' && toolInput.walletAddress.startsWith('0x')) {
                            walletAddress = toolInput.walletAddress;
                        } else if (address) {
                            walletAddress = address;
                            console.log('Using connected wallet address for get_wallet_overview');
                        } else {
                            throw new Error('No valid wallet address found for wallet overview');
                        }
                        
                        // Optional parameters
                        const tokenAddresses = Array.isArray(toolInput.tokenAddresses) ? 
                            toolInput.tokenAddresses : undefined;
                        const nftAddresses = Array.isArray(toolInput.nftAddresses) ? 
                            toolInput.nftAddresses : undefined;
                            
                        toolResult = await agentKit.getWalletOverview(walletAddress, tokenAddresses, nftAddresses);
                        break;
                    }
                    
                    // DEX Aggregation Tools
                    case 'get_top_tokens': {
                        const count = typeof toolInput.count === 'number' ? toolInput.count : undefined;
                        toolResult = await agentKit.getTopTokens(count);
                        break;
                    }
                    
                    case 'get_top_pools': {
                        const count = typeof toolInput.count === 'number' ? toolInput.count : undefined;
                        toolResult = await agentKit.getTopPools(count);
                        break;
                    }
                    
                    case 'get_total_tvl': {
                        toolResult = await agentKit.getTotalTVL();
                        break;
                    }
                    
                    case 'get_24h_volume': {
                        toolResult = await agentKit.getFactory();
                        break;
                    }
                    
                    // Swap Quote
                    case 'get_swap_quote': {
                        // Validate required parameters
                        if (!toolInput.tokenIn || typeof toolInput.tokenIn !== 'string') {
                            throw new Error('tokenIn is required and must be a string address');
                        }
                        if (!toolInput.tokenOut || typeof toolInput.tokenOut !== 'string') {
                            throw new Error('tokenOut is required and must be a string address');
                        }
                        if (!toolInput.amountIn || typeof toolInput.amountIn !== 'string') {
                            throw new Error('amountIn is required and must be a string');
                        }
                        
                        toolResult = await agentKit.getSwapQuote(
                            toolInput.tokenIn,
                            toolInput.tokenOut,
                            toolInput.amountIn
                        );
                        break;
                    }
                    
                    // External Market Tools
                    case 'get_external_market_data': {
                        toolResult = await agentKit.getExternalMarketData();
                        break;
                    }
                    
                    case 'check_arbitrage_opportunities': {
                        const threshold = typeof toolInput.threshold === 'number' ? 
                            toolInput.threshold : undefined;
                        toolResult = await agentKit.checkArbitrageOpportunities(threshold);
                        break;
                    }
                    
                    case 'get_external_market_config': {
                        toolResult = await agentKit.getConfig();
                        break;
                    }
                    
                    case 'get_rpc_url': {
                        toolResult = await agentKit.getRpcUrl();
                        break;
                    }
                    
                    default:
                        throw new Error(`Unknown info tool: ${toolName}`);
                }
                
                // Format and return the result
                const resultString = JSON.stringify(toolResult, null, 2);
                console.log(`Info Tool Result (${toolName}):`, resultString);
                
                // Instead of simple formatting, send the result back to Claude for interpretation
                try {
                    // Second call to Anthropic to interpret the tool result
                    const interpretationResponse = await anthropic.messages.create({
                        model: 'claude-3-haiku-20240307',
                        max_tokens: 1024,
                        system: `You are Lilikoi's Data Interpreter. Your job is to interpret and present data from info tools in a clear, concise, and user-friendly way.

FORMATTING GUIDELINES:
- Use proper structure with headers, bullet points, and spacing for readability
- For lists of items (tokens, pools, etc.), ALWAYS use bullet points (•) with one item per line
- For rankings (like "top tokens"), include the rank number with each item
- Include the most important metrics for each item - format numbers nicely with commas and 2 decimal places
- Use markdown formatting (bold, italics) sparingly to highlight important information
- Organize information into logical sections with clear headings when appropriate
- Keep explanations brief but meaningful

SPECIFIC DATA TYPES:
- For token lists: Format as "• #1: TOKEN_NAME - $XXX,XXX TVL - $XXX volume" 
- For balances: "Your XXX balance: XX.XX XXX ($XX.XX USD)"
- For prices: "Current price: $X.XX USD per XXX"
- For comparisons: Create a clear structure showing the differences

GENERAL RULES:
- Be concise but comprehensive
- Use plain language, not technical jargon
- Extract and prioritize the most relevant information the user likely cares about`,
                        messages: [
                            {
                                role: 'user',
                                content: `I requested information using the "${toolName.replace(/_/g, ' ')}" tool. Here is the raw result:
                                
                                ${resultString}
                                
                                Please interpret this data and present it in a clear, readable, well-structured format. My original question was: "${userMessage}"`
                            }
                        ],
                    });
                    
                    // Extract Claude's interpretation
                    const interpretationBlocks = interpretationResponse.content.filter(block => block.type === 'text');
                    if (interpretationBlocks.length > 0) {
                        const interpretation = interpretationBlocks.map(block => block.text).join('\n');
                        // Replace the raw JSON with Claude's interpretation
                        finalAssistantMessage = interpretation;
                    } else {
                        // Fall back to basic formatting if interpretation fails
                        finalAssistantMessage = `Okay, I found the information for **${toolName.replace(/_/g, ' ')}**:\n\n` + 
                            '```json\n' + 
                            resultString + 
                            '\n```';
                    }
                } catch (interpretError) {
                    console.error('Error getting interpretation from Claude:', interpretError);
                    // Fall back to basic formatting if interpretation fails
                    finalAssistantMessage = `Okay, I found the information for **${toolName.replace(/_/g, ' ')}**:\n\n` + 
                        '```json\n' + 
                        resultString + 
                        '\n```';
                }
            } catch (error) {
                console.error(`Error executing ${toolName}:`, error);
                finalAssistantMessage = `Error performing ${toolName.replace(/_/g, ' ')}: ${(error as Error).message}`;
            }
        }
        // Check if it's a TRANSACTION PREPARATION tool
        else if (internalTxPrepTools[toolName as Exclude<TransactionAction, BridgeAction>]) {
          const txPrepToolFn = internalTxPrepTools[toolName as Exclude<TransactionAction, BridgeAction>]!;
          console.log(`Calling Tx Prep Tool: ${toolName} with validated input:`, toolInput);
          
          let preparedTxData: any;
          // Pass validated arguments
          switch(toolName) {
              case 'send_edu': 
                  if (!recipientAddr) throw new Error('Recipient address missing for send_edu');
                  preparedTxData = await txPrepToolFn(recipientAddr, toolInput.amount); 
                  break;
              case 'send_erc20_token': 
                   if (!recipientAddr) throw new Error('Recipient address missing for send_erc20_token');
                   // TODO: Validate tokenAddress similarly if needed
                  preparedTxData = await txPrepToolFn(targetChainId, toolInput.tokenAddress, recipientAddr, toolInput.amount); 
                  break;
              case 'swap_tokens': 
                  if (!recipientAddr) throw new Error('Recipient address missing for swap_tokens');
                   // TODO: Validate tokenIn, tokenOut similarly if needed
                  preparedTxData = await txPrepToolFn(toolInput.tokenIn, toolInput.tokenOut, toolInput.amountIn, recipientAddr, toolInput.slippagePercentage, toolInput.deadlineMinutes); 
                  break;
              case 'swap_edu_for_tokens': 
                   if (!recipientAddr) throw new Error('Recipient address missing for swap_edu_for_tokens');
                   // TODO: Validate tokenOut similarly if needed
                  preparedTxData = await txPrepToolFn(toolInput.tokenOut, toolInput.amountIn, recipientAddr, toolInput.slippagePercentage, toolInput.deadlineMinutes); 
                  break;
              case 'swap_tokens_for_edu': 
                   if (!recipientAddr) throw new Error('Recipient address missing for swap_tokens_for_edu');
                   // TODO: Validate tokenIn similarly if needed
                  preparedTxData = await txPrepToolFn(toolInput.tokenIn, toolInput.amountIn, recipientAddr, toolInput.slippagePercentage, toolInput.deadlineMinutes); 
                  break;
              case 'wrap_edu': 
                  preparedTxData = await txPrepToolFn(toolInput.amount); 
                  break;
              case 'unwrap_wedu': 
                  preparedTxData = await txPrepToolFn(toolInput.amount); 
                  break;
              default:
                   console.error(`Argument extraction/passing not defined for tx prep tool: ${toolName}`);
                   throw new Error(`Internal config error for tx prep tool ${toolName}`);
          }
          
          console.log('Prepared Tx Data:', JSON.stringify(preparedTxData, null, 2));
          transactionData = preparedTxData;
          finalAssistantMessage = finalAssistantMessage || `Okay, I've prepared the ${toolName.replace(/_/g, ' ')} transaction for you. Please confirm it in your wallet on the correct chain (ID: ${targetChainId}).`; 
        }
        // Handle Bridging tools via BridgeMCP separately
        else if (['approve', 'deposit', 'withdraw'].includes(toolName)) { 
            if (agentId !== 'bridging') throw new Error(`Tool ${toolName} only available for bridging agent.`);

            const bridgeAction = toolName as BridgeAction;
            const pubkey = toolInput.address; 
            const amount = toolInput.amount;

            if (!pubkey || typeof pubkey !== 'string') {
                throw new Error(`Missing or invalid user address (pubkey) for BridgeMCP action '${bridgeAction}'`);
            }
             if (!amount || typeof amount !== 'string') {
                throw new Error(`Missing or invalid amount for BridgeMCP action '${bridgeAction}'`);
            }

            console.log(`Calling Bridge MCP: ${bridgeAction} with pubkey: ${pubkey}, amount: ${amount}`); 

            if (typeof BridgeMCP[bridgeAction] !== 'function') {
                 throw new Error(`BridgeMCP function for action '${bridgeAction}' not found.`);
            }
            
            const bridgeResult = await BridgeMCP[bridgeAction](pubkey, amount);

            console.log('[Bridge Result Raw]:', JSON.stringify(bridgeResult, null, 2)); 

            if (bridgeResult.error) { 
                throw new Error(`Bridge error from MCP: ${bridgeResult.error}`); 
            }
            
            // Check if data exists before trying to parse
            if (bridgeResult.data !== undefined && bridgeResult.data !== null) {
                let parsedData: any;
                try {
                    // *** PARSE THE JSON STRING ***
                    parsedData = typeof bridgeResult.data === 'string' ? JSON.parse(bridgeResult.data) : bridgeResult.data; 
                    console.log('[Bridge Result Parsed Data]:', parsedData);
                    
                    // Optional: Add basic validation on the *parsed* object
                    if (!parsedData || typeof parsedData !== 'object' || typeof parsedData.to !== 'string' || typeof parsedData.data !== 'string') {
                       throw new Error('Parsed bridge data is invalid or missing required fields (to, data).');
                    }
                    
                    transactionData = parsedData; // Assign the parsed object
                    finalAssistantMessage = finalAssistantMessage || `Okay, I've prepared the ${bridgeAction} transaction for you via the bridge. Please confirm it in your wallet${targetChainId ? ` on the correct chain (ID: ${targetChainId})`: ''}.`;
                
                } catch (parseError) {
                    console.error('[Bridge Result Parse Error]:', parseError);
                    throw new Error(`Failed to parse transaction data received from bridge API for action '${bridgeAction}'.`);
                }
            } else { 
                throw new Error(`Bridge MCP action '${bridgeAction}' completed without explicit error but returned null or undefined data.`);
            }
        } else {
          console.warn(`Tool ${toolName} requested but no matching function found.`);
          finalAssistantMessage = finalAssistantMessage || `I recognized the action ${toolName}, but I encountered an internal error trying to execute it.`;
        }
      } catch (error) {
          console.error(`Error executing tool ${toolName}:`, error);
          finalAssistantMessage = finalAssistantMessage ? `${finalAssistantMessage}\n\nError performing action: ${(error as Error).message}` 
                                                        : `Error performing action ${toolName}: ${(error as Error).message}`;
          transactionData = null;
          finalAction = null;
          targetChainId = null;
          savedToolInput = null;
      }

    } else if (!finalAssistantMessage) {
        console.error("Anthropic response had no text or tool use blocks.");
        finalAssistantMessage = "Sorry, I received an empty response. Could you try again?";
    }

    // --- Send Final Response --- 
    const responsePayload: { 
      content: string; 
      transactionData?: any; 
      action?: string | null; 
      targetChainId?: number | null;
      toolInput?: Record<string, any>;
    } = {
        content: finalAssistantMessage!
    };
    if (transactionData) {
        responsePayload.transactionData = transactionData;
    }
    if (finalAction) {
        responsePayload.action = finalAction;
    }
    if (targetChainId !== null) {
        responsePayload.targetChainId = targetChainId;
    }
    
    // Include toolInput in response payload
    if (savedToolInput && Object.keys(savedToolInput).length > 0) {
        responsePayload.toolInput = savedToolInput;
        console.log('Including toolInput in response:', savedToolInput);
    }
    
    return NextResponse.json(responsePayload);

  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 