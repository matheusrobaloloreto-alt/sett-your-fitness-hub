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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          code: string
          company_id: string | null
          created_at: string
          criteria_type: string
          criteria_value: number
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
          xp_reward: number
        }
        Insert: {
          code: string
          company_id?: string | null
          created_at?: string
          criteria_type: string
          criteria_value?: number
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
          xp_reward?: number
        }
        Update: {
          code?: string
          company_id?: string | null
          created_at?: string
          criteria_type?: string
          criteria_value?: number
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "achievements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_alerts: {
        Row: {
          action_url: string | null
          company_id: string
          created_at: string
          enrollment_id: string | null
          id: string
          message: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          student_id: string | null
          target_role: string | null
          target_user_id: string | null
          title: string
          type: string
        }
        Insert: {
          action_url?: string | null
          company_id: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          student_id?: string | null
          target_role?: string | null
          target_user_id?: string | null
          title: string
          type: string
        }
        Update: {
          action_url?: string | null
          company_id?: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          student_id?: string | null
          target_role?: string | null
          target_user_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_decision_logs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          payload: Json
          source: string
          student_id: string | null
          summary: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          payload?: Json
          source: string
          student_id?: string | null
          summary: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          payload?: Json
          source?: string
          student_id?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_decision_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decision_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_plan_versions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          cycle_id: string | null
          edit_summary: string | null
          edited: boolean
          id: string
          plan: Json
          student_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          edit_summary?: string | null
          edited?: boolean
          id?: string
          plan: Json
          student_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          edit_summary?: string | null
          edited?: boolean
          id?: string
          plan?: Json
          student_id?: string
        }
        Relationships: []
      }
      ai_secretary_conversations: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          messages: Json | null
          student_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          student_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          student_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_secretary_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_secretary_conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_strength_plans: {
        Row: {
          anamnese_id: string | null
          biomechanical_notes: string | null
          bundle_id: string | null
          company_id: string
          created_at: string
          cycle_name: string | null
          duration_weeks: number | null
          id: string
          objective: string | null
          plan: Json | null
          previous_plan_id: string | null
          sequence_number: number | null
          sequence_phase: string | null
          student_id: string
          training_cycle_id: string | null
          updated_at: string
        }
        Insert: {
          anamnese_id?: string | null
          biomechanical_notes?: string | null
          bundle_id?: string | null
          company_id: string
          created_at?: string
          cycle_name?: string | null
          duration_weeks?: number | null
          id?: string
          objective?: string | null
          plan?: Json | null
          previous_plan_id?: string | null
          sequence_number?: number | null
          sequence_phase?: string | null
          student_id: string
          training_cycle_id?: string | null
          updated_at?: string
        }
        Update: {
          anamnese_id?: string | null
          biomechanical_notes?: string | null
          bundle_id?: string | null
          company_id?: string
          created_at?: string
          cycle_name?: string | null
          duration_weeks?: number | null
          id?: string
          objective?: string | null
          plan?: Json | null
          previous_plan_id?: string | null
          sequence_number?: number | null
          sequence_phase?: string | null
          student_id?: string
          training_cycle_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_strength_plans_anamnese_id_fkey"
            columns: ["anamnese_id"]
            isOneToOne: false
            referencedRelation: "student_anamneses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_strength_plans_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "prescription_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_strength_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_strength_plans_previous_plan_id_fkey"
            columns: ["previous_plan_id"]
            isOneToOne: false
            referencedRelation: "ai_strength_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_strength_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_strength_plans_training_cycle_id_fkey"
            columns: ["training_cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnese_invites: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          status: string
          student_id: string
          student_name: string | null
          token: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          status?: string
          student_id: string
          student_name?: string | null
          token: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          status?: string
          student_id?: string
          student_name?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnese_invites_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis: {
        Row: {
          additional_notes: string | null
          alcohol: string | null
          authorizes_plan: string | null
          available_days: string | null
          available_equipment: string | null
          aware_of_trilogy: string | null
          biggest_obstacle: string | null
          commits_communication: boolean | null
          company_id: string | null
          created_at: string
          current_pain: string | null
          daily_meals: string | null
          data: Json | null
          diet_type: string | null
          diseases: string | null
          emergency_contact: string | null
          experience_level: string | null
          extra_comments: string | null
          feel_in_3_months: string | null
          food_allergies: string | null
          goals: string | null
          health_conditions: string | null
          hydration: string | null
          id: string
          injuries: string | null
          medical_release: string | null
          medications: string | null
          modalities: string | null
          motivation: string | null
          nutrition: string | null
          nutrition_habits: string | null
          observation: string | null
          pain_areas: string | null
          physical_activity_level: string | null
          previous_experience: string | null
          profession: string | null
          restorative_sleep: string | null
          restrictions: string | null
          session_duration: string | null
          sleep_hours: string | null
          sleep_quality: string | null
          smoking: string | null
          stress_level: string | null
          student_id: string
          submitted_at: string | null
          supplement_use: string | null
          surgeries: string | null
          training_days: string | null
          training_location: string | null
          updated_at: string | null
          version: number | null
          water_intake: string | null
        }
        Insert: {
          additional_notes?: string | null
          alcohol?: string | null
          authorizes_plan?: string | null
          available_days?: string | null
          available_equipment?: string | null
          aware_of_trilogy?: string | null
          biggest_obstacle?: string | null
          commits_communication?: boolean | null
          company_id?: string | null
          created_at?: string
          current_pain?: string | null
          daily_meals?: string | null
          data?: Json | null
          diet_type?: string | null
          diseases?: string | null
          emergency_contact?: string | null
          experience_level?: string | null
          extra_comments?: string | null
          feel_in_3_months?: string | null
          food_allergies?: string | null
          goals?: string | null
          health_conditions?: string | null
          hydration?: string | null
          id?: string
          injuries?: string | null
          medical_release?: string | null
          medications?: string | null
          modalities?: string | null
          motivation?: string | null
          nutrition?: string | null
          nutrition_habits?: string | null
          observation?: string | null
          pain_areas?: string | null
          physical_activity_level?: string | null
          previous_experience?: string | null
          profession?: string | null
          restorative_sleep?: string | null
          restrictions?: string | null
          session_duration?: string | null
          sleep_hours?: string | null
          sleep_quality?: string | null
          smoking?: string | null
          stress_level?: string | null
          student_id: string
          submitted_at?: string | null
          supplement_use?: string | null
          surgeries?: string | null
          training_days?: string | null
          training_location?: string | null
          updated_at?: string | null
          version?: number | null
          water_intake?: string | null
        }
        Update: {
          additional_notes?: string | null
          alcohol?: string | null
          authorizes_plan?: string | null
          available_days?: string | null
          available_equipment?: string | null
          aware_of_trilogy?: string | null
          biggest_obstacle?: string | null
          commits_communication?: boolean | null
          company_id?: string | null
          created_at?: string
          current_pain?: string | null
          daily_meals?: string | null
          data?: Json | null
          diet_type?: string | null
          diseases?: string | null
          emergency_contact?: string | null
          experience_level?: string | null
          extra_comments?: string | null
          feel_in_3_months?: string | null
          food_allergies?: string | null
          goals?: string | null
          health_conditions?: string | null
          hydration?: string | null
          id?: string
          injuries?: string | null
          medical_release?: string | null
          medications?: string | null
          modalities?: string | null
          motivation?: string | null
          nutrition?: string | null
          nutrition_habits?: string | null
          observation?: string | null
          pain_areas?: string | null
          physical_activity_level?: string | null
          previous_experience?: string | null
          profession?: string | null
          restorative_sleep?: string | null
          restrictions?: string | null
          session_duration?: string | null
          sleep_hours?: string | null
          sleep_quality?: string | null
          smoking?: string | null
          stress_level?: string | null
          student_id?: string
          submitted_at?: string | null
          supplement_use?: string | null
          surgeries?: string | null
          training_days?: string | null
          training_location?: string | null
          updated_at?: string | null
          version?: number | null
          water_intake?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          student_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          student_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string | null
          body: string
          company_id: string
          created_at: string
          id: string
          image_url: string | null
          pinned: boolean
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          company_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          pinned?: boolean
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          pinned?: boolean
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      app_performance_samples: {
        Row: {
          actor_bucket: string
          company_id: string
          created_at: string
          duration_ms: number
          effective_type: string
          id: string
          metric: string
          navigation_type: string
          route_group: string
          viewport_bucket: string
        }
        Insert: {
          actor_bucket: string
          company_id: string
          created_at?: string
          duration_ms: number
          effective_type: string
          id?: string
          metric: string
          navigation_type: string
          route_group: string
          viewport_bucket: string
        }
        Update: {
          actor_bucket?: string
          company_id?: string
          created_at?: string
          duration_ms?: number
          effective_type?: string
          id?: string
          metric?: string
          navigation_type?: string
          route_group?: string
          viewport_bucket?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_performance_samples_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_type: string | null
          cancel_reason: string | null
          canceled_at: string | null
          company_id: string | null
          confirmed_at: string | null
          created_at: string | null
          duration_min: number | null
          id: string
          location: string | null
          reminded_at: string | null
          scheduled_at: string
          status: string | null
          student_id: string | null
          student_notes: string | null
          trainer_id: string | null
          trainer_notes: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_type?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          company_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          duration_min?: number | null
          id?: string
          location?: string | null
          reminded_at?: string | null
          scheduled_at: string
          status?: string | null
          student_id?: string | null
          student_notes?: string | null
          trainer_id?: string | null
          trainer_notes?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_type?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          company_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          duration_min?: number | null
          id?: string
          location?: string | null
          reminded_at?: string | null
          scheduled_at?: string
          status?: string | null
          student_id?: string | null
          student_notes?: string | null
          trainer_id?: string | null
          trainer_notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_frames: {
        Row: {
          ai_findings: Json | null
          assessment_id: string
          company_id: string
          created_at: string
          edited: boolean | null
          frame_index: number
          id: string
          image_url: string | null
          trainer_findings: Json | null
          vista: string | null
        }
        Insert: {
          ai_findings?: Json | null
          assessment_id: string
          company_id: string
          created_at?: string
          edited?: boolean | null
          frame_index: number
          id?: string
          image_url?: string | null
          trainer_findings?: Json | null
          vista?: string | null
        }
        Update: {
          ai_findings?: Json | null
          assessment_id?: string
          company_id?: string
          created_at?: string
          edited?: boolean | null
          frame_index?: number
          id?: string
          image_url?: string | null
          trainer_findings?: Json | null
          vista?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_frames_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "functional_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_frames_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flow_edges: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          label: string | null
          source_handle: string | null
          source_node_id: string
          target_node_id: string
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_node_id: string
          target_node_id: string
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_node_id?: string
          target_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_flow_edges_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flow_nodes: {
        Row: {
          created_at: string
          data: Json | null
          flow_id: string
          id: string
          label: string | null
          node_type: string | null
          position_x: number | null
          position_y: number | null
          type: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          flow_id: string
          id?: string
          label?: string | null
          node_type?: string | null
          position_x?: number | null
          position_y?: number | null
          type: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          flow_id?: string
          id?: string
          label?: string | null
          node_type?: string | null
          position_x?: number | null
          position_y?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_flow_nodes_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flow_steps: {
        Row: {
          action_type: string
          config: Json | null
          created_at: string
          flow_id: string
          id: string
          step_order: number | null
        }
        Insert: {
          action_type: string
          config?: Json | null
          created_at?: string
          flow_id: string
          id?: string
          step_order?: number | null
        }
        Update: {
          action_type?: string
          config?: Json | null
          created_at?: string
          flow_id?: string
          id?: string
          step_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_flow_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flows: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          trigger_type: string
          trigger_value: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_flows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          category: string | null
          code: string
          color: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          points: number | null
          rarity: string | null
          trigger_threshold: number | null
          trigger_type: string | null
        }
        Insert: {
          category?: string | null
          code: string
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          points?: number | null
          rarity?: string | null
          trigger_threshold?: number | null
          trigger_type?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          points?: number | null
          rarity?: string | null
          trigger_threshold?: number | null
          trigger_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      body_compositions: {
        Row: {
          ai_analysis: Json | null
          ai_confidence: string | null
          bmi: number | null
          body_fat_percent: number | null
          company_id: string | null
          created_at: string | null
          fat_mass_kg: number | null
          height_cm: number | null
          id: string
          lean_mass_kg: number | null
          measured_at: string | null
          measured_by: string | null
          measurement_arm_flexed: number | null
          measurement_arm_relaxed: number | null
          measurement_calf: number | null
          measurement_chest: number | null
          measurement_hip: number | null
          measurement_thigh: number | null
          measurement_waist: number | null
          photo_back_url: string | null
          photo_front_url: string | null
          photo_left_url: string | null
          photo_right_url: string | null
          shared_with_student: boolean | null
          source: string | null
          status: string | null
          student_id: string | null
          trainer_notes: string | null
          weight_kg: number | null
        }
        Insert: {
          ai_analysis?: Json | null
          ai_confidence?: string | null
          bmi?: number | null
          body_fat_percent?: number | null
          company_id?: string | null
          created_at?: string | null
          fat_mass_kg?: number | null
          height_cm?: number | null
          id?: string
          lean_mass_kg?: number | null
          measured_at?: string | null
          measured_by?: string | null
          measurement_arm_flexed?: number | null
          measurement_arm_relaxed?: number | null
          measurement_calf?: number | null
          measurement_chest?: number | null
          measurement_hip?: number | null
          measurement_thigh?: number | null
          measurement_waist?: number | null
          photo_back_url?: string | null
          photo_front_url?: string | null
          photo_left_url?: string | null
          photo_right_url?: string | null
          shared_with_student?: boolean | null
          source?: string | null
          status?: string | null
          student_id?: string | null
          trainer_notes?: string | null
          weight_kg?: number | null
        }
        Update: {
          ai_analysis?: Json | null
          ai_confidence?: string | null
          bmi?: number | null
          body_fat_percent?: number | null
          company_id?: string | null
          created_at?: string | null
          fat_mass_kg?: number | null
          height_cm?: number | null
          id?: string
          lean_mass_kg?: number | null
          measured_at?: string | null
          measured_by?: string | null
          measurement_arm_flexed?: number | null
          measurement_arm_relaxed?: number | null
          measurement_calf?: number | null
          measurement_chest?: number | null
          measurement_hip?: number | null
          measurement_thigh?: number | null
          measurement_waist?: number | null
          photo_back_url?: string | null
          photo_front_url?: string | null
          photo_left_url?: string | null
          photo_right_url?: string | null
          shared_with_student?: boolean | null
          source?: string | null
          status?: string | null
          student_id?: string | null
          trainer_notes?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_compositions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_compositions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      body_measurements: {
        Row: {
          abdomen: number | null
          arm: number | null
          calf: number | null
          chest: number | null
          company_id: string
          created_at: string
          forearm: number | null
          hip: number | null
          id: string
          measured_at: string
          neck: number | null
          notes: string | null
          shoulder: number | null
          student_id: string
          thigh: number | null
          updated_at: string
          waist: number | null
        }
        Insert: {
          abdomen?: number | null
          arm?: number | null
          calf?: number | null
          chest?: number | null
          company_id: string
          created_at?: string
          forearm?: number | null
          hip?: number | null
          id?: string
          measured_at?: string
          neck?: number | null
          notes?: string | null
          shoulder?: number | null
          student_id: string
          thigh?: number | null
          updated_at?: string
          waist?: number | null
        }
        Update: {
          abdomen?: number | null
          arm?: number | null
          calf?: number | null
          chest?: number | null
          company_id?: string
          created_at?: string
          forearm?: number | null
          hip?: number | null
          id?: string
          measured_at?: string
          neck?: number | null
          notes?: string | null
          shoulder?: number | null
          student_id?: string
          thigh?: number | null
          updated_at?: string
          waist?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_measurements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_measurements_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_participants: {
        Row: {
          challenge_id: string | null
          current_score: number | null
          final_rank: number | null
          final_score: number | null
          id: string
          joined_at: string | null
          student_id: string | null
          won_prize: boolean | null
        }
        Insert: {
          challenge_id?: string | null
          current_score?: number | null
          final_rank?: number | null
          final_score?: number | null
          id?: string
          joined_at?: string | null
          student_id?: string | null
          won_prize?: boolean | null
        }
        Update: {
          challenge_id?: string | null
          current_score?: number | null
          final_rank?: number | null
          final_score?: number | null
          id?: string
          joined_at?: string | null
          student_id?: string | null
          won_prize?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_score_log: {
        Row: {
          challenge_id: string | null
          created_at: string | null
          id: string
          points: number
          reason: string | null
          source_id: string | null
          source_type: string | null
          student_id: string | null
        }
        Insert: {
          challenge_id?: string | null
          created_at?: string | null
          id?: string
          points: number
          reason?: string | null
          source_id?: string | null
          source_type?: string | null
          student_id?: string | null
        }
        Update: {
          challenge_id?: string | null
          created_at?: string | null
          id?: string
          points?: number
          reason?: string | null
          source_id?: string | null
          source_type?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_score_log_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_score_log_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          challenge_type: string
          company_id: string | null
          cover_image_url: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          emoji: string | null
          ends_at: string
          goal_value: number | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          max_participants: number | null
          name: string
          prize_description: string | null
          prize_for_top: number | null
          starts_at: string
          updated_at: string | null
        }
        Insert: {
          challenge_type: string
          company_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          emoji?: string | null
          ends_at: string
          goal_value?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          max_participants?: number | null
          name: string
          prize_description?: string | null
          prize_for_top?: number | null
          starts_at: string
          updated_at?: string | null
        }
        Update: {
          challenge_type?: string
          company_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          emoji?: string | null
          ends_at?: string
          goal_value?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          max_participants?: number | null
          name?: string
          prize_description?: string | null
          prize_for_top?: number | null
          starts_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          author_student_id: string | null
          content: string
          created_at: string | null
          id: string
          is_hidden: boolean | null
          post_id: string | null
        }
        Insert: {
          author_student_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_hidden?: boolean | null
          post_id?: string | null
        }
        Update: {
          author_student_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_hidden?: boolean | null
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_author_student_id_fkey"
            columns: ["author_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string | null
          post_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          post_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          post_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_likes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_student_id: string | null
          badge_id: string | null
          comments_count: number | null
          company_id: string | null
          content: string
          created_at: string | null
          hidden_reason: string | null
          id: string
          image_url: string | null
          is_hidden: boolean | null
          is_pinned: boolean | null
          likes_count: number | null
          post_type: string | null
          updated_at: string | null
          workout_session_id: string | null
        }
        Insert: {
          author_student_id?: string | null
          badge_id?: string | null
          comments_count?: number | null
          company_id?: string | null
          content: string
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          image_url?: string | null
          is_hidden?: boolean | null
          is_pinned?: boolean | null
          likes_count?: number | null
          post_type?: string | null
          updated_at?: string | null
          workout_session_id?: string | null
        }
        Update: {
          author_student_id?: string | null
          badge_id?: string | null
          comments_count?: number | null
          company_id?: string | null
          content?: string
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          image_url?: string | null
          is_hidden?: boolean | null
          is_pinned?: boolean | null
          likes_count?: number | null
          post_type?: string | null
          updated_at?: string | null
          workout_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_student_id_fkey"
            columns: ["author_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          brand_settings: Json | null
          created_at: string
          custom_domain: string | null
          default_language: string | null
          display_name: string | null
          favicon_url: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          max_students: number | null
          name: string
          owner_id: string | null
          owner_user_id: string | null
          slug: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          supported_languages: string[] | null
          tagline: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          brand_settings?: Json | null
          created_at?: string
          custom_domain?: string | null
          default_language?: string | null
          display_name?: string | null
          favicon_url?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          max_students?: number | null
          name: string
          owner_id?: string | null
          owner_user_id?: string | null
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          supported_languages?: string[] | null
          tagline?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          brand_settings?: Json | null
          created_at?: string
          custom_domain?: string | null
          default_language?: string | null
          display_name?: string | null
          favicon_url?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          max_students?: number | null
          name?: string
          owner_id?: string | null
          owner_user_id?: string | null
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          supported_languages?: string[] | null
          tagline?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_ai_config: {
        Row: {
          ai_text_refinement_enabled: boolean
          assessment_protocol: string | null
          assistant_name: string
          bnito_whatsapp_enabled: boolean
          communication_style: string | null
          company_id: string
          consultancy_name: string | null
          created_at: string
          ethical_limits: string | null
          exercise_preferences: string | null
          extra: Json
          id: string
          methodology: string | null
          niche_audience: string | null
          nutrition_scope: string | null
          onboarding_completed: boolean
          owner_credentials: string | null
          periodization_doctrine: string | null
          plans_payment: string | null
          progression_model: string | null
          red_lines: string | null
          strength_endurance_integration: string | null
          tone: string | null
          updated_at: string
          use_prescription_engine_v1: boolean
        }
        Insert: {
          ai_text_refinement_enabled?: boolean
          assessment_protocol?: string | null
          assistant_name?: string
          bnito_whatsapp_enabled?: boolean
          communication_style?: string | null
          company_id: string
          consultancy_name?: string | null
          created_at?: string
          ethical_limits?: string | null
          exercise_preferences?: string | null
          extra?: Json
          id?: string
          methodology?: string | null
          niche_audience?: string | null
          nutrition_scope?: string | null
          onboarding_completed?: boolean
          owner_credentials?: string | null
          periodization_doctrine?: string | null
          plans_payment?: string | null
          progression_model?: string | null
          red_lines?: string | null
          strength_endurance_integration?: string | null
          tone?: string | null
          updated_at?: string
          use_prescription_engine_v1?: boolean
        }
        Update: {
          ai_text_refinement_enabled?: boolean
          assessment_protocol?: string | null
          assistant_name?: string
          bnito_whatsapp_enabled?: boolean
          communication_style?: string | null
          company_id?: string
          consultancy_name?: string | null
          created_at?: string
          ethical_limits?: string | null
          exercise_preferences?: string | null
          extra?: Json
          id?: string
          methodology?: string | null
          niche_audience?: string | null
          nutrition_scope?: string | null
          onboarding_completed?: boolean
          owner_credentials?: string | null
          periodization_doctrine?: string | null
          plans_payment?: string | null
          progression_model?: string | null
          red_lines?: string | null
          strength_endurance_integration?: string | null
          tone?: string | null
          updated_at?: string
          use_prescription_engine_v1?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_ai_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_billing: {
        Row: {
          company_id: string
          created_at: string
          id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_billing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_exercise_volumes: {
        Row: {
          company_id: string
          created_at: string
          exercise_id: string
          id: string
          muscle_group_id: string
          role: string
          updated_at: string
          volume_percentage: number
        }
        Insert: {
          company_id: string
          created_at?: string
          exercise_id: string
          id?: string
          muscle_group_id: string
          role?: string
          updated_at?: string
          volume_percentage?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          exercise_id?: string
          id?: string
          muscle_group_id?: string
          role?: string
          updated_at?: string
          volume_percentage?: number
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      content_interactions: {
        Row: {
          created_at: string | null
          id: string
          interaction_type: string
          post_id: string | null
          student_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          interaction_type: string
          post_id?: string | null
          student_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          interaction_type?: string
          post_id?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_interactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_interactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      content_posts: {
        Row: {
          audio_url: string | null
          author_id: string | null
          category: string | null
          company_id: string | null
          content: string | null
          content_type: string | null
          cover_image_url: string | null
          created_at: string | null
          difficulty: string | null
          excerpt: string | null
          id: string
          is_featured: boolean | null
          is_published: boolean | null
          likes_count: number | null
          published_at: string | null
          reading_time_min: number | null
          required_plan_id: string | null
          saves_count: number | null
          slug: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          video_duration_min: number | null
          video_url: string | null
          views_count: number | null
          visibility: string | null
        }
        Insert: {
          audio_url?: string | null
          author_id?: string | null
          category?: string | null
          company_id?: string | null
          content?: string | null
          content_type?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          difficulty?: string | null
          excerpt?: string | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          likes_count?: number | null
          published_at?: string | null
          reading_time_min?: number | null
          required_plan_id?: string | null
          saves_count?: number | null
          slug?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          video_duration_min?: number | null
          video_url?: string | null
          views_count?: number | null
          visibility?: string | null
        }
        Update: {
          audio_url?: string | null
          author_id?: string | null
          category?: string | null
          company_id?: string | null
          content?: string | null
          content_type?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          difficulty?: string | null
          excerpt?: string | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          likes_count?: number | null
          published_at?: string | null
          reading_time_min?: number | null
          required_plan_id?: string | null
          saves_count?: number | null
          slug?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          video_duration_min?: number | null
          video_url?: string | null
          views_count?: number | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_required_plan_id_fkey"
            columns: ["required_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tag_assignments: {
        Row: {
          assigned_at: string | null
          entity_id: string
          entity_type: string
          id: string
          tag_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          tag_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "crm_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tags: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_workflows: {
        Row: {
          actions: Json
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          total_enrolled: number | null
          trigger_config: Json | null
          trigger_type: string
        }
        Insert: {
          actions: Json
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          total_enrolled?: number | null
          trigger_config?: Json | null
          trigger_type: string
        }
        Update: {
          actions?: Json
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          total_enrolled?: number | null
          trigger_config?: Json | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_feedback: {
        Row: {
          adjustment_notes: string | null
          answers: Json
          applied: boolean
          company_id: string
          created_at: string
          cycle_id: string | null
          effort_score: number | null
          enrollment_id: string | null
          goals_aligned: boolean | null
          id: string
          nps: number | null
          student_id: string
          wants_adjustment: boolean | null
        }
        Insert: {
          adjustment_notes?: string | null
          answers?: Json
          applied?: boolean
          company_id: string
          created_at?: string
          cycle_id?: string | null
          effort_score?: number | null
          enrollment_id?: string | null
          goals_aligned?: boolean | null
          id?: string
          nps?: number | null
          student_id: string
          wants_adjustment?: boolean | null
        }
        Update: {
          adjustment_notes?: string | null
          answers?: Json
          applied?: boolean
          company_id?: string
          created_at?: string
          cycle_id?: string | null
          effort_score?: number | null
          enrollment_id?: string | null
          goals_aligned?: boolean | null
          id?: string
          nps?: number | null
          student_id?: string
          wants_adjustment?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cycle_feedback_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_templates: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          plan: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          plan: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          plan?: Json
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          carried_over_cycle_id: string | null
          company_id: string | null
          created_at: string
          cycle_duration_days: number | null
          end_date: string | null
          financial_notes: string | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          payment_status: string | null
          plan_id: string | null
          start_date: string | null
          status: string | null
          student_id: string
          trainer_id: string | null
          training_start_date: string | null
          updated_at: string
        }
        Insert: {
          carried_over_cycle_id?: string | null
          company_id?: string | null
          created_at?: string
          cycle_duration_days?: number | null
          end_date?: string | null
          financial_notes?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          plan_id?: string | null
          start_date?: string | null
          status?: string | null
          student_id: string
          trainer_id?: string | null
          training_start_date?: string | null
          updated_at?: string
        }
        Update: {
          carried_over_cycle_id?: string | null
          company_id?: string | null
          created_at?: string
          cycle_duration_days?: number | null
          end_date?: string | null
          financial_notes?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          plan_id?: string | null
          start_date?: string | null
          status?: string | null
          student_id?: string
          trainer_id?: string | null
          training_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_analyses: {
        Row: {
          ai_raw_response: Json | null
          company_id: string | null
          created_at: string | null
          exercise_id: string | null
          exercise_name: string | null
          id: string
          image_urls: string[] | null
          improvements: string[] | null
          injury_risk_level: string | null
          positives: string[] | null
          reviewed_at: string | null
          reviewed_by: string | null
          shared_at: string | null
          shared_with_student: boolean | null
          status: string | null
          student_id: string | null
          summary: string | null
          technical_score: number | null
          trainer_notes: string | null
          uploaded_by: string | null
          video_url: string | null
        }
        Insert: {
          ai_raw_response?: Json | null
          company_id?: string | null
          created_at?: string | null
          exercise_id?: string | null
          exercise_name?: string | null
          id?: string
          image_urls?: string[] | null
          improvements?: string[] | null
          injury_risk_level?: string | null
          positives?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shared_at?: string | null
          shared_with_student?: boolean | null
          status?: string | null
          student_id?: string | null
          summary?: string | null
          technical_score?: number | null
          trainer_notes?: string | null
          uploaded_by?: string | null
          video_url?: string | null
        }
        Update: {
          ai_raw_response?: Json | null
          company_id?: string | null
          created_at?: string | null
          exercise_id?: string | null
          exercise_name?: string | null
          id?: string
          image_urls?: string[] | null
          improvements?: string[] | null
          injury_risk_level?: string | null
          positives?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shared_at?: string | null
          shared_with_student?: boolean | null
          status?: string | null
          student_id?: string | null
          summary?: string | null
          technical_score?: number | null
          trainer_notes?: string | null
          uploaded_by?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_analyses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_analyses_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_analyses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_library: {
        Row: {
          body_regions: string[] | null
          categories: string[] | null
          category: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          difficulty: string | null
          equipment: string | null
          id: string
          is_global: boolean | null
          muscle_group: string | null
          muscle_group_id: string | null
          name: string
          thumbnail_url: string | null
          updated_at: string
          video_path: string | null
          video_url: string | null
          youtube_video_id: string | null
        }
        Insert: {
          body_regions?: string[] | null
          categories?: string[] | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: string | null
          equipment?: string | null
          id?: string
          is_global?: boolean | null
          muscle_group?: string | null
          muscle_group_id?: string | null
          name: string
          thumbnail_url?: string | null
          updated_at?: string
          video_path?: string | null
          video_url?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          body_regions?: string[] | null
          categories?: string[] | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: string | null
          equipment?: string | null
          id?: string
          is_global?: boolean | null
          muscle_group?: string | null
          muscle_group_id?: string | null
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
          video_path?: string | null
          video_url?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_library_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_library_muscle_group_id_fkey"
            columns: ["muscle_group_id"]
            isOneToOne: false
            referencedRelation: "muscle_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_metadata: {
        Row: {
          contraindications: string[]
          created_at: string
          equivalent_substitutes: string[]
          exercise_id: string
          notes: string | null
          pain_limitation_tags: string[]
          progressions: string[]
          regressions: string[]
          updated_at: string
        }
        Insert: {
          contraindications?: string[]
          created_at?: string
          equivalent_substitutes?: string[]
          exercise_id: string
          notes?: string | null
          pain_limitation_tags?: string[]
          progressions?: string[]
          regressions?: string[]
          updated_at?: string
        }
        Update: {
          contraindications?: string[]
          created_at?: string
          equivalent_substitutes?: string[]
          exercise_id?: string
          notes?: string | null
          pain_limitation_tags?: string[]
          progressions?: string[]
          regressions?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_metadata_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: true
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_muscle_targets: {
        Row: {
          exercise_id: string
          id: string
          is_primary: boolean | null
          muscle_group_id: string
          role: string
          volume_percentage: number
        }
        Insert: {
          exercise_id: string
          id?: string
          is_primary?: boolean | null
          muscle_group_id: string
          role?: string
          volume_percentage?: number
        }
        Update: {
          exercise_id?: string
          id?: string
          is_primary?: boolean | null
          muscle_group_id?: string
          role?: string
          volume_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "exercise_muscle_targets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_muscle_targets_muscle_group_id_fkey"
            columns: ["muscle_group_id"]
            isOneToOne: false
            referencedRelation: "muscle_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      external_activities: {
        Row: {
          activity_date: string
          activity_type: string
          company_id: string
          created_at: string
          distance_km: number | null
          duration_minutes: number | null
          id: string
          intensity: number | null
          notes: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          activity_date?: string
          activity_type: string
          company_id: string
          created_at?: string
          distance_km?: number | null
          duration_minutes?: number | null
          id?: string
          intensity?: number | null
          notes?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          activity_date?: string
          activity_type?: string
          company_id?: string
          created_at?: string
          distance_km?: number | null
          duration_minutes?: number | null
          id?: string
          intensity?: number | null
          notes?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_activities_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_sessions: {
        Row: {
          chat_id: string | null
          context: Json | null
          created_at: string
          current_node_id: string | null
          flow_id: string
          id: string
          last_activity_at: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          chat_id?: string | null
          context?: Json | null
          created_at?: string
          current_node_id?: string | null
          flow_id: string
          id?: string
          last_activity_at?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          chat_id?: string | null
          context?: Json | null
          created_at?: string
          current_node_id?: string | null
          flow_id?: string
          id?: string
          last_activity_at?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_sessions_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_sessions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          company_id: string | null
          created_at: string
          field_key: string | null
          field_type: string
          form_type: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          label: string
          options: Json | null
          sort_order: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          field_key?: string | null
          field_type?: string
          form_type: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label: string
          options?: Json | null
          sort_order?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          field_key?: string | null
          field_type?: string
          form_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label?: string
          options?: Json | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      functional_assessments: {
        Row: {
          ai_raw_response: string | null
          assessment_date: string | null
          assessment_json: Json | null
          company_id: string | null
          created_at: string | null
          historico_lesoes: string | null
          id: string
          modalidade: string | null
          movement_restrictions: string | null
          nivel: string | null
          postural_notes: string | null
          queixa_principal: string | null
          report_text: string | null
          source: string | null
          status: string | null
          student_id: string | null
        }
        Insert: {
          ai_raw_response?: string | null
          assessment_date?: string | null
          assessment_json?: Json | null
          company_id?: string | null
          created_at?: string | null
          historico_lesoes?: string | null
          id?: string
          modalidade?: string | null
          movement_restrictions?: string | null
          nivel?: string | null
          postural_notes?: string | null
          queixa_principal?: string | null
          report_text?: string | null
          source?: string | null
          status?: string | null
          student_id?: string | null
        }
        Update: {
          ai_raw_response?: string | null
          assessment_date?: string | null
          assessment_json?: Json | null
          company_id?: string | null
          created_at?: string | null
          historico_lesoes?: string | null
          id?: string
          modalidade?: string | null
          movement_restrictions?: string | null
          nivel?: string | null
          postural_notes?: string | null
          queixa_principal?: string | null
          report_text?: string | null
          source?: string | null
          status?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "functional_assessments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "functional_assessments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      injury_reports: {
        Row: {
          ai_analysis: Json | null
          ai_confidence: string | null
          ai_severity: number | null
          company_id: string | null
          created_at: string | null
          description: string | null
          duration_days: number | null
          id: string
          improves_with: string | null
          onset: string | null
          pain_level: number | null
          pain_type: string | null
          region: string
          resolved_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          student_id: string | null
          trainer_action: string | null
          trainer_notes: string | null
          trigger: string | null
          updated_at: string | null
          worsens_with: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          ai_confidence?: string | null
          ai_severity?: number | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          duration_days?: number | null
          id?: string
          improves_with?: string | null
          onset?: string | null
          pain_level?: number | null
          pain_type?: string | null
          region: string
          resolved_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          student_id?: string | null
          trainer_action?: string | null
          trainer_notes?: string | null
          trigger?: string | null
          updated_at?: string | null
          worsens_with?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          ai_confidence?: string | null
          ai_severity?: number | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          duration_days?: number | null
          id?: string
          improves_with?: string | null
          onset?: string | null
          pain_level?: number | null
          pain_type?: string | null
          region?: string
          resolved_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          student_id?: string | null
          trainer_action?: string | null
          trainer_notes?: string | null
          trigger?: string | null
          updated_at?: string | null
          worsens_with?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "injury_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "injury_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhook_events: {
        Row: {
          error: string | null
          event_id: string
          event_type: string | null
          id: string
          processed_at: string | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          error?: string | null
          event_id: string
          event_type?: string | null
          id?: string
          processed_at?: string | null
          provider: string
          received_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          event_id?: string
          event_type?: string | null
          id?: string
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      intercycle_anamneses: {
        Row: {
          additional_information: string | null
          availability_changed: boolean
          available_days: string[] | null
          available_equipment: string | null
          company_id: string
          consent_text_version: string
          consented_at: string
          created_at: string
          delivery_id: string
          enrollment_id: string
          goals_continue: boolean
          id: string
          new_goals: string | null
          pain_eva: number | null
          pain_location: string | null
          pain_movement: string | null
          pain_present: boolean
          pain_started_at: string | null
          prescription_evaluation: string
          sensitive_consent: boolean
          session_duration_minutes: number | null
          student_id: string
          submitted_at: string
          training_cycle_id: string
          training_location: string | null
        }
        Insert: {
          additional_information?: string | null
          availability_changed: boolean
          available_days?: string[] | null
          available_equipment?: string | null
          company_id: string
          consent_text_version: string
          consented_at: string
          created_at?: string
          delivery_id: string
          enrollment_id: string
          goals_continue: boolean
          id?: string
          new_goals?: string | null
          pain_eva?: number | null
          pain_location?: string | null
          pain_movement?: string | null
          pain_present: boolean
          pain_started_at?: string | null
          prescription_evaluation: string
          sensitive_consent: boolean
          session_duration_minutes?: number | null
          student_id: string
          submitted_at?: string
          training_cycle_id: string
          training_location?: string | null
        }
        Update: {
          additional_information?: string | null
          availability_changed?: boolean
          available_days?: string[] | null
          available_equipment?: string | null
          company_id?: string
          consent_text_version?: string
          consented_at?: string
          created_at?: string
          delivery_id?: string
          enrollment_id?: string
          goals_continue?: boolean
          id?: string
          new_goals?: string | null
          pain_eva?: number | null
          pain_location?: string | null
          pain_movement?: string | null
          pain_present?: boolean
          pain_started_at?: string | null
          prescription_evaluation?: string
          sensitive_consent?: boolean
          session_duration_minutes?: number | null
          student_id?: string
          submitted_at?: string
          training_cycle_id?: string
          training_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intercycle_anamneses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamneses_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "intercycle_anamnesis_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamneses_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamneses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamneses_training_cycle_id_fkey"
            columns: ["training_cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      intercycle_anamnesis_deliveries: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          created_at: string
          enrollment_id: string
          id: string
          idempotency_key: string
          last_error_code: string | null
          next_attempt_at: string | null
          reopened_at: string | null
          reopened_by: string | null
          responded_at: string | null
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: string
          student_id: string
          training_cycle_id: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          next_attempt_at?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          responded_at?: string | null
          retry_count?: number
          scheduled_for: string
          sent_at?: string | null
          status?: string
          student_id: string
          training_cycle_id: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          next_attempt_at?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          responded_at?: string | null
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          student_id?: string
          training_cycle_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intercycle_anamnesis_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_deliveries_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_deliveries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_deliveries_training_cycle_id_fkey"
            columns: ["training_cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      intercycle_anamnesis_invites: {
        Row: {
          company_id: string
          consumed_at: string | null
          created_at: string
          delivery_id: string
          enrollment_id: string
          expires_at: string
          id: string
          student_id: string
          token_sha256: string
          training_cycle_id: string
        }
        Insert: {
          company_id: string
          consumed_at?: string | null
          created_at?: string
          delivery_id: string
          enrollment_id: string
          expires_at: string
          id?: string
          student_id: string
          token_sha256: string
          training_cycle_id: string
        }
        Update: {
          company_id?: string
          consumed_at?: string | null
          created_at?: string
          delivery_id?: string
          enrollment_id?: string
          expires_at?: string
          id?: string
          student_id?: string
          token_sha256?: string
          training_cycle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intercycle_anamnesis_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_invites_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "intercycle_anamnesis_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_invites_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_invites_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_invites_training_cycle_id_fkey"
            columns: ["training_cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      intercycle_anamnesis_waivers: {
        Row: {
          company_id: string
          enrollment_id: string
          id: string
          prior_cycle_id: string
          reason: string
          student_id: string
          training_cycle_id: string
          waived_at: string
          waived_by: string
        }
        Insert: {
          company_id: string
          enrollment_id: string
          id?: string
          prior_cycle_id: string
          reason: string
          student_id: string
          training_cycle_id: string
          waived_at?: string
          waived_by: string
        }
        Update: {
          company_id?: string
          enrollment_id?: string
          id?: string
          prior_cycle_id?: string
          reason?: string
          student_id?: string
          training_cycle_id?: string
          waived_at?: string
          waived_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "intercycle_anamnesis_waivers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_waivers_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_waivers_prior_cycle_id_fkey"
            columns: ["prior_cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_waivers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intercycle_anamnesis_waivers_training_cycle_id_fkey"
            columns: ["training_cycle_id"]
            isOneToOne: true
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_funnel_events: {
        Row: {
          company_id: string
          created_at: string
          error: string | null
          event_key: string
          event_type: string
          id: string
          lead_id: string
          payload: Json
          processed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error?: string | null
          event_key: string
          event_type: string
          id?: string
          lead_id: string
          payload?: Json
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error?: string | null
          event_key?: string
          event_type?: string
          id?: string
          lead_id?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_funnel_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_funnel_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interactions: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          interaction_type: string
          lead_id: string | null
          new_stage: string | null
          old_stage: string | null
          outcome: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          interaction_type: string
          lead_id?: string | null
          new_stage?: string | null
          old_stage?: string | null
          outcome?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          interaction_type?: string
          lead_id?: string | null
          new_stage?: string | null
          old_stage?: string | null
          outcome?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          birth_date: string | null
          budget_range: string | null
          company_id: string | null
          contact_outcome: string | null
          contacted_at: string | null
          conversion_value: number | null
          converted_to_student_id: string | null
          created_at: string | null
          email: string | null
          fiscal_invited_at: string | null
          full_name: string
          gender: string | null
          id: string
          interest_notes: string | null
          last_contact_at: string | null
          lost_reason: string | null
          next_followup_at: string | null
          phone: string | null
          pre_registration_answers: Json
          preferred_contact_period: string | null
          preferred_plan_id: string | null
          source: string | null
          source_detail: string | null
          stage: string | null
          submitted_at: string | null
          updated_at: string | null
          utm_campaign: string | null
        }
        Insert: {
          assigned_to?: string | null
          birth_date?: string | null
          budget_range?: string | null
          company_id?: string | null
          contact_outcome?: string | null
          contacted_at?: string | null
          conversion_value?: number | null
          converted_to_student_id?: string | null
          created_at?: string | null
          email?: string | null
          fiscal_invited_at?: string | null
          full_name: string
          gender?: string | null
          id?: string
          interest_notes?: string | null
          last_contact_at?: string | null
          lost_reason?: string | null
          next_followup_at?: string | null
          phone?: string | null
          pre_registration_answers?: Json
          preferred_contact_period?: string | null
          preferred_plan_id?: string | null
          source?: string | null
          source_detail?: string | null
          stage?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
        }
        Update: {
          assigned_to?: string | null
          birth_date?: string | null
          budget_range?: string | null
          company_id?: string | null
          contact_outcome?: string | null
          contacted_at?: string | null
          conversion_value?: number | null
          converted_to_student_id?: string | null
          created_at?: string | null
          email?: string | null
          fiscal_invited_at?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          interest_notes?: string | null
          last_contact_at?: string | null
          lost_reason?: string | null
          next_followup_at?: string | null
          phone?: string | null
          pre_registration_answers?: Json
          preferred_contact_period?: string | null
          preferred_plan_id?: string | null
          source?: string | null
          source_detail?: string | null
          stage?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_to_student_id_fkey"
            columns: ["converted_to_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_preferred_plan_id_fkey"
            columns: ["preferred_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      live_classes: {
        Row: {
          company_id: string | null
          created_at: string | null
          daily_room_url: string | null
          description: string | null
          duration_min: number | null
          id: string
          instructor_id: string | null
          max_participants: number | null
          recording_url: string | null
          scheduled_at: string
          status: string | null
          title: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          daily_room_url?: string | null
          description?: string | null
          duration_min?: number | null
          id?: string
          instructor_id?: string | null
          max_participants?: number | null
          recording_url?: string | null
          scheduled_at: string
          status?: string | null
          title: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          daily_room_url?: string | null
          description?: string | null
          duration_min?: number | null
          id?: string
          instructor_id?: string | null
          max_participants?: number | null
          recording_url?: string | null
          scheduled_at?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_classes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_purchases: {
        Row: {
          buyer_company_id: string | null
          buyer_id: string | null
          id: string
          payment_id: string | null
          payment_status: string | null
          platform_fee_cents: number | null
          price_paid_cents: number
          purchased_at: string | null
          seller_revenue_cents: number | null
          template_id: string | null
        }
        Insert: {
          buyer_company_id?: string | null
          buyer_id?: string | null
          id?: string
          payment_id?: string | null
          payment_status?: string | null
          platform_fee_cents?: number | null
          price_paid_cents: number
          purchased_at?: string | null
          seller_revenue_cents?: number | null
          template_id?: string | null
        }
        Update: {
          buyer_company_id?: string | null
          buyer_id?: string | null
          id?: string
          payment_id?: string | null
          payment_status?: string | null
          platform_fee_cents?: number | null
          price_paid_cents?: number
          purchased_at?: string | null
          seller_revenue_cents?: number | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_purchases_buyer_company_id_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_purchases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "marketplace_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          purchase_id: string | null
          rating: number
          reviewer_id: string | null
          template_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          purchase_id?: string | null
          rating: number
          reviewer_id?: string | null
          template_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          purchase_id?: string | null
          rating?: number
          reviewer_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reviews_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "marketplace_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "marketplace_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_templates: {
        Row: {
          avg_rating: number | null
          category: string | null
          company_id: string | null
          cover_image_url: string | null
          created_at: string | null
          currency: string | null
          days_per_week: number | null
          description: string | null
          difficulty: string | null
          duration_weeks: number | null
          id: string
          is_featured: boolean | null
          name: string
          price_cents: number
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string | null
          status: string | null
          template_data: Json
          total_reviews: number | null
          total_sales: number | null
          updated_at: string | null
        }
        Insert: {
          avg_rating?: number | null
          category?: string | null
          company_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          days_per_week?: number | null
          description?: string | null
          difficulty?: string | null
          duration_weeks?: number | null
          id?: string
          is_featured?: boolean | null
          name: string
          price_cents: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string | null
          status?: string | null
          template_data: Json
          total_reviews?: number | null
          total_sales?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_rating?: number | null
          category?: string | null
          company_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          days_per_week?: number | null
          description?: string | null
          difficulty?: string | null
          duration_weeks?: number | null
          id?: string
          is_featured?: boolean | null
          name?: string
          price_cents?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string | null
          status?: string | null
          template_data?: Json
          total_reviews?: number | null
          total_sales?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_logs: {
        Row: {
          consumed_at: string | null
          consumed_date: string | null
          created_at: string | null
          custom_calories: number | null
          custom_description: string | null
          followed_plan: boolean | null
          id: string
          meal_id: string | null
          meal_type: string | null
          rating: number | null
          student_id: string | null
          student_notes: string | null
        }
        Insert: {
          consumed_at?: string | null
          consumed_date?: string | null
          created_at?: string | null
          custom_calories?: number | null
          custom_description?: string | null
          followed_plan?: boolean | null
          id?: string
          meal_id?: string | null
          meal_type?: string | null
          rating?: number | null
          student_id?: string | null
          student_notes?: string | null
        }
        Update: {
          consumed_at?: string | null
          consumed_date?: string | null
          created_at?: string | null
          custom_calories?: number | null
          custom_description?: string | null
          followed_plan?: boolean | null
          id?: string
          meal_id?: string | null
          meal_type?: string | null
          rating?: number | null
          student_id?: string | null
          student_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_logs_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          calories: number | null
          created_at: string | null
          description: string | null
          foods: Json | null
          id: string
          meal_name: string | null
          meal_order: number
          meal_type: string
          name: string | null
          notes: string | null
          plan_id: string | null
          scheduled_time: string | null
          time: string | null
          total_calories: number | null
          total_carbs_g: number | null
          total_fat_g: number | null
          total_protein_g: number | null
        }
        Insert: {
          calories?: number | null
          created_at?: string | null
          description?: string | null
          foods?: Json | null
          id?: string
          meal_name?: string | null
          meal_order: number
          meal_type: string
          name?: string | null
          notes?: string | null
          plan_id?: string | null
          scheduled_time?: string | null
          time?: string | null
          total_calories?: number | null
          total_carbs_g?: number | null
          total_fat_g?: number | null
          total_protein_g?: number | null
        }
        Update: {
          calories?: number | null
          created_at?: string | null
          description?: string | null
          foods?: Json | null
          id?: string
          meal_name?: string | null
          meal_order?: number
          meal_type?: string
          name?: string | null
          notes?: string | null
          plan_id?: string | null
          scheduled_time?: string | null
          time?: string | null
          total_calories?: number | null
          total_carbs_g?: number | null
          total_fat_g?: number | null
          total_protein_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string | null
          company_id: string | null
          content: string
          created_at: string
          id: string
          name: string
          shortcut: string | null
          title: string | null
          updated_at: string
          variables: Json | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          content: string
          created_at?: string
          id?: string
          name: string
          shortcut?: string | null
          title?: string | null
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          content?: string
          created_at?: string
          id?: string
          name?: string
          shortcut?: string | null
          title?: string | null
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mfit_cycle_overlap_repairs: {
        Row: {
          applied_at: string
          batch_sha256: string
          company_id: string
          enrollment_id: string
          exercise_row_count: number
          id: string
          imported_cycle_id: string
          imported_cycle_snapshot: Json
          imported_cycle_snapshot_sha256: string
          original_cycle_id: string
          original_cycle_snapshot: Json
          original_cycle_snapshot_sha256: string
          rolled_back_at: string | null
          state: string
          student_id: string
          workout_count: number
          workout_ids: string[]
          workout_snapshots: Json
          workout_snapshots_sha256: string
        }
        Insert: {
          applied_at?: string
          batch_sha256: string
          company_id: string
          enrollment_id: string
          exercise_row_count: number
          id?: string
          imported_cycle_id: string
          imported_cycle_snapshot: Json
          imported_cycle_snapshot_sha256: string
          original_cycle_id: string
          original_cycle_snapshot: Json
          original_cycle_snapshot_sha256: string
          rolled_back_at?: string | null
          state?: string
          student_id: string
          workout_count: number
          workout_ids: string[]
          workout_snapshots: Json
          workout_snapshots_sha256: string
        }
        Update: {
          applied_at?: string
          batch_sha256?: string
          company_id?: string
          enrollment_id?: string
          exercise_row_count?: number
          id?: string
          imported_cycle_id?: string
          imported_cycle_snapshot?: Json
          imported_cycle_snapshot_sha256?: string
          original_cycle_id?: string
          original_cycle_snapshot?: Json
          original_cycle_snapshot_sha256?: string
          rolled_back_at?: string | null
          state?: string
          student_id?: string
          workout_count?: number
          workout_ids?: string[]
          workout_snapshots?: Json
          workout_snapshots_sha256?: string
        }
        Relationships: []
      }
      mobility_exercises: {
        Row: {
          benefits: string[] | null
          company_id: string | null
          contraindications: string[] | null
          created_at: string | null
          default_duration_sec: number | null
          default_reps: number | null
          default_rest_sec: number | null
          default_sets: number | null
          description: string | null
          difficulty: string | null
          id: string
          is_active: boolean | null
          is_official: boolean | null
          name: string
          region: string
          thumbnail_url: string | null
          type: string | null
          video_url: string | null
        }
        Insert: {
          benefits?: string[] | null
          company_id?: string | null
          contraindications?: string[] | null
          created_at?: string | null
          default_duration_sec?: number | null
          default_reps?: number | null
          default_rest_sec?: number | null
          default_sets?: number | null
          description?: string | null
          difficulty?: string | null
          id?: string
          is_active?: boolean | null
          is_official?: boolean | null
          name: string
          region: string
          thumbnail_url?: string | null
          type?: string | null
          video_url?: string | null
        }
        Update: {
          benefits?: string[] | null
          company_id?: string | null
          contraindications?: string[] | null
          created_at?: string | null
          default_duration_sec?: number | null
          default_reps?: number | null
          default_rest_sec?: number | null
          default_sets?: number | null
          description?: string | null
          difficulty?: string | null
          id?: string
          is_active?: boolean | null
          is_official?: boolean | null
          name?: string
          region?: string
          thumbnail_url?: string | null
          type?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mobility_exercises_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mobility_program_exercises: {
        Row: {
          created_at: string | null
          duration_sec: number | null
          exercise_id: string | null
          exercise_order: number
          id: string
          notes: string | null
          program_id: string | null
          reps: number | null
          rest_sec: number | null
          sets: number | null
        }
        Insert: {
          created_at?: string | null
          duration_sec?: number | null
          exercise_id?: string | null
          exercise_order: number
          id?: string
          notes?: string | null
          program_id?: string | null
          reps?: number | null
          rest_sec?: number | null
          sets?: number | null
        }
        Update: {
          created_at?: string | null
          duration_sec?: number | null
          exercise_id?: string | null
          exercise_order?: number
          id?: string
          notes?: string | null
          program_id?: string | null
          reps?: number | null
          rest_sec?: number | null
          sets?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mobility_program_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "mobility_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobility_program_exercises_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "mobility_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      mobility_programs: {
        Row: {
          company_id: string | null
          cover_image_url: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_min: number | null
          goal: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          name: string
          region: string | null
        }
        Insert: {
          company_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_min?: number | null
          goal?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          name: string
          region?: string | null
        }
        Update: {
          company_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_min?: number | null
          goal?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          name?: string
          region?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mobility_programs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mobility_sessions: {
        Row: {
          completed_at: string | null
          duration_min: number | null
          id: string
          notes: string | null
          program_id: string | null
          rating: number | null
          student_id: string | null
        }
        Insert: {
          completed_at?: string | null
          duration_min?: number | null
          id?: string
          notes?: string | null
          program_id?: string | null
          rating?: number | null
          student_id?: string | null
        }
        Update: {
          completed_at?: string | null
          duration_min?: number | null
          id?: string
          notes?: string | null
          program_id?: string | null
          rating?: number | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mobility_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "mobility_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobility_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      muscle_groups: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          body: string | null
          clicked_at: string | null
          data: Json | null
          error_message: string | null
          id: string
          notification_type: string | null
          sent_at: string | null
          status: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          clicked_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: string
          notification_type?: string | null
          sent_at?: string | null
          status?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          clicked_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: string
          notification_type?: string | null
          sent_at?: string | null
          status?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          achievement_unlocked: boolean | null
          appointment_confirmed: boolean | null
          appointment_reminder: boolean | null
          message_from_trainer: boolean | null
          post_workout: boolean | null
          quiet_end: string | null
          quiet_hours_enabled: boolean | null
          quiet_start: string | null
          updated_at: string | null
          user_id: string
          workout_reminder: boolean | null
          workout_reminder_minutes: number | null
        }
        Insert: {
          achievement_unlocked?: boolean | null
          appointment_confirmed?: boolean | null
          appointment_reminder?: boolean | null
          message_from_trainer?: boolean | null
          post_workout?: boolean | null
          quiet_end?: string | null
          quiet_hours_enabled?: boolean | null
          quiet_start?: string | null
          updated_at?: string | null
          user_id: string
          workout_reminder?: boolean | null
          workout_reminder_minutes?: number | null
        }
        Update: {
          achievement_unlocked?: boolean | null
          appointment_confirmed?: boolean | null
          appointment_reminder?: boolean | null
          message_from_trainer?: boolean | null
          post_workout?: boolean | null
          quiet_end?: string | null
          quiet_hours_enabled?: boolean | null
          quiet_start?: string | null
          updated_at?: string | null
          user_id?: string
          workout_reminder?: boolean | null
          workout_reminder_minutes?: number | null
        }
        Relationships: []
      }
      nutrition_plans: {
        Row: {
          ai_rationale: string | null
          anamnese_id: string | null
          bundle_id: string | null
          carbs_g: number | null
          company_id: string | null
          context_activity_level: string | null
          context_body_fat_pct: number | null
          context_dietary_restrictions: string | null
          context_weight_kg: number | null
          created_at: string | null
          created_by: string | null
          end_date: string | null
          fat_g: number | null
          goal: string | null
          id: string
          meals: Json | null
          name: string
          notes: string | null
          observations: string | null
          plan_name: string | null
          previous_plan_id: string | null
          protein_g: number | null
          sequence_number: number | null
          sequence_phase: string | null
          source_document: Json | null
          source_file_name: string | null
          source_type: string | null
          start_date: string | null
          status: string | null
          student_id: string | null
          target_calories: number | null
          target_carbs_g: number | null
          target_fat_g: number | null
          target_fiber_g: number | null
          target_protein_g: number | null
          target_water_ml: number | null
          total_calories: number | null
          training_cycle_id: string | null
          updated_at: string | null
        }
        Insert: {
          ai_rationale?: string | null
          anamnese_id?: string | null
          bundle_id?: string | null
          carbs_g?: number | null
          company_id?: string | null
          context_activity_level?: string | null
          context_body_fat_pct?: number | null
          context_dietary_restrictions?: string | null
          context_weight_kg?: number | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          fat_g?: number | null
          goal?: string | null
          id?: string
          meals?: Json | null
          name: string
          notes?: string | null
          observations?: string | null
          plan_name?: string | null
          previous_plan_id?: string | null
          protein_g?: number | null
          sequence_number?: number | null
          sequence_phase?: string | null
          source_document?: Json | null
          source_file_name?: string | null
          source_type?: string | null
          start_date?: string | null
          status?: string | null
          student_id?: string | null
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_fiber_g?: number | null
          target_protein_g?: number | null
          target_water_ml?: number | null
          total_calories?: number | null
          training_cycle_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_rationale?: string | null
          anamnese_id?: string | null
          bundle_id?: string | null
          carbs_g?: number | null
          company_id?: string | null
          context_activity_level?: string | null
          context_body_fat_pct?: number | null
          context_dietary_restrictions?: string | null
          context_weight_kg?: number | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          fat_g?: number | null
          goal?: string | null
          id?: string
          meals?: Json | null
          name?: string
          notes?: string | null
          observations?: string | null
          plan_name?: string | null
          previous_plan_id?: string | null
          protein_g?: number | null
          sequence_number?: number | null
          sequence_phase?: string | null
          source_document?: Json | null
          source_file_name?: string | null
          source_type?: string | null
          start_date?: string | null
          status?: string | null
          student_id?: string | null
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_fiber_g?: number | null
          target_protein_g?: number | null
          target_water_ml?: number | null
          total_calories?: number | null
          training_cycle_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plans_anamnese_id_fkey"
            columns: ["anamnese_id"]
            isOneToOne: false
            referencedRelation: "student_anamneses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "prescription_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_previous_plan_id_fkey"
            columns: ["previous_plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_training_cycle_id_fkey"
            columns: ["training_cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          address: string | null
          category: string | null
          company_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          instagram: string | null
          is_active: boolean | null
          logo_url: string | null
          name: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          instagram?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          instagram?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_recovery_events: {
        Row: {
          company_id: string
          created_at: string
          enrollment_id: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          payment_id: string | null
          plan_id: string | null
          source: string
          student_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enrollment_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          payment_id?: string | null
          plan_id?: string | null
          source?: string
          student_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enrollment_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          payment_id?: string | null
          plan_id?: string | null
          source?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_recovery_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recovery_events_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recovery_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recovery_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recovery_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          asaas_boleto_url: string | null
          asaas_customer_id: string | null
          asaas_invoice_url: string | null
          asaas_payment_id: string | null
          asaas_pix_payload: string | null
          asaas_pix_qr_code: string | null
          billing_type: string | null
          checkout_request_key: string | null
          company_id: string | null
          created_at: string
          due_date: string | null
          enrollment_id: string | null
          id: string
          installment_count: number | null
          invoice_status: string | null
          invoice_url: string | null
          lifecycle_applied_at: string | null
          lifecycle_enrollment_id: string | null
          lifecycle_first_activation: boolean | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          plan_duration_weeks_snapshot: number | null
          plan_id: string | null
          plan_name_snapshot: string | null
          status: string | null
          student_id: string
          updated_at: string
          value: number | null
        }
        Insert: {
          amount?: number
          asaas_boleto_url?: string | null
          asaas_customer_id?: string | null
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          asaas_pix_payload?: string | null
          asaas_pix_qr_code?: string | null
          billing_type?: string | null
          checkout_request_key?: string | null
          company_id?: string | null
          created_at?: string
          due_date?: string | null
          enrollment_id?: string | null
          id?: string
          installment_count?: number | null
          invoice_status?: string | null
          invoice_url?: string | null
          lifecycle_applied_at?: string | null
          lifecycle_enrollment_id?: string | null
          lifecycle_first_activation?: boolean | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          plan_duration_weeks_snapshot?: number | null
          plan_id?: string | null
          plan_name_snapshot?: string | null
          status?: string | null
          student_id: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          amount?: number
          asaas_boleto_url?: string | null
          asaas_customer_id?: string | null
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          asaas_pix_payload?: string | null
          asaas_pix_qr_code?: string | null
          billing_type?: string | null
          checkout_request_key?: string | null
          company_id?: string | null
          created_at?: string
          due_date?: string | null
          enrollment_id?: string | null
          id?: string
          installment_count?: number | null
          invoice_status?: string | null
          invoice_url?: string | null
          lifecycle_applied_at?: string | null
          lifecycle_enrollment_id?: string | null
          lifecycle_first_activation?: boolean | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          plan_duration_weeks_snapshot?: number | null
          plan_id?: string | null
          plan_name_snapshot?: string | null
          status?: string | null
          student_id?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lifecycle_enrollment_id_fkey"
            columns: ["lifecycle_enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          company_id: string | null
          created_at: string
          cycle_duration_days: number | null
          description: string | null
          duration_days: number | null
          duration_weeks: number | null
          id: string
          is_active: boolean | null
          name: string
          plan_kind: string
          price: number | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          cycle_duration_days?: number | null
          description?: string | null
          duration_days?: number | null
          duration_weeks?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          plan_kind?: string
          price?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          cycle_duration_days?: number | null
          description?: string | null
          duration_days?: number | null
          duration_weeks?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          plan_kind?: string
          price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_ads: {
        Row: {
          audience: string
          body: string | null
          company_id: string | null
          created_at: string
          created_by: string
          cta_label: string | null
          cta_url: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          placement: string
          priority: number
          scope: string
          starts_at: string | null
          student_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience: string
          body?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          placement: string
          priority?: number
          scope?: string
          starts_at?: string | null
          student_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          placement?: string
          priority?: number
          scope?: string
          starts_at?: string | null
          student_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_ads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_ads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          background_color: string | null
          card_color: string | null
          company_id: string | null
          created_at: string
          id: string
          layout_style: string
          logo_url: string | null
          platform_title: string | null
          primary_color: string | null
          text_color: string | null
          updated_at: string
        }
        Insert: {
          background_color?: string | null
          card_color?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          layout_style?: string
          logo_url?: string | null
          platform_title?: string | null
          primary_color?: string | null
          text_color?: string | null
          updated_at?: string
        }
        Update: {
          background_color?: string | null
          card_color?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          layout_style?: string
          logo_url?: string | null
          platform_title?: string | null
          primary_color?: string | null
          text_color?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      points_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string | null
          id: string
          reason: string | null
          source_id: string | null
          source_type: string | null
          student_id: string | null
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string | null
          id?: string
          reason?: string | null
          source_id?: string | null
          source_type?: string | null
          student_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string | null
          id?: string
          reason?: string | null
          source_id?: string | null
          source_type?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "points_transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      post_session_automations: {
        Row: {
          ai_persona: string | null
          channel: string | null
          company_id: string | null
          created_at: string | null
          delay_minutes: number | null
          enabled: boolean | null
          id: string
          template_text: string | null
          updated_at: string | null
          use_ai: boolean | null
        }
        Insert: {
          ai_persona?: string | null
          channel?: string | null
          company_id?: string | null
          created_at?: string | null
          delay_minutes?: number | null
          enabled?: boolean | null
          id?: string
          template_text?: string | null
          updated_at?: string | null
          use_ai?: boolean | null
        }
        Update: {
          ai_persona?: string | null
          channel?: string | null
          company_id?: string | null
          created_at?: string | null
          delay_minutes?: number | null
          enabled?: boolean | null
          id?: string
          template_text?: string | null
          updated_at?: string | null
          use_ai?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "post_session_automations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_bundle_items: {
        Row: {
          bundle_id: string
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          modality: string
          student_id: string
        }
        Insert: {
          bundle_id: string
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          modality: string
          student_id: string
        }
        Update: {
          bundle_id?: string
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          modality?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "prescription_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_bundle_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_bundle_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_bundles: {
        Row: {
          anamnese_id: string | null
          assessment_id: string | null
          company_id: string
          created_at: string | null
          generation_error: string | null
          has_cardio: boolean | null
          has_cycling: boolean | null
          has_nutrition: boolean | null
          has_strength: boolean | null
          has_swimming: boolean | null
          id: string
          modalities: string[] | null
          notes: string | null
          nutrition_plan_id: string | null
          running_plan_id: string | null
          status: string | null
          strength_plan_id: string | null
          student_id: string
          training_cycle_id: string | null
          updated_at: string
        }
        Insert: {
          anamnese_id?: string | null
          assessment_id?: string | null
          company_id: string
          created_at?: string | null
          generation_error?: string | null
          has_cardio?: boolean | null
          has_cycling?: boolean | null
          has_nutrition?: boolean | null
          has_strength?: boolean | null
          has_swimming?: boolean | null
          id?: string
          modalities?: string[] | null
          notes?: string | null
          nutrition_plan_id?: string | null
          running_plan_id?: string | null
          status?: string | null
          strength_plan_id?: string | null
          student_id: string
          training_cycle_id?: string | null
          updated_at?: string
        }
        Update: {
          anamnese_id?: string | null
          assessment_id?: string | null
          company_id?: string
          created_at?: string | null
          generation_error?: string | null
          has_cardio?: boolean | null
          has_cycling?: boolean | null
          has_nutrition?: boolean | null
          has_strength?: boolean | null
          has_swimming?: boolean | null
          id?: string
          modalities?: string[] | null
          notes?: string | null
          nutrition_plan_id?: string | null
          running_plan_id?: string | null
          status?: string | null
          strength_plan_id?: string | null
          student_id?: string
          training_cycle_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_bundles_anamnese_id_fkey"
            columns: ["anamnese_id"]
            isOneToOne: false
            referencedRelation: "student_anamneses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_bundles_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "functional_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_bundles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_bundles_nutrition_plan_id_fkey"
            columns: ["nutrition_plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_bundles_running_plan_id_fkey"
            columns: ["running_plan_id"]
            isOneToOne: false
            referencedRelation: "running_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_bundles_strength_plan_id_fkey"
            columns: ["strength_plan_id"]
            isOneToOne: false
            referencedRelation: "ai_strength_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_bundles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_bundles_training_cycle_id_fkey"
            columns: ["training_cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          preferred_language: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          preferred_language?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          preferred_language?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      progress_photos: {
        Row: {
          company_id: string
          created_at: string
          id: string
          metadata: Json
          notes: string | null
          photo_path: string
          student_id: string
          taken_at: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          photo_path: string
          student_id: string
          taken_at?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          photo_path?: string
          student_id?: string
          taken_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_photos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_photos_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      public_payment_links: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          revoked_at: string | null
          student_id: string
          token: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          student_id: string
          token?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          student_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_payment_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_payment_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      public_registration_links: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          revoked_at: string | null
          student_id: string
          token: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          student_id: string
          token?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          student_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_registration_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_registration_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          device_name: string | null
          device_type: string | null
          endpoint: string
          id: string
          is_active: boolean | null
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          device_name?: string | null
          device_type?: string | null
          endpoint: string
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          device_name?: string | null
          device_type?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      referral_programs: {
        Row: {
          company_id: string | null
          created_at: string | null
          expires_after_days: number | null
          id: string
          is_active: boolean | null
          min_active_days: number | null
          program_name: string | null
          referred_reward_description: string | null
          referred_reward_type: string | null
          referred_reward_value: number | null
          referrer_reward_description: string | null
          referrer_reward_type: string | null
          referrer_reward_value: number | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          expires_after_days?: number | null
          id?: string
          is_active?: boolean | null
          min_active_days?: number | null
          program_name?: string | null
          referred_reward_description?: string | null
          referred_reward_type?: string | null
          referred_reward_value?: number | null
          referrer_reward_description?: string | null
          referrer_reward_type?: string | null
          referrer_reward_value?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          expires_after_days?: number | null
          id?: string
          is_active?: boolean | null
          min_active_days?: number | null
          program_name?: string | null
          referred_reward_description?: string | null
          referred_reward_type?: string | null
          referred_reward_value?: number | null
          referrer_reward_description?: string | null
          referrer_reward_type?: string | null
          referrer_reward_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_programs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          company_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          referral_code: string
          referred_email: string | null
          referred_lead_id: string | null
          referred_name: string | null
          referred_phone: string | null
          referred_student_id: string | null
          referrer_student_id: string | null
          reward_description: string | null
          reward_granted_at: string | null
          reward_value: number | null
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          referral_code: string
          referred_email?: string | null
          referred_lead_id?: string | null
          referred_name?: string | null
          referred_phone?: string | null
          referred_student_id?: string | null
          referrer_student_id?: string | null
          reward_description?: string | null
          reward_granted_at?: string | null
          reward_value?: number | null
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          referral_code?: string
          referred_email?: string | null
          referred_lead_id?: string | null
          referred_name?: string | null
          referred_phone?: string | null
          referred_student_id?: string | null
          referrer_student_id?: string | null
          reward_description?: string | null
          reward_granted_at?: string | null
          reward_value?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_lead_id_fkey"
            columns: ["referred_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_student_id_fkey"
            columns: ["referred_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_student_id_fkey"
            columns: ["referrer_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean | null
          id: string
          module: string
          role: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean | null
          id?: string
          module: string
          role: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean | null
          id?: string
          module?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      running_plans: {
        Row: {
          anamnese_id: string | null
          bundle_id: string | null
          company_id: string | null
          complementary_strength: Json | null
          created_at: string | null
          current_level: string | null
          duration_weeks: number | null
          end_date: string | null
          fc_zones: Json | null
          general_tips: string | null
          goal: string | null
          id: string
          model: string | null
          name: string
          notes: string | null
          nutrition_alert: string | null
          plan_name: string | null
          previous_plan_id: string | null
          recent_5k_time: string | null
          safety_check: Json | null
          sequence_number: number | null
          sequence_phase: string | null
          sport: string | null
          start_date: string | null
          status: string | null
          student_id: string | null
          target_distance_km: number | null
          target_pace: string | null
          trainer_id: string | null
          training_cycle_id: string | null
          updated_at: string | null
          warnings: string[] | null
          weekly_volume_km: number | null
          weeks: Json | null
        }
        Insert: {
          anamnese_id?: string | null
          bundle_id?: string | null
          company_id?: string | null
          complementary_strength?: Json | null
          created_at?: string | null
          current_level?: string | null
          duration_weeks?: number | null
          end_date?: string | null
          fc_zones?: Json | null
          general_tips?: string | null
          goal?: string | null
          id?: string
          model?: string | null
          name: string
          notes?: string | null
          nutrition_alert?: string | null
          plan_name?: string | null
          previous_plan_id?: string | null
          recent_5k_time?: string | null
          safety_check?: Json | null
          sequence_number?: number | null
          sequence_phase?: string | null
          sport?: string | null
          start_date?: string | null
          status?: string | null
          student_id?: string | null
          target_distance_km?: number | null
          target_pace?: string | null
          trainer_id?: string | null
          training_cycle_id?: string | null
          updated_at?: string | null
          warnings?: string[] | null
          weekly_volume_km?: number | null
          weeks?: Json | null
        }
        Update: {
          anamnese_id?: string | null
          bundle_id?: string | null
          company_id?: string | null
          complementary_strength?: Json | null
          created_at?: string | null
          current_level?: string | null
          duration_weeks?: number | null
          end_date?: string | null
          fc_zones?: Json | null
          general_tips?: string | null
          goal?: string | null
          id?: string
          model?: string | null
          name?: string
          notes?: string | null
          nutrition_alert?: string | null
          plan_name?: string | null
          previous_plan_id?: string | null
          recent_5k_time?: string | null
          safety_check?: Json | null
          sequence_number?: number | null
          sequence_phase?: string | null
          sport?: string | null
          start_date?: string | null
          status?: string | null
          student_id?: string | null
          target_distance_km?: number | null
          target_pace?: string | null
          trainer_id?: string | null
          training_cycle_id?: string | null
          updated_at?: string | null
          warnings?: string[] | null
          weekly_volume_km?: number | null
          weeks?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "running_plans_anamnese_id_fkey"
            columns: ["anamnese_id"]
            isOneToOne: false
            referencedRelation: "student_anamneses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "running_plans_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "prescription_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "running_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "running_plans_previous_plan_id_fkey"
            columns: ["previous_plan_id"]
            isOneToOne: false
            referencedRelation: "running_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "running_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "running_plans_training_cycle_id_fkey"
            columns: ["training_cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      running_sessions: {
        Row: {
          actual_avg_pace: string | null
          actual_distance_km: number | null
          actual_duration_minutes: number | null
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          day_of_week: number
          description: string | null
          display_order: number | null
          distance_km: number | null
          duration_minutes: number | null
          id: string
          intensity_zone: string | null
          pace_target: string | null
          perceived_effort: number | null
          plan_id: string | null
          scheduled_date: string | null
          session_type: string
          student_notes: string | null
          week_number: number
        }
        Insert: {
          actual_avg_pace?: string | null
          actual_distance_km?: number | null
          actual_duration_minutes?: number | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          day_of_week: number
          description?: string | null
          display_order?: number | null
          distance_km?: number | null
          duration_minutes?: number | null
          id?: string
          intensity_zone?: string | null
          pace_target?: string | null
          perceived_effort?: number | null
          plan_id?: string | null
          scheduled_date?: string | null
          session_type: string
          student_notes?: string | null
          week_number: number
        }
        Update: {
          actual_avg_pace?: string | null
          actual_distance_km?: number | null
          actual_duration_minutes?: number | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          day_of_week?: number
          description?: string | null
          display_order?: number | null
          distance_km?: number | null
          duration_minutes?: number | null
          id?: string
          intensity_zone?: string | null
          pace_target?: string | null
          perceived_effort?: number | null
          plan_id?: string | null
          scheduled_date?: string | null
          session_type?: string
          student_notes?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "running_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "running_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          channel: string | null
          company_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          message_text: string | null
          scheduled_for: string
          sent_at: string | null
          status: string | null
          student_id: string | null
          trigger_data: Json | null
          trigger_type: string
        }
        Insert: {
          channel?: string | null
          company_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_text?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
          student_id?: string | null
          trigger_data?: Json | null
          trigger_type: string
        }
        Update: {
          channel?: string | null
          company_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_text?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
          student_id?: string | null
          trigger_data?: Json | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_items: {
        Row: {
          cash_value: number | null
          category: string | null
          company_id: string | null
          created_at: string | null
          current_redemptions: number | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          max_per_student: number | null
          min_active_days: number | null
          name: string
          points_cost: number
          stock: number | null
          updated_at: string | null
        }
        Insert: {
          cash_value?: number | null
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          current_redemptions?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          max_per_student?: number | null
          min_active_days?: number | null
          name: string
          points_cost: number
          stock?: number | null
          updated_at?: string | null
        }
        Update: {
          cash_value?: number | null
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          current_redemptions?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          max_per_student?: number | null
          min_active_days?: number | null
          name?: string
          points_cost?: number
          stock?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_redemptions: {
        Row: {
          company_id: string | null
          created_at: string | null
          delivered_at: string | null
          delivered_by: string | null
          delivery_notes: string | null
          id: string
          item_id: string | null
          item_name: string | null
          points_spent: number
          redemption_code: string | null
          status: string | null
          student_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_notes?: string | null
          id?: string
          item_id?: string | null
          item_name?: string | null
          points_spent: number
          redemption_code?: string | null
          status?: string | null
          student_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_notes?: string | null
          id?: string
          item_id?: string | null
          item_name?: string | null
          points_spent?: number
          redemption_code?: string | null
          status?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_redemptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_redemptions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_redemptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permissions: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          granted_by: string | null
          id: string
          permission: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          granted_by?: string | null
          id?: string
          permission: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          granted_by?: string | null
          id?: string
          permission?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_sessions: {
        Row: {
          company_id: string
          ended_at: string | null
          id: string
          last_seen_at: string
          role: Database["public"]["Enums"]["app_role"]
          started_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          ended_at?: string | null
          id?: string
          last_seen_at?: string
          role: Database["public"]["Enums"]["app_role"]
          started_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          ended_at?: string | null
          id?: string
          last_seen_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      student_achievements: {
        Row: {
          achievement_id: string
          company_id: string
          earned_at: string
          id: string
          student_id: string
        }
        Insert: {
          achievement_id: string
          company_id: string
          earned_at?: string
          id?: string
          student_id: string
        }
        Update: {
          achievement_id?: string
          company_id?: string
          earned_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_achievements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_achievements_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_anamneses: {
        Row: {
          activity_level: string | null
          age: number | null
          body_fat_percent: number | null
          budget_food: string | null
          cardio_goal: string | null
          company_id: string
          created_at: string | null
          current_volume_unit: string
          current_volume_weekly: number | null
          custom_answers: Json
          days_per_week_cardio: number | null
          days_per_week_strength: number | null
          endurance_session_duration_min: number | null
          equipment: string | null
          experience_months: number | null
          fcmax: number | null
          fcrep: number | null
          food_restrictions: string | null
          has_endurance_coach: boolean
          has_kitchen: boolean | null
          has_nutritionist: boolean
          id: string
          injuries: string | null
          is_endurance_athlete: boolean | null
          legacy_anamnesis_id: string | null
          meals_per_day: number | null
          notes: string | null
          nutrition_context: string | null
          objective: string | null
          session_duration_min: number | null
          shown_blocks: string[]
          sleep_quality: number | null
          sport: string | null
          stress_score: number | null
          student_id: string
          training_modality: string | null
          updated_at: string | null
          wants_cycling: boolean
          wants_nutrition: boolean
          wants_running: boolean
          wants_strength: boolean
          wants_swimming: boolean
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          body_fat_percent?: number | null
          budget_food?: string | null
          cardio_goal?: string | null
          company_id: string
          created_at?: string | null
          current_volume_unit?: string
          current_volume_weekly?: number | null
          custom_answers?: Json
          days_per_week_cardio?: number | null
          days_per_week_strength?: number | null
          endurance_session_duration_min?: number | null
          equipment?: string | null
          experience_months?: number | null
          fcmax?: number | null
          fcrep?: number | null
          food_restrictions?: string | null
          has_endurance_coach?: boolean
          has_kitchen?: boolean | null
          has_nutritionist?: boolean
          id?: string
          injuries?: string | null
          is_endurance_athlete?: boolean | null
          legacy_anamnesis_id?: string | null
          meals_per_day?: number | null
          notes?: string | null
          nutrition_context?: string | null
          objective?: string | null
          session_duration_min?: number | null
          shown_blocks?: string[]
          sleep_quality?: number | null
          sport?: string | null
          stress_score?: number | null
          student_id: string
          training_modality?: string | null
          updated_at?: string | null
          wants_cycling?: boolean
          wants_nutrition?: boolean
          wants_running?: boolean
          wants_strength?: boolean
          wants_swimming?: boolean
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          body_fat_percent?: number | null
          budget_food?: string | null
          cardio_goal?: string | null
          company_id?: string
          created_at?: string | null
          current_volume_unit?: string
          current_volume_weekly?: number | null
          custom_answers?: Json
          days_per_week_cardio?: number | null
          days_per_week_strength?: number | null
          endurance_session_duration_min?: number | null
          equipment?: string | null
          experience_months?: number | null
          fcmax?: number | null
          fcrep?: number | null
          food_restrictions?: string | null
          has_endurance_coach?: boolean
          has_kitchen?: boolean | null
          has_nutritionist?: boolean
          id?: string
          injuries?: string | null
          is_endurance_athlete?: boolean | null
          legacy_anamnesis_id?: string | null
          meals_per_day?: number | null
          notes?: string | null
          nutrition_context?: string | null
          objective?: string | null
          session_duration_min?: number | null
          shown_blocks?: string[]
          sleep_quality?: number | null
          sport?: string | null
          stress_score?: number | null
          student_id?: string
          training_modality?: string | null
          updated_at?: string | null
          wants_cycling?: boolean
          wants_nutrition?: boolean
          wants_running?: boolean
          wants_strength?: boolean
          wants_swimming?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "student_anamneses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_anamneses_legacy_anamnesis_id_fkey"
            columns: ["legacy_anamnesis_id"]
            isOneToOne: false
            referencedRelation: "anamnesis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_anamneses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_anamnesis_history: {
        Row: {
          company_id: string
          created_at: string
          id: string
          snapshot: Json
          student_id: string
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          snapshot: Json
          student_id: string
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          snapshot?: Json
          student_id?: string
          version?: number
        }
        Relationships: []
      }
      student_badges: {
        Row: {
          awarded_by: string | null
          badge_id: string | null
          context_data: Json | null
          earned_at: string | null
          id: string
          student_id: string | null
        }
        Insert: {
          awarded_by?: string | null
          badge_id?: string | null
          context_data?: Json | null
          earned_at?: string | null
          id?: string
          student_id?: string | null
        }
        Update: {
          awarded_by?: string | null
          badge_id?: string | null
          context_data?: Json | null
          earned_at?: string | null
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_body_limitations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          note: string | null
          region: string
          severity: string | null
          source: string
          student_id: string
          type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          note?: string | null
          region: string
          severity?: string | null
          source?: string
          student_id: string
          type: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          note?: string | null
          region?: string
          severity?: string | null
          source?: string
          student_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_body_limitations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_categories: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      student_checkins: {
        Row: {
          checkin_date: string
          company_id: string
          created_at: string
          id: string
          pain: number | null
          sleep_quality: number | null
          stress: number | null
          student_id: string
        }
        Insert: {
          checkin_date?: string
          company_id: string
          created_at?: string
          id?: string
          pain?: number | null
          sleep_quality?: number | null
          stress?: number | null
          student_id: string
        }
        Update: {
          checkin_date?: string
          company_id?: string
          created_at?: string
          id?: string
          pain?: number | null
          sleep_quality?: number | null
          stress?: number | null
          student_id?: string
        }
        Relationships: []
      }
      student_evaluations: {
        Row: {
          body_fat_percentage: number | null
          company_id: string
          created_at: string
          created_by: string | null
          evaluation_date: string | null
          evaluator_id: string | null
          file_url: string | null
          height: number | null
          id: string
          measurements: Json | null
          notes: string | null
          photos: Json | null
          student_id: string
          type: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          body_fat_percentage?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          evaluation_date?: string | null
          evaluator_id?: string | null
          file_url?: string | null
          height?: number | null
          id?: string
          measurements?: Json | null
          notes?: string | null
          photos?: Json | null
          student_id: string
          type?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          body_fat_percentage?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          evaluation_date?: string | null
          evaluator_id?: string | null
          file_url?: string | null
          height?: number | null
          id?: string
          measurements?: Json | null
          notes?: string | null
          photos?: Json | null
          student_id?: string
          type?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_evaluations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_evaluations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_files: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          kind: string
          metadata: Json
          source: string
          student_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          kind?: string
          metadata?: Json
          source?: string
          student_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          kind?: string
          metadata?: Json
          source?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_files_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_funnel_events: {
        Row: {
          company_id: string
          created_at: string
          error: string | null
          event_key: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          status: string
          student_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error?: string | null
          event_key: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          student_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error?: string | null
          event_key?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_funnel_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_funnel_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_goals: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          metric: string | null
          status: string
          student_id: string
          target_date: string
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          metric?: string | null
          status?: string
          student_id: string
          target_date: string
          title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          metric?: string | null
          status?: string
          student_id?: string
          target_date?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_goals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          activated_at: string | null
          address: string | null
          address_number: string | null
          asaas_customer_id: string | null
          assessment_due_at: string | null
          assigned_trainer_id: string | null
          billing_address: string | null
          billing_address_number: string | null
          billing_country_code: string | null
          billing_cpf_cnpj: string | null
          billing_email: string | null
          billing_name: string | null
          billing_neighborhood: string | null
          billing_phone: string | null
          billing_postal_code: string | null
          birth_date: string | null
          category_id: string | null
          cep: string | null
          city: string | null
          company_id: string | null
          country_code: string
          cpf: string | null
          created_at: string
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          fiscal_completed_at: string | null
          full_name: string
          gender: string | null
          height_cm: number | null
          id: string
          intercycle_anamnesis_enabled: boolean
          neighborhood: string | null
          notes: string | null
          onboarding_instructions_sent_at: string | null
          payment_link_sent_at: string | null
          phone: string | null
          photo_url: string | null
          referral_code: string | null
          sales_stage: string | null
          selected_plan_id: string | null
          state: string | null
          status: string | null
          updated_at: string
          user_id: string | null
          weekly_contact_enabled: boolean
          weekly_workout_goal: number
          weight_kg: number | null
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          activated_at?: string | null
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string | null
          assessment_due_at?: string | null
          assigned_trainer_id?: string | null
          billing_address?: string | null
          billing_address_number?: string | null
          billing_country_code?: string | null
          billing_cpf_cnpj?: string | null
          billing_email?: string | null
          billing_name?: string | null
          billing_neighborhood?: string | null
          billing_phone?: string | null
          billing_postal_code?: string | null
          birth_date?: string | null
          category_id?: string | null
          cep?: string | null
          city?: string | null
          company_id?: string | null
          country_code?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          fiscal_completed_at?: string | null
          full_name: string
          gender?: string | null
          height_cm?: number | null
          id?: string
          intercycle_anamnesis_enabled?: boolean
          neighborhood?: string | null
          notes?: string | null
          onboarding_instructions_sent_at?: string | null
          payment_link_sent_at?: string | null
          phone?: string | null
          photo_url?: string | null
          referral_code?: string | null
          sales_stage?: string | null
          selected_plan_id?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_contact_enabled?: boolean
          weekly_workout_goal?: number
          weight_kg?: number | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          activated_at?: string | null
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string | null
          assessment_due_at?: string | null
          assigned_trainer_id?: string | null
          billing_address?: string | null
          billing_address_number?: string | null
          billing_country_code?: string | null
          billing_cpf_cnpj?: string | null
          billing_email?: string | null
          billing_name?: string | null
          billing_neighborhood?: string | null
          billing_phone?: string | null
          billing_postal_code?: string | null
          birth_date?: string | null
          category_id?: string | null
          cep?: string | null
          city?: string | null
          company_id?: string | null
          country_code?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          fiscal_completed_at?: string | null
          full_name?: string
          gender?: string | null
          height_cm?: number | null
          id?: string
          intercycle_anamnesis_enabled?: boolean
          neighborhood?: string | null
          notes?: string | null
          onboarding_instructions_sent_at?: string | null
          payment_link_sent_at?: string | null
          phone?: string | null
          photo_url?: string | null
          referral_code?: string | null
          sales_stage?: string | null
          selected_plan_id?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_contact_enabled?: boolean
          weekly_workout_goal?: number
          weight_kg?: number | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "student_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_selected_plan_id_fkey"
            columns: ["selected_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          answers: Json | null
          comment: string | null
          created_at: string | null
          id: string
          ip_address: unknown
          is_anonymous: boolean | null
          rating: number | null
          student_id: string | null
          survey_id: string | null
        }
        Insert: {
          answers?: Json | null
          comment?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          is_anonymous?: boolean | null
          rating?: number | null
          student_id?: string | null
          survey_id?: string | null
        }
        Update: {
          answers?: Json | null
          comment?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          is_anonymous?: boolean | null
          rating?: number | null
          student_id?: string | null
          survey_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          audience: string | null
          audience_filter: Json | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          is_active: boolean | null
          is_recurring: boolean | null
          questions: Json | null
          recurrence_days: number | null
          starts_at: string | null
          survey_type: string
          title: string
          updated_at: string | null
        }
        Insert: {
          audience?: string | null
          audience_filter?: Json | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          questions?: Json | null
          recurrence_days?: number | null
          starts_at?: string | null
          survey_type: string
          title: string
          updated_at?: string | null
        }
        Update: {
          audience?: string | null
          audience_filter?: Json | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          questions?: Json | null
          recurrence_days?: number | null
          starts_at?: string | null
          survey_type?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surveys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      template_workout_exercises: {
        Row: {
          created_at: string | null
          exercise_id: string | null
          exercise_order: number
          id: string
          notes: string | null
          reps: string | null
          rest_seconds: number | null
          sets: number | null
          template_workout_id: string | null
        }
        Insert: {
          created_at?: string | null
          exercise_id?: string | null
          exercise_order: number
          id?: string
          notes?: string | null
          reps?: string | null
          rest_seconds?: number | null
          sets?: number | null
          template_workout_id?: string | null
        }
        Update: {
          created_at?: string | null
          exercise_id?: string | null
          exercise_order?: number
          id?: string
          notes?: string | null
          reps?: string | null
          rest_seconds?: number | null
          sets?: number | null
          template_workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_workout_exercises_template_workout_id_fkey"
            columns: ["template_workout_id"]
            isOneToOne: false
            referencedRelation: "template_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      template_workouts: {
        Row: {
          created_at: string | null
          day_order: number
          focus: string | null
          id: string
          name: string
          notes: string | null
          template_id: string | null
        }
        Insert: {
          created_at?: string | null
          day_order: number
          focus?: string | null
          id?: string
          name: string
          notes?: string | null
          template_id?: string | null
        }
        Update: {
          created_at?: string | null
          day_order?: number
          focus?: string | null
          id?: string
          name?: string
          notes?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_workouts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_assignments_history: {
        Row: {
          assigned_at: string
          changed_by: string | null
          company_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          previous_trainer_id: string | null
          student_id: string
          trainer_id: string | null
          unassigned_at: string | null
        }
        Insert: {
          assigned_at?: string
          changed_by?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          previous_trainer_id?: string | null
          student_id: string
          trainer_id?: string | null
          unassigned_at?: string | null
        }
        Update: {
          assigned_at?: string
          changed_by?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          previous_trainer_id?: string | null
          student_id?: string
          trainer_id?: string | null
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_assignments_history_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_availability: {
        Row: {
          company_id: string | null
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean | null
          location: string | null
          notes: string | null
          slot_duration_min: number | null
          start_time: string
          trainer_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean | null
          location?: string | null
          notes?: string | null
          slot_duration_min?: number | null
          start_time: string
          trainer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          location?: string | null
          notes?: string | null
          slot_duration_min?: number | null
          start_time?: string
          trainer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_availability_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_time_off: {
        Row: {
          company_id: string | null
          created_at: string | null
          end_datetime: string
          id: string
          reason: string | null
          start_datetime: string
          trainer_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          end_datetime: string
          id?: string
          reason?: string | null
          start_datetime: string
          trainer_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          end_datetime?: string
          id?: string
          reason?: string | null
          start_datetime?: string
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_time_off_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      training_cycle_delivery_repair_audit: {
        Row: {
          after_cycles: Json | null
          after_dependencies: Json | null
          after_enrollment: Json | null
          after_sha256: string | null
          after_workouts: Json | null
          applied_at: string
          before_cycles: Json
          before_dependencies: Json | null
          before_enrollment: Json
          before_workouts: Json
          enrollment_id: string
          id: string
          repair_key: string
          rolled_back_at: string | null
          state: string
          superseded_cycle_id: string
          target_cycle_id: string
        }
        Insert: {
          after_cycles?: Json | null
          after_dependencies?: Json | null
          after_enrollment?: Json | null
          after_sha256?: string | null
          after_workouts?: Json | null
          applied_at?: string
          before_cycles: Json
          before_dependencies?: Json | null
          before_enrollment: Json
          before_workouts: Json
          enrollment_id: string
          id?: string
          repair_key: string
          rolled_back_at?: string | null
          state?: string
          superseded_cycle_id: string
          target_cycle_id: string
        }
        Update: {
          after_cycles?: Json | null
          after_dependencies?: Json | null
          after_enrollment?: Json | null
          after_sha256?: string | null
          after_workouts?: Json | null
          applied_at?: string
          before_cycles?: Json
          before_dependencies?: Json | null
          before_enrollment?: Json
          before_workouts?: Json
          enrollment_id?: string
          id?: string
          repair_key?: string
          rolled_back_at?: string | null
          state?: string
          superseded_cycle_id?: string
          target_cycle_id?: string
        }
        Relationships: []
      }
      training_cycle_empty_extra_repair_audit: {
        Row: {
          applied_at: string
          before_cycle: Json
          cycle_id: string
          enrollment_id: string
          id: string
          repair_key: string
          rolled_back_at: string | null
          state: string
        }
        Insert: {
          applied_at?: string
          before_cycle: Json
          cycle_id: string
          enrollment_id: string
          id?: string
          repair_key: string
          rolled_back_at?: string | null
          state?: string
        }
        Update: {
          applied_at?: string
          before_cycle?: Json
          cycle_id?: string
          enrollment_id?: string
          id?: string
          repair_key?: string
          rolled_back_at?: string | null
          state?: string
        }
        Relationships: []
      }
      training_cycle_empty_supersession_audit: {
        Row: {
          applied_at: string
          batch_sha256: string
          before_sha256: string
          before_snapshot: Json
          company_id: string
          covering_cycle_ids: string[]
          covering_snapshots: Json
          enrollment_id: string
          id: string
          post_sha256: string | null
          redundant_cycle_id: string
          rolled_back_at: string | null
          state: string
          student_id: string
        }
        Insert: {
          applied_at?: string
          batch_sha256: string
          before_sha256: string
          before_snapshot: Json
          company_id: string
          covering_cycle_ids: string[]
          covering_snapshots: Json
          enrollment_id: string
          id?: string
          post_sha256?: string | null
          redundant_cycle_id: string
          rolled_back_at?: string | null
          state?: string
          student_id: string
        }
        Update: {
          applied_at?: string
          batch_sha256?: string
          before_sha256?: string
          before_snapshot?: Json
          company_id?: string
          covering_cycle_ids?: string[]
          covering_snapshots?: Json
          enrollment_id?: string
          id?: string
          post_sha256?: string | null
          redundant_cycle_id?: string
          rolled_back_at?: string | null
          state?: string
          student_id?: string
        }
        Relationships: []
      }
      training_cycle_supersession_audit: {
        Row: {
          applied_at: string
          batch_sha256: string
          canonical_cycle_id: string
          canonical_snapshot: Json
          company_id: string
          enrollment_id: string
          exercise_row_count: number
          id: string
          rolled_back_at: string | null
          state: string
          student_id: string
          superseded_cycle_id: string
          superseded_snapshot: Json
          workout_count: number
          workout_ids: string[]
        }
        Insert: {
          applied_at?: string
          batch_sha256: string
          canonical_cycle_id: string
          canonical_snapshot: Json
          company_id: string
          enrollment_id: string
          exercise_row_count: number
          id?: string
          rolled_back_at?: string | null
          state?: string
          student_id: string
          superseded_cycle_id: string
          superseded_snapshot: Json
          workout_count: number
          workout_ids: string[]
        }
        Update: {
          applied_at?: string
          batch_sha256?: string
          canonical_cycle_id?: string
          canonical_snapshot?: Json
          company_id?: string
          enrollment_id?: string
          exercise_row_count?: number
          id?: string
          rolled_back_at?: string | null
          state?: string
          student_id?: string
          superseded_cycle_id?: string
          superseded_snapshot?: Json
          workout_count?: number
          workout_ids?: string[]
        }
        Relationships: []
      }
      training_cycles: {
        Row: {
          anamnese_id: string | null
          bundle_id: string | null
          company_id: string
          created_at: string
          cycle_number: number | null
          delivery_status: string | null
          duration_weeks: number | null
          end_date: string | null
          enrollment_id: string | null
          id: string
          name: string | null
          notes: string | null
          objective: string | null
          prescribed_offline_at: string | null
          prescribed_offline_by: string | null
          prescribed_offline_note: string | null
          start_date: string | null
          status: string | null
          student_id: string
          superseded_at: string | null
          superseded_by: string | null
          superseded_by_cycle_id: string | null
          superseded_previous_status: string | null
          superseded_reason: string | null
          workouts: Json | null
        }
        Insert: {
          anamnese_id?: string | null
          bundle_id?: string | null
          company_id: string
          created_at?: string
          cycle_number?: number | null
          delivery_status?: string | null
          duration_weeks?: number | null
          end_date?: string | null
          enrollment_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          objective?: string | null
          prescribed_offline_at?: string | null
          prescribed_offline_by?: string | null
          prescribed_offline_note?: string | null
          start_date?: string | null
          status?: string | null
          student_id: string
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_by_cycle_id?: string | null
          superseded_previous_status?: string | null
          superseded_reason?: string | null
          workouts?: Json | null
        }
        Update: {
          anamnese_id?: string | null
          bundle_id?: string | null
          company_id?: string
          created_at?: string
          cycle_number?: number | null
          delivery_status?: string | null
          duration_weeks?: number | null
          end_date?: string | null
          enrollment_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          objective?: string | null
          prescribed_offline_at?: string | null
          prescribed_offline_by?: string | null
          prescribed_offline_note?: string | null
          start_date?: string | null
          status?: string | null
          student_id?: string
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_by_cycle_id?: string | null
          superseded_previous_status?: string | null
          superseded_reason?: string | null
          workouts?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "training_cycles_anamnese_id_fkey"
            columns: ["anamnese_id"]
            isOneToOne: false
            referencedRelation: "student_anamneses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_cycles_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "prescription_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_cycles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_cycles_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_cycles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_cycles_superseded_by_cycle_id_fkey"
            columns: ["superseded_by_cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_streaks: {
        Row: {
          current_streak: number | null
          last_workout_date: string | null
          longest_streak: number | null
          student_id: string
          total_points: number | null
          total_workouts: number | null
          updated_at: string | null
        }
        Insert: {
          current_streak?: number | null
          last_workout_date?: string | null
          longest_streak?: number | null
          student_id: string
          total_points?: number | null
          total_workouts?: number | null
          updated_at?: string | null
        }
        Update: {
          current_streak?: number | null
          last_workout_date?: string | null
          longest_streak?: number | null
          student_id?: string
          total_points?: number | null
          total_workouts?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_streaks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      translations: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string | null
          id: string
          key: string
          language: string
          updated_at: string | null
          value: string
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          key: string
          language: string
          updated_at?: string | null
          value: string
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          key?: string
          language?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "translations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      volume_recommendations: {
        Row: {
          created_at: string | null
          id: string
          max_sets: number
          min_sets: number
          muscle_group_name: string
          notes: string | null
          optimal_sets: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          max_sets: number
          min_sets: number
          muscle_group_name: string
          notes?: string | null
          optimal_sets: number
        }
        Update: {
          created_at?: string | null
          id?: string
          max_sets?: number
          min_sets?: number
          muscle_group_name?: string
          notes?: string | null
          optimal_sets?: number
        }
        Relationships: []
      }
      voucher_redemptions: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          id: string
          notes: string | null
          redeemed_at: string | null
          student_id: string | null
          viewed_at: string | null
          voucher_id: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          id?: string
          notes?: string | null
          redeemed_at?: string | null
          student_id?: string | null
          viewed_at?: string | null
          voucher_id?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          id?: string
          notes?: string | null
          redeemed_at?: string | null
          student_id?: string | null
          viewed_at?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          code: string | null
          created_at: string | null
          current_uses: number | null
          description: string | null
          discount_type: string | null
          discount_value: number | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          max_uses: number | null
          max_uses_per_student: number | null
          partner_id: string | null
          redemptions_count: number | null
          terms: string | null
          title: string
          valid_from: string | null
          valid_until: string | null
          views_count: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          max_uses?: number | null
          max_uses_per_student?: number | null
          partner_id?: string | null
          redemptions_count?: number | null
          terms?: string | null
          title: string
          valid_from?: string | null
          valid_until?: string | null
          views_count?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          max_uses?: number | null
          max_uses_per_student?: number | null
          partner_id?: string | null
          redemptions_count?: number | null
          terms?: string | null
          title?: string
          valid_from?: string | null
          valid_until?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_contact_consent_events: {
        Row: {
          actor_user_id: string
          channel: string
          company_id: string
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          policy_version: string
          purpose: string
          source: string
          student_id: string
        }
        Insert: {
          actor_user_id: string
          channel?: string
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          policy_version: string
          purpose?: string
          source: string
          student_id: string
        }
        Update: {
          actor_user_id?: string
          channel?: string
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          policy_version?: string
          purpose?: string
          source?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_contact_consent_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_contact_consent_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_contact_legacy_opt_in_quarantine: {
        Row: {
          company_id: string
          previous_enabled: boolean
          quarantined_at: string
          student_id: string
        }
        Insert: {
          company_id: string
          previous_enabled: boolean
          quarantined_at?: string
          student_id: string
        }
        Update: {
          company_id?: string
          previous_enabled?: boolean
          quarantined_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_contact_legacy_opt_in_quarantine_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_contact_legacy_opt_in_quarantine_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      wearable_consents: {
        Row: {
          company_id: string
          device_id: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          privacy_version: string
          provider: string
          scopes: string[]
          student_id: string
        }
        Insert: {
          company_id: string
          device_id: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          privacy_version: string
          provider: string
          scopes?: string[]
          student_id: string
        }
        Update: {
          company_id?: string
          device_id?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          privacy_version?: string
          provider?: string
          scopes?: string[]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wearable_consents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wearable_consents_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "wearable_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wearable_consents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      wearable_credentials: {
        Row: {
          access_token_ciphertext: string
          access_token_iv: string
          created_at: string
          device_id: string
          key_id: string
          refresh_token_ciphertext: string | null
          refresh_token_iv: string | null
          rotated_at: string
          token_expires_at: string | null
          token_type: string | null
          updated_at: string
          version: number
        }
        Insert: {
          access_token_ciphertext: string
          access_token_iv: string
          created_at?: string
          device_id: string
          key_id: string
          refresh_token_ciphertext?: string | null
          refresh_token_iv?: string | null
          rotated_at?: string
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          access_token_ciphertext?: string
          access_token_iv?: string
          created_at?: string
          device_id?: string
          key_id?: string
          refresh_token_ciphertext?: string | null
          refresh_token_iv?: string | null
          rotated_at?: string
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "wearable_credentials_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "wearable_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      wearable_data: {
        Row: {
          company_id: string
          created_at: string | null
          date: string
          device_id: string | null
          external_id: string | null
          id: string
          metadata: Json | null
          metric: string
          recorded_at: string | null
          score_state: string | null
          source: string | null
          student_id: string | null
          timezone_offset_minutes: number | null
          unit: string | null
          updated_at: string
          value: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          date: string
          device_id?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          metric: string
          recorded_at?: string | null
          score_state?: string | null
          source?: string | null
          student_id?: string | null
          timezone_offset_minutes?: number | null
          unit?: string | null
          updated_at?: string
          value?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          date?: string
          device_id?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          metric?: string
          recorded_at?: string | null
          score_state?: string | null
          source?: string | null
          student_id?: string | null
          timezone_offset_minutes?: number | null
          unit?: string | null
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wearable_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wearable_data_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "wearable_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wearable_data_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      wearable_devices: {
        Row: {
          access_token: string | null
          company_id: string
          connection_status: string
          created_at: string | null
          credential_delete_after: string | null
          device_name: string | null
          external_user_id: string | null
          granted_scopes: string[]
          id: string
          is_active: boolean | null
          last_error: string | null
          last_error_code: string | null
          last_sync_at: string | null
          last_sync_status: string | null
          provider: string
          refresh_token: string | null
          required_scopes: string[]
          revocation_retry_after: string | null
          revocation_status: string | null
          revoked_at: string | null
          student_id: string | null
          sync_metrics: string[] | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          company_id: string
          connection_status?: string
          created_at?: string | null
          credential_delete_after?: string | null
          device_name?: string | null
          external_user_id?: string | null
          granted_scopes?: string[]
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_error_code?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider: string
          refresh_token?: string | null
          required_scopes?: string[]
          revocation_retry_after?: string | null
          revocation_status?: string | null
          revoked_at?: string | null
          student_id?: string | null
          sync_metrics?: string[] | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          company_id?: string
          connection_status?: string
          created_at?: string | null
          credential_delete_after?: string | null
          device_name?: string | null
          external_user_id?: string | null
          granted_scopes?: string[]
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_error_code?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string
          refresh_token?: string | null
          required_scopes?: string[]
          revocation_retry_after?: string | null
          revocation_status?: string | null
          revoked_at?: string | null
          student_id?: string | null
          sync_metrics?: string[] | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wearable_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wearable_devices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      wearable_events: {
        Row: {
          device_id: string | null
          event_id: string
          event_type: string
          occurred_at: string | null
          payload_hash: string
          processed_at: string | null
          provider: string
          received_at: string
        }
        Insert: {
          device_id?: string | null
          event_id: string
          event_type: string
          occurred_at?: string | null
          payload_hash: string
          processed_at?: string | null
          provider: string
          received_at?: string
        }
        Update: {
          device_id?: string | null
          event_id?: string
          event_type?: string
          occurred_at?: string | null
          payload_hash?: string
          processed_at?: string | null
          provider?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wearable_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "wearable_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      wearable_leases: {
        Row: {
          created_at: string
          device_id: string
          holder: string
          locked_until: string
          purpose: string
        }
        Insert: {
          created_at?: string
          device_id: string
          holder: string
          locked_until: string
          purpose: string
        }
        Update: {
          created_at?: string
          device_id?: string
          holder?: string
          locked_until?: string
          purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "wearable_leases_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "wearable_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      wearable_oauth_states: {
        Row: {
          actor_user_id: string | null
          company_id: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          provider: string
          requested_scopes: string[]
          return_url: string | null
          state: string
          student_id: string
        }
        Insert: {
          actor_user_id?: string | null
          company_id?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          provider: string
          requested_scopes?: string[]
          return_url?: string | null
          state: string
          student_id: string
        }
        Update: {
          actor_user_id?: string | null
          company_id?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          provider?: string
          requested_scopes?: string[]
          return_url?: string | null
          state?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wearable_oauth_states_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wearable_oauth_states_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      wearable_sync_cursors: {
        Row: {
          cursor: string | null
          device_id: string
          last_success_at: string | null
          resource: string
          updated_at: string
          watermark: string | null
        }
        Insert: {
          cursor?: string | null
          device_id: string
          last_success_at?: string | null
          resource: string
          updated_at?: string
          watermark?: string | null
        }
        Update: {
          cursor?: string | null
          device_id?: string
          last_success_at?: string | null
          resource?: string
          updated_at?: string
          watermark?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wearable_sync_cursors_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "wearable_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      wearable_workouts: {
        Row: {
          activity_type: string | null
          avg_heart_rate: number | null
          avg_pace: string | null
          calories: number | null
          company_id: string
          created_at: string | null
          device_id: string | null
          distance_km: number | null
          duration_min: number | null
          elevation_gain_m: number | null
          ended_at: string | null
          external_id: string | null
          id: string
          linked_workout_session_id: string | null
          local_date: string
          max_heart_rate: number | null
          metadata: Json | null
          source: string | null
          started_at: string
          strain: number | null
          student_id: string | null
          timezone_offset_minutes: number | null
          updated_at: string
        }
        Insert: {
          activity_type?: string | null
          avg_heart_rate?: number | null
          avg_pace?: string | null
          calories?: number | null
          company_id: string
          created_at?: string | null
          device_id?: string | null
          distance_km?: number | null
          duration_min?: number | null
          elevation_gain_m?: number | null
          ended_at?: string | null
          external_id?: string | null
          id?: string
          linked_workout_session_id?: string | null
          local_date: string
          max_heart_rate?: number | null
          metadata?: Json | null
          source?: string | null
          started_at: string
          strain?: number | null
          student_id?: string | null
          timezone_offset_minutes?: number | null
          updated_at?: string
        }
        Update: {
          activity_type?: string | null
          avg_heart_rate?: number | null
          avg_pace?: string | null
          calories?: number | null
          company_id?: string
          created_at?: string | null
          device_id?: string | null
          distance_km?: number | null
          duration_min?: number | null
          elevation_gain_m?: number | null
          ended_at?: string | null
          external_id?: string | null
          id?: string
          linked_workout_session_id?: string | null
          local_date?: string
          max_heart_rate?: number | null
          metadata?: Json | null
          source?: string | null
          started_at?: string
          strain?: number | null
          student_id?: string | null
          timezone_offset_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wearable_workouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wearable_workouts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "wearable_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wearable_workouts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_chat_labels: {
        Row: {
          chat_id: string
          id: string
          label_id: string
        }
        Insert: {
          chat_id: string
          id?: string
          label_id: string
        }
        Update: {
          chat_id?: string
          id?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_chat_labels_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_chat_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_labels"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_chats: {
        Row: {
          cadence_muted: boolean
          category: string | null
          company_id: string
          contact_name: string | null
          contact_photo: string | null
          created_at: string
          history_synced_at: string | null
          id: string
          instance_id: string | null
          is_archived: boolean | null
          last_message: string | null
          last_message_at: string | null
          last_sender_id: string | null
          remote_jid: string
          student_id: string | null
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          cadence_muted?: boolean
          category?: string | null
          company_id: string
          contact_name?: string | null
          contact_photo?: string | null
          created_at?: string
          history_synced_at?: string | null
          id?: string
          instance_id?: string | null
          is_archived?: boolean | null
          last_message?: string | null
          last_message_at?: string | null
          last_sender_id?: string | null
          remote_jid: string
          student_id?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          cadence_muted?: boolean
          category?: string | null
          company_id?: string
          contact_name?: string | null
          contact_photo?: string | null
          created_at?: string
          history_synced_at?: string | null
          id?: string
          instance_id?: string | null
          is_archived?: boolean | null
          last_message?: string | null
          last_message_at?: string | null
          last_sender_id?: string | null
          remote_jid?: string
          student_id?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_chats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_chats_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_chats_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_identity_repairs: {
        Row: {
          canonical_chat_id: string
          company_id: string
          created_at: string
          duplicate_chat_id: string
          duplicate_chat_snapshot: Json
          id: string
          moved_message_ids: string[]
          previous_whatsapp: string | null
          repaired_whatsapp: string
          student_id: string
        }
        Insert: {
          canonical_chat_id: string
          company_id: string
          created_at?: string
          duplicate_chat_id: string
          duplicate_chat_snapshot: Json
          id?: string
          moved_message_ids?: string[]
          previous_whatsapp?: string | null
          repaired_whatsapp: string
          student_id: string
        }
        Update: {
          canonical_chat_id?: string
          company_id?: string
          created_at?: string
          duplicate_chat_id?: string
          duplicate_chat_snapshot?: Json
          id?: string
          moved_message_ids?: string[]
          previous_whatsapp?: string | null
          repaired_whatsapp?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_identity_repairs_canonical_chat_id_fkey"
            columns: ["canonical_chat_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_identity_repairs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_identity_repairs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          company_id: string
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string
          phone_number: string | null
          qr_code: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name: string
          phone_number?: string | null
          qr_code?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string
          phone_number?: string | null
          qr_code?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_jid_aliases: {
        Row: {
          alias_jid: string
          canonical_chat_id: string
          company_id: string
          created_at: string
          id: string
          instance_id: string
          updated_at: string
        }
        Insert: {
          alias_jid: string
          canonical_chat_id: string
          company_id: string
          created_at?: string
          id?: string
          instance_id: string
          updated_at?: string
        }
        Update: {
          alias_jid?: string
          canonical_chat_id?: string
          company_id?: string
          created_at?: string
          id?: string
          instance_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_jid_aliases_canonical_chat_id_fkey"
            columns: ["canonical_chat_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_jid_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_jid_aliases_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_labels: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_labels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          chat_id: string
          company_id: string | null
          content: string | null
          created_at: string
          delivered_at: string | null
          edited_at: string | null
          edited_by: string | null
          failed_at: string | null
          id: string
          is_from_me: boolean | null
          media_storage_path: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_id_external: string | null
          origin: string
          provider_status: string | null
          provider_status_at: string | null
          quoted_message_external_id: string | null
          quoted_message_id: string | null
          quoted_message_preview: string | null
          quoted_message_source: string | null
          read_at: string | null
          sender_id: string | null
          source: string | null
          status: string | null
          timestamp: string | null
          type: string | null
        }
        Insert: {
          chat_id: string
          company_id?: string | null
          content?: string | null
          created_at?: string
          delivered_at?: string | null
          edited_at?: string | null
          edited_by?: string | null
          failed_at?: string | null
          id?: string
          is_from_me?: boolean | null
          media_storage_path?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_id_external?: string | null
          origin?: string
          provider_status?: string | null
          provider_status_at?: string | null
          quoted_message_external_id?: string | null
          quoted_message_id?: string | null
          quoted_message_preview?: string | null
          quoted_message_source?: string | null
          read_at?: string | null
          sender_id?: string | null
          source?: string | null
          status?: string | null
          timestamp?: string | null
          type?: string | null
        }
        Update: {
          chat_id?: string
          company_id?: string | null
          content?: string | null
          created_at?: string
          delivered_at?: string | null
          edited_at?: string | null
          edited_by?: string | null
          failed_at?: string | null
          id?: string
          is_from_me?: boolean | null
          media_storage_path?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_id_external?: string | null
          origin?: string
          provider_status?: string | null
          provider_status_at?: string | null
          quoted_message_external_id?: string | null
          quoted_message_id?: string | null
          quoted_message_preview?: string | null
          quoted_message_source?: string | null
          read_at?: string | null
          sender_id?: string | null
          source?: string | null
          status?: string | null
          timestamp?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_quoted_message_id_fkey"
            columns: ["quoted_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_adjustments: {
        Row: {
          applied_at: string | null
          avg_rpe: number | null
          completion_rate: number | null
          confidence: string | null
          created_at: string | null
          current_load: number | null
          current_reps: string | null
          id: string
          reasoning: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sessions_analyzed: number | null
          status: string | null
          student_id: string | null
          student_seen: boolean | null
          suggested_load: number | null
          suggested_reps: string | null
          trainer_seen: boolean | null
          workout_exercise_id: string | null
        }
        Insert: {
          applied_at?: string | null
          avg_rpe?: number | null
          completion_rate?: number | null
          confidence?: string | null
          created_at?: string | null
          current_load?: number | null
          current_reps?: string | null
          id?: string
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sessions_analyzed?: number | null
          status?: string | null
          student_id?: string | null
          student_seen?: boolean | null
          suggested_load?: number | null
          suggested_reps?: string | null
          trainer_seen?: boolean | null
          workout_exercise_id?: string | null
        }
        Update: {
          applied_at?: string | null
          avg_rpe?: number | null
          completion_rate?: number | null
          confidence?: string | null
          created_at?: string | null
          current_load?: number | null
          current_reps?: string | null
          id?: string
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sessions_analyzed?: number | null
          status?: string | null
          student_id?: string | null
          student_seen?: boolean | null
          suggested_load?: number | null
          suggested_reps?: string | null
          trainer_seen?: boolean | null
          workout_exercise_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_adjustments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_adjustments_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_archive_events: {
        Row: {
          action: string
          actor_id: string
          company_id: string
          created_at: string
          cycle_id: string
          id: string
          previous_superseded_at: string | null
          previous_superseded_reason: string | null
          reason: string | null
          student_id: string
          workout_id: string
          workout_snapshot: Json
        }
        Insert: {
          action: string
          actor_id: string
          company_id: string
          created_at?: string
          cycle_id: string
          id?: string
          previous_superseded_at?: string | null
          previous_superseded_reason?: string | null
          reason?: string | null
          student_id: string
          workout_id: string
          workout_snapshot: Json
        }
        Update: {
          action?: string
          actor_id?: string
          company_id?: string
          created_at?: string
          cycle_id?: string
          id?: string
          previous_superseded_at?: string | null
          previous_superseded_reason?: string | null
          reason?: string | null
          student_id?: string
          workout_id?: string
          workout_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workout_archive_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_archive_events_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_archive_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_archive_events_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercise_ref_repair_audit: {
        Row: {
          applied_at: string
          before_exercise: Json
          exercise_index: number
          exercise_name: string
          id: string
          new_exercise_id: string
          old_exercise_id: string | null
          repair_key: string
          rolled_back_at: string | null
          state: string
          workout_id: string
        }
        Insert: {
          applied_at?: string
          before_exercise: Json
          exercise_index: number
          exercise_name: string
          id?: string
          new_exercise_id: string
          old_exercise_id?: string | null
          repair_key: string
          rolled_back_at?: string | null
          state?: string
          workout_id: string
        }
        Update: {
          applied_at?: string
          before_exercise?: Json
          exercise_index?: number
          exercise_name?: string
          id?: string
          new_exercise_id?: string
          old_exercise_id?: string | null
          repair_key?: string
          rolled_back_at?: string | null
          state?: string
          workout_id?: string
        }
        Relationships: []
      }
      workout_exercises: {
        Row: {
          created_at: string | null
          exercise_id: string | null
          exercise_name: string | null
          exercise_order: number | null
          id: string
          notes: string | null
          reps: string | null
          rest_seconds: number | null
          sets: number | null
          workout_id: string
        }
        Insert: {
          created_at?: string | null
          exercise_id?: string | null
          exercise_name?: string | null
          exercise_order?: number | null
          id?: string
          notes?: string | null
          reps?: string | null
          rest_seconds?: number | null
          sets?: number | null
          workout_id: string
        }
        Update: {
          created_at?: string | null
          exercise_id?: string | null
          exercise_name?: string | null
          exercise_order?: number | null
          id?: string
          notes?: string | null
          reps?: string | null
          rest_seconds?: number | null
          sets?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_feedback: {
        Row: {
          company_id: string
          created_at: string
          difficulty: number | null
          energy: number | null
          id: string
          notes: string | null
          pain_areas: Json
          read_at: string | null
          student_id: string
          trainer_replied_at: string | null
          trainer_replied_by: string | null
          trainer_reply: string | null
          trainer_reply_author_name: string | null
          workout_session_id: string | null
          workout_title: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          difficulty?: number | null
          energy?: number | null
          id?: string
          notes?: string | null
          pain_areas?: Json
          read_at?: string | null
          student_id: string
          trainer_replied_at?: string | null
          trainer_replied_by?: string | null
          trainer_reply?: string | null
          trainer_reply_author_name?: string | null
          workout_session_id?: string | null
          workout_title?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          difficulty?: number | null
          energy?: number | null
          id?: string
          notes?: string | null
          pain_areas?: Json
          read_at?: string | null
          student_id?: string
          trainer_replied_at?: string | null
          trainer_replied_by?: string | null
          trainer_reply?: string | null
          trainer_reply_author_name?: string | null
          workout_session_id?: string | null
          workout_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_feedback_workout_session_id_fkey"
            columns: ["workout_session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string
          duration_minutes: number | null
          exercise_index: number | null
          exercises_data: Json | null
          id: string
          notes: string | null
          reps_done: number | null
          revision: number
          rpe: number | null
          session_date: string | null
          set_number: number | null
          set_type: string | null
          student_id: string
          updated_at: string
          weight: number | null
          workout_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          exercise_index?: number | null
          exercises_data?: Json | null
          id?: string
          notes?: string | null
          reps_done?: number | null
          revision?: number
          rpe?: number | null
          session_date?: string | null
          set_number?: number | null
          set_type?: string | null
          student_id: string
          updated_at?: string
          weight?: number | null
          workout_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          exercise_index?: number | null
          exercises_data?: Json | null
          id?: string
          notes?: string | null
          reps_done?: number | null
          revision?: number
          rpe?: number | null
          session_date?: string | null
          set_number?: number | null
          set_type?: string | null
          student_id?: string
          updated_at?: string
          weight?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_revision_repair_audit: {
        Row: {
          before_row: Json
          before_sha256: string
          cycle_id: string
          id: string
          repair_key: string
          repaired_at: string
          workout_id: string
        }
        Insert: {
          before_row: Json
          before_sha256: string
          cycle_id: string
          id?: string
          repair_key: string
          repaired_at?: string
          workout_id: string
        }
        Update: {
          before_row?: Json
          before_sha256?: string
          cycle_id?: string
          id?: string
          repair_key?: string
          repaired_at?: string
          workout_id?: string
        }
        Relationships: []
      }
      workout_sessions: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          duration_seconds: number | null
          exercises_summary: Json | null
          id: string
          notes: string | null
          session_date: string | null
          started_at: string | null
          status: string | null
          student_id: string
          total_sets_completed: number | null
          total_sets_prescribed: number | null
          total_volume: number | null
          workout_id: string | null
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          exercises_summary?: Json | null
          id?: string
          notes?: string | null
          session_date?: string | null
          started_at?: string | null
          status?: string | null
          student_id: string
          total_sets_completed?: number | null
          total_sets_prescribed?: number | null
          total_volume?: number | null
          workout_id?: string | null
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          exercises_summary?: Json | null
          id?: string
          notes?: string | null
          session_date?: string | null
          started_at?: string | null
          status?: string | null
          student_id?: string
          total_sets_completed?: number | null
          total_sets_prescribed?: number | null
          total_volume?: number | null
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          days_per_week: number | null
          description: string | null
          focus: string | null
          goal: string | null
          id: string
          is_official: boolean | null
          is_public: boolean | null
          level: string | null
          name: string
          rating: number | null
          split_type: string | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          uses_count: number | null
          weeks_duration: number | null
          workouts: Json
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_per_week?: number | null
          description?: string | null
          focus?: string | null
          goal?: string | null
          id?: string
          is_official?: boolean | null
          is_public?: boolean | null
          level?: string | null
          name: string
          rating?: number | null
          split_type?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          uses_count?: number | null
          weeks_duration?: number | null
          workouts?: Json
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_per_week?: number | null
          description?: string | null
          focus?: string | null
          goal?: string | null
          id?: string
          is_official?: boolean | null
          is_public?: boolean | null
          level?: string | null
          name?: string
          rating?: number | null
          split_type?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          uses_count?: number | null
          weeks_duration?: number | null
          workouts?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workout_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          cycle_id: string
          day_of_week: number | null
          description: string | null
          exercises: Json | null
          id: string
          name: string
          notes: string | null
          revision_id: string | null
          sort_order: number | null
          student_profile_archive_event_id: string | null
          superseded_at: string | null
          superseded_by_revision_id: string | null
          superseded_reason: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          cycle_id: string
          day_of_week?: number | null
          description?: string | null
          exercises?: Json | null
          id?: string
          name?: string
          notes?: string | null
          revision_id?: string | null
          sort_order?: number | null
          student_profile_archive_event_id?: string | null
          superseded_at?: string | null
          superseded_by_revision_id?: string | null
          superseded_reason?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          cycle_id?: string
          day_of_week?: number | null
          description?: string | null
          exercises?: Json | null
          id?: string
          name?: string
          notes?: string | null
          revision_id?: string | null
          sort_order?: number | null
          student_profile_archive_event_id?: string | null
          superseded_at?: string | null
          superseded_by_revision_id?: string | null
          superseded_reason?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_student_profile_archive_event_id_fkey"
            columns: ["student_profile_archive_event_id"]
            isOneToOne: false
            referencedRelation: "workout_archive_events"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          notes: string | null
          source_id: string | null
          student_id: string
          xp_amount: number
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          notes?: string | null
          source_id?: string | null
          student_id: string
          xp_amount: number
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          notes?: string | null
          source_id?: string | null
          student_id?: string
          xp_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "xp_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xp_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_settings: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          weekly_extra_day_xp: number
          weekly_goal_met_xp: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          weekly_extra_day_xp?: number
          weekly_goal_met_xp?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          weekly_extra_day_xp?: number
          weekly_goal_met_xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "xp_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      workout_exercise_entries: {
        Row: {
          direct_muscle_group: string | null
          exercise_id: string | null
          exercise_name: string | null
          exercise_order: number | null
          sets: number | null
          workout_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_wearable_lease: {
        Args: {
          p_device_id: string
          p_holder: string
          p_purpose: string
          p_ttl_seconds?: number
        }
        Returns: boolean
      }
      add_challenge_score: {
        Args: {
          p_challenge_id: string
          p_points: number
          p_reason?: string
          p_source_id?: string
          p_source_type?: string
          p_student_id: string
        }
        Returns: boolean
      }
      advance_training_cycles: { Args: never; Returns: undefined }
      apply_adjustment: { Args: { p_adjustment_id: string }; Returns: boolean }
      apply_paid_payment_lifecycle: {
        Args: {
          _asaas_payment_id: string
          _assessment_due_date: string
          _business_date: string
          _company_id: string
          _plan_id: string
          _student_id: string
        }
        Returns: {
          already_applied: boolean
          enrollment_id: string
          first_activation: boolean
        }[]
      }
      apply_template_to_student: {
        Args: {
          p_cycle_name?: string
          p_student_id: string
          p_template_id: string
        }
        Returns: string
      }
      apply_workout_template_to_current_cycle: {
        Args: {
          p_company_id: string
          p_created_by?: string
          p_duration_weeks?: number
          p_student_id: string
          p_template_id: string
        }
        Returns: {
          cycle_id: string
          enrollment_id: string
          workouts_created: number
        }[]
      }
      archive_student_workout: {
        Args: {
          p_cycle_id: string
          p_reason?: string
          p_student_id: string
          p_workout_id: string
        }
        Returns: Json
      }
      award_weekly_consistency: {
        Args: { _week_start?: string }
        Returns: {
          company_id: string
          student_id: string
          trained_days: number
          week_start: string
          weekly_goal: number
          xp_awarded: number
          xp_event_id: string
        }[]
      }
      award_xp: {
        Args: {
          _event_type: string
          _notes?: string
          _source_id?: string
          _student_id: string
          _xp_amount: number
        }
        Returns: string
      }
      begin_wearable_sync: {
        Args: {
          p_actor_user_id: string
          p_device_id: string
          p_holder: string
          p_student_id: string
        }
        Returns: Json
      }
      can_manage_staff_student: {
        Args: { _company_id: string; _student_id: string }
        Returns: boolean
      }
      can_read_staff_student: {
        Args: { _company_id: string; _student_id: string }
        Returns: boolean
      }
      cancel_redemption: {
        Args: { p_redemption_id: string; p_refund?: boolean }
        Returns: boolean
      }
      canonical_volume_muscle_group: {
        Args: { p_group: string }
        Returns: string
      }
      check_and_unlock_achievements: {
        Args: { _student_id: string }
        Returns: number
      }
      claim_automation_sessions: {
        Args: { _limit?: number }
        Returns: {
          chat_id: string | null
          context: Json | null
          created_at: string
          current_node_id: string | null
          flow_id: string
          id: string
          last_activity_at: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "flow_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_intercycle_anamnesis_deliveries: {
        Args: { _limit?: number }
        Returns: {
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          created_at: string
          enrollment_id: string
          id: string
          idempotency_key: string
          last_error_code: string | null
          next_attempt_at: string | null
          reopened_at: string | null
          reopened_by: string | null
          responded_at: string | null
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: string
          student_id: string
          training_cycle_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "intercycle_anamnesis_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      classify_influencer_student: {
        Args: { _plan_id: string; _student_id: string }
        Returns: {
          category_id: string
          plan_id: string
          status: string
          student_id: string
        }[]
      }
      cohort_feedback_summary: {
        Args: { _company_id: string }
        Returns: {
          alunos: number
          bucket: string
          media_nps: number
          pct_ajuste: number
        }[]
      }
      commit_wearable_connection: {
        Args: {
          p_access_ciphertext: string
          p_access_iv: string
          p_actor_user_id: string
          p_company_id: string
          p_device_id: string
          p_external_user_id: string
          p_granted_scopes: string[]
          p_key_id: string
          p_privacy_version: string
          p_provider: string
          p_refresh_ciphertext: string
          p_refresh_iv: string
          p_required_scopes: string[]
          p_student_id: string
          p_token_expires_at: string
          p_token_type: string
        }
        Returns: string
      }
      commit_wearable_sync: {
        Args: {
          p_actor_user_id: string
          p_completed_at: string
          p_device_id: string
          p_expected_company_id: string
          p_holder: string
          p_metrics: Json
          p_student_id: string
          p_watermarks: Json
          p_workouts: Json
        }
        Returns: number
      }
      commit_whatsapp_message_edit: {
        Args: {
          _chat_id: string
          _company_id: string
          _content: string
          _edited_by: string
          _message_external_id: string
        }
        Returns: {
          chat_id: string
          company_id: string | null
          content: string | null
          created_at: string
          delivered_at: string | null
          edited_at: string | null
          edited_by: string | null
          failed_at: string | null
          id: string
          is_from_me: boolean | null
          media_storage_path: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_id_external: string | null
          origin: string
          provider_status: string | null
          provider_status_at: string | null
          quoted_message_external_id: string | null
          quoted_message_id: string | null
          quoted_message_preview: string | null
          quoted_message_source: string | null
          read_at: string | null
          sender_id: string | null
          source: string | null
          status: string | null
          timestamp: string | null
          type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_wearable_disconnect: {
        Args: {
          p_actor_user_id: string
          p_device_id: string
          p_error_code: string
          p_holder: string
          p_privacy_version: string
          p_revocation_succeeded: boolean
          p_student_id: string
        }
        Returns: string
      }
      consume_wearable_oauth_state: { Args: { p_state: string }; Returns: Json }
      contact_cadence: {
        Args: { _company_id: string }
        Returns: {
          chat_id: string
          contact_name: string
          hours_since: number
          kind: string
          last_inbound_at: string
          student_id: string
          student_name: string
          student_status: string
        }[]
      }
      current_business_date: { Args: never; Returns: string }
      delete_wearable_provider_data: {
        Args: {
          p_actor_user_id: string
          p_device_id: string
          p_holder: string
          p_privacy_version: string
          p_student_id: string
        }
        Returns: number
      }
      fail_wearable_sync: {
        Args: {
          p_actor_user_id: string
          p_device_id: string
          p_error_code: string
          p_expected_company_id: string
          p_holder: string
          p_status: string
          p_student_id: string
        }
        Returns: boolean
      }
      generate_referral_code: { Args: { p_full_name: string }; Returns: string }
      get_active_platform_ads: {
        Args: {
          _audience: string
          _company_id_hint?: string
          _placement: string
        }
        Returns: {
          body: string
          cta_label: string
          cta_url: string
          id: string
          image_url: string
          placement: string
          title: string
        }[]
      }
      get_active_vouchers: {
        Args: { p_student_id: string }
        Returns: {
          code: string
          description: string
          discount_type: string
          discount_value: number
          is_featured: boolean
          partner_category: string
          partner_id: string
          partner_logo: string
          partner_name: string
          redemptions_count: number
          terms: string
          title: string
          user_redeemed: boolean
          valid_until: string
          voucher_id: string
        }[]
      }
      get_adjustments_summary: {
        Args: { p_company_id: string }
        Returns: {
          by_confidence: Json
          by_student: Json
          total_pending: number
        }[]
      }
      get_analyses_summary: {
        Args: { p_company_id: string }
        Returns: {
          avg_score: number
          high_risk_count: number
          pending_review: number
          total: number
        }[]
      }
      get_app_performance_percentiles: {
        Args: { p_company_id?: string; p_days?: number }
        Returns: {
          metric: string
          p50_ms: number
          p75_ms: number
          p95_ms: number
          route_group: string
          samples: number
        }[]
      }
      get_automation_start_node: { Args: { _flow_id: string }; Returns: string }
      get_available_slots: {
        Args: { p_date_end: string; p_date_start: string; p_trainer_id: string }
        Returns: {
          location: string
          slot_end: string
          slot_start: string
        }[]
      }
      get_body_composition_history: {
        Args: { p_limit?: number; p_student_id: string }
        Returns: {
          bmi: number
          body_fat_percent: number
          delta_fat: number
          delta_weight: number
          fat_mass_kg: number
          id: string
          lean_mass_kg: number
          measured_at: string
          measurement_chest: number
          measurement_waist: number
          weight_kg: number
        }[]
      }
      get_challenge_leaderboard: {
        Args: { p_challenge_id: string }
        Returns: {
          current_score: number
          joined_at: string
          rank: number
          student_id: string
          student_name: string
        }[]
      }
      get_community_feed: {
        Args: { p_limit?: number; p_offset?: number; p_student_id: string }
        Returns: {
          author_name: string
          author_student_id: string
          comments_count: number
          content: string
          created_at: string
          id: string
          image_url: string
          is_pinned: boolean
          likes_count: number
          post_type: string
          user_liked: boolean
        }[]
      }
      get_company_ai_identity: {
        Args: { _company_id: string }
        Returns: {
          assistant_name: string
          consultancy_name: string
        }[]
      }
      get_company_branding: {
        Args: { p_company_id?: string; p_domain?: string }
        Returns: {
          brand_settings: Json
          company_id: string
          display_name: string
          favicon_url: string
          logo_url: string
          name: string
          tagline: string
        }[]
      }
      get_company_overview: {
        Args: { p_company_id: string }
        Returns: {
          active_students: number
          churned_this_month: number
          inactive_students: number
          mrr: number
          new_students_last_month: number
          new_students_this_month: number
          overdue_payments: number
          pending_payments: number
          total_students: number
          trial_students: number
        }[]
      }
      get_content_feed: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_student_id: string
        }
        Returns: {
          category: string
          content_type: string
          cover_image_url: string
          difficulty: string
          excerpt: string
          id: string
          is_featured: boolean
          likes_count: number
          published_at: string
          reading_time_min: number
          tags: string[]
          title: string
          user_liked: boolean
          user_saved: boolean
          user_viewed: boolean
          video_duration_min: number
          views_count: number
        }[]
      }
      get_effective_exercise_targets: {
        Args: { p_exercise_ids: string[]; p_student_id: string }
        Returns: {
          exercise_id: string
          is_primary: boolean
          muscle_group_id: string
          muscle_group_name: string
          role: string
          volume_percentage: number
        }[]
      }
      get_inadimplencia: {
        Args: { p_company_id: string }
        Returns: {
          amount: number
          days_overdue: number
          due_date: string
          plan_name: string
          student_id: string
          student_name: string
        }[]
      }
      get_injury_stats: {
        Args: { p_company_id: string }
        Returns: {
          avg_resolution_days: number
          high_severity_count: number
          pending_count: number
          resolved_last_30d: number
          top_region: string
          total_reports: number
        }[]
      }
      get_leaderboard: {
        Args: { p_company_id: string; p_limit?: number }
        Returns: {
          badges_count: number
          current_streak: number
          rank: number
          student_id: string
          student_name: string
          total_points: number
        }[]
      }
      get_load_progression: {
        Args: { p_months?: number; p_student_id: string }
        Returns: {
          estimated_1rm: number
          exercise_name: string
          max_load: number
          max_reps: number
          month_start: string
        }[]
      }
      get_marketplace_templates: {
        Args: { p_category?: string; p_limit?: number }
        Returns: {
          avg_rating: number
          category: string
          cover_image_url: string
          days_per_week: number
          description: string
          difficulty: string
          duration_weeks: number
          name: string
          price_cents: number
          seller_name: string
          template_id: string
          total_reviews: number
          total_sales: number
        }[]
      }
      get_meal_adherence: {
        Args: { p_days?: number; p_student_id: string }
        Returns: {
          adherence_pct: number
          followed_pct: number
          total_followed: number
          total_logged: number
          total_prescribed: number
        }[]
      }
      get_mobility_programs_for_student: {
        Args: { p_student_id: string }
        Returns: {
          cover_image_url: string
          description: string
          duration_min: number
          exercises_count: number
          goal: string
          name: string
          program_id: string
          region: string
          times_completed: number
        }[]
      }
      get_monthly_growth: {
        Args: { p_company_id: string; p_months?: number }
        Returns: {
          active_students: number
          churned: number
          month_start: string
          mrr_at_end: number
          new_students: number
        }[]
      }
      get_monthly_leaderboard: {
        Args: { _company_id: string; _month?: string }
        Returns: {
          caller: Json
          top3: Json
        }[]
      }
      get_monthly_volume: {
        Args: { p_months?: number; p_student_id: string }
        Returns: {
          month_start: string
          sessions_count: number
          total_sets: number
          total_volume: number
        }[]
      }
      get_nps_score: {
        Args: { p_survey_id: string }
        Returns: {
          avg_rating: number
          detractors: number
          nps_score: number
          passives: number
          promoters: number
          total_responses: number
        }[]
      }
      get_personal_records: {
        Args: { p_student_id: string }
        Returns: {
          achieved_at: string
          estimated_1rm: number
          exercise_name: string
          max_load: number
          reps_at_max: number
        }[]
      }
      get_pipeline_stats: {
        Args: { p_company_id: string; p_days?: number }
        Returns: {
          avg_days_to_close: number
          by_source: Json
          closed: number
          conversion_rate: number
          in_pipeline: number
          lost: number
          new_leads: number
          total_leads: number
        }[]
      }
      get_referral_stats: {
        Args: { p_student_id: string }
        Returns: {
          converted_count: number
          pending_count: number
          rewarded_count: number
          total_referred: number
          total_rewards_value: number
        }[]
      }
      get_revenue_breakdown: {
        Args: { p_company_id: string; p_months?: number }
        Returns: {
          active_subscribers: number
          monthly_revenue: number
          plan_name: string
        }[]
      }
      get_shop_items_for_student: {
        Args: { p_student_id: string }
        Returns: {
          can_redeem: boolean
          cash_value: number
          category: string
          current_redemptions: number
          description: string
          image_url: string
          is_featured: boolean
          item_id: string
          name: string
          points_cost: number
          reason_blocked: string
          stock: number
        }[]
      }
      get_student_active_challenges: {
        Args: { p_student_id: string }
        Returns: {
          challenge_id: string
          challenge_type: string
          cover_image_url: string
          days_remaining: number
          description: string
          emoji: string
          ends_at: string
          goal_value: number
          is_joined: boolean
          my_rank: number
          my_score: number
          name: string
          prize_description: string
          starts_at: string
          total_participants: number
        }[]
      }
      get_student_gamification: {
        Args: { p_student_id: string }
        Returns: {
          current_streak: number
          longest_streak: number
          rank_in_company: number
          total_badges: number
          total_points: number
          total_workouts: number
        }[]
      }
      get_student_rank: {
        Args: { _student_id: string }
        Returns: {
          rank_position: number
          total_students: number
          xp: number
        }[]
      }
      get_students_with_active_injuries: {
        Args: { p_company_id: string }
        Returns: {
          injury_count: number
          last_report_date: string
          max_severity: number
          student_id: string
          student_name: string
        }[]
      }
      get_surveys_to_answer: {
        Args: { p_student_id: string }
        Returns: {
          description: string
          ends_at: string
          questions: Json
          survey_id: string
          survey_type: string
          title: string
        }[]
      }
      get_training_frequency: {
        Args: { p_months?: number; p_student_id: string }
        Returns: {
          sessions_count: number
          week_start: string
        }[]
      }
      get_translations: {
        Args: { p_company_id?: string; p_language: string }
        Returns: {
          key: string
          value: string
        }[]
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_voucher_stats: {
        Args: { p_company_id: string }
        Returns: {
          active_partners: number
          active_vouchers: number
          total_partners: number
          total_redemptions: number
          total_vouchers: number
          unique_students_redeemed: number
        }[]
      }
      get_wearable_summary: {
        Args: { p_days?: number; p_student_id: string }
        Returns: {
          avg_value: number
          days_with_data: number
          max_value: number
          metric: string
          min_value: number
          total_value: number
          trend: number
        }[]
      }
      get_wearable_timeseries: {
        Args: { p_days?: number; p_metric: string; p_student_id: string }
        Returns: {
          date: string
          value: number
        }[]
      }
      get_weekly_volume: {
        Args: { p_student_id: string }
        Returns: {
          effective_sets: number
          max_recommended: number
          min_recommended: number
          muscle_group: string
          optimal_recommended: number
          primary_sets: number
          secondary_sets: number
          status: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_staff_permission: {
        Args: { _company_id: string; _permission: string }
        Returns: boolean
      }
      is_company_staff: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_student_company_staff: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      mark_payment_recovery_abandoned: { Args: never; Returns: number }
      mark_training_cycle_viewed: {
        Args: { _cycle_id: string }
        Returns: boolean
      }
      move_student_to_assessment_stage: {
        Args: { _reason: string; _student_id: string }
        Returns: Json
      }
      next_cycle_recommendation: {
        Args: { _student_id: string }
        Returns: {
          nps: number
          recommendation: string
          reduce_volume: boolean
          wants_adjustment: boolean
        }[]
      }
      private_display_name: { Args: { _full_name: string }; Returns: string }
      process_automation_triggers: { Args: never; Returns: Json }
      process_enrollment_lifecycle: { Args: never; Returns: undefined }
      process_intercycle_anamnesis_schedule: { Args: never; Returns: number }
      queue_notification: {
        Args: {
          p_body: string
          p_data?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      recalculate_training_cycles: {
        Args: { p_enrollment_id: string; p_new_start_date: string }
        Returns: undefined
      }
      record_app_performance_sample: {
        Args: {
          p_company_id?: string
          p_duration_ms: number
          p_effective_type?: string
          p_metric: string
          p_navigation_type?: string
          p_route_group: string
          p_viewport_bucket?: string
        }
        Returns: undefined
      }
      record_intercycle_anamnesis_waiver: {
        Args: {
          _company_id: string
          _enrollment_id: string
          _prior_cycle_id: string
          _reason: string
          _student_id: string
          _training_cycle_id: string
        }
        Returns: {
          company_id: string
          enrollment_id: string
          id: string
          prior_cycle_id: string
          reason: string
          student_id: string
          training_cycle_id: string
          waived_at: string
          waived_by: string
        }
        SetofOptions: {
          from: "*"
          to: "intercycle_anamnesis_waivers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_weekly_contact_consent: {
        Args: {
          _event_type: string
          _policy_version: string
          _source: string
          _student_id: string
        }
        Returns: Database["public"]["Tables"]["weekly_contact_consent_events"]["Row"]
        SetofOptions: {
          from: "*"
          to: "weekly_contact_consent_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_payment_recovery_event: {
        Args: {
          _enrollment_id?: string
          _event_type: string
          _metadata?: Json
          _payment_id?: string
          _plan_id?: string
          _source?: string
          _student_id: string
        }
        Returns: string
      }
      redeem_shop_item: {
        Args: { p_item_id: string; p_student_id: string }
        Returns: string
      }
      redeem_voucher: {
        Args: { p_student_id: string; p_voucher_id: string }
        Returns: boolean
      }
      replace_student_enrollment: {
        Args: {
          _company_id: string
          _clear_carried_over_cycle?: boolean
          _plan_id: string
          _start_date: string
          _student_id: string
          _trainer_id: string | null
        }
        Returns: {
          carried_over_cycle_id: string | null
          enrollment_id: string
          first_activation: boolean
          previous_enrollment_id: string | null
        }[]
      }
      release_wearable_lease: {
        Args: { p_device_id: string; p_holder: string; p_purpose: string }
        Returns: undefined
      }
      replace_cycle_workout_revision: {
        Args: { p_cycle_id: string; p_expected_rows: Json; p_workouts: Json }
        Returns: Json
      }
      replace_exercise_muscle_targets: {
        Args: { p_exercise_id: string; p_targets: Json }
        Returns: undefined
      }
      reply_to_workout_feedback: {
        Args: { _feedback_id: string; _trainer_reply: string }
        Returns: {
          company_id: string
          created_at: string
          difficulty: number | null
          energy: number | null
          id: string
          notes: string | null
          pain_areas: Json
          read_at: string | null
          student_id: string
          trainer_replied_at: string | null
          trainer_replied_by: string | null
          trainer_reply: string | null
          trainer_reply_author_name: string | null
          workout_session_id: string | null
          workout_title: string | null
        }
        SetofOptions: {
          from: "*"
          to: "workout_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reschedule_training_cycles_from: {
        Args: {
          p_cycle_id: string
          p_enrollment_id: string
          p_new_start_date: string
        }
        Returns: undefined
      }
      restore_student_workout: {
        Args: {
          p_cycle_id: string
          p_reason?: string
          p_student_id: string
          p_workout_id: string
        }
        Returns: Json
      }
      save_workout_logs_if_current: { Args: { _rows: Json }; Returns: Json }
      set_staff_permission: {
        Args: {
          _company_id: string
          _enabled: boolean
          _permission: string
          _user_id: string
        }
        Returns: boolean
      }
      sett_phone_key: { Args: { _value: string }; Returns: string }
      submit_anamnesis_invite_atomic: {
        Args: {
          _anamnese?: Json
          _effects?: Json
          _student_patch?: Json
          _token: string
        }
        Returns: Json
      }
      submit_intercycle_anamnesis: {
        Args: {
          _additional_information: string
          _availability_changed: boolean
          _available_days: string[]
          _available_equipment: string
          _consent_text_version: string
          _goals_continue: boolean
          _new_goals: string
          _pain_eva: number
          _pain_location: string
          _pain_movement: string
          _pain_present: boolean
          _pain_started_at: string
          _prescription_evaluation: string
          _sensitive_consent: boolean
          _session_duration_minutes: number
          _token_sha256: string
          _training_location: string
        }
        Returns: string
      }
      sync_prescription_cycles: {
        Args: { _start_date?: string; _student_id: string }
        Returns: {
          cycle_number: number
          end_date: string
          enrollment_id: string
          has_bundle: boolean
          has_workouts: boolean
          id: string
          start_date: string
          status: string
        }[]
      }
      track_content_interaction: {
        Args: { p_post_id: string; p_student_id: string; p_type: string }
        Returns: boolean
      }
      try_uuid: { Args: { value: string }; Returns: string }
      unaccent_simple: { Args: { t: string }; Returns: string }
      upsert_wearable_data: {
        Args: {
          p_date: string
          p_device_id: string
          p_metadata?: Json
          p_metric: string
          p_source?: string
          p_student_id: string
          p_unit?: string
          p_value: number
        }
        Returns: string
      }
      user_purchased_template: {
        Args: { p_template_id: string; p_user_id: string }
        Returns: boolean
      }
      weekly_contact_consent_is_current: {
        Args: { _company_id: string; _student_id: string }
        Returns: boolean
      }
      weekly_contact_consent_status: {
        Args: { _student_id: string }
        Returns: Json
      }
      weekly_contact_policy_version: { Args: never; Returns: string }
      weekly_consistency_source_id: {
        Args: { _student_id: string; _week_start: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "coordinator" | "trainer" | "master" | "student"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "coordinator", "trainer", "master", "student"],
    },
  },
} as const
