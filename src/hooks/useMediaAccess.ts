import { useState, useEffect, useCallback } from 'react';

export interface MediaPermissions {
  microphone: boolean;
  camera: boolean;
  granted: boolean;
}

export interface MediaStreams {
  audio?: MediaStream;
  video?: MediaStream;
}

export const useMediaAccess = () => {
  const [permissions, setPermissions] = useState<MediaPermissions>({
    microphone: false,
    camera: false,
    granted: false
  });
  const [streams, setStreams] = useState<MediaStreams>({});
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkPermissions = useCallback(async () => {
    try {
      const micPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });

      const newPermissions = {
        microphone: micPermission.state === 'granted',
        camera: cameraPermission.state === 'granted',
        granted: micPermission.state === 'granted' || cameraPermission.state === 'granted'
      };

      setPermissions(newPermissions);
      return newPermissions;
    } catch (err) {
      console.warn('Permission check failed:', err);
      return permissions;
    }
  }, [permissions]);

  const requestMicrophoneAccess = useCallback(async () => {
    setIsRequesting(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      setStreams(prev => ({ ...prev, audio: stream }));
      setPermissions(prev => ({ ...prev, microphone: true, granted: true }));
      return stream;
    } catch (err) {
      const error = err as Error;
      setError(`Microphone access denied: ${error.message}`);
      throw error;
    } finally {
      setIsRequesting(false);
    }
  }, []);

  const requestCameraAccess = useCallback(async () => {
    setIsRequesting(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });

      setStreams(prev => ({ ...prev, video: stream }));
      setPermissions(prev => ({ ...prev, camera: true, granted: true }));
      return stream;
    } catch (err) {
      const error = err as Error;
      setError(`Camera access denied: ${error.message}`);
      throw error;
    } finally {
      setIsRequesting(false);
    }
  }, []);

  const requestBothAccess = useCallback(async () => {
    setIsRequesting(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });

      setStreams({ audio: stream, video: stream });
      setPermissions({ microphone: true, camera: true, granted: true });
      return stream;
    } catch (err) {
      const error = err as Error;
      setError(`Media access denied: ${error.message}`);
      throw error;
    } finally {
      setIsRequesting(false);
    }
  }, []);

  const stopStream = useCallback((type: 'audio' | 'video' | 'both') => {
    if (type === 'audio' || type === 'both') {
      streams.audio?.getTracks().forEach(track => track.stop());
      setStreams(prev => ({ ...prev, audio: undefined }));
      if (type === 'both') {
        setPermissions(prev => ({ ...prev, microphone: false, camera: false, granted: false }));
      } else {
        setPermissions(prev => ({ ...prev, microphone: false, granted: prev.camera }));
      }
    }

    if (type === 'video' || type === 'both') {
      streams.video?.getTracks().forEach(track => track.stop());
      setStreams(prev => ({ ...prev, video: undefined }));
      if (type !== 'both') {
        setPermissions(prev => ({ ...prev, camera: false, granted: prev.microphone }));
      }
    }
  }, [streams]);

  const captureImage = useCallback(async (): Promise<string | null> => {
    if (!streams.video) return null;

    const video = document.createElement('video');
    video.srcObject = streams.video;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, [streams.video]);

  useEffect(() => {
    checkPermissions();
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup streams on unmount
      streams.audio?.getTracks().forEach(track => track.stop());
      streams.video?.getTracks().forEach(track => track.stop());
    };
  }, [streams]);

  return {
    permissions,
    streams,
    isRequesting,
    error,
    requestMicrophoneAccess,
    requestCameraAccess,
    requestBothAccess,
    stopStream,
    captureImage,
    checkPermissions
  };
};