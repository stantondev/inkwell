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

  # Public API — no auth required
  scope "/api", InkwellWeb do
    pipe_through :api

    # Auth
    post "/auth/magic-link", AuthController, :send_magic_link
    get "/auth/verify", AuthController, :verify_magic_link
    delete "/auth/session", AuthController, :sign_out

    # Public profiles and entries
    get "/users/:username", UserController, :show
    get "/users/:username/entries", EntryController, :index
    get "/users/:username/entries/:slug", EntryController, :show
    get "/users/:username/entries/:slug/comments", CommentController, :index

    # RSS feeds
    get "/users/:username/feed.xml", FeedController, :user_feed
    get "/tags/:tag/feed.xml", FeedController, :tag_feed

    # Search
    get "/search", SearchController, :search
    get "/search/fediverse", SearchController, :fediverse

    # Username availability check (public)
    get "/username-available", UserController, :username_available

    # Public discovery feed
    get "/explore", ExploreController, :index

    # Stripe webhook (public, verified by signature)
    post "/billing/webhook", BillingController, :webhook
  end

  # Public feedback with optional auth (for vote status)
  scope "/api", InkwellWeb do
    pipe_through [:api, :optional_auth]

    get "/feedback", FeedbackController, :index
    get "/feedback/roadmap", FeedbackController, :roadmap
    get "/feedback/releases", FeedbackController, :releases
    get "/feedback/:id", FeedbackController, :show

    # Stamps (optional auth: author sees who stamped)
    get "/entries/:entry_id/stamps", StampController, :index
  end

  # Authenticated API
  scope "/api", InkwellWeb do
    pipe_through [:api, :authenticated]

    # Auth session
    get "/auth/me", AuthController, :me

    # Current user
    get "/me", UserController, :me
    patch "/me", UserController, :update
    patch "/me/profile", UserController, :update_profile
    post "/me/avatar", UserController, :upload_avatar

    # User icons
    get "/me/icons", UserIconController, :index
    post "/me/icons", UserIconController, :create
    delete "/me/icons/:id", UserIconController, :delete

    # Entries (CRUD)
    get "/entries/:id", EntryController, :show_own
    post "/entries", EntryController, :create
    patch "/entries/:id", EntryController, :update
    delete "/entries/:id", EntryController, :delete

    # Comments
    post "/entries/:entry_id/comments", CommentController, :create
    delete "/comments/:id", CommentController, :delete

    # Stamps
    post "/entries/:entry_id/stamp", StampController, :create
    delete "/entries/:entry_id/stamp", StampController, :delete

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
    delete "/relationships/:username/reject", RelationshipController, :reject

    # Username
    patch "/me/username", UserController, :update_username

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
    post "/billing/portal", BillingController, :portal
    get "/billing/status", BillingController, :status

    # Fediverse follow (requires auth)
    post "/search/fediverse/follow", SearchController, :fediverse_follow
  end

  # Admin API (requires auth + admin role)
  scope "/api/admin", InkwellWeb do
    pipe_through [:api, :authenticated, :admin]

    get "/entries", AdminController, :list_entries
    delete "/entries/:id", AdminController, :delete_entry
  end

  # Health check — used by Fly.io to confirm the machine is alive
  scope "/", InkwellWeb do
    pipe_through :api
    get "/health", HealthController, :check
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
