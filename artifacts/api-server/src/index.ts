import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import app from './app';
import { logger } from './lib/logger';

const rawPort = process.env['PORT'] ?? '3000';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
    if (err) {
        logger.error({ err }, 'Error listening on port');
        process.exit(1);
    }

    logger.info({ port }, 'Server listening');
});
