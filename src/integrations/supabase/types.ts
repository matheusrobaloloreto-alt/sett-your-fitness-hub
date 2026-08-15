export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
        Relationships: []
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
          rating: number | null
          read_at: string | null
          renewal_intent: string | null
          student_id: string
          wants_adjustment: boolean | null
          what_to_improve: string | null
          what_worked: string | null
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
          rating?: number | null
          read_at?: string | null
          renewal_intent?: string | null
          student_id: string
          wants_adjustment?: boolean | null
          what_to_improve?: string | null
          what_worked?: string | null
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
          rating?: number | null
          read_at?: string | null
          renewal_intent?: string | null
          student_id?: string
          wants_adjustment?: boolean | null
          what_to_improve?: string | null
          what_worked?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cycle_feedback_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "training_cycles"
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
      leads: {
        Row: {
          assigned_to: string | null
          budget_range: string | null
          company_id: string
          contact_outcome: string | null
          contacted_at: string | null
          converted_to_student_id: string | null
          created_at: string
          email: string | null
          fiscal_invited_at: string | null
          full_name: string
          id: string
          last_contact_at: string | null
          phone: string | null
          pre_registration_answers: Json
          preferred_contact_period: string | null
          source: string | null
          stage: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          budget_range?: string | null
          company_id: string
          contact_outcome?: string | null
          contacted_at?: string | null
          converted_to_student_id?: string | null
          created_at?: string
          email?: string | null
          fiscal_invited_at?: string | null
          full_name: string
          id?: string
          last_contact_at?: string | null
          phone?: string | null
          pre_registration_answers?: Json
          preferred_contact_period?: string | null
          source?: string | null
          stage?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          budget_range?: string | null
          company_id?: string
          contact_outcome?: string | null
          contacted_at?: string | null
          converted_to_student_id?: string | null
          created_at?: string
          email?: string | null
          fiscal_invited_at?: string | null
          full_name?: string
          id?: string
          last_contact_at?: string | null
          phone?: string | null
          pre_registration_answers?: Json
          preferred_contact_period?: string | null
          source?: string | null
          stage?: string
          submitted_at?: string | null
          updated_at?: string
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
          ai_rationale: string | null
          anamnese_id: string | null
          bundle_id: string | null
          carb_cycling: Json | null
          carbs_g: number | null
          company_id: string
          context_dietary_restrictions: string | null
          created_at: string
          end_date: string | null
          energy_summary: Json | null
          fat_g: number | null
          general_notes: string | null
          goal: string | null
          id: string
          intra_workout_protocol: string | null
          meals: Json | null
          nutrition_tips: Json | null
          objective: string | null
          observations: string | null
          plan: Json | null
          plan_name: string | null
          pre_race_gi_protocol: string | null
          previous_plan_id: string | null
          protein_g: number | null
          rest_day_adjustments: string | null
          sequence_number: number | null
          sequence_phase: string | null
          source_document: Json | null
          source_file_name: string | null
          source_type: string | null
          start_date: string | null
          student_id: string
          substitutions: Json | null
          supplementation: Json | null
          target_calories: number | null
          target_carbs_g: number | null
          target_fat_g: number | null
          target_protein_g: number | null
          total_calories: number | null
          training_cycle_id: string | null
          updated_at: string
          warnings: string[] | null
        }
        Insert: {
          ai_rationale?: string | null
          anamnese_id?: string | null
          bundle_id?: string | null
          carb_cycling?: Json | null
          carbs_g?: number | null
          company_id: string
          context_dietary_restrictions?: string | null
          created_at?: string
          end_date?: string | null
          energy_summary?: Json | null
          fat_g?: number | null
          general_notes?: string | null
          goal?: string | null
          id?: string
          intra_workout_protocol?: string | null
          meals?: Json | null
          nutrition_tips?: Json | null
          objective?: string | null
          observations?: string | null
          plan?: Json | null
          plan_name?: string | null
          pre_race_gi_protocol?: string | null
          previous_plan_id?: string | null
          protein_g?: number | null
          rest_day_adjustments?: string | null
          sequence_number?: number | null
          sequence_phase?: string | null
          source_document?: Json | null
          source_file_name?: string | null
          source_type?: string | null
          start_date?: string | null
          student_id: string
          substitutions?: Json | null
          supplementation?: Json | null
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          total_calories?: number | null
          training_cycle_id?: string | null
          updated_at?: string
          warnings?: string[] | null
        }
        Update: {
          ai_rationale?: string | null
          anamnese_id?: string | null
          bundle_id?: string | null
          carb_cycling?: Json | null
          carbs_g?: number | null
          company_id?: string
          context_dietary_restrictions?: string | null
          created_at?: string
          end_date?: string | null
          energy_summary?: Json | null
          fat_g?: number | null
          general_notes?: string | null
          goal?: string | null
          id?: string
          intra_workout_protocol?: string | null
          meals?: Json | null
          nutrition_tips?: Json | null
          objective?: string | null
          observations?: string | null
          plan?: Json | null
          plan_name?: string | null
          pre_race_gi_protocol?: string | null
          previous_plan_id?: string | null
          protein_g?: number | null
          rest_day_adjustments?: string | null
          sequence_number?: number | null
          sequence_phase?: string | null
          source_document?: Json | null
          source_file_name?: string | null
          source_type?: string | null
          start_date?: string | null
          student_id?: string
          substitutions?: Json | null
          supplementation?: Json | null
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          total_calories?: number | null
          training_cycle_id?: string | null
          updated_at?: string
          warnings?: string[] | null
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
          created_at: string
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
          created_at?: string
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
          created_at?: string
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
          company_id: string | null
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          company_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          company_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
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
          end_date: string | null
          fc_zones: Json | null
          general_tips: string | null
          goal: string | null
          id: string
          model: string | null
          nutrition_alert: string | null
          plan_name: string | null
          previous_plan_id: string | null
          safety_check: Json | null
          sequence_number: number | null
          sequence_phase: string | null
          sport: string | null
          start_date: string | null
          student_id: string
          training_cycle_id: string | null
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
          end_date?: string | null
          fc_zones?: Json | null
          general_tips?: string | null
          goal?: string | null
          id?: string
          model?: string | null
          nutrition_alert?: string | null
          plan_name?: string | null
          previous_plan_id?: string | null
          safety_check?: Json | null
          sequence_number?: number | null
          sequence_phase?: string | null
          sport?: string | null
          start_date?: string | null
          student_id: string
          training_cycle_id?: string | null
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
          end_date?: string | null
          fc_zones?: Json | null
          general_tips?: string | null
          goal?: string | null
          id?: string
          model?: string | null
          nutrition_alert?: string | null
          plan_name?: string | null
          previous_plan_id?: string | null
          safety_check?: Json | null
          sequence_number?: number | null
          sequence_phase?: string | null
          sport?: string | null
          start_date?: string | null
          student_id?: string
          training_cycle_id?: string | null
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
          updated_at: string
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
          created_at?: string
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
          updated_at?: string
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
          created_at?: string
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
          updated_at?: string
          wants_cycling?: boolean
          wants_nutrition?: boolean
          wants_running?: boolean
          wants_strength?: boolean
          wants_swimming?: boolean
        }
        Relationships: [
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
          fiscal_completed_at: string | null
          full_name: string
          gender: string | null
          height_cm: number | null
          id: string
          neighborhood: string | null
          notes: string | null
          onboarding_instructions_sent_at: string | null
          payment_link_sent_at: string | null
          phone: string | null
          photo_url: string | null
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
          fiscal_completed_at?: string | null
          full_name: string
          gender?: string | null
          height_cm?: number | null
          id?: string
          neighborhood?: string | null
          notes?: string | null
          onboarding_instructions_sent_at?: string | null
          payment_link_sent_at?: string | null
          phone?: string | null
          photo_url?: string | null
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
          fiscal_completed_at?: string | null
          full_name?: string
          gender?: string | null
          height_cm?: number | null
          id?: string
          neighborhood?: string | null
          notes?: string | null
          onboarding_instructions_sent_at?: string | null
          payment_link_sent_at?: string | null
          phone?: string | null
          photo_url?: string | null
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
      training_cycles: {
        Row: {
          company_id: string
          created_at: string
          cycle_number: number
          delivery_status: string | null
          duration_weeks: number | null
          end_date: string
          enrollment_id: string
          id: string
          name: string | null
          prescribed_offline_at: string | null
          prescribed_offline_by: string | null
          prescribed_offline_note: string | null
          start_date: string
          status: string | null
          student_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          cycle_number?: number
          delivery_status?: string | null
          duration_weeks?: number | null
          end_date: string
          enrollment_id: string
          id?: string
          name?: string | null
          prescribed_offline_at?: string | null
          prescribed_offline_by?: string | null
          prescribed_offline_note?: string | null
          start_date: string
          status?: string | null
          student_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          cycle_number?: number
          delivery_status?: string | null
          duration_weeks?: number | null
          end_date?: string
          enrollment_id?: string
          id?: string
          name?: string | null
          prescribed_offline_at?: string | null
          prescribed_offline_by?: string | null
          prescribed_offline_note?: string | null
          start_date?: string
          status?: string | null
          student_id?: string
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
          {
            foreignKeyName: "training_cycles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          created_at: string
          date: string
          device_id: string
          external_id: string | null
          id: string
          metadata: Json
          metric: string
          recorded_at: string | null
          score_state: string | null
          source: string
          student_id: string
          timezone_offset_minutes: number | null
          unit: string | null
          updated_at: string
          value: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          device_id: string
          external_id?: string | null
          id?: string
          metadata?: Json
          metric: string
          recorded_at?: string | null
          score_state?: string | null
          source: string
          student_id: string
          timezone_offset_minutes?: number | null
          unit?: string | null
          updated_at?: string
          value?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          device_id?: string
          external_id?: string | null
          id?: string
          metadata?: Json
          metric?: string
          recorded_at?: string | null
          score_state?: string | null
          source?: string
          student_id?: string
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
          company_id: string
          connection_status: string
          created_at: string
          credential_delete_after: string | null
          device_name: string | null
          external_user_id: string | null
          granted_scopes: string[]
          id: string
          is_active: boolean
          last_error: string | null
          last_error_code: string | null
          last_sync_at: string | null
          last_sync_status: string | null
          provider: string
          required_scopes: string[]
          revocation_retry_after: string | null
          revocation_status: string | null
          revoked_at: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          connection_status?: string
          created_at?: string
          credential_delete_after?: string | null
          device_name?: string | null
          external_user_id?: string | null
          granted_scopes?: string[]
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_code?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider: string
          required_scopes?: string[]
          revocation_retry_after?: string | null
          revocation_status?: string | null
          revoked_at?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          connection_status?: string
          created_at?: string
          credential_delete_after?: string | null
          device_name?: string | null
          external_user_id?: string | null
          granted_scopes?: string[]
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_code?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string
          required_scopes?: string[]
          revocation_retry_after?: string | null
          revocation_status?: string | null
          revoked_at?: string | null
          student_id?: string
          updated_at?: string
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
          created_at: string
          device_id: string
          distance_km: number | null
          duration_min: number | null
          elevation_gain_m: number | null
          ended_at: string | null
          external_id: string
          id: string
          linked_workout_session_id: string | null
          local_date: string
          max_heart_rate: number | null
          metadata: Json
          source: string
          started_at: string
          strain: number | null
          student_id: string
          timezone_offset_minutes: number | null
          updated_at: string
        }
        Insert: {
          activity_type?: string | null
          avg_heart_rate?: number | null
          avg_pace?: string | null
          calories?: number | null
          company_id: string
          created_at?: string
          device_id: string
          distance_km?: number | null
          duration_min?: number | null
          elevation_gain_m?: number | null
          ended_at?: string | null
          external_id: string
          id?: string
          linked_workout_session_id?: string | null
          local_date: string
          max_heart_rate?: number | null
          metadata?: Json
          source: string
          started_at: string
          strain?: number | null
          student_id: string
          timezone_offset_minutes?: number | null
          updated_at?: string
        }
        Update: {
          activity_type?: string | null
          avg_heart_rate?: number | null
          avg_pace?: string | null
          calories?: number | null
          company_id?: string
          created_at?: string
          device_id?: string
          distance_km?: number | null
          duration_min?: number | null
          elevation_gain_m?: number | null
          ended_at?: string | null
          external_id?: string
          id?: string
          linked_workout_session_id?: string | null
          local_date?: string
          max_heart_rate?: number | null
          metadata?: Json
          source?: string
          started_at?: string
          strain?: number | null
          student_id?: string
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
          id: string
          is_from_me: boolean | null
          media_storage_path: string | null
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
          media_storage_path?: string | null
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
          media_storage_path?: string | null
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
          {
            foreignKeyName: "whatsapp_messages_quoted_message_id_fkey"
            columns: ["quoted_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
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
            referencedRelation: "workout_exercise_entries"
            referencedColumns: ["workout_id"]
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
            referencedRelation: "workout_exercise_entries"
            referencedColumns: ["workout_id"]
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
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          focus: string | null
          id: string
          level: string | null
          name: string
          updated_at: string
          workouts: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          focus?: string | null
          id?: string
          level?: string | null
          name: string
          updated_at?: string
          workouts?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          focus?: string | null
          id?: string
          level?: string | null
          name?: string
          updated_at?: string
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
      advance_training_cycles: { Args: never; Returns: undefined }
      apply_template_to_student: {
        Args: {
          p_cycle_name?: string
          p_student_id: string
          p_template_id: string
        }
        Returns: string
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
      get_automation_start_node: { Args: { _flow_id: string }; Returns: string }
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
      get_revenue_breakdown: {
        Args: { p_company_id: string; p_months?: number }
        Returns: {
          active_subscribers: number
          monthly_revenue: number
          plan_name: string
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
      recalculate_training_cycles: {
        Args: { p_enrollment_id: string; p_new_start_date: string }
        Returns: undefined
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
      release_wearable_lease: {
        Args: { p_device_id: string; p_holder: string; p_purpose: string }
        Returns: undefined
      }
      replace_exercise_muscle_targets: {
        Args: { p_exercise_id: string; p_targets: Json }
        Returns: undefined
      }
      reschedule_training_cycles_from: {
        Args: {
          p_cycle_id: string
          p_enrollment_id: string
          p_new_start_date: string
        }
        Returns: undefined
      }
      save_workout_logs_if_current: { Args: { _rows: Json }; Returns: Json }
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
      try_uuid: { Args: { value: string }; Returns: string }
      unaccent_simple: { Args: { t: string }; Returns: string }
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
