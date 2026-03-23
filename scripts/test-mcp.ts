#!/usr/bin/env node
/**
 * Simple MCP Tool Tester
 * Tests the alexa-mcp-server tools via the SSE transport
 */

import { EventSource } from 'eventsource';

const BASE_URL = process.env.MCP_URL || 'http://localhost:8787';

async function main() {
  console.log(`Connecting to ${BASE_URL}/sse...`);

  const es = new EventSource(`${BASE_URL}/sse`);
  const responses: Record<string, unknown> = {};
  let postUrl = '';

  // Listen for message events (MCP responses come through here)
  es.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data) as Record<string, unknown>;
      console.log('\n📥 SSE Response:', JSON.stringify(data, null, 2));
      if (data.id) {
        responses[data.id as string] = data;
      }
    } catch {
      console.log('\n📥 SSE Message:', event.data);
    }
  });

  es.addEventListener('endpoint', async (event) => {
    const endpointData = event.data;
    const sessionId = endpointData.split('sessionId=')[1];
    console.log(`✅ Connected! Session: ${sessionId}`);

    postUrl = `${BASE_URL}${endpointData}`;

    // Initialize
    console.log('\n📤 Sending initialize...');
    await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });

    // Wait for response
    await new Promise((r) => {
      setTimeout(r, 1000);
    });

    // Send initialized notification
    await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    // List tools
    console.log('\n📤 Listing tools...');
    await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      }),
    });

    // Wait for response
    await new Promise((r) => {
      setTimeout(r, 2000);
    });

    // Test list_smart_home_devices
    console.log('\n📤 Calling list_smart_home_devices...');
    await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'list_smarthome_devices',
          arguments: {},
        },
      }),
    });

    // Wait for response
    await new Promise((r) => {
      setTimeout(r, 5000);
    });

    console.log('\n\n=== Summary ===');
    console.log('Responses received:', Object.keys(responses).length);

    es.close();
    process.exit(0);
  });

  es.onerror = (err) => {
    console.error('SSE Error:', err);
  };

  // Timeout after 30 seconds
  setTimeout(() => {
    console.log('\n⏱️ Timeout - closing connection');
    console.log('Responses received:', Object.keys(responses).length);
    es.close();
    process.exit(0);
  }, 30000);
}

main();
