
# Debate Platform Frontend

React-based frontend with Tailwind CSS for the debate platform.

## Features

- **Information Hiding**: Participants never see game mode or opponent type
- **Role-Based UI**: Different interfaces for admin and participants
- **Real-time Debates**: Live argument submission and viewing
- **User Management**: Admin can create participant accounts

## Setup

1. Install dependencies:

```bash

npm install

```

2. Create environment file:

```bash

cp .env.example .env

```

3. Start development server:

```bash

npm run dev

```

The app will open at http://localhost:3000

## Project Structure

```

src/

├── components/

│   ├── admin/           # Admin dashboard components

│   │   ├── AdminDashboard.jsx

│   │   ├── UserManagement.jsx

│   │   ├── SessionManagement.jsx

│   │   └── DebateMonitoring.jsx

│   ├── participant/     # Participant components

│   │   ├── ParticipantDashboard.jsx

│   │   └── DebateInterface.jsx

│   └── LoginPage.jsx    # Shared login

├── context/

│   └── AuthContext.jsx  # Authentication context

├── services/

│   └── api.js          # API service layer

├── App.jsx             # Main app with routing

└── main.jsx            # Entry point

```

## User Roles

### Admin

- Create participant accounts
- Manage sessions (Human-Human or Human-AI)
- Monitor debates
- End debates early

### Participant

- Join debates when session is active
- Select topic and stance
- Submit arguments
- View debate history
- **Cannot see**: game mode, opponent identity (AI vs human)

## Default Credentials

Admin: username=admin, password=admin123

(Create participant accounts through admin dashboard)

'''

# 20. .gitignore

frontend_files['.gitignore']='''# Logs

logs

*.log

npm-debug.log*

yarn-debug.log*

yarn-error.log*

pnpm-debug.log*

lerna-debug.log*

node_modules

dist

dist-ssr

*.local

# Editor directories and files

.vscode/*

!.vscode/extensions.json

.idea

.DS_Store

*.suo

*.ntvs*

*.njsproj

*.sln

*.sw?

# Environment variables

.env

.env.local

.env.production
