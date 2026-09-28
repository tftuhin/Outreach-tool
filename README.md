# Outreach Tool

A powerful, Next.js-based lead management and email outreach application. This tool allows you to manage leads across different modules, connect your Gmail account, send rich-text emails, and track email conversations directly from the dashboard.

## Features

- **Lead Management**: Organize leads into modules (e.g., Dentist, Plumber).
- **Email Outreach**: Connect your Gmail account via OAuth2 to send and reply to emails directly.
- **Rich Text Editor**: Compose emails with a fully-featured WYSIWYG editor, including support for custom HTML signatures, CC, and BCC.
- **Conversation Tracking**: Automatically fetches and threads replies from leads so you can keep track of conversations without leaving the app.
- **Import/Export**: Import leads in bulk via CSV or JSON, with automatic duplicate detection. Export leads for external reporting.
- **Status Workflows**: Track leads through states like Pending, Outreached, and Responded, with auto-advancing logic.
- **Database Backend**: Powered by a robust PostgreSQL database (via Neon).

## Tech Stack

- **Frontend**: Next.js (App Router), React, ReactQuill
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Neon Serverless Postgres), `pg` library
- **Integrations**: Google APIs (`googleapis`), OAuth2

## Getting Started

### Prerequisites

- Node.js 18+ 
- A PostgreSQL Database (Neon recommended)
- Google Cloud Project with Gmail API enabled (for OAuth credentials)

### Environment Variables

Create a `.env.local` file in the root directory and add the following:

```env
DATABASE_URL=your_postgresql_database_url
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Connect Gmail**: Go to the Settings panel and click "Connect Gmail" to authorize the app to send emails on your behalf.
2. **Add Signature**: Set up your custom email signature in the Settings panel (HTML supported).
3. **Import Leads**: Click "Import" to upload a CSV or JSON file of leads.
4. **Outreach**: Select a lead in the "Pending" tab, review their details, edit the drafted email, and click "Send via Gmail".

## License

This project is licensed under the MIT License.
