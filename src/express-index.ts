#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import dotenv from 'dotenv';
import type { Request, Response, NextFunction } from 'express';
import { alexaMcp } from './mcp/server.js';

dotenv.config();

const PORT = Number(process.env.PORT) || 8787;

// Create MCP server instance
const server = alexaMcp.getMcpServer();

// Create Express app with MCP SDK helper
const app = createMcpExpressApp({
  host: '0.0.0.0',
  allowedHosts: [
    'localhost',
    '127.0.0.1',
    '::1',
    '[::1]',
    'alexa-mcp-server.onrender.com',
    process.env.RENDER_EXTERNAL_HOSTNAME,
  ].filter((h): h is string => !!h),
});

// Check MCP_AUTH_TOKEN warning
if (!process.env.MCP_AUTH_TOKEN) {
  console.warn('WARNING: MCP_AUTH_TOKEN is not set. API will reject all authenticated requests.');
}

// CORS middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const { origin } = req.headers;
  const envAllowedOrigins = process.env.ALLOWED_ORIGINS || 'http://localhost';
  const allowedOrigins = envAllowedOrigins.split(',').map((o) => o.trim());

  let allowOrigin = allowedOrigins[0];
  if (origin && allowedOrigins.includes(origin)) {
    allowOrigin = origin;
  } else if (allowedOrigins.includes('*')) {
    allowOrigin = '*';
  }

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
});

// Auth middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health' || req.path === '/') {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const expectedToken = process.env.MCP_AUTH_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
});

// Store SSE transports by session ID
const sseTransports: Map<string, SSEServerTransport> = new Map();

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Alexa MCP Server',
    version: '1.3.0',
    endpoints: { sse: '/sse', messages: '/api/mcp' },
  });
});

// SSE endpoint
app.get('/sse', (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress;
  const sessionId = `sse-${randomUUID()}`;

  console.log(`[SSE] Connection attempt from ${clientIp} (session: ${sessionId})`);

  // Create SSE transport with raw Express response object
  const transport = new SSEServerTransport('/api/mcp', res);

  // Get actual session ID from transport
  const actualSessionId = (transport as any).sessionId || sessionId;

  // Store transport
  sseTransports.set(actualSessionId, transport);

  // Setup cleanup handler
  transport.onclose = () => {
    console.log(`[SSE] Transport closed for session ${actualSessionId}`);
    sseTransports.delete(actualSessionId);
  };

  console.log(`[SSE] Creating transport (session: ${actualSessionId})...`);
  server
    .connect(transport)
    .then(() => {
      console.log(`[SSE] ✅ Transport connected successfully (session: ${actualSessionId})`);
    })
    .catch((error) => {
      console.error('[SSE] ❌ Error connecting SSE transport:', error);
      sseTransports.delete(actualSessionId);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to establish SSE connection' });
      }
    });

  // Clean up on connection close
  res.on('close', () => {
    console.log(`[SSE] Connection closed (session: ${actualSessionId})`);
    if (sseTransports.has(actualSessionId)) {
      try {
        const t = sseTransports.get(actualSessionId);
        if (t) {
          t.close();
        }
      } catch {
        // Ignore cleanup errors
      }
      sseTransports.delete(actualSessionId);
    }
  });
});

// Messages endpoint
app.post('/api/mcp', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;

  if (!sessionId) {
    // Fallback: if only one active transport, use it
    const transportsArray = Array.from(sseTransports.entries());
    if (transportsArray.length === 1) {
      const [, transport] = transportsArray[0];
      await transport.handlePostMessage(req, res, req.body);
      return;
    }
    if (transportsArray.length === 0) {
      res.status(503).json({
        error: 'Transport not initialized',
        message: 'No active SSE connections. Connect to /sse first.',
      });
      return;
    }
    res.status(400).json({
      error: 'Session ID required',
      message: 'Multiple active sessions detected. Please include sessionId parameter.',
    });
    return;
  }

  const transport = sseTransports.get(sessionId);
  if (!transport) {
    res.status(404).json({
      error: 'Session not found',
      message: `No active transport found for session: ${sessionId}`,
    });
    return;
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error(`[SSE] Error handling message for session ${sessionId}:`, error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Alexa MCP Server is running on http://0.0.0.0:${PORT}`);
  console.log(`   SSE endpoint: http://0.0.0.0:${PORT}/sse`);
  console.log(`   Messages endpoint: http://0.0.0.0:${PORT}/api/mcp`);
});
