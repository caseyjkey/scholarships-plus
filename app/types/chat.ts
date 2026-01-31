/**
 * Chat system type definitions for Phase 1
 * Includes Message, Source, Citation, and related types
 */

export interface Source {
  id: string;
  type: 'essay' | 'conversation' | 'profile';
  title: string;
  excerpt: string;
  date: string;
  relevance: number; // 0-100 match percentage
  awarded?: boolean; // For essays - whether this essay was awarded a scholarship
  scholarshipId?: string; // Which scholarship this was for
  content?: string; // Full content for preview
}

export interface Citation {
  number: number;
  source: Source;
  context?: string; // The specific text being cited
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Source[];
  citations?: Citation[];
  timestamp: Date;
  agentStatus?: string; // Current agent state/thinking
}

export interface ChatHistory {
  messages: Message[];
  applicationId: string;
  scholarshipId: string;
  currentStep: string;
  contextSnapshot?: any;
}

export interface ChatRequest {
  applicationId: string;
  scholarshipId: string;
  message: string;
  history: Message[];
}

export interface ChatResponse {
  content: string;
  sources: Source[];
  agentStatus: string;
  currentStep: string;
}

/**
 * Vector search result from Pinecone
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: {
    type: 'essay' | 'conversation' | 'profile';
    content: string;
    awarded?: boolean;
    date?: string;
    scholarshipId?: string;
    [key: string]: any;
  };
}

/**
 * RAG query context
 */
export interface RAGContext {
  userId: string;
  scholarshipId: string;
  query: string;
  relevantEssays: VectorSearchResult[];
  relevantConversations: VectorSearchResult[];
  profileContext?: VectorSearchResult;
}

/**
 * Agent state tracking
 */
export type AgentStep =
  | 'greeting'
  | 'gather-info'
  | 'draft-essay'
  | 'refine-essay'
  | 'review'
  | 'complete';

export interface AgentState {
  step: AgentStep;
  status: string;
  progress: number; // 0-100
  collectedInfo: {
    goals?: string;
    achievements?: string;
    background?: string;
    specialCircumstances?: string;
  };
  drafts: {
    current?: string;
    previous?: string;
    feedback?: string;
  };
}
