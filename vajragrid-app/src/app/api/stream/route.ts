import { ensureDetectionPipeline } from '@/lib/detection/pipeline';
import { subscribe } from '@/lib/events/EventBus';
import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  ensureDetectionPipeline();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send current simulation state on connect
      const engine = getSimulationEngine();
      const initMsg = `data: ${JSON.stringify({ type: 'simulation_state', data: engine.getState() })}\n\n`;
      controller.enqueue(encoder.encode(initMsg));

      const unsubscribe = subscribe((type, data) => {
        try {
          const msg = `data: ${JSON.stringify({ type, data })}\n\n`;
          controller.enqueue(encoder.encode(msg));
        } catch {
          unsubscribe();
          controller.close();
        }
      });

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 15000);

      // Cleanup when client disconnects
      const checkClosed = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(''));
        } catch {
          clearInterval(checkClosed);
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 5000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
