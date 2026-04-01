// API, Auth, and Database Entity types
import type { ToolCall, ToolResult } from './types';

// ============================================

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    errors?: Record<string, string[]>;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// Database Entity Types (for web API)
// ============================================

export interface DbSession {
  id: string;
  userId: string;
  label: string | null;
  cwd: string | null;
  assistantId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbAssistant {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  avatar: string | null;
  model: string;
  systemPrompt: string | null;
  settings: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DbMessage {
  id: string;
  sessionId: string;
  userId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls: ToolCall[] | null;
  toolResults: ToolResult[] | null;
  createdAt: string;
}

export interface DbAssistantMessage {
  id: string;
  threadId: string;
  parentId: string | null;
  fromAssistantId: string | null;
  toAssistantId: string | null;
  subject: string | null;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'unread' | 'read' | 'archived' | 'injected';
  readAt: string | null;
  injectedAt: string | null;
  createdAt: string;
}
