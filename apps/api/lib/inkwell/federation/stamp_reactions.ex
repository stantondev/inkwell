defmodule Inkwell.Federation.StampReactions do
  @moduledoc """
  Emoji reactions from the fediverse, read as stamps.

  Misskey, Akkoma, Pleroma and others react with an emoji: an `EmojiReact`,
  or a `Like` whose `content` (or Misskey's `_misskey_reaction`) holds a
  Unicode emoji or a `:shortcode:` described by an `Emoji` in `tag`
  (FEP-c0e0). Those become "postage from abroad": the sender's emoji in our
  stamp frame. Another Inkwell server's stamp (`:inkwell_felt:`) becomes
  that very stamp. A plain Like — no content, or Misskey's default heart —
  stays an ink.
  """

  alias Inkwell.Stamps.Stamp

  @hearts ["❤", "❤️", "♥", "♥️"]

  @doc """
  `{:stamp, attrs}` with `:stamp_type`, `:emoji`, `:emoji_url`, `:ap_id`
  (string keys never used), or `:plain` for a Like that is just a Like.
  """
  def parse(%{"type" => type} = activity) when type in ["Like", "EmojiReact"] do
    content =
      [activity["content"], activity["_misskey_reaction"]]
      |> Enum.find(&(is_binary(&1) and String.trim(&1) != ""))
      |> case do
        nil -> nil
        c -> c |> strip_tags() |> String.trim()
      end

    cond do
      is_nil(content) or content == "" -> :plain
      type == "Like" and content in @hearts -> :plain
      true -> reaction(content, activity)
    end
  end

  def parse(_), do: :plain

  defp reaction(content, activity) do
    base = %{ap_id: string_or_nil(activity["id"]), note: nil}

    case Regex.run(~r/^:([A-Za-z0-9_+\-]{1,100}):$/, content) do
      [_, name] ->
        case inkwell_stamp(name) do
          type when is_binary(type) ->
            {:stamp, Map.merge(base, %{stamp_type: type, emoji: nil, emoji_url: nil})}

          nil ->
            {:stamp, Map.merge(base, %{stamp_type: "abroad", emoji: ":#{name}:", emoji_url: emoji_image(activity["tag"], name)})}
        end

      _ ->
        if unicode_emoji?(content),
          do: {:stamp, Map.merge(base, %{stamp_type: "abroad", emoji: content, emoji_url: nil})},
          else: :plain
    end
  end

  # `:inkwell_felt:` from another Inkwell server is our own stamp.
  defp inkwell_stamp("inkwell_" <> type) do
    if type in Stamp.pickable() or type in Stamp.retired(), do: type
  end

  defp inkwell_stamp(_), do: nil

  # The Emoji in `tag` whose name is the shortcode; its icon must be https.
  defp emoji_image(tags, name) do
    tags
    |> List.wrap()
    |> Enum.find_value(fn
      %{"type" => "Emoji", "name" => n} = emoji when is_binary(n) ->
        if String.trim(n, ":") == name, do: https_url(icon_url(emoji["icon"]))

      _ ->
        nil
    end)
  end

  defp icon_url(%{"url" => url}) when is_binary(url), do: url
  defp icon_url(url) when is_binary(url), do: url
  defp icon_url([first | _]), do: icon_url(first)
  defp icon_url(_), do: nil

  defp https_url("https://" <> _ = url) do
    if String.length(url) <= 2000 and URI.parse(url).host not in [nil, ""], do: url
  end

  defp https_url(_), do: nil

  # A short run of characters with no letters, digits or markup: an emoji
  # (possibly with modifiers / joiners), not a word or a sentence.
  defp unicode_emoji?(s) do
    graphemes = String.graphemes(s)

    length(graphemes) in 1..3 and String.length(s) <= 32 and
      not String.match?(s, ~r/[\p{L}\p{N}<>&"'\s]/u)
  end

  defp strip_tags(s), do: Regex.replace(~r/<[^>]*>/, s, "")

  defp string_or_nil(s) when is_binary(s), do: s
  defp string_or_nil(_), do: nil

  @doc "The emoji to show inside the frame: Unicode only (a bare shortcode can't be drawn)."
  def drawable_emoji(nil), do: nil
  def drawable_emoji(":" <> _), do: nil
  def drawable_emoji(e), do: e
end
