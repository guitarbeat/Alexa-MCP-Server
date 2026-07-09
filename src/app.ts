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

  // In Cloudflare Workers, we would check c.env.MCP_AUTH_TOKEN
  // We'll log a warning at startup in node environments
  if (typeof process !== 'undefined' && process.env && !process.env.MCP_AUTH_TOKEN) {
    console.warn('WARNING: MCP_AUTH_TOKEN is not set. API will reject all authenticated requests.');
  }

  app.use('*', async (c, next) => {
    const origin = c.req.header('Origin');

    // Get allowed origins from request env or process.env
    const envAllowedOrigins =
      (c.env?.ALLOWED_ORIGINS as string) ||
      (typeof process !== 'undefined' ? process.env.ALLOWED_ORIGINS : undefined) ||
      'http://localhost';
    const allowedOrigins = envAllowedOrigins.split(',').map((o) => o.trim());

    let allowOrigin = allowedOrigins[0]; // Default to first
    if (origin && allowedOrigins.includes(origin)) {
      allowOrigin = origin;
    } else if (allowedOrigins.includes('*')) {
      allowOrigin = '*';
    }

    const corsMiddleware = cors({
      origin: allowOrigin,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    });
    return corsMiddleware(c, next);
  });

  // Auth Middleware
  app.use('*', async (c, next) => {
    const path = new URL(c.req.url).pathname;

    // Skip auth for health and root endpoints
    if (path === '/health' || path === '/') {
      return next();
    }

    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    const expectedToken =
      (c.env?.MCP_AUTH_TOKEN as string) ||
      (typeof process !== 'undefined' ? process.env.MCP_AUTH_TOKEN : undefined);

    if (!expectedToken || token !== expectedToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return next();
  });

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
