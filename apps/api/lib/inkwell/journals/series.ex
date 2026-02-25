defmodule Inkwell.Journals.Series do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "series" do
    field :title, :string
    field :description, :string
    field :slug, :string
    field :cover_image_id, :binary_id
    field :status, Ecto.Enum, values: [:ongoing, :completed], default: :ongoing

    belongs_to :user, Inkwell.Accounts.User
    has_many :entries, Inkwell.Journals.Entry

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(series, attrs) do
    series
    |> cast(attrs, [:title, :description, :cover_image_id, :status, :user_id])
    |> validate_required([:title, :user_id])
    |> validate_length(:title, max: 200)
    |> validate_length(:description, max: 2000)
    |> maybe_generate_slug()
    |> unique_constraint([:user_id, :slug])
  end

  defp maybe_generate_slug(changeset) do
    case {get_field(changeset, :slug), get_change(changeset, :title)} do
      {nil, nil} ->
        put_change(changeset, :slug, Ecto.UUID.generate() |> String.slice(0..7))

      {nil, title} when is_binary(title) ->
        slug =
          title
          |> String.downcase()
          |> String.replace(~r/[^a-z0-9\s-]/, "")
          |> String.replace(~r/\s+/, "-")
          |> String.slice(0..80)
          |> String.trim("-")

        slug = if slug == "", do: Ecto.UUID.generate() |> String.slice(0..7), else: slug
        put_change(changeset, :slug, slug)

      _ ->
        changeset
    end
  end
end
