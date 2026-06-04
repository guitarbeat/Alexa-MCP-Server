import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { bedroomApp } from './api/v1/bedroom';
import { announceApp } from './api/v1/announce';
import { musicApp } from './api/v1/music';
import { lightsApp } from './api/v1/lights';
import { volumeApp } from './api/v1/volume';
import { sensorsApp } from './api/v1/sensors';
import { dndApp } from './api/v1/dnd';
import { HomeIOMCP } from './mcp/server';
import { VERSION } from './constants';
import { Env } from './types/env';

// Store active transports in memory
const transports = new Map<string, SSEServerTransport>();

/**
 * Creates and configures the main Hono application.
 */
export function createServer() {
  const app = new Hono<{ Bindings: Env }>();

  app.use('*', cors());

  // Health check
  app.get('/health', (c) => c.json({ status: 'healthy', timestamp: new Date().toISOString() }));

  app.get('/', (c) =>
    c.json({
      name: 'Alexa MCP Server',
      version: VERSION,
      endpoints: { api: '/api', mcp: '/mcp', sse: '/sse' },
    }),
  );

  // API Routes
  const api = new Hono<{ Bindings: Env }>();
  api.route('/bedroom', bedroomApp);
  api.route('/announce', announceApp);
  api.route('/music', musicApp);
  api.route('/lights', lightsApp);
  api.route('/volume', volumeApp);
  api.route('/sensors', sensorsApp);
  api.route('/dnd', dndApp);
  app.route('/api', api);

  // --- MCP Integration ---

  app.get('/sse', async (c) => {
    const mcp = new HomeIOMCP(c.env as unknown as Env);
    const mcpServer = mcp.getMcpServer();

    // In @hono/node-server, raw Node req/res are in c.env
    const envObj = c.env as Record<string, unknown>;
    const rawRes = envObj.outgoing as import('http').ServerResponse | undefined;
    const rawReq = envObj.incoming as import('http').IncomingMessage | undefined;

    if (!rawRes || !rawReq) {
      return c.text('SSE transport requires a Node.js environment (Hono node-server)', 500);
    }

    console.log('Creating new SSE transport...');
    const transport = new SSEServerTransport('/api/mcp', rawRes);
    await mcpServer.connect(transport);

    const { sessionId } = transport;
    console.log(`SSE connection established. Session: ${sessionId}`);

    transports.set(sessionId, transport);

    rawReq.on('close', () => {
      console.log(`SSE connection closed for session: ${sessionId}`);
      transports.delete(sessionId);
    });

    // We return a null body because transport.start() (via connect) handles the response headers and body
    return new Response(null);
  });

  app.post('/api/mcp', async (c) => {
    const sessionId = c.req.query('sessionId');
    if (!sessionId) {
      return c.text('Missing sessionId', 400);
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      console.error(`Session not found: ${sessionId}`);
      return c.text('Session not found', 404);
    }

    const envObj = c.env as Record<string, unknown>;
    const rawReq = envObj.incoming as import('http').IncomingMessage | undefined;
    const rawRes = envObj.outgoing as import('http').ServerResponse | undefined;

    if (!rawReq || !rawRes) {
      return c.text('POST hand-off requires a Node.js environment', 500);
    }

    await transport.handlePostMessage(rawReq, rawRes);
    return new Response(null);
  });

  return app;
}
