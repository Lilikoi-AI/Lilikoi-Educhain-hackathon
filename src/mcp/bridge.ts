import axios from 'axios';

const BASE_URL = "https://yuzu-api-production.r8edev.xyz/bridge/arbMainnet/eduMainnet";

export interface BridgeResponse {
  data: any; // Replace with specific transaction type when available
  error?: string;
}

export const BridgeMCP = {
  approve: async (address: string, amount: string): Promise<BridgeResponse> => {
    try {
      console.log(`Calling approve API for address ${address} with amount ${amount}`);
      const response = await axios.get(`${BASE_URL}/${address}/approve/edu/${amount}`);

      // Ensure data is properly formatted
      let txData = response.data;

      // If the data is already a string, keep it as is
      // If it's an object, stringify it
      if (typeof txData !== 'string') {
        txData = JSON.stringify(txData);
      }

      console.log(`Approve API response:`, txData);
      return { data: txData };
    } catch (error) {
      console.error('Error in approve function:', error);
      return { data: null, error: 'Failed to approve tokens' };
    }
  },

  deposit: async (address: string, amount: string): Promise<BridgeResponse> => {
    try {
      console.log(`Calling deposit API for address ${address} with amount ${amount}`);
      const response = await axios.get(`${BASE_URL}/${address}/deposit/edu/${amount}`);

      // Ensure data is properly formatted
      let txData = response.data;

      // If the data is already a string, keep it as is
      // If it's an object, stringify it
      if (typeof txData !== 'string') {
        txData = JSON.stringify(txData);
      }

      console.log(`Deposit API response:`, txData);
      return { data: txData };
    } catch (error) {
      console.error('Error in deposit function:', error);
      return { data: null, error: 'Failed to deposit tokens' };
    }
  },

  withdraw: async (address: string, amount: string): Promise<BridgeResponse> => {
    try {
      console.log(`Calling withdraw API for address ${address} with amount ${amount}`);
      const response = await axios.get(`${BASE_URL}/${address}/withdraw/edu/${amount}`);

      // Ensure data is properly formatted
      let txData = response.data;

      // If the data is already a string, keep it as is
      // If it's an object, stringify it
      if (typeof txData !== 'string') {
        txData = JSON.stringify(txData);
      }

      console.log(`Withdraw API response:`, txData);
      return { data: txData };
    } catch (error) {
      console.error('Error in withdraw function:', error);
      return { data: null, error: 'Failed to withdraw tokens' };
    }
  }
}; 