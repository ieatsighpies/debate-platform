# Docker & Containerization Guide

This guide explains how to run the Debate Platform using Docker and Docker Compose for consistent, reproducible development and deployment.

## Prerequisites

- Docker Desktop (includes Docker and Docker Compose)
  - **macOS/Windows**: Download from [docker.com](https://www.docker.com/products/docker-desktop)
  - **Linux**: Install Docker and Docker Compose separately

Verify installation:

```bash
docker --version
docker compose --version
```

---

## Quick Start with Docker Compose

The simplest way to get the entire platform running:

```bash
# 1. Navigate to project root
cd debate-platform

# 2. Create .env file with OpenAI API key
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# 3. Start all services
docker compose up

# 4. Wait for services to be healthy (30-60 seconds)
# You'll see logs from MongoDB, backend, and frontend

# 5. Access the platform
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000
# MongoDB: localhost:27017
```

That's it! Docker Compose handles:

- Creating and starting MongoDB container
- Building and starting backend server
- Building and starting frontend app
- Setting up networking between services
- Volume mounting for live code updates

---

## What's Running

### Services

| Service  | Port  | URL                   | Purpose                  |
| -------- | ----- | --------------------- | ------------------------ |
| MongoDB  | 27017 | -                     | Database (internal only) |
| Backend  | 3000  | http://localhost:3000 | REST API & WebSocket     |
| Frontend | 5173  | http://localhost:5173 | React app                |

### Environment

- **Node Version**: 18 (Alpine Linux)
- **MongoDB Version**: 7.0
- **Network**: Internal `debate-network` bridge
- **Database**: `debate-db` with username/password auth

---

## Common Docker Compose Commands

### View Running Services

```bash
docker compose ps

# Output:
# NAME                            STATUS
# debate-platform-mongo           running
# debate-platform-backend         running
# debate-platform-frontend        running
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mongodb

# Last 50 lines of backend logs
docker compose logs --tail=50 backend
```

### Stop Services

```bash
# Stop all services (keeps data)
docker compose stop

# Stop and remove containers (keeps volumes)
docker compose down

# Remove everything including volumes/data
docker compose down -v
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart backend
docker compose restart frontend
```

### Rebuild Images

```bash
# Rebuild all images
docker compose up --build

# Rebuild specific service
docker compose up --build backend
```

### Execute Command in Container

```bash
# Run MongoDB command
docker compose exec mongodb mongosh

# Run npm command in backend
docker compose exec backend npm list

# Access backend shell
docker compose exec backend sh
```

---

## Development Workflow

### Making Code Changes

**Frontend & Backend Code**: Changes automatically sync and trigger hot-reload

```bash
# Edit src/App.jsx
# Frontend auto-reloads at http://localhost:5173 (you may see page refresh)

# Edit backend/routes/debates.js
# Backend auto-restarts via nodemon
```

**Environment Variables**: Restart service to apply

```bash
# Edit .env
docker compose restart backend
```

**Dependencies (package.json)**: Rebuild image

```bash
# Add new npm package to backend
cd backend
npm install new-package
# then rebuild
docker compose up --build backend
```

### Debugging

```bash
# View backend logs with timestamp
docker compose logs -f --timestamps backend

# Check service health
docker compose ps

# Test MongoDB connection
docker compose exec backend npm run test:db

# View MongoDB data
docker compose exec mongodb mongosh
# Then in MongoDB shell:
# use debate-db
# db.debates.find().limit(1)
```

### Database Access

```bash
# Connect directly to MongoDB
docker compose exec mongodb mongosh --username admin --password password

# Inside MongoDB shell:
use debate-db
db.users.find()
db.debates.find({ status: 'active' })
```

---

## Production Deployment

For production, modify `docker-compose.yml`:

```yaml
# Set NODE_ENV to production
environment:
  NODE_ENV: production
  # Use production MongoDB (Atlas, managed service, etc.)
  MONGODB_URI: mongodb+srv://user:pass@cluster.mongodb.net/debate-db
  # Use real OpenAI key
  OPENAI_API_KEY: ${OPENAI_API_KEY}
  # Use real JWT secret
  JWT_SECRET: ${JWT_SECRET}
  # Use production frontend URL
  CLIENT_URL: https://yourdomain.com

# Remove volume mounts (use built code)
volumes: []

# Use production start command
command: npm start

# Add resource limits
resources:
  limits:
    cpus: "1"
    memory: 512M
```

Then:

```bash
# Build production images
docker compose build

# Start with production config
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check logs
docker compose logs -f
```

---

## Troubleshooting

### "Port already in use"

```bash
# Port 27017 (MongoDB) already in use
# Find what's using it
lsof -i :27017

# Kill the process or use different port in docker-compose.yml
# Change: ports: - "27017:27017"
# To:     ports: - "27018:27017"
```

### "Cannot connect to Docker daemon"

```bash
# Docker Desktop not running
# macOS: Open /Applications/Docker.app
# Windows: Start Docker Desktop from Start menu
# Linux: sudo systemctl start docker
```

### "Service fails to start"

```bash
# Check logs for error
docker compose logs backend

# Common issues:
# - OPENAI_API_KEY not set: docker compose logs | grep OPENAI
# - MongoDB not healthy: docker compose logs mongodb
# - Port conflict: docker compose ps
```

### "MongoDB connection refused"

```bash
# MongoDB container not ready yet
# Wait 10-15 seconds and try again
# Check health: docker compose ps

# If stuck, rebuild MongoDB
docker compose down -v  # Remove volume
docker compose up mongodb
```

### "Frontend can't reach backend"

```bash
# Check backend is running
docker compose logs backend | grep "listening"

# Verify BACKEND_URL in frontend config
# Should be: http://localhost:3000

# Test from frontend container
docker compose exec frontend curl http://backend:3000
```

---

## File Structure

```
debate-platform/
├── docker-compose.yml      # Service orchestration
├── init-mongo.js           # MongoDB initialization
├── .env                    # Environment variables (create this!)
│
├── backend/
│   ├── Dockerfile          # Backend image definition
│   ├── .dockerignore       # Files to exclude from image
│   ├── package.json
│   ├── server.js
│   └── ... (other backend files)
│
├── frontend/
│   ├── Dockerfile          # Frontend image definition
│   ├── .dockerignore       # Files to exclude from image
│   ├── package.json
│   ├── src/
│   └── ... (other frontend files)
```

---

## Environment Variables

Create `.env` in project root:

```bash
# Required
OPENAI_API_KEY=sk-your-actual-key-here

# Optional (defaults provided in docker-compose.yml)
NODE_ENV=development
JWT_SECRET=dev-secret-change-in-prod
MONGODB_URI=mongodb://admin:password@mongodb:27017/debate-db?authSource=admin
CLIENT_URL=http://localhost:5173
```

---

## Performance Tips

### Reduce Build Time

```bash
# Use layer caching
docker compose up --build

# Don't rebuild if you only changed code (not dependencies)
docker compose up  # Just restart services
```

### Reduce Memory Usage

```bash
# Run only backend + MongoDB
docker compose up backend mongodb

# Stop frontend when not needed
docker compose stop frontend
```

### Monitor Resources

```bash
# Watch CPU/memory usage
docker stats

# View container details
docker compose ps
docker inspect debate-platform-backend
```

---

## Advanced: Custom Configuration

### Use Different MongoDB Version

Edit `docker-compose.yml`:

```yaml
mongodb:
  image: mongo:6.0 # or 5.0, 7.0, etc.
```

### Use External MongoDB

Edit `docker-compose.yml`:

```yaml
backend:
  environment:
    MONGODB_URI: mongodb+srv://user:pass@cluster.mongodb.net/debate-db
```

### Add More Services (Redis, etc.)

Add to `docker-compose.yml`:

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  networks:
    - debate-network
```

---

## Switching Between Docker and Local Development

### Run with Docker

```bash
docker compose up
```

### Run Locally (without Docker)

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

**Ensure MongoDB is running locally:**

```bash
# macOS with Homebrew
brew services start mongodb-community

# Docker alternative (just MongoDB)
docker run -d -p 27017:27017 mongo:7.0
```

---

## Getting Help

- View all services: `docker compose ps`
- View recent logs: `docker compose logs --tail=100`
- Restart everything: `docker compose restart`
- Full reset: `docker compose down -v && docker compose up`
- Check Docker documentation: `docker compose --help`

---

## Next Steps

1. ✅ Run `docker compose up`
2. ✅ Open http://localhost:5173 and test
3. ✅ Check `docker compose logs` if issues
4. ✅ Read [ONBOARDING.md](ONBOARDING.md) for development details
5. ✅ Refer to [API_REFERENCE.md](API_REFERENCE.md) for API usage

Happy developing with Docker! 🐳
