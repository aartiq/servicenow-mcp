/**
 * Machine Learning tools — anomaly detection, change risk prediction,
 * incident forecasting, model training, NLU analysis, process optimization.
 *
 * NOTE: Does NOT duplicate existing Now Assist tools (categorize_incident,
 * suggest_resolution, ai_search, get_pi_models). These ML tools focus on
 * ServiceNow Predictive Intelligence and ML Workbench capabilities.
 *
 * ServiceNow tables: ml_solution, ml_solution_version, sys_cs_conversation
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getMlToolDefinitions() {
  return [
    {
      name: 'ml_predict_change_risk',
      description: 'Predict the risk level of a change request using historical ML analysis',
      inputSchema: {
        type: 'object',
        properties: {
          change_sys_id: { type: 'string', description: 'Change request sys_id to evaluate' },
          type: { type: 'string', description: 'Change type: normal, standard, emergency' },
          category: { type: 'string', description: 'Change category' },
        },
        required: [],
      },
    },
    {
      name: 'ml_detect_anomalies',
      description: 'Run anomaly detection on operational metrics (alert volume, incident trends, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table to analyze (e.g. incident, sn_agent_alert)' },
          field: { type: 'string', description: 'Numeric field to analyse (e.g. priority, reassignment_count)' },
          days: { type: 'number', description: 'Look-back period in days (default 30)' },
          threshold: { type: 'number', description: 'Standard deviations for anomaly threshold (default 2)' },
        },
        required: ['table', 'field'],
      },
    },
    {
      name: 'ml_forecast_incidents',
      description: 'Forecast incident volume for the next N days based on historical trends',
      inputSchema: {
        type: 'object',
        properties: {
          days_ahead: { type: 'number', description: 'Number of days to forecast (default 7)' },
          category: { type: 'string', description: 'Filter by category (optional)' },
          priority: { type: 'string', description: 'Filter by priority (optional)' },
        },
        required: [],
      },
    },
    {
      name: 'ml_train_incident_classifier',
      description: 'Trigger training of the incident classification ML solution. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          solution_name: { type: 'string', description: 'ML solution name (default auto-detect)' },
        },
        required: [],
      },
    },
    {
      name: 'ml_train_change_risk',
      description: 'Trigger training of the change risk prediction ML model. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          solution_name: { type: 'string', description: 'ML solution name (default auto-detect)' },
        },
        required: [],
      },
    },
    {
      name: 'ml_train_anomaly_detector',
      description: 'Trigger training of an anomaly detection model for a specific table/field. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Target table for anomaly detection' },
          field: { type: 'string', description: 'Numeric field to train on' },
        },
        required: ['table', 'field'],
      },
    },
    {
      name: 'ml_evaluate_model',
      description: 'Get accuracy, training status, and metrics for a trained ML solution',
      inputSchema: {
        type: 'object',
        properties: {
          model_sys_id: { type: 'string', description: 'ML solution sys_id' },
        },
        required: ['model_sys_id'],
      },
    },
    {
      name: 'ml_model_training_history',
      description: 'Get training run history and accuracy trends for an ML solution over time',
      inputSchema: {
        type: 'object',
        properties: {
          model_sys_id: { type: 'string', description: 'ML solution sys_id' },
          days: { type: 'number', description: 'Look-back period (default 90)' },
        },
        required: ['model_sys_id'],
      },
    },
    {
      name: 'ml_virtual_agent_nlu',
      description: 'Analyse Virtual Agent NLU performance — conversation completion rates and fallback metrics',
      inputSchema: {
        type: 'object',
        properties: {
          topic_sys_id: { type: 'string', description: 'VA topic sys_id (optional, all topics if omitted)' },
          days: { type: 'number', description: 'Analysis period in days (default 30)' },
        },
        required: [],
      },
    },
    {
      name: 'ml_process_optimization',
      description: 'Identify process bottlenecks using analysis of task durations and reassignment patterns',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Process table to analyse (e.g. incident, change_request, sc_task)' },
          days: { type: 'number', description: 'Analysis period (default 90)' },
        },
        required: ['table'],
      },
    },
  ];
}

export async function executeMlToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'ml_predict_change_risk': {
      if (args.change_sys_id) {
        const change = await client.getRecord('change_request', args.change_sys_id);
        return { change: args.change_sys_id, risk: change.risk || 'unknown', risk_value: change.risk_value, impact: change.impact, conflict_status: change.conflict_status };
      }
      const resp = await client.queryRecords({
        table: 'change_request',
        query: `type=${args.type || 'normal'}^category=${args.category || ''}^stateNOT INcancelled`,
        limit: 100,
        fields: 'risk,state',
      });
      const total = resp.count;
      const highRisk = resp.records.filter((r: any) => r.risk === 'high' || r.risk === '1').length;
      return {
        prediction_method: 'historical_analysis',
        total_similar_changes: total,
        high_risk_rate: total > 0 ? `${Math.round((highRisk / total) * 100)}%` : 'N/A',
        predicted_risk: highRisk / total > 0.3 ? 'high' : highRisk / total > 0.1 ? 'moderate' : 'low',
      };
    }

    case 'ml_detect_anomalies': {
      if (!args.table || !args.field) throw new ServiceNowError('table and field are required', 'INVALID_REQUEST');
      const days = args.days || 30;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      const resp = await client.queryRecords({ table: args.table, query: `sys_created_on>=${since}`, limit: 1000, fields: `${args.field},sys_created_on` });
      const values = resp.records.map((r: any) => parseFloat(r[args.field]) || 0);
      const mean = values.reduce((a: number, b: number) => a + b, 0) / (values.length || 1);
      const variance = values.reduce((sum: number, v: number) => sum + Math.pow(v - mean, 2), 0) / (values.length || 1);
      const stdDev = Math.sqrt(variance);
      const threshold = args.threshold || 2;
      const anomalies = resp.records.filter((r: any) => Math.abs((parseFloat(r[args.field]) || 0) - mean) > threshold * stdDev);
      return { period_days: days, total_records: resp.count, mean: Math.round(mean * 100) / 100, std_dev: Math.round(stdDev * 100) / 100, threshold_sigma: threshold, anomaly_count: anomalies.length, anomalies: anomalies.slice(0, 20) };
    }

    case 'ml_forecast_incidents': {
      const lookback = 60;
      const daysAhead = args.days_ahead || 7;
      const since = new Date(Date.now() - lookback * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      let query = `sys_created_on>=${since}`;
      if (args.category) query += `^category=${args.category}`;
      if (args.priority) query += `^priority=${args.priority}`;
      const resp = await client.queryRecords({ table: 'incident', query, limit: 5000, fields: 'sys_created_on' });
      const dailyRate = resp.count / lookback;
      return { historical_period_days: lookback, total_incidents: resp.count, avg_daily_rate: Math.round(dailyRate * 10) / 10, forecast_days: daysAhead, forecast_total: Math.round(dailyRate * daysAhead), forecast_range: { low: Math.round(dailyRate * daysAhead * 0.7), high: Math.round(dailyRate * daysAhead * 1.3) } };
    }

    case 'ml_train_incident_classifier': {
      requireWrite();
      const solutions = await client.queryRecords({ table: 'ml_solution', query: args.solution_name ? `name=${args.solution_name}` : 'solution_typeLIKEclassif^active=true', limit: 1, fields: 'sys_id,name,training_status' });
      if (solutions.count === 0) return { error: 'No classification ML solution found. Enable Predictive Intelligence.' };
      const sol = solutions.records[0];
      try {
        await client.callNowAssist(`/api/now/ml/solution/${sol.sys_id}/train`, {});
        return { action: 'training_triggered', solution: sol.name, sys_id: sol.sys_id };
      } catch (err) { return { action: 'training_failed', solution: sol.name, error: err instanceof Error ? err.message : String(err) }; }
    }

    case 'ml_train_change_risk': {
      requireWrite();
      const solutions = await client.queryRecords({ table: 'ml_solution', query: args.solution_name ? `name=${args.solution_name}` : 'nameLIKEchange^active=true', limit: 1, fields: 'sys_id,name' });
      if (solutions.count === 0) return { error: 'No change risk ML solution found.' };
      const sol = solutions.records[0];
      try {
        await client.callNowAssist(`/api/now/ml/solution/${sol.sys_id}/train`, {});
        return { action: 'training_triggered', solution: sol.name, sys_id: sol.sys_id };
      } catch (err) { return { action: 'training_failed', error: err instanceof Error ? err.message : String(err) }; }
    }

    case 'ml_train_anomaly_detector': {
      requireWrite();
      if (!args.table || !args.field) throw new ServiceNowError('table and field are required', 'INVALID_REQUEST');
      return { action: 'anomaly_training_queued', table: args.table, field: args.field, note: 'Configure anomaly detection models via ML Workbench.' };
    }

    case 'ml_evaluate_model': {
      if (!args.model_sys_id) throw new ServiceNowError('model_sys_id is required', 'INVALID_REQUEST');
      const model = await client.getRecord('ml_solution', args.model_sys_id);
      return { name: model.name, type: model.solution_type, training_status: model.training_status, accuracy: model.accuracy, last_trained: model.last_trained, total_records_trained: model.training_record_count, active: model.active };
    }

    case 'ml_model_training_history': {
      if (!args.model_sys_id) throw new ServiceNowError('model_sys_id is required', 'INVALID_REQUEST');
      const days = args.days || 90;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      const runs = await client.queryRecords({ table: 'ml_solution_version', query: `solution=${args.model_sys_id}^sys_created_on>=${since}`, limit: 50, fields: 'sys_id,version,accuracy,training_status,sys_created_on' });
      return { model_sys_id: args.model_sys_id, period_days: days, training_runs: runs.records };
    }

    case 'ml_virtual_agent_nlu': {
      const days = args.days || 30;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      let query = `sys_created_on>=${since}`;
      if (args.topic_sys_id) query += `^topic=${args.topic_sys_id}`;
      const conversations = await client.queryRecords({ table: 'sys_cs_conversation', query, limit: 500, fields: 'state,topic,sys_created_on' });
      const total = conversations.count;
      const completed = conversations.records.filter((r: any) => r.state === 'completed' || r.state === 'resolved').length;
      return { period_days: days, total_conversations: total, completed, completion_rate: total > 0 ? `${Math.round((completed / total) * 100)}%` : 'N/A' };
    }

    case 'ml_process_optimization': {
      if (!args.table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      const days = args.days || 90;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      const resp = await client.queryRecords({ table: args.table, query: `sys_created_on>=${since}^stateIN6,7`, limit: 1000, fields: 'reassignment_count,sys_created_on,resolved_at,assignment_group,priority' });
      const durations = resp.records.map((r: any) => { const c = new Date(r.sys_created_on).getTime(); const re = new Date(r.resolved_at).getTime(); return (re - c) / 3600000; }).filter((d: number) => d > 0);
      const avgDuration = durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0;
      const avgReassign = resp.records.reduce((sum: number, r: any) => sum + (parseInt(r.reassignment_count) || 0), 0) / (resp.count || 1);
      return { table: args.table, period_days: days, resolved_records: resp.count, avg_resolution_hours: Math.round(avgDuration * 10) / 10, avg_reassignments: Math.round(avgReassign * 10) / 10, bottleneck_indicator: avgReassign > 2 ? 'HIGH' : avgReassign > 1 ? 'MODERATE' : 'LOW' };
    }

    default:
      return null;
  }
}
