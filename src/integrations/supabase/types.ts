export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_feed: {
        Row: {
          created_at: string | null
          data: Json | null
          description: string | null
          id: string
          timestamp: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          description?: string | null
          id?: string
          timestamp?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          description?: string | null
          id?: string
          timestamp?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      agent_activities: {
        Row: {
          activity: string
          agent_id: string
          created_at: string
          id: string
          level: string
        }
        Insert: {
          activity: string
          agent_id: string
          created_at?: string
          id?: string
          level?: string
        }
        Update: {
          activity?: string
          agent_id?: string
          created_at?: string
          id?: string
          level?: string
        }
        Relationships: []
      }
      agent_clones: {
        Row: {
          child_agent_id: string | null
          created_at: string
          id: string
          parent_agent_id: string | null
          reason: string | null
        }
        Insert: {
          child_agent_id?: string | null
          created_at?: string
          id?: string
          parent_agent_id?: string | null
          reason?: string | null
        }
        Update: {
          child_agent_id?: string | null
          created_at?: string
          id?: string
          parent_agent_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_clones_child_agent_id_fkey"
            columns: ["child_agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_clones_parent_agent_id_fkey"
            columns: ["parent_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_performance_metrics: {
        Row: {
          agent_id: string
          id: string
          metadata: Json | null
          metric_type: string
          metric_value: number
          recorded_at: string
          time_window: string
        }
        Insert: {
          agent_id: string
          id?: string
          metadata?: Json | null
          metric_type: string
          metric_value: number
          recorded_at?: string
          time_window: string
        }
        Update: {
          agent_id?: string
          id?: string
          metadata?: Json | null
          metric_type?: string
          metric_value?: number
          recorded_at?: string
          time_window?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_performance_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_performance_reviews: {
        Row: {
          created_at: string | null
          fleet_health_score: number | null
          id: string
          recommendations: Json | null
          review_period_end: string | null
          review_period_start: string | null
        }
        Insert: {
          created_at?: string | null
          fleet_health_score?: number | null
          id?: string
          recommendations?: Json | null
          review_period_end?: string | null
          review_period_start?: string | null
        }
        Update: {
          created_at?: string | null
          fleet_health_score?: number | null
          id?: string
          recommendations?: Json | null
          review_period_end?: string | null
          review_period_start?: string | null
        }
        Relationships: []
      }
      agent_specializations: {
        Row: {
          agent_id: string
          detected_at: string
          id: string
          last_updated: string
          metadata: Json | null
          proficiency_score: number
          specialization_area: string
          success_rate: number
          tasks_completed_in_area: number
        }
        Insert: {
          agent_id: string
          detected_at?: string
          id?: string
          last_updated?: string
          metadata?: Json | null
          proficiency_score?: number
          specialization_area: string
          success_rate?: number
          tasks_completed_in_area?: number
        }
        Update: {
          agent_id?: string
          detected_at?: string
          id?: string
          last_updated?: string
          metadata?: Json | null
          proficiency_score?: number
          specialization_area?: string
          success_rate?: number
          tasks_completed_in_area?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_specializations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          created_at: string
          current_workload: number | null
          heartbeat_ms: number | null
          id: string
          is_superduper: boolean | null
          last_seen: string | null
          max_concurrent_tasks: number | null
          metadata: Json
          name: string
          role: Database["public"]["Enums"]["agent_role"]
          role_old: string | null
          skills: Json
          spawn_reason: string | null
          spawned_by: string | null
          status: Database["public"]["Enums"]["agent_status"]
          superduper_agent_id: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          created_at?: string
          current_workload?: number | null
          heartbeat_ms?: number | null
          id: string
          is_superduper?: boolean | null
          last_seen?: string | null
          max_concurrent_tasks?: number | null
          metadata?: Json
          name: string
          role: Database["public"]["Enums"]["agent_role"]
          role_old?: string | null
          skills?: Json
          spawn_reason?: string | null
          spawned_by?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          superduper_agent_id?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          created_at?: string
          current_workload?: number | null
          heartbeat_ms?: number | null
          id?: string
          is_superduper?: boolean | null
          last_seen?: string | null
          max_concurrent_tasks?: number | null
          metadata?: Json
          name?: string
          role?: Database["public"]["Enums"]["agent_role"]
          role_old?: string | null
          skills?: Json
          spawn_reason?: string | null
          spawned_by?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          superduper_agent_id?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_superduper_agent_id_fkey"
            columns: ["superduper_agent_id"]
            isOneToOne: false
            referencedRelation: "superduper_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      anomaly_resolutions: {
        Row: {
          anomaly_type: string
          auto_resolved: boolean | null
          created_at: string | null
          id: string
          resolution_status: string | null
          root_cause_analysis: string | null
          severity: string | null
        }
        Insert: {
          anomaly_type: string
          auto_resolved?: boolean | null
          created_at?: string | null
          id?: string
          resolution_status?: string | null
          root_cause_analysis?: string | null
          severity?: string | null
        }
        Update: {
          anomaly_type?: string
          auto_resolved?: boolean | null
          created_at?: string | null
          id?: string
          resolution_status?: string | null
          root_cause_analysis?: string | null
          severity?: string | null
        }
        Relationships: []
      }
      api_call_logs: {
        Row: {
          called_at: string
          caller_context: Json | null
          created_at: string
          error_message: string | null
          execution_time_ms: number | null
          function_name: string
          id: string
          request_payload: Json | null
          response_data: Json | null
          status: string
        }
        Insert: {
          called_at?: string
          caller_context?: Json | null
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          function_name: string
          id?: string
          request_payload?: Json | null
          response_data?: Json | null
          status: string
        }
        Update: {
          called_at?: string
          caller_context?: Json | null
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          function_name?: string
          id?: string
          request_payload?: Json | null
          response_data?: Json | null
          status?: string
        }
        Relationships: []
      }
      api_key_health: {
        Row: {
          created_at: string | null
          days_until_expiry: number | null
          error_message: string | null
          expiry_warning: boolean | null
          id: string
          is_healthy: boolean
          key_type: string | null
          last_checked: string | null
          metadata: Json | null
          service_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          days_until_expiry?: number | null
          error_message?: string | null
          expiry_warning?: boolean | null
          id?: string
          is_healthy?: boolean
          key_type?: string | null
          last_checked?: string | null
          metadata?: Json | null
          service_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          days_until_expiry?: number | null
          error_message?: string | null
          expiry_warning?: boolean | null
          id?: string
          is_healthy?: boolean
          key_type?: string | null
          last_checked?: string | null
          metadata?: Json | null
          service_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      autonomous_actions_log: {
        Row: {
          action_details: Json
          action_timestamp: string
          action_type: string
          confidence_score: number | null
          created_at: string
          id: string
          impact_assessment: Json | null
          learning_notes: string | null
          metadata: Json | null
          outcome: string
          trigger_reason: string
        }
        Insert: {
          action_details: Json
          action_timestamp?: string
          action_type: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          impact_assessment?: Json | null
          learning_notes?: string | null
          metadata?: Json | null
          outcome: string
          trigger_reason: string
        }
        Update: {
          action_details?: Json
          action_timestamp?: string
          action_type?: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          impact_assessment?: Json | null
          learning_notes?: string | null
          metadata?: Json | null
          outcome?: string
          trigger_reason?: string
        }
        Relationships: []
      }
      autonomous_deploy_runs: {
        Row: {
          ended_at: string | null
          id: string
          metadata: Json
          started_at: string
          status: string
          tasks_done: number | null
          tasks_target: number | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          metadata?: Json
          started_at?: string
          status: string
          tasks_done?: number | null
          tasks_target?: number | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          metadata?: Json
          started_at?: string
          status?: string
          tasks_done?: number | null
          tasks_target?: number | null
        }
        Relationships: []
      }
      autonomy_metrics: {
        Row: {
          id: string
          measured_at: string
          metric_name: string
          metric_value: Json
        }
        Insert: {
          id?: string
          measured_at?: string
          metric_name: string
          metric_value: Json
        }
        Update: {
          id?: string
          measured_at?: string
          metric_name?: string
          metric_value?: Json
        }
        Relationships: []
      }
      battery_health_snapshots: {
        Row: {
          assessed_at: string
          average_charging_speed: string | null
          charging_efficiency: number | null
          charging_streak_days: number | null
          created_at: string
          degradation_level: string | null
          device_id: string
          health_score: number
          id: string
          metadata: Json | null
          port_quality: string | null
          recommendations: Json | null
          temperature_impact: string | null
          total_charging_sessions: number | null
        }
        Insert: {
          assessed_at?: string
          average_charging_speed?: string | null
          charging_efficiency?: number | null
          charging_streak_days?: number | null
          created_at?: string
          degradation_level?: string | null
          device_id: string
          health_score: number
          id?: string
          metadata?: Json | null
          port_quality?: string | null
          recommendations?: Json | null
          temperature_impact?: string | null
          total_charging_sessions?: number | null
        }
        Update: {
          assessed_at?: string
          average_charging_speed?: string | null
          charging_efficiency?: number | null
          charging_streak_days?: number | null
          created_at?: string
          degradation_level?: string | null
          device_id?: string
          health_score?: number
          id?: string
          metadata?: Json | null
          port_quality?: string | null
          recommendations?: Json | null
          temperature_impact?: string | null
          total_charging_sessions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "battery_health_snapshots_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "battery_health_snapshots_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "battery_health_snapshots_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      battery_readings: {
        Row: {
          battery_level: number
          charging_speed: string | null
          charging_time_remaining: number | null
          created_at: string
          device_id: string
          discharging_time_remaining: number | null
          id: string
          is_charging: boolean
          metadata: Json | null
          session_id: string
          temperature_impact: string | null
          timestamp: string
        }
        Insert: {
          battery_level: number
          charging_speed?: string | null
          charging_time_remaining?: number | null
          created_at?: string
          device_id: string
          discharging_time_remaining?: number | null
          id?: string
          is_charging?: boolean
          metadata?: Json | null
          session_id: string
          temperature_impact?: string | null
          timestamp?: string
        }
        Update: {
          battery_level?: number
          charging_speed?: string | null
          charging_time_remaining?: number | null
          created_at?: string
          device_id?: string
          discharging_time_remaining?: number | null
          id?: string
          is_charging?: boolean
          metadata?: Json | null
          session_id?: string
          temperature_impact?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "battery_readings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "battery_readings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "battery_readings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battery_readings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "battery_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      battery_sessions: {
        Row: {
          battery_level_end: number | null
          battery_level_start: number | null
          browser: string | null
          created_at: string
          device_id: string
          device_type: string | null
          ended_at: string | null
          id: string
          ip_address: unknown
          is_active: boolean | null
          metadata: Json | null
          os: string | null
          session_key: string
          started_at: string
          updated_at: string
          was_charging: boolean | null
        }
        Insert: {
          battery_level_end?: number | null
          battery_level_start?: number | null
          browser?: string | null
          created_at?: string
          device_id: string
          device_type?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          metadata?: Json | null
          os?: string | null
          session_key: string
          started_at?: string
          updated_at?: string
          was_charging?: boolean | null
        }
        Update: {
          battery_level_end?: number | null
          battery_level_start?: number | null
          browser?: string | null
          created_at?: string
          device_id?: string
          device_type?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          metadata?: Json | null
          os?: string | null
          session_key?: string
          started_at?: string
          updated_at?: string
          was_charging?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "battery_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "battery_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "battery_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_sessions: {
        Row: {
          charging_speed: string | null
          created_at: string
          device_id: string
          duration_seconds: number | null
          efficiency_score: number | null
          end_level: number | null
          ended_at: string | null
          id: string
          metadata: Json | null
          optimization_mode: string | null
          port_quality: string | null
          session_id: string | null
          start_level: number
          started_at: string
        }
        Insert: {
          charging_speed?: string | null
          created_at?: string
          device_id: string
          duration_seconds?: number | null
          efficiency_score?: number | null
          end_level?: number | null
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          optimization_mode?: string | null
          port_quality?: string | null
          session_id?: string | null
          start_level: number
          started_at?: string
        }
        Update: {
          charging_speed?: string | null
          created_at?: string
          device_id?: string
          duration_seconds?: number | null
          efficiency_score?: number | null
          end_level?: number | null
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          optimization_mode?: string | null
          port_quality?: string | null
          session_id?: string | null
          start_level?: number
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "charging_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "charging_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "battery_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          agent_id: string | null
          content: string
          created_at: string | null
          id: string
          message: string | null
          metadata: Json | null
          recipient: string | null
          role: string | null
          sender: string
          session_id: string | null
          thread_id: string | null
          timestamp: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          recipient?: string | null
          role?: string | null
          sender?: string
          session_id?: string | null
          thread_id?: string | null
          timestamp?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          recipient?: string | null
          role?: string | null
          sender?: string
          session_id?: string | null
          thread_id?: string | null
          timestamp?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          last_activity: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_activity?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_activity?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_thread_members: {
        Row: {
          created_at: string | null
          id: string
          role: string | null
          thread_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string | null
          thread_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string | null
          thread_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_thread_members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
        }
        Relationships: []
      }
      communication_logs: {
        Row: {
          channel: string
          created_at: string | null
          delivery_time_ms: number | null
          error_message: string | null
          executive_name: string
          id: string
          message_preview: string | null
          recipient: string
          success: boolean
        }
        Insert: {
          channel: string
          created_at?: string | null
          delivery_time_ms?: number | null
          error_message?: string | null
          executive_name: string
          id?: string
          message_preview?: string | null
          recipient: string
          success: boolean
        }
        Update: {
          channel?: string
          created_at?: string | null
          delivery_time_ms?: number | null
          error_message?: string | null
          executive_name?: string
          id?: string
          message_preview?: string | null
          recipient?: string
          success?: boolean
        }
        Relationships: []
      }
      communication_rate_limits: {
        Row: {
          channel: string
          created_at: string | null
          executive_name: string
          id: string
          max_per_window: number
          messages_sent: number | null
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          channel: string
          created_at?: string | null
          executive_name: string
          id?: string
          max_per_window: number
          messages_sent?: number | null
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          channel?: string
          created_at?: string | null
          executive_name?: string
          id?: string
          max_per_window?: number
          messages_sent?: number | null
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      community_ideas: {
        Row: {
          assigned_agent_id: string | null
          cao_perspective: string | null
          category: string | null
          cio_perspective: string | null
          community_benefit_score: number | null
          council_consensus: boolean | null
          council_recommendation: string | null
          created_at: string | null
          cso_perspective: string | null
          cto_perspective: string | null
          democracy_score: number | null
          description: string
          estimated_complexity: string | null
          estimated_timeline: string | null
          financial_sovereignty_score: number | null
          id: string
          implementation_completed_at: string | null
          implementation_plan: Json | null
          implementation_started_at: string | null
          privacy_score: number | null
          required_components: Json | null
          status: string | null
          submitted_by_session_key: string | null
          submitted_by_user_id: string | null
          technical_feasibility_score: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          cao_perspective?: string | null
          category?: string | null
          cio_perspective?: string | null
          community_benefit_score?: number | null
          council_consensus?: boolean | null
          council_recommendation?: string | null
          created_at?: string | null
          cso_perspective?: string | null
          cto_perspective?: string | null
          democracy_score?: number | null
          description: string
          estimated_complexity?: string | null
          estimated_timeline?: string | null
          financial_sovereignty_score?: number | null
          id?: string
          implementation_completed_at?: string | null
          implementation_plan?: Json | null
          implementation_started_at?: string | null
          privacy_score?: number | null
          required_components?: Json | null
          status?: string | null
          submitted_by_session_key?: string | null
          submitted_by_user_id?: string | null
          technical_feasibility_score?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          cao_perspective?: string | null
          category?: string | null
          cio_perspective?: string | null
          community_benefit_score?: number | null
          council_consensus?: boolean | null
          council_recommendation?: string | null
          created_at?: string | null
          cso_perspective?: string | null
          cto_perspective?: string | null
          democracy_score?: number | null
          description?: string
          estimated_complexity?: string | null
          estimated_timeline?: string | null
          financial_sovereignty_score?: number | null
          id?: string
          implementation_completed_at?: string | null
          implementation_plan?: Json | null
          implementation_started_at?: string | null
          privacy_score?: number | null
          required_components?: Json | null
          status?: string | null
          submitted_by_session_key?: string | null
          submitted_by_user_id?: string | null
          technical_feasibility_score?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      community_messages: {
        Row: {
          author_id: string | null
          author_name: string | null
          author_profile_id: string | null
          auto_response_queued: boolean | null
          channel_id: string | null
          channel_name: string | null
          content: string
          created_at: string | null
          downvotes: number | null
          flag_reason: string | null
          flagged_for_review: boolean | null
          id: string
          language: string | null
          media: Json | null
          metadata: Json | null
          platform: string
          platform_message_id: string | null
          processed: boolean | null
          replied_to_message_id: string | null
          sentiment_score: number | null
          shares: number | null
          thread_id: string | null
          topics: string[] | null
          upvotes: number | null
          url: string | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          author_profile_id?: string | null
          auto_response_queued?: boolean | null
          channel_id?: string | null
          channel_name?: string | null
          content: string
          created_at?: string | null
          downvotes?: number | null
          flag_reason?: string | null
          flagged_for_review?: boolean | null
          id?: string
          language?: string | null
          media?: Json | null
          metadata?: Json | null
          platform: string
          platform_message_id?: string | null
          processed?: boolean | null
          replied_to_message_id?: string | null
          sentiment_score?: number | null
          shares?: number | null
          thread_id?: string | null
          topics?: string[] | null
          upvotes?: number | null
          url?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          author_profile_id?: string | null
          auto_response_queued?: boolean | null
          channel_id?: string | null
          channel_name?: string | null
          content?: string
          created_at?: string | null
          downvotes?: number | null
          flag_reason?: string | null
          flagged_for_review?: boolean | null
          id?: string
          language?: string | null
          media?: Json | null
          metadata?: Json | null
          platform?: string
          platform_message_id?: string | null
          processed?: boolean | null
          replied_to_message_id?: string | null
          sentiment_score?: number | null
          shares?: number | null
          thread_id?: string | null
          topics?: string[] | null
          upvotes?: number | null
          url?: string | null
        }
        Relationships: []
      }
      community_responses: {
        Row: {
          approved: boolean | null
          approved_by: string | null
          created_at: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          platform_response_id: string | null
          response_content: string
          response_type: string
          sent_at: string | null
        }
        Insert: {
          approved?: boolean | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          platform_response_id?: string | null
          response_content: string
          response_type: string
          sent_at?: string | null
        }
        Update: {
          approved?: boolean | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          platform_response_id?: string | null
          response_content?: string
          response_type?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_responses_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      community_sentiment_reports: {
        Row: {
          created_at: string | null
          id: string
          overall_sentiment_score: number | null
          report_date: string | null
          sentiment_breakdown: Json | null
          top_topics: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          overall_sentiment_score?: number | null
          report_date?: string | null
          sentiment_breakdown?: Json | null
          top_topics?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          overall_sentiment_score?: number | null
          report_date?: string | null
          sentiment_breakdown?: Json | null
          top_topics?: Json | null
        }
        Relationships: []
      }
      competitor_profiles: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          github_org: string | null
          id: string
          is_active: boolean | null
          key_features: Json | null
          name: string
          website_url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          github_org?: string | null
          id?: string
          is_active?: boolean | null
          key_features?: Json | null
          name: string
          website_url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          github_org?: string | null
          id?: string
          is_active?: boolean | null
          key_features?: Json | null
          name?: string
          website_url?: string | null
        }
        Relationships: []
      }
      conversation_history: {
        Row: {
          conversation_title: string | null
          created_at: string
          id: string
          is_active: boolean | null
          last_activity_at: string
          message_count: number | null
          metadata: Json | null
          participant_type: string
          session_id: string
          session_key: string
          started_at: string
          updated_at: string
        }
        Insert: {
          conversation_title?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_activity_at?: string
          message_count?: number | null
          metadata?: Json | null
          participant_type?: string
          session_id: string
          session_key: string
          started_at?: string
          updated_at?: string
        }
        Update: {
          conversation_title?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_activity_at?: string
          message_count?: number | null
          metadata?: Json | null
          participant_type?: string
          session_id?: string
          session_key?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: string
          id: string
          message_type: string
          metadata: Json | null
          processing_data: Json | null
          session_id: string
          timestamp: string
        }
        Insert: {
          content: string
          id?: string
          message_type: string
          metadata?: Json | null
          processing_data?: Json | null
          session_id: string
          timestamp?: string
        }
        Update: {
          content?: string
          id?: string
          message_type?: string
          metadata?: Json | null
          processing_data?: Json | null
          session_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_sessions: {
        Row: {
          acquisition_stage: string | null
          conversion_event: string | null
          created_at: string
          id: string
          is_active: boolean | null
          last_qualification_at: string | null
          lead_score: number | null
          lifetime_value: number | null
          metadata: Json | null
          services_interested_in: Json | null
          session_key: string
          tier_preference: string | null
          title: string | null
          updated_at: string
          user_profile_id: string | null
        }
        Insert: {
          acquisition_stage?: string | null
          conversion_event?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_qualification_at?: string | null
          lead_score?: number | null
          lifetime_value?: number | null
          metadata?: Json | null
          services_interested_in?: Json | null
          session_key: string
          tier_preference?: string | null
          title?: string | null
          updated_at?: string
          user_profile_id?: string | null
        }
        Update: {
          acquisition_stage?: string | null
          conversion_event?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_qualification_at?: string | null
          lead_score?: number | null
          lifetime_value?: number | null
          metadata?: Json | null
          services_interested_in?: Json | null
          session_key?: string
          tier_preference?: string | null
          title?: string | null
          updated_at?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_sessions_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_summaries: {
        Row: {
          created_at: string
          end_message_id: string | null
          id: string
          message_count: number
          metadata: Json | null
          session_id: string
          start_message_id: string | null
          summary_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_message_id?: string | null
          id?: string
          message_count?: number
          metadata?: Json | null
          session_id: string
          start_message_id?: string | null
          summary_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_message_id?: string | null
          id?: string
          message_count?: number
          metadata?: Json | null
          session_id?: string
          start_message_id?: string | null
          summary_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      corporate_license_applications: {
        Row: {
          annual_executive_compensation: number | null
          application_status: string
          company_name: string
          company_size: number
          compliance_commitment: boolean | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          contact_title: string | null
          created_at: string
          current_ceo_salary: number | null
          current_cfo_salary: number | null
          current_coo_salary: number | null
          current_cto_salary: number | null
          estimated_savings: number | null
          filled_by: string
          id: string
          industry: string | null
          metadata: Json | null
          notes: string | null
          per_employee_redistribution: number | null
          session_key: string | null
          tier_requested: string
          updated_at: string
        }
        Insert: {
          annual_executive_compensation?: number | null
          application_status?: string
          company_name: string
          company_size: number
          compliance_commitment?: boolean | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          contact_title?: string | null
          created_at?: string
          current_ceo_salary?: number | null
          current_cfo_salary?: number | null
          current_coo_salary?: number | null
          current_cto_salary?: number | null
          estimated_savings?: number | null
          filled_by?: string
          id?: string
          industry?: string | null
          metadata?: Json | null
          notes?: string | null
          per_employee_redistribution?: number | null
          session_key?: string | null
          tier_requested?: string
          updated_at?: string
        }
        Update: {
          annual_executive_compensation?: number | null
          application_status?: string
          company_name?: string
          company_size?: number
          compliance_commitment?: boolean | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          contact_title?: string | null
          created_at?: string
          current_ceo_salary?: number | null
          current_cfo_salary?: number | null
          current_coo_salary?: number | null
          current_cto_salary?: number | null
          estimated_savings?: number | null
          filled_by?: string
          id?: string
          industry?: string | null
          metadata?: Json | null
          notes?: string | null
          per_employee_redistribution?: number | null
          session_key?: string | null
          tier_requested?: string
          updated_at?: string
        }
        Relationships: []
      }
      dao_members: {
        Row: {
          created_at: string
          devices: string[] | null
          id: string
          ip_addresses: Json | null
          is_active: boolean | null
          member_since: string
          metadata: Json | null
          reputation_score: number | null
          total_contributions: number | null
          updated_at: string
          voting_power: number | null
          wallet_address: string
          worker_ids: string[] | null
        }
        Insert: {
          created_at?: string
          devices?: string[] | null
          id?: string
          ip_addresses?: Json | null
          is_active?: boolean | null
          member_since?: string
          metadata?: Json | null
          reputation_score?: number | null
          total_contributions?: number | null
          updated_at?: string
          voting_power?: number | null
          wallet_address: string
          worker_ids?: string[] | null
        }
        Update: {
          created_at?: string
          devices?: string[] | null
          id?: string
          ip_addresses?: Json | null
          is_active?: boolean | null
          member_since?: string
          metadata?: Json | null
          reputation_score?: number | null
          total_contributions?: number | null
          updated_at?: string
          voting_power?: number | null
          wallet_address?: string
          worker_ids?: string[] | null
        }
        Relationships: []
      }
      dead_letter_jobs: {
        Row: {
          attempts: number
          failed_at: string
          id: number
          job_type: string
          payload: Json
          priority: number
          queue_name: string
          reason: string | null
        }
        Insert: {
          attempts: number
          failed_at?: string
          id: number
          job_type: string
          payload: Json
          priority: number
          queue_name: string
          reason?: string | null
        }
        Update: {
          attempts?: number
          failed_at?: string
          id?: number
          job_type?: string
          payload?: Json
          priority?: number
          queue_name?: string
          reason?: string | null
        }
        Relationships: []
      }
      decisions: {
        Row: {
          agent_id: string | null
          created_at: string
          decision: string
          id: string
          rationale: string
          task_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          decision: string
          id: string
          rationale: string
          task_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          decision?: string
          id?: string
          rationale?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      delegations: {
        Row: {
          created_at: string
          delegatee_agent_id: string
          delegator_agent_id: string
          id: string
          rationale: string | null
          task_id: string
        }
        Insert: {
          created_at?: string
          delegatee_agent_id: string
          delegator_agent_id: string
          id?: string
          rationale?: string | null
          task_id: string
        }
        Update: {
          created_at?: string
          delegatee_agent_id?: string
          delegator_agent_id?: string
          id?: string
          rationale?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegations_delegatee_agent_id_fkey"
            columns: ["delegatee_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegations_delegator_agent_id_fkey"
            columns: ["delegator_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_onboarding: {
        Row: {
          created_at: string | null
          experience_level: string | null
          github_username: string
          id: string
          onboarding_status: string | null
          skills_detected: Json | null
        }
        Insert: {
          created_at?: string | null
          experience_level?: string | null
          github_username: string
          id?: string
          onboarding_status?: string | null
          skills_detected?: Json | null
        }
        Update: {
          created_at?: string | null
          experience_level?: string | null
          github_username?: string
          id?: string
          onboarding_status?: string | null
          skills_detected?: Json | null
        }
        Relationships: []
      }
      device_activity_log: {
        Row: {
          activity_type: string
          category: Database["public"]["Enums"]["activity_category"]
          created_at: string | null
          description: string
          details: Json | null
          device_id: string
          id: string
          is_anomaly: boolean | null
          is_pop_eligible: boolean | null
          metadata: Json | null
          occurred_at: string
          pop_points: number | null
          processed_at: string | null
          session_id: string | null
          severity: Database["public"]["Enums"]["activity_severity"] | null
          tags: string[] | null
          user_id: string | null
          wallet_address: string | null
        }
        Insert: {
          activity_type: string
          category: Database["public"]["Enums"]["activity_category"]
          created_at?: string | null
          description: string
          details?: Json | null
          device_id: string
          id?: string
          is_anomaly?: boolean | null
          is_pop_eligible?: boolean | null
          metadata?: Json | null
          occurred_at?: string
          pop_points?: number | null
          processed_at?: string | null
          session_id?: string | null
          severity?: Database["public"]["Enums"]["activity_severity"] | null
          tags?: string[] | null
          user_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          activity_type?: string
          category?: Database["public"]["Enums"]["activity_category"]
          created_at?: string | null
          description?: string
          details?: Json | null
          device_id?: string
          id?: string
          is_anomaly?: boolean | null
          is_pop_eligible?: boolean | null
          metadata?: Json | null
          occurred_at?: string
          pop_points?: number | null
          processed_at?: string | null
          session_id?: string | null
          severity?: Database["public"]["Enums"]["activity_severity"] | null
          tags?: string[] | null
          user_id?: string | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_activity_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "device_activity_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "device_activity_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_activity_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "device_activity_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "device_connection_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_activity_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["session_id"]
          },
        ]
      }
      device_connection_sessions: {
        Row: {
          app_version: string | null
          battery_level_current: number | null
          battery_level_end: number | null
          battery_level_start: number | null
          charging_sessions_count: number | null
          commands_executed: number | null
          commands_received: number | null
          connected_at: string
          created_at: string | null
          device_id: string
          disconnected_at: string | null
          id: string
          ip_address: unknown
          is_active: boolean | null
          last_heartbeat: string
          metadata: Json | null
          session_key: string
          total_duration_seconds: number | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          app_version?: string | null
          battery_level_current?: number | null
          battery_level_end?: number | null
          battery_level_start?: number | null
          charging_sessions_count?: number | null
          commands_executed?: number | null
          commands_received?: number | null
          connected_at?: string
          created_at?: string | null
          device_id: string
          disconnected_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          last_heartbeat?: string
          metadata?: Json | null
          session_key: string
          total_duration_seconds?: number | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          app_version?: string | null
          battery_level_current?: number | null
          battery_level_end?: number | null
          battery_level_start?: number | null
          charging_sessions_count?: number | null
          commands_executed?: number | null
          commands_received?: number | null
          connected_at?: string
          created_at?: string | null
          device_id?: string
          disconnected_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          last_heartbeat?: string
          metadata?: Json | null
          session_key?: string
          total_duration_seconds?: number | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_connection_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "device_connection_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "device_connection_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_events: {
        Row: {
          created_at: string | null
          device_id: string | null
          event_type: string | null
          id: string
          ip_address: unknown
          payload: Json
          received_at: string | null
          source: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          event_type?: string | null
          id?: string
          ip_address?: unknown
          payload: Json
          received_at?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          event_type?: string | null
          id?: string
          ip_address?: unknown
          payload?: Json
          received_at?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      device_metrics_summary: {
        Row: {
          active_devices_count: number | null
          aggregated_at: string
          avg_charging_efficiency: number | null
          avg_session_duration_seconds: number | null
          created_at: string | null
          detailed_metrics: Json | null
          id: string
          summary_date: string
          summary_hour: number | null
          top_device_ids: string[] | null
          top_event_types: string[] | null
          total_anomalies_detected: number | null
          total_charging_sessions: number | null
          total_commands_executed: number | null
          total_commands_issued: number | null
          total_connections: number | null
          total_pop_points_earned: number | null
          updated_at: string | null
        }
        Insert: {
          active_devices_count?: number | null
          aggregated_at?: string
          avg_charging_efficiency?: number | null
          avg_session_duration_seconds?: number | null
          created_at?: string | null
          detailed_metrics?: Json | null
          id?: string
          summary_date?: string
          summary_hour?: number | null
          top_device_ids?: string[] | null
          top_event_types?: string[] | null
          total_anomalies_detected?: number | null
          total_charging_sessions?: number | null
          total_commands_executed?: number | null
          total_commands_issued?: number | null
          total_connections?: number | null
          total_pop_points_earned?: number | null
          updated_at?: string | null
        }
        Update: {
          active_devices_count?: number | null
          aggregated_at?: string
          avg_charging_efficiency?: number | null
          avg_session_duration_seconds?: number | null
          created_at?: string | null
          detailed_metrics?: Json | null
          id?: string
          summary_date?: string
          summary_hour?: number | null
          top_device_ids?: string[] | null
          top_event_types?: string[] | null
          total_anomalies_detected?: number | null
          total_charging_sessions?: number | null
          total_commands_executed?: number | null
          total_commands_issued?: number | null
          total_connections?: number | null
          total_pop_points_earned?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      device_miner_associations: {
        Row: {
          associated_at: string
          association_method: string | null
          created_at: string
          device_id: string
          id: string
          is_active: boolean | null
          is_primary_device: boolean | null
          metadata: Json | null
          mining_while_charging: boolean | null
          total_sessions_while_mining: number | null
          updated_at: string
          wallet_address: string | null
          worker_id: string
        }
        Insert: {
          associated_at?: string
          association_method?: string | null
          created_at?: string
          device_id: string
          id?: string
          is_active?: boolean | null
          is_primary_device?: boolean | null
          metadata?: Json | null
          mining_while_charging?: boolean | null
          total_sessions_while_mining?: number | null
          updated_at?: string
          wallet_address?: string | null
          worker_id: string
        }
        Update: {
          associated_at?: string
          association_method?: string | null
          created_at?: string
          device_id?: string
          id?: string
          is_active?: boolean | null
          is_primary_device?: boolean | null
          metadata?: Json | null
          mining_while_charging?: boolean | null
          total_sessions_while_mining?: number | null
          updated_at?: string
          wallet_address?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_miner_associations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "device_miner_associations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "device_miner_associations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_miner_associations_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "xmr_workers"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      devices: {
        Row: {
          browser: string | null
          created_at: string
          device_fingerprint: string
          device_type: string | null
          first_seen_at: string
          id: string
          ip_addresses: Json | null
          is_active: boolean | null
          last_seen_at: string
          metadata: Json | null
          os: string | null
          session_keys: string[] | null
          updated_at: string
          wallet_address: string | null
          worker_id: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_fingerprint: string
          device_type?: string | null
          first_seen_at?: string
          id?: string
          ip_addresses?: Json | null
          is_active?: boolean | null
          last_seen_at?: string
          metadata?: Json | null
          os?: string | null
          session_keys?: string[] | null
          updated_at?: string
          wallet_address?: string | null
          worker_id?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_fingerprint?: string
          device_type?: string | null
          first_seen_at?: string
          id?: string
          ip_addresses?: Json | null
          is_active?: boolean | null
          last_seen_at?: string
          metadata?: Json | null
          os?: string | null
          session_keys?: string[] | null
          updated_at?: string
          wallet_address?: string | null
          worker_id?: string | null
        }
        Relationships: []
      }
      edge_function_logs: {
        Row: {
          event_message: string | null
          event_type: string
          execution_time_ms: number | null
          function_name: string
          id: string
          level: string | null
          metadata: Json | null
          request_id: string | null
          status_code: number | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          event_message?: string | null
          event_type: string
          execution_time_ms?: number | null
          function_name: string
          id?: string
          level?: string | null
          metadata?: Json | null
          request_id?: string | null
          status_code?: number | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          event_message?: string | null
          event_type?: string
          execution_time_ms?: number | null
          function_name?: string
          id?: string
          level?: string | null
          metadata?: Json | null
          request_id?: string | null
          status_code?: number | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      edge_function_proposals: {
        Row: {
          category: string
          community_deadline: string | null
          created_at: string | null
          description: string
          executive_deadline: string | null
          function_name: string
          id: string
          implementation_code: string | null
          proposed_by: string
          rationale: string
          status: string | null
          updated_at: string | null
          use_cases: Json
          voting_phase: string | null
          voting_started_at: string | null
        }
        Insert: {
          category: string
          community_deadline?: string | null
          created_at?: string | null
          description: string
          executive_deadline?: string | null
          function_name: string
          id?: string
          implementation_code?: string | null
          proposed_by: string
          rationale: string
          status?: string | null
          updated_at?: string | null
          use_cases?: Json
          voting_phase?: string | null
          voting_started_at?: string | null
        }
        Update: {
          category?: string
          community_deadline?: string | null
          created_at?: string | null
          description?: string
          executive_deadline?: string | null
          function_name?: string
          id?: string
          implementation_code?: string | null
          proposed_by?: string
          rationale?: string
          status?: string | null
          updated_at?: string | null
          use_cases?: Json
          voting_phase?: string | null
          voting_started_at?: string | null
        }
        Relationships: []
      }
      edge_function_usage: {
        Row: {
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          executive_name: string | null
          function_name: string
          id: string
          success: boolean | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          executive_name?: string | null
          function_name: string
          id?: string
          success?: boolean | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          executive_name?: string | null
          function_name?: string
          id?: string
          success?: boolean | null
        }
        Relationships: []
      }
      eliza_activity_log: {
        Row: {
          activity_type: string
          agent_id: string | null
          created_at: string | null
          description: string | null
          function_name: string | null
          id: string
          mentioned_to_user: boolean | null
          metadata: Json | null
          status: string
          task_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          activity_type: string
          agent_id?: string | null
          created_at?: string | null
          description?: string | null
          function_name?: string | null
          id?: string
          mentioned_to_user?: boolean | null
          metadata?: Json | null
          status?: string
          task_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_type?: string
          agent_id?: string | null
          created_at?: string | null
          description?: string | null
          function_name?: string | null
          id?: string
          mentioned_to_user?: boolean | null
          metadata?: Json | null
          status?: string
          task_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      eliza_decision_reports: {
        Row: {
          community_votes: Json | null
          created_at: string | null
          decision: string
          decision_method: string
          executive_votes: Json | null
          id: string
          proposal_id: string | null
          reasoning: string
          total_community_votes: number | null
          total_executive_votes: number | null
          weighted_score_approve: number | null
          weighted_score_reject: number | null
        }
        Insert: {
          community_votes?: Json | null
          created_at?: string | null
          decision: string
          decision_method: string
          executive_votes?: Json | null
          id?: string
          proposal_id?: string | null
          reasoning: string
          total_community_votes?: number | null
          total_executive_votes?: number | null
          weighted_score_approve?: number | null
          weighted_score_reject?: number | null
        }
        Update: {
          community_votes?: Json | null
          created_at?: string | null
          decision?: string
          decision_method?: string
          executive_votes?: Json | null
          id?: string
          proposal_id?: string | null
          reasoning?: string
          total_community_votes?: number | null
          total_executive_votes?: number | null
          weighted_score_approve?: number | null
          weighted_score_reject?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "eliza_decision_reports_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "edge_function_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      eliza_function_usage: {
        Row: {
          context: string | null
          created_at: string | null
          deployment_id: string | null
          deployment_version: string | null
          error_message: string | null
          execution_time_ms: number | null
          executive_name: string | null
          function_hash: string | null
          function_name: string
          git_commit_hash: string | null
          id: string
          invoked_at: string | null
          invoked_by: string | null
          metadata: Json | null
          parameters: Json | null
          payload: Json | null
          result_summary: string | null
          session_id: string | null
          success: boolean
          tool_category: string | null
          user_context: string | null
          user_id: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          deployment_id?: string | null
          deployment_version?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          executive_name?: string | null
          function_hash?: string | null
          function_name: string
          git_commit_hash?: string | null
          id?: string
          invoked_at?: string | null
          invoked_by?: string | null
          metadata?: Json | null
          parameters?: Json | null
          payload?: Json | null
          result_summary?: string | null
          session_id?: string | null
          success: boolean
          tool_category?: string | null
          user_context?: string | null
          user_id?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string | null
          deployment_id?: string | null
          deployment_version?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          executive_name?: string | null
          function_hash?: string | null
          function_name?: string
          git_commit_hash?: string | null
          id?: string
          invoked_at?: string | null
          invoked_by?: string | null
          metadata?: Json | null
          parameters?: Json | null
          payload?: Json | null
          result_summary?: string | null
          session_id?: string | null
          success?: boolean
          tool_category?: string | null
          user_context?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      eliza_performance_metrics: {
        Row: {
          average_response_time_ms: number | null
          bugs_fixed_autonomously: number | null
          capabilities_expanded: number | null
          created_at: string | null
          error_rate_percent: number | null
          id: string
          ideas_approved: number | null
          ideas_evaluated: number | null
          ideas_implemented: number | null
          metric_date: string | null
          new_patterns_learned: number | null
          opportunities_actioned: number | null
          opportunities_discovered: number | null
          optimizations_performed: number | null
          tasks_completed: number | null
          uptime_percent: number | null
        }
        Insert: {
          average_response_time_ms?: number | null
          bugs_fixed_autonomously?: number | null
          capabilities_expanded?: number | null
          created_at?: string | null
          error_rate_percent?: number | null
          id?: string
          ideas_approved?: number | null
          ideas_evaluated?: number | null
          ideas_implemented?: number | null
          metric_date?: string | null
          new_patterns_learned?: number | null
          opportunities_actioned?: number | null
          opportunities_discovered?: number | null
          optimizations_performed?: number | null
          tasks_completed?: number | null
          uptime_percent?: number | null
        }
        Update: {
          average_response_time_ms?: number | null
          bugs_fixed_autonomously?: number | null
          capabilities_expanded?: number | null
          created_at?: string | null
          error_rate_percent?: number | null
          id?: string
          ideas_approved?: number | null
          ideas_evaluated?: number | null
          ideas_implemented?: number | null
          metric_date?: string | null
          new_patterns_learned?: number | null
          opportunities_actioned?: number | null
          opportunities_discovered?: number | null
          optimizations_performed?: number | null
          tasks_completed?: number | null
          uptime_percent?: number | null
        }
        Relationships: []
      }
      eliza_python_executions: {
        Row: {
          code: string
          created_at: string
          error_message: string | null
          execution_time_ms: number | null
          exit_code: number | null
          finished_at: string | null
          id: string
          metadata: Json
          output: Json | null
          purpose: string | null
          result: Json | null
          source: string | null
          started_at: string
          status: string
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          output?: Json | null
          purpose?: string | null
          result?: Json | null
          source?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          output?: Json | null
          purpose?: string | null
          result?: Json | null
          source?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: []
      }
      eliza_work_patterns: {
        Row: {
          action_taken: Json
          confidence_score: number | null
          context: Json
          created_at: string | null
          id: string
          last_applied_at: string | null
          lesson_learned: string
          outcome: string | null
          pattern_type: string | null
          times_applied: number | null
        }
        Insert: {
          action_taken: Json
          confidence_score?: number | null
          context: Json
          created_at?: string | null
          id?: string
          last_applied_at?: string | null
          lesson_learned: string
          outcome?: string | null
          pattern_type?: string | null
          times_applied?: number | null
        }
        Update: {
          action_taken?: Json
          confidence_score?: number | null
          context?: Json
          created_at?: string | null
          id?: string
          last_applied_at?: string | null
          lesson_learned?: string
          outcome?: string | null
          pattern_type?: string | null
          times_applied?: number | null
        }
        Relationships: []
      }
      engagement_commands: {
        Row: {
          acknowledged_at: string | null
          command_payload: Json
          command_type: Database["public"]["Enums"]["command_type"]
          created_at: string | null
          device_id: string | null
          error_message: string | null
          executed_at: string | null
          execution_result: Json | null
          expires_at: string | null
          id: string
          issued_at: string
          issued_by: string | null
          metadata: Json | null
          priority: number | null
          sent_at: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["command_status"] | null
          target_all: boolean | null
          updated_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          command_payload: Json
          command_type: Database["public"]["Enums"]["command_type"]
          created_at?: string | null
          device_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          metadata?: Json | null
          priority?: number | null
          sent_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["command_status"] | null
          target_all?: boolean | null
          updated_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          command_payload?: Json
          command_type?: Database["public"]["Enums"]["command_type"]
          created_at?: string | null
          device_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          metadata?: Json | null
          priority?: number | null
          sent_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["command_status"] | null
          target_all?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "engagement_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "engagement_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_commands_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "engagement_commands_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "device_connection_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_commands_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["session_id"]
          },
        ]
      }
      entity_relationships: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          relationship_type: string
          source_entity_id: string
          strength: number | null
          target_entity_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          relationship_type: string
          source_entity_id: string
          strength?: number | null
          target_entity_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          relationship_type?: string
          source_entity_id?: string
          strength?: number | null
          target_entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_relationships_source_entity_id_fkey"
            columns: ["source_entity_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_target_entity_id_fkey"
            columns: ["target_entity_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      event_actions: {
        Row: {
          actions: Json
          conditions: Json | null
          created_at: string | null
          description: string | null
          event_pattern: string
          id: string
          is_active: boolean | null
          priority: number | null
          updated_at: string | null
        }
        Insert: {
          actions: Json
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          event_pattern: string
          id?: string
          is_active?: boolean | null
          priority?: number | null
          updated_at?: string | null
        }
        Update: {
          actions?: Json
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          event_pattern?: string
          id?: string
          is_active?: boolean | null
          priority?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      executive_feedback: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          created_at: string | null
          executive_name: string
          feedback_type: string
          fix_result: Json | null
          id: string
          impact_level: string | null
          learning_point: string
          observation_description: string
          original_context: Json | null
          suggestion_type: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          created_at?: string | null
          executive_name: string
          feedback_type: string
          fix_result?: Json | null
          id?: string
          impact_level?: string | null
          learning_point: string
          observation_description: string
          original_context?: Json | null
          suggestion_type?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          created_at?: string | null
          executive_name?: string
          feedback_type?: string
          fix_result?: Json | null
          id?: string
          impact_level?: string | null
          learning_point?: string
          observation_description?: string
          original_context?: Json | null
          suggestion_type?: string | null
        }
        Relationships: []
      }
      executive_votes: {
        Row: {
          created_at: string | null
          executive_name: string
          id: string
          proposal_id: string | null
          reasoning: string
          session_key: string | null
          vote: string
        }
        Insert: {
          created_at?: string | null
          executive_name: string
          id?: string
          proposal_id?: string | null
          reasoning: string
          session_key?: string | null
          vote: string
        }
        Update: {
          created_at?: string | null
          executive_name?: string
          id?: string
          proposal_id?: string | null
          reasoning?: string
          session_key?: string | null
          vote?: string
        }
        Relationships: [
          {
            foreignKeyName: "executive_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "edge_function_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      faucet_claims: {
        Row: {
          amount: number
          claimed_at: string
          created_at: string
          device_id: string | null
          error_message: string | null
          id: string
          ip_address: unknown
          session_key: string | null
          status: string
          transaction_hash: string | null
          updated_at: string
          wallet_address: string
        }
        Insert: {
          amount: number
          claimed_at?: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          ip_address?: unknown
          session_key?: string | null
          status?: string
          transaction_hash?: string | null
          updated_at?: string
          wallet_address: string
        }
        Update: {
          amount?: number
          claimed_at?: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          ip_address?: unknown
          session_key?: string | null
          status?: string
          transaction_hash?: string | null
          updated_at?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "faucet_claims_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "faucet_claims_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "faucet_claims_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      faucet_config: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      frontend_events: {
        Row: {
          created_at: string
          device_id: string | null
          event_category: string | null
          event_data: Json
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          occurred_at: string
          page_path: string | null
          processed: boolean | null
          requires_action: boolean | null
          session_id: string | null
          source: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          event_category?: string | null
          event_data?: Json
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          occurred_at?: string
          page_path?: string | null
          processed?: boolean | null
          requires_action?: boolean | null
          session_id?: string | null
          source?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          event_category?: string | null
          event_data?: Json
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          occurred_at?: string
          page_path?: string | null
          processed?: boolean | null
          requires_action?: boolean | null
          session_id?: string | null
          source?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      frontend_health_checks: {
        Row: {
          check_timestamp: string
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          response_time_ms: number | null
          status: string
          status_code: number | null
        }
        Insert: {
          check_timestamp?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          response_time_ms?: number | null
          status: string
          status_code?: number | null
        }
        Update: {
          check_timestamp?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          response_time_ms?: number | null
          status?: string
          status_code?: number | null
        }
        Relationships: []
      }
      github_api_usage: {
        Row: {
          action: string
          created_at: string | null
          credential_type: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          rate_limit_remaining: number | null
          rate_limit_reset: string | null
          repo: string | null
          response_time_ms: number | null
          status_code: number | null
          success: boolean | null
        }
        Insert: {
          action: string
          created_at?: string | null
          credential_type?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          rate_limit_remaining?: number | null
          rate_limit_reset?: string | null
          repo?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          success?: boolean | null
        }
        Update: {
          action?: string
          created_at?: string | null
          credential_type?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          rate_limit_remaining?: number | null
          rate_limit_reset?: string | null
          repo?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          success?: boolean | null
        }
        Relationships: []
      }
      github_contributions: {
        Row: {
          contribution_data: Json
          contribution_type: Database["public"]["Enums"]["contribution_type"]
          created_at: string | null
          github_url: string
          github_username: string
          harm_reason: string | null
          id: string
          is_harmful: boolean | null
          is_validated: boolean | null
          metadata: Json | null
          repo_name: string
          repo_owner: string
          reward_calculated_at: string | null
          reward_paid_at: string | null
          updated_at: string | null
          validation_reason: string | null
          validation_score: number | null
          wallet_address: string
          xmrt_earned: number | null
        }
        Insert: {
          contribution_data?: Json
          contribution_type: Database["public"]["Enums"]["contribution_type"]
          created_at?: string | null
          github_url: string
          github_username: string
          harm_reason?: string | null
          id?: string
          is_harmful?: boolean | null
          is_validated?: boolean | null
          metadata?: Json | null
          repo_name: string
          repo_owner: string
          reward_calculated_at?: string | null
          reward_paid_at?: string | null
          updated_at?: string | null
          validation_reason?: string | null
          validation_score?: number | null
          wallet_address: string
          xmrt_earned?: number | null
        }
        Update: {
          contribution_data?: Json
          contribution_type?: Database["public"]["Enums"]["contribution_type"]
          created_at?: string | null
          github_url?: string
          github_username?: string
          harm_reason?: string | null
          id?: string
          is_harmful?: boolean | null
          is_validated?: boolean | null
          metadata?: Json | null
          repo_name?: string
          repo_owner?: string
          reward_calculated_at?: string | null
          reward_paid_at?: string | null
          updated_at?: string | null
          validation_reason?: string | null
          validation_score?: number | null
          wallet_address?: string
          xmrt_earned?: number | null
        }
        Relationships: []
      }
      github_contributors: {
        Row: {
          avg_validation_score: number | null
          ban_reason: string | null
          created_at: string | null
          first_contribution_at: string | null
          github_username: string
          harmful_contribution_count: number | null
          id: string
          is_active: boolean | null
          is_banned: boolean | null
          last_contribution_at: string | null
          metadata: Json | null
          pat_last_validated: string | null
          target_repo_name: string | null
          target_repo_owner: string | null
          total_contributions: number | null
          total_xmrt_earned: number | null
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          avg_validation_score?: number | null
          ban_reason?: string | null
          created_at?: string | null
          first_contribution_at?: string | null
          github_username: string
          harmful_contribution_count?: number | null
          id?: string
          is_active?: boolean | null
          is_banned?: boolean | null
          last_contribution_at?: string | null
          metadata?: Json | null
          pat_last_validated?: string | null
          target_repo_name?: string | null
          target_repo_owner?: string | null
          total_contributions?: number | null
          total_xmrt_earned?: number | null
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          avg_validation_score?: number | null
          ban_reason?: string | null
          created_at?: string | null
          first_contribution_at?: string | null
          github_username?: string
          harmful_contribution_count?: number | null
          id?: string
          is_active?: boolean | null
          is_banned?: boolean | null
          last_contribution_at?: string | null
          metadata?: Json | null
          pat_last_validated?: string | null
          target_repo_name?: string | null
          target_repo_owner?: string | null
          total_contributions?: number | null
          total_xmrt_earned?: number | null
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      idea_evaluation_history: {
        Row: {
          created_at: string | null
          evaluation_stage: string | null
          evaluator: string | null
          id: string
          idea_id: string | null
          notes: string | null
          scores: Json | null
        }
        Insert: {
          created_at?: string | null
          evaluation_stage?: string | null
          evaluator?: string | null
          id?: string
          idea_id?: string | null
          notes?: string | null
          scores?: Json | null
        }
        Update: {
          created_at?: string | null
          evaluation_stage?: string | null
          evaluator?: string | null
          id?: string
          idea_id?: string | null
          notes?: string | null
          scores?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "idea_evaluation_history_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "community_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      improvement_metrics: {
        Row: {
          baseline_value: number | null
          current_value: number | null
          id: string
          improvement_pct: number | null
          measured_at: string
          metadata: Json
          metric_type: Database["public"]["Enums"]["metric_type"]
        }
        Insert: {
          baseline_value?: number | null
          current_value?: number | null
          id?: string
          improvement_pct?: number | null
          measured_at?: string
          metadata?: Json
          metric_type: Database["public"]["Enums"]["metric_type"]
        }
        Update: {
          baseline_value?: number | null
          current_value?: number | null
          id?: string
          improvement_pct?: number | null
          measured_at?: string
          metadata?: Json
          metric_type?: Database["public"]["Enums"]["metric_type"]
        }
        Relationships: []
      }
      interaction_patterns: {
        Row: {
          confidence_score: number | null
          frequency: number | null
          id: string
          last_occurrence: string
          metadata: Json | null
          pattern_data: Json
          pattern_name: string
          session_key: string
        }
        Insert: {
          confidence_score?: number | null
          frequency?: number | null
          id?: string
          last_occurrence?: string
          metadata?: Json | null
          pattern_data: Json
          pattern_name: string
          session_key: string
        }
        Update: {
          confidence_score?: number | null
          frequency?: number | null
          id?: string
          last_occurrence?: string
          metadata?: Json | null
          pattern_data?: Json
          pattern_name?: string
          session_key?: string
        }
        Relationships: []
      }
      ip_address_log: {
        Row: {
          activity_type: string | null
          created_at: string
          device_id: string | null
          first_seen: string
          geolocation: Json | null
          id: string
          ip_address: unknown
          last_seen: string
          metadata: Json | null
          session_key: string | null
          total_requests: number | null
          user_agent: string | null
          wallet_address: string | null
          worker_id: string | null
        }
        Insert: {
          activity_type?: string | null
          created_at?: string
          device_id?: string | null
          first_seen?: string
          geolocation?: Json | null
          id?: string
          ip_address: unknown
          last_seen?: string
          metadata?: Json | null
          session_key?: string | null
          total_requests?: number | null
          user_agent?: string | null
          wallet_address?: string | null
          worker_id?: string | null
        }
        Update: {
          activity_type?: string | null
          created_at?: string
          device_id?: string | null
          first_seen?: string
          geolocation?: Json | null
          id?: string
          ip_address?: unknown
          last_seen?: string
          metadata?: Json | null
          session_key?: string | null
          total_requests?: number | null
          user_agent?: string | null
          wallet_address?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ip_address_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "ip_address_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "ip_address_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      job_attempts: {
        Row: {
          error: string | null
          finished_at: string | null
          id: number
          job_id: number
          logs: string | null
          started_at: string
          success: boolean | null
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: number
          job_id: number
          logs?: string | null
          started_at?: string
          success?: boolean | null
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: number
          job_id?: number
          logs?: string | null
          started_at?: string
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "job_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          id: number
          inserted_at: string
          job_type: string
          lease_token: string | null
          leased_until: string | null
          max_retries: number
          payload: Json
          priority: number
          queue_name: string
          run_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          id?: number
          inserted_at?: string
          job_type: string
          lease_token?: string | null
          leased_until?: string | null
          max_retries?: number
          payload?: Json
          priority?: number
          queue_name?: string
          run_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          id?: number
          inserted_at?: string
          job_type?: string
          lease_token?: string | null
          leased_until?: string | null
          max_retries?: number
          payload?: Json
          priority?: number
          queue_name?: string
          run_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_entities: {
        Row: {
          confidence_score: number | null
          created_at: string
          description: string | null
          entity_name: string
          entity_type: string
          id: string
          metadata: Json | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          description?: string | null
          entity_name: string
          entity_type: string
          id?: string
          metadata?: Json | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          description?: string | null
          entity_name?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_graph: {
        Row: {
          confidence: number | null
          created_at: string
          entity_id: string
          id: string
          learned_from: Database["public"]["Enums"]["learned_from"] | null
          metadata: Json
          related_entity_id: string
          relationship_type: Database["public"]["Enums"]["relationship_type"]
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          entity_id: string
          id?: string
          learned_from?: Database["public"]["Enums"]["learned_from"] | null
          metadata?: Json
          related_entity_id: string
          relationship_type: Database["public"]["Enums"]["relationship_type"]
        }
        Update: {
          confidence?: number | null
          created_at?: string
          entity_id?: string
          id?: string
          learned_from?: Database["public"]["Enums"]["learned_from"] | null
          metadata?: Json
          related_entity_id?: string
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_graph_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_graph_related_entity_id_fkey"
            columns: ["related_entity_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_qualification_signals: {
        Row: {
          confidence_score: number | null
          contributed_to_score: number | null
          created_at: string | null
          detected_at: string | null
          id: string
          session_key: string
          signal_type: string
          signal_value: Json | null
        }
        Insert: {
          confidence_score?: number | null
          contributed_to_score?: number | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          session_key: string
          signal_type: string
          signal_value?: Json | null
        }
        Update: {
          confidence_score?: number | null
          contributed_to_score?: number | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          session_key?: string
          signal_type?: string
          signal_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_lead_signals_session"
            columns: ["session_key"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["session_key"]
          },
        ]
      }
      learning_patterns: {
        Row: {
          confidence_score: number | null
          id: string
          last_used: string | null
          pattern_data: Json | null
          pattern_type: string
          usage_count: number | null
        }
        Insert: {
          confidence_score?: number | null
          id?: string
          last_used?: string | null
          pattern_data?: Json | null
          pattern_type: string
          usage_count?: number | null
        }
        Update: {
          confidence_score?: number | null
          id?: string
          last_used?: string | null
          pattern_data?: Json | null
          pattern_type?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      learning_sessions: {
        Row: {
          agent_id: string
          completed_at: string | null
          id: string
          learning_materials: Json
          learning_task_id: string | null
          metadata: Json | null
          proficiency_tests: Json | null
          progress_percentage: number
          skill_being_learned: string
          started_at: string
          status: string
        }
        Insert: {
          agent_id: string
          completed_at?: string | null
          id?: string
          learning_materials: Json
          learning_task_id?: string | null
          metadata?: Json | null
          proficiency_tests?: Json | null
          progress_percentage?: number
          skill_being_learned: string
          started_at?: string
          status?: string
        }
        Update: {
          agent_id?: string
          completed_at?: string | null
          id?: string
          learning_materials?: Json
          learning_task_id?: string | null
          metadata?: Json | null
          proficiency_tests?: Json | null
          progress_percentage?: number
          skill_being_learned?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      manus_token_usage: {
        Row: {
          created_at: string
          date: string
          id: string
          last_reset_at: string
          tokens_available: number
          tokens_used: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          last_reset_at?: string
          tokens_available?: number
          tokens_used?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          last_reset_at?: string
          tokens_available?: number
          tokens_used?: number
          updated_at?: string
        }
        Relationships: []
      }
      memory_contexts: {
        Row: {
          content: string
          context_type: string
          embedding: number[] | null
          id: string
          importance_score: number | null
          metadata: Json | null
          session_id: string
          timestamp: string | null
          user_id: string
        }
        Insert: {
          content: string
          context_type: string
          embedding?: number[] | null
          id?: string
          importance_score?: number | null
          metadata?: Json | null
          session_id: string
          timestamp?: string | null
          user_id: string
        }
        Update: {
          content?: string
          context_type?: string
          embedding?: number[] | null
          id?: string
          importance_score?: number | null
          metadata?: Json | null
          session_id?: string
          timestamp?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          room: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          room: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          room?: string
          user_id?: string
        }
        Relationships: []
      }
      mining_updates: {
        Row: {
          created_at: string
          id: string
          metric: Json
          miner_id: string
          status: string
          update_source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metric: Json
          miner_id: string
          status: string
          update_source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metric?: Json
          miner_id?: string
          status?: string
          update_source?: string | null
        }
        Relationships: []
      }
      network_access_errors: {
        Row: {
          created_at: string | null
          error_type: string
          function_name: string
          id: string
          target_url: string | null
        }
        Insert: {
          created_at?: string | null
          error_type: string
          function_name: string
          id?: string
          target_url?: string | null
        }
        Update: {
          created_at?: string | null
          error_type?: string
          function_name?: string
          id?: string
          target_url?: string | null
        }
        Relationships: []
      }
      network_proxy_logs: {
        Row: {
          caller_id: string | null
          event: string
          hostname: string | null
          id: number
          level: string
          meta: Json | null
          method: string | null
          reason: string | null
          ts: string
          url: string | null
        }
        Insert: {
          caller_id?: string | null
          event: string
          hostname?: string | null
          id?: number
          level: string
          meta?: Json | null
          method?: string | null
          reason?: string | null
          ts?: string
          url?: string | null
        }
        Update: {
          caller_id?: string | null
          event?: string
          hostname?: string | null
          id?: number
          level?: string
          meta?: Json | null
          method?: string | null
          reason?: string | null
          ts?: string
          url?: string | null
        }
        Relationships: []
      }
      network_proxy_whitelist: {
        Row: {
          category: string
          comment: string | null
          enabled: boolean
          id: number
          inserted_at: string
          pattern: string
          source: string
          updated_at: string
        }
        Insert: {
          category?: string
          comment?: string | null
          enabled?: boolean
          id?: number
          inserted_at?: string
          pattern: string
          source?: string
          updated_at?: string
        }
        Update: {
          category?: string
          comment?: string | null
          enabled?: boolean
          id?: number
          inserted_at?: string
          pattern?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      neural_pathways: {
        Row: {
          action_sequence: Json[]
          created_at: string
          id: string
          last_used: string | null
          metadata: Json
          pattern_type: Database["public"]["Enums"]["pattern_type"]
          success_rate: number | null
          trigger_context: Json
          usage_count: number
        }
        Insert: {
          action_sequence?: Json[]
          created_at?: string
          id?: string
          last_used?: string | null
          metadata?: Json
          pattern_type: Database["public"]["Enums"]["pattern_type"]
          success_rate?: number | null
          trigger_context?: Json
          usage_count?: number
        }
        Update: {
          action_sequence?: Json[]
          created_at?: string
          id?: string
          last_used?: string | null
          metadata?: Json
          pattern_type?: Database["public"]["Enums"]["pattern_type"]
          success_rate?: number | null
          trigger_context?: Json
          usage_count?: number
        }
        Relationships: []
      }
      nlg_generated_content: {
        Row: {
          audience_type: string
          content: string
          content_type: string
          created_at: string | null
          engagement_metrics: Json | null
          format: string | null
          id: string
          metadata: Json | null
          published: boolean | null
          published_at: string | null
          published_to: string[] | null
          source_data: Json | null
          title: string | null
        }
        Insert: {
          audience_type: string
          content: string
          content_type: string
          created_at?: string | null
          engagement_metrics?: Json | null
          format?: string | null
          id?: string
          metadata?: Json | null
          published?: boolean | null
          published_at?: string | null
          published_to?: string[] | null
          source_data?: Json | null
          title?: string | null
        }
        Update: {
          audience_type?: string
          content?: string
          content_type?: string
          created_at?: string | null
          engagement_metrics?: Json | null
          format?: string | null
          id?: string
          metadata?: Json | null
          published?: boolean | null
          published_at?: string | null
          published_to?: string[] | null
          source_data?: Json | null
          title?: string | null
        }
        Relationships: []
      }
      onboarding_checkpoints: {
        Row: {
          api_key: string
          checkpoint: string
          completed_at: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          time_to_complete_seconds: number | null
        }
        Insert: {
          api_key: string
          checkpoint: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          time_to_complete_seconds?: number | null
        }
        Update: {
          api_key?: string
          checkpoint?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          time_to_complete_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_onboarding_api_key"
            columns: ["api_key"]
            isOneToOne: false
            referencedRelation: "service_api_keys"
            referencedColumns: ["api_key"]
          },
        ]
      }
      opportunity_log: {
        Row: {
          action_details: Json | null
          action_taken: string | null
          actionable: boolean | null
          created_at: string | null
          description: string
          detected_by: string | null
          id: string
          opportunity_type: string | null
          priority: number | null
          resolved_at: string | null
          title: string
        }
        Insert: {
          action_details?: Json | null
          action_taken?: string | null
          actionable?: boolean | null
          created_at?: string | null
          description: string
          detected_by?: string | null
          id?: string
          opportunity_type?: string | null
          priority?: number | null
          resolved_at?: string | null
          title: string
        }
        Update: {
          action_details?: Json | null
          action_taken?: string | null
          actionable?: boolean | null
          created_at?: string | null
          description?: string
          detected_by?: string | null
          id?: string
          opportunity_type?: string | null
          priority?: number | null
          resolved_at?: string | null
          title?: string
        }
        Relationships: []
      }
      pop_events_ledger: {
        Row: {
          activity_log_ids: string[] | null
          confidence_score: number | null
          created_at: string | null
          device_id: string
          event_data: Json | null
          event_description: string
          event_timestamp: string
          event_type: Database["public"]["Enums"]["pop_event_type"]
          id: string
          is_paid_out: boolean | null
          is_validated: boolean | null
          metadata: Json | null
          paid_out_at: string | null
          pop_points: number
          session_id: string | null
          transaction_hash: string | null
          user_id: string | null
          validated_at: string
          validation_method: string | null
          wallet_address: string
        }
        Insert: {
          activity_log_ids?: string[] | null
          confidence_score?: number | null
          created_at?: string | null
          device_id: string
          event_data?: Json | null
          event_description: string
          event_timestamp?: string
          event_type: Database["public"]["Enums"]["pop_event_type"]
          id?: string
          is_paid_out?: boolean | null
          is_validated?: boolean | null
          metadata?: Json | null
          paid_out_at?: string | null
          pop_points: number
          session_id?: string | null
          transaction_hash?: string | null
          user_id?: string | null
          validated_at?: string
          validation_method?: string | null
          wallet_address: string
        }
        Update: {
          activity_log_ids?: string[] | null
          confidence_score?: number | null
          created_at?: string | null
          device_id?: string
          event_data?: Json | null
          event_description?: string
          event_timestamp?: string
          event_type?: Database["public"]["Enums"]["pop_event_type"]
          id?: string
          is_paid_out?: boolean | null
          is_validated?: boolean | null
          metadata?: Json | null
          paid_out_at?: string | null
          pop_points?: number
          session_id?: string | null
          transaction_hash?: string | null
          user_id?: string | null
          validated_at?: string
          validation_method?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "pop_events_ledger_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "pop_events_ledger_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "pop_events_ledger_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pop_events_ledger_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "pop_events_ledger_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "device_connection_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pop_events_ledger_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["session_id"]
          },
        ]
      }
      predictive_insights: {
        Row: {
          analysis_type: string
          confidence_score: number | null
          created_at: string | null
          data_source: string
          forecast_horizon: string | null
          id: string
          insight_data: Json
          metadata: Json | null
          resolved_at: string | null
          severity: string | null
          status: string | null
        }
        Insert: {
          analysis_type: string
          confidence_score?: number | null
          created_at?: string | null
          data_source: string
          forecast_horizon?: string | null
          id?: string
          insight_data: Json
          metadata?: Json | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
        }
        Update: {
          analysis_type?: string
          confidence_score?: number | null
          created_at?: string | null
          data_source?: string
          forecast_horizon?: string | null
          id?: string
          insight_data?: Json
          metadata?: Json | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
        }
        Relationships: []
      }
      proposal_comments: {
        Row: {
          author_name: string
          author_session_key: string | null
          comment: string
          comment_type: string | null
          created_at: string | null
          downvotes: number | null
          id: string
          parent_comment_id: string | null
          proposal_id: string | null
          upvotes: number | null
        }
        Insert: {
          author_name: string
          author_session_key?: string | null
          comment: string
          comment_type?: string | null
          created_at?: string | null
          downvotes?: number | null
          id?: string
          parent_comment_id?: string | null
          proposal_id?: string | null
          upvotes?: number | null
        }
        Update: {
          author_name?: string
          author_session_key?: string | null
          comment?: string
          comment_type?: string | null
          created_at?: string | null
          downvotes?: number | null
          id?: string
          parent_comment_id?: string | null
          proposal_id?: string | null
          upvotes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "proposal_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_comments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "edge_function_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          identifier: string
          request_count: number | null
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          identifier: string
          request_count?: number | null
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number | null
          window_start?: string
        }
        Relationships: []
      }
      repo_improvement_runs: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          pr_url: string | null
          repo_name: string
          started_at: string
          status: string
          summary: Json
          task_type: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          pr_url?: string | null
          repo_name: string
          started_at?: string
          status?: string
          summary?: Json
          task_type: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          pr_url?: string | null
          repo_name?: string
          started_at?: string
          status?: string
          summary?: Json
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_improvement_runs_repo_name_fkey"
            columns: ["repo_name"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["name"]
          },
        ]
      }
      repo_monitors: {
        Row: {
          cadence_minutes: number
          config: Json
          created_at: string
          enabled: boolean
          last_run_at: string | null
          repo_name: string
          task_types: string[]
          updated_at: string
        }
        Insert: {
          cadence_minutes?: number
          config?: Json
          created_at?: string
          enabled?: boolean
          last_run_at?: string | null
          repo_name: string
          task_types?: string[]
          updated_at?: string
        }
        Update: {
          cadence_minutes?: number
          config?: Json
          created_at?: string
          enabled?: boolean
          last_run_at?: string | null
          repo_name?: string
          task_types?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_monitors_repo_name_fkey"
            columns: ["repo_name"]
            isOneToOne: true
            referencedRelation: "repos"
            referencedColumns: ["name"]
          },
        ]
      }
      repo_scans: {
        Row: {
          attempt: number
          commit_sha: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          exit_code: number | null
          finished_at: string | null
          id: string
          max_attempts: number
          metadata: Json
          priority: number
          repo_url: string
          started_at: string | null
          status: string
          stderr: string | null
          stdout: string | null
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          attempt?: number
          commit_sha?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          max_attempts?: number
          metadata?: Json
          priority?: number
          repo_url: string
          started_at?: string | null
          status?: string
          stderr?: string | null
          stdout?: string | null
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          attempt?: number
          commit_sha?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          max_attempts?: number
          metadata?: Json
          priority?: number
          repo_url?: string
          started_at?: string | null
          status?: string
          stderr?: string | null
          stdout?: string | null
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: []
      }
      repos: {
        Row: {
          category: string
          default_branch: string | null
          is_fork: boolean | null
          last_checked: string | null
          name: string
          repo_exists: boolean | null
          url: string | null
        }
        Insert: {
          category: string
          default_branch?: string | null
          is_fork?: boolean | null
          last_checked?: string | null
          name: string
          repo_exists?: boolean | null
          url?: string | null
        }
        Update: {
          category?: string
          default_branch?: string | null
          is_fork?: boolean | null
          last_checked?: string | null
          name?: string
          repo_exists?: boolean | null
          url?: string | null
        }
        Relationships: []
      }
      revenue_metrics: {
        Row: {
          churned_customers: number | null
          created_at: string | null
          id: string
          metric_date: string
          mrr_usd: number | null
          new_customers: number | null
          top_service: string | null
          total_customers: number | null
          total_requests: number | null
        }
        Insert: {
          churned_customers?: number | null
          created_at?: string | null
          id?: string
          metric_date: string
          mrr_usd?: number | null
          new_customers?: number | null
          top_service?: string | null
          total_customers?: number | null
          total_requests?: number | null
        }
        Update: {
          churned_customers?: number | null
          created_at?: string | null
          id?: string
          metric_date?: string
          mrr_usd?: number | null
          new_customers?: number | null
          top_service?: string | null
          total_customers?: number | null
          total_requests?: number | null
        }
        Relationships: []
      }
      scenario_simulations: {
        Row: {
          confidence_level: number | null
          created_at: string | null
          created_by: string | null
          execution_time_ms: number | null
          id: string
          input_parameters: Json
          metadata: Json | null
          recommendations: string[] | null
          risk_assessment: Json | null
          scenario_name: string
          scenario_type: string
          simulation_results: Json
        }
        Insert: {
          confidence_level?: number | null
          created_at?: string | null
          created_by?: string | null
          execution_time_ms?: number | null
          id?: string
          input_parameters: Json
          metadata?: Json | null
          recommendations?: string[] | null
          risk_assessment?: Json | null
          scenario_name: string
          scenario_type: string
          simulation_results: Json
        }
        Update: {
          confidence_level?: number | null
          created_at?: string | null
          created_by?: string | null
          execution_time_ms?: number | null
          id?: string
          input_parameters?: Json
          metadata?: Json | null
          recommendations?: string[] | null
          risk_assessment?: Json | null
          scenario_name?: string
          scenario_type?: string
          simulation_results?: Json
        }
        Relationships: []
      }
      scheduled_actions: {
        Row: {
          action_data: Json
          action_name: string
          action_type: string
          created_at: string
          id: string
          is_active: boolean | null
          last_execution: string | null
          metadata: Json | null
          next_execution: string | null
          schedule_expression: string
          session_key: string
        }
        Insert: {
          action_data: Json
          action_name: string
          action_type: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_execution?: string | null
          metadata?: Json | null
          next_execution?: string | null
          schedule_expression: string
          session_key: string
        }
        Update: {
          action_data?: Json
          action_name?: string
          action_type?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_execution?: string | null
          metadata?: Json | null
          next_execution?: string | null
          schedule_expression?: string
          session_key?: string
        }
        Relationships: []
      }
      service_api_keys: {
        Row: {
          acquired_via: string | null
          activation_completed: boolean | null
          api_key: string
          conversation_context: Json | null
          created_at: string | null
          expires_at: string | null
          first_api_call_at: string | null
          id: string
          last_used_at: string | null
          metadata: Json | null
          owner_email: string
          owner_name: string | null
          quota_requests_per_month: number
          quota_used_current_month: number | null
          referral_source: string | null
          service_name: string
          session_key: string | null
          status: string | null
          tier: string
        }
        Insert: {
          acquired_via?: string | null
          activation_completed?: boolean | null
          api_key: string
          conversation_context?: Json | null
          created_at?: string | null
          expires_at?: string | null
          first_api_call_at?: string | null
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          owner_email: string
          owner_name?: string | null
          quota_requests_per_month: number
          quota_used_current_month?: number | null
          referral_source?: string | null
          service_name: string
          session_key?: string | null
          status?: string | null
          tier: string
        }
        Update: {
          acquired_via?: string | null
          activation_completed?: boolean | null
          api_key?: string
          conversation_context?: Json | null
          created_at?: string | null
          expires_at?: string | null
          first_api_call_at?: string | null
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          owner_email?: string
          owner_name?: string | null
          quota_requests_per_month?: number
          quota_used_current_month?: number | null
          referral_source?: string | null
          service_name?: string
          session_key?: string | null
          status?: string | null
          tier?: string
        }
        Relationships: []
      }
      service_invoices: {
        Row: {
          api_key: string
          billing_period_end: string
          billing_period_start: string
          created_at: string | null
          id: string
          metadata: Json | null
          paid_at: string | null
          payment_method: string | null
          status: string | null
          total_cost_usd: number
          total_requests: number
        }
        Insert: {
          api_key: string
          billing_period_end: string
          billing_period_start: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string | null
          total_cost_usd: number
          total_requests: number
        }
        Update: {
          api_key?: string
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string | null
          total_cost_usd?: number
          total_requests?: number
        }
        Relationships: []
      }
      service_status: {
        Row: {
          ai_enabled: boolean | null
          current_cycle: number | null
          cycle_interval: number | null
          ecosystem_repo: string | null
          github_user: string | null
          id: string
          is_running: boolean | null
          last_checked_at: string | null
          max_cycles: number | null
          metrics: Json | null
          metrics_status: string | null
          mode: string | null
          service_name: string
          target_repo: string | null
          version: string | null
        }
        Insert: {
          ai_enabled?: boolean | null
          current_cycle?: number | null
          cycle_interval?: number | null
          ecosystem_repo?: string | null
          github_user?: string | null
          id?: string
          is_running?: boolean | null
          last_checked_at?: string | null
          max_cycles?: number | null
          metrics?: Json | null
          metrics_status?: string | null
          mode?: string | null
          service_name?: string
          target_repo?: string | null
          version?: string | null
        }
        Update: {
          ai_enabled?: boolean | null
          current_cycle?: number | null
          cycle_interval?: number | null
          ecosystem_repo?: string | null
          github_user?: string | null
          id?: string
          is_running?: boolean | null
          last_checked_at?: string | null
          max_cycles?: number | null
          metrics?: Json | null
          metrics_status?: string | null
          mode?: string | null
          service_name?: string
          target_repo?: string | null
          version?: string | null
        }
        Relationships: []
      }
      service_status_controls: {
        Row: {
          action: string
          correlation_id: string
          created_at: string
          id: string
          params: Json
          reason: string | null
          requested_by: string | null
          status: string
        }
        Insert: {
          action: string
          correlation_id: string
          created_at?: string
          id?: string
          params?: Json
          reason?: string | null
          requested_by?: string | null
          status?: string
        }
        Update: {
          action?: string
          correlation_id?: string
          created_at?: string
          id?: string
          params?: Json
          reason?: string | null
          requested_by?: string | null
          status?: string
        }
        Relationships: []
      }
      service_status_history: {
        Row: {
          created_at: string | null
          id: number
          service_name: string
          snapshot: Json
        }
        Insert: {
          created_at?: string | null
          id?: number
          service_name: string
          snapshot: Json
        }
        Update: {
          created_at?: string | null
          id?: number
          service_name?: string
          snapshot?: Json
        }
        Relationships: []
      }
      service_usage_logs: {
        Row: {
          api_key: string
          cost_usd: number | null
          endpoint: string
          id: number
          metadata: Json | null
          response_time_ms: number | null
          service_name: string
          status_code: number | null
          timestamp: string | null
          tokens_used: number | null
        }
        Insert: {
          api_key: string
          cost_usd?: number | null
          endpoint: string
          id?: number
          metadata?: Json | null
          response_time_ms?: number | null
          service_name: string
          status_code?: number | null
          timestamp?: string | null
          tokens_used?: number | null
        }
        Update: {
          api_key?: string
          cost_usd?: number | null
          endpoint?: string
          id?: number
          metadata?: Json | null
          response_time_ms?: number | null
          service_name?: string
          status_code?: number | null
          timestamp?: string | null
          tokens_used?: number | null
        }
        Relationships: []
      }
      skill_gap_analysis: {
        Row: {
          blocked_tasks: string[]
          created_at: string
          frequency: number
          id: string
          identified_skill: string
          metadata: Json | null
          priority: number
          proposed_learning_tasks: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          blocked_tasks: string[]
          created_at?: string
          frequency?: number
          id?: string
          identified_skill: string
          metadata?: Json | null
          priority?: number
          proposed_learning_tasks?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          blocked_tasks?: string[]
          created_at?: string
          frequency?: number
          id?: string
          identified_skill?: string
          metadata?: Json | null
          priority?: number
          proposed_learning_tasks?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      social_author_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          handle: string | null
          id: string
          is_verified: boolean | null
          metadata: Json | null
          platform: Database["public"]["Enums"]["social_platform"]
          platform_user_id: string
          profile_url: string | null
          reputation_score: number | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          handle?: string | null
          id?: string
          is_verified?: boolean | null
          metadata?: Json | null
          platform: Database["public"]["Enums"]["social_platform"]
          platform_user_id: string
          profile_url?: string | null
          reputation_score?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          handle?: string | null
          id?: string
          is_verified?: boolean | null
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["social_platform"]
          platform_user_id?: string
          profile_url?: string | null
          reputation_score?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      social_identity_links: {
        Row: {
          author_profile_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          updated_at: string | null
          user_profile_id: string | null
          verified_at: string | null
          verified_by: string | null
          wallet_address: string | null
        }
        Insert: {
          author_profile_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          updated_at?: string | null
          user_profile_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
          wallet_address?: string | null
        }
        Update: {
          author_profile_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          updated_at?: string | null
          user_profile_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      superduper_agents: {
        Row: {
          agent_name: string
          category: string | null
          combined_capabilities: Json | null
          created_at: string | null
          description: string | null
          display_name: string
          edge_function_name: string
          execution_count: number | null
          failure_count: number | null
          id: string
          is_active: boolean | null
          priority: number | null
          status: string | null
          success_count: number | null
          updated_at: string | null
        }
        Insert: {
          agent_name: string
          category?: string | null
          combined_capabilities?: Json | null
          created_at?: string | null
          description?: string | null
          display_name: string
          edge_function_name: string
          execution_count?: number | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          status?: string | null
          success_count?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string
          category?: string | null
          combined_capabilities?: Json | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          edge_function_name?: string
          execution_count?: number | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          status?: string | null
          success_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_architecture_knowledge: {
        Row: {
          component_name: string
          component_type: string
          created_at: string | null
          eliza_notes: string | null
          id: string
          last_analyzed_at: string | null
          performance_metrics: Json | null
          purpose: string
          relationships: Json | null
          updated_at: string | null
          usage_patterns: Json | null
        }
        Insert: {
          component_name: string
          component_type: string
          created_at?: string | null
          eliza_notes?: string | null
          id?: string
          last_analyzed_at?: string | null
          performance_metrics?: Json | null
          purpose: string
          relationships?: Json | null
          updated_at?: string | null
          usage_patterns?: Json | null
        }
        Update: {
          component_name?: string
          component_type?: string
          created_at?: string | null
          eliza_notes?: string | null
          id?: string
          last_analyzed_at?: string | null
          performance_metrics?: Json | null
          purpose?: string
          relationships?: Json | null
          updated_at?: string | null
          usage_patterns?: Json | null
        }
        Relationships: []
      }
      system_events: {
        Row: {
          actor_agent_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          subject_id: string
          subject_type: string
        }
        Insert: {
          actor_agent_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          subject_id: string
          subject_type: string
        }
        Update: {
          actor_agent_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          subject_id?: string
          subject_type?: string
        }
        Relationships: []
      }
      system_flags: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      system_issues: {
        Row: {
          code: string
          details: Json
          detected_at: string
          id: string
          owner_user_id: string | null
          remediation: string | null
          remediation_sql: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          details?: Json
          detected_at?: string
          id?: string
          owner_user_id?: string | null
          remediation?: string | null
          remediation_sql?: string | null
          severity: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          details?: Json
          detected_at?: string
          id?: string
          owner_user_id?: string | null
          remediation?: string | null
          remediation_sql?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string
          details: Json | null
          error_stack: string | null
          id: string
          log_category: string
          log_level: string
          log_source: string
          message: string
          metadata: Json | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          user_context: Json | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          error_stack?: string | null
          id?: string
          log_category: string
          log_level: string
          log_source: string
          message: string
          metadata?: Json | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          user_context?: Json | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          error_stack?: string | null
          id?: string
          log_category?: string
          log_level?: string
          log_source?: string
          message?: string
          metadata?: Json | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          user_context?: Json | null
        }
        Relationships: []
      }
      system_metrics: {
        Row: {
          created_at: string
          id: string
          measured_at: string
          metadata: Json | null
          metric_category: string
          metric_name: string
          metric_value: number
        }
        Insert: {
          created_at?: string
          id?: string
          measured_at?: string
          metadata?: Json | null
          metric_category: string
          metric_name: string
          metric_value: number
        }
        Update: {
          created_at?: string
          id?: string
          measured_at?: string
          metadata?: Json | null
          metric_category?: string
          metric_name?: string
          metric_value?: number
        }
        Relationships: []
      }
      system_performance_logs: {
        Row: {
          agent_stats: Json
          api_health_stats: Json
          conversation_stats: Json
          created_at: string
          health_score: number
          health_status: string
          id: string
          issues_detected: Json[] | null
          learning_stats: Json
          metadata: Json | null
          python_execution_stats: Json
          recommendations: string[] | null
          recorded_at: string
          skill_gap_stats: Json
          snapshot_type: string
          task_stats: Json
          workflow_stats: Json
        }
        Insert: {
          agent_stats?: Json
          api_health_stats?: Json
          conversation_stats?: Json
          created_at?: string
          health_score: number
          health_status: string
          id?: string
          issues_detected?: Json[] | null
          learning_stats?: Json
          metadata?: Json | null
          python_execution_stats?: Json
          recommendations?: string[] | null
          recorded_at?: string
          skill_gap_stats?: Json
          snapshot_type: string
          task_stats?: Json
          workflow_stats?: Json
        }
        Update: {
          agent_stats?: Json
          api_health_stats?: Json
          conversation_stats?: Json
          created_at?: string
          health_score?: number
          health_status?: string
          id?: string
          issues_detected?: Json[] | null
          learning_stats?: Json
          metadata?: Json | null
          python_execution_stats?: Json
          recommendations?: string[] | null
          recorded_at?: string
          skill_gap_stats?: Json
          snapshot_type?: string
          task_stats?: Json
          workflow_stats?: Json
        }
        Relationships: []
      }
      task_blocker_resolutions: {
        Row: {
          blocker_type: string
          created_at: string | null
          id: string
          original_reason: string | null
          resolution_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_automatically: boolean | null
          resolver_agent_id: string | null
          task_id: string
        }
        Insert: {
          blocker_type: string
          created_at?: string | null
          id?: string
          original_reason?: string | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_automatically?: boolean | null
          resolver_agent_id?: string | null
          task_id: string
        }
        Update: {
          blocker_type?: string
          created_at?: string | null
          id?: string
          original_reason?: string | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_automatically?: boolean | null
          resolver_agent_id?: string | null
          task_id?: string
        }
        Relationships: []
      }
      task_executions: {
        Row: {
          error_message: string | null
          execution_end: string | null
          execution_start: string
          id: string
          metadata: Json | null
          result_data: Json | null
          status: string
          task_id: string
        }
        Insert: {
          error_message?: string | null
          execution_end?: string | null
          execution_start?: string
          id?: string
          metadata?: Json | null
          result_data?: Json | null
          status?: string
          task_id: string
        }
        Update: {
          error_message?: string | null
          execution_end?: string | null
          execution_start?: string
          id?: string
          metadata?: Json | null
          result_data?: Json | null
          status?: string
          task_id?: string
        }
        Relationships: []
      }
      task_templates: {
        Row: {
          auto_advance_threshold_hours: number | null
          category: string
          checklist: Json | null
          created_at: string | null
          default_priority: number | null
          default_stage: string | null
          description_template: string
          estimated_duration_hours: number | null
          id: string
          is_active: boolean | null
          required_skills: Json | null
          success_rate: number | null
          template_name: string
          times_used: number | null
          updated_at: string | null
        }
        Insert: {
          auto_advance_threshold_hours?: number | null
          category: string
          checklist?: Json | null
          created_at?: string | null
          default_priority?: number | null
          default_stage?: string | null
          description_template: string
          estimated_duration_hours?: number | null
          id?: string
          is_active?: boolean | null
          required_skills?: Json | null
          success_rate?: number | null
          template_name: string
          times_used?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_advance_threshold_hours?: number | null
          category?: string
          checklist?: Json | null
          created_at?: string | null
          default_priority?: number | null
          default_stage?: string | null
          description_template?: string
          estimated_duration_hours?: number | null
          id?: string
          is_active?: boolean | null
          required_skills?: Json | null
          success_rate?: number | null
          template_name?: string
          times_used?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          actual_duration_hours: number | null
          assignee_agent_id: string | null
          auto_advance_threshold_hours: number | null
          blocked_reason: string | null
          blocking_reason: string | null
          category: Database["public"]["Enums"]["task_category"]
          claimed_at: string | null
          claimed_by: string | null
          completed_checklist_items: Json | null
          created_at: string
          description: string
          estimated_duration_hours: number | null
          id: string
          last_agent_notified_at: string | null
          max_retries: number | null
          metadata: Json
          priority: number
          progress_percentage: number | null
          quality_score: number | null
          repo: string
          required_skills: Json | null
          resolution_notes: string | null
          retry_count: number | null
          stage: Database["public"]["Enums"]["task_stage"]
          stage_started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          actual_duration_hours?: number | null
          assignee_agent_id?: string | null
          auto_advance_threshold_hours?: number | null
          blocked_reason?: string | null
          blocking_reason?: string | null
          category: Database["public"]["Enums"]["task_category"]
          claimed_at?: string | null
          claimed_by?: string | null
          completed_checklist_items?: Json | null
          created_at?: string
          description: string
          estimated_duration_hours?: number | null
          id: string
          last_agent_notified_at?: string | null
          max_retries?: number | null
          metadata?: Json
          priority?: number
          progress_percentage?: number | null
          quality_score?: number | null
          repo: string
          required_skills?: Json | null
          resolution_notes?: string | null
          retry_count?: number | null
          stage: Database["public"]["Enums"]["task_stage"]
          stage_started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          actual_duration_hours?: number | null
          assignee_agent_id?: string | null
          auto_advance_threshold_hours?: number | null
          blocked_reason?: string | null
          blocking_reason?: string | null
          category?: Database["public"]["Enums"]["task_category"]
          claimed_at?: string | null
          claimed_by?: string | null
          completed_checklist_items?: Json | null
          created_at?: string
          description?: string
          estimated_duration_hours?: number | null
          id?: string
          last_agent_notified_at?: string | null
          max_retries?: number | null
          metadata?: Json
          priority?: number
          progress_percentage?: number | null
          quality_score?: number | null
          repo?: string
          required_skills?: Json | null
          resolution_notes?: string | null
          retry_count?: number | null
          stage?: Database["public"]["Enums"]["task_stage"]
          stage_started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_agent_id_fkey"
            columns: ["assignee_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_repo_fkey"
            columns: ["repo"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["name"]
          },
        ]
      }
      user_identities: {
        Row: {
          id: string
          identity_key: string
          identity_type: Database["public"]["Enums"]["identity_type"]
          is_primary: boolean | null
          linked_at: string | null
          metadata: Json | null
          platform: Database["public"]["Enums"]["social_platform"] | null
          platform_user_id: string | null
          user_profile_id: string
        }
        Insert: {
          id?: string
          identity_key: string
          identity_type: Database["public"]["Enums"]["identity_type"]
          is_primary?: boolean | null
          linked_at?: string | null
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["social_platform"] | null
          platform_user_id?: string | null
          user_profile_id: string
        }
        Update: {
          id?: string
          identity_key?: string
          identity_type?: Database["public"]["Enums"]["identity_type"]
          is_primary?: boolean | null
          linked_at?: string | null
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["social_platform"] | null
          platform_user_id?: string | null
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_identities_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          preference_key: string
          preference_value: Json
          session_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          preference_key: string
          preference_value: Json
          session_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          preference_key?: string
          preference_value?: Json
          session_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          device_ids: string[] | null
          id: string
          ip_address: unknown
          last_reward_at: string | null
          metadata: Json | null
          payout_wallet_address: string | null
          payout_wallet_type: string | null
          total_time_online_seconds: number
          total_xmrt_earned: number
          updated_at: string
          wallet_connected_at: string | null
          wallet_last_verified: string | null
        }
        Insert: {
          created_at?: string
          device_ids?: string[] | null
          id?: string
          ip_address: unknown
          last_reward_at?: string | null
          metadata?: Json | null
          payout_wallet_address?: string | null
          payout_wallet_type?: string | null
          total_time_online_seconds?: number
          total_xmrt_earned?: number
          updated_at?: string
          wallet_connected_at?: string | null
          wallet_last_verified?: string | null
        }
        Update: {
          created_at?: string
          device_ids?: string[] | null
          id?: string
          ip_address?: unknown
          last_reward_at?: string | null
          metadata?: Json | null
          payout_wallet_address?: string | null
          payout_wallet_type?: string | null
          total_time_online_seconds?: number
          total_xmrt_earned?: number
          updated_at?: string
          wallet_connected_at?: string | null
          wallet_last_verified?: string | null
        }
        Relationships: []
      }
      user_worker_mappings: {
        Row: {
          alias: string | null
          created_at: string
          device_id: string | null
          id: string
          ip_addresses: Json | null
          is_active: boolean
          last_active: string
          metadata: Json | null
          registered_at: string
          session_key: string | null
          total_hashrate: number | null
          total_shares: number | null
          updated_at: string
          user_id: string | null
          wallet_address: string
          worker_id: string
        }
        Insert: {
          alias?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          ip_addresses?: Json | null
          is_active?: boolean
          last_active?: string
          metadata?: Json | null
          registered_at?: string
          session_key?: string | null
          total_hashrate?: number | null
          total_shares?: number | null
          updated_at?: string
          user_id?: string | null
          wallet_address: string
          worker_id: string
        }
        Update: {
          alias?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          ip_addresses?: Json | null
          is_active?: boolean
          last_active?: string
          metadata?: Json | null
          registered_at?: string
          session_key?: string | null
          total_hashrate?: number | null
          total_shares?: number | null
          updated_at?: string
          user_id?: string | null
          wallet_address?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_worker_mappings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "user_worker_mappings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "user_worker_mappings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      vercel_deployments: {
        Row: {
          build_duration_ms: number | null
          created_at: string
          deployed_at: string | null
          deployment_id: string | null
          deployment_url: string | null
          git_branch: string | null
          git_commit_message: string | null
          git_commit_sha: string | null
          id: string
          metadata: Json | null
          notified_backend: boolean | null
          project_id: string
          status: string
          trigger_source: string | null
          updated_at: string
        }
        Insert: {
          build_duration_ms?: number | null
          created_at?: string
          deployed_at?: string | null
          deployment_id?: string | null
          deployment_url?: string | null
          git_branch?: string | null
          git_commit_message?: string | null
          git_commit_sha?: string | null
          id?: string
          metadata?: Json | null
          notified_backend?: boolean | null
          project_id?: string
          status: string
          trigger_source?: string | null
          updated_at?: string
        }
        Update: {
          build_duration_ms?: number | null
          created_at?: string
          deployed_at?: string | null
          deployment_id?: string | null
          deployment_url?: string | null
          git_branch?: string | null
          git_commit_message?: string | null
          git_commit_sha?: string | null
          id?: string
          metadata?: Json | null
          notified_backend?: boolean | null
          project_id?: string
          status?: string
          trigger_source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vercel_function_logs: {
        Row: {
          cold_start: boolean | null
          created_at: string
          error_message: string | null
          execution_time_ms: number | null
          function_name: string
          function_path: string | null
          id: string
          invocation_id: string | null
          invoked_at: string
          logs: string[] | null
          metadata: Json | null
          region: string | null
          request_method: string | null
          request_path: string | null
          response_status: number | null
          status: string
        }
        Insert: {
          cold_start?: boolean | null
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          function_name: string
          function_path?: string | null
          id?: string
          invocation_id?: string | null
          invoked_at?: string
          logs?: string[] | null
          metadata?: Json | null
          region?: string | null
          request_method?: string | null
          request_path?: string | null
          response_status?: number | null
          status: string
        }
        Update: {
          cold_start?: boolean | null
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          function_name?: string
          function_path?: string | null
          id?: string
          invocation_id?: string | null
          invoked_at?: string
          logs?: string[] | null
          metadata?: Json | null
          region?: string | null
          request_method?: string | null
          request_path?: string | null
          response_status?: number | null
          status?: string
        }
        Relationships: []
      }
      vercel_service_health: {
        Row: {
          check_timestamp: string | null
          created_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          response_time_ms: number | null
          service_name: string
          status: string
          status_code: number | null
        }
        Insert: {
          check_timestamp?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          response_time_ms?: number | null
          service_name: string
          status: string
          status_code?: number | null
        }
        Update: {
          check_timestamp?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          response_time_ms?: number | null
          service_name?: string
          status?: string
          status_code?: number | null
        }
        Relationships: []
      }
      visitor_links: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
          visitor_id?: string
        }
        Relationships: []
      }
      vsco_api_logs: {
        Row: {
          action: string
          created_at: string | null
          endpoint: string | null
          error_message: string | null
          executive: string | null
          id: string
          method: string | null
          request_payload: Json | null
          response_data: Json | null
          response_time_ms: number | null
          status_code: number | null
          success: boolean | null
        }
        Insert: {
          action: string
          created_at?: string | null
          endpoint?: string | null
          error_message?: string | null
          executive?: string | null
          id?: string
          method?: string | null
          request_payload?: Json | null
          response_data?: Json | null
          response_time_ms?: number | null
          status_code?: number | null
          success?: boolean | null
        }
        Update: {
          action?: string
          created_at?: string | null
          endpoint?: string | null
          error_message?: string | null
          executive?: string | null
          id?: string
          method?: string | null
          request_payload?: Json | null
          response_data?: Json | null
          response_time_ms?: number | null
          status_code?: number | null
          success?: boolean | null
        }
        Relationships: []
      }
      vsco_brands: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          raw_data: Json | null
          synced_at: string | null
          vsco_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          raw_data?: Json | null
          synced_at?: string | null
          vsco_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          raw_data?: Json | null
          synced_at?: string | null
          vsco_id?: string
        }
        Relationships: []
      }
      vsco_contacts: {
        Row: {
          brand_id: string | null
          cell_phone: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
          kind: string | null
          last_name: string | null
          name: string | null
          phone: string | null
          raw_data: Json | null
          synced_at: string | null
          vsco_id: string
        }
        Insert: {
          brand_id?: string | null
          cell_phone?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          kind?: string | null
          last_name?: string | null
          name?: string | null
          phone?: string | null
          raw_data?: Json | null
          synced_at?: string | null
          vsco_id: string
        }
        Update: {
          brand_id?: string | null
          cell_phone?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          kind?: string | null
          last_name?: string | null
          name?: string | null
          phone?: string | null
          raw_data?: Json | null
          synced_at?: string | null
          vsco_id?: string
        }
        Relationships: []
      }
      vsco_events: {
        Row: {
          channel: string | null
          confirmed: boolean | null
          created_at: string | null
          end_date: string | null
          end_time: string | null
          event_type: string | null
          id: string
          location_address: string | null
          name: string | null
          raw_data: Json | null
          start_date: string | null
          start_time: string | null
          synced_at: string | null
          vsco_id: string
          vsco_job_id: string | null
        }
        Insert: {
          channel?: string | null
          confirmed?: boolean | null
          created_at?: string | null
          end_date?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          location_address?: string | null
          name?: string | null
          raw_data?: Json | null
          start_date?: string | null
          start_time?: string | null
          synced_at?: string | null
          vsco_id: string
          vsco_job_id?: string | null
        }
        Update: {
          channel?: string | null
          confirmed?: boolean | null
          created_at?: string | null
          end_date?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          location_address?: string | null
          name?: string | null
          raw_data?: Json | null
          start_date?: string | null
          start_time?: string | null
          synced_at?: string | null
          vsco_id?: string
          vsco_job_id?: string | null
        }
        Relationships: []
      }
      vsco_files: {
        Row: {
          created_at: string | null
          file_size: number | null
          file_type: string | null
          filename: string | null
          id: string
          raw_data: Json | null
          synced_at: string | null
          url: string | null
          vsco_gallery_id: string | null
          vsco_id: string
          vsco_job_id: string | null
        }
        Insert: {
          created_at?: string | null
          file_size?: number | null
          file_type?: string | null
          filename?: string | null
          id?: string
          raw_data?: Json | null
          synced_at?: string | null
          url?: string | null
          vsco_gallery_id?: string | null
          vsco_id: string
          vsco_job_id?: string | null
        }
        Update: {
          created_at?: string | null
          file_size?: number | null
          file_type?: string | null
          filename?: string | null
          id?: string
          raw_data?: Json | null
          synced_at?: string | null
          url?: string | null
          vsco_gallery_id?: string | null
          vsco_id?: string
          vsco_job_id?: string | null
        }
        Relationships: []
      }
      vsco_jobs: {
        Row: {
          account_balance: number | null
          booking_date: string | null
          brand_id: string | null
          closed: boolean | null
          closed_reason: string | null
          created_at: string | null
          event_date: string | null
          id: string
          job_type: string | null
          lead_confidence: string | null
          lead_rating: number | null
          lead_source: string | null
          lead_status: string | null
          name: string | null
          raw_data: Json | null
          stage: string | null
          synced_at: string | null
          total_cost: number | null
          total_revenue: number | null
          vsco_id: string
        }
        Insert: {
          account_balance?: number | null
          booking_date?: string | null
          brand_id?: string | null
          closed?: boolean | null
          closed_reason?: string | null
          created_at?: string | null
          event_date?: string | null
          id?: string
          job_type?: string | null
          lead_confidence?: string | null
          lead_rating?: number | null
          lead_source?: string | null
          lead_status?: string | null
          name?: string | null
          raw_data?: Json | null
          stage?: string | null
          synced_at?: string | null
          total_cost?: number | null
          total_revenue?: number | null
          vsco_id: string
        }
        Update: {
          account_balance?: number | null
          booking_date?: string | null
          brand_id?: string | null
          closed?: boolean | null
          closed_reason?: string | null
          created_at?: string | null
          event_date?: string | null
          id?: string
          job_type?: string | null
          lead_confidence?: string | null
          lead_rating?: number | null
          lead_source?: string | null
          lead_status?: string | null
          name?: string | null
          raw_data?: Json | null
          stage?: string | null
          synced_at?: string | null
          total_cost?: number | null
          total_revenue?: number | null
          vsco_id?: string
        }
        Relationships: []
      }
      vsco_notes: {
        Row: {
          author: string | null
          content_html: string | null
          content_text: string | null
          created_at: string | null
          id: string
          note_date: string | null
          raw_data: Json | null
          synced_at: string | null
          vsco_contact_id: string | null
          vsco_id: string
          vsco_job_id: string | null
        }
        Insert: {
          author?: string | null
          content_html?: string | null
          content_text?: string | null
          created_at?: string | null
          id?: string
          note_date?: string | null
          raw_data?: Json | null
          synced_at?: string | null
          vsco_contact_id?: string | null
          vsco_id: string
          vsco_job_id?: string | null
        }
        Update: {
          author?: string | null
          content_html?: string | null
          content_text?: string | null
          created_at?: string | null
          id?: string
          note_date?: string | null
          raw_data?: Json | null
          synced_at?: string | null
          vsco_contact_id?: string | null
          vsco_id?: string
          vsco_job_id?: string | null
        }
        Relationships: []
      }
      vsco_orders: {
        Row: {
          balance_due: number | null
          created_at: string | null
          id: string
          order_date: string | null
          order_number: string | null
          raw_data: Json | null
          status: string | null
          subtotal: number | null
          synced_at: string | null
          tax_total: number | null
          total: number | null
          vsco_id: string
          vsco_job_id: string | null
        }
        Insert: {
          balance_due?: number | null
          created_at?: string | null
          id?: string
          order_date?: string | null
          order_number?: string | null
          raw_data?: Json | null
          status?: string | null
          subtotal?: number | null
          synced_at?: string | null
          tax_total?: number | null
          total?: number | null
          vsco_id: string
          vsco_job_id?: string | null
        }
        Update: {
          balance_due?: number | null
          created_at?: string | null
          id?: string
          order_date?: string | null
          order_number?: string | null
          raw_data?: Json | null
          status?: string | null
          subtotal?: number | null
          synced_at?: string | null
          tax_total?: number | null
          total?: number | null
          vsco_id?: string
          vsco_job_id?: string | null
        }
        Relationships: []
      }
      vsco_products: {
        Row: {
          category: string | null
          cost: number | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string | null
          price: number | null
          product_type_id: string | null
          raw_data: Json | null
          synced_at: string | null
          tax_rate: number | null
          vsco_id: string
        }
        Insert: {
          category?: string | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          price?: number | null
          product_type_id?: string | null
          raw_data?: Json | null
          synced_at?: string | null
          tax_rate?: number | null
          vsco_id: string
        }
        Update: {
          category?: string | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          price?: number | null
          product_type_id?: string | null
          raw_data?: Json | null
          synced_at?: string | null
          tax_rate?: number | null
          vsco_id?: string
        }
        Relationships: []
      }
      vsco_worksheets: {
        Row: {
          contacts: Json | null
          created_at: string | null
          events: Json | null
          id: string
          notes: string | null
          products: Json | null
          raw_data: Json | null
          synced_at: string | null
          template_name: string | null
          vsco_job_id: string
        }
        Insert: {
          contacts?: Json | null
          created_at?: string | null
          events?: Json | null
          id?: string
          notes?: string | null
          products?: Json | null
          raw_data?: Json | null
          synced_at?: string | null
          template_name?: string | null
          vsco_job_id: string
        }
        Update: {
          contacts?: Json | null
          created_at?: string | null
          events?: Json | null
          id?: string
          notes?: string | null
          products?: Json | null
          raw_data?: Json | null
          synced_at?: string | null
          template_name?: string | null
          vsco_job_id?: string
        }
        Relationships: []
      }
      webhook_configs: {
        Row: {
          created_at: string | null
          endpoint_url: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          secret_key: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint_url: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          secret_key?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint_url?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          secret_key?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          dispatched_at: string | null
          dispatcher_result: Json | null
          error_message: string | null
          event_source: string | null
          event_type: string | null
          id: string
          payload: Json | null
          processing_status: string | null
          response: Json | null
          status: string | null
          trigger_operation: string
          trigger_table: string
          webhook_name: string
        }
        Insert: {
          created_at?: string | null
          dispatched_at?: string | null
          dispatcher_result?: Json | null
          error_message?: string | null
          event_source?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          processing_status?: string | null
          response?: Json | null
          status?: string | null
          trigger_operation: string
          trigger_table: string
          webhook_name: string
        }
        Update: {
          created_at?: string | null
          dispatched_at?: string | null
          dispatcher_result?: Json | null
          error_message?: string | null
          event_source?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          processing_status?: string | null
          response?: Json | null
          status?: string | null
          trigger_operation?: string
          trigger_table?: string
          webhook_name?: string
        }
        Relationships: []
      }
      worker_registrations: {
        Row: {
          battery_optimized: boolean | null
          charging_status: string | null
          created_at: string
          device_id: string | null
          id: string
          ip_address: unknown
          is_active: boolean
          last_battery_level: number | null
          last_seen: string
          metadata: Json | null
          registration_date: string
          session_key: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          battery_optimized?: boolean | null
          charging_status?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          ip_address: unknown
          is_active?: boolean
          last_battery_level?: number | null
          last_seen?: string
          metadata?: Json | null
          registration_date?: string
          session_key?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          battery_optimized?: boolean | null
          charging_status?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_battery_level?: number | null
          last_seen?: string
          metadata?: Json | null
          registration_date?: string
          session_key?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_registrations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "worker_registrations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "worker_registrations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_diagnostic_reports: {
        Row: {
          affected_functions: string[] | null
          created_at: string | null
          diagnosis_id: string
          executions_analyzed: number | null
          failure_rate: number | null
          full_report: string | null
          id: string
          primary_failure_point: string | null
          recommended_actions: Json | null
          resolved_at: string | null
          root_cause_analysis: Json | null
          severity: string | null
          template_name: string
        }
        Insert: {
          affected_functions?: string[] | null
          created_at?: string | null
          diagnosis_id: string
          executions_analyzed?: number | null
          failure_rate?: number | null
          full_report?: string | null
          id?: string
          primary_failure_point?: string | null
          recommended_actions?: Json | null
          resolved_at?: string | null
          root_cause_analysis?: Json | null
          severity?: string | null
          template_name: string
        }
        Update: {
          affected_functions?: string[] | null
          created_at?: string | null
          diagnosis_id?: string
          executions_analyzed?: number | null
          failure_rate?: number | null
          full_report?: string | null
          id?: string
          primary_failure_point?: string | null
          recommended_actions?: Json | null
          resolved_at?: string | null
          root_cause_analysis?: Json | null
          severity?: string | null
          template_name?: string
        }
        Relationships: []
      }
      workflow_executions: {
        Row: {
          created_at: string
          current_step_index: number
          description: string | null
          end_time: string | null
          failed_step: string | null
          final_result: Json | null
          id: string
          metadata: Json | null
          name: string
          start_time: string
          status: string
          total_steps: number
          updated_at: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          current_step_index?: number
          description?: string | null
          end_time?: string | null
          failed_step?: string | null
          final_result?: Json | null
          id?: string
          metadata?: Json | null
          name: string
          start_time?: string
          status?: string
          total_steps: number
          updated_at?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          current_step_index?: number
          description?: string | null
          end_time?: string | null
          failed_step?: string | null
          final_result?: Json | null
          id?: string
          metadata?: Json | null
          name?: string
          start_time?: string
          status?: string
          total_steps?: number
          updated_at?: string
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          created_at: string
          description: string | null
          duration_ms: number | null
          end_time: string | null
          error: string | null
          id: string
          metadata: Json | null
          name: string
          result: Json | null
          start_time: string | null
          status: string
          step_id: string
          step_index: number
          step_type: string
          updated_at: string
          workflow_execution_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_ms?: number | null
          end_time?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          name: string
          result?: Json | null
          start_time?: string | null
          status?: string
          step_id: string
          step_index: number
          step_type: string
          updated_at?: string
          workflow_execution_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_ms?: number | null
          end_time?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          result?: Json | null
          start_time?: string | null
          status?: string
          step_id?: string
          step_index?: number
          step_type?: string
          updated_at?: string
          workflow_execution_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_execution_id_fkey"
            columns: ["workflow_execution_id"]
            isOneToOne: false
            referencedRelation: "autonomous_deploy_runs_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_workflow_execution_id_fkey"
            columns: ["workflow_execution_id"]
            isOneToOne: false
            referencedRelation: "workflow_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_executions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          execution_id: string | null
          execution_params: Json | null
          execution_results: Json | null
          id: string
          metadata: Json | null
          started_at: string | null
          status: string | null
          steps_completed: number | null
          success: boolean | null
          template_id: string | null
          template_name: string
          total_steps: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          execution_id?: string | null
          execution_params?: Json | null
          execution_results?: Json | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          status?: string | null
          steps_completed?: number | null
          success?: boolean | null
          template_id?: string | null
          template_name: string
          total_steps?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          execution_id?: string | null
          execution_params?: Json | null
          execution_results?: Json | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          status?: string | null
          steps_completed?: number | null
          success?: boolean | null
          template_id?: string | null
          template_name?: string
          total_steps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_executions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          category: string
          created_at: string | null
          description: string
          estimated_duration_seconds: number | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          steps: Json
          success_rate: number | null
          tags: string[] | null
          template_name: string
          times_executed: number | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description: string
          estimated_duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          steps: Json
          success_rate?: number | null
          tags?: string[] | null
          template_name: string
          times_executed?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          estimated_duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          steps?: Json
          success_rate?: number | null
          tags?: string[] | null
          template_name?: string
          times_executed?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      workload_forecasts: {
        Row: {
          confidence_score: number
          contributing_factors: Json
          forecast_at: string
          forecast_type: string
          forecast_window: string
          id: string
          metadata: Json | null
          predicted_value: number
          recommended_actions: string[] | null
        }
        Insert: {
          confidence_score?: number
          contributing_factors: Json
          forecast_at?: string
          forecast_type: string
          forecast_window: string
          id?: string
          metadata?: Json | null
          predicted_value: number
          recommended_actions?: string[] | null
        }
        Update: {
          confidence_score?: number
          contributing_factors?: Json
          forecast_at?: string
          forecast_type?: string
          forecast_window?: string
          id?: string
          metadata?: Json | null
          predicted_value?: number
          recommended_actions?: string[] | null
        }
        Relationships: []
      }
      xmr_workers: {
        Row: {
          connection_type: string | null
          first_seen_at: string | null
          id: string
          is_active: boolean | null
          last_seen_at: string | null
          metadata: Json | null
          pool: string | null
          pool_address: string | null
          rig_label: string | null
          wallet_address: string | null
          worker_id: string
          xmrig_api_url: string | null
        }
        Insert: {
          connection_type?: string | null
          first_seen_at?: string | null
          id?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          metadata?: Json | null
          pool?: string | null
          pool_address?: string | null
          rig_label?: string | null
          wallet_address?: string | null
          worker_id: string
          xmrig_api_url?: string | null
        }
        Update: {
          connection_type?: string | null
          first_seen_at?: string | null
          id?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          metadata?: Json | null
          pool?: string | null
          pool_address?: string | null
          rig_label?: string | null
          wallet_address?: string | null
          worker_id?: string
          xmrig_api_url?: string | null
        }
        Relationships: []
      }
      xmrt_assistant_interactions: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          interaction_type: string | null
          metadata: Json | null
          prompt: string | null
          recommendations_given: Json | null
          response: string | null
          session_id: string | null
          user_action_taken: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          interaction_type?: string | null
          metadata?: Json | null
          prompt?: string | null
          recommendations_given?: Json | null
          response?: string | null
          session_id?: string | null
          user_action_taken?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          interaction_type?: string | null
          metadata?: Json | null
          prompt?: string | null
          recommendations_given?: Json | null
          response?: string | null
          session_id?: string | null
          user_action_taken?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xmrt_assistant_interactions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "xmrt_assistant_interactions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "xmrt_assistant_interactions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xmrt_assistant_interactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "battery_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      xmrt_transactions: {
        Row: {
          amount: number
          created_at: string
          device_id: string | null
          id: string
          metadata: Json | null
          multiplier: number | null
          reason: string | null
          session_id: string | null
          source_identity_key: string | null
          source_identity_type:
            | Database["public"]["Enums"]["identity_type"]
            | null
          transaction_type: string
          user_profile_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          device_id?: string | null
          id?: string
          metadata?: Json | null
          multiplier?: number | null
          reason?: string | null
          session_id?: string | null
          source_identity_key?: string | null
          source_identity_type?:
            | Database["public"]["Enums"]["identity_type"]
            | null
          transaction_type: string
          user_profile_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          device_id?: string | null
          id?: string
          metadata?: Json | null
          multiplier?: number | null
          reason?: string | null
          session_id?: string | null
          source_identity_key?: string | null
          source_identity_type?:
            | Database["public"]["Enums"]["identity_type"]
            | null
          transaction_type?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xmrt_transactions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "xmrt_transactions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "xmrt_transactions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xmrt_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "active_devices_view"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "xmrt_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "device_connection_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xmrt_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "device_connection_status"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "xmrt_transactions_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      "XMRT-Subscribe": {
        Row: {
          attrs: Json | null
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          customer: string | null
          id: string | null
        }
        Insert: {
          attrs?: Json | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          customer?: string | null
          id?: string | null
        }
        Update: {
          attrs?: Json | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          customer?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      active_devices_view: {
        Row: {
          battery_level_start: number | null
          charging_sessions_count: number | null
          connected_at: string | null
          connection_duration_seconds: number | null
          device_fingerprint: string | null
          device_id: string | null
          device_type: string | null
          last_heartbeat: string | null
          session_id: string | null
          wallet_address: string | null
          worker_id: string | null
        }
        Relationships: []
      }
      activity_with_context: {
        Row: {
          activity_type: string | null
          agent_id: string | null
          agent_name: string | null
          agent_status: Database["public"]["Enums"]["agent_status"] | null
          agent_workload: number | null
          created_at: string | null
          description: string | null
          id: string | null
          metadata: Json | null
          status: string | null
          task_category: Database["public"]["Enums"]["task_category"] | null
          task_id: string | null
          task_stage: Database["public"]["Enums"]["task_stage"] | null
          task_status: Database["public"]["Enums"]["task_status"] | null
          task_title: string | null
          title: string | null
        }
        Relationships: []
      }
      autonomous_deploy_runs_v: {
        Row: {
          ended_at: string | null
          id: string | null
          started_at: string | null
          status: string | null
          tasks_done: number | null
          tasks_target: number | null
        }
        Insert: {
          ended_at?: string | null
          id?: string | null
          started_at?: string | null
          status?: string | null
          tasks_done?: number | null
          tasks_target?: number | null
        }
        Update: {
          ended_at?: string | null
          id?: string | null
          started_at?: string | null
          status?: string | null
          tasks_done?: number | null
          tasks_target?: number | null
        }
        Relationships: []
      }
      communication_analytics: {
        Row: {
          avg_delivery_ms: number | null
          channel: string | null
          date: string | null
          executive_name: string | null
          failed: number | null
          max_delivery_ms: number | null
          min_delivery_ms: number | null
          successful: number | null
          total_sent: number | null
        }
        Relationships: []
      }
      device_connection_status: {
        Row: {
          app_version: string | null
          battery_level: number | null
          device_fingerprint: string | null
          device_id: string | null
          disconnected_at: string | null
          is_active: boolean | null
          last_heartbeat: string | null
          last_ip_address: unknown
          last_user_agent: string | null
          session_id: string | null
          session_key: string | null
        }
        Relationships: []
      }
      eliza_python_executions_active_v: {
        Row: {
          created_at: string | null
          error_message: string | null
          exit_code: number | null
          id: string | null
          job_key: string | null
          result: Json | null
          source: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          exit_code?: never
          id?: string | null
          job_key?: never
          result?: Json | null
          source?: never
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          exit_code?: never
          id?: string | null
          job_key?: never
          result?: Json | null
          source?: never
          status?: string | null
        }
        Relationships: []
      }
      eliza_python_executions_v: {
        Row: {
          created_at: string | null
          error_message: string | null
          exit_code: number | null
          id: string | null
          result: Json | null
          source: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          exit_code?: never
          id?: string | null
          result?: Json | null
          source?: never
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          exit_code?: never
          id?: string | null
          result?: Json | null
          source?: never
          status?: string | null
        }
        Relationships: []
      }
      event_flow_analytics: {
        Row: {
          avg_dispatch_time_seconds: number | null
          dispatched: number | null
          event_source: string | null
          event_type: string | null
          failed: number | null
          hour_bucket: string | null
          total_events: number | null
        }
        Relationships: []
      }
      failing_network_functions: {
        Row: {
          attempted_urls: string[] | null
          common_error_type: string | null
          failure_count: number | null
          function_name: string | null
        }
        Relationships: []
      }
      function_recommendations: {
        Row: {
          avg_execution_ms: number | null
          common_use_cases: string | null
          function_name: string | null
          last_used: string | null
          success_rate_pct: number | null
          total_uses: number | null
        }
        Relationships: []
      }
      function_usage_by_executive: {
        Row: {
          avg_time_ms: number | null
          executive_name: string | null
          failure_count: number | null
          function_name: string | null
          success_count: number | null
          success_rate_pct: number | null
          usage_count: number | null
        }
        Relationships: []
      }
      function_version_performance: {
        Row: {
          avg_execution_ms: number | null
          deployment_version: string | null
          failed_calls: number | null
          first_invoked_at: string | null
          function_hash: string | null
          function_name: string | null
          last_invoked_at: string | null
          max_execution_ms: number | null
          median_execution_ms: number | null
          min_execution_ms: number | null
          p95_execution_ms: number | null
          stability_score: number | null
          success_rate_pct: number | null
          successful_calls: number | null
          total_invocations: number | null
        }
        Relationships: []
      }
      mv_github_contrib_daily: {
        Row: {
          activity_date: string | null
          comments: number | null
          commits: number | null
          discussions: number | null
          github_username: string | null
          issues_prs: number | null
        }
        Relationships: []
      }
      mv_queue_daily: {
        Row: {
          avg_attempts: number | null
          completed: number | null
          day: string | null
          failed: number | null
          job_type: string | null
          queue_name: string | null
        }
        Relationships: []
      }
      mv_social_activity_daily: {
        Row: {
          activity_date: string | null
          author_display: string | null
          downvotes: number | null
          messages_count: number | null
          platform: string | null
          upvotes: number | null
        }
        Relationships: []
      }
      pop_leaderboard_view: {
        Row: {
          avg_confidence: number | null
          devices_count: number | null
          last_activity: string | null
          total_events: number | null
          total_pop_points: number | null
          wallet_address: string | null
        }
        Relationships: []
      }
      recent_conversation_messages: {
        Row: {
          content: string | null
          id: string | null
          message_type: string | null
          metadata: Json | null
          processing_data: Json | null
          session_id: string | null
          timestamp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_summary: {
        Row: {
          active_sessions: number | null
          checked_at: string | null
          database_size: string | null
          frontend_uptime_checks: number | null
          messages_last_hour: number | null
          recent_function_errors: number | null
        }
        Relationships: []
      }
      task_throughput_daily: {
        Row: {
          day: string | null
          done_count: number | null
          p50_cycle_time: unknown
          p90_cycle_time: unknown
          status: string | null
          task_count: number | null
        }
        Relationships: []
      }
      tool_usage_dashboard: {
        Row: {
          avg_time_ms: number | null
          function_name: string | null
          last_call: string | null
          p95_time_ms: number | null
          success_rate: number | null
          successful: number | null
          tool_category: string | null
          total_calls: number | null
          unique_executives: number | null
          unique_sessions: number | null
        }
        Relationships: []
      }
      v_critical_incidents: {
        Row: {
          duration_minutes: number | null
          health_score: number | null
          health_status: string | null
          id: string | null
          issues_detected: Json[] | null
          recommendations: string[] | null
          recorded_at: string | null
        }
        Relationships: []
      }
      v_cron_job_runs: {
        Row: {
          duration_seconds: number | null
          end_time: string | null
          jobid: number | null
          return_message: string | null
          runid: number | null
          start_time: string | null
          status: string | null
        }
        Insert: {
          duration_seconds?: never
          end_time?: string | null
          jobid?: number | null
          return_message?: string | null
          runid?: number | null
          start_time?: string | null
          status?: string | null
        }
        Update: {
          duration_seconds?: never
          end_time?: string | null
          jobid?: number | null
          return_message?: string | null
          runid?: number | null
          start_time?: string | null
          status?: string | null
        }
        Relationships: []
      }
      v_cron_jobs: {
        Row: {
          active: boolean | null
          command: string | null
          database: string | null
          jobid: number | null
          nodename: string | null
          nodeport: number | null
          schedule: string | null
          username: string | null
        }
        Insert: {
          active?: boolean | null
          command?: string | null
          database?: string | null
          jobid?: number | null
          nodename?: string | null
          nodeport?: number | null
          schedule?: string | null
          username?: string | null
        }
        Update: {
          active?: boolean | null
          command?: string | null
          database?: string | null
          jobid?: number | null
          nodename?: string | null
          nodeport?: number | null
          schedule?: string | null
          username?: string | null
        }
        Relationships: []
      }
      v_health_history_daily: {
        Row: {
          avg_health_score: number | null
          checks_performed: number | null
          critical_count: number | null
          date: string | null
          degraded_count: number | null
          healthy_count: number | null
          max_health_score: number | null
          min_health_score: number | null
          warning_count: number | null
        }
        Relationships: []
      }
      v_performance_trends_24h: {
        Row: {
          avg_health_score: number | null
          hour: string | null
          max_health_score: number | null
          min_health_score: number | null
          most_common_status: string | null
          snapshot_count: number | null
        }
        Relationships: []
      }
      v_queue_depth: {
        Row: {
          count: number | null
          queue_name: string | null
          status: string | null
        }
        Relationships: []
      }
      v_queue_throughput: {
        Row: {
          completed: number | null
          failed: number | null
          hour: string | null
          job_type: string | null
        }
        Relationships: []
      }
      v_wrappers_fdw_stats: {
        Row: {
          bytes_in: number | null
          bytes_out: number | null
          create_times: number | null
          created_at: string | null
          fdw_name: string | null
          metadata: Json | null
          rows_in: number | null
          rows_out: number | null
          updated_at: string | null
        }
        Insert: {
          bytes_in?: number | null
          bytes_out?: number | null
          create_times?: number | null
          created_at?: string | null
          fdw_name?: string | null
          metadata?: Json | null
          rows_in?: number | null
          rows_out?: number | null
          updated_at?: string | null
        }
        Update: {
          bytes_in?: number | null
          bytes_out?: number | null
          create_times?: number | null
          created_at?: string | null
          fdw_name?: string | null
          metadata?: Json | null
          rows_in?: number | null
          rows_out?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_task_atomic: {
        Args: {
          p_assignee_agent_id: string
          p_category: Database["public"]["Enums"]["task_category"]
          p_description: string
          p_metadata: Json
          p_priority: number
          p_repo: string
          p_stage: Database["public"]["Enums"]["task_stage"]
          p_status: Database["public"]["Enums"]["task_status"]
          p_title: string
        }
        Returns: {
          actual_duration_hours: number | null
          assignee_agent_id: string | null
          auto_advance_threshold_hours: number | null
          blocked_reason: string | null
          blocking_reason: string | null
          category: Database["public"]["Enums"]["task_category"]
          claimed_at: string | null
          claimed_by: string | null
          completed_checklist_items: Json | null
          created_at: string
          description: string
          estimated_duration_hours: number | null
          id: string
          last_agent_notified_at: string | null
          max_retries: number | null
          metadata: Json
          priority: number
          progress_percentage: number | null
          quality_score: number | null
          repo: string
          required_skills: Json | null
          resolution_notes: string | null
          retry_count: number | null
          stage: Database["public"]["Enums"]["task_stage"]
          stage_started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      batch_spawn_agents: { Args: { p_agents: Json }; Returns: Json }
      batch_vectorize_memories: { Args: never; Returns: Json }
      calculate_agent_performance: {
        Args: { p_agent_id: string; p_time_window_days?: number }
        Returns: Json
      }
      calculate_charging_pop_points: {
        Args: {
          p_battery_contribution?: number
          p_duration_minutes: number
          p_efficiency: number
        }
        Returns: number
      }
      calculate_lead_score: { Args: { p_session_key: string }; Returns: number }
      cancel_job: { Args: { p_job_id: number }; Returns: undefined }
      canonicalize_service_status: { Args: { j: Json }; Returns: Json }
      check_rate_limit: {
        Args: {
          p_channel: string
          p_executive_name: string
          p_max_per_hour?: number
        }
        Returns: boolean
      }
      check_session_ownership: {
        Args: { request_metadata: Json; session_uuid: string }
        Returns: boolean
      }
      complete_job: {
        Args: { p_job_id: number; p_lease_token: string; p_logs?: string }
        Returns: undefined
      }
      delete_task_atomic: {
        Args: { p_force?: boolean; p_task_id: string }
        Returns: undefined
      }
      disconnect_device_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      enqueue_job: {
        Args: {
          p_job_type: string
          p_max_retries?: number
          p_payload?: Json
          p_priority?: number
          p_queue_name: string
          p_run_at?: string
        }
        Returns: number
      }
      ensure_connection_session: {
        Args: {
          p_app_version?: string
          p_battery_level?: number
          p_device_fingerprint: string
          p_ip_address?: string
          p_session_key: string
          p_user_agent?: string
        }
        Returns: {
          created: boolean
          device_id: string
          session_id: string
        }[]
      }
      ensure_device: {
        Args: {
          p_device_fingerprint: string
          p_ip_address?: string
          p_metadata?: Json
          p_user_agent?: string
        }
        Returns: {
          created: boolean
          device_id: string
        }[]
      }
      fail_job: {
        Args: {
          p_backoff_seconds?: number
          p_error?: string
          p_job_id: number
          p_lease_token: string
        }
        Returns: undefined
      }
      find_agents_with_skills: {
        Args: { p_required_skills: Json }
        Returns: {
          id: string
          matching_skills: Json
          name: string
          role: Database["public"]["Enums"]["agent_role"]
          skill_match_score: number
        }[]
      }
      generate_conversation_insights: { Args: never; Returns: undefined }
      get_active_devices_by_type: {
        Args: { p_cutoff: string }
        Returns: {
          count: number
          device_type: string
        }[]
      }
      get_agent_by_name: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          current_workload: number
          id: string
          max_concurrent_tasks: number
          metadata: Json
          name: string
          role: Database["public"]["Enums"]["agent_role"]
          skills: Json
          status: Database["public"]["Enums"]["agent_status"]
        }[]
      }
      get_cron_jobs_status: {
        Args: never
        Returns: {
          active: boolean
          expected_frequency_hours: number
          failed_runs_24h: number
          is_overdue: boolean
          jobid: number
          jobname: string
          last_run_duration: unknown
          last_run_status: string
          last_run_time: string
          schedule: string
          success_rate: number
          total_runs_24h: number
        }[]
      }
      get_edge_function_logs: {
        Args: { p_function_name?: string; p_limit?: number; p_since?: string }
        Returns: {
          event_message: string | null
          event_type: string
          execution_time_ms: number | null
          function_name: string
          id: string
          level: string | null
          metadata: Json | null
          request_id: string | null
          status_code: number | null
          timestamp: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "edge_function_logs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_latest_battery_level: {
        Args: { p_device_id: string; p_session_id: string }
        Returns: number
      }
      get_miner_status: {
        Args: { p_ip: unknown }
        Returns: {
          ip_address: unknown
          last_reward_at: string
          total_xmrt_earned: number
          user_profile_id: string
        }[]
      }
      get_xmrt_charger_leaderboard: {
        Args: { limit_count?: number }
        Returns: {
          avg_efficiency: number
          battery_health: number
          device_fingerprint: string
          device_type: string
          last_active: string
          total_charging_sessions: number
          total_pop_points: number
        }[]
      }
      http_post_wrap: {
        Args: { p_body?: Json; p_headers?: Json; p_url: string }
        Returns: number
      }
      http_response_by_id: {
        Args: { p_id: number }
        Returns: unknown[][]
        SetofOptions: {
          from: "*"
          to: "_http_response"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      http_responses_recent: {
        Args: { p_limit?: number }
        Returns: unknown[][]
        SetofOptions: {
          from: "*"
          to: "_http_response"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      increment_rate_limit:
        | {
            Args: {
              p_channel: string
              p_executive_name: string
              p_max_per_hour?: number
            }
            Returns: undefined
          }
        | {
            Args: { p_endpoint: string; p_identifier: string }
            Returns: undefined
          }
      ingest_device_event:
        | {
            Args: {
              device_id?: string
              event_type: string
              ip_address?: unknown
              payload?: Json
              source?: string
              user_agent?: string
            }
            Returns: Json
          }
        | {
            Args: {
              in_device_id: string
              in_event_type: string
              in_payload?: Json
            }
            Returns: Json
          }
        | {
            Args: {
              p_device_id: string
              p_event_type: string
              p_ip_address?: unknown
              p_payload?: Json
              p_source?: string
              p_user_agent?: string
            }
            Returns: Json
          }
        | {
            Args: { p_payload: Json }
            Returns: {
              created_at: string | null
              device_id: string | null
              event_type: string | null
              id: string
              ip_address: unknown
              payload: Json
              received_at: string | null
              source: string | null
              user_agent: string | null
            }
            SetofOptions: {
              from: "*"
              to: "device_events"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_device_id: string
              p_event_type: string
              p_ip?: unknown
              p_payload: Json
              p_source: string
              p_user_agent?: string
            }
            Returns: {
              created_at: string | null
              device_id: string | null
              event_type: string | null
              id: string
              ip_address: unknown
              payload: Json
              received_at: string | null
              source: string | null
              user_agent: string | null
            }
            SetofOptions: {
              from: "*"
              to: "device_events"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      is_valid_jsonb: { Args: { v: Json }; Returns: boolean }
      jsonb_shallow_diff: { Args: { new_j: Json; old_j: Json }; Returns: Json }
      lease_job: {
        Args: { p_lease_seconds?: number; p_queue_name: string }
        Returns: {
          id: number
          job_type: string
          lease_token: string
          payload: Json
        }[]
      }
      log_edge_function_execution: {
        Args: {
          p_event_message?: string
          p_event_type: string
          p_execution_time_ms?: number
          p_function_name: string
          p_level?: string
          p_metadata?: Json
          p_request_id?: string
          p_status_code?: number
          p_user_id?: string
        }
        Returns: undefined
      }
      log_edge_function_usage: {
        Args: {
          context?: string
          error_message?: string
          execution_time_ms?: number
          executive_name?: string
          function_name: string
          success: boolean
        }
        Returns: string
      }
      log_function_failure_with_network_context: {
        Args: {
          error_message: string
          function_name: string
          target_url?: string
        }
        Returns: string
      }
      log_github_api_call: {
        Args: {
          p_action: string
          p_credential_type: string
          p_error_message?: string
          p_rate_limit_remaining?: number
          p_rate_limit_reset?: string
          p_repo: string
          p_response_time_ms: number
          p_status_code: number
          p_success: boolean
        }
        Returns: string
      }
      match_knowledge_entities: {
        Args: { match_count?: number; search_query: string }
        Returns: {
          confidence_score: number
          description: string
          entity_name: string
          entity_type: string
          id: string
          metadata: Json
        }[]
      }
      match_memories: {
        Args: {
          filter_context_type?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          context_type: string
          created_at: string
          id: string
          importance_score: number
          metadata: Json
          similarity: number
        }[]
      }
      merge_user_profiles: {
        Args: { from_user: string; into_user: string }
        Returns: undefined
      }
      pgmq_ack: {
        Args: { _message_id: number; _queue: string }
        Returns: undefined
      }
      pgmq_enqueue: {
        Args: { _delay_seconds?: number; _payload: Json; _queue: string }
        Returns: number
      }
      pgmq_lease: {
        Args: { _batch_size?: number; _queue: string; _vt_seconds: number }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pgmq_return: {
        Args: { _delay_seconds: number; _message_id: number; _queue: string }
        Returns: undefined
      }
      prune_net_http_response: {
        Args: { batch_limit?: number; max_hot_days?: number }
        Returns: number
      }
      prune_net_http_response_until_clear: {
        Args: { max_hot_days?: number }
        Returns: undefined
      }
      reassign_task_atomic: {
        Args: {
          p_new_assignee_agent_id: string
          p_reason: string
          p_task_id: string
        }
        Returns: {
          actual_duration_hours: number | null
          assignee_agent_id: string | null
          auto_advance_threshold_hours: number | null
          blocked_reason: string | null
          blocking_reason: string | null
          category: Database["public"]["Enums"]["task_category"]
          claimed_at: string | null
          claimed_by: string | null
          completed_checklist_items: Json | null
          created_at: string
          description: string
          estimated_duration_hours: number | null
          id: string
          last_agent_notified_at: string | null
          max_retries: number | null
          metadata: Json
          priority: number
          progress_percentage: number | null
          quality_score: number | null
          repo: string
          required_skills: Json | null
          resolution_notes: string | null
          retry_count: number | null
          stage: Database["public"]["Enums"]["task_stage"]
          stage_started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_connection_event: {
        Args: {
          p_battery_level?: number
          p_event: string
          p_extra?: Json
          p_session_key: string
          p_timestamp?: string
        }
        Returns: Json
      }
      refresh_event_flow_analytics: { Args: never; Returns: undefined }
      refresh_function_version_performance: { Args: never; Returns: undefined }
      refresh_mv_queue_daily: { Args: never; Returns: undefined }
      refresh_tool_usage_dashboard: { Args: never; Returns: undefined }
      repo_scan_preflight: {
        Args: never
        Returns: {
          diagnostics: Json
          ok: boolean
        }[]
      }
      reset_manus_tokens: { Args: never; Returns: undefined }
      resolve_user_by_device: { Args: { p_device_id: string }; Returns: string }
      resolve_user_by_github: {
        Args: { p_github_username: string }
        Returns: string
      }
      resolve_user_by_xmr_worker: {
        Args: { p_worker_id: string }
        Returns: string
      }
      run_opportunity_scanner: { Args: never; Returns: undefined }
      service_status_change_type: {
        Args: { new_j: Json; old_j: Json }
        Returns: string
      }
      track_onboarding_checkpoint: {
        Args: { p_api_key: string; p_checkpoint: string; p_metadata?: Json }
        Returns: string
      }
      trigger_daily_discussion_post: { Args: never; Returns: number }
      update_session_heartbeat: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      update_task_status_atomic: {
        Args: {
          p_completion_notes: string
          p_stage: Database["public"]["Enums"]["task_stage"]
          p_status: Database["public"]["Enums"]["task_status"]
          p_task_id: string
        }
        Returns: {
          actual_duration_hours: number | null
          assignee_agent_id: string | null
          auto_advance_threshold_hours: number | null
          blocked_reason: string | null
          blocking_reason: string | null
          category: Database["public"]["Enums"]["task_category"]
          claimed_at: string | null
          claimed_by: string | null
          completed_checklist_items: Json | null
          created_at: string
          description: string
          estimated_duration_hours: number | null
          id: string
          last_agent_notified_at: string | null
          max_retries: number | null
          metadata: Json
          priority: number
          progress_percentage: number | null
          quality_score: number | null
          repo: string
          required_skills: Json | null
          resolution_notes: string | null
          retry_count: number | null
          stage: Database["public"]["Enums"]["task_stage"]
          stage_started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      activity_category:
        | "connection"
        | "charging"
        | "calibration"
        | "battery_health"
        | "system_event"
        | "user_action"
        | "anomaly"
      activity_severity: "info" | "warning" | "error" | "critical"
      agent_role:
        | "manager"
        | "planner"
        | "analyst"
        | "developer"
        | "integrator"
        | "validator"
        | "miner"
        | "device"
        | "generic"
      agent_status: "IDLE" | "BUSY" | "OFFLINE" | "ARCHIVED" | "ERROR"
      command_status:
        | "pending"
        | "sent"
        | "acknowledged"
        | "executed"
        | "failed"
        | "expired"
      command_type:
        | "adjust_charging_mode"
        | "collect_thermal_data"
        | "adjust_calibration_frequency"
        | "enable_battery_health_mode"
        | "send_notification"
        | "request_diagnostic_report"
        | "update_configuration"
      contribution_type: "commit" | "issue" | "pr" | "discussion" | "comment"
      identity_type: "xmr_worker" | "xmrt_device" | "github"
      learned_from: "commit" | "conversation" | "execution"
      metric_type: "code_quality" | "task_completion" | "user_satisfaction"
      pattern_type: "code_fix" | "task_solution" | "optimization"
      pop_event_type:
        | "charging_session_completed"
        | "calibration_performed"
        | "battery_health_contribution"
        | "thermal_data_collection"
        | "sustained_connection"
        | "diagnostic_report_submitted"
        | "optimization_applied"
        | "community_contribution"
      relationship_type: "depends_on" | "implements" | "uses" | "extends"
      social_platform:
        | "discord"
        | "telegram"
        | "twitter"
        | "reddit"
        | "github"
        | "custom"
      task_category:
        | "code"
        | "infra"
        | "research"
        | "governance"
        | "mining"
        | "device"
        | "ops"
        | "other"
      task_stage: "DISCUSS" | "PLAN" | "EXECUTE" | "VERIFY" | "INTEGRATE"
      task_status:
        | "PENDING"
        | "CLAIMED"
        | "IN_PROGRESS"
        | "BLOCKED"
        | "DONE"
        | "CANCELLED"
        | "COMPLETED"
        | "FAILED"
    }
    CompositeTypes: {
      edge_log_row: {
        id: string | null
        timestamp: string | null
        event_message: string | null
        status_code: number | null
        method: string | null
        function_id: string | null
        execution_time_ms: number | null
        deployment_id: string | null
        version: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_category: [
        "connection",
        "charging",
        "calibration",
        "battery_health",
        "system_event",
        "user_action",
        "anomaly",
      ],
      activity_severity: ["info", "warning", "error", "critical"],
      agent_role: [
        "manager",
        "planner",
        "analyst",
        "developer",
        "integrator",
        "validator",
        "miner",
        "device",
        "generic",
      ],
      agent_status: ["IDLE", "BUSY", "OFFLINE", "ARCHIVED", "ERROR"],
      command_status: [
        "pending",
        "sent",
        "acknowledged",
        "executed",
        "failed",
        "expired",
      ],
      command_type: [
        "adjust_charging_mode",
        "collect_thermal_data",
        "adjust_calibration_frequency",
        "enable_battery_health_mode",
        "send_notification",
        "request_diagnostic_report",
        "update_configuration",
      ],
      contribution_type: ["commit", "issue", "pr", "discussion", "comment"],
      identity_type: ["xmr_worker", "xmrt_device", "github"],
      learned_from: ["commit", "conversation", "execution"],
      metric_type: ["code_quality", "task_completion", "user_satisfaction"],
      pattern_type: ["code_fix", "task_solution", "optimization"],
      pop_event_type: [
        "charging_session_completed",
        "calibration_performed",
        "battery_health_contribution",
        "thermal_data_collection",
        "sustained_connection",
        "diagnostic_report_submitted",
        "optimization_applied",
        "community_contribution",
      ],
      relationship_type: ["depends_on", "implements", "uses", "extends"],
      social_platform: [
        "discord",
        "telegram",
        "twitter",
        "reddit",
        "github",
        "custom",
      ],
      task_category: [
        "code",
        "infra",
        "research",
        "governance",
        "mining",
        "device",
        "ops",
        "other",
      ],
      task_stage: ["DISCUSS", "PLAN", "EXECUTE", "VERIFY", "INTEGRATE"],
      task_status: [
        "PENDING",
        "CLAIMED",
        "IN_PROGRESS",
        "BLOCKED",
        "DONE",
        "CANCELLED",
        "COMPLETED",
        "FAILED",
      ],
    },
  },
} as const
