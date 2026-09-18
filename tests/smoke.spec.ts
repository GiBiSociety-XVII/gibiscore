import {expect, test, type ConsoleMessage, type Page} from '@playwright/test';

/**
 * Every page of the site opened in a browser: it answers, it is in the
 * right language, it has its own landmark, and nothing shouts in the
 * console. Data can be missing (an empty database, a quiet day): the
 * checks look for what a page always draws, never for a result.
 */

/** What is never all right in the console of a page that works. */
const LOUD = /MISSING_MESSAGE|IntlError|Hydration failed|Text content does not match|Minified React error/;

/** Opens a page and keeps the console: nothing loud, and no failed request of our own. */
async function open(page: Page, path: string): Promise<string[]> {
    const loud: string[] = [];
    const listen = (m: ConsoleMessage) => {
        if (LOUD.test(m.text())) loud.push(m.text().slice(0, 200));
    };
    page.on('console', listen);
    const response = await page.goto(path, {waitUntil: 'domcontentloaded'});
    expect(response, `${path}: no answer`).not.toBeNull();
    expect(response!.status(), `${path}: ${response!.status()}`).toBeLessThan(400);
    page.off('console', listen);
    return loud;
}

/** The bar and the footer are on every page: if they are there, the shell rendered. */
async function expectShell(page: Page) {
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
}

const PAGES = [
    {path: '/', landmark: /GiBiScore/i},
    {path: '/live', landmark: /Live/i},
    {path: '/competitions', landmark: /Competizioni/i},
    {path: '/stats', landmark: /Statistiche/i},
    {path: '/predictions', landmark: /Pronostici/i},
    {path: '/predictions/record', landmark: /Bilancio/i},
    {path: '/injuries', landmark: /Infortunati/i},
    {path: '/compare', landmark: /Confronto/i},
    {path: '/fantacalcio', landmark: /Fantacalcio/i},
    {path: '/fantacalcio/asta', landmark: /Asta|Configura/i},
    {path: '/fantacalcio/formazione', landmark: /Formazione/i},
    {path: '/signin', landmark: /Accedi/i},
];

for (const {path, landmark} of PAGES) {
    test(`apre ${path}`, async ({page}) => {
        const loud = await open(page, path);
        await expect(page.locator('h1').first()).toBeVisible();
        await expect(page.locator('body')).toContainText(landmark);
        expect(loud, `${path}: ${loud.join(' | ')}`).toEqual([]);
    });
}

test('la scocca è su ogni pagina', async ({page}) => {
    // A page that draws itself without the database: the shell is what is being checked here.
    await open(page, '/compare');
    await expectShell(page);
});

test('la fila delle statistiche segna la pagina in cui sei', async ({page}) => {
    await open(page, '/injuries');
    const row = page.getByRole('navigation', {name: /pagine delle statistiche/i});
    await expect(row).toBeVisible();
    await expect(row.locator('a[aria-current="page"]')).toHaveCount(1);
    // From here the others are one tap away.
    await row.getByRole('link', {name: 'Confronto'}).click();
    await expect(page).toHaveURL(/\/compare/);
});

test('inglese sotto /en, con il cambio lingua che riporta indietro', async ({page}) => {
    await open(page, '/en/predictions');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('body')).toContainText(/Predictions/i);
    await page.getByRole('button', {name: /italiano/i}).click();
    await expect(page).toHaveURL(/\/predictions$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
});

test('una pagina che non esiste risponde con la sua 404', async ({page}) => {
    await page.goto('/questa-pagina-non-esiste');
    await expect(page.locator('body')).toContainText(/404|non trovata/i);
});

test('la ricerca porta ai risultati', async ({page}) => {
    await open(page, '/search?q=inter');
    await expect(page.locator('body')).toContainText(/inter/i);
});

test("dalla home si apre la pagina di una partita, quando ce n'è una", async ({page}) => {
    await open(page, '/');
    const match = page.locator('a[href*="/matches/"]').first();
    if ((await match.count()) === 0) test.skip(true, 'nessuna partita in lista oggi');
    const href = await match.getAttribute('href');
    await open(page, href!);
    await expect(page.locator('h1').first()).toBeVisible();
});
