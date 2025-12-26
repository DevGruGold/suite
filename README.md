# XMRT Suite 🚀

[![CI/CD Pipeline](https://github.com/DevGruGold/suite/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/DevGruGold/suite/actions/workflows/ci-cd.yml)
[![Security Analysis](https://github.com/DevGruGold/suite/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/DevGruGold/suite/actions/workflows/codeql-analysis.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-Powered Mining & DAO Management Platform for XMRT Ecosystem with real-time mining statistics and autonomous agent integration.

## 🌟 Current Status & Recent Enhancements (v6.0.0)

This repository has undergone critical enhancements to ensure robust and reliable communication between the frontend chat interface and the backend executive AI services. The primary focus was on implementing intelligent, fault-tolerant routing for the multi-executive AI system and correcting the implementation of the Vertex AI executive.

### 🛠️ Critical Fixes and Enhancements

#### 1. Fault-Tolerant Executive Routing (`src/services/unifiedElizaService.ts`)

The core chat routing logic has been upgraded to prevent service disruption when an individual AI executive's credits are depleted or its service is temporarily unavailable.

*   **Automatic Executive Cycling**: The system no longer defaults to a single chat function. Instead, it attempts to contact executives in a prioritized sequence (`deepseek-chat` → `gemini-chat` → `openai-chat` → `lovable-chat` → `ai-chat`).
*   **402/503 Error Handling**: Implemented robust detection for:
    *   `402 Payment Required` (depleted credits/tokens)
    *   `503 Service Unavailable` (temporary service outage)
    *   Generic errors like `quota exceeded`, `insufficient credits`, and `non-2xx status code`.
*   **Intelligent Fallback**: If an executive fails due to a credit or service issue, the system automatically cycles to the next available executive, ensuring continuous service. If all executives fail, it falls back to the local Office Clerk AI.
*   **Enhanced Context Passing**: The routing now correctly passes the full conversation context, user context, mining statistics, emotional context, and image data to the executive functions, enabling more informed responses.

#### 2. Corrected Vertex AI Implementation (`supabase/functions/vertex-ai-chat/index.ts`)

The `vertex-ai-chat` executive, which serves as the **ML Operations Specialist**, has been completely refactored to move from a mock/simulated Python execution to a proper, authenticated Google Cloud service.

*   **Real Google Cloud OAuth**: The function now correctly integrates with the shared `googleAuthHelper` to obtain a valid Google Cloud access token via OAuth.
*   **Authentic Vertex AI Calls**: It now makes direct, authenticated calls to the Vertex AI API endpoints (`aiplatform.googleapis.com`) for its AI processing.
*   **Role**: The executive is configured as the **ML Operations Specialist** using the powerful `gemini-1.5-pro` model, specializing in ML model deployment, AI training, and Google Cloud service integration.

#### 3. Verified AI-Chat Function (`supabase/functions/ai-chat/index.ts`)

The general `ai-chat` function has been verified to correctly use the `callAIWithFallback` mechanism, which ensures a broad and resilient cascade through multiple AI providers (Lovable → DeepSeek → Kimi → Vertex AI → Gemini) for general queries.

---

## ✨ Features

- 🤖 **AI-Powered Chat Functions**: Multiple AI gateways (OpenAI, DeepSeek, Gemini, Vertex AI, etc.) with fault-tolerant routing.
- ⛏️ **Mining Management**: Real-time mining statistics and management
- 🏛️ **DAO Governance**: Decentralized autonomous organization tools
- 📊 **Analytics Dashboard**: Comprehensive mining and performance analytics
- 🔧 **Edge Functions**: Supabase-powered serverless functions
- 🛡️ **Security**: Comprehensive security scanning and best practices

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Supabase CLI
- Docker (optional, for local development)

### Installation

```bash
# Clone the repository
git clone https://github.com/DevGruGold/suite.git
cd suite

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Start Supabase locally (optional)
supabase start

# Start development server
npm run dev
```

## 🏗️ Architecture

```
suite/
├── src/                    # Source code
│   ├── components/         # React components
│   ├── services/          # Business logic (including unifiedElizaService.ts)
│   └── types/             # TypeScript types
├── supabase/              # Supabase configuration
│   ├── functions/         # Edge functions (including vertex-ai-chat)
│   └── migrations/        # Database migrations
├── .github/               # GitHub Actions workflows
└── docs/                  # Documentation
```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run test` - Run tests
- `npm run type-check` - TypeScript type checking

### Code Quality

This project uses:
- **ESLint** for code linting
- **Prettier** for code formatting
- **TypeScript** for type safety
- **Jest** for unit testing
- **Playwright** for E2E testing

### Contributing

Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting pull requests.

## 🛡️ Security

Security is a top priority. Please see our [Security Policy](SECURITY.md) for reporting vulnerabilities.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📞 Support

- 📧 Email: xmrtsolutions@gmail.com
- 💬 Discord: [Join our community](https://discord.gg/xmrt)
- 🐛 Issues: [GitHub Issues](https://github.com/DevGruGold/suite/issues)

---

Made with ❤️ by [DevGruGold](https://github.com/DevGruGold) and **Manus AI**

