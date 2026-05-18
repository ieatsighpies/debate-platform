# README - Start Here! 👋

Welcome to the **Debate Platform**! This is a real-time web app for structured debates between humans and AI.

## 🚀 Get Started in 2 Steps

```bash
# Step 1: Start everything with Docker
docker compose up

# Step 2: Open browser
# Frontend: http://localhost:5173
# Admin dashboard available after login
```

Done! ✓

---

## 📚 Documentation Map

**New to the project?**
→ Read [ONBOARDING.md](ONBOARDING.md) (15 min read, covers everything)

**Questions about setup?**
→ See [DOCKER_SETUP.md](DOCKER_SETUP.md) (fastest path with Docker)

**Need API documentation?**
→ Check [API_REFERENCE.md](API_REFERENCE.md) (all endpoints + examples)

**Understanding the data model?**
→ Review [DATA_MODEL_REFERENCE.md](DATA_MODEL_REFERENCE.md) (database schema)

**Deep technical dive?**
→ Read [README_IMPLEMENTATION_REFERENCE.md](README_IMPLEMENTATION_REFERENCE.md) (internals)

**WebSocket events?**
→ See [WEBSOCKET_COMMUNICATIONS.md](WEBSOCKET_COMMUNICATIONS.md) (real-time events)

**What was just refactored?**
→ Check [CONSOLIDATION_SUMMARY.md](CONSOLIDATION_SUMMARY.md) (recent changes)

**Ideas for improvements?**
→ See [IMPROVEMENTS.md](IMPROVEMENTS.md) (future enhancements & research opportunities)

---

## 🏗 Tech Stack

| Layer      | Tech                          |
| ---------- | ----------------------------- |
| Frontend   | React 18 + Vite + TailwindCSS |
| Backend    | Node.js + Express + Socket.IO |
| Database   | MongoDB                       |
| AI         | OpenAI GPT-4o mini            |
| Deployment | Docker + Docker Compose       |

---

## 📁 Project Structure

```
debate-platform/
├── 📄 ONBOARDING.md                ← Start here!
├── 📄 DOCKER_SETUP.md              ← How to run it
├── 📄 API_REFERENCE.md             ← API docs
├── 📄 DATA_MODEL_REFERENCE.md      ← Database schema
├── 📄 CONSOLIDATION_SUMMARY.md     ← What changed
│
├── 🐳 docker-compose.yml           ← One-command startup
├── 🐳 init-mongo.js                ← Database init
│
├── 📁 backend/                     ← Express API + logic
│   ├── Dockerfile
│   ├── routes/debates.js           ← Main endpoints
│   ├── models/Debate.js            ← Data model
│   ├── services/aiService.js       ← OpenAI integration
│   └── ...
│
├── 📁 frontend/                    ← React app
│   ├── Dockerfile
│   ├── src/
│   ├── components/
│   └── ...
│
└── 📁 fyp-data/                    ← Research data & thesis
```

---

## 🎯 Quick Commands

```bash
# Start all services
docker compose up

# View logs (all services)
docker compose logs -f

# Stop services
docker compose down

# Restart specific service
docker compose restart backend

# See running services
docker compose ps

# Execute command in container
docker compose exec backend npm test
```

---

## ✨ Key Features

✅ **Real-time debates** - WebSocket-powered live updates
✅ **AI opponents** - GPT-4o mini personalities with custom prompting
✅ **Data collection** - Pre/post surveys + belief tracking
✅ **Admin dashboard** - Monitor debates + manual controls
✅ **Guest accounts** - Anonymous participation
✅ **Turn validation** - Prevents logic errors
✅ **Docker-ready** - Consistent dev environment

---

## 🐛 Troubleshooting

### "Services won't start"

```bash
# Check logs
docker compose logs

# Rebuild images
docker compose up --build

# Full reset
docker compose down -v && docker compose up
```

### "Can't access frontend"

- Wait 10-15 seconds for services to start
- Check http://localhost:5173
- View logs: `docker compose logs frontend`

### "MongoDB connection error"

- MongoDB takes 10-15 seconds to start
- Check health: `docker compose ps`
- View MongoDB logs: `docker compose logs mongodb`

---

## 📖 First Time? Here's Your Path

1. ✅ You're reading this!
2. ✅ Open [ONBOARDING.md](ONBOARDING.md) (detailed guide)
3. ✅ Run `docker compose up` (start services)
4. ✅ Open http://localhost:5173 (test frontend)
5. ✅ Read [API_REFERENCE.md](API_REFERENCE.md) (understand endpoints)
6. ✅ Check [DATA_MODEL_REFERENCE.md](DATA_MODEL_REFERENCE.md) (database structure)
7. ✅ Make a small code change + see hot-reload
8. ✅ Ready to contribute! 🚀

---

## 🎓 About This Project

This platform was built as part of a **Final Year Project (FYP)** studying persuasion dynamics in human-AI debates.

Research materials: `fyp-data/fyp-report/` (LaTeX thesis)
Analysis & data: `fyp-data/outputs/` & `fyp-data/final_analysis.ipynb`- Future improvements: See [IMPROVEMENTS.md](IMPROVEMENTS.md) for research enhancement ideas

---

## 💡 Pro Tips

- **Hot reload**: Code changes auto-reload (Vite frontend + Nodemon backend)
- **Logging**: Backend logs include `[Module]` prefix for easy filtering
- **Database**: Connect directly: `docker compose exec mongodb mongosh`
- **Testing**: Use Postman/cURL to test API endpoints
- **Debug**: Enable socket logs: `localStorage.debug = 'socket.io-client:*'`

---

## 🤝 Contributing

1. Make code changes (they auto-reload in Docker)
2. Check logs for errors
3. Test in browser or with cURL
4. Commit with clear message
5. Push and create PR

---

## ❓ Questions?

1. **Setup issues?** → [DOCKER_SETUP.md](DOCKER_SETUP.md)
2. **Need API docs?** → [API_REFERENCE.md](API_REFERENCE.md)
3. **Data questions?** → [DATA_MODEL_REFERENCE.md](DATA_MODEL_REFERENCE.md)
4. **General info?** → [ONBOARDING.md](ONBOARDING.md)
5. **Backend logs:** `docker compose logs -f backend`
6. **Frontend logs:** Browser DevTools Console (F12)

---

## 🎉 Ready?

```bash
docker compose up
# Then open http://localhost:5173
```

Welcome aboard! 🚀

---

**Last updated:** May 18, 2026
**Status:** ✅ Docker setup ready | ✅ Full documentation | ✅ Optimized for onboarding
