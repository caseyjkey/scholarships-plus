# Scholarships Plus

A framework to help Indigenous students organize, apply to, and track scholarship applications throughout their academic journey.

## Mission

Scholarship applications are competitive, time-consuming, and often overwhelming. For Indigenous students, who may be first-generation college applicants or have limited access to guidance counseling, the process can feel especially daunting.

Scholarships Plus is designed to:

- **Organize** scholarship opportunities in one centralized location
- **Guide** students through the application process with structured workflows
- **Improve** essays through AI-powered feedback and iteration
- **Track** application status and outcomes across multiple academic years
- **Learn** from successful applications to refine future strategies

The long-term vision is multi-year support: as a student progresses through their education, the platform tracks their growth and reflects that progression in their applications. Each year builds on the last, iterating on what works and learning from scholarships that were awarded.

## Features

- **Scholarship Management**: Create, read, update, and delete scholarship listings with deadlines, requirements, and status tracking
- **Essay Development**: Draft, refine, and iterate on scholarship essays with version history
- **AI-Powered Feedback**: Get intelligent suggestions for improving essay clarity, tone, and impact
- **Application Tracking**: Monitor submission status, award notifications, and renewal requirements
- **Progress Analytics**: View application history and success rates across academic years
- **Multi-Year Profiles**: Maintain a longitudinal record of growth and achievement
- **Chrome Extension**: Auto-fill scholarship applications with AI-approved responses using sparkle icons

## Chrome Extension

The Scholarships Plus Chrome Extension helps you auto-fill scholarship applications with AI-approved responses.

### Installation

1. **Create extension icons** (optional - for development):
   ```bash
   cd chrome-extension/scripts
   ./create-icons.sh
   ```

2. **Load the extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `chrome-extension/` directory

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Use the extension**:
   - Navigate to a SmarterSelect or OASIS scholarship application
   - You'll see sparkle icons (✨) next to form fields
   - Click a sparkle icon to fill the field with your saved response
   - Open the sidebar to chat with the AI assistant about refining responses

### Features

- **Sparkle Icons** - Visual indicators showing which fields have saved responses
- **Auto-Fill** - Click sparkle icons to instantly fill form fields
- **Chat Sidebar** - AI assistant for refining responses and adding forgotten details
- **Multi-Tab Support** - Work on multiple scholarships simultaneously
- **Real-Time Sync** - Changes save immediately to the database

### Authentication

The extension uses JWT tokens for API authentication:
1. Log in to the web app at `http://localhost:3000`
2. The extension automatically exchanges your session for a JWT token
3. All API calls include the JWT token for secure access

For more details, see [`chrome-extension/README.md`](chrome-extension/README.md) and [`chrome-extension/EXTENSION_SETUP.md`](chrome-extension/EXTENSION_SETUP.md).

## Model Stack

A core differentiator of this platform is the integration of Large Language Models (LLMs) to support essay development and personalization.

### Current Implementation

LLMs are hosted locally through [Ollama](https://ollama.ai):

```bash
ollama run gemma3:12b-it-qat
```

The API is accessed via:

```bash
curl http://localhost:11434/api/generate -d '{"model": "llama2", "prompt":"Why is the sky blue?"}'
```

### Future Vision: LoRA Fine-Tuning

The ultimate goal is to train a **LoRA (Low-Rank Adaptation)** model on each student's unique writing voice. This would enable:

- Essay suggestions that sound authentically like the student
- Personalized feedback that respects the student's tone and perspective
- Authentic voice preservation while enhancing clarity and impact

The model would be trained on the student's own writing—previous essays, personal statements, and reflections—to ensure that any AI assistance amplifies their voice rather than replacing it.

## Tech Stack

- **Framework**: [Remix](https://remix.run) for full-stack React with server-side rendering
- **Database**: PostgreSQL with [Prisma](https://prisma.io) ORM for type-safe database access
- **Authentication**: Email/password with cookie-based sessions
- **Styling**: [Tailwind CSS](https://tailwindcss.com) for utility-first styling
- **Testing**: [Cypress](https://cypress.io) for E2E tests, [Vitest](https://vitest.dev) for unit tests
- **Code Quality**: [Prettier](https://prettier.io) for formatting, [ESLint](https://eslint.org) for linting
- **Type Safety**: [TypeScript](https://typescriptlang.org) throughout

## Development

### Prerequisites

- Node.js 18+
- Docker (for local database)

### Initial Setup

1. Start the Postgres database in Docker:

```sh
npm run docker
```

> **Note**: The npm script will complete while Docker sets up the container in the background. Ensure that Docker has finished and your container is running before proceeding.

2. Configure environment variables:

```sh
cp .env.example .env
npm run setup
```

3. Run the initial build:

```sh
npm run build
```

4. Start the development server:

```sh
npm run dev
```

This starts your app in development mode, rebuilding assets on file changes.

### Seed Data

The database seed script creates a user with sample data for testing:

- Email: `rachel@remix.run`
- Password: `racheliscool`

## Relevant Code

The application follows a clean separation of concerns:

- **Authentication**: User creation, login/logout flows [`app/models/user.server.ts`](app/models/user.server.ts)
- **Session Management**: Session verification and middleware [`app/session.server.ts`](app/session.server.ts)
- **Essay Management**: CRUD operations for scholarship essays [`app/models/essay.server.ts`](app/models/essay.server.ts)

## Testing

### Cypress (E2E Tests)

End-to-end tests are located in the `cypress` directory. We use [`@testing-library/cypress`](https://testing-library.com/cypress) for semantic element selection.

Run tests in development:

```sh
npm run test:e2e:dev
```

This starts both the dev server and Cypress client. Ensure the database is running in Docker.

#### Testing Authenticated Features

A utility is provided to test authenticated features without going through the login flow:

```ts
cy.login();
// you are now logged in as a new user
```

Clean up test users automatically:

```ts
afterEach(() => {
  cy.cleanupUser();
});
```

### Vitest (Unit Tests)

For lower-level tests of utilities and individual components. We have DOM-specific assertion helpers via [`@testing-library/jest-dom`](https://testing-library.com/jest-dom).

### Type Checking

This project uses TypeScript throughout. Run type checking across the entire project:

```sh
npm run typecheck
```

### Linting & Formatting

- **Linting**: ESLint is configured in `.eslintrc.js`
- **Formatting**: Prettier handles auto-formatting. Run `npm run format` to format all files, or install an editor plugin for auto-format on save

## GitHub Actions

Continuous integration and deployment are handled via GitHub Actions. All commits to `main` run tests and type checking before allowing deployment. This ensures code quality and catches issues early.

---

**Built with passion for Indigenous student success.**

If you have questions, feedback, or want to contribute, please reach out.

## Scholarship Scraper & Agentic Chat

### Developer Scholarship Indexing

The platform includes a Puppeteer-based scraper for indexing scholarships from external portals. This is a **developer-only** feature for building the scholarship database.

**Available Portals:**
- Native Forward Scholars (scholars.nativeforward.org)
- AISES (www.aises.org)
- Cobell Scholarship (cobellscholar.org)

**Usage:**

```bash
# Scrape Native Forward scholarships
npx tsx scripts/scrape-scholarships.ts nativeforward

# Scrape AISES scholarships
npx tsx scripts/scrape-scholarships.ts aises

# Scrape Cobell scholarships
npx tsx scripts/scrape-scholarships.ts cobell
```

**How it works:**
1. Launches a visible browser window
2. Opens the scholarship portal login page
3. Developer logs in manually (handles 2FA, captchas, etc.)
4. System captures session cookies
5. Scrapes all scholarships from the portal
6. Stores in database for agentic chat to use

**Session Persistence:**
- Admin sessions last 30 days
- Re-run scraper anytime to refresh scholarship data
- Session stored in `AdminPortalSession` table

### Agentic Chat Flow

The agentic chat helps students complete scholarship applications by:
1. Listing available scraped scholarships
2. Asking scholarship-specific questions
3. Searching past essays for relevant content (RAG)
4. Guiding user through each requirement
5. Collecting application data in flexible JSON format

**Architecture:**
- Powered by scraped scholarship data
- RAG integration with user's past essays
- Flexible question/answer storage (JSON)
- Supports referrals and varying requirements

**Data Model:**
- `ScrapedScholarship` - Indexed scholarship data
- `Application` - Tracks application progress with flexible `answers` JSON column
- `PortalSession` - User's portal sessions for submission

---


