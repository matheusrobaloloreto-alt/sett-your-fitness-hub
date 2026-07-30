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
    PostgrestVersion: "14.4"
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
        Relationships: []
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
        Relationships: []
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
          student_id: string
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
          student_id: string
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
          student_id?: string
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
            foreignKeyName: "ai_strength_plans_student_id_fkey"
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
        Relationships: []
      }
      assessment_frames: {
        Row: {
          ai_findings: Json | null
          assessment_id: string
          company_id: string
          created_at: string
          edited: boolean
          frame_index: number
          id: string
          image_url: string
          trainer_findings: Json
          vista: string
        }
        Insert: {
          ai_findings?: Json | null
          assessment_id: string
          company_id: string
          created_at?: string
          edited?: boolean
          frame_index: number
          id?: string
          image_url: string
          trainer_findings?: Json
          vista: string
        }
        Update: {
          ai_findings?: Json | null
          assessment_id?: string
          company_id?: string
          created_at?: string
          edited?: boolean
          frame_index?: number
          id?: string
          image_url?: string
          trainer_findings?: Json
          vista?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_frames_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "functional_assessments"
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
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          max_students: number | null
          name: string
          owner_id: string | null
          owner_user_id: string | null
          slug: string | null
          subscription_status: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_students?: number | null
          name: string
          owner_id?: string | null
          owner_user_id?: string | null
          slug?: string | null
          subscription_status?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_students?: number | null
          name?: string
          owner_id?: string | null
          owner_user_id?: string | null
          slug?: string | null
          subscription_status?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_ai_config: {
        Row: {
          assistant_name: string
          company_id: string
          created_at: string
          doctrine: string | null
          enabled: boolean
          ethical_limits: string | null
          extra: Json
          id: string
          methodology: string | null
          staff_assistant_enabled: boolean
          student_assistant_enabled: boolean
          tone: string | null
          updated_at: string
        }
        Insert: {
          assistant_name?: string
          company_id: string
          created_at?: string
          doctrine?: string | null
          enabled?: boolean
          ethical_limits?: string | null
          extra?: Json
          id?: string
          methodology?: string | null
          staff_assistant_enabled?: boolean
          student_assistant_enabled?: boolean
          tone?: string | null
          updated_at?: string
        }
        Update: {
          assistant_name?: string
          company_id?: string
          created_at?: string
          doctrine?: string | null
          enabled?: boolean
          ethical_limits?: string | null
          extra?: Json
          id?: string
          methodology?: string | null
          staff_assistant_enabled?: boolean
          student_assistant_enabled?: boolean
          tone?: string | null
          updated_at?: string
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
        Relationships: []
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
      cycle_feedback: {
        Row: {
          company_id: string
          created_at: string
          enrollment_id: string | null
          id: string
          rating: number | null
          read_at: string | null
          renewal_intent: string | null
          student_id: string
          what_to_improve: string | null
          what_worked: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          rating?: number | null
          read_at?: string | null
          renewal_intent?: string | null
          student_id: string
          what_to_improve?: string | null
          what_worked?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          rating?: number | null
          read_at?: string | null
          renewal_intent?: string | null
          student_id?: string
          what_to_improve?: string | null
          what_worked?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
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
      exercise_library: {
        Row: {
          categories: string[]
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
        }
        Insert: {
          categories?: string[]
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
        }
        Update: {
          categories?: string[]
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
          assessment_json: Json | null
          company_id: string
          created_at: string
          historico_lesoes: string | null
          id: string
          modalidade: string | null
          nivel: string | null
          queixa_principal: string | null
          report_text: string | null
          source: string | null
          status: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          ai_raw_response?: string | null
          assessment_json?: Json | null
          company_id: string
          created_at?: string
          historico_lesoes?: string | null
          id?: string
          modalidade?: string | null
          nivel?: string | null
          queixa_principal?: string | null
          report_text?: string | null
          source?: string | null
          status?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          ai_raw_response?: string | null
          assessment_json?: Json | null
          company_id?: string
          created_at?: string
          historico_lesoes?: string | null
          id?: string
          modalidade?: string | null
          nivel?: string | null
          queixa_principal?: string | null
          report_text?: string | null
          source?: string | null
          status?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "functional_assessments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      nutrition_plans: {
        Row: {
          carbs_g: number | null
          company_id: string
          created_at: string
          created_by: string | null
          fat_g: number | null
          id: string
          meals: Json
          notes: string | null
          objective: string
          protein_g: number | null
          status: string
          student_id: string
          title: string
          total_calories: number | null
          updated_at: string
          water_ml: number | null
        }
        Insert: {
          carbs_g?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          fat_g?: number | null
          id?: string
          meals?: Json
          notes?: string | null
          objective?: string
          protein_g?: number | null
          status?: string
          student_id: string
          title?: string
          total_calories?: number | null
          updated_at?: string
          water_ml?: number | null
        }
        Update: {
          carbs_g?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          fat_g?: number | null
          id?: string
          meals?: Json
          notes?: string | null
          objective?: string
          protein_g?: number | null
          status?: string
          student_id?: string
          title?: string
          total_calories?: number | null
          updated_at?: string
          water_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_student_id_fkey"
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
          company_id: string | null
          created_at: string
          due_date: string | null
          enrollment_id: string | null
          id: string
          installment_count: number | null
          invoice_status: string | null
          invoice_url: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
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
          company_id?: string | null
          created_at?: string
          due_date?: string | null
          enrollment_id?: string | null
          id?: string
          installment_count?: number | null
          invoice_status?: string | null
          invoice_url?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
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
          company_id?: string | null
          created_at?: string
          due_date?: string | null
          enrollment_id?: string | null
          id?: string
          installment_count?: number | null
          invoice_status?: string | null
          invoice_url?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
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
      platform_settings: {
        Row: {
          background_color: string | null
          card_color: string | null
          company_id: string | null
          created_at: string
          id: string
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
      prescription_bundles: {
        Row: {
          anamnese_id: string | null
          assessment_id: string | null
          company_id: string
          created_at: string
          has_cardio: boolean | null
          has_strength: boolean | null
          id: string
          notes: string | null
          running_plan_id: string | null
          status: string | null
          strength_plan_id: string | null
          student_id: string
        }
        Insert: {
          anamnese_id?: string | null
          assessment_id?: string | null
          company_id: string
          created_at?: string
          has_cardio?: boolean | null
          has_strength?: boolean | null
          id?: string
          notes?: string | null
          running_plan_id?: string | null
          status?: string | null
          strength_plan_id?: string | null
          student_id: string
        }
        Update: {
          anamnese_id?: string | null
          assessment_id?: string | null
          company_id?: string
          created_at?: string
          has_cardio?: boolean | null
          has_strength?: boolean | null
          id?: string
          notes?: string | null
          running_plan_id?: string | null
          status?: string | null
          strength_plan_id?: string | null
          student_id?: string
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
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          company_id: string
          complementary_strength: Json | null
          created_at: string
          duration_weeks: number | null
          fc_zones: Json | null
          general_tips: string | null
          goal: string | null
          id: string
          model: string | null
          nutrition_alert: string | null
          plan_name: string | null
          safety_check: Json | null
          sport: string | null
          student_id: string
          updated_at: string
          warnings: string[] | null
          weeks: Json | null
        }
        Insert: {
          anamnese_id?: string | null
          bundle_id?: string | null
          company_id: string
          complementary_strength?: Json | null
          created_at?: string
          duration_weeks?: number | null
          fc_zones?: Json | null
          general_tips?: string | null
          goal?: string | null
          id?: string
          model?: string | null
          nutrition_alert?: string | null
          plan_name?: string | null
          safety_check?: Json | null
          sport?: string | null
          student_id: string
          updated_at?: string
          warnings?: string[] | null
          weeks?: Json | null
        }
        Update: {
          anamnese_id?: string | null
          bundle_id?: string | null
          company_id?: string
          complementary_strength?: Json | null
          created_at?: string
          duration_weeks?: number | null
          fc_zones?: Json | null
          general_tips?: string | null
          goal?: string | null
          id?: string
          model?: string | null
          nutrition_alert?: string | null
          plan_name?: string | null
          safety_check?: Json | null
          sport?: string | null
          student_id?: string
          updated_at?: string
          warnings?: string[] | null
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
            foreignKeyName: "running_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
        Relationships: []
      }
      student_anamneses: {
        Row: {
          activity_level: string | null
          age: number | null
          body_fat_percent: number | null
          budget_food: string | null
          cardio_goal: string | null
          company_id: string
          created_at: string
          current_volume_weekly: number | null
          days_per_week_cardio: number | null
          days_per_week_strength: number | null
          equipment: string | null
          experience_months: number | null
          fcmax: number | null
          fcrep: number | null
          food_restrictions: string | null
          has_kitchen: boolean | null
          id: string
          injuries: string | null
          is_endurance_athlete: boolean | null
          meals_per_day: number | null
          notes: string | null
          objective: string | null
          prescribed_modalities: string[]
          session_duration_min: number | null
          sleep_quality: number | null
          sport: string | null
          stress_score: number | null
          student_id: string
          training_modality: string | null
          updated_at: string
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          body_fat_percent?: number | null
          budget_food?: string | null
          cardio_goal?: string | null
          company_id: string
          created_at?: string
          current_volume_weekly?: number | null
          days_per_week_cardio?: number | null
          days_per_week_strength?: number | null
          equipment?: string | null
          experience_months?: number | null
          fcmax?: number | null
          fcrep?: number | null
          food_restrictions?: string | null
          has_kitchen?: boolean | null
          id?: string
          injuries?: string | null
          is_endurance_athlete?: boolean | null
          meals_per_day?: number | null
          notes?: string | null
          objective?: string | null
          prescribed_modalities?: string[]
          session_duration_min?: number | null
          sleep_quality?: number | null
          sport?: string | null
          stress_score?: number | null
          student_id: string
          training_modality?: string | null
          updated_at?: string
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          body_fat_percent?: number | null
          budget_food?: string | null
          cardio_goal?: string | null
          company_id?: string
          created_at?: string
          current_volume_weekly?: number | null
          days_per_week_cardio?: number | null
          days_per_week_strength?: number | null
          equipment?: string | null
          experience_months?: number | null
          fcmax?: number | null
          fcrep?: number | null
          food_restrictions?: string | null
          has_kitchen?: boolean | null
          id?: string
          injuries?: string | null
          is_endurance_athlete?: boolean | null
          meals_per_day?: number | null
          notes?: string | null
          objective?: string | null
          prescribed_modalities?: string[]
          session_duration_min?: number | null
          sleep_quality?: number | null
          sport?: string | null
          stress_score?: number | null
          student_id?: string
          training_modality?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_anamneses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_body_limitations: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          region: string
          severity: string
          student_id: string
          type: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          region: string
          severity?: string
          student_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          region?: string
          severity?: string
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
      student_documents: {
        Row: {
          company_id: string | null
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          notes: string | null
          size: number | null
          student_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size?: number | null
          student_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size?: number | null
          student_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_evaluations: {
        Row: {
          body_fat_percentage: number | null
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
      student_goals: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          status: string
          student_id: string
          target_date: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          student_id: string
          target_date: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          student_id?: string
          target_date?: string
          title?: string
          type?: string
          updated_at?: string
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
          address: string | null
          address_number: string | null
          asaas_customer_id: string | null
          assigned_trainer_id: string | null
          birth_date: string | null
          category_id: string | null
          cep: string | null
          city: string | null
          company_id: string | null
          cpf: string | null
          created_at: string
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          full_name: string
          gender: string | null
          id: string
          neighborhood: string | null
          notes: string | null
          phone: string | null
          photo_url: string | null
          selected_plan_id: string | null
          state: string | null
          status: string | null
          updated_at: string
          user_id: string | null
          weekly_workout_goal: number
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string | null
          assigned_trainer_id?: string | null
          birth_date?: string | null
          category_id?: string | null
          cep?: string | null
          city?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          full_name: string
          gender?: string | null
          id?: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          selected_plan_id?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_workout_goal?: number
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string | null
          assigned_trainer_id?: string | null
          birth_date?: string | null
          category_id?: string | null
          cep?: string | null
          city?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          selected_plan_id?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_workout_goal?: number
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
      trainer_assignments_history: {
        Row: {
          assigned_at: string
          changed_by: string | null
          company_id: string | null
          created_at: string
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
      training_cycles: {
        Row: {
          company_id: string | null
          created_at: string
          cycle_number: number
          end_date: string
          enrollment_id: string
          id: string
          start_date: string
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          cycle_number?: number
          end_date: string
          enrollment_id: string
          id?: string
          start_date: string
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          cycle_number?: number
          end_date?: string
          enrollment_id?: string
          id?: string
          start_date?: string
          status?: string | null
        }
        Relationships: [
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
          category: string | null
          company_id: string
          contact_name: string | null
          contact_photo: string | null
          created_at: string
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
          category?: string | null
          company_id: string
          contact_name?: string | null
          contact_photo?: string | null
          created_at?: string
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
          category?: string | null
          company_id?: string
          contact_name?: string | null
          contact_photo?: string | null
          created_at?: string
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
          id: string
          is_from_me: boolean | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_id_external: string | null
          origin: string
          quoted_message_external_id: string | null
          quoted_message_id: string | null
          quoted_message_preview: string | null
          quoted_message_source: string | null
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
          id?: string
          is_from_me?: boolean | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_id_external?: string | null
          origin?: string
          quoted_message_external_id?: string | null
          quoted_message_id?: string | null
          quoted_message_preview?: string | null
          quoted_message_source?: string | null
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
          id?: string
          is_from_me?: boolean | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_id_external?: string | null
          origin?: string
          quoted_message_external_id?: string | null
          quoted_message_id?: string | null
          quoted_message_preview?: string | null
          quoted_message_source?: string | null
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
          pain_areas: Json | null
          read_at: string | null
          student_id: string
          workout_session_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          difficulty?: number | null
          energy?: number | null
          id?: string
          notes?: string | null
          pain_areas?: Json | null
          read_at?: string | null
          student_id: string
          workout_session_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          difficulty?: number | null
          energy?: number | null
          id?: string
          notes?: string | null
          pain_areas?: Json | null
          read_at?: string | null
          student_id?: string
          workout_session_id?: string | null
        }
        Relationships: []
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
          rpe: number | null
          session_date: string | null
          set_number: number | null
          set_type: string | null
          student_id: string
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
          rpe?: number | null
          session_date?: string | null
          set_number?: number | null
          set_type?: string | null
          student_id: string
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
          rpe?: number | null
          session_date?: string | null
          set_number?: number | null
          set_type?: string | null
          student_id?: string
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
          sort_order: number | null
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
          sort_order?: number | null
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
          sort_order?: number | null
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_training_cycles: { Args: never; Returns: undefined }
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
      check_and_unlock_achievements: {
        Args: { _student_id: string }
        Returns: number
      }
      get_student_rank: {
        Args: { _student_id: string }
        Returns: {
          rank_position: number
          total_students: number
          xp: number
        }[]
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      process_enrollment_lifecycle: { Args: never; Returns: undefined }
      recalculate_training_cycles: {
        Args: { p_enrollment_id: string; p_new_start_date: string }
        Returns: undefined
      }
      student_self_update_allowed: {
        Args: {
          _asaas_customer_id: string
          _assigned_trainer_id: string
          _category_id: string
          _company_id: string
          _id: string
          _selected_plan_id: string
          _status: string
        }
        Returns: boolean
      }
      unaccent_simple: { Args: { t: string }; Returns: string }
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
      app_role: ["admin", "coordinator", "trainer", "master", "student"],
    },
  },
} as const
