import axios from 'axios';

const BASE_URL = "https://yuzu-api-production.r8edev.xyz/bridge/arbMainnet/eduMainnet";

export interface BridgeResponse {
  data: any;
  error?: string;
}

export async function approve(pubkey: string, amount: string) {
  try {
    console.log(`Approving ${amount} EDU for ${pubkey}`);
    const response = await axios.get(`${BASE_URL}/${pubkey}/approve/edu/${amount}`);
    console.log('Approve response:', response.data);
    return { data: response.data }; // Returns the EVM transaction object
  } catch (error) {
    console.error('Error in approve function:', error);
    return { data: null, error: 'Failed to approve tokens' };
  }
}

export async function deposit(pubkey: string, amount: string) {
  try {
    console.log(`Depositing ${amount} EDU for ${pubkey}`);
    const response = await axios.get(`${BASE_URL}/${pubkey}/deposit/edu/${amount}`);
    console.log('Deposit response:', response.data);
    return { data: response.data }; // Returns the EVM transaction object
  } catch (error) {
    console.error('Error in deposit function:', error);
    return { data: null, error: 'Failed to deposit tokens' };
  }
}

export async function withdraw(pubkey: string, amount: string) {
  try {
    console.log(`Withdrawing ${amount} EDU for ${pubkey}`);
    const response = await axios.get(`${BASE_URL}/${pubkey}/withdraw/edu/${amount}`);
    console.log('Withdraw response:', response.data);
    return { data: response.data }; // Returns the EVM transaction object
  } catch (error) {
    console.error('Error in withdraw function:', error);
    return { data: null, error: 'Failed to withdraw tokens' };
  }
}

// Export as an object for compatibility with existing code
export const BridgeMCP = {
  approve,
  deposit,
  withdraw
}; 