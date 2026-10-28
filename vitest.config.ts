import { defineConfig } from 'vitest/config';
import 'dotenv/config';
if(!process.env.TEST_DATABASE_URL||!process.env.TEST_MIGRATION_DATABASE_URL)throw new Error('Private TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL required; run setup');
export default defineConfig({test:{include:['tests/**/*.test.ts','tests/**/*.test.mjs'],env:{MODE:'MOCK_MODE',DATABASE_URL:process.env.TEST_DATABASE_URL,MIGRATION_DATABASE_URL:process.env.TEST_MIGRATION_DATABASE_URL,MOCK_URL:'http://127.0.0.1:3302'},fileParallelism:false, testTimeout:30000, hookTimeout:30000, reporters:['default','json'], outputFile:{json:'reports/tests.json'}}});
