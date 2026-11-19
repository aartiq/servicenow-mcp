import { describe, it, expect } from 'vitest';
import { classifyProbe, compareVersions, inspectClientConfig } from '../../src/cli/doctor.js';

describe('doctor helpers', () => {
  it('compares versions', () => {
    expect(compareVersions('4.21.0', '5.0.0')).toBe(-1);
    expect(compareVersions('v20.11.1', '20.0.0')).toBe(1);
    expect(compareVersions('4.14.2', '4.14.2')).toBe(0);
  });

  it('recognises a healthy REST API, a hibernating PDI and other failures', () => {
    expect(classifyProbe(401, 'application/json', '{"error":{}}', '').state).toBe('up');
    expect(classifyProbe(200, 'text/html', '<html>Your instance is hibernating</html>', '').state).toBe('hibernating');
    expect(classifyProbe(302, '', '', 'https://developer.servicenow.com/dev.do#!/home?wu=true').state).toBe('hibernating');
    expect(classifyProbe(503, 'text/html', 'Service Unavailable', '').state).toBe('down');
    expect(classifyProbe(302, '', '', 'https://login.example.com/sso').state).toBe('unexpected');
  });

  it('finds the nowaikit entry in a client config and checks its script exists', () => {
    const ok = inspectClientConfig(JSON.stringify({ mcpServers: { nowaikit: { command: 'npx', args: ['-y', 'nowaikit'] } } }), 'mcpServers');
    expect(ok).toMatchObject({ found: true, launch: 'npx -y nowaikit' });
    const missing = inspectClientConfig(JSON.stringify({ mcpServers: { servicenow: { command: 'node', args: ['/nope/dist/server.js'] } } }), 'mcpServers');
    expect(missing.problem).toMatch(/does not exist/);
    expect(inspectClientConfig(JSON.stringify({ servers: { nowaikit: { url: 'https://mcp.nowaikit.com/mcp' } } }), 'servers')).toMatchObject({ found: true });
    expect(inspectClientConfig('{ broken', 'mcpServers').problem).toMatch(/not valid JSON/);
    expect(inspectClientConfig(JSON.stringify({ mcpServers: { other: { command: 'x' } } }), 'mcpServers').found).toBe(false);
  });
});

describe('doctor tool-list cost', () => {
  it('flags a client that lists the full catalog and not one using lean or a package', () => {
    const full = inspectClientConfig(JSON.stringify({ mcpServers: { nowaikit: { command: 'npx', args: ['-y', 'nowaikit'] } } }), 'mcpServers');
    expect(full.fullToolList).toBe(true);
    const lean = inspectClientConfig(JSON.stringify({ mcpServers: { nowaikit: { command: 'npx', args: ['-y', 'nowaikit'], env: { MCP_TOOL_DISCOVERY: 'lean' } } } }), 'mcpServers');
    expect(lean.fullToolList).toBe(false);
    const flag = inspectClientConfig(JSON.stringify({ mcpServers: { nowaikit: { command: 'npx', args: ['-y', 'nowaikit', '--lean'] } } }), 'mcpServers');
    expect(flag.fullToolList).toBe(false);
  });
});
