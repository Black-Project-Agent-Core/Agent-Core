---
name: replica-backend
description: "Builds the backend of an app clone: auth, database migrations and access rules, payments with Stripe, email, background jobs and third-party integrations through official APIs only, plus a security checklist. Use when the user says \"add login\", \"set up auth\", \"wire up the database\", \"add payments\", \"connect Stripe\", \"add Google Calendar\", \"send emails\", \"backend for my clone\", or when /replica-build is running on fake data."
license: MIT
compatibility: "Agent Core adapter: existing grants and available tools; Windows-safe equivalent commands; load references only when relevant."
metadata:
  upstream-repository: "https://github.com/Jakeschincariol/replica-skill"
  upstream-commit: 77c9436fb3d18c3d58169efb8caf4fe906b0dc51
  upstream-path: replica-backend
  adapter-revision: "1"
---
## Triggers
- Tambahkan auth, database, pembayaran dan integrasi backend clone.
- Apply when the current task matches the upstream purpose and workflow below.

## Non-triggers
- Tasks unrelated to this capability; a shared keyword alone is insufficient.
- Replica workflows require an app reconstruction/clone context, not ordinary unrelated maintenance.

## Agent Core integration
Read the compact `agent-core-capability-index` first, then this selected Skill through every returned fragment. Apply relevant steps and record actual use/evidence; reading or availability alone is not use. Current user instructions, host rules and task scope take precedence over upstream defaults. Do not repeat approval already given. Reassess applicability when the task changes.
Use the existing Agent Core owners and granted tools. Map Claude-specific tool names to available equivalents, use background `browser_control`/OBU for browser work, and adapt shell examples to Windows PowerShell safely. If a required operation is unavailable, report that exact gap; never claim an unperformed operation. A Skill is a workflow, not permission to install dependencies, publish, send messages, change credentials, or execute every example.
Sibling Skills are separate catalog entries: inspect their current digest and read only if selected. References below are artifact-local. Use relevant sections only; do not pre-load the whole pack. Agent/persona examples use the current approved subagent profile and ownership rules.


## Upstream workflow

# replica-backend

Reads `replica/architecture.md`. Writes migrations and server code, and keeps
`replica/backend.md` (checklist below) up to date.

## The rules

- **Official, public APIs only, with the user's own keys.** Never call the
  original app's private endpoints, never reuse its OAuth client, never proxy
  through it.
- **The user creates accounts and keys.** Claude never signs up for services,
  never types a password, card or live key. The user creates the Stripe,
  Supabase, Resend or Google Cloud project and puts keys in `.env.local`.
  Claude writes `.env.example` with every variable name and no values.
- **Test mode first.** Stripe test keys and test cards until replica-deploy.

## Auth

- Email sign up with verification, password reset, magic link if the original
  has it. OAuth (Google, Apple) with the user's own developer apps.
- Sessions: http-only secure cookies. Sign out everywhere.
- Roles and teams if the recon map has them: owner, admin, member, with one
  function that answers "can this user do this to this record".
- Account deletion that actually deletes. Apple requires it for apps with
  sign up.

## Database

- Migrations from `architecture.md`, checked in, run by a script.
- Access rules on every table: row level security policies on Supabase, or
  the authorisation function called in every query. Test it: a second user
  must get nothing back.
- Seed script with realistic fake data (no real people).
- Backups on (the host's daily backups count, check they are enabled).

## Payments

- Stripe Checkout for sign up to a plan, the Customer Portal for changes and
  cancelling. Do not build card forms.
- Webhooks: verify the signature, store the event id, make every handler
  idempotent (Stripe retries). Handle `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.payment_failed`.
- Subscription status lives in your database, updated by webhooks, read by
  your app. Never trust the client.
- Cancelling is one click. Hard-to-cancel billing is a top complaint about
  most apps, and in many places it is illegal.

## Email and jobs

- Transactional email through Resend or Postmark from your own domain.
  Templates written fresh.
- Jobs for anything time-based (reminders, digests, sync, cleanup) with
  retries and a dead-letter log. Times in UTC, shown in the user's zone.

## Integrations

For each integration in the feature matrix: the official API, the OAuth
scopes needed (fewest possible), the provider's review process, rate limits.
Google scopes like Calendar need Google's OAuth verification before public
launch, which takes weeks. Start it early and write that in `backend.md`.

## Security checklist

- [ ] secrets only in env vars, `.env*` in `.gitignore`, nothing in client bundles
- [ ] input validated on the server (zod or similar) on every route
- [ ] authorisation checked on every read and write, tested with a second user
- [ ] rate limits on auth, sign up, and anything that sends email or SMS
- [ ] webhooks verify signatures
- [ ] uploads: size and type limits, served from a separate domain or bucket
- [ ] no user data in URLs or logs
- [ ] dependencies audited (`npm audit`)
- [ ] privacy policy lists every processor (Stripe, Resend, host, analytics)

## Output

Working auth, database, payments in test mode, email and the integrations,
`.env.example`, `replica/backend.md` with the checklist ticked, feature
matrix rows updated. Next: `/replica-test`.
