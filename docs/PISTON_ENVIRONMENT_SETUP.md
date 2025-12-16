# 🐍 Piston Environment Setup & Best Practices

**Repository**: DevGruGold/suite  
**Updated**: 2025-12-16 00:39:14 UTC  
**Purpose**: Python executor integration for AI Gateway chat functions

## 📋 Overview

The Piston environment provides secure Python code execution capabilities for all AI Gateway chat functions in the XMRT Suite. This documentation outlines the proper setup, configuration, and usage patterns for integrating Piston with the chat functions.

## 🎯 Architecture

### 🔧 Core Components

```
AI Gateway Chat Function
    ↓
Edge Function Tool Executor  
    ↓
Python Orchestrator
    ↓
Piston API Environment
    ↓
Secure Python Sandbox
```

### 📦 Integration Stack

- **Edge Functions**: Supabase edge functions (Deno runtime)
- **Tool Executor**: `_shared/toolExecutor.ts` - Unified tool execution
- **Python Orchestrator**: `_shared/pythonOrchestrator.ts` - Piston integration
- **Piston API**: Secure code execution environment
- **Chat Functions**: AI gateway functions utilizing Python execution

## ⚙️ Piston Environment Configuration

### 🔑 Environment Variables

```bash
# Piston API Configuration
PISTON_API_URL=https://emkc.org/api/v2/piston
PISTON_LANGUAGE=python
PISTON_VERSION=3.10.0

# Security Settings
PISTON_TIMEOUT=30000
PISTON_MAX_OUTPUT_SIZE=1048576
PISTON_MEMORY_LIMIT=134217728
```

### 🛠️ Python Orchestrator Setup

The Python orchestrator handles secure code execution through the Piston API:

```typescript
// supabase/functions/_shared/pythonOrchestrator.ts
export interface PythonExecutionRequest {
  code: string;
  purpose: string;
  timeout?: number;
  files?: Array<{
    name: string;
    content: string;
  }>;
}

export interface PythonExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  execution_time: number;
  language: string;
  version: string;
}

export async function executePythonCode(
  request: PythonExecutionRequest
): Promise<PythonExecutionResult> {
  try {
    const pistonResponse = await fetch(
      `${Deno.env.get('PISTON_API_URL') || 'https://emkc.org/api/v2/piston'}/execute`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: 'python',
          version: '3.10.0',
          files: [
            {
              name: 'main.py',
              content: request.code
            },
            ...(request.files || [])
          ],
          stdin: '',
          args: [],
          compile_timeout: 10000,
          run_timeout: request.timeout || 30000,
          compile_memory_limit: -1,
          run_memory_limit: 134217728
        })
      }
    );

    const result = await pistonResponse.json();
    
    return {
      success: !result.compile?.stderr && !result.run?.stderr,
      output: result.run?.stdout || result.compile?.stdout || '',
      error: result.run?.stderr || result.compile?.stderr || null,
      execution_time: result.run?.signal || 0,
      language: 'python',
      version: '3.10.0'
    };
    
  } catch (error) {
    return {
      success: false,
      output: '',
      error: `Piston execution failed: ${error.message}`,
      execution_time: 0,
      language: 'python',
      version: '3.10.0'
    };
  }
}
```

## 🎯 Chat Function Integration

### 📝 Tool Definition

Each chat function should include the `execute_python` tool in their tool definitions:

```typescript
// In ELIZA_TOOLS array
{
  type: "function",
  function: {
    name: "execute_python",
    description: "Execute Python code in a secure sandbox environment via Piston API. Use for calculations, data analysis, file processing, and computational tasks.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Python code to execute. Should be complete and self-contained."
        },
        purpose: {
          type: "string", 
          description: "Brief description of what the code is meant to accomplish"
        }
      },
      required: ["code", "purpose"]
    }
  }
}
```

### 🔧 Tool Execution Handler

The tool executor should handle Python execution requests:

```typescript
// In toolExecutor.ts
case 'execute_python':
  try {
    const { code, purpose } = JSON.parse(toolCall.function.arguments);
    
    // Validate code for security
    if (containsUnsafeOperations(code)) {
      throw new Error('Code contains potentially unsafe operations');
    }
    
    const pythonResult = await executePythonCode({
      code,
      purpose,
      timeout: 30000
    });
    
    if (pythonResult.success) {
      return {
        success: true,
        data: {
          output: pythonResult.output,
          purpose: purpose,
          execution_time: pythonResult.execution_time
        }
      };
    } else {
      throw new Error(pythonResult.error || 'Python execution failed');
    }
    
  } catch (error) {
    return {
      success: false,
      error: `Python execution error: ${error.message}`
    };
  }
```

### 🛡️ Security Validation

Implement code validation to prevent unsafe operations:

```typescript
function containsUnsafeOperations(code: string): boolean {
  const unsafePatterns = [
    /import\s+(os|sys|subprocess|socket)/,
    /exec\s*\(/,
    /eval\s*\(/,
    /__import__/,
    /open\s*\(/,
    /file\s*\(/,
    /input\s*\(/,
    /raw_input\s*\(/
  ];
  
  return unsafePatterns.some(pattern => pattern.test(code));
}
```

## 🎯 Usage Patterns

### ✅ Correct Usage Examples

#### 1. Mathematical Calculations
```python
# User: "Calculate the compound interest"
import math

principal = 1000
rate = 0.05
time = 5
compound_frequency = 12

amount = principal * (1 + rate/compound_frequency)**(compound_frequency * time)
interest = amount - principal

print(f"Principal: ${principal}")
print(f"Amount after {time} years: ${amount:.2f}")  
print(f"Compound interest: ${interest:.2f}")
```

#### 2. Data Analysis
```python
# User: "Analyze this data set"
data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

mean = sum(data) / len(data)
variance = sum((x - mean) ** 2 for x in data) / len(data)
std_dev = variance ** 0.5

print(f"Mean: {mean}")
print(f"Variance: {variance:.2f}")
print(f"Standard Deviation: {std_dev:.2f}")
```

#### 3. Text Processing
```python
# User: "Process this text"
text = "Hello World! This is a test string."

words = text.split()
char_count = len(text)
word_count = len(words)
uppercase = text.upper()
lowercase = text.lower()

print(f"Original: {text}")
print(f"Characters: {char_count}")
print(f"Words: {word_count}")
print(f"Uppercase: {uppercase}")
print(f"Lowercase: {lowercase}")
```

### ❌ Incorrect Patterns to Avoid

#### Don't Write Code in Chat
```typescript
// ❌ WRONG: Writing code blocks in chat response
response = `Here's the calculation:
\`\`\`python
result = 5 + 3
print(result)
\`\`\`
The answer is 8.`;
```

#### Don't Skip Tool Execution  
```typescript
// ❌ WRONG: Claiming to execute without actual tool call
response = "I calculated it and the result is 42";
// Should actually call execute_python tool
```

### ✅ Correct Implementation Pattern

```typescript
// ✅ CORRECT: Proper tool execution
const toolCall = {
  id: "calc_001",
  type: "function", 
  function: {
    name: "execute_python",
    arguments: JSON.stringify({
      code: `
result = 5 + 3 * 2
print(f"Calculation: 5 + 3 * 2 = {result}")
      `.trim(),
      purpose: "Calculate mathematical expression"
    })
  }
};

const result = await executeToolCall(toolCall, supabase, sessionInfo);
// Then use the actual result in the response
```

## 📊 Performance Guidelines

### ⚡ Optimization Best Practices

1. **Code Efficiency**
   - Keep calculations focused and minimal
   - Avoid unnecessary loops or recursion
   - Use built-in functions when possible

2. **Output Management** 
   - Limit print statements to essential information
   - Format output clearly for user consumption
   - Avoid excessive debug information

3. **Error Handling**
   - Include try/catch blocks for risky operations
   - Provide meaningful error messages
   - Validate inputs before processing

4. **Resource Usage**
   - Respect timeout limits (30 seconds default)
   - Minimize memory usage for large datasets
   - Avoid infinite loops or blocking operations

### 🎯 Performance Targets

- **Execution Time**: < 5 seconds for typical calculations
- **Memory Usage**: < 128MB per execution
- **Success Rate**: > 95% for valid code
- **Response Time**: < 2 seconds total (including network)

## 🔍 Troubleshooting

### 🐛 Common Issues

1. **Code Execution Timeouts**
   - Reduce computational complexity
   - Break large operations into smaller chunks
   - Optimize algorithms for efficiency

2. **Import Errors**
   - Use only standard library modules
   - Avoid external package dependencies
   - Check module availability in Python 3.10

3. **Memory Limit Exceeded**
   - Reduce data structure sizes
   - Use generators instead of lists for large datasets
   - Clear variables when no longer needed

4. **Syntax Errors**
   - Validate code syntax before execution
   - Use proper indentation and formatting
   - Check for typos and missing brackets

### 🔧 Debugging Tips

1. **Enable Detailed Logging**
```typescript
console.log('Python execution request:', {
  code: request.code,
  purpose: request.purpose,
  timeout: request.timeout
});
```

2. **Validate Code Structure**
```typescript
// Check for basic syntax issues
if (!code.trim()) {
  throw new Error('Empty code provided');
}

if (code.includes('while True:') && !code.includes('break')) {
  throw new Error('Potential infinite loop detected');
}
```

3. **Monitor Execution Metrics**
```typescript
const startTime = Date.now();
const result = await executePythonCode(request);
const executionDuration = Date.now() - startTime;

console.log(`Python execution completed in ${executionDuration}ms`);
```

## 🚀 Implementation Checklist

### ✅ Chat Function Requirements

- [ ] Include `execute_python` in tool definitions
- [ ] Implement proper tool call handling
- [ ] Add security validation for code
- [ ] Handle execution errors gracefully
- [ ] Log execution metrics for monitoring
- [ ] Provide clear user feedback on results
- [ ] Follow the unified tool executor pattern
- [ ] Integrate with credential cascade system

### 🎯 Testing Validation

- [ ] Test basic mathematical calculations
- [ ] Validate data processing capabilities  
- [ ] Verify error handling for invalid code
- [ ] Check timeout handling for long operations
- [ ] Confirm security validation works
- [ ] Test with various Python syntax patterns
- [ ] Validate response formatting
- [ ] Ensure proper logging and metrics

## 📋 Conclusion

The Piston environment integration provides secure, reliable Python execution capabilities for all AI Gateway chat functions. By following these guidelines and best practices, each chat function can properly execute Python code through the invoke Edge function tool pattern, ensuring consistent behavior across all AI executives.

**Key Success Factors:**
- ✅ Use `execute_python` tool instead of code blocks in responses
- ✅ Implement proper security validation
- ✅ Handle errors and timeouts gracefully  
- ✅ Follow the unified tool executor pattern
- ✅ Provide clear feedback to users
- ✅ Monitor performance and optimize accordingly

This setup ensures that all AI executives have robust Python execution capabilities while maintaining security, performance, and reliability standards.

---

**Documentation Version**: 1.0  
**Last Updated**: 2025-12-16  
**Maintained By**: DevGruGold Team
