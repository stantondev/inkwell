defmodule Inkwell.Federation.RemoteEntry do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "remote_entries" do
    field :ap_id, :string
    field :url, :string
    field :title, :string
    field :body_html, :string
    field :tags, {:array, :string}, default: []
    field :published_at, :utc_datetime_usec
    field :sensitive, :boolean, default: false
    field :content_warning, :string
    field :last_verified_at, :utc_datetime_usec
    field :replies_fetched_at, :utc_datetime_usec
    field :reply_count, :integer, default: 0
    field :likes_count, :integer, default: 0
    field :boosts_count, :integer, default: 0
    field :reprint_count, :integer, default: 0
    field :engagement_refreshed_at, :utc_datetime_usec
    field :source, :string

    # Gazette AI scoring fields (populated on-demand for Plus users)
    field :gazette_is_news, :boolean
    field :gazette_relevance, :float
    field :gazette_topic, :string
    field :gazette_summary, :string
    field :gazette_cluster_id, :string
    field :gazette_scored_at, :utc_datetime_usec

    belongs_to :remote_actor, Inkwell.Federation.RemoteActorSchema
    belongs_to :relay_subscription, Inkwell.Federation.RelaySubscription

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(entry, attrs) do
    entry
    |> cast(attrs, [:ap_id, :url, :title, :body_html, :tags, :published_at, :remote_actor_id, :sensitive, :content_warning, :source, :relay_subscription_id, :replies_fetched_at, :reply_count, :likes_count, :boosts_count, :engagement_refreshed_at, :gazette_is_news, :gazette_relevance, :gazette_topic, :gazette_summary, :gazette_cluster_id, :gazette_scored_at])
    |> validate_required([:ap_id, :body_html, :remote_actor_id])
    |> unique_constraint(:ap_id)
  end
end
