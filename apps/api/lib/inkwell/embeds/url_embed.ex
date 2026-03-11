defmodule Inkwell.Embeds.UrlEmbed do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  schema "url_embeds" do
    field :url_hash, :string
    field :url, :string
    field :title, :string
    field :description, :string
    field :thumbnail_url, :string
    field :author_name, :string
    field :author_url, :string
    field :provider_name, :string
    field :provider_url, :string
    field :site_name, :string
    field :embed_type, :string, default: "link"
    field :published_at, :string
    field :fetched_at, :utc_datetime_usec

    timestamps()
  end

  def changeset(embed, attrs) do
    embed
    |> cast(attrs, [
      :url_hash, :url, :title, :description, :thumbnail_url,
      :author_name, :author_url, :provider_name, :provider_url,
      :site_name, :embed_type, :published_at, :fetched_at
    ])
    |> validate_required([:url_hash, :url, :fetched_at])
    |> unique_constraint(:url_hash)
    |> validate_length(:title, max: 300)
    |> validate_length(:description, max: 500)
    |> validate_length(:url, max: 2048)
    |> validate_length(:thumbnail_url, max: 2048)
    |> validate_length(:author_name, max: 200)
    |> validate_length(:provider_name, max: 200)
    |> validate_length(:site_name, max: 200)
  end
end
