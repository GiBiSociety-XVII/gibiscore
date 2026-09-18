import {defineConfig, devices} from '@playwright/test';

/**
 * The smoke tests: a handful of pages opened in a real browser, to catch
 * the breakages the unit tests cannot see (a page that throws, a missing
 * message, a route gone). They run against a site that is already up —
 * `pnpm dev` on this machine by default, a deployment with BASE_URL:
 *
 *   pnpm smoke
 *   BASE_URL=https://gibiscore.com pnpm smoke
 *
 * The browser comes from `pnpm exec playwright install chromium`, once;
 * an image that already carries one is used with CHROMIUM_PATH.
 */
export default defineConfig({
    testDir: './tests',
    // A page of this site reads the database: a slow answer is not a failure.
    timeout: 60_000,
    expect: {timeout: 15_000},
    reporter: process.env.CI ? 'github' : 'list',
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
        locale: 'it-IT',
        timezoneId: 'Europe/Rome',
        trace: 'retain-on-failure',
        ...(process.env.CHROMIUM_PATH ? {launchOptions: {executablePath: process.env.CHROMIUM_PATH}} : {}),
    },
    // Without BASE_URL the suite starts the development server itself, and keeps one already up.
    ...(process.env.BASE_URL
        ? {}
        : {webServer: {command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 180_000}}),
    projects: [
        {name: 'desktop', use: {...devices['Desktop Chrome']}},
        {name: 'phone', use: {...devices['Pixel 7']}},
    ],
});
