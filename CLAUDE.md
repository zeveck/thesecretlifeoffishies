# Project Guidelines

## Testing

All tests must pass before committing or pushing. A pre-commit hook enforces this automatically.

- `npm test` — runs unit tests (Vitest) and E2E tests (Playwright)
- `npm run test:unit` — unit tests only
- `npm run test:e2e` — E2E tests only

## Project Structure

- `js/` — game source modules (ES modules)
- `tests/unit/` — Vitest unit tests
- `tests/e2e/` — Playwright E2E tests
- `style.css` — all styles
- `index.html` — single page app
