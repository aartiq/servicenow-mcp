/**
 * A2A (Agent-to-Agent) Protocol types — Google's open protocol for agent interoperability.
 * Spec: https://google.github.io/A2A/
 */

export type TaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  authentication: {
    schemes: string[];
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp: string;
}

export interface Task {
  id: string;
  sessionId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: Message[];
}

export interface Message {
  role: 'user' | 'agent';
  parts: Part[];
}

export type Part = TextPart | DataPart;

export interface TextPart {
  type: 'text';
  text: string;
}

export interface DataPart {
  type: 'data';
  data: Record<string, unknown>;
  mimeType?: string;
}

export interface Artifact {
  name?: string;
  description?: string;
  parts: Part[];
  index: number;
}

export interface SendTaskRequest {
  id?: string;
  message: Message;
  sessionId?: string;
}

export interface SendTaskResponse {
  id: string;
  sessionId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
}
