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
      commands: {
        Row: {
          created_at: string
          device_id: string
          id: string
          payload: Json | null
          status: Database["public"]["Enums"]["command_status"]
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          payload?: Json | null
          status?: Database["public"]["Enums"]["command_status"]
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          payload?: Json | null
          status?: Database["public"]["Enums"]["command_status"]
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      compartments: {
        Row: {
          active: boolean
          device_id: string
          expected_pill_weight_g: number | null
          id: string
          idx: number
          title: string
        }
        Insert: {
          active?: boolean
          device_id: string
          expected_pill_weight_g?: number | null
          id?: string
          idx: number
          title?: string
        }
        Update: {
          active?: boolean
          device_id?: string
          expected_pill_weight_g?: number | null
          id?: string
          idx?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "compartments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          id: string
          name: string
          secret: string
          serial: string
          timezone: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          secret: string
          serial: string
          timezone?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          secret?: string
          serial?: string
          timezone?: string
          user_id?: string
        }
        Relationships: []
      }
      dose_events: {
        Row: {
          actual_at: string | null
          compartment_id: string | null
          created_at: string
          delta_weight_g: number | null
          device_id: string
          id: string
          notes: string | null
          schedule_id: string | null
          scheduled_at: string
          source: Database["public"]["Enums"]["dose_source"]
          status: Database["public"]["Enums"]["dose_status"]
        }
        Insert: {
          actual_at?: string | null
          compartment_id?: string | null
          created_at?: string
          delta_weight_g?: number | null
          device_id: string
          id?: string
          notes?: string | null
          schedule_id?: string | null
          scheduled_at: string
          source?: Database["public"]["Enums"]["dose_source"]
          status: Database["public"]["Enums"]["dose_status"]
        }
        Update: {
          actual_at?: string | null
          compartment_id?: string | null
          created_at?: string
          delta_weight_g?: number | null
          device_id?: string
          id?: string
          notes?: string | null
          schedule_id?: string | null
          scheduled_at?: string
          source?: Database["public"]["Enums"]["dose_source"]
          status?: Database["public"]["Enums"]["dose_status"]
        }
        Relationships: [
          {
            foreignKeyName: "dose_events_compartment_id_fkey"
            columns: ["compartment_id"]
            isOneToOne: false
            referencedRelation: "compartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dose_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dose_events_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_info: Json | null
          endpoint: string
          id: string
          last_seen: string | null
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device_info?: Json | null
          endpoint: string
          id?: string
          last_seen?: string | null
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device_info?: Json | null
          endpoint?: string
          id?: string
          last_seen?: string | null
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          device_id: string
          file_path: string
          id: string
          range_end: string
          range_start: string
          type: Database["public"]["Enums"]["report_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          file_path: string
          id?: string
          range_end: string
          range_start: string
          type: Database["public"]["Enums"]["report_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          file_path?: string
          id?: string
          range_end?: string
          range_start?: string
          type?: Database["public"]["Enums"]["report_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          compartment_id: string
          days_of_week: number
          enable_buzzer: boolean
          enable_led: boolean
          id: string
          time_of_day: string
          window_minutes: number
        }
        Insert: {
          compartment_id: string
          days_of_week?: number
          enable_buzzer?: boolean
          enable_led?: boolean
          id?: string
          time_of_day: string
          window_minutes?: number
        }
        Update: {
          compartment_id?: string
          days_of_week?: number
          enable_buzzer?: boolean
          enable_led?: boolean
          id?: string
          time_of_day?: string
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedules_compartment_id_fkey"
            columns: ["compartment_id"]
            isOneToOne: false
            referencedRelation: "compartments"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_readings: {
        Row: {
          device_id: string
          id: string
          measured_at: string
          raw: Json | null
          weight_g: number
        }
        Insert: {
          device_id: string
          id?: string
          measured_at: string
          raw?: Json | null
          weight_g: number
        }
        Update: {
          device_id?: string
          id?: string
          measured_at?: string
          raw?: Json | null
          weight_g?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_readings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      command_status: "pending" | "ack" | "done" | "error" | "expired"
      dose_source: "auto" | "manual"
      dose_status: "taken" | "late" | "missed" | "skipped"
      report_type: "weekly" | "monthly"
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
      command_status: ["pending", "ack", "done", "error", "expired"],
      dose_source: ["auto", "manual"],
      dose_status: ["taken", "late", "missed", "skipped"],
      report_type: ["weekly", "monthly"],
    },
  },
} as const
