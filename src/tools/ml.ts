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
    {
      name: 'ml_similar_incidents',
      description:
        'Find similar past incidents using keyword-based matching. Provide either an incident sys_id ' +
        '(to find similar incidents) or a short_description (for free-text matching). ' +
        'Returns resolved incidents ranked by keyword match count.',
      inputSchema: {
        type: 'object',
        properties: {
          incident_sys_id: { type: 'string', description: 'Sys_id of an existing incident to find similar ones for' },
          short_description: { type: 'string', description: 'Free-text description to match against (required if no sys_id)' },
          limit: { type: 'number', description: 'Max results to return (default 10)' },
        },
        required: [],
      },
    },
    {
      name: 'ml_auto_categorize',
      description:
        'Auto-categorize a record based on its description by analysing resolved records of the same table. ' +
        'Queries the last 500 resolved records, groups by category, and matches input keywords to suggest a category.',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Short description of the record to categorize' },
          description: { type: 'string', description: 'Full description (optional, improves accuracy)' },
          table: { type: 'string', description: 'Table to analyse (default "incident")' },
        },
        required: ['short_description'],
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

    case 'ml_similar_incidents': {
      const limit = args.limit || 10;
      let description = args.short_description || '';

      // If sys_id provided, fetch the incident's short_description first
      if (args.incident_sys_id) {
        const incident = await client.getRecord('incident', args.incident_sys_id);
        description = incident.short_description || description;
      }

      if (!description) {
        throw new ServiceNowError('Either incident_sys_id or short_description is required', 'INVALID_REQUEST');
      }

      // Tokenize into keywords (remove stop words and short tokens)
      const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'not', 'no', 'so', 'if', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'their']);
      const keywords = description
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 2 && !stopWords.has(w));

      if (keywords.length === 0) {
        return { error: 'Could not extract meaningful keywords from the description' };
      }

      // Build LIKE query for each keyword (up to 5 keywords to avoid query overload)
      const topKeywords = keywords.slice(0, 5);
      const likeConditions = topKeywords.map((kw: string) => `short_descriptionLIKE${kw}`).join('^OR');
      const query = `stateIN6,7^(${likeConditions})`;

      const resp = await client.queryRecords({
        table: 'incident',
        query,
        limit: 200,
        fields: 'sys_id,number,short_description,category,priority,resolved_at,resolution_code,close_notes',
      });

      // Rank by keyword match count
      const ranked = resp.records
        .map((r: any) => {
          const desc = (r.short_description || '').toLowerCase();
          const matchCount = topKeywords.filter((kw: string) => desc.includes(kw)).length;
          return { ...r, _match_score: matchCount };
        })
        .sort((a: any, b: any) => b._match_score - a._match_score)
        .slice(0, limit);

      return {
        source_description: description,
        keywords_used: topKeywords,
        total_candidates: resp.count,
        similar_incidents: ranked,
      };
    }

    case 'ml_auto_categorize': {
      const shortDesc = args.short_description;
      if (!shortDesc) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      const table = args.table || 'incident';
      const fullText = `${shortDesc} ${args.description || ''}`.toLowerCase();

      // Tokenize input
      const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'and', 'but', 'or', 'not', 'no', 'it', 'its', 'this', 'that', 'i', 'me', 'my', 'we', 'you', 'your', 'they', 'them', 'their']);
      const inputKeywords = fullText
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 2 && !stopWords.has(w));

      // Query last 500 resolved records with categories
      const resp = await client.queryRecords({
        table,
        query: 'stateIN6,7^categoryISNOTEMPTY',
        limit: 500,
        fields: 'short_description,category,subcategory',
      });

      if (resp.count === 0) {
        return { error: `No resolved records with categories found in ${table}` };
      }

      // Build category -> keyword frequency map
      const categoryData: Record<string, { count: number; keywords: Record<string, number> }> = {};
      for (const r of resp.records as any[]) {
        const cat = r.category;
        if (!cat) continue;
        if (!categoryData[cat]) categoryData[cat] = { count: 0, keywords: {} };
        categoryData[cat].count++;
        const words = (r.short_description || '')
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w: string) => w.length > 2 && !stopWords.has(w));
        for (const w of words) {
          categoryData[cat].keywords[w] = (categoryData[cat].keywords[w] || 0) + 1;
        }
      }

      // Score each category by matching input keywords
      const scored = Object.entries(categoryData).map(([category, data]) => {
        let score = 0;
        for (const kw of inputKeywords) {
          if (data.keywords[kw]) {
            score += data.keywords[kw];
          }
        }
        return { category, score, record_count: data.count };
      })
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score);

      const topCategory = scored.length > 0 ? scored[0] : null;

      return {
        table,
        input: shortDesc,
        keywords_extracted: inputKeywords.slice(0, 10),
        total_resolved_analysed: resp.count,
        suggested_category: topCategory ? topCategory.category : 'unknown',
        confidence: topCategory ? (topCategory.score > 10 ? 'high' : topCategory.score > 3 ? 'medium' : 'low') : 'none',
        top_categories: scored.slice(0, 5),
      };
    }

    default:
      return null;
  }
}
