export type Json = string | number | boolean | null | {
  [key: string]: Json | undefined
} | Json[]

export type TripRole = "owner" | "member"
export type TripStatus = "active" | "settled" | "archived"
export type ExpenseCategory = "food" | "transport" | "accommodation" | "tickets" | "shopping" | "other"
export type AuditAction = "create" | "update" | "soft_delete" | "restore" | "join" | "remove" | "role_change" | "settle" | "archive"

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; name: string; email: string; avatar_path: string | null; is_platform_admin: boolean; created_at: string; updated_at: string
        }
        Insert: {
          id: string; name: string; email: string; avatar_path?: string | null; is_platform_admin?: boolean
        }
        Update: { name?: string; avatar_path?: string | null }
      }
      trips: {
        Row: {
          id: string; name: string; destination: string; start_date: string; end_date: string; base_currency: string; status: TripStatus
          created_by: string; created_at: string; updated_by: string; updated_at: string
        }
        Insert: {
          id?: string; name: string; destination: string; start_date: string; end_date: string; base_currency: string; created_by: string; updated_by: string
        }
        Update: {
          name?: string; destination?: string; start_date?: string; end_date?: string; status?: TripStatus
          updated_by?: string
        }
      }
      trip_members: {
        Row: {
          trip_id: string; user_id: string; role: TripRole
          joined_at: string; invited_by: string | null
        }
        Insert: {
          trip_id: string; user_id: string; role?: TripRole
          invited_by?: string | null
        }
        Update: { role?: TripRole }
      }
      trip_invites: {
        Row: {
          id: string; trip_id: string; code: string; created_by: string; created_at: string; expires_at: string; max_uses: number | null; use_count: number; revoked_at: string | null
        }
        Insert: {
          trip_id: string; code: string; created_by: string; expires_at: string; max_uses?: number | null
        }
        Update: { use_count?: number; revoked_at?: string | null }
      }
      expenses: {
        Row: {
          id: string; trip_id: string; description: string; amount_minor: number; currency: string; category: ExpenseCategory
          expense_date: string; notes: string | null; receipt_path: string | null; created_by: string; created_at: string; updated_by: string; updated_at: string; deleted_by: string | null; deleted_at: string | null
        }
        Insert: {
          trip_id: string; description: string; amount_minor: number; currency: string; category: ExpenseCategory
          expense_date: string; notes?: string | null; receipt_path?: string | null; created_by: string; updated_by: string
        }
        Update: {
          description?: string; amount_minor?: number; category?: ExpenseCategory
          expense_date?: string; notes?: string | null; receipt_path?: string | null; updated_by?: string
        }
      }
      expense_payers: {
        Row: {
          id: string; expense_id: string; user_id: string; amount_paid_minor: number
        }
        Insert: { expense_id: string; user_id: string; amount_paid_minor: number }
        Update: { amount_paid_minor?: number }
      }
      expense_splits: {
        Row: {
          id: string; expense_id: string; user_id: string; amount_owed_minor: number
        }
        Insert: { expense_id: string; user_id: string; amount_owed_minor: number }
        Update: { amount_owed_minor?: number }
      }
      settlements: {
        Row: {
          id: string; trip_id: string; from_user_id: string; to_user_id: string; amount_minor: number; payment_method: string; reference: string | null; note: string | null; settled_at: string; recorded_by: string; created_at: string; updated_by: string; updated_at: string; deleted_by: string | null; deleted_at: string | null
        }
        Insert: {
          trip_id: string; from_user_id: string; to_user_id: string; amount_minor: number; payment_method: string; reference?: string | null; note?: string | null; settled_at: string; recorded_by: string; updated_by: string
        }
        Update: {
          payment_method?: string; reference?: string | null; note?: string | null
        }
      }
      audit_logs: {
        Row: {
          id: number; trip_id: string; actor_user_id: string; entity_type: string; entity_id: string; action: AuditAction
          previous_values: Json | null
          new_values: Json | null
          changed_fields: string[]
          request_id: string; created_at: string
        }
        Insert: {
          trip_id: string; actor_user_id: string; entity_type: string; entity_id: string; action: AuditAction
          previous_values?: Json | null
          new_values?: Json | null
          changed_fields?: string[]
          request_id: string
        }
        Update: never
      }
      mutation_requests: {
        Row: { actor_user_id: string; request_id: string; operation: string; trip_id: string; result: Json | null; created_at: string }
        Insert: { actor_user_id: string; request_id: string; operation: string; trip_id: string; result?: Json | null }
        Update: { result?: Json | null }
      }
      currency_metadata: {
        Row: { code: string; decimals: number; symbol: string }
        Insert: { code: string; decimals: number; symbol: string }
        Update: { decimals?: number; symbol?: string }
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_trip_member: {
        Args: { p_trip_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_trip_owner: {
        Args: { p_trip_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_trip_writable: { Args: { p_trip_id: string }; Returns: boolean }
      is_platform_admin: { Args: { p_user_id?: string }; Returns: boolean }
      create_trip: {
        Args: {
          p_name: string; p_destination: string; p_start_date: string; p_end_date: string; p_base_currency: string; p_invitee_emails?: string[]
        }
        Returns: string
      }
      join_trip_by_code: {
        Args: { p_code: string; p_user_id?: string | null }
        Returns: string
      }
      join_trip_with_email_and_code: {
        Args: { p_email: string; p_code: string; p_name?: string | null }
        Returns: {
          trip_id: string
          user_id: string
          email: string
          name: string
          trip_name: string
          destination: string
          base_currency: string
        }
      }
      save_expense: { Args: { p_payload: Json }; Returns: Json }
      soft_delete_expense: {
        Args: { p_expense_id: string; p_request_id: string; p_user_id?: string | null }
        Returns: void
      }
      restore_expense: {
        Args: { p_expense_id: string; p_request_id: string; p_user_id?: string | null }
        Returns: void
      }
      record_settlement: { Args: { p_payload: Json }; Returns: Json }
      get_trip_details: {
        Args: { p_trip_id: string; p_user_id?: string | null }
        Returns: {
          id: string
          name: string
          destination: string
          start_date: string
          end_date: string
          base_currency: string
          status: string
          created_by: string
          created_at: string
          updated_at: string
          role: string
        }
      }
      get_trip_members_list: {
        Args: { p_trip_id: string; p_user_id?: string | null }
        Returns: {
          user_id: string
          role: string
          joined_at: string
          name: string
          email: string
          avatar_path: string | null
        }[]
      }
      get_trip_expenses_list: {
        Args: { p_trip_id: string; p_user_id?: string | null; p_include_deleted?: boolean }
        Returns: Json
      }
      get_trip_balances: {
        Args: { p_trip_id: string; p_user_id?: string | null }
        Returns: {
          user_id: string; paid_minor: number; owed_minor: number; sent_minor: number; received_minor: number; net_minor: number
        }[]
      }
      list_trip_invites: {
        Args: { p_trip_id: string; p_user_id?: string | null }
        Returns: { id: string; code: string; created_at: string; expires_at: string; max_uses: number | null; use_count: number; revoked_at: string | null; is_active: boolean }[]
      }
      create_trip_invite: {
        Args: { p_trip_id: string; p_expires_in_days?: number; p_max_uses?: number | null; p_user_id?: string | null }
        Returns: { id: string; code: string; expires_at: string }[]
      }
      revoke_trip_invite: { Args: { p_invite_id: string; p_user_id?: string | null }; Returns: void }
      resolve_invite_code: {
        Args: { p_code: string }
        Returns: { trip_id: string; trip_name: string; destination: string }[]
      }
      update_trip: { Args: { p_trip_id: string; p_patch: Json; p_request_id: string; p_user_id?: string | null }; Returns: void }
      change_member_role: {
        Args: { p_trip_id: string; p_user_id: string; p_role: TripRole; p_request_id: string; p_actor_id?: string | null }
        Returns: void
      }
      remove_trip_member: {
        Args: { p_trip_id: string; p_user_id: string; p_request_id: string; p_actor_id?: string | null }
        Returns: void
      }
      mark_trip_settled: { Args: { p_trip_id: string; p_request_id: string; p_user_id?: string | null }; Returns: void }
      reopen_trip: { Args: { p_trip_id: string; p_request_id: string; p_user_id?: string | null }; Returns: void }
      archive_trip: { Args: { p_trip_id: string; p_request_id: string; p_user_id?: string | null }; Returns: void }
      delete_trip: { Args: { p_trip_id: string; p_request_id: string; p_user_id?: string | null }; Returns: void }
      update_profile: { Args: { p_name: string; p_user_id?: string | null }; Returns: void }
      add_trip_member: {
        Args: {
          p_trip_id: string
          p_email: string
          p_role?: TripRole
          p_request_id?: string
          p_user_id?: string | null
        }
        Returns: { userId: string; name: string; email: string }
      }
      get_user_trips: {
        Args: { p_user_id?: string | null }
        Returns: Json
      }
      get_trip_audit_logs: {
        Args: {
          p_trip_id: string
          p_user_id?: string | null
          p_limit?: number
          p_cursor_created_at?: string | null
          p_cursor_id?: number | null
        }
        Returns: Json
      }
    }
    Enums: {
      trip_role: TripRole
      trip_status: TripStatus
      expense_category: ExpenseCategory
      audit_action: AuditAction
    }
  }
}
