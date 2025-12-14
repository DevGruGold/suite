import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getGoogleAccessToken, isGoogleConfigured, corsHeaders } from "../_shared/googleAuthHelper.ts";

const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';

// ============= CALENDAR ACTIONS =============

async function listEvents(accessToken: string, calendarId = 'primary', timeMin?: string, timeMax?: string, maxResults = 10) {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime'
  });
  
  if (timeMin) params.set('timeMin', timeMin);
  else params.set('timeMin', new Date().toISOString());
  
  if (timeMax) params.set('timeMax', timeMax);

  const response = await fetch(`${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  return response.json();
}

async function createEvent(
  accessToken: string,
  title: string,
  startTime: string,
  endTime: string,
  description?: string,
  attendees?: string[],
  calendarId = 'primary'
) {
  const event: any = {
    summary: title,
    start: { dateTime: startTime },
    end: { dateTime: endTime }
  };
  
  if (description) event.description = description;
  if (attendees?.length) {
    event.attendees = attendees.map(email => ({ email }));
  }

  const response = await fetch(`${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  return response.json();
}

async function updateEvent(
  accessToken: string,
  eventId: string,
  updates: { title?: string; startTime?: string; endTime?: string; description?: string },
  calendarId = 'primary'
) {
  const event: any = {};
  if (updates.title) event.summary = updates.title;
  if (updates.startTime) event.start = { dateTime: updates.startTime };
  if (updates.endTime) event.end = { dateTime: updates.endTime };
  if (updates.description) event.description = updates.description;

  const response = await fetch(`${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  return response.json();
}

async function deleteEvent(accessToken: string, eventId: string, calendarId = 'primary') {
  const response = await fetch(`${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  return { success: response.ok };
}

async function getEvent(accessToken: string, eventId: string, calendarId = 'primary') {
  const response = await fetch(`${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!isGoogleConfigured()) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Google Cloud not configured',
        credential_required: true,
        message: 'Please configure Google OAuth credentials'
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const action = body.action;

    console.log(`📅 google-calendar: action=${action}`);

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get access token',
        credential_required: true
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let result;

    switch (action) {
      case 'list_events':
        result = await listEvents(accessToken, body.calendar_id, body.time_min, body.time_max, body.max_results);
        break;

      case 'create_event':
        result = await createEvent(
          accessToken,
          body.title,
          body.start_time,
          body.end_time,
          body.description,
          body.attendees,
          body.calendar_id
        );
        break;

      case 'update_event':
        result = await updateEvent(
          accessToken,
          body.event_id,
          {
            title: body.title,
            startTime: body.start_time,
            endTime: body.end_time,
            description: body.description
          },
          body.calendar_id
        );
        break;

      case 'delete_event':
        result = await deleteEvent(accessToken, body.event_id, body.calendar_id);
        break;

      case 'get_event':
        result = await getEvent(accessToken, body.event_id, body.calendar_id);
        break;

      case 'list_actions':
        result = {
          service: 'google-calendar',
          actions: [
            { name: 'list_events', params: ['calendar_id?', 'time_min?', 'time_max?', 'max_results?'], description: 'List calendar events' },
            { name: 'create_event', params: ['title', 'start_time', 'end_time', 'description?', 'attendees?', 'calendar_id?'], description: 'Create calendar event' },
            { name: 'update_event', params: ['event_id', 'title?', 'start_time?', 'end_time?', 'description?', 'calendar_id?'], description: 'Update event' },
            { name: 'delete_event', params: ['event_id', 'calendar_id?'], description: 'Delete event' },
            { name: 'get_event', params: ['event_id', 'calendar_id?'], description: 'Get event details' }
          ]
        };
        break;

      default:
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['list_events', 'create_event', 'update_event', 'delete_event', 'get_event', 'list_actions']
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('google-calendar error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
