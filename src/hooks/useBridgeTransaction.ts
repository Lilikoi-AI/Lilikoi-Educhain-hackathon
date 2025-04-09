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

      // *** Improved Data Handling ***
      let formattedData = transactionData.data; 
      console.log('[executeTransaction] Initial transactionData.data:', formattedData); // Log initial value

      // Check if data is a valid string before using startsWith
      if (typeof formattedData === 'string' && formattedData.length > 0) { // Check length too
          if (!formattedData.startsWith('0x')) {
            console.log('[executeTransaction] Adding 0x prefix to data');
            formattedData = `0x${formattedData}`;
          }
      } else {
          // Handle missing, null, empty string, or non-string data
          console.warn(`[executeTransaction] transactionData.data is invalid (${typeof formattedData}, value: ${formattedData}), setting to '0x'`);
          formattedData = '0x'; // Default to empty data if invalid
      }
      // *** End Improved Data Handling ***

      // Basic transaction parameters
      const txParams: any = {
        account: address as `0x${string}`,
        // Add validation for 'to' address as well
        to: (typeof transactionData.to === 'string' && transactionData.to.startsWith('0x')) 
            ? transactionData.to as `0x${string}` 
            : undefined, // Set to undefined if invalid
        data: formattedData as `0x${string}`, // Use the potentially modified formattedData
      };
      
      // Ensure 'to' address is valid before proceeding
      if (txParams.to === undefined) {
           console.error("[executeTransaction] Invalid or missing 'to' address in transactionData:", transactionData.to);
           throw new Error("Transaction data is missing or contains an invalid destination ('to') address.");
      }

      // Handle value if present
      if (transactionData.value && transactionData.value !== '0' && transactionData.value !== '0x0') {
        try {
          txParams.value = BigInt(transactionData.value);
        } catch (error) {
          console.warn('Invalid value format:', transactionData.value);
        }
      }

      // Handle gas parameters
      if (transactionData.gas) {
        try {
          // Remove '0x' prefix if present for BigInt conversion
          const gasValue = transactionData.gas.replace('0x', '');
          txParams.gas = BigInt(gasValue);
        } catch (error) {
          console.warn('Invalid gas format:', transactionData.gas);
          // Use a safe default gas limit
          txParams.gas = BigInt(300000);
        }
      } else {
        // Default gas limit if not provided
        txParams.gas = BigInt(300000);
      }

      // Handle nonce if present
      if (transactionData.nonce) {
        try {
          txParams.nonce = Number(transactionData.nonce);
        } catch (error) {
          console.warn('Invalid nonce format:', transactionData.nonce);
        }
      }

      // Log the final transaction parameters
      console.log('Sending transaction with params:', {
        ...txParams,
        value: txParams.value?.toString(),
        gas: txParams.gas?.toString(),
        // Log first part of data for brevity if long
        data: txParams.data.length > 100 ? txParams.data.substring(0, 98) + '...' : txParams.data,
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