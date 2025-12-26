/**
 * Project Configuration
 * Centralized configuration for the hotel search agent
 */

export const PROJECT_CONFIG = {
  // OpenAI Model Configuration
  openai: {
    // LLM model for query parsing, re-ranking, and natural responses
    modelName: "gpt-4.1-mini",
    
    // Embedding model (must be text-embedding-3-small per requirements)
    embeddingModel: "text-embedding-3-small",
    
    // Temperature settings
    temperature: {
      parsing: 0.2,        // Query parsing - lower for accuracy
      reranking: 0,        // Re-ranking - deterministic
      naturalResponse: 0.7, // Natural response - higher for creativity
      contextSummary: 0.2,  // Context summarization - lower for accuracy
    },
    
    // Max tokens settings
    maxTokens: {
      parsing: 400,
      reranking: 400,
      naturalResponse: 800, // Reduced for more concise responses
      contextSummary: 500,
    },
  },
  
  // Search Configuration
  search: {
    // RPC limit - number of hotels to fetch from database
    rpcLimit: 20,
    
    // Final results range
    minResults: 3,
    maxResults: 5,
    
    // Combined score weights
    vectorWeight: 0.5,
    keywordWeight: 0.5,
  },
  
  // Conversation Context Configuration
  conversation: {
    // Maximum number of messages to include in context
    maxContextMessages: 10,
    
    // Thresholds for LLM summarization
    summarizationThreshold: {
      messageCount: 3,
      totalLength: 500,
    },
  },
} as const;

// Export commonly used values for convenience
export const OPENAI_MODEL = PROJECT_CONFIG.openai.modelName;
export const EMBEDDING_MODEL = PROJECT_CONFIG.openai.embeddingModel;

