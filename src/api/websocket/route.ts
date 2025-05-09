// src/app/api/websocket/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  try {
    // Set up real-time subscription
    const channel = supabase
      .channel('canvas')
      .on('broadcast', { event: 'draw' }, (payload) => {
        // Handle drawing events
        console.log('Draw event received:', payload);
        // Since this is a server-side component, we're just logging the events
        // The actual handling happens on the client side
      })
      .on('broadcast', { event: 'text' }, (payload) => {
        // Handle text events
        console.log('Text event received:', payload);
        // Since this is a server-side component, we're just logging the events
        // The actual handling happens on the client side
      })
      .subscribe();

    // Since we're in a serverless environment, we need to return a response
    // before the channel subscription can be used for long
    return NextResponse.json({
      success: true,
      message: `WebSocket connection initialized for user ${userId}`,
      channel: 'canvas'
    });
  } catch (error) {
    console.error('Error setting up WebSocket:', error);
    return NextResponse.json({ error: 'Failed to set up WebSocket' }, { status: 500 });
  }
}