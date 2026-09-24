defmodule Inkwell.Letters.DirectMessage do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  # The editor uploads pictures and links to them, so a letter's HTML stays
  # small. The sanitizer does allow inline data: images, though, and without a
  # cap one letter could carry megabytes into every load of the thread.
  @max_html 200_000

  schema "direct_messages" do
    field :body, :string
    field :body_html, :string
    field :edited_at, :utc_datetime_usec
    field :deleted_by_a, :boolean, default: false
    field :deleted_by_b, :boolean, default: false

    belongs_to :conversation, Inkwell.Letters.Conversation
    # A letter from a fediverse account has no sender, only sender_remote_actor,
    # and ap_id is the Note it arrived as. Letters we send there get ap_id too.
    belongs_to :sender, Inkwell.Accounts.User, foreign_key: :sender_id
    belongs_to :sender_remote_actor, Inkwell.Federation.RemoteActorSchema, foreign_key: :sender_remote_actor_id
    field :ap_id, :string

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(message, attrs) do
    message
    |> cast(attrs, [:conversation_id, :sender_id, :body, :body_html])
    |> Inkwell.HtmlSanitizer.sanitize_change(:body_html)
    |> validate_required([:conversation_id, :sender_id, :body])
    |> validate_length(:body, min: 1, max: 10_000)
    |> validate_length(:body_html, max: @max_html)
  end

  @doc "A letter that arrived from a fediverse account."
  def remote_changeset(message, attrs) do
    message
    |> cast(attrs, [:conversation_id, :sender_remote_actor_id, :ap_id, :body, :body_html])
    |> Inkwell.HtmlSanitizer.sanitize_change(:body_html)
    |> validate_required([:conversation_id, :sender_remote_actor_id, :ap_id, :body])
    |> validate_length(:body, min: 1, max: 10_000)
    |> validate_length(:body_html, max: @max_html)
    |> unique_constraint(:ap_id, name: :direct_messages_ap_id_index)
  end

  def edit_changeset(message, attrs) do
    message
    |> cast(attrs, [:body, :body_html])
    |> Inkwell.HtmlSanitizer.sanitize_change(:body_html)
    |> validate_required([:body])
    |> validate_length(:body, min: 1, max: 10_000)
    |> validate_length(:body_html, max: @max_html)
    |> put_change(:edited_at, DateTime.utc_now() |> DateTime.truncate(:microsecond))
  end
end
