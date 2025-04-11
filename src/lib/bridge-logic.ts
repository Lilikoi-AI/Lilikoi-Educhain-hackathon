// Adapted from @sailfishdex/v3-sdk for BSC to Arbitrum bridging & Arb to Edu bridging

import { ethers, Provider, Signer, Interface } from 'ethers';
import axios from 'axios'; // Required for getBnbPrice

// === Constants ===
export const BSC_ABI = [
  "function estimateSendFee(uint16 dstChainId, bytes calldata toAddress, uint256 amount, bool useZro, bytes calldata adapterParams) external view returns (uint256 nativeFee, uint256 zroFee)",
  "function sendFrom(address from, uint16 dstChainId, bytes calldata toAddress, uint256 amount, address payable refundAddress, address zroPaymentAddress, bytes calldata adapterParams) external payable"
];

const BSC_EDU_TOKEN_ADDRESS = "0xBdEAe1cA48894A1759A8374D63925f21f2Ee2639";
const ARB_EDU_TOKEN_ADDRESS = "0xf8173a39c56a554837C4C7f104153A005D284D11";
const ARB_TO_EDU_BRIDGE_CONTRACT = "0x590044e628ea1B9C10a86738Cf7a7eeF52D031B8";

const ERC20_ABI_SLIM = [
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)"
];

const ARB_BRIDGE_ABI = ["function depositERC20(uint256 amount)"];

// === Helper Functions ===

async function getEduDecimals(provider: Provider, tokenAddress: string, defaultDecimals: number = 18): Promise<number> {
    try {
        const eduContract = new ethers.Contract(tokenAddress, ERC20_ABI_SLIM, provider);
        return Number(await eduContract.decimals());
    } catch (error) {
        console.warn(`Error fetching decimals for ${tokenAddress}. Using default: ${defaultDecimals}`, error);
        return defaultDecimals;
    }
}

/**
 * Bridge class mimicking v3 SDK for backend transaction data preparation.
 */
export class Bridge {
  private provider: Provider;
  // Signer is kept for potential future use or full SDK mimicry, but not used for data prep.
  private signer?: Signer; 

  constructor(providerOrSigner: Provider | Signer) {
    if ("provider" in providerOrSigner && typeof providerOrSigner.provider !== "undefined") {
      this.signer = providerOrSigner as Signer;
      this.provider = (providerOrSigner as Signer).provider as Provider;
    } else {
      this.provider = providerOrSigner as Provider;
    }
  }

  // Note: hasSigner() is part of SDK but removed here as it's not strictly needed
  // for data prep and depends on context. Functions needing signing are adapted.

  /** Mimics SDK: Get the BNB price in USD */
  public async getBnbPrice(): Promise<number> {
    try {
      // Note: Requires axios dependency
      const response = await axios.get('https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BNB&tsyms=USD');
      return response.data.RAW.BNB.USD.PRICE;
    } catch (error) {
      console.error('Error fetching BNB price:', error);
      throw new Error('Failed to fetch BNB price');
    }
  }

  /** Mimics SDK: Estimate fee for BSC -> Arbitrum bridge */
  public async estimateBridgeFee(
    amount: string,
    address: string,
    gasOnDestination: string = "0.0005"
  ): Promise<string> {
    // Note: SDK includes hasSigner() here, but estimation only needs provider.
    try {
      const bscOft = "0x67fb304001aD03C282266B965b51E97Aa54A2FAB";
      const bscOftContract = new ethers.Contract(bscOft, BSC_ABI, this.provider);
      const decimals = await getEduDecimals(this.provider, BSC_EDU_TOKEN_ADDRESS);
      const dstChainId = 110;
      const amountBigInt = ethers.parseUnits(amount, decimals);
      const useZro = false;
      const toAddress = ethers.zeroPadValue(address, 32);
      const type = 2;
      const gasLimit = 500000;
      const gasAirdrop = ethers.parseEther(gasOnDestination);
      const adapterParams = ethers.solidityPacked(
        ["uint16", "uint256", "uint256", "address"],
        [type, gasLimit, gasAirdrop, address]
      );      
      const result = await bscOftContract.estimateSendFee(dstChainId, toAddress, amountBigInt, useZro, adapterParams);
      return ethers.formatEther(result[0]);
    } catch (error) {
      console.error("Error estimating bridge fee:", error);
      throw new Error(`Failed to estimate bridge fee: ${(error as Error).message}`);
    }
  }

  /** Mimics SDK: Check if the user has enough BNB */
  public async hasEnoughBnb(address: string, fee: string): Promise<boolean> {
    try {
        const balance = await this.provider.getBalance(address);
        return ethers.getBigInt(balance) >= ethers.parseEther(fee);
    } catch (error) {
        console.error('Error checking BNB balance:', error);
        throw new Error('Failed to check BNB balance');
    }
  }

  /** Mimics SDK: Check if the user has enough EDU on BSC */
  public async hasEnoughEdu(address: string, amount: string): Promise<boolean> {
    try {
        const eduContract = new ethers.Contract(BSC_EDU_TOKEN_ADDRESS, ERC20_ABI_SLIM, this.provider);
        const decimals = await getEduDecimals(this.provider, BSC_EDU_TOKEN_ADDRESS);
        let balance = 0n;
        try { 
            balance = await eduContract.balanceOf(address);
        } catch { /* ignore, use 0 */ }
        return balance >= ethers.parseUnits(amount, decimals);
    } catch (error) {
        console.warn('Error checking BSC EDU balance:', error);
        return false; // Mimic SDK returning false on general error
    }
  }

  /** Mimics SDK: Prepare Approve EDU transaction data on BSC */
  public async approveEduOnBsc(): Promise<any> { // Renamed from approveEdu for clarity
    // No hasSigner check needed for data prep
    try {
      const bscOft = "0x67fb304001aD03C282266B965b51E97Aa54A2FAB";
      const iface = new Interface(ERC20_ABI_SLIM);
      const data = iface.encodeFunctionData("approve", [bscOft, ethers.MaxUint256]);
      return {
        to: BSC_EDU_TOKEN_ADDRESS,
        data: data,
        value: "0",
        chainId: 56,
        description: `Approve EDU tokens on BSC for bridging`,
      };
    } catch (error) {
      console.error("Error preparing BSC EDU approval tx data:", error);
      throw new Error("Failed to prepare BSC EDU approval tx data");
    }
  }

  /** Mimics SDK: Check if EDU tokens are approved for the bridge on BSC */
  public async isEduApprovedOnBsc(address: string, amount: string): Promise<boolean> { // Renamed from isEduApproved
    try {
      const bscOft = "0x67fb304001aD03C282266B965b51E97Aa54A2FAB";
      const eduContract = new ethers.Contract(BSC_EDU_TOKEN_ADDRESS, ERC20_ABI_SLIM, this.provider);
      const decimals = await getEduDecimals(this.provider, BSC_EDU_TOKEN_ADDRESS);
      const allowance = await eduContract.allowance(address, bscOft);
      return ethers.getBigInt(allowance) >= ethers.parseUnits(amount, decimals);
    } catch (error) {
      console.error("Error checking BSC EDU allowance:", error);
      throw new Error("Failed to check BSC EDU allowance");
    }
  }

  /** Mimics SDK: Prepare bridge EDU from BSC to Arbitrum transaction data */
  public async bridgeEduFromBscToArb(
    amount: string,
    address: string,
    gasOnDestination: string = "0.0005"
  ): Promise<any> {
    // No hasSigner check needed for data prep
    try {
        const bscOft = "0x67fb304001aD03C282266B965b51E97Aa54A2FAB";
        const iface = new Interface(BSC_ABI);
        const decimals = await getEduDecimals(this.provider, BSC_EDU_TOKEN_ADDRESS);
        const dstChainId = 110;
        const amountBigInt = ethers.parseUnits(amount, decimals);
        const toAddressBytes32 = ethers.zeroPadValue(address, 32);
        const type = 2;
        const gasLimit = 500000;
        const gasAirdrop = ethers.parseEther(gasOnDestination);
        const adapterParams = ethers.solidityPacked(
            ["uint16", "uint256", "uint256", "address"],
            [type, gasLimit, gasAirdrop, address]
        );

        let finalFeeWei: bigint;
        const defaultFeeWei = ethers.parseEther("0.003");
        try {
            const bscOftContractForEstimation = new ethers.Contract(bscOft, BSC_ABI, this.provider); 
            const result = await bscOftContractForEstimation.estimateSendFee(dstChainId, toAddressBytes32, amountBigInt, false, adapterParams);
            finalFeeWei = result[0];
        } catch (estimationError) {
            console.warn("Direct fee estimation failed, using default fee:", estimationError);
            finalFeeWei = defaultFeeWei;
        }

        const data = iface.encodeFunctionData("sendFrom", [
            address, dstChainId, toAddressBytes32, amountBigInt, 
            address, // refundAddress
            address, // zroPaymentAddress
            adapterParams
        ]);

        return {
            to: bscOft,
            data: data,
            value: finalFeeWei.toString(),
            chainId: 56,
            description: `Bridge ${amount} EDU from BSC to Arbitrum`,
            note: `Includes ${ethers.formatEther(finalFeeWei)} BNB fee (estimated or default).`
        };

    } catch (error) {
        console.error("Error preparing BSC->Arb bridge tx data:", error);
        throw new Error(`Failed to prepare BSC->Arb bridge tx data: ${(error as Error).message}`);
    }
  }

  // === Arbitrum -> EDU Chain Functions ===

  /** Mimics SDK: Check if EDU tokens are approved for the bridge on Arbitrum */
  public async isEduApprovedOnArb(address: string, amount: string): Promise<boolean> {
      try {
          const eduContract = new ethers.Contract(ARB_EDU_TOKEN_ADDRESS, ERC20_ABI_SLIM, this.provider);
          const decimals = await getEduDecimals(this.provider, ARB_EDU_TOKEN_ADDRESS);
          const allowance = await eduContract.allowance(address, ARB_TO_EDU_BRIDGE_CONTRACT);
          return ethers.getBigInt(allowance) >= ethers.parseUnits(amount, decimals);
      } catch (error) {
          console.error("Error checking ARB EDU allowance:", error);
          throw new Error("Failed to check ARB EDU allowance");
      }
  }

  /** Mimics SDK: Prepare Approve EDU transaction data on Arbitrum */
  public async approveEduOnArb(): Promise<any> { // Removed amount param as SDK approves MaxUint256
      // No hasSigner check needed for data prep
      try {
          const iface = new Interface(ERC20_ABI_SLIM);
          const data = iface.encodeFunctionData("approve", [ARB_TO_EDU_BRIDGE_CONTRACT, ethers.MaxUint256]);
          return {
              to: ARB_EDU_TOKEN_ADDRESS,
              data: data,
              value: "0",
              chainId: 42161, // Arbitrum Chain ID
              description: `Approve EDU tokens on Arbitrum for bridging to EDU Chain`,
          };
      } catch (error) {
          console.error("Error preparing ARB EDU approval tx data:", error);
          throw new Error("Failed to prepare ARB EDU approval tx data");
      }
  }

  /** Mimics SDK: Check if the user has enough EDU tokens on Arbitrum */
  public async hasEnoughEduOnArb(address: string, amount: string): Promise<boolean> {
      try {
          const eduContract = new ethers.Contract(ARB_EDU_TOKEN_ADDRESS, ERC20_ABI_SLIM, this.provider);
          const decimals = await getEduDecimals(this.provider, ARB_EDU_TOKEN_ADDRESS);
          let balance = 0n;
          try { 
              balance = await eduContract.balanceOf(address);
          } catch { /* ignore, use 0 */ }
          return balance >= ethers.parseUnits(amount, decimals);
      } catch (error) {
          console.warn('Error checking ARB EDU balance:', error);
          return false; // Mimic SDK returning false
      }
  }

  /** Mimics SDK: Prepare bridge EDU from Arbitrum to EDUCHAIN transaction data */
  public async bridgeEduFromArbToEdu(amount: string): Promise<any> {
      // No hasSigner check needed for data prep
      try {
          const decimals = await getEduDecimals(this.provider, ARB_EDU_TOKEN_ADDRESS);
          const amountBigInt = ethers.parseUnits(amount, decimals);
          const iface = new Interface(ARB_BRIDGE_ABI);
          const data = iface.encodeFunctionData("depositERC20", [amountBigInt]);
          
          // Note: This bridge typically doesn't require a separate fee in the 'value'
          // field like LayerZero bridges. Gas is paid normally in ETH on Arbitrum.
          return {
              to: ARB_TO_EDU_BRIDGE_CONTRACT,
              data: data,
              value: "0", 
              chainId: 42161, // Arbitrum Chain ID
              description: `Bridge ${amount} EDU from Arbitrum to EDU Chain`,
          };
      } catch (error) {
          console.error("Error preparing Arb->EDU bridge tx data:", error);
          throw new Error("Failed to prepare Arb->EDU bridge tx data");
      }
  }
} 