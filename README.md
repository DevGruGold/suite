# XMRT Suite 🚀

[![CI/CD Pipeline](https://github.com/DevGruGold/suite/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/DevGruGold/suite/actions/workflows/ci-cd.yml)
[![Security Analysis](https://github.com/DevGruGold/suite/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/DevGruGold/suite/actions/workflows/codeql-analysis.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-Powered Mining & DAO Management Platform for XMRT Ecosystem with real-time mining statistics and autonomous agent integration.

## ✨ Features

- 🤖 **AI-Powered Chat Functions**: Multiple AI gateways (OpenAI, DeepSeek, Gemini, etc.)
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
│   ├── services/          # Business logic
│   └── types/             # TypeScript types
├── supabase/              # Supabase configuration
│   ├── functions/         # Edge functions
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

Made with ❤️ by [DevGruGold](https://github.com/DevGruGold)