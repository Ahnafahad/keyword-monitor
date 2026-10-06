// Imported first by index.ts so .env is loaded before any module reads process.env at import time.
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile();
