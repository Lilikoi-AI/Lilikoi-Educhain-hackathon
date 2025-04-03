import { WalletClient } from 'viem';
import type {
  Account,
  Chain,
  Transport,
  TransactionRequest,
  Hash
} from 'viem';

export interface BridgeTransactionData {
  from: string;
  to: string;
  data: string;
  value?: string;
  chainId?: number;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
}

/**
 * Formats a bridge transaction for signing by the wallet
 */
export function formatBridgeTransaction(transactionData: BridgeTransactionData): TransactionRequest {
  console.log('Raw Transaction Data:', JSON.stringify(transactionData, null, 2));

  const formattedTx: TransactionRequest = {
    to: transactionData.to as `0x${string}`,
    data: transactionData.data as `0x${string}`,
  };

  if (transactionData.value) {
    formattedTx.value = BigInt(transactionData.value);
  }

  if (transactionData.gas) {
    formattedTx.gas = BigInt(transactionData.gas);
  }

  if (transactionData.nonce) {
    formattedTx.nonce = Number(transactionData.nonce);
  }

  // Choose between legacy gas price or EIP-1559 fee params
  if (transactionData.gasPrice) {
    formattedTx.gasPrice = BigInt(transactionData.gasPrice);
  } else {
    if (transactionData.maxFeePerGas) {
      formattedTx.maxFeePerGas = BigInt(transactionData.maxFeePerGas);
    }

    if (transactionData.maxPriorityFeePerGas) {
      formattedTx.maxPriorityFeePerGas = BigInt(transactionData.maxPriorityFeePerGas);
    }
  }

  console.log('Formatted Transaction Parameters:', {
    to: formattedTx.to,
    data: formattedTx.data,
    value: formattedTx.value?.toString(),
    gas: formattedTx.gas?.toString(),
    gasPrice: formattedTx.gasPrice?.toString(),
    maxFeePerGas: formattedTx.maxFeePerGas?.toString(),
    maxPriorityFeePerGas: formattedTx.maxPriorityFeePerGas?.toString(),
    nonce: formattedTx.nonce,
  });

  return formattedTx;
}

/**
 * Signs and sends a transaction using the wallet client
 */
export async function signAndSendTransaction(
  walletClient: WalletClient,
  transactionData: BridgeTransactionData
): Promise<{ hash: string } | { error: string }> {
  try {
    console.log('WalletClient:', {
      account: walletClient.account,
      chain: walletClient.chain,
      transport: walletClient.transport.type,
    });

    console.log('Raw Transaction Data:', JSON.stringify(transactionData, null, 2));

    // Convert string values to appropriate types
    const params: Record<string, any> = {
      account: walletClient.account,
      to: transactionData.to as `0x${string}`,
      data: transactionData.data as `0x${string}`,
    };

    if (transactionData.value) params.value = BigInt(transactionData.value);
    if (transactionData.gas) params.gas = BigInt(transactionData.gas);
    if (transactionData.nonce) params.nonce = Number(transactionData.nonce);

    // Gas settings
    if (transactionData.gasPrice) {
      params.gasPrice = BigInt(transactionData.gasPrice);
    } else {
      if (transactionData.maxFeePerGas) {
        params.maxFeePerGas = BigInt(transactionData.maxFeePerGas);
      }
      if (transactionData.maxPriorityFeePerGas) {
        params.maxPriorityFeePerGas = BigInt(transactionData.maxPriorityFeePerGas);
      }
    }

    console.log('Sending transaction with params:', {
      ...params,
      value: params.value?.toString(),
      gas: params.gas?.toString(),
      gasPrice: params.gasPrice?.toString(),
      maxFeePerGas: params.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: params.maxPriorityFeePerGas?.toString(),
    });

    // Send transaction using the wallet client
    const hash = await walletClient.sendTransaction(params);

    console.log('Transaction hash:', hash);

    return { hash };
  } catch (error) {
    console.error('Transaction error:', error);
    return { error: (error as Error).message || 'Unknown error occurred' };
  }
} 