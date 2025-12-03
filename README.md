# Suite | Enterprise AI Platform

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://suite.lovable.app)
[![GitHub](https://img.shields.io/badge/github-DevGruGold/xmrtassistant-blue)](https://github.com/DevGruGold/xmrtassistant)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Built with Lovable](https://img.shields.io/badge/built%20with-Lovable-ff69b4)](https://lovable.dev)

> **Enterprise AI automation platform with intelligent assistants, autonomous operations, and real-time system monitoring**
> 
> *Powered by XMRT-DAO Ecosystem*

---

## 🌟 What is Suite?

Suite is an enterprise-grade AI automation platform featuring a revolutionary multi-AI executive board system. Four specialized AI executives (CSO, CTO, CIO, CAO) work together to provide intelligent assistance, autonomous operations, and real-time monitoring for enterprise workflows.

Built on the foundation of the XMRT-DAO ecosystem, Suite brings cutting-edge AI governance to enterprise environments.

### Live Platform
🚀 **Production:** [suite.lovable.app](https://suite.lovable.app)

---

## 🏛️ The AI Executive Architecture

### Revolutionary Concept: AI-Powered Executive Intelligence

Suite introduces the world's first **AI Executive Board** - four specialized AI decision-makers that provide intelligent, coordinated responses for enterprise operations.

#### The 4 AI Executives

| Role | Engine | Specialization |
|------|--------|----------------|
| **Chief Strategy Officer** | Gemini 2.5 Flash | General reasoning, user relations, orchestration |
| **Chief Technology Officer** | DeepSeek R1 | Code analysis, technical architecture, debugging |
| **Chief Information Officer** | Gemini Multimodal | Vision, media analysis, multimodal intelligence |
| **Chief Analytics Officer** | GPT-5 | Complex reasoning, strategic planning, precision decisions |

#### How It Works

Users interact with **Suite AI** - the coordination layer that intelligently routes requests to the appropriate AI executive:

```
User Request → Suite AI (Analysis) → Route to Best Executive → Execute → Unified Response
```

**Example Flow:**
- Code debugging → CTO (`deepseek-chat`)
- Image analysis → CIO (`gemini-chat`)
- Complex strategy → CAO (`openai-chat`)
- General queries → CSO (`lovable-chat`)

The 4 executives coordinate **93+ specialized edge functions** that execute tactical work, providing comprehensive enterprise automation.

---

## 🎯 Core Features

### 1. 🤖 Multi-AI Chat Interface

**Component:** `UnifiedChat.tsx`

- **4 AI Executive Modes**: Gemini 2.5, DeepSeek R1, Gemini Multimodal, OpenAI GPT-5
- **Intelligent Routing**: Automatic selection based on task type
- **Voice Integration**: Push-to-talk and continuous voice modes
- **Multimodal Input**: Text, voice, image, and camera support
- **Conversation Memory**: Context-aware with persistent storage
- **Code Execution**: Integrated Python shell with real-time output

**Key Capabilities:**
- Natural language interaction with emotional intelligence
- Real-time code execution and debugging
- Image upload and analysis via Gemini Vision
- Live camera processing for visual tasks
- Markdown rendering with syntax highlighting

### 2. 📊 Real-Time Monitoring Dashboard

- System health monitoring
- API call tracking
- Edge function status
- Performance metrics
- Error tracking and alerting
- Database statistics

### 3. 🏦 Finance Management

- Multi-asset portfolio tracking
- Transaction history
- Automated reporting
- Web3 wallet connections

### 4. 🗳️ AI Governance

- Proposal submission and voting
- Autonomous decision tracking
- Transparent reporting via GitHub Discussions
- Community oversight mechanisms

### 5. 🔊 Advanced Voice Interface

**Voice Engines:**
- Hume AI EVI (Emotional Voice Intelligence)
- ElevenLabs TTS
- OpenAI Whisper STT
- Google Speech Recognition

**Features:**
- Push-to-talk mode
- Continuous listening mode
- Emotion detection
- Natural conversation flow
- Multi-language support

### 6. 👁️ Live Camera Processing

- Real-time camera feed
- Gemini Vision API integration
- Object detection and analysis
- Scene understanding
- OCR capabilities

---

## 🏗️ Technical Architecture

### Frontend Stack

**Built with:**
- **Framework:** React 18.3 + TypeScript
- **Build Tool:** Vite 5.4
- **Styling:** Tailwind CSS 3.4 + shadcn/ui components
- **State Management:** TanStack Query (React Query)
- **Routing:** React Router DOM v6
- **Charts:** Recharts 2.12
- **Voice:** Hume AI, ElevenLabs, Hugging Face Transformers
- **AI:** Google Generative AI, OpenAI SDK

**Deployment:** Vercel (auto-deploy from GitHub)

### Backend Infrastructure

**Built on Supabase:**
- **Database:** PostgreSQL with Row Level Security
- **Auth:** Supabase Auth with JWT
- **Edge Functions:** 93+ Deno-based serverless functions
- **Storage:** Blob storage for media assets
- **Real-time:** WebSocket subscriptions

### Edge Functions (Categories)

**AI & Chat:**
- `lovable-chat` - Primary AI interface
- `deepseek-chat` - Code expert
- `gemini-chat` - Multimodal intelligence
- `openai-chat` - Reasoning engine

**Autonomous Operations:**
- `agent-manager` - Coordinate specialized agents
- `autonomous-code-fixer` - Self-healing code repair
- `task-orchestrator` - Workflow automation
- `code-monitor-daemon` - Continuous monitoring

**Integrations:**
- `github-integration` - Repository management
- `ecosystem-monitor` - 24/7 health checks
- `knowledge-manager` - Vector embeddings & RAG

**Monitoring & Analytics:**
- `system-diagnostics` - Health metrics
- `api-key-health-monitor` - API status
- `function-usage-analytics` - Usage tracking

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- A Supabase account (optional for local dev)
- Lovable account (for deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/DevGruGold/xmrtassistant.git
cd xmrtassistant

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:5173` to see the app.

### Environment Variables

For local development, create a `.env` file:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
```

Most environment variables are managed through Lovable Cloud for seamless deployment.

---

## 💻 Project Structure

```
suite/
├── src/
│   ├── components/          # React components
│   │   ├── UnifiedChat.tsx         # Multi-AI chat interface
│   │   ├── Dashboard.tsx           # Main dashboard
│   │   ├── SystemStatusMonitor.tsx # Health monitoring
│   │   └── ui/                     # shadcn/ui components
│   ├── pages/               # Route pages
│   │   ├── Index.tsx               # Home page
│   │   ├── Treasury.tsx            # Finance management
│   │   ├── Contributors.tsx        # Team
│   │   └── Credentials.tsx         # API keys
│   ├── services/            # API service layers
│   ├── hooks/               # Custom React hooks
│   ├── integrations/        # Supabase integration
│   └── lib/                 # Utilities
├── supabase/
│   ├── functions/           # 93+ Edge functions
│   │   ├── lovable-chat/
│   │   ├── deepseek-chat/
│   │   ├── gemini-chat/
│   │   ├── agent-manager/
│   │   └── ... (89+ more)
│   └── migrations/          # Database schema
├── docs/                    # Documentation
│   ├── SUITE_BRAND_GUIDE.md
│   └── diagrams/
├── public/                  # Static assets
└── ... 
```

---

## 🤝 Contributing

We welcome contributions! The platform is actively developed with contributions from both humans and AI.

**Ways to Contribute:**
1. **Code:** Submit PRs for features or bug fixes
2. **Documentation:** Improve guides and explanations
3. **Testing:** Report bugs and suggest improvements
4. **Community:** Engage in GitHub Discussions

**Development Workflow:**
```bash
# Fork the repository
# Create a feature branch
git checkout -b feature/amazing-feature

# Make your changes
# Commit with descriptive messages
git commit -m 'Add amazing feature'

# Push to your fork
git push origin feature/amazing-feature

# Open a Pull Request
```

**Suite AI will automatically review your PR and provide feedback!**

---

## 🌍 Ecosystem Links

- **Live Platform:** [suite.lovable.app](https://suite.lovable.app)
- **GitHub Org:** [github.com/DevGruGold](https://github.com/DevGruGold)
- **Documentation:** [docs/SUITE_BRAND_GUIDE.md](docs/SUITE_BRAND_GUIDE.md)
- **Creator:** [Joseph Andrew Lee](https://josephandrewlee.medium.com)

---

## 📄 License

This project is open source under the MIT License. See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Built with:** [Lovable](https://lovable.dev/) - AI-powered development platform
- **Powered by:** Supabase, Vercel, React, TypeScript
- **AI Engines:** Google Gemini, OpenAI, DeepSeek, Hume AI, ElevenLabs
- **Foundation:** XMRT-DAO ecosystem and community
- **Philosophy:** Joseph Andrew Lee's vision for ethical AI

---

## 📞 Contact & Support

- **GitHub Issues:** [Report bugs or request features](https://github.com/DevGruGold/xmrtassistant/issues)
- **Discussions:** [GitHub Discussions](https://github.com/DevGruGold/XMRT-Ecosystem/discussions)
- **Email:** support@suite.ai

---

## 🔮 Roadmap

### Q4 2025
- ✅ AI Executive Board deployment
- ✅ Voice interface optimization
- ✅ Enterprise branding (Suite)
- 🔄 Enhanced analytics dashboard
- 🔄 Advanced monitoring features

### Q1 2026
- 📋 Mobile app (iOS/Android)
- 📋 Advanced AI models (Claude, Llama)
- 📋 Enterprise SSO integration
- 📋 Multi-tenant architecture
- 📋 Enhanced governance dashboard

### Q2 2026
- 📋 AI Executive Licensing Framework launch
- 📋 Educational platform
- 📋 Multi-language expansion
- 📋 Enterprise partnerships

---

## ⚡ Quick Facts

- **Tech Stack:** React + TypeScript + Vite + Supabase
- **AI Engines:** 4 (Gemini, GPT-5, DeepSeek, Kimi)
- **Edge Functions:** 93+ autonomous services
- **Voice Providers:** 3 (Hume AI, ElevenLabs, Hugging Face)
- **Deployment:** Vercel + Supabase Edge
- **Open Source:** Yes (MIT License)

---

**"Building the future of enterprise AI, one intelligent decision at a time."**

Built with ❤️ by the Suite team | Powered by XMRT-DAO | Enterprise AI Platform
