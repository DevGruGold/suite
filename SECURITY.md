# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability within the XMRT Suite, please send an email to security@devgrugold.com. All security vulnerabilities will be promptly addressed.

### What to Include

Please include the following information along with your report:

- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

### Response Timeline

- **Initial Response**: Within 24 hours
- **Status Update**: Within 72 hours with assessment
- **Resolution**: Critical issues within 7 days, others within 30 days

## Security Best Practices

### For Contributors
- Never commit sensitive information (API keys, passwords, etc.)
- Use environment variables for configuration
- Follow secure coding practices
- Run security linting tools before submitting PRs

### For Users
- Keep dependencies updated
- Use strong authentication methods
- Follow the principle of least privilege
- Report suspicious activities immediately

## Security Features

- **Dependency Scanning**: Automated vulnerability scanning via Dependabot
- **Code Scanning**: CodeQL analysis on all pull requests
- **Secret Scanning**: Automatic detection of committed secrets
- **Branch Protection**: Required reviews and status checks

## Contact

For security-related questions or concerns:
- Email: security@devgrugold.com
- Encrypted communication: Use our PGP key (available on request)

---

*This policy is effective as of December 2024 and will be reviewed quarterly.*