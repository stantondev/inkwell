defmodule Inkwell.Import.Parsers.WordpressWxr do
  @moduledoc """
  Parser for WordPress WXR (WordPress eXtended RSS) XML export files.
  Uses Saxy SAX parser for streaming, memory-efficient parsing.
  Filters for post_type="post" only (skips pages, attachments, etc.).
  """

  @behaviour Inkwell.Import.Parser

  alias Inkwell.Import.Parser

  defmodule Handler do
    @moduledoc false
    @behaviour Saxy.Handler

    @impl true
    def handle_event(:start_document, _prolog, _state) do
      {:ok, initial_state()}
    end

    @impl true
    def handle_event(:end_document, _data, state) do
      {:ok, Enum.reverse(state.entries)}
    end

    @impl true
    def handle_event(:start_element, {name, _attrs}, state) do
      cond do
        name == "item" ->
          {:ok, %{state | in_item: true, current: new_item()}}

        state.in_item ->
          {:ok, %{state | current_element: normalize_element(name), chars: ""}}

        true ->
          {:ok, state}
      end
    end

    @impl true
    def handle_event(:end_element, name, state) do
      cond do
        name == "item" && state.in_item ->
          entry = finalize_item(state.current)

          entries =
            if entry do
              [entry | state.entries]
            else
              state.entries
            end

          {:ok, %{state | in_item: false, current: nil, entries: entries}}

        state.in_item && normalize_element(name) == state.current_element ->
          current = apply_field(state.current, state.current_element, state.chars)
          {:ok, %{state | current: current, current_element: nil, chars: ""}}

        true ->
          {:ok, state}
      end
    end

    @impl true
    def handle_event(:characters, chars, state) do
      if state.in_item && state.current_element do
        {:ok, %{state | chars: state.chars <> chars}}
      else
        {:ok, state}
      end
    end

    @impl true
    def handle_event(:cdata, cdata, state) do
      if state.in_item && state.current_element do
        {:ok, %{state | chars: state.chars <> cdata}}
      else
        {:ok, state}
      end
    end

    defp initial_state do
      %{
        entries: [],
        in_item: false,
        current: nil,
        current_element: nil,
        chars: ""
      }
    end

    defp new_item do
      %{
        title: nil,
        body_html: nil,
        post_date: nil,
        status: nil,
        post_type: nil,
        tags: []
      }
    end

    defp normalize_element("title"), do: :title
    defp normalize_element("content:encoded"), do: :content
    defp normalize_element("wp:post_date"), do: :post_date
    defp normalize_element("wp:post_date_gmt"), do: :post_date_gmt
    defp normalize_element("wp:status"), do: :status
    defp normalize_element("wp:post_type"), do: :post_type
    defp normalize_element("category"), do: :category
    defp normalize_element(_), do: nil

    defp apply_field(item, :title, val), do: %{item | title: String.trim(val)}
    defp apply_field(item, :content, val), do: %{item | body_html: val}
    defp apply_field(item, :post_date, val), do: %{item | post_date: item.post_date || String.trim(val)}
    defp apply_field(item, :post_date_gmt, val), do: %{item | post_date: String.trim(val)}
    defp apply_field(item, :status, val), do: %{item | status: String.trim(val)}
    defp apply_field(item, :post_type, val), do: %{item | post_type: String.trim(val)}

    defp apply_field(item, :category, val) do
      tag = String.trim(val)
      if tag != "", do: %{item | tags: [tag | item.tags]}, else: item
    end

    defp apply_field(item, _, _), do: item

    defp finalize_item(%{post_type: post_type}) when post_type not in [nil, "post"], do: nil

    defp finalize_item(item) do
      body = strip_shortcodes(item.body_html || "")

      %{
        title: item.title,
        body_html: if(body == "", do: nil, else: body),
        mood: nil,
        music: nil,
        tags: Enum.reverse(item.tags) |> Enum.uniq(),
        published_at: Parser.parse_datetime(item.post_date),
        was_draft: item.status == "draft"
      }
    end

    defp strip_shortcodes(html) do
      # Remove WordPress shortcodes like [gallery], [caption]...[/caption], etc.
      html
      |> String.replace(~r/\[\/?\w+[^\]]*\]/, "")
      |> String.trim()
    end
  end

  @impl true
  def parse(data) when is_binary(data) do
    # Strip BOM
    data = strip_bom(data)

    case Saxy.parse_string(data, Handler, nil) do
      {:ok, entries} ->
        {:ok, entries}

      {:error, %Saxy.ParseError{} = e} ->
        {:error, "XML parse error: #{Exception.message(e)}"}

      {:error, reason} ->
        {:error, "XML parse error: #{inspect(reason)}"}
    end
  end

  defp strip_bom(<<0xEF, 0xBB, 0xBF, rest::binary>>), do: rest
  defp strip_bom(data), do: data
end
