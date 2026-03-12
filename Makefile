.PHONY: install patch start android ios web lint lint-fix format typecheck test test-watch test-coverage emulator check clean

# --- Setup ---

install:
	npm install --legacy-peer-deps
	$(MAKE) patch

patch:
	@echo "Patching foojay-resolver for Gradle 9 compatibility..."
	@sed -i 's/foojay-resolver-convention").version("0.5.0")/foojay-resolver-convention").version("1.0.0")/' \
		node_modules/@react-native/gradle-plugin/settings.gradle.kts 2>/dev/null || true

# --- Run ---

start:
	npx expo start

android: patch
	npx expo run:android

ios: patch
	npx expo run:ios

web:
	npx expo start --web

emulator:
	@avd=$$(emulator -list-avds | head -1); \
	if [ -z "$$avd" ]; then echo "No AVDs found. Create one in Android Studio Device Manager."; exit 1; fi; \
	echo "Starting emulator: $$avd"; \
	emulator -avd "$$avd" &

# --- Quality ---

lint:
	npx eslint . --ext .ts,.tsx

lint-fix:
	npx eslint . --ext .ts,.tsx --fix

format:
	npx prettier --write "**/*.{ts,tsx,json,md}"

format-check:
	npx prettier --check "**/*.{ts,tsx,json,md}"

typecheck:
	npx tsc --noEmit

test:
	npx jest

test-watch:
	npx jest --watch

test-coverage:
	npx jest --coverage

check: lint typecheck test

# --- Clean ---

clean:
	rm -rf android ios dist .expo coverage
