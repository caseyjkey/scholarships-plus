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
