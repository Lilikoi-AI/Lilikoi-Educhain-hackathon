// Copied and adapted from @sailfishdex/v3-sdk
// Specifically for Arbitrum -> EDU Chain bridging

import { ethers, Provider, Signer, Contract, Interface } from 'ethers';

// --- Interface Definitions ---
interface TxData {
    to: string;
    data: string;
    value?: string;
}

// --- Constants (Copied/Adapted from SDK constants & bridge.ts) ---

// EDU Token on Arbitrum
const ARB_EDU_TOKEN_ADDRESS = "0xf8173a39c56a554837C4C7f104153A005D284D11";

// Bridge Contract (Arbitrum -> EDU Chain)
const ARB_TO_EDU_BRIDGE_ADDRESS = "0x590044e628ea1B9C10a86738Cf7a7eeF52D031B8";

// --- ABIs (Copied/Deduced from SDK) ---

// Standard ERC20 ABI Snippets (Used for approval/decimals/balance checks)
const ERC20_ABI_MINIMAL = [
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)"
];

// Arb->Edu Bridge Contract ABI (Deduced from usage in bridgeEduFromArbToEdu)
const ARB_TO_EDU_BRIDGE_ABI_MINIMAL = [
    "function depositERC20(uint256 amount)"
];


// --- Bridge Class (Adapted from SDK) ---

export class SailfishBridge {
  private provider: Provider;
  // Signer might be needed by ethers methods attached to provider, but not used directly for sending
  private signer?: Signer;

  /**
   * Create a new SailfishBridge instance focused on Arb -> EDU
   * @param providerOrSigner An ethers Provider or Signer connected to Arbitrum
   */
  constructor(providerOrSigner: Provider | Signer) {
    if (
      "provider" in providerOrSigner &&
      providerOrSigner.provider !== null && // Add null check for provider
      typeof providerOrSigner.provider !== "undefined"
    ) {
      // It's a signer
      this.signer = providerOrSigner as Signer;
      this.provider = providerOrSigner.provider;
    } else {
      // It's a provider
      this.provider = providerOrSigner as Provider;
      this.signer = undefined; // Explicitly set signer to undefined
    }
     if (!this.provider) {
         throw new Error("Provider is required for SailfishBridge");
    }
  }

  // This helper isn't strictly needed now as we don't send tx, but kept for reference
  private hasSigner(): Signer {
    if (!this.signer) {
      throw new Error("Signer is required for this operation (though not used for sending here)");
    }
    return this.signer;
  }

  /**
   * Get the decimals for the EDU token on Arbitrum.
   */
  private async getEduDecimalsOnArb(): Promise<number> {
      try {
          const eduContract = new Contract(ARB_EDU_TOKEN_ADDRESS, ERC20_ABI_MINIMAL, this.provider);
          const decimals = await eduContract.decimals();
          return Number(decimals);
      } catch (error) {
          console.error("Error fetching EDU decimals on Arbitrum, defaulting to 18:", error);
          return 18; // Default fallback
      }
  }


  /**
   * Check if the user has approved the bridge contract to spend EDU tokens on Arbitrum.
   * @param ownerAddress User's wallet address.
   * @param amount Amount of EDU tokens (in human-readable format) to check approval for.
   * @returns True if the allowance is sufficient.
   */
  public async isEduApprovedOnArb(
    ownerAddress: string,
    amount: string
  ): Promise<boolean> {
    try {
        if (!ethers.isAddress(ownerAddress)) {
             throw new Error(`Invalid ownerAddress: ${ownerAddress}`);
        }
      const decimals = await this.getEduDecimalsOnArb();
      const eduContract = new Contract(ARB_EDU_TOKEN_ADDRESS, ERC20_ABI_MINIMAL, this.provider);
      const allowance = await eduContract.allowance(ownerAddress, ARB_TO_EDU_BRIDGE_ADDRESS);
      const amountBigInt = ethers.parseUnits(amount, decimals);
      console.log(`[SailfishBridge] Checking allowance for ${amount} EDU (${amountBigInt}). Owner: ${ownerAddress}, Spender: ${ARB_TO_EDU_BRIDGE_ADDRESS}. Current Allowance: ${allowance}`);
      return ethers.getBigInt(allowance) >= amountBigInt;
    } catch (error) {
      console.error("Error checking EDU allowance on Arbitrum:", error);
      // Propagate error clearly but don't throw, return false
      return false;
    }
  }

  /**
   * Prepare the transaction data to approve the maximum amount of EDU tokens
   * for the bridge contract on Arbitrum.
   * @returns Transaction data ({ to, data, value }).
   */
   public async prepareApproveEduOnArb(): Promise<TxData> {
    // No signer/provider needed to prepare the transaction data itself using Interface
    try {
      const eduInterface = new Interface(ERC20_ABI_MINIMAL);
      const data = eduInterface.encodeFunctionData("approve", [
          ARB_TO_EDU_BRIDGE_ADDRESS,
          ethers.MaxUint256
      ]);

      return {
          to: ARB_EDU_TOKEN_ADDRESS,
          data: data,
          value: '0' // Approvals don't send value
      };
    } catch (error) {
      console.error("Error preparing EDU approval transaction on Arbitrum:", error);
      throw new Error(`Failed to prepare EDU approval transaction on Arbitrum: ${(error as Error).message}`);
    }
  }

  /**
   * Prepare the transaction data to bridge (deposit) EDU tokens from Arbitrum to EDUCHAIN.
   * @param amount Amount of EDU tokens (in human-readable format) to bridge.
   * @returns Transaction data ({ to, data, value }).
   */
   public async prepareBridgeEduFromArbToEdu(
    amount: string
  ): Promise<TxData> {
    // Need provider only to get decimals
    try {
      const decimals = await this.getEduDecimalsOnArb();
      const amountBigInt = ethers.parseUnits(amount, decimals);

      // Bridge contract interface
      const bridgeInterface = new Interface(ARB_TO_EDU_BRIDGE_ABI_MINIMAL);

      // Encode the bridge transaction data (depositERC20)
      const data = bridgeInterface.encodeFunctionData("depositERC20", [amountBigInt]);

      return {
          to: ARB_TO_EDU_BRIDGE_ADDRESS,
          data: data,
          value: '0' // Standard ERC20 transfers/deposits don't send native value
      };
    } catch (error) {
      console.error(
        "Error preparing bridge transaction from Arbitrum to EDUCHAIN:",
        error
      );
      throw new Error(`Failed to prepare bridge transaction from Arbitrum to EDUCHAIN: ${(error as Error).message}`);
    }
  }

   // Optional: Include balance check if needed by agent prompt
   /**
   * Check if the user has enough EDU tokens on Arbitrum for the bridge transaction.
   * @param address User's address
   * @param amount Amount of EDU tokens to bridge (as string)
   * @returns True if the user has enough EDU tokens.
   */
  public async hasEnoughEduOnArb(
    address: string,
    amount: string
  ): Promise<boolean> {
    try {
        if (!ethers.isAddress(address)) {
             throw new Error(`Invalid address: ${address}`);
        }
       const eduContract = new Contract(
        ARB_EDU_TOKEN_ADDRESS,
        ERC20_ABI_MINIMAL,
        this.provider
      );

      let decimals: number;
      try {
        decimals = await this.getEduDecimalsOnArb();
      } catch (error) {
        console.warn("Error fetching EDU decimals on Arbitrum. Using default value of 18");
        decimals = 18; // Use number
      }

      let balance: bigint;
      try {
        balance = await eduContract.balanceOf(address);
      } catch (error) {
        console.warn('Error fetching EDU balance on Arbitrum. Using 0 as default');
        balance = 0n; // Use BigInt literal
      }
      const amountParsed = ethers.parseUnits(amount, decimals);
      console.log(`[SailfishBridge] Checking balance for ${amount} EDU (${amountParsed}). Owner: ${address}. Current Balance: ${balance}`);

      return balance >= amountParsed;
    } catch (error) {
      console.error("Error checking EDU balance on Arbitrum:", error);
      // Propagate error clearly but return false
      return false;
    }
  }
}