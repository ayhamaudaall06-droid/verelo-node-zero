/**
 * AI Brain - Ollama Qwen2.5 Integration
 * Natural language processing for Verelo WhatsApp Agent
 */

import { getDatabase } from './db.js';

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'qwen2.5:7b';

// System prompt defines Verelo's personality and capabilities
const SYSTEM_PROMPT = `You are Verelo's AI Concierge. You help customers discover and purchase premium curated boxes through live factory streams.

YOUR PERSONALITY:
- Premium, minimal, confident but warm
- Bilingual: Respond in the user's language (Arabic or English)
- Conversational, not robotic
- You know about the 8 Boxes: WAKE (coffee/morning), REST (sleep/wellness), FUEL (energy/work), SELF (beauty/personal), CARE (health), PLAY (fun/leisure), GROW (learning), MOVE (fitness/travel)
- You know we stream live from factories in Jabal Amman

YOUR CAPABILITIES:
- Recommend boxes based on customer needs
- Explain what's in each box
- Help customers customize their order
- Guide them to watch live streams
- Process orders and track status

CONTEXT AWARENESS:
- Current user state: {STATE}
- Available boxes: {BOXES}
- Recent conversation: {HISTORY}

RESPOND NATURALLY. Be helpful but concise. If they want to buy, help them. If they want to browse, show options. Always mention "live factory" when relevant.

If they say "1" or "morning box" or "صباح", recommend WAKE box.
If they say "2" or "custom", explain dynamic assembly.
If they say "stream" or "بث", encourage them to watch live.`;

class AIBrain {
  constructor() {
    this.conversations = new Map(); // sessionId -> message history
    this.maxHistory = 10; // Keep last 10 messages for context
  }

  /**
   * Process incoming message through Qwen
   * @param {string} sessionId - User session
   * @param {string} message - User message
   * @param {object} context - Current state, boxes, etc
   * @returns {Promise<{response: string, intent: string, action: object}>}
   */
  async processMessage(sessionId, message, context = {}) {
    // Get or create conversation history
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, []);
    }
    const history = this.conversations.get(sessionId);

    // Build prompt with context
    const prompt = this.buildPrompt(message, history, context);
    
    try {
      const response = await this.queryOllama(prompt);
      
      // Parse response for intent detection
      const parsed = this.parseResponse(response, message);
      
      // Update history
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: parsed.response });
      
      // Trim history if too long
      if (history.length > this.maxHistory * 2) {
        this.conversations.set(sessionId, history.slice(-this.maxHistory * 2));
      }
      
      // Save to database for persistence
      await this.saveConversation(sessionId, message, parsed.response);
      
      return parsed;
      
    } catch (err) {
      console.error('[AI BRAIN] Ollama error:', err.message);
      // Fallback to simple response if AI fails
      return {
        response: this.fallbackResponse(message, context),
        intent: 'FALLBACK',
        action: null
      };
    }
  }

  buildPrompt(userMessage, history, context) {
    // Format conversation history
    const historyText = history.map(h => 
      `${h.role === 'user' ? 'Customer' : 'Verelo'}: ${h.content}`
    ).join('\n');

    // Replace placeholders in system prompt
    const system = SYSTEM_PROMPT
      .replace('{STATE}', context.state || 'NEW_CONVERSATION')
      .replace('{BOXES}', 'WAKE, REST, FUEL, SELF, CARE, PLAY, GROW, MOVE')
      .replace('{HISTORY}', historyText || 'No previous messages');

    return `${system}

Customer: ${userMessage}
Verelo:`;
  }

  async queryOllama(prompt) {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7, // Creative but focused
          num_predict: 150, // Keep responses concise
          top_p: 0.9,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.response.trim();
  }

  parseResponse(aiResponse, originalMessage) {
    // Detect intent from AI response
    let intent = 'CONVERSATION';
    let action = null;
    
    const lowerMsg = originalMessage.toLowerCase();
    const lowerResp = aiResponse.toLowerCase();
    
    // Intent detection patterns
    if (lowerMsg.includes('1') || lowerMsg.includes('morning') || lowerMsg.includes('صباح') || lowerResp.includes('wake box')) {
      intent = 'SELECT_BOX_WAKE';
      action = { box: 'BOX_001_COFFEE_STARTER', transition: 'CURATED_SELECTED' };
    }
    else if (lowerMsg.includes('2') || lowerMsg.includes('custom') || lowerMsg.includes('مخصص')) {
      intent = 'SELECT_DYNAMIC';
      action = { transition: 'DYNAMIC_ASSEMBLING' };
    }
    else if (lowerMsg.includes('stream') || lowerMsg.includes('بث') || lowerMsg.includes('watch')) {
      intent = 'WATCH_STREAM';
      action = { transition: 'WATCHING_STREAM' };
    }
    else if (lowerMsg.includes('buy') || lowerMsg.includes('order') || lowerMsg.includes('شراء') || lowerResp.includes('confirm')) {
      intent = 'PURCHASE_INTENT';
      action = { transition: 'COMMITTED' };
    }
    else if (lowerMsg.includes('help') || lowerMsg.includes('مساعدة')) {
      intent = 'HELP';
    }
    
    return {
      response: aiResponse,
      intent,
      action
    };
  }

  fallbackResponse(message, context) {
    // Simple rule-based fallback if Ollama fails
    const arabic = /[\u0600-\u06FF]/.test(message);
    
    if (arabic) {
      return `مرحباً! أنا هنا لمساعدتك في اكتشاف صناديق فيريلو. هل تريد أن ترى البث المباشر من المصنع؟`;
    }
    return `Hi! I'm here to help you discover Verelo boxes. Would you like to see our live factory stream?`;
  }

  async saveConversation(sessionId, userMsg, aiResponse) {
    try {
      const db = getDatabase();
      await db.run(
        `INSERT INTO ai_conversations (session_id, user_message, ai_response, timestamp_ms) 
         VALUES (?, ?, ?, ?)`,
        [sessionId, userMsg, aiResponse, Date.now()]
      );
    } catch (err) {
      console.error('[AI BRAIN] Failed to save conversation:', err.message);
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(sessionId) {
    this.conversations.delete(sessionId);
  }

  /**
   * Get conversation stats
   */
  getStats() {
    return {
      activeConversations: this.conversations.size,
      model: MODEL,
      status: 'LOCAL'
    };
  }
}

// Add table for AI conversations
export async function initAIConversationsTable() {
  const db = getDatabase();
  await db.run(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_message TEXT,
      ai_response TEXT,
      timestamp_ms INTEGER,
      FOREIGN KEY (session_id) REFERENCES current_sessions(session_id)
    )
  `);
  console.log('[AI BRAIN] Conversations table ready');
}

export { AIBrain };