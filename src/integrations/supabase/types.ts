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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
        }
        Relationships: []
      }
      company_career_sites: {
        Row: {
          career_url: string
          company_name: string
          company_size: string | null
          crawl_status: string | null
          created_at: string
          headquarters_city: string | null
          id: string
          industry: string | null
          is_active: boolean | null
          is_scrape_enabled: boolean | null
          jobs_found_count: number | null
          last_crawled_at: string | null
          last_scheduled_scrape_at: string | null
          scrape_progress_current_page: string | null
          scrape_progress_jobs_found: number | null
          scrape_progress_pages_scraped: number | null
          scrape_progress_phase: string | null
          scrape_schedule: string | null
          updated_at: string
        }
        Insert: {
          career_url: string
          company_name: string
          company_size?: string | null
          crawl_status?: string | null
          created_at?: string
          headquarters_city?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_scrape_enabled?: boolean | null
          jobs_found_count?: number | null
          last_crawled_at?: string | null
          last_scheduled_scrape_at?: string | null
          scrape_progress_current_page?: string | null
          scrape_progress_jobs_found?: number | null
          scrape_progress_pages_scraped?: number | null
          scrape_progress_phase?: string | null
          scrape_schedule?: string | null
          updated_at?: string
        }
        Update: {
          career_url?: string
          company_name?: string
          company_size?: string | null
          crawl_status?: string | null
          created_at?: string
          headquarters_city?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_scrape_enabled?: boolean | null
          jobs_found_count?: number | null
          last_crawled_at?: string | null
          last_scheduled_scrape_at?: string | null
          scrape_progress_current_page?: string | null
          scrape_progress_jobs_found?: number | null
          scrape_progress_pages_scraped?: number | null
          scrape_progress_phase?: string | null
          scrape_schedule?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      job_opportunities: {
        Row: {
          closing_date: string | null
          company_career_site_id: string | null
          created_at: string
          department: string | null
          description: string | null
          employment_type: string | null
          experience_level: string | null
          id: string
          is_internship: boolean | null
          is_remote: boolean | null
          job_title: string
          job_url: string
          location: string | null
          posted_date: string | null
          requirements: string | null
          salary_range: string | null
          scraped_at: string
          updated_at: string
        }
        Insert: {
          closing_date?: string | null
          company_career_site_id?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          employment_type?: string | null
          experience_level?: string | null
          id?: string
          is_internship?: boolean | null
          is_remote?: boolean | null
          job_title: string
          job_url: string
          location?: string | null
          posted_date?: string | null
          requirements?: string | null
          salary_range?: string | null
          scraped_at?: string
          updated_at?: string
        }
        Update: {
          closing_date?: string | null
          company_career_site_id?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          employment_type?: string | null
          experience_level?: string | null
          id?: string
          is_internship?: boolean | null
          is_remote?: boolean | null
          job_title?: string
          job_url?: string
          location?: string | null
          posted_date?: string | null
          requirements?: string | null
          salary_range?: string | null
          scraped_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_opportunities_company_career_site_id_fkey"
            columns: ["company_career_site_id"]
            isOneToOne: false
            referencedRelation: "company_career_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      job_synonyms: {
        Row: {
          created_at: string
          group_name: string
          id: string
          is_active: boolean
          terms: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_name: string
          id?: string
          is_active?: boolean
          terms?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_name?: string
          id?: string
          is_active?: boolean
          terms?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      scrape_history: {
        Row: {
          career_url: string
          company_career_site_id: string
          completed_at: string | null
          error_message: string | null
          id: string
          jobs_found: number | null
          jobs_inserted: number | null
          jobs_removed: number | null
          pages_scraped: number | null
          skipped_urls: Json | null
          started_at: string
          status: string
        }
        Insert: {
          career_url: string
          company_career_site_id: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          jobs_found?: number | null
          jobs_inserted?: number | null
          jobs_removed?: number | null
          pages_scraped?: number | null
          skipped_urls?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          career_url?: string
          company_career_site_id?: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          jobs_found?: number | null
          jobs_inserted?: number | null
          jobs_removed?: number | null
          pages_scraped?: number | null
          skipped_urls?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_history_company_career_site_id_fkey"
            columns: ["company_career_site_id"]
            isOneToOne: false
            referencedRelation: "company_career_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
