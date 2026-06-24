import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeCmdbReconciliationToolCall,
  getCmdbReconciliationToolDefinitions,
} from '../../src/tools/cmdb-reconciliation.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  callNowAssist: vi.fn(),
  batchRequest: vi.fn(),
  executeScript: vi.fn(),
} as unknown as ServiceNowClient;

describe('getCmdbReconciliationToolDefinitions', () => {
  it('returns 4 CMDB reconciliation tools', () => {
    const tools = getCmdbReconciliationToolDefinitions();
    expect(tools).toHaveLength(4);
    const names = tools.map(t => t.name);
    expect(names).toContain('cmdb_find_duplicates');
    expect(names).toContain('cmdb_find_orphans');
    expect(names).toContain('cmdb_find_stale');
    expect(names).toContain('cmdb_reconcile');
  });
});

describe('executeCmdbReconciliationToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.CMDB_WRITE_ENABLED = 'true';
  });

  it('returns null for unmatched tool names', async () => {
    const result = await executeCmdbReconciliationToolCall(mockClient, 'unknown_tool', {});
    expect(result).toBeNull();
  });

  describe('cmdb_find_duplicates', () => {
    it('finds CIs with matching fields', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 4,
        records: [
          { sys_id: 'a1', name: 'Web Server', sys_class_name: 'cmdb_ci_server', serial_number: 'SN001', ip_address: '10.0.0.1' },
          { sys_id: 'a2', name: 'Web Server', sys_class_name: 'cmdb_ci_server', serial_number: 'SN001', ip_address: '10.0.0.1' },
          { sys_id: 'b1', name: 'DB Server', sys_class_name: 'cmdb_ci_server', serial_number: 'SN002', ip_address: '10.0.0.2' },
          { sys_id: 'b2', name: 'DB Server', sys_class_name: 'cmdb_ci_server', serial_number: 'SN002', ip_address: '10.0.0.2' },
        ],
      });

      const result = await executeCmdbReconciliationToolCall(mockClient, 'cmdb_find_duplicates', {});

      expect(result.scanned).toBe(4);
      expect(result.duplicate_groups).toBe(2);
      expect(result.duplicates[0].count).toBe(2);
      expect(result.ci_class).toBe('cmdb_ci');
    });

    it('uses custom match fields and CI class', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 2,
        records: [
          { sys_id: 'x1', name: 'App1', sys_class_name: 'cmdb_ci_appl', host_name: 'host1' },
          { sys_id: 'x2', name: 'App1', sys_class_name: 'cmdb_ci_appl', host_name: 'host1' },
        ],
      });

      const result = await executeCmdbReconciliationToolCall(mockClient, 'cmdb_find_duplicates', {
        ci_class: 'cmdb_ci_appl',
        match_fields: ['name', 'host_name'],
      });

      expect(result.ci_class).toBe('cmdb_ci_appl');
      expect(result.match_fields).toEqual(['name', 'host_name']);
      expect(result.duplicate_groups).toBe(1);
      expect(mockClient.queryRecords).toHaveBeenCalledWith(
        expect.objectContaining({ table: 'cmdb_ci_appl' })
      );
    });

    it('skips records where all match fields are empty', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 3,
        records: [
          { sys_id: 'a1', name: '', sys_class_name: 'cmdb_ci', serial_number: '', ip_address: '' },
          { sys_id: 'a2', name: '', sys_class_name: 'cmdb_ci', serial_number: '', ip_address: '' },
          { sys_id: 'b1', name: 'Server', sys_class_name: 'cmdb_ci', serial_number: 'SN1', ip_address: '10.0.0.1' },
        ],
      });

      const result = await executeCmdbReconciliationToolCall(mockClient, 'cmdb_find_duplicates', {});

      // Empty-field records should be skipped, leaving only 1 unique non-empty record — no duplicates
      expect(result.duplicate_groups).toBe(0);
    });
  });

  describe('cmdb_find_orphans', () => {
    it('finds CIs with no relationships', async () => {
      // First call: get CIs
      (mockClient.queryRecords as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          count: 2,
          records: [
            { sys_id: 'ci1', name: 'Orphan Server', sys_class_name: 'cmdb_ci_server', operational_status: '1' },
            { sys_id: 'ci2', name: 'Connected Server', sys_class_name: 'cmdb_ci_server', operational_status: '1' },
          ],
        })
        // Second call: relationship check for ci1 — no relationships
        .mockResolvedValueOnce({ count: 0, records: [] })
        // Third call: relationship check for ci2 — has relationships
        .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'rel1' }] });

      const result = await executeCmdbReconciliationToolCall(mockClient, 'cmdb_find_orphans', {});

      expect(result.orphan_count).toBe(1);
      expect(result.orphans[0].sys_id).toBe('ci1');
      expect(result.orphans[0].name).toBe('Orphan Server');
      expect(result.scanned).toBe(2);
    });

    it('uses custom CI class and limit', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ count: 0, records: [] });

      await executeCmdbReconciliationToolCall(mockClient, 'cmdb_find_orphans', {
        ci_class: 'cmdb_ci_linux_server',
        limit: 10,
      });

      expect(mockClient.queryRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'cmdb_ci_linux_server',
          limit: 10,
        })
      );
    });
  });

  describe('cmdb_find_stale', () => {
    it('finds CIs not updated in N days', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 3,
        records: [
          { sys_id: 's1', name: 'Old Server', sys_updated_on: '2024-01-01', operational_status: '1' },
          { sys_id: 's2', name: 'Ancient DB', sys_updated_on: '2023-06-15', operational_status: '1' },
          { sys_id: 's3', name: 'Forgotten App', sys_updated_on: '2023-03-01', operational_status: '1' },
        ],
      });

      const result = await executeCmdbReconciliationToolCall(mockClient, 'cmdb_find_stale', {
        days_threshold: 60,
      });

      expect(result.days_threshold).toBe(60);
      expect(result.stale_count).toBe(3);
      expect(result.stale_cis).toHaveLength(3);
      expect(mockClient.queryRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('gs.daysAgo(60)'),
        })
      );
    });

    it('uses default 90-day threshold', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });

      const result = await executeCmdbReconciliationToolCall(mockClient, 'cmdb_find_stale', {});

      expect(result.days_threshold).toBe(90);
      expect(mockClient.queryRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('gs.daysAgo(90)'),
        })
      );
    });
  });

  describe('cmdb_reconcile', () => {
    it('returns planned actions in dry_run mode', async () => {
      const result = await executeCmdbReconciliationToolCall(mockClient, 'cmdb_reconcile', {
        action: 'retire_stale',
        targets: ['id1', 'id2'],
        dry_run: true,
      });

      expect(result.dry_run).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe('dry_run');
      expect(result.results[0].action).toBe('retire');
      expect(mockClient.updateRecord).not.toHaveBeenCalled();
    });

    it('defaults to dry_run when not explicitly set to false', async () => {
      const result = await executeCmdbReconciliationToolCall(mockClient, 'cmdb_reconcile', {
        action: 'remove_orphans',
        targets: ['id1'],
      });

      expect(result.dry_run).toBe(true);
      expect(result.results[0].status).toBe('dry_run');
    });

    it('executes retire_stale when dry_run=false', async () => {
      (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'id1' });

      const result = await executeCmdbReconciliationToolCall(mockClient, 'cmdb_reconcile', {
        action: 'retire_stale',
        targets: ['id1'],
        dry_run: false,
      });

      expect(result.dry_run).toBe(false);
      expect(result.results[0].status).toBe('completed');
      expect(mockClient.updateRecord).toHaveBeenCalledWith('cmdb_ci', 'id1', {
        operational_status: 6,
        install_status: 7,
      });
    });

    it('merge_duplicates keeps the first target as survivor', async () => {
      const result = await executeCmdbReconciliationToolCall(mockClient, 'cmdb_reconcile', {
        action: 'merge_duplicates',
        targets: ['survivor', 'dup1', 'dup2'],
        dry_run: true,
      });

      expect(result.results).toHaveLength(3);
      expect(result.results[0].sys_id).toBe('survivor');
      expect(result.results[0].action).toBe('keep');
      expect(result.results[1].action).toBe('retire');
      expect(result.results[2].action).toBe('retire');
    });

    it('merge_duplicates throws when only one target provided', async () => {
      await expect(
        executeCmdbReconciliationToolCall(mockClient, 'cmdb_reconcile', {
          action: 'merge_duplicates',
          targets: ['only_one'],
          dry_run: false,
        })
      ).rejects.toThrow('at least 2 targets');
    });

    it('requires CMDB write permissions', async () => {
      delete process.env.CMDB_WRITE_ENABLED;

      await expect(
        executeCmdbReconciliationToolCall(mockClient, 'cmdb_reconcile', {
          action: 'retire_stale',
          targets: ['id1'],
        })
      ).rejects.toThrow('CMDB write operations are disabled');
    });

    it('requires WRITE_ENABLED too', async () => {
      delete process.env.WRITE_ENABLED;

      await expect(
        executeCmdbReconciliationToolCall(mockClient, 'cmdb_reconcile', {
          action: 'retire_stale',
          targets: ['id1'],
        })
      ).rejects.toThrow('Write operations are disabled');
    });

    it('throws for invalid action', async () => {
      await expect(
        executeCmdbReconciliationToolCall(mockClient, 'cmdb_reconcile', {
          action: 'invalid_action',
          targets: ['id1'],
        })
      ).rejects.toThrow('Invalid action');
    });

    it('throws when targets is empty', async () => {
      await expect(
        executeCmdbReconciliationToolCall(mockClient, 'cmdb_reconcile', {
          action: 'retire_stale',
          targets: [],
        })
      ).rejects.toThrow('targets must be a non-empty array');
    });
  });
});
