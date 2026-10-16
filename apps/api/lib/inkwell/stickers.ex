defmodule Inkwell.Stickers do
  @moduledoc """
  Writers' own stickers for Arrange my page. Each is a picture they uploaded
  (an entry image, so it counts toward their image storage), kept in a
  library they place from, like the Inkwell packs.

  The web app does the cutting out (removing a plain background, trimming
  the edges) in the browser and sends the finished PNG/WebP, or a GIF
  untouched so its animation survives.

  Uploading needs an account at least a week old that isn't held back by the
  spam checker: stickers show on a public page, and a brand-new account
  shouldn't be able to put pictures there before anyone has seen it write.
  """

  import Ecto.Query
  alias Inkwell.{Images, Repo, Storage}
  alias Inkwell.Accounts.User
  alias Inkwell.Stickers.UserSticker

  @free_limit 10
  @plus_limit 50
  @max_bytes 600_000
  @types ~w[png webp gif jpeg]

  def limit(user), do: if(Inkwell.SelfHosted.effective_tier(user) == "plus", do: @plus_limit, else: @free_limit)
  def max_bytes, do: @max_bytes

  @doc "nil when the writer can upload stickers, else why not (shown as is)."
  def upload_blocked_reason(%User{} = user) do
    cond do
      user.moderation_state == "limited" ->
        "Uploading stickers is paused on your account for now. You can still use the Inkwell packs."

      Inkwell.Moderation.RequestGate.new_account?(user) and not Inkwell.Accounts.is_admin?(user) and
          not Inkwell.SelfHosted.enabled?() ->
        "You can upload your own stickers once your account is a week old. Until then, the Inkwell packs are all yours."

      true ->
        nil
    end
  end

  def list(user_id) do
    UserSticker
    |> where(user_id: ^user_id)
    |> order_by([s], desc: s.inserted_at)
    |> Repo.all()
  end

  def count(user_id), do: UserSticker |> where(user_id: ^user_id) |> Repo.aggregate(:count)

  @doc "Image ids in the writer's library (what their page's uploaded stickers may show)."
  def library_image_ids(user_id) do
    UserSticker |> where(user_id: ^user_id) |> select([s], s.image_id) |> Repo.all() |> MapSet.new()
  end

  @doc "Every library image, so orphan cleanup leaves stickers not yet placed."
  def all_image_ids, do: UserSticker |> select([s], s.image_id) |> Repo.all()

  def get_owned(user_id, id) do
    with {:ok, uuid} <- Ecto.UUID.cast(id),
         %UserSticker{user_id: ^user_id} = sticker <- Repo.get(UserSticker, uuid) do
      sticker
    else
      _ -> nil
    end
  end

  @doc """
  Adds a sticker from `%{"data" => data URI, "name", "outline", "ratio"}`.
  Returns `{:ok, sticker}` or `{:error, message}`.
  """
  def create(%User{} = user, %{"data" => data} = params) when is_binary(data) do
    with nil <- upload_blocked_reason(user),
         :ok <- check_limit(user),
         {:ok, parsed} <- parse(data),
         {:ok, used, storage_limit} <- check_storage(user, byte_size(parsed.binary)) do
      attrs = Images.prepare(user.id, parsed, filename: "sticker")

      result =
        Repo.transaction(fn ->
          with {:ok, image} <- Images.insert(attrs),
               {:ok, sticker} <-
                 %UserSticker{}
                 |> UserSticker.changeset(%{
                   user_id: user.id,
                   image_id: image.id,
                   name: name_of(params["name"]),
                   outline: params["outline"] != false,
                   ratio: ratio_of(params["ratio"])
                 })
                 |> Repo.insert() do
            sticker
          else
            {:error, _} -> Repo.rollback(:save_failed)
          end
        end)

      case result do
        {:ok, sticker} ->
          Storage.after_upload(user, used, byte_size(parsed.binary), storage_limit)
          {:ok, sticker}

        {:error, _} ->
          Images.discard(attrs)
          {:error, "Couldn't save that sticker. Try again."}
      end
    else
      reason when is_binary(reason) -> {:error, reason}
      {:error, message} when is_binary(message) -> {:error, message}
    end
  end

  def create(_user, _params), do: {:error, "Choose a picture to make into a sticker."}

  @doc "Renames a sticker or changes its white edge (for stickers placed from now on)."
  def update(%UserSticker{} = sticker, params) do
    attrs =
      %{}
      |> then(fn a -> if Map.has_key?(params, "name"), do: Map.put(a, :name, name_of(params["name"])), else: a end)
      |> then(fn a -> if is_boolean(params["outline"]), do: Map.put(a, :outline, params["outline"]), else: a end)

    sticker |> UserSticker.changeset(attrs) |> Repo.update()
  end

  @doc """
  Deletes a sticker: its picture, and every copy of it placed on the
  writer's page.
  """
  def delete(%User{} = user, %UserSticker{image_id: image_id} = sticker) do
    Repo.transaction(fn ->
      user = Repo.get!(User, user.id)

      case user.profile_home do
        %{"stickers" => stickers} = home when is_list(stickers) ->
          kept = Enum.reject(stickers, &(is_map(&1) and &1["image_id"] == image_id))

          if length(kept) != length(stickers) do
            user |> User.home_changeset(%{home | "stickers" => kept}) |> Repo.update!()
          end

        _ ->
          :ok
      end

      Repo.delete!(sticker)
      from(i in Inkwell.Journals.EntryImage, where: i.id == ^image_id) |> Repo.delete_all()
      :ok
    end)
  end

  def render(%UserSticker{} = s) do
    %{
      id: s.id,
      image_id: s.image_id,
      url: "/api/images/#{s.image_id}",
      name: s.name,
      outline: s.outline,
      ratio: s.ratio
    }
  end

  defp parse(data) do
    case Images.parse_data_uri(data, @max_bytes, @types) do
      {:ok, parsed} -> {:ok, parsed}
      {:error, :too_large} -> {:error, "That picture is too big for a sticker (#{div(@max_bytes, 1000)} KB at most)."}
      {:error, _} -> {:error, "Stickers can be PNG, WebP, GIF or JPEG pictures."}
    end
  end

  defp check_storage(user, bytes) do
    case Storage.check(user, bytes) do
      {:ok, used, limit} -> {:ok, used, limit}
      {:error, :storage_limit_exceeded} -> {:error, "Your image storage is full. Delete some pictures to add a sticker."}
    end
  end

  defp check_limit(user) do
    if count(user.id) >= limit(user),
      do: {:error, "You have #{limit(user)} stickers of your own, the most your plan allows. Delete one to add another."},
      else: :ok
  end

  defp name_of(name) when is_binary(name) do
    case name |> String.trim() |> String.slice(0, 60) do
      "" -> nil
      n -> n
    end
  end

  defp name_of(_), do: nil

  defp ratio_of(r) when is_number(r) and r > 0, do: r |> max(0.1) |> min(10.0) |> Kernel.*(1.0) |> Float.round(3)
  defp ratio_of(_), do: 1.0
end
