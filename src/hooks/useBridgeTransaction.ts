import { useState } from 'react';
import { useSendTransaction, useConfig, useAccount } from 'wagmi';

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

export enum TransactionStatus {
  IDLE = 'idle',
  PENDING = 'pending',
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface TransactionResult {
  hash?: string;
  error?: string;
}

export function useBridgeTransaction() {
  const [status, setStatus] = useState<TransactionStatus>(TransactionStatus.IDLE);
  const [result, setResult] = useState<TransactionResult>({});
  const config = useConfig();
  const { address } = useAccount();

  const { sendTransactionAsync } = useSendTransaction();

  const executeTransaction = async (transactionData: BridgeTransactionData) => {
    console.log('Starting transaction execution with data:', JSON.stringify(transactionData, null, 2));

    if (!address) {
      const error = 'Wallet not connected or no address available';
      console.error(error);
      setResult({ error });
      setStatus(TransactionStatus.ERROR);
      return;
    }

    try {
      setStatus(TransactionStatus.PENDING);
      console.log('Transaction status: PENDING');

      // Convert values to appropriate types
      const txParams: any = {
        account: address as `0x${string}`,
        to: transactionData.to as `0x${string}`,
        data: transactionData.data as `0x${string}`,
      };

      if (transactionData.value) {
        txParams.value = BigInt(transactionData.value);
      }

      // Add gas if present or use default
      if (transactionData.gas) {
        txParams.gas = BigInt(transactionData.gas);
      } else {
        // Default gas limit if not provided
        txParams.gas = BigInt(2000000);
      }

      if (transactionData.nonce) {
        txParams.nonce = Number(transactionData.nonce);
      }

      // Log the final params that will be sent to the wallet
      console.log('Sending transaction with params:', {
        ...txParams,
        value: txParams.value?.toString(),
        gas: txParams.gas?.toString(),
      });

      // Send transaction
      const hash = await sendTransactionAsync(txParams);

      console.log('Transaction successful with hash:', hash);
      setResult({ hash });
      setStatus(TransactionStatus.SUCCESS);
    } catch (error) {
      console.error('Transaction execution error:', error);
      const errorMessage = (error as Error).message || 'Unknown error occurred';
      console.log('Error details:', errorMessage);
      setResult({ error: errorMessage });
      setStatus(TransactionStatus.ERROR);
    }
  };

  const reset = () => {
    console.log('Resetting transaction state');
    setStatus(TransactionStatus.IDLE);
    setResult({});
  };

  return {
    executeTransaction,
    status,
    result,
    reset,
    isIdle: status === TransactionStatus.IDLE,
    isPending: status === TransactionStatus.PENDING,
    isSuccess: status === TransactionStatus.SUCCESS,
    isError: status === TransactionStatus.ERROR,
  };
} 