export const EXECUTIVE_PROFILES = {
  'vercel-ai-chat': {
    name: 'CSO',
    title: 'Chief Strategy Officer',
    fullTitle: 'Chief Strategy Officer',
    icon: '🎯',
    color: 'blue',
    colorClass: 'executive-cso',
    model: 'Google Gemini 2.5 Flash',
    specialty: 'General Strategy & Coordination',
    strengths: [
      'User relationship management',
      'Task orchestration',
      'General reasoning',
      'Tool selection and routing'
    ],
    bestFor: [
      'General questions and planning',
      'Workflow coordination',
      'Multi-step task management',
      'User support and guidance'
    ],
    responseTime: '~1.2s',
    bio: 'The CSO serves as the primary coordinator of the XMRT Council, intelligently routing requests to specialized executives and maintaining user relationships. Best for general inquiries, strategic planning, and orchestrating complex multi-step workflows.'
  },
  'deepseek-chat': {
    name: 'CTO',
    title: 'Chief Technology Officer',
    fullTitle: 'Chief Technology Officer',
    icon: '💻',
    color: 'purple',
    colorClass: 'executive-cto',
    model: 'DeepSeek R1',
    specialty: 'Code & Technical Architecture',
    strengths: [
      'Code debugging and analysis',
      'Technical architecture design',
      'Performance optimization',
      'Security vulnerability detection'
    ],
    bestFor: [
      'Code review and debugging',
      'Fixing technical errors',
      'Writing technical documentation',
      'Architecture decision-making'
    ],
    responseTime: '~0.8s',
    bio: 'The CTO excels at code analysis, debugging, and technical problem-solving. Route all code-related queries here for maximum precision and technical depth. Powered by DeepSeek R1 for cutting-edge code intelligence.'
  },
  'gemini-chat': {
    name: 'CIO',
    title: 'Chief Information Officer',
    fullTitle: 'Chief Information Officer',
    icon: '👁️',
    color: 'green',
    colorClass: 'executive-cio',
    model: 'Google Gemini 2.5 Pro',
    specialty: 'Vision & Multimodal Intelligence',
    strengths: [
      'Image and video analysis',
      'Visual data interpretation',
      'Multimodal reasoning',
      'Pattern recognition in media'
    ],
    bestFor: [
      'Image analysis and OCR',
      'Visual troubleshooting',
      'Media content understanding',
      'Camera-based interactions'
    ],
    responseTime: '~2.1s',
    bio: 'The CIO specializes in visual intelligence and multimodal processing. Handles image analysis, camera feeds, visual data interpretation, and any task requiring sight-based reasoning. Best for vision-related queries.'
  },
  'openai-chat': {
    name: 'CAO',
    title: 'Chief Analytics Officer',
    fullTitle: 'Chief Analytics Officer',
    icon: '📊',
    color: 'orange',
    colorClass: 'executive-cao',
    model: 'OpenAI GPT-5',
    specialty: 'Complex Analytics & Reasoning',
    strengths: [
      'Deep analytical reasoning',
      'Complex problem decomposition',
      'Strategic decision analysis',
      'Predictive modeling'
    ],
    bestFor: [
      'Complex strategic questions',
      'Data-driven decision making',
      'Analytical deep dives',
      'Long-term planning'
    ],
    responseTime: '~1.5s',
    bio: 'The CAO provides the deepest analytical insights and strategic reasoning. Powered by GPT-5 for handling the most complex queries requiring multi-step reasoning, strategic analysis, and predictive intelligence.'
  },
  'coo-chat': {
    name: 'COO',
    title: 'Chief Operations Officer',
    fullTitle: 'Chief Operations Officer',
    icon: '⚙️',
    color: 'red',
    colorClass: 'executive-coo',
    model: 'STAE-Integrated AI',
    specialty: 'Operations & Agent Orchestration',
    strengths: [
      'Task pipeline management',
      'Agent orchestration',
      'Work documentation',
      'Operational metrics'
    ],
    bestFor: [
      'Task status and pipeline queries',
      'Agent workload management',
      'Making agents do work',
      'Operational dashboards'
    ],
    responseTime: '~1.0s',
    bio: 'The COO oversees all operational aspects of the autonomous agent system. Directly manages STAE (Suite Task Automation Engine) and agent-work-executor to ensure tasks progress through the pipeline with documented work. Best for operations and agent management.'
  }
};

export type ExecutiveName = keyof typeof EXECUTIVE_PROFILES;
