import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSecurityToolCall } from '../../src/tools/security.js';

const mockClient: any = {
  createRecord: vi.fn(),
  getRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WRITE_ENABLED;
});

describe('Security Operations tools', () => {
  describe('create_security_incident', () => {
    it('throws when write is disabled', async () => {
      await expect(
        executeSecurityToolCall(mockClient, 'create_security_incident', {
          short_description: 'Ransomware detected',
          category: 'Malware',
        })
      ).rejects.toThrow('Write operations are disabled');
    });

    it('creates security incident when write enabled', async () => {
      process.env.WRITE_ENABLED = 'true';
      mockClient.createRecord.mockResolvedValue({ sys_id: 'sec001', number: 'SIR0001' });
      const result = await executeSecurityToolCall(mockClient, 'create_security_incident', {
        short_description: 'Ransomware detected on server',
        category: 'Malware',
        severity: 1,
      });
      expect(result.number).toBe('SIR0001');
      expect(mockClient.createRecord).toHaveBeenCalledWith('sn_si_incident', expect.objectContaining({
        category: 'Malware',
      }));
    });
  });

  describe('list_security_incidents', () => {
    it('lists all with no filter', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 3, records: [] });
      await executeSecurityToolCall(mockClient, 'list_security_incidents', {});
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sn_si_incident',
      }));
    });

    it('applies severity filter', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 1, records: [] });
      await executeSecurityToolCall(mockClient, 'list_security_incidents', { severity: 1 });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        query: 'severity=1',
      }));
    });
  });

  describe('list_vulnerabilities', () => {
    it('lists vulnerabilities with state filter', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 5, records: [] });
      await executeSecurityToolCall(mockClient, 'list_vulnerabilities', { state: 'open', severity: 'critical' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sn_vul_entry',
        query: 'state=open^severity=critical',
      }));
    });
  });

  describe('get_threat_intelligence', () => {
    it('throws when query is missing', async () => {
      await expect(
        executeSecurityToolCall(mockClient, 'get_threat_intelligence', {})
      ).rejects.toThrow('query is required');
    });

    it('searches threat intel by value', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 1, records: [{ value: '192.168.1.1' }] });
      await executeSecurityToolCall(mockClient, 'get_threat_intelligence', { query: '192.168.1.1' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sn_ti_observable',
        query: 'valueCONTAINS192.168.1.1',
      }));
    });

    it('applies type filter when provided', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] });
      await executeSecurityToolCall(mockClient, 'get_threat_intelligence', { query: '1.2.3.4', type: 'ip_address' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        query: 'type=ip_address^valueCONTAINS1.2.3.4',
      }));
    });
  });

  describe('unknown tool', () => {
    it('returns null for unrecognised tool', async () => {
      const result = await executeSecurityToolCall(mockClient, 'not_a_real_tool', {});
      expect(result).toBeNull();
    });
  });
});
