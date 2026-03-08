import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    retries: 1,
    use: {
        baseURL: 'http://localhost:3999',
        headless: true,
        viewport: { width: 1280, height: 720 },
    },
    webServer: {
        command: 'npx serve . -l 3999 --no-clipboard',
        port: 3999,
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' },
        },
    ],
});
