# Canto

A private, encrypted journaling app for Android, iOS, and Web.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- npm >= 10
- [Android Studio](https://developer.android.com/studio) (for Android emulator)
- [Expo Go](https://expo.dev/go) app on your phone (for physical device testing)

## Setup

```bash
# Install dependencies
npm install

# Set up git hooks
npx husky
```

## Running the app

```bash
# Start the development server
npm start

# Run on Android emulator
npm run android

# Run on iOS simulator (macOS only)
npm run ios

# Run in web browser
npm run web
```

For physical device testing, run `npm start` and scan the QR code with Expo Go.

## Development

```bash
# Type checking
npm run typecheck

# Lint
npm run lint
npm run lint:fix

# Format
npm run format
npm run format:check

# Tests
npm test
npm run test:watch
npm run test:coverage
```

## Project structure

```
canto/
├── app/                    # Expo Router screens (file-based routing)
│   ├── _layout.tsx         # Root layout with theme & i18n providers
│   ├── index.tsx           # Home screen (journal list)
│   ├── journal/[id].tsx    # Journal screen (page list)
│   └── page/[id].tsx       # Page screen (entry editor)
├── src/
│   ├── components/         # Reusable UI components
│   ├── models/             # TypeScript interfaces & data classes
│   ├── lib/                # Utility functions
│   ├── hooks/              # Custom React hooks
│   ├── i18n/               # Internationalization (en, pt)
│   ├── styles/             # Theme definitions (light, dark)
│   └── assets/             # Fonts, images
├── __tests__/              # Test files
└── .husky/                 # Git hooks
```

## Building for production

```bash
# Build Android APK locally
npx expo run:android

# Or use EAS Build (requires expo account)
npx eas build --platform android
```

## License

Free and open source.
