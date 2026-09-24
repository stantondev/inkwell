defmodule Inkwell.Gazette.Story do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "gazette_stories" do
    field :url, :string
    field :title, :string
    field :description, :string
    field :image_url, :string
    field :image_description, :string
    field :blurhash, :string
    field :provider_name, :string
    field :provider_url, :string
    field :author_name, :string
    field :language, :string
    field :article_published_at, :utc_datetime_usec
    field :opinion, :boolean, default: false
    field :topics, {:array, :string}, default: []
    field :shares_today, :integer, default: 0
    field :shares_week, :integer, default: 0
    field :trending_on, {:array, :string}, default: []
    field :first_seen_at, :utc_datetime_usec
    field :last_seen_at, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec)
  end

  @fields ~w(url title description image_url image_description blurhash provider_name
             provider_url author_name language article_published_at opinion topics
             shares_today shares_week trending_on first_seen_at last_seen_at)a

  def changeset(story, attrs) do
    story
    |> cast(attrs, @fields)
    |> validate_required([:url, :title, :first_seen_at, :last_seen_at])
    |> unique_constraint(:url)
  end
end
