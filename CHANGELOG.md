# Changelog

## v0.2.0 - Styling & Navigation

- feat: replicate original home page layout with two-column design
- feat: match original light/dark color schemes from legacy app
- feat: add Lato and Merriweather font families
- feat: create navigation components (journal cards, page list, entry viewer)
- feat: add mock data for journals and entries
- feat: add theme-aware logo component
- feat: add floating action buttons for edit/save/delete actions
- feat: add tag pill components with theme colors
- feat: add journal header with settings and data buttons
- feat: add page header with date/time display
- feat: add changelog modal accessible from version number
- feat: add back navigation arrows on all sub-screens
- fix: header content overlapping Android notification bar
- fix: journal cards and new journal button now share the same flex row
- fix: "About Canto" link now opens the GitHub repository

## v0.1.0 - Repository Setup

- feat: initialize Expo SDK 55 project with TypeScript strict mode
- feat: set up Expo Router for file-based navigation
- feat: add light/dark theme system with AsyncStorage persistence
- feat: add i18n support (English / Portuguese)
- feat: add path aliases (@/ -> src/)
- chore: configure ESLint 10 flat config with TypeScript rules
- chore: add Prettier for code formatting
- chore: add Husky + lint-staged pre-commit hooks
- chore: add Jest + jest-expo testing setup
