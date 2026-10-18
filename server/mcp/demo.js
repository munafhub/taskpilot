// Run: npm run mcp:demo  — connects the custom client to the MCP server and exercises it.
import { serverClient } from './client.js';

const client = serverClient();
const info = await client.connect();
console.log('connected to', info.serverInfo, 'protocol', info.protocolVersion);
console.log('resources:', (await client.listResources()).map((r) => r.uri));
console.log('tools:', (await client.listTools()).map((t) => t.name));
const created = await client.callTool('create_task', { title: 'Created over MCP', priority: 'high' });
console.log('create_task ->', created.id, created.title);
const tasks = JSON.parse(await client.readResource('taskpilot://tasks'));
console.log('resource now holds', tasks.length, 'tasks');
try {
  await client.callTool('create_task', {});
} catch (err) {
  console.log('bad call reports a helpful error ->', err.message);
}
client.close();
