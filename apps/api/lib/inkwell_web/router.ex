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

    # User icons
    get "/me/icons", UserIconController, :index
    post "/me/icons", UserIconController, :create
    delete "/me/icons/:id", UserIconController, :delete

    # Entries (CRUD)
    post "/entries", EntryController, :create
    patch "/entries/:id", EntryController, :update
    delete "/entries/:id", EntryController, :delete

    # Comments
    post "/entries/:entry_id/comments", CommentController, :create
    delete "/comments/:id", CommentController, :delete

    # Reading feed
    get "/feed", FeedController, :reading_feed

    # Relationships
    get "/friends", RelationshipController, :friends
    get "/followers", RelationshipController, :followers
    get "/following", RelationshipController, :following
    post "/relationships/:username/follow", RelationshipController, :follow
    post "/relationships/:username/accept", RelationshipController, :accept
    delete "/relationships/:username/unfollow", RelationshipController, :unfollow
    post "/relationships/:username/block", RelationshipController, :block

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
  end

  # Health check — used by Fly.io to confirm the machine is alive
  scope "/", InkwellWeb do
    pipe_through :api
    get "/health", HealthController, :check
  end

  # ActivityPub / Federation endpoints (handled by Phoenix, data from Fedify)
  scope "/", InkwellWeb do
    get "/.well-known/webfinger", FederationController, :webfinger
    get "/.well-known/nodeinfo", FederationController, :nodeinfo
    get "/users/:username/outbox", FederationController, :outbox
    post "/users/:username/inbox", FederationController, :inbox
    post "/inbox", FederationController, :shared_inbox
  end
end
