export function welcomeMessage(name) {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `Welcome to Verelo, ${name || 'there'}! 👋\n\nBrowse factory-direct products or view your box.` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'browse', title: '🔍 Browse' } },
          { type: 'reply', reply: { id: 'box', title: '📦 My Box' } },
          { type: 'reply', reply: { id: 'help', title: '❓ Help' } }
        ]
      }
    }
  };
}

export function productListMessage(products) {
  const rows = products.slice(0, 10).map((p, i) => ({
    id: `prod_${p.id}`,
    title: `${i + 1}. ${p.name}`.slice(0, 24),
    description: `${p.currency || 'USD'} ${p.price} • ${p.category || 'General'}`.slice(0, 72)
  }));

  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'Verelo Catalog' },
      body: { text: 'Tap a product to add it to your box:' },
      footer: { text: 'Factory-direct pricing' },
      action: { button: 'View Products', sections: [{ title: 'Available Now', rows }] }
    }
  };
}

export function productCard(product) {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `*${product.name}*\n${product.currency || 'USD'} ${product.price}\n_${product.description || 'Factory direct'}_`
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `add_${product.id}`, title: '➕ Add to Box' } },
          { type: 'reply', reply: { id: `details_${product.id}`, title: 'ℹ️ Details' } }
        ]
      }
    }
  };
}

export function boxSummary(box, total) {
  const items = box.map((item, i) => `${i + 1}. ${item.name} — ${item.currency || 'USD'} ${item.price}`).join('\n');
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `*Your Box (${box.length} items)*\n\n${items}\n\n*Total: ${box[0]?.currency || 'USD'} ${total.toFixed(2)}*` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'checkout', title: '✅ Checkout' } },
          { type: 'reply', reply: { id: 'browse_more', title: '🔍 Browse More' } },
          { type: 'reply', reply: { id: 'clear_box', title: '🗑 Clear' } }
        ]
      }
    }
  };
}

export function orderConfirmation(orderId, total, currency) {
  return {
    type: 'text',
    text: `🎉 *Order Confirmed!*\n\nID: \`${orderId}\`\nTotal: ${currency} ${total}\n\nWe'll notify you via WhatsApp when it ships.`
  };
}

export function plainText(text) {
  return { type: 'text', text };
}
