# Tech Timesheet

A secure, self-hosted timesheet and billing management application for UK B2B contractors and agencies.

## Features

- Timesheet creation, submission, and approval workflows
- Client management with full UK B2B invoice billing fields
- Project and expense tracking
- Invoice generation with Xero integration
- Email and portal-based client approval flows
- Multi-factor authentication (TOTP)
- Role-based access control (Admin / Manager)
- Immutable audit log
- Customisable appearance (colours, font, layout)

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Auth**: NextAuth v4 (JWT, credentials + TOTP MFA)
- **Database**: PostgreSQL via Prisma 5
- **Styling**: Tailwind CSS v3
- **Validation**: Zod

## Development

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

## Database migrations

```bash
# Apply pending migrations to production
npm run db:migrate

# Explore data
npm run db:studio
```

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret for JWT signing |
| `NEXTAUTH_URL` | Public URL of the app |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM (MFA secrets) |
