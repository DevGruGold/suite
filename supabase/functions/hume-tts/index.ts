import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { startUsageTrackingWithRequest } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'hume-tts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch { body = {}; }

  const usageTracker = startUsageTrackingWithRequest(FUNCTION_NAME, req, body);

  try {
    const { text, voiceId } = body;
    if (!text) {
      await usageTracker.failure('Text is required', 400);
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Truncate text to prevent memory issues (max 5000 chars)
    const MAX_TEXT_LENGTH = 5000;
    const truncatedText = text.length > MAX_TEXT_LENGTH 
      ? text.substring(0, MAX_TEXT_LENGTH) + '...' 
      : text;

    const humeApiKey = Deno.env.get('HUME_API_KEY');
    if (!humeApiKey) {
      console.error('HUME_API_KEY not configured');
      await usageTracker.failure('Hume API key not configured', 500);
      return new Response(
        JSON.stringify({ error: 'Hume API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default voice ID if not provided
    const selectedVoiceId = voiceId || 'c7aa10be-57c1-4647-9306-7ac48dde3536';

    console.log('🎙️ Hume TTS request:', { 
      originalLength: text.length,
      truncatedLength: truncatedText.length,
      wasTruncated: text.length > MAX_TEXT_LENGTH,
      voiceId: selectedVoiceId,
      textPreview: truncatedText.substring(0, 50) + '...'
    });

    // Call Hume TTS API with X-Hume-Api-Key header
    const response = await fetch('https://api.hume.ai/v0/tts', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': humeApiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        utterances: [{ 
          text: truncatedText, 
          voice: { id: selectedVoiceId } 
        }],
        format: { type: 'mp3' }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Hume TTS API error:', response.status, errorText);
      await usageTracker.failure(`Hume TTS API error: ${response.status}`, response.status);
      return new Response(
        JSON.stringify({ 
          error: 'Hume TTS API error', 
          status: response.status,
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check content type to determine response format
    const contentType = response.headers.get('content-type') || '';
    console.log('📦 Hume response content-type:', contentType);

    let base64Audio: string;
    let audioSize: number;
    let headerBytes: number[];

    if (contentType.includes('application/json')) {
      // Parse JSON response format (Hume returns { generations: [{ audio: "base64..." }] })
      const jsonResponse = await response.json();
      console.log('📦 Hume JSON response keys:', Object.keys(jsonResponse));
      
      // Try different possible JSON structures
      let audioData = jsonResponse.generations?.[0]?.audio // Direct audio field
        || jsonResponse.generations?.[0]?.snippets?.[0]?.audio // Nested snippets
        || jsonResponse.audio; // Root level audio
      
      if (!audioData) {
        console.error('❌ Could not find audio in JSON response:', JSON.stringify(jsonResponse).substring(0, 500));
        throw new Error('No audio data in Hume JSON response');
      }
      
      base64Audio = audioData;
      // Decode a bit to get header bytes for validation
      const decoded = Uint8Array.from(atob(base64Audio.substring(0, 20)), c => c.charCodeAt(0));
      headerBytes = Array.from(decoded.slice(0, 4));
      audioSize = Math.round(base64Audio.length * 0.75); // Approximate decoded size
      
      console.log('✅ Extracted audio from JSON response');
    } else {
      // Handle binary response (audio/mpeg)
      const audioBuffer = await response.arrayBuffer();
      const audioBytes = new Uint8Array(audioBuffer);
      
      // Log first few bytes to verify MP3 header (should start with 0xFF 0xFB or ID3)
      headerBytes = Array.from(audioBytes.slice(0, 4));
      
      // Use Deno's proper base64 encoding (fixes binary corruption)
      base64Audio = base64Encode(audioBytes);
      audioSize = audioBuffer.byteLength;
    }

    console.log('🎵 Audio header bytes:', headerBytes.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
    console.log('✅ Hume TTS success, audio size:', audioSize, 'bytes, base64 length:', base64Audio.length);

    await usageTracker.success({ result_summary: `TTS generated: ${audioSize} bytes` });
    return new Response(
      JSON.stringify({ 
        audio: base64Audio,
        format: 'mp3',
        size: audioSize,
        headerBytes: headerBytes // Include for client-side validation
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Hume TTS error:', error);
    await usageTracker.failure(error.message || 'Unknown error', 500);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
