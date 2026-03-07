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
    field :source, :string

    belongs_to :remote_actor, Inkwell.Federation.RemoteActorSchema
    belongs_to :relay_subscription, Inkwell.Federation.RelaySubscription

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(entry, attrs) do
    entry
    |> cast(attrs, [:ap_id, :url, :title, :body_html, :tags, :published_at, :remote_actor_id, :sensitive, :content_warning, :source, :relay_subscription_id])
    |> validate_required([:ap_id, :body_html, :remote_actor_id])
    |> unique_constraint(:ap_id)
  end
end
