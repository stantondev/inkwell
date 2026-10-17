defmodule Inkwell.StickerGifts do
  @moduledoc """
  Stickers pen pals give each other for their pages.

  A gift waits in the recipient's Gifts drawer (Arrange my page) with the
  giver's note. Nothing reaches a page until its owner places it there, and
  each gift can be on the page once. Putting a gift away deletes it and takes
  it off the page.

  Who can give: an accepted follow in either direction (pen pals), no block
  either way, the giver not held back by the spam checker. A Keepsake (Plus
  pack) needs the giver to have Plus, and once given it shows on the page
  whatever the recipient's plan. A giver can also give one of their own
  stickers (Inkwell.Stickers): the gift points at the same picture, which is
  kept while any gift still uses it.
  """

  import Ecto.Query
  alias Inkwell.{Accounts, Avatars, ProfileHome, Repo, Social}
  alias Inkwell.Accounts.User
  alias Inkwell.StickerGifts.StickerGift
  alias Inkwell.Stickers

  @daily_limit 10
  @waiting_limit 60

  def daily_limit, do: @daily_limit

  @doc "`:ok` when `giver` may give `recipient` a sticker, else `{:error, message}`."
  def can_give(%User{id: id}, %User{id: id}), do: {:error, "You can't give yourself a sticker."}

  def can_give(%User{} = giver, %User{} = recipient) do
    cond do
      giver.blocked_at || recipient.blocked_at ->
        {:error, "Stickers can't be given here."}

      Social.is_blocked_between?(giver.id, recipient.id) ->
        {:error, "Stickers can't be given here."}

      giver.moderation_state == "limited" ->
        {:error, "Giving stickers is paused on your account for now."}

      not (Social.is_friend?(giver.id, recipient.id) or Social.is_friend?(recipient.id, giver.id)) ->
        {:error, "You can give stickers to your pen pals."}

      true ->
        :ok
    end
  end

  def can_give?(giver, recipient), do: can_give(giver, recipient) == :ok

  @doc """
  Gives `recipient` a sticker: `%{"key" => pack key}` or
  `%{"sticker_id" => one of the giver's own stickers}`, plus an optional
  `"note"`. Returns `{:ok, gift}` or `{:error, message}`.
  """
  def give(%User{} = giver, %User{} = recipient, params) when is_map(params) do
    with :ok <- can_give(giver, recipient),
         :ok <- check_daily_limit(giver),
         :ok <- check_waiting(recipient),
         {:ok, attrs} <- sticker_attrs(giver, params) do
      attrs =
        Map.merge(attrs, %{sender_id: giver.id, recipient_id: recipient.id, note: note_of(params["note"])})

      case %StickerGift{} |> StickerGift.changeset(attrs) |> Repo.insert() do
        {:ok, gift} ->
          Accounts.create_notification(%{
            type: :sticker_gift,
            user_id: recipient.id,
            actor_id: giver.id,
            target_type: "sticker_gift",
            target_id: gift.id,
            data: %{"key" => gift.key, "note" => gift.note}
          })

          {:ok, Repo.preload(gift, :sender)}

        {:error, _} ->
          {:error, "Couldn't send that sticker. Try again."}
      end
    end
  end

  def give(_giver, _recipient, _params), do: {:error, "Choose a sticker to give."}

  defp sticker_attrs(giver, %{"sticker_id" => id}) when is_binary(id) do
    case Stickers.get_owned(giver.id, id) do
      nil -> {:error, "That sticker isn't one of yours."}
      s -> {:ok, %{key: "upload", image_id: s.image_id, ratio: s.ratio, outline: s.outline}}
    end
  end

  defp sticker_attrs(giver, %{"key" => key}) when is_binary(key) do
    cond do
      key in ProfileHome.sticker_keys() ->
        {:ok, %{key: key}}

      key in ProfileHome.plus_sticker_keys() ->
        if Inkwell.SelfHosted.effective_tier(giver) == "plus",
          do: {:ok, %{key: key}},
          else: {:error, "Keepsakes come with Plus."}

      true ->
        {:error, "That isn't a sticker."}
    end
  end

  defp sticker_attrs(_giver, _params), do: {:error, "Choose a sticker to give."}

  defp check_daily_limit(giver) do
    since = DateTime.add(DateTime.utc_now(), -1, :day)

    count =
      StickerGift
      |> where([g], g.sender_id == ^giver.id and g.inserted_at > ^since)
      |> Repo.aggregate(:count)

    if count >= @daily_limit,
      do: {:error, "You've given #{@daily_limit} stickers today. You can give more tomorrow."},
      else: :ok
  end

  defp check_waiting(recipient) do
    if StickerGift |> where(recipient_id: ^recipient.id) |> Repo.aggregate(:count) >= @waiting_limit,
      do: {:error, "Their gift drawer is full right now."},
      else: :ok
  end

  defp note_of(note) when is_binary(note) do
    case note |> String.trim() |> String.slice(0, 140) do
      "" -> nil
      n -> n
    end
  end

  defp note_of(_), do: nil

  @doc "Gifts waiting for (or placed by) `user_id`, newest first, with their givers."
  def list_for(user_id) do
    StickerGift
    |> where(recipient_id: ^user_id)
    |> order_by([g], desc: g.inserted_at)
    |> preload(:sender)
    |> Repo.all()
  end

  @doc "The recipient's gifts by id (what their page's gifted stickers may be)."
  def gifts_by_id(user_id) do
    StickerGift
    |> where(recipient_id: ^user_id)
    |> Repo.all()
    |> Map.new(&{&1.id, &1})
  end

  def get_received(user_id, id) do
    with {:ok, uuid} <- Ecto.UUID.cast(id),
         %StickerGift{recipient_id: ^user_id} = gift <- Repo.get(StickerGift, uuid) do
      gift
    else
      _ -> nil
    end
  end

  @doc "Puts a gift away: deletes it and takes it off the recipient's page."
  def put_away(%User{} = user, %StickerGift{} = gift) do
    Repo.transaction(fn ->
      user = Repo.get!(User, user.id)

      case user.profile_home do
        %{"stickers" => stickers} = home when is_list(stickers) ->
          kept = Enum.reject(stickers, &(is_map(&1) and &1["gift_id"] == gift.id))

          if length(kept) != length(stickers),
            do: user |> User.home_changeset(%{home | "stickers" => kept}) |> Repo.update!()

        _ ->
          :ok
      end

      Repo.delete!(gift)
      :ok
    end)
  end

  @doc "Pictures that given stickers show, so cleanup and library deletes keep them."
  def all_image_ids do
    StickerGift |> where([g], not is_nil(g.image_id)) |> select([g], g.image_id) |> Repo.all()
  end

  def image_given?(image_id),
    do: StickerGift |> where(image_id: ^image_id) |> Repo.exists?()

  @doc """
  A page as visitors see it: gifted stickers whose gift is gone are left out,
  and `givers` lists who gave the rest (oldest first, once each).
  """
  def for_page(home, owner_id) when is_map(home) do
    stickers = List.wrap(home["stickers"])

    if Enum.any?(stickers, &(is_map(&1) and is_binary(&1["gift_id"]))) do
      gifts = gifts_by_id(owner_id) |> Map.new(fn {id, g} -> {id, Repo.preload(g, :sender)} end)
      kept = Enum.filter(stickers, &(not is_binary(&1["gift_id"]) or Map.has_key?(gifts, &1["gift_id"])))

      givers =
        kept
        |> Enum.flat_map(fn st ->
          case gifts[st["gift_id"]] do
            %{sender: %User{blocked_at: nil} = s} -> [s]
            _ -> []
          end
        end)
        |> Enum.uniq_by(& &1.id)
        |> Enum.map(&render_person/1)

      {Map.put(home, "stickers", kept), givers}
    else
      {home, []}
    end
  end

  def for_page(home, _owner_id), do: {home, []}

  def render(%StickerGift{} = g) do
    %{
      id: g.id,
      key: g.key,
      image_id: g.image_id,
      url: if(g.image_id, do: "/api/images/#{g.image_id}"),
      ratio: g.ratio,
      outline: g.outline,
      note: g.note,
      given_at: g.inserted_at,
      from:
        case g.sender do
          %User{} = s -> render_person(s)
          _ -> nil
        end
    }
  end

  defp render_person(%User{} = u) do
    %{
      username: u.username,
      display_name: u.display_name,
      avatar_url: Avatars.avatar_url(u)
    }
  end
end
