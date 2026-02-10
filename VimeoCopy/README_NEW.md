# VimeoCopy - Video & Media Management Platform

A modern, feature-rich web application for managing, uploading, and sharing video and media content. Built with React, TypeScript, and Vite.

## 🚀 Features

- **User Authentication**: Secure login and registration with email/password and social login (Google)
- **Media Upload**: Easy drag-and-drop file upload support for images, videos, and audio
- **Media Gallery**: Browse and manage your media library with beautiful grid layout
- **User Profile**: View and manage your uploaded content
- **Premium Features**: Purchase premium subscription for advanced capabilities
- **Responsive Design**: Beautiful UI that works seamlessly on all devices
- **Real-time Notifications**: Toast notifications for user feedback

## 🛠️ Tech Stack

- **Frontend**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Modern CSS with design system
- **Routing**: React Router DOM
- **State Management**: React Context API
- **Notifications**: React Hot Toast
- **HTTP Client**: Fetch API with auth wrapper
- **Authentication**: JWT-based with refresh token flow

## 📋 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your API endpoint in `src/config.ts`:
   ```typescript
   export const API_BASE_URL = "http://localhost:5000";
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The application will open at `http://localhost:5173`

## 📚 Project Structure

```
src/
├── Auth/                 # Authentication components and hooks
│   ├── AuthContext.ts   # Context for auth state
│   ├── AuthProvider.tsx # Provider component
│   ├── Login.tsx        # Login form
│   ├── Register.tsx     # Registration form
│   └── useAuth.ts       # Auth hook
├── components/          # UI components
│   ├── ProfilePage.tsx  # User profile page
│   ├── Upload.tsx       # File upload component
│   └── Video.tsx        # Media gallery
├── Payments/            # Payment integration
│   └── BuyPage.tsx      # Purchase page
├── App.tsx              # Main app component
├── App.css              # Application styles
├── index.css            # Global styles
└── config.ts            # Configuration
```

## 🎨 Design System

The application uses a modern, professional design system with:
- **Primary Color**: Blue (#3b82f6)
- **Spacing**: Consistent 4px-based spacing system
- **Typography**: Professional sans-serif font stack
- **Shadows**: Subtle to prominent depth layers
- **Responsive**: Mobile-first approach with breakpoints

## 🔐 Authentication Flow

1. User registers/logs in with email and password
2. Backend validates credentials and returns JWT
3. JWT stored in state and used for authenticated requests
4. Refresh token flow for automatic token renewal
5. Optional social login integration (Google)

## 📤 File Upload

- Supports: Images (PNG, JPG), Videos (MP4, WebM, MOV), Audio (MP3, OGG)
- Pre-signed URL generation for secure S3 upload
- Multi-step upload process with validation
- Real-time upload progress feedback

## 🚦 Available Scripts

```bash
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## 🔗 API Integration

The app communicates with a backend API for:
- `/api/auth/login` - User authentication
- `/api/auth/register` - User registration
- `/api/auth/refresh` - Token refresh
- `/api/media` - Get media list
- `/api/media/{id}/url` - Get media URL
- `/api/Upload/url` - Get pre-signed upload URL
- `/api/Upload/complete` - Complete upload
- `/api/payments/test` - Initiate payment

## 📱 Mobile Responsive

- Optimized for desktop, tablet, and mobile
- Flexible grid layouts
- Touch-friendly button sizes
- Responsive navigation

## 🎯 Future Enhancements

- Advanced search and filtering
- Video transcoding and optimization
- Advanced analytics and insights
- Collaboration features
- API for third-party integrations

## 📄 License

MIT License - feel free to use this project as you wish

## 🤝 Support

For issues or questions, please open an issue or contact support.
