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
      ai_generations: {
        Row: {
          created_at: string | null
          error: string | null
          fn: string
          id: string
          model: string | null
          ms: number | null
          output_tokens: number | null
          status: number | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          fn: string
          id?: string
          model?: string | null
          ms?: number | null
          output_tokens?: number | null
          status?: number | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error?: string | null
          fn?: string
          id?: string
          model?: string | null
          ms?: number | null
          output_tokens?: number | null
          status?: number | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_prompts: {
        Row: {
          description: string | null
          id: string
          key: string
          model: string
          name: string
          system_prompt: string
          updated_at: string
          updated_by: string | null
          user_prompt_template: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          model?: string
          name: string
          system_prompt: string
          updated_at?: string
          updated_by?: string | null
          user_prompt_template?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          model?: string
          name?: string
          system_prompt?: string
          updated_at?: string
          updated_by?: string | null
          user_prompt_template?: string | null
        }
        Relationships: []
      }
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
      app_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      applications: {
        Row: {
          applied_at: string
          company_name: string
          cv_summary: string | null
          description: string | null
          handle_emails: boolean
          handle_emails_done: boolean | null
          human_review: boolean
          human_review_done: boolean | null
          id: string
          job_title: string
          job_url: string | null
          location: string | null
          motivation_text: string | null
          processed: boolean | null
          salary_range: string | null
          status: string | null
          supporter_notes: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string
          company_name: string
          cv_summary?: string | null
          description?: string | null
          handle_emails?: boolean
          handle_emails_done?: boolean | null
          human_review?: boolean
          human_review_done?: boolean | null
          id?: string
          job_title: string
          job_url?: string | null
          location?: string | null
          motivation_text?: string | null
          processed?: boolean | null
          salary_range?: string | null
          status?: string | null
          supporter_notes?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string
          company_name?: string
          cv_summary?: string | null
          description?: string | null
          handle_emails?: boolean
          handle_emails_done?: boolean | null
          human_review?: boolean
          human_review_done?: boolean | null
          id?: string
          job_title?: string
          job_url?: string | null
          location?: string | null
          motivation_text?: string | null
          processed?: boolean | null
          salary_range?: string | null
          status?: string | null
          supporter_notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          status: string
          supporter_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          supporter_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          supporter_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      city_coords: {
        Row: {
          city: string
          display_name: string | null
          lat: number
          lng: number
          province: string | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          city: string
          display_name?: string | null
          lat: number
          lng: number
          province?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string
          display_name?: string | null
          lat?: number
          lng?: number
          province?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      company_career_sites: {
        Row: {
          address: string | null
          business_legal_type: string | null
          career_page_status: string
          career_url: string
          ceo_name: string | null
          check_interval_hours: number
          company_name: string
          company_registration_number: string | null
          company_size: string | null
          consecutive_failures: number
          country: string | null
          crawl_status: string | null
          created_at: string
          email: string | null
          employees_on_site: number | null
          employees_total: number | null
          founding_year: number | null
          headquarters_city: string | null
          id: string
          industry: string | null
          is_active: boolean | null
          is_scrape_enabled: boolean | null
          jobs_found_count: number | null
          last_crawled_at: string | null
          last_scheduled_scrape_at: string | null
          last_success_at: string | null
          next_check_at: string
          phone_number: string | null
          postal_code: string | null
          scrape_config: Json | null
          scrape_progress_current_page: string | null
          scrape_progress_jobs_found: number | null
          scrape_progress_pages_scraped: number | null
          scrape_progress_phase: string | null
          scrape_schedule: string | null
          source_config: Json | null
          source_type: string | null
          state_province: string | null
          trade_name: string | null
          updated_at: string
          website: string | null
          yearly_revenue_usd: number | null
        }
        Insert: {
          address?: string | null
          business_legal_type?: string | null
          career_page_status?: string
          career_url: string
          ceo_name?: string | null
          check_interval_hours?: number
          company_name: string
          company_registration_number?: string | null
          company_size?: string | null
          consecutive_failures?: number
          country?: string | null
          crawl_status?: string | null
          created_at?: string
          email?: string | null
          employees_on_site?: number | null
          employees_total?: number | null
          founding_year?: number | null
          headquarters_city?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_scrape_enabled?: boolean | null
          jobs_found_count?: number | null
          last_crawled_at?: string | null
          last_scheduled_scrape_at?: string | null
          last_success_at?: string | null
          next_check_at?: string
          phone_number?: string | null
          postal_code?: string | null
          scrape_config?: Json | null
          scrape_progress_current_page?: string | null
          scrape_progress_jobs_found?: number | null
          scrape_progress_pages_scraped?: number | null
          scrape_progress_phase?: string | null
          scrape_schedule?: string | null
          source_config?: Json | null
          source_type?: string | null
          state_province?: string | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          yearly_revenue_usd?: number | null
        }
        Update: {
          address?: string | null
          business_legal_type?: string | null
          career_page_status?: string
          career_url?: string
          ceo_name?: string | null
          check_interval_hours?: number
          company_name?: string
          company_registration_number?: string | null
          company_size?: string | null
          consecutive_failures?: number
          country?: string | null
          crawl_status?: string | null
          created_at?: string
          email?: string | null
          employees_on_site?: number | null
          employees_total?: number | null
          founding_year?: number | null
          headquarters_city?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_scrape_enabled?: boolean | null
          jobs_found_count?: number | null
          last_crawled_at?: string | null
          last_scheduled_scrape_at?: string | null
          last_success_at?: string | null
          next_check_at?: string
          phone_number?: string | null
          postal_code?: string | null
          scrape_config?: Json | null
          scrape_progress_current_page?: string | null
          scrape_progress_jobs_found?: number | null
          scrape_progress_pages_scraped?: number | null
          scrape_progress_phase?: string | null
          scrape_schedule?: string | null
          source_config?: Json | null
          source_type?: string | null
          state_province?: string | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          yearly_revenue_usd?: number | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          stripe_session_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          stripe_session_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          stripe_session_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      cv_access_log: {
        Row: {
          accessed_at: string
          accessed_by: string
          application_id: string | null
          id: string
          resume_path: string
          subject_user_id: string
        }
        Insert: {
          accessed_at?: string
          accessed_by: string
          application_id?: string | null
          id?: string
          resume_path: string
          subject_user_id: string
        }
        Update: {
          accessed_at?: string
          accessed_by?: string
          application_id?: string | null
          id?: string
          resume_path?: string
          subject_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cv_access_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      dismissed_jobs: {
        Row: {
          company_name: string | null
          dismissed_at: string
          id: string
          job_id: string
          job_title: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          dismissed_at?: string
          id?: string
          job_id: string
          job_title?: string | null
          user_id: string
        }
        Update: {
          company_name?: string | null
          dismissed_at?: string
          id?: string
          job_id?: string
          job_title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_notes: string | null
          created_at: string
          description: string
          id: string
          page_url: string | null
          screenshot_url: string | null
          status: string
          submitter_email: string | null
          submitter_name: string | null
          title: string
          type: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          description: string
          id?: string
          page_url?: string | null
          screenshot_url?: string | null
          status?: string
          submitter_email?: string | null
          submitter_name?: string | null
          title: string
          type: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          description?: string
          id?: string
          page_url?: string | null
          screenshot_url?: string | null
          status?: string
          submitter_email?: string | null
          submitter_name?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      generated_jobs: {
        Row: {
          generated_at: string
          id: string
          jobs: Json
          user_id: string
        }
        Insert: {
          generated_at?: string
          id?: string
          jobs: Json
          user_id: string
        }
        Update: {
          generated_at?: string
          id?: string
          jobs?: Json
          user_id?: string
        }
        Relationships: []
      }
      job_cart: {
        Row: {
          created_at: string
          id: string
          job_data: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_data: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_data?: Json
          user_id?: string
        }
        Relationships: []
      }
      job_opportunities: {
        Row: {
          city: string | null
          closed_at: string | null
          closing_date: string | null
          company_career_site_id: string | null
          content_hash: string | null
          created_at: string
          department: string | null
          description: string | null
          employment_type: string | null
          experience_level: string | null
          first_seen_at: string
          id: string
          is_foreign: boolean
          is_internship: boolean | null
          is_remote: boolean | null
          job_title: string
          job_url: string
          last_seen_at: string
          location: string | null
          miss_count: number
          posted_date: string | null
          province: string | null
          requirements: string | null
          salary_range: string | null
          scraped_at: string
          status: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          city?: string | null
          closed_at?: string | null
          closing_date?: string | null
          company_career_site_id?: string | null
          content_hash?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          employment_type?: string | null
          experience_level?: string | null
          first_seen_at?: string
          id?: string
          is_foreign?: boolean
          is_internship?: boolean | null
          is_remote?: boolean | null
          job_title: string
          job_url: string
          last_seen_at?: string
          location?: string | null
          miss_count?: number
          posted_date?: string | null
          province?: string | null
          requirements?: string | null
          salary_range?: string | null
          scraped_at?: string
          status?: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          city?: string | null
          closed_at?: string | null
          closing_date?: string | null
          company_career_site_id?: string | null
          content_hash?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          employment_type?: string | null
          experience_level?: string | null
          first_seen_at?: string
          id?: string
          is_foreign?: boolean
          is_internship?: boolean | null
          is_remote?: boolean | null
          job_title?: string
          job_url?: string
          last_seen_at?: string
          location?: string | null
          miss_count?: number
          posted_date?: string | null
          province?: string | null
          requirements?: string | null
          salary_range?: string | null
          scraped_at?: string
          status?: string
          updated_at?: string
          verified?: boolean
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
      job_saved_items: {
        Row: {
          created_at: string
          id: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_saved_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      job_saved_searches: {
        Row: {
          created_at: string
          criteria: Json
          email_enabled: boolean
          id: string
          last_notified_at: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          email_enabled?: boolean
          id?: string
          last_notified_at?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          email_enabled?: boolean
          id?: string
          last_notified_at?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      payments: {
        Row: {
          amount: number
          created_at: string
          credits: number | null
          currency: string
          id: string
          mollie_payment_id: string | null
          package_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credits?: number | null
          currency?: string
          id?: string
          mollie_payment_id?: string | null
          package_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credits?: number | null
          currency?: string
          id?: string
          mollie_payment_id?: string | null
          package_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      pipeline_snapshots: {
        Row: {
          companies_active: number
          companies_added_7d: number
          companies_dead: number
          companies_total: number
          id: string
          jobs_added_7d: number
          jobs_closed_7d: number
          jobs_closed_total: number
          jobs_open: number
          jobs_verified_open: number
          notes: string | null
          taken_at: string
        }
        Insert: {
          companies_active: number
          companies_added_7d: number
          companies_dead: number
          companies_total: number
          id?: string
          jobs_added_7d: number
          jobs_closed_7d: number
          jobs_closed_total: number
          jobs_open: number
          jobs_verified_open: number
          notes?: string | null
          taken_at?: string
        }
        Update: {
          companies_active?: number
          companies_added_7d?: number
          companies_dead?: number
          companies_total?: number
          id?: string
          jobs_added_7d?: number
          jobs_closed_7d?: number
          jobs_closed_total?: number
          jobs_open?: number
          jobs_verified_open?: number
          notes?: string | null
          taken_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          city: string | null
          created_at: string
          cv_structured: Json | null
          experience: string | null
          extra_email: string | null
          extra_email_password: string | null
          free_credits_claimed: boolean | null
          full_name: string | null
          id: string
          job_title: string | null
          phone_number: string | null
          referral_code: string | null
          referred_by: string | null
          resume_url: string | null
          skills: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          cv_structured?: Json | null
          experience?: string | null
          extra_email?: string | null
          extra_email_password?: string | null
          free_credits_claimed?: boolean | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          phone_number?: string | null
          referral_code?: string | null
          referred_by?: string | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          cv_structured?: Json | null
          experience?: string | null
          extra_email?: string | null
          extra_email_password?: string | null
          free_credits_claimed?: boolean | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          phone_number?: string | null
          referral_code?: string | null
          referred_by?: string | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pwa_analytics: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          is_pwa: boolean
          session_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          is_pwa?: boolean
          session_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          is_pwa?: boolean
          session_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          hit_at: string
          id: number
        }
        Insert: {
          bucket: string
          hit_at?: string
          id?: never
        }
        Update: {
          bucket?: string
          hit_at?: string
          id?: never
        }
        Relationships: []
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          referred_credits_awarded: number | null
          referred_id: string
          referrer_credits_awarded: number | null
          referrer_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referred_credits_awarded?: number | null
          referred_id: string
          referrer_credits_awarded?: number | null
          referrer_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referred_credits_awarded?: number | null
          referred_id?: string
          referrer_credits_awarded?: number | null
          referrer_id?: string
          status?: string
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
          method: string | null
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
          method?: string | null
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
          method?: string | null
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
      settings_activity_log: {
        Row: {
          created_at: string
          id: string
          new_value: string
          old_value: string | null
          setting_key: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_value: string
          old_value?: string | null
          setting_key: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_value?: string
          old_value?: string | null
          setting_key?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string
          credits: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_free_credits: { Args: { p_amount: number }; Returns: boolean }
      credit_for_mollie_payment: {
        Args: { p_payment_id: string }
        Returns: boolean
      }
      get_client_display_profiles: {
        Args: { _user_ids: string[] }
        Returns: {
          extra_email: string
          full_name: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_or_admin: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      job_geo_counts: { Args: never; Returns: Json }
      job_stats: { Args: never; Returns: Json }
      prune_rate_limit_hits: {
        Args: { _older_than?: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      spend_credits: {
        Args: { p_amount: number; p_description?: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "supporter" | "user"
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
      app_role: ["admin", "supporter", "user"],
    },
  },
} as const
