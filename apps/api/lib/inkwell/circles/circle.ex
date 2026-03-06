defmodule Inkwell.Circles.Circle do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "circles" do
    field :name, :string
    field :slug, :string
    field :description, :string
    field :category, Ecto.Enum,
      values: [:writing_craft, :reading_books, :creative_arts, :lifestyle_interests, :tech_learning, :community]
    field :visibility, Ecto.Enum, values: [:public], default: :public
    field :cover_image_id, :binary_id
    field :member_count, :integer, default: 0
    field :discussion_count, :integer, default: 0
    field :is_starter, :boolean, default: false
    field :last_activity_at, :utc_datetime_usec

    belongs_to :owner, Inkwell.Accounts.User
    has_many :members, Inkwell.Circles.CircleMember
    has_many :discussions, Inkwell.Circles.CircleDiscussion

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(circle, attrs) do
    circle
    |> cast(attrs, [:name, :description, :category, :cover_image_id, :owner_id, :visibility, :is_starter])
    |> validate_required([:name, :category, :owner_id])
    |> validate_length(:name, min: 2, max: 100)
    |> validate_length(:description, max: 5000)
    |> generate_slug()
    |> unique_constraint(:slug)
  end

  def update_changeset(circle, attrs) do
    circle
    |> cast(attrs, [:name, :description, :category, :cover_image_id])
    |> validate_length(:name, min: 2, max: 100)
    |> validate_length(:description, max: 5000)
  end

  defp generate_slug(changeset) do
    case get_change(changeset, :name) do
      nil ->
        changeset

      name ->
        base_slug =
          name
          |> String.downcase()
          |> String.replace(~r/[^a-z0-9\s-]/, "")
          |> String.replace(~r/\s+/, "-")
          |> String.replace(~r/-+/, "-")
          |> String.trim("-")
          |> String.slice(0, 80)

        suffix = :crypto.strong_rand_bytes(3) |> Base.url_encode64(padding: false) |> String.slice(0, 4)
        put_change(changeset, :slug, "#{base_slug}-#{suffix}")
    end
  end
end
