const INTENTS = [
  { patterns: ['hi', 'hello', 'hey', 'start', 'menu', 'help', '?'], intent: 'welcome' },
  { patterns: ['browse', 'products', 'catalog', 'shop', 'list'], intent: 'browse' },
  { patterns: ['box', 'cart', 'my box', 'view box', 'items'], intent: 'show_box' },
  { patterns: ['checkout', 'order', 'buy', 'purchase', 'pay'], intent: 'checkout' },
  { patterns: ['remove', 'delete', 'clear', 'empty'], intent: 'remove_item' },
  { patterns: ['confirm', 'yes', 'approve'], intent: 'confirm' },
  { patterns: ['status', 'track', 'where'], intent: 'order_status' },
  { patterns: ['stop', 'cancel', 'end', 'quit'], intent: 'cancel' }
];

export function detectIntent(text) {
  const lower = text.toLowerCase().trim();
  
  // Check for number-only (product selection)
  if (/^\d+$/.test(lower)) {
    return { intent: 'select_by_index', data: { index: parseInt(lower) } };
  }
  
  // Check for "add [product]" or "add [number]"
  const addMatch = lower.match(/^(?:add|get|want|need)\s+(.+)$/);
  if (addMatch) {
    return { intent: 'add_item', data: { query: addMatch[1].trim() } };
  }
  
  // Check for "remove [item]"
  const removeMatch = lower.match(/^(?:remove|delete)\s+(.+)$/);
  if (removeMatch) {
    return { intent: 'remove_item', data: { query: removeMatch[1].trim() } };
  }
  
  // Pattern matching
  for (const rule of INTENTS) {
    if (rule.patterns.some(p => lower.includes(p))) {
      return { intent: rule.intent, data: {} };
    }
  }
  
  return { intent: 'unknown', data: { original: text } };
}
