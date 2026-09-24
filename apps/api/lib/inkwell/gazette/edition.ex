defmodule Inkwell.Gazette.Edition do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  schema "gazette_editions" do
    field :number, :integer
    field :slot, :string
    field :published_at, :utc_datetime_usec
    # %{"items" => [story snapshot, ...]} in page order
    field :stories, :map, default: %{}
    field :story_count, :integer, default: 0

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(edition, attrs) do
    edition
    |> cast(attrs, [:number, :slot, :published_at, :stories, :story_count])
    |> validate_required([:number, :slot, :published_at])
    |> validate_inclusion(:slot, ~w(morning evening))
    |> unique_constraint(:number)
  end
end
