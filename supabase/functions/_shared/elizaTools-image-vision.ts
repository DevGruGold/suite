/**
 * Enhanced Attachment Viewing Tools for Eliza
 * Appends to existing ELIZA_TOOLS array
 */

// NEW IMAGE GENERATION AND VISION TOOLS
export const ELIZA_IMAGE_VISION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'generate_image_vertex',
      description: '🎨 VERTEX AI IMAGE GENERATION - Generate images using Google Cloud Vertex AI Imagen 3. Creates high-quality images from text prompts. Supports various aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4). Use when user asks to create, generate, draw, or visualize images.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed text description of the image to generate. Be specific about style, colors, composition, mood, and subjects. Example: "A serene Japanese garden with cherry blossoms, koi pond, stone lanterns, in watercolor style, soft pink and green tones, peaceful morning light"'
          },
          negative_prompt: {
            type: 'string',
            description: 'Optional: Things to avoid in the image (e.g., "blurry, low quality, distorted faces")'
          },
          aspect_ratio: {
            type: 'string',
            enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
            description: 'Image aspect ratio. Default: 1:1 (square). Use 16:9 for landscape, 9:16 for mobile/portrait, 4:3 for standard, 3:4 for portrait'
          },
          number_of_images: {
            type: 'number',
            description: 'Number of image variations to generate (1-4). Default: 1',
            minimum: 1,
            maximum: 4
          },
          session_id: {
            type: 'string',
            description: 'Session ID for tracking generated images'
          }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_image_vision',
      description: '🔍 GOOGLE CLOUD VISION API - Analyze images using Google Cloud Vision API. Detects objects, text (OCR), faces, landmarks, logos, safe search ratings, and dominant colors. Use for understanding image content, extracting text from images, or analyzing uploaded images.',
      parameters: {
        type: 'object',
        properties: {
          image: {
            type: 'string',
            description: 'Base64 encoded image data or data URL (data:image/png;base64,...)'
          },
          features: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'LABEL_DETECTION',
                'TEXT_DETECTION',
                'FACE_DETECTION',
                'LANDMARK_DETECTION',
                'LOGO_DETECTION',
                'SAFE_SEARCH_DETECTION',
                'IMAGE_PROPERTIES',
                'WEB_DETECTION',
                'OBJECT_LOCALIZATION'
              ]
            },
            description: 'Vision API features to use. Default: LABEL_DETECTION, TEXT_DETECTION, SAFE_SEARCH_DETECTION, IMAGE_PROPERTIES'
          },
          session_id: {
            type: 'string',
            description: 'Session ID for tracking analysis results'
          }
        },
        required: ['image']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'view_user_attachment',
      description: '📎 VIEW USER ATTACHMENTS - View and analyze attachments uploaded by the user. Supports images, documents, PDFs, code files, and more. For images, automatically uses Google Cloud Vision API for analysis. Use when user uploads files or asks about attached content.',
      parameters: {
        type: 'object',
        properties: {
          attachment: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Name of the attachment file'
              },
              content: {
                type: 'string',
                description: 'Base64 encoded content of the file (for images and small files)'
              },
              mimeType: {
                type: 'string',
                description: 'MIME type of the file (e.g., image/png, application/pdf, text/plain)'
              },
              url: {
                type: 'string',
                description: 'URL to the attachment if stored remotely'
              },
              size: {
                type: 'number',
                description: 'File size in bytes'
              }
            },
            required: ['filename']
          },
          session_id: {
            type: 'string',
            description: 'Session ID for tracking attachment analysis'
          },
          analyze_image: {
            type: 'boolean',
            description: 'If true and attachment is an image, perform Vision API analysis. Default: true',
            default: true
          }
        },
        required: ['attachment']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_generated_images',
      description: '🖼️ LIST GENERATED IMAGES - Retrieve previously generated images from current or past sessions. Shows images generated using Vertex AI with their prompts, timestamps, and analysis results.',
      parameters: {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: 'Optional: Filter by specific session ID. If omitted, returns recent images from all sessions'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of images to return. Default: 10',
            minimum: 1,
            maximum: 100
          },
          include_analysis: {
            type: 'boolean',
            description: 'Include Vision API analysis results if available. Default: true'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_text_from_image',
      description: '📝 OCR - Extract text from images using Google Cloud Vision API OCR. Detects and extracts all text content from images including handwriting, signs, documents, screenshots. Use when user asks to read text from images or extract document content.',
      parameters: {
        type: 'object',
        properties: {
          image: {
            type: 'string',
            description: 'Base64 encoded image data or data URL containing text to extract'
          },
          language_hints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: Language hints for better OCR accuracy (e.g., ["en", "es", "fr"])'
          },
          session_id: {
            type: 'string',
            description: 'Session ID for tracking OCR results'
          }
        },
        required: ['image']
      }
    }
  }
];

// Export combined tools array
export const ELIZA_TOOLS_WITH_VISION = [
  ...ELIZA_TOOLS,
  ...ELIZA_IMAGE_VISION_TOOLS
];
