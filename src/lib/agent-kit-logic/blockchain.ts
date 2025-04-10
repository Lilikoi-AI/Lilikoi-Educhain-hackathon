import { ethers } from 'ethers';
import * as subgraph from './subgraph';
import { JsonRpcProvider, Contract, formatUnits, parseUnits, ZeroAddress, Interface } from 'ethers';

// Default RPC URL and chain ID
let rpcUrl = 'https://rpc.edu-chain.raas.gelato.cloud';
const EDUCHAIN_CHAIN_ID = 41923;

// ERC20 ABI for token balance and metadata queries
// Export the ABI so it can be used by other modules
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)'
];

// ERC721 ABI for NFT balance queries
// Export this too if needed elsewhere
export const ERC721_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function name() view returns (string)',
  'function symbol() view returns (string)'
];

// ERC1155 ABI for NFT balance queries
// Export this too if needed elsewhere
export const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
  'function uri(uint256 id) view returns (string)'
];

// Assume getRpcUrl() returns the default (EDU Chain) RPC
const DEFAULT_PROVIDER = new JsonRpcProvider(getRpcUrl());

// *** Add a way to get providers for different chains ***
// This is a simple example; a more robust solution might involve a config file or env variables
const RPC_URLS: { [key: number]: string } = {
    [41923]: getRpcUrl(), // Default EDU Chain RPC
    [42161]: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc", // Arbitrum RPC
    // Add other chain RPCs if needed
};

const PROVIDERS: { [key: number]: JsonRpcProvider } = {};

function getProviderForChain(chainId: number): JsonRpcProvider {
    if (!PROVIDERS[chainId]) {
        const rpcUrl = RPC_URLS[chainId];
        if (!rpcUrl) {
            throw new Error(`RPC URL not configured for chain ID ${chainId}`);
        }
        PROVIDERS[chainId] = new JsonRpcProvider(rpcUrl);
        console.log(`Initialized provider for chain ${chainId}`);
    }
    return PROVIDERS[chainId];
}

// Helper function to safely convert BigInt to string
function bigIntToString(value: any): string {
  if (typeof value === 'bigint') {
    return value.toString();
  } else if (typeof value === 'object' && value !== null && typeof value.toString === 'function') {
    return value.toString();
  }
  return String(value);
}

// Get provider instance
export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(rpcUrl, EDUCHAIN_CHAIN_ID);
}

// Set RPC URL
export function setRpcUrl(url: string): void {
  rpcUrl = url;
}

// Get current RPC URL
export function getRpcUrl(): string {
  return rpcUrl;
}

// Get wallet address from private key
export function getWalletAddressFromPrivateKey(privateKey: string): string {
  try {
    const wallet = new ethers.Wallet(privateKey);
    return ethers.getAddress(wallet.address); // Format to checksum address
  } catch (error) {
    console.error('Error getting wallet address from private key:', error);
    throw error;
  }
}

// Get EDU balance
export async function getEduBalance(address: string): Promise<{ balance: string, balanceInEdu: string }> {
  try {
    const provider = getProvider();
    const balance = await provider.getBalance(address);
    const balanceInEdu = ethers.formatEther(balance);
    
    return {
      balance: bigIntToString(balance),
      balanceInEdu
    };
  } catch (error) {
    console.error('Error fetching EDU balance:', error);
    throw error;
  }
}

// Get token balance
export async function getTokenBalance(
  tokenAddress: string, 
  walletAddress: string
): Promise<{ 
  balance: string, 
  decimals: number, 
  symbol: string, 
  name: string, 
  formattedBalance: string,
  usdValue?: string
}> {
  try {
    const provider = getProvider();
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    // Get token details
    const [balance, decimals, symbol, name] = await Promise.all([
      tokenContract.balanceOf(walletAddress),
      tokenContract.decimals(),
      tokenContract.symbol(),
      tokenContract.name()
    ]);
    
    // Convert BigInt to string and number
    const balanceStr = bigIntToString(balance);
    const decimalsNum = Number(decimals);
    
    const formattedBalance = ethers.formatUnits(balance, decimalsNum);
    
    // Try to get USD value from SailFish
    let usdValue: string | undefined;
    try {
      const tokenPrice = await subgraph.getTokenPrice(tokenAddress);
      if (tokenPrice) {
        const valueInUsd = parseFloat(formattedBalance) * parseFloat(tokenPrice);
        usdValue = valueInUsd.toString();
      }
    } catch (error) {
      console.error('Error fetching token price:', error);
      // Continue without USD value
    }
    
    return {
      balance: balanceStr,
      decimals: decimalsNum,
      symbol: String(symbol),
      name: String(name),
      formattedBalance,
      usdValue
    };
  } catch (error) {
    console.error('Error fetching token balance:', error);
    throw error;
  }
}

// Get multiple token balances
export async function getMultipleTokenBalances(
  tokenAddresses: string[], 
  walletAddress: string
): Promise<Array<{ 
  tokenAddress: string,
  balance: string, 
  decimals: number, 
  symbol: string, 
  name: string, 
  formattedBalance: string,
  usdValue?: string
}>> {
  try {
    const results = await Promise.all(
      tokenAddresses.map(async (tokenAddress) => {
        try {
          const tokenBalance = await getTokenBalance(tokenAddress, walletAddress);
          return {
            tokenAddress,
            ...tokenBalance
          };
        } catch (error) {
          console.error(`Error fetching balance for token ${tokenAddress}:`, error);
          return {
            tokenAddress,
            balance: '0',
            decimals: 18,
            symbol: 'UNKNOWN',
            name: 'Unknown Token',
            formattedBalance: '0'
          };
        }
      })
    );
    
    return results;
  } catch (error) {
    console.error('Error fetching multiple token balances:', error);
    throw error;
  }
}

// Get ERC721 NFT balance
export async function getERC721Balance(
  nftAddress: string, 
  walletAddress: string,
  fetchTokenIds: boolean = true
): Promise<{
  contractAddress: string,
  name: string,
  symbol: string,
  balance: string,
  tokenIds?: string[]
}> {
  try {
    const provider = getProvider();
    const nftContract = new ethers.Contract(nftAddress, ERC721_ABI, provider);
    
    // Get NFT details
    const [balance, name, symbol] = await Promise.all([
      nftContract.balanceOf(walletAddress),
      nftContract.name(),
      nftContract.symbol()
    ]);
    
    const balanceNumber = Number(balance);
    
    // Get token IDs if requested and balance > 0
    let tokenIds: string[] | undefined;
    if (fetchTokenIds && balanceNumber > 0) {
      tokenIds = [];
      for (let i = 0; i < balanceNumber; i++) {
        try {
          const tokenId = await nftContract.tokenOfOwnerByIndex(walletAddress, i);
          tokenIds.push(bigIntToString(tokenId));
        } catch (error) {
          console.error(`Error fetching token ID at index ${i}:`, error);
          // Continue with next token ID
        }
      }
    }
    
    return {
      contractAddress: nftAddress,
      name: String(name),
      symbol: String(symbol),
      balance: bigIntToString(balance),
      tokenIds
    };
  } catch (error) {
    console.error('Error fetching ERC721 balance:', error);
    throw error;
  }
}

// Get ERC1155 NFT balance for a specific token ID
export async function getERC1155Balance(
  nftAddress: string, 
  walletAddress: string,
  tokenId: string
): Promise<{
  contractAddress: string,
  tokenId: string,
  balance: string,
  uri?: string
}> {
  try {
    const provider = getProvider();
    const nftContract = new ethers.Contract(nftAddress, ERC1155_ABI, provider);
    
    // Get NFT details
    const balance = await nftContract.balanceOf(walletAddress, tokenId);
    
    let uri: string | undefined;
    try {
      uri = await nftContract.uri(tokenId);
    } catch (error) {
      console.error(`Error fetching URI for token ID ${tokenId}:`, error);
      // Continue without URI
    }
    
    return {
      contractAddress: nftAddress,
      tokenId,
      balance: bigIntToString(balance),
      uri
    };
  } catch (error) {
    console.error('Error fetching ERC1155 balance:', error);
    throw error;
  }
}

// Send EDU native token to another address
export async function sendEdu(
  privateKey: string,
  toAddress: string,
  amount: string
): Promise<{
  hash: string,
  from: string,
  to: string,
  amount: string
}> {
  try {
    const provider = getProvider();
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Convert amount to wei
    const amountWei = ethers.parseEther(amount);
    
    // Create and send transaction
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountWei
    });
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    if (!receipt) {
      throw new Error('Transaction failed');
    }
    
    return {
      hash: tx.hash,
      from: wallet.address,
      to: toAddress,
      amount
    };
  } catch (error) {
    console.error('Error sending EDU:', error);
    throw error;
  }
}

// Send ERC20 token to another address
export async function sendErc20Token(
  privateKey: string,
  tokenAddress: string,
  toAddress: string,
  amount: string
): Promise<{
  hash: string,
  from: string,
  to: string,
  tokenAddress: string,
  amount: string
}> {
  try {
    const provider = getProvider();
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Create contract instance
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    // Get token decimals
    const decimals = await tokenContract.decimals();
    
    // Convert amount to token units
    const amountInTokenUnits = ethers.parseUnits(amount, decimals);
    
    // Send tokens
    const tx = await tokenContract.transfer(toAddress, amountInTokenUnits);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    if (!receipt) {
      throw new Error('Transaction failed');
    }
    
    return {
      hash: tx.hash,
      from: wallet.address,
      to: toAddress,
      tokenAddress,
      amount
    };
  } catch (error) {
    console.error('Error sending ERC20 token:', error);
    throw error;
  }
}

// Prepare transaction data for sending native EDU
export async function prepareSendEduTx(recipient: string, amount: string): Promise<{
  to: string;
  value: string; // Amount in wei
  data: string;
}> {
  try {
    // Validate address
    const toAddress = ethers.getAddress(recipient);
    // Parse amount (assuming input is in ETH/EDU)
    const valueWei = ethers.parseEther(amount);

    return {
      to: toAddress,
      value: valueWei.toString(),
      data: '0x', // No data needed for native transfer
    };
  } catch (error) {
    console.error('Error preparing send EDU transaction:', error);
    throw new Error(`Failed to prepare EDU transfer: ${(error as Error).message}`);
  }
}

// *** Update prepareSendErc20Tx signature and logic ***
export async function prepareSendErc20Tx(
    chainId: number, // <-- Accept chainId
    tokenAddress: string,
    recipient: string,
    amount: string
): Promise<{ to: string; data: string; value: string }> {
    console.log(`Preparing ERC20 send on chain ${chainId}: Token=${tokenAddress}, To=${recipient}, Amount=${amount}`);
    try {
        // Get provider for the target chain
        const provider = getProviderForChain(chainId);
        
        // Validate addresses
        if (!tokenAddress || tokenAddress === ZeroAddress || !recipient || recipient === ZeroAddress) {
            throw new Error("Invalid token or recipient address.");
        }

        // Use the chain-specific provider to interact with the contract
        const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);

        let decimals: bigint;
        try {
            // Attempt to get decimals from the contract on the correct chain
            decimals = await tokenContract.decimals();
            console.log(`Token decimals on chain ${chainId}: ${decimals}`);
        } catch (decimalError) {
            console.error(`Error fetching decimals for ${tokenAddress} on chain ${chainId}:`, decimalError);
            throw new Error(`Failed to get token decimals on chain ${chainId}: ${(decimalError as Error).message}`);
        }

        const amountInSmallestUnit = parseUnits(amount, decimals);

        // Prepare the transaction data using the contract instance (provider doesn't matter here)
        const txData = tokenContract.interface.encodeFunctionData("transfer", [
            recipient,
            amountInSmallestUnit
        ]);

        return {
            to: tokenAddress,
            data: txData,
            value: '0' // Value is 0 for ERC20 transfers
        };
    } catch (error) {
        console.error("Error preparing send ERC20 transaction:", error);
        // Re-throw a more informative error if possible
        throw new Error(`Failed to prepare ERC20 transfer: ${(error as Error).message}`);
    }
}

/**
 * Prepare transaction data for approving an ERC20 token spender.
 * @param tokenAddress The address of the ERC20 token contract.
 * @param spenderAddress The address that will be approved to spend the tokens.
 * @param amount The amount of tokens to approve (in human-readable format, e.g., "100.5"). Use ethers.MaxUint256.toString() for max approval.
 */
export async function prepareApproveTx(
    tokenAddress: string,
    spenderAddress: string,
    amount: string 
): Promise<{ to: string; data: string; value: string }> {
    try {
        const provider = getProvider();
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const decimals = await tokenContract.decimals();

        // Validate addresses
        const tokenAddr = ethers.getAddress(tokenAddress);
        const spenderAddr = ethers.getAddress(spenderAddress);

        // Parse amount to wei
        const amountWei = amount === ethers.MaxUint256.toString() 
            ? ethers.MaxUint256 
            : ethers.parseUnits(amount, Number(decimals));

        // Encode the approve function data
        const erc20Interface = new Interface(ERC20_ABI);
        const data = erc20Interface.encodeFunctionData('approve', [spenderAddr, amountWei]);

        return {
            to: tokenAddr,    // Transaction goes TO the token contract
            data: data,      // The encoded approve function call
            value: '0',      // No native value sent for approve
        };
    } catch (error) {
        console.error('Error preparing approve transaction:', error);
        throw new Error(`Failed to prepare approve transaction: ${(error as Error).message}`);
    }
}

// Get wallet overview with EDU, tokens, and NFTs
export async function getWalletOverview(
  walletAddress: string,
  tokenAddresses: string[] = [],
  nftAddresses: string[] = []
): Promise<{
  address: string,
  eduBalance: { balance: string, balanceInEdu: string },
  tokens: Array<{ 
    tokenAddress: string,
    balance: string, 
    decimals: number, 
    symbol: string, 
    name: string, 
    formattedBalance: string,
    usdValue?: string
  }>,
  nfts: Array<{
    contractAddress: string,
    name?: string,
    symbol?: string,
    balance: string,
    tokenIds?: string[]
  }>
}> {
  try {
    // Get EDU balance
    const eduBalance = await getEduBalance(walletAddress);
    
    // Get token balances
    const tokens = await getMultipleTokenBalances(tokenAddresses, walletAddress);
    
    // Get NFT balances
    const nfts = await Promise.all(
      nftAddresses.map(async (nftAddress) => {
        try {
          return await getERC721Balance(nftAddress, walletAddress);
        } catch (error) {
          console.error(`Error fetching NFT balance for ${nftAddress}:`, error);
          return {
            contractAddress: nftAddress,
            balance: '0'
          };
        }
      })
    );
    
    return {
      address: walletAddress,
      eduBalance,
      tokens,
      nfts
    };
  } catch (error) {
    console.error('Error fetching wallet overview:', error);
    throw error;
  }
}
