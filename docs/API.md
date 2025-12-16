# API Documentation

## Overview

The XMRT Suite provides a comprehensive API for managing mining operations, DAO governance, and AI-powered functionality.

## Base URL

```
https://your-project.supabase.co/functions/v1/
```

## Authentication

All API requests require authentication using Supabase JWT tokens:

```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});
```

## Endpoints

### AI Chat Functions

#### POST /ai-chat
Execute AI chat with various models.

**Request:**
```json
{
  "message": "Hello, how can you help?",
  "model": "openai",
  "context": {}
}
```

**Response:**
```json
{
  "content": "I can help with mining operations and DAO management...",
  "executive": "Eliza",
  "status": "success"
}
```

### Mining Operations

#### GET /mining-stats
Get real-time mining statistics.

**Response:**
```json
{
  "hashrate": "150 TH/s",
  "active_miners": 45,
  "revenue_24h": "0.025 BTC",
  "efficiency": "98.5%"
}
```

### DAO Functions

#### POST /governance/vote
Submit a governance vote.

**Request:**
```json
{
  "proposal_id": "prop_123",
  "vote": "yes",
  "weight": 1000
}
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Invalid parameter provided",
    "details": {}
  }
}
```

## Rate Limiting

- 100 requests per minute per user
- 1000 requests per hour per user
- Burst limit: 10 concurrent requests

## SDKs

Official SDKs are available for:
- JavaScript/TypeScript
- Python
- Go

For more details, see the [full API documentation](https://docs.devgrugold.com).