defmodule InkwellWeb.Router do
  use InkwellWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
    plug :put_secure_browser_headers
  end

  pipeline :authenticated do
    plug InkwellWeb.Plugs.RequireAuth
  end

  pipeline :admin do
    plug InkwellWeb.Plugs.RequireAdmin
  end

  pipeline :optional_auth do
    plug InkwellWeb.Plugs.OptionalAuth
  end

  pipeline :rate_limited do
    plug InkwellWeb.Plugs.RateLimit, max_requests: 5, window_seconds: 300
  end

  pipeline :api_key_rate_limited do
    plug InkwellWeb.Plugs.ApiKeyRateLimit
  end

  pipeline :write_scope do
    plug InkwellWeb.Plugs.RequireWriteScope
  end

  # Rate-limited auth endpoints
  scope "/api", InkwellWeb do
    pipe_through [:api, :rate_limited]

    post "/auth/magic-link", AuthController, :send_magic_link
    post "/auth/fediverse/initiate", FediverseAuthController, :initiate
  end

  # Public API — no auth required
  scope "/api", InkwellWeb do
    pipe_through :api

    # Auth
    get "/auth/verify", AuthController, :verify_magic_link
    delete "/auth/session", AuthController, :sign_out
    post "/auth/fediverse/callback", FediverseAuthController, :callback

    # Public profiles and entries (index/show moved to optional_auth for privacy)
    get "/users/:username/entries/:slug/comments", CommentController, :index

    # Guestbook (public read)
    get "/users/:username/guestbook", GuestbookController, :index

    # RSS feeds
    get "/users/:username/feed.xml", FeedController, :user_feed
    get "/tags/:tag/feed.xml", FeedController, :tag_feed

    # Images (public serving)
    get "/images/:id", EntryImageController, :show

    # Avatar/banner serving (public, for federation)
    get "/avatars/:username", UserController, :serve_avatar
    get "/banners/:username", UserController, :serve_banner

    # Search
    get "/search", SearchController, :search
    get "/search/fediverse", SearchController, :fediverse

    # Username availability check (public)
    get "/username-available", UserController, :username_available

    # Invite link info (public)
    get "/invite-link/:code", InvitationController, :show_inviter
    get "/invite-token/:token", InvitationController, :show_invite

    # Stripe webhook (public, verified by signature)
    post "/billing/webhook", BillingController, :webhook

    # Newsletter (public fixed routes — must come before :username param routes)
    get "/newsletter/confirm", NewsletterController, :confirm
    get "/newsletter/unsubscribe", NewsletterController, :unsubscribe
  end

  # Public endpoints with optional auth (for personalized data)
  scope "/api", InkwellWeb do
    pipe_through [:api, :optional_auth]

    # Trending entries (optional auth for my_ink)
    get "/explore/trending", ExploreController, :trending

    # Public discovery feed (optional auth for my_stamp)
    get "/explore", ExploreController, :index

    # Entry listing and detail (optional auth for privacy — private/friends_only)
    get "/users/:username/entries", EntryController, :index
    get "/users/:username/entries/:slug", EntryController, :show

    get "/feedback", FeedbackController, :index
    get "/feedback/roadmap", FeedbackController, :roadmap
    get "/feedback/releases", FeedbackController, :releases
    get "/feedback/:id", FeedbackController, :show

    # Polls (optional auth for my_vote; /polls/active must precede /polls/:id)
    get "/polls", PollController, :index
    get "/polls/active", PollController, :active_widget
    get "/polls/:id", PollController, :show
    get "/polls/:id/comments", PollController, :list_comments

    # Comments by entry ID (optional auth for visibility check)
    get "/entries/:entry_id/comments", CommentController, :index_by_entry

    # Stamps (optional auth: author sees who stamped)
    get "/entries/:entry_id/stamps", StampController, :index

    # @mention search (must be before /users/:username to avoid matching as username)
    get "/users/mention-search", UserController, :mention_search

    # User profile (optional auth for relationship status)
    get "/users/:username", UserController, :show

    # Series (public)
    get "/users/:username/series", SeriesController, :index
    get "/users/:username/series/:slug", SeriesController, :show
  end

  # Authenticated API (with API key rate limiting and write scope enforcement)
  scope "/api", InkwellWeb do
    pipe_through [:api, :authenticated, :api_key_rate_limited, :write_scope]

    # API key management (session-only — controller rejects API key auth)
    get "/api-keys", ApiKeyController, :index
    post "/api-keys", ApiKeyController, :create
    delete "/api-keys/:id", ApiKeyController, :revoke

    # Auth session
    get "/auth/me", AuthController, :me

    # Fediverse account linking
    get "/auth/fediverse/accounts", FediverseAuthController, :list_accounts
    delete "/auth/fediverse/accounts/:id", FediverseAuthController, :unlink
    post "/auth/fediverse/link", FediverseAuthController, :initiate_link

    # Discovery
    get "/discover/writers", UserController, :suggested

    # Current user
    get "/me", UserController, :me
    patch "/me", UserController, :update
    patch "/me/profile", UserController, :update_profile
    post "/me/avatar", UserController, :upload_avatar
    post "/me/banner", UserController, :upload_banner
    post "/me/background", UserController, :upload_background
    delete "/me", UserController, :delete_account

    # Data export
    post "/me/export", ExportController, :create
    get "/me/export", ExportController, :status
    get "/me/export/download", ExportController, :download

    # Data import
    post "/me/import", ImportController, :create
    get "/me/import", ImportController, :status
    post "/me/import/cancel", ImportController, :cancel

    # User icons
    get "/me/icons", UserIconController, :index
    post "/me/icons", UserIconController, :create
    delete "/me/icons/:id", UserIconController, :delete

    # Image uploads
    post "/images", EntryImageController, :create

    # Entries (CRUD)
    get "/drafts", EntryController, :list_drafts
    get "/entries/:id", EntryController, :show_own
    post "/entries", EntryController, :create
    patch "/entries/:id", EntryController, :update
    delete "/entries/:id", EntryController, :delete
    post "/entries/:id/publish", EntryController, :publish

    # Entry versions (history)
    get "/entries/:entry_id/versions", EntryVersionController, :index
    get "/entries/:entry_id/versions/:id", EntryVersionController, :show
    post "/entries/:entry_id/versions/:id/restore", EntryVersionController, :restore

    # Comments
    post "/entries/:entry_id/comments", CommentController, :create
    patch "/comments/:id", CommentController, :update
    delete "/comments/:id", CommentController, :delete

    # Stamps
    post "/entries/:entry_id/stamp", StampController, :create
    delete "/entries/:entry_id/stamp", StampController, :delete

    # Inks (discovery signal)
    post "/entries/:entry_id/ink", InkController, :toggle

    # Bookmarks (reading list)
    post "/entries/:entry_id/bookmark", BookmarkController, :create
    delete "/entries/:entry_id/bookmark", BookmarkController, :delete
    get "/bookmarks", BookmarkController, :index

    # Reading feed
    get "/feed", FeedController, :reading_feed

    # Relationships
    get "/friends", RelationshipController, :friends
    get "/followers", RelationshipController, :followers
    get "/following", RelationshipController, :following
    get "/pen-pals", RelationshipController, :pen_pals
    get "/readers", RelationshipController, :readers
    get "/reading", RelationshipController, :reading
    post "/relationships/:username/follow", RelationshipController, :follow
    post "/relationships/:username/accept", RelationshipController, :accept
    delete "/relationships/:username/unfollow", RelationshipController, :unfollow
    post "/relationships/:username/block", RelationshipController, :block
    delete "/relationships/:username/block", RelationshipController, :unblock
    delete "/relationships/:username/reject", RelationshipController, :reject
    get "/blocked-users", RelationshipController, :blocked_users

    # Username
    patch "/me/username", UserController, :update_username

    # Series (management)
    get "/series", SeriesController, :list_own
    post "/series", SeriesController, :create
    patch "/series/:id", SeriesController, :update
    delete "/series/:id", SeriesController, :delete
    put "/series/:id/entries", SeriesController, :reorder

    # Friend filters
    get "/filters", FriendFilterController, :index
    post "/filters", FriendFilterController, :create
    patch "/filters/:id", FriendFilterController, :update
    delete "/filters/:id", FriendFilterController, :delete

    # Top friends
    get "/me/top-friends", TopFriendController, :index
    put "/me/top-friends", TopFriendController, :update

    # Notifications
    get "/notifications", NotificationController, :index
    post "/notifications/read", NotificationController, :mark_read

    # Feedback / Roadmap
    post "/feedback", FeedbackController, :create
    patch "/feedback/:id", FeedbackController, :update
    post "/feedback/:id/vote", FeedbackController, :vote
    delete "/feedback/:id/vote", FeedbackController, :unvote
    post "/feedback/:id/comments", FeedbackController, :create_comment
    delete "/feedback/comments/:comment_id", FeedbackController, :delete_comment

    # Billing (authenticated)
    post "/billing/checkout", BillingController, :checkout
    post "/billing/donor-checkout", BillingController, :donor_checkout
    post "/billing/onboarding-checkout", BillingController, :onboarding_checkout
    post "/billing/portal", BillingController, :portal
    get "/billing/status", BillingController, :status

    # Remote entry interactions (federated)
    post "/remote-entries/:id/stamp", RemoteEntryController, :stamp
    delete "/remote-entries/:id/stamp", RemoteEntryController, :unstamp
    post "/remote-entries/:id/ink", RemoteEntryController, :toggle_ink
    get "/remote-entries/:id/comments", RemoteEntryController, :list_comments
    post "/remote-entries/:id/comments", RemoteEntryController, :create_comment

    # Fediverse follow (requires auth)
    post "/search/fediverse/follow", SearchController, :fediverse_follow

    # Guestbook (authenticated actions)
    post "/users/:username/guestbook", GuestbookController, :create
    delete "/guestbook/:id", GuestbookController, :delete

    # Letters (private messaging between pen pals)
    get  "/conversations",                              ConversationController, :index
    post "/conversations",                              ConversationController, :create
    get  "/conversations/:id",                          ConversationController, :show
    post "/conversations/:id/read",                     ConversationController, :mark_read
    post "/conversations/:id/letters",                  LetterController, :create
    patch "/conversations/:id/letters/:letter_id",      LetterController, :update
    delete "/conversations/:id/letters/:letter_id",     LetterController, :delete

    # Tipping / Stripe Connect (authenticated)
    post "/tipping/connect", TippingController, :connect
    get "/tipping/connect/status", TippingController, :status
    post "/tipping/connect/dashboard", TippingController, :dashboard
    post "/tipping/connect/disconnect", TippingController, :disconnect
    post "/tipping/connect/refresh", TippingController, :refresh

    # Tips (authenticated)
    post "/tips", TippingController, :create_tip
    post "/tips/:id/confirm", TippingController, :confirm_tip
    get "/tips/received", TippingController, :tips_received
    get "/tips/sent", TippingController, :tips_sent
    get "/tips/stats", TippingController, :tip_stats

    # Polls (authenticated)
    post "/polls/:id/vote", PollController, :vote
    patch "/polls/:id", PollController, :update_entry_poll
    post "/entries/:entry_id/poll", PollController, :create_entry_poll
    post "/polls/:id/comments", PollController, :create_comment
    delete "/polls/comments/:comment_id", PollController, :delete_comment

    # Content reports (authenticated)
    post "/entries/:entry_id/report", ReportController, :create

    # Invitations (authenticated)
    get "/invite-code", InvitationController, :get_code
    get "/invitations", InvitationController, :index
    get "/invitations/stats", InvitationController, :stats
    post "/invitations", InvitationController, :create

    # Newsletter (authenticated endpoints)
    get "/newsletter/settings", NewsletterController, :get_settings
    patch "/newsletter/settings", NewsletterController, :update_settings
    get "/newsletter/subscribers", NewsletterController, :list_subscribers
    delete "/newsletter/subscribers/:id", NewsletterController, :remove_subscriber
    post "/newsletter/send", NewsletterController, :send_newsletter
    get "/newsletter/sends", NewsletterController, :list_sends
    delete "/newsletter/sends/:id", NewsletterController, :cancel_send
    get "/newsletter/stats", NewsletterController, :stats
  end

  # Newsletter public parameterized routes — MUST be after the authenticated scope
  # so GET /newsletter/settings (static) matches before GET /newsletter/:username
  scope "/api", InkwellWeb do
    pipe_through :api

    get "/newsletter/:username", NewsletterController, :subscribe_page
    post "/newsletter/:username/subscribe", NewsletterController, :subscribe
  end

  # Admin API (requires auth + admin role)
  scope "/api/admin", InkwellWeb do
    pipe_through [:api, :authenticated, :admin]

    # Dashboard stats
    get "/stats", AdminController, :stats

    # User management
    get "/users", AdminController, :list_users
    get "/users/:id", AdminController, :show_user
    patch "/users/:id/role", AdminController, :set_role
    post "/users/:id/block", AdminController, :block_user
    post "/users/:id/unblock", AdminController, :unblock_user
    delete "/users/:id", AdminController, :delete_user

    # Entry management
    get "/entries", AdminController, :list_entries
    delete "/entries/:id", AdminController, :delete_entry
    post "/entries/:id/mark-sensitive", AdminController, :mark_sensitive
    post "/entries/:id/unmark-sensitive", AdminController, :unmark_sensitive

    # Polls (admin)
    get "/polls", PollController, :admin_index
    post "/polls", PollController, :create_platform
    post "/polls/:id/close", PollController, :close
    delete "/polls/:id", PollController, :delete

    # Content reports (admin)
    get "/reports", ReportController, :index
    patch "/reports/:id", ReportController, :update
  end

  # Health check — used by Fly.io and external monitors
  scope "/", InkwellWeb do
    pipe_through :api
    get "/health", HealthController, :check
    get "/health/deep", HealthController, :deep
  end

  # ActivityPub / Federation endpoints
  scope "/", InkwellWeb do
    get "/.well-known/webfinger", FederationController, :webfinger
    get "/.well-known/nodeinfo", FederationController, :nodeinfo
    get "/nodeinfo/2.1", FederationController, :nodeinfo_schema

    # Actor endpoint (content negotiation: AP JSON vs browser redirect)
    get "/users/:username", FederationController, :actor
    get "/users/:username/outbox", FederationController, :outbox
    get "/users/:username/followers", FederationController, :followers
    get "/users/:username/following", FederationController, :following
    post "/users/:username/inbox", FederationController, :inbox
    post "/inbox", FederationController, :shared_inbox
  end
end
