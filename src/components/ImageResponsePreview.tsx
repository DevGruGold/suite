import React, { useState, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Download, ExternalLink, ZoomIn, ZoomOut, X, Image as ImageIcon } from 'lucide-react';

interface ImageResponsePreviewProps {
  imageData: string; // base64 data URL or regular URL
  alt?: string;
  className?: string;
  onRemove?: () => void;
}

/**
 * Optimized image preview component that handles large base64 images
 * without freezing the UI by lazy loading and using efficient rendering
 */
export const ImageResponsePreview: React.FC<ImageResponsePreviewProps> = ({
  imageData,
  alt = 'AI Generated Image',
  className = '',
  onRemove
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoaded(true);
  }, []);

  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = imageData;
    link.download = `generated-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [imageData]);

  const handleOpenNewTab = useCallback(() => {
    window.open(imageData, '_blank', 'noopener,noreferrer');
  }, [imageData]);

  if (hasError) {
    return (
      <Card className={`p-4 bg-muted/50 ${className}`}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
          <span className="text-sm">Image failed to load</span>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className={`overflow-hidden ${className}`}>
        <div className="relative">
          {!isLoaded && (
            <Skeleton className="w-full h-48 bg-muted" />
          )}
          <img
            src={imageData}
            alt={alt}
            className={`w-full max-h-96 object-contain transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0 h-0'
              }`}
            onLoad={handleLoad}
            onError={handleError}
            loading="lazy"
            decoding="async"
          />

          {isLoaded && (
            <div className="absolute bottom-2 right-2 flex gap-1">
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                title="Expand to fullscreen"
                onClick={() => setIsExpanded(true)}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                title="Open in new tab"
                onClick={handleOpenNewTab}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                title="Download image"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
              </Button>
              {onRemove && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                  onClick={onRemove}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Fullscreen modal — click backdrop to close */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div className="absolute top-4 right-4 flex gap-2">
            <Button
              size="icon"
              variant="secondary"
              title="Open in new tab"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenNewTab();
              }}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              title="Download image"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              title="Close"
              onClick={() => setIsExpanded(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <img
            src={imageData}
            alt={alt}
            className="max-w-full max-h-full object-contain cursor-zoom-out"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
          />
        </div>
      )}
    </>
  );
};

/**
 * Utility to detect and extract base64 images from AI responses
 * Returns { hasImages, images[], textContent }
 */
export function extractImagesFromResponse(content: string): {
  hasImages: boolean;
  images: string[];
  textContent: string;
} {
  const base64ImagePattern = /data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g;
  const images = content.match(base64ImagePattern) || [];

  // Remove base64 data from text content to prevent UI freeze
  let textContent = content;
  for (const img of images) {
    textContent = textContent.replace(img, '[Generated Image]');
  }

  return {
    hasImages: images.length > 0,
    images,
    textContent: textContent.trim()
  };
}

/**
 * Check if a response is too large (likely contains base64 images)
 * Returns true if content exceeds safe rendering threshold
 */
export function isLargeResponse(content: string): boolean {
  // 50KB is a reasonable threshold - most text responses are <10KB
  return content.length > 50000;
}

/**
 * Truncate large content for safe rendering while preserving meaning
 */
export function sanitizeLargeResponse(content: string): string {
  if (!isLargeResponse(content)) return content;

  // Check for base64 images
  const { hasImages, textContent, images } = extractImagesFromResponse(content);

  if (hasImages) {
    return `${textContent}\n\n📸 ${images.length} image(s) generated - see preview above`;
  }

  // For other large content, truncate with notice
  return content.substring(0, 10000) + '\n\n[Response truncated for performance - content too large]';
}

export default ImageResponsePreview;
