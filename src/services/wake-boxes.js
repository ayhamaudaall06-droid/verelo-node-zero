const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'sessions.db');

// Boxes 3-8 by their box_slug values in the database
const BOXES_TO_WAKE = [
    'fuel-box-amman-3',
    'self-box-amman-4',
    'care-box-amman-5',
    'play-box-amman-6',
    'grow-box-amman-7',
    'move-box-amman-8'
];
const TARGET_STATUS = 'active';
const PREVIOUS_STATUS = 'dormant';

function wakeBoxes() {
    console.log('[Wake Boxes] Initializing database connection...');
    console.log('[Wake Boxes] DB Path:', DB_PATH);
    
    const db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
            console.error('[Wake Boxes] Failed to connect to database:', err.message);
            process.exit(1);
        }
        console.log('[Wake Boxes] Connected to SQLite database');
    });

    // Check if box_registry table exists
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='box_registry'`, (err, row) => {
        if (err) {
            console.error('[Wake Boxes] Error checking table existence:', err.message);
            db.close();
            process.exit(1);
        }

        if (!row) {
            console.error('[Wake Boxes] box_registry table does not exist');
            db.close();
            process.exit(1);
        }

        console.log('[Wake Boxes] box_registry table found');

        // Update boxes 3-8 using box_slug column
        const placeholders = BOXES_TO_WAKE.map(() => '?').join(',');
        const updateQuery = `
            UPDATE box_registry 
            SET status = ?
            WHERE box_slug IN (${placeholders})
            AND status = ?
        `;

        const params = [TARGET_STATUS, ...BOXES_TO_WAKE, PREVIOUS_STATUS];

        db.run(updateQuery, params, function(err) {
            if (err) {
                console.error('[Wake Boxes] Update failed:', err.message);
                db.close();
                process.exit(1);
            }

            console.log(`[Wake Boxes] Successfully awakened ${this.changes} box(es)`);
            
            if (this.changes > 0) {
                console.log(`[Wake Boxes] Boxes transitioned from '${PREVIOUS_STATUS}' to '${TARGET_STATUS}'`);
            } else {
                console.log('[Wake Boxes] No boxes were updated (may already be active or not exist)');
            }

            // Verify ALL boxes
            db.all(`SELECT id, box_slug, box_name, status, bcp_state_handled FROM box_registry ORDER BY id`, 
                [], (err, rows) => {
                if (err) {
                    console.error('[Wake Boxes] Verification query failed:', err.message);
                } else {
                    console.log('[Wake Boxes] Current state of ALL boxes:');
                    rows.forEach(row => {
                        const marker = row.status === 'active' ? '✓' : '✗';
                        console.log(`  ${marker} [${row.id}] ${row.box_name} (${row.box_slug}): ${row.status} | BCP-${row.bcp_state_handled}`);
                    });
                }
                
                db.close((err) => {
                    if (err) {
                        console.error('[Wake Boxes] Error closing database:', err.message);
                    } else {
                        console.log('[Wake Boxes] Database connection closed');
                    }
                    process.exit(0);
                });
            });
        });
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Wake Boxes] Interrupted by user');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[Wake Boxes] Terminated');
    process.exit(0);
});

// Execute
wakeBoxes();
