import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { getDatabase } from './db.js';

const MAX_VOICE_MS = 5000;
const MAX_BYTES = 256000;
const AUDIO_DIR = './data/audio';

class VoiceService {
  constructor() {
    this.ensureDir();
  }

  async ensureDir() {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
  }

  async processCommit(sessionId, mode, buffer) {
    const db = getDatabase();
    const timestamp = Date.now();
    
    if (mode === 'SILENT') {
      // 3s hold validation (client-side timer, server confirms)
      return {
        mode: 'SILENT',
        commit_id: `silent_${sessionId}_${timestamp}`,
        metadata: { duration_ms: 3000, type: 'HOLD_CONFIRM' }
      };
    }

    if (mode === 'VOICE') {
      // Validate constraints
      if (!buffer || buffer.length > MAX_BYTES) {
        throw new Error(`VOICE_FILE_TOO_LARGE: ${buffer?.length || 0} > ${MAX_BYTES}`);
      }

      const inputPath = join(AUDIO_DIR, `${sessionId}_raw.webm`);
      const outputPath = join(AUDIO_DIR, `${sessionId}.opus`);

      try {
        // Write raw WebM from browser
        await fs.writeFile(inputPath, buffer);

        // Compress to Opus using ffmpeg
        await new Promise((resolve, reject) => {
          exec(
            `ffmpeg -i "${inputPath}" -c:a libopus -b:a 24k "${outputPath}" -y`,
            (err, stdout, stderr) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        // Cleanup raw file
        await fs.unlink(inputPath);

        // Get compressed file size
        const stats = await fs.stat(outputPath);
        const duration = this.estimateDuration(buffer);

        return {
          mode: 'VOICE',
          commit_id: `voice_${sessionId}_${timestamp}`,
          file_path: outputPath,
          metadata: {
            duration_ms: duration,
            type: 'GREETING_GIFT',
            size_bytes: stats.size,
            max_duration: MAX_VOICE_MS
          }
        };

      } catch (err) {
        // Cleanup on error
        try { await fs.unlink(inputPath); } catch {}
        throw new Error(`VOICE_PROCESSING_FAILED: ${err.message}`);
      }
    }

    throw new Error(`INVALID_COMMIT_MODE: ${mode}`);
  }

  estimateDuration(buffer) {
    // WebM Opus roughly 6KB/s at 24kbps
    return Math.min(MAX_VOICE_MS, Math.floor(buffer.length / 6));
  }
}

export { VoiceService };
