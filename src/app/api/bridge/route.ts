import { NextResponse } from 'next/server';
import { BridgeMCP } from '@/mcp/bridge';

export async function POST(request: Request) {
  try {
    const { action, address, amount } = await request.json();

    let result;
    switch (action) {
      case 'approve':
        result = await BridgeMCP.approve(address, amount);
        break;
      case 'deposit':
        result = await BridgeMCP.deposit(address, amount);
        break;
      case 'withdraw':
        result = await BridgeMCP.withdraw(address, amount);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in bridge operation:', error);
    return NextResponse.json(
      { error: 'Failed to process bridge operation' },
      { status: 500 }
    );
  }
} 