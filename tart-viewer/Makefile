rebuild:
	rm -rf node_modules &&  pnpm install && pnpm dev

update-deps:
	pnpm update

install:
	pnpm install

lint:
	pnpm run lint

lint-check:
	pnpm exec eslint . --max-warnings 0

puppet: puppet-install
	pnpm run test:console

puppet-install:
	npx puppeteer browsers install chrome
