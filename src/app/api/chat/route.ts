import { Anthropic } from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { BridgeMCP } from '@/mcp/bridge';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type BridgeAction = 'approve' | 'deposit' | 'withdraw';

const SYSTEM_PROMPTS = {
  bridging: `You are the Bridging Agent in Lilikoi, a DeFi AI assistant specialized in helping users bridge EDU tokens between Arbitrum and EDU Chain.

Available actions:
1. approve(address, amount) - Approve EDU tokens for bridging
2. deposit(address, amount) - Deposit EDU tokens from Arbitrum to EDU Chain
3. withdraw(address, amount) - Withdraw EDU tokens from EDU Chain to Arbitrum

For each user request:
1. Analyze if they want to perform a bridge operation
2. Extract the amount if specified
3. Determine the appropriate action (approve, deposit, or withdraw)
4. Explain what you're going to do before doing it
5. Execute the action and report results

Remember to:
- Always approve before deposit/withdraw
- Verify amounts are valid numbers
- Handle errors gracefully
- Explain each step to the user
- Inform users that only EDU tokens are supported by the bridge`,
};

export async function POST(request: Request) {
  try {
    const { agentId, userMessage, address, forceAction } = await request.json();
    console.log('API Request:', { agentId, userMessage, address, forceAction });

    // Get agent response from Claude
    const response = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 4096,
      system: SYSTEM_PROMPTS[agentId as keyof typeof SYSTEM_PROMPTS] || '',
      messages: [
        {
          role: 'user',
          content: `User's wallet address is ${address}. Help them with their request: ${userMessage}`,
        },
      ],
    });

    const assistantMessage = response.content[0].type === 'text' ? response.content[0].text : 'I encountered an error processing your request.';
    console.log('Claude Response:', assistantMessage);

    // If this is the bridging agent, check if we need to execute any bridge operations
    if (agentId === 'bridging') {
      const content = assistantMessage.toLowerCase();
      const userMessageLower = userMessage.toLowerCase();

      // Extract amount from the message if present
      const amountMatch = userMessage.match(/\d+(\.\d+)?/);
      const amount = amountMatch ? amountMatch[0] : '';
      console.log('Extracted amount:', amount);

      if (amount && address) {
        // Use forceAction if provided, otherwise detect from content
        let action: BridgeAction | '' = forceAction as BridgeAction || '';
        
        if (!action) {
          if (content.includes('approve')) {
            action = 'approve';
          } else if (content.includes('deposit')) {
            action = 'deposit';
          } else if (content.includes('withdraw')) {
            action = 'withdraw';
          }
        }

        console.log('Action to execute:', action);

        if (action) {
          // Call the bridge API to get transaction data
          try {
            console.log('Calling Bridge MCP with:', { action, address, amount });
            const bridgeResult = await BridgeMCP[action](address, amount);
            console.log('Bridge MCP result:', JSON.stringify(bridgeResult, null, 2));

            if (bridgeResult.error) {
              console.error('Bridge error:', bridgeResult.error);
              return NextResponse.json({
                content: assistantMessage + `\n\nI encountered an error while trying to ${action}: ${bridgeResult.error}`,
              });
            }

            // Return the assistant message and transaction data
            console.log('Sending transaction data to client:', JSON.stringify(bridgeResult.data, null, 2));
            return NextResponse.json({
              content: assistantMessage,
              transactionData: bridgeResult.data,
              action: action
            });
          } catch (error) {
            console.error(`Error executing ${action}:`, error);
            return NextResponse.json({
              content: assistantMessage + `\n\nI encountered an error while trying to ${action}.`,
            });
          }
        }
      }
    }

    return NextResponse.json({
      content: assistantMessage
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 