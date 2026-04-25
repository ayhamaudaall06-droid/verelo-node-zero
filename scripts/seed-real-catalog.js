import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'verelo.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

// Clear old demo products
db.exec("DELETE FROM products");
db.exec("DELETE FROM product_media");
console.log('[Seed] Cleared old demo data');

const now = Math.floor(Date.now() / 1000);

const products = [
  // ── FOOD & DRINK ──
  { id: 'fd-001', sku: 'FD-RICE-001', name: 'Basmati Rice', description: 'Premium long-grain basmati rice, 1kg', price: 8.50, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Grains, Seeds & Pulses', gpc_id: '425', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-002', sku: 'FD-PASTA-001', name: 'Dry Pasta', description: 'Italian durum wheat pasta, 500g', price: 3.99, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Grains, Seeds & Pulses', gpc_id: '425', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-003', sku: 'FD-LENTIL-001', name: 'Red Lentils', description: 'Organic red lentils, 1kg', price: 5.50, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Grains, Seeds & Pulses', gpc_id: '425', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-004', sku: 'FD-BEANS-001', name: 'Dry Beans', description: 'Black beans, 1kg', price: 6.00, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Grains, Seeds & Pulses', gpc_id: '425', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-005', sku: 'FD-FLOUR-001', name: 'All-Purpose Flour', description: 'Unbleached wheat flour, 2kg', price: 4.50, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients', gpc_id: '5774', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-006', sku: 'FD-OIL-001', name: 'Cooking Oil', description: 'Sunflower cooking oil, 1L', price: 7.00, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Cooking Oils', gpc_id: '500072', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-007', sku: 'FD-OIL-002', name: 'Sesame Oil', description: 'Toasted sesame oil, 250ml', price: 9.50, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Cooking Oils', gpc_id: '500072', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-008', sku: 'FD-OIL-003', name: 'Garlic Oil', description: 'Infused garlic oil, 250ml', price: 8.00, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Cooking Oils', gpc_id: '500072', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-009', sku: 'FD-CHILI-001', name: 'Chili Crisp', description: 'Spicy chili crisp, 200g', price: 12.00, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces > Hot Sauce', gpc_id: '4623', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-010', sku: 'FD-VINEGAR-001', name: 'Balsamic Vinegar', description: 'Aged balsamic vinegar, 500ml', price: 11.00, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces > Vinegar', gpc_id: '5769', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-011', sku: 'FD-SOY-001', name: 'Soy Sauce', description: 'Premium soy sauce, 500ml', price: 6.50, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces', gpc_id: '412', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-012', sku: 'FD-KETCHUP-001', name: 'Tomato Ketchup', description: 'Classic tomato ketchup, 500ml', price: 4.00, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces > Ketchup', gpc_id: '4617', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-013', sku: 'FD-MUSTARD-001', name: 'Dijon Mustard', description: 'French dijon mustard, 200g', price: 5.50, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces > Mustard', gpc_id: '5765', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-014', sku: 'FD-MAYO-001', name: 'Mayonnaise', description: 'Creamy mayonnaise, 400g', price: 5.00, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces > Mayonnaise', gpc_id: '5763', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-015', sku: 'FD-DRESS-001', name: 'Salad Dressing', description: 'Caesar salad dressing, 300ml', price: 6.00, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces > Salad Dressing', gpc_id: '5771', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-016', sku: 'FD-PASTE-001', name: 'Tomato Paste', description: 'Concentrated tomato paste, 200g', price: 3.50, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces > Tomato Sauce', gpc_id: '6204', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-017', sku: 'FD-TAHINI-001', name: 'Tahini', description: 'Sesame tahini paste, 400g', price: 8.50, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Nut Butters', gpc_id: '6226', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-018', sku: 'FD-SAUCE-001', name: 'Ready-made Pasta Sauce', description: 'Arrabbiata pasta sauce, 400g', price: 7.00, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces', gpc_id: '412', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-019', sku: 'FD-NUTS-001', name: 'Mixed Nuts', description: 'Roasted mixed nuts, 500g', price: 14.00, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Snack Foods > Nuts & Seeds', gpc_id: '421', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-020', sku: 'FD-SPICE-001', name: 'Spice Blend', description: 'Middle Eastern spice mix, 150g', price: 9.00, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Seasonings & Spices', gpc_id: '422', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-021', sku: 'FD-CHOCO-001', name: 'Premium Dark Chocolate', description: '70% cocoa dark chocolate, 200g', price: 15.00, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Candy & Chocolate', gpc_id: '419', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-022', sku: 'FD-HALAWA-001', name: 'Halawa', description: 'Sesame halawa candy, 400g', price: 8.00, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Candy & Chocolate', gpc_id: '419', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-023', sku: 'FD-COFFEE-001', name: 'Premium Coffee Beans', description: 'Ethiopian Yirgacheffe, 250g', price: 24.00, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Beverages > Coffee', gpc_id: '416', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-024', sku: 'FD-TEA-001', name: 'Specialty Green Tea', description: 'Japanese matcha green tea, 100g', price: 18.00, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Beverages > Tea & Infusions', gpc_id: '417', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-025', sku: 'FD-JUICE-001', name: 'Juice Boxes', description: 'Mixed fruit juice, 12-pack', price: 9.00, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Beverages > Juices', gpc_id: '413', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-026', sku: 'FD-MEAL-001', name: 'Ready Pasta Meal', description: 'Microwave pasta meal, 300g', price: 7.50, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Prepared Foods', gpc_id: '4627', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-027', sku: 'FD-MEAL-002', name: 'Gourmet Burger Patty', description: 'Wagyu beef burger, 2-pack', price: 16.00, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Prepared Foods', gpc_id: '4627', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-028', sku: 'FD-MEAL-003', name: 'Falafel Mix', description: 'Ready-to-fry falafel, 500g', price: 8.00, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Prepared Foods', gpc_id: '4627', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-029', sku: 'FD-MEAL-004', name: 'Quick-prep Tiramisu', description: 'Italian dessert kit, serves 4', price: 12.00, currency: 'USD', category: 'food_drink', box_type: 'factory', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Prepared Foods > Desserts', gpc_id: '5705', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-030', sku: 'FD-TUNA-001', name: 'Canned Tuna', description: 'Premium canned tuna in olive oil, 160g', price: 5.50, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Meat, Seafood & Eggs > Seafood > Prepared Seafood', gpc_id: '5814', subvertical: 'common', risk: 'Low' } },
  { id: 'fd-031', sku: 'FD-VEG-001', name: 'Preserved Vegetables', description: 'Mixed pickled vegetables, 400g', price: 6.50, currency: 'USD', category: 'food_drink', box_type: 'trending', metadata: { taxonomy_path: 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces > Pickled Fruits & Vegetables', gpc_id: '6203', subvertical: 'common', risk: 'Low' } },

  // ── HOME & CLEANING ──
  { id: 'hc-001', sku: 'HC-MAG-001', name: 'Magnetic Fridge Organiser', description: '3-tier magnetic spice rack', price: 19.00, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Kitchen Organization', gpc_id: '4166', subvertical: 'home_goods', risk: 'Low' } },
  { id: 'hc-002', sku: 'HC-CLIP-001', name: 'Bag Clips', description: 'Reusable sealing clips, 10-pack', price: 5.00, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils', gpc_id: '668', subvertical: 'home_goods', risk: 'Low' } },
  { id: 'hc-003', sku: 'HC-SPOON-001', name: 'Measuring Spoons', description: 'Stainless steel measuring set', price: 8.00, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Measuring Tools & Scales', gpc_id: '3334', subvertical: 'home_goods', risk: 'Low' } },
  { id: 'hc-004', sku: 'HC-STOR-001', name: 'Food Storage Containers', description: 'Airtight glass containers, 5-pack', price: 24.00, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Kitchen & Dining > Food Storage > Food Storage Containers', gpc_id: '2626', subvertical: 'home_goods', risk: 'Low' } },
  { id: 'hc-005', sku: 'HC-CAN-001', name: 'Airtight Coffee Canister', description: 'Vacuum-sealed coffee storage', price: 28.00, currency: 'USD', category: 'home_cleaning', box_type: 'factory', metadata: { taxonomy_path: 'Home & Garden > Kitchen & Dining > Food Storage > Food Storage Containers', gpc_id: '2626', subvertical: 'home_goods', risk: 'Low' } },
  { id: 'hc-006', sku: 'HC-MUG-001', name: 'Ceramic Mug', description: 'Hand-crafted ceramic mug, 350ml', price: 12.00, currency: 'USD', category: 'home_cleaning', box_type: 'factory', metadata: { taxonomy_path: 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs', gpc_id: '2169', subvertical: 'home_goods', risk: 'Low' } },
  { id: 'hc-007', sku: 'HC-LAUN-001', name: 'Laundry Detergent', description: 'Eco-friendly detergent, 2L', price: 14.00, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Household Supplies > Laundry Supplies > Laundry Detergent', gpc_id: '3174', subvertical: 'cleaning_supplies', risk: 'Low' } },
  { id: 'hc-008', sku: 'HC-DISH-001', name: 'Dish Soap', description: 'Lemon dish soap, 750ml', price: 4.50, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Household Supplies > Household Cleaning Supplies > Dish Detergent & Soap', gpc_id: '7510', subvertical: 'cleaning_supplies', risk: 'Low' } },
  { id: 'hc-009', sku: 'HC-SPON-001', name: 'Kitchen Sponges', description: 'Biodegradable sponges, 6-pack', price: 5.00, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Household Supplies > Household Cleaning Supplies > Cleaning Tools > Sponges & Scouring Pads', gpc_id: '5057', subvertical: 'cleaning_supplies', risk: 'Low' } },
  { id: 'hc-010', sku: 'HC-TRASH-001', name: 'Trash Bags', description: 'Heavy-duty trash bags, 30-pack', price: 8.00, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Household Supplies > Waste Containment > Trash Bags', gpc_id: '6428', subvertical: 'cleaning_supplies', risk: 'Low' } },
  { id: 'hc-011', sku: 'HC-TP-001', name: 'Toilet Paper', description: 'Bamboo toilet paper, 12-roll', price: 11.00, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Household Supplies > Paper Products > Toilet Paper', gpc_id: '500122', subvertical: 'cleaning_supplies', risk: 'Low' } },
  { id: 'hc-012', sku: 'HC-TISS-001', name: 'Facial Tissues', description: 'Soft tissues, 3-ply, 6-box', price: 7.00, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Household Supplies > Paper Products > Facial Tissues', gpc_id: '500121', subvertical: 'cleaning_supplies', risk: 'Low' } },
  { id: 'hc-013', sku: 'HC-PTOW-001', name: 'Paper Towels', description: 'Absorbent paper towels, 6-roll', price: 9.00, currency: 'USD', category: 'home_cleaning', box_type: 'trending', metadata: { taxonomy_path: 'Home & Garden > Household Supplies > Paper Products > Paper Towels', gpc_id: '500123', subvertical: 'cleaning_supplies', risk: 'Low' } },

  // ── PERSONAL CARE ──
  { id: 'pc-001', sku: 'PC-CAND-001', name: 'Soy Wax Candle', description: 'Lavender soy candle, 200g', price: 18.00, currency: 'USD', category: 'personal_care', box_type: 'factory', metadata: { taxonomy_path: 'Home & Garden > Decor > Candles', gpc_id: '588', subvertical: 'home_goods', risk: 'Low' } },
  { id: 'pc-002', sku: 'PC-BATH-001', name: 'Bath Soak', description: 'Epsom salt bath soak, 500g', price: 14.00, currency: 'USD', category: 'personal_care', box_type: 'factory', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Bath & Body', gpc_id: '5252', subvertical: 'beauty', risk: 'Low' } },
  { id: 'pc-003', sku: 'PC-SHOW-001', name: 'Shower Steamers', description: 'Aromatherapy shower tablets, 6-pack', price: 12.00, currency: 'USD', category: 'personal_care', box_type: 'factory', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Bath & Body', gpc_id: '5252', subvertical: 'beauty', risk: 'Low' } },
  { id: 'pc-004', sku: 'PC-JADE-001', name: 'Jade Roller', description: 'Facial massage jade roller', price: 16.00, currency: 'USD', category: 'personal_care', box_type: 'factory', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Skin Care Tools', gpc_id: '8073', subvertical: 'beauty', risk: 'Medium' } },
  { id: 'pc-005', sku: 'PC-GUA-001', name: 'Gua Sha Set', description: 'Rose quartz gua sha tool', price: 20.00, currency: 'USD', category: 'personal_care', box_type: 'factory', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Skin Care Tools', gpc_id: '8073', subvertical: 'beauty', risk: 'Medium' } },
  { id: 'pc-006', sku: 'PC-SLEEP-001', name: 'Silk Sleep Mask', description: 'Adjustable silk eye mask', price: 15.00, currency: 'USD', category: 'personal_care', box_type: 'factory', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Eye Masks', gpc_id: '6052', subvertical: 'beauty', risk: 'Low' } },
  { id: 'pc-007', sku: 'PC-PILL-001', name: 'Silk Pillowcase', description: 'Mulberry silk pillowcase, queen', price: 35.00, currency: 'USD', category: 'personal_care', box_type: 'factory', metadata: { taxonomy_path: 'Home & Garden > Linens & Bedding > Bedding > Pillowcases & Shams', gpc_id: '569', subvertical: 'home_goods', risk: 'Low' } },
  { id: 'pc-008', sku: 'PC-SCRU-001', name: 'Silk Scrunchie', description: 'Gentle hair tie, 3-pack', price: 12.00, currency: 'USD', category: 'personal_care', box_type: 'factory', metadata: { taxonomy_path: 'Apparel & Accessories > Clothing Accessories > Hair Accessories', gpc_id: '178', subvertical: 'clothing', risk: 'Low' } },
  { id: 'pc-009', sku: 'PC-CLEA-001', name: 'Facial Cleanser', description: 'Gentle foam cleanser, 150ml', price: 18.00, currency: 'USD', category: 'personal_care', box_type: 'trending', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Facial Cleansers', gpc_id: '7467', subvertical: 'beauty', risk: 'Low' } },
  { id: 'pc-010', sku: 'PC-MOIS-001', name: 'Moisturizer', description: 'Hydrating day cream, 50ml', price: 24.00, currency: 'USD', category: 'personal_care', box_type: 'trending', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Lotion & Moisturizer', gpc_id: '6034', subvertical: 'beauty', risk: 'Low' } },
  { id: 'pc-011', sku: 'PC-EYE-001', name: 'Hydrogel Eye Patches', description: 'Cooling under-eye patches, 30-pair', price: 22.00, currency: 'USD', category: 'personal_care', box_type: 'factory', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Skin Care Masks & Peels', gpc_id: '6032', subvertical: 'beauty', risk: 'Low' } },
  { id: 'pc-012', sku: 'PC-TOOT-001', name: 'Toothpaste', description: 'Fluoride-free toothpaste, 100g', price: 6.00, currency: 'USD', category: 'personal_care', box_type: 'trending', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Oral Care > Toothpaste', gpc_id: '2915', subvertical: 'beauty', risk: 'Low' } },
  { id: 'pc-013', sku: 'PC-DEOD-001', name: 'Natural Deodorant', description: 'Aluminum-free deodorant stick', price: 10.00, currency: 'USD', category: 'personal_care', box_type: 'trending', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Deodorant & Antiperspirant', gpc_id: '2732', subvertical: 'beauty', risk: 'Low' } },
  { id: 'pc-014', sku: 'PC-BWASH-001', name: 'Body Wash', description: 'Shea butter body wash, 400ml', price: 9.00, currency: 'USD', category: 'personal_care', box_type: 'trending', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Cosmetics > Bath & Body > Body Wash', gpc_id: '4252', subvertical: 'beauty', risk: 'Low' } },
  { id: 'pc-015', sku: 'PC-FEM-001', name: 'Feminine Hygiene Kit', description: 'Organic cotton pads, 20-pack', price: 8.00, currency: 'USD', category: 'personal_care', box_type: 'trending', metadata: { taxonomy_path: 'Health & Beauty > Personal Care > Feminine Sanitary Supplies', gpc_id: '485', subvertical: 'beauty', risk: 'Low' } },

  // ── FAMILY ──
  { id: 'fa-001', sku: 'FA-DIAP-001', name: 'Baby Diapers', description: 'Size 3 diapers, 50-pack', price: 22.00, currency: 'USD', category: 'family', box_type: 'trending', metadata: { taxonomy_path: 'Baby & Toddler > Diapering > Diapers', gpc_id: '551', subvertical: 'diapering_and_potty_training', risk: 'Low' } },
  { id: 'fa-002', sku: 'FA-WIPE-001', name: 'Baby Wipes', description: 'Sensitive wipes, 80-pack', price: 6.00, currency: 'USD', category: 'family', box_type: 'trending', metadata: { taxonomy_path: 'Baby & Toddler > Diapering > Baby Wipes', gpc_id: '553', subvertical: 'diapering_and_potty_training', risk: 'Low' } },
  { id: 'fa-003', sku: 'FA-FORM-001', name: 'Infant Formula', description: 'Stage 1 organic formula, 800g', price: 32.00, currency: 'USD', category: 'family', box_type: 'trending', metadata: { taxonomy_path: 'Baby & Toddler > Nursing & Feeding > Baby & Toddler Food > Baby Formula', gpc_id: '5720', subvertical: 'baby_feeding', risk: 'High' } },
  { id: 'fa-004', sku: 'FA-PHARM-001', name: 'Basic Pharmacy Kit', description: 'First-aid essentials box', price: 19.00, currency: 'USD', category: 'family', box_type: 'trending', metadata: { taxonomy_path: 'Health & Beauty > Health Care > Over-the-Counter Medication', gpc_id: '522', subvertical: 'health', risk: 'Extreme' } },

  // ── TECH ──
  { id: 'tc-001', sku: 'TC-CHRG-001', name: '3-in-1 Phone Charger', description: 'Wireless + USB-C + Lightning', price: 29.00, currency: 'USD', category: 'tech', box_type: 'trending', metadata: { taxonomy_path: 'Electronics > Communications > Telephony > Mobile Phone Accessories > Mobile Phone Chargers', gpc_id: '3237', subvertical: 'electronics_accessories', risk: 'Low' } },

  // ── PETS ──
  { id: 'pt-001', sku: 'PT-TREAT-001', name: 'Single-ingredient Dog Treats', description: 'Dehydrated chicken strips, 200g', price: 14.00, currency: 'USD', category: 'pets', box_type: 'trending', metadata: { taxonomy_path: 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Treats', gpc_id: '3530', subvertical: 'common', risk: 'Low' } },
  { id: 'pt-002', sku: 'PT-POOP-001', name: 'Biodegradable Poop Bags', description: 'Compostable bags, 120-count', price: 8.00, currency: 'USD', category: 'pets', box_type: 'trending', metadata: { taxonomy_path: 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Waste Bags', gpc_id: '505297', subvertical: 'common', risk: 'Low' } },
  { id: 'pt-003', sku: 'PT-DUST-001', name: 'Small Animal Dust Bath', description: 'Chinchilla dust bath, 1kg', price: 10.00, currency: 'USD', category: 'pets', box_type: 'trending', metadata: { taxonomy_path: 'Animals & Pet Supplies > Pet Supplies > Small Animal Supplies', gpc_id: '505297', subvertical: 'common', risk: 'Low' } },
];

const stmt = db.prepare(`
  INSERT INTO products (id, sku, name, description, price, currency, category, box_type, status, is_active, metadata_json, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const p of products) {
  stmt.run(
    p.id,
    p.sku,
    p.name,
    p.description,
    p.price,
    p.currency,
    p.category,
    p.box_type,
    'live',
    1,
    JSON.stringify(p.metadata),
    now,
    now
  );
}

console.log(`[Seed] Loaded ${products.length} real products into catalog`);
db.close();
