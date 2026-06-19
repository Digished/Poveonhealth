/** The full set of toggleable LabRole permission flags (shared by role routes). */
export const ROLE_PERMISSION_KEYS = [
  "can_view_requests",
  "can_mark_seen",
  "can_mark_done",
  "can_send_results",
  "can_manage_team",
  "can_manage_api_keys",
  "can_view_referrals",
  "can_view_clients",
  "can_view_analytics",
  "can_view_activity",
  "can_view_feedback",
  "can_view_wallet",
  "can_view_marketers",
  "can_manage_roles",
  "can_manage_professionals",
  "can_manage_templates",
] as const;
