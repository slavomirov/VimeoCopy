# 🎬 VimeoCopy — Video Hosting & Sharing Platform

> **Built with AI** — This is one of the projects I'm building with the assistance of AI tools as part of my development workflow.

A full-stack video hosting and media management platform inspired by Vimeo. Upload, organize, share, and stream videos, images, and audio — all with a custom-built player, project organization, shareable links, and subscription-based storage plans.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![.NET](https://img.shields.io/badge/.NET-8-512BD4?logo=dotnet&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![SQL Server](https://img.shields.io/badge/SQL%20Server-CC2927?logo=microsoftsqlserver&logoColor=white)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare%20R2-F38020?logo=cloudflare&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-008CDD?logo=stripe&logoColor=white)

---

## Features

### Media Management
- **Multi-format uploads** — Video (MP4, WebM, MOV, MPEG), images (PNG, JPG), and audio (MP3, OGG)
- **Drag-and-drop** batch uploads with real-time progress tracking
- **Direct-to-S3 uploads** via presigned URLs for fast, scalable file transfers
- **Custom thumbnails** — Scrub through video frames and capture a thumbnail, or upload your own
- **Visibility controls** — Toggle media between public and private

### Custom Media Player
- Full-featured HTML5 player supporting video, audio, and image viewing
- Playback speed control (0.25x–2x), volume, seek, fullscreen
- Keyboard shortcuts (Space, K, M, arrows, etc.)
- Buffering visualization and hover-preview on the progress bar
- Metadata overlay (file name, owner, project, description)
- Embeddable player for external sites via `/embed/:mediaId`

### Projects
- Organize media into projects with titles, descriptions, and thumbnails
- Drag-and-reorder media within projects
- Add existing or upload new media directly into a project
- Project gallery with media count previews

### Sharing
- Generate time-limited share links (up to 7 days) for any media
- Public share viewer with expiration notice — no login required
- Embed code generation for integrating media on external sites

### Authentication
- Email/password registration and login
- Google OAuth integration
- JWT access tokens with automatic refresh token rotation
- HttpOnly secure cookie storage for refresh tokens
- CSRF protection on sensitive endpoints

### Subscription Plans & Payments
| Plan | Storage | Bandwidth | Price |
|------|---------|-----------|-------|
| Free | 10 GB | 30 GB | €0/mo |
| Silver | 200 GB | 800 GB | €15/mo |
| Gold | 1 TB | 2 TB | €35/mo |
| Platinum | 2 TB | 4 TB | €60/mo |

- Stripe Checkout integration for plan purchases
- Automated plan expiration with email notifications (1 day before, on expiry, 3 days after)
- Storage tracking per user with enforcement on upload

### Other
- Dark/light theme with OS preference detection
- Responsive design with collapsible sidebar navigation
- Public media gallery with search and filtering (by owner, project, filename)
- Email notifications via Resend

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 5.9, Vite, React Router 7 |
| **Backend** | .NET 8, ASP.NET Core, Entity Framework Core |
| **Database** | SQL Server |
| **Object Storage** | Cloudflare R2 (S3-compatible) |
| **Auth** | ASP.NET Identity, JWT Bearer, Google OAuth |
| **Payments** | Stripe Checkout + Webhooks |
| **Email** | Resend |

---

## Architecture

```
┌─────────────┐        ┌──────────────┐        ┌──────────────┐
│   React SPA │──API──▶│  ASP.NET Core│──EF───▶│  SQL Server  │
│  (Vite/TS)  │        │   Web API    │        │              │
└──────┬──────┘        └──────┬───────┘        └──────────────┘
       │                      │
       │  presigned URLs      │  presigned URLs
       ▼                      ▼
┌──────────────────────────────┐
│      Cloudflare R2 (S3)     │
│   media + thumbnails store  │
└──────────────────────────────┘
```

**Upload flow:** Frontend requests presigned PUT URLs from the API → browser uploads files directly to R2 → frontend confirms upload with metadata → API saves the record and tracks storage usage.

**Sharing flow:** Owner generates a token-based share link → anyone with the link hits a public endpoint → API returns a short-lived presigned GET URL for the media.

---

## Project Structure

```
VimeoCopy/                    # React frontend
├── src/
│   ├── Auth/                 # Authentication (JWT, OAuth, context)
│   ├── components/           # Pages & UI components
│   ├── hooks/                # Custom hooks (file uploader)
│   ├── Payments/             # Stripe checkout page
│   ├── theme/                # Dark/light theme provider
│   └── utils/                # Thumbnail generator
│
VimeoCopyAPI/                 # .NET 8 backend
├── VimeoCopyAPI/
│   ├── Controllers/          # API endpoints
│   ├── Data/                 # EF Core DbContext
│   ├── Middlewares/          # CSRF, error handling
│   ├── Models/               # Entities & DTOs
│   ├── Services/             # Business logic
│   ├── Addons/               # Background services
│   └── Migrations/           # EF Core migrations
```

---

## License

This project is for educational and portfolio purposes.
