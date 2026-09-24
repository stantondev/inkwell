defmodule Inkwell.Userpics do
  @moduledoc """
  LiveJournal-style userpics: a writer keeps a set of pictures, each with a
  keyword, and picks one for each entry or comment. The avatar stays the
  default picture.

  Pictures are stored on the row as a data URI and served at
  `/api/userpics/:id`. A picture never changes once uploaded (only its keyword
  can), so that URL is cached for a year. Animated GIFs are kept as they are.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Accounts.UserIcon

  @free_limit 10
  @plus_limit 50
  # Decoded bytes. The web app sends a 200px JPEG (~20 KB); GIFs arrive
  # untouched so their animation survives, hence the headroom.
  @max_bytes 400_000
  @data_uri ~r/\Adata:image\/(png|jpeg|jpg|gif|webp);base64,(.+)\z/s

  def limit(user) do
    if Inkwell.SelfHosted.effective_tier(user) == "plus", do: @plus_limit, else: @free_limit
  end

  def list(user_id) do
    UserIcon
    |> where(user_id: ^user_id)
    |> order_by([i], asc: i.sort_order, asc: i.inserted_at)
    |> Repo.all()
  end

  def count(user_id), do: UserIcon |> where(user_id: ^user_id) |> Repo.aggregate(:count)

  def get(id) do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} -> Repo.get(UserIcon, uuid)
      :error -> nil
    end
  end

  @doc "The writer's own userpic with this id, or nil."
  def get_owned(user_id, id) do
    case get(id) do
      %UserIcon{user_id: ^user_id} = icon -> icon
      _ -> nil
    end
  end

  @doc """
  For entry/comment params: a userpic id the writer owns, or nil. Anything
  else (someone else's picture, a malformed id) is dropped rather than refused.
  """
  def owned_id(_user_id, value) when value in [nil, ""], do: nil

  def owned_id(user_id, id) when is_binary(id) do
    case get_owned(user_id, id) do
      %UserIcon{id: id} -> id
      nil -> nil
    end
  end

  def owned_id(_user_id, _), do: nil

  def create(user, %{"data" => data} = params) when is_binary(data) do
    with :ok <- check_limit(user),
         {:ok, content_type} <- parse_image(data) do
      %UserIcon{}
      |> UserIcon.changeset(%{
        "user_id" => user.id,
        "keyword" => params["keyword"],
        "data" => data,
        "content_type" => content_type,
        "sort_order" => count(user.id)
      })
      |> Repo.insert()
    end
  end

  def create(_user, _params), do: {:error, "Choose a picture to upload."}

  def update(%UserIcon{} = icon, params) do
    icon
    |> UserIcon.changeset(Map.take(params, ["keyword", "sort_order"]))
    |> Repo.update()
  end

  def delete(%UserIcon{} = icon), do: Repo.delete(icon)

  @doc "What API responses carry: nil unless the association was loaded and set."
  def render(%UserIcon{} = icon), do: %{id: icon.id, keyword: icon.keyword, url: url(icon)}
  def render(_), do: nil

  # Pictures stored here are served by id; the few rows from before (a URL
  # typed into the old API) are shown only if that URL is https.
  def url(%UserIcon{data: data, id: id}) when is_binary(data), do: "/api/userpics/#{id}"
  def url(%UserIcon{image_url: "https://" <> _ = url}), do: url
  def url(_), do: nil

  @doc "The picture's MIME type and bytes, read from the stored data URI."
  def decode(%UserIcon{data: data}) when is_binary(data) do
    with [_, type, base64] <- Regex.run(@data_uri, data),
         {:ok, binary} <- Base.decode64(base64) do
      {:ok, "image/" <> if(type == "jpg", do: "jpeg", else: type), binary}
    else
      _ -> :error
    end
  end

  def decode(_), do: :error

  defp check_limit(user) do
    if count(user.id) >= limit(user) do
      {:error, "You have #{limit(user)} userpics, the most your plan allows. Delete one to add another."}
    else
      :ok
    end
  end

  defp parse_image(data) do
    with [_, type, base64] <- Regex.run(@data_uri, data),
         {:ok, binary} <- Base.decode64(base64),
         true <- byte_size(binary) <= @max_bytes || :too_big,
         claimed = if(type == "jpg", do: "jpeg", else: type),
         ^claimed <- detect(binary) do
      {:ok, "image/#{claimed}"}
    else
      :too_big -> {:error, "That picture is too big. Userpics can be up to 400 KB."}
      _ -> {:error, "That file isn't a picture we can use (PNG, JPEG, GIF or WebP)."}
    end
  end

  defp detect(<<0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, _::binary>>), do: "png"
  defp detect(<<0xFF, 0xD8, 0xFF, _::binary>>), do: "jpeg"
  defp detect(<<0x47, 0x49, 0x46, 0x38, _::binary>>), do: "gif"
  defp detect(<<0x52, 0x49, 0x46, 0x46, _::32, 0x57, 0x45, 0x42, 0x50, _::binary>>), do: "webp"
  defp detect(_), do: nil
end
